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
#include <windowsx.h>
#include <commctrl.h>
#include <strsafe.h>
#include <stdlib.h>
#include <string.h>
#include <dwmapi.h>

#pragma comment(lib, "dwmapi.lib")

// DWMWA_USE_IMMERSIVE_DARK_MODE (Windows 10 20H1+)
#ifndef DWMWA_USE_IMMERSIVE_DARK_MODE
#define DWMWA_USE_IMMERSIVE_DARK_MODE 20
#endif

#define HOTKEY_ID_MENU 1

#ifndef WM_DPICHANGED
#define WM_DPICHANGED 0x02E0
#endif

#ifndef MOD_NOREPEAT
#define MOD_NOREPEAT 0x4000
#endif

#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33
#endif

#ifndef DWMWA_SYSTEMBACKDROP_TYPE
#define DWMWA_SYSTEMBACKDROP_TYPE 38
#endif

#ifndef DWMWCP_ROUND
#define DWMWCP_ROUND 2
#endif

#ifndef DWMSBT_TRANSIENTWINDOW
#define DWMSBT_TRANSIENTWINDOW 3
#endif

#ifndef DWMSBT_NONE
#define DWMSBT_NONE 1
#endif

#define IDM_AUTO        1001
#define IDM_CENTRE      1002
#define IDM_CUSTOM      1003
#define IDM_PRESET_BASE 2000  // 预设分辨率菜单项从此 ID 开始

#define IDC_WIDTH_EDIT         3001
#define IDC_HEIGHT_EDIT        3002
#define IDC_RESIZE_BUTTON      3003
#define IDC_RESIZE_CENTRE      3004
#define IDC_CANCEL_BUTTON      3005

#define WM_EDITFRAME_SETEDIT (WM_APP + 10)

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
static BOOL g_customDialogOpen = FALSE;

// 暗色模式颜色
#define DARK_BG_COLOR     RGB(32, 32, 32)
#define DARK_TEXT_COLOR   RGB(255, 255, 255)
static HBRUSH g_hbrDarkBg = NULL;

typedef struct {
    HWND hwnd;
    HWND widthEditFrame;
    HWND heightEditFrame;
    HWND widthEdit;
    HWND heightEdit;
    HWND widthLabel;
    HWND heightLabel;
    HWND resizeButton;
    HWND resizeCentreButton;
    HWND cancelButton;
    HFONT uiFont;
    HFONT monoFont;
    HBRUSH bgBrush;
    int dpi;
    int result;
    int width;
    int height;
    BOOL done;
} CustomDialogState;

typedef struct {
    HWND edit;
    HBRUSH fillBrush;
    BOOL focused;
    int dpi;
} RoundedEditFrameState;

typedef struct {
    BOOL hot;
    BOOL pressed;
    HFONT font;
} RoundedButtonState;

static int ScaleForDpi(int value, int dpi)
{
    return MulDiv(value, dpi, 96);
}

static UINT GetWindowDpiValue(HWND hwnd)
{
    typedef UINT (WINAPI *PFN_GetDpiForWindow)(HWND);
    HMODULE hUser = GetModuleHandleW(L"user32.dll");
    PFN_GetDpiForWindow fn = hUser ? (PFN_GetDpiForWindow)GetProcAddress(hUser, "GetDpiForWindow") : NULL;
    if (fn)
        return fn(hwnd);

    HDC hdc = GetDC(hwnd);
    UINT dpi = hdc ? (UINT)GetDeviceCaps(hdc, LOGPIXELSX) : 96;
    if (hdc)
        ReleaseDC(hwnd, hdc);
    return dpi ? dpi : 96;
}

static HFONT CreateDialogFont(int dpi, BOOL monospaced)
{
    LOGFONTW lf = {0};
    lf.lfHeight = -MulDiv(9, dpi, 72);
    lf.lfQuality = CLEARTYPE_QUALITY;
    StringCchCopyW(lf.lfFaceName, LF_FACESIZE, monospaced ? L"Consolas" : L"Segoe UI Variable Text");
    return CreateFontIndirectW(&lf);
}

static void ApplyDwmStyle(HWND hwnd)
{
    BOOL dark = g_darkMode;
    DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark, sizeof(dark));

    int corner = DWMWCP_ROUND;
    DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &corner, sizeof(corner));

    int backdrop = DWMSBT_NONE;
    DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, &backdrop, sizeof(backdrop));
}

static COLORREF DialogBgColor(void)
{
    return g_darkMode ? RGB(43, 43, 43) : RGB(243, 243, 243);
}

static COLORREF ControlTextColor(void)
{
    return g_darkMode ? RGB(255, 255, 255) : RGB(32, 32, 32);
}

static COLORREF EditFillColor(void)
{
    return g_darkMode ? RGB(48, 48, 48) : RGB(255, 255, 255);
}

static COLORREF EditBorderColor(BOOL focused)
{
    if (focused)
        return g_darkMode ? RGB(240, 240, 240) : RGB(0, 95, 184);
    return g_darkMode ? RGB(118, 118, 118) : RGB(196, 196, 196);
}

