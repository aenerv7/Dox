#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <objidl.h>
#include <propidl.h>
#include <gdiplus.h>
#include "resource.h"

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "gdiplus.lib")

using namespace Gdiplus;

#ifndef WM_DPICHANGED
#define WM_DPICHANGED 0x02E0
#endif

#ifndef DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
DECLARE_HANDLE(DPI_AWARENESS_CONTEXT);
#define DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 ((DPI_AWARENESS_CONTEXT)-4)
#endif

#define APP_NAME L"CapsLockOSD"
#define MAIN_CLASS_NAME L"DoxCapsLockOSDMainWindow"
#define OSD_CLASS_NAME L"DoxCapsLockOSDOverlayWindow"
#define MUTEX_NAME L"Local\\DoxCapsLockOSD"
#define RUN_VALUE_NAME L"Dox CapsLockOSD"

#define TIMER_POLL 1
#define TIMER_HIDE 2

#define OSD_VERTICAL_POSITION_PERCENT 90
#define OSD_BACKGROUND_ALPHA 155
#define OSD_WINDOW_ALPHA 255

typedef enum {
    OSD_LANG_EN,
    OSD_LANG_ZH_HANS,
    OSD_LANG_ZH_HANT
} OsdLanguage;

static HINSTANCE g_instance = NULL;
static HWND g_mainHwnd = NULL;
static HWND g_osdHwnd = NULL;
static ULONG_PTR g_gdiplusToken = 0;
static HICON g_classIcon = NULL;
static HICON g_classSmallIcon = NULL;
static BOOL g_lastCapsState = FALSE;
static BOOL g_haveCapsState = FALSE;
static OsdLanguage g_language = OSD_LANG_EN;

static int ScaleForDpi(int value, UINT dpi)
{
    return MulDiv(value, (int)dpi, 96);
}

static REAL ScaleForDpiF(REAL value, UINT dpi)
{
    return value * (REAL)dpi / 96.0f;
}

static void EnableDpiAwareness(void)
{
    HMODULE user32 = GetModuleHandleW(L"user32.dll");
    typedef BOOL (WINAPI *SetProcessDpiAwarenessContextProc)(DPI_AWARENESS_CONTEXT);
    SetProcessDpiAwarenessContextProc setContext =
        user32 ? (SetProcessDpiAwarenessContextProc)GetProcAddress(user32, "SetProcessDpiAwarenessContext") : NULL;

    if (setContext && setContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2))
        return;

    typedef BOOL (WINAPI *SetProcessDPIAwareProc)(void);
    SetProcessDPIAwareProc setAware =
        user32 ? (SetProcessDPIAwareProc)GetProcAddress(user32, "SetProcessDPIAware") : NULL;
    if (setAware)
        setAware();
}

static UINT GetMonitorDpiValue(HMONITOR monitor)
{
    typedef HRESULT (WINAPI *GetDpiForMonitorProc)(HMONITOR, int, UINT *, UINT *);
    static HMODULE shcore = LoadLibraryW(L"Shcore.dll");
    static GetDpiForMonitorProc getDpiForMonitor =
        shcore ? (GetDpiForMonitorProc)GetProcAddress(shcore, "GetDpiForMonitor") : NULL;

    if (getDpiForMonitor && monitor)
    {
        UINT dpiX = 96;
        UINT dpiY = 96;
        if (SUCCEEDED(getDpiForMonitor(monitor, 0, &dpiX, &dpiY)) && dpiX)
            return dpiX;
    }

    HDC screenDc = GetDC(NULL);
    UINT dpi = screenDc ? (UINT)GetDeviceCaps(screenDc, LOGPIXELSX) : 96;
    if (screenDc)
        ReleaseDC(NULL, screenDc);
    return dpi ? dpi : 96;
}

static BOOL GetCapsLockState(void)
{
    return (GetKeyState(VK_CAPITAL) & 0x0001) != 0;
}

static OsdLanguage DetectLanguage(void)
{
    LANGID langid = GetUserDefaultUILanguage();
    if (PRIMARYLANGID(langid) != LANG_CHINESE)
        return OSD_LANG_EN;

    switch (SUBLANGID(langid))
    {
    case SUBLANG_CHINESE_TRADITIONAL:
    case SUBLANG_CHINESE_HONGKONG:
    case SUBLANG_CHINESE_MACAU:
        return OSD_LANG_ZH_HANT;
    default:
        return OSD_LANG_ZH_HANS;
    }
}

