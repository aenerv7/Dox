// SizerWin - Windows native window sizer/positioner
// Equivalent to SizerAHK, implemented with pure Win32 API
// Hotkey: Shift+Alt+Space

#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <shellapi.h>
#include <strsafe.h>
#include <stdlib.h>
#include <string.h>
#include <dwmapi.h>

#pragma comment(lib, "dwmapi.lib")

// DWMWA_USE_IMMERSIVE_DARK_MODE (Windows 10 20H1+)
#ifndef DWMWA_USE_IMMERSIVE_DARK_MODE
#define DWMWA_USE_IMMERSIVE_DARK_MODE 20
#endif

#define TASKBAR_HEIGHT 48
#define HOTKEY_ID_MENU 1
#define WM_TRAYICON (WM_USER + 1)

#define IDM_AUTO        1001
#define IDM_CENTRE      1002
#define IDM_EXIT        1004
#define IDM_PRESET_BASE 2000  // 预设分辨率菜单项从此 ID 开始

// 预设分辨率配置
#define MAX_PRESETS 64

typedef struct {
    int width;
    int height;
} SizePreset;

typedef struct {
    SizePreset items[MAX_PRESETS];
    int count;
    int separatorAfter;  // 水平组结束位置（之后插入分隔线）
} PresetConfig;

static PresetConfig g_presets = {0};

static HWND g_targetHwnd = NULL;
static HWND g_hwndMain = NULL;
static HINSTANCE g_hInstance = NULL;
static BOOL g_isChinese = FALSE;
static BOOL g_darkMode = FALSE;

// 暗色模式颜色
#define DARK_BG_COLOR     RGB(32, 32, 32)
#define DARK_TEXT_COLOR   RGB(255, 255, 255)
static HBRUSH g_hbrDarkBg = NULL;

// 加载默认预设
static void LoadDefaultPresets(void)
{
    static const SizePreset defaults[] = {
        {640,480}, {1024,768}, {1280,720}, {1280,800},
        {1600,900}, {1600,1000}, {1920,1080}, {1920,1200},
        {480,854}, {720,1280}, {800,1280}
    };
    g_presets.count = 11;
    g_presets.separatorAfter = 8;  // 前 8 个是水平，之后是垂直
    for (int i = 0; i < 11; i++)
        g_presets.items[i] = defaults[i];
}

// 生成默认配置文件
static void GenerateConfigFile(LPCWSTR path)
{
    HANDLE hFile = CreateFileW(path, GENERIC_WRITE, 0, NULL, CREATE_NEW, 0, NULL);
    if (hFile == INVALID_HANDLE_VALUE) return;
    const char *content =
        "[Horizontal]\r\n"
        "640x480\r\n"
        "1024x768\r\n"
        "1280x720\r\n"
        "1280x800\r\n"
        "1600x900\r\n"
        "1600x1000\r\n"
        "1920x1080\r\n"
        "1920x1200\r\n"
        "\r\n"
        "[Vertical]\r\n"
        "480x854\r\n"
        "720x1280\r\n"
        "800x1280\r\n";
    DWORD written;
    WriteFile(hFile, content, (DWORD)strlen(content), &written, NULL);
    CloseHandle(hFile);
}