static COLORREF ButtonFillColor(BOOL primary, BOOL hot, BOOL pressed)
{
    (void)primary;

    if (g_darkMode)
    {
        if (pressed)
            return RGB(37, 37, 37);
        if (hot)
            return RGB(52, 52, 52);
        return RGB(43, 43, 43);
    }

    if (pressed)
        return RGB(236, 236, 236);
    if (hot)
        return RGB(246, 246, 246);
    return RGB(251, 251, 251);
}

static COLORREF ButtonBorderColor(BOOL primary, BOOL focused)
{
    if (primary || focused)
        return g_darkMode ? RGB(240, 240, 240) : RGB(0, 95, 184);
    return g_darkMode ? RGB(118, 118, 118) : RGB(214, 214, 214);
}

static void DrawRoundedRect(HDC hdc, RECT rc, int radius, COLORREF fill, COLORREF border)
{
    HBRUSH brush = CreateSolidBrush(fill);
    HPEN pen = CreatePen(PS_SOLID, 1, border);
    HGDIOBJ oldBrush = SelectObject(hdc, brush);
    HGDIOBJ oldPen = SelectObject(hdc, pen);
    RoundRect(hdc, rc.left, rc.top, rc.right, rc.bottom, radius * 2, radius * 2);
    SelectObject(hdc, oldPen);
    SelectObject(hdc, oldBrush);
    DeleteObject(pen);
    DeleteObject(brush);
}

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

static BOOL IsPermissionError(DWORD err)
{
    return err == ERROR_ACCESS_DENIED ||
        err == ERROR_PRIVILEGE_NOT_HELD ||
        err == ERROR_WRITE_PROTECT;
}

static void ShowConfigAccessError(LPCWSTR path)
{
    WCHAR message[1024];
    if (g_isChinese)
    {
        StringCchPrintfW(message, 1024,
            L"\u65E0\u6CD5\u8BFB\u53D6\u6216\u521B\u5EFA\u914D\u7F6E\u6587\u4EF6\uFF1A\r\n%ls\r\n\r\n"
            L"\u8BF7\u5C06 SizerWin \u653E\u5728\u53EF\u5199\u76EE\u5F55\uFF0C"
            L"\u6216\u4E3A\u5F53\u524D\u7528\u6237\u6388\u4E88\u7A0B\u5E8F\u76EE\u5F55\u7684\u8BFB\u5199\u6743\u9650\u3002\r\n\r\n"
            L"\u7A0B\u5E8F\u5C06\u9000\u51FA\u3002",
            path);
    }
    else
    {
        StringCchPrintfW(message, 1024,
            L"Unable to read or create the configuration file:\r\n%ls\r\n\r\n"
            L"Move SizerWin to a writable folder, or grant the current user read/write access "
            L"to the program folder.\r\n\r\n"
            L"SizerWin will exit.",
            path);
    }

    MessageBoxW(NULL, message, L"SizerWin", MB_ICONWARNING | MB_OK);
}

static BOOL GetConfigPath(WCHAR path[MAX_PATH])
{
    DWORD len = GetModuleFileNameW(NULL, path, MAX_PATH);
    if (len == 0 || len >= MAX_PATH)
        return FALSE;

    WCHAR *slash = wcsrchr(path, L'\\');
    if (!slash)
        return FALSE;

    size_t remaining = MAX_PATH - (size_t)(slash - path + 1);
    return SUCCEEDED(StringCchCopyW(slash + 1, remaining, L"SizerWin.ini"));
}

// 生成默认配置文件
static BOOL GenerateConfigFile(LPCWSTR path)
{
    HANDLE hFile = CreateFileW(path, GENERIC_WRITE, 0, NULL, CREATE_NEW, 0, NULL);
    if (hFile == INVALID_HANDLE_VALUE)
        return FALSE;

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

    DWORD written = 0;
    DWORD contentLength = (DWORD)strlen(content);
    BOOL ok = WriteFile(hFile, content, contentLength, &written, NULL) && written == contentLength;
    DWORD err = ok ? ERROR_SUCCESS : GetLastError();
    CloseHandle(hFile);
    if (!ok)
        SetLastError(err);
    return ok;
}

