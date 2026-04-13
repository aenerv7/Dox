import Cocoa
import CoreGraphics
import ServiceManagement

// MARK: - 多语言

struct L10n {
    static var centerWindow: String { localized("Center Window", zh: "居中視窗", zhCN: "居中窗口") }
    static var resizeAndCenter: String { localized("Resize and Center Window", zh: "調整並居中視窗", zhCN: "调整并居中窗口") }
    static var launchAtLogin: String { localized("Launch at Login", zh: "登入時啟動", zhCN: "开机自启动") }
    static var quit: String { localized("Quit SizerSwift", zh: "結束 SizerSwift", zhCN: "退出 SizerSwift") }
    static var noWindow: String { localized("No active window", zh: "沒有活動視窗", zhCN: "没有活动窗口") }
    static var tooltip: String { localized("SizerSwift", zh: "SizerSwift", zhCN: "SizerSwift") }

    static func localized(_ en: String, zh: String, zhCN: String) -> String {
        let lang = Locale.preferredLanguages.first ?? "en"
        if lang.hasPrefix("zh-Hant") || lang.hasPrefix("zh-TW") || lang.hasPrefix("zh-HK") {
            return zh
        } else if lang.hasPrefix("zh") {
            return zhCN
        }
        return en
    }
}

// MARK: - CGWindowList 查询

struct WindowInfo {
    let x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat
}

func findFrontmostWindow() -> WindowInfo? {
    guard let frontApp = NSWorkspace.shared.frontmostApplication else { return nil }
    let pid = frontApp.processIdentifier

    let axApp = AXUIElementCreateApplication(pid)
    var axWindows: CFTypeRef?
    if AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &axWindows) == .success,
       let windows = axWindows as? [AXUIElement], let win = windows.first {
        var pos: CFTypeRef?, size: CFTypeRef?
        AXUIElementCopyAttributeValue(win, kAXPositionAttribute as CFString, &pos)
        AXUIElementCopyAttributeValue(win, kAXSizeAttribute as CFString, &size)
        var point = CGPoint.zero, sz = CGSize.zero
        if let pos = pos { AXValueGetValue(pos as! AXValue, .cgPoint, &point) }
        if let size = size { AXValueGetValue(size as! AXValue, .cgSize, &sz) }
        if sz.width > 10 && sz.height > 10 {
            return WindowInfo(x: point.x, y: point.y, w: sz.width, h: sz.height)
        }
    }

    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else { return nil }
    for w in list {
        guard let ownerPID = w[kCGWindowOwnerPID as String] as? Int32, ownerPID == pid,
              let bounds = w[kCGWindowBounds as String] as? [String: Any],
              let x = bounds["X"] as? CGFloat, let y = bounds["Y"] as? CGFloat,
              let width = bounds["Width"] as? CGFloat, let height = bounds["Height"] as? CGFloat,
              let layer = w[kCGWindowLayer as String] as? Int,
              layer == 0, width > 100, height > 100
        else { continue }
        return WindowInfo(x: x, y: y, w: width, h: height)
    }
    return nil
}

// MARK: - 窗口操作

func screenForRect(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat) -> NSScreen {
    let cx = x + w / 2, cy = y + h / 2
    for screen in NSScreen.screens {
        let f = screen.frame
        let topY = NSScreen.screens[0].frame.height - f.origin.y - f.height
        if cx >= f.origin.x && cx <= f.origin.x + f.width && cy >= topY && cy <= topY + f.height {
            return screen
        }
    }
    return NSScreen.main ?? NSScreen.screens[0]
}

func centerWindowViaAX() -> Bool {
    guard let frontApp = NSWorkspace.shared.frontmostApplication else { return false }
    let axApp = AXUIElementCreateApplication(frontApp.processIdentifier)
    var axWindows: CFTypeRef?
    guard AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &axWindows) == .success,
          let windows = axWindows as? [AXUIElement], let win = windows.first else { return false }

    var posRef: CFTypeRef?, sizeRef: CFTypeRef?
    AXUIElementCopyAttributeValue(win, kAXPositionAttribute as CFString, &posRef)
    AXUIElementCopyAttributeValue(win, kAXSizeAttribute as CFString, &sizeRef)
    var point = CGPoint.zero, size = CGSize.zero
    if let p = posRef { AXValueGetValue(p as! AXValue, .cgPoint, &point) }
    if let s = sizeRef { AXValueGetValue(s as! AXValue, .cgSize, &size) }
    guard size.width > 10, size.height > 10 else { return false }

    let screen = screenForRect(x: point.x, y: point.y, w: size.width, h: size.height)
    let sf = screen.visibleFrame
    let screenTop = screen.frame.height - sf.origin.y - sf.height + screen.frame.origin.y

    var newPoint = CGPoint(
        x: sf.origin.x + (sf.width - size.width) / 2,
        y: screenTop + (sf.height - size.height) / 2
    )
    guard let val = AXValueCreate(.cgPoint, &newPoint) else { return false }
    return AXUIElementSetAttributeValue(win, kAXPositionAttribute as CFString, val) == .success
}

