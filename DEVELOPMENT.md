# Dox 开发文档

> **本文档是 Dox 仓库唯一的开发文档。** 项目定位、全局规则、以及所有模块的架构、维护约束、构建与验证清单都集中在这里。以后任何新增或修改的开发文档，一律写入本文档对应的模块小节，不再在模块目录或 `.codex`、`.kiro` 等位置增建独立的开发文档。
>
> 只读类的对外说明文件不在此约定范围内，保持原位：各模块的 `README.md`（用户使用说明）、各 `PRIVACY.md`（隐私说明）、`Dox Reader/Firefox/AMO_REVIEW_NOTES.md`（提交给 Mozilla AMO 审核的英文审查材料）。本文档只负责维护者视角的开发、架构与维护规范。

## 目录

1. [项目概览](#1-项目概览)
2. [全局规则](#2-全局规则)
3. [模块开发文档](#3-模块开发文档)
   - 3.1 [中文字体优化（CJK 字体映射）](#31-中文字体优化cjk-字体映射)
   - 3.2 [SizerAHK](#32-sizerahk)
   - 3.3 [SizerWin](#33-sizerwin)
   - 3.4 [SizerSwift](#34-sizerswift)
   - 3.5 [CapsLockOSD](#35-capslockosd)
   - 3.6 [Dox Reader](#36-dox-readerfirefox--cloudflare-workers)
   - 3.7 [Firefox Auto Sort Bookmarks](#37-firefox-auto-sort-bookmarks)
   - 3.8 [Userscript 小脚本](#38-userscript-小脚本)
   - 3.9 [Stash](#39-stash)
   - 3.10 [AdGuard（magi.txt）](#310-adguardmagitxt)
   - 3.11 [Batch files（RemoveMSEdge）](#311-batch-filesremovemsedge)
   - 3.12 [DeepSeek Harness Launcher](#312-deepseek-harness-launcher)
   - 3.13 [Android ApkRename](#313-android-apkrename)
   - 3.14 [Firefox PortableBridge](#314-firefox-portablebridge)
4. [开发环境与构建命令速查](#4-开发环境与构建命令速查)
5. [提交前检查](#5-提交前检查)

---

## 1. 项目概览

### 1.1 定位

Dox 是一个个人自用的 Windows/macOS 工具、浏览器扩展、用户脚本和界面定制合集。仓库没有根级包管理器或统一构建系统，各目录基本是独立模块，可按需直接运行、安装或构建。

### 1.2 技术栈与语言

| 类型 | 文件 | 用途 |
|---|---|---|
| AutoHotkey v2 | `AutoHotkey/**/*.ahk` | Windows 桌面自动化和窗口调整 |
| C / Win32 API | `SizerWin/*.c`、`SizerWin/*.rc`、`SizerWin/*.manifest`、`CapsLockOSD/` | 原生 Windows 窗口调整工具与 OSD 提示 |
| C++20 / Win32 API | `DeepSeek Harness/Launcher/` | DeepSeek Harness 本地托盘监督器 |
| C# / .NET Framework 4 | `Firefox/PortableBridge/` | 便携 Firefox 的会话级 HTTP(S) 协议桥接与生命周期监视 |
| Swift 5.9 | `SizerSwift/**` | macOS 菜单栏窗口调整工具 |
| TypeScript / Preact | `Dox Reader/` | local-first RSS 阅读器（Firefox 扩展 + Cloudflare Workers） |
| JavaScript | `Userscript/*.user.js`、`Stash/*.js`、`Firefox/AutoSortBookmarks/` | 浏览器用户脚本、Stash 磁贴、Manifest V3 扩展 |
| CSS | `css/*.css` | 字体映射和 VS Code 外观自定义 |
| 批处理 | `Batch files/*.bat` | Edge 清理脚本 |
| AdGuard 规则 | `magi.txt` | 白名单和网站过滤规则 |

### 1.3 模块清单

| 模块 | 状态 | 内容 |
|---|---|---|
| `AutoHotkey/SizerAHK/` | 活跃 | AHK v2 版 Windows 窗口尺寸/位置调整工具，含图标资源 |
| `AutoHotkey/Test/` | 实验 | AHK 键盘 Hook 测试脚本，`Test.exe` 是忽略的本地产物 |
| `SizerWin/` | 活跃 | 纯 C + Win32 API 版窗口调整工具，适合 AHK 被拦截的场景 |
| `SizerSwift/` | 活跃 | macOS 原生菜单栏窗口调整工具，Swift Package Manager 项目 |
| `CapsLockOSD/` | 活跃 | Windows 原生 Caps Lock 状态屏幕提示 |
| `Dox Reader/` | 活跃 | local-first RSS 阅读器（Firefox 扩展版 + Cloudflare Workers 网页版） |
| `Firefox/AutoSortBookmarks/` | 活跃 | Manifest V3 书签自动整理扩展 |
| `Firefox/PortableBridge/` | 活跃 | 无默认浏览器环境下的便携 Firefox 会话级 HTTP(S) 回退 |
| `DeepSeek Harness/Launcher/` | 活跃 | DeepSeek Harness `dsh web` 本地托盘监督器 |
| `css/` | 活跃 | 中文字体映射 CSS 和 VS Code 自定义 CSS |
| `Userscript/` | 活跃 | Tampermonkey/Greasemonkey 用户脚本和图标 |
| `Stash/` | 小工具 | Stash 外部 IP 地址磁贴脚本 |
| `Batch files/` | 活跃 | Edge 清理脚本（保留/删除 WebView2 两版） |
| `Android/ApkRename/` | 活跃 | 只改 APK 应用名的 PowerShell 脚本 |
| `magi.txt` | 活跃 | AdGuard 过滤规则列表 |
| `README.md` | 用户文档 | 仓库主说明 |

> `Windhawk/windhawk-mods` 是 git 子模块（独立的 Windhawk mods 集合），其文档与源码不归本仓库维护，使用方式以子模块内文档为准。

### 1.4 源码与生成产物边界

`.gitignore` 当前排除，以下即使出现也应视为生成产物或本地配置，不作为主要源码维护：

- `AutoHotkey/Test/Test.exe`
- `.DS_Store`
- `Firefox/**/web-ext-artifacts/`
- `Firefox/PortableBridge/bin/`
- `SizerSwift/.build/`、`SizerSwift/build/`
- `SizerWin/SizerWin.exe`、`SizerWin/SizerWin_new.exe`、`SizerWin/*.obj`、`SizerWin/*.res`、`SizerWin/SizerWin.ini`
- `DeepSeek Harness/Launcher/bin/`

当前源码入口：

- `AutoHotkey/SizerAHK/SizerAHK.ahk`
- `SizerWin/SizerWin.c`、`SizerWin/SizerWin.manifest`
- `SizerSwift/Sources/main.swift`
- `CapsLockOSD/`（C++ 源与资源脚本）
- `css/font-face.css`
- `Firefox/AutoSortBookmarks/manifest.json`、`background.js`、`sorter.js`
- `Firefox/PortableBridge/FirefoxPortableBridge.cs`、`build.ps1`
- `Userscript/中文字体优化.user.js`、`EmuParadise Download Workaround.user.js`、`Re-add Download Button Vimm's Lair.user.js`
- `Stash/external-ip-address-tile.js`
- `magi.txt`
- `Dox Reader/`（`src/`、`worker/`、`public/` 等源码文件）

### 1.5 资源文件（图标）

| 文件 | 用途 |
|---|---|
| `AutoHotkey/SizerAHK/logo_48.png` | 48×48 PNG 图标 |
| `AutoHotkey/SizerAHK/logo_96.png` | 96×96 PNG 图标 |
| `AutoHotkey/SizerAHK/logo.ico` | Windows 图标 |
| `SizerWin/logo.ico` | Windows 图标，当前与 SizerAHK 的 ico 内容一致 |
| `SizerSwift/AppIcon.icns` | macOS 菜单栏/Bundle 图标 |
| `Userscript/中文字体优化.png` | 512×512 Userscript 图标 |

图标更新时要检查所有平台的引用，不要只替换单一文件。

---

## 2. 全局规则

### 2.1 基本原则

- 本仓库以中文文档和中文注释为主。
- 根目录没有统一构建命令，按模块开发和验证。
- 不要把 `.gitignore` 中列出的本地产物当作源码修改目标。
- 修改用户可见行为时同步更新 `README.md`；修改维护方式、架构或模块结构时同步更新本文档。
- 除非有特殊要求，项目规则倾向于直接维护 `main` 分支。

### 2.2 资源与图标

- `AutoHotkey/SizerAHK/logo.ico` 和 `SizerWin/logo.ico` 当前内容一致，更新一个时要评估另一个是否同步。
- `SizerSwift/AppIcon.icns` 是 macOS 资源，不能直接用 PNG 替代。
- `Userscript/中文字体优化.png` 被 Userscript 元数据 `@icon` 引用，移动或改名时必须更新 URL。
- `DeepSeek Harness/Launcher/src/Launcher.ico` 由 `scripts\make-icon.ps1` 从官方 SVG 生成，不要手工编辑二进制 ICO。

### 2.3 生成产物

以下文件或目录不应作为源码提交：

- `AutoHotkey/Test/Test.exe`
- `SizerSwift/.build/`、`SizerSwift/build/`
- `SizerWin/SizerWin.exe`、`SizerWin/SizerWin_new.exe`、`SizerWin/*.obj`、`SizerWin/*.res`、`SizerWin/SizerWin.ini`
- `Firefox/**/web-ext-artifacts/`
- `Firefox/PortableBridge/bin/`
- `DeepSeek Harness/Launcher/bin/`
- `.DS_Store`

如果这些文件在工作区存在，通常是本地运行或构建产生的结果。

### 2.4 提交前检查

```powershell
git status --short
git diff --check
rg -n "TODO|FIXME|BUG" -g "!**/.git/**" -g "!**/*.exe" -g "!**/*.ico" -g "!**/*.png" -g "!**/*.icns"
```

按修改范围补做对应模块的验证清单。当前仓库没有统一的自动化测试套件，各模块验证方式见其小节，不能只依赖构建成功。

---

## 3. 模块开发文档

### 3.1 中文字体优化（CJK 字体映射）

仓库的中文字体优化通过 `@font-face` 把常见英文字体名、CSS 通用字体族名和旧式中文字体名重新映射到现代中文字体，改善网页中文显示。核心是两份**必须同步**的文件：

| 文件 | 角色 |
|---|---|
| `css/font-face.css` | 独立样式表，可被其他工具直接引用 |
| `Userscript/中文字体优化.user.js` | Tampermonkey/Greasemonkey 用户脚本；元数据头后把同一套 CSS 放进模板字符串注入页面 |
| `css/vscode.css` | 仅给 VS Code 状态栏和最近项目区域指定中文字体链，不参与上述映射同步 |

两个主文件当前各含 **70 条** `@font-face`，其中带 **`unicode-range`** 的 **21 条**。任一改动必须同步到另一文件，并递增脚本 `@version`。

#### 注入方式（Userscript）

脚本在 `document-start` 阶段注入样式：

1. 优先调用 `GM_addStyle(css)`（元数据声明了 `@grant GM_addStyle`）。
2. 没有 `GM_addStyle` 时，新建 `style` 节点写入 CSS，追加到 `head` 或 `documentElement`。

#### 语言默认字体

文件顶部先用 CSS 变量 + `:lang()` 按语言切默认字体，直接作用到 `html`/`body`/`[lang]` 等：

| CSS 变量 | 默认值 | 中文语言环境覆盖 |
|---|---|---|
| `--dox-default-sans-serif-font` | `SF Pro` | 简中/日/韩 `PingFang SC`；繁中 `PingFang TC` |
| `--dox-default-serif-font` | `New York` | 简中 `Songti SC`；繁中 `Songti TC` |
| `--dox-default-monospace-font` | `Maple Mono Normal NF CN` | 不变 |

`:lang()` 覆盖简中侧 `zh`、`zh-Hans`、`zh-CN`、`zh-SG`、`ja`、`ko`，繁中侧 `zh-Hant`、`zh-TW`、`zh-HK`、`zh-MO`。`pre`/`code`/`kbd`/`samp`/`textarea` 统一走等宽变量。

#### 目标字体

`local()` 书写顺序即优先级：

| 类别 | 首选 | 回退 |
|---|---|---|
| 无衬线 CJK | PingFang SC（繁中 PingFang TC） | Noto Sans SC |
| 衬线 CJK | Songti SC（繁中 Songti TC） | Noto Serif SC |
| 等宽 | Maple Mono Normal NF CN | — |
| 手写（cursive） | LXGW WenKai | — |
| 幻想（fantasy） | Yozai | — |

> `FantasqueSansMonoRegular` 是特例，英文部分回退链为 `JetBrains Maple Mono` → `SF Mono`。

#### 规则分层（共 70 条，`unicode-range` 21 条）

1. **补充通用字体**（6 条，单规则、不带 `unicode-range`）：通用族名 `monospace`、`cursive`、`fantasy` 及其大写变体，分别映射至 Maple Mono / LXGW WenKai / Yozai。`serif`/`sans-serif` 没有独立 `@font-face`，由顶部 `:root`/`:lang` 变量负责。

2. **英文衬线**（3 族 × 2 = 6 条，双规则）：`Georgia`、`Times`、`Times New Roman`。第一条无 `unicode-range` 保底（`local(原字体), local('Songti SC'), local('Noto Serif SC')`）；第二条限定 CJK 范围时 `src` 只留中文字体。

3. **英文无衬线**（10 族 × 2 = 20 条，双规则）：`-apple-system`、`Helvetica`、`helvetica neue`、`Helvetica Neue`、`lucida grande`、`Lucida Grande`、`Open Sans`、`Segoe UI`、`Tahoma`、`Verdana`。CJK 回退 `local('PingFang SC'), local('Noto Sans SC')`。

4. **等宽**（6 族 × 2 = 12 条，双规则）：`Consolas`、`Courier`、`Courier New`、`FantasqueSansMonoRegular`、`lucida console`、`Lucida Console`。英文回退 Maple Mono，CJK 范围仍回退 PingFang SC / Noto Sans SC。

5. **旧式中文字体替换**（20 条，单规则）：按字体是否等宽决定目标——
   - 非等宽 → PingFang SC / Noto Sans SC：`SimSun`、`simsun`、`宋体`、`宋體`、`MingLiU`（含 `-ExtB`/`_HKSCS`/`_HKSCS-ExtB`）、`细明体`、`細明體`，均保留带引号/无引号两种写法。
   - 等宽 → Maple Mono Normal NF CN：`NSimSun`、`nsimsun`、`新宋体`、`新宋體`，同样保留带引号/无引号写法。

6. **特殊**（6 条）：`Comic Sans MS`、`Impact` 各 2 条（双规则）走 `LXGW WenKai`；`瀹嬩綋` 2 条走 PingFang SC / Noto Sans SC，用于兼容“宋体”被 GBK→UTF-8 错误转码的网页。

#### CJK unicode-range

21 条 `unicode-range` 共用同一个 Unicode 15.1 全 CJK 值（覆盖 CJK 统一汉字扩展 A–I、兼容表意文字、部首、符号标点、全角、注音、假名、韩文等），修改时必须保持完全一致（以 `css/font-face.css` 顶部注释为唯一范本）：

```text
U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+3007, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+400-E5E8, U+E600-E6CF, U+815-E86F, U+3007
```

> 上面为可读性压缩的示意，实际操作请直接复制 `css/font-face.css` 顶部注释里的完整值。

#### 维护红线与修改流程

1. 同步修改 `css/font-face.css` 和 `Userscript/中文字体优化.user.js` 中的同一处 `@font-face` 规则。
2. 递增 `Userscript/中文字体优化.user.js` 顶部 `@version`。
3. 保持所有实际 `unicode-range` 使用同一个 CJK 范围。
4. 字体名大小写变体成对出现（如 `Helvetica Neue`/`helvetica neue`、`monospace`/`Monospace`），因为浏览器对 `font-family` 大小写敏感性不一致。
5. 保持双规则模式：无 `unicode-range` 的规则做全量回退保底，带 `unicode-range` 的规则只处理 CJK 范围，避免英文字符被替换。
6. 检查 Userscript 元数据中中文文件名的 URL（`@icon`/`@downloadURL`/`@updateURL`）仍使用 URL 编码。
7. 改完在浏览器中安装/刷新脚本，用常见字体名页面人工验证显示效果。

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
  UserScriptVersion = ([regex]::Match($usr, '@version\s+([^\r\n]+)').Groups[1].Value.Trim())
}
```

预期统计：`@font-face` 各 70，实际 `unicode-range` 各 21。

### 3.2 SizerAHK

入口：`AutoHotkey/SizerAHK/SizerAHK.ahk`。使用 AutoHotkey v2 编写的窗口尺寸/位置调整工具，`Shift+Alt+Space` 呼出菜单。

功能：预设分辨率、自动调整到当前显示器约 3/4、居中、自定义尺寸；多显示器；中英文双语 UI；深色模式。

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

快捷键：`Shift+Alt+Space` 弹菜单；自定义尺寸 GUI 内 `Enter` 调整、`Ctrl+Enter` 调整并居中。

任务栏偏移逻辑：主显示器读取注册表 `StuckRects3\Settings` 字节偏移 8 判断是否自动隐藏（`03` = 自动隐藏），自动隐藏则绝对居中，否则抬升任务栏高度；副显示器读取 `MMTaskbarEnabled` 判断是否所有显示器显示任务栏。

运行方式：

```powershell
AutoHotkey64.exe AutoHotkey\SizerAHK\SizerAHK.ahk
```

验证重点：菜单呼出；普通/最大化/最小化窗口行为；预设、Control+预设居中、自动 3/4、居中、自定义尺寸；主/副显示器任务栏偏移；简中系统与英文系统文案；深色模式可读性。

### 3.3 SizerWin

SizerAHK 的原生 Windows 移植版，纯 C + Win32 API，编译为独立 `SizerWin.exe`，不依赖 AutoHotkey 或其他运行时，覆盖 AHK 被游戏反作弊拦截的场景。入口：`SizerWin/SizerWin.c`（单文件，约 1750 行）。同样 `Shift+Alt+Space` 呼出菜单。

#### 功能

- **自动**：窗口缩放到所在显示器工作区 `3/4`（宽高各乘 3/4）并居中。
- **居中 / 水平居中 / 垂直居中**：保持尺寸，仅移动位置。
- **预设分辨率**：按 `WxH` 列表设置；按住 `Ctrl` 点击预设同时居中。
- **自定义尺寸**：原生自绘对话框，输入宽高后调整（或调整并居中）。
- 多显示器（`rcWork` 避开任务栏）、中英文双语、深色模式、Per-Monitor V2 DPI。

#### 菜单顺序

| 顺序 | 菜单项 | 行为 |
|---|---|---|
| 1 | 自动 (`&A`) | 工作区 3/4 并居中 |
| 2 | 居中 (`&C`) | 保持尺寸，双轴居中 |
| 3 | 水平居中 (`&H`) | 保持尺寸，仅 X 居中 |
| 4 | 垂直居中 (`&V`) | 保持尺寸，仅 Y 居中 |
| — | 分隔线 | |
| 5 | 预设分辨率 | 动态插入，水平组与垂直组之间再插分隔线 |
| — | 分隔线 | |
| 6 | 自定义 (`&M`) | 打开自定义尺寸对话框 |

#### 配置文件 `SizerWin.ini`

- 路径固定为 exe 同目录（`GetModuleFileNameW` 推导）。
- 首次运行自动生成默认内容；**每次弹菜单时重新读取**（改文件无需重启进程）。
- `[Horizontal]`/`[Vertical]` 分组；`;`、`#` 为注释；每行解析首个 `WxH`（`x` 不区分大小写）；上限 `MAX_PRESETS = 64`；超过 `8192` 字节、为空或解析为空时回退内置默认。
- 内置默认：水平 `640x480, 1024x768, 1280x720, 1280x800, 1600x900, 1600x1000, 1920x1080, 1920x1200`；垂直 `480x854, 720x1280, 800x1280`。
- 权限错误（`ERROR_ACCESS_DENIED`、`ERROR_PRIVILEGE_NOT_HELD`、`ERROR_WRITE_PROTECT`）视为致命错误：弹窗后退出。

#### 构建

```powershell
cd SizerWin
.\build.ps1            # x64；-Arch x86 / arm64
```

或 Developer Command Prompt 中 `build.bat`；备用 CMake：`cmake -S SizerWin -B SizerWin/build && cmake --build SizerWin/build --config Release`。

- `build.ps1` 用 `vswhere.exe` 定位 VS；编译 `/O2 /utf-8 /W4 /Fe:SizerWin.exe`，子系统 `WINDOWS`。
- CMake：≥3.10，C11；链接 `user32 shell32 advapi32 gdi32 dwmapi comctl32`；定义 `UNICODE _UNICODE`；MSVC 加 `/utf-8`。
- 资源：`SizerWin.rc` 嵌入 `logo.ico` 与 `SizerWin.manifest`（ComCtl32 v6、`dpiAware: true/pm`、`PerMonitorV2, PerMonitor`）。

#### 实现要点

关键全局状态：`g_targetHwnd`、`g_hwndMain`（`HWND_MESSAGE` 消息窗口）、`g_presets`、`g_isChinese`、`g_darkMode`、`g_customDialogOpen`。

窗口类：`SizerWinMain`（隐藏消息窗口）、`SizerWinCustomDialog`（`WS_POPUP | WS_CAPTION | WS_BORDER` + `WS_EX_DLGMODALFRAME`，客户端默认 `300×316` 逻辑像素）、`SizerWinRoundedEditFrame`、`SizerWinRoundedButton`。后三者无对话框模板，运行时手写；`ERROR_CLASS_ALREADY_EXISTS` 视为成功。

消息流：`WM_HOTKEY(HOTKEY_ID_MENU=1) → ShowSizerMenu()`，取前台窗口 → 校验 `SW_SHOWNORMAL` 并排除桌面/任务栏类名 → 重新载入配置 → `TrackPopupMenu` → 恢复焦点 → 按命令分发到 `DoAuto`/`DoCentre`/`DoCentreHorizontal`/`DoCentreVertical`/`ShowCustomDialog`/`AdjustWindowSize`。

单实例：非交互式窗口站直接退出 → 互斥体 `Global\SizerWin_SingleInstance` → Toolhelp32 扫描重名进程（弹窗显示 PID 后退出）→ 旧版兼容互斥体 `SizerWin_SingleInstance` → 初始化并进入消息循环。

尺寸/居中：工作区取 `MonitorFromWindow` + `GetMonitorInfoW.rcWork`；操作前校验 `showCmd == SW_SHOWNORMAL`；用 `SetWindowPos` + `SWP_NOZORDER | SWP_NOACTIVATE`。

自定义对话框：预填当前尺寸；`EDIT` + `ES_NUMBER | ES_AUTOHSCROLL`；数值区间 `1..32767`，非法 `MessageBeep` 并全选；键盘 `Tab`/`Shift+Tab` 循环、`Enter` 提交、`Ctrl+Enter` 调整并居中、`Esc` 取消；`GetMessageW` 阻塞 + `IsDialogMessageW` 导航，返回 0=取消/1=调整/2=调整并居中。

DPI：清单声明 Per-Monitor V2；`GetDpiForWindow`/`AdjustWindowRectExForDpi` 经 `GetProcAddress` 动态加载，旧系统回退 `GetDeviceCaps`/`AdjustWindowRectEx`；`ScaleForDpi = MulDiv(value, dpi, 96)`；对话框处理 `WM_DPICHANGED` 重建画刷字体并重排。

深色模式：读 `SystemUsesLightTheme`；`DwmSetWindowAttribute` 设置沉浸式深色（`20`）、圆角（`33`，`DWMWCP_ROUND=2`）、系统背景（`38`，`DWMSBT_NONE=1`）；菜单走 uxtheme 序数 135/136；配色集中在 `DialogBgColor`/`ControlTextColor` 等函数，按 `g_darkMode` 返回深浅值。

#### 关键常量与 ID

| 符号 | 值 | 说明 |
|---|---|---|
| `HOTKEY_ID_MENU` | 1 | 热键 ID |
| `IDM_AUTO`..`IDM_CUSTOM` | 1001..1005 | 固定菜单项命令 |
| `IDM_PRESET_BASE` | 2000 | 预设命令起始 ID |
| `IDC_WIDTH_EDIT`..`IDC_CANCEL_BUTTON` | 3001..3005 | 自定义对话框控件 ID |
| `MAX_PRESETS` | 64 | 预设上限 |
| `SIZERWIN_MUTEX_NAME` | `Global\SizerWin_SingleInstance` | 新单实例互斥体 |
| `SIZERWIN_LEGACY_MUTEX_NAME` | `SizerWin_SingleInstance` | 旧版兼容互斥体 |
| `WM_EDITFRAME_SETEDIT` | `WM_APP + 10` | 圆角外框绑定子 EDIT |

#### 已知限制与维护约束

- 最大化和最小化窗口不响应；桌面与任务栏（`Shell_TrayWnd`、`Shell_SecondaryTrayWnd`、`Progman`、`WorkerW`）不响应。
- 预设不做超出屏幕边界校正；部分 UWP/自定义边框窗口对 `SetWindowPos` 响应不同。
- 配置在 exe 同目录，exe 必须位于可写目录；`/SUBSYSTEM:WINDOWS` + `HWND_MESSAGE` 常驻，无控制台。
- 深色菜单依赖 uxtheme 未公开 API，未来系统版本存在变化风险。
- 与 AHK 版一致性：新增菜单动作加 `IDM_*` 分支并保持“先校验 `SW_SHOWNORMAL` → 算工作区 → `SetWindowPos`”；配色只改颜色函数；改默认预设需同步 `LoadDefaultPresets` 与 `GenerateConfigFile`；新增文案中英双份走 `g_isChinese`；`MOD_NOREPEAT`、`DWMWA_*`、`WM_DPICHANGED` 等常量在源码头部 `#ifndef` 兜底，勿删。

验证重点：首次运行生成 `SizerWin.ini`；权限不足弹窗退出；改 ini 后重新呼菜单即时生效；菜单呼出；自动/居中/预设/Control+预设居中/自定义尺寸；自定义窗口无右上角控制按钮；`Tab`/`Shift+Tab`/`Enter`/`Ctrl+Enter`/`Esc`；最大化/最小化不响应；多显示器与任务栏变化；高 DPI 无偏移；热键冲突提示；桌面/任务栏不误处理。

### 3.4 SizerSwift

SizerAHK 的 macOS 原生移植版，Swift 编写，最低 macOS 13，编译为独立 `.app`。入口：`SizerSwift/Sources/main.swift`。Swift tools version 5.9，单个 executable target。

功能：`⌥⌘C` 居中当前窗口（保持尺寸）；`⌃⌥⌘C` 调整到屏幕可见区域 75% 并居中；菜单栏常驻图标，无 Dock 图标；`SMAppService` 开机自启动；英语/繁中/简中。

技术路径：优先用 Accessibility API（`AXUIElement`）直接设置窗口位置；不暴露 AX 窗口的应用回退到 `CGWindowListCopyWindowInfo` 查询 + `CGEvent` 模拟拖拽标题栏居中（回退路径不能可靠调整尺寸）。

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

行为路径：以 `.accessory` 策略运行（无 Dock 图标）→ 无辅助功能权限则提示并可打开系统设置 → 创建菜单栏图标 → 注册键盘 tap → 快捷键触发时优先 AX，失败拖拽回退。

#### 构建与部署

```bash
cd SizerSwift
swift build -c release
```

手动打包 `.app` 的目录结构：

```text
SizerSwift.app/
└── Contents/
    ├── Info.plist
    ├── MacOS/
    │   └── SizerSwift
    └── Resources/
        └── AppIcon.icns
```

部署到 `/Applications` 后运行 `xattr -cr /Applications/SizerSwift.app` 清除隔离属性。当前**不使用 codesign 签名**，避免重新编译后辅助功能权限失效。

#### 维护约束

- 最低平台保持 macOS 13。
- 拖拽回退只能可靠移动窗口，不能可靠调整尺寸，不要在文档里承诺回退路径可 resize。
- 全局快捷键监听 C 键 keyCode `8`。
- 菜单栏图标来自 `AppIcon.icns`，缺失回退为文本符号。
- 保持不 codesign 的部署策略。

已知限制：macOS Sequoia 窗口拼贴功能可能干扰模拟拖拽；首次运行/重编译后需重新授权辅助功能。

验证重点：无辅助功能权限时提示清楚并可打开系统设置；授权后菜单栏图标出现且无 Dock 图标；`⌥⌘C` 居中、`⌃⌥⌘C` 75% 并居中；不暴露 AX 窗口能拖拽回退至少居中；登录项切换正确；三种语言文案正确。

### 3.5 CapsLockOSD

Windows 原生 Caps Lock 状态屏幕提示，C++ + Win32 API + 系统 GDI+，不依赖第三方库或运行时。**本节是维护规范，用户使用配置见 `CapsLockOSD/README.md`。**

#### 产品摘要

- 仅在 Caps Lock 状态“切换”时显示 OSD；状态不变不重复显示，启动时不显示。
- OSD 是置顶、无焦点、点击穿透的 layered window，显示在前台窗口所在屏幕约 90% 垂直位置。
- 半透明纯黑圆角背景，默认背景 alpha `155/255`；图标 `A`/`a` 与状态文本完全不透明。
- 尺寸为初始 Logitech Options 风格复刻尺寸的 `75%`。
- 支持多显示器、混合 Per-Monitor DPI，以及简中 / 繁中 / 英文三种状态文本。

#### 运行时架构

进程只有一个不可见主窗口承载消息循环，逻辑由定时器驱动；OSD 是按需创建、无焦点、点击穿透的 popup layered window。

```text
wWinMain
  ├─ CreateMutexW(Local\DoxCapsLockOSD)        → 已存在则立即退出（单实例）
  ├─ EnableDpiAwareness / DetectLanguage / LoadConfig / RemoveLegacyStartupRegistration
  ├─ GdiplusStartup
  ├─ RegisterWindowClasses                      → 主窗口类 + OSD 窗口类
  ├─ CreateWindowExW(主窗口, WS_OVERLAPPED, 0×0, 不可见)
  └─ 消息循环
        ├─ WM_TIMER TIMER_POLL  (50 ms)           → CheckCapsStateAndNotify → 状态翻转时 ShowCapsOsd
        ├─ WM_TIMER TIMER_HIDE  (显示时长)        → HideOsd
        └─ WM_TIMER TIMER_RAISE (33 ms × 12 次)   → ReassertOsdTopmost（约 400 ms 内反复重申置顶）
```

| 对象 | 说明 |
|---|---|
| 主窗口 | `WS_OVERLAPPED`、`0×0`、从不显示，负责 `WM_TIMER`、`WM_DESTROY` 收尾；类名 `DoxCapsLockOSDMainWindow` |
| OSD 窗口 | `WS_POPUP` + `WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT`；类名 `DoxCapsLockOSDOverlayWindow`；懒创建（`EnsureOsdWindow`），初始 `1×1` 不可见 |
| 状态来源 | `GetKeyState(VK_CAPITAL) & 0x0001`（toggle 位），由 `TIMER_POLL` 每 50 ms 轮询 |

#### 关键常量

| 常量 | 值 | 含义 |
|---|---|---|
| `OSD_VERTICAL_POSITION_PERCENT` | `90` | OSD 在可用高度中的垂直位置百分比 |
| `OSD_WINDOW_ALPHA` | `255` | 窗口级 alpha；背景透明度改走每像素 alpha |
| `OSD_SIZE_PERCENT` | `75` | 复刻设计尺寸的缩放百分比 |
| `OSD_RAISE_INTERVAL_MS` | `33` | 置顶重申定时器间隔 |
| `OSD_RAISE_TICKS` | `12` | 置顶重申次数（合计约 400 ms）|
| `DEFAULT_BACKGROUND_ALPHA` | `155` | 默认背景 alpha |
| `DEFAULT_DISPLAY_DURATION_MS` | `1000` | 默认显示时长 |
| `MIN_/MAX_DISPLAY_DURATION_MS` | `100` / `10000` | 显示时长 clamp 范围 |
| `MAIN_CLASS_NAME` / `OSD_CLASS_NAME` | `DoxCapsLockOSDMainWindow` / `DoxCapsLockOSDOverlayWindow` | 窗口类名 |
| `MUTEX_NAME` | `Local\DoxCapsLockOSD` | 单实例互斥体名 |
| `RUN_VALUE_NAME` | `Dox CapsLockOSD` | 需清理的旧版本 Run 注册表值名 |
| `CONFIG_FILE_NAME` | `CapsLockOSD.ini` | 配置文件名 |

#### 源文件与函数职责

| 函数 | 职责 |
|---|---|
| `ScaleForDpi` / `ScaleForDpiF` | 基础 DPI 缩放（`MulDiv`/浮点，基准 96）|
| `ScaleOsdForDpi` / `ScaleOsdForDpiF` | 在 DPI 缩放基础上再乘 `75%` 的复刻尺寸缩放 |
| `EnableDpiAwareness` | 运行时声明 `PerMonitorV2`，失败回退 `SetProcessDPIAware` |
| `GetMonitorDpiValue` | 经 `Shcore.dll` 的 `GetDpiForMonitor` 取 DPI，失败回退 `GetDeviceCaps(LOGPIXELSX)` |
| `ClampInt` | 整数 clamp |
| `GetConfigPath` | 用 `GetModuleFileNameW` 推出 exe 同目录 ini 路径 |
| `GenerateConfigFile` | `CreateFileW(..., CREATE_NEW, ...)` 生成默认 ini |
| `LoadConfig` | 不存在则生成；`GetPrivateProfileIntW` 读取并 clamp 两项配置 |
| `GetCapsLockState` | `GetKeyState(VK_CAPITAL) & 0x0001` 读取 toggle 状态 |
| `DetectLanguage` / `GetCapsText` / `GetTextFontFace` | UI 语言探测、状态文案、正文字体选择 |
| `LoadAppIcon` | 加载资源图标，失败回退 `IDI_APPLICATION` |
| `GetTargetMonitor` | 前台窗口 → 光标位置 → 主窗口 的顺序确定目标显示器 |
| `AddRoundedRectangle` | 构造圆角矩形 `GraphicsPath` |
| `DrawOsdToLayeredWindow` | GDI+ 绘制到 32 bpp PARGB DIB section，再 `UpdateLayeredWindow` |
| `OsdWindowProc` | OSD 窗口过程，`WM_NCHITTEST` 返回 `HTTRANSPARENT` |
| `EnsureOsdWindow` / `ReassertOsdTopmost` / `ShowCapsOsd` / `HideOsd` | OSD 窗口生命周期与置顶管理 |
| `RemoveLegacyStartupRegistration` | 删除 `HKCU\...\Run\Dox CapsLockOSD` 旧项 |
| `CheckCapsStateAndNotify` | 状态变更检测与通知入口 |
| `MainWindowProc` | 主窗口：`WM_CREATE` 建轮询、`WM_TIMER` 分派、`WM_DESTROY` 收尾 |
| `RegisterWindowClasses` | 注册主窗口类（含图标）与 OSD 窗口类 |
| `wWinMain` | 单实例、初始化、消息循环、GDI+ 与互斥体收尾 |

#### 核心实现细节

- **DPI**：运行时优先 `SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)`，失败回退 `SetProcessDPIAware`；manifest 同时声明 `PerMonitorV2, PerMonitor` 与 `true/pm`；`WM_DPICHANGED` 未处理，每次显示按目标显示器 DPI 重算。
- **显示器选择**：`GetTargetMonitor` 优先前台窗口所在屏（排除自身两个窗口），否则光标所在屏，最后回退主屏；DPI 经 `GetDpiForMonitor` 读取。
- **绘制**：32 bpp PARGB DIB section → 清空透明 → 圆角纯黑背景 → Arial 粗体 `72px` 大图标 → 语言字体 `24px` 状态文本 → `UpdateLayeredWindow`。窗口级 alpha 恒 255，背景透明度由逐像素 alpha 表达，文本用 255 alpha 保持不透明。
- **点击穿透与置顶**：`WS_EX_TRANSPARENT` + `WS_EX_NOACTIVATE` + `WM_NCHITTEST` 返回 `HTTRANSPARENT`；每次显示后 `TIMER_RAISE` 33 ms × 12 次重申 `HWND_TOPMOST`（`ReassertOsdTopmost` 只在 OSD 可见时执行）。
- **单实例与旧 Run 项**：`CreateMutexW(NULL, TRUE, L"Local\\DoxCapsLockOSD")` + `ERROR_ALREADY_EXISTS` 判定；启动时删除旧版 Run 值（历史遗留一次性清理）。
- **配置与语言**：ini 在 exe 同目录；`BackgroundAlpha ∈ [0,255]`、`DisplayDurationMs ∈ [100,10000]`；语言用 `GetUserDefaultUILanguage`，主语言非中文则英文，中文按 `SUBLANGID` 区分繁简。

| 语言 | 开启 / 关闭文案 | 正文字体 |
|---|---|---|
| 简体中文 | `大写锁定已开启` / `大写锁定已关闭` | `Microsoft YaHei UI` |
| 繁体中文 | `大寫鎖定已開啟` / `大寫鎖定已關閉` | `Microsoft JhengHei UI` |
| 其他 | `Caps Lock On` / `Caps Lock Off` | `Segoe UI` |

#### 布局与尺寸约定

复刻设计尺寸 `276×145` px（96 DPI 基准），实际窗口经 `ScaleOsdForDpi` 再乘 75%（96 DPI 下约 `207×108`）：

| 指标（96 DPI 设计值） | 值 |
|---|---|
| 圆角半径 | `12` px |
| 图标字号（Arial Bold） | `72` px |
| 图标区域 | 顶部偏移 `8`，高 `84` |
| 正文字号 | `24` px |
| 正文区域 | 顶部偏移 `105`，高 `34` |

定位时 x 水平居中，y 取 `rc.top + (可用高度 − 窗口高) × 90%`；可用高度为负退化为贴顶。

#### 维护约束（不变量）

1. Caps 状态必须读 `GetKeyState(VK_CAPITAL) & 0x0001`（toggle 位），不能改用 `& 0x8000`（按下位）。
2. OSD 必须保持 `WS_EX_NOACTIVATE`、`WS_EX_TRANSPARENT` 且 `WM_NCHITTEST` 返回 `HTTRANSPARENT`，不得改成可聚焦、可点击或带任务栏按钮的窗口。
3. 文本和图标必须用 255 alpha，背景透明度只能通过 `g_backgroundAlpha` 逐像素 alpha 表达。
4. 三个定时器 ID（`TIMER_POLL`/`TIMER_HIDE`/`TIMER_RAISE`）必须在 `WM_DESTROY` 全部 `KillTimer`。
5. 启动不得显示 OSD：首次轮询只记录初始状态（`CheckCapsStateAndNotify(FALSE)` 提前返回）。
6. 配置 clamp 必须保留：`BackgroundAlpha ∈ [0,255]`、`DisplayDurationMs ∈ [100,10000]`。
7. `MUTEX_NAME` 与 `RUN_VALUE_NAME`（`Dox CapsLockOSD`）是单实例与旧 Run 项清理的稳定契约，改名会破坏对应行为。
8. 构建必须保留 `/MT`（静态 CRT）、`/SUBSYSTEM:WINDOWS`、`/utf-8`、`/W4`，以及 `UNICODE`/`_UNICODE`/`NOMINMAX`；运行时只依赖 Windows 系统 DLL。
9. 源文件顶部 `UNICODE`/`_UNICODE`/`NOMINMAX` 定义必须位于 `#include <windows.h>` 之前。

#### 构建

```powershell
cd CapsLockOSD
.\build.ps1            # 默认 x64；可用 -Arch x86 / arm64
```

或 Developer Command Prompt 中 `build.bat`；备用 CMake：`cmake -S CapsLockOSD -B CapsLockOSD/build && cmake --build CapsLockOSD/build --config Release`。

`build.ps1` 用 `vswhere.exe` 定位 `vcvarsall.bat`；两步：`rc /nologo CapsLockOSD.rc` → `cl /O2 /MT /EHsc /utf-8 /W4 ... /link /SUBSYSTEM:WINDOWS`。链接 `user32`、`advapi32`、`gdi32`、`gdiplus`；运行时仅依赖 `USER32.dll`、`ADVAPI32.dll`、`KERNEL32.dll`、`GDI32.dll`、`gdiplus.dll`；`Shcore.dll` 仅在 `GetMonitorDpiValue` 动态加载。

#### 验证清单

静态：`git diff --check`；三种构建方式至少跑通 `build.ps1` 确认产出 `CapsLockOSD.exe`。

运行时至少覆盖：

| 场景 | 预期结果 |
|---|---|
| 首次启动 | 生成 exe 同目录 `CapsLockOSD.ini` 且不显示 OSD |
| 按 Caps Lock 开 | 前台窗口所在屏约 90% 高度显示大写 `A` 与开启文案 |
| 再按 Caps Lock 关 | 显示小写 `a` 与关闭文案，到显示时长后自动隐藏 |
| 状态未变持续轮询 | 不重复触发 |
| 点击 OSD 区域 | 点击穿透，焦点与输入不被打断 |
| 多显示器 / 混合 DPI | 出现在前台窗口所在屏并按该屏 DPI 缩放 |
| 无边框全屏或伪全屏 | 尽量保持最上层（独占全屏无法保证）|
| 启动第二个实例 | 立即退出 |
| 修改 ini 越界值 | 下次启动生效且被 clamp |
| `taskkill /IM CapsLockOSD.exe /F` | 进程结束，无残留托盘或前台效果 |

### 3.6 Dox Reader（Firefox + Cloudflare Workers）

local-first RSS/Atom 阅读器，覆盖 Firefox 扩展版（`Dox Reader/Firefox/`）和 Cloudflare Workers 网页版（`Dox Reader/Cloudflare Workers/`）。**本节是唯一开发规范；各平台 README 只写安装/使用/发布入口。**

#### 产品摘要与边界

能力：解析 RSS/Atom/RDF，最多并发刷新 4 源；全部/未读/收藏/单源视图，标题/作者/摘要搜索；订阅增删改刷、全局或单订阅批量已读；文章已读/未读、收藏、正文、跳转原文；OPML 导入导出；三栏/移动分层布局；多主题配色与自定义强调色；经用户自己的 HTTPS WebDAV 同步订阅、阅读状态和部分偏好。

模式边界：默认本地模式保持原有 IndexedDB/WebDAV 行为。用户显式选后端模式时，连接自己部署的 Dox Reader Backend，订阅、文章、已读/收藏保存在个人后端；WebDAV 不参与此模式。后端凭据只存本机，按后端根地址分隔缓存；切换模式不合并、不上传或删除原有本地数据。网页版 Worker 本身仍只负责静态资源和受限代理，持久后端独立部署；应用不使用共享开发者服务、广告、分析或远程可执行代码。

#### 版本与运行架构

| 版本 | 目录 | RSS/WebDAV 网络方式 | 设置存储 | 发布形态 |
|---|---|---|---|---|
| Firefox 扩展 | `Firefox/` | 扩展 host 权限直接请求 | `browser.storage.local` | Manifest V3、AMO 签名 XPI |
| Cloudflare Workers 网页版 | `Cloudflare Workers/` | 请求同源 `/api/feed`、`/api/webdav`，Worker 再访问上游 | `localStorage` | Workers Static Assets + Worker |

两端数据流相同：`Preact UI → Dexie/IndexedDB（订阅、文章缓存、状态、同步元数据）`，平台设置存凭据/外观/布局，RSS 直接或经 Worker 代理，WebDAV 合并 `Dox Reader/state.json` 后条件写回。Cloudflare 版不使用 KV、D1、R2、Durable Objects、Queues 或 Workers AI。

#### 代码所有权与双端同步

两个子目录是独立 npm 工程，但 `src/` 大部分核心文件必须保持字节一致：

**共享核心（必须双端同步，含测试）**：`app.tsx`、`article-content.tsx`、`styles.css`、`model.ts`、`database.ts`、`feed-parser.ts`、`feed-service.ts`、`html-entities.ts`、`item-list.ts`、`initial-sync.ts`、`opml.ts`、`webdav.ts`、`sync-model.ts` 及对应 `*.test.ts` 和 `test/fixtures/`。

新增共享核心：backend.ts、backend.test.ts、repository.ts，仍须在 Firefox 与 Cloudflare Workers 前端保持字节一致。Backend/src/shared 中 feed-parser.ts、html-entities.ts 和 model.ts 镜像前端对应文件，修改解析规则时同步维护。

**平台适配层（分别维护，不互相覆盖）**：Firefox 的 `src/background.ts`、`src/runtime-fetch.ts`、`src/settings.ts`、`src/main.tsx`、`public/manifest.json`、`vite.config.ts`、`release.ps1`、`updates.json`；Workers 的 `worker/`、`src/runtime-fetch.ts`、`src/settings.ts`、`src/main.tsx`、`public/`、`wrangler.jsonc`、部署脚本。

共享代码没有长期指定某一端为唯一源文件：可以在任一端先改，提交前必须镜像到另一端。只改平台适配层时可只改一端，提交说明写明平台范围。

#### 本地数据模型

IndexedDB 库名 `dox-rss-reader`（Dexie 管理）：

| 表 | 内容 | 是否进入 WebDAV |
|---|---|---|
| `feeds` | 订阅 URL、标题、自定义名称、站点地址、删除墓碑和版本 | 是，排除本机抓取错误与时间 |
| `items` | 文章标题、作者、URL、正文、摘要及本机展示状态 | 否 |
| `itemStates` | 每篇文章独立的已读和收藏寄存器 | 是 |
| `meta` | 设备 actor、Lamport clock、全量刷新时间、同步偏好和迁移标记 | 部分 |

平台设置：WebDAV URL/用户名/应用密码、三栏宽度/布局锁定只存本机；主题/配色/强调色、摘要开关同步。

删除订阅用墓碑传播；文章状态即使没有正文缓存也必须保留。文章列表一次最多读 2000 篇渲染，侧栏计数用独立查询，不受列表上限影响。

#### WebDAV 同步协议

固定路径 `Dox Reader/state.json`，只接受 HTTPS。目录用 `PROPFIND`/`MKCOL`，同步文件用 `GET`/`PUT`，凭据经 Basic Authentication 但不进 state.json。

schema v1 合并规则：每设备随机 `actor`，Lamport 版本 `[counter, actor]`；订阅整条 LWW，版本相同以 actor 稳定决胜；已读/收藏是独立 LWW 寄存器；主题/配色/强调色/摘要开关分别合并；`lastRefreshAllAt` 取最大值；写回用 ETag + `If-Match`（新文件 `If-None-Match: *`）；HTTP 412 重新读合并写，最多 4 次；未知 schema 明确报错，不静默覆盖。

首次同步约束：本地无订阅/文章/状态而远端同步出有效订阅时，立即刷新全部订阅并回写。该判断不受远端 `lastRefreshAllAt` 影响。启动时已配置 WebDAV 先静默同步；本地修改走约 1.4 秒防抖队列；距最近全量刷新 24 小时则自动刷新。

#### 界面与交互约束（已确认，回归需保留）

- 启动时默认进入全部订阅的“未读”视图；资料库导航按“未读、全部文章、收藏”排列。
- “全部文章”/“未读”来源显示“订阅源名称 - 文章域名”，单源/收藏只显示文章域名。
- “未读”视图点开文章立即写已读并排队同步，但保留在本会话，切换视图后结束会话。
- 未读圆点在标题前方；单订阅批量已读两处入口用相同图标，全局/单订阅/单篇三种语义用不同图标。
- 工具栏包含批量已读/刷新/重命名/删除；单篇工具栏含已读/收藏/打开原文。
- “测试连接”和“立即同步”至少显示 400 ms 加载状态。
- 数据模式切换铺满可用宽度、两个等宽选项显示“本地 / Dox Reader Backend”；后端地址标签为“地址”，访问令牌使用与 WebDAV 密码相同的显示/隐藏按钮；不在后端连接区底部显示说明段落。
- 后端模式打开设置时自动读取配置；地址/令牌变化后防抖重连，过期响应不得覆盖新连接。抓取间隔和保留篇数字段始终显示，读取前/失败时禁用，成功后使用远端真实值，不用客户端默认值覆盖后端。
- 本地模式打开设置或修改 WebDAV 地址/用户名/密码后自动测试连接；无地址不请求，防抖且忽略旧响应，保留手动重试。自动测试沿用原有目录检查/创建行为，不触发阅读状态同步。
- 外观/阅读偏好实时预览；取消恢复已保存值。
- 刷新全部订阅时显示高对比度状态面板，持续更新已完成数量和当前并发检查的订阅源。
- 配色含经典与东方传统色，Material 3 用中性黑灰强调色；自定义强调色自动算可读前景色。
- 桌面三栏保持正文最小宽度；移动端分层导航不能重叠或横向溢出。
- 改图标/工具栏必须检查 `title`/可访问名称、禁用态、稳定尺寸和窄屏容纳。

#### Cloudflare Worker 边界

Worker 只处理两个 API，其余交给 Static Assets + SPA fallback：

| API | 允许方法 | 上游协议 | 限制 |
|---|---|---|---|
| `/api/feed` | `GET` | HTTP/HTTPS | 响应最多 5 MiB，最多 5 次校验重定向 |
| `/api/webdav` | `GET`、`PROPFIND`、`MKCOL`、`PUT` | 仅 HTTPS | 请求/响应最多 4 MiB，不跟随重定向，只允许 Dox Reader 固定路径 |

上游超时 20 秒。防护：客户端标记 + `Origin`/`Sec-Fetch-Site` 同源校验；拒绝内嵌凭据、私有/保留 IP、localhost 类域名、IPv6 字面量、非标准端口；只转发白名单请求/响应头，不记录 Authorization；RSS 每跳重校验，WebDAV 重定向报错；API 错误 JSON 且 `no-store`。扩大代理/新持久化绑定前必须先补安全测试、更新 `PRIVACY.md` 并重估额度。

#### 开发流程

要求 Node.js 24+（Firefox 发布还约定 npm 11+），两个子项目独立 `package-lock.json`，检出/锁文件变化后分别 `npm ci`。

Firefox：

```powershell
cd "Dox Reader/Firefox"
npm ci
npm run dev       # 仅调试网页界面
npm run check     # Vitest + TypeScript + 生产构建
```

验证真实扩展：`npm run build` 后 `npx --yes web-ext@10.6.0 run --source-dir dist`。

Cloudflare Workers：

```powershell
cd "Dox Reader/Cloudflare Workers"
npm ci
npm run dev:ui    # 仅调试界面，不提供代理
npm run dev       # 构建后启动完整 Worker + Static Assets
npm run check     # Vitest + Worker 类型检查 + TypeScript + 生产构建
npx wrangler deploy --dry-run
```

`npm run dev` 会先生产构建，不是 Vite 热更新入口。

核心修改完成标准：判断共享核心还是适配层 → 共享核心双端同步 + 测试同步 → 两端 `npm run check` → Cloudflare 版 `npx wrangler deploy --dry-run` → 交互/响应式检查桌面与移动视口 → WebDAV 改覆盖空远端/已有远端/并发 412/错误凭据/首次同步 → 数据结构/权限/网络/收集行为改检查 schema、Manifest、`PRIVACY.md`、`AMO_REVIEW_NOTES.md`。

#### 发布流程

Cloudflare Workers：`npm run deploy`；一键部署 `pwsh -File deploy-cloudflare.ps1 [-DryRun] [-SkipInstall]`（脚本不含账号密钥，Wrangler 首跑登录部署者账号）。发布后从公网请求首页和新资源验证。

Firefox：自 `1.0.0` 起使用 AMO listed 公开发行，保留原扩展 ID，manifest 不得设置 `update_url`。发布前 `package.json`、`package-lock.json`、`public/manifest.json` 版本一致；`amo-listing.json` 保存公开条目资料和已确认的许可证；`npm run release` 测试、构建、上传源码并提交 listed 审核。`unreviewed` 只代表待审核，脚本正常退出且不更新签名包、更新清单或执行提交推送；AMO 审核通过后重新运行 `npm run release:push`，校验下载包的 SHA-256、版本、ID 和 Mozilla 签名条目后提交推送。`-Push` 要求预先暂存区为空，避免纳入其他模块改动。AMO 凭据只放被忽略的 `.env.release`，通过 `WEB_EXT_API_KEY`/`WEB_EXT_API_SECRET` 环境变量传递给 web-ext，不放命令行。`release.ps1` 继续维护当前路径和旧路径 `Firefox/Dox Reader/` 的更新清单与签名 XPI，使 0.x 用户升级后转交 AMO 更新；旧路径不是源码副本。商店介绍、隐私政策、分类和图标须在 AMO 单独核验，签名状态不等于公共商店已经上线。

#### Dox Reader Backend（1.1.0 前端可选）

独立 npm 工程 Dox Reader/Backend。SQLite Durable Object 每账号个人库使用固定 personal-library 名称；不是跨用户共享服务。Worker 只接受带 Bearer token 的 POST /api/v1 命令，CORS 不带 Cookie；BACKEND_TOKEN 至少 32 字符，默认无令牌拒绝请求。API 返回订阅、分页文章元数据、单篇正文、状态、配置和抓取进度。客户端在独立 Dexie 缓存中读列表，按需缓存正文；连接失败只读缓存，写操作失败不得乐观修改已读/收藏。本地库 dox-rss-reader 保持不变。外观在后端模式保留本机。后端参数先读取再修改，不因客户端默认值覆盖远端配置。

默认 intervalMinutes=60、maxArticles=10000；允许 30–10080 分钟、100–10000 篇。上限是全库按 publishedAt DESC,id DESC 保留最新 N 篇，包含收藏和未读，不是每源 N 篇。调低上限立即在事务内清理，不能后台偷偷豁免收藏。最多 100 个源，正文上限约 48 KiB，RSS 最大 1 MiB，元数据字段限长，正文与元数据总预算 600 MiB。每日 UTC 最多 4800 次抓取、10000 保守写入单位（新文章 4、状态 1）；达到预算顺延次日，未完全归档的响应不保存条件请求验证头。额度共享风险必须在部署说明中披露，应用不能自动升级付费套餐。

抓取由持久 Alarm 驱动，一次处理一个到期源，20 秒总超时，最多 5 跳重定向且每跳检查公开 HTTP(S) 地址，拒绝私有/保留 IP、凭据、非常规端口和 XML DTD/ENTITY。先保存恢复 Alarm 再做网络 I/O；使用 60 秒租约，finally 重新调度。每小时 Cron 只修复缺失 Alarm。失败指数退避。客户端全量/单源刷新创建持久队列，已有手动任务时合并请求，最短 1 分钟；轮询最多 2 分钟，关闭客户端不取消任务。删除排队/抓取中的源必须清理任务并防止复活。

SQL 使用绑定参数，插入去重并保留已有 read/starred；快照以 revision 验证一致性，按发布时间/ID 游标分页避免 OFFSET 扫描开销。缓存快照完整收齐后原子替换，不得部分失败覆盖已缓存数据。后端列表按 200 篇渐进展示。每分钟仅在可见客户端查询状态，revision 不变不重传全库。

后端 npm run check 使用本地 Workers runtime 集成测试，验证鉴权、Alarm、条件抓取、全库裁剪、竞态删除、预算顺延和手动抓取。部署前 npx wrangler deploy --dry-run；默认创建 dox-reader-backend，令牌经 wrangler secret bulk/put 配置。生产验证添加临时测试源、确认无人在线抓取与手动刷新、清理测试源，不能遗留测试用户数据。前端新增模式时同步修改两份 PRIVACY.md、AMO_REVIEW_NOTES.md 与商店资料。

#### 文档维护

AMO 审核说明在 `Dox Reader/Firefox/AMO_REVIEW_NOTES.md`，两个 `PRIVACY.md` 必须与实际数据流一致。修改默认设置、配色枚举、同步字段、Worker 限制、最低运行版本或发布命令时，同一提交更新本模块小节。

### 3.7 Firefox Auto Sort Bookmarks

Manifest V3 后台扩展（event page），递归整理 Bookmarks Menu（`menu________`）与 Other Bookmarks（`unfiled_____`）。文件：`manifest.json`、`background.js`（按 `sorter.js` → `background.js` 加载）、`sorter.js`、`tests/sorter.test.js`、`_locales/{en,zh_CN}/messages.json`、`icons/`、`THIRD_PARTY_NOTICES.md`。权限 `alarms`、`bookmarks`、`storage`；数据收集声明 `none`；最低 Firefox 142。

排序核心（`sorter.js`）：

- IIFE 把 `BookmarkSorter` 挂到 `globalThis` 同时写 `module.exports`，供 Node `require` 测试。
- 比较器 `Intl.Collator("en", { caseFirst: "upper", numeric: true, sensitivity: "variant" })`：区分大小写/重音，大写优先，自然数字顺序；标题/URL 先 `NFKC` 归一化。
- `sortFolderRecursively`：取子节点 → 排序当前层 → 递归子文件夹，返回 `{ folderCount, moveCount }`。
- `sortFolderContents`：按分隔线分段，段内文件夹在前（按标题）、URL 书签在后（按标题再按 URL）；逐项比对，不一致才 `await bookmarks.move(id, { index, parentId })`，分隔线不移动。

后台编排（`background.js`）：

- 常量：`SORT_DELAY_MS = 1500`、`RETRY_DELAY_MS = 15000`、闹钟名 `auto-sort-bookmarks`。
- 会话状态在 `browser.storage.session`（`pendingSort`/`pendingReason`）；`requestSort` 置位后建一次性闹钟。
- `runPendingSort` 用 `activeSort` 单飞防重入；执行前先 `hasFocusedBrowserWindow()`——Library 窗口获焦时所有普通窗口 `focused=false`，延迟到普通窗口回前台。
- 执行前清 `pendingSort` 再 `sortRoots`；本轮 `move` 事件再置位，防抖后幂等校验；失败置位并按 `RETRY_DELAY_MS` 重试。
- 同步注册 `bookmarks.onCreated/onChanged/onMoved/onRemoved`、`alarms.onAlarm`、`windows.onFocusChanged/onCreated`、`runtime.onInstalled/onStartup`。
- 大量连续变化（含导入批量创建）通过“置位 + 一次性闹钟防抖”合并为一次。

Firefox API 限制：标准 `windows` 只枚举 `navigator:browser`，无法观测 Library 窗口生命周期，只能避开**当前获焦**的 Library，无法区分“已关闭”与“退到普通窗口之后”。

维护约束：排序算法集中在 `sorter.js`，只依赖传入的 `bookmarksApi`（`getChildren`/`move`），不得引用全局 `browser`；`bookmarks.move` 顺序 `await`，不要并发；目标根目录与闹钟名不可改名；行为变更同步 `sorter.test.js`、`README.md`、本文档；用户可见名/描述/行为改 `manifest.json` 版本，`_locales` 两语言 key 成对，`default_locale` 保持 `en`；图标以 `icons/icon.svg` 为源，运行 `icons/generate-icons.ps1` 生成 32/48/64/96/128 PNG，第三方许可随 `THIRD_PARTY_NOTICES.md` 入包；已上架 AMO 的扩展必须同时在 Developer Hub 上传 128px 图标，因为 Firefox 扩展管理器从 AMO API 读取已列出扩展的图标元数据；`web-ext-artifacts/` 不提交。

图标发布是双通道流程，不能只更新 XPI：

1. 先生成并检查包内 32/48/64/96/128 PNG，确认 `manifest.json.icons` 全部引用有效，并在 Firefox 亮色、暗色主题下检查可见性。
2. 在发布新版前，先通过 Developer Hub 或 AMO v5 API 的 add-on `PATCH` multipart `icon` 字段上传同一张 128×128 PNG。Manifest 图标不会自动同步到 AMO 图标字段。
3. 等待 AMO 异步缩放完成；只有公共 add-on API 的 `icon_url` 非空、`icons` 包含 32/64/128、缓存戳已更新，且下载到的 128 资源实际尺寸为 128×128，才可继续发布版本。
4. 新版本转为 `public` 后再次检查 AMO v4/v5 公共 API，并用正式安装验证扩展面板、`about:addons` 列表和详情页。网页商品页显示图标不代表 Firefox 本地界面已拿到图标元数据。

上述任一项未通过，图标发布视为失败，不得仅凭签名 XPI 内存在 PNG 或 AMO 网页已有图标结束发布。

测试：

```powershell
node --test Firefox/AutoSortBookmarks/tests/sorter.test.js
```

验证重点：测试覆盖比较顺序（标题→URL→id）、自然数字、大小写/重音、分隔线分段、递归多根；临时安装 `about:debugging#/runtime/this-firefox`；分隔线不移、文件夹不跨段；创建/改/移/删后约 1.5 秒自动重排且连续变化合并一次；`move` 顺序执行；Library 获焦不重排，切回普通窗口补做。

### 3.8 Userscript 小脚本

涉及 `Userscript/` 下三个脚本。中文字体优化脚本的小节见 [3.1](#31-中文字体优化cjk-字体映射)。

- `EmuParadise Download Workaround.user.js`：从 URL 第 6 段取 `gid`，在 `.download-link` 前插入下载链接，依赖 `@require` jQuery。
- `Re-add Download Button Vimm's Lair.user.js`：查找 `#dl_form`，无目标 submit 按钮则追加按钮。

维护规则：改行为时递增 `@version`；`@match` 尽量窄；DOM 操作必须能承受目标元素不存在；`@downloadURL`/`@updateURL` 指向仓库 raw 地址；GitHub raw URL 中的空格和特殊字符要编码（`Vimm's Lair` 文件名里的单引号当前保留在 URL 中，改 URL 要实测 Tampermonkey 能更新）；外部依赖谨慎（当前仅 EmuParadise 用 jQuery）。

### 3.9 Stash

`Stash/external-ip-address-tile.js` 通过 `http://ip-api.com/json/?lang=zh-CN` 获取 IP 和国家/地区，显示 `IP @ 国家/地区`；失败显示“获取失败”。

维护规则：必须调用 `$done` 结束脚本；`$httpClient.get` 出错时 `$done({ content: "获取失败" })`；JSON 解析前考虑 API 失败或返回异常；网络错误和成功路径都返回简短 `content`；若改新 API，确认隐私、速率限制和返回字段。

### 3.10 AdGuard（magi.txt）

`magi.txt` 是 AdGuard 兼容规则列表。修改规则内容时必须：

1. 递增头部 `! Version`。
2. 更新 `! Last modified`，格式 `YYYY/MM/DD HH:MM:SS +0800`。
3. 按域名后缀和站点分组维护，避免把规则随意追加到文件末尾。
4. 在 AdGuard 中导入或刷新后验证目标网站。

维护要求：保持白名单按顶级域或站点分组；元素隐藏规则尽量落实到具体站点，不写过宽选择器。

### 3.11 Batch files（RemoveMSEdge）

两个 Edge 清理脚本基于 [ShadowWhisperer/Remove-MS-Edge](https://github.com/ShadowWhisperer/Remove-MS-Edge)，头部必须保留来源链接。

#### 职责边界

| 处理对象 | `RemoveMSEdge.bat` | `RemoveMSEdgeAll.bat` |
|---|---|---|
| 机器级 Edge 浏览器 | 删除 | 删除 |
| 当前用户级 Edge 浏览器 | 删除 | 删除 |
| 其他用户的 Edge 文件和注册表 | 删除 | 删除 |
| 全用户 Edge AppX | 删除 | 删除 |
| WebView2 Runtime | 保留 | 删除机器级、当前用户级及其他用户残留 |
| `EdgeCore` | 保留 | 删除 |
| `EdgeUpdate` 目录和注册表 | 保留 | 删除 |
| Edge Update 任务和服务 | 保留 | 删除 |
| `MicrosoftEdgeUpdate.exe` | 不终止 | 终止 |

`RemoveMSEdge.bat` 只允许结束 `msedge.exe`；`msedgewebview2.exe`、WebView2 注册项、`EdgeCore`、`EdgeUpdate`、更新任务和服务属保留边界。`RemoveMSEdgeAll.bat` 是彻底清理入口。

#### 入口和参数

- `RemoveMSEdge.bat`：普通执行始终进入完整卸载流程；`-guard` 计划任务守卫模式（UAC 提权后、网络检测前检查机器级/用户级 msedge.exe 和 `Get-AppxPackage -AllUsers` 的 `*MicrosoftEdge*`，Edge 与 AppX 都不存在时输出 `Edge is not installed; nothing to remove` 并以 0 退出；AppX 查询失败 fail-open）。WebView2、`EdgeCore`、`EdgeUpdate` 不参与守卫判定。
- `RemoveMSEdgeAll.bat`：无守卫模式，依次处理机器级 Edge、当前用户级 Edge、机器级/用户级 Evergreen WebView2、Edge AppX 及所有用户和共享更新设施残留。
- 两脚本都支持 `-auto`（仅内置 Administrator 已启用时跳过身份确认，不等同于 `-guard`）。
- 两脚本都支持 `-help`、`-h`、`/?` 显示参数说明；帮助在架构切换前退出，不触发 UAC、联网、下载或卸载。

#### 计划任务约定

保留 WebView2 并自动删除重装 Edge 时只能用 `RemoveMSEdge.bat -guard`。推荐顺序：先 `RemoveMSEdgeAll.bat` → 重装 WebView2 → 创建 `RemoveMSEdge.bat -guard` 计划任务（目标用户账户 + 最高权限运行，登录为触发器）。

```text
程序或脚本: %SystemRoot%\System32\cmd.exe
添加参数:   /d /c ""C:\path\to\Batch files\RemoveMSEdge.bat" -guard"
起始于:     C:\path\to\Batch files
```

#### 执行流程

1. 回到原生 CMD 架构，拒绝 ARM，仅支持 x86 和 AMD64。
2. 初始化调试日志并检查管理员权限，需要时 PowerShell 重新提升 CMD。
3. `-guard` 在此执行前置检测。
4. 从脚本目录或 `%TEMP%` 读取 `setup.exe` 和 `System.Data.SQLite.dll`；缺失时下载并校验硬编码 SHA-256。
5. 卸载浏览器前捕获全用户 `*microsoftedge*` AppX 列表。
6. 分别检测并调用机器级和当前用户级 Edge 卸载器。
7. `RemoveMSEdgeAll.bat` 继续卸载机器级和当前用户级 WebView2。
8. 解锁并删除 Edge AppX；staged/SYSTEM 状态包经临时 SYSTEM 计划任务重试，任务结束后注销。
9. 遍历 ProfileList，加载必要离线 `NTUSER.DAT`，清除各用户 Edge 残留。
10. 按职责边界清理机器目录、注册表、任务和服务，最后删除依赖硬链接。

调试日志固定 `log_lvl.debug`，生成 `RemoveMSEdge*_dbg.log` 和临时 `*_hlpr.log`（已被 `.gitignore` 排除）。

#### 维护约束

1. `RemoveMSEdge.bat` 破坏性命令不得引用 `EdgeWebView`、`EdgeCore`、`EdgeUpdate`、`MicrosoftEdgeUpdate`、`msedgewebview2` 或 WebView2 产品 GUID `{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`。
2. `RemoveMSEdgeAll.bat` 必须分别检测并调用机器级和用户级 Edge 卸载器，不能因机器级 Edge 不存在而跳过用户级分支。
3. `-guard` 检测必须位于网络检查和 `Obtaining required files` 之前；未检测到 Edge 以 0 退出。
4. 守卫只能以 `msedge.exe` 和 Edge AppX 为依据，不把 WebView2 或共享更新设施误判为 Edge。
5. AppX 列表必须在浏览器卸载前捕获，否则会漏掉 `Microsoft.MicrosoftEdgeDevToolsClient`。
6. ProfileList 循环每次读取前清空配置目录变量并验证路径，防止沿用上一用户路径。
7. 修改 UAC 或嵌入式 PowerShell 时验证最终传给 PowerShell 的文本，不只是源文件外观。
8. 标签名称唯一；所有 `goto`/`call :label` 都有对应标签，动态标签逐分支检查。
9. 用户配置清理必须扫描 `UrlAssociations` 和 `Explorer\FileExts` 下所有 `UserChoice`/`UserChoiceLatest` 的直接或嵌套 `ProgId`；仅删除以 `MSEdge` 开头的残留，不能覆盖用户选择的其他浏览器。
10. 受保护的 Edge `UserChoice` 删除失败时，只能移除目标键的非继承拒绝 ACL 后重试，不能修改其他关联键的权限。
11. 依赖文件缓存哈希不匹配时，必须删除失效缓存并重新下载；下载完成后再次校验，二次校验仍失败才返回 `ISSUE_HASH`。

#### 验证清单

静态：`git diff --check`、`git status --short --ignored`；确认所有 `powershell -noprofile -c` 块能被 `[scriptblock]::Create()` 解析、多行管道块经 CMD 转义后可解析、无缺/重标签、`RemoveMSEdge.bat` 无违反保留边界的破坏命令、调试日志保持 ignored。

破坏性验证只能在可回滚虚拟机/专用测试机：

| 场景 | 预期结果 |
|---|---|
| 仅 WebView2，跑 `RemoveMSEdge.bat -guard` | 立即退出，WebView2 和 Edge Update 不变 |
| 仅机器级 Edge | 调系统级卸载器并清理 AppX |
| 仅当前用户级 Edge | 调用户级卸载器，不因机器级缺失而跳过 |
| 其他用户存在 Edge | 守卫进入流程，清理对应 ProfileList 残留 |
| AppX pending removal | 进入流程，重启后查询无输出 |
| `RemoveMSEdge.bat` 且已装 WebView2 | Edge 删除，WebView2/共享更新保留 |
| `RemoveMSEdgeAll.bat` | Edge、WebView2、EdgeCore、EdgeUpdate、任务和服务全删 |
| 任一脚本已有其他浏览器处理 URL 或文件类型 | 保留对应 `UserChoice`/`UserChoiceLatest` |
| 任一脚本残留 `MSEdge*` 的 URL 或文件类型 `UserChoice`/`UserChoiceLatest` | 删除对应选择子键 |
| 依赖文件缓存哈希不匹配 | 删除缓存、重新下载并通过二次 SHA-256 校验后继续 |

不要在日常开发机上为语法验证直接跑完整脚本。

### 3.12 DeepSeek Harness Launcher

`DeepSeek Harness/Launcher/` 是 DeepSeek Harness（`dsh web`）的本地托盘监督器，负责受管启动/停止/重启/更新 `dsh web` 并通过系统托盘提供最小控制面。**本节是维护规范，用户使用见 `Launcher/README.md`。**

#### 定位与边界

| 项目 | 约定 |
|---|---|
| 输入 | exe 同目录 `Launcher.ini`；Node.js；`dsh`、`npx` 或显式 `DshBin` |
| 输出 | 托盘图标、`Launcher.log`、本地 HTTP 服务（默认 `127.0.0.1:16100`）|
| 生命周期 | 启动时可自动拉起 Harness；Launcher 退出/崩溃/被强杀时终止其托管进程树 |
| 配置 | 直接编辑 `Launcher.ini`；无设置窗口，端口和 Host 下次启动服务生效 |
| 开机启动 | Launcher 本身由 Windows 任务计划程序启动；Harness 随不随之启动由 `AutoStart=1` 决定 |
| 运行时 | Windows 10/11、C++20、Win32 API、MSVC `/MT`；不写注册表、无需安装程序 |

一次启动路径：`wWinMain → 初始化 Winsock/路径/日志/单实例互斥体 → 检测 node.exe，读取 Launcher.ini → 创建隐藏窗口与托盘图标 → AutoStart=1 时 StartDSH → 消息循环`。`StartDSH → 判定 dsh/npx/自定义 → 构造带 --no-open 的 web 命令 → CREATE_SUSPENDED 建进程 → 加入 Job Object 后 ResumeThread → 按句柄或 TCP 端口确认状态`。

不能破坏的行为保证：

1. **不抢前台**：三种模式都保留 `web --no-open`；`CREATE_NO_WINDOW` 只隐藏控制台，不能替代 `--no-open`。
2. **整树托管**：优先带 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 的 Job Object；停止和退出覆盖 Job Object 失败时的单进程兜底。
3. **外部实例可识别**：运行状态不能只看 `g_hProc`，还须探测配置 Host/Port。
4. **配置可恢复**：端口落在 1-65535；无效端口自动选空闲端口并写回 ini。
5. **更新不阻塞托盘**：npm 检查和更新在线程执行，经私有窗口消息回 UI 线程；测试不改开发机全局 npm。

#### 目录结构

```text
Launcher/
├── src/
│   ├── Launcher.cpp        # 全部业务逻辑（单文件，约 700 行）
│   ├── Resource.h          # 资源与菜单命令 ID
│   ├── Launcher.rc         # 图标 / 清单 / 版本信息（必须 UTF-8 BOM）
│   ├── app.manifest        # DPI 感知、Win11 兼容、长路径、Common-Controls v6
│   ├── DeepSeekHarness.svg # 官方 Web UI favicon 矢量源
│   └── Launcher.ico        # 托盘图标（make-icon.ps1 生成，入库）
├── scripts/
│   ├── build.ps1           # MSVC 构建（rc + cl /c + link 三步）
│   ├── make-icon.ps1       # 图标生成
│   ├── test-lifecycle.ps1  # 启停、重启、强杀清理与日志
│   ├── test-modes.ps1      # dsh / npx 启动方式
│   ├── test-port.ps1       # 端口收束
│   └── test-update.ps1     # 更新检查与通知链路
├── Launcher.ini.example    # 配置模板（UTF-16LE，含注释）
└── README.md               # 用户文档
```

#### 架构与模块

| 模块 | 位置 | 职责 |
|---|---|---|
| 配置 | `Config`/`LoadConfig`/`Read/WriteIniStr` | 读写 exe 同目录 `Launcher.ini` |
| 组件发现 | `FindNodeExe`/`FindDshCmd`/`SearchPathFor` | 定位 node.exe 与 dsh 命令 |
| 启动方式判定 | `DetectLaunchMode`/`ModeName` | dsh（全局）/npx/自定义（DshBin） |
| 状态探测 | `IsPortOpen`/`PortOwnerPid`/`HostAddr` | TCP 探测端口、TCP 表定位监听 PID |
| 进程管理 | `StartDSH`/`StopDSH`/`RestartDSH`/`StopManaged` | 派生、整树终止、重启 |
| 托盘 UI | `ShowTrayMenu`/`HandleCommand`/`WndProc` | 托盘图标、右键菜单、命令分发 |
| 端口收束 | `RandomFreePort` | 无效端口修正为随机可用端口 |
| 更新检查 | `CheckForUpdate`/`CheckThread`/`DoUpdate`/`UpdateThread`/`RunCommandCapture`/`LocalDshVersion` | npm 版本对比、后台更新、完成通知 |
| 日志 | `Log` | 追加写 `Launcher.log`（UTF-16LE，超 256KB 截断）|

启动自检：找不到 node.exe → 弹窗并退出；`LoadConfig` 读 `Host`（默认 `127.0.0.1`）与 `Port`（默认 0 无效），端口不在 1-65535 → `RandomFreePort()` 随机探测未占用端口（1024-65535，最多 100 次）并写回 ini；`Host=0.0.0.0` 不支持则友好提示。

启动方式：`DetectLaunchMode()` 返回 `Dsh`（ini 无 `DshBin` 且 PATH 上有 `dsh.cmd`/`dsh`）/ `Npx`（无 dsh）/ `Custom`（ini 指定存在 `DshBin`）。判定结果存 `g_mode`，每次弹菜单和启动时刷新；菜单前两条灰色显示启动方式与监听地址。

进程模型（核心）：

| 模式 | 实际命令 |
|---|---|
| dsh | `cmd.exe /c ""<dsh 全路径>" web --no-open --host <Host> --port <Port>"` |
| npx | `cmd.exe /c npx -y @deepseek-ai/dsh web --no-open --host <Host> --port <Port>` |
| 自定义 | `"<node.exe>" "<DshBin>" web --no-open --host <Host> --port <Port>` |

- 命令统一经 `cmd.exe` 派生（dsh/npx 是 npm 的 .cmd shim）；`cmd /c` 等待子进程，进程句柄存活期有效。
- 全部传 `--no-open`；`CREATE_SUSPENDED` 建进程，**AssignProcessToJobObject 后再 ResumeThread**，保证 Harness 及全部子进程进入作业对象。
- `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`：停止 = `TerminateJobObject`；托盘退出（含强杀）→ 最后句柄关闭 → 系统自动终止整树。
- Job Object 失败回退单进程管理（`TerminateProcess`），`WM_DESTROY` 与 `StopManaged` 覆盖该分支。

运行状态：`IsRunning() = 句柄存活（WaitForSingleObject(...,0) == WAIT_TIMEOUT）|| TCP 探测 <Host>:<Port> 可连`。端口探测非阻塞 connect + select 最多等 200 ms。双条件识别外部手动启动实例；停止外部实例经 `GetExtendedTcpTable` 定位监听 PID，确认后 `OpenProcess(PROCESS_TERMINATE)+TerminateProcess`。

托盘 UI：隐藏顶层窗口（类名 `DSHLauncherWnd`）+ `Shell_NotifyIcon`；右键 `WM_RBUTTONUP` 弹菜单；`TrackPopupMenu` 前 `SetForegroundWindow`，返回后 `PostMessage(WM_NULL)`；每次弹菜单重建；2 秒定时器刷新提示文字并回收已退出进程句柄。

私有消息协议（`WM_APP+100~106`）：`kMsgStart`(0x8064)/`kMsgStop`(0x8065)/`kMsgRestart`(0x8066)/`kMsgQuery`(0x8067，返回 1/0)/`kMsgUpdateDone`(0x8068)/`kMsgCheckUpdate`(0x8069)/`kMsgCheckResult`(0x806A)。

单实例：互斥体 `Local\DSHLauncher_SingleInstance`（`CreateMutex` + `ERROR_ALREADY_EXISTS`）。

更新检查：后台 `npm view @deepseek-ai/dsh version`（以退出码判定成功，避免错误文本冒充版本号），与 `LocalDshVersion`（读全局 dsh 的 `package.json` 的 `version`）对比，结果 `PostMessage(kMsgCheckResult)`。更新：dsh 模式 `npm i -g @deepseek-ai/dsh@latest`，npx 模式 `npx -y @deepseek-ai/dsh@latest --version` 刷新缓存；更新期间防重入（`g_updating`）；完成 `kMsgUpdateDone`，成功按用户选择自动重启 Harness 并重新检测启动方式。

#### 构建

`scripts\build.ps1`（基线 PowerShell 7 / pwsh）：

1. `vswhere` 定位 VS，取 `VC\Auxiliary\Build\vcvars64.bat`。
2. `rc /fo ..\bin\Launcher.res Launcher.rc`（src 目录下执行，相对路径避开空格）。
3. `cl /c /EHsc /std:c++20 /O2 /MT /DUNICODE /D_UNICODE /D_WIN32_WINNT=0x0A00 /DWINVER=0x0A00 /D_CRT_SECURE_NO_WARNINGS /W3 /utf-8` 产出 `Launcher.obj`。
4. `link /SUBSYSTEM:WINDOWS /MACHINE:X64 Launcher.obj Launcher.res /OUT:Launcher.exe`。

> 拆成 `cl /c` + `link` 两步的原因（踩坑）：一步式 `cl /Fe:` 链接时链接阶段收不到编译产物（`LNK2001: unresolved WinMainCRTStartup`）。

#### 已知陷阱与约定

1. `wWinMain` 必须是全局函数；放匿名命名空间内 MSVC 无法识别入口（`WinMainCRTStartup` 未解析）。其余辅助函数放 `namespace { }`。
2. `/utf-8` 必须保留，否则 GBK 代码页误解析中文（C4819/C2001）。
3. `.rc` 与 `Resource.h` 必须是 UTF-8 BOM，否则 `rc.exe` 报 `RC1004`。
4. ini 编码：`GetPrivateProfileStringW`/`WritePrivateProfileStringW` 只支持 ANSI 与 UTF-16LE（BOM `FF FE`）；UTF-16BE（`FE FF`）无法解析，键值读不到会误触发端口随机化。发布/恢复 ini 必须用 `[System.Text.Encoding]::Unicode`（LE）。
5. PowerShell 脚本内避免弯引号“”，统一用「」。
6. P/Invoke 传 `$null` 给 `FindWindow` 会编组为空字符串，不能作为通配 NULL，必须同时传类名与标题。
7. `New-Object TypeName(a, b, c)` 多参构造按单数组参数绑定，改用 `[TypeName]::new(a, b, c)`。
8. `$PID` 是只读变量，测试脚本勿赋值。
9. 图标：`DeepSeekHarness.svg` 取自官方 favicon，`Launcher.ico` 由 `make-icon.ps1` 以品牌蓝 `#4D6BFE` 渲染（16/20/24/32/48/64/256 多尺寸）；更新矢量后重新生成并提交 ICO。
10. 清理残留：测试/调试结束确认无残留 `node.exe`（`KILL_ON_JOB_CLOSE` 已保证托盘死即清，但手工杀进程注意）。
11. `cmd.exe /c` 带空格路径的 .cmd 用 `cmd /c ""<path>" args"` 双引号套引号；无空格命令（如 `npx -y ...`）无需引号。
12. `npx -y @deepseek-ai/dsh` 未全局安装时自动拉取缓存；托盘不主动校验网络，启动失败由端口探测体现。
13. `RunCommandCapture` 必须同时校验退出码与输出格式（版本号含 `.`），否则 npm 缺失的错误文本被误判为版本。
14. 系统通知：非打包桌面应用直接 WinRT `ToastNotificationManager` 会抛 `0x80070490`；为保持“完全便携、不写注册表”，非错误提示统一用 `Shell_NotifyIcon` 的 `NIF_INFO`（`ShowNotify`），仅错误用 `MessageBox`。

#### 测试

在 `DeepSeek Harness/Launcher` 目录：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\test-lifecycle.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\test-modes.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\test-update.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\test-port.ps1
```

- `test-lifecycle.ps1`：用临时 Node HTTP 服务器（`test-server.js`）代替真实 Harness；经私有消息驱动：自启 → 查询 → 停止 → 再启 → 重启（对比监听 PID）→ 强杀托盘验证 `KILL_ON_JOB_CLOSE`（端口关、无残留 node）→ 日志断言；`finally` 清理。
- `test-modes.ps1`：受限 PATH + 假 shim 模拟 dsh/npx 环境，断言 `启动方式=dsh/npx`、命令含 `web --no-open`。
- `test-update.ps1`：无 npm → 检查失败并断言日志；真实环境 → 完整检查链路但不执行真实更新。
- `test-port.ps1`：有效端口不变；越界/非数字端口被修正为 [1024,65535] 内可用端口且日志记录。

#### 扩展指引与版本库约定

- 新增菜单项：`Resource.h` 加 ID → `ShowTrayMenu` 加 `AppendMenuW` → `HandleCommand` 加 case。
- 端口即时生效可在 `IDM_PORT` 成功后调 `RestartDSH()`（先确认用户意图）。
- 接入其它启动方式集中在 `DetectLaunchMode()`；扩展枚举与 `StartDSH` 命令构造。
- `bin\` 整体忽略，产物不入库；源码、脚本、文档、图标、`Launcher.ini.example` 入库；提交信息前缀 `launcher: ...`。

交接清单：先改行为源（`Launcher.cpp`，配置默认同步 `Launcher.ini.example`）→ 图标先更 SVG 再 `make-icon.ps1` 生成 ICO → 编译并跑到至少生命周期/启动方式/端口测试（更新逻辑另跑更新测试）→ 检查无残留 exe/测试 node/日志/临时 shim，`git diff --check` 通过 → README 写使用，本文记录实现约束。

### 3.13 Android ApkRename

`Android/ApkRename` 是只修改 APK 应用名称的 PowerShell 脚本：基于 apktool 反编译，仅改动名称相关的清单/字符串资源，重新打包并用原 keystore 重新签名，包名、代码与其余资源保持不变，最后逐文件哈希校验。工具（apktool、apksigner、zipalign、aapt）可下载到脚本目录 `tools\`（`.\rename-apk.ps1 -SetupTools`）。

签名“字节”必然变化（内容变了），但只要用原 keystore，签名“身份”（同一证书）不变，可覆盖安装。维护时注意：只改名称相关资源，不得动包名与代码；签名必须用原 keystore。

### 3.14 Firefox PortableBridge

`Firefox/PortableBridge/` 是便携 Firefox 的会话级 HTTP(S) 协议桥接器，解决 Windows 没有默认浏览器、`http`/`https` 也没有有效 `UserChoice`/`UserChoiceLatest` ProgId 时，桌面应用无法打开 OAuth、账号管理或普通网页的问题。它不是默认浏览器注册器，不写 `UserChoice`/`UserChoiceLatest`/Hash、`RegisteredApplications`、Capabilities 或 `StartMenuInternet`。

#### 运行布局与边界

源码位于仓库，运行产物部署到仓库外的便携 Firefox：

```text
FirefoxRoot\
├── App\firefox.exe
├── Data\profile\
└── Tools\
    ├── FirefoxPortableBridge.exe
    ├── OpenUrl.ps1                   # watch 会话生成的旧 handler 兼容垫片
    └── Portable.ps1                 # 可选的通用退出清理
```

- 整个 `FirefoxRoot` 可以移动到任意本地盘符或目录；所有路径运行时规范化，源码没有固定盘符。
- 当前二进制必须命名为 `FirefoxPortableBridge.exe` 并位于 `FirefoxRoot\Tools`。`open` 模式从自身位置恢复根目录，`watch`/`cleanup --root` 还会校验参数根与二进制位置一致，拒绝越界操作。
- 固定相对布局为 `App\firefox.exe`、`Data\profile`、`Data\appdata` 和 `Data\runtime-url-handler.json`。这不是可独立指向任意 Firefox/Profile 的通用默认浏览器工具。
- 主 Firefox 必须由外部便携启动器启动且不能带 `--no-remote`。Bridge 只投递 URL，不重复执行更新、迁移或完整启动流程。

#### 模式与进程模型

| 模式 | 职责 |
|---|---|
| `watch --root <FirefoxRoot>` | 根路径互斥的常驻实例；等待目标 Firefox，注册/自愈协议，提供命名管道；UserChoice 冲突时暂停并重试，Firefox 退出后撤销 |
| `open <URL>` / `<URL>` | GUI 子系统短命入口；校验 URL，优先通过根路径派生的命名管道投递，失败时直接投递；协议命令和旧 handler 垫片使用前者，单 URL 仅保留兼容 |
| `gh-open <session-guid> <URL>` | `GH_BROWSER` 专用入口；状态中的当前会话 GUID 和完整环境命令匹配后才投递，拒绝旧终端继承的过期会话 |
| `cleanup --root <FirefoxRoot>` | 启动前回收上次崩溃、强杀或断电留下且仍能证明所有权的协议状态、当前根目录的旧版 PowerShell handler 及精确匹配模板的兼容垫片 |

一次正常会话：启动器先启动 `watch` → Bridge 最多等待 90 秒检测同路径、非 `-contentproc` 且非 `--no-remote` 的 Firefox 主进程 → 写入会话状态 → 临时建立 `http`/`https` 命令；若 `GH_BROWSER` 原先不存在则创建指向当前 Bridge 的用户环境覆盖，并生成旧 handler 兼容垫片 → 每 500 ms 检测进程、每 2 秒核验协议和自有环境值完整性 → 非空 UserChoice 出现时撤销自身回退、保留 Watch 并周期重试 → Firefox 消失时立即撤销 URL 回退、自有 `GH_BROWSER` 并删除内容仍匹配模板的垫片 → 保留 5 秒重启宽限 → 如 `Tools\Portable.ps1` 存在，以隐藏 PowerShell 调用 `-Mode Cleanup` 完成 URL 以外的便携痕迹清理。

`open` 与 `watch` 使用以规范化根路径 SHA-256 前缀派生的本地命名管道；`watch` 同时使用同一根路径派生的实例互斥体，防止重复监视器。注册、自愈和 `cleanup` 另用同根目录派生的状态互斥体串行执行，避免状态 JSON 与两棵协议注册表被不同进程交叉读写。短命入口优先把验证后的 URL 发给常驻实例；管道连接或交付失败时，由同一短命 EXE 在确认便携 Firefox 主进程后，以完全相同的 Profile 和便携环境直接执行 `firefox.exe --profile <Data\profile> -url <URL>`，避免瞬态管道故障静默丢失外链。

URL 投递必须同步设置主启动器的便携环境：`TEMP`/`TMP`、`MOZ_APP_DATA`、`MOZ_LOCAL_APP_DATA`、崩溃报告和 Pending Pings 目录均指向 `Data`。不能只传 `--profile`，否则 Firefox 应用级状态仍可能写入主机 AppData。

`Data\runtime-url-handler.open.log` 采用单行覆盖，只记录最近一次调用时间、调用方进程名、目标协议/主机、通道、返回码和前序异常类型；不得记录 URL 路径、查询参数、片段或 OAuth 数据。它用于判断调用是否到达 Bridge，不参与注册表所有权或恢复决策。

#### 注册表所有权与安全不变量

会话状态 `Data\runtime-url-handler.json` 使用 schema 3，记录会话 GUID、根路径、Bridge 路径、完整 handler command、创建时间、两个协议根键启动前是否存在，以及本会话是否创建了 `GH_BROWSER` 和它的完整命令。状态文件先原子落盘，再写注册表和用户环境；注册、修复和撤销协议后调用 `SHChangeNotify(SHCNE_ASSOCCHANGED)` 刷新 Shell 关联缓存，环境变化后广播 `WM_SETTINGCHANGE(Environment)`。读取 schema 1/2 时先按对应旧所有权规则清理协议、旧环境值及 schema 1 的 `MSEdgeHTM` 适配，再建立 schema 3 会话。

维护时必须保留以下约束：

1. 启用前必须读取两个协议的 `UserChoice` 和 `UserChoiceLatest`。含非空 ProgId 时不能仅凭原始键决定：必须调用 `AssocQueryStringW`，以 `ASSOCF_IS_PROTOCOL | ASSOCF_VERIFY` 查询 `ASSOCSTR_COMMAND`。解析到其他有效命令时撤销自身回退并暂停注册，不能修改、删除或伪造 Hash；官方 API 返回 `ERROR_NO_ASSOCIATION` 时才可判定为无可用处理器并建立会话回退。该冲突不是 Watch 的致命错误：只要目标 Firefox 仍运行，Watch 必须继续常驻并周期重试。Windows 自动生成但不含 ProgId 的空壳选择键可直接忽略。
2. 初次接管只接受协议根不存在，或根键仅含空字符串 `URL Protocol` 且没有子键；任何第三方值或命令均拒绝覆盖。
3. 每次接管允许最多 5 秒的只读稳定窗口（100 ms 轮询）；先等待 `UserChoice`/`UserChoiceLatest` 的 ProgId 稳定为空，再在每轮同时检查空树接管和完整自有树再认领，不能只在进入窗口前检查一次再认领。窗口结束后 UserChoice 仍非空时只暂停该轮并记录错误，约两秒后重试；协议树结构不安全则仍为致命错误。
4. 每次注册、自愈和撤销协议后必须调用 `SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_DWORD | SHCNF_FLUSH, ...)` 并等待系统组件处理。该通知只请求刷新普通 Shell 关联缓存，不得假定它会清除 UCPD 向特定调用进程返回的受保护 `UserChoiceLatest` 或旧命令。
5. 状态互斥体必须覆盖状态读取、状态原子写入、注册表写入和状态删除的完整临界区；`watch` 与外部 `cleanup` 不得并发改变同一会话。
6. 状态 JSON 缺失时，只允许再认领能以合法 GUID、空 `URL Protocol`、唯一完整 `shell\open\command` 和当前精确 handler command 证明所有权的树；两个协议的已拥有部分必须使用同一 GUID，其他结构继续拒绝。
7. 根键用 `FirefoxPortableSessionId` 标记会话所有权；完整活动状态必须同时具备空 `URL Protocol`、匹配 GUID、唯一 `shell\open\command` 和精确 handler command。
8. 自愈只允许根键为空或仍是本会话可证明安全的部分结构；出现第三方根值、额外子键、命令变化或所有权变化时停止覆盖。
9. 清理逐层验证根值、`shell`、`open`、`command`；不能证明属于本会话的结构保留，状态文件也保留以便人工排查。
10. 原先存在的空 `URL Protocol` 标记清理后保留；原先不存在且已恢复为空的根键删除。
11. 只接受单个、无控制字符、长度不超过 32768 的绝对 `http`/`https` URL；其他 scheme 返回拒绝码。
12. WMI 进程查询失败属于未知状态，不能据此立即撤销或执行退出清理；只有查询成功且确认目标主进程不存在才进入退出路径。
13. `Tools\OpenUrl.ps1` 只允许由 `watch` 在协议注册成功后以固定内置模板原子生成，用于兼容 Windows 仍执行的旧版同目录 handler。创建时不得覆盖不同内容的同名文件；清理时也只删除逐字匹配模板的主文件或临时文件。模板必须从 `$PSScriptRoot` 相对解析同目录 EXE，不得写入固定盘符。
14. `watch` 首次注册前及 `cleanup` 都必须迁移清理旧版 PowerShell handler，但匹配必须同时覆盖系统 Windows PowerShell 绝对路径、固定参数序列、当前便携根的 `Tools\OpenUrl.ps1` 和 `-Url "%1"`。只删除精确匹配的 `command`，逐层删除变空的 `open`/`shell`，移除 Bridge 专用所有权值并保留原有空 `URL Protocol`；不得按脚本文件名或 `powershell.exe` 模糊删除。
15. Procmon 已确认 Windows Terminal 中的 `gh.exe` 和系统 `OpenWith.exe` 会在 UCPD 受保护视图中读取失效 `MSEdgeHTM`，同时把临时 `HKCU\Software\Classes\MSEdgeHTM` 和普通 `https\shell` 命令过滤为不存在；不得再用临时 ProgId 适配宣称解决该路径。Bridge 应使用 GitHub CLI 官方的 `GH_BROWSER`：仅在用户环境原先同时无 `GH_BROWSER` 和 `BROWSER` 时，以 schema 3 状态先记录所有权再写入 `"<正斜杠 Bridge 路径>" gh-open <session-guid>`，引号兼容空格，正斜杠防止 `gh` 的 shell 命令解析吞掉反斜杠，会话参数阻止旧终端跨会话复用。环境值变化后广播 `WM_SETTINGCHANGE(Environment)`；已有值不覆盖，运行中发现自有值被外部值替换时放弃环境所有权并继续协议 Bridge，退出时也只删除仍逐字匹配状态命令的自有值。schema 1/2 只保留迁移清理逻辑。

#### 源码、构建与部署

| 文件 | 角色 |
|---|---|
| `FirefoxPortableBridge.cs` | 单文件实现；C#，兼容系统 .NET Framework 4 编译器 |
| `build.ps1` | 定位 Framework64/Framework `csc.exe`，以 AnyCPU、`winexe`、优化、警告即错误构建，并验证 PE GUI 子系统 |
| `README.md` | 用户定位、运行布局、构建和启动器接入说明 |
| `bin/` | 默认本地产物；由 `.gitignore` 排除，不提交 |

```powershell
cd Firefox\PortableBridge
.\build.ps1
.\build.ps1 -OutputPath 'X:\Portable\Firefox\Tools\FirefoxPortableBridge.exe'
```

编译必须保留 `/target:winexe /platform:anycpu /optimize+ /warnaserror+`，并引用 `System.Management.dll` 与 `System.Runtime.Serialization.dll`。部署后 PE Subsystem 必须为 2（Windows GUI），否则系统打开链接会出现控制台窗口。仓库不提交 EXE；修改行为后从当前仓库源码直接编译到实际便携目录，不在运行目录保留第二份源码。

#### 验证清单

静态：`build.ps1` 成功、PE Subsystem=2、`git diff --check`、源码和脚本无固定盘符、`bin/` 保持 ignored。

运行时至少覆盖：

| 场景 | 预期结果 |
|---|---|
| 没有 Firefox | `watch` 等待后退出，不留下协议命令 |
| Firefox 通过便携启动器运行 | 两个协议出现同一会话 GUID，命令指向当前 Bridge `open "%1"` |
| Firefox 启动时 UserChoiceLatest 候选持续超过 5 秒，随后恢复为空壳 | Bridge 不覆盖候选且不退出；撤销自身回退、保持 Watch，后续轮询自动注册 |
| Bridge 的注册表视图读到非空 UserChoiceLatest，但 `AssocQueryStringW` 返回 `ERROR_NO_ASSOCIATION` | 不修改选择键；按“没有可用处理器”建立会话回退 |
| Windows Terminal 中的 `gh.exe` 被 UCPD 固定到失效 `MSEdgeHTM` | 新终端从用户环境继承 `GH_BROWSER`，`gh` 以 `gh-open + 会话 GUID + URL` 调用 Bridge；不依赖 Shell 关联视图 |
| Firefox 根目录或 EXE 路径含空格 | `GH_BROWSER` 的正斜杠 EXE 路径带双引号，真实 `gh browse` 可正确执行 |
| 旧终端保留上一 Firefox 会话的 `GH_BROWSER` | `gh-open` GUID 与当前 schema 3 状态不符，Bridge 拒绝投递；新终端继承当前命令后恢复 |
| Firefox 启动时已有用户级 `GH_BROWSER` 或 `BROWSER` | 不覆盖、不取得所有权，保持用户配置原样 |
| 运行中自有 `GH_BROWSER` 被其他值替换 | 状态原子改为外部所有；不覆盖该值，普通 HTTP(S) Bridge 继续运行 |
| 携带旧根路径的状态文件随目录移动 | 先比较状态根、Bridge 路径和完整命令，再决定活动或清理；不得把旧位置命令当成当前会话 |
| UserChoice 通过 `AssocQueryStringW` 解析到其他有效命令 | 不覆盖；撤销自身回退并保持 Watch，选择失效或清空后自动恢复 |
| `watch` 自愈与外部 `cleanup` 并发触发 | 状态互斥体串行执行临界区；最终状态文件、两棵协议树和会话 GUID 保持一致 |
| 删除状态 JSON，但保留当前 Bridge 的完整所有权树 | 校验 GUID、命令和树形后重建状态；任一字段变化则拒绝再认领 |
| Windows Shell 打开本机随机 HTTP URL | 请求到达该便携 Profile；不生成默认 Profile，不出现 PowerShell/控制台窗口 |
| UCPD 对调用进程仍返回旧版同目录 `OpenUrl.ps1` 命令 | 隐藏 PowerShell 经会话垫片调用同目录 Bridge `open`，请求到达便携 Profile；Firefox 退出后垫片删除 |
| 没有状态 JSON，但普通注册表视图残留当前根目录的旧版 PowerShell handler | 启动注册前或显式 `cleanup` 精确识别并删除旧 `command`，空父键逐层回收，其他协议结构不变 |
| `Tools\OpenUrl.ps1` 已存在且内容不是内置模板 | 拒绝覆盖或删除；撤销自身协议所有权并记录错误 |
| 暂停或移除 `watch` 的命名管道后打开 HTTP(S) URL | 短命入口经直接回退投递到同一便携 Profile，诊断记录为 `direct-fallback` |
| 非 HTTP(S) 或带控制字符 URL | 拒绝，不启动 Firefox 辅助进程 |
| 删除本会话 command 或 `URL Protocol` | 2 秒核验周期内恢复 |
| 带非空 ProgId 且能解析到有效 handler 的 `UserChoice`/`UserChoiceLatest` | 不覆盖；撤销自身回退并保持 Watch，选择失效或清空后自动恢复 |
| 加入第三方根值、命令或改变所有权 | 视为致命结构冲突；不覆盖并记录错误状态供排查 |
| 正常退出或强制结束 Firefox | Bridge、状态文件、会话 GUID、协议命令和仍精确匹配的自有 `GH_BROWSER` 回收；原有空标记及外部环境值保留 |
| 强杀 Bridge/断电后再启动 | `cleanup` 仅回收所有权仍匹配的旧会话残留 |
| 运行中移动整个目录 | 必须先退出；移动后 `Prepare`/`cleanup` 清旧绝对命令，再按新路径注册 |
| 主机 AppData 启动前不存在 | URL 投递和退出后仍不存在，应用级状态只进入便携 `Data\appdata` |

---

## 4. 开发环境与构建命令速查

| 模块 | 需要的环境 | 主要命令 |
|---|---|---|
| SizerAHK | AutoHotkey v2 | `AutoHotkey64.exe AutoHotkey\SizerAHK\SizerAHK.ahk` |
| SizerWin | VS Build Tools / Windows SDK `cl.exe`+`rc.exe`，可选 CMake | `cd SizerWin; .\build.ps1` |
| SizerSwift | macOS 13+，Swift 5.9+，辅助功能权限 | `cd SizerSwift; swift build -c release` |
| CapsLockOSD | VS Build Tools | `cd CapsLockOSD; .\build.ps1` |
| Dox Reader | Node.js 24+（Firefox 发布 npm 11+） | 各自目录 `npm ci` + `npm run check` |
| Firefox AutoSortBookmarks | Firefox 142+；Node.js（测试） | `node --test Firefox/AutoSortBookmarks/tests/sorter.test.js` |
| Firefox PortableBridge | Windows；.NET Framework 4.x | `cd Firefox\PortableBridge; .\build.ps1` |
| DeepSeek Harness Launcher | PowerShell 7，VS Build Tools | `DeepSeek Harness/Launcher/scripts/build.ps1` |
| Userscript | Tampermonkey / Greasemonkey | 浏览器安装脚本 |
| Stash | Stash 运行环境 | 直接导入脚本 |
| CSS | 可加载自定义 CSS 的浏览器/工具 | 直接引用 `css/*.css` |
| AdGuard | AdGuard 兼容规则列表 | 导入 `magi.txt` |
| Batch files | Windows（x86/AMD64） | `RemoveMSEdge.bat [-guard] [-auto] [-help]` / `RemoveMSEdgeAll.bat [-auto] [-help]` |
| Android ApkRename | PowerShell，apktool/Java 等工具 | `.\rename-apk.ps1 [-SetupTools]` |

---

## 5. 提交前检查

```powershell
git status --short
git diff --check
rg -n "TODO|FIXME|BUG" -g "!**/.git/**" -g "!**/*.exe" -g "!**/*.ico" -g "!**/*.png" -g "!**/*.icns"
```

按修改范围补做对应模块的验证清单（见第 3 节各模块小节）。当前仓库没有统一的自动化测试套件，不能只依赖构建成功。
