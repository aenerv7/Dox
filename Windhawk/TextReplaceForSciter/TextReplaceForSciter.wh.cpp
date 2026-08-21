// ==WindhawkMod==
// @id              text-replace-for-sciter
// @name            Text Replace for Sciter
// @description     Replace text in desktop apps that use the Sciter UI engine
// @version         0.1
// @author          aenerv7
// @github          https://github.com/aenerv7
// @license         GPL-3.0
// @include         *
// ==/WindhawkMod==

// Source code is published under the GNU General Public License v3.0.

// ==WindhawkModReadme==
/*
# Text Replace for Sciter

Replaces text in desktop applications that use the Sciter UI engine. Unlike
rendering-level text replacement, this mod edits Sciter DOM text nodes, so it
also covers text created or refreshed by application scripts.

The mod discovers dynamically linked Sciter runtimes through their public
`SciterAPI` export. Sciter API versions 9 and 10, used by Sciter 4 and
Sciter.JS respectively, are supported. Renamed Sciter DLLs work as long as the
export is preserved.

## Limitations

- Text drawn in images, canvas elements, or custom graphics is not a DOM text
  node and cannot be replaced.
- Form values and attributes such as `value`, `placeholder`, and `title` are
  intentionally left unchanged to avoid modifying user input or application
  data.
- Text in scripts, styles, text editors, and editable elements is skipped.
- Statically linked or windowless Sciter integrations are not supported.

Applications need to be restarted after enabling or disabling the mod if the
Sciter runtime or a UI thread doesn't permit live event-handler attachment.
*/
// ==/WindhawkModReadme==

// ==WindhawkModSettings==
/*
- PerProgramConfig:
  - - Name: ""
      $name: Program name
      $description: >-
        Can be the full path or just the file name. Wildcards are supported:
        '*' matches any number of characters and '?' matches one character.
    - Search: ""
      $name: Text to replace
    - Replace: ""
      $name: Replacement text
  $name: Per-program configuration
*/
// ==/WindhawkModSettings==

#include <windows.h>
#include <tlhelp32.h>

#include <atomic>
#include <memory>
#include <string>
#include <vector>