// 从配置文件加载预设
static BOOL LoadConfig(void)
{
    WCHAR cfgPath[MAX_PATH];
    if (!GetConfigPath(cfgPath))
    {
        LoadDefaultPresets();
        return TRUE;
    }

    // 如果配置文件不存在，生成默认配置
    DWORD attrs = GetFileAttributesW(cfgPath);
    if (attrs == INVALID_FILE_ATTRIBUTES)
    {
        DWORD attrErr = GetLastError();
        if (IsPermissionError(attrErr))
        {
            ShowConfigAccessError(cfgPath);
            return FALSE;
        }

        if (!GenerateConfigFile(cfgPath))
        {
            DWORD createErr = GetLastError();
            if (IsPermissionError(createErr))
            {
                ShowConfigAccessError(cfgPath);
                return FALSE;
            }
        }

        LoadDefaultPresets();
        return TRUE;
    }

    if ((attrs & FILE_ATTRIBUTE_DIRECTORY) != 0)
    {
        LoadDefaultPresets();
        return TRUE;
    }

    // 读取文件
    HANDLE hFile = CreateFileW(cfgPath, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
    if (hFile == INVALID_HANDLE_VALUE)
    {
        DWORD openErr = GetLastError();
        if (IsPermissionError(openErr))
        {
            ShowConfigAccessError(cfgPath);
            return FALSE;
        }
        LoadDefaultPresets();
        return TRUE;
    }

    DWORD fileSize = GetFileSize(hFile, NULL);
    if (fileSize == 0 || fileSize > 8192)
    {
        CloseHandle(hFile);
        LoadDefaultPresets();
        return TRUE;
    }

    char *buf = (char*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, fileSize + 1);
    if (!buf)
    {
        CloseHandle(hFile);
        LoadDefaultPresets();
        return TRUE;
    }

    DWORD bytesRead = 0;
    if (!ReadFile(hFile, buf, fileSize, &bytesRead, NULL))
    {
        DWORD readErr = GetLastError();
        CloseHandle(hFile);
        HeapFree(GetProcessHeap(), 0, buf);
        if (IsPermissionError(readErr))
        {
            ShowConfigAccessError(cfgPath);
            return FALSE;
        }
        LoadDefaultPresets();
        return TRUE;
    }
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
    return TRUE;
}

static BOOL GetWindowWorkArea(HWND hwnd, RECT *workArea)
{
    HMONITOR hMon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    if (!hMon)
        return FALSE;

    MONITORINFO mi = { sizeof(mi) };
    if (!GetMonitorInfoW(hMon, &mi))
        return FALSE;

    *workArea = mi.rcWork;
    return TRUE;
}

static void AdjustWindowSize(int width, int height, BOOL centre)
{
    WINDOWPLACEMENT wp = { sizeof(wp) };
    if (!g_targetHwnd || !IsWindow(g_targetHwnd)) return;
    GetWindowPlacement(g_targetHwnd, &wp);
    if (wp.showCmd != SW_SHOWNORMAL) return;

    if (centre)
    {
        RECT workArea;
        if (!GetWindowWorkArea(g_targetHwnd, &workArea)) return;
        int workW = workArea.right - workArea.left;
        int workH = workArea.bottom - workArea.top;
        int nx = workArea.left + (workW / 2) - (width / 2);
        int ny = workArea.top + (workH / 2) - (height / 2);
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
    if (wp.showCmd != SW_SHOWNORMAL) return;

    RECT workArea;
    if (!GetWindowWorkArea(g_targetHwnd, &workArea)) return;
    int workW = workArea.right - workArea.left;
    int workH = workArea.bottom - workArea.top;
    int nw = workW * 3 / 4;
    int nh = workH * 3 / 4;
    int nx = workArea.left + (workW / 2) - (nw / 2);
    int ny = workArea.top + (workH / 2) - (nh / 2);
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
    RECT workArea;
    if (!GetWindowWorkArea(g_targetHwnd, &workArea)) return;
    int workW = workArea.right - workArea.left;
    int workH = workArea.bottom - workArea.top;
    int nx = workArea.left + (workW / 2) - (ww / 2);
    int ny = workArea.top + (workH / 2) - (wh / 2);
    SetWindowPos(g_targetHwnd, NULL, nx, ny, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
}

static void LayoutEditFrameChild(HWND frame, HWND edit, int dpi)
{
    if (!frame || !edit)
        return;

    RECT rc;
    GetClientRect(frame, &rc);
    int padX = ScaleForDpi(11, dpi);
    int frameH = rc.bottom - rc.top;

    HFONT font = (HFONT)SendMessageW(edit, WM_GETFONT, 0, 0);
    HDC hdc = GetDC(edit);
    HGDIOBJ oldFont = NULL;
    TEXTMETRICW tm = {0};
    if (font)
        oldFont = SelectObject(hdc, font);
    GetTextMetricsW(hdc, &tm);
    if (oldFont)
        SelectObject(hdc, oldFont);
    ReleaseDC(edit, hdc);

    int editH = tm.tmHeight + tm.tmExternalLeading + ScaleForDpi(4, dpi);
    int y = (frameH - editH) / 2 + ScaleForDpi(2, dpi);
    if (y < 0)
        y = 0;
    if (y + editH > frameH)
        editH = frameH - y;

    MoveWindow(edit, padX, y, (rc.right - rc.left) - padX * 2, editH, TRUE);
}

static LRESULT CALLBACK RoundedEditFrameWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    RoundedEditFrameState *state = (RoundedEditFrameState*)GetWindowLongPtrW(hwnd, GWLP_USERDATA);

    switch (msg)
    {
    case WM_CREATE:
        state = (RoundedEditFrameState*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*state));
        if (!state)
            return -1;
        state->dpi = (int)GetWindowDpiValue(hwnd);
        state->fillBrush = CreateSolidBrush(EditFillColor());
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, (LONG_PTR)state);
        return 0;

    case WM_EDITFRAME_SETEDIT:
        if (state)
        {
            state->edit = (HWND)wParam;
            LayoutEditFrameChild(hwnd, state->edit, state->dpi);
        }
        return 0;

    case WM_SIZE:
        if (state)
            LayoutEditFrameChild(hwnd, state->edit, state->dpi);
        return 0;

    case WM_COMMAND:
        if (state && (HWND)lParam == state->edit)
        {
            if (HIWORD(wParam) == EN_SETFOCUS)
            {
                state->focused = TRUE;
                InvalidateRect(hwnd, NULL, TRUE);
                return 0;
            }
            if (HIWORD(wParam) == EN_KILLFOCUS)
            {
                state->focused = FALSE;
                InvalidateRect(hwnd, NULL, TRUE);
                return 0;
            }
        }
        break;

    case WM_SETFOCUS:
        if (state && state->edit)
        {
            SetFocus(state->edit);
            return 0;
        }
        break;

    case WM_ERASEBKGND:
        return 1;

    case WM_PAINT:
    {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hwnd, &ps);
        RECT rc;
        GetClientRect(hwnd, &rc);

        HBRUSH bg = CreateSolidBrush(DialogBgColor());
        FillRect(hdc, &rc, bg);
        DeleteObject(bg);

        RECT box = rc;
        box.right--;
        box.bottom--;
        DrawRoundedRect(hdc, box, ScaleForDpi(4, state ? state->dpi : 96),
            EditFillColor(), EditBorderColor(state && state->focused));
        EndPaint(hwnd, &ps);
        return 0;
    }

    case WM_CTLCOLOREDIT:
        if (state)
        {
            if (!state->fillBrush)
                state->fillBrush = CreateSolidBrush(EditFillColor());
            SetBkColor((HDC)wParam, EditFillColor());
            SetTextColor((HDC)wParam, ControlTextColor());
            return (LRESULT)state->fillBrush;
        }
        break;

    case WM_DESTROY:
        if (state)
        {
            if (state->fillBrush)
                DeleteObject(state->fillBrush);
            HeapFree(GetProcessHeap(), 0, state);
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
        }
        return 0;
    }

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

