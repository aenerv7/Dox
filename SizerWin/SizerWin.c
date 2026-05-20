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
#define IDM_CUSTOM      1003
#define IDM_EXIT        1004
#define IDM_PRESET_BASE 2000  // 预设分辨率菜单项从此 ID 开始

#define IDC_EDIT_WIDTH  3001
#define IDC_EDIT_HEIGHT 3002
#define IDC_BTN_RESIZE  3003
#define IDC_BTN_RESIZE_CENTRE 3004
#define IDC_BTN_CANCEL  3005

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
static HWND g_hwndCustom = NULL;
static HINSTANCE g_hInstance = NULL;
static BOOL g_isChinese = FALSE;
static BOOL g_darkMode = FALSE;
static WNDPROC g_origEditProc = NULL;

// 暗色模式颜色
#define DARK_BG_COLOR     RGB(32, 32, 32)
#define DARK_TEXT_COLOR   RGB(255, 255, 255)
#define DARK_EDIT_BG      RGB(45, 45, 45)
// 按钮颜色
#define DARK_BTN_BG       RGB(55, 55, 55)
#define DARK_BTN_HOVER    RGB(70, 70, 70)
#define DARK_BTN_PRESS    RGB(40, 40, 40)
#define LIGHT_BTN_BG      RGB(225, 225, 225)
#define LIGHT_BTN_HOVER   RGB(200, 200, 200)
#define LIGHT_BTN_PRESS   RGB(175, 175, 175)
#define LIGHT_BTN_TEXT    RGB(0, 0, 0)
#define BTN_CORNER_RADIUS 4
static HBRUSH g_hbrDarkBg = NULL;
static HBRUSH g_hbrDarkEdit = NULL;

// 输入框颜色
#define DARK_EDIT_BORDER    RGB(80, 80, 80)
#define DARK_EDIT_FOCUS     RGB(100, 140, 200)
#define LIGHT_EDIT_BG       RGB(255, 255, 255)
#define LIGHT_EDIT_BORDER   RGB(180, 180, 180)
#define LIGHT_EDIT_FOCUS    RGB(0, 95, 184)
#define EDIT_CORNER_RADIUS  4

// 按钮 hover 追踪
static HWND g_hoveredBtn = NULL;

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

static void ShowCustomDialog(void);

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

    AppendMenuW(hMenu, MF_SEPARATOR, 0, NULL);
    if (g_isChinese)
        AppendMenuW(hMenu, MF_STRING, IDM_CUSTOM, L"\x81EA\x5B9A\x4E49(&M)");
    else
        AppendMenuW(hMenu, MF_STRING, IDM_CUSTOM, L"Custo&m");

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
    case IDM_CUSTOM: ShowCustomDialog(); break;
    default:
        if (cmd >= IDM_PRESET_BASE && cmd < IDM_PRESET_BASE + g_presets.count)
        {
            int idx = cmd - IDM_PRESET_BASE;
            AdjustWindowSize(g_presets.items[idx].width, g_presets.items[idx].height, ctrlDown);
        }
        break;
    }
}

static WNDPROC g_origBtnProc = NULL;

