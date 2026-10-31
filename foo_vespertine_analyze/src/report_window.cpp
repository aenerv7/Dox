//
// foo_vespertine_analyze — 报告窗口。
//
// 一个包含一个列表和一个文本面板的非模态窗口：
//
//   路径                          | 声称是             | 实际是
//   ---------------------------------------------------------------
//   C:\music\album\01 track.flac  | FLAC 24-bit / 96 kHz / 2 ch | FLAC 16-bit / 96 kHz / 2 ch
//
//   （下方是所选行的详细信息）
//
// SPDX-License-Identifier: GPL-3.0-or-later
//
#include "report_window.h"

#include "scan.h"
#include "spectrum_view.h"

#include <SDK/coreDarkMode.h>

#include <commctrl.h>

namespace vesper {

namespace {

constexpr wchar_t kClassName[] = L"foo_vespertine_analyze_report";
constexpr wchar_t kSpectrumClass[] = L"foo_vespertine_analyze_spectrum";
constexpr int kPadding = 8;
constexpr int kMinDetailHeight = 140;
// 控件 ID：暗色钩子可能把 ListView 换成 fb2k 自己的列表控件（新 HWND），
// 换掉之后只能靠 ID 重新取回句柄。
constexpr int kListId = 1001;


HWND g_window = nullptr;
HWND g_list = nullptr;
HWND g_detail = nullptr;
HWND g_spectrum = nullptr;
bool g_detailVisible = false;
int g_selectedRow = -1;

fb2k::CCoreDarkModeHooks* g_dark = nullptr;
HBRUSH g_darkBrush = nullptr;

bool isDark() { return g_dark != nullptr && static_cast<bool>(*g_dark); }

HBRUSH darkBrush() {
    if (g_darkBrush == nullptr) g_darkBrush = CreateSolidBrush(RGB(32, 32, 32));
    return g_darkBrush;
}

//! 跟随系统的对话框字体；GetStockObject(DEFAULT_GUI_FONT) 是非 ClearType 的
//! 老式位图字体，和 foobar2000 其余界面不一致。
HFONT uiFont() {
    static HFONT font = nullptr;
    if (font == nullptr) {
        NONCLIENTMETRICSW metrics{};
        metrics.cbSize = sizeof(metrics);
        if (SystemParametersInfoW(SPI_GETNONCLIENTMETRICS, sizeof(metrics), &metrics, 0)) {
            font = CreateFontIndirectW(&metrics.lfMessageFont);
        }
        if (font == nullptr) font = static_cast<HFONT>(GetStockObject(DEFAULT_GUI_FONT));
    }
    return font;
}

//! 列标题跟正文同族同字号，只加粗。
HFONT headerFont() {
    static HFONT font = nullptr;
    if (font == nullptr) {
        NONCLIENTMETRICSW metrics{};
        metrics.cbSize = sizeof(metrics);
        LOGFONTW lf{};
        if (SystemParametersInfoW(SPI_GETNONCLIENTMETRICS, sizeof(metrics), &metrics, 0)) {
            lf = metrics.lfMessageFont;
        } else {
            lf.lfHeight = -12;
            lf.lfCharSet = DEFAULT_CHARSET;
        }
        lf.lfWeight = FW_BOLD;
        font = CreateFontIndirectW(&lf);
        if (font == nullptr) font = uiFont();
    }
    return font;
}

// ---------------------------------------------------------------- 长期频谱图

SpectrumColors spectrumColors() {
    SpectrumColors colors;
    colors.background = isDark() ? RGB(32, 32, 32) : GetSysColor(COLOR_WINDOW);
    colors.text = isDark() ? RGB(230, 230, 230) : GetSysColor(COLOR_WINDOWTEXT);
    colors.grid = isDark() ? RGB(64, 64, 64) : RGB(222, 222, 222);
    colors.curve = isDark() ? RGB(110, 170, 255) : RGB(40, 110, 210);
    colors.fill = isDark() ? RGB(44, 62, 92) : RGB(206, 221, 240);
    return colors;
}

void paintSpectrum(HDC dc, RECT rc) {
    const std::vector<ReportRow>& rows = lastReport();
    const bool hasRow = g_selectedRow >= 0 && static_cast<size_t>(g_selectedRow) < rows.size();
    const FileAnalysis* analysis =
        hasRow ? &rows[static_cast<size_t>(g_selectedRow)].analysis : nullptr;
    drawSpectrum(dc, rc, analysis, uiFont(), spectrumColors());
}
LRESULT CALLBACK spectrumProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
    switch (message) {
    case WM_PAINT: {
        PAINTSTRUCT paint{};
        HDC dc = BeginPaint(window, &paint);
        RECT rc{};
        GetClientRect(window, &rc);
        paintSpectrum(dc, rc);
        EndPaint(window, &paint);
        return 0;
    }

    case WM_ERASEBKGND:
        return 1;

    default:
        break;
    }
    return DefWindowProcW(window, message, wparam, lparam);
}

void registerSpectrumClass() {
    static bool registered = false;
    if (registered) return;
    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = spectrumProc;
    wc.hInstance = core_api::get_my_instance();
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    wc.hbrBackground = nullptr;
    wc.lpszClassName = kSpectrumClass;
    RegisterClassExW(&wc);
    registered = true;
}

//! 编辑控件要求 CRLF；而报告文本用的是 LF。
std::wstring toEditText(std::string const& text) {
    std::string converted;
    converted.reserve(text.size() + text.size() / 8);
    for (const char c : text) {
        if (c == '\n') converted += '\r';
        converted += c;
    }
    return toWide(converted);
}

void layoutColumns() {
    if (g_list == nullptr) return;
    RECT rc{};
    GetClientRect(g_list, &rc);
    const int width = rc.right - rc.left;
    if (width <= 0) return;
    ListView_SetColumnWidth(g_list, 0, width * 45 / 100);
    ListView_SetColumnWidth(g_list, 1, width * 22 / 100);
    ListView_SetColumnWidth(g_list, 2, width * 33 / 100);
}

void layoutChildren() {
    if (g_window == nullptr) return;
    RECT rc{};
    GetClientRect(g_window, &rc);
    const int width = rc.right - rc.left;
    const int height = rc.bottom - rc.top;

    // 没有选中行时详情框不占地方，列表铺满整个客户区。
    if (!g_detailVisible) {
        MoveWindow(g_list, kPadding, kPadding, width - 2 * kPadding, height - 2 * kPadding, TRUE);
        layoutColumns();
        return;
    }

    // 下半区：上面是文字说明，下面是长期频谱图。
    int detailHeight = height / 2;
    if (detailHeight < 280) detailHeight = 280;
    if (detailHeight > height - 160) detailHeight = height - 160;
    if (detailHeight < kMinDetailHeight) detailHeight = kMinDetailHeight;

    const int listHeight = height - detailHeight - 3 * kPadding;
    const int detailTop = kPadding * 2 + (listHeight > 0 ? listHeight : 0);
    MoveWindow(g_list, kPadding, kPadding, width - 2 * kPadding, listHeight > 0 ? listHeight : 0, TRUE);

    const int textHeight = detailHeight * 2 / 5;
    MoveWindow(g_detail, kPadding, detailTop, width - 2 * kPadding, textHeight, TRUE);
    MoveWindow(g_spectrum, kPadding, detailTop + textHeight + kPadding / 2, width - 2 * kPadding,
               detailHeight - textHeight - kPadding / 2, TRUE);
    layoutColumns();
}

void applyColors() {
    if (g_list == nullptr) return;
    if (isDark()) {
        ListView_SetBkColor(g_list, RGB(32, 32, 32));
        ListView_SetTextBkColor(g_list, RGB(32, 32, 32));
        ListView_SetTextColor(g_list, RGB(230, 230, 230));
    } else {
        ListView_SetBkColor(g_list, GetSysColor(COLOR_WINDOW));
        ListView_SetTextBkColor(g_list, GetSysColor(COLOR_WINDOW));
        ListView_SetTextColor(g_list, GetSysColor(COLOR_WINDOWTEXT));
    }
    InvalidateRect(g_list, nullptr, TRUE);
    InvalidateRect(g_detail, nullptr, TRUE);
}

void updateDetail(int index) {
    if (g_detail == nullptr) return;
    std::vector<ReportRow> const& rows = lastReport();
    const bool hasRow = index >= 0 && static_cast<size_t>(index) < rows.size();
    g_selectedRow = hasRow ? index : -1;
    if (hasRow) {
        const std::wstring text = toEditText(detailText(rows[static_cast<size_t>(index)]));
        SetWindowTextW(g_detail, text.c_str());
        // 较长的摘要不应在面板顶部被截断。
        SendMessageW(g_detail, EM_SETSEL, 0, 0);
    } else {
        SetWindowTextW(g_detail, L"");
    }
    if (g_spectrum != nullptr) InvalidateRect(g_spectrum, nullptr, TRUE);
    if (g_detailVisible != hasRow) {
        g_detailVisible = hasRow;
        ShowWindow(g_detail, hasRow ? SW_SHOW : SW_HIDE);
        ShowWindow(g_spectrum, hasRow ? SW_SHOW : SW_HIDE);
        layoutChildren();
    }
}

//! 写第 subItem 列。用 LVM_SETITEM 而不是 LVM_SETITEMTEXT：后者不在 fb2k
//! 暗色钩子替换出来的列表控件支持的消息里。
void setSubItem(int index, int subItem, std::wstring const& text) {
    LVITEMW item{};
    item.mask = LVIF_TEXT;
    item.iItem = index;
    item.iSubItem = subItem;
    item.pszText = const_cast<wchar_t*>(text.c_str());
    ListView_SetItem(g_list, &item);
}

void fillList() {
    if (g_list == nullptr) return;
    SendMessageW(g_list, WM_SETREDRAW, FALSE, 0);
    ListView_DeleteAllItems(g_list);

    std::vector<ReportRow> const& rows = lastReport();
    int index = 0;
    for (ReportRow const& row : rows) {
        const std::wstring path = toWide(row.path);
        LVITEMW item{};
        item.mask = LVIF_TEXT | LVIF_PARAM;
        item.iItem = index;
        item.iSubItem = 0;
        item.pszText = const_cast<wchar_t*>(path.c_str());
        item.lParam = index;
        ListView_InsertItem(g_list, &item);

        const std::wstring claimed = toWide(claimedText(row.claim));
        const std::wstring actual = toWide(actualText(row));
        setSubItem(index, 1, claimed);
        setSubItem(index, 2, actual);
        ++index;
    }

    SendMessageW(g_list, WM_SETREDRAW, TRUE, 0);
    InvalidateRect(g_list, nullptr, TRUE);
    layoutColumns();

    if (!rows.empty()) {
        ListView_SetItemState(g_list, 0, LVIS_SELECTED | LVIS_FOCUSED, LVIS_SELECTED | LVIS_FOCUSED);
        ListView_EnsureVisible(g_list, 0, FALSE);
        updateDetail(0);
    } else {
        updateDetail(-1);
    }
}

void createChildControls() {
    g_list = CreateWindowExW(WS_EX_CLIENTEDGE, WC_LISTVIEWW, L"",
                             WS_CHILD | WS_VISIBLE | WS_TABSTOP | LVS_REPORT | LVS_SINGLESEL |
                                 LVS_SHOWSELALWAYS,
                             0, 0, 0, 0, g_window,
                             reinterpret_cast<HMENU>(static_cast<INT_PTR>(kListId)),
                             core_api::get_my_instance(), nullptr);
    // 边框用 WS_EX_STATICEDGE：暗色钩子替换出来的列表控件就是这个边框，
    // WS_EX_CLIENTEDGE 在深色背景上会画成一圈又粗又亮的槽。
    g_detail = CreateWindowExW(WS_EX_STATICEDGE, L"EDIT", L"",
                               WS_CHILD | WS_VISIBLE | WS_TABSTOP | ES_MULTILINE | ES_READONLY |
                                   ES_AUTOVSCROLL | WS_VSCROLL,
                               0, 0, 0, 0, g_window, nullptr, core_api::get_my_instance(), nullptr);
    SendMessageW(g_detail, EM_SETLIMITTEXT, 0, 0);
    SendMessageW(g_detail, WM_SETFONT, reinterpret_cast<WPARAM>(uiFont()), TRUE);
    ShowWindow(g_detail, SW_HIDE);

    g_spectrum = CreateWindowExW(WS_EX_STATICEDGE, kSpectrumClass, L"",
                                 WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS, 0, 0, 0, 0, g_window,
                                 nullptr, core_api::get_my_instance(), nullptr);
    ShowWindow(g_spectrum, SW_HIDE);
}

//! 列与扩展样式必须在暗色钩子换掉 ListView 之后再设：替换会新建控件，
//! 旧控件上的列、扩展样式和字体都不会带过去。
void configureList() {
    ListView_SetExtendedListViewStyle(g_list, LVS_EX_FULLROWSELECT | LVS_EX_DOUBLEBUFFER | LVS_EX_LABELTIP);
    SendMessageW(g_list, WM_SETFONT, reinterpret_cast<WPARAM>(uiFont()), TRUE);

    struct Column {
        const wchar_t* title;
        int width;
    };
    const Column columns[] = {{L"File", 400}, {L"Claims to be", 200}, {L"Actually is", 280}};
    for (int i = 0; i < 3; ++i) {
        LVCOLUMNW column{};
        column.mask = LVCF_TEXT | LVCF_WIDTH | LVCF_SUBITEM;
        column.pszText = const_cast<wchar_t*>(columns[i].title);
        column.cx = columns[i].width;
        column.iSubItem = i;
        ListView_InsertColumn(g_list, i, &column);
    }

    const HWND header = reinterpret_cast<HWND>(SendMessageW(g_list, LVM_GETHEADER, 0, 0));
    if (header != nullptr) {
        SendMessageW(header, WM_SETFONT, reinterpret_cast<WPARAM>(headerFont()), TRUE);
    }
}

void onNotify(NMHDR* header) {
    if (header->hwndFrom != g_list) return;
    if (header->code != LVN_ITEMCHANGED) return;
    auto* changed = reinterpret_cast<NMLISTVIEW*>(header);
    if ((changed->uNewState & LVIS_SELECTED) == 0) return;
    updateDetail(changed->iItem);
}

LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
    switch (message) {
    case WM_SIZE:
        layoutChildren();
        return 0;

    case WM_SETFOCUS:
        if (g_list != nullptr) SetFocus(g_list);
        return 0;

    case WM_ERASEBKGND: {
        if (!isDark()) break;
        RECT rc{};
        GetClientRect(window, &rc);
        FillRect(reinterpret_cast<HDC>(wparam), &rc, darkBrush());
        return 1;
    }

    case WM_CTLCOLOREDIT:
    case WM_CTLCOLORSTATIC: {
        if (!isDark()) break;
        HDC dc = reinterpret_cast<HDC>(wparam);
        SetTextColor(dc, RGB(230, 230, 230));
        SetBkColor(dc, RGB(32, 32, 32));
        return reinterpret_cast<LRESULT>(darkBrush());
    }

    case WM_NOTIFY:
        onNotify(reinterpret_cast<NMHDR*>(lparam));
        return 0;

    case WM_CLOSE:
        DestroyWindow(window);
        return 0;

    case WM_DESTROY:
        g_window = nullptr;
        g_list = nullptr;
        g_detail = nullptr;
        g_spectrum = nullptr;
        g_detailVisible = false;
        g_selectedRow = -1;
        return 0;

    default:
        break;
    }
    return DefWindowProcW(window, message, wparam, lparam);
}
void registerWindowClass() {
    static bool registered = false;
    if (registered) return;
    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = windowProc;
    wc.hInstance = core_api::get_my_instance();
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
    wc.lpszClassName = kClassName;
    RegisterClassExW(&wc);
    registered = true;
}

