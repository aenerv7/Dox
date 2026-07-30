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
        std::wcerr << L"FAIL (DirectWrite ampersand handling)\n";
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

    if (ClassifyModernWindowClassName(L"Xaml_WindowedPopupClass") !=
            ModernWindowKind::Popup ||
        ClassifyModernWindowClassName(
            L"Microsoft.UI.Content.PopupWindowSiteBridge") !=
            ModernWindowKind::Other ||
        ClassifyModernWindowClassName(L"TaskListThumbnailWnd") !=
            ModernWindowKind::TaskbarThumbnail ||
        ClassifyModernWindowClassName(L"Shell_TrayWnd") !=
            ModernWindowKind::Other) {
        std::wcerr << L"FAIL (modern window classification)\n";
        ++failed;
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