// 从配置文件加载预设
static void LoadConfig(void)
{
    WCHAR cfgPath[MAX_PATH];
    GetModuleFileNameW(NULL, cfgPath, MAX_PATH);
    WCHAR *slash = wcsrchr(cfgPath, L'\\');
    if (slash)
        StringCchCopyW(slash + 1, MAX_PATH - (slash - cfgPath + 1), L"SizerWin.ini");
    else
        return;

    // 如果配置文件不存在，生成默认配置
    if (GetFileAttributesW(cfgPath) == INVALID_FILE_ATTRIBUTES)
    {
        GenerateConfigFile(cfgPath);
        LoadDefaultPresets();
        return;
    }

    // 读取文件
    HANDLE hFile = CreateFileW(cfgPath, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
    if (hFile == INVALID_HANDLE_VALUE)
    {
        LoadDefaultPresets();
        return;
    }

    DWORD fileSize = GetFileSize(hFile, NULL);
    if (fileSize == 0 || fileSize > 8192)
    {
        CloseHandle(hFile);
        LoadDefaultPresets();
        return;
    }

    char *buf = (char*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, fileSize + 1);
    if (!buf)
    {
        CloseHandle(hFile);
        LoadDefaultPresets();
        return;
    }

    DWORD bytesRead;
    ReadFile(hFile, buf, fileSize, &bytesRead, NULL);
    CloseHandle(hFile);
    buf[bytesRead] = '\0';

    g_presets.count = 0;
    g_presets.separatorAfter = -1;
    int inVertical = 0;

    char *line = buf;
    while (*line)
    {
        // 跳过行首空白
        while (*line == ' ' || *line == '\t') line++;

        // 找行尾
        char *eol = line;
        while (*eol && *eol != '\r' && *eol != '\n') eol++;

        int lineLen = (int)(eol - line);

        if (lineLen > 0 && line[0] == '[')
        {
            // Section header
            if (lineLen >= 10 && (line[1] == 'V' || line[1] == 'v'))
            {
                if (g_presets.separatorAfter < 0)
                    g_presets.separatorAfter = g_presets.count;
                inVertical = 1;
            }
        }
        else if (lineLen > 0 && line[0] != ';' && line[0] != '#')
        {
            // 解析 WxH 格式
            int w = 0, h = 0;
            char *p = line;
            while (p < eol && *p >= '0' && *p <= '9') { w = w * 10 + (*p - '0'); p++; }
            if (p < eol && (*p == 'x' || *p == 'X')) p++;
            while (p < eol && *p >= '0' && *p <= '9') { h = h * 10 + (*p - '0'); p++; }

            if (w > 0 && h > 0 && g_presets.count < MAX_PRESETS)
            {
                g_presets.items[g_presets.count].width = w;
                g_presets.items[g_presets.count].height = h;
                g_presets.count++;
            }
        }

        // 跳到下一行
        while (*eol == '\r' || *eol == '\n') eol++;
        line = eol;
    }

    HeapFree(GetProcessHeap(), 0, buf);

    if (g_presets.count == 0)
        LoadDefaultPresets();
    if (g_presets.separatorAfter < 0)
        g_presets.separatorAfter = g_presets.count;

    (void)inVertical;
}

static int GetTaskbarOffset(int monitorIndex)
{
    if (monitorIndex == 1)
    {
        HKEY hKey;
        if (RegOpenKeyExW(HKEY_CURRENT_USER,
            L"Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StuckRects3",
            0, KEY_READ, &hKey) == ERROR_SUCCESS)
        {
            BYTE data[64];
            DWORD dataSize = sizeof(data);
            DWORD type;
            if (RegQueryValueExW(hKey, L"Settings", NULL, &type, data, &dataSize) == ERROR_SUCCESS)
            {
                if (dataSize > 8 && data[8] == 0x03)
                {
                    RegCloseKey(hKey);
                    return 0;
                }
            }
            RegCloseKey(hKey);
        }
        return TASKBAR_HEIGHT / 2;
    }
    else
    {
        HKEY hKey;
        if (RegOpenKeyExW(HKEY_CURRENT_USER,
            L"Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
            0, KEY_READ, &hKey) == ERROR_SUCCESS)
        {
            DWORD value = 0;
            DWORD dataSize = sizeof(value);
            DWORD type;
            if (RegQueryValueExW(hKey, L"MMTaskbarEnabled", NULL, &type,
                (BYTE*)&value, &dataSize) == ERROR_SUCCESS)
            {
                if (value == 1)
                {
                    RegCloseKey(hKey);
                    return TASKBAR_HEIGHT / 2;
                }
            }
            RegCloseKey(hKey);
        }
        return 0;
    }
}

typedef struct {
    int windowCenterX;
    int windowCenterY;
    int foundIndex;
    int currentIndex;
    int left, top, right, bottom;
} MonitorEnumData;

static BOOL CALLBACK MonitorEnumProc(HMONITOR hMon, HDC hdc, LPRECT lprc, LPARAM dwData)
{
    MonitorEnumData *med = (MonitorEnumData*)dwData;
    (void)hMon; (void)hdc;
    med->currentIndex++;
    if (med->windowCenterX >= lprc->left && med->windowCenterX < lprc->right &&
        med->windowCenterY >= lprc->top && med->windowCenterY < lprc->bottom)
    {
        med->foundIndex = med->currentIndex;
        med->left = lprc->left;
        med->top = lprc->top;
        med->right = lprc->right;
        med->bottom = lprc->bottom;
    }
    return TRUE;
}

static void GetCurrentMonitor(int wx, int wy, int ww, int wh,
    int *mW, int *mH, int *mL, int *mT, int *mR, int *mB, int *mIdx)
{
    MonitorEnumData med = {0};
    med.windowCenterX = wx + ww / 2;
    med.windowCenterY = wy + wh / 2;
    med.foundIndex = 1;
    med.currentIndex = 0;
    EnumDisplayMonitors(NULL, NULL, MonitorEnumProc, (LPARAM)&med);
    *mL = med.left; *mT = med.top;
    *mR = med.right; *mB = med.bottom;
    *mW = med.right - med.left;
    *mH = med.bottom - med.top;
    *mIdx = med.foundIndex;
}

static void AdjustWindowSize(int width, int height, BOOL centre)
{
    WINDOWPLACEMENT wp = { sizeof(wp) };
    if (!g_targetHwnd || !IsWindow(g_targetHwnd)) return;
    GetWindowPlacement(g_targetHwnd, &wp);
    if (wp.showCmd == SW_SHOWMINIMIZED) return;
    if (wp.showCmd == SW_SHOWMAXIMIZED)
    {
        ShowWindow(g_targetHwnd, SW_RESTORE);
        Sleep(50);
    }
    if (centre)
    {
        RECT rc;
        GetWindowRect(g_targetHwnd, &rc);
        int mW, mH, mL, mT, mR, mB, mIdx;
        GetCurrentMonitor(rc.left, rc.top, rc.right-rc.left, rc.bottom-rc.top,
            &mW, &mH, &mL, &mT, &mR, &mB, &mIdx);
        int tbOff = GetTaskbarOffset(mIdx);
        int nx = mL + (mW/2) - (width/2);
        int ny = mT + (mH/2) - (height/2) - tbOff;
        SetWindowPos(g_targetHwnd, NULL, nx, ny, width, height,
            SWP_NOZORDER | SWP_NOACTIVATE);
    }
    else
    {
        SetWindowPos(g_targetHwnd, NULL, 0, 0, width, height,
            SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
    }
}

static void DoAuto(void)
{
    WINDOWPLACEMENT wp = { sizeof(wp) };
    if (!g_targetHwnd || !IsWindow(g_targetHwnd)) return;
    GetWindowPlacement(g_targetHwnd, &wp);
    if (wp.showCmd == SW_SHOWMINIMIZED) return;
    if (wp.showCmd == SW_SHOWMAXIMIZED)
    {
        ShowWindow(g_targetHwnd, SW_RESTORE);
        Sleep(50);
    }
    RECT rc;
    GetWindowRect(g_targetHwnd, &rc);
    int mW, mH, mL, mT, mR, mB, mIdx;
    GetCurrentMonitor(rc.left, rc.top, rc.right-rc.left, rc.bottom-rc.top,
        &mW, &mH, &mL, &mT, &mR, &mB, &mIdx);
    int nw = mW * 3 / 4;
    int nh = mH * 3 / 4;
    int tbOff = GetTaskbarOffset(mIdx);
    int nx = mL + (mW/2) - (nw/2);
    int ny = mT + (mH/2) - (nh/2) - tbOff;
    SetWindowPos(g_targetHwnd, NULL, nx, ny, nw, nh, SWP_NOZORDER | SWP_NOACTIVATE);
}

static void DoCentre(void)
{
    WINDOWPLACEMENT wp = { sizeof(wp) };
    if (!g_targetHwnd || !IsWindow(g_targetHwnd)) return;
    GetWindowPlacement(g_targetHwnd, &wp);
    if (wp.showCmd != SW_SHOWNORMAL) return;
    RECT rc;
    GetWindowRect(g_targetHwnd, &rc);
    int ww = rc.right - rc.left, wh = rc.bottom - rc.top;
    int mW, mH, mL, mT, mR, mB, mIdx;
    GetCurrentMonitor(rc.left, rc.top, ww, wh, &mW, &mH, &mL, &mT, &mR, &mB, &mIdx);
    int tbOff = GetTaskbarOffset(mIdx);
    int nx = mL + (mW/2) - (ww/2);
    int ny = mT + (mH/2) - (wh/2) - tbOff;
    SetWindowPos(g_targetHwnd, NULL, nx, ny, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
}

static void ShowSizerMenu(void)
{
    g_targetHwnd = GetForegroundWindow();
    if (!g_targetHwnd) return;

    // 只对普通窗口状态响应（非最小化、非最大化）
    WINDOWPLACEMENT wp = { sizeof(wp) };
    GetWindowPlacement(g_targetHwnd, &wp);
    if (wp.showCmd != SW_SHOWNORMAL) return;

    // 排除桌面和任务栏
    WCHAR cls[64];
    GetClassNameW(g_targetHwnd, cls, 64);
    if (lstrcmpiW(cls, L"Shell_TrayWnd") == 0 ||
        lstrcmpiW(cls, L"Shell_SecondaryTrayWnd") == 0 ||
        lstrcmpiW(cls, L"Progman") == 0 ||
        lstrcmpiW(cls, L"WorkerW") == 0)
        return;

    // 每次弹出菜单时重新加载配置
    LoadConfig();

    HMENU hMenu = CreatePopupMenu();
    if (!hMenu) return;

    if (g_isChinese)
    {
        AppendMenuW(hMenu, MF_STRING, IDM_AUTO, L"\x81EA\x52A8(&A)");
        AppendMenuW(hMenu, MF_STRING, IDM_CENTRE, L"\x5C45\x4E2D(&C)");
    }
    else
    {
        AppendMenuW(hMenu, MF_STRING, IDM_AUTO, L"&Auto");
        AppendMenuW(hMenu, MF_STRING, IDM_CENTRE, L"&Centre");
    }
    AppendMenuW(hMenu, MF_SEPARATOR, 0, NULL);

    // 动态添加预设分辨率
    for (int i = 0; i < g_presets.count; i++)
    {
        if (i == g_presets.separatorAfter && i > 0)
            AppendMenuW(hMenu, MF_SEPARATOR, 0, NULL);
        WCHAR label[32];
        StringCchPrintfW(label, 32, L"%dx%d", g_presets.items[i].width, g_presets.items[i].height);
        AppendMenuW(hMenu, MF_STRING, IDM_PRESET_BASE + i, label);
    }

    POINT pt;
    GetCursorPos(&pt);
    SetForegroundWindow(g_hwndMain);
    int cmd = TrackPopupMenu(hMenu, TPM_RETURNCMD | TPM_NONOTIFY,
        pt.x, pt.y, 0, g_hwndMain, NULL);
    DestroyMenu(hMenu);

    // 恢复目标窗口焦点
    if (g_targetHwnd && IsWindow(g_targetHwnd))
        SetForegroundWindow(g_targetHwnd);

    if (cmd == 0) return;

    BOOL ctrlDown = (GetKeyState(VK_CONTROL) & 0x8000) != 0;
    switch (cmd)
    {
    case IDM_AUTO:   DoAuto(); break;
    case IDM_CENTRE: DoCentre(); break;
    default:
        if (cmd >= IDM_PRESET_BASE && cmd < IDM_PRESET_BASE + g_presets.count)
        {
            int idx = cmd - IDM_PRESET_BASE;
            AdjustWindowSize(g_presets.items[idx].width, g_presets.items[idx].height, ctrlDown);
        }
        break;
    }
}

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    switch (msg)
    {
    case WM_HOTKEY:
        if (wParam == HOTKEY_ID_MENU)
            ShowSizerMenu();
        return 0;

    case WM_TRAYICON:
        return 0;

    case WM_COMMAND:
        if (LOWORD(wParam) == IDM_EXIT)
            PostQuitMessage(0);
        return 0;

    case WM_DESTROY:
    {
        UnregisterHotKey(hwnd, HOTKEY_ID_MENU);
        PostQuitMessage(0);
        return 0;
    }
    }
    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE hPrev, LPWSTR lpCmd, int nShow)
{
    (void)hPrev; (void)lpCmd; (void)nShow;
    g_hInstance = hInstance;

    HANDLE hMutex = CreateMutexW(NULL, TRUE, L"SizerWin_SingleInstance");
    if (GetLastError() == ERROR_ALREADY_EXISTS)
    {
        CloseHandle(hMutex);
        return 0;
    }

    LANGID langId = GetUserDefaultUILanguage();
    g_isChinese = (PRIMARYLANGID(langId) == LANG_CHINESE);

    HKEY hKey;
    if (RegOpenKeyExW(HKEY_CURRENT_USER,
        L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
        0, KEY_READ, &hKey) == ERROR_SUCCESS)
    {
        DWORD val = 1, sz = sizeof(val);
        RegQueryValueExW(hKey, L"SystemUsesLightTheme", NULL, NULL, (BYTE*)&val, &sz);
        g_darkMode = (val == 0);
        RegCloseKey(hKey);
    }

    if (g_darkMode)
    {
        typedef BOOL (WINAPI *PFN_SetMode)(int);
        typedef void (WINAPI *PFN_Flush)(void);
        HMODULE hUx = LoadLibraryW(L"uxtheme.dll");
        if (hUx)
        {
            // Ordinal 135: SetPreferredAppMode (2 = ForceDark)
            // Ordinal 136: FlushMenuThemes
            PFN_SetMode fn135 = (PFN_SetMode)GetProcAddress(hUx, MAKEINTRESOURCEA(135));
            PFN_Flush fn136 = (PFN_Flush)GetProcAddress(hUx, MAKEINTRESOURCEA(136));
            if (fn135) fn135(2);
            if (fn136) fn136();
        }
        g_hbrDarkBg = CreateSolidBrush(DARK_BG_COLOR);
    }

    WNDCLASSEXW wc = { sizeof(wc) };
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.lpszClassName = L"SizerWinMain";
    RegisterClassExW(&wc);

    g_hwndMain = CreateWindowExW(0, L"SizerWinMain", L"SizerWin",
        0, 0, 0, 0, 0, HWND_MESSAGE, NULL, hInstance, NULL);
    if (!g_hwndMain)
    {
        CloseHandle(hMutex);
        return 1;
    }

    if (!RegisterHotKey(g_hwndMain, HOTKEY_ID_MENU, MOD_SHIFT | MOD_ALT, VK_SPACE))
    {
        MessageBoxW(NULL,
            g_isChinese
                ? L"\x6CE8\x518C\x5FEB\x6377\x952E\x5931\x8D25\xFF0C\x53EF\x80FD\x5DF2\x88AB\x5176\x4ED6\x7A0B\x5E8F\x5360\x7528"
                : L"Failed to register hotkey. It may be in use by another program.",
            L"SizerWin", MB_ICONERROR);
        DestroyWindow(g_hwndMain);
        CloseHandle(hMutex);
        return 1;
    }

    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0))
    {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    CloseHandle(hMutex);
    return (int)msg.wParam;
}
