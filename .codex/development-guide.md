# 开发指南

## 基本原则

- 本仓库以中文文档和中文注释为主。
- 根目录没有统一构建命令，按模块开发和验证。
- 不要把 `.gitignore` 中列出的本地产物当作源码修改目标。
- 修改功能后同步更新 `README.md` 和 `.codex` 中对应说明。
- 除非有特殊要求，项目规则倾向于直接维护 `main` 分支。

## 环境准备

| 模块 | 需要的环境 |
|---|---|
| SizerAHK | AutoHotkey v2 |
| SizerWin | Visual Studio Build Tools 或 Windows SDK 的 `cl.exe` / `rc.exe`，可选 CMake |
| SizerSwift | macOS 13+，Swift 5.9+，辅助功能权限 |
| Userscript | Tampermonkey 或 Greasemonkey |
| Stash | Stash 脚本运行环境 |
| CSS | 可加载自定义 CSS 的浏览器/工具 |
| AdGuard | AdGuard 兼容规则列表 |

## 常用开发流程

### 修改中文字体映射

1. 同步修改 `css/font-face.css` 和 `Userscript/中文字体优化.user.js` 中的 `@font-face` 规则。
2. 递增 `Userscript/中文字体优化.user.js` 顶部 `@version`。
3. 保持所有实际 `unicode-range` 使用同一个 CJK 范围。
4. 检查 Userscript 的中文文件名 URL 仍使用 URL 编码。
5. 在浏览器中安装或刷新脚本后，用常见字体名页面人工验证显示效果。

可用 PowerShell 做基础统计：

```powershell
$css = Get-Content -Raw -LiteralPath 'css\font-face.css'
$usr = Get-Content -Raw -LiteralPath 'Userscript\中文字体优化.user.js'
$cssNoComments = [regex]::Replace($css, '/\*[\s\S]*?\*/', '')
[PSCustomObject]@{
  CssFontFace = ([regex]::Matches($cssNoComments, '@font-face')).Count
  UserScriptFontFace = ([regex]::Matches($usr, '@font-face')).Count
  CssUnicodeRange = ([regex]::Matches($cssNoComments, '(?m)^\s*unicode-range:')).Count
  UserScriptUnicodeRange = ([regex]::Matches($usr, '(?m)^\s*unicode-range:')).Count
  UserScriptVersion = ([regex]::Match($usr, '@version\s+([^\r\n]+)').Groups[1].Value.Trim()
}
```

当前预期统计：`@font-face` 为 77，实际 `unicode-range` 为 21。

### 开发 SizerAHK

运行方式：

```powershell
AutoHotkey64.exe AutoHotkey\SizerAHK\SizerAHK.ahk
```

验证重点：

- `Shift+Alt+Space` 能呼出菜单。
- 普通窗口、最大化窗口、最小化窗口行为符合预期。
- 预设尺寸、按住 Control 后预设尺寸并居中、自动 3/4 屏幕、居中、自定义尺寸都能工作。
- 主显示器任务栏自动隐藏/非自动隐藏下偏移正确。
- 副显示器在开启/关闭“在所有显示器上显示任务栏”时偏移正确。
- 简体中文系统和非中文系统菜单文案正常。
- 深色模式下菜单和 GUI 没有明显不可读问题。

### 开发 SizerWin

推荐 PowerShell 方式，会自动定位 Visual Studio / Build Tools：

```powershell
cd SizerWin
.\build.ps1
```

`build.bat` 方式，需要在 Visual Studio Developer Command Prompt 中运行：

```bat
cd SizerWin
build.bat
```

CMake 方式：

```powershell
cmake -S SizerWin -B SizerWin/build
cmake --build SizerWin/build --config Release
```

验证重点：

- 首次运行能生成 `SizerWin.ini`。
- 程序目录无权读取或创建 `SizerWin.ini` 时，会弹出警告并退出。
- 修改 `SizerWin.ini` 后不重启程序，重新呼出菜单即可看到预设变化。
- `Shift+Alt+Space` 能呼出菜单。
- 自动、居中、预设尺寸、按住 Control 后预设尺寸并居中、自定义尺寸都能工作。
- 自定义尺寸窗口右上角不显示最小化、最大化、关闭按钮。
- 自定义尺寸窗口内 `Tab` / `Shift+Tab` 在输入框和按钮间切换焦点，`Enter` 调整尺寸，`Ctrl+Enter` 调整尺寸并居中，`Esc` 取消。
- 最大化和最小化窗口不响应。
- 多显示器和任务栏位置变化下，自动和居中应基于当前窗口所在显示器的工作区。
- 高 DPI 或混合缩放环境下确认菜单和窗口尺寸坐标没有明显偏移。
- 热键冲突时能显示错误信息。
- 桌面、任务栏等窗口不会被误处理。
- AHK 版已有的窗口定位/任务栏偏移行为，如有变更，需要评估是否同步到 C 版。

### 开发 SizerSwift

构建：

```bash
cd SizerSwift
swift build -c release
```

手动打包 `.app` 时沿用以下结构：

```text
SizerSwift.app/
└── Contents/
    ├── Info.plist
    ├── MacOS/
    │   └── SizerSwift
    └── Resources/
        └── AppIcon.icns
```

部署到 `/Applications` 后清除隔离属性：

```bash
xattr -cr /Applications/SizerSwift.app
```

验证重点：

- 首次运行没有辅助功能权限时提示清楚，并能打开系统设置。
- 授权后菜单栏图标出现且无 Dock 图标。
- `Option+Command+C` 能居中当前窗口。
- `Control+Option+Command+C` 能调整到可见区域 75% 并居中。
- 不暴露 AX 窗口的应用能通过拖拽回退至少完成居中。
- 登录项菜单能正确反映和切换状态。
- 英语、繁体中文、简体中文环境的菜单文案正确。

注意：当前设计不使用 codesign 签名，避免重新编译后辅助功能权限频繁失效。

### 开发 Userscript 小脚本

验证方式以目标站点人工测试为主：

- 检查 `@match` 是否足够窄，避免影响无关页面。
- 检查 `@downloadURL` 和 `@updateURL` 指向仓库 raw 地址。
- 改脚本行为时递增对应 `@version`。
- 对依赖站点 DOM 的逻辑，优先写成存在性检查，避免元素缺失时报错。

### 修改 Stash 磁贴

验证重点：

- `$httpClient.get` 出错时必须 `$done({ content: "获取失败" })`。
- JSON 解析前要考虑 API 失败或返回异常。
- 输出内容应适合磁贴展示，保持短文本。

### 修改 AdGuard 规则

修改 `magi.txt` 规则内容时：

1. 递增头部 `! Version`。
2. 更新 `! Last modified`，格式为 `YYYY/MM/DD HH:MM:SS +0800`。
3. 按域名后缀和站点分组维护，避免把规则随意追加到文件末尾。
4. 在 AdGuard 中导入或刷新规则后验证目标网站。

## 提交前检查

```powershell
git status --short
rg -n "TODO|FIXME|BUG" -g "!**/.git/**" -g "!**/*.exe" -g "!**/*.ico" -g "!**/*.png" -g "!**/*.icns"
```

按修改范围补做对应模块验证。当前仓库没有自动化测试套件，不能只依赖构建成功。
