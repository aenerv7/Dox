# Dox

自用的 Windows/macOS 工具、浏览器扩展、用户脚本和界面定制合集。各目录基本是独立模块，可按需直接运行、安装或构建；仓库没有统一的根级构建命令。

## 功能一览

| 模块 | 说明 |
|---|---|
| [`AutoHotkey/SizerAHK`](./AutoHotkey/SizerAHK) | AutoHotkey v2 窗口尺寸和位置调整工具 |
| [`SizerWin`](./SizerWin) | 不依赖 AutoHotkey 运行时的原生 Windows 窗口调整工具 |
| [`CapsLockOSD`](./CapsLockOSD) | Windows 原生 Caps Lock 状态屏幕提示 |
| [`SizerSwift`](./SizerSwift) | macOS 菜单栏窗口调整工具 |
| [`Firefox/AutoSortBookmarks`](./Firefox/AutoSortBookmarks) | Firefox 书签自动整理扩展 |
| [`Windhawk/CJKSpacer`](./Windhawk/CJKSpacer) | 为 Explorer 菜单和 Tooltip 的中日韩字符边界补空格的 Windhawk 模组 |
| [`css`](./css) | 中文字体映射和 VS Code 外观自定义 CSS |
| [`Userscript`](./Userscript) | Tampermonkey/Greasemonkey 用户脚本 |
| [`Stash`](./Stash) | Stash 磁贴脚本 |
| [`Batch files/Flatten.bat`](./Batch%20files/Flatten.bat) | Windows 目录展平工具 |

## 中文字体映射

通过 `@font-face` 将常见英文字体名、CSS 通用字体族名和旧式中文字体名映射到现代中文字体，优化网页中文显示。

以下两个文件共享同一套映射规则，修改时需同步维护：

- [`css/font-face.css`](./css/font-face.css) — 可独立引用的 CSS
- [`Userscript/中文字体优化.user.js`](./Userscript/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.user.js) — Tampermonkey 用户脚本版本

### 目标字体

| 类别 | 字体 | 回退 |
|---|---|---|
| 无衬线 | Noto Sans SC | PingFang SC |
| 衬线 | Noto Serif SC | — |
| 等宽 | Maple Mono Normal NF CN | — |
| 手写 | LXGW WenKai | — |
| 幻想 | Yozai | — |

### 映射范围

- CSS 通用族名：`serif`、`sans-serif`、`monospace`、`cursive`、`fantasy`
- 常见英文字体：Georgia、Helvetica、Segoe UI、Consolas 等的 CJK 回退
- 旧式中文字体：宋体、新宋体、细明体等
- `unicode-range` 覆盖 Unicode 15.1 的主要 CJK 区段，并包含扩展字、符号标点、全角字符、假名和韩文等

## Windows 工具

### SizerAHK

使用 AutoHotkey v2 编写的窗口尺寸和位置调整工具。按 `Shift+Alt+Space` 呼出菜单。

- 预设分辨率、自动调整到当前显示器约 3/4、居中和自定义尺寸
- 多显示器支持，并根据任务栏设置计算可用区域
- 自定义尺寸窗口支持 `Enter` 调整、`Ctrl+Enter` 调整并居中
- 中英文双语 UI
- Windows 深色模式适配

运行入口：`AutoHotkey/SizerAHK/SizerAHK.ahk`。

### SizerWin

SizerAHK 的原生 Windows 移植版本，使用纯 C + Win32 API 编写，编译为独立 exe，不依赖 AutoHotkey 或其他运行时。适用于 AutoHotkey 被游戏反作弊拦截的场景。

同样使用 `Shift+Alt+Space` 呼出菜单；最大化和最小化窗口不会响应。

- 预设分辨率、自动调整到当前显示器工作区约 3/4、居中和自定义尺寸
- 多显示器支持，基于当前窗口所在显示器的工作区避开任务栏
- 预设分辨率通过 exe 同目录的 `SizerWin.ini` 配置，重新呼出菜单即可实时生效
- 中英文双语 UI，支持 Windows 深色模式
- Per-Monitor DPI awareness
- 自定义尺寸窗口使用原生 Win32 自绘圆角输入框和按钮，支持 `Tab` / `Shift+Tab`、`Enter`、`Ctrl+Enter` 和 `Esc`
- 热键使用 `MOD_NOREPEAT`，避免长按重复触发

PowerShell 构建脚本会自动定位 Visual Studio / Build Tools：

```powershell
cd SizerWin
.\build.ps1
```

也可在 Visual Studio Developer Command Prompt 中运行：

```bat
cd SizerWin
build.bat
```

备用 CMake 构建方式：

```powershell
cmake -S SizerWin -B SizerWin/build
cmake --build SizerWin/build --config Release
```

### CapsLockOSD

Windows 原生 Caps Lock 屏幕提示工具，使用 C++、Win32 API 和系统自带 GDI+ 实现，不依赖第三方库或运行时。视觉比例参考 Logitech Options 的 Caps Lock 提示。

- 仅在 Caps Lock 状态切换时显示 OSD
- 半透明黑色圆角背景、白色 `A/a` 图标和状态文本
- OSD 置顶、无焦点、点击穿透，不打断当前输入
- 支持多显示器和 Per-Monitor DPI，显示在当前前台窗口所在屏幕约 90% 垂直位置
- 状态文本支持简体中文、繁体中文和英文，并按系统 UI 语言选择
- 单实例运行，不创建托盘图标，也不内置开机自启动
- 启动时读取同目录的 `CapsLockOSD.ini`；不存在时自动生成，可配置背景透明度和显示时长
- 普通 Win32 窗口无法保证覆盖 DirectX 独占全屏

