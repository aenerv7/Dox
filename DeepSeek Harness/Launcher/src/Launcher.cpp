// ============================================================================
// Launcher.cpp — DeepSeek Harness 托盘启动器（纯 Win32 原生实现，Windows 10/11）
//
// 功能：
//   * 系统托盘图标 + 右键菜单：启动 / 停止（二选一显示）、重启 DeepSeek Harness
//   * 监听地址（Host）与端口（Port）直接编辑 exe 同目录 Launcher.ini；
//     无效端口自动修正为随机可用端口，右键菜单顶部以浅色文本显示当前监听地址
//   * 随托盘程序自启动 DeepSeek Harness（写入 ini）
//   * 检查并更新 DeepSeek Harness（npm 最新版本对比，停止 → 更新 → 重启）
//
// 实现要点：
//   * 按环境自适应启动：dsh 全局安装 → dsh 命令；未安装 → npx -y @deepseek-ai/dsh
//   * 作业对象整树终止；按配置的 Host 做端口探测识别外部启动的实例
//   * 完全便携：不写注册表、无安装过程，所有设置通过 GetPrivateProfileString /
//     WritePrivateProfileString 读写 exe 同目录的 Launcher.ini；
//     托盘程序自身的开机自启交由外部任务计划程序负责
// ============================================================================
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <iphlpapi.h>
#include <shellapi.h>
#include <shlobj.h>
#include <cstdio>
#include <cwchar>
#include <memory>
#include <process.h>
#include <string>
#include <vector>
#include "Resource.h"

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "iphlpapi.lib")

