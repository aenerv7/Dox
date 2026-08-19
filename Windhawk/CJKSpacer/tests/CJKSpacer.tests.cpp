#include <iostream>
#include <string>
#include <utility>
#include <vector>

#include <windows.h>

#define WH_MOD
#define WH_EDITING
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
        {L"ひらがなABC", L"ひらがな ABC"},
        {L"ﾃｽﾄABC", L"ﾃｽﾄ ABC"},
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

    if (kXamlDiagnosticsConnectionLimit != 10000 ||
        kXamlDiagnosticsMaxAttempts != 3 ||
        kXamlDiagnosticsMaxEmptyWalks != 3 ||
        GetXamlDiagnosticsModuleFlavor(L"Windows.UI.Xaml.dll") !=
            XamlDiagnosticsFlavor::Windows ||
        GetXamlDiagnosticsModuleFlavor(
            L"C:\\Windows\\System32\\Microsoft.Internal.FrameworkUdk.dll") !=
            XamlDiagnosticsFlavor::Microsoft ||
        GetXamlDiagnosticsModuleFlavor(L"CoreMessagingXP.dll") !=
            XamlDiagnosticsFlavor::Microsoft ||
        ClassifyModernXamlHost(
            L"Windows.UI.Composition.DesktopWindowContentBridge",
            L"Shell_TrayWnd") !=
            XamlDiagnosticsFlavor::Windows ||
        ClassifyModernXamlHost(
            L"Windows.UI.Composition.DesktopWindowContentBridge") !=
            XamlDiagnosticsFlavor::None ||
        ClassifyModernXamlHost(
            L"Windows.UI.Composition.DesktopWindowContentBridge",
            L"CabinetWClass") != XamlDiagnosticsFlavor::None ||
        ClassifyModernXamlHost(L"XamlExplorerHostIslandWindow") !=
            XamlDiagnosticsFlavor::Windows ||
        ClassifyModernXamlHost(L"Shell_InputSwitchTopLevelWindow") !=
            XamlDiagnosticsFlavor::Windows ||
        ClassifyModernXamlHost(L"CabinetWClass") !=
            XamlDiagnosticsFlavor::Microsoft ||
        ClassifyModernXamlHost(
            L"XamlExplorerHostIslandWindow_WASDK") !=
            XamlDiagnosticsFlavor::Microsoft ||
        ClassifyModernXamlHost(L"TaskListThumbnailWnd") !=
            XamlDiagnosticsFlavor::None ||
        !IsModernUiDispatchWindowClassName(L"CabinetWClass") ||
        !IsModernUiDispatchWindowClassName(
            L"Shell_InputSwitchTopLevelWindow") ||
        !IsModernUiDispatchWindowClassName(
            L"XamlExplorerHostIslandWindow_WASDK") ||
        !IsModernUiDispatchWindowClassName(
            L"Windows.UI.Composition.DesktopWindowContentBridge") ||
        IsModernUiDispatchWindowClassName(L"TaskListThumbnailWnd")) {
        std::wcerr << L"FAIL (XAML diagnostics host classification)\n";
        ++failed;
    }

    XamlDiagnosticsConnectionState connectionState;
    if (!CanAttemptXamlDiagnosticsConnection(connectionState)) {
        std::wcerr << L"FAIL (XAML diagnostics initial state)\n";
        ++failed;
    }

    if (GetXamlDiagnosticsConnectionState(
            XamlDiagnosticsFlavor::Windows) !=
            &g_windowsUiXamlDiagnostics ||
        GetXamlDiagnosticsConnectionState(
            XamlDiagnosticsFlavor::Microsoft) !=
            &g_microsoftUiXamlDiagnostics ||
        GetXamlDiagnosticsConnectionState(
            XamlDiagnosticsFlavor::None)) {
        std::wcerr << L"FAIL (XAML diagnostics state mapping)\n";
        ++failed;
    }

    g_windowsUiXamlDiagnostics.connected.store(true);
    g_windowsUiXamlDiagnostics.blocked.store(true);
    g_windowsUiXamlDiagnostics.pending.store(true);
    g_windowsUiXamlDiagnostics.failureCount.store(
        kXamlDiagnosticsMaxAttempts);
    g_windowsUiXamlDiagnostics.emptyWalkCount.store(
        kXamlDiagnosticsMaxEmptyWalks);
    RearmXamlDiagnosticsConnection(XamlDiagnosticsFlavor::Windows);
    if (g_windowsUiXamlDiagnostics.connected.load() ||
        g_windowsUiXamlDiagnostics.blocked.load() ||
        g_windowsUiXamlDiagnostics.pending.load() ||
        g_windowsUiXamlDiagnostics.failureCount.load() != 0 ||
        g_windowsUiXamlDiagnostics.emptyWalkCount.load() != 0) {
        std::wcerr << L"FAIL (XAML diagnostics disconnect re-arm)\n";
        ++failed;
    }
    connectionState.failureCount.store(
        kXamlDiagnosticsMaxAttempts - 1);
    if (!CanAttemptXamlDiagnosticsConnection(connectionState)) {
        std::wcerr << L"FAIL (XAML diagnostics retryable state)\n";
        ++failed;
    }
    connectionState.failureCount.store(kXamlDiagnosticsMaxAttempts);
    if (CanAttemptXamlDiagnosticsConnection(connectionState)) {
        std::wcerr << L"FAIL (XAML diagnostics exhausted state)\n";
        ++failed;
    }
    connectionState.failureCount.store(0);
    connectionState.emptyWalkCount.store(
        kXamlDiagnosticsMaxEmptyWalks - 1);
    if (!CanAttemptXamlDiagnosticsConnection(connectionState)) {
        std::wcerr << L"FAIL (XAML diagnostics empty-walk retry state)\n";
        ++failed;
    }
    connectionState.emptyWalkCount.store(
        kXamlDiagnosticsMaxEmptyWalks);
    if (CanAttemptXamlDiagnosticsConnection(connectionState)) {
        std::wcerr << L"FAIL (XAML diagnostics empty-walk latch)\n";
        ++failed;
    }
    connectionState.emptyWalkCount.store(0);
    connectionState.blocked.store(true);
    if (CanAttemptXamlDiagnosticsConnection(connectionState)) {
        std::wcerr << L"FAIL (XAML diagnostics blocked state)\n";
        ++failed;
    }

    struct ElementTestState final : ModernTextStateBase {
        ElementTestState(int* applyCount, int* restoreCount)
            : applyCount(applyCount), restoreCount(restoreCount) {}

        bool Apply() override {
            ++*applyCount;
            return true;
        }

        void Restore() override {
            ++*restoreCount;
        }

        int* applyCount;
        int* restoreCount;
    };

    const ModernElementKey elementKey{
        reinterpret_cast<void*>(1), 1};
    int applyCount = 0;
    int restoreCount = 0;
    auto elementState = std::make_unique<ElementTestState>(
        &applyCount, &restoreCount);
    ModernThreadState modernThreadState;
    modernThreadState.states.emplace(elementKey, std::move(elementState));
    modernThreadState.states.at(elementKey)->Apply();
    RemoveModernTextState(modernThreadState, elementKey);
    if (applyCount != 1 || restoreCount != 1 ||
        !modernThreadState.states.empty()) {
        std::wcerr << L"FAIL (modern XAML element lifecycle)\n";
        ++failed;
    }

    uint64_t currentThreadCreationTime;
    if (!GetThreadCreationTime(
            GetCurrentThread(), &currentThreadCreationTime) ||
        !IsRegisteredThreadAlive(
            GetCurrentThreadId(), currentThreadCreationTime)) {
        std::wcerr << L"FAIL (modern XAML thread fingerprint)\n";
        ++failed;
    }

    if (!InitializeModernUi()) {
        std::wcerr << L"FAIL (managed XAML worker initialization)\n";
        ++failed;
    } else {
        if (!g_xamlDiagnosticsWorkerThread) {
            std::wcerr << L"FAIL (managed XAML worker creation)\n";
            ++failed;
        }

        HANDLE watcherReleaseEvent =
            CreateEventW(nullptr, TRUE, FALSE, nullptr);
        HANDLE watcherThread = watcherReleaseEvent
                                   ? CreateTrackedXamlWatcherThread(
                                         [](LPVOID parameter) -> DWORD {
                                             WaitForSingleObject(
                                                 static_cast<HANDLE>(parameter),
                                                 INFINITE);
                                             return 0;
                                         },
                                         watcherReleaseEvent)
                                   : nullptr;
        if (!watcherReleaseEvent || !watcherThread) {
            std::wcerr << L"FAIL (tracked XAML watcher creation)\n";
            ++failed;
        }
        if (watcherReleaseEvent) {
            SetEvent(watcherReleaseEvent);
        }

        g_stoppingModernUi.store(true, std::memory_order_release);
        StopModernXamlDiagnosticsWorker();
        WaitForXamlWatcherThreads();
        if (g_xamlDiagnosticsWorkerThread ||
            g_xamlDiagnosticsWorkerWakeEvent ||
            g_windowsUiXamlDiagnostics.pending.load(
                std::memory_order_acquire) ||
            g_microsoftUiXamlDiagnostics.pending.load(
                std::memory_order_acquire) ||
            g_xamlWatcherThreads) {
            std::wcerr << L"FAIL (managed XAML worker cleanup)\n";
            ++failed;
        }
        if (watcherReleaseEvent) {
            CloseHandle(watcherReleaseEvent);
        }
        UninitializeModernUi();
    }

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

    HMENU constructionMenu = nullptr;
    g_originalCreatePopupMenu = CreatePopupMenu;
    g_originalAppendMenuW = AppendMenuW;
    g_originalDestroyMenu = DestroyMenu;
    constructionMenu = CreatePopupMenuHook();
    if (!constructionMenu) {
        std::wcerr << L"FAIL (classic construction popup setup)\n";
        ++failed;
    } else {
        g_classicPopupMenuDepth = 0;
        g_classicPopupRootMenu = nullptr;
        const BOOL appended = AppendMenuWHook(
            constructionMenu, MF_STRING, 150, L"测试App");

        std::wstring constructedText;
        if (!appended ||
            !ReadMenuItemText(constructionMenu, 0, &constructedText) ||
            constructedText != L"测试 App") {
            std::wcerr << L"FAIL (classic construction rewrite)\n";
            ++failed;
        }

        AssociatePendingRewrittenMenuItems(constructionMenu);
        RestoreRewrittenMenuItems(constructionMenu);

        std::wstring restoredText;
        if (!ReadMenuItemText(constructionMenu, 0, &restoredText) ||
            restoredText != L"测试App") {
            std::wcerr << L"FAIL (classic construction restore)\n";
            ++failed;
        }

        if (!DestroyMenuHook(constructionMenu) ||
            IsCreatedClassicPopupMenu(constructionMenu)) {
            std::wcerr << L"FAIL (classic construction cleanup)\n";
            ++failed;
        }
    }
    g_originalCreatePopupMenu = nullptr;
    g_originalAppendMenuW = nullptr;
    g_originalDestroyMenu = nullptr;

    HMENU stalePendingMenu = CreatePopupMenu();
    HMENU cleanupTriggerMenu = CreatePopupMenu();
    if (!stalePendingMenu || !cleanupTriggerMenu ||
        !AppendMenuW(stalePendingMenu, MF_STRING, 160, L"测试 App") ||
        !AppendMenuW(cleanupTriggerMenu, MF_STRING, 161,
                     L"触发 Item")) {
        std::wcerr << L"FAIL (stale menu cleanup setup)\n";
        ++failed;
    } else {
        const ULONGLONG now = GetTickCount64();
        {
            std::lock_guard<std::mutex> guard(
                g_rewrittenMenuItemsMutex);
            g_rewrittenMenuItems.push_back(
                {nullptr, stalePendingMenu, 0,
                 now - kPendingRewrittenMenuLifetimeMs,
                 L"测试App", L"测试 App"});
            g_rewrittenMenuItemCount.store(
                static_cast<unsigned int>(
                    g_rewrittenMenuItems.size()));
        }
        g_nextRewrittenMenuCleanupTick.store(0);
        RememberRewrittenMenuItem(
            cleanupTriggerMenu, 0, L"触发Item", L"触发 Item");

        std::wstring restoredStaleText;
        if (!ReadMenuItemText(
                stalePendingMenu, 0, &restoredStaleText) ||
            restoredStaleText != L"测试App") {
            std::wcerr << L"FAIL (stale pending menu restore)\n";
            ++failed;
        }
        RestoreRewrittenMenuItems();
    }
    if (stalePendingMenu) {
        DestroyMenu(stalePendingMenu);
    }
    if (cleanupTriggerMenu) {
        DestroyMenu(cleanupTriggerMenu);
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

    INITCOMMONCONTROLSEX commonControls = {
        sizeof(commonControls), ICC_WIN95_CLASSES};
    InitCommonControlsEx(&commonControls);
    const HWND tooltipWindow = CreateWindowExW(
        WS_EX_TOOLWINDOW, TOOLTIPS_CLASSW, nullptr, WS_POPUP,
        0, 0, 1, 1, nullptr, nullptr, nullptr, nullptr);
    const HWND secondTooltipWindow = CreateWindowExW(
        WS_EX_TOOLWINDOW, TOOLTIPS_CLASSW, nullptr, WS_POPUP,
        0, 0, 1, 1, nullptr, nullptr, nullptr, nullptr);
    const HWND otherWindow = CreateWindowExW(
        WS_EX_TOOLWINDOW, L"STATIC", nullptr, WS_POPUP,
        0, 0, 1, 1, nullptr, nullptr, nullptr, nullptr);
    const HDC tooltipDc =
        tooltipWindow ? GetDC(tooltipWindow) : nullptr;
    const HDC secondTooltipDc =
        secondTooltipWindow ? GetDC(secondTooltipWindow) : nullptr;
    const HDC otherDc =
        otherWindow ? GetDC(otherWindow) : nullptr;
    constexpr uintptr_t fakeTooltipThemeCount = 32;
    for (uintptr_t value = 1; value <= fakeTooltipThemeCount; ++value) {
        TrackClassicTooltipTheme(
            reinterpret_cast<HTHEME>(value), tooltipWindow);
    }
    for (uintptr_t value = 1; value <= fakeTooltipThemeCount; ++value) {
        const HTHEME theme = reinterpret_cast<HTHEME>(value);
        if (!IsTrackedClassicTooltipTheme(theme)) {
            std::wcerr << L"FAIL (classic tooltip theme tracking)\n";
            ++failed;
            break;
        }
    }
    const HTHEME mixedReferenceTheme =
        reinterpret_cast<HTHEME>(fakeTooltipThemeCount + 1);
    TrackClassicTooltipTheme(mixedReferenceTheme, nullptr);
    if (IsTrackedClassicTooltipTheme(mixedReferenceTheme)) {
        std::wcerr << L"FAIL (non-window tooltip theme target)\n";
        ++failed;
    }
    TrackClassicTooltipTheme(mixedReferenceTheme, tooltipWindow);
    if (!IsTrackedClassicTooltipTheme(mixedReferenceTheme) ||
        !UntrackClassicTooltipTheme(mixedReferenceTheme) ||
        !IsTrackedClassicTooltipTheme(mixedReferenceTheme) ||
        !UntrackClassicTooltipTheme(mixedReferenceTheme) ||
        IsTrackedClassicTooltipTheme(mixedReferenceTheme)) {
        std::wcerr << L"FAIL (mixed classic tooltip theme references)\n";
        ++failed;
    }
    const HTHEME trackedTheme = reinterpret_cast<HTHEME>(1);
    TrackClassicTooltipTheme(trackedTheme, secondTooltipWindow);
    if (!UntrackClassicTooltipTheme(trackedTheme) ||
        !IsTrackedClassicTooltipTheme(trackedTheme)) {
        std::wcerr << L"FAIL (shared classic tooltip theme references)\n";
        ++failed;
    }
    if (!tooltipDc ||
        !IsClassicTooltipTarget(trackedTheme, tooltipDc) ||
        (secondTooltipDc &&
         !IsClassicTooltipTarget(trackedTheme, secondTooltipDc)) ||
        !IsClassicTooltipTarget(trackedTheme, nullptr) ||
        (otherDc &&
         IsClassicTooltipTarget(trackedTheme, otherDc))) {
        std::wcerr << L"FAIL (classic tooltip target confirmation)\n";
        ++failed;
    }
    if (tooltipDc) {
        ReleaseDC(tooltipWindow, tooltipDc);
    }
    if (secondTooltipDc) {
        ReleaseDC(secondTooltipWindow, secondTooltipDc);
    }
    if (otherDc) {
        ReleaseDC(otherWindow, otherDc);
    }
    if (tooltipWindow) {
        DestroyWindow(tooltipWindow);
    }
    if (secondTooltipWindow) {
        DestroyWindow(secondTooltipWindow);
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
