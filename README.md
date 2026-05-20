# Dox

自用网络工具与脚本合集。

## 中文字体映射

通过 `@font-face` 将常见英文字体名和旧式中文字体名映射到现代中文字体，优化网页中文显示。

两个文件共享同一套映射规则，需同步维护：

- `css/font-face.css` — 独立 CSS，可被其他工具引用
- `Userscript/中文字体优化.user.js` — Tampermonkey 用户脚本版本

### 目标字体

| 类别 | 字体 | 回退 |
|---|---|---|
| 无衬线 | Noto Sans SC | PingFang SC |
| 衬线 | Noto Serif SC | — |
| 等宽 | Maple Mono Normal NF CN | — |
| 手写 | LXGW WenKai | — |
| 幻想 | Yozai | — |

### 映射范围

- CSS 通用族名（serif / sans-serif / monospace / cursive / fantasy）
- 常见英文字体（Georgia、Helvetica、Segoe UI、Consolas 等）的 CJK 回退
- 旧式中文字体替换（宋体 → Noto Sans SC、新宋体 → Maple Mono、细明体 → Noto Sans SC 等）

`unicode-range` 覆盖完整 CJK 区段（Unicode 15.1），包括扩展 A-I、符号标点、全角字符、假名、韩文等。

## AutoHotkey

### SizerAHK

Windows 窗口尺寸和位置调整工具。`Shift+Alt+Space` 呼出菜单。

- 预设分辨率 / 自动调整（3/4 屏幕）/ 居中 / 自定义尺寸
- 多显示器支持
- 中英文双语 UI
- Windows 深色模式适配

## SizerWin

SizerAHK 的原生 Windows 移植版本，使用纯 C + Win32 API 实现，编译为独立 exe，不依赖任何运行时。适用于 AutoHotKey 被游戏反作弊拦截的场景。

功能与 SizerAHK 一致：`Shift+Alt+Space` 呼出菜单。

- 预设分辨率 / 自动调整（3/4 屏幕）/ 居中 / 自定义尺寸
- 多显示器支持，任务栏偏移智能检测
- 中英文双语 UI
- Windows 深色模式适配（菜单、对话框、自绘圆角按钮和输入框）
- 预设分辨率通过 `SizerWin.ini` 配置，实时生效无需重启

### 构建

在 Visual Studio Developer Command Prompt 中运行：

```bat
cd SizerWin
build.bat
```

## SizerSwift

SizerAHK 的 macOS 原生移植版本，使用 Swift 编写，编译为独立 `.app`。

- `⌥⌘C` — 居中当前窗口（保持尺寸）
- `⌃⌥⌘C` — 调整到屏幕 75% 并居中
- 菜单栏常驻图标，无 Dock 图标
- 支持开机自启动（基于 `SMAppService`）
- 多语言：英语、繁体中文、简体中文
- 标准窗口通过 Accessibility API 直接操作；不暴露 AX 窗口的应用（如 Game Porting Toolkit 游戏）通过模拟鼠标拖拽标题栏移动

### 构建

```bash
cd SizerSwift
swift build -c release
```

手动打包为 `.app` bundle 后部署到 `/Applications`，需执行 `xattr -cr` 清除隔离属性。不使用 codesign 签名以避免辅助功能权限失效。

## CSS

- `font-face.css` — 跨平台中文字体适配（见上方说明）
- `vscode.css` — Visual Studio Code 外观自定义

## Stash

- `external-ip-address-tile.js` — IP 地址及归属地显示磁贴

## Userscript

- `中文字体优化.user.js` — font-face.css 的用户脚本版本（见上方说明）
- `EmuParadise Download Workaround.user.js` — EmuParadise 下载修复
- `Re-add Download Button Vimm's Lair.user.js` — Vimm's Lair 下载按钮恢复

## 其他

- `magi.txt` — AdGuard 广告过滤规则列表