static void SendRoundedButtonClick(HWND hwnd)
{
    HWND parent = GetParent(hwnd);
    if (parent)
        SendMessageW(parent, WM_COMMAND, MAKEWPARAM(GetDlgCtrlID(hwnd), BN_CLICKED), (LPARAM)hwnd);
}

static BOOL PointInClient(HWND hwnd, POINT pt)
{
    RECT rc;
    GetClientRect(hwnd, &rc);
    return PtInRect(&rc, pt);
}

static LRESULT CALLBACK RoundedButtonWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    RoundedButtonState *state = (RoundedButtonState*)GetWindowLongPtrW(hwnd, GWLP_USERDATA);

    switch (msg)
    {
    case WM_CREATE:
        state = (RoundedButtonState*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*state));
        if (!state)
            return -1;
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, (LONG_PTR)state);
        return 0;

    case WM_SETFONT:
        if (state)
        {
            state->font = (HFONT)wParam;
            if (LOWORD(lParam))
                InvalidateRect(hwnd, NULL, TRUE);
        }
        return 0;

    case WM_GETFONT:
        return (LRESULT)(state ? state->font : NULL);

    case WM_GETDLGCODE:
        return DLGC_BUTTON | DLGC_WANTCHARS;

    case WM_MOUSEMOVE:
        if (state && !state->hot)
        {
            TRACKMOUSEEVENT tme = { sizeof(tme), TME_LEAVE, hwnd, 0 };
            TrackMouseEvent(&tme);
            state->hot = TRUE;
            InvalidateRect(hwnd, NULL, TRUE);
        }
        return 0;

    case WM_MOUSELEAVE:
        if (state)
        {
            state->hot = FALSE;
            if (GetCapture() != hwnd)
                state->pressed = FALSE;
            InvalidateRect(hwnd, NULL, TRUE);
        }
        return 0;

    case WM_LBUTTONDOWN:
        if (state)
        {
            SetFocus(hwnd);
            SetCapture(hwnd);
            state->pressed = TRUE;
            InvalidateRect(hwnd, NULL, TRUE);
        }
        return 0;

    case WM_LBUTTONUP:
        if (state)
        {
            POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
            BOOL click = state->pressed && PointInClient(hwnd, pt);
            state->pressed = FALSE;
            if (GetCapture() == hwnd)
                ReleaseCapture();
            InvalidateRect(hwnd, NULL, TRUE);
            if (click)
                SendRoundedButtonClick(hwnd);
        }
        return 0;

    case WM_KEYDOWN:
        if (state && wParam == VK_SPACE)
        {
            state->pressed = TRUE;
            InvalidateRect(hwnd, NULL, TRUE);
            return 0;
        }
        if (wParam == VK_RETURN)
        {
            SendRoundedButtonClick(hwnd);
            return 0;
        }
        break;

    case WM_KEYUP:
        if (state && wParam == VK_SPACE)
        {
            BOOL click = state->pressed;
            state->pressed = FALSE;
            InvalidateRect(hwnd, NULL, TRUE);
            if (click)
                SendRoundedButtonClick(hwnd);
            return 0;
        }
        break;

    case WM_SETFOCUS:
    case WM_KILLFOCUS:
        InvalidateRect(hwnd, NULL, TRUE);
        return 0;

    case WM_ERASEBKGND:
        return 1;

    case WM_PAINT:
    {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hwnd, &ps);
        RECT rc;
        GetClientRect(hwnd, &rc);
        int dpi = (int)GetWindowDpiValue(hwnd);
        BOOL primary = GetDlgCtrlID(hwnd) == IDC_RESIZE_BUTTON;
        BOOL focused = GetFocus() == hwnd;

        HBRUSH bg = CreateSolidBrush(DialogBgColor());
        FillRect(hdc, &rc, bg);
        DeleteObject(bg);

        RECT box = rc;
        box.right--;
        box.bottom--;
        DrawRoundedRect(hdc, box, ScaleForDpi(4, dpi),
            ButtonFillColor(primary, state && state->hot, state && state->pressed),
            ButtonBorderColor(primary, focused));

        WCHAR text[128];
        GetWindowTextW(hwnd, text, 128);
        SetBkMode(hdc, TRANSPARENT);
        SetTextColor(hdc, ControlTextColor());

        HGDIOBJ oldFont = NULL;
        if (state && state->font)
            oldFont = SelectObject(hdc, state->font);

        DrawTextW(hdc, text, -1, &rc, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);

        if (focused)
        {
            RECT focusRect = rc;
            InflateRect(&focusRect, -ScaleForDpi(7, dpi), -ScaleForDpi(5, dpi));
            DrawFocusRect(hdc, &focusRect);
        }

        if (oldFont)
            SelectObject(hdc, oldFont);
        EndPaint(hwnd, &ps);
        return 0;
    }

    case WM_DESTROY:
        if (state)
        {
            HeapFree(GetProcessHeap(), 0, state);
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
        }
        return 0;
    }

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