// 输入框自绘边框子类化
static LRESULT CALLBACK EditBorderProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    LRESULT result = CallWindowProcW(g_origEditProc, hwnd, msg, wParam, lParam);

    if (msg == WM_NCPAINT || msg == WM_PAINT || msg == WM_KILLFOCUS || msg == WM_SETFOCUS)
    {
        HDC hdc = GetWindowDC(hwnd);
        if (hdc)
        {
            RECT rc;
            GetWindowRect(hwnd, &rc);
            OffsetRect(&rc, -rc.left, -rc.top);

            BOOL focused = (GetFocus() == hwnd);
            COLORREF borderColor;
            if (g_darkMode)
                borderColor = focused ? DARK_EDIT_FOCUS : DARK_EDIT_BORDER;
            else
                borderColor = focused ? LIGHT_EDIT_FOCUS : LIGHT_EDIT_BORDER;

            // 用背景色填充边框区域（清除旧边框）
            COLORREF bgColor = g_darkMode ? DARK_BG_COLOR : GetSysColor(COLOR_WINDOW);
            HBRUSH hBgBrush = CreateSolidBrush(bgColor);
            // 外框区域
            HRGN hRgnOuter = CreateRectRgn(rc.left, rc.top, rc.right, rc.bottom);
            HRGN hRgnInner = CreateRectRgn(rc.left + 2, rc.top + 2, rc.right - 2, rc.bottom - 2);
            CombineRgn(hRgnOuter, hRgnOuter, hRgnInner, RGN_DIFF);
            FillRgn(hdc, hRgnOuter, hBgBrush);
            DeleteObject(hRgnOuter);
            DeleteObject(hRgnInner);
            DeleteObject(hBgBrush);

            // 绘制圆角边框
            HPEN hPen = CreatePen(PS_SOLID, focused ? 2 : 1, borderColor);
            HPEN oldPen = (HPEN)SelectObject(hdc, hPen);
            HBRUSH oldBrush = (HBRUSH)SelectObject(hdc, GetStockObject(NULL_BRUSH));
            RoundRect(hdc, rc.left, rc.top, rc.right, rc.bottom,
                EDIT_CORNER_RADIUS * 2, EDIT_CORNER_RADIUS * 2);
            SelectObject(hdc, oldPen);
            SelectObject(hdc, oldBrush);
            DeleteObject(hPen);

            ReleaseDC(hwnd, hdc);
        }
    }

    if (msg == WM_KEYDOWN)
    {
        if (wParam == VK_ESCAPE)
        {
            DestroyWindow(GetParent(hwnd));
            return 0;
        }
        if (wParam == VK_RETURN)
        {
            BOOL ctrl = (GetKeyState(VK_CONTROL) & 0x8000) != 0;
            HWND hP = GetParent(hwnd);
            WCHAR bw[16], bh[16];
            GetDlgItemTextW(hP, IDC_EDIT_WIDTH, bw, 16);
            GetDlgItemTextW(hP, IDC_EDIT_HEIGHT, bh, 16);
            int w = (int)wcstol(bw, NULL, 10);
            int h = (int)wcstol(bh, NULL, 10);
            if (w > 0 && h > 0)
                AdjustWindowSize(w, h, ctrl);
            DestroyWindow(hP);
            return 0;
        }
    }

    return result;
}

static LRESULT CALLBACK BtnSubclassProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    switch (msg)
    {
    case WM_MOUSEMOVE:
        if (g_hoveredBtn != hwnd)
        {
            g_hoveredBtn = hwnd;
            InvalidateRect(hwnd, NULL, FALSE);
            TRACKMOUSEEVENT tme = { sizeof(tme), TME_LEAVE, hwnd, 0 };
            TrackMouseEvent(&tme);
        }
        break;
    case WM_MOUSELEAVE:
        g_hoveredBtn = NULL;
        InvalidateRect(hwnd, NULL, FALSE);
        break;
    case WM_KEYDOWN:
        if (wParam == VK_ESCAPE)
        {
            DestroyWindow(GetParent(hwnd));
            return 0;
        }
        break;
    }
    return CallWindowProcW(g_origBtnProc, hwnd, msg, wParam, lParam);
}