namespace {

using HELEMENT = void*;
using HNODE = void*;
using SCDOM_RESULT = int;
using SBOOL = int;

constexpr SCDOM_RESULT kScDomOk = 0;
constexpr UINT kHandleInitialization = 0x0000;
constexpr UINT kHandleBehaviorEvent = 0x0100;
constexpr UINT kSinking = 0x8000;
constexpr UINT kEventCodeMask = 0x7FFF;
constexpr UINT kBehaviorDetach = 0;
constexpr UINT kContentChanged = 0x15;
constexpr UINT kDocumentComplete = 0x98;
constexpr UINT kNodeElement = 0;
constexpr UINT kNodeText = 1;

// Function indices in the public ISciterAPI v9/v10 table. The Windows table
// prefix through the node API is ABI-compatible between these two versions.
constexpr size_t kApiSciterClassName = 0;
constexpr size_t kApiSciterGetRootElement = 34;
constexpr size_t kApiSciterGetParentElement = 39;
constexpr size_t kApiSciterGetAttributeByNameCb = 46;
constexpr size_t kApiSciterGetElementType = 50;
constexpr size_t kApiSciterWindowAttachEventHandler = 82;
constexpr size_t kApiSciterWindowDetachEventHandler = 83;
constexpr size_t kApiSciterNodeCastFromElement = 112;
constexpr size_t kApiSciterNodeCastToElement = 113;
constexpr size_t kApiSciterNodeFirstChild = 114;
constexpr size_t kApiSciterNodeNextSibling = 116;
constexpr size_t kApiSciterNodeType = 121;
constexpr size_t kApiSciterNodeGetText = 122;
constexpr size_t kApiSciterNodeSetText = 123;

using SciterApiExport = void*(__stdcall*)();
using WideStringReceiver = void(__stdcall*)(LPCWSTR, UINT, void*);
using ElementEventProc = SBOOL(__stdcall*)(void*, HELEMENT, UINT, void*);

using SciterClassNameFn = LPCWSTR(__stdcall*)();
using SciterGetRootElementFn =
    SCDOM_RESULT(__stdcall*)(HWND, HELEMENT*);
using SciterGetParentElementFn =
    SCDOM_RESULT(__stdcall*)(HELEMENT, HELEMENT*);
using SciterGetAttributeByNameCbFn = SCDOM_RESULT(__stdcall*)(
    HELEMENT, LPCSTR, WideStringReceiver, void*);
using SciterGetElementTypeFn =
    SCDOM_RESULT(__stdcall*)(HELEMENT, LPCSTR*);
using SciterWindowAttachEventHandlerFn = SCDOM_RESULT(__stdcall*)(
    HWND, ElementEventProc, void*, UINT);
using SciterWindowDetachEventHandlerFn = SCDOM_RESULT(__stdcall*)(
    HWND, ElementEventProc, void*);
using SciterNodeCastFromElementFn =
    SCDOM_RESULT(__stdcall*)(HELEMENT, HNODE*);
using SciterNodeCastToElementFn =
    SCDOM_RESULT(__stdcall*)(HNODE, HELEMENT*);
using SciterNodeFirstChildFn = SCDOM_RESULT(__stdcall*)(HNODE, HNODE*);
using SciterNodeNextSiblingFn = SCDOM_RESULT(__stdcall*)(HNODE, HNODE*);
using SciterNodeTypeFn = SCDOM_RESULT(__stdcall*)(HNODE, UINT*);
using SciterNodeGetTextFn = SCDOM_RESULT(__stdcall*)(
    HNODE, WideStringReceiver, void*);
using SciterNodeSetTextFn =
    SCDOM_RESULT(__stdcall*)(HNODE, LPCWSTR, UINT);

template <typename T>
T GetSciterApiFunction(void* api, size_t index) {
    const uintptr_t functions =
        (reinterpret_cast<uintptr_t>(api) + sizeof(UINT) +
         alignof(void*) - 1) &
        ~(static_cast<uintptr_t>(alignof(void*)) - 1);
    return reinterpret_cast<T>(
        *reinterpret_cast<void**>(functions + index * sizeof(void*)));
}

struct ReplacementItem {
    std::wstring search;
    std::wstring replacement;
};

struct SciterRuntime {
    HMODULE module;
    void* api;
    UINT apiVersion;
    std::wstring className;