static const WCHAR *GetCapsText(BOOL capsOn)
{
    switch (g_language)
    {
    case OSD_LANG_ZH_HANS:
        return capsOn ? L"大写锁定已开启" : L"大写锁定已关闭";
    case OSD_LANG_ZH_HANT:
        return capsOn ? L"大寫鎖定已開啟" : L"大寫鎖定已關閉";
    default:
        return capsOn ? L"Caps Lock On" : L"Caps Lock Off";
    }
}

static const WCHAR *GetTextFontFace(void)
{
    switch (g_language)
    {
    case OSD_LANG_ZH_HANS:
        return L"Microsoft YaHei UI";
    case OSD_LANG_ZH_HANT:
        return L"Microsoft JhengHei UI";
    default:
        return L"Segoe UI";
    }
}

static HICON LoadAppIcon(int width, int height)
{
    HICON icon = (HICON)LoadImageW(g_instance,
                                   MAKEINTRESOURCEW(IDI_APP_ICON),
                                   IMAGE_ICON,
                                   width,
                                   height,
                                   LR_DEFAULTCOLOR | LR_SHARED);
    return icon ? icon : LoadIconW(NULL, IDI_APPLICATION);
}

static HMONITOR GetTargetMonitor(void)
{
    HWND foreground = GetForegroundWindow();
    if (foreground && foreground != g_mainHwnd && foreground != g_osdHwnd)
        return MonitorFromWindow(foreground, MONITOR_DEFAULTTONEAREST);

    POINT pt = {0};
    if (GetCursorPos(&pt))
        return MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);

    return MonitorFromWindow(g_mainHwnd, MONITOR_DEFAULTTOPRIMARY);
}

static void AddRoundedRectangle(GraphicsPath *path, const RectF &rect, REAL radius)
{
    REAL diameter = radius * 2.0f;

    path->AddArc(rect.X, rect.Y, diameter, diameter, 180.0f, 90.0f);
    path->AddArc(rect.GetRight() - diameter, rect.Y, diameter, diameter, 270.0f, 90.0f);
    path->AddArc(rect.GetRight() - diameter, rect.GetBottom() - diameter, diameter, diameter, 0.0f, 90.0f);
    path->AddArc(rect.X, rect.GetBottom() - diameter, diameter, diameter, 90.0f, 90.0f);
    path->CloseFigure();
}