//! 在 foobar2000 主窗口所在的显示器工作区里居中。
RECT centeredRect(int width, int height) {
    RECT work{};
    if (!SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0)) {
        work = RECT{0, 0, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN)};
    }
    const HWND owner = core_api::get_main_window();
    if (owner != nullptr) {
        MONITORINFO info{};
        info.cbSize = sizeof(info);
        const HMONITOR monitor = MonitorFromWindow(owner, MONITOR_DEFAULTTONEAREST);
        if (GetMonitorInfoW(monitor, &info)) work = info.rcWork;
    }
    RECT rect{};
    rect.left = work.left + ((work.right - work.left) - width) / 2;
    rect.top = work.top + ((work.bottom - work.top) - height) / 2;
    if (rect.left < work.left) rect.left = work.left;
    if (rect.top < work.top) rect.top = work.top;
    rect.right = rect.left + width;
    rect.bottom = rect.top + height;
    return rect;
}

} // namespace

void showReportWindow() {
    if (g_window == nullptr) {
        registerWindowClass();
        registerSpectrumClass();
        INITCOMMONCONTROLSEX controls{sizeof(controls), ICC_LISTVIEW_CLASSES};
        InitCommonControlsEx(&controls);

        // WS_EX_DLGMODALFRAME 才会让 Windows 不再给标题栏画图标（组件自己没有图标）；
        // 没有最小化/最大化按钮，和 foobar2000 的 Preferences 窗口一致。
        RECT frame = centeredRect(1100, 640);
        g_window = CreateWindowExW(WS_EX_DLGMODALFRAME, kClassName,
                                   L"Vespertine - fake Hi-Res report",
                                   WS_OVERLAPPEDWINDOW & ~(WS_MINIMIZEBOX | WS_MAXIMIZEBOX),
                                   frame.left, frame.top, frame.right - frame.left,
                                   frame.bottom - frame.top, core_api::get_main_window(), nullptr,
                                   core_api::get_my_instance(), nullptr);
        if (g_window == nullptr) return;
        createChildControls();
        // 钩子必须能看到这些 HWND：每次打开窗口时，列表和编辑控件都会重新创建，
        // 而钩子对象的生命周期与组件相同。
        if (g_dark == nullptr) g_dark = new fb2k::CCoreDarkModeHooks();
        g_dark->AddDialogWithControls(g_window);
        // fb2k 的暗色钩子会把 LVS_REPORT 的 ListView 换成它自己的列表控件，
        // 原句柄随旧控件销毁；按控件 ID 取回替换后的句柄再配置。
        g_list = GetDlgItem(g_window, kListId);
        if (g_list == nullptr) return;
        configureList();
        layoutChildren();
        applyColors();
    }

    fillList();
    ShowWindow(g_window, SW_SHOW);
    SetForegroundWindow(g_window);
    if (g_list != nullptr) SetFocus(g_list);
}

void destroyReportWindow() {
    if (g_window != nullptr) DestroyWindow(g_window);
    g_window = nullptr;
    g_list = nullptr;
    g_detail = nullptr;
    g_spectrum = nullptr;
    delete g_dark;
    g_dark = nullptr;
    if (g_darkBrush != nullptr) {
        DeleteObject(g_darkBrush);
        g_darkBrush = nullptr;
    }
    g_detailVisible = false;
    g_selectedRow = -1;
}

} // namespace vesper
