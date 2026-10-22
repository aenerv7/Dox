// SizerSwift —— macOS 原生菜单栏窗口调整工具。
//
// 功能对齐 Windows 版 SizerWin：自动（工作区 3/4 并居中）、居中、水平居中、垂直居中、
// 预设分辨率（⌥ 按住 = 调整并居中）、自定义尺寸对话框、配置文件自动补全与热重载、单实例。
// UI 遵循 macOS 规范：菜单栏常驻图标 + NSMenu + 原生对话框；窗口移动/缩放用 CVDisplayLink
// 逐帧驱动 Accessibility API，按真实时间插值，手感对齐原生「窗口 > 移动与调整大小 > 居中」。

import Cocoa
import CoreGraphics
import CoreVideo
import QuartzCore
import ServiceManagement

// MARK: - 多语言

struct L10n {
    static func localized(_ en: String, zh: String, zhCN: String) -> String {
        let lang = Locale.preferredLanguages.first ?? "en"
        if lang.hasPrefix("zh-Hant") || lang.hasPrefix("zh-TW") || lang.hasPrefix("zh-HK") || lang.hasPrefix("zh-MO") {
            return zh
        } else if lang.hasPrefix("zh") {
            return zhCN
        }
        return en
    }

    // 菜单项（对齐 SizerWin 菜单顺序）
    static var autoTitle: String { localized("Auto", zh: "自動", zhCN: "自动") }
    static var centre: String { localized("Centre", zh: "居中", zhCN: "居中") }
    static var centreHorizontal: String { localized("Horizontal Centre", zh: "水平居中", zhCN: "水平居中") }
    static var centreVertical: String { localized("Vertical Centre", zh: "垂直居中", zhCN: "垂直居中") }
    static var custom: String { localized("Custom…", zh: "自訂…", zhCN: "自定义…") }
    static var launchAtLogin: String { localized("Launch at Login", zh: "登入時啟動", zhCN: "开机自启动") }
    static var quit: String { localized("Quit SizerSwift", zh: "結束 SizerSwift", zhCN: "退出 SizerSwift") }
    static var tooltip: String { "SizerSwift" }

    // 预设：按住 ⌥ 时标题变化
    static func presetTitle(_ preset: SizePreset) -> String { "\(preset.width)x\(preset.height)" }
    static func presetTitleCentre(_ preset: SizePreset) -> String {
        let size = presetTitle(preset)
        return localized("Resize and Centre \(size)", zh: "調整並居中 \(size)", zhCN: "调整并居中 \(size)")
    }

    // 自定义尺寸对话框
    static var customTitle: String { localized("Custom Size", zh: "自訂尺寸", zhCN: "自定义尺寸") }
    static var customInformative: String {
        localized(
            "Enter the width and height in points. Press Return to resize, ⌘Return to resize and centre.",
            zh: "以點為單位輸入寬度與高度。按 Return 調整尺寸，⌘Return 調整並居中。",
            zhCN: "以点为单位输入宽度和高度。按 Return 调整尺寸，⌘Return 调整并居中。"
        )
    }
    static var width: String { localized("Width", zh: "寬度", zhCN: "宽度") }
    static var height: String { localized("Height", zh: "高度", zhCN: "高度") }
    static var resize: String { localized("Resize", zh: "調整尺寸", zhCN: "调整尺寸") }
    static var resizeAndCentre: String { localized("Resize and Centre", zh: "調整並居中", zhCN: "调整并居中") }
    static var cancel: String { localized("Cancel", zh: "取消", zhCN: "取消") }

    // 提示
    static var accessibilityTitle: String {
        localized("Accessibility Permission Required", zh: "需要輔助使用權限", zhCN: "需要辅助功能权限")
    }
    static var accessibilityBody: String {
        localized(
            "SizerSwift needs accessibility permission to manage windows.\n\nIf you see an old entry for SizerSwift in System Settings → Privacy & Security → Accessibility, please remove it first, then re-add the current app.",
            zh: "SizerSwift 需要輔助使用權限來管理視窗。\n\n若「系統設定 → 隱私與安全性 → 輔助使用」中已有舊的 SizerSwift 項目，請先移除再重新加入目前的 App。",
            zhCN: "SizerSwift 需要辅助功能权限来管理窗口。\n\n若「系统设置 → 隐私与安全性 → 辅助功能」中已有旧的 SizerSwift 条目，请先移除再重新添加当前应用。"
        )
    }
    static var openSystemSettings: String { localized("Open System Settings", zh: "打開系統設定", zhCN: "打开系统设置") }
    /// 未授权时菜单栏菜单顶部的提示项。
    static var grantAccessibility: String {
        localized("Grant Accessibility Permission…", zh: "開啟輔助使用權限…", zhCN: "打开辅助功能权限…")
    }
    static var later: String { localized("Later", zh: "稍後", zhCN: "稍后") }
    static var ok: String { localized("OK", zh: "好", zhCN: "好") }

    static func alreadyRunning(pid: pid_t) -> String {
        let body = localized(
            "SizerSwift is already running (PID \(pid)). This instance will exit.",
            zh: "SizerSwift 已在執行（PID \(pid)），本次啟動將結束。",
            zhCN: "SizerSwift 已在运行（PID \(pid)），本次启动将退出。"
        )
        return body
    }

    static func configError(path: String) -> String {
        localized(
            "Unable to read or create the configuration file:\n\(path)\n\nCheck that the folder is writable for the current user.\n\nSizerSwift will exit.",
            zh: "無法讀取或建立設定檔：\n\(path)\n\n請確認目前使用者對該目錄有讀寫權限。\n\nSizerSwift 將結束。",
            zhCN: "无法读取或创建配置文件：\n\(path)\n\n请确认当前用户对该目录有读写权限。\n\nSizerSwift 将退出。"
        )
    }

    static var hotkeyUnavailable: String {
        localized(
            "Failed to register the global hotkey. It may be blocked by another program, or accessibility permission was not granted.",
            zh: "註冊全局快速鍵失敗，可能已被其他程式占用，或未授予輔助使用權限。",
            zhCN: "注册全局快捷键失败，可能已被其他程序占用，或未授予辅助功能权限。"
        )
    }
}

// MARK: - 预设与快捷键模型

struct SizePreset: Equatable {
    let width: Int
    let height: Int
}

/// 可绑定快捷键的动作。`rawValue` 同时是配置文件 `[Hotkeys]` 分区里的键名，顺序即文件顺序。
enum HotkeyAction: String, CaseIterable {
    case showMenu = "ShowMenu"
    case auto = "Auto"
    case centre = "Centre"
    case centreHorizontal = "CentreHorizontal"
    case centreVertical = "CentreVertical"
    case custom = "Custom"

    /// 出厂默认绑定（其余动作默认留空）。
    var defaultSpec: String {
        switch self {
        case .centre: return "opt+cmd+c"
        case .auto: return "ctrl+opt+cmd+c"
        default: return ""
        }
    }
}

/// 一个已解析的快捷键：keyCode + 修饰键。`spec` 只用于回写配置，不参与相等性判断——
/// 否则 `ctrl+opt+c` 与 `control+opt+c` 会被当成两个不同的绑定，冲突检测失效。
struct HotkeyBinding {
    let keyCode: Int64
    let modifiers: CGEventFlags
    let spec: String

    /// 菜单项显示用的按键字符（无法用 NSMenuItem 表示时为 nil）。
    var keyEquivalent: String? { KeyTable.equivalent(forKeyCode: keyCode) }
    var modifierMask: NSEvent.ModifierFlags {
        NSEvent.ModifierFlags(carbonModifiers: modifiers)
    }
}

extension HotkeyBinding: Equatable, Hashable {
    static func == (lhs: HotkeyBinding, rhs: HotkeyBinding) -> Bool {
        lhs.keyCode == rhs.keyCode && lhs.modifiers == rhs.modifiers
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(keyCode)
        hasher.combine(modifiers.rawValue)
    }
}

extension NSEvent.ModifierFlags {
    init(carbonModifiers flags: CGEventFlags) {
        var mask: NSEvent.ModifierFlags = []
        if flags.contains(.maskControl) { mask.insert(.control) }
        if flags.contains(.maskAlternate) { mask.insert(.option) }
        if flags.contains(.maskShift) { mask.insert(.shift) }
        if flags.contains(.maskCommand) { mask.insert(.command) }
        self = mask
    }
}

/// 按键名 ↔ 虚拟 keyCode ↔ NSMenuItem keyEquivalent 对照表。
enum KeyTable {
    /// 配置文件里可用的按键名（全部小写）。
    static let keyCodes: [String: Int64] = [
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
        "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "o": 31, "u": 32,
        "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46,
        "1": 18, "2": 19, "3": 20, "4": 21, "5": 23, "6": 22, "7": 26, "8": 28, "9": 25, "0": 29,
        "-": 27, "minus": 27, "=": 24, "plus": 24, "[": 33, "leftbracket": 33,
        "]": 30, "rightbracket": 30, "\\": 42, "backslash": 42, ";": 41, "semicolon": 41,
        "'": 39, "quote": 39, ",": 43, "comma": 43, ".": 47, "period": 47, "/": 44, "slash": 44,
        "`": 50, "grave": 50,
        "space": 49, "return": 36, "enter": 36, "tab": 48, "esc": 53, "escape": 53,
        "delete": 51, "backspace": 51, "forwarddelete": 117,
        "home": 115, "end": 119, "pageup": 116, "pagedown": 121,
        "left": 123, "right": 124, "down": 125, "up": 126,
        "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97, "f7": 98, "f8": 100,
        "f9": 101, "f10": 109, "f11": 103, "f12": 111, "f13": 105, "f14": 107, "f15": 113,
        "f16": 106, "f17": 64, "f18": 71, "f19": 72, "f20": 90,
    ]