完整配置、限制和停止方式见 [`CapsLockOSD/README.md`](./CapsLockOSD/README.md)。构建方式：

```powershell
cd CapsLockOSD
.\build.ps1
```

也可使用 `build.bat` 或 CMake 构建。

## SizerSwift

SizerAHK 的 macOS 原生移植版本，使用 Swift 编写，最低支持 macOS 13，编译为独立 `.app`。

- `⌥⌘C` — 居中当前窗口，保持原尺寸
- `⌃⌥⌘C` — 将当前窗口调整到屏幕可见区域的 75% 并居中
- 菜单栏常驻图标，无 Dock 图标
- 支持通过 `SMAppService` 开机自启动
- 支持英语、繁体中文和简体中文
- 优先使用 Accessibility API 直接操作窗口；不暴露 AX 窗口的应用会回退到模拟拖拽标题栏居中，回退路径不能调整窗口尺寸

首次使用需要在“系统设置 → 隐私与安全性 → 辅助功能”中授权。构建：

```bash
cd SizerSwift
swift build -c release
```

手动打包为 `.app` 后部署到 `/Applications`，需执行 `xattr -cr` 清除隔离属性。当前不使用 codesign 签名，以避免辅助功能权限因重新签名而失效。

## Firefox 扩展

### Auto Sort Bookmarks

[`Firefox/AutoSortBookmarks`](./Firefox/AutoSortBookmarks) 是适用于 Firefox 142 及更高版本的 Manifest V3 扩展，递归整理 `Bookmarks Menu` 和 `Other Bookmarks` 两个书签根目录。

- 以分隔线划分互不影响的区段，分隔线位置保持不变
- 每个区段内文件夹置顶并按标题排序
- URL 书签随后按标题、URL 排序，支持自然数字顺序
- 文件夹内部递归使用相同规则
- 在安装、Firefox 启动及书签创建、修改、移动、删除后自动安排排序，并合并连续变化
- 仅在普通 Firefox 浏览器窗口获得焦点时执行，避免用户正在使用 Library 窗口时重排

临时安装：打开 `about:debugging#/runtime/this-firefox`，点击“临时载入附加组件”，选择该目录下的 `manifest.json`。扩展的 API 限制和完整说明见其 [`README.md`](./Firefox/AutoSortBookmarks/README.md)。

运行测试：

```powershell
node --test Firefox/AutoSortBookmarks/tests/sorter.test.js
```

## Windhawk

### CJKSpacer

[`Windhawk/CJKSpacer`](./Windhawk/CJKSpacer) 是注入 `explorer.exe` 的 Windhawk 模组，在中日韩字符与字母或数字直接相邻时插入一个半角空格，例如：

```text
使用VS Code打开  →  使用 VS Code 打开
压缩为ZIP文件    →  压缩为 ZIP 文件
```

- 处理 Explorer、桌面、任务栏和跳转列表的经典 Win32 右键菜单
- 处理经典主题 Tooltip，包括部分通知区域图标使用的旧式 Tooltip
- Windows 11 新版 XAML 右键菜单和 Tooltip 通过 `modernUiText` 可选启用
- 仅临时修改显示文本，不修改文件名、系统文件或注册表；菜单关闭、元素离开视觉树或模组卸载时恢复
- 默认不启用现代 XAML 路径，因为它可能与 Taskbar Styler、File Explorer Styler 等 XAML Diagnostics 工具冲突
- “开始”、搜索及部分飞出面板由其他进程托管，不属于本模组注入范围

安装步骤、配置项、已知限制和排查方式见 [`Windhawk/CJKSpacer/README.md`](./Windhawk/CJKSpacer/README.md)。

仓库还保留了 [`Windhawk/windhawk-mods`](./Windhawk/windhawk-mods) 子模块，它是独立的 Windhawk mods 集合，使用方式以子模块内文档为准。

## CSS

- [`font-face.css`](./css/font-face.css) — 跨平台中文字体适配，详见上方“中文字体映射”
- [`vscode.css`](./css/vscode.css) — 为 Visual Studio Code 的状态栏和最近项目区域指定中文字体链

## Userscript

将脚本安装到 Tampermonkey 或 Greasemonkey 后按目标网站使用：

- [`中文字体优化.user.js`](./Userscript/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.user.js) — 全站中文字体优化，与 `css/font-face.css` 共用映射规则
- [`EmuParadise Download Workaround.user.js`](./Userscript/EmuParadise%20Download%20Workaround.user.js) — 在 EmuParadise 页面补充可用下载链接，依赖脚本元数据中的 jQuery
- [`Re-add Download Button Vimm's Lair.user.js`](./Userscript/Re-add%20Download%20Button%20Vimm's%20Lair.user.js) — 在 Vimm's Lair 下载按钮被移除时恢复提交按钮

## Stash

[`Stash/external-ip-address-tile.js`](./Stash/external-ip-address-tile.js) 是 Stash 外部 IP 地址磁贴脚本，通过 `ip-api.com` 获取 IP 和国家/地区信息，显示为 `IP @ 国家/地区`；请求失败时显示“获取失败”。

## Batch files

[`Batch files/Flatten.bat`](./Batch%20files/Flatten.bat) 用于分别将一个或多个目标文件夹的所有子目录文件移动到各自的目标根目录，并删除变空的子目录。

- 支持一次拖拽一个或多个文件夹到脚本，或通过命令行传入多个路径
- 多个目标会统一预检和确认，再按传入顺序分别展平；重复目标会去重，父子目标组合会被拒绝
- 使用 `/Y` 或 `-Y` 跳过确认和结束暂停
- 同名项目不会覆盖，原文件及其所在目录会保留
- 操作不可撤销，脚本会拒绝处理磁盘根目录、共享根目录以及符号链接/目录联接
