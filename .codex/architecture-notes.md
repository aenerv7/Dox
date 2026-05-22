# 架构说明

## 字体映射

相关文件：

- `css/font-face.css`
- `Userscript/中文字体优化.user.js`
- `.kiro/steering/userscript-version.md`

结构分组：

| 分组 | 内容 | 关键点 |
|---|---|---|
| 标准字体 | `serif`, `sans-serif`, `monospace`, `cursive`, `fantasy`, `standard`, `-webkit-standard` | 直接替换通用字体族，不带 `unicode-range` |
| 英文衬线 | `Georgia`, `Times`, `Times New Roman` | 双规则模式，英文保留原字体，CJK 指向中文衬线 |
| 英文无衬线 | `-apple-system`, `Helvetica`, `Segoe UI`, `Tahoma`, `Verdana` 等 | 双规则模式，CJK 指向 `PingFang SC` / `Noto Sans SC` |
| 等宽 | `Consolas`, `Courier`, `Courier New`, `Lucida Console` 等 | 英文保留等宽，中文范围走中文回退 |
| 旧式中文字体 | `SimSun`, `NSimSun`, `宋体`, `新宋体`, `MingLiU`, `细明体` 等 | 非等宽旧中文字体映射到无衬线，等宽旧中文字体映射到 Maple Mono |
| 特殊字体 | `Comic Sans MS`, `Impact`, `瀹嬩綋` | 手写/展示字体走 `LXGW WenKai`，乱码字体名走无衬线 |

Userscript 文件在元数据块后把 CSS 放入模板字符串：

1. 优先调用 `GM_addStyle(css)`。
2. 如果没有 `GM_addStyle`，创建 `style` 节点插入 `head` 或 `documentElement`。

## SizerAHK

入口：`AutoHotkey/SizerAHK/SizerAHK.ahk`

核心全局状态：

- `windowTitle` / `windowHwnd`：当前目标窗口。
- `taskBarHeight`：任务栏偏移计算基础值，当前为 48。
- `darkModeEnabled`：读取 Windows 个性化注册表，供菜单深色模式初始化。
- `guiWindowResize` / `guiWindowResizeTitle`：自定义尺寸窗口。

主要函数：

| 函数 | 职责 |
|---|---|
| `GetTaskbarOffset(monitorIndex)` | 根据主/副显示器和任务栏设置返回垂直偏移 |
| `MonitorGetCurrent(...)` | 根据窗口中心点找到当前显示器 |
| `Adjust_Auto(...)` | 当前显示器 3/4 尺寸并居中 |
| `Adjust_Centre(...)` | 保持尺寸居中 |
| `Adjust_MenuHandler(...)` | 菜单预设尺寸分派 |
| `Adjust_Custom(...)` | 创建自定义尺寸 GUI |
| `CustomResizeSubmitResize(...)` | 提交自定义尺寸，只调整大小 |
| `CustomResizeSubmitResizeCentre(...)` | 提交自定义尺寸并居中 |
| `AdjustWindowCentre(width, height, centre)` | 通用尺寸调整入口 |
| `AdjustWindow(width, height)` | 预设尺寸调整，按住 Control 时同时居中 |

快捷键：

- `Shift+Alt+Space`：弹出菜单。
- 自定义尺寸 GUI 内 `Enter`：调整尺寸。
- 自定义尺寸 GUI 内 `Ctrl+Enter`：调整尺寸并居中。

## SizerWin

入口：`SizerWin/SizerWin.c`

构建文件：

- `SizerWin/build.bat`：使用 `rc.exe` 和 `cl.exe` 构建。
- `SizerWin/build.ps1`：自动定位 Visual Studio / Build Tools 后使用 `rc.exe` 和 `cl.exe` 构建。
- `SizerWin/CMakeLists.txt`：CMake 备用构建入口。
- `SizerWin/SizerWin.rc`：嵌入 `logo.ico`。
- `SizerWin/SizerWin.manifest`：声明 Per-Monitor DPI awareness 和 ComCtl32 v6 visual styles。

核心状态：

- `g_presets`：最多 64 个预设尺寸，包含水平/垂直分隔位置。
- `g_targetHwnd`：当前目标窗口。
- `g_hwndMain`：消息窗口，用于接收热键消息。
- `g_isChinese`：根据系统 UI 语言选择菜单文本。
- `g_darkMode`：根据 Windows 注册表判断深色模式。

主要函数：

