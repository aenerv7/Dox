// ============================================================================
// Launcher.cpp — DeepSeek Harness 托盘启动器（纯 Win32 原生实现，Windows 10/11）
//
// 功能：
//   * 系统托盘图标 + 右键菜单：启动 / 停止（二选一显示）、重启 DeepSeek Harness
//   * 自定义启动端口（写入 exe 同目录 Launcher.ini）
//   * 随托盘程序自启动 DeepSeek Harness、开机自启托盘程序（均写入 ini）
//   * 双击托盘图标打开 Web 界面
//
// 实现要点：
//   * 直接以 node.exe <dsh>/lib/bin.js web --port <N> 派生进程，便于完整管理
//   * 作业对象整树终止；端口探测识别外部启动的实例
//   * 所有设置通过 GetPrivateProfileString / WritePrivateProfileString 读写
//     exe 同目录的 Launcher.ini
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
#include <string>
#include <vector>
#include "Resource.h"

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "iphlpapi.lib")

namespace {

constexpr wchar_t kAppName[]      = L"DeepSeek Harness Launcher";
constexpr wchar_t kIniName[]      = L"Launcher.ini";
constexpr wchar_t kLogName[]      = L"Launcher.log";
constexpr wchar_t kWndClass[]     = L"DSHLauncherWnd";
constexpr wchar_t kMutexName[]    = L"Local\\DSHLauncher_SingleInstance";
constexpr wchar_t kRunKeyPath[]   = L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
constexpr wchar_t kRunValueName[] = L"DeepSeekHarnessLauncher";
constexpr UINT    kTrayMsg        = WM_APP + 1;
constexpr UINT_PTR kTimerState    = 1;
// 私有消息（自动化 / 调试用，不影响正常使用）
constexpr UINT kMsgStart   = WM_APP + 100;
constexpr UINT kMsgStop    = WM_APP + 101;
constexpr UINT kMsgRestart = WM_APP + 102;
constexpr UINT kMsgQuery   = WM_APP + 103;

HINSTANCE g_hInst = nullptr;
HWND      g_hwnd   = nullptr;
HICON     g_hIcon  = nullptr;
constexpr UINT g_trayId = 1;

// ---------- 配置（全部来自 exe 同目录 Launcher.ini） ----------
struct Config {
    int          port       = 16100;
    bool         autoStart  = false;   // 随托盘程序自启动 DeepSeek Harness
    bool         runAtLogin = false;   // 开机自动启动托盘程序
    std::wstring nodePath;             // 高级：node.exe 完整路径（留空自动查找）
    std::wstring dshBin;               // 高级：dsh 的 lib\bin.js 完整路径（留空自动查找）
};
Config       g_cfg;
std::wstring g_iniPath;
std::wstring g_logPath;

// 托管的 DeepSeek Harness 进程
HANDLE g_hJob  = nullptr;
HANDLE g_hProc = nullptr;
DWORD  g_pid   = 0;

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

void LoadConfig() {
    g_cfg.port = ReadIniInt(L"General", L"Port", 16100);
    if (g_cfg.port < 1 || g_cfg.port > 65535) g_cfg.port = 16100;
    g_cfg.autoStart  = ReadIniInt(L"General", L"AutoStart", 0) != 0;
    g_cfg.runAtLogin = ReadIniInt(L"General", L"RunAtLogin", 0) != 0;
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

std::wstring FindDshBin() {
    if (!g_cfg.dshBin.empty() && FileExists(g_cfg.dshBin)) return g_cfg.dshBin;
    wchar_t appdata[MAX_PATH]{};
    if (SHGetFolderPathW(nullptr, CSIDL_APPDATA, nullptr, SHGFP_TYPE_CURRENT, appdata) == S_OK) {
        const std::wstring p = std::wstring(appdata) + L"\\npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js";
        if (FileExists(p)) return p;
    }
    const std::wstring dshCmd = SearchPathFor(L"dsh.cmd");
    if (!dshCmd.empty()) {
        const size_t pos = dshCmd.find_last_of(L'\\');
        if (pos != std::wstring::npos) {
            const std::wstring p = dshCmd.substr(0, pos) + L"\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js";
            if (FileExists(p)) return p;
        }
    }
    return L"";
}

// ---------- 端口探测 ----------
bool IsPortOpen(int port) {
    SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (s == INVALID_SOCKET) return false;
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons((u_short)port);
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
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
        tip += L" — 运行中（端口 " + ToStr(g_cfg.port) + L"）";
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
    const std::wstring node = FindNodeExe();
    const std::wstring bin  = FindDshBin();
    if (node.empty() || bin.empty()) {
        std::wstring msg =
            L"未找到 DeepSeek Harness 的启动组件。\n\n"
            L"需要 Node.js 以及全局安装的 dsh 包（npm i -g @deepseek-ai/dsh）。\n"
            L"也可以在 Launcher.ini 的 [General] 中手动指定：\n"
            L"  NodePath = node.exe 的完整路径\n"
            L"  DshBin   = dsh 的 lib\\bin.js 完整路径\n\n"
            L"已找到：node.exe -> " + (node.empty() ? L"（无）" : node) + L"\n"
            L"        dsh bin  -> " + (bin.empty() ? L"（无）" : bin);
        MessageBoxW(g_hwnd, msg.c_str(), kAppName, MB_ICONERROR | MB_OK);
        Log(L"start: 未找到启动组件");
        return false;
    }

    const std::wstring cmd = L"\"" + node + L"\" \"" + bin + L"\" web --port " + ToStr(g_cfg.port);
    Log(L"start: " + cmd);

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

// ---------- 其它操作 ----------
void OpenBrowser() {
    const std::wstring url = L"http://127.0.0.1:" + ToStr(g_cfg.port);
    ShellExecuteW(nullptr, L"open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
    Log(L"open: " + url);
}

void SyncRunAtLogin() {
    HKEY hk = nullptr;
    if (RegCreateKeyExW(HKEY_CURRENT_USER, kRunKeyPath, 0, nullptr, 0, KEY_SET_VALUE, nullptr, &hk, nullptr) != ERROR_SUCCESS)
        return;
    if (g_cfg.runAtLogin) {
        wchar_t exe[MAX_PATH]{};
        GetModuleFileNameW(nullptr, exe, MAX_PATH);
        const std::wstring val = L"\"" + std::wstring(exe) + L"\"";
        RegSetValueExW(hk, kRunValueName, 0, REG_SZ,
                       reinterpret_cast<const BYTE*>(val.c_str()), (DWORD)((val.size() + 1) * sizeof(wchar_t)));
        Log(L"login: 已写入开机自启注册表项");
    } else {
        RegDeleteValueW(hk, kRunValueName);
        Log(L"login: 已移除开机自启注册表项");
    }
    RegCloseKey(hk);
}

// ---------- 端口设置对话框 ----------
INT_PTR CALLBACK PortDlgProc(HWND hDlg, UINT msg, WPARAM wp, LPARAM) {
    switch (msg) {
    case WM_INITDIALOG:
        SetDlgItemInt(hDlg, IDC_PORT_EDIT, (UINT)g_cfg.port, FALSE);
        return TRUE;
    case WM_COMMAND:
        switch (LOWORD(wp)) {
        case IDOK: {
            BOOL ok = FALSE;
            const int v = (int)GetDlgItemInt(hDlg, IDC_PORT_EDIT, &ok, FALSE);
            if (!ok || v < 1 || v > 65535) {
                MessageBoxW(hDlg, L"请输入 1-65535 之间的端口号。", kAppName, MB_ICONWARNING | MB_OK);
                return TRUE;
            }
            WriteIniStr(L"General", L"Port", ToStr(v));
            Log(L"port: 端口已改为 " + ToStr(v));
            EndDialog(hDlg, IDOK);
            return TRUE;
        }
        case IDCANCEL:
            EndDialog(hDlg, IDCANCEL);
            return TRUE;
        }
        break;
    }
    return FALSE;
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
    case IDM_OPEN:
        OpenBrowser();
        break;
    case IDM_PORT: {
        DialogBoxParamW(g_hInst, MAKEINTRESOURCE(IDD_PORT), g_hwnd, PortDlgProc, 0);
        LoadConfig();  // 端口可能在对话框中被修改
        UpdateTrayTip();
        if (IsRunning())
            MessageBoxW(g_hwnd, L"端口已更新，重启 DeepSeek Harness 后生效。", kAppName, MB_ICONINFORMATION | MB_OK);
        break;
    }
    case IDM_AUTOSTART:
        g_cfg.autoStart = !g_cfg.autoStart;
        WriteIniStr(L"General", L"AutoStart", g_cfg.autoStart ? L"1" : L"0");
        Log(g_cfg.autoStart ? L"autostart: 已开启随托盘自启动" : L"autostart: 已关闭随托盘自启动");
        break;
    case IDM_RUNATLOGIN:
        g_cfg.runAtLogin = !g_cfg.runAtLogin;
        WriteIniStr(L"General", L"RunAtLogin", g_cfg.runAtLogin ? L"1" : L"0");
        SyncRunAtLogin();
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
    const std::wstring toggle = running ? L"停止 DeepSeek Harness" : L"启动 DeepSeek Harness";
    AppendMenuW(menu, MF_STRING, IDM_TOGGLE, toggle.c_str());
    AppendMenuW(menu, MF_STRING | (running ? 0 : MF_GRAYED), IDM_RESTART, L"重启 DeepSeek Harness");
    AppendMenuW(menu, MF_STRING | (running ? 0 : MF_GRAYED), IDM_OPEN, L"打开 Web 界面");
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(menu, MF_STRING, IDM_PORT, (L"启动端口设置（当前 " + ToStr(g_cfg.port) + L"）...").c_str());
    AppendMenuW(menu, MF_STRING | (g_cfg.autoStart ? MF_CHECKED : 0), IDM_AUTOSTART,
                L"随托盘程序自启动 DeepSeek Harness");
    AppendMenuW(menu, MF_STRING | (g_cfg.runAtLogin ? MF_CHECKED : 0), IDM_RUNATLOGIN,
                L"开机自动启动托盘程序");
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
        case WM_LBUTTONDBLCLK:
            OpenBrowser();
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
    LoadConfig();

    // 首次运行：生成默认配置文件
    if (!FileExists(g_iniPath)) {
        WriteIniStr(L"General", L"Port", ToStr(16100));
        WriteIniStr(L"General", L"AutoStart", L"0");
        WriteIniStr(L"General", L"RunAtLogin", L"0");
        WriteIniStr(L"General", L"NodePath", L"");
        WriteIniStr(L"General", L"DshBin", L"");
        Log(L"init: 已生成默认配置文件 " + g_iniPath);
    }

    // 开机自启与注册表保持同步（ini 可能被外部修改过）
    SyncRunAtLogin();

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