static void DrawOsdToLayeredWindow(HWND hwnd, BOOL capsOn, UINT dpi, int x, int y, int width, int height)
{
    HDC screenDc = GetDC(NULL);
    if (!screenDc)
        return;

    HDC memoryDc = CreateCompatibleDC(screenDc);
    if (!memoryDc)
    {
        ReleaseDC(NULL, screenDc);
        return;
    }

    BITMAPINFO bitmapInfo = {0};
    bitmapInfo.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bitmapInfo.bmiHeader.biWidth = width;
    bitmapInfo.bmiHeader.biHeight = -height;
    bitmapInfo.bmiHeader.biPlanes = 1;
    bitmapInfo.bmiHeader.biBitCount = 32;
    bitmapInfo.bmiHeader.biCompression = BI_RGB;

    void *bits = NULL;
    HBITMAP dib = CreateDIBSection(screenDc, &bitmapInfo, DIB_RGB_COLORS, &bits, NULL, 0);
    if (!dib || !bits)
    {
        if (dib)
            DeleteObject(dib);
        DeleteDC(memoryDc);
        ReleaseDC(NULL, screenDc);
        return;
    }

    HGDIOBJ oldBitmap = SelectObject(memoryDc, dib);
    ZeroMemory(bits, (SIZE_T)width * (SIZE_T)height * 4);

    {
        Bitmap bitmap(width, height, width * 4, PixelFormat32bppPARGB, (BYTE *)bits);
        Graphics graphics(&bitmap);
        graphics.SetSmoothingMode(SmoothingModeAntiAlias);
        graphics.SetTextRenderingHint(TextRenderingHintAntiAliasGridFit);
        graphics.Clear(Color(0, 0, 0, 0));

        const REAL cornerRadius = ScaleForDpiF(12.0f, dpi);
        RectF backgroundRect(0.0f, 0.0f, (REAL)width, (REAL)height);
        GraphicsPath backgroundPath;
        AddRoundedRectangle(&backgroundPath, backgroundRect, cornerRadius);

        SolidBrush backgroundBrush(Color(OSD_BACKGROUND_ALPHA, 126, 126, 126));
        graphics.FillPath(&backgroundBrush, &backgroundPath);

        const REAL iconSize = ScaleForDpiF(52.0f, dpi);
        const REAL iconLeft = ((REAL)width - iconSize) / 2.0f;
        const REAL iconTop = ScaleForDpiF(37.0f, dpi);
        RectF iconRect(iconLeft, iconTop, iconSize, iconSize);

        GraphicsPath iconPath;
        AddRoundedRectangle(&iconPath, iconRect, ScaleForDpiF(3.0f, dpi));
        Pen iconPen(Color(255, 255, 255, 255), ScaleForDpiF(4.0f, dpi));
        graphics.DrawPath(&iconPen, &iconPath);

        FontFamily iconFamily(L"Arial");
        Font iconFont(&iconFamily, ScaleForDpiF(47.0f, dpi), FontStyleBold, UnitPixel);
        SolidBrush whiteBrush(Color(255, 255, 255, 255));
        StringFormat iconFormat;
        iconFormat.SetAlignment(StringAlignmentCenter);
        iconFormat.SetLineAlignment(StringAlignmentCenter);
        iconFormat.SetFormatFlags(StringFormatFlagsNoWrap);

        RectF iconTextRect(iconRect.X - ScaleForDpiF(1.0f, dpi),
                           iconRect.Y - ScaleForDpiF(2.0f, dpi),
                           iconRect.Width,
                           iconRect.Height + ScaleForDpiF(4.0f, dpi));
        graphics.DrawString(capsOn ? L"A" : L"a", -1, &iconFont, iconTextRect, &iconFormat, &whiteBrush);

        FontFamily textFamily(GetTextFontFace());
        Font textFont(&textFamily, ScaleForDpiF(24.0f, dpi), FontStyleRegular, UnitPixel);
        StringFormat textFormat;
        textFormat.SetAlignment(StringAlignmentCenter);
        textFormat.SetLineAlignment(StringAlignmentNear);
        textFormat.SetFormatFlags(StringFormatFlagsNoWrap);

        RectF textRect(0.0f, ScaleForDpiF(126.0f, dpi), (REAL)width, ScaleForDpiF(36.0f, dpi));
        graphics.DrawString(GetCapsText(capsOn), -1, &textFont, textRect, &textFormat, &whiteBrush);
    }

    POINT dst = {x, y};
    POINT src = {0, 0};
    SIZE size = {width, height};
    BLENDFUNCTION blend = {AC_SRC_OVER, 0, OSD_WINDOW_ALPHA, AC_SRC_ALPHA};
    UpdateLayeredWindow(hwnd, screenDc, &dst, &size, memoryDc, &src, 0, &blend, ULW_ALPHA);

    SelectObject(memoryDc, oldBitmap);
    DeleteObject(dib);
    DeleteDC(memoryDc);
    ReleaseDC(NULL, screenDc);
}

static LRESULT CALLBACK OsdWindowProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam)
{
    (void)wParam;
    (void)lParam;

    switch (message)
    {
    case WM_NCHITTEST:
        return HTTRANSPARENT;
    default:
        return DefWindowProcW(hwnd, message, wParam, lParam);
    }
}

static BOOL EnsureOsdWindow(void)
{
    if (g_osdHwnd)
        return TRUE;

    g_osdHwnd = CreateWindowExW(WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW |
                                    WS_EX_NOACTIVATE | WS_EX_TRANSPARENT,
                                OSD_CLASS_NAME, APP_NAME, WS_POPUP,
                                0, 0, 1, 1, NULL, NULL, g_instance, NULL);
    return g_osdHwnd != NULL;
}

static void ShowCapsOsd(BOOL capsOn)
{
    if (!EnsureOsdWindow())
        return;

    HMONITOR monitor = GetTargetMonitor();
    MONITORINFO monitorInfo = {0};
    monitorInfo.cbSize = sizeof(monitorInfo);
    if (!GetMonitorInfoW(monitor, &monitorInfo))
        return;

    UINT dpi = GetMonitorDpiValue(monitor);
    int width = ScaleForDpi(276, dpi);
    int height = ScaleForDpi(171, dpi);
    RECT rc = monitorInfo.rcMonitor;
    int x = rc.left + ((rc.right - rc.left) - width) / 2;
    int freeHeight = (rc.bottom - rc.top) - height;
    int y = rc.top + (freeHeight > 0 ? MulDiv(freeHeight, OSD_VERTICAL_POSITION_PERCENT, 100) : 0);

    DrawOsdToLayeredWindow(g_osdHwnd, capsOn, dpi, x, y, width, height);
    ShowWindow(g_osdHwnd, SW_SHOWNOACTIVATE);
    SetWindowPos(g_osdHwnd, HWND_TOPMOST, x, y, width, height,
                 SWP_NOACTIVATE | SWP_SHOWWINDOW);

    KillTimer(g_mainHwnd, TIMER_HIDE);
    SetTimer(g_mainHwnd, TIMER_HIDE, 1200, NULL);
}