    static let modifierNames: [String: CGEventFlags] = [
        "ctrl": .maskControl, "control": .maskControl, "\u{2303}": .maskControl,
        "opt": .maskAlternate, "option": .maskAlternate, "alt": .maskAlternate, "\u{2325}": .maskAlternate,
        "cmd": .maskCommand, "command": .maskCommand, "\u{2318}": .maskCommand,
        "shift": .maskShift, "\u{21e7}": .maskShift,
    ]

    /// 只接受 ctrl/opt/cmd 三种组合键前缀；仅 shift 或无修饰键会劫持正常输入，直接拒绝。
    static let requiredModifiers: CGEventFlags = [.maskControl, .maskAlternate, .maskCommand]

    /// 解析 `ctrl+opt+cmd+c` 这类字符串。非法或危险的写法返回 nil。
    static func parse(_ spec: String) -> HotkeyBinding? {
        let trimmed = spec.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return nil }
        let parts = trimmed.split(separator: "+", omittingEmptySubsequences: false).map {
            $0.trimmingCharacters(in: .whitespaces)
        }
        guard parts.count >= 2 else { return nil }

        var modifiers: CGEventFlags = []
        for token in parts.dropLast() {
            guard let flag = modifierNames[token] else { return nil }
            modifiers.insert(flag)
        }
        guard let keyCode = keyCodes[parts.last ?? ""] else { return nil }
        guard !modifiers.intersection(requiredModifiers).isEmpty else { return nil }

        let canonical = parts.joined(separator: "+")
        return HotkeyBinding(keyCode: keyCode, modifiers: modifiers, spec: canonical)
    }

    /// keyCode → NSMenuItem 可显示的 keyEquivalent 字符。
    static func equivalent(forKeyCode keyCode: Int64) -> String? {
        if let name = keyCodes.first(where: { $0.value == keyCode && $0.key.count == 1 })?.key {
            return name
        }
        switch keyCode {
        case 49: return " "                      // space
        case 36: return "\r"                     // return
        case 48: return "\t"                     // tab
        case 53: return "\u{1b}"                 // esc
        case 126: return functionKey(NSUpArrowFunctionKey)
        case 125: return functionKey(NSDownArrowFunctionKey)
        case 123: return functionKey(NSLeftArrowFunctionKey)
        case 124: return functionKey(NSRightArrowFunctionKey)
        case 51: return functionKey(NSDeleteFunctionKey)
        case 117: return functionKey(NSDeleteCharFunctionKey)
        case 115: return functionKey(NSHomeFunctionKey)
        case 119: return functionKey(NSEndFunctionKey)
        case 116: return functionKey(NSPageUpFunctionKey)
        case 121: return functionKey(NSPageDownFunctionKey)
        default:
            // F1..F20
            if let name = keyCodes.first(where: { $0.value == keyCode && $0.key.hasPrefix("f") })?.key,
               let n = Int(name.dropFirst()), (1...20).contains(n) {
                return functionKey(NSF1FunctionKey + n - 1)
            }
            return nil
        }
    }

    private static func functionKey(_ value: Int) -> String? {
        guard let scalar = UnicodeScalar(UInt32(value)) else { return nil }
        return String(scalar)
    }
}

// MARK: - 配置

struct AppConfig {
    var presets: [SizePreset] = []
    /// 水平组结束位置，此下标之前是 `[Horizontal]`，之后是 `[Vertical]`（之间插分隔线）。
    var separatorAfter: Int = 0
    /// 动作 → 绑定；nil / 缺项表示未绑定。
    var hotkeys: [HotkeyAction: HotkeyBinding] = [:]

    static let `default` = AppConfig()
}

/// 动作键名不区分大小写：`auto`、`Auto`、`AUTO` 等价。
/// 配置文件其余部分（表头、修饰键、按键名）本来就忽略大小写，这里不能例外，
/// 否则 `centre = opt+cmd+m` 会被当成未知键忽略，然后被 ensureHotkeyKeys 用默认值覆盖。
func hotkeyAction(named name: String) -> HotkeyAction? {
    HotkeyAction.allCases.first { $0.rawValue.caseInsensitiveCompare(name) == .orderedSame }
}

enum ConfigStore {
    static let fileName = "SizerSwift.ini"
    static let maxPresets = 64
    static let maxFileSize = 8192
    /// 预设边长上限：超过这个值只可能是手滑写错，按非法行跳过（也避免整数溢出）。
    static let maxPresetDimension = 100_000

    static let defaultHorizontal = [
        SizePreset(width: 640, height: 480), SizePreset(width: 1024, height: 768),
        SizePreset(width: 1280, height: 720), SizePreset(width: 1280, height: 800),
        SizePreset(width: 1600, height: 900), SizePreset(width: 1600, height: 1000),
        SizePreset(width: 1920, height: 1080), SizePreset(width: 1920, height: 1200),
    ]
    static let defaultVertical = [
        SizePreset(width: 480, height: 854), SizePreset(width: 720, height: 1280),
        SizePreset(width: 800, height: 1280),
    ]

    private static var cached: AppConfig?
    private static var cachedStamp: FileStamp?

    struct FileStamp: Equatable {
        let size: Int64
        let modified: Date
    }

