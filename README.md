# Dox

自用的 Windows/macOS 工具、浏览器扩展、用户脚本和界面定制合集。各目录基本是独立模块，可按需直接运行、安装或构建；仓库没有统一的根级构建命令。

## 从哪里开始

- 想直接使用某个工具：看本页对应小节；仓库只保留这一份 `README.md` 和一份 `DEVELOPMENT.md`。
- 想构建、测试或修改实现：看 [`DEVELOPMENT.md`](./DEVELOPMENT.md)，其中记录唯一的维护者文档、模块边界和验证命令。
- 想处理 Edge 默认关联残留：先运行 `Scripts/RemoveMSEdge.bat -audit-associations`，确认后再使用 `-repair-associations`；这两个入口只检查/修复关联，不会卸载 Edge。
- 想安装或升级 FFmpeg：运行 `Scripts/InstallFFmpeg.ps1`，它升级 `PATH` 中 `ffmpeg.exe` 所在的那份安装，重复运行即替换为新版本；`PATH` 里没有 `ffmpeg.exe` 时脚本不安装任何东西。
- 想修改 Helium 翻译：先阅读下方“Helium 语言补丁”，完整实现和测试约束见 [`DEVELOPMENT.md`](./DEVELOPMENT.md#315-heliumlanguagepatcher)。

## 功能一览

| 模块 | 说明 |
|---|---|
| [`AutoHotkey/SizerAHK`](./AutoHotkey/SizerAHK) | AutoHotkey v2 窗口尺寸和位置调整工具 |
| [`SizerWin`](./SizerWin) | 不依赖 AutoHotkey 运行时的原生 Windows 窗口调整工具 |
| [`CapsLockOSD`](./CapsLockOSD) | Windows 原生 Caps Lock 状态屏幕提示 |
| [`SizerSwift`](./SizerSwift) | macOS 菜单栏窗口调整工具 |
| [`Dox Reader`](./Dox%20Reader) | Local-first RSS 阅读器，含 Cloudflare Workers 网页版和可选个人后端 |
| [`sub-store`](./sub-store) | Sub-Store 后端的 Cloudflare Workers 部署（D1 持久化、路径口令鉴权、每日自动更新） |
| [`sub-store-front-end`](./sub-store-front-end) | Sub-Store 前端的 Cloudflare Workers 静态资源部署 |
| [`bwh-traffic`](./bwh-traffic) | 把 BandwagonHost KiwiVM 流量转成 Sub-Store 订阅头 `subscription-userinfo` 的 Worker |
| [`Firefox/AutoSortBookmarks`](./Firefox/AutoSortBookmarks) | Firefox 书签自动整理扩展 |
| [`Firefox/Zen`](#zen中文补全与默认应用重复项) | Zen 简体中文补全与快捷键显示修正，自动识别安装和配置目录，支持备份还原；另含默认应用重复项清理 |
| [`PortableBridge`](./PortableBridge) | Firefox / Chrome 便携浏览器会话级 HTTP(S) 桥接，最近启动者接管 |
| [`Scripts`](./Scripts) | Windows 批处理工具、Edge 关联清理辅助脚本和 FFmpeg 安装脚本 |
| [`DeepSeek Harness/Launcher`](#deepseek-harness-launcher) | Windows 托盘监督器，负责启动、停止和重启本地 DeepSeek Harness |
| [`Windhawk/CJKSpacer`](./Windhawk/CJKSpacer) | 为 Explorer 菜单和 Tooltip 的中日韩字符边界补空格的 Windhawk 模组 |
| [`CSS`](./CSS) | 中文字体映射和 VS Code 外观自定义 CSS |
| [`Userscript`](./Userscript) | Tampermonkey/Greasemonkey 用户脚本 |
| [`Stash`](./Stash) | Stash 磁贴脚本 |
| [`Android/ApkRename`](./Android/ApkRename) | 只修改 APK 应用名称、保持包名与签名身份不变的脚本 |
| [`HeliumLanguagePatcher`](./HeliumLanguagePatcher) | 扫描 Helium 漏译文案，通过 Codex 配置中的模型 API 补全翻译并修补语言包 |
| [`Scripts/Flatten.bat`](./Scripts/Flatten.bat) | Windows 目录展平工具 |
| [`Scripts/RemoveMSEdge.bat`](./Scripts/RemoveMSEdge.bat) | Microsoft Edge 清理脚本（保留 WebView2），带关联审计/修复入口 |
| [`Scripts/RemoveMSEdgeAll.bat`](./Scripts/RemoveMSEdgeAll.bat) | Microsoft Edge 与 WebView2 的完整清理脚本 |
| [`Scripts/InstallFFmpeg.ps1`](./Scripts/InstallFFmpeg.ps1) | 下载最新 FFmpeg full 构建并就地升级 `PATH` 中已有的那份安装 |

## Helium 语言补丁

`HeliumLanguagePatcher/helium_language_patcher.py` 使用 Python 3.11+，不需要安装额外依赖。它按英文原文定位当前版本的资源 ID，修改目标语言的 Chromium DataPack v5 语言包。

### 预览与应用

在仓库根目录运行（安装路径按实际情况替换）：

```powershell
# 预览已有翻译匹配和待补全文案，不调用 API、不写文件
python.exe .\HeliumLanguagePatcher\helium_language_patcher.py zh-CN --root "C:\Program Files\imput\Helium"

# 完全退出 Helium，以管理员身份打开终端后应用（Program Files 安装版）
python.exe .\HeliumLanguagePatcher\helium_language_patcher.py zh-CN --root "C:\Program Files\imput\Helium" --apply
```

支持原先单用户版的平铺目录（例如 `%LOCALAPPDATA%\Programs\Helium`），以及全部用户版的 `Helium\Application\<版本>\Locales` 结构。`--root` 可传安装根目录、`Application` 目录或明确的版本目录。默认按 `Application\chrome.exe` 的文件版本定位资源目录，不必手动填写版本号；无法读取版本且存在多个候选目录时，会提示明确指定版本。写入 `Program Files` 下的安装版通常需要以管理员身份运行终端。

带 `--apply` 时，每次先扫描英文包与目标语言包，查找仍为英文且本地翻译表中尚未收录的文本，再通过 API 翻译并写入脚本旁的 `<语言>-overrides.json`。已有条目保持不变，每批结果通过校验后立即缓存；中断后重新运行可继续补全。API 只接收待翻译的语言包文案和目标语言，不发送浏览记录或 Codex 对话。新文案会产生所选服务的 API 用量。

### API 配置与参数

默认读取 `%CODEX_HOME%\config.toml`，未设置 `CODEX_HOME` 时读取 `%USERPROFILE%\.codex\config.toml`，使用其中选中的服务、模型和 API 认证。无需把地址或 Key 填进脚本或翻译表；密钥不写入翻译表或日志。配置必须提供可用的 API 认证，脚本不会使用 ChatGPT 登录凭据或读取 `auth.json`。若以另一个管理员账户运行，可通过 `--codex-config` 指定原用户的配置路径。

| 参数 | 行为 |
|---|---|
| `zh-CN` / `--language zh-CN` / `--lang zh-CN` | 指定目标语言，默认 `zh-CN`；`en-US` 只校验安装目录，不执行补丁，也不恢复中文包 |
| `--root 路径` | 安装根目录、`Application` 或明确版本目录；省略时使用脚本所在文件夹的上一级 |
| `--apply` | 自动补全翻译表并写入语言包；省略时只预览，不联网、不写文件 |
| `--offline --apply` | 只应用现有翻译表，不读取 API 配置或联网 |
| `--codex-config 路径` | 指定另一份本机 Codex 配置 |
| `--codex-profile 名称` | 使用配置中的指定 profile |
| `--batch-size 10` | 每次请求的文案数，范围 1–50，默认 10 |
| `--overrides 路径` | 指定另一份翻译表；文件可自动创建，父目录和目标语言 `.pak` 必须已存在 |

### 备份、恢复与限制

翻译表与 `.pak` 均通过临时文件替换并备份。备份固定为原文件名加 `.bak`，例如 `zh-CN-overrides.json.bak`、`zh-CN.pak.bak`，各保留一份，新备份覆盖旧备份；成功创建后清理旧版时间戳备份。翻译表在本轮首次覆盖已有文件前备份，之后逐批保存。无内容变化的语言包不会重写或覆盖备份。

恢复时先完全退出 Helium，再将对应 `.bak` 复制回原文件名。备份保存的是上次修改前的内容，不保证是最初未打补丁的版本；浏览器升级后不要把旧版本 `.pak` 复制到新版本目录，应重新运行补丁。

自动扫描会过滤常见字体名、快捷键、搜索词表等资源，ICU 复数/选择表达式会报告并跳过，不能保证覆盖所有漏译。机器翻译可在 JSON 中手动修订。API 出错或结果破坏占位符、HTML、URL 时，本次停止应用语言包，已完成批次保留。Windows 报“拒绝访问”时，确认浏览器已完全退出，并用管理员终端写入 `Program Files`。成功后重新启动 Helium 加载新语言包；脚本不会自动切换浏览器界面语言。

实现细节、测试和安全边界见 [`DEVELOPMENT.md`](./DEVELOPMENT.md#315-heliumlanguagepatcher)。

## 中文字体映射

通过 `@font-face` 将常见英文字体名、CSS 通用字体族名和旧式中文字体名映射到现代中文字体，优化网页中文显示。

以下两个文件共享同一套映射规则，修改时需同步维护：

- [`CSS/font-face.css`](./CSS/font-face.css) — 可独立引用的 CSS
- [`Userscript/中文字体优化.user.js`](./Userscript/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.user.js) — Tampermonkey 用户脚本版本

### 目标字体

按 `local()` 书写顺序的优先级：

| 类别 | 首选 | 回退 |
|---|---|---|
| 无衬线 CJK | PingFang SC / TC | Noto Sans SC |
| 衬线 CJK | Songti SC / TC | Noto Serif SC |
| 等宽 | Maple Mono Normal NF（简繁中 CN、日 JP、韩 KR） | — |
| 手写（cursive） | LXGW WenKai | — |
| 幻想（fantasy） | Yozai | — |

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

完整实现架构、配置格式和维护说明见仓库根 [`DEVELOPMENT.md`](./DEVELOPMENT.md)。

### CapsLockOSD

CapsLockOSD 是一个 Windows 原生 Caps Lock 屏幕提示工具，用 Win32 API 和系统自带 GDI+ 实现，目标是接近 Logitech Options 的大小写提示效果，同时保持单 exe、低依赖。

#### 行为

- 仅在 Caps Lock 状态切换时显示 OSD。
- OSD 显示在当前前台窗口所在屏幕约 90% 垂直位置。
- 背景为半透明纯黑圆角矩形，默认透明度为 `155/255`。
- 整体尺寸为初始 Logitech Options 风格复刻尺寸的 `75%`。
- Caps Lock 开启时图标显示大写 `A`，关闭时显示小写 `a`。
- 文字和图标保持不透明，保证可读性。
- OSD 置顶、无焦点、点击穿透，不打断当前输入。
- OSD 显示初期会短时间重申 topmost 层级，改善无边框全屏/伪全屏窗口抢回 z-order 的情况。
- 支持多显示器和 Per-Monitor DPI 缩放。
- 状态文本跟随 Windows UI 语言：
  - 简体中文：`大写锁定已开启` / `大写锁定已关闭`
  - 繁体中文：`大寫鎖定已開啟` / `大寫鎖定已關閉`
  - 英文：`Caps Lock On` / `Caps Lock Off`
- 单实例运行，重复启动会直接退出。
- 不创建托盘图标。
- 不内置开机自启动。
- 启动时读取 exe 同目录的 `CapsLockOSD.ini`；若文件不存在，会自动生成默认配置。

#### 配置

配置文件位于 `CapsLockOSD.exe` 同级目录：

```ini
; CapsLockOSD configuration
; BackgroundAlpha: 0-255. 0 is fully transparent, 255 is fully opaque.
; DisplayDurationMs: OSD display duration in milliseconds.

[OSD]
BackgroundAlpha=155
DisplayDurationMs=1000
```

- `BackgroundAlpha` 控制 OSD 黑色背景透明度，范围 `0-255`，默认 `155`。
- `DisplayDurationMs` 控制提示显示时长，单位毫秒，默认 `1000`。程序会将该值限制在 `100-10000` 之间。

#### 自启动

如需登录时自动启动，建议使用 Windows 任务计划程序。示例：

```powershell
$exe = 'C:\Workspace\GitHub\Dox\CapsLockOSD\CapsLockOSD.exe'
schtasks /Create /TN 'CapsLockOSD' /TR "`"$exe`"" /SC ONLOGON /RL LIMITED /F
```

删除任务：

```powershell
schtasks /Delete /TN 'CapsLockOSD' /F
```

程序启动时会自动删除旧版本可能留下的 Run 注册表项：

```text
HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Dox CapsLockOSD
```

#### 全屏窗口限制

CapsLockOSD 使用普通 Win32 topmost layered window 绘制 OSD。对无边框全屏、伪全屏和普通窗口全屏，程序会尽量保持在最上层；但对 DirectX 独占全屏、独立翻转全屏、受保护内容或游戏/驱动级覆盖层，普通 Win32 窗口无法保证一定显示在最上层。

需要稳定显示 OSD 时，优先把游戏或应用切换为“无边框窗口化 / borderless windowed”。真正覆盖独占全屏通常需要注入渲染管线、使用游戏/驱动覆盖层或系统级 UIAccess/签名部署，这不属于本工具的最小依赖实现范围。

#### 停止

因为没有托盘图标，可以在任务管理器结束 `CapsLockOSD.exe`，或执行：

```powershell
taskkill /IM CapsLockOSD.exe /F
```

#### 构建

PowerShell 构建脚本会自动定位 Visual Studio / Build Tools：

```powershell
.\build.ps1
```

也可在 Visual Studio Developer Command Prompt 中运行传统批处理：

```bat
build.bat
```

也支持 CMake：

```powershell
cmake -S . -B build
cmake --build build --config Release
```

默认 MSVC 构建使用 `/MT` 静态链接 C/C++ 运行库。运行时只依赖 Windows 系统 DLL：

- `USER32.dll`
- `ADVAPI32.dll`
- `KERNEL32.dll`
- `GDI32.dll`
- `gdiplus.dll`

#### 文件

- `CapsLockOSD.cpp` - Win32 消息循环、Caps Lock 状态轮询、OSD 绘制、多语言文本、旧 Run 项清理。
- `app.ico` - 应用图标。
- `CapsLockOSD.rc` / `resource.h` / `CapsLockOSD.manifest` - Windows 资源和 DPI awareness manifest。
- `build.ps1` / `build.bat` / `CMakeLists.txt` - 构建入口。

架构、实现细节与维护约束见仓库根文档 [`DEVELOPMENT.md`](DEVELOPMENT.md)。

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

## PortableBridge

[`PortableBridge`](./PortableBridge) 是从原 Firefox PortableBridge 提取的独立 Windows 模块，支持 Firefox 和 Chrome，在没有有效默认浏览器时提供临时 HTTP(S) 协议入口。

- 启动器通过每用户命名管道报告浏览器类型、EXE 和配置目录；不依赖 Bridge 的部署位置
- Firefox 与 Chrome 可同时运行：最近启动的已报告主进程接管外部链接，退出后自动回退到仍在运行的上一会话
- Firefox 保留原有便携环境和维护；Chrome 显式使用 `--user-data-dir`，可指定 `--profile-directory`
- 只在原本不存在的机器级 HTTP(S) 根下维护自有协议树，不覆盖有效默认应用或第三方命令
- 保留旧 Firefox `announce-v2` 端点，新接入统一使用 `announce-v3`；随附 `announce.ps1` 客户端和启动示例

```powershell
cd PortableBridge
.\build.ps1
.\test.ps1
```

产物为 `bin/PortableBridge.exe`。常驻任务以当前用户、最高权限无参数运行；手动启动会请求 UAC，短命 `open` 入口不重复提升。源码、客户端和构建脚本可独立使用，不依赖 Dox 其他模块。架构和验证规则见 [开发文档](./DEVELOPMENT.md#314-portablebridge)。

PortableBridge 是 Windows 上的便携浏览器 HTTP(S) 桥接器，支持 **Firefox 和 Chrome**。它从原来的 `Firefox/PortableBridge` 提取而来，可以独立构建和部署，无需 Dox 的其他模块。

便携启动器先报告浏览器 EXE 和配置目录，然后启动浏览器。Bridge 在浏览器主进程存活期间，临时接通 Windows 标准 HTTP(S) 协议入口，供桌面程序、OAuth 登录、Shell 和 GitHub CLI 等打开外部链接。

**最近启动的浏览器接管外部链接；它退出后，自动回退到仍在运行的上一会话。** 例如先启动 Firefox，再启动 Chrome，链接进入 Chrome；Chrome 退出后恢复 Firefox；全部退出后撤销 Bridge 的协议入口。启动时间来自主进程的 WMI `CreationDate`，重复上报、打开新标签页和 URL 转交进程不会刷新优先级。只有上报且匹配成功的浏览器参与选择。

这是无默认浏览器环境下的会话回退：已有有效的 Windows 默认浏览器、第三方协议命令或机器级协议根时，Bridge 不覆盖它们。明确指定浏览器、绕过 Windows 协议关联的应用不经过 Bridge。

### 构建与安装

需要 64 位 Windows 和系统 .NET Framework 4.x，无额外 NuGet 依赖：

```powershell
cd PortableBridge
.\build.ps1
.\test.ps1

## 可选：输出到实际部署目录
.\build.ps1 -OutputPath '<部署目录>\PortableBridge.exe'
```

默认产物为 `bin\PortableBridge.exe`，源码仓库不提交 EXE。测试覆盖参数解析、会话存储、完整切换/故障恢复流程、真实命名管道及 WMI 进程匹配，不修改系统协议关联。

Bridge 可部署到与浏览器无关、当前用户可写的目录。无参数运行 EXE 即成为常驻监视器；未提升时会请求 UAC。登录任务应选择当前用户、仅在用户登录时运行、使用最高权限，并禁止重复实例。程序没有控制台、窗口或托盘图标。

管理员权限用于创建和清理 `HKLM\Software\Classes\http` 和 `https`。协议内部入口 `open <session-guid> <URL>` 不请求 UAC。构建内嵌 `asInvoker` 清单，只有无参数常驻入口主动提升。构建脚本不创建或修改计划任务。

### 启动器接入

启动器只连接稳定的每用户命名管道，不查找或启动 Bridge EXE。仓库提供 `announce.ps1` 作为独立客户端，也可按下方契约将它内嵌到现有启动器。上报失败应中止本次启动。

Firefox 示例（在现有便携启动器完成环境设置后调用）：

```powershell
$firefox = [IO.Path]::GetFullPath('.\App\firefox.exe')
$profile = [IO.Path]::GetFullPath('.\Data\profile')
& '<客户端脚本目录>\announce.ps1' -Browser firefox -Executable $firefox -Profile $profile
if (-not $?) { throw 'Firefox announcement failed.' }
& $firefox --profile $profile
```

Chrome 示例：

```powershell
$chrome = [IO.Path]::GetFullPath('.\App\chrome.exe')
$userData = [IO.Path]::GetFullPath('.\Data\User Data')
& '<客户端脚本目录>\announce.ps1' -Browser chrome -Executable $chrome -Profile $userData
if (-not $?) { throw 'Chrome announcement failed.' }
& $chrome "--user-data-dir=$userData"
```

EXE 和配置目录必须已经存在。Chrome 的 `-Profile` 是 **User Data 根目录**，不是其中的 `Default` 或 `Profile 1` 子目录。如需明确使用子配置，在上报和首次启动中同时指定：

```powershell
& '<客户端脚本目录>\announce.ps1' -Browser chrome -Executable $chrome -Profile $userData -ProfileDirectory 'Profile 1'
if (-not $?) { throw 'Chrome announcement failed.' }
& $chrome "--user-data-dir=$userData" '--profile-directory=Profile 1'
```

| 浏览器 | 主进程匹配 | URL 投递 | 便携维护 |
|---|---|---|---|
| Firefox | 精确 EXE、显式 `--profile`；排除内容进程、`--no-remote`、`-url` 辅助进程 | `firefox.exe --profile <目录> -url <URL>` | 保留原版路径迁移、Mozilla 环境、基线、Launcher 和退出清理 |
| Chrome | 精确 EXE、显式 `--user-data-dir`；排除 `--type` 子进程；如上报子配置则也匹配它 | `chrome.exe --user-data-dir=<目录> [--profile-directory=<名称>] <URL>` | 3.1 起增加 Chrome 注册表增量清理；不执行 Mozilla 清理，不迁移或删除用户数据 |

Chrome 的安装、更新、初次启动环境及跨电脑迁移由便携启动器负责。指定 User Data 不等于解决 Chrome 密码或 Cookie 的 Windows 加密绑定。Firefox 本体的便携环境仍由原启动器设置，Bridge 负责 URL 转交进程环境和已有维护逻辑。

一次允许一个 Firefox 便携会话，以及使用不同 User Data 根的 Chrome 会话；Firefox 的主机 Mozilla 基线不能被多个 Firefox 会话并发维护。同一个 Chrome User Data 根不能作为多个独立会话上报。Chrome 开启后台应用时，关闭最后一个窗口可能仍保留主进程；此时它仍参与接管，直到主进程真正退出。

### 命名管道契约

#### Chrome 注册表基线与退出清理（3.1）

启动器仍使用 v3 先上报再启动，无需新增参数。Bridge 根据 EXE 产品信息和 Windows 通道目录识别普通 Chrome、Beta、Dev、Canary (`Chrome SxS`)、Chrome for Testing 及 Chromium。只操作当前用户注册表的 32/64 位视图：`Software\Google\Chrome`、`Chrome Beta`、`Chrome Dev`、`Chrome SxS`、`Chrome for Testing`，以及 `Software\Chromium`。

范围仅限这些产品根下的 `BLBeacon`、`PreferenceMACs`、`StabilityMetrics`、`ThirdParty` 子树和根值 `UsageStatsInSample`。上报前读取键名/值名基线，原子保存到 `runtime-session.json` 的可选 `ChromeRegistry` 字段；不记录注册表值内容。退出时仅删除基线中不存在的白名单值、空的新建子键，以及基线中不存在且现已为空的产品/Google 父键。原有值即使被浏览器修改也保留；原有空键保留。

**不会全局搜索或整棵删除 Chrome 节点**。`NativeMessagingHosts`（包括运行中由其他软件新增的项）、Google Update、HKLM、默认浏览器关联、非白名单项、Profile 文件和既有历史残留不在这次清理范围内。已经存在于基线里的旧 Chrome/Chrome for Testing 项不会补删。

同一产品根的重叠 Profile 共用第一份基线；前一个会话退出时不清理共享记录，最后一个会话负责收尾。实际清理还会等待全部 Chrome 辅助进程退出；其他通道仍在运行时可能延后。拒绝访问等清理错误会保留 cleaning 状态并重试，不因失败丢掉基线。

发现未上报的 Chrome、无法读取的 Chrome 进程信息或 WMI 失败时，当前基线会被永久标记为 Unsafe，退出时跳过注册表删除。Monitor 重启同样标记恢复的基线，因为停机期间的写入无法归属。旧 schema 2 会话没有基线则直接保留注册表，不倒推所有权。这里是保守的退出清理，不阻止运行时写注册表，也不是系统零痕迹方案；进程轮询无法保证发现所有瞬时外部写入。

升级到 3.1：先关闭已上报浏览器，等待旧 Monitor 收尾，再停止旧 Monitor、替换部署 EXE 并重新启动。构建只生成 `bin\PortableBridge.exe`，不会替换正在运行的部署副本或修改计划任务。v2/v3 管道与 schema 2 保持兼容，但不要在有活动基线时降级回 3.0。

`test.ps1` 同时运行隔离注册表测试：所有测试键均位于随机 `HKCU\Software\PortableBridge.Tests\<GUID>`，测试结束后清除，不修改真实 Google/Chromium 键或系统协议关联。

#### 上报格式

| 项目 | 约定 |
|---|---|
| 管道名 | `PortableBridge-Control-<identity>` |
| identity | 当前用户 SID 转大写，取 UTF-8 SHA-256 的前 12 字节，编码为 24 位小写十六进制 |
| ACL | 仅当前用户 SID 的 `FullControl` |
| 编码 | .NET `BinaryWriter` / `BinaryReader`，UTF-8，字节流模式 |
| 请求 | 五个字符串：`announce-v3`、`firefox` 或 `chrome`、EXE 绝对路径、配置根绝对路径、Chrome 子配置名（不使用时为空字符串） |
| 响应 | Int32：0 接受；73 会话冲突或容量已满；75 相同/冲突会话正在退出或清理；其他非零值或断开连接表示失败 |

上报后最多等待 90 秒匹配主进程；超时清理该会话的准备工作。已经匹配并仍在运行的待接管会话不受此超时影响。相同 pending 或运行中会话重复上报幂等成功；退出中的同一会话返回 75。`announce.ps1` 对 75 每 500 ms 重试，整体等待约 60 秒；连接等待上限 5 秒。

旧端点 `FirefoxPortableBridge-Control-<identity>` 继续接受三个字符串 `announce-v2`、Firefox EXE、Profile，自动视为 Firefox 会话。原 Firefox 启动器可以继续使用；新客户端统一使用 v3。两个端点由同一个 Monitor 管理，不会产生两套协议入口。

### 生命周期与系统边界

- 上报先原子保存状态，再执行浏览器专有准备。开始匹配后按真实主进程启动时间选择目标。
- 切换先使原目标不可投递、清除其自有协议树，再注册新目标。仍在运行的 Firefox 被切到后台时，不执行便携退出清理。
- 只有两个机器级协议根原本均不存在时才取得所有权，不覆盖既有空根、第三方值、子键或命令。每次注册/自愈都用 `AssocQueryStringW` 检查 Windows 实际解析的命令。
- 有效 `UserChoice`/Hash、`RegisteredApplications`、Capabilities、`StartMenuInternet` 不被修改。仅可清除没有 Hash 且已没有有效 open 命令的 `MSEdge*` 卸载残留；带 Hash 的选择保持原样。
- 切换或退出清理失败时保留状态并重试，无法证明所有权的树不覆盖、不删除。WMI 失败视为未知，不据此判定退出或切换浏览器。
- 每次 URL 投递都重新校验会话 GUID、active 状态、EXE、配置和主进程身份；已被替换的会话 GUID 不会投递。只接受单个绝对 HTTP(S) URL，拒绝控制字符及超过 32768 字符的输入，不按调用方名称筛选。
- 全部会话退出后，删除状态和 Bridge 创建的机器级协议根。崩溃重启后恢复仍存活的会话，并回收已退出会话；状态丢失时仅回收 GUID、当前 EXE 命令和树形都严格匹配的孤立协议树。
- 不创建 `GH_BROWSER`、`OpenUrl.ps1` 等应用旁路。旧版本 `gh-open` 环境残留仅按原来的严格所有权规则清理。

运行文件位于 EXE 同目录：

```text
PortableBridge.exe
runtime-session.json   # schema 2，多会话；全部收尾后删除
runtime-error.log      # 最近错误；成功收尾后删除
runtime-open.log       # 最近一次 URL 投递摘要
```

URL 日志只记录时间、调用方、协议/主机、通道和结果，不记录路径、查询参数或片段。Firefox 的 `portable-state.json` 是迁移元数据，按原版保留。

### 从 Firefox PortableBridge 升级

1. 退出便携 Firefox，等待旧 Bridge 完成清理，确认旧部署目录没有 `runtime-session.json`。
2. 停止旧 Monitor，构建和部署 `PortableBridge.exe`，将登录任务入口改为新 EXE。
3. 启动新 Monitor；旧 Firefox 的 v2 上报仍可用，Chrome 使用 v3。

新版本保留旧实例互斥体名称，防止两个版本并行接管；协议注册表的 `FirefoxPortableSessionId` 所有权值也暂时保留，以维持原有严格清理规则。它们是兼容标识，不限制浏览器类型。

不支持带活动会话直接升级 schema 1 状态文件；新版本会拒绝读取并保留文件，需先用旧版完成收尾。移动 EXE 也应先结束全部会话并停止旧进程。不要在活动期间仅改 EXE 名称或路径。

维护者架构和完整验证清单位于仓库根 [DEVELOPMENT.md](DEVELOPMENT.md#314-portablebridge)。

## Zen（中文补全与默认应用重复项）

[`Firefox/Zen`](#zen中文补全与默认应用重复项) 为 Windows 版 Zen **1.23.2b / Gecko 157.0.1**（Build ID `20261009073723`）补齐 329 个简体中文条目，并将快捷键统一显示为 `F5`、`Shift+F5`、`Home`、`End` 等文本形式。同目录的 `fix_zen_duplicate.py` 删除让「设置 > 默认应用」重复显示 Zen 的注册表项。

需要 Python 3.11+，安装目录和用户配置自动识别。在仓库根目录运行：

```powershell
python .\Firefox\Zen\patch_zen.py detect
# 完全退出 Zen 后安装；Program Files 安装版通常需要管理员终端
python .\Firefox\Zen\patch_zen.py install
python .\Firefox\Zen\fix_zen_duplicate.py detect
```

首次安装会自动生成补丁并备份原文件；`restore` 可还原，`--profile` 可指定非默认配置。源文件可复制到其他 Windows 电脑使用，不需要携带本机配置或浏览器资源包。补丁严格校验版本与资源包哈希，Zen 升级后需要重新适配。新版新增英文消息时，`build` 会按本机 Codex 配置自动翻译、写回 `translations.ftl` 并停止等待复核后重跑；无法联网时用 `--no-translate` 只列缺项。

维护说明见 [DEVELOPMENT.md](./DEVELOPMENT.md#316-zen中文补全与默认应用重复项)。

Windows 版 Zen Browser 的两个本机脚本。适用版本：**Zen 1.23.2b / Gecko 157.0.1**，Build ID `20261009073723`。
安装目录和用户配置目录均自动识别，不需要修改脚本中的用户名或随机配置文件名。

| 脚本 | 用途 |
|---|---|
| [`patch_zen.py`](#简体中文补全) | 追加简体中文条目、修正快捷键显示，支持备份还原 |
| [`fix_zen_duplicate.py`](#默认应用重复项) | 删除「设置 > 默认应用」里重复的 Zen 注册项 |

实现结构、资源基线、判定规则、重新构建及测试方法统一见仓库根 [DEVELOPMENT.md](DEVELOPMENT.md#316-zen中文补全与默认应用重复项)。

### 简体中文补全

补丁以本机安装包中的英文资源和已有简体中文资源为基准，只追加缺失翻译。
已有简体中文翻译保留。沿用现有界面的“工作区”“活动文件夹”等术语。

#### 补全内容

- 新增 329 个简体中文条目：328 个原来缺失的条目，以及新增的快捷键“未设置”提示。
- 补齐资料库（Library）：历史记录、下载、Boost、媒体、工作区五个分区及其筛选、排序、清除历史记录和右键菜单文案。
- 补齐侧边栏跨设备同步及“包含未固定的标签页”的标签和说明。
- 补齐活动文件夹、RSS / GitHub 筛选、分享、欢迎页和同步删除工作区提示。
- 补齐命令面板动作、同步日志、IP 保护站点规则、新标签页引导和错误页搜索引导。
- 补齐安装包中其余 Fluent 中文缺项，包括 PDF 查看器、网络诊断、表单自动填写和开发者工具。
- 修复快捷键设置页显示 `Browser:Reload`、`Browser:ReloadSkipCache`、`Browser:Stop` 的问题，分别引用已有中文标签。
- 将快捷键设置页 3 处写死的 `Not set` 显示改为 Fluent 文案“未设置”，并提供英文回退。
- 功能键显示为大写 `F1`–`F24`，例如 `F5`、`Ctrl+F5`；修饰键和方向键使用文本，例如 `Shift+F5`、`Ctrl+Shift+M`、`Alt+Left`，不使用按键图标。
- 命名按键统一显示为 `Home`、`End`、`Tab`、`Delete`、`Backspace`、`Insert`、`PageUp`、`PageDown` 等规范形式，兼容已有绑定和编辑时的预览。

快捷键 ID、实际动作、键位和保存机制均保持原样。翻译不会启用相关功能，也不会提交同步、分享等操作。

#### 安装与还原

`patch_zen.py` 是补全入口，`translations.ftl` 保存中文补全文案。

查看中文使用指南（命令、示例、权限和配置选择）：

```powershell
python .\patch_zen.py --help
python .\patch_zen.py help
```

直接运行 `python .\patch_zen.py` 也只显示帮助，不执行安装；`install --help` 等写法同样显示指南。帮助无需管理员权限，也不查找浏览器或写入文件。

在另一台电脑上使用时，复制本目录的源文件；如果已有本地打包的 `dist/Zen-zh-CN-1.23.2b.zip`，也可解压使用。仓库不包含生成的 ZIP。
不需要复制 `build/`、`backups/` 或本机的浏览器配置。目标电脑需要 Python 3.11+，并安装相同版本、相同构建的 Zen；如果版本或资源包不匹配，脚本会停止并说明原因。

先在补丁目录运行只读检测，可以在 Zen 正在运行时执行：

```powershell
python .\patch_zen.py detect
```

想在改动安装目录之前先校验翻译，可在 Zen 运行时先构建再校验：

```powershell
python .\patch_zen.py build
python .\patch_zen.py validate
```

如果新版 Zen 新增了英文消息而 `translations.ftl` 还没有对应的中文，`build` 会先用本机 Codex 配置（与 `HeliumLanguagePatcher` 共用同一套配置读取逻辑，默认 `%CODEX_HOME%\config.toml` 或 `~/.codex/config.toml`，密钥只从环境变量或请求头读取）自动翻译，逐条校验结构后写回 `translations.ftl`，然后以退出码 1 结束并提示复核；本次不生成资源包，也不改动安装目录。复核后重新运行 `build` 才会产出补丁，因此补丁哈希仍只由已复核的翻译决定。

无法联网或没有 API 配置时加 `--no-translate`：只列出缺少的条目并停止，不联网也不写文件；手工补全后重建。也可用 `--codex-config`、`--codex-profile` 指定其他配置文件和 profile。自动校验只比较消息 ID、值/属性结构、变量、term 和 `data-l10n-name` 是否与英文一致，不评判译文质量，也不能替代人工审阅。

`validate` 需要 `fluent.syntax`（`python -m pip install fluent.syntax`），省略 `--original-dir` 时自动以 `backups/` 中的原版备份为参照。它只写 `build/` 和 `validation.json`，不碰安装目录。

确认输出的安装和配置目录后，关闭所有 Zen 窗口及后台进程，在有安装目录写入权限的终端中运行（安装在 Program Files 时通常需要管理员终端）：

```powershell
python .\patch_zen.py install
python .\patch_zen.py verify
```

首次安装时会自动用目标电脑的原版资源生成 `build/`，然后验证两个资源包、备份原件并替换自动识别的安装目录下的 `omni.ja` 和 `browser/omni.ja`。

本地翻译对该 Zen 安装下的所有配置生效；脚本只清除所选配置的启动缓存。如果切换到另一个已有配置后仍见旧显示，可通过 `--profile` 选择该配置再次运行安装命令，以清理其启动缓存。

安装完成后清除指定配置的 `startupCache`，下次启动会自动重建。
不会修改 `prefs.js`、`user.js`、`firefox.cfg`、扩展、书签、登录状态或标签页数据。
`Program Files` 的写入权限由 Windows 决定；若提示访问被拒绝，请从有写入权限的终端执行上述命令。

`build/deployment.json` 记录本机最近一次安装结果及识别到的实际路径。

还原时，同样先退出 Zen：

```powershell
python .\patch_zen.py restore
```

若已经安装本补丁，再次执行 `install` 会跳过已经匹配的文件。两个资源包的原版备份均按 SHA-256 核验，替换过程中出错会回滚已替换的资源包。

#### 自动识别规则

- 安装目录优先取正在运行的 `zen.exe` 路径；关闭后检查注册表、配置文件中的 `LastPlatformDir` 和常见安装位置。
- 配置目录从当前 Windows 用户的 `%APPDATA%\zen\profiles.ini` 读取，支持相对路径和绝对路径，并读取 `installs.ini` 中的安装默认配置。
- 配置选择依次考虑：正在使用的配置、与该安装对应的默认配置、配置列表中的默认项、唯一可用配置。检查真实的 Windows 文件占用锁，残留的 `parent.lock` 不会被当成运行中。
- 浏览器关闭后无法保证识别出此前临时通过 `-P` 或 `-profile` 打开的非默认配置，此时会选择默认配置。若需指定非默认配置，请使用下面的参数。
- 有多个同优先级候选时列出路径并停止，不根据文件修改时间猜测。首次安装 Zen 后请至少启动一次以创建配置。
- 普通配置的缓存路径从 `%LOCALAPPDATA%\zen` 对应位置推导；外部绝对路径配置使用其自身目录。删除前验证 `startupCache` 的确切路径并拒绝指向其他目录的链接。

手动指定安装目录、配置名称、配置目录名或完整路径：

```powershell
python .\patch_zen.py detect --install-dir 'D:\Apps\Zen Browser'
python .\patch_zen.py install --profile 'Default (release)'
python .\patch_zen.py install --profile 'D:\BrowserData\ZenProfile'
```

便携版或自定义数据根目录可显式指定含有 `profiles.ini` 的目录。默认将该目录同时作为本地缓存根目录，缓存分离存储时再指定 `--local-root`：

```powershell
python .\patch_zen.py install --install-dir 'D:\Apps\Zen' --profiles-root 'D:\ZenData' --local-root 'D:\ZenCache'
```

请使用自己的 Windows 账户执行，避免通过“以其他用户身份运行”选中其他账户的配置。`detect` 不需要管理员权限。

### 默认应用重复项

「设置 > 应用 > 默认应用」每行对应注册表里一条 `RegisteredApplications` 记录，不是一个程序一行。Zen 安装程序把同一个客户端键同时写进机器级和用户级两个位置，于是同一个 Zen 显示两行：

```text
HKLM\Software\RegisteredApplications   Firefox-<hash> -> Software\Clients\StartMenuInternet\Firefox-<hash>\Capabilities
HKCU\Software\RegisteredApplications   Firefox-<hash> -> 同一目标
                        |
                        +-- 设置 > 默认应用： Zen
                                             Zen
```

只读检查（Zen 运行中也可以执行）：

```powershell
python .\fix_zen_duplicate.py detect
```

确认输出后清理：

```powershell
python .\fix_zen_duplicate.py fix
```

- 只处理可执行文件名为 `zen.exe` 的注册项，Firefox 等其他浏览器不受影响。
- 两处指向同一个 `zen.exe` 时删除用户级（HKCU）那条并保留机器级，按用户和按机器两种安装都能保留可用入口。
- 文件已不存在而所在磁盘仍在的注册项按残留删除；磁盘不在的保留，避免误删暂时离线的移动盘安装。
- 两份 `zen.exe` 都真实存在（两份 Zen 安装）时不删除，只在输出的 `unresolved` 中列出，由人工判断。
- 删除 HKCU 项不需要管理员权限；涉及 HKLM 项时需要管理员终端，否则以退出码 1 结束并列出失败项。
- 清理后设置页面立即刷新，不需要重启。Zen 再次写入用户级注册时重复项会回来，重跑一次即可。

系统自带的 App Installer 和 Windows 小组件也可能各显示两行，那是同一个 MSIX 包声明了两组 capability（`.msix` 与 `ms-appinstaller:`、`ms-widgetboard:` 与 `ms-widgets:`），属于系统行为，本脚本不处理。

### 文件与备份

`patch_zen.py` 安装后，`build/` 保存生成的补丁和安装记录，`backups/20261009073723/` 保存原版资源包。请保留备份以便还原；这些文件仅在本地生成，不随仓库提交。安装到另一台电脑时会生成该电脑自己的补丁和备份。

补丁不保存固定的原版哈希基线：每次 `build` 都从输入目录的 `application.ini` 读取版本信息，现算两个资源包的 SHA-256 并写进 `build/manifest.json`。要针对新版本重建补丁，直接指向新的原版目录即可：

```powershell
python .\patch_zen.py build --install-dir 'D:\Apps\Zen Browser'
python .\patch_zen.py build --install-dir '.\backups\20261009073723'
```

`backups/` 不保留 `application.ini` 时，会改用已识别安装目录的信息。输入目录已包含本补丁时会拒绝构建。`keyToDisplayString` 是补丁中唯一整体改写、不检查原文的函数，每次构建都会把原实现另存到 `build/replaced/`，上游改动时输出会提示比对。

新版新增英文条目时，`build` 会先自动翻译、写回并停止（见上文），确认后才产出资源包；`--no-translate` 只列缺项。

`fix_zen_duplicate.py` 不写文件，只删除注册表项；删除前可用 `detect` 查看将删除的内容，HKCU 部分可用 `reg export` 自行备份。

### 浏览器更新

Zen 更新可能覆盖这些本地资源。补丁不依赖固定的原版哈希，所以更新后不需要任何手工准备：直接运行 `install` 即可，检测到未知资源会按新版原包重新构建补丁，再用新原版覆盖备份。新版若新增英文消息，`build` 会先自动翻译、写回 `translations.ftl` 并停止，复核后重跑 `install`（或 `build`）才会生效；没有 API 配置时用 `--no-translate` 列缺项后手工补全。万一新版的补丁目标结构变了，构建会明确报错而不是静默改错。

### 来源与许可

原始资源来自本机 Zen 安装包，对应 `zen-browser/desktop` 提交 `185e856f68a451dc71988e988bc080c56452ea66`，以及其基于的 Mozilla 资源。
对原有源文件的修改遵循其 Mozilla Public License 2.0；生成的 JavaScript 保留原许可证头。原文与本地翻译之间的消息 ID 对应关系可在 `translations.ftl`、生成资源和校验清单中核对。

## Firefox 扩展

### Auto Sort Bookmarks

[`Firefox/AutoSortBookmarks`](./Firefox/AutoSortBookmarks) 是适用于 Firefox 142 及更高版本的 Manifest V3 扩展，递归整理 `Bookmarks Menu` 和 `Other Bookmarks` 两个书签根目录。

- 以分隔线划分互不影响的区段，分隔线位置保持不变
- 每个区段内文件夹置顶并按标题排序
- URL 书签随后按标题、URL 排序，支持自然数字顺序
- 文件夹内部递归使用相同规则
- 在安装、Firefox 启动及书签创建、修改、移动、删除后自动安排排序，并合并连续变化
- 仅在普通 Firefox 浏览器窗口获得焦点时执行，避免用户正在使用 Library 窗口时重排

临时安装：打开 `about:debugging#/runtime/this-firefox`，点击“临时载入附加组件”，选择该目录下的 `manifest.json`。

运行测试：

```powershell
node --test Firefox/AutoSortBookmarks/tests/sorter.test.js
```

适用于 Firefox 142 及更高版本的 Manifest V3 扩展。它会递归处理以下两个书签根目录：

- Bookmarks Menu（`menu________`）
- Other Bookmarks（`unfiled_____`）

每个文件夹会先按分隔线划分为互不影响的区段，每个区段按以下规则排序：

1. 文件夹全部置顶，并按 Title A-Z 排序。
2. URL 书签排在文件夹之后，先按 Title、再按 URL（Title 相同时）进行 A-Z 排序。

比较区分大小写和重音符号，大小写相邻时大写优先，并使用自然数字顺序（例如 `Page 2` 排在 `Page 10` 前）。分隔线位置保持不变，文件夹不会跨越分隔线；文件夹内部也会递归应用同一套分段规则。

#### 自动触发

扩展会在安装、Firefox 启动，以及书签创建、修改、移动或删除后自动安排排序。连续变化（包括导入过程中产生的大量创建事件）会合并为一次操作；多条书签使用顺序 `await bookmarks.move()`，避免异步移动互相打乱索引。

只有普通 Firefox 浏览器窗口当前获得焦点时才会执行，因此用户正在前台使用独立 Library 窗口时不会重排；待回到普通浏览器窗口后再处理挂起的排序。

#### 安装测试

1. 在 Firefox 打开 `about:debugging#/runtime/this-firefox`。
2. 点击“临时载入附加组件”。
3. 选择本目录中的 `manifest.json`。

正式分发时，发布包需包含 `manifest.json`、`background.js`、`sorter.js`、`_locales/`、`icons/icon-{32,48,64,96,128}.png` 和 `THIRD_PARTY_NOTICES.md`，然后提交 Mozilla Add-ons 签名。已上架 AMO 的扩展还必须在 Developer Hub 单独上传同一张 128px 图标；Firefox 的扩展管理器会从 AMO API 读取该图标元数据。

#### 图标

扩展图标使用 Lucide 的 [Arrow Down A-Z](https://lucide.dev/icons/arrow-down-a-z) 图形，并增加固定的蓝色底和深浅双边界，确保在 Firefox 的亮色、暗色主题下均清晰可见。Lucide 采用允许商业使用的 ISC License，完整版权与许可声明见 `THIRD_PARTY_NOTICES.md`。

发布图标时必须先更新 AMO 的独立 128px 图标并等待其 32/64/128 缩放资源生成，再提交新版本。发布后以 AMO 公共 API 和 Firefox 的扩展面板、`about:addons` 列表及详情页为准；仅在 AMO 网页看到图标不算验证通过。完整发布检查清单见仓库根目录 `DEVELOPMENT.md` 的 “Firefox Auto Sort Bookmarks” 小节。

#### Firefox API 限制

标准 WebExtensions `windows` API 只枚举 `navigator:browser` 窗口，不提供 `Places:Organizer`（Library）窗口的打开/关闭生命周期。因此扩展可以可靠避开**当前获得焦点**的 Library 窗口，但无法区分“Library 已关闭”和“Library 仍打开但退到普通浏览器窗口之后”。要严格识别后一种情况，需要无法在正式版普通扩展中使用的特权 Experiment API 或额外的本机程序。

#### 测试

```powershell
node --test tests/sorter.test.js
```

## Windhawk

### CJKSpacer

用于 `explorer.exe` 托管的右键菜单和鼠标工具提示（Tooltip）UI 文本的
Windhawk 模组。在 CJK 字符与字母或数字直接相邻时插入一个半角空格；已有
空格、标点、经典菜单助记键标记和快捷键说明保持不变。

Windows 11 的主资源管理器和桌面右键菜单属于新版 XAML 界面，默认关闭的
`modernUiText` 不会处理它们；如需处理，请手动启用该选项。经典路径仍会处理
“显示更多选项”打开的传统 Win32 菜单。现代路径使用独占的 XAML Diagnostics
连接名。我们仍保留这条路径，因为它覆盖 Windows 11 的主要右键菜单；它属于
默认关闭的尽力而为实现，可能与其他同类定制工具冲突。Taskbar Styler 或
File Explorer Styler 等工具可能已经使用或阻止这些连接。也就是说，首次安装后如果不手动启用
`modernUiText`，新版 Windows 11 菜单不会被处理。

```text
使用VS Code打开     → 使用 VS Code 打开
压缩为ZIP文件       → 压缩为 ZIP 文件
使用 VS Code 打开   → 使用 VS Code 打开
打开(&O)            → 打开(&O)
```

#### 效果截图

启用前：

![启用 CJK Spacer 前](Windhawk/CJKSpacer/Before.png)

启用后：

![启用 CJK Spacer 后](Windhawk/CJKSpacer/After.png)

#### 安装

1. 安装并启动 Windhawk。
2. 点击界面右下角的“创建新模组”（Create a new mod）。
3. 用 [`CJKSpacer.wh.cpp`](Windhawk/CJKSpacer/CJKSpacer.wh.cpp) 的完整内容替换编辑器中的模板。
4. 点击“编译模组”（Compile Mod）。
5. 编译成功后退出编辑模式并启用 `CJK Spacer`。
6. 如果菜单没有立即变化，在任务管理器中重新启动“Windows 资源管理器”，
   或者注销后重新登录。

建议先保持稳定路径的默认设置：

- `classicMenus = true`
- `classicTooltips = true`
- `modernUiText = false`
- `characterMode = unicode`

如果需要处理 Windows 11 新版 XAML 右键菜单和 Tooltip，再手动启用
`modernUiText`。它依赖 XAML Diagnostics，因此仍默认关闭，以避免和其他
同样使用 XAML Diagnostics 的定制工具争用同一连接名，例如
Windows 11 Taskbar Styler 和 Windows 11 File Explorer Styler。Taskbar Styler
使用提醒模式时，拦截连接尝试会显示 XAML Diagnostics 竞争确认对话框；如果它
通过返回成功来阻止连接，本模组会停止本次扫描并将对应 flavor 标记为 blocked。

#### 实现范围

- 经典菜单：通过 `CreatePopupMenu` 创建的菜单会在构建期间处理，并在进入
  `TrackPopupMenu` / `TrackPopupMenuEx` 时与本次 popup 关联，菜单关闭后恢复
  原文；启用模组前已存在的 popup 句柄也会在显示前扫描。这包括由
  `explorer.exe` 托管的文件资源管理器、
  桌面、任务栏和跳转列表右键菜单；第三方通知区域图标进程自己显示的右键
  菜单不在注入范围内。由 `CreatePopupMenu` 创建、但由 user32 自己的菜单循环
  显示而不经过 `TrackPopupMenu*` 的菜单栏下拉菜单，也可能在构建期被处理。
  这类待关联记录会在菜单销毁、模组卸载，或后续 popup 活动发现其已过期时
  尝试恢复；未通过这些 popup API 构建的窗口系统菜单不在处理范围内。
- 经典 Tooltip：跟踪为 `TOOLTIP` 类打开的 Windows 主题句柄，通过
  `GetThemeTextExtent` 处理文字测量，并通过 `DrawThemeText` /
  `DrawThemeTextEx` 处理绘制。这覆盖网易 UU 远程等第三方通知区域图标使用
  的旧式 Tooltip。共享主题句柄会为每个打开它的 `tooltips_class32` 窗口保留
  引用；绘制路径先通过已跟踪的主题句柄快速过滤，如果 HDC 能映射到窗口，
  还必须由 `WindowFromDC` 确认它是 `tooltips_class32` 窗口，无法映射窗口的
  缓冲 DC 则允许通过，因而复用旧主题句柄的其他控件不会被误改。此路径仅覆盖通过 `uxtheme`
  绘制的主题化 Tooltip；在已运行的 Explorer 中启用模组时，也会发现已有
  Tooltip 控件的主题句柄。经典/基本主题下直接使用 `DrawTextW` 绘制的
  Tooltip 不在处理范围内。
- Windows 11 XAML 界面：通过 XAML Diagnostics 接收视觉树变化，同时支持
  Windows.UI.Xaml 和 Microsoft.UI.Xaml。现代路径修改
  `MenuFlyoutItem.Text`、`MenuFlyoutSubItem.Text` 或字符串形式的
  `ToolTip.Content`，但仅限属性本身保存的普通本地字符串；Binding、Style
  和其他表达式会被跳过，因此不会覆盖数据绑定或呈现层 `TextBlock` 的模板
  绑定。普通 XAML 文本不会被处理；任务栏缩略图内容通常不是普通本地字符串，
  因此也不会被修改。
- 现代路径只在 Explorer 创建受支持的 XAML Host 窗口后尝试连接。模组 Hook
  `CreateWindowExW`、`CreateWindowInBand` 和 `CreateWindowInBandEx`，但只对
  `XamlExplorerHostIslandWindow`、`XamlExplorerHostIslandWindow_WASDK`、
  `Shell_InputSwitchTopLevelWindow`、`CabinetWClass`，以及父窗口为
  `Shell_TrayWnd` 的
  `Windows.UI.Composition.DesktopWindowContentBridge` 作出响应。
  `XamlExplorerHostIslandWindow`、输入切换窗口与任务栏 Composition Bridge 映射到
  Windows.UI.Xaml，`CabinetWClass` 与 WASDK Host 映射到 Microsoft.UI.Xaml。
  模组初始化后的进程内窗口扫描会补充发现已经存在的顶层或子 Host 窗口，并用
  进程 ID 排除其他程序的窗口；两个 flavor 都已经排队或无需继续尝试后，扫描会
  提前停止。
- 现代路径不猜测 XAML 源属于哪个 popup。XAML Diagnostics 报告受支持的源
  元素进入视觉树时立即处理，元素离开视觉树时恢复；禁用或更新模组时也会
  恢复仍在跟踪的值。这避免了缓存、隐藏或复用的 popup 把源错误归给随后显示
  的菜单或 Tooltip。
- XAML 元素状态按 UI 线程分别保存。禁用或更新模组时，恢复和释放操作会同步
  派发到各元素所属线程；无法到达的线程不会从错误线程执行属性恢复，其中仅含
  弱引用的状态会随所属线程退出正常释放。线程登记使用线程创建时间识别 ID
  复用，并在显式登记和卸载快照时清理死线程，不在线程局部对象析构期间获取
  全局互斥锁。
- 现代路径会等待 Explorer 中出现受支持的 XAML 界面后再尝试连接。连接暂时
  不可用时会等下一个宿主窗口出现再重试；框架模块加载只会让后台工作线程重新
  扫描已有宿主窗口，不会在加载调用栈中直接探测连接名。重复发生实际连接错误
  或连续多次空扫描后，本会话内不再探测该 flavor，直到已有连接真正断开。其他
  Diagnostics 工具占用或阻止连接时不会自动重试。已有连接在其 XAML Host 消失
  后可以由后续界面活动恢复。
- 经典菜单和 Tooltip 的必要 Hook 会作为完整组注册，任一测量、绘制或生命周期
  Hook 失败时模组初始化会直接失败。现代路径的 `CreateWindowInBand*` 补充 Hook
  按尽力而为方式安装；现代核心 Hook 或工作线程不可用时，只关闭现代路径，已经
  启用的经典菜单和 Tooltip 仍会继续工作。
- 只注入 `explorer.exe`，不会修改系统文件、注册表或文件名。现代路径临时
  修改目标 XAML 源属性并在源离开视觉树或模组卸载时恢复；经典路径会修改
  `HMENU` 保存的文字，因此辅助技术读取到的经典菜单文本也会包含新增空格。
  文件名本身不会改变，但它出现在经典菜单中时，显示文字也可能被加入空格。
- “开始”、搜索以及部分飞出面板由 `StartMenuExperienceHost.exe`、
  `SearchHost.exe` 或 `ShellExperienceHost.exe` 托管，不属于本模组的
  `explorer.exe` 注入范围。

#### 已知限制

- Windows 没有公开的全局菜单文字过滤 API。新版弹出界面实现可能随 Windows
  更新而改变；如果不再使用受支持的 XAML 源控件类型，可能漏掉部分文字。
- XAML Diagnostics 的每个 XAML 连接只能有一个消费者。UWPSpy、其他
  Diagnostics 型 Windhawk 模组（包括 Windows 11 Taskbar Styler 和
  Windows 11 File Explorer Styler）或调试工具已占用连接时，现代路径可能
  无法初始化；经典菜单和 Tooltip 路径不受影响。
- 现代路径只处理带 `Text` 属性的标准 XAML 菜单项，以及内容可解包为字符串
  且属性值是普通本地字符串的 Tooltip。由 Binding、Style 或模板提供的值，
  以及自定义绘制、RichTextBlock、图片或任意自定义内容不在处理范围内。
- 经典菜单在显示前改写的字符串会被记录，并在 popup 关闭时立即尽量恢复；
  如果其他组件已再次修改同一菜单项，则保留其新值。卸载模组时还会清理尚未
  完成的记录。未进入 `TrackPopupMenu*` 的构建期记录会定期按年龄恢复并清理，
  且待关联记录设有硬上限，避免长期存活的菜单让状态无限增长。popup 打开期间，其他通过文字匹配菜单项的模组（例如 Remove
  Context Menu Items）也会读到加入空格后的字符串，可能需要相应调整其匹配规则。
  若多个菜单项的改写后文字完全
  相同，恢复时按文字查找可能命中第一个匹配项；转换本身是幂等的，不会叠加
  空格。
- 本模组与 Text Replace 都会处理经典菜单 API，但 Text Replace 主要做字面量
  替换，不能表达 CJK/非 CJK 边界规则；两者同时启用时仍可能按 Hook 顺序互相
  观察到对方的临时菜单文字。
- 启用 `modernUiText` 后如果遇到现代 UI 兼容问题，请重新关闭；经典菜单和
  Tooltip 路径仍可独立使用。
- 如果旧式 Tooltip 出现尺寸或绘制问题，可以单独关闭 `classicTooltips`。
- 如果在 popup 已显示后动态修改菜单文字，系统不一定会重新测量菜单；新增空格
  可能导致该菜单项在极少数路径下出现截断。
- Tooltip 的测量和绘制必须使用兼容的 DC 目标才能保持尺寸一致；若某个控件在
  不同 DC 上完成测量和绘制，可能需要关闭 `classicTooltips`。
- 修改功能开关后，Windhawk 会重新加载模组，只安装仍启用功能所需的 Hook。
- 模组默认把所有 Unicode 字母和数字视为非 CJK“单词字符”。如果只希望处理
  `A-Z`、`a-z` 和 `0-9`，将 `characterMode` 改为 `ascii`。
- 全角拉丁字母和数字已有表意文字宽度，在 Unicode 模式下也不会额外插入空格。
- 平假名、全角片假名和半角片假名都按 CJK 字符处理，用于边界检测。

#### 排查

如果某个菜单项没有变化：

1. 在模组的“高级”（Advanced）页面启用 Windhawk 调试日志。
2. 打开“显示日志输出”，再复现一次问题。
3. 查看是否出现 `Connected to ... XAML diagnostics` 和
   `Applied CJK spacing (modern XAML menu source/tooltip source)`；经典
   Tooltip 会显示
   `Tracking classic Win32 tooltip theme` 和 `classic tooltip/...`。

完成排查后关闭 Windhawk 调试日志，避免产生不必要的输出。

仓库还保留了 [`Windhawk/windhawk-mods`](./Windhawk/windhawk-mods) 子模块，它是独立的 Windhawk mods 集合，使用方式以子模块内文档为准。

## CSS

- [`font-face.css`](./CSS/font-face.css) — 跨平台中文字体适配，详见上方“中文字体映射”
- [`vscode.css`](./CSS/vscode.css) — 为 Visual Studio Code 的状态栏和最近项目区域指定中文字体链

## Userscript

将脚本安装到 Tampermonkey 或 Greasemonkey 后按目标网站使用：

- [`中文字体优化.user.js`](./Userscript/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.user.js) — 全站中文字体优化，与 `CSS/font-face.css` 共用映射规则
- [`EmuParadise Download Workaround.user.js`](./Userscript/EmuParadise%20Download%20Workaround.user.js) — 在 EmuParadise 页面补充可用下载链接，依赖脚本元数据中的 jQuery
- [`Re-add Download Button Vimm's Lair.user.js`](./Userscript/Re-add%20Download%20Button%20Vimm's%20Lair.user.js) — 在 Vimm's Lair 下载按钮被移除时恢复提交按钮
- [`VGMdb Tracklist Copy Button.user.js`](./Userscript/VGMdb%20Tracklist%20Copy%20Button.user.js) — 在 VGMdb 专辑页曲目列表的序号与标题之间插入复制按钮，点击复制该曲名；多语言 tracklist 的每个语言块都有按钮

## Stash

[`Stash/external-ip-address-tile.js`](./Stash/external-ip-address-tile.js) 是 Stash 外部 IP 地址磁贴脚本，通过 `ip-api.com` 获取 IP 和国家/地区信息，显示为 `IP @ 国家/地区`；请求失败时显示“获取失败”。

## Android

[`Android/ApkRename`](./Android/ApkRename) 是只修改 Android APK 应用名称的 PowerShell 脚本：基于 apktool 反编译，仅改动名称相关的清单/字符串资源，重新打包并用原 keystore 重新签名，包名、代码与其余资源保持不变，最后还会做逐文件哈希校验。工具（apktool、apksigner、zipalign、aapt）可自动下载到脚本目录 `tools\` 下（`.\rename-apk.ps1 -SetupTools`）。签名“字节”必然变化（内容变了），但只要使用原 keystore，签名“身份”（同一证书）保持不变，可覆盖安装。

只修改 Android APK 的**应用名称**（`android:label`），其余内容、**包名**、**签名身份**全部保持不变。

### 用法

```powershell
## 第一步（可选但推荐）：把全部工具下载到脚本同目录的 tools\ 下，之后可离线使用
.\rename-apk.ps1 -SetupTools

## 最常用：改名称，并用原 keystore 重新签名（保持同一签名身份）
.\rename-apk.ps1 -ApkPath .\app.apk -NewName "新应用名" -KeyStore release.jks -KeyAlias mykey -StorePass 123456

## 不提供 keystore：自动生成临时 debug 证书（签名身份会变，需先卸载旧版再安装）
.\rename-apk.ps1 .\app.apk "新应用名"

## 只改名称、不签名（输出 APK 无法直接安装，仅用于查看/二次处理）
.\rename-apk.ps1 .\app.apk "新应用名" -SkipSign

## 手动指定工具目录 / 指定 build-tools 版本
.\rename-apk.ps1 .\app.apk "新应用名" -ToolsDir D:\tools
.\rename-apk.ps1 .\app.apk "新应用名" -BuildToolsVersion 35.0.0

## 若执行策略限制：
powershell -ExecutionPolicy Bypass -File .\rename-apk.ps1 -ApkPath .\app.apk -NewName "新应用名" ...
```

输出默认生成在输入同目录的 `<原名>-renamed.apk`，可用 `-Output` 指定其它路径。

### 原理

1. **反编译**：`apktool d -s` 只解资源、不解码 dex（`-s`），代码原样保留；
2. **改名称**：解析 `AndroidManifest.xml` 中 `application` 与启动 Activity（MAIN/LAUNCHER）的 `android:label`：
   - 若 label 引用 `@string/xxx`（最常见），直接修改 `res/values*/strings.xml` 里对应字符串的值；
   - 若 label 是字面量，直接改写清单属性；
3. **重新打包**：`apktool b`（aapt1 失败自动改用 aapt2）；
4. **对齐**：`zipalign -f -p 4`；
5. **签名**：`apksigner sign`，使用你提供的原 keystore；
6. **校验**：对比新旧 APK 的签名证书 SHA-256、`aapt dump badging` 的包名/应用名，并对除名称相关外的所有文件做逐字节哈希对比。

### 参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `-ApkPath` | 是* | 原始 APK 路径（仅用 `-SetupTools` 下载工具时可不填） |
| `-NewName` | 是* | 新的应用名称（同上） |
| `-SetupTools` | 否 | 只把工具下载到脚本同目录 `tools\` 下并退出，不处理 APK |
| `-BuildToolsVersion` | 否 | 指定 build-tools 版本（如 `35.0.1`），不填自动选择 Google 官方仓库的最新稳定版 |
| `-Output` | 否 | 输出路径，默认 `<输入目录>\<原名>-renamed.apk` |
| `-KeyStore` | 否 | 原签名 keystore。**要保持签名身份必须提供**；不提供则用临时 debug 证书 |
| `-KeyAlias` | 否 | keystore 别名，不填自动读取第一个私钥 |
| `-StorePass` | 否 | keystore 密码，不填则交互输入（不回显） |
| `-KeyPass` | 否 | 密钥密码，默认同 StorePass |
| `-ToolsDir` | 否 | apktool.jar / zipalign / apksigner / aapt 所在目录 |
| `-SkipSign` | 否 | 只打包不签名 |
| `-KeepWork` | 否 | 保留临时工作目录（排错用） |
| `-Quiet` | 否 | 只输出关键信息 |

### 工具获取

脚本会自动把工具下载到**脚本同目录的 `tools\`** 下，之后可离线使用：

| 工具 | 下载到 | 来源 |
|---|---|---|
| `apktool.jar` | `tools\apktool.jar` | GitHub 官方最新版 |
| `apksigner` / `zipalign` / `aapt` | `tools\build-tools\` | Google 官方 build-tools 压缩包（约 50 MB） |

查找顺序：`-ToolsDir` 指定目录 → 脚本目录 `tools\` → `PATH` → Android SDK（`ANDROID_HOME` / `ANDROID_SDK_ROOT` / `%LOCALAPPDATA%\Android\Sdk`）→ 自动下载到 `tools\`。
运行 `.\rename-apk.ps1 -SetupTools` 可一次下载齐全。

### 环境要求

- Windows PowerShell 5.1+ 或 PowerShell 7（本仓库在 Windows 下测试）
- **Java 8+**（JDK，提供 `java` 与 `keytool`）——需要手动安装，无法自动下载
- 其余工具（apktool、apksigner、zipalign、aapt）均可自动下载；无网络时手动放入 `tools\` 即可

### 关于“签名不变”

- APK 内容只要有任何变化，**签名“字节”必然变化**——签名是对全部内容做的哈希，这是 Android 的安全机制，任何工具都无法绕过。
- 但只要用**原来的 keystore（同一密钥/证书）**重新签名，**签名“身份”不变**：系统仍认为它是同一开发者的应用，可以**覆盖安装**（要求 `versionCode >=` 已安装版本）。
- 如果**丢失了原 keystore**，签名身份无法保持，只能先卸载旧版再安装新版。

### 常见问题

| 现象 | 处理 |
|---|---|
| 提示找不到 apksigner / zipalign | 先运行 `.\rename-apk.ps1 -SetupTools` 自动下载，或用 `-ToolsDir` 指定目录 |
| apktool / build-tools 自动下载失败（无网络） | 手动下载 [apktool.jar](https://ibotpeaches.github.io/Apktool/) 放入 `tools\apktool.jar`；build-tools 可从 `https://dl.google.com/android/repository/build-tools_r35.0.0-windows.zip` 下载并解压到 `tools\build-tools\` |
| 安装时报“签名不一致” | 说明签名身份变了：请改用原 keystore 签名，或先卸载旧版再安装 |
| 校验提示“签名证书不一致” | 说明**原 APK 不是用你提供的 keystore 签的**（常见于下载的第三方 APK）。可用 `apksigner verify --print-certs` 查看原 APK 的证书 DN 来确认是不是自己的另一把钥匙；否则无法保持原签名身份，只能先卸载原版再安装改名版 |
| 安装时报“版本过低 / 应用未安装” | 新 APK 的 `versionCode` 需 ≥ 已安装版本。本脚本刻意不改版本号（保持“别的都不变”），如确需升级请先用 apktool 修改清单里的 `versionCode` |
| 应用被加固（360、腾讯等） | apktool 可能无法完整反编译，此方法不适用，需在源码层面修改 |
| 改完桌面图标名字没变 | 个别启动器有缓存，重启桌面/重新安装一次即可；桌面名取自启动 Activity 的 label，脚本已一并处理 |

### 验证命令（可手动复核）

```powershell
## 查看签名证书（对比新旧 APK 的 SHA-256 应一致）
apksigner verify --print-certs app-renamed.apk

## 查看包名与应用名
aapt dump badging app-renamed.apk | Select-String '^package:|^application-label:'
```

### 注意事项

- 若 `android:label` 引用的是**共享字符串资源**（如 `@string/app_name` 同时被界面其它地方使用），改名会连带影响所有引用处——这是资源引用的天然行为，无法只改桌面名而保留其它引用。
- 脚本只做名称相关改动，并在最后做逐文件哈希校验，确认 dex、lib、assets 等与原始 APK 完全一致。
- 动手前请**备份原 APK**。

## Scripts

### Flatten

[`Scripts/Flatten.bat`](./Scripts/Flatten.bat) 用于分别将一个或多个目标文件夹的所有子目录文件移动到各自的目标根目录，并删除变空的子目录。

- 支持一次拖拽一个或多个文件夹到脚本，或通过命令行传入多个路径
- 多个目标会统一预检和确认，再按传入顺序分别展平；重复目标会去重，父子目标组合会被拒绝
- 使用 `/Y` 或 `-Y` 跳过确认和结束暂停
- 同名项目不会覆盖，原文件及其所在目录会保留
- 操作不可撤销，脚本会拒绝处理磁盘根目录、共享根目录以及符号链接/目录联接

Edge 删除脚本基于 [ShadowWhisperer/Remove-MS-Edge](https://github.com/ShadowWhisperer/Remove-MS-Edge)，并保留来源链接：

| 脚本 | 用途 |
|---|---|
| [`RemoveMSEdge.bat`](./Scripts/RemoveMSEdge.bat) | 删除机器级、用户级 Edge 和相关 AppX，保留 WebView2 Runtime、EdgeCore、EdgeUpdate 及共享更新任务和服务；支持 `-guard`、`-auto`、关联审计/修复及帮助参数 |
| [`RemoveMSEdgeAll.bat`](./Scripts/RemoveMSEdgeAll.bat) | 全量删除 Edge、相关 AppX、WebView2 Runtime、EdgeCore、EdgeUpdate 及共享更新任务和服务；支持 `-auto`、关联审计/修复及帮助参数 |

两个 BAT 需与 `EdgeAssociations.ps1` 一起使用。`-audit-associations` 只读检查旧关联残留，`-repair-associations` 备份并修复已识别的父项权限异常；这两个入口不执行卸载。正常清理不再修改 `UserChoice` 权限，受保护或无法判断的选择会保留并报告。

两个脚本都会调用机器级和当前用户级 Edge 卸载器，并清理其他 ProfileList 用户的残留；卸载后扫描各用户 URL 协议和文件扩展名的选择记录，仅清理确认失效、无 Hash 且无冲突的 Edge 选择值。关联审计、修复入口、退出码与验证方式见下文[「Edge 关联清理与旧权限残留」](#edge-关联清理与旧权限残留)；职责边界、计划任务配置、执行流程和维护验证要求见仓库根 [`DEVELOPMENT.md`](./DEVELOPMENT.md)。

### FFmpeg

[`Scripts/InstallFFmpeg.ps1`](./Scripts/InstallFFmpeg.ps1) 从 [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) 下载 FFmpeg 的最新 full 构建并安装其中的可执行文件。该来源是 [ffmpeg.org Windows 下载页](https://ffmpeg.org/download.html#build-windows) 列出的镜像之一，其 win64 GPL 构建与 gyan.dev 的 full release 同属一个变体（essentials 之外另含 libx264、libx265）。

```powershell
pwsh -File .\Scripts\InstallFFmpeg.ps1
```

- 需要 PowerShell 7；解压使用内置的 `Expand-Archive`，不依赖 7-Zip
- 下载前先取发布页公布的 SHA-256 并校验，校验不通过不会解压
- 安装位置来自环境变量：脚本在 `PATH`（当前会话，加上注册表里的机器级和用户级 `Path`）中找 `ffmpeg.exe`，装到它所在目录；`PATH` 里没有 `ffmpeg.exe` 时不安装，只打印提示并以 1 退出
- 想装到 `PATH` 之外的位置，可传目录作为位置参数或 `-Directory`，此时跳过上述查找
- 重复运行即替换目录内的版本，无需先卸载
- 只安装 ffmpeg、ffplay、ffprobe 三个可执行文件，归档里的手册、头文件和导入库都不落盘
- `-Shared` 换成共享库构建（下载小，但必须额外安装 7 个 DLL，脚本会自动一并装上），`-Git` 换成每日 master 构建，`-Silent` 跳过结束时的版本输出

macOS 分支尚未实现，脚本在非 Windows 平台会直接报错退出。

### Edge 关联清理与旧权限残留

`RemoveMSEdge.bat` 保留 WebView2 及共享更新组件；`RemoveMSEdgeAll.bat` 连同这些组件一起删除。两个 BAT 都必须与 `EdgeAssociations.ps1` 放在同一目录。缺少辅助脚本时会在提权和卸载之前退出。

#### 先检查旧版本残留

在这个目录运行任一 BAT 的审计入口：

```powershell
.\RemoveMSEdge.bat -audit-associations
```

它只读检查当前用户的文件类型和 URL 关联，不卸载、联网或请求 UAC。相同参数也适用于 `RemoveMSEdgeAll.bat`。建议从普通 Windows Terminal/PowerShell 运行；受隔离的宿主可能读取不同的注册表视图。最终应由 Windows 设置和实际文件打开行为确认。

检查包括：

- 关联父项是否匹配本次确认的异常权限：关闭继承、Everyone 只读、SYSTEM/管理员完全控制，缺少当前用户的写权限。
- 指向 Edge 的选择是否仍有可用程序、是否有 Hash 保护、直接与嵌套 ProgId 是否冲突。
- 旧 `RemoveMSEdge*_dbg.log` 是否记录过文件关联 `UserChoice` 的权限修改尝试，且该项现已缺少通常存在的用户 SetValue 拒绝规则。日志只作为证据，不执行其中的文本；URL 关联和 `UserChoiceLatest` 的权限不同，不能用同一规则推断损坏。

#### 修复可以确认的旧问题

```powershell
.\RemoveMSEdge.bat -repair-associations
```

此入口仅修复上述严格匹配的父项权限，并要求其父目录有可继承的当前用户完全控制规则、没有拒绝规则。先将原 DACL 写入 `RemoveMSEdge-backups/*.json`，再恢复继承；校验失败时恢复原 DACL。备份写入失败时不修改注册表。

**不会更改 ProgId、Hash 或当前浏览器选择，也不会停用 UCPD。** 修复后重新打开 Windows 设置选择目标浏览器。

旧版曾删除过哪些自定义拒绝规则，无法从“尝试修改权限”的日志还原。`ReviewLegacyChoiceAcl` 和 `ReviewCustomParentAcl` 会保留原状并报告待检查，避免把正常或自定义权限覆盖掉。需要当时的原始 ACL 备份才能精确还原；不能从别的浏览器选择键盲目复制权限。此次 `.html` 父项问题不能据此归因于卸载工具。

#### 新的清理行为

```powershell
.\RemoveMSEdge.bat -userchoice
```

完整卸载流程也使用同一份清理实现：

1. 已安装的 Edge 处理程序和其他浏览器的选择均保留。
2. 仅在能够确认 Edge 的 open 命令不存在或可执行文件已不存在，且根/嵌套位置均无 Hash、只有一个 ProgId 时清理。
3. 删除前备份并再次检查选择值；仅原子删除那个 `ProgId` 值，保留可能出现的空壳键及其权限。不会递归删除受保护的选择树。
4. 删除失败直接报告，不移除拒绝规则、不接管所有权、不篡改 Hash。受保护的旧 Edge 选择通过 Windows 默认应用界面重新选择。
5. 无法解析的命令、环境变量路径、DelegateExecute、重复/冲突的选择值均保留并报告。

清理不再有“修改权限成功、删除失败后留下新权限”的分支。`-repair-associations` 独立于卸载，避免正常清理顺便修改历史或自定义权限。

| 退出码 | 含义 |
|---|---|
| `0` | 检查/操作完成，没有待处理项 |
| `1` | 扫描、备份、修改或报告写入失败 |
| `2` | 有受保护、未知或需要人工核对的项目 |

完整 BAT 卸载若任一用户的关联清理返回非零，会显示警告并以 `2` 退出，不再输出无条件成功；详情保留在调试日志中。默认关联清理并不会将不确定的记录视为已成功清除。

可直接调用辅助脚本生成结构化报告：

```powershell
.\EdgeAssociations.ps1 -Mode Audit -ReportPath "$env:USERPROFILE\Desktop\edge-associations.json"
.\EdgeAssociations.ps1 -Mode Repair -BackupDirectory "$env:USERPROFILE\Desktop\edge-association-backups"
```

指定 `-UserSid` 时只检查已经加载的用户 hive；不会自行加载离线配置。旧日志可通过 `-LegacyLog` 指定。JSON 备份记录用户 SID、相对注册表路径、操作及原状态；`RestoreParentInheritance` 的 `Before.AccessSddl` 是回滚父项 DACL 所需的数据。备份不是可以双击导入的 `.reg` 文件，恢复前应核对用户和路径。

#### 验证

`-audit-associations` 和 `-repair-associations` 本身是只读/可回滚入口，可以直接在正常使用的机器上运行：审计不改任何东西，修复会先把原 DACL 写入备份，校验失败即回滚。

不要为验证语法而在日常开发机上直接运行完整卸载脚本；卸载流程只能在可回滚的虚拟机或专用测试机上验证。改动关联清理逻辑后，用 Windows 默认应用界面和目标浏览器的实际打开行为复核结果，不要只看退出码。

## DeepSeek Harness Launcher

DeepSeek Harness 系统托盘启动器 —— **纯 Windows 11 原生代码实现**（C++ / Win32 API，MSVC 编译，静态链接运行时，无任何第三方依赖）。**完全便携：不写注册表、无安装过程**，托盘程序自身的开机自启交由任务计划程序负责。

启动时会自动自检：检测 Node.js 环境（缺失则弹窗提示并自动退出）、检测 dsh 是否 npm 全局安装（已全局安装 → 以 `dsh` 命令启动；未安装 → 以 `npx` 方式启动），托盘菜单顶部以浅色文本实时显示当前启动方式。

**本程序只管启停与重启**：不检查、也不执行 DeepSeek Harness 的版本更新，升级与否完全由用户自行决定。

### 功能

- **系统托盘图标**，右键弹出菜单
- **启动 / 停止 DeepSeek Harness**：同一菜单项二选一显示（运行中显示「停止」，已停止显示「启动」）
- **重启 DeepSeek Harness**（先停止、等端口释放、再启动）
- **启动方式自动判定**：dsh 全局安装 → `dsh` 命令；未安装 → `npx -y @deepseek-ai/dsh`；菜单顶部以浅色不可编辑文本显示当前启动方式（dsh / npx / 自定义）
- **更新由用户自主控制**：不检查、也不执行版本更新；需要升级时自行执行 `npm i -g @deepseek-ai/dsh` 后重启
- **监听地址与端口（ini 配置）**：直接编辑 `Launcher.ini` 的 `Host`（默认 `127.0.0.1`）与 `Port` 即可；右键菜单顶部以浅色文本显示当前监听地址（`http://<Host>:<Port>`）；填写无效端口（非数字 / 越界）会自动修正为随机可用端口
- **随托盘程序自启动 DeepSeek Harness**：勾选后，托盘程序一启动就自动拉起 Harness（配合任务计划程序的登录自启即可实现开机全自动启动）
- 托盘提示文字实时显示运行状态与当前监听地址
- 所有设置写入 **exe 同目录的 `Launcher.ini`**

### 目录结构

```
Launcher/
├── src/
│   ├── Launcher.cpp        # 主程序（纯 Win32）
│   ├── Resource.h          # 资源 / 命令 ID
│   ├── Launcher.rc         # 图标、清单、版本信息
│   ├── app.manifest        # DPI 感知、Win11 兼容、长路径
│   ├── DeepSeekHarness.svg # DeepSeek Harness 官方图标矢量源
│   └── Launcher.ico        # 托盘图标（脚本生成）
├── scripts/
│   ├── build.ps1           # Visual Studio (MSVC) 构建脚本
│   ├── make-icon.ps1       # 图标生成脚本
│   └── test-lifecycle.ps1  # 自动化生命周期测试
├── Launcher.ini.example    # 配置模板（含注释）
└── bin/                    # 构建产物（Launcher.exe 等，不入库）
```

开发架构、构建流程、踩坑记录与扩展指引收归仓库根 [`DEVELOPMENT.md`](DEVELOPMENT.md) 的“DeepSeek Harness Launcher”小节。

### 构建

前置：本机安装 Visual Studio，且安装了 **「使用 C++ 的桌面开发」** 工作负载。

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
```

产物：`bin\Launcher.exe`（x64，`/MT` 静态链接，目标机器无需安装 VC++ 运行库）。

从 DeepSeek Harness 官方 Web UI favicon 重新生成品牌蓝色多尺寸托盘图标（可选）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\make-icon.ps1
```

### 使用

1. 双击 `bin\Launcher.exe`：程序先检测 Node.js 环境（未安装则弹窗提示并自动退出），再判定启动方式（dsh / npx），随后任务栏托盘区出现图标（无窗口）。
2. 右键托盘图标 → 选择「启动 DeepSeek Harness」；菜单顶部以浅色文本显示当前监听地址，用浏览器访问即可打开 Web 界面。
3. 首次运行会自动在 exe 同目录生成默认 `Launcher.ini`。

> 托盘程序一次只能运行一个实例（互斥体保证）。**退出托盘程序会同时停止 DeepSeek Harness**（若 Harness 由外部启动，退出前会提示并一并结束），托盘完全接管 Harness 的启动状态控制。

**开机自启动（便携方式）**：本程序不写注册表，请用任务计划程序（`taskschd.msc`）新建任务：登录时运行 `Launcher.exe`，并勾选菜单「随托盘程序自启动 DeepSeek Harness」即可实现开机后自动启动 Harness。

### 配置（Launcher.ini，与 Launcher.exe 同目录）

```ini
[General]
; 监听地址（默认 127.0.0.1；不支持 0.0.0.0），对应 dsh web --host <host>
Host=127.0.0.1
; Web 界面启动端口（1-65535），对应 dsh web --port <port>
; 无效值（非数字或越界）会在启动时自动修正为随机可用端口并写回本文件
Port=16100
; 随托盘程序启动时自动启动 DeepSeek Harness（0=否，1=是）
AutoStart=0
; 高级：node.exe 的完整路径（留空自动查找：PATH → 常见安装目录）
NodePath=
; 高级：自定义启动入口（node.exe 直接执行的 .js 文件；留空则自动判定 dsh / npx）
DshBin=
```

托盘右键菜单顶部以浅色不可编辑文本显示「启动方式」与「监听地址」。

启动方式判定规则（托盘菜单顶部浅色文本显示）：

| 环境 | 启动方式 | 实际执行命令 |
|---|---|---|
| dsh 已全局安装（PATH 上有 `dsh` 命令，如 `npm i -g @deepseek-ai/dsh`） | dsh | `dsh web --no-open --host <Host> --port <Port>` |
| dsh 未全局安装 | npx | `npx -y @deepseek-ai/dsh web --no-open --host <Host> --port <Port>` |
| ini 显式指定了 `DshBin` | 自定义 | `node.exe <DshBin> web --no-open --host <Host> --port <Port>` |

### 实现要点

- **进程管理**：以 `dsh web --no-open --host <Host> --port <Port>` / `npx -y @deepseek-ai/dsh web --no-open --host <Host> --port <Port>` 在后台派生进程（经 cmd.exe，作业对象整树管理），不会自动打开浏览器；进程句柄可直接判断存活。停止时用**作业对象**整树终止（Harness 可能派生子进程）。作业对象启用 `KILL_ON_JOB_CLOSE`：托盘退出（包括被强制结束、崩溃）时 Harness 一并终止，保证托盘完全接管启停状态。
- **启动环境自检**：启动时检测 Node.js（缺失则弹窗提示并自动退出），并判定 dsh 是否全局安装（PATH 上存在 dsh 命令）：全局 → `dsh` 命令；未全局 → `npx` 方式。托盘菜单顶部以浅色不可编辑文本显示当前启动方式与监听地址。
- **端口收束**：`Launcher.ini` 的 `Port` 读取后校验 1-65535；无效（非数字 / 越界）自动改为**随机可用端口**（按配置的 Host 探测未占用）并写回 ini，避免错误端口导致 Harness 起不来。
- **运行状态判定**：托管进程存活 **或** TCP 探测 `<Host>:<Port>` 可连接，二者任一为真即视为运行中——因此能正确识别“由其他方式启动的实例”。
- **外部实例停止**：若端口被外部启动的 Harness 占用，停止时会先询问用户，再通过 TCP 表找到监听进程并结束。
- **单实例**：命名互斥体 `Local\DSHLauncher_SingleInstance`。
- **自动化接口**：隐藏窗口支持私有消息 `WM_APP+100~103`（启动/停止/重启/状态查询），测试脚本据此驱动。
- **日志**：`Launcher.log`（exe 同目录，UTF-16，超 256KB 自动截断）。

### 测试

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-lifecycle.ps1
powershell -ExecutionPolicy Bypass -File scripts\test-modes.ps1
powershell -ExecutionPolicy Bypass -File scripts\test-port.ps1
```

- `test-lifecycle.ps1`：用临时 Node HTTP 服务器代替真实 Harness，验证随托盘自启动、停止、再启动、重启、强杀托盘即停 Harness、日志记录。
- `test-modes.ps1`：受限 PATH + 假 shim 验证 dsh / npx 两种启动方式判定。
- `test-port.ps1`：验证端口收束——有效端口保持不变，越界（99999）与非数字（abc）自动修正为随机可用端口并写回 ini。

### 常见问题

**Q：启动托盘程序时弹出「未检测到 Node.js 环境」？**
需要先安装 Node.js（https://nodejs.org/zh-cn/download），安装完成后重新启动托盘程序。启动方式会自动判定：dsh 已全局安装（`npm i -g @deepseek-ai/dsh`）→ 用 `dsh` 命令；未安装 → 用 `npx` 自动拉取。托盘菜单顶部会显示当前启动方式。

**Q：端口被占用 / Harness 由别的方式启动？**
托盘菜单的「停止」会检测到端口上的非托管实例并询问是否结束（通过 TCP 表定位 PID）。

**Q：修改端口 / 监听地址后没有生效？**
直接编辑 `Launcher.ini` 的 `Host`（默认 `127.0.0.1`）与 `Port` 后保存，在下次启动 DeepSeek Harness 时生效；若当前正在运行，先重启（或停止后重新启动）。填写无效端口（非数字 / 越界）会自动修正为随机可用端口（托盘菜单可看到当前监听地址）。注意 dsh 出于安全考虑不支持 `0.0.0.0`。

**Q：退出托盘程序后 DeepSeek Harness 会怎样？**
会一并停止。托盘程序是 Harness 的唯一启停控制器：菜单「退出」（或托盘进程被强制结束）都会终止 Harness（外部启动的实例退出前会先询问）。

**Q：如何更新 DeepSeek Harness？**
本程序不检查、也不执行版本更新，升级与否完全由用户自行决定。需要升级时，请自行执行 `npm i -g @deepseek-ai/dsh`（如需特定通道则加 `@alpha`、`@rc` 等 dist-tag），然后在托盘中停止并重新启动 Harness 即可。npx 启动方式下每次启动都会按需拉取，无需单独更新。

**Q：如何实现开机自动启动 Harness？**
本程序完全便携、不写注册表。请用任务计划程序（`taskschd.msc`）新建任务：登录时运行 `Launcher.exe`，并在托盘菜单勾选「随托盘程序自启动 DeepSeek Harness」：开机 → 任务计划启动托盘程序 → Harness 自动启动。

## Dox Reader

Dox Reader 是一个 local-first RSS/Atom 阅读器。订阅、已读状态、收藏状态和外观偏好保存在浏览器本地，并可通过用户自己的 WebDAV 服务跨设备同步；文章正文只保存在各设备的 IndexedDB 中。

`1.1.0` 增加可选自建后端模式：前端设置中连接自己的 [Dox Reader Backend](#dox-reader-backend)，由后端统一存储文章、订阅和阅读状态，默认每小时抓取、全库保留最新 10000 篇（免费档默认值，付费档为 50000 篇）。抓取间隔和保留上限可在前端调整；所有客户端关闭也会继续抓取。上述 local-first/WebDAV 行为继续作为默认本地模式独立运行。

应用启动时默认显示全部订阅中的未读文章；资料库导航按“未读、全部文章、收藏”排列。

同步和已读状态操作进行时会显示加载状态并锁定重复点击；切换订阅源后，未完成的批量已读操作仍保留加载状态。

### 项目结构

| 模块 | 目录 | 网络方式 | 发布方式 |
|---|---|---|---|
| Cloudflare Workers 网页版 | [`Cloudflare Workers/`](Dox%20Reader/Cloudflare%20Workers/) | 浏览器通过同源 Worker 受限代理访问 RSS 与 WebDAV | Workers Static Assets + Worker |
| 可选个人后端 | [`Backend/`](Dox%20Reader/Backend/) | 服务端定时抓取 RSS，前端通过 HTTPS API 访问个人文章库 | Worker + SQLite Durable Object |

仅维护网页端和可选个人后端。两者是独立 npm 工程，各有依赖锁、构建配置和测试。

产品行为、架构、数据契约、测试和发布流程统一见仓库根文档 [`DEVELOPMENT.md`](DEVELOPMENT.md)。

### 快速验证

```powershell
cd "Dox Reader/Cloudflare Workers"
npm ci
npm run check
npx wrangler deploy --dry-run

cd "../Backend"
npm ci
npm run check
npx wrangler deploy --dry-run
```

改动后运行相关工程的检查和部署预检。

WebDAV 同步文件固定为用户所填 URL 前缀下的 `Dox Reader/state.json`。

### Cloudflare Workers

Dox Reader 的 self-hosted local-first 网页版。Vite 构建的 Preact 应用由 Workers Static Assets 提供，Worker 只处理 `/api/feed` 和 `/api/webdav` 两个受限代理入口。应用不使用 KV、D1、R2、Durable Objects、Queues 或 Workers AI，适合部署在 Cloudflare Workers 免费权益内。

#### 一键部署

要求一个 Cloudflare 账号，以及 Node.js 24 或更高版本。在 Windows 双击：

```text
deploy-cloudflare.cmd
```

也可以在 PowerShell 中运行：

```powershell
pwsh -File deploy-cloudflare.ps1
```

脚本会执行 `npm ci`、完整测试与构建、Wrangler 类型检查，然后部署到当前 Wrangler 登录的 Cloudflare 账号。首次运行会打开 Cloudflare 登录流程。

```powershell
pwsh -File deploy-cloudflare.ps1 -DryRun
pwsh -File deploy-cloudflare.ps1 -SkipInstall
```

任何人克隆仓库后都可以在自己的 Cloudflare 账号中运行该脚本；`wrangler.jsonc` 不包含账号 ID 或密钥。

#### 本地开发

```powershell
npm ci
npm run dev       # 构建后启动完整 Worker + Static Assets
npm run dev:ui    # 只调试界面，不提供 RSS/WebDAV 代理
npm run check
```

正式部署的 npm 入口是：

```powershell
npm run deploy
```

#### 安全边界

代理只接受 Dox Reader 同源网页发起并带有客户端标记的请求。它限制方法、头部、请求体大小、重定向次数和目标端口，拒绝私有/保留地址以及非 HTTPS WebDAV 地址，也不记录或持久化 WebDAV 凭据。RSS 上游统一使用固定、非个人化的 Dox Reader 标识，以兼容会拒绝空 `User-Agent` 的旧站点。

订阅、文章、设置和凭据保存在访问该部署域名的浏览器中；只有用户选择同步的数据会写入其自己的 `Dox Reader/state.json`。更换部署域名会形成新的浏览器存储分区，迁移前应先完成 WebDAV 同步。

隐私说明见 [`PRIVACY.md`](Dox%20Reader/Cloudflare%20Workers/PRIVACY.md)。所有核心修改必须遵循仓库根文档 [`DEVELOPMENT.md`](DEVELOPMENT.md)。

#### 本地与后端模式（1.1.0）

设置 → 数据模式：默认「纯本地」，保留现有 RSS/WebDAV 功能；选择「自建后端」后填写自己的 Dox Reader Backend HTTPS 根地址和访问令牌，等待自动读取后端设置。可调整抓取间隔（默认 60 分钟）及全库最新文章上限（免费档默认 10000 篇、付费档默认 50000 篇，含收藏），输入框区间随后端上报的额度档调整，保存后生效。关闭全部客户端也会继续抓取，刷新按钮可手动触发后端抓取。

本地与每个后端的缓存独立，切换不会自动迁移或删除数据；可用 OPML 导出/导入订阅。后端模式下 WebDAV 不启用，外观保存在本机；离线可读已缓存内容，状态修改需要联网。调低保留上限会删除远端旧文章。部署说明见 [Dox Reader Backend](#dox-reader-backend)。

### Dox Reader Backend

部署在自己 Cloudflare 账号中的个人 RSS 服务。Dox Reader 前端通过后端地址和访问令牌连接，服务端在所有客户端关闭时仍定时抓取。

#### 部署

要求 Node.js 24+、npm 11+ 和 Cloudflare Workers 账号（免费档即可；需要更大额度时开通 Workers Paid，见下方「默认与范围」）。每位用户独立部署，不使用公共后端。

```powershell
npm ci
npm run check
npx wrangler login
npx wrangler deploy
npx wrangler secret put BACKEND_TOKEN
```

最后一步输入自己生成的随机令牌（至少 32 字符，推荐 32 随机字节的十六进制字符串），不要把令牌写进源码或命令行。配置令牌前 API 拒绝所有数据请求。

在网页版的设置中选择「自建后端」，填入部署输出的 HTTPS 根地址和访问令牌，等待自动读取后端设置，调整抓取间隔和保留篇数后保存。

额度档在部署时由 `wrangler.jsonc` 的 `vars.PLAN` 选定：`"free"`（默认）或 `"paid"`。切换档位只需改这一个值并重新 `npx wrangler deploy`，不必改代码或迁移数据；前端连接后会读取后端上报的档位与区间，不写死范围。

#### 默认与范围

免费档（`PLAN: "free"`）：

- 默认每 60 分钟抓取，支持 30–10080 分钟；手动刷新最短间隔 1 分钟。
- 全部订阅合计保留按发布时间排序的最新 10000 篇，支持 100–10000；相同发布时间以文章 ID 排序。收藏和未读也计入并受此上限约束。调低上限立即清理旧文章。
- 最大 100 个订阅源。RSS/Atom 响应上限 5 MiB；正文上限约 48 KiB，正文与元数据总预算 600 MiB。
- 每日 UTC 最多 4800 次抓取，以及保守的写入预算（每条新文章占 4 单位、状态更新占 1 单位，共 10000 单位）。额度不足顺延到次日 UTC，已有数据保留。

付费档（`PLAN: "paid"`，账号需已开通 Workers Paid，$5/月起步）：

- 默认每 60 分钟抓取，支持 5–10080 分钟；手动刷新最短间隔 1 分钟。
- 默认全库保留最新 50000 篇，支持 100–100000；正文与元数据总预算 4 GiB。
- 最大 300 个订阅源。RSS/Atom 响应上限 10 MiB；正文上限 256 KiB。
- 每日 UTC 最多 48000 次抓取、100000 写入单位。单次调用的 CPU 上限也从免费档的 10 毫秒提升到默认 30 秒，体积大或条目多的订阅源不再因 CPU 超限反复失败。
- SQLite 存储包含 5 GB-month，超出部分按 $0.20/GB-month 计费；单个 Durable Object 存储上限 10 GB。请求数、CPU、行读写通常远低于包含额度，实际账单一般就是 $5.00/月的最低消费；存储超过 5 GB 才会增加费用。

从 paid 降回 free 时，后端会把抓取间隔和保留篇数收敛到免费档区间，并在后续唤醒中按免费档预算清理超出的数据；如果已经远超免费档单 Durable Object 的 1 GB 存储上限，建议先调低保留篇数再降级。

两档共有：刷新由后端异步执行，关闭客户端不会取消任务；每次唤醒抓取一个源，90 秒超时，失败指数退避；抓取请求使用固定、非个人化的 Dox Reader 标识，兼容会拒绝空 `User-Agent` 的旧站点。不抓原网页全文或保存图片；超过正文上限的部分保留节选并提示打开原文。使用 SQLite Durable Objects 与一个每小时恢复检查的 Cron，不要求 D1、R2、Queues。上述应用预算留有余量，但不能抵消同账号其他应用的使用或任意外部流量；Cloudflare 额度耗尽时服务会报错，应用不会自动升级套餐。

本地模式与后端数据互相独立。可先在本地模式导出 OPML，再切换后端模式导入；文章历史不会自动上传。后端模式下已读、收藏和订阅由服务器管理，外观偏好保存在当前设备。WebDAV 仅用于本地模式。

每个后端地址在浏览器拥有独立缓存。离线时可以查看已缓存的列表和打开过的正文；修改状态需要连接后端。清除本机缓存不会删除远端文章。

#### 本地验证

在被忽略的 `.dev.vars` 中设置 `BACKEND_TOKEN`，运行 `npm run dev`。测试使用独立的本地 Workers runtime 和模拟订阅，不访问生产账号。

`npm run check` 包含类型检查和 Workers 集成测试。部署预检：`npx wrangler deploy --dry-run`。

隐私说明见 [PRIVACY.md](Dox%20Reader/Backend/PRIVACY.md)，维护规范统一在 [根开发文档](DEVELOPMENT.md)。

## Sub-Store

把上游 [Sub-Store](https://github.com/sub-store-org/Sub-Store) 与 [Sub-Store-Front-End](https://github.com/sub-store-org/Sub-Store-Front-End) 部署到两个 Cloudflare Worker，全部落在免费额度内。上游源码不入库，构建期按 release tag 拉取。

| 目录 | Cloudflare Worker | 说明 |
|---|---|---|
| [`sub-store`](./sub-store) | `sub-store` | 后端：D1 存数据，路径口令鉴权，CORS 全域放行 |
| [`sub-store-front-end`](./sub-store-front-end) | `sub-store-front-end` | 前端：上游 release 产物，纯静态资源 |

部署由 [`.github/workflows/deploy-sub-store.yml`](./.github/workflows/deploy-sub-store.yml) 负责：**每天北京时间 05:00** 自动拉取两者最新 release 重新部署，也可在 Actions 页面手动触发。维护规范见 [`DEVELOPMENT.md`](./DEVELOPMENT.md#317-sub-storecloudflare-workers)。

### sub-store 后端

把 [Sub-Store](https://github.com/sub-store-org/Sub-Store) 后端跑在 Cloudflare Workers 上，用 D1 存数据、用路径口令鉴权，全部落在免费额度内。

前端见 [`sub-store-front-end`](#sub-store-front-end-前端)。维护规范见仓库根 [`DEVELOPMENT.md`](DEVELOPMENT.md#317-sub-storecloudflare-workers)。

#### 部署前提

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加三个 Secret：

| Secret | 说明 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token，权限：**Account → Workers Scripts → Edit**、**Account → D1 → Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard 右侧的 Account ID |
| `SUB_STORE_TOKEN` | 自定义的后端路径口令，只能用 `A-Z a-z 0-9 . _ ~ -`，建议 24 位以上随机串 |

Token 在 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) 用 **Create Custom Token** 创建，权限选上面两项即可。

#### 触发部署

`.github/workflows/deploy-sub-store.yml` 会自动：

- **每天北京时间 05:00**（UTC 21:00）拉取 Sub-Store 与 Sub-Store-Front-End 的最新 release 重新部署；
- 在 Actions 页面 **Run workflow** 手动触发。

部署脚本会执行 D1 migration、部署 Worker、写入 `SUB_STORE_TOKEN`，并在结束时自检线上接口。

#### 拿到后端地址

部署日志末尾会打印：

```text
后端就绪：https://sub-store.<你的子域>.workers.dev/<口令>
```

前端「后端地址」里就填这一整串（**结尾的 `/<口令>` 不能省**）。

可以直接验证：

```bash
curl https://sub-store.<你的子域>.workers.dev/<口令>/api/utils/env
```

- 带口令 → 200，返回后端版本信息；
- 不带口令 → 404。

#### 自定义域名

给 Worker 绑自定义域名后 CORS 不受影响：本部署固定返回 `Access-Control-Allow-Origin: *`，任何前端域名都能访问。

#### 免费额度与限制

| 项 | 情况 |
|---|---|
| Worker 请求 | 免费版 100,000 次/天 |
| Worker CPU | 免费版 **10 ms/请求**；订阅转换较重，节点特别多时可能超时（Error 1102） |
| D1 | 免费版 5 GB、500 万行读/天、10 万行写/天，个人使用远用不满 |
| Worker 数量 | 免费版 100 个，本部署占 2 个 |

Workers 运行时禁止 `eval` / `new Function`，但脚本功能没被砍掉：本部署内置一个 QuickJS（Wasm）解释器，
「脚本过滤」「脚本操作」「修改响应」照常可用，见下节。真正**不支持**的是依赖 Node 内建模块的能力：

- 本地文件路径订阅、GeoIP/MMDB、UDP/TLS 直连 DNS、请求代理（`proxy`）、跳过证书校验（`insecure`）。
- 上游 `resolve-domain` 走 DNS over HTTPS 时正常。
- 定时同步（`SUB_STORE_BACKEND_SYNC_CRON`）是 Node 专属，本部署不提供；需要定时拉取时用外部定时请求 `/api/sync/artifacts`。
- 数据是「一个 isolate 一份内存缓存 + D1 落盘」。单 isolate 内并发请求已隔离，但多 isolate 同时写入仍有极小概率丢更新（与上游 Node 版同源问题）。

#### 脚本功能

脚本不在 V8 里跑，而是在随 Worker 一起上传的 QuickJS（Wasm）里解释执行，所以不碰 Workers 的 `eval` 禁令。
脚本可见的全局对象与上游一致（`$arguments`、`$options`、`$substore`、`lodash`、`ProxyUtils`、`yaml`、
`Buffer`、`b64d`、`b64e`、`DOMAIN_RESOLVERS`、`scriptResourceCache`、`flowUtils`、`produceArtifact`），
`require` 与上游浏览器分支一样是 `undefined`。

数据搬运规则：

| 数据 | 方式 |
|---|---|
| 节点列表、返回值 | JSON 整体过桥，快 |
| `$options`、`context` | 按引用共享，脚本里的增删改会落回宿主 |
| `lodash`、`ProxyUtils`、`$substore` 等 | 按需懒桥接，点和调才过桥 |

代价是 CPU：解释执行比原生慢，脚本本身的耗时受免费档 10 ms 限制。实测单个七百节点以内的订阅做一次
`map` 型改写仍在免费额度内，节点几千个或脚本里密集调用宿主函数时会撞 Error 1102。届时升级到 Workers
付费档（默认 30 s CPU，可在 `wrangler.jsonc` 里用 `"limits": { "cpu_ms": 300000 }` 拉到 5 分钟）即可。

脚本还有两个硬性边界：单次执行有指令数预算（跑飞会被中止并返回可读报错），`await` 只能等宿主函数的
promise 落地，等不到就报错。

#### 本地开发

```bash
cd sub-store
npm ci
npm run build   # 拉取上游最新 release 源码并打包成 build/worker.mjs
npm run check   # 构建 + 冒烟测试
```

冒烟测试用 `node:vm` 的 `codeGeneration.strings = false` 复刻 Workers 禁止动态求值的约束，并覆盖路由、CORS、D1 读写、订阅下载、并发隔离、peggy 解析器和三种脚本算子。`SMOKE_VERBOSE=1` 可打印 Sub-Store 日志。

部署需要先准备 Cloudflare 资源（认证交给 wrangler，本地 OAuth 或下面的环境变量都行）：

```bash
npx wrangler login          # 本地登录；CI 里改用 CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
SUB_STORE_TOKEN=<你的口令> npm run deploy
```

D1 数据库只需建一次，`database_id` 已经写进 `wrangler.jsonc`；换账号部署时先 `npx wrangler d1 create sub-store`，再把返回的 uuid 填进去。

### sub-store-front-end 前端

把 [Sub-Store-Front-End](https://github.com/sub-store-org/Sub-Store-Front-End) 的 release 产物作为静态资源跑在 Cloudflare Workers 上。

后端见 [`sub-store`](#sub-store-后端)。维护规范见仓库根 [`DEVELOPMENT.md`](DEVELOPMENT.md#317-sub-storecloudflare-workers)。

#### 部署

由 `.github/workflows/deploy-sub-store.yml` 与后端一起自动部署，每天北京时间 05:00 拉取上游最新 release；也可在 Actions 页面手动触发。

只需要与后端相同的两个 Secret：`CLOUDFLARE_API_TOKEN`（Account → Workers Scripts → Edit）、`CLOUDFLARE_ACCOUNT_ID`。本项目**不需要**数据库、secret 或变量。

#### 首次使用

1. 打开 `https://sub-store-front-end.<你的子域>.workers.dev`。
2. 在「后端地址」里填 `https://sub-store.<你的子域>.workers.dev/<口令>`（结尾的 `/<口令>` 不能省）。
3. 保存后即可管理订阅。

也可以直接带参数打开，自动完成配置：

```text
https://sub-store-front-end.<你的子域>.workers.dev/?api=https://sub-store.<你的子域>.workers.dev/<口令>
```

#### 说明

- 纯静态资源 Worker，没有 `main` 入口，不做任何请求改写；`not_found_handling` 为 SPA 回退。
- 构建时会把上游默认后端 `https://sub.store` 清空。上游默认指向公开站点，未配置后端时可能误发请求（Sub-Store README 有数据泄露提示）。需要固定默认后端时设环境变量 `SUB_STORE_DEFAULT_BACKEND`。
- 免费额度：静态资源请求与 Worker 共用每天 100,000 次；文件数与单文件大小上限（20,000 个 / 25 MiB）远未触及。

#### 本地开发

```bash
cd sub-store-front-end
npm ci
npm run build   # 下载上游最新 release 的 dist.zip 并解压到 dist/
npm run deploy  # 认证交给 wrangler：本地 login 或 CI 的 API Token
```

## bwh-traffic（BandwagonHost 流量）

把 BandwagonHost（搬瓦工）KiwiVM 的流量用量转成 Sub-Store 能读的订阅响应头。

Sub-Store 从远程订阅的响应头里读 `subscription-userinfo`（`upload` / `download` / `total` / `expire`）。本 Worker 提供这个头，正文是同一串 userinfo（Sub-Store 先解析正文、失败才看响应头，两边同值就不用赌它走哪条路），不含任何节点。

```text
Sub-Store ──▶ bwh-traffic Worker ──▶ 中转 ──▶ api.64clouds.com/v1/getServiceInfo
                    │
                    └─ 响应头: subscription-userinfo: upload=0; download=<已用>; total=<配额>; expire=<下次重置>
```

### 它为什么需要中转

**Cloudflare Worker 现在无法直连 KiwiVM API。** `api.64clouds.com` 在 Cloudflare 后面，其网关对来自 Cloudflare 自身出口的 `/v1/*` 请求一律返回：

```json
{ "success": true, "token": 38481974907714 }
```

无论 GET / POST、有无 User-Agent、是否带浏览器头、换 host 或路径，结果都一样；同一个请求从非 Cloudflare 出口（本机 curl、第三方 reader）就能拿到正常响应。也就是说 VEID 和 API Key 根本没参与校验——换个错的 Key 也是同样的 token 响应。2026-10 实测结论，详见 [DEVELOPMENT.md 第 3.18 节](DEVELOPMENT.md#318-bwh-trafficbandwagonhost-流量订阅头)。

所以 `KIWIVM_BASE` 必须指向一个不在 Cloudflare 上的中转，由它转发 `/getServiceInfo`。没有中转时 Worker 会明确报错并提示这一条。

### 部署

```powershell
cd bwh-traffic
npx wrangler deploy
npx wrangler secret put ACCESS_TOKEN     # 访问口令，任意随机串
npx wrangler secret put BWH_VEID         # KiwiVM 面板里的 VEID
npx wrangler secret put BWH_API_KEY      # KiwiVM 面板 API 页的 private_ 开头的 Key
npx wrangler secret put KIWIVM_BASE      # 中转地址，例如 https://relay.example.com/kiwivm/v1
npx wrangler secret put KIWIVM_RELAY_TOKEN  # 与中转的共享口令一致
```

| 变量 | 必填 | 说明 |
|---|---|---|
| `ACCESS_TOKEN` | 否 | 设置后必须带 `?token=<值>` 才能访问；不设置则公开可读 |
| `BWH_VEID` | 是 | KiwiVM 的 VEID |
| `BWH_API_KEY` | 是 | KiwiVM 的 API Key（`private_` 开头） |
| `KIWIVM_BASE` | 否 | 中转基地址，默认 `https://api.64clouds.com/v1`（直连，当前会失败） |
| `KIWIVM_RELAY_TOKEN` | 否 | 设置后每个上游请求带 `X-Relay-Token` 头，供中转做共享口令校验 |

`BWH_VEID`、`BWH_API_KEY`、`ACCESS_TOKEN` 一律走 `wrangler secret put`：secret 在 `wrangler deploy` 之间会保留，而 `wrangler.jsonc` 里的明文 `vars` 会被每次部署覆盖，把口令放进去等于每次上云都要重新配一遍。

#### 当前部署

| 项 | 值 |
|---|---|
| Worker | `https://bwh-traffic.aenerv7.workers.dev` |
| 中转 | `https://bwh-traffic.ddtwstudio.com/kiwivm/v1` → 搬瓦工 VPS `magi-bandwagonhost` 上的 Caddy（`/etc/caddy/Caddyfile`） |
| 证书 | `/etc/ssl/ddtwstudio.com.fullchain`（`*.ddtwstudio.com` 通配，acme.sh 每日 00:00 UTC 续期） |
| DNS | `bwh-traffic.ddtwstudio.com` A `23.106.154.176`，DNS only（不经过 Cloudflare 代理） |

### 中转

任何不在 Cloudflare 上的 HTTP 服务都行，只需把 `/getServiceInfo` 连同查询串转发给 `https://api.64clouds.com/v1/getServiceInfo`。自己的 VPS 用 Caddy（当前实现）：

```caddyfile
bwh-traffic.ddtwstudio.com {
    tls /etc/ssl/ddtwstudio.com.fullchain /etc/ssl/ddtwstudio.com.key

    # 只放行 Worker 的 getServiceInfo，且必须带共享口令，避免变成开放代理
    @relay {
        method GET
        path /kiwivm/v1/getServiceInfo
        header X-Relay-Token <共享口令>
    }

    handle @relay {
        uri strip_prefix /kiwivm
        reverse_proxy https://api.64clouds.com {
            header_up Host api.64clouds.com
        }
    }

    handle {
        respond "Forbidden" 403
    }
}
```

改完 `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` 再 `systemctl reload caddy`。`<共享口令>` 与 Worker 的 `KIWIVM_RELAY_TOKEN` 必须一致，换口令要同时改两处并 `wrangler secret put`。

nginx 等价写法：

```nginx
location = /kiwivm/v1/getServiceInfo {
    if ($http_x_relay_token != "<共享口令>") { return 403; }
    if ($request_method != GET) { return 403; }

    proxy_pass https://api.64clouds.com/v1/getServiceInfo;
    proxy_ssl_server_name on;
    proxy_set_header Host api.64clouds.com;
}
```

中转域名也可以放在 Cloudflare 后面：被拒的是 Cloudflare 访问 `api.64clouds.com` 这条腿，不是 Cloudflare 访问你自己的源站。其他形态同理（Deno Deploy、另一台 VPS、家里的机器 + Cloudflare Tunnel 等），Worker 只管把 `/getServiceInfo` 接到 `KIWIVM_BASE` 后面。

### 在 Sub-Store 里用

填到**单条订阅编辑弹窗里的「订阅流量信息」字段**（英文界面是 `Subscription-Userinfo`，占位符写着「值/链接」，问号弹窗标题是「手动设置订阅流量信息」）：

```text
https://bwh-traffic.aenerv7.workers.dev/?token=<ACCESS_TOKEN>
```

不要填到订阅自己的「订阅链接」里：那个字段的内容会被当节点订阅解析，本 Worker 没有节点。组合订阅也有同名「订阅流量信息」字段，填法一样。

行为取自上游 `backend/src/utils/flow.js` 的 `getFlowHeaders`：GET 这个 URL → 先 `parseFlowHeaders(正文)`，正文里 `upload` / `download` / `total` 齐全就用正文，否则退回响应头 `subscription-userinfo` / `profile-web-page-url` / `plan-name`。本 Worker 两条路都是同一串值。

想每次都拿最新用量（Sub-Store 对流量信息有缓存）就在地址后加片段参数：

```text
https://bwh-traffic.aenerv7.workers.dev/?token=<ACCESS_TOKEN>#noCache
```

`#headersCacheTtl=60` 也可以，单位秒。

### 排查

```powershell
## 回显上游 HTTP 状态、返回字段、原始正文和算出来的 userinfo
curl.exe "https://<worker 域名>/?debug=1&token=<ACCESS_TOKEN>"

## 单元测试
node --test bwh-traffic/worker.test.js
```

`upstream_keys` 是 `["success","token"]` 就说明还在走 Cloudflare 出口，`KIWIVM_BASE` 没配好或中转自己也在 Cloudflare 上。

### 维护约束

- 成功响应近几个月是平铺字段（`error`、`plan_monthly_data`、`data_counter`、`monthly_data_multiplier`、`data_next_reset`）；代码兼容网关加 `data` 信封的情况。
- 正文与 `subscription-userinfo` 必须同值：Sub-Store 的流量信息 URL 先读正文，正文非法才回退响应头。
- 用量一律按字节、口径为 `字段 × monthly_data_multiplier`；搬瓦工双向计费，已用量统一写进 `download`。
- `expire` 用 `data_next_reset`（下次流量重置时间），不是套餐到期时间。这是 Sub-Store 流量条能拿到的最接近的值。
- `redirect: "manual"` + 3xx 判失败：Workers 不支持 `redirect: "error"`，所以手动拒绝重定向，避免 API Key 被转发到第二个主机。