static void GetCustomDialogClientSize(int dpi, int *width, int *height)
{
    *width = ScaleForDpi(300, dpi);
    *height = ScaleForDpi(316, dpi);
}

static void GetCustomDialogWindowSize(DWORD style, DWORD exStyle, int dpi, int *width, int *height)
{
    typedef BOOL (WINAPI *PFN_AdjustWindowRectExForDpi)(LPRECT, DWORD, BOOL, DWORD, UINT);
    RECT rc = {0};
    int clientW = 0;
    int clientH = 0;
    GetCustomDialogClientSize(dpi, &clientW, &clientH);
    rc.right = clientW;
    rc.bottom = clientH;

    HMODULE hUser = GetModuleHandleW(L"user32.dll");
    PFN_AdjustWindowRectExForDpi fn =
        hUser ? (PFN_AdjustWindowRectExForDpi)GetProcAddress(hUser, "AdjustWindowRectExForDpi") : NULL;
    if (fn)
        fn(&rc, style, FALSE, exStyle, (UINT)dpi);
    else
        AdjustWindowRectEx(&rc, style, FALSE, exStyle);

    *width = rc.right - rc.left;
    *height = rc.bottom - rc.top;
}

static void SetControlFont(HWND hwnd, HFONT font)
{
    if (hwnd && font)
        SendMessageW(hwnd, WM_SETFONT, (WPARAM)font, TRUE);
}

static void RefreshCustomDialogFonts(CustomDialogState *state)
{
    if (state->uiFont)
        DeleteObject(state->uiFont);
    if (state->monoFont)
        DeleteObject(state->monoFont);

    state->uiFont = CreateDialogFont(state->dpi, FALSE);
    state->monoFont = CreateDialogFont(state->dpi, FALSE);

    SetControlFont(state->widthLabel, state->uiFont);
    SetControlFont(state->heightLabel, state->uiFont);
    SetControlFont(state->widthEdit, state->monoFont);
    SetControlFont(state->heightEdit, state->monoFont);
    SetControlFont(state->resizeButton, state->uiFont);
    SetControlFont(state->resizeCentreButton, state->uiFont);
    SetControlFont(state->cancelButton, state->uiFont);
}

static void RefreshCustomDialogBrush(CustomDialogState *state)
{
    if (state->bgBrush)
        DeleteObject(state->bgBrush);
    state->bgBrush = CreateSolidBrush(DialogBgColor());
}