    static var directory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent("SizerSwift", isDirectory: true)
    }

    static var fileURL: URL { directory.appendingPathComponent(fileName) }

    /// 默认配置文件内容（首次运行生成）。
    static var defaultContent: String {
        var text = "[Horizontal]\n"
        for p in defaultHorizontal { text += "\(p.width)x\(p.height)\n" }
        text += "\n[Vertical]\n"
        for p in defaultVertical { text += "\(p.width)x\(p.height)\n" }
        text += "\n[Hotkeys]\n"
        text += hotkeyComment
        for action in HotkeyAction.allCases {
            text += "\(action.rawValue) = \(action.defaultSpec)\n"
        }
        return text
    }

    static let hotkeyComment =
        "; 修饰键：ctrl / opt / cmd / shift，用 + 连接，最后接按键名；留空表示不绑定。\n" +
        "; 按键名支持 a-z、0-9、f1-f20、space、return、tab、esc、up/down/left/right、home/end/pageup/pagedown 与常见符号。\n" +
        "; 例：ShowMenu = shift+opt+space，Centre = opt+cmd+c\n"

    /// 读取配置；文件缺失时生成默认内容。权限类错误视为致命（弹窗后退出），与 SizerWin 一致。
    static func load() -> AppConfig {
        let url = fileURL
        let fm = FileManager.default

        do {
            try fm.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            if isPermissionError(error) { fatalConfigError(error) }
        }

        if !fm.fileExists(atPath: url.path) {
            do {
                try defaultContent.write(to: url, atomically: true, encoding: .utf8)
            } catch {
                if isPermissionError(error) { fatalConfigError(error) }
                return defaultPresetsOnly()
            }
        }

        var data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            if isPermissionError(error) { fatalConfigError(error) }
            return defaultPresetsOnly()
        }

        if data.isEmpty || data.count > maxFileSize {
            return defaultPresetsOnly()
        }

        let text = String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)
        // 补写缺失的 [Hotkeys] 键后再解析，保证内存与磁盘一致。
        let finalText = ensureHotkeyKeys(text: text, url: url)
        let config = parse(finalText)
        cached = config
        cachedStamp = stamp(of: url)
        return config
    }

    /// 仅在文件确实变化时重新读取（每次按键都调用，因此只 stat 不读盘）。
    static func reloadIfChanged() -> AppConfig {
        let url = fileURL
        let current = stamp(of: url)
        if let cached, let current, current == cachedStamp { return cached }
        if let cached, current == nil { return cached }
        return load()
    }

    private static func stamp(of url: URL) -> FileStamp? {
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let date = attrs[.modificationDate] as? Date else { return nil }
        let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
        return FileStamp(size: size, modified: date)
    }

    /// 解析 ini：`[Horizontal]` / `[Vertical]` / `[Hotkeys]`，`;`、`#` 为注释。
    static func parse(_ text: String) -> AppConfig {
        var config = AppConfig()
        var inHotkeys = false
        var separatorAfter = -1
        // 记录文件里真实出现过的动作键：写了 `Centre =`（空值）是用户显式解绑，
        // 只有整行缺失才由 ensureHotkeyKeys 补回默认值。
        var presentActions = Set<HotkeyAction>()

        for rawLine in text.components(separatedBy: .newlines) {
            let line = rawLine.trimmingCharacters(in: CharacterSet(charactersIn: " \t"))
            guard !line.isEmpty else { continue }
            let first = line[line.startIndex]
            if first == ";" || first == "#" { continue }

            if first == "[" {
                let lower = line.lowercased()
                // 与 SizerWin 一致：只有长度 ≥10 且第 2 个字符是 V/v 的表头才算垂直分区，
                // 否则 `[V]`、`[Video]` 这类行会误开一个新组。
                if lower.count >= 10, lower.hasPrefix("[v") {
                    // 也算一个普通分区头：必须退出 hotkey 模式，否则 `[Hotkeys]` 写在 `[Vertical]`
                    // 前面的文件会把垂直预设当成 `=` 行吐掉，菜单里静默少一半预设。
                    inHotkeys = false
                    if separatorAfter < 0 { separatorAfter = config.presets.count }
                } else if lower.hasPrefix("[hotkey") {
                    inHotkeys = true
                } else {
                    inHotkeys = false
                }
                continue
            }

            if inHotkeys {
                guard let eq = line.firstIndex(of: "=") else { continue }
                let key = line[line.startIndex..<eq].trimmingCharacters(in: .whitespaces)
                let value = String(line[line.index(after: eq)...])
                // 动作键不区分大小写（与表头、修饰键、按键名保持一致）。
                guard let action = hotkeyAction(named: key) else { continue }
                presentActions.insert(action)
                if let binding = KeyTable.parse(value) {
                    // 同一组合被多个动作占用时，先出现的动作生效。
                    if !config.hotkeys.values.contains(binding) { config.hotkeys[action] = binding }
                }
                continue
            }

            // WxH
            guard let preset = parsePreset(line) else { continue }
            if config.presets.count < maxPresets { config.presets.append(preset) }
        }

        if config.presets.isEmpty {
            config.presets = defaultHorizontal + defaultVertical
            config.separatorAfter = defaultHorizontal.count
        } else {
            config.separatorAfter = separatorAfter < 0 ? config.presets.count : separatorAfter
        }

        // 只给「文件里整行都没写」的动作补默认绑定
        for action in HotkeyAction.allCases where !presentActions.contains(action) {
            guard let binding = KeyTable.parse(action.defaultSpec) else { continue }
            if !config.hotkeys.values.contains(binding) { config.hotkeys[action] = binding }
        }
        return config
    }

    /// 解析一行里的首个 `WxH`（`x` 不区分大小写），与 SizerWin 一致。
    /// 大数字必须安全失败：Swift 的 `Int` 溢出会 trap，而 Win32 只是把该行当非法行跳过。
    static func parsePreset(_ line: String) -> SizePreset? {
        var index = line.startIndex
        var width = 0
        while index < line.endIndex, line[index].isNumber, line[index].isASCII {
            guard let digit = line[index].wholeNumberValue,
                  let next = safeAccumulate(width, digit) else { return nil }
            width = next
            index = line.index(after: index)
        }
        guard index < line.endIndex, line[index] == "x" || line[index] == "X" else { return nil }
        index = line.index(after: index)
        var height = 0
        while index < line.endIndex, line[index].isNumber, line[index].isASCII {
            guard let digit = line[index].wholeNumberValue,
                  let next = safeAccumulate(height, digit) else { return nil }
            height = next
            index = line.index(after: index)
        }
        guard width > 0, height > 0 else { return nil }
        return SizePreset(width: width, height: height)
    }

    /// 累加一位数字；超过合理上限（屏幕尺寸的几十倍）就判为非法行，而不是溢出崩溃。
    private static func safeAccumulate(_ value: Int, _ digit: Int) -> Int? {
        guard value <= maxPresetDimension / 10 else { return nil }
        let next = value * 10 + digit
        return next <= maxPresetDimension ? next : nil
    }

    /// 用户手删了 `[Hotkeys]` 里的键时补回默认行，避免「改错了不知道怎么加回来」。
    /// 返回补写后的内容（无缺失时原样返回）。
    @discardableResult
    static func ensureHotkeyKeys(text: String, url: URL) -> String {
        var lines = text.components(separatedBy: "\n")
        var present = Set<String>()
        var inHotkeys = false
        var sectionStart: Int?
        var sectionEnd = lines.count

        for (offset, rawLine) in lines.enumerated() {
            let line = rawLine.trimmingCharacters(in: CharacterSet(charactersIn: " \t"))
            if line.hasPrefix("[") {
                let lower = line.lowercased()
                if lower.hasPrefix("[hotkey") {
                    inHotkeys = true
                    sectionStart = offset + 1
                    sectionEnd = lines.count
                } else if inHotkeys {
                    sectionEnd = offset
                    inHotkeys = false
                }
                continue
            }
            guard inHotkeys, !line.isEmpty, !line.hasPrefix(";"), !line.hasPrefix("#"),
                  let eq = line.firstIndex(of: "=") else { continue }
            let key = String(line[line.startIndex..<eq]).trimmingCharacters(in: .whitespaces)
            if let action = hotkeyAction(named: key) { present.insert(action.rawValue) }
        }

        let missing = HotkeyAction.allCases.filter { !present.contains($0.rawValue) }
        guard !missing.isEmpty else { return text }
        let additions = missing.map { "\($0.rawValue) = \($0.defaultSpec)" }

        if let start = sectionStart {
            // 插到分区内最后一条非空行之后，不被尾部空行隔开。
            var insertAt = sectionEnd
            while insertAt > start, lines[insertAt - 1].trimmingCharacters(in: .whitespaces).isEmpty {
                insertAt -= 1
            }
            lines.insert(contentsOf: additions, at: insertAt)
        } else {
            while let last = lines.last, last.trimmingCharacters(in: .whitespaces).isEmpty { lines.removeLast() }
            if !lines.isEmpty { lines.append("") }
            lines.append("[Hotkeys]")
            lines.append(String(hotkeyComment.dropLast()))
            lines.append(contentsOf: additions)
            lines.append("")
        }

        let updated = lines.joined(separator: "\n")
        // 写回后如果超过大小上限，下次启动会被当成损坏文件回退默认值——
        // 这种情况下只在内存里用补全后的内容，不落盘。
        if updated.utf8.count <= maxFileSize {
            do {
                try updated.write(to: url, atomically: true, encoding: .utf8)
            } catch {
                if isPermissionError(error) { fatalConfigError(error) }
            }
        }
        return updated
    }

    private static func defaultPresetsOnly() -> AppConfig {
        var config = AppConfig()
        config.presets = defaultHorizontal + defaultVertical
        config.separatorAfter = defaultHorizontal.count
        for action in HotkeyAction.allCases {
            if let binding = KeyTable.parse(action.defaultSpec) { config.hotkeys[action] = binding }
        }
        cached = config
        cachedStamp = nil
        return config
    }

    /// 权限类错误（对应 SizerWin 的 ERROR_ACCESS_DENIED / ERROR_PRIVILEGE_NOT_HELD / ERROR_WRITE_PROTECT）。
    static func isPermissionError(_ error: Error) -> Bool {
        let nsError = error as NSError
        if let posix = nsError as? POSIXError, isPermissionPOSIX(posix.code) { return true }
        if nsError.domain == NSCocoaErrorDomain,
           nsError.code == NSFileReadNoPermissionError || nsError.code == NSFileWriteNoPermissionError {
            return true
        }
        for underlying in nsError.underlyingErrors {
            if let posix = underlying as? POSIXError, isPermissionPOSIX(posix.code) { return true }
        }
        return false
    }

    private static func isPermissionPOSIX(_ code: POSIXErrorCode) -> Bool {
        code == .EACCES || code == .EPERM || code == .EROFS
    }

    /// 配置文件权限错误：弹窗后退出，与 SizerWin 的致命错误处理一致。
    static func fatalConfigError(_ error: Error) -> Never {
        let alert = NSAlert()
        alert.messageText = "SizerSwift"
        alert.informativeText = L10n.configError(path: fileURL.path) + "\n\n\(error.localizedDescription)"
        alert.alertStyle = .warning
        alert.addButton(withTitle: L10n.ok)
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
        exit(1)
    }
}

// MARK: - 坐标与几何

enum Geometry {
    /// 主屏高度，AppKit（左下原点、y 向上）与 CG/AX（左上原点、y 向下）互转的基准。
    static var primaryScreenHeight: CGFloat { NSScreen.screens.first?.frame.height ?? 0 }

    static func toCG(_ rect: NSRect) -> CGRect {
        CGRect(x: rect.origin.x,
               y: primaryScreenHeight - rect.maxY,
               width: rect.width,
               height: rect.height)
    }

    static func toAppKit(_ rect: CGRect) -> NSRect {
        NSRect(x: rect.origin.x,
               y: primaryScreenHeight - rect.maxY,
               width: rect.width,
               height: rect.height)
    }

    /// 对应 Win32 `MonitorFromWindow(MONITOR_DEFAULTTONEAREST)`：相交面积最大的屏幕，
    /// 完全不相交时取中心距离最近的屏幕。
    static func screen(for rect: CGRect) -> NSScreen? {
        guard !NSScreen.screens.isEmpty else { return nil }
        var best: NSScreen?
        var bestArea: CGFloat = 0
        for screen in NSScreen.screens {
            let frame = toCG(screen.frame)
            let intersection = frame.intersection(rect)
            let area = intersection.isNull ? 0 : intersection.width * intersection.height
            if area > bestArea {
                bestArea = area
                best = screen
            }
        }
        if let best { return best }
        let center = CGPoint(x: rect.midX, y: rect.midY)
        return NSScreen.screens.min { lhs, rhs in
            distanceSquared(center, toCG(lhs.frame)) < distanceSquared(center, toCG(rhs.frame))
        }
    }

    private static func distanceSquared(_ point: CGPoint, _ rect: CGRect) -> CGFloat {
        let dx = max(rect.minX - point.x, point.x - rect.maxX, 0)
        let dy = max(rect.minY - point.y, point.y - rect.maxY, 0)
        return dx * dx + dy * dy
    }

    /// 屏幕工作区（避开菜单栏与 Dock），CG 坐标，对应 Win32 `rcWork`。
    static func workArea(of screen: NSScreen) -> CGRect { toCG(screen.visibleFrame) }

    static func workArea(for rect: CGRect) -> CGRect? {
        guard let screen = screen(for: rect) else { return nil }
        return workArea(of: screen)
    }
}

/// 一次窗口操作的目标：位置总是给出，size 为 nil 表示保持原尺寸。
struct Placement {
    let position: CGPoint
    let size: CGSize?
}

/// 与 SizerWin 的整数运算保持一致（`work.left + workW / 2 - w / 2`）。
enum PlacementMath {
    /// `Int(CGFloat)` 是陷阱转换：目标应用上报的畸形 AX 几何（NaN / ±inf）会直接干掉进程，
    /// 屏幕几何异常时同理。统一走这里，把不可用的值当 0 处理。
    static func safeInt(_ value: CGFloat) -> Int {
        guard value.isFinite, abs(value) < 1_000_000_000 else { return 0 }
        return Int(value)
    }