func simulateDrag(fromX: CGFloat, fromY: CGFloat, toX: CGFloat, toY: CGFloat) {
    let from = CGPoint(x: fromX, y: fromY)
    let to = CGPoint(x: toX, y: toY)
    let dx = toX - fromX, dy = toY - fromY

    // 创建一个私有事件源，标记为程序化操作
    let source = CGEventSource(stateID: .privateState)

    guard let downEvent = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: from, mouseButton: .left) else { return }
    downEvent.post(tap: .cghidEventTap)
    usleep(30000) // 30ms

    // 分步拖拽
    let steps = 20
    for i in 1...steps {
        let t = CGFloat(i) / CGFloat(steps)
        let p = CGPoint(x: fromX + dx * t, y: fromY + dy * t)
        guard let dragEvent = CGEvent(mouseEventSource: source, mouseType: .leftMouseDragged, mouseCursorPosition: p, mouseButton: .left) else { continue }
        dragEvent.post(tap: .cghidEventTap)
        usleep(1000) // 1ms
    }

    // 精确到终点
    guard let finalDrag = CGEvent(mouseEventSource: source, mouseType: .leftMouseDragged, mouseCursorPosition: to, mouseButton: .left) else { return }
    finalDrag.post(tap: .cghidEventTap)
    usleep(10000) // 10ms

    guard let upEvent = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: to, mouseButton: .left) else { return }
    upEvent.post(tap: .cghidEventTap)
}

func centerWindowViaDrag() {
    guard let info = findFrontmostWindow() else {
        let alert = NSAlert()
        alert.messageText = "SizerSwift"
        alert.informativeText = L10n.noWindow
        alert.runModal()
        return
    }
    let screen = screenForRect(x: info.x, y: info.y, w: info.w, h: info.h)
    let sf = screen.visibleFrame
    let screenTop = NSScreen.screens[0].frame.height - sf.origin.y - sf.height
    let targetX = sf.origin.x + (sf.width - info.w) / 2
    let targetY = screenTop + (sf.height - info.h) / 2
    let titlebarH: CGFloat = 30
    let fromX = info.x + info.w / 2, fromY = info.y + titlebarH / 2
    simulateDrag(fromX: fromX, fromY: fromY, toX: fromX + (targetX - info.x), toY: fromY + (targetY - info.y))
}

func centerCurrentWindow() {
    if centerWindowViaAX() { return }
    centerWindowViaDrag()
}

// MARK: - 调整并居中（75% 屏幕）

func resizeAndCenterViaAX() -> Bool {
    guard let frontApp = NSWorkspace.shared.frontmostApplication else { return false }
    let axApp = AXUIElementCreateApplication(frontApp.processIdentifier)
    var axWindows: CFTypeRef?
    guard AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &axWindows) == .success,
          let windows = axWindows as? [AXUIElement], let win = windows.first else { return false }

    var posRef: CFTypeRef?, sizeRef: CFTypeRef?
    AXUIElementCopyAttributeValue(win, kAXPositionAttribute as CFString, &posRef)
    AXUIElementCopyAttributeValue(win, kAXSizeAttribute as CFString, &sizeRef)
    var point = CGPoint.zero, curSize = CGSize.zero
    if let p = posRef { AXValueGetValue(p as! AXValue, .cgPoint, &point) }
    if let s = sizeRef { AXValueGetValue(s as! AXValue, .cgSize, &curSize) }
    guard curSize.width > 10, curSize.height > 10 else { return false }

    let screen = screenForRect(x: point.x, y: point.y, w: curSize.width, h: curSize.height)
    let sf = screen.visibleFrame
    let screenTop = screen.frame.height - sf.origin.y - sf.height + screen.frame.origin.y

    let newW = sf.width * 0.75
    let newH = sf.height * 0.75
    var newSize = CGSize(width: newW, height: newH)
    var newPos = CGPoint(
        x: sf.origin.x + (sf.width - newW) / 2,
        y: screenTop + (sf.height - newH) / 2
    )

    guard let sizeVal = AXValueCreate(.cgSize, &newSize),
          let posVal = AXValueCreate(.cgPoint, &newPos) else { return false }

    let r1 = AXUIElementSetAttributeValue(win, kAXSizeAttribute as CFString, sizeVal)
    let r2 = AXUIElementSetAttributeValue(win, kAXPositionAttribute as CFString, posVal)
    return r1 == .success || r2 == .success
}

func resizeAndCenterViaDrag() {
    guard let info = findFrontmostWindow() else {
        let alert = NSAlert()
        alert.messageText = "SizerSwift"
        alert.informativeText = L10n.noWindow
        alert.runModal()
        return
    }
    // 拖拽模式只能移动，不能调整尺寸，所以只做居中
    let screen = screenForRect(x: info.x, y: info.y, w: info.w, h: info.h)
    let sf = screen.visibleFrame
    let screenTop = NSScreen.screens[0].frame.height - sf.origin.y - sf.height
    let targetX = sf.origin.x + (sf.width - info.w) / 2
    let targetY = screenTop + (sf.height - info.h) / 2
    let titlebarH: CGFloat = 30
    let fromX = info.x + info.w / 2, fromY = info.y + titlebarH / 2
    simulateDrag(fromX: fromX, fromY: fromY, toX: fromX + (targetX - info.x), toY: fromY + (targetY - info.y))
}

