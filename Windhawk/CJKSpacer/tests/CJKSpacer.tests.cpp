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

    if (failed == 0) {
        std::wcout << L"All CJKSpacer spacing tests passed.\n";
    }

    return failed == 0 ? 0 : 1;
}