static void HideOsd(void)
{
    if (g_osdHwnd)
        ShowWindow(g_osdHwnd, SW_HIDE);
}

static void RemoveLegacyStartupRegistration(void)
{
    HKEY key = NULL;
    if (RegOpenKeyExW(HKEY_CURRENT_USER,
                      L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                      0, KEY_SET_VALUE, &key) != ERROR_SUCCESS)
        return;

    RegDeleteValueW(key, RUN_VALUE_NAME);
    RegCloseKey(key);
}

static void CheckCapsStateAndNotify(BOOL force)
{
    BOOL state = GetCapsLockState();
    if (!g_haveCapsState)
    {
        g_haveCapsState = TRUE;
        g_lastCapsState = state;
        if (!force)
            return;
    }

    if (force || state != g_lastCapsState)
    {
        g_lastCapsState = state;
        ShowCapsOsd(state);
    }
}

static LRESULT CALLBACK MainWindowProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam)
{
    switch (message)
    {
    case WM_CREATE:
        g_mainHwnd = hwnd;
        CheckCapsStateAndNotify(FALSE);
        SetTimer(hwnd, TIMER_POLL, 50, NULL);
        return 0;

    case WM_TIMER:
        if (wParam == TIMER_POLL)
        {
            CheckCapsStateAndNotify(FALSE);
            return 0;
        }
        if (wParam == TIMER_HIDE)
        {
            KillTimer(hwnd, TIMER_HIDE);
            HideOsd();
            return 0;
        }
        break;

    case WM_DESTROY:
        KillTimer(hwnd, TIMER_POLL);
        KillTimer(hwnd, TIMER_HIDE);
        if (g_osdHwnd)
        {
            DestroyWindow(g_osdHwnd);
            g_osdHwnd = NULL;
        }
        PostQuitMessage(0);
        return 0;

    default:
        break;
    }

    return DefWindowProcW(hwnd, message, wParam, lParam);
}

static BOOL RegisterWindowClasses(void)
{
    WNDCLASSEXW mainClass = {0};
    mainClass.cbSize = sizeof(mainClass);
    mainClass.lpfnWndProc = MainWindowProc;
    mainClass.hInstance = g_instance;
    mainClass.lpszClassName = MAIN_CLASS_NAME;
    mainClass.hCursor = LoadCursorW(NULL, IDC_ARROW);
    g_classIcon = LoadAppIcon(GetSystemMetrics(SM_CXICON), GetSystemMetrics(SM_CYICON));
    g_classSmallIcon = LoadAppIcon(GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON));
    mainClass.hIcon = g_classIcon;
    mainClass.hIconSm = g_classSmallIcon;
    if (!RegisterClassExW(&mainClass))
        return FALSE;

    WNDCLASSEXW osdClass = {0};
    osdClass.cbSize = sizeof(osdClass);
    osdClass.lpfnWndProc = OsdWindowProc;
    osdClass.hInstance = g_instance;
    osdClass.lpszClassName = OSD_CLASS_NAME;
    osdClass.hCursor = LoadCursorW(NULL, IDC_ARROW);
    if (!RegisterClassExW(&osdClass))
        return FALSE;

    return TRUE;
}

int APIENTRY wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, PWSTR lpCmdLine, int nCmdShow)
{
    (void)hPrevInstance;
    (void)lpCmdLine;
    (void)nCmdShow;

    HANDLE mutex = CreateMutexW(NULL, TRUE, MUTEX_NAME);
    if (mutex && GetLastError() == ERROR_ALREADY_EXISTS)
        return 0;

    g_instance = hInstance;
    EnableDpiAwareness();
    g_language = DetectLanguage();
    RemoveLegacyStartupRegistration();

    GdiplusStartupInput gdiplusInput;
    if (GdiplusStartup(&g_gdiplusToken, &gdiplusInput, NULL) != Ok)
        return 1;

    if (!RegisterWindowClasses())
    {
        GdiplusShutdown(g_gdiplusToken);
        return 1;
    }

    HWND hwnd = CreateWindowExW(0, MAIN_CLASS_NAME, APP_NAME, WS_OVERLAPPED,
                                0, 0, 0, 0, NULL, NULL, hInstance, NULL);
    if (!hwnd)
    {
        GdiplusShutdown(g_gdiplusToken);
        return 1;
    }

    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0) > 0)
    {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    GdiplusShutdown(g_gdiplusToken);

    if (mutex)
    {
        ReleaseMutex(mutex);
        CloseHandle(mutex);
    }

    return (int)msg.wParam;
}