func resizeAndCenterCurrentWindow() {
    if resizeAndCenterViaAX() { return }
    resizeAndCenterViaDrag()
}

// MARK: - 全局快捷键

func registerHotkey() {
    let eventMask: CGEventMask = (1 << CGEventType.keyDown.rawValue)
    guard let tap = CGEvent.tapCreate(
        tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap,
        eventsOfInterest: eventMask,
        callback: { (_, type, event, _) -> Unmanaged<CGEvent>? in
            if type == .keyDown {
                let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
                let flags = event.flags
                if keyCode == 8 && flags.contains(.maskCommand) && flags.contains(.maskAlternate)
                    && !flags.contains(.maskShift) && !flags.contains(.maskControl) {
                    DispatchQueue.main.async { centerCurrentWindow() }
                    return nil
                }
                if keyCode == 8 && flags.contains(.maskCommand) && flags.contains(.maskAlternate)
                    && flags.contains(.maskControl) && !flags.contains(.maskShift) {
                    DispatchQueue.main.async { resizeAndCenterCurrentWindow() }
                    return nil
                }
            }
            return Unmanaged.passRetained(event)
        }, userInfo: nil
    ) else { return }

    let src = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetCurrent(), src, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
}

// MARK: - 开机自启动

func isLoginItemEnabled() -> Bool {
    if #available(macOS 13.0, *) { return SMAppService.mainApp.status == .enabled }
    return false
}

func setLoginItem(enabled: Bool) {
    if #available(macOS 13.0, *) {
        do { if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() } }
        catch { print("Login item error: \(error)") }
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var loginMenuItem: NSMenuItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let trusted = AXIsProcessTrusted()
        if !trusted {
            let alert = NSAlert()
            alert.messageText = L10n.localized(
                "Accessibility Permission Required",
                zh: "需要輔助使用權限",
                zhCN: "需要辅助功能权限"
            )
            alert.informativeText = L10n.localized(
                "SizerSwift needs accessibility permission to manage windows.\n\nIf you see an old entry for SizerSwift in System Settings → Privacy & Security → Accessibility, please remove it first, then re-add the current app.",
                zh: "SizerSwift 需要輔助使用權限來管理視窗。\n\n若「系統設定 → 隱私與安全性 → 輔助使用」中已有舊的 SizerSwift 項目，請先移除再重新加入目前的 App。",
                zhCN: "SizerSwift 需要辅助功能权限来管理窗口。\n\n若「系统设置 → 隐私与安全性 → 辅助功能」中已有旧的 SizerSwift 条目，请先移除再重新添加当前应用。"
            )
            alert.addButton(withTitle: L10n.localized("Open System Settings", zh: "打開系統設定", zhCN: "打开系统设置"))
            alert.addButton(withTitle: L10n.localized("Later", zh: "稍後", zhCN: "稍后"))
            alert.alertStyle = .warning

            if alert.runModal() == .alertFirstButtonReturn {
                NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!)
            }
        }

        setupStatusBar()
        registerHotkey()
    }

    func setupStatusBar() {
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

        let menu = NSMenu()

        let centerItem = NSMenuItem(title: L10n.centerWindow, action: #selector(centerAction), keyEquivalent: "c")
        centerItem.keyEquivalentModifierMask = [.command, .option]
        centerItem.target = self
        menu.addItem(centerItem)

        let resizeCenterItem = NSMenuItem(title: L10n.resizeAndCenter, action: #selector(resizeAndCenterAction), keyEquivalent: "c")
        resizeCenterItem.keyEquivalentModifierMask = [.command, .option, .control]
        resizeCenterItem.target = self
        menu.addItem(resizeCenterItem)

        menu.addItem(.separator())

        loginMenuItem = NSMenuItem(title: L10n.launchAtLogin, action: #selector(toggleLoginItem(_:)), keyEquivalent: "")
        loginMenuItem.target = self
        loginMenuItem.state = isLoginItemEnabled() ? .on : .off
        menu.addItem(loginMenuItem)

        menu.addItem(.separator())

        let quitItem = NSMenuItem(title: L10n.quit, action: #selector(quitAction), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    @objc func centerAction() { centerCurrentWindow() }
    @objc func resizeAndCenterAction() { resizeAndCenterCurrentWindow() }

    @objc func toggleLoginItem(_ sender: NSMenuItem) {
        let enable = sender.state == .off
        setLoginItem(enabled: enable)
        sender.state = enable ? .on : .off
    }

    @objc func quitAction() { NSApp.terminate(nil) }
}

// MARK: - 启动

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