static LRESULT CALLBACK CustomDlgProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    switch (msg)
    {
    case WM_CREATE:
    {
        // 暗色标题栏
        if (g_darkMode)
        {
            BOOL darkTitle = TRUE;
            DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &darkTitle, sizeof(darkTitle));
        }

        HFONT hFontUI, hFontMono;
        if (g_isChinese)
            hFontUI = CreateFontW(-14, 0, 0, 0, FW_NORMAL, 0, 0, 0,
                DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Microsoft YaHei UI");
        else
            hFontUI = CreateFontW(-14, 0, 0, 0, FW_NORMAL, 0, 0, 0,
                DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
        hFontMono = CreateFontW(-14, 0, 0, 0, FW_NORMAL, 0, 0, 0,
            DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Consolas");

        int y = 10;
        HWND hCtl;
        RECT rc;
        GetWindowRect(g_targetHwnd, &rc);
        WCHAR buf[16];

        hCtl = CreateWindowW(L"STATIC", g_isChinese ? L"\x5BBD" : L"Width",
            WS_CHILD | WS_VISIBLE, 10, y, 160, 20, hwnd, NULL, g_hInstance, NULL);
        SendMessageW(hCtl, WM_SETFONT, (WPARAM)hFontUI, TRUE);
        y += 22;

        hCtl = CreateWindowExW(0, L"EDIT", L"",
            WS_CHILD | WS_VISIBLE | ES_NUMBER | WS_TABSTOP | WS_BORDER | ES_MULTILINE,
            10, y, 160, 26,
            hwnd, (HMENU)(INT_PTR)IDC_EDIT_WIDTH, g_hInstance, NULL);
        SendMessageW(hCtl, WM_SETFONT, (WPARAM)hFontMono, TRUE);
        SendMessageW(hCtl, EM_SETMARGINS, EC_LEFTMARGIN | EC_RIGHTMARGIN, MAKELPARAM(4, 4));
        {
            RECT erc = { 4, 4, 156, 22 };
            SendMessageW(hCtl, EM_SETRECT, 0, (LPARAM)&erc);
        }
        StringCchPrintfW(buf, 16, L"%d", (int)(rc.right - rc.left));
        SetWindowTextW(hCtl, buf);
        y += 32;

        hCtl = CreateWindowW(L"STATIC", g_isChinese ? L"\x9AD8" : L"Height",
            WS_CHILD | WS_VISIBLE, 10, y, 160, 20, hwnd, NULL, g_hInstance, NULL);
        SendMessageW(hCtl, WM_SETFONT, (WPARAM)hFontUI, TRUE);
        y += 22;

        hCtl = CreateWindowExW(0, L"EDIT", L"",
            WS_CHILD | WS_VISIBLE | ES_NUMBER | WS_TABSTOP | WS_BORDER | ES_MULTILINE,
            10, y, 160, 26,
            hwnd, (HMENU)(INT_PTR)IDC_EDIT_HEIGHT, g_hInstance, NULL);
        SendMessageW(hCtl, WM_SETFONT, (WPARAM)hFontMono, TRUE);
        SendMessageW(hCtl, EM_SETMARGINS, EC_LEFTMARGIN | EC_RIGHTMARGIN, MAKELPARAM(4, 4));
        {
            RECT erc = { 4, 4, 156, 22 };
            SendMessageW(hCtl, EM_SETRECT, 0, (LPARAM)&erc);
        }
        StringCchPrintfW(buf, 16, L"%d", (int)(rc.bottom - rc.top));
        SetWindowTextW(hCtl, buf);
        y += 40;

        hCtl = CreateWindowW(L"BUTTON",
            g_isChinese ? L"\x8C03\x6574\x5C3A\x5BF8" : L"Resize",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW, 10, y, 160, 28,
            hwnd, (HMENU)(INT_PTR)IDC_BTN_RESIZE, g_hInstance, NULL);
        SendMessageW(hCtl, WM_SETFONT, (WPARAM)hFontUI, TRUE);
        y += 34;

        hCtl = CreateWindowW(L"BUTTON",
            g_isChinese ? L"\x8C03\x6574\x5C3A\x5BF8\x5E76\x5C45\x4E2D" : L"Resize and Centre",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW, 10, y, 160, 28,
            hwnd, (HMENU)(INT_PTR)IDC_BTN_RESIZE_CENTRE, g_hInstance, NULL);
        SendMessageW(hCtl, WM_SETFONT, (WPARAM)hFontUI, TRUE);
        y += 34;

        hCtl = CreateWindowW(L"BUTTON",
            g_isChinese ? L"\x53D6\x6D88" : L"Cancel",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW, 10, y, 160, 28,
            hwnd, (HMENU)(INT_PTR)IDC_BTN_CANCEL, g_hInstance, NULL);
        SendMessageW(hCtl, WM_SETFONT, (WPARAM)hFontUI, TRUE);

        SetFocus(GetDlgItem(hwnd, IDC_EDIT_WIDTH));
        return 0;
    }

    case WM_CTLCOLORSTATIC:
    case WM_CTLCOLORBTN:
        if (g_darkMode)
        {
            HDC hdc = (HDC)wParam;
            SetTextColor(hdc, DARK_TEXT_COLOR);
            SetBkColor(hdc, DARK_BG_COLOR);
            return (LRESULT)g_hbrDarkBg;
        }
        break;

    case WM_CTLCOLOREDIT:
        if (g_darkMode)
        {
            HDC hdc = (HDC)wParam;
            SetTextColor(hdc, DARK_TEXT_COLOR);
            SetBkColor(hdc, DARK_EDIT_BG);
            return (LRESULT)g_hbrDarkEdit;
        }
        break;

    case WM_ERASEBKGND:
        if (g_darkMode)
        {
            RECT rc;
            GetClientRect(hwnd, &rc);
            FillRect((HDC)wParam, &rc, g_hbrDarkBg);
            return 1;
        }
        break;

    case WM_DRAWITEM:
    {
        DRAWITEMSTRUCT *dis = (DRAWITEMSTRUCT*)lParam;
        if (dis->CtlType == ODT_BUTTON)
        {
            HDC hdc = dis->hDC;
            RECT rc = dis->rcItem;
            BOOL pressed = (dis->itemState & ODS_SELECTED) != 0;
            BOOL focused = (dis->itemState & ODS_FOCUS) != 0;
            BOOL hovered = (g_hoveredBtn == dis->hwndItem);

            // 选择背景色
            COLORREF bgColor, textColor;
            if (g_darkMode)
            {
                bgColor = pressed ? DARK_BTN_PRESS : (hovered ? DARK_BTN_HOVER : DARK_BTN_BG);
                textColor = DARK_TEXT_COLOR;
            }
            else
            {
                bgColor = pressed ? LIGHT_BTN_PRESS : (hovered ? LIGHT_BTN_HOVER : LIGHT_BTN_BG);
                textColor = LIGHT_BTN_TEXT;
            }

            // 绘制圆角矩形背景
            HBRUSH hBrush = CreateSolidBrush(bgColor);
            HPEN hPen = CreatePen(PS_SOLID, 1, bgColor);
            HBRUSH oldBrush = (HBRUSH)SelectObject(hdc, hBrush);
            HPEN oldPen = (HPEN)SelectObject(hdc, hPen);
            RoundRect(hdc, rc.left, rc.top, rc.right, rc.bottom,
                BTN_CORNER_RADIUS * 2, BTN_CORNER_RADIUS * 2);
            SelectObject(hdc, oldBrush);
            SelectObject(hdc, oldPen);
            DeleteObject(hBrush);
            DeleteObject(hPen);

            // 焦点指示器（细边框）
            if (focused)
            {
                HPEN hFocusPen = CreatePen(PS_SOLID, 1,
                    g_darkMode ? RGB(100, 100, 100) : RGB(150, 150, 150));
                HPEN oldFP = (HPEN)SelectObject(hdc, hFocusPen);
                HBRUSH oldFB = (HBRUSH)SelectObject(hdc, GetStockObject(NULL_BRUSH));
                RoundRect(hdc, rc.left, rc.top, rc.right, rc.bottom,
                    BTN_CORNER_RADIUS * 2, BTN_CORNER_RADIUS * 2);
                SelectObject(hdc, oldFP);
                SelectObject(hdc, oldFB);
                DeleteObject(hFocusPen);
            }

            // 绘制文字
            WCHAR text[64];
            GetWindowTextW(dis->hwndItem, text, 64);
            SetBkMode(hdc, TRANSPARENT);
            SetTextColor(hdc, textColor);
            HFONT hFont = (HFONT)SendMessageW(dis->hwndItem, WM_GETFONT, 0, 0);
            HFONT oldFont = NULL;
            if (hFont) oldFont = (HFONT)SelectObject(hdc, hFont);
            DrawTextW(hdc, text, -1, &rc, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
            if (oldFont) SelectObject(hdc, oldFont);

            return TRUE;
        }
        break;
    }

    case WM_COMMAND:
    {
        int wmId = LOWORD(wParam);
        (void)lParam;
        if (wmId == IDC_BTN_RESIZE || wmId == IDC_BTN_RESIZE_CENTRE)
        {
            WCHAR bw[16], bh[16];
            GetDlgItemTextW(hwnd, IDC_EDIT_WIDTH, bw, 16);
            GetDlgItemTextW(hwnd, IDC_EDIT_HEIGHT, bh, 16);
            int w = (int)wcstol(bw, NULL, 10);
            int h = (int)wcstol(bh, NULL, 10);
            if (w > 0 && h > 0)
                AdjustWindowSize(w, h, (wmId == IDC_BTN_RESIZE_CENTRE));
            DestroyWindow(hwnd);
        }
        else if (wmId == IDC_BTN_CANCEL)
        {
            DestroyWindow(hwnd);
        }
        return 0;
    }

    case WM_DESTROY:
        g_hwndCustom = NULL;
        return 0;

    case WM_CLOSE:
        DestroyWindow(hwnd);
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

static void ShowCustomDialog(void)
{
    if (g_hwndCustom && IsWindow(g_hwndCustom))
    {
        SetForegroundWindow(g_hwndCustom);
        return;
    }

    static BOOL registered = FALSE;
    if (!registered)
    {
        WNDCLASSEXW wc = { sizeof(wc) };
        wc.lpfnWndProc = CustomDlgProc;
        wc.hInstance = g_hInstance;
        wc.hCursor = LoadCursor(NULL, IDC_ARROW);
        wc.hbrBackground = g_darkMode ? g_hbrDarkBg : (HBRUSH)(COLOR_WINDOW + 1);
        wc.lpszClassName = L"SizerWinCustom";
        RegisterClassExW(&wc);
        registered = TRUE;
    }

    LPCWSTR title = g_isChinese ? L"SizerWin \x81EA\x5B9A\x4E49" : L"SizerWin Custom";
    g_hwndCustom = CreateWindowExW(WS_EX_TOOLWINDOW,
        L"SizerWinCustom", title,
        WS_OVERLAPPED | WS_CAPTION,
        CW_USEDEFAULT, CW_USEDEFAULT, 196, 270,
        NULL, NULL, g_hInstance, NULL);
    if (!g_hwndCustom) return;

    HWND hEW = GetDlgItem(g_hwndCustom, IDC_EDIT_WIDTH);
    HWND hEH = GetDlgItem(g_hwndCustom, IDC_EDIT_HEIGHT);
    g_origEditProc = (WNDPROC)SetWindowLongPtrW(hEW, GWLP_WNDPROC, (LONG_PTR)EditBorderProc);
    SetWindowLongPtrW(hEH, GWLP_WNDPROC, (LONG_PTR)EditBorderProc);

    // 子类化按钮以追踪 hover
    HWND hB1 = GetDlgItem(g_hwndCustom, IDC_BTN_RESIZE);
    HWND hB2 = GetDlgItem(g_hwndCustom, IDC_BTN_RESIZE_CENTRE);
    HWND hB3 = GetDlgItem(g_hwndCustom, IDC_BTN_CANCEL);
    g_origBtnProc = (WNDPROC)SetWindowLongPtrW(hB1, GWLP_WNDPROC, (LONG_PTR)BtnSubclassProc);
    SetWindowLongPtrW(hB2, GWLP_WNDPROC, (LONG_PTR)BtnSubclassProc);
    SetWindowLongPtrW(hB3, GWLP_WNDPROC, (LONG_PTR)BtnSubclassProc);

    ShowWindow(g_hwndCustom, SW_SHOW);
    UpdateWindow(g_hwndCustom);

    RECT dlgRc, tgtRc;
    GetWindowRect(g_hwndCustom, &dlgRc);
    GetWindowRect(g_targetHwnd, &tgtRc);
    int dw = dlgRc.right - dlgRc.left, dh = dlgRc.bottom - dlgRc.top;
    int mW, mH, mL, mT, mR, mB, mIdx;
    GetCurrentMonitor(tgtRc.left, tgtRc.top, tgtRc.right-tgtRc.left,
        tgtRc.bottom-tgtRc.top, &mW, &mH, &mL, &mT, &mR, &mB, &mIdx);
    int tbOff = GetTaskbarOffset(mIdx);
    SetWindowPos(g_hwndCustom, HWND_TOPMOST,
        mL + (mW/2) - (dw/2), mT + (mH/2) - (dh/2) - tbOff, 0, 0, SWP_NOSIZE);
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
        g_hbrDarkEdit = CreateSolidBrush(DARK_EDIT_BG);
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
        // ESC 关闭自定义对话框
        if (g_hwndCustom && IsWindow(g_hwndCustom))
        {
            if (msg.message == WM_KEYDOWN && msg.wParam == VK_ESCAPE)
            {
                DestroyWindow(g_hwndCustom);
                continue;
            }
            if (IsDialogMessageW(g_hwndCustom, &msg))
                continue;
        }
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    CloseHandle(hMutex);
    return (int)msg.wParam;
}