| 函数 | 职责 |
|---|---|
| `LoadDefaultPresets()` | 加载内置默认预设 |
| `GenerateConfigFile(path)` | 首次运行生成 `SizerWin.ini` |
| `GetConfigPath(...)` | 根据 exe 路径得到同目录 `SizerWin.ini` 路径 |
| `ShowConfigAccessError(...)` | 配置文件权限不足时提示并退出 |
| `LoadConfig()` | 每次弹出菜单前读取 `SizerWin.ini` |
| `GetWindowWorkArea(hwnd, ...)` | 通过 `MonitorFromWindow` 和 `GetMonitorInfo.rcWork` 获取当前窗口所在显示器工作区 |
| `AdjustWindowSize(width, height, centre)` | 设置尺寸，可选居中 |
| `DoAuto()` | 当前显示器工作区 3/4 尺寸并居中 |
| `DoCentre()` | 保持尺寸居中 |
| `ShowCustomDialog()` | 显示 Win32 自定义尺寸窗口，并根据提交结果调用 `AdjustWindowSize()` |
| `CustomDialogWndProc(...)` | 处理自定义尺寸窗口控件、DPI 变化、深色模式颜色和快捷键结果 |
| `RoundedEditFrameWndProc(...)` | 绘制圆角输入框外框并承载无边框 `EDIT` |
| `RoundedButtonWndProc(...)` | 绘制圆角按钮并转发点击命令 |
| `ShowSizerMenu()` | 获取前台窗口、加载配置、显示弹出菜单、执行命令 |
| `WndProc(...)` | 处理热键、命令和销毁消息 |
| `wWinMain(...)` | 单实例、语言/深色模式、窗口类、热键和消息循环初始化 |

与 AHK 版不同的点：

- 自定义尺寸窗口使用原生 Win32 自绘圆角输入框和按钮，不依赖 WinUI / Windows App SDK；窗口使用标题栏但不带右上角控制按钮。
- 自定义尺寸窗口自行处理 `Tab` / `Shift+Tab` 焦点遍历，避免嵌套无边框 `EDIT` 和自绘按钮破坏默认顺序。
- 预设尺寸从 `SizerWin.ini` 读取，菜单弹出前实时加载。
- 只响应普通窗口状态，最大化和最小化窗口无效，主动排除桌面和任务栏类窗口。
- 使用显示器工作区处理任务栏，不再读取任务栏注册表并手动偏移。
- 热键使用 `MOD_NOREPEAT`，避免长按连续触发。

## SizerSwift

入口：`SizerSwift/Sources/main.swift`

包配置：

- Swift tools version：5.9。
- 最低平台：macOS 13。
- 目标：单个 executable target，名称 `SizerSwift`。

主要结构和函数：

| 名称 | 职责 |
|---|---|
| `L10n` | 英语、繁体中文、简体中文字符串选择 |
| `WindowInfo` | 记录窗口位置和尺寸 |
| `findFrontmostWindow()` | 优先 AX 查询前台窗口，失败时查询 CGWindowList |
| `screenForRect(...)` | 根据窗口中心点匹配屏幕 |
| `centerWindowViaAX()` | 用 Accessibility API 直接设置位置 |
| `simulateDrag(...)` | 通过 `CGEventSource(.privateState)` 模拟鼠标拖拽 |
| `centerWindowViaDrag()` | AX 不可用时用拖拽方式居中 |
| `resizeAndCenterViaAX()` | 用 AX 调整为可见区域 75% 并居中 |
| `resizeAndCenterViaDrag()` | AX 不可用时只居中，不调整尺寸 |
| `registerHotkey()` | 使用 `CGEvent.tapCreate` 监听全局快捷键 |
| `isLoginItemEnabled()` / `setLoginItem(enabled:)` | macOS 13+ 登录项管理 |
| `AppDelegate` | 辅助功能权限提示、菜单栏图标和菜单项 |

行为路径：

1. 启动后以 `.accessory` 策略运行，无 Dock 图标。
2. 如果没有辅助功能权限，弹窗提示并可打开系统设置。
3. 创建菜单栏图标和菜单。
4. 注册键盘事件 tap。
5. 快捷键触发时优先用 AX 操作窗口，失败再用拖拽回退。

## 其他脚本

| 文件 | 逻辑 |
|---|---|
| `Userscript/EmuParadise Download Workaround.user.js` | 从 URL 第 6 段取 `gid`，在 `.download-link` 前插入下载链接 |
| `Userscript/Re-add Download Button Vimm's Lair.user.js` | 查找 `#dl_form`，如果没有目标 submit 按钮则追加按钮 |
| `Stash/external-ip-address-tile.js` | 调用 `$httpClient.get`，成功时解析 JSON 并 `$done({ content })` |
| `AutoHotkey/Test/Main.ahk` | 键盘 Hook 实验，当前只用于测试 |
| `css/vscode.css` | 调整 VS Code 特定区域字体链 |