    /// 窗口与工作区的几何是否可信（全有限）。
    static func isSane(_ rect: CGRect) -> Bool {
        rect.origin.x.isFinite && rect.origin.y.isFinite && rect.width.isFinite && rect.height.isFinite
    }

    // 与 C 的 `/` 一致向零截断（Windows 工作区原点可能是负值）。
    private static func intOrigin(_ value: CGFloat) -> Int { safeInt(value) }
    private static func intSize(_ value: CGFloat) -> Int { safeInt(value) }
    /// 窗口尺寸取四舍五入：macOS 窗口可以是半点尺寸（2x 屏），截断会让居中偏 1pt。
    private static func intWindowSize(_ value: CGFloat) -> Int { safeInt(value.rounded()) }

    private static func centred(work: CGRect, width: Int, height: Int) -> CGPoint {
        let workW = intSize(work.width)
        let workH = intSize(work.height)
        return CGPoint(
            x: CGFloat(intOrigin(work.minX) + workW / 2 - width / 2),
            y: CGFloat(intOrigin(work.minY) + workH / 2 - height / 2)
        )
    }

    /// 自动：工作区 3/4 并居中。
    static func auto(window: CGRect, work: CGRect) -> Placement {
        let workW = intSize(work.width)
        let workH = intSize(work.height)
        let width = workW * 3 / 4
        let height = workH * 3 / 4
        return Placement(position: centred(work: work, width: width, height: height),
                         size: CGSize(width: width, height: height))
    }

    /// 居中：保持尺寸。
    static func centre(window: CGRect, work: CGRect) -> Placement {
        let width = intWindowSize(window.width)
        let height = intWindowSize(window.height)
        return Placement(position: centred(work: work, width: width, height: height), size: nil)
    }

    /// 水平居中：保持尺寸，只改 X。
    static func centreHorizontal(window: CGRect, work: CGRect) -> Placement {
        let width = intWindowSize(window.width)
        let workW = intSize(work.width)
        let x = intOrigin(work.minX) + workW / 2 - width / 2
        return Placement(position: CGPoint(x: CGFloat(x), y: window.minY), size: nil)
    }

    /// 垂直居中：保持尺寸，只改 Y。
    static func centreVertical(window: CGRect, work: CGRect) -> Placement {
        let height = intWindowSize(window.height)
        let workH = intSize(work.height)
        let y = intOrigin(work.minY) + workH / 2 - height / 2
        return Placement(position: CGPoint(x: window.minX, y: CGFloat(y)), size: nil)
    }

    /// 指定尺寸：centre 为 false 时保持左上角（对应 `SWP_NOMOVE`）。
    static func resize(width: Int, height: Int, centre: Bool, window: CGRect, work: CGRect) -> Placement {
        let size = CGSize(width: width, height: height)
        let position = centre
            ? centred(work: work, width: width, height: height)
            : CGPoint(x: window.minX, y: window.minY)
        return Placement(position: position, size: size)
    }
}

// MARK: - Accessibility 辅助

enum AX {
    static func copy(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
        return value
    }

    static func point(_ element: AXUIElement, _ attribute: String) -> CGPoint? {
        guard let value = copy(element, attribute), CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
        let axValue = value as! AXValue
        guard AXValueGetType(axValue) == .cgPoint else { return nil }
        var point = CGPoint.zero
        return AXValueGetValue(axValue, .cgPoint, &point) ? point : nil
    }

    static func size(_ element: AXUIElement, _ attribute: String) -> CGSize? {
        guard let value = copy(element, attribute), CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
        let axValue = value as! AXValue
        guard AXValueGetType(axValue) == .cgSize else { return nil }
        var size = CGSize.zero
        return AXValueGetValue(axValue, .cgSize, &size) ? size : nil
    }

    static func bool(_ element: AXUIElement, _ attribute: String) -> Bool? {
        guard let value = copy(element, attribute) else { return nil }
        if CFGetTypeID(value) == CFBooleanGetTypeID() {
            return (value as! CFBoolean) == kCFBooleanTrue
        }
        return (value as? NSNumber)?.boolValue
    }

    static func string(_ element: AXUIElement, _ attribute: String) -> String? {
        guard let value = copy(element, attribute), CFGetTypeID(value) == CFStringGetTypeID() else { return nil }
        return value as? String
    }

    static func windows(_ element: AXUIElement) -> [AXUIElement] {
        guard let value = copy(element, kAXWindowsAttribute as String),
              CFGetTypeID(value) == CFArrayGetTypeID() else { return [] }
        return (value as? [AXUIElement]) ?? []
    }

    @discardableResult
    static func setPoint(_ element: AXUIElement, _ attribute: String, _ point: CGPoint) -> Bool {
        var value = point
        guard let axValue = AXValueCreate(.cgPoint, &value) else { return false }
        return AXUIElementSetAttributeValue(element, attribute as CFString, axValue) == .success
    }

    @discardableResult
    static func setSize(_ element: AXUIElement, _ attribute: String, _ size: CGSize) -> Bool {
        var value = size
        guard let axValue = AXValueCreate(.cgSize, &value) else { return false }
        return AXUIElementSetAttributeValue(element, attribute as CFString, axValue) == .success
    }
}

// MARK: - 目标窗口

/// 当前要操作的窗口。AX 可用时走动画路径；不可用时只保留 frame，供模拟拖拽回退。
struct TargetWindow {
    let pid: pid_t
    let app: NSRunningApplication?
    let axApp: AXUIElement?
    let axWindow: AXUIElement?
    /// CG 坐标（左上原点、y 向下）。
    let frame: CGRect

    var canUseAX: Bool { axWindow != nil }

    /// 重新读一次真实几何。SizerWin 每次执行前都重新 `GetWindowRect`，
    /// 因为菜单可能开着很久、窗口也可能被用户或应用自己动过。
    func refreshed() -> TargetWindow {
        guard let axWindow,
              let position = AX.point(axWindow, kAXPositionAttribute as String),
              let size = AX.size(axWindow, kAXSizeAttribute as String) else { return self }
        return TargetWindow(pid: pid, app: app, axApp: axApp, axWindow: axWindow,
                            frame: CGRect(origin: position, size: size))
    }
}

enum TargetResolver {
    /// 与 SizerWin 排除桌面/任务栏一致：这些系统 UI 不作为目标窗口。
    static let excludedBundleIdentifiers: Set<String> = [
        "com.apple.dock",
        "com.apple.controlcenter",
        "com.apple.systemuiserver",
        "com.apple.WindowManager",
        "com.apple.loginwindow",
        "com.apple.notificationcenterui",
        "com.apple.securityagent",
        "com.apple.ScreenSaverEngine",
        "com.apple.Spotlight",
    ]

    /// 公开 SDK 没有这些 subrole 常量（只在 AppKit 的 NSAccessibility 协议里），用字面量。
    /// 只排除桌面/系统级窗口：普通对话框与浮动面板仍然可以被居中。
    /// 注意不要排除 `AXUnknown`——很多自定义边框/Electron 窗口就是这个 subrole。
    static let excludedWindowSubroles: Set<String> = [
        "AXDesktopWindow",
        "AXDesktopIcon",
        "AXSystemFloatingWindow",
        "AXSystemDialog",
    ]

    static func current() -> TargetWindow? {
        guard let app = NSWorkspace.shared.frontmostApplication else { return nil }
        let pid = app.processIdentifier
        if pid == ProcessInfo.processInfo.processIdentifier { return nil }
        if let identifier = app.bundleIdentifier, excludedBundleIdentifiers.contains(identifier) { return nil }

        if let target = resolveViaAX(app: app, pid: pid) { return target }
        return resolveViaWindowList(app: app, pid: pid)
    }

    private static func resolveViaAX(app: NSRunningApplication, pid: pid_t) -> TargetWindow? {
        let axApp = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(axApp, 0.25)

        var candidates: [AXUIElement] = []
        if let focused = AX.copy(axApp, kAXFocusedWindowAttribute as String),
           CFGetTypeID(focused) == AXUIElementGetTypeID() {
            candidates.append(focused as! AXUIElement)
        }
        candidates.append(contentsOf: AX.windows(axApp))

        for window in candidates {
            guard isEligible(window) else { continue }
            guard let position = AX.point(window, kAXPositionAttribute as String),
                  let size = AX.size(window, kAXSizeAttribute as String),
                  size.width >= 1, size.height >= 1 else { continue }
            return TargetWindow(pid: pid, app: app, axApp: axApp, axWindow: window,
                                frame: CGRect(origin: position, size: size))
        }
        return nil
    }

    /// 对应 SizerWin 的 `showCmd == SW_SHOWNORMAL` 校验：最小化与原生全屏窗口不响应。
    private static func isEligible(_ window: AXUIElement) -> Bool {
        if let role = AX.string(window, kAXRoleAttribute as String), role != (kAXWindowRole as String) {
            return false
        }
        if let subrole = AX.string(window, kAXSubroleAttribute as String),
           excludedWindowSubroles.contains(subrole) {
            return false
        }
        if AX.bool(window, kAXMinimizedAttribute as String) == true { return false }
        if AX.bool(window, "AXFullScreen") == true { return false }
        return true
    }