    SciterGetRootElementFn getRootElement;
    SciterGetParentElementFn getParentElement;
    SciterGetAttributeByNameCbFn getAttributeByNameCb;
    SciterGetElementTypeFn getElementType;
    SciterWindowAttachEventHandlerFn windowAttachEventHandler;
    SciterWindowDetachEventHandlerFn windowDetachEventHandler;
    SciterNodeCastFromElementFn nodeCastFromElement;
    SciterNodeCastToElementFn nodeCastToElement;
    SciterNodeFirstChildFn nodeFirstChild;
    SciterNodeNextSiblingFn nodeNextSibling;
    SciterNodeTypeFn nodeType;
    SciterNodeGetTextFn nodeGetText;
    SciterNodeSetTextFn nodeSetText;
};

struct WindowContext {
    HWND window;
    SciterRuntime* runtime;
    std::atomic<bool> attached{false};
};

struct BehaviorEventParamsPrefix {
    UINT cmd;
    HELEMENT target;
    HELEMENT source;
    UINT_PTR reason;
};

struct InitializationParams {
    UINT cmd;
};

std::vector<ReplacementItem> g_replacementItems;
std::vector<std::unique_ptr<SciterRuntime>> g_runtimes;
std::vector<std::unique_ptr<WindowContext>> g_windowContexts;
SRWLOCK g_stateLock = SRWLOCK_INIT;
std::atomic<bool> g_unloading{false};
thread_local bool g_processingDom = false;
thread_local bool g_attachingWindow = false;
thread_local bool g_registeringRuntime = false;

template <typename T>
bool WildcardMatch(const T* pattern,
                   size_t patternLength,
                   const T* value,
                   size_t valueLength) {
    while (patternLength > 0) {
        if (pattern[0] == '*') {
            if (patternLength == 1) {
                return true;
            }
            if (pattern[1] == '*') {
                pattern++;
                patternLength--;
                continue;
            }
            if (WildcardMatch(pattern + 1, patternLength - 1, value,
                              valueLength)) {
                return true;
            }
            if (valueLength == 0) {
                return false;
            }
            value++;
            valueLength--;
            continue;
        }

        if (valueLength == 0 ||
            (pattern[0] != '?' && pattern[0] != value[0])) {
            return false;
        }
        pattern++;
        patternLength--;
        value++;
        valueLength--;
    }

    return valueLength == 0;
}

void UppercaseInPlace(std::wstring& value) {
    if (!value.empty()) {
        LCMapStringEx(LOCALE_NAME_INVARIANT, LCMAP_UPPERCASE, value.data(),
                      static_cast<int>(value.size()), value.data(),
                      static_cast<int>(value.size()), nullptr, nullptr, 0);
    }
}

void LoadSettings() {
    g_replacementItems.clear();

    std::wstring programPath(32768, L'\0');
    DWORD programPathLength = static_cast<DWORD>(programPath.size());
    if (!QueryFullProcessImageNameW(GetCurrentProcess(), 0, programPath.data(),
                                    &programPathLength)) {
        programPathLength = 0;
    }
    programPath.resize(programPathLength);
    UppercaseInPlace(programPath);

    const size_t slash = programPath.find_last_of(L"\\/");
    const std::wstring programName =
        slash == std::wstring::npos ? programPath : programPath.substr(slash + 1);

    for (int index = 0;; index++) {
        PCWSTR nameSetting =
            Wh_GetStringSetting(L"PerProgramConfig[%d].Name", index);
        std::wstring pattern = nameSetting ? nameSetting : L"";
        Wh_FreeStringSetting(nameSetting);
        if (pattern.empty()) {
            break;
        }

        UppercaseInPlace(pattern);
        const bool matchesName =
            WildcardMatch(pattern.c_str(), pattern.size(), programName.c_str(),
                          programName.size());
        const bool matchesPath =
            WildcardMatch(pattern.c_str(), pattern.size(), programPath.c_str(),
                          programPath.size());
        if (!matchesName && !matchesPath) {
            continue;
        }

        PCWSTR searchSetting =
            Wh_GetStringSetting(L"PerProgramConfig[%d].Search", index);
        PCWSTR replaceSetting =
            Wh_GetStringSetting(L"PerProgramConfig[%d].Replace", index);
        std::wstring search = searchSetting ? searchSetting : L"";
        std::wstring replacement = replaceSetting ? replaceSetting : L"";
        Wh_FreeStringSetting(searchSetting);
        Wh_FreeStringSetting(replaceSetting);

        if (!search.empty()) {
            g_replacementItems.push_back(
                {std::move(search), std::move(replacement)});
        }
    }
}

bool ReplaceText(std::wstring& text) {
    const std::wstring original = text;
    for (const auto& item : g_replacementItems) {
        size_t position = 0;
        while ((position = text.find(item.search, position)) !=
               std::wstring::npos) {
            text.replace(position, item.search.size(), item.replacement);
            position += item.replacement.size();
        }
    }
    return text != original;
}

bool IsRuntimeLoaded(const SciterRuntime* runtime) {
    HMODULE currentModule = nullptr;
    return GetModuleHandleExW(
               GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                   GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
               reinterpret_cast<LPCWSTR>(runtime->api), &currentModule) &&
           currentModule == runtime->module;
}

void __stdcall CaptureWideString(LPCWSTR value, UINT length, void* parameter) {
    auto* result = static_cast<std::wstring*>(parameter);
    if (value) {
        result->assign(value, length);
    } else {
        result->clear();
    }
}

struct AttributeValue {
    bool received = false;
    std::wstring value;
};

void __stdcall CaptureAttribute(LPCWSTR value, UINT length, void* parameter) {
    auto* result = static_cast<AttributeValue*>(parameter);
    result->received = true;
    if (value) {
        result->value.assign(value, length);
    }
}

bool HasEnabledAttribute(SciterRuntime* runtime,
                         HELEMENT element,
                         LPCSTR attributeName) {
    AttributeValue attribute;
    if (runtime->getAttributeByNameCb(element, attributeName, CaptureAttribute,
                                      &attribute) != kScDomOk ||
        !attribute.received) {
        return false;
    }

    return _wcsicmp(attribute.value.c_str(), L"false") != 0 &&
           _wcsicmp(attribute.value.c_str(), L"no") != 0 &&
           attribute.value != L"0";
}

bool IsExcludedElement(SciterRuntime* runtime, HELEMENT element) {
    LPCSTR type = nullptr;
    if (runtime->getElementType(element, &type) == kScDomOk && type) {
        if (_stricmp(type, "script") == 0 || _stricmp(type, "style") == 0 ||
            _stricmp(type, "textarea") == 0 ||
            _stricmp(type, "plaintext") == 0 ||
            _stricmp(type, "htmlarea") == 0) {
            return true;
        }
    }

    return HasEnabledAttribute(runtime, element, "contenteditable") ||
           HasEnabledAttribute(runtime, element, "editable");
}

bool HasExcludedAncestor(SciterRuntime* runtime, HELEMENT element) {
    HELEMENT parent = nullptr;
    while (runtime->getParentElement(element, &parent) == kScDomOk && parent) {
        if (IsExcludedElement(runtime, parent)) {
            return true;
        }
        element = parent;
        parent = nullptr;
    }
    return false;
}

class DomProcessingGuard {
public:
    DomProcessingGuard() : previous_(g_processingDom) {
        g_processingDom = true;
    }