static void LayoutCustomDialog(CustomDialogState *state)
{
    int margin = ScaleForDpi(24, state->dpi);
    int labelH = ScaleForDpi(18, state->dpi);
    int editH = ScaleForDpi(36, state->dpi);
    int labelGap = ScaleForDpi(6, state->dpi);
    int rowGap = ScaleForDpi(14, state->dpi);
    int buttonGap = ScaleForDpi(8, state->dpi);
    int buttonH = ScaleForDpi(34, state->dpi);
    int clientW, clientH;
    GetCustomDialogClientSize(state->dpi, &clientW, &clientH);
    (void)clientH;

    int contentW = clientW - margin * 2;
    int y = margin;

    MoveWindow(state->widthLabel, margin, y, contentW, labelH, TRUE);
    y += labelH + labelGap;
    MoveWindow(state->widthEditFrame, margin, y, contentW, editH, TRUE);
    LayoutEditFrameChild(state->widthEditFrame, state->widthEdit, state->dpi);
    y += editH + rowGap;

    MoveWindow(state->heightLabel, margin, y, contentW, labelH, TRUE);
    y += labelH + labelGap;
    MoveWindow(state->heightEditFrame, margin, y, contentW, editH, TRUE);
    LayoutEditFrameChild(state->heightEditFrame, state->heightEdit, state->dpi);
    y += editH + ScaleForDpi(24, state->dpi);

    MoveWindow(state->resizeButton, margin, y, contentW, buttonH, TRUE);
    y += buttonH + buttonGap;
    MoveWindow(state->resizeCentreButton, margin, y, contentW, buttonH, TRUE);
    y += buttonH + buttonGap;
    MoveWindow(state->cancelButton, margin, y, contentW, buttonH, TRUE);
}

static BOOL ReadCustomDialogNumber(HWND edit, int *value)
{
    WCHAR text[32];
    GetWindowTextW(edit, text, 32);

    WCHAR *end = NULL;
    long parsed = wcstol(text, &end, 10);
    if (end == text || parsed <= 0 || parsed > 32767)
    {
        MessageBeep(MB_ICONWARNING);
        SetFocus(edit);
        SendMessageW(edit, EM_SETSEL, 0, -1);
        return FALSE;
    }

    *value = (int)parsed;
    return TRUE;
}

static void FinishCustomDialog(CustomDialogState *state, int result)
{
    state->result = result;
    state->done = TRUE;
    DestroyWindow(state->hwnd);
}

static void SubmitCustomDialog(CustomDialogState *state, BOOL centre)
{
    int width = 0;
    int height = 0;
    if (!ReadCustomDialogNumber(state->widthEdit, &width) ||
        !ReadCustomDialogNumber(state->heightEdit, &height))
        return;

    state->width = width;
    state->height = height;
    FinishCustomDialog(state, centre ? 2 : 1);
}