    /// AX 不暴露窗口的应用：退回 CGWindowList 查询，只能拿到位置尺寸（供模拟拖拽）。
    private static func resolveViaWindowList(app: NSRunningApplication, pid: pid_t) -> TargetWindow? {
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else { return nil }
        for entry in list {
            guard let ownerPID = entry[kCGWindowOwnerPID as String] as? Int32, ownerPID == pid,
                  let layer = entry[kCGWindowLayer as String] as? Int, layer == 0,
                  let bounds = entry[kCGWindowBounds as String] as? [String: Any],
                  let x = bounds["X"] as? CGFloat, let y = bounds["Y"] as? CGFloat,
                  let width = bounds["Width"] as? CGFloat, let height = bounds["Height"] as? CGFloat,
                  width >= 1, height >= 1 else { continue }
            return TargetWindow(pid: pid, app: app, axApp: nil, axWindow: nil,
                                frame: CGRect(x: x, y: y, width: width, height: height))
        }
        return nil
    }
}

// MARK: - 动画

/// 逐帧驱动 AX 设置窗口位置/尺寸，实现与原生「移动与调整大小」一致的平滑过渡。
/// 按真实时间插值，掉帧只会少画一帧，不会让移动忽快忽慢。
final class WindowAnimator {
    static let shared = WindowAnimator()

    /// 与 AppKit 默认动画时长一致。
    static let duration: CFTimeInterval = 0.25
    /// 小于该位移直接落位，避免几像素的移动也要跑完 0.25 秒。
    static let minimumDelta: CGFloat = 2
    /// 读几何时的 AX IPC 超时：目标应用卡死时最多损失一帧，而不是冻住主线程几秒。
    static let probeTimeout: Float = 0.05
    /// 动画期间每帧允許的 AX 耗时，略大于一帧（16.7ms）。
    static let animationTimeout: Float = 0.02
    /// 连续这么多帧写失败就放弃动画（目标窗口在拖拽中/不响应），直接把终值写一次。
    static let maxConsecutiveFailures = 6

    private struct Job {
        let window: AXUIElement
        let fromPosition: CGPoint
        let toPosition: CGPoint
        let fromSize: CGSize?
        let toSize: CGSize?
        let start: CFTimeInterval
        let duration: CFTimeInterval
        var consecutiveFailures = 0
    }

    private let lock = NSLock()
    private var job: Job?
    private var displayLink: CVDisplayLink?
    /// 已有一个待执行的 tick 排队，避免主线程忙时积压。
    private var tickPending = false

    /// 是否有动画正在跑。回调在 CVDisplayLink 的实时线程上，读状态一律过锁。
    var isAnimating: Bool {
        lock.lock()
        defer { lock.unlock() }
        return job != nil
    }

    /// Apple 的 easeInEaseOut，即 cubic-bezier(0.42, 0, 0.58, 1)。
    static func easeInEaseOut(_ x: CGFloat) -> CGFloat {
        cubicBezier(x, p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1)
    }

    /// 牛顿迭代解 cubic-bezier：先求参数 u 使 Bx(u) = x，再算 By(u)。
    static func cubicBezier(_ x: CGFloat, p1x: CGFloat, p1y: CGFloat, p2x: CGFloat, p2y: CGFloat) -> CGFloat {
        if x <= 0 { return 0 }
        if x >= 1 { return 1 }
        var u = x
        for _ in 0..<8 {
            let bx = sample(u, p1x, p2x) - x
            if abs(bx) < 1e-6 { break }
            let derivative = 3 * (1 - u) * (1 - u) * p1x + 6 * (1 - u) * u * (p2x - p1x) + 3 * u * u * (1 - p2x)
            if abs(derivative) < 1e-6 { break }
            u -= bx / derivative
            u = min(1, max(0, u))
        }
        return sample(u, p1y, p2y)
    }

    private static func sample(_ u: CGFloat, _ p1: CGFloat, _ p2: CGFloat) -> CGFloat {
        let inv = 1 - u
        return 3 * inv * inv * u * p1 + 3 * inv * u * u * p2 + u * u * u
    }

    /// 应用一次窗口调整。size 为 nil 表示只移动。
    func apply(window: AXUIElement, position: CGPoint, size: CGSize?) {
        guard position.x.isFinite, position.y.isFinite,
              size?.width.isFinite ?? true, size?.height.isFinite ?? true else { return }
        // 读几何前先压住 AX IPC 超时，卡死的目标应用不会把主线程冻住。
        AXUIElementSetMessagingTimeout(window, Self.probeTimeout)

        guard let currentPosition = AX.point(window, kAXPositionAttribute as String) else {
            // 连位置都读不到，无法插值，直接落位（commit 内部会恢复超时）。
            commit(window: window, position: position, size: size)
            return
        }
        let currentSize = size == nil ? nil : AX.size(window, kAXSizeAttribute as String)

        let reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        let deltaPosition = hypot(position.x - currentPosition.x, position.y - currentPosition.y)
        var deltaSize: CGFloat = 0
        if let size, let currentSize {
            deltaSize = hypot(size.width - currentSize.width, size.height - currentSize.height)
        }

        if reduceMotion || (deltaPosition < Self.minimumDelta && deltaSize < Self.minimumDelta) {
            commit(window: window, position: position, size: size)
            return
        }

        // 读不到当前尺寸时不做尺寸插值（从目标尺寸起步 = 第一帧就到位），
        // 但不能因此把 resize 整个丢掉。
        let fromSize = size.map { _ in currentSize ?? size! }
        start(Job(window: window,
                  fromPosition: currentPosition,
                  toPosition: position,
                  fromSize: fromSize,
                  toSize: fromSize == nil ? nil : size,
                  start: CACurrentMediaTime(),
                  duration: Self.duration))
    }

    /// 直接落位，不动画。
    func commit(window: AXUIElement, position: CGPoint, size: CGSize?) {
        cancel()
        AXUIElementSetMessagingTimeout(window, Self.probeTimeout)
        let ok = write(window, position: position, size: size)
        // 瞬间落位失败（目标窗口正卡）：放宽超时再补一次，不然整次操作静默无效。
        if !ok {
            AXUIElementSetMessagingTimeout(window, 0)
            write(window, position: position, size: size)
        }
        AXUIElementSetMessagingTimeout(window, 0)
    }

    func cancel() {
        lock.lock()
        let previous = job
        job = nil
        lock.unlock()
        guard let previous else { return }
        AXUIElementSetMessagingTimeout(previous.window, 0)
        stopDisplayLink()
    }

    private func start(_ newJob: Job) {
        lock.lock()
        let previous = job
        // 打断上一次动画：新任务从当前真实位置继续，手感像原生那样可中途改主意。
        job = newJob
        lock.unlock()
        if let previous, previous.window != newJob.window {
            // 被打断的是另一个窗口：直接把它落到终点，不能把它扔在半路上。
            write(previous.window, position: previous.toPosition, size: previous.toSize)
            AXUIElementSetMessagingTimeout(previous.window, 0)
        }
        AXUIElementSetMessagingTimeout(newJob.window, Self.animationTimeout)
        if !startDisplayLink() {
            // 帧驱动起不来（极罕见）：直接落位，绝不能让 job 卡在那里、超时永久不恢复。
            lock.lock()
            if job?.start == newJob.start { job = nil }
            lock.unlock()
            write(newJob.window, position: newJob.toPosition, size: newJob.toSize)
            AXUIElementSetMessagingTimeout(newJob.window, 0)
        }
    }

    /// 启动帧驱动，返回是否真的开始回调。
    private func startDisplayLink() -> Bool {
        lock.lock()
        if displayLink == nil {
            var link: CVDisplayLink?
            guard CVDisplayLinkCreateWithActiveCGDisplays(&link) == kCVReturnSuccess,
                  let created = link else {
                lock.unlock()
                return false
            }
            let callback: CVDisplayLinkOutputCallback = { _, _, _, _, _, userInfo -> CVReturn in
                guard let userInfo else { return kCVReturnSuccess }
                let animator = Unmanaged<WindowAnimator>.fromOpaque(userInfo).takeUnretainedValue()
                // 回调跑在实时线程上，只做排队：AX 写属性是同步 IPC，
                // 在时间受限线程上等一个忙的应用会造成优先级反转、拖坏整个系统。
                animator.scheduleTick()
                return kCVReturnSuccess
            }
            guard CVDisplayLinkSetOutputCallback(
                created, callback,
                UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
            ) == kCVReturnSuccess else {
                lock.unlock()
                return false
            }
            displayLink = created
        }
        let link = displayLink
        lock.unlock()
        guard let link else { return false }
        if CVDisplayLinkIsRunning(link) { return true }
        return CVDisplayLinkStart(link) == kCVReturnSuccess
    }

    private func stopDisplayLink() {
        let stop = { [weak self] in
            guard let self else { return }
            self.lock.lock()
            let link = self.displayLink
            let idle = self.job == nil
            self.lock.unlock()
            if let link, idle, CVDisplayLinkIsRunning(link) { CVDisplayLinkStop(link) }
        }
        // 状态只在主线程改；从实时线程进来时转投主线程，避免在回调内部停掉自己。
        if Thread.isMainThread { stop() } else { DispatchQueue.main.async(execute: stop) }
    }