    ~DomProcessingGuard() {
        g_processingDom = previous_;
    }

private:
    bool previous_;
};

void ProcessNode(SciterRuntime* runtime, HNODE node, bool excluded) {
    UINT nodeType = 0;
    if (runtime->nodeType(node, &nodeType) != kScDomOk) {
        return;
    }

    if (nodeType == kNodeElement) {
        HELEMENT element = nullptr;
        if (runtime->nodeCastToElement(node, &element) != kScDomOk ||
            !element) {
            return;
        }
        excluded = excluded || IsExcludedElement(runtime, element);
    } else if (nodeType == kNodeText && !excluded) {
        std::wstring text;
        if (runtime->nodeGetText(node, CaptureWideString, &text) == kScDomOk &&
            ReplaceText(text) && text.size() <= MAXUINT) {
            runtime->nodeSetText(node, text.c_str(),
                                 static_cast<UINT>(text.size()));
        }
        return;
    }

    if (excluded) {
        return;
    }

    HNODE child = nullptr;
    if (runtime->nodeFirstChild(node, &child) != kScDomOk) {
        return;
    }

    while (child) {
        HNODE next = nullptr;
        runtime->nodeNextSibling(child, &next);
        ProcessNode(runtime, child, excluded);
        child = next;
    }
}

void ProcessElement(SciterRuntime* runtime, HELEMENT element) {
    if (g_unloading || g_processingDom || !element ||
        !IsRuntimeLoaded(runtime)) {
        return;
    }

    HNODE node = nullptr;
    if (runtime->nodeCastFromElement(element, &node) != kScDomOk || !node) {
        return;
    }

    DomProcessingGuard guard;
    ProcessNode(runtime, node, HasExcludedAncestor(runtime, element));
}

void ProcessWindow(WindowContext* context) {
    if (g_unloading || !context->attached ||
        !IsRuntimeLoaded(context->runtime)) {
        return;
    }

    HELEMENT root = nullptr;
    if (context->runtime->getRootElement(context->window, &root) == kScDomOk &&
        root) {
        ProcessElement(context->runtime, root);
    }
}

SBOOL __stdcall SciterEventHandler(void* tag,
                                   HELEMENT,
                                   UINT eventGroup,
                                   void* parameters) {
    auto* context = static_cast<WindowContext*>(tag);
    if (!context || !parameters) {
        return FALSE;
    }

    if (eventGroup == kHandleInitialization) {
        auto* initialization = static_cast<InitializationParams*>(parameters);
        if (initialization->cmd == kBehaviorDetach) {
            context->attached = false;
        }
        return FALSE;
    }

    if (eventGroup != kHandleBehaviorEvent || g_unloading ||
        g_processingDom) {
        return FALSE;
    }

    auto* event = static_cast<BehaviorEventParamsPrefix*>(parameters);
    if (event->cmd & kSinking) {
        return FALSE;
    }

    const UINT eventCode = event->cmd & kEventCodeMask;
    if (eventCode == kContentChanged || eventCode == kDocumentComplete) {
        if (event->target) {
            ProcessElement(context->runtime, event->target);
        } else {
            ProcessWindow(context);
        }
    }

    return FALSE;
}

bool RegisterSciterRuntime(HMODULE module) {
    if (!module || g_registeringRuntime || g_unloading) {
        return false;
    }

    auto sciterApiExport = reinterpret_cast<SciterApiExport>(
        GetProcAddress(module, "SciterAPI"));
    if (!sciterApiExport) {
        return false;
    }

    g_registeringRuntime = true;
    void* api = sciterApiExport();
    g_registeringRuntime = false;
    if (!api) {
        return false;
    }

    const UINT apiVersion = *static_cast<UINT*>(api);
    if (apiVersion != 9 && apiVersion != 10) {
        Wh_Log(L"Ignoring unsupported Sciter API version %u", apiVersion);
        return false;
    }

    AcquireSRWLockShared(&g_stateLock);
    for (const auto& runtime : g_runtimes) {
        if (runtime->api == api) {
            ReleaseSRWLockShared(&g_stateLock);
            return true;
        }
    }
    ReleaseSRWLockShared(&g_stateLock);

    auto runtime = std::make_unique<SciterRuntime>();
    runtime->module = module;
    runtime->api = api;
    runtime->apiVersion = apiVersion;

    auto className =
        GetSciterApiFunction<SciterClassNameFn>(api, kApiSciterClassName);
    if (className) {
        if (LPCWSTR value = className()) {
            runtime->className = value;
        }
    }

    runtime->getRootElement = GetSciterApiFunction<SciterGetRootElementFn>(
        api, kApiSciterGetRootElement);
    runtime->getParentElement = GetSciterApiFunction<SciterGetParentElementFn>(
        api, kApiSciterGetParentElement);
    runtime->getAttributeByNameCb =
        GetSciterApiFunction<SciterGetAttributeByNameCbFn>(
            api, kApiSciterGetAttributeByNameCb);
    runtime->getElementType = GetSciterApiFunction<SciterGetElementTypeFn>(
        api, kApiSciterGetElementType);
    runtime->windowAttachEventHandler =
        GetSciterApiFunction<SciterWindowAttachEventHandlerFn>(
            api, kApiSciterWindowAttachEventHandler);
    runtime->windowDetachEventHandler =
        GetSciterApiFunction<SciterWindowDetachEventHandlerFn>(
            api, kApiSciterWindowDetachEventHandler);
    runtime->nodeCastFromElement =
        GetSciterApiFunction<SciterNodeCastFromElementFn>(
            api, kApiSciterNodeCastFromElement);
    runtime->nodeCastToElement =
        GetSciterApiFunction<SciterNodeCastToElementFn>(
            api, kApiSciterNodeCastToElement);
    runtime->nodeFirstChild = GetSciterApiFunction<SciterNodeFirstChildFn>(
        api, kApiSciterNodeFirstChild);
    runtime->nodeNextSibling = GetSciterApiFunction<SciterNodeNextSiblingFn>(
        api, kApiSciterNodeNextSibling);
    runtime->nodeType = GetSciterApiFunction<SciterNodeTypeFn>(
        api, kApiSciterNodeType);
    runtime->nodeGetText = GetSciterApiFunction<SciterNodeGetTextFn>(
        api, kApiSciterNodeGetText);
    runtime->nodeSetText = GetSciterApiFunction<SciterNodeSetTextFn>(
        api, kApiSciterNodeSetText);

    if (!runtime->getRootElement || !runtime->getParentElement ||
        !runtime->getAttributeByNameCb || !runtime->getElementType ||
        !runtime->windowAttachEventHandler ||
        !runtime->windowDetachEventHandler ||
        !runtime->nodeCastFromElement || !runtime->nodeCastToElement ||
        !runtime->nodeFirstChild || !runtime->nodeNextSibling ||
        !runtime->nodeType || !runtime->nodeGetText ||
        !runtime->nodeSetText) {
        Wh_Log(L"Ignoring an incomplete Sciter API table");
        return false;
    }

    WCHAR modulePath[MAX_PATH];
    const DWORD modulePathLength =
        GetModuleFileNameW(module, modulePath, ARRAYSIZE(modulePath));

    AcquireSRWLockExclusive(&g_stateLock);
    for (const auto& existingRuntime : g_runtimes) {
        if (existingRuntime->api == api) {
            ReleaseSRWLockExclusive(&g_stateLock);
            return true;
        }
    }
    g_runtimes.push_back(std::move(runtime));
    ReleaseSRWLockExclusive(&g_stateLock);

    Wh_Log(L"Found Sciter API v%u: %.*s", apiVersion,
           static_cast<int>(modulePathLength),
           modulePathLength ? modulePath : L"");
    return true;
}

void DiscoverLoadedSciterRuntimes() {
    HANDLE snapshot = CreateToolhelp32Snapshot(
        TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, GetCurrentProcessId());
    if (snapshot == INVALID_HANDLE_VALUE) {
        return;
    }

    MODULEENTRY32W moduleEntry{};
    moduleEntry.dwSize = sizeof(moduleEntry);
    if (Module32FirstW(snapshot, &moduleEntry)) {
        do {
            RegisterSciterRuntime(moduleEntry.hModule);
        } while (Module32NextW(snapshot, &moduleEntry));
    }
    CloseHandle(snapshot);
}

bool HasAttachedContext(HWND window) {
    bool found = false;
    AcquireSRWLockShared(&g_stateLock);
    for (const auto& context : g_windowContexts) {
        if (context->window == window && context->attached) {
            found = true;
            break;
        }
    }
    ReleaseSRWLockShared(&g_stateLock);
    return found;
}

void TryAttachWindowOnCurrentThread(HWND window) {
    if (!window || g_unloading || g_attachingWindow ||
        HasAttachedContext(window)) {
        return;
    }

    DWORD processId = 0;
    const DWORD threadId = GetWindowThreadProcessId(window, &processId);
    if (!threadId || processId != GetCurrentProcessId() ||
        threadId != GetCurrentThreadId()) {
        return;
    }

    std::vector<SciterRuntime*> runtimes;
    AcquireSRWLockShared(&g_stateLock);
    for (const auto& runtime : g_runtimes) {
        runtimes.push_back(runtime.get());
    }
    ReleaseSRWLockShared(&g_stateLock);

    WCHAR windowClass[256] = L"";
    GetClassNameW(window, windowClass, ARRAYSIZE(windowClass));

    g_attachingWindow = true;
    for (SciterRuntime* runtime : runtimes) {
        if (!IsRuntimeLoaded(runtime)) {
            continue;
        }

        HELEMENT root = nullptr;
        const bool hasSciterClass =
            !runtime->className.empty() &&
            _wcsicmp(runtime->className.c_str(), windowClass) == 0;
        if (!hasSciterClass) {
            continue;
        }

        const bool hasRoot =
            runtime->getRootElement(window, &root) == kScDomOk && root;

        auto context = std::make_unique<WindowContext>();
        context->window = window;
        context->runtime = runtime;
        context->attached = true;
        WindowContext* contextPointer = context.get();

        const SCDOM_RESULT result = runtime->windowAttachEventHandler(
            window, SciterEventHandler, contextPointer, kHandleBehaviorEvent);
        if (result != kScDomOk) {
            context->attached = false;
            continue;
        }

        AcquireSRWLockExclusive(&g_stateLock);
        g_windowContexts.push_back(std::move(context));
        ReleaseSRWLockExclusive(&g_stateLock);

        Wh_Log(L"Attached to Sciter window 0x%p (%s)", window, windowClass);
        if (hasRoot) {
            ProcessElement(runtime, root);
        } else {
            ProcessWindow(contextPointer);
        }
        break;
    }
    g_attachingWindow = false;
}

using WindowThreadProcedure = void(WINAPI*)(void*);

UINT g_runFromWindowThreadMessage;

struct RunFromWindowThreadParameter {
    WindowThreadProcedure procedure;
    void* parameter;
};

LRESULT CALLBACK RunFromWindowThreadHook(int code,
                                         WPARAM wParam,
                                         LPARAM lParam) {
    if (code == HC_ACTION) {
        const auto* call = reinterpret_cast<const CWPSTRUCT*>(lParam);
        if (call->message == g_runFromWindowThreadMessage) {
            auto* run = reinterpret_cast<RunFromWindowThreadParameter*>(
                call->lParam);
            run->procedure(run->parameter);
        }
    }
    return CallNextHookEx(nullptr, code, wParam, lParam);
}

bool RunFromWindowThread(HWND window,
                         WindowThreadProcedure procedure,
                         void* parameter) {
    DWORD processId = 0;
    const DWORD threadId = GetWindowThreadProcessId(window, &processId);
    if (!threadId || processId != GetCurrentProcessId()) {
        return false;
    }

    if (threadId == GetCurrentThreadId()) {
        procedure(parameter);
        return true;
    }

    HHOOK hook = SetWindowsHookExW(WH_CALLWNDPROC, RunFromWindowThreadHook,
                                   nullptr, threadId);
    if (!hook) {
        return false;
    }

    RunFromWindowThreadParameter run{procedure, parameter};
    SendMessageW(window, g_runFromWindowThreadMessage, 0,
                 reinterpret_cast<LPARAM>(&run));
    UnhookWindowsHookEx(hook);
    return true;
}

void WINAPI AttachWindowProcedure(void* parameter) {
    TryAttachWindowOnCurrentThread(static_cast<HWND>(parameter));
}

void ScheduleWindowAttachment(HWND window) {
    if (!g_unloading && !HasAttachedContext(window)) {
        RunFromWindowThread(window, AttachWindowProcedure, window);
    }
}

BOOL CALLBACK DiscoverChildWindow(HWND window, LPARAM) {
    ScheduleWindowAttachment(window);
    return TRUE;
}

BOOL CALLBACK DiscoverTopLevelWindow(HWND window, LPARAM) {
    DWORD processId = 0;
    if (GetWindowThreadProcessId(window, &processId) &&
        processId == GetCurrentProcessId()) {
        ScheduleWindowAttachment(window);
        EnumChildWindows(window, DiscoverChildWindow, 0);
    }
    return TRUE;
}

void DiscoverExistingSciterWindows() {
    EnumWindows(DiscoverTopLevelWindow, 0);
}

using CreateWindowExWFn = decltype(&CreateWindowExW);
CreateWindowExWFn g_originalCreateWindowExW;

HWND WINAPI CreateWindowExWHook(DWORD extendedStyle,
                                LPCWSTR className,
                                LPCWSTR windowName,
                                DWORD style,
                                int x,
                                int y,
                                int width,
                                int height,
                                HWND parent,
                                HMENU menu,
                                HINSTANCE instance,
                                void* parameter) {
    HWND window = g_originalCreateWindowExW(
        extendedStyle, className, windowName, style, x, y, width, height, parent,
        menu, instance, parameter);
    TryAttachWindowOnCurrentThread(window);
    return window;
}

using CreateWindowExAFn = decltype(&CreateWindowExA);
CreateWindowExAFn g_originalCreateWindowExA;

HWND WINAPI CreateWindowExAHook(DWORD extendedStyle,
                                LPCSTR className,
                                LPCSTR windowName,
                                DWORD style,
                                int x,
                                int y,
                                int width,
                                int height,
                                HWND parent,
                                HMENU menu,
                                HINSTANCE instance,
                                void* parameter) {
    HWND window = g_originalCreateWindowExA(
        extendedStyle, className, windowName, style, x, y, width, height, parent,
        menu, instance, parameter);
    TryAttachWindowOnCurrentThread(window);
    return window;
}

using LoadLibraryExWFn = decltype(&LoadLibraryExW);
LoadLibraryExWFn g_originalLoadLibraryExW;

HMODULE WINAPI LoadLibraryExWHook(LPCWSTR fileName, HANDLE file, DWORD flags) {
    HMODULE module = g_originalLoadLibraryExW(fileName, file, flags);
    RegisterSciterRuntime(module);
    return module;
}

using LoadLibraryExAFn = decltype(&LoadLibraryExA);
LoadLibraryExAFn g_originalLoadLibraryExA;

HMODULE WINAPI LoadLibraryExAHook(LPCSTR fileName, HANDLE file, DWORD flags) {
    HMODULE module = g_originalLoadLibraryExA(fileName, file, flags);
    RegisterSciterRuntime(module);
    return module;
}

void WINAPI DetachWindowProcedure(void* parameter) {
    auto* context = static_cast<WindowContext*>(parameter);
    if (!context->attached) {
        return;
    }

    if (!IsRuntimeLoaded(context->runtime)) {
        context->attached = false;
        return;
    }

    const SCDOM_RESULT result =
        context->runtime->windowDetachEventHandler(
        context->window, SciterEventHandler, context);
    if (result == kScDomOk || !IsWindow(context->window)) {
        context->attached = false;
    } else {
        Wh_Log(L"Failed to detach from Sciter window 0x%p: %u",
               context->window, result);
    }
}

bool InstallHooks() {
    HMODULE user32 = GetModuleHandleW(L"user32.dll");
    HMODULE kernelBase = GetModuleHandleW(L"kernelbase.dll");
    if (!user32 || !kernelBase) {
        return false;
    }

    auto createWindowExW = GetProcAddress(user32, "CreateWindowExW");
    auto createWindowExA = GetProcAddress(user32, "CreateWindowExA");
    auto loadLibraryExW = GetProcAddress(kernelBase, "LoadLibraryExW");
    auto loadLibraryExA = GetProcAddress(kernelBase, "LoadLibraryExA");
    if (!createWindowExW || !createWindowExA || !loadLibraryExW ||
        !loadLibraryExA) {
        return false;
    }

    return Wh_SetFunctionHook(
               reinterpret_cast<void*>(createWindowExW),
               reinterpret_cast<void*>(CreateWindowExWHook),
               reinterpret_cast<void**>(&g_originalCreateWindowExW)) &&
           Wh_SetFunctionHook(
               reinterpret_cast<void*>(createWindowExA),
               reinterpret_cast<void*>(CreateWindowExAHook),
               reinterpret_cast<void**>(&g_originalCreateWindowExA)) &&
           Wh_SetFunctionHook(
               reinterpret_cast<void*>(loadLibraryExW),
               reinterpret_cast<void*>(LoadLibraryExWHook),
               reinterpret_cast<void**>(&g_originalLoadLibraryExW)) &&
           Wh_SetFunctionHook(
               reinterpret_cast<void*>(loadLibraryExA),
               reinterpret_cast<void*>(LoadLibraryExAHook),
               reinterpret_cast<void**>(&g_originalLoadLibraryExA));
}

}  // namespace

