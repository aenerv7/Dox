# 项目上下文

## 项目定位

Dox 是一个个人自用网络工具与脚本合集。仓库没有根级包管理器或统一构建系统，各目录基本是独立工具，可按需直接运行、安装或构建。

主要语言和格式：

| 类型 | 文件 | 用途 |
|---|---|---|
| AutoHotkey v2 | `AutoHotkey/**/*.ahk` | Windows 桌面自动化和窗口调整 |
| C / Win32 API | `SizerWin/*.c`, `SizerWin/*.rc`, `SizerWin/*.manifest` | 原生 Windows 窗口调整工具 |
| Swift 5.9 | `SizerSwift/**` | macOS 菜单栏窗口调整工具 |
| JavaScript | `Userscript/*.user.js`, `Stash/*.js` | 浏览器用户脚本和 Stash 磁贴 |
| CSS | `css/*.css` | 字体映射和 VS Code 外观自定义 |
| AdGuard 规则 | `magi.txt` | 白名单和网站过滤规则 |

## 当前目录清单

| 路径 | 状态 | 内容 |
|---|---|---|
| `.kiro/steering/` | 规则来源 | Kiro 生成的项目概览和 Userscript 版本规则 |
| `.codex/` | 当前新增 | 后续开发用文档 |
| `AutoHotkey/SizerAHK/` | 活跃 | AHK v2 版 Windows 窗口尺寸/位置调整工具，含图标资源 |
| `AutoHotkey/Test/` | 实验 | AHK 键盘 Hook 测试脚本，`Test.exe` 是忽略的本地产物 |
| `SizerWin/` | 活跃 | 纯 C + Win32 API 版窗口调整工具，适合 AHK 被拦截的场景 |
| `SizerSwift/` | 活跃 | macOS 原生菜单栏工具，Swift Package Manager 项目 |
| `css/` | 活跃 | 中文字体映射 CSS 和 VS Code 自定义 CSS |
| `Userscript/` | 活跃 | Tampermonkey/Greasemonkey 用户脚本和图标 |
| `Stash/` | 小工具 | Stash 外部 IP 地址磁贴脚本 |
| `magi.txt` | 活跃 | AdGuard 过滤规则列表 |
| `README.md` | 用户文档 | 仓库主说明 |

## 源码和本地产物边界

`.gitignore` 当前排除：

- `AutoHotkey/Test/Test.exe`
- `.DS_Store`
- `SizerSwift/.build/`
- `SizerSwift/build/`
- `SizerWin/SizerWin.exe`
- `SizerWin/SizerWin_new.exe`
- `SizerWin/*.obj`
- `SizerWin/*.res`
- `SizerWin/SizerWin.ini`

这些文件即使出现在工作区，也应视为生成产物或本地配置，不作为主要源码维护。当前源码入口是：

- `AutoHotkey/SizerAHK/SizerAHK.ahk`
- `SizerWin/SizerWin.c`
- `SizerWin/SizerWin.manifest`
- `SizerSwift/Sources/main.swift`
- `css/font-face.css`
- `Userscript/中文字体优化.user.js`
- `Userscript/EmuParadise Download Workaround.user.js`
- `Userscript/Re-add Download Button Vimm's Lair.user.js`
- `Stash/external-ip-address-tile.js`
- `magi.txt`

## 资源文件

| 文件 | 用途 |
|---|---|
| `AutoHotkey/SizerAHK/logo_48.png` | 48x48 PNG 图标 |
| `AutoHotkey/SizerAHK/logo_96.png` | 96x96 PNG 图标 |
| `AutoHotkey/SizerAHK/logo.ico` | Windows 图标 |
| `SizerWin/logo.ico` | Windows 图标，当前与 SizerAHK 的 ico 内容一致 |
| `SizerSwift/AppIcon.icns` | macOS 菜单栏/Bundle 图标 |
| `Userscript/中文字体优化.png` | 512x512 Userscript 图标 |

图标更新时要检查所有平台的引用，不要只替换单一文件。

## 主要功能域

### 中文字体映射

`css/font-face.css` 和 `Userscript/中文字体优化.user.js` 共享同一套 `@font-face` 映射。CSS 是独立样式表，Userscript 版本通过 `GM_addStyle` 或手动插入 `style` 标签注入页面。

目标是把常见英文字体、CSS 通用族名和旧式中文字体名映射到现代中文字体，改善网页中文显示。当前有效 `@font-face` 规则数量为 77，实际 CJK `unicode-range` 规则数量为 21。

### 窗口调整工具

仓库有三个相关实现：

- `SizerAHK`：AHK v2 版，快捷键 `Shift+Alt+Space` 呼出菜单，支持预设尺寸、自动 3/4 屏幕、居中、自定义尺寸。
- `SizerWin`：Win32 C 版，快捷键同上，支持 `SizerWin.ini` 动态配置预设尺寸，使用显示器工作区处理任务栏和多显示器，并提供原生 Win32 自定义尺寸窗口。
- `SizerSwift`：macOS 版，提供 `Option+Command+C` 居中和 `Control+Option+Command+C` 调整到 75% 并居中。

Windows 两个实现都包含多显示器判断；SizerAHK 使用任务栏偏移逻辑，SizerWin 使用显示器工作区。macOS 版优先用 Accessibility API 直接设置窗口，失败时使用 CGWindowList 查询窗口并模拟标题栏拖拽。

### 小脚本

- `Userscript/EmuParadise Download Workaround.user.js`：在 EmuParadise 页面补充可用下载链接，依赖 jQuery。
- `Userscript/Re-add Download Button Vimm's Lair.user.js`：在 Vimm's Lair 页面缺失下载按钮时补回提交按钮。
- `Stash/external-ip-address-tile.js`：请求 `http://ip-api.com/json/?lang=zh-CN`，显示 `IP @ 国家`。
- `css/vscode.css`：给 VS Code 状态栏和最近项目区域指定字体链。
- `magi.txt`：AdGuard 规则列表，包含白名单和站点元素过滤规则。