namespace {

constexpr wchar_t kAppName[]      = L"DeepSeek Harness Launcher";
constexpr wchar_t kIniName[]      = L"Launcher.ini";
constexpr wchar_t kLogName[]      = L"Launcher.log";
constexpr wchar_t kWndClass[]     = L"DSHLauncherWnd";
constexpr wchar_t kMutexName[]    = L"Local\\DSHLauncher_SingleInstance";
constexpr UINT    kTrayMsg        = WM_APP + 1;
constexpr UINT_PTR kTimerState    = 1;
// 私有消息（自动化 / 调试用，不影响正常使用）
constexpr UINT kMsgStart       = WM_APP + 100;
constexpr UINT kMsgStop        = WM_APP + 101;
constexpr UINT kMsgRestart     = WM_APP + 102;
constexpr UINT kMsgQuery       = WM_APP + 103;
constexpr UINT kMsgUpdateDone  = WM_APP + 104;  // 更新线程完成通知
constexpr UINT kMsgCheckUpdate = WM_APP + 105;  // 触发更新检查
constexpr UINT kMsgCheckResult = WM_APP + 106;  // 检查线程结果通知

HINSTANCE g_hInst = nullptr;
HWND      g_hwnd   = nullptr;
HICON     g_hIcon  = nullptr;
constexpr UINT g_trayId = 1;

// ---------- 配置（全部来自 exe 同目录 Launcher.ini） ----------
struct Config {
    int          port       = 16100;
    bool         autoStart  = false;   // 随托盘程序自启动 DeepSeek Harness
    std::wstring host       = L"127.0.0.1";  // 监听地址（默认回环）
    std::wstring nodePath;             // 高级：node.exe 完整路径（留空自动查找）
    std::wstring dshBin;               // 高级：dsh 的 lib\bin.js 完整路径（留空自动查找）
};
Config       g_cfg;
std::wstring g_iniPath;
std::wstring g_logPath;

// 启动方式：dsh（npm 全局安装）/ npx（未全局安装，按需拉取）/ 自定义（DshBin 显式覆盖）
enum class LaunchMode { Dsh, Npx, Custom };
LaunchMode   g_mode = LaunchMode::Npx;

std::wstring ModeName(LaunchMode m) {
    switch (m) {
    case LaunchMode::Dsh: return L"dsh";
    case LaunchMode::Npx: return L"npx";
    default:              return L"自定义";
    }
}

// 托管的 DeepSeek Harness 进程
HANDLE g_hJob  = nullptr;
HANDLE g_hProc = nullptr;
DWORD  g_pid   = 0;

// 更新检查状态（检查线程写、UI 线程读，同一时刻最多一个检查/更新在跑）
bool    g_checking = false;
bool    g_updating = false;
wchar_t g_checkLatest[64]{};  // 远端最新版本
wchar_t g_checkLocal[64]{};   // 本地当前版本（可能为空）

// ---------- 小工具 ----------
std::wstring ExeDir() {
    wchar_t buf[MAX_PATH]{};
    GetModuleFileNameW(nullptr, buf, MAX_PATH);
    const std::wstring p(buf);
    const size_t pos = p.find_last_of(L'\\');
    return pos == std::wstring::npos ? std::wstring(L".") : p.substr(0, pos);
}

bool FileExists(const std::wstring& path) {
    const DWORD attr = GetFileAttributesW(path.c_str());
    return attr != INVALID_FILE_ATTRIBUTES && !(attr & FILE_ATTRIBUTE_DIRECTORY);
}

std::wstring ToStr(int v) {
    wchar_t b[32];
    swprintf_s(b, 32, L"%d", v);
    return std::wstring(b);
}

void Log(const std::wstring& line) {
    HANDLE h = CreateFileW(g_logPath.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ, nullptr,
                           OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return;
    LARGE_INTEGER size{};
    if (GetFileSizeEx(h, &size) && size.QuadPart > 256 * 1024) {  // 超过 256KB 截断
        CloseHandle(h);
        DeleteFileW(g_logPath.c_str());
        h = CreateFileW(g_logPath.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ, nullptr,
                        OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (h == INVALID_HANDLE_VALUE) return;
    }
    SYSTEMTIME st;
    GetLocalTime(&st);
    wchar_t prefix[64];
    swprintf_s(prefix, 64, L"[%04d-%02d-%02d %02d:%02d:%02d] ",
               st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond);
    const std::wstring msg = prefix + line + L"\r\n";
    DWORD wrote = 0;
    WriteFile(h, msg.c_str(), (DWORD)(msg.size() * sizeof(wchar_t)), &wrote, nullptr);
    CloseHandle(h);
}

// ---------- ini 读写（exe 同目录） ----------
std::wstring ReadIniStr(const wchar_t* section, const wchar_t* key, const std::wstring& def) {
    wchar_t buf[2048]{};
    const DWORD n = GetPrivateProfileStringW(section, key, def.c_str(), buf, 2048, g_iniPath.c_str());
    return std::wstring(buf, n);
}

int ReadIniInt(const wchar_t* section, const wchar_t* key, int def) {
    return (int)GetPrivateProfileIntW(section, key, def, g_iniPath.c_str());
}

void WriteIniStr(const wchar_t* section, const wchar_t* key, const std::wstring& value) {
    WritePrivateProfileStringW(section, key, value.c_str(), g_iniPath.c_str());
}

int RandomFreePort();  // 前向声明（定义在 IsPortOpen 之后）

void LoadConfig() {
    // 监听地址：读取 Host（默认 127.0.0.1），去首尾空白，为空则回退默认
    std::wstring h = ReadIniStr(L"General", L"Host", L"127.0.0.1");
    const size_t hb = h.find_first_not_of(L" \t");
    const size_t he = h.find_last_not_of(L" \t");
    g_cfg.host = (hb == std::wstring::npos) ? L"127.0.0.1" : h.substr(hb, he - hb + 1);
    if (g_cfg.host.empty()) g_cfg.host = L"127.0.0.1";
    // 端口收束：读取后必须在 1-65535 内；无效（非数字 / 越界）则改为随机可用端口并写回 ini
    g_cfg.port = ReadIniInt(L"General", L"Port", 0);  // 0 = 无效 / 未设置
    if (g_cfg.port < 1 || g_cfg.port > 65535) {
        g_cfg.port = RandomFreePort();
        WriteIniStr(L"General", L"Port", ToStr(g_cfg.port));
        Log(L"port: ini 中端口无效，已改为随机可用端口 " + ToStr(g_cfg.port));
    }
    g_cfg.autoStart  = ReadIniInt(L"General", L"AutoStart", 0) != 0;
    g_cfg.nodePath   = ReadIniStr(L"General", L"NodePath", L"");
    g_cfg.dshBin     = ReadIniStr(L"General", L"DshBin", L"");
}

// ---------- 组件路径查找 ----------
std::wstring SearchPathFor(const wchar_t* filename) {
    std::vector<wchar_t> env(32768);
    const DWORD len = GetEnvironmentVariableW(L"PATH", env.data(), (DWORD)env.size());
    if (len == 0 || len >= env.size()) return L"";
    const std::wstring pathEnv(env.data(), len);
    size_t start = 0;
    while (start <= pathEnv.size()) {
        const size_t sep = pathEnv.find(L';', start);
        const std::wstring dir = pathEnv.substr(start, sep == std::wstring::npos ? std::wstring::npos : sep - start);
        if (!dir.empty()) {
            const std::wstring cand = dir + L"\\" + filename;
            if (FileExists(cand)) return cand;
        }
        if (sep == std::wstring::npos) break;
        start = sep + 1;
    }
    return L"";
}

std::wstring FindNodeExe() {
    if (!g_cfg.nodePath.empty() && FileExists(g_cfg.nodePath)) return g_cfg.nodePath;
    const std::wstring p = SearchPathFor(L"node.exe");
    if (!p.empty()) return p;
    static const wchar_t* cands[] = {
        L"C:\\Program Files\\Node\\node.exe",
        L"C:\\Program Files (x86)\\Node\\node.exe",
        L"C:\\Program Files\\nodejs\\node.exe",
    };
    for (const wchar_t* c : cands) if (FileExists(c)) return c;
    return L"";
}

// dsh 命令（npm 全局安装的 shim）：先在 PATH 上找 dsh.cmd，再找无扩展名的 dsh
std::wstring FindDshCmd() {
    const std::wstring p = SearchPathFor(L"dsh.cmd");
    if (!p.empty()) return p;
    return SearchPathFor(L"dsh");
}

// 启动方式判定：DshBin 显式覆盖 > 全局安装（PATH 上有 dsh 命令） > npx
LaunchMode DetectLaunchMode() {
    if (!g_cfg.dshBin.empty() && FileExists(g_cfg.dshBin)) return LaunchMode::Custom;
    if (!FindDshCmd().empty()) return LaunchMode::Dsh;
    return LaunchMode::Npx;
}

// ---------- 端口探测 ----------
// 解析 host 为 IPv4 地址（支持 IP 与主机名），失败回退 127.0.0.1
in_addr HostAddr(const std::wstring& host) {
    in_addr a{};
    char buf[64]{};
    WideCharToMultiByte(CP_UTF8, 0, host.c_str(), -1, buf, 64, nullptr, nullptr);
    if (inet_pton(AF_INET, buf, &a) == 1) return a;
    addrinfo hints{};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    addrinfo* res = nullptr;
    if (getaddrinfo(buf, nullptr, &hints, &res) == 0 && res) {
        a = reinterpret_cast<sockaddr_in*>(res->ai_addr)->sin_addr;
        freeaddrinfo(res);
        return a;
    }
    a.s_addr = htonl(INADDR_LOOPBACK);
    return a;
}

bool IsPortOpen(int port) {
    SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (s == INVALID_SOCKET) return false;
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons((u_short)port);
    addr.sin_addr = HostAddr(g_cfg.host);
    u_long mode = 1;
    ioctlsocket(s, FIONBIO, &mode);
    const int r = connect(s, reinterpret_cast<sockaddr*>(&addr), sizeof(addr));
    bool open = (r == 0);
    if (!open) {
        fd_set wf;
        FD_ZERO(&wf);
        FD_SET(s, &wf);
        timeval tv{};
        tv.tv_usec = 200000;  // 最多等 200ms
        if (select(0, nullptr, &wf, nullptr, &tv) == 1) {
            int err = 0;
            int len = sizeof(err);
            getsockopt(s, SOL_SOCKET, SO_ERROR, reinterpret_cast<char*>(&err), &len);
            open = (err == 0);
        }
    }
    closesocket(s);
    return open;
}

// 随机选择一个当前可用的端口（1024-65535，探测 127.0.0.1 未被占用）
int RandomFreePort() {
    srand((unsigned)(GetTickCount64() ^ GetCurrentProcessId()));
    int last = 16100;
    for (int i = 0; i < 100; ++i) {
        const int p = 1024 + (rand() % (65535 - 1024 + 1));
        last = p;
        if (!IsPortOpen(p)) return p;
    }
    return last;  // 极端兜底：100 个随机端口全部被占用
}

DWORD PortOwnerPid(int port) {
    ULONG size = 0;
    if (GetExtendedTcpTable(nullptr, &size, FALSE, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0) != ERROR_INSUFFICIENT_BUFFER || size == 0)
        return 0;
    std::vector<BYTE> buf(size);
    if (GetExtendedTcpTable(buf.data(), &size, FALSE, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0) != NO_ERROR)
        return 0;
    const auto* table = reinterpret_cast<MIB_TCPTABLE_OWNER_PID*>(buf.data());
    for (DWORD i = 0; i < table->dwNumEntries; ++i) {
        const MIB_TCPROW_OWNER_PID& row = table->table[i];
        if (row.dwState == MIB_TCP_STATE_LISTEN && ntohs((u_short)row.dwLocalPort) == port)
            return row.dwOwningPid;
    }
    return 0;
}

// ---------- 运行状态 ----------
bool IsManagedRunning() {
    return g_hProc != nullptr && WaitForSingleObject(g_hProc, 0) == WAIT_TIMEOUT;
}

bool IsRunning() {
    return IsManagedRunning() || IsPortOpen(g_cfg.port);
}

void UpdateTrayTip() {
    std::wstring tip = std::wstring(kAppName);
    if (IsRunning())
        tip += L" — 运行中（http://" + g_cfg.host + L":" + ToStr(g_cfg.port) + L"）";
    else
        tip += L" — 已停止";
    NOTIFYICONDATAW nid{};
    nid.cbSize = sizeof(nid);
    nid.hWnd = g_hwnd;
    nid.uID = g_trayId;
    nid.uFlags = NIF_TIP;
    wcsncpy(nid.szTip, tip.c_str(), 127);
    nid.szTip[127] = L'\0';
    Shell_NotifyIconW(NIM_MODIFY, &nid);
}

// ---------- 启动 / 停止 / 重启 ----------
bool StartDSH() {
    if (IsRunning()) {
        Log(L"start: 已在运行，跳过");
        return true;
    }
    // Node.js 兜底检查（托盘启动时已检查过一次）
    const std::wstring node = FindNodeExe();
    if (node.empty()) {
        MessageBoxW(g_hwnd,
                    L"未检测到 Node.js 环境，无法启动 DeepSeek Harness。\n请先安装 Node.js（https://nodejs.org）。",
                    kAppName, MB_ICONERROR | MB_OK);
        Log(L"start: 未找到 node.exe");
        return false;
    }
    // dsh 出于安全原因不支持监听 0.0.0.0，给出友好提示
    if (g_cfg.host == L"0.0.0.0") {
        MessageBoxW(g_hwnd,
                    L"dsh 不支持监听 0.0.0.0（存在远程代码执行风险）。\n"
                    L"请在 Launcher.ini 中将 Host 配置为 127.0.0.1 或具体的局域网 IP。",
                    kAppName, MB_ICONWARNING | MB_OK);
        Log(L"start: Host=0.0.0.0 不被 dsh 支持");
        return false;
    }
    // 判定启动方式：dsh（全局安装）/ npx（未全局安装，按需拉取）/ 自定义（DshBin 覆盖）
    g_mode = DetectLaunchMode();
    std::wstring cmd;
    switch (g_mode) {
    case LaunchMode::Dsh: {
        const std::wstring dshCmd = FindDshCmd();
        cmd = L"cmd.exe /c \"\"" + dshCmd + L"\" web --host " + g_cfg.host +
              L" --port " + ToStr(g_cfg.port) + L"\"";
        break;
    }
    case LaunchMode::Npx:
        cmd = L"cmd.exe /c npx -y @deepseek-ai/dsh web --host " + g_cfg.host +
              L" --port " + ToStr(g_cfg.port);
        break;
    default:  // 自定义：node.exe 直接执行 DshBin（.js 脚本）
        cmd = L"\"" + node + L"\" \"" + g_cfg.dshBin + L"\" web --host " + g_cfg.host +
              L" --port " + ToStr(g_cfg.port);
        break;
    }
    Log(L"start: 启动方式=" + ModeName(g_mode) + L"，命令 " + cmd);

    // 作业对象：停止时整树终止；KILL_ON_JOB_CLOSE 保证托盘退出（含被强制结束）
    // 时 DeepSeek Harness 一并终止 —— 托盘完全接管 Harness 的启停状态
    HANDLE job = CreateJobObjectW(nullptr, nullptr);
    if (job) {
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION ji{};
        ji.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(job, JobObjectExtendedLimitInformation, &ji, sizeof(ji));
    }

    STARTUPINFOW si{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    PROCESS_INFORMATION pi{};
    std::vector<wchar_t> cmdBuf(cmd.begin(), cmd.end());
    cmdBuf.push_back(L'\0');
    if (!CreateProcessW(nullptr, cmdBuf.data(), nullptr, nullptr, FALSE,
                        CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT | CREATE_SUSPENDED,
                        nullptr, nullptr, &si, &pi)) {
        const DWORD err = GetLastError();
        if (job) CloseHandle(job);
        Log(L"start: CreateProcess 失败，错误码 " + ToStr((int)err));
        MessageBoxW(g_hwnd, (L"启动 DeepSeek Harness 失败（错误码 " + ToStr((int)err) + L"）。").c_str(),
                    kAppName, MB_ICONERROR | MB_OK);
        return false;
    }
    if (job && !AssignProcessToJobObject(job, pi.hProcess)) {
        Log(L"start: AssignProcessToJobObject 失败（错误码 " + ToStr((int)GetLastError()) + L"），改用单进程管理");
        CloseHandle(job);
        job = nullptr;
    }
    ResumeThread(pi.hThread);
    CloseHandle(pi.hThread);

    if (g_hProc) CloseHandle(g_hProc);
    if (g_hJob) CloseHandle(g_hJob);
    g_hProc = pi.hProcess;
    g_hJob  = job;
    g_pid   = pi.dwProcessId;
    Log(L"start: 已启动，PID=" + ToStr((int)g_pid));
    UpdateTrayTip();
    return true;
}

void StopManaged() {
    if (g_hJob)
        TerminateJobObject(g_hJob, 0);
    else if (g_hProc)
        TerminateProcess(g_hProc, 0);
    if (g_hProc) {
        WaitForSingleObject(g_hProc, 5000);
        CloseHandle(g_hProc);
        g_hProc = nullptr;
    }
    if (g_hJob) {
        CloseHandle(g_hJob);
        g_hJob = nullptr;
    }
    g_pid = 0;
}

// 返回是否已停止（用户取消“外部实例”确认时返回 false）
bool StopDSH() {
    if (IsManagedRunning()) {
        Log(L"stop: 终止托管进程（PID " + ToStr((int)g_pid) + L"）");
        StopManaged();
        UpdateTrayTip();
        return true;
    }
    if (IsPortOpen(g_cfg.port)) {
        const DWORD pid = PortOwnerPid(g_cfg.port);
        std::wstring msg = L"端口 " + ToStr(g_cfg.port) + L" 上的 DeepSeek Harness 不是由本托盘程序启动的";
        if (pid) msg += L"（PID " + ToStr((int)pid) + L"）";
        msg += L"。\n\n是否结束该进程？";
        if (MessageBoxW(g_hwnd, msg.c_str(), kAppName, MB_YESNO | MB_ICONQUESTION | MB_DEFBUTTON2) != IDYES)
            return false;
        if (pid) {
            HANDLE h = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
            if (h) {
                TerminateProcess(h, 0);
                CloseHandle(h);
            }
            for (int i = 0; i < 30 && IsPortOpen(g_cfg.port); ++i) Sleep(200);
        }
        Log(L"stop: 已终止外部实例（PID " + ToStr((int)pid) + L"）");
        UpdateTrayTip();
        return true;
    }
    Log(L"stop: 当前未在运行");
    UpdateTrayTip();
    return true;
}

bool RestartDSH() {
    Log(L"restart: 开始重启");
    if (IsRunning() && !StopDSH()) {
        Log(L"restart: 用户取消了停止，中止重启");
        return false;
    }
    for (int i = 0; i < 40 && IsPortOpen(g_cfg.port); ++i) Sleep(150);  // 等端口释放
    const bool ok = StartDSH();
    Log(ok ? L"restart: 完成" : L"restart: 启动失败");
    return ok;
}

// ---------- 更新检查与更新 ----------
// 运行命令并等待结束；返回进程退出码是否为 0
bool RunCommandWait(const std::wstring& cmd) {
    std::vector<wchar_t> cmdBuf(cmd.begin(), cmd.end());
    cmdBuf.push_back(L'\0');
    STARTUPINFOW si{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    PROCESS_INFORMATION pi{};
    if (!CreateProcessW(nullptr, cmdBuf.data(), nullptr, nullptr, FALSE,
                        CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT, nullptr, nullptr, &si, &pi))
        return false;
    WaitForSingleObject(pi.hProcess, 10 * 60 * 1000);  // 最长 10 分钟
    DWORD code = 0;
    GetExitCodeProcess(pi.hProcess, &code);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return code == 0;
}

// 运行命令并捕获 stdout+stderr（用于 npm view 等短输出）
bool RunCommandCapture(const std::wstring& cmd, std::wstring& out, DWORD timeoutMs) {
    SECURITY_ATTRIBUTES sa{};
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;
    HANDLE hRead = nullptr, hWrite = nullptr;
    if (!CreatePipe(&hRead, &hWrite, &sa, 0)) return false;
    SetHandleInformation(hRead, HANDLE_FLAG_INHERIT, 0);
    std::vector<wchar_t> cmdBuf(cmd.begin(), cmd.end());
    cmdBuf.push_back(L'\0');
    STARTUPINFOW si{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.hStdOutput = hWrite;
    si.hStdError = hWrite;
    si.wShowWindow = SW_HIDE;
    PROCESS_INFORMATION pi{};
    if (!CreateProcessW(nullptr, cmdBuf.data(), nullptr, nullptr, TRUE,
                        CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT, nullptr, nullptr, &si, &pi)) {
        CloseHandle(hRead);
        CloseHandle(hWrite);
        return false;
    }
    CloseHandle(hWrite);
    std::string acc;
    char buf[1024];
    DWORD n = 0;
    while (ReadFile(hRead, buf, sizeof(buf), &n, nullptr) && n > 0) acc.append(buf, n);
    CloseHandle(hRead);
    WaitForSingleObject(pi.hProcess, timeoutMs);
    DWORD code = 0;
    GetExitCodeProcess(pi.hProcess, &code);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    if (code != 0) return false;  // 命令失败（如 npm 不存在）→ 不以错误文本冒充输出
    const int wlen = MultiByteToWideChar(CP_UTF8, 0, acc.data(), (int)acc.size(), nullptr, 0);
    if (wlen <= 0) return false;
    out.resize(wlen);
    MultiByteToWideChar(CP_UTF8, 0, acc.data(), (int)acc.size(), out.data(), wlen);
    return true;
}

// 取第一行并去首尾空白
std::wstring TrimLine(std::wstring s) {
    const size_t nl = s.find_first_of(L"\r\n");
    if (nl != std::wstring::npos) s.resize(nl);
    const size_t b = s.find_first_not_of(L" \t");
    if (b == std::wstring::npos) return L"";
    const size_t e = s.find_last_not_of(L" \t");
    return s.substr(b, e - b + 1);
}

// 从 package.json 提取 version 字段（首个 "version" 键，UTF-8 文件）
std::wstring ExtractJsonVersion(const std::wstring& path) {
    HANDLE h = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr,
                           OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return L"";
    LARGE_INTEGER sz{};
    GetFileSizeEx(h, &sz);
    if (sz.QuadPart <= 0 || sz.QuadPart > 1024 * 1024) {
        CloseHandle(h);
        return L"";
    }
    std::string data((size_t)sz.QuadPart, '\0');
    DWORD rd = 0;
    ReadFile(h, data.data(), (DWORD)data.size(), &rd, nullptr);
    CloseHandle(h);
    data.resize(rd);
    const int wlen = MultiByteToWideChar(CP_UTF8, 0, data.data(), (int)data.size(), nullptr, 0);
    if (wlen <= 0) return L"";
    std::wstring w(wlen, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, data.data(), (int)data.size(), w.data(), wlen);
    const std::wstring key = L"\"version\"";
    const size_t i = w.find(key);
    if (i == std::wstring::npos) return L"";
    const size_t colon = w.find(L':', i + key.size());
    if (colon == std::wstring::npos) return L"";
    const size_t q1 = w.find(L'"', colon);
    if (q1 == std::wstring::npos) return L"";
    const size_t q2 = w.find(L'"', q1 + 1);
    if (q2 == std::wstring::npos) return L"";
    return w.substr(q1 + 1, q2 - q1 - 1);
}

// dsh 全局安装的本地版本（dsh 命令同级 node_modules\@deepseek-ai\dsh\package.json）
std::wstring LocalDshVersion() {
    const std::wstring dshCmd = FindDshCmd();
    if (dshCmd.empty()) return L"";
    const size_t pos = dshCmd.find_last_of(L'\\');
    if (pos == std::wstring::npos) return L"";
    const std::wstring pkg = dshCmd.substr(0, pos) + L"\\node_modules\\@deepseek-ai\\dsh\\package.json";
    return ExtractJsonVersion(pkg);
}

// 更新命令：dsh 全局安装 → npm 升级；npx 模式 → 显式 latest 刷新缓存
std::wstring UpdateCommand() {
    if (g_mode == LaunchMode::Npx)
        return L"cmd.exe /c npx -y @deepseek-ai/dsh@latest --version";
    return L"cmd.exe /c npm i -g @deepseek-ai/dsh@latest";
}

struct UpdateJob {
    std::wstring cmd;
    bool         restartAfter = false;
};

// 更新检查线程：npm view 获取远端版本，对比本地版本，结果回传 UI
unsigned __stdcall CheckThread(void*) {
    std::wstring latest;
    bool got = RunCommandCapture(L"cmd.exe /c npm view @deepseek-ai/dsh version", latest, 30000);
    int code = 0;  // 0=获取失败
    if (got) {
        latest = TrimLine(latest);
        if (latest.find(L'.') == std::wstring::npos) got = false;  // 输出不是版本号 → 视为失败
    }
    if (got) {
        std::wstring local;
        if (g_mode == LaunchMode::Dsh) local = LocalDshVersion();
        wcsncpy(g_checkLatest, latest.c_str(), 63);
        g_checkLatest[63] = L'\0';
        wcsncpy(g_checkLocal, local.c_str(), 63);
        g_checkLocal[63] = L'\0';
        if (local.empty()) {
            code = (g_mode == LaunchMode::Npx) ? 2 : 3;  // npx：视为可刷新；其余：本地版本未知
        } else if (local == latest) {
            code = 1;  // 已是最新
        } else {
            code = 2;  // 有更新
        }
        Log(L"update: 本地版本=" + local + L"，远端版本=" + latest);
    } else {
        Log(L"update: 获取远端版本失败");
    }
    PostMessageW(g_hwnd, kMsgCheckResult, code, 0);
    return 0;
}

// 菜单入口：触发更新检查（后台线程执行）
void CheckForUpdate() {
    if (g_updating) {
        MessageBoxW(g_hwnd, L"DeepSeek Harness 正在更新中，请稍候。", kAppName, MB_ICONINFORMATION | MB_OK);
        return;
    }
    if (g_checking) return;
    g_checking = true;
    const HANDLE h = reinterpret_cast<HANDLE>(_beginthreadex(nullptr, 0, CheckThread, nullptr, 0, nullptr));
    if (!h) {
        g_checking = false;
        MessageBoxW(g_hwnd, L"无法启动更新检查线程。", kAppName, MB_ICONERROR | MB_OK);
        return;
    }
    CloseHandle(h);
}

unsigned __stdcall UpdateThread(void* p);  // 前向声明（定义在 DoUpdate 之后）

// 后台执行更新命令，完成后通知 UI
void DoUpdate(bool restartAfter) {
    if (g_updating) return;
    g_updating = true;
    auto* job = new UpdateJob{ UpdateCommand(), restartAfter };
    Log(L"update: 开始更新，命令 " + job->cmd);
    const HANDLE h = reinterpret_cast<HANDLE>(_beginthreadex(nullptr, 0, UpdateThread, job, 0, nullptr));
    if (!h) {
        delete job;
        g_updating = false;
        MessageBoxW(g_hwnd, L"无法启动更新线程。", kAppName, MB_ICONERROR | MB_OK);
        return;
    }
    CloseHandle(h);
}

unsigned __stdcall UpdateThread(void* p) {
    std::unique_ptr<UpdateJob> job(static_cast<UpdateJob*>(p));
    const bool ok = RunCommandWait(job->cmd);
    Log(ok ? L"update: 更新命令执行成功" : L"update: 更新命令执行失败");
    PostMessageW(g_hwnd, kMsgUpdateDone, ok ? 1 : 0, job->restartAfter ? 1 : 0);
    return 0;
}

// ---------- 菜单 ----------
void HandleCommand(int cmd) {
    switch (cmd) {
    case IDM_TOGGLE:
        if (IsRunning()) StopDSH(); else StartDSH();
        break;
    case IDM_RESTART:
        RestartDSH();
        break;
    case IDM_UPDATE:
        CheckForUpdate();
        break;
    case IDM_AUTOSTART:
        g_cfg.autoStart = !g_cfg.autoStart;
        WriteIniStr(L"General", L"AutoStart", g_cfg.autoStart ? L"1" : L"0");
        Log(g_cfg.autoStart ? L"autostart: 已开启随托盘自启动" : L"autostart: 已关闭随托盘自启动");
        break;
    case IDM_EXIT:
        if (IsRunning()) {
            std::wstring msg;
            if (IsManagedRunning()) {
                msg = L"退出托盘程序将同时停止 DeepSeek Harness。\n\n确定退出？";
            } else {
                const DWORD pid = PortOwnerPid(g_cfg.port);
                msg = L"检测到由外部启动的 DeepSeek Harness（PID " +
                      (pid ? ToStr((int)pid) : L"未知") +
                      L"）正在运行。退出托盘程序将同时结束该进程。\n\n确定退出？";
            }
            if (MessageBoxW(g_hwnd, msg.c_str(), kAppName, MB_YESNO | MB_ICONQUESTION | MB_DEFBUTTON2) != IDYES)
                break;
            if (IsManagedRunning()) {
                Log(L"exit: 停止托管的 DeepSeek Harness（PID " + ToStr((int)g_pid) + L"）");
                StopManaged();
            } else if (IsPortOpen(g_cfg.port)) {
                const DWORD pid = PortOwnerPid(g_cfg.port);
                if (pid) {
                    HANDLE h = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
                    if (h) {
                        TerminateProcess(h, 0);
                        CloseHandle(h);
                    }
                    Log(L"exit: 已结束外部启动的实例（PID " + ToStr((int)pid) + L"）");
                }
            }
        }
        DestroyWindow(g_hwnd);
        break;
    }
}

void ShowTrayMenu() {
    const bool running = IsRunning();
    POINT pt{};
    GetCursorPos(&pt);
    HMENU menu = CreatePopupMenu();
    // 顶部：当前启动方式与监听地址（浅色、不可编辑），每次弹出菜单时刷新检测
    g_mode = DetectLaunchMode();
    AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, (L"启动方式：" + ModeName(g_mode)).c_str());
    AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, (L"监听地址：http://" + g_cfg.host + L":" + ToStr(g_cfg.port)).c_str());
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    const std::wstring toggle = running ? L"停止 DeepSeek Harness" : L"启动 DeepSeek Harness";
    AppendMenuW(menu, MF_STRING, IDM_TOGGLE, toggle.c_str());
    AppendMenuW(menu, MF_STRING | (running ? 0 : MF_GRAYED), IDM_RESTART, L"重启 DeepSeek Harness");
    AppendMenuW(menu, MF_STRING | (g_updating || g_checking ? MF_GRAYED : 0), IDM_UPDATE,
                L"检查并更新 DeepSeek Harness");
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(menu, MF_STRING | (g_cfg.autoStart ? MF_CHECKED : 0), IDM_AUTOSTART,
                L"随托盘程序自启动 DeepSeek Harness");
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(menu, MF_STRING, IDM_EXIT, L"退出");

    SetForegroundWindow(g_hwnd);
    const int cmd = (int)TrackPopupMenu(menu, TPM_RIGHTBUTTON | TPM_RETURNCMD | TPM_NONOTIFY,
                                        pt.x, pt.y, 0, g_hwnd, nullptr);
    PostMessageW(g_hwnd, WM_NULL, 0, 0);  // 让菜单能正确收起
    DestroyMenu(menu);
    if (cmd) HandleCommand(cmd);
}

// ---------- 窗口过程 ----------
LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
    case kTrayMsg:
        switch (LOWORD(lp)) {
        case WM_RBUTTONUP:
        case WM_CONTEXTMENU:
            ShowTrayMenu();
            return 0;
        }
        break;
    case WM_TIMER:
        if (wp == kTimerState) {
            if (g_hProc && WaitForSingleObject(g_hProc, 0) == WAIT_OBJECT_0) {
                Log(L"state: 托管进程已自行退出（PID " + ToStr((int)g_pid) + L"）");
                CloseHandle(g_hProc);
                g_hProc = nullptr;
                if (g_hJob) {
                    CloseHandle(g_hJob);
                    g_hJob = nullptr;
                }
                g_pid = 0;
            }
            UpdateTrayTip();
        }
        return 0;
    case kMsgStart:
        StartDSH();
        return 0;
    case kMsgStop:
        StopDSH();
        return 0;
    case kMsgRestart:
        RestartDSH();
        return 0;
    case kMsgQuery:
        return IsRunning() ? 1 : 0;
    case kMsgCheckUpdate:
        CheckForUpdate();
        return 0;
    case kMsgCheckResult: {
        g_checking = false;
        const int code = (int)wp;
        if (code == 0) {
            MessageBoxW(g_hwnd, L"无法获取 DeepSeek Harness 的更新信息。\n\n请检查网络连接以及 npm 是否可用。",
                        kAppName, MB_ICONWARNING | MB_OK);
        } else if (code == 1) {
            MessageBoxW(g_hwnd, (L"DeepSeek Harness 已是最新版本（v" + std::wstring(g_checkLatest) + L"）。").c_str(),
                        kAppName, MB_ICONINFORMATION | MB_OK);
        } else if (code == 3) {
            const std::wstring msg =
                L"已获取 DeepSeek Harness 最新版本 v" + std::wstring(g_checkLatest) +
                L"，但无法确定当前安装版本。\n\n是否现在更新？";
            if (MessageBoxW(g_hwnd, msg.c_str(), kAppName, MB_YESNO | MB_ICONQUESTION | MB_DEFBUTTON2) == IDYES)
                DoUpdate(false);
        } else {  // code == 2：有更新
            const bool running = IsRunning();
            std::wstring msg =
                L"检测到 DeepSeek Harness 有新版本：v" + std::wstring(g_checkLatest) +
                (g_checkLocal[0] ? (L"（当前 v" + std::wstring(g_checkLocal) + L"）") : L"");
            if (g_mode == LaunchMode::Npx) msg += L"（当前以 npx 方式运行，更新将刷新缓存）";
            if (running) {
                msg += L"。\n\n是否停止当前实例并更新，然后重新启动？";
                if (MessageBoxW(g_hwnd, msg.c_str(), kAppName, MB_YESNO | MB_ICONQUESTION | MB_DEFBUTTON2) == IDYES) {
                    Log(L"update: 用户确认停止并更新后重启");
                    StopDSH();
                    DoUpdate(true);
                }
            } else {
                msg += L"。\n\n是否现在更新？";
                if (MessageBoxW(g_hwnd, msg.c_str(), kAppName, MB_YESNO | MB_ICONQUESTION | MB_DEFBUTTON2) == IDYES)
                    DoUpdate(false);
            }
        }
        return 0;
    }
    case kMsgUpdateDone: {
        const bool ok = wp != 0;
        const bool restart = lp != 0;
        g_updating = false;
        g_mode = DetectLaunchMode();  // 更新后重新检测启动方式
        if (!ok) {
            Log(L"update: 更新失败");
            MessageBoxW(g_hwnd, L"DeepSeek Harness 更新失败。\n请检查网络连接后重试。", kAppName, MB_ICONERROR | MB_OK);
        } else {
            Log(L"update: 更新完成");
            // 更新成功保持静默，不弹任何窗口；需要重启服务时直接启动，
            // 启动失败会由 StartDSH 内部弹出错误提示
            if (restart) {
                Log(L"update: 更新完成，正在重新启动 DeepSeek Harness");
                StartDSH();
            }
        }
        UpdateTrayTip();
        return 0;
    }
    case WM_DESTROY:
        KillTimer(hwnd, kTimerState);
        {
            NOTIFYICONDATAW nid{};
            nid.cbSize = sizeof(nid);
            nid.hWnd = hwnd;
            nid.uID = g_trayId;
            Shell_NotifyIconW(NIM_DELETE, &nid);
        }
        // 托盘退出即终止托管的 DeepSeek Harness（完全接管启停状态）：
        // 有作业对象时整树终止（KILL_ON_JOB_CLOSE 兜底），无作业时单进程终止
        if (g_hProc && WaitForSingleObject(g_hProc, 0) == WAIT_TIMEOUT) {
            if (g_hJob)
                TerminateJobObject(g_hJob, 0);
            else
                TerminateProcess(g_hProc, 0);
            WaitForSingleObject(g_hProc, 3000);
            Log(L"exit: 已停止 DeepSeek Harness");
        } else {
            Log(L"exit: 托盘程序退出");
        }
        if (g_hProc) CloseHandle(g_hProc);
        if (g_hJob) CloseHandle(g_hJob);  // 关闭最后一个句柄时 KILL_ON_JOB_CLOSE 兜底
        g_hProc = nullptr;
        g_hJob = nullptr;
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

}  // namespace

// ---------- 入口（必须为全局函数，编译器据此选择 wWinMainCRTStartup） ----------
int APIENTRY wWinMain(HINSTANCE hInstance, HINSTANCE, PWSTR, int) {
    g_hInst = hInstance;

    WSADATA wsa{};
    WSAStartup(MAKEWORD(2, 2), &wsa);

    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    // 单实例
    HANDLE mutex = CreateMutexW(nullptr, TRUE, kMutexName);
    if (!mutex || GetLastError() == ERROR_ALREADY_EXISTS) {
        MessageBoxW(nullptr, L"DeepSeek Harness Launcher 已在运行。", kAppName, MB_OK | MB_ICONINFORMATION);
        return 0;
    }

    g_iniPath = ExeDir() + L"\\" + kIniName;
    g_logPath = ExeDir() + L"\\" + kLogName;

    // 首次运行：生成默认配置文件
    if (!FileExists(g_iniPath)) {
        WriteIniStr(L"General", L"Host", L"127.0.0.1");
        WriteIniStr(L"General", L"Port", ToStr(16100));
        WriteIniStr(L"General", L"AutoStart", L"0");
        WriteIniStr(L"General", L"NodePath", L"");
        WriteIniStr(L"General", L"DshBin", L"");
        Log(L"init: 已生成默认配置文件 " + g_iniPath);
    }
    LoadConfig();  // 端口收束：无效端口在此修正为随机可用端口并写回 ini

    // 检查 Node.js 环境：缺失则提示并自动退出（托盘自身也不运行）
    if (FindNodeExe().empty()) {
        MessageBoxW(nullptr,
                    L"未检测到 Node.js 环境。\n\n"
                    L"DeepSeek Harness 需要 Node.js 才能运行。\n"
                    L"请先安装 Node.js（https://nodejs.org/zh-cn/download），\n"
                    L"安装完成后重新启动本程序。",
                    kAppName, MB_ICONERROR | MB_OK);
        ReleaseMutex(mutex);
        CloseHandle(mutex);
        return 0;
    }
    // 检测启动方式：dsh（npm 全局安装）或 npx（未安装，按需拉取）
    g_mode = DetectLaunchMode();
    Log(L"init: Node.js 已就绪，启动方式=" + ModeName(g_mode));

    // 注册窗口类（隐藏窗口，仅接收托盘消息）
    WNDCLASSW wc{};
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.lpszClassName = kWndClass;
    wc.hIcon = LoadIconW(hInstance, MAKEINTRESOURCE(IDI_APP));
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    if (!RegisterClassW(&wc)) {
        ReleaseMutex(mutex);
        return 0;
    }
    g_hwnd = CreateWindowW(kWndClass, kAppName, WS_OVERLAPPEDWINDOW,
                           CW_USEDEFAULT, CW_USEDEFAULT, 200, 120,
                           nullptr, nullptr, hInstance, nullptr);
    if (!g_hwnd) {
        ReleaseMutex(mutex);
        return 0;
    }
    g_hIcon = LoadIconW(hInstance, MAKEINTRESOURCE(IDI_APP));

    // 托盘图标
    NOTIFYICONDATAW nid{};
    nid.cbSize = sizeof(nid);
    nid.hWnd = g_hwnd;
    nid.uID = g_trayId;
    nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
    nid.uCallbackMessage = kTrayMsg;
    nid.hIcon = g_hIcon;
    wcsncpy(nid.szTip, kAppName, 127);
    nid.szTip[127] = L'\0';
    Shell_NotifyIconW(NIM_ADD, &nid);

    SetTimer(g_hwnd, kTimerState, 2000, nullptr);

    // 随托盘程序自启动 DeepSeek Harness
    if (g_cfg.autoStart && !IsRunning()) {
        Log(L"init: AutoStart=1，自动启动 DeepSeek Harness");
        StartDSH();
    }
    UpdateTrayTip();

    MSG msg{};
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    WSACleanup();
    ReleaseMutex(mutex);
    CloseHandle(mutex);
    return (int)msg.wParam;
}