BOOL Wh_ModInit() {
    Wh_Log(L"Init");
    LoadSettings();
    if (g_replacementItems.empty()) {
        Wh_Log(L"No replacements configured for this process");
        return FALSE;
    }

    g_runFromWindowThreadMessage = RegisterWindowMessageW(
        L"Windhawk_RunFromWindowThread_" WH_MOD_ID);
    if (!g_runFromWindowThreadMessage) {
        Wh_Log(L"Failed to register the UI-thread dispatch message");
        return FALSE;
    }

    DiscoverLoadedSciterRuntimes();
    if (!InstallHooks()) {
        Wh_Log(L"Failed to install required hooks");
        return FALSE;
    }
    return TRUE;
}

void Wh_ModAfterInit() {
    DiscoverExistingSciterWindows();
}

void Wh_ModUninit() {
    Wh_Log(L"Uninit");
    g_unloading = true;

    std::vector<WindowContext*> contexts;
    AcquireSRWLockShared(&g_stateLock);
    for (const auto& context : g_windowContexts) {
        if (context->attached) {
            contexts.push_back(context.get());
        }
    }
    ReleaseSRWLockShared(&g_stateLock);

    for (WindowContext* context : contexts) {
        if (IsWindow(context->window)) {
            if (!RunFromWindowThread(context->window, DetachWindowProcedure,
                                     context)) {
                Wh_Log(L"Failed to dispatch detach for Sciter window 0x%p",
                       context->window);
            }
        } else {
            context->attached = false;
        }
    }
}

BOOL Wh_ModSettingsChanged(BOOL* reload) {
    *reload = TRUE;
    return TRUE;
}