    /// 由 CVDisplayLink 实时线程调用：每帧最多排一次 tick 到主线程。
    private func scheduleTick() {
        lock.lock()
        let alreadyPending = tickPending
        if !alreadyPending { tickPending = true }
        lock.unlock()
        guard !alreadyPending else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.lock.lock()
            self.tickPending = false
            self.lock.unlock()
            self.tick()
        }
    }

    private func tick() {
        lock.lock()
        guard let job = job else {
            lock.unlock()
            return
        }
        lock.unlock()

        let elapsed = CACurrentMediaTime() - job.start
        let progress = job.duration > 0 ? min(1, max(0, CGFloat(elapsed / job.duration))) : 1
        let eased = Self.easeInEaseOut(progress)

        var size: CGSize?
        if let fromSize = job.fromSize, let toSize = job.toSize {
            size = CGSize(width: fromSize.width + (toSize.width - fromSize.width) * eased,
                          height: fromSize.height + (toSize.height - fromSize.height) * eased)
        }
        let position = CGPoint(
            x: job.fromPosition.x + (job.toPosition.x - job.fromPosition.x) * eased,
            y: job.fromPosition.y + (job.toPosition.y - job.fromPosition.y) * eased
        )
        let ok = write(job.window, position: position, size: size)

        var failures = 0
        lock.lock()
        if self.job?.start == job.start {
            let next = ok ? 0 : (self.job?.consecutiveFailures ?? 0) + 1
            self.job?.consecutiveFailures = next
            failures = next
        }
        lock.unlock()

        if progress >= 1 {
            // 最后一帧写失败也要补一次，否则窗口留在差几点的位置却当作成功。
            finish(job, snap: !ok)
        } else if failures >= Self.maxConsecutiveFailures {
            // 目标窗口连续不响应（拖拽中、卡死）：放弃动画，至少把终值写一次。
            finish(job, snap: true)
        }
    }

    /// 先尺寸后位置（避免中间帧出现「尺寸变了位置没变」的跳动）。返回是否两次都写成功。
    @discardableResult
    private func write(_ window: AXUIElement, position: CGPoint, size: CGSize?) -> Bool {
        var ok = true
        if let size, !AX.setSize(window, kAXSizeAttribute as String, size) { ok = false }
        if !AX.setPoint(window, kAXPositionAttribute as String, position) { ok = false }
        return ok
    }

    private func finish(_ job: Job, snap: Bool) {
        lock.lock()
        var cleared = false
        // 只有仍是同一个任务时才收尾，否则会把后来的动画一起取消。
        if self.job?.start == job.start, self.job?.window == job.window {
            self.job = nil
            cleared = true
        }
        lock.unlock()
        // 被后来的动画接管时不要碰超时和帧驱动，那是新任务的事。
        guard cleared else { return }
        if snap {
            // 补写是在刚才连续超时的窗口上做的，先把超时放大（最宽容的值），
            // 否则在 20ms 的动画超时下这次补写几乎必然再失败一次。
            AXUIElementSetMessagingTimeout(job.window, 0)
            write(job.window, position: job.toPosition, size: job.toSize)
        }
        AXUIElementSetMessagingTimeout(job.window, 0)
        stopDisplayLink()
    }
}

// MARK: - 模拟拖拽回退

/// AX 不暴露窗口的应用只能靠模拟拖拽标题栏移动，不能可靠调整尺寸。
enum DragMover {
    static let duration: TimeInterval = 0.18
    static let steps = 24

    static func move(target: TargetWindow, to position: CGPoint) {
        // 没有合成事件权限时系统会直接丢弃这些事件：与其“点一下什么都不发生”，不如不动。
        guard CGPreflightPostEventAccess() else { return }
        guard PlacementMath.isSane(target.frame) else { return }
        let frame = target.frame
        // 避开左上角的红绿灯与中部的标签页/工具栏按钮，取标题栏靠左的一段。
        let grab = CGPoint(x: frame.minX + max(90, frame.width * 0.15),
                           y: frame.minY + 14)
        let delta = CGPoint(x: position.x - frame.minX, y: position.y - frame.minY)
        simulate(from: grab, to: CGPoint(x: grab.x + delta.x, y: grab.y + delta.y))
    }

    static func simulate(from: CGPoint, to: CGPoint) {
        let source = CGEventSource(stateID: .privateState)
        let delta = CGPoint(x: to.x - from.x, y: to.y - from.y)
        // 先把用户的真实指针位置存下来：合成事件会把它拖走，结束后必须还回原处。
        let savedCursor = NSEvent.mouseLocation
        defer { restoreCursor(savedCursor) }

        guard let down = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown,
                                 mouseCursorPosition: from, mouseButton: .left) else { return }
        down.post(tap: .cghidEventTap)
        usleep(20_000)

        let frameDelay = UInt32((duration * 1_000_000) / Double(steps))
        for index in 1...steps {
            let progress = CGFloat(index) / CGFloat(steps)
            let eased = WindowAnimator.easeInEaseOut(progress)
            let point = CGPoint(x: from.x + delta.x * eased, y: from.y + delta.y * eased)
            guard let drag = CGEvent(mouseEventSource: source, mouseType: .leftMouseDragged,
                                     mouseCursorPosition: point, mouseButton: .left) else { continue }
            drag.post(tap: .cghidEventTap)
            usleep(frameDelay)
        }

        guard let up = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp,
                               mouseCursorPosition: to, mouseButton: .left) else { return }
        up.post(tap: .cghidEventTap)
    }

    /// 把指针放回原位。AppKit 是左下原点，合成事件需要 CG 的左上坐标。
    private static func restoreCursor(_ appKitPoint: NSPoint) {
        let cgPoint = CGPoint(x: appKitPoint.x, y: Geometry.primaryScreenHeight - appKitPoint.y)
        CGWarpMouseCursorPosition(cgPoint)
        // 立刻重新关联硬件指针，避免接下来一小段时间内光标 “粘住”。
        CGAssociateMouseAndMouseCursorPosition(1)
    }
}

// MARK: - 窗口动作

enum MenuCommand {
    case auto
    case centre
    case centreHorizontal
    case centreVertical
    case preset(SizePreset)
    case custom
    case showMenu
}

enum WindowOps {
    static func perform(_ command: MenuCommand, target: TargetWindow?) {
        if case .showMenu = command {
            MenuBar.shared.showMenuAtCursor()
            return
        }
        guard let captured = target else { return }
        // 畸形几何（NaN/±inf）直接不做，否则整数换算会崩掉进程。
        guard PlacementMath.isSane(captured.frame) else { return }
        // 用执行瞬间的真实几何，而不是弹菜单那一刻的快照。
        let target = captured.refreshed()
        guard PlacementMath.isSane(target.frame) else { return }
        switch command {
        case .auto:
            run(target: target) { PlacementMath.auto(window: $0.frame, work: $1) }
        case .centre:
            run(target: target) { PlacementMath.centre(window: $0.frame, work: $1) }
        case .centreHorizontal:
            run(target: target) { PlacementMath.centreHorizontal(window: $0.frame, work: $1) }
        case .centreVertical:
            run(target: target) { PlacementMath.centreVertical(window: $0.frame, work: $1) }
        case .preset(let preset):
            // 与 SizerWin 的「Ctrl + 预设 = 调整并居中」对应，macOS 用 ⌥。
            let centre = NSEvent.modifierFlags.contains(.option)
            run(target: target) {
                PlacementMath.resize(width: preset.width, height: preset.height, centre: centre,
                                     window: $0.frame, work: $1)
            }
        case .custom:
            runCustomSizeDialog(target: target)
        case .showMenu:
            break
        }
    }

    private static func run(target: TargetWindow, compute: (TargetWindow, CGRect) -> Placement) {
        guard let work = Geometry.workArea(for: target.frame), PlacementMath.isSane(work) else { return }
        let placement = compute(target, work)
        if let window = target.axWindow {
            WindowAnimator.shared.apply(window: window, position: placement.position, size: placement.size)
            return
        }
        // 无 AX 窗口：只能拖拽移动，需要改尺寸的动作退化为居中。
        let fallback = placement.size == nil
            ? placement
            : PlacementMath.centre(window: target.frame, work: work)
        DragMover.move(target: target, to: fallback.position)
    }

    private static func runCustomSizeDialog(target: TargetWindow) {
        guard let (width, height, centre) = CustomSizeDialog.run(target: target) else { return }
        // 对话框期间窗口可能被用户移动过，重新取一次当前位置。
        var frame = target.frame
        if let window = target.axWindow,
           let position = AX.point(window, kAXPositionAttribute as String),
           let size = AX.size(window, kAXSizeAttribute as String) {
            frame = CGRect(origin: position, size: size)
        }
        guard let work = Geometry.workArea(for: frame), PlacementMath.isSane(work) else { return }
        let placement = PlacementMath.resize(width: width, height: height, centre: centre,
                                             window: frame, work: work)
        if let window = target.axWindow {
            WindowAnimator.shared.apply(window: window, position: placement.position, size: placement.size)
        }
        // 无 AX 窗口时自定义尺寸没有可用的回退路径（拖拽不能调整尺寸），保持不动。
    }
}

// MARK: - 自定义尺寸对话框

/// 原生对话框：宽度/高度预填当前尺寸，Return = 调整尺寸，⌘Return = 调整并居中，Esc = 取消。
/// 数值区间 1...32767，非法输入响铃并全选，与 SizerWin 一致。
final class CustomSizeDialog: NSObject, NSTextFieldDelegate {
    static let minimumValue = 1
    static let maximumValue = 32767

    private(set) var widthField: NSTextField!
    private(set) var heightField: NSTextField!
    private var alert: NSAlert!
    private var result: (width: Int, height: Int, centre: Bool)?

    /// 对话框打开期间不响应全局快捷键（对应 SizerWin 的 `g_customDialogOpen`）。
    private(set) static var isOpen = false

    @discardableResult
    static func run(target: TargetWindow) -> (width: Int, height: Int, centre: Bool)? {
        guard !isOpen else { return nil }
        let dialog = CustomSizeDialog()
        return dialog.runModal(target: target)
    }

