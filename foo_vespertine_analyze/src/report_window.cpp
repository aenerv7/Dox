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

#include <SDK/coreDarkMode.h>

#include <commctrl.h>

namespace vesper {

namespace {

constexpr wchar_t kClassName[] = L"foo_vespertine_analyze_report";
constexpr int kPadding = 8;
constexpr int kMinDetailHeight = 140;

HWND g_window = nullptr;
HWND g_list = nullptr;
HWND g_detail = nullptr;
fb2k::CCoreDarkModeHooks* g_dark = nullptr;
HBRUSH g_darkBrush = nullptr;

bool isDark() { return g_dark != nullptr && static_cast<bool>(*g_dark); }

HBRUSH darkBrush() {
    if (g_darkBrush == nullptr) g_darkBrush = CreateSolidBrush(RGB(32, 32, 32));
    return g_darkBrush;
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
    int detailHeight = height / 3;
    if (detailHeight < kMinDetailHeight) detailHeight = kMinDetailHeight;
    const int listHeight = height - detailHeight - 3 * kPadding;
    MoveWindow(g_list, kPadding, kPadding, width - 2 * kPadding, listHeight > 0 ? listHeight : 0, TRUE);
    MoveWindow(g_detail, kPadding, kPadding * 2 + (listHeight > 0 ? listHeight : 0),
               width - 2 * kPadding, detailHeight, TRUE);
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
    if (index < 0 || static_cast<size_t>(index) >= rows.size()) {
        SetWindowTextW(g_detail, L"");
        return;
    }
    const std::wstring text = toEditText(detailText(rows[static_cast<size_t>(index)]));
    SetWindowTextW(g_detail, text.c_str());
    // 较长的摘要不应在面板顶部被截断。
    SendMessageW(g_detail, EM_SETSEL, 0, 0);
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
        ListView_SetItemText(g_list, index, 1, const_cast<wchar_t*>(claimed.c_str()));
        ListView_SetItemText(g_list, index, 2, const_cast<wchar_t*>(actual.c_str()));
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
                             0, 0, 0, 0, g_window, nullptr, core_api::get_my_instance(), nullptr);
    ListView_SetExtendedListViewStyle(g_list, LVS_EX_FULLROWSELECT | LVS_EX_DOUBLEBUFFER | LVS_EX_LABELTIP);

    g_detail = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", L"",
                               WS_CHILD | WS_VISIBLE | WS_TABSTOP | ES_MULTILINE | ES_READONLY |
                                   ES_AUTOVSCROLL | WS_VSCROLL,
                               0, 0, 0, 0, g_window, nullptr, core_api::get_my_instance(), nullptr);
    SendMessageW(g_detail, EM_SETLIMITTEXT, 0, 0);

    const HFONT font = static_cast<HFONT>(GetStockObject(DEFAULT_GUI_FONT));
    SendMessageW(g_list, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
    SendMessageW(g_detail, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

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

} // namespace

void showReportWindow() {
    if (g_window == nullptr) {
        registerWindowClass();
        INITCOMMONCONTROLSEX controls{sizeof(controls), ICC_LISTVIEW_CLASSES};
        InitCommonControlsEx(&controls);

        g_window = CreateWindowExW(0, kClassName, L"Vespertine - fake hi-res report",
                                   WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1100, 640,
                                   core_api::get_main_window(), nullptr, core_api::get_my_instance(),
                                   nullptr);
        if (g_window == nullptr) return;
        createChildControls();
        // 钩子必须能看到这些 HWND：每次打开窗口时，列表和编辑控件都会重新创建，
        // 而钩子对象的生命周期与组件相同。
        if (g_dark == nullptr) g_dark = new fb2k::CCoreDarkModeHooks();
        g_dark->AddDialogWithControls(g_window);
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
    delete g_dark;
    g_dark = nullptr;
    if (g_darkBrush != nullptr) {
        DeleteObject(g_darkBrush);
        g_darkBrush = nullptr;
    }
}

} // namespace vesper