static LRESULT CALLBACK CustomDialogWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    CustomDialogState *state = (CustomDialogState*)GetWindowLongPtrW(hwnd, GWLP_USERDATA);

    switch (msg)
    {
    case WM_CREATE:
    {
        CREATESTRUCTW *cs = (CREATESTRUCTW*)lParam;
        state = (CustomDialogState*)cs->lpCreateParams;
        state->hwnd = hwnd;
        state->dpi = (int)GetWindowDpiValue(hwnd);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, (LONG_PTR)state);

        ApplyDwmStyle(hwnd);
        RefreshCustomDialogBrush(state);

        state->widthLabel = CreateWindowExW(0, L"STATIC",
            g_isChinese ? L"\u5BBD\u5EA6" : L"Width",
            WS_CHILD | WS_VISIBLE, 0, 0, 0, 0, hwnd, NULL, g_hInstance, NULL);
        state->widthEditFrame = CreateWindowExW(0, L"SizerWinRoundedEditFrame", L"",
            WS_CHILD | WS_VISIBLE, 0, 0, 0, 0, hwnd, NULL, g_hInstance, NULL);
        state->widthEdit = CreateWindowExW(0, L"EDIT", L"",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | ES_NUMBER | ES_AUTOHSCROLL,
            0, 0, 0, 0, state->widthEditFrame, (HMENU)IDC_WIDTH_EDIT, g_hInstance, NULL);
        state->heightLabel = CreateWindowExW(0, L"STATIC",
            g_isChinese ? L"\u9AD8\u5EA6" : L"Height",
            WS_CHILD | WS_VISIBLE, 0, 0, 0, 0, hwnd, NULL, g_hInstance, NULL);
        state->heightEditFrame = CreateWindowExW(0, L"SizerWinRoundedEditFrame", L"",
            WS_CHILD | WS_VISIBLE, 0, 0, 0, 0, hwnd, NULL, g_hInstance, NULL);
        state->heightEdit = CreateWindowExW(0, L"EDIT", L"",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | ES_NUMBER | ES_AUTOHSCROLL,
            0, 0, 0, 0, state->heightEditFrame, (HMENU)IDC_HEIGHT_EDIT, g_hInstance, NULL);
        state->resizeButton = CreateWindowExW(0, L"SizerWinRoundedButton",
            g_isChinese ? L"\u8C03\u6574\u5C3A\u5BF8" : L"Resize",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP,
            0, 0, 0, 0, hwnd, (HMENU)IDC_RESIZE_BUTTON, g_hInstance, NULL);
        state->resizeCentreButton = CreateWindowExW(0, L"SizerWinRoundedButton",
            g_isChinese ? L"\u8C03\u6574\u5E76\u5C45\u4E2D" : L"Resize and Centre",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP,
            0, 0, 0, 0, hwnd, (HMENU)IDC_RESIZE_CENTRE, g_hInstance, NULL);
        state->cancelButton = CreateWindowExW(0, L"SizerWinRoundedButton",
            g_isChinese ? L"\u53D6\u6D88" : L"Cancel",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP,
            0, 0, 0, 0, hwnd, (HMENU)IDC_CANCEL_BUTTON, g_hInstance, NULL);

        WCHAR text[32];
        StringCchPrintfW(text, 32, L"%d", state->width);
        SetWindowTextW(state->widthEdit, text);
        StringCchPrintfW(text, 32, L"%d", state->height);
        SetWindowTextW(state->heightEdit, text);
        SendMessageW(state->widthEdit, EM_SETMARGINS, EC_LEFTMARGIN | EC_RIGHTMARGIN, 0);
        SendMessageW(state->heightEdit, EM_SETMARGINS, EC_LEFTMARGIN | EC_RIGHTMARGIN, 0);
        SendMessageW(state->widthEditFrame, WM_EDITFRAME_SETEDIT, (WPARAM)state->widthEdit, 0);
        SendMessageW(state->heightEditFrame, WM_EDITFRAME_SETEDIT, (WPARAM)state->heightEdit, 0);

        RefreshCustomDialogFonts(state);
        LayoutCustomDialog(state);
        return 0;
    }

    case WM_COMMAND:
        if (state && HIWORD(wParam) == BN_CLICKED)
        {
            switch (LOWORD(wParam))
            {
            case IDC_RESIZE_BUTTON:
                SubmitCustomDialog(state, FALSE);
                return 0;
            case IDC_RESIZE_CENTRE:
                SubmitCustomDialog(state, TRUE);
                return 0;
            case IDC_CANCEL_BUTTON:
                FinishCustomDialog(state, 0);
                return 0;
            }
        }
        break;

    case WM_CLOSE:
        if (state)
        {
            FinishCustomDialog(state, 0);
            return 0;
        }
        break;

    case WM_DPICHANGED:
        if (state)
        {
            RECT *suggested = (RECT*)lParam;
            state->dpi = HIWORD(wParam);
            RefreshCustomDialogBrush(state);
            RefreshCustomDialogFonts(state);
            SetWindowPos(hwnd, NULL, suggested->left, suggested->top,
                suggested->right - suggested->left,
                suggested->bottom - suggested->top,
                SWP_NOZORDER | SWP_NOACTIVATE);
            LayoutCustomDialog(state);
            return 0;
        }
        break;

    case WM_ERASEBKGND:
        if (state && state->bgBrush)
        {
            RECT rc;
            GetClientRect(hwnd, &rc);
            FillRect((HDC)wParam, &rc, state->bgBrush);
            return 1;
        }
        break;

    case WM_CTLCOLORSTATIC:
        if (state)
        {
            SetBkMode((HDC)wParam, TRANSPARENT);
            SetTextColor((HDC)wParam, g_darkMode ? RGB(255, 255, 255) : RGB(32, 32, 32));
            return (LRESULT)state->bgBrush;
        }
        break;

    case WM_CTLCOLOREDIT:
        if (state && g_darkMode)
        {
            SetBkColor((HDC)wParam, RGB(42, 42, 42));
            SetTextColor((HDC)wParam, RGB(255, 255, 255));
            return (LRESULT)state->bgBrush;
        }
        break;

    case WM_NCDESTROY:
        if (state)
        {
            if (state->uiFont)
                DeleteObject(state->uiFont);
            if (state->monoFont)
                DeleteObject(state->monoFont);
            if (state->bgBrush)
                DeleteObject(state->bgBrush);
            state->uiFont = NULL;
            state->monoFont = NULL;
            state->bgBrush = NULL;
            state->done = TRUE;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
        }
        break;
    }

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

