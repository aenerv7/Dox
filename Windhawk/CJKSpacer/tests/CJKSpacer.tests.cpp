#include <cstdarg>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

#include <windows.h>

void Wh_Log(PCWSTR, ...) {}

BOOL Wh_SetFunctionHook(void*, void*, void**) {
    return TRUE;
}

int Wh_GetIntSetting(PCWSTR) {
    return 1;
}

PCWSTR Wh_GetStringSetting(PCWSTR) {
    return L"unicode";
}

void Wh_FreeStringSetting(PCWSTR) {}

#define WH_MOD_ID L"cjk-spacer-test"
#include "../CJKSpacer.wh.cpp"

int wmain() {
    const std::vector<std::pair<std::wstring, std::wstring>> cases = {
        {L"使用VS Code打开", L"使用 VS Code 打开"},
        {L"压缩为ZIP文件", L"压缩为 ZIP 文件"},
        {L"网易UU远程", L"网易 UU 远程"},
        {L"使用 VS Code 打开", L"使用 VS Code 打开"},
        {L"打开(&O)", L"打开(&O)"},
        {L"打开&Open", L"打开 &Open"},
        {L"文件...", L"文件..."},
        {L"你好，world", L"你好，world"},
        {L"カナABC", L"カナ ABC"},
        {L"한글123", L"한글 123"},
        {L"中文éclair", L"中文 éclair"},
        {L"\U00020000A", L"\U00020000 A"},
        {L"A\U00020000", L"A \U00020000"},
        {L"漢\uFE0FA", L"漢\uFE0F A"},
        {L"々A", L"々 A"},
        {L"〇VS", L"〇 VS"},
        {L"ｶﾞA", L"ｶﾞ A"},
        {L"項目・Item", L"項目・Item"},
        {L"項目゠Item", L"項目゠Item"},
        {L"中文ＡＢＣ", L"中文ＡＢＣ"},
        {L"０中文", L"０中文"},
    };

    int failed = 0;
    if (g_modernUiText.load()) {
        std::wcerr << L"FAIL (modern UI must default to opt-in)\n";
        ++failed;
    }

    for (const auto& [input, expected] : cases) {
        const std::wstring actual = AddCjkSpacing(input);
        if (actual != expected) {
            std::wcerr << L"FAIL\n  input:    " << input
                       << L"\n  expected: " << expected
                       << L"\n  actual:   " << actual << L"\n";
            ++failed;
        }

        const std::wstring secondPass = AddCjkSpacing(actual);
        if (secondPass != actual) {
            std::wcerr << L"FAIL (not idempotent)\n  first:  " << actual
                       << L"\n  second: " << secondPass << L"\n";
            ++failed;
        }
    }

    g_unicodeLettersAndDigits.store(false);
    if (AddCjkSpacing(L"中文éclair") != L"中文éclair" ||
        AddCjkSpacing(L"中文ABC") != L"中文 ABC") {
        std::wcerr << L"FAIL (ASCII character mode)\n";
        ++failed;
    }

    g_unicodeLettersAndDigits.store(true);
    if (AddCjkSpacing(L"中文&Test", false) != L"中文&Test" ||
        AddCjkSpacing(L"中文&Test", true) != L"中文 &Test") {
        std::wcerr << L"FAIL (ampersand handling)\n";
        ++failed;
    }

    if (!ContainsCjkCodePoint(L"ABC中文") ||
        ContainsCjkCodePoint(L"ABC123")) {
        std::wcerr << L"FAIL (CJK pre-scan)\n";
        ++failed;
    }

    std::wstring classicTooltipText;
    if (!BuildSpacedClassicTooltipText(
            L"网易UU远程", -1, DT_NOPREFIX,
            &classicTooltipText) ||
        classicTooltipText != L"网易 UU 远程") {
        std::wcerr << L"FAIL (classic tooltip text)\n";
        ++failed;
    }

    if (!IsClassicTooltipThemeClassList(L"TOOLTIP") ||
        !IsClassicTooltipThemeClassList(L"Explorer::Tooltip") ||
        IsClassicTooltipThemeClassList(L"MENU") ||
        IsClassicTooltipThemeClassList(L"NotATooltipStyle")) {
        std::wcerr << L"FAIL (classic tooltip theme class)\n";
        ++failed;
    }

    if (!IsClassicTooltipTextPart(TTP_STANDARD) ||
        !IsClassicTooltipTextPart(TTP_STANDARDTITLE) ||
        !IsClassicTooltipTextPart(TTP_BALLOON) ||
        !IsClassicTooltipTextPart(TTP_BALLOONTITLE) ||
        IsClassicTooltipTextPart(TTP_CLOSE) ||
        IsClassicTooltipTextPart(TTP_BALLOONSTEM)) {
        std::wcerr << L"FAIL (classic tooltip text parts)\n";
        ++failed;
    }

    if (!IsModernPopupClassName(L"Xaml_WindowedPopupClass") ||
        !IsModernPopupClassName(
            L"Microsoft.UI.Content.PopupWindowSiteBridge") ||
        IsModernPopupClassName(L"TaskListThumbnailWnd") ||
        IsModernPopupClassName(L"Shell_TrayWnd")) {
        std::wcerr << L"FAIL (modern window classification)\n";
        ++failed;
    }

    if (!IsModernMenuSourceType(
            L"Windows.UI.Xaml.Controls.MenuFlyoutItem") ||
        !IsModernMenuSourceType(
            L"Microsoft.UI.Xaml.Controls.ToggleMenuFlyoutItem") ||
        !IsModernMenuSourceType(
            L"Microsoft.UI.Xaml.Controls.MenuFlyoutSubItem") ||
        IsModernMenuSourceType(
            L"Windows.UI.Xaml.Controls.MenuFlyoutPresenter") ||
        !IsModernTooltipSourceType(
            L"Windows.UI.Xaml.Controls.ToolTip") ||
        IsModernTooltipSourceType(
            L"Windows.UI.Xaml.Controls.TextBlock")) {
        std::wcerr << L"FAIL (modern XAML source classification)\n";
        ++failed;
    }

    struct PopupTestState final : ModernTextStateBase {
        explicit PopupTestState(HWND popupWindow)
            : popupWindow(popupWindow) {}

        void Apply(HWND newPopupWindow) override {
            ++applyCount;
            popupWindow = newPopupWindow;
        }

        void Restore(bool clearOwnership) override {
            ++restoreCount;
            if (clearOwnership) {
                popupWindow = nullptr;
            }
        }

        HWND PopupWindow() const override {
            return popupWindow;
        }

        HWND popupWindow;
        int applyCount = 0;
        int restoreCount = 0;
    };

    const HWND firstPopup = reinterpret_cast<HWND>(1);
    const HWND secondPopup = reinterpret_cast<HWND>(2);
    const HWND thirdPopup = reinterpret_cast<HWND>(3);
    const ModernElementKey firstKey{
        reinterpret_cast<void*>(1), 1};
    const ModernElementKey secondKey{
        reinterpret_cast<void*>(2), 2};
    const ModernElementKey pendingKey{
        reinterpret_cast<void*>(3), 3};
    auto firstPopupState =
        std::make_shared<PopupTestState>(firstPopup);
    auto secondPopupState =
        std::make_shared<PopupTestState>(secondPopup);
    auto pendingState =
        std::make_shared<PopupTestState>(nullptr);
    auto& modernThreadState = *g_modernTextStatesForThread;
    modernThreadState.states.clear();
    modernThreadState.pending.clear();
    modernThreadState.ownedByPopup.clear();
    modernThreadState.states.emplace(firstKey, firstPopupState);
    modernThreadState.states.emplace(secondKey, secondPopupState);
    modernThreadState.states.emplace(pendingKey, pendingState);
    modernThreadState.ownedByPopup[firstPopup].insert(firstKey);
    modernThreadState.ownedByPopup[secondPopup].insert(secondKey);
    modernThreadState.pending.insert(pendingKey);

    ApplyModernTextStatesForPopup(thirdPopup);
    if (firstPopupState->applyCount != 0 ||
        secondPopupState->applyCount != 0 ||
        pendingState->applyCount != 1 ||
        pendingState->PopupWindow() != thirdPopup ||
        !modernThreadState.pending.empty() ||
        !modernThreadState.ownedByPopup[thirdPopup].contains(
            pendingKey)) {
        std::wcerr << L"FAIL (modern XAML pending ownership)\n";
        ++failed;
    }

    RestoreModernTextStatesForPopup(firstPopup, false);
    if (firstPopupState->restoreCount != 1 ||
        firstPopupState->PopupWindow() != firstPopup ||
        secondPopupState->restoreCount != 0 ||
        secondPopupState->PopupWindow() != secondPopup) {
        std::wcerr << L"FAIL (modern XAML popup hide restore)\n";
        ++failed;
    }

    RestoreModernTextStatesForPopup(firstPopup, true);
    if (firstPopupState->restoreCount != 2 ||
        firstPopupState->PopupWindow() ||
        !modernThreadState.pending.contains(firstKey) ||
        modernThreadState.ownedByPopup.contains(firstPopup)) {
        std::wcerr << L"FAIL (modern XAML popup destroy cleanup)\n";
        ++failed;
    }

    modernThreadState.states.clear();
    modernThreadState.pending.clear();
    modernThreadState.ownedByPopup.clear();

    HMENU testMenu = CreatePopupMenu();
    if (!testMenu ||
        !AppendMenuW(testMenu, MF_STRING, 100, L"网易UU远程")) {
        std::wcerr << L"FAIL (classic popup test setup)\n";
        ++failed;
    } else {
        MENUITEMINFOW replacement = {};
        replacement.cbSize = sizeof(replacement);
        replacement.fMask = MIIM_STRING;
        replacement.dwTypeData =
            const_cast<wchar_t*>(L"网易 UU 远程");
        if (!SetMenuItemInfoW(testMenu, 0, TRUE, &replacement)) {
            std::wcerr << L"FAIL (classic popup rewrite setup)\n";
            ++failed;
        } else {
            g_classicPopupRootMenu = testMenu;
            RememberRewrittenMenuItem(
                testMenu, 0, L"网易UU远程", L"网易 UU 远程");

            if (!InsertMenuW(
                    testMenu, 0, MF_BYPOSITION | MF_STRING,
                    101, L"测试 App")) {
                std::wcerr << L"FAIL (classic popup index shift setup)\n";
                ++failed;
            } else {
                RememberRewrittenMenuItem(
                    testMenu, 0, L"测试App", L"测试 App");
            }

            RestoreRewrittenMenuItems(testMenu);

            std::wstring restoredInserted;
            std::wstring restoredShifted;
            if (!ReadMenuItemText(
                    testMenu, 0, &restoredInserted) ||
                restoredInserted != L"测试App" ||
                !ReadMenuItemText(
                    testMenu, 1, &restoredShifted) ||
                restoredShifted != L"网易UU远程" ||
                FindMenuItemIndex(testMenu, 100, false) != 1 ||
                FindMenuItemIndex(
                    testMenu, static_cast<UINT>(-1), true) != 1) {
                std::wcerr << L"FAIL (classic popup shifted restore)\n";
                ++failed;
            }
            g_classicPopupRootMenu = nullptr;
        }
        DestroyMenu(testMenu);
    }

    HMENU popupInsertMenu = CreatePopupMenu();
    HMENU insertedSubMenu = CreatePopupMenu();
    if (!popupInsertMenu || !insertedSubMenu ||
        !AppendMenuW(
            popupInsertMenu, MF_STRING, 200, L"Anchor")) {
        std::wcerr << L"FAIL (MF_POPUP test setup)\n";
        ++failed;
    } else {
        g_originalInsertMenuW = InsertMenuW;
        g_classicPopupRootMenu = popupInsertMenu;
        g_classicPopupMenuDepth = 1;
        const BOOL inserted = InsertMenuWHook(
            popupInsertMenu, 200, MF_BYCOMMAND | MF_POPUP,
            reinterpret_cast<UINT_PTR>(insertedSubMenu),
            L"测试App");
        g_classicPopupMenuDepth = 0;

        std::wstring spacedPopupText;
        const int insertedIndex = FindMenuItemIndexByText(
            popupInsertMenu, L"测试 App");
        if (!inserted || insertedIndex < 0 ||
            !ReadMenuItemText(
                popupInsertMenu,
                static_cast<UINT>(insertedIndex),
                &spacedPopupText) ||
            spacedPopupText != L"测试 App") {
            std::wcerr << L"FAIL (MF_POPUP rewrite recording)\n";
            ++failed;
        }

        RestoreRewrittenMenuItems(popupInsertMenu);
        std::wstring restoredPopupText;
        const int restoredIndex = FindMenuItemIndexByText(
            popupInsertMenu, L"测试App");
        if (restoredIndex < 0 ||
            !ReadMenuItemText(
                popupInsertMenu,
                static_cast<UINT>(restoredIndex),
                &restoredPopupText) ||
            restoredPopupText != L"测试App") {
            std::wcerr << L"FAIL (MF_POPUP restore)\n";
            ++failed;
        }

        g_classicPopupRootMenu = nullptr;
        g_originalInsertMenuW = nullptr;
    }
    if (popupInsertMenu) {
        DestroyMenu(popupInsertMenu);
    } else if (insertedSubMenu) {
        DestroyMenu(insertedSubMenu);
    }

    HMENU pastEndMenu = CreatePopupMenu();
    if (!pastEndMenu ||
        !AppendMenuW(pastEndMenu, MF_STRING, 300, L"Anchor")) {
        std::wcerr << L"FAIL (past-end insert test setup)\n";
        ++failed;
    } else {
        g_originalInsertMenuW = InsertMenuW;
        g_classicPopupRootMenu = pastEndMenu;
        g_classicPopupMenuDepth = 1;
        const BOOL inserted = InsertMenuWHook(
            pastEndMenu, 999, MF_BYPOSITION | MF_STRING,
            301, L"测试App");
        g_classicPopupMenuDepth = 0;

        std::wstring insertedText;
        const int insertedIndex = GetMenuItemCount(pastEndMenu) - 1;
        if (!inserted || insertedIndex != 1 ||
            !ReadMenuItemText(
                pastEndMenu,
                static_cast<UINT>(insertedIndex),
                &insertedText) ||
            insertedText != L"测试 App") {
            std::wcerr << L"FAIL (past-end insert recording)\n";
            ++failed;
        }

        RestoreRewrittenMenuItems(pastEndMenu);
        std::wstring restoredText;
        if (!ReadMenuItemText(
                pastEndMenu,
                static_cast<UINT>(insertedIndex),
                &restoredText) ||
            restoredText != L"测试App") {
            std::wcerr << L"FAIL (past-end insert restore)\n";
            ++failed;
        }

        g_classicPopupRootMenu = nullptr;
        g_originalInsertMenuW = nullptr;
    }
    if (pastEndMenu) {
        DestroyMenu(pastEndMenu);
    }

    HMENU commandCollisionMenu = CreatePopupMenu();
    HMENU collisionSubMenu = CreatePopupMenu();
    if (!commandCollisionMenu || !collisionSubMenu) {
        std::wcerr << L"FAIL (command collision test setup)\n";
        ++failed;
    } else {
        const UINT collisionId = static_cast<UINT>(
            reinterpret_cast<UINT_PTR>(collisionSubMenu));
        if (!AppendMenuW(
                commandCollisionMenu, MF_POPUP,
                reinterpret_cast<UINT_PTR>(collisionSubMenu),
                L"Submenu") ||
            !AppendMenuW(
                commandCollisionMenu, MF_STRING,
                collisionId, L"Command") ||
            FindMenuItemIndex(
                commandCollisionMenu, collisionId, false) != 1) {
            std::wcerr << L"FAIL (submenu command collision)\n";
            ++failed;
        }
    }
    if (commandCollisionMenu) {
        DestroyMenu(commandCollisionMenu);
    } else if (collisionSubMenu) {
        DestroyMenu(collisionSubMenu);
    }

    constexpr uintptr_t fakeTooltipThemeCount = 32;
    for (uintptr_t value = 1; value <= fakeTooltipThemeCount; ++value) {
        TrackClassicTooltipTheme(reinterpret_cast<HTHEME>(value));
    }
    for (uintptr_t value = 1; value <= fakeTooltipThemeCount; ++value) {
        const HTHEME theme = reinterpret_cast<HTHEME>(value);
        if (!IsTrackedClassicTooltipTheme(theme)) {
            std::wcerr << L"FAIL (classic tooltip theme tracking)\n";
            ++failed;
            break;
        }
    }

    INITCOMMONCONTROLSEX commonControls = {
        sizeof(commonControls), ICC_WIN95_CLASSES};
    InitCommonControlsEx(&commonControls);
    const HWND tooltipWindow = CreateWindowExW(
        WS_EX_TOOLWINDOW, TOOLTIPS_CLASSW, nullptr, WS_POPUP,
        0, 0, 1, 1, nullptr, nullptr, nullptr, nullptr);
    const HWND otherWindow = CreateWindowExW(
        WS_EX_TOOLWINDOW, L"STATIC", nullptr, WS_POPUP,
        0, 0, 1, 1, nullptr, nullptr, nullptr, nullptr);
    const HDC tooltipDc =
        tooltipWindow ? GetDC(tooltipWindow) : nullptr;
    const HDC otherDc =
        otherWindow ? GetDC(otherWindow) : nullptr;
    const HTHEME trackedTheme = reinterpret_cast<HTHEME>(1);
    if (!tooltipDc ||
        !IsClassicTooltipTarget(trackedTheme, tooltipDc) ||
        !IsClassicTooltipTarget(trackedTheme, nullptr) ||
        (otherDc &&
         IsClassicTooltipTarget(trackedTheme, otherDc))) {
        std::wcerr << L"FAIL (classic tooltip target confirmation)\n";
        ++failed;
    }
    if (tooltipDc) {
        ReleaseDC(tooltipWindow, tooltipDc);
    }
    if (otherDc) {
        ReleaseDC(otherWindow, otherDc);
    }
    if (tooltipWindow) {
        DestroyWindow(tooltipWindow);
    }
    if (otherWindow) {
        DestroyWindow(otherWindow);
    }

    ClearTrackedClassicTooltipThemes();
    if (g_classicTooltipThemeCount.load() != 0 ||
        IsTrackedClassicTooltipTheme(reinterpret_cast<HTHEME>(1))) {
        std::wcerr << L"FAIL (classic tooltip theme cleanup)\n";
        ++failed;
    }

    if (failed == 0) {
        std::wcout << L"All CJKSpacer spacing tests passed.\n";
    }

    return failed == 0 ? 0 : 1;
}