    private func runModal(target: TargetWindow) -> (width: Int, height: Int, centre: Bool)? {
        // 优先还给目标窗口所在的应用；拿不到时退回到弹窗前的活动应用。
        let previousApp = target.app ?? NSWorkspace.shared.frontmostApplication
        Self.isOpen = true
        defer { Self.isOpen = false }

        alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = L10n.customTitle
        alert.informativeText = L10n.customInformative

        let accessory = NSView(frame: NSRect(x: 0, y: 0, width: 260, height: 108))
        widthField = makeField(label: L10n.width, value: PlacementMath.safeInt(target.frame.width.rounded()), in: accessory, top: 0)
        heightField = makeField(label: L10n.height, value: PlacementMath.safeInt(target.frame.height.rounded()), in: accessory, top: 54)
        alert.accessoryView = accessory

        let resizeButton = alert.addButton(withTitle: L10n.resize)
        let centreButton = alert.addButton(withTitle: L10n.resizeAndCentre)
        let cancelButton = alert.addButton(withTitle: L10n.cancel)
        for button in [resizeButton, centreButton, cancelButton] {
            button.target = self
            button.bezelStyle = .rounded
        }
        resizeButton.action = #selector(resizeClicked)
        resizeButton.keyEquivalent = "\r"
        resizeButton.keyEquivalentModifierMask = []
        centreButton.action = #selector(resizeAndCentreClicked)
        centreButton.keyEquivalent = "\r"
        centreButton.keyEquivalentModifierMask = [.command]
        cancelButton.action = #selector(cancelClicked)
        cancelButton.keyEquivalent = "\u{1b}"
        cancelButton.keyEquivalentModifierMask = []

        // Tab 顺序与 SizerWin 一致：宽 → 高 → 调整尺寸 → 调整并居中 → 取消。
        // 系统开启「键盘导航」时全程可 Tab，未开启时 Tab 只在两个输入框之间走。
        widthField.nextKeyView = heightField
        heightField.nextKeyView = resizeButton
        resizeButton.nextKeyView = centreButton
        centreButton.nextKeyView = cancelButton
        cancelButton.nextKeyView = widthField

        alert.window.initialFirstResponder = widthField

        NSApp.activate(ignoringOtherApps: true)
        alert.layout()
        widthField.selectText(nil)
        NSApp.runModal(for: alert.window)
        alert.window.close()

        // 归还焦点，避免操作完窗口后键盘焦点还留在 SizerSwift。
        if let previousApp, previousApp.processIdentifier != ProcessInfo.processInfo.processIdentifier {
            if #available(macOS 14.0, *) {
                previousApp.activate()
            } else {
                previousApp.activate(options: [.activateIgnoringOtherApps])
            }
        }
        return result
    }

    private func makeField(label text: String, value: Int, in container: NSView, top: CGFloat) -> NSTextField {
        let label = NSTextField(labelWithString: text)
        label.font = NSFont.systemFont(ofSize: NSFont.smallSystemFontSize)
        label.textColor = .secondaryLabelColor
        label.frame = NSRect(x: 0, y: 108 - top - 16, width: 260, height: 16)
        let field = NSTextField(string: "\(value)")
        field.font = NSFont.monospacedDigitSystemFont(ofSize: NSFont.systemFontSize, weight: .regular)
        field.alignment = .center
        field.focusRingType = .default
        field.delegate = self
        field.frame = NSRect(x: 0, y: 108 - top - 16 - 6 - 22, width: 260, height: 22)
        field.autoresizingMask = [.width]
        label.autoresizingMask = [.width]
        container.addSubview(label)
        container.addSubview(field)
        return field
    }

    func controlTextDidBeginEditing(_ notification: Notification) {
        if let field = notification.object as? NSTextField { field.selectText(nil) }
    }

    @objc private func resizeClicked() { submit(centre: false) }
    @objc private func resizeAndCentreClicked() { submit(centre: true) }

    @objc private func cancelClicked() {
        result = nil
        NSApp.stopModal()
    }

    private func submit(centre: Bool) {
        guard let width = read(field: widthField), let height = read(field: heightField) else { return }
        result = (width, height, centre)
        NSApp.stopModal()
    }

    /// 非法输入：响铃 + 全选 + 不关闭对话框。
    private func read(field: NSTextField) -> Int? {
        let text = field.stringValue.trimmingCharacters(in: .whitespaces)
        let value = Int(text)
        if let value, (Self.minimumValue...Self.maximumValue).contains(value) { return value }
        NSSound.beep()
        field.selectText(nil)
        alert.window.makeFirstResponder(field)
        return nil
    }
}

// MARK: - 全局快捷键

final class HotkeyCenter {
    static let shared = HotkeyCenter()

    private var tap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var bindings: [HotkeyBinding: HotkeyAction] = [:]
    private var lastConfig: AppConfig?
    private let lock = NSLock()

    /// 菜单栏菜单打开时用于跟随 ⌥ 键切换预设标题。
    var onModifiersChanged: ((CGEventFlags) -> Void)?

    var isInstalled: Bool { tap != nil }

    func install() {
        guard tap == nil else { return }
        let mask: CGEventMask =
            (1 << CGEventType.keyDown.rawValue) |
            (1 << CGEventType.flagsChanged.rawValue) |
            (1 << CGEventType.tapDisabledByTimeout.rawValue) |
            (1 << CGEventType.tapDisabledByUserInput.rawValue)

        guard let newTap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: mask,
            callback: { _, type, event, userInfo -> Unmanaged<CGEvent>? in
                guard let userInfo else { return Unmanaged.passUnretained(event) }
                let center = Unmanaged<HotkeyCenter>.fromOpaque(userInfo).takeUnretainedValue()
                return center.handle(type: type, event: event)
            },
            userInfo: UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
        ) else { return }

        // 没有 run loop source 的 tap 永远不会触发回调，不能当成安装成功。
        guard let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, newTap, 0) else {
            CFMachPortInvalidate(newTap)
            return
        }
        tap = newTap
        runLoopSource = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: newTap, enable: true)
    }

    /// 拆掉 tap：权限被撤销后重建时用，避免 `tap != nil` 把 `install()` 永久堵死。
    func teardown() {
        if let source = runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes)
            runLoopSource = nil
        }
        if let old = tap {
            CGEvent.tapEnable(tap: old, enable: false)
            CFMachPortInvalidate(old)
            tap = nil
        }
    }

    func update(_ config: AppConfig) {
        lastConfig = config
        lock.lock()
        bindings.removeAll()
        // CaseIterable 顺序即优先级：先出现的动作占用该组合键。
        for action in HotkeyAction.allCases {
            guard let binding = config.hotkeys[action] else { continue }
            if bindings[binding] == nil { bindings[binding] = action }
        }
        lock.unlock()
    }

    /// 用户在系统设置里刚刚授权后，无需重启就能把快捷键装起来。
    /// 事件 tap 在未授权时建不起来，每次打开菜单复查一次代价极低。
    func installIfTrusted() {
        guard AXIsProcessTrusted() else {
            // 权限被撤销：此时 tap 已经收不到任何事件，拆掉才能等下次授权重建。
            if tap != nil { teardown() }
            return
        }
        guard tap == nil else { return }
        install()
        if let lastConfig { update(lastConfig) }
    }

    private func handle(type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        switch type {
        case .tapDisabledByTimeout, .tapDisabledByUserInput:
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
        case .flagsChanged:
            let flags = event.flags.intersection([.maskControl, .maskAlternate, .maskShift, .maskCommand])
            DispatchQueue.main.async { [weak self] in self?.onModifiersChanged?(flags) }
        case .keyDown:
            if CustomSizeDialog.isOpen { break }
            let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
            let modifiers = event.flags.intersection([.maskControl, .maskAlternate, .maskShift, .maskCommand])
            lock.lock()
            let action = bindings[HotkeyBinding(keyCode: keyCode, modifiers: modifiers, spec: "")]
            lock.unlock()
            guard let action else { break }
            // 自动重复也不放行：对应 Win32 的 MOD_NOREPEAT，长按不能将字符泄漏给前台应用。
            if event.getIntegerValueField(.keyboardEventAutorepeat) != 0 { return nil }
            // 按键时顺带检查配置是否被改过，改完不用重开菜单就生效。
            DispatchQueue.main.async {
                let config = ConfigStore.reloadIfChanged()
                HotkeyCenter.shared.update(config)
                HotkeyActionRunner.run(action)
            }
            return nil
        default:
            break
        }
        return Unmanaged.passUnretained(event)
    }
}

enum HotkeyActionRunner {
    static func run(_ action: HotkeyAction) {
        switch action {
        case .showMenu:
            // 在光标处弹菜单，目标窗口由 MenuBar 自己取。
            WindowOps.perform(.showMenu, target: nil)
        case .custom:
            WindowOps.perform(.custom, target: TargetResolver.current())
        case .auto, .centre, .centreHorizontal, .centreVertical:
            WindowOps.perform(menuCommand(for: action), target: TargetResolver.current())
        }
    }

    static func menuCommand(for action: HotkeyAction) -> MenuCommand {
        switch action {
        case .auto: return .auto
        case .centre: return .centre
        case .centreHorizontal: return .centreHorizontal
        case .centreVertical: return .centreVertical
        case .custom: return .custom
        case .showMenu: return .showMenu
        }
    }
}

// MARK: - 菜单栏

final class MenuBar: NSObject, NSMenuDelegate {
    static let shared = MenuBar()

    private(set) var statusItem: NSStatusItem!
    private(set) var menu: NSMenu!
    /// 菜单打开瞬间锁定目标窗口（对应 SizerWin 弹菜单前取 `GetForegroundWindow()`）。
    private var target: TargetWindow?
    private var presetItems: [(item: NSMenuItem, preset: SizePreset)] = []
    private var modifiersObserver: NSObjectProtocol?
    /// 防止菜单已经在跟踪时被快捷键重入（`NSMenu.popUp` 不支持嵌套）。
    private var isShowingMenu = false