static BOOL RegisterCustomDialogClass(void)
{
    WNDCLASSEXW frame = { sizeof(frame) };
    frame.lpfnWndProc = RoundedEditFrameWndProc;
    frame.hInstance = g_hInstance;
    frame.hCursor = LoadCursorW(NULL, IDC_IBEAM);
    frame.lpszClassName = L"SizerWinRoundedEditFrame";
    if (!RegisterClassExW(&frame) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
        return FALSE;

    WNDCLASSEXW button = { sizeof(button) };
    button.lpfnWndProc = RoundedButtonWndProc;
    button.hInstance = g_hInstance;
    button.hCursor = LoadCursorW(NULL, IDC_HAND);
    button.lpszClassName = L"SizerWinRoundedButton";
    if (!RegisterClassExW(&button) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
        return FALSE;

    WNDCLASSEXW wc = { sizeof(wc) };
    wc.lpfnWndProc = CustomDialogWndProc;
    wc.hInstance = g_hInstance;
    wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
    wc.lpszClassName = L"SizerWinCustomDialog";

    if (RegisterClassExW(&wc))
        return TRUE;
    return GetLastError() == ERROR_CLASS_ALREADY_EXISTS;
}

static BOOL HandleCustomDialogShortcut(CustomDialogState *state, MSG *msg)
{
    if (!state || msg->message != WM_KEYDOWN)
        return FALSE;

    HWND focus = GetFocus();
    if (focus != state->hwnd && !IsChild(state->hwnd, focus))
        return FALSE;

    if (msg->wParam == VK_TAB)
    {
        HWND order[] = {
            state->widthEdit,
            state->heightEdit,
            state->resizeButton,
            state->resizeCentreButton,
            state->cancelButton
        };
        int count = (int)(sizeof(order) / sizeof(order[0]));
        int current = 0;
        for (int i = 0; i < count; i++)
        {
            if (focus == order[i])
            {
                current = i;
                break;
            }
        }

        BOOL reverse = (GetKeyState(VK_SHIFT) & 0x8000) != 0;
        int next = reverse ? (current + count - 1) % count : (current + 1) % count;
        SetFocus(order[next]);
        if (order[next] == state->widthEdit || order[next] == state->heightEdit)
            SendMessageW(order[next], EM_SETSEL, 0, -1);
        return TRUE;
    }

    if (msg->wParam == VK_ESCAPE)
    {
        FinishCustomDialog(state, 0);
        return TRUE;
    }

    if (msg->wParam == VK_RETURN)
    {
        BOOL isEdit = focus == state->widthEdit || focus == state->heightEdit;
        BOOL isButton = focus == state->resizeButton ||
            focus == state->resizeCentreButton ||
            focus == state->cancelButton;
        BOOL ctrlDown = (GetKeyState(VK_CONTROL) & 0x8000) != 0;
        if (isButton && !ctrlDown)
        {
            SendRoundedButtonClick(focus);
            return TRUE;
        }
        if (ctrlDown || isEdit)
        {
            SubmitCustomDialog(state, ctrlDown);
            return TRUE;
        }
    }

    return FALSE;
}

static void ShowCustomDialog(void)
{
    if (!g_targetHwnd || !IsWindow(g_targetHwnd) || !RegisterCustomDialogClass())
        return;

    WINDOWPLACEMENT wp = { sizeof(wp) };
    GetWindowPlacement(g_targetHwnd, &wp);
    if (wp.showCmd != SW_SHOWNORMAL)
        return;

    RECT targetRect;
    GetWindowRect(g_targetHwnd, &targetRect);

    CustomDialogState state = {0};
    state.width = targetRect.right - targetRect.left;
    state.height = targetRect.bottom - targetRect.top;

    int dpi = (int)GetWindowDpiValue(g_targetHwnd);
    DWORD style = WS_POPUP | WS_CAPTION | WS_BORDER;
    DWORD exStyle = WS_EX_DLGMODALFRAME;
    int dialogW, dialogH;
    GetCustomDialogWindowSize(style, exStyle, dpi, &dialogW, &dialogH);

    RECT workArea;
    if (!GetWindowWorkArea(g_targetHwnd, &workArea))
        SystemParametersInfoW(SPI_GETWORKAREA, 0, &workArea, 0);

    int x = workArea.left + ((workArea.right - workArea.left) - dialogW) / 2;
    int y = workArea.top + ((workArea.bottom - workArea.top) - dialogH) / 2;

    HWND hwnd = CreateWindowExW(exStyle, L"SizerWinCustomDialog",
        g_isChinese ? L"SizerWin \u81EA\u5B9A\u4E49" : L"SizerWin Custom",
        style, x, y, dialogW, dialogH, NULL, NULL, g_hInstance, &state);
    if (!hwnd)
        return;

    g_customDialogOpen = TRUE;
    ShowWindow(hwnd, SW_SHOWNORMAL);
    UpdateWindow(hwnd);
    SetForegroundWindow(hwnd);
    SetFocus(state.widthEdit);
    SendMessageW(state.widthEdit, EM_SETSEL, 0, -1);

    MSG msg;
    while (!state.done && GetMessageW(&msg, NULL, 0, 0) > 0)
    {
        if (HandleCustomDialogShortcut(&state, &msg))
            continue;
        if (!IsDialogMessageW(hwnd, &msg))
        {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
    g_customDialogOpen = FALSE;

    if (state.done && state.result != 0 && g_targetHwnd && IsWindow(g_targetHwnd))
        AdjustWindowSize(state.width, state.height, state.result == 2);
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
    if (!LoadConfig())
    {
        PostQuitMessage(1);
        return;
    }

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
    AppendMenuW(hMenu, MF_STRING, IDM_CUSTOM,
        g_isChinese ? L"\u81EA\u5B9A\u4E49(&M)" : L"Custo&m");

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

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    switch (msg)
    {
    case WM_HOTKEY:
        if (wParam == HOTKEY_ID_MENU && !g_customDialogOpen)
            ShowSizerMenu();
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

    INITCOMMONCONTROLSEX icc = { sizeof(icc), ICC_STANDARD_CLASSES };
    InitCommonControlsEx(&icc);

    if (!LoadConfig())
    {
        CloseHandle(hMutex);
        return 1;
    }

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

    if (!RegisterHotKey(g_hwndMain, HOTKEY_ID_MENU, MOD_SHIFT | MOD_ALT | MOD_NOREPEAT, VK_SPACE))
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