    func setup() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let iconPath = Bundle.main.path(forResource: "AppIcon", ofType: "icns"),
           let icon = NSImage(contentsOfFile: iconPath) {
            icon.isTemplate = true
            icon.size = NSSize(width: 18, height: 18)
            statusItem.button?.image = icon
        } else {
            statusItem.button?.title = "◫"
        }
        statusItem.button?.toolTip = L10n.tooltip

        menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false
        statusItem.menu = menu
    }

    /// 供 `ShowMenu` 快捷键调用：在光标处弹出同一个菜单。
    func showMenuAtCursor() {
        // 快捷键在菜单追踪模式下也会触发（tap 装在 .commonModes 里），
        // 此时不能对 AppKit 正在显示的同一个 NSMenu 再 popUp 一次。
        guard !isShowingMenu else { return }
        isShowingMenu = true
        defer { isShowingMenu = false }

        let previousApp = NSWorkspace.shared.frontmostApplication
        target = TargetResolver.current()
        rebuild(with: ConfigStore.reloadIfChanged())
        menu.popUp(positioning: nil, at: NSEvent.mouseLocation, in: nil)
        if let previousApp, previousApp.processIdentifier != ProcessInfo.processInfo.processIdentifier {
            if #available(macOS 14.0, *) {
                previousApp.activate()
            } else {
                previousApp.activate(options: [.activateIgnoringOtherApps])
            }
        }
    }

    // MARK: NSMenuDelegate

    func menuNeedsUpdate(_ menu: NSMenu) {
        HotkeyCenter.shared.installIfTrusted()
        target = TargetResolver.current()
        let config = ConfigStore.reloadIfChanged()
        // 改完 ini 不必重启：菜单重建时同步刷新快捷键绑定。
        HotkeyCenter.shared.update(config)
        rebuild(with: config)
    }

    func menuWillOpen(_ menu: NSMenu) {
        // 跟随 ⌥ 键实时切换预设标题（Finder 的惯例）。
        modifiersObserver = NotificationCenter.default.addObserver(
            forName: .sizerModifiersChanged, object: nil, queue: .main
        ) { [weak self] note in
            guard let self, let flags = note.object as? CGEventFlags else { return }
            self.updatePresetTitles(optionHeld: flags.contains(.maskAlternate))
        }
    }

    func menuDidClose(_ menu: NSMenu) {
        if let modifiersObserver {
            NotificationCenter.default.removeObserver(modifiersObserver)
            self.modifiersObserver = nil
        }
        updatePresetTitles(optionHeld: false)
    }

    private func updatePresetTitles(optionHeld: Bool) {
        for entry in presetItems {
            entry.item.title = optionHeld
                ? L10n.presetTitleCentre(entry.preset)
                : L10n.presetTitle(entry.preset)
        }
    }

    // MARK: 构建

    /// 按配置重建菜单内容。`menuNeedsUpdate` 与测试都会调用。
    func rebuild(with config: AppConfig) {
        menu.removeAllItems()
        presetItems.removeAll()

        // 有目标窗口就够；没目标时仍可用拖拽回退（需有合成事件权限）。
        let hasTarget = target != nil || AccessStatus.canControlWindows

        // 未授权时给出可点击的修复入口，授权后这一项自动消失。
        if !AXIsProcessTrusted() {
            let hint = NSMenuItem(title: L10n.grantAccessibility, action: #selector(openAccessibilitySettings(_:)), keyEquivalent: "")
            hint.target = self
            menu.addItem(hint)
            menu.addItem(.separator())
        }

        let fixed: [(MenuCommand, String, HotkeyAction)] = [
            (.auto, L10n.autoTitle, .auto),
            (.centre, L10n.centre, .centre),
            (.centreHorizontal, L10n.centreHorizontal, .centreHorizontal),
            (.centreVertical, L10n.centreVertical, .centreVertical),
        ]
        for (command, title, action) in fixed {
            let item = makeItem(title: title, command: command, binding: config.hotkeys[action], enabled: hasTarget)
            menu.addItem(item)
        }

        if !config.presets.isEmpty { menu.addItem(.separator()) }
        for (index, preset) in config.presets.enumerated() {
            if index == config.separatorAfter, index > 0 { menu.addItem(.separator()) }
            let item = makeItem(title: L10n.presetTitle(preset), command: .preset(preset), binding: nil, enabled: hasTarget)
            menu.addItem(item)
            presetItems.append((item, preset))
        }

        menu.addItem(.separator())
        menu.addItem(makeItem(title: L10n.custom, command: .custom, binding: config.hotkeys[.custom], enabled: hasTarget))

        menu.addItem(.separator())
        let loginItem = NSMenuItem(title: L10n.launchAtLogin, action: #selector(toggleLoginItem(_:)), keyEquivalent: "")
        loginItem.target = self
        loginItem.state = LoginItem.isEnabled ? .on : .off
        menu.addItem(loginItem)

        menu.addItem(.separator())
        let quitItem = NSMenuItem(title: L10n.quit, action: #selector(quitAction), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)
    }

    @objc private func openAccessibilitySettings(_ sender: Any?) {
        SystemSettings.openAccessibilityPane()
    }

    private func makeItem(title: String, command: MenuCommand, binding: HotkeyBinding?, enabled: Bool) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: #selector(handleCommand(_:)), keyEquivalent: "")
        item.target = self
        item.representedObject = CommandBox(command: command)
        item.isEnabled = enabled
        if let binding, let equivalent = binding.keyEquivalent {
            item.keyEquivalent = equivalent
            item.keyEquivalentModifierMask = binding.modifierMask
        }
        return item
    }

    @objc private func handleCommand(_ sender: NSMenuItem) {
        guard let box = sender.representedObject as? CommandBox else { return }
        let capturedTarget = target
        // 让菜单先完全收起再动窗口，动画不会被菜单关闭过程打断。
        DispatchQueue.main.async {
            WindowOps.perform(box.command, target: capturedTarget)
        }
    }

    @objc private func toggleLoginItem(_ sender: NSMenuItem) {
        let enable = sender.state == .off
        LoginItem.setEnabled(enable)
        sender.state = LoginItem.isEnabled ? .on : .off
    }

    @objc private func quitAction() { NSApp.terminate(nil) }
}

/// NSMenuItem 的 representedObject 需要 class 类型。
final class CommandBox {
    let command: MenuCommand
    init(command: MenuCommand) { self.command = command }
}

extension Notification.Name {
    static let sizerModifiersChanged = Notification.Name("SizerSwift.modifiersChanged")
}

// MARK: - 开机自启动

enum LoginItem {
    static var isEnabled: Bool {
        if #available(macOS 13.0, *) { return SMAppService.mainApp.status == .enabled }
        return false
    }

    static func setEnabled(_ enabled: Bool) {
        guard #available(macOS 13.0, *) else { return }
        do {
            if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            NSLog("SizerSwift login item error: %@", error.localizedDescription)
        }
    }
}

// MARK: - App Delegate

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        ensureSingleInstance()

        let config = ConfigStore.load()

        // 先建好菜单栏项再弹权限提示：权限对话框是模态的，不能挡住图标出现。
        MenuBar.shared.setup()
        HotkeyCenter.shared.install()
        HotkeyCenter.shared.update(config)
        HotkeyCenter.shared.onModifiersChanged = { flags in
            NotificationCenter.default.post(name: .sizerModifiersChanged, object: flags)
        }

        guard AXIsProcessTrusted() else {
            // 没有辅助功能权限时事件 tap 必然建不起来，只提示一次权限，不重复报快捷键失败。
            showAccessibilityPrompt()
            return
        }
        if !HotkeyCenter.shared.isInstalled { showHotkeyUnavailableAlert() }
    }

    private func showHotkeyUnavailableAlert() {
        let alert = NSAlert()
        alert.messageText = "SizerSwift"
        alert.informativeText = L10n.hotkeyUnavailable
        alert.alertStyle = .warning
        alert.addButton(withTitle: L10n.ok)
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
    }

    /// 单实例：与 SizerWin 的互斥体 + 进程扫描等价，发现同 bundle 的实例则提示 PID 后退出。
    private func ensureSingleInstance() {
        guard let identifier = Bundle.main.bundleIdentifier else { return }
        let selfPID = ProcessInfo.processInfo.processIdentifier
        let others = NSRunningApplication.runningApplications(withBundleIdentifier: identifier)
            .filter { $0.processIdentifier != selfPID }
        guard let other = others.first else { return }

        let alert = NSAlert()
        alert.messageText = "SizerSwift"
        alert.informativeText = L10n.alreadyRunning(pid: other.processIdentifier)
        alert.alertStyle = .warning
        alert.addButton(withTitle: L10n.ok)
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
        NSApp.terminate(nil)
        exit(0)
    }

    private func showAccessibilityPrompt() {
        let alert = NSAlert()
        alert.messageText = L10n.accessibilityTitle
        alert.informativeText = L10n.accessibilityBody
        alert.addButton(withTitle: L10n.openSystemSettings)
        alert.addButton(withTitle: L10n.later)
        alert.alertStyle = .warning
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn {
            SystemSettings.openAccessibilityPane()
        }
    }
}

/// “系统设置”深链接集中在这里，避免多处写同一个 URL。
enum SystemSettings {
    static func openAccessibilityPane() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }
}

/// 当前进程到底能不能操作别人的窗口。
/// AX 权限优先（能动画改尺寸），没有时合成鼠标事件仍可以拖拽移动窗口（回退路径）。
enum AccessStatus {
    static var canControlWindows: Bool {
        if AXIsProcessTrusted() { return true }
        return CGPreflightPostEventAccess()
    }
}

// MARK: - 启动

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
