# Dox

自用的 Windows/macOS 工具、浏览器扩展、用户脚本和界面定制合集。各目录基本是独立模块，可按需直接运行、安装或构建；仓库没有统一的根级构建命令。

## 从哪里开始

- 想直接使用某个工具：看本页对应小节；仓库只保留这一份 `README.md` 和一份 `DEVELOPMENT.md`。
- 想构建、测试或修改实现：看 [`DEVELOPMENT.md`](./DEVELOPMENT.md)，其中记录唯一的维护者文档、模块边界和验证命令。
- 想处理 Edge 默认关联残留：先运行 `Scripts/RemoveMSEdge.bat -audit-associations`，确认后再使用 `-repair-associations`；这两个入口只检查/修复关联，不会卸载 Edge。
- 想安装或升级 FFmpeg：运行 `Scripts/InstallFFmpeg.ps1`，它升级 `PATH` 中 `ffmpeg.exe` 所在的那份安装，重复运行即替换为新版本；`PATH` 里没有 `ffmpeg.exe` 时脚本不安装任何东西。

## 功能一览

| 模块 | 说明 |
|---|---|
| [`CSS`](./CSS) | 中文字体映射 CSS |
| [`DeepSeek Harness/Launcher`](#deepseek-harness-launcher) | Windows 托盘监督器，负责启动、停止和重启本地 DeepSeek Harness |
| [`Dox Reader/Cloudflare Workers`](./Dox%20Reader/Cloudflare%20Workers) | 本地 RSS/Atom 阅读器，使用 WebDAV 同步，可部署到 Cloudflare Workers |
| [`Firefox/Add-Ons/Dox Reader`](./Firefox/Add-Ons/Dox%20Reader) | Dox Reader 的 Firefox 扩展（Manifest V3，桌面版与 Android 版） |
| [`Firefox/Add-Ons/AutoSortBookmarks`](./Firefox/Add-Ons/AutoSortBookmarks) | Firefox 书签自动整理扩展 |
| [`Firefox/fix_duplicate.py`](./Firefox/fix_duplicate.py) | 清理让「设置 > 默认应用」重复显示 Firefox 或 Zen 的注册表项 |
| [`Firefox/user.js`](./Firefox/user.js) | Firefox 用户层偏好配置（字体、侧栏、表单与隐私选项；不修改应用包） |
| [`foo_vespertine_analyze`](./foo_vespertine_analyze) | foobar2000 组件：找出假 Hi-Res 文件（位深填充、有损来源、合成高频、上采样） |
| [`Scripts`](./Scripts) | Windows 批处理工具、Edge 关联清理辅助脚本和 FFmpeg 安装脚本 |
| [`Scripts/Flatten.bat`](./Scripts/Flatten.bat) | Windows 目录展平工具 |
| [`Scripts/PowerShell/Fix-DriveIcon.ps1`](./Scripts/PowerShell/Fix-DriveIcon.ps1) | 诊断并修复「此电脑」里显示不对的磁盘图标 |
| [`Scripts/InstallFFmpeg.ps1`](./Scripts/InstallFFmpeg.ps1) | 下载最新 FFmpeg full 构建并就地升级 `PATH` 中已有的那份安装 |
| [`Scripts/RemoveMSEdge.bat`](./Scripts/RemoveMSEdge.bat) | Microsoft Edge 清理脚本（保留 WebView2），带关联审计/修复入口 |
| [`Scripts/RemoveMSEdgeAll.bat`](./Scripts/RemoveMSEdgeAll.bat) | Microsoft Edge 与 WebView2 的完整清理脚本 |
| [`Scripts/Userscripts`](./Scripts/Userscripts) | Tampermonkey/Greasemonkey 用户脚本 |
| [`Scripts/rename-apk.ps1`](./Scripts/rename-apk.ps1) | 只修改 APK 应用名称、保持包名与签名身份不变的脚本 |
| [`SizerSwift`](./SizerSwift) | macOS 菜单栏窗口调整工具 |
| [`SizerWin`](./SizerWin) | 不依赖 AutoHotkey 运行时的原生 Windows 窗口调整工具 |
| [`Thunderbird`](./Thunderbird) | 从 Firefox 配置筛选并适配的 Thunderbird 用户层 user.js（字体、语言、滚动和拼写检查） |
| [`Windhawk/CJKSpacer`](./Windhawk/CJKSpacer) | 为 Explorer 菜单和 Tooltip 的中日韩字符边界补空格的 Windhawk 模组 |
| [`bwh-traffic`](./bwh-traffic) | 把 BandwagonHost KiwiVM 流量转成 Sub-Store 订阅头 `subscription-userinfo` 的 Worker |
| [`sub-store`](./sub-store) | Sub-Store 后端的 Cloudflare Workers 部署（D1 持久化、路径口令鉴权、每日自动更新） |
| [`sub-store-front-end`](./sub-store-front-end) | Sub-Store 前端的 Cloudflare Workers 静态资源部署 |

## Dox Reader

Web 版源码位于 [`Dox Reader/Cloudflare Workers`](./Dox%20Reader/Cloudflare%20Workers)，Cloudflare Worker 项目名为 `dox-reader`；Firefox 扩展源码位于 [`Firefox/Add-Ons/Dox Reader`](./Firefox/Add-Ons/Dox%20Reader)，扩展 ID 为 `dox-reader@magi`，桌面版与 Android 版均最低支持 Firefox 142。两个版本使用同一套阅读器逻辑，功能一致：扩展直接请求订阅源和原文页面，Web 版经同源 Worker 代理；都不依赖服务端存储或定时抓取。

- RSS/Atom 订阅、文章正文和阅读状态保存在当前浏览器的 IndexedDB，可阅读已缓存文章。对于只有摘要的订阅，打开文章后点击“获取全文”可按需从原网页提取正文和主图；提取结果只保存在本机。
- 默认外观为 Material 3，亮暗模式跟随系统；已有本机设置或 WebDAV 同步的个人配色保持不变。
- 支持搜索、收藏、已读/未读、订阅编辑和 OPML 导入导出。
- 在设置中填写 HTTPS WebDAV URL 前缀、用户名和应用密码，手动点击“立即同步”同步；输入时不会自动检测，URL 无效时“立即同步”按钮置灰，同步出错即视为未连通并显示错误。自动使用该目录下的 `Dox Reader/state.json`。
- WebDAV 只同步订阅、已读/收藏状态、刷新时间和外观/阅读偏好，不上传文章正文、图片、凭据或本机布局。新设备同步订阅后会首次抓取文章。
- 自动刷新默认 24 小时，按每个订阅源上次成功更新的时间单独判断；可在设置中以整数小时调整，设为 0 关闭（当前设备）。页面打开时每分钟检查一次，回到页面或恢复网络时补查；失败后至少间隔 5 分钟重试，关闭页面后不运行。
- 自动刷新、单源刷新与右上角全部刷新共用队列，全部刷新会接入正在刷新的源，避免重复请求；刷新期间同步按钮置灰，全局刷新时“全部标为已读”也置灰；单源或自动刷新只禁用该源的编辑、删除按钮，标记已读不受后台刷新影响。每个正在刷新的订阅源按钮都播放动画（自动刷新同样生效），右上角刷新按钮只在全局刷新时播放动画。
- 不配置 WebDAV 也可本地使用。关闭页面后不会继续抓取；清除本机数据不会删除 WebDAV 文件。
- Web 版的 Worker 只提供静态资源和 RSS/原文/WebDAV 无状态跨域代理，不存储文章或运行定时抓取。WebDAV 凭据经过该代理，请使用自己信任的部署及专用应用密码。

部署（Node.js 24+，需要 Cloudflare 账号）：

```powershell
cd "Dox Reader/Cloudflare Workers"
npm ci
npm run deploy
```

也可在 Windows 运行该目录的 `deploy-cloudflare.cmd`。部署后打开 Wrangler 输出的地址即可使用；不是静态文件双击运行。隐私说明见 [`PRIVACY.md`](./Dox%20Reader/Cloudflare%20Workers/PRIVACY.md)。

## 中文字体映射

通过 `@font-face` 将常见英文字体名、CSS 通用字体族名和旧式中文字体名映射到现代中文字体，优化网页中文显示。

以下两个文件共享同一套映射规则，修改时需同步维护：

- [`CSS/font-face.css`](./CSS/font-face.css) — 可独立引用的 CSS
- [`Scripts/Userscripts/中文字体优化.user.js`](./Scripts/Userscripts/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.user.js) — Tampermonkey 用户脚本版本

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

### SizerWin

原生 Windows 窗口调整工具，使用纯 C + Win32 API 编写，编译为独立 exe，不依赖脚本运行时。适用于脚本宿主被游戏反作弊拦截的场景。

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

### foo_vespertine_analyze

foobar2000 组件（原生 DLL，Win32 / x64 / ARM64EC），检查文件是不是**假的 Hi-Res**：容器写着 24-bit / 96 kHz，内容却是 16-bit 填充或 44.1 kHz 上采样来的。

分析逻辑移植自 macOS 应用 [Vespertine](https://github.com/szeremeta1/Vespertine)：判定顺序、阈值和结论文字都原样保留，C++ 实现在 11 个已知答案用例上与上游 Swift 实现输出逐字节一致。Vespertine 的播放引擎（CoreAudio、AUSpatialMixer、SwiftUI）在 Windows 上没有对应实现，但它的分析部分与平台无关。

结论按 Vespertine 的顺序判定，每条带置信度：

| 结论 | 含义 |
|---|---|
| `Looks genuine` | 没发现可疑之处 |
| `Zero-padded (fake bit depth)` | 低位全是 0，16-bit 内容装在 24-bit 容器里（硬证据，置信度 100%） |
| `Upsampled` | Nyquist 之上是镜像副本，或截止点落在 19.6–24.5 kHz |
| `Possible lossy origin` | 有编码器式的陡峭截止「墙」，多半来自 MP3/AAC |
| `High frequencies synthesized` | 高频是合成补的：台阶 + 平坦 shelf + 电平跟随音乐 |
| `Not applicable` | 数字静音、太短或解码失败，判不了 |

报告窗口是一个三列单选列表：绝对路径、声称的格式和数据、可能的实际格式和数据；没问题时后两列完全一样，一眼就能看出哪些行不对劲。选中某行，底部显示这一条的完整分析结果（结论、置信度、Vespertine 的说明文字和测到的数字），下面是这次解码的**长期频谱图**：对数频率轴、dBFS 纵轴，检测到截止频率时用虚线标出该位置。

用法：

- 选中曲目 → 右键 → `Vespertine` → `Check for fake Hi-Res`
- 主菜单 `View` → `Vespertine` → 分析当前播放列表里选中的曲目
- `Show last report` 重新打开上一次的报告窗口

扫描在后台线程进行，可随时中止；单曲解码失败只影响那一行（显示 `Not applicable` 并写出原因）。

构建需要 foobar2000 SDK 2026-10-01 和 Visual Studio（2022 及更新版本均可）：把 SDK 解压到工程默认查找的 `..\..\foobar2000-sdk`（或改工程属性里的 `Fb2kSdkDir`），然后：

```powershell
cd foo_vespertine_analyze
.\package.ps1
```

产物是 `build\x64\Release\foo_vespertine_analyze.fb2k-component`，拖进 foobar2000 窗口（或 Preferences → Components → Install）即可安装，落在 `user-components-x64\foo_vespertine_analyze\`。32-bit 版用 `.\package.ps1 -Platform Win32`。

已知限制：只做频谱与位深取证，不识别 Dolby Atmos 等格式；不写标签、不做自动播放列表；采样率高于 768 kHz 的文件直接跳过；32-bit 版 foobar2000 可用但慢，大批次建议用 64-bit 版。

模块边界、移植约定和验证步骤见仓库根文档 [`DEVELOPMENT.md`](DEVELOPMENT.md#318-foo_vespertine_analyzefoobar2000-假-hi-res-检查)。

## SizerSwift

macOS 原生窗口调整工具，常驻菜单栏，使用 Swift 编写，最低支持 macOS 13。功能是 Windows 版 [`SizerWin`](#sizerwin) 的 macOS 对应实现，界面遵循 macOS 菜单栏应用规范。

点击菜单栏图标即可在光标处弹出菜单，也可以给「显示菜单」绑定全局快捷键：

- **自动**：调整到所在屏幕工作区约 3/4 并居中
- **居中 / 水平居中 / 垂直居中**：保持尺寸，只移动位置
- **预设分辨率**：直接设为 `640x480`、`1920x1080` 等常用尺寸；按住 `⌥` 点击则同时居中，菜单标题会实时变成「调整并居中 1920x1080」
- **自定义…**：输入宽高后调整，`Return` 调整尺寸、`⌘Return` 调整并居中、`Esc` 取消
- **打开配置文件所在目录**：在 Finder 中定位 `SizerSwift.ini`，改完保存后下次打开菜单生效
- **开机自启动**：勾选切换登录项

窗口移动和缩放都是 0.25 秒缓动动画，和 macOS 原生窗口操作一样平滑；系统开启「减弱动态效果」时直接落位。

默认不绑定任何快捷键，需要自己在 ini 的 `[Hotkeys]` 里配置（默认 ini 里附有注释和示例）：

- 示例：`Auto = ctrl+opt+cmd+c` — 调整到屏幕工作区约 75% 并居中
- 示例：`Centre = opt+cmd+c` — 居中当前窗口，保持原尺寸

其它说明：

- 菜单栏常驻图标，无 Dock 图标
- 全屏和最小化的窗口不响应，桌面与菜单栏不会被误当成窗口
- 多显示器支持，基于窗口所在屏幕的工作区避开菜单栏和 Dock
- 优先使用辅助功能 API 直接操作窗口；不暴露窗口的应用会回退到模拟拖拽标题栏，回退路径只能移动、不能调整尺寸
- 支持英语、繁体中文和简体中文

首次使用需要在“系统设置 → 隐私与安全性 → 辅助功能”中授权。未授权时菜单顶部会出现「打开辅助功能权限…」，授权后重新打开菜单即可生效，无需重启。

预设和快捷键都写在 `~/Library/Application Support/SizerSwift/SizerSwift.ini`，首次运行自动生成，改完不用重启程序（下次打开菜单生效）：

```ini
[Horizontal]
640x480
1920x1080

[Vertical]
720x1280

[Hotkeys]
; 默认全部留空（不绑定）。格式：修饰键+按键，修饰键取 ctrl / opt / cmd / shift，
; 且至少包含 ctrl / opt / cmd 之一；留空表示不绑定，保存后下次打开菜单即生效。
; 示例（删掉行首的 "; " 即生效）：
; Auto = ctrl+opt+cmd+c
; Centre = opt+cmd+c
ShowMenu =
Auto =
Centre =
CentreHorizontal =
CentreVertical =
Custom =
```

一键构建并安装到 `/Applications`（会先退出正在运行的实例）：

```bash
cd SizerSwift
./build.sh --install
```

只构建、产物留在 `SizerSwift/build/SizerSwift.app`：

```bash
cd SizerSwift
./build.sh
```

构建时可用 `--identity <证书名称>` 指定本机钥匙串里的代码签名证书（证书由使用者自己提供，仓库不生成）：签名身份固定后，TCC 与开机自启动按 designated requirement 记录授权，覆盖升级不需要重新授权。不传 `--identity` 就用 ad-hoc 签名，DR 就是 cdhash，产物一变授权就失效。导入证书、查看可用身份的方法见 `./build.sh --help`。

自签名包过不了 Gatekeeper。把 `SizerSwift.app` 拷给别人时对方首次打开会被拦下（或者在带隔离属性时报「已损坏」），需要在「系统设置 → 隐私与安全性」里手动放行、并自行授权辅助功能；完整步骤见 [`SizerSwift/INSTALL.md`](./SizerSwift/INSTALL.md)。

完整实现架构、配置格式和维护说明见仓库根 [`DEVELOPMENT.md`](./DEVELOPMENT.md)。

## Firefox 用户层配置

[`Firefox/user.js`](./Firefox/user.js) 使用 `user_pref()`，在 Firefox 每次启动时应用到当前个人配置，**不需要修改安装目录或 macOS 的 `Firefox.app`**。这是偏好配置文件，不是 Tampermonkey 用户脚本，不应导入用户脚本管理器。

### 配置内容与注意事项

- 四类字体候选、平滑滚动、首选内容语言、关闭拼写检查，以及加载个人配置目录 `chrome/` 下的 `userChrome.css` / `userContent.css`；字体需预先安装，缺失时由系统回退。字体候选不会强制覆盖网页自带字体，语言列表不是界面语言。
- 侧栏使用垂直标签页与悬停展开；关闭部分 AI、推荐和赞助内容、翻译自动弹窗等。部分键受 Firefox 版本或平台影响，配置编辑器显示键值不等于该版本实际使用它。
- **关闭保存新密码、密码自动填充与生成，并关闭地址/信用卡自动填充和表单历史填充**；不会因此删除已有密码。Sync 的地址和信用卡同步开关仍为开启，关闭自动填充不等于停止同步；应用前按需调整。
- **开启退出时清理，清理项包括表单数据；保留历史与下载记录、Cookie 和站点存储**。实际清理行为还取决于版本和其他已有设置，应用前请核对 Firefox「隐私与安全」中的退出清理选项。
- **自动提交待发送的崩溃报告**，并允许隐私窗口中的搜索建议；这不是关闭所有遥测或所有联网请求的加固方案。WebRTC 项仅约束部分 ICE 地址候选，不是禁用 WebRTC，也不保证隐藏所有地址。
- 文件末尾以 `//` 注释的可选项不生效，包括自动更新开关；本配置没有禁用自动更新。不要将整个 Firefox 文件复制给 Thunderbird，后者使用单独筛选过的版本。

### 安装、修改与卸载

1. 在 Firefox 地址栏打开 `about:support`，找到「配置文件夹」并打开目录（macOS 通常为「在访达中显示」）。以这个目录为准，不要误用浏览器安装目录。
2. **完全退出 Firefox**，备份该个人配置，尤其是已有的 `user.js` 和 `prefs.js`。
3. 把 [`Firefox/user.js`](./Firefox/user.js) 复制为配置目录里的 `user.js`，与 `prefs.js` 同级。已有 `user.js` 时先合并并处理重复键，不要直接覆盖；不要改写 `prefs.js`。
4. 重启后在 `about:config` 核对所需项，并在设置页和实际浏览中确认效果。多个个人配置需分别安装。

常见个人配置路径（以 `about:support` 显示的实际路径为准）：

| 系统 | 路径示例 |
|---|---|
| macOS | `~/Library/Application Support/Firefox/Profiles/<配置名>/user.js` |
| Windows | `%APPDATA%\Mozilla\Firefox\Profiles\<配置名>\user.js` |
| Linux | `~/.mozilla/firefox/<配置名>/user.js`；Snap/Flatpak 等打包版本可能不同 |

`user.js` 不锁定偏好，但每次启动都会重新应用其中的值。希望长期修改时，应同时修改该文件；只改界面选项可能在下次启动时被覆盖。文件只写声明式 `user_pref()`，不要加入循环、导入等普通 JavaScript 逻辑。

卸载时先退出 Firefox，再删除该 `user.js`（合并安装时只移除本配置的项），重启后在 `about:config` 重置需要恢复的值。**删文件或注释某行并不会撤销已保存到 `prefs.js` 的值**；不要为了卸载配置而删除整个 `prefs.js`。

### 与旧 AutoConfig 的关系

仓库中的 `Firefox/firefox.cfg` 和 `Firefox/defaults/` 是旧的安装级 AutoConfig 方案；这里推荐使用 `user.js`，不要再把旧方案安装进应用目录。本文未删除 Firefox 旧文件，也未修改你的本机 Firefox 配置。

如果已部署旧方案，先备份个人配置并退出 Firefox，在 Windows/Linux 只移除自己添加的旧 `.cfg` 和对应加载器，或恢复部署前的文件；不要删除组织管理的配置。macOS 如果曾修改 `Firefox.app` 内部，建议用官方原版应用包替换整个已修改的应用，以恢复签名完整性，保留并备份独立的个人配置目录；不要通过临时重签名或关闭系统安全检查处理。随后按上述方式部署 `user.js`，避免新旧入口同时生效。此方案只管理偏好，不会恢复其他工具已修改过的应用资源。

## Thunderbird 配置

[`Thunderbird/user.js`](./Thunderbird/user.js) 与 `Firefox/user.js` 一样使用用户层 `user_pref()`：放在个人配置目录，每次启动时应用，**不修改安装目录或 macOS 的 `Thunderbird.app`，不影响应用包签名**。配置保留四类字体候选、平滑滚动、首选内容语言、关闭通用拼写检查、加载自定义 CSS 和 Alt 菜单焦点设置；另用 Thunderbird 的两个独立开关关闭撰写时及发送前的拼写检查，共 123 项。

不包含 Firefox 的侧栏、垂直标签页、地址栏、新标签页、AI、自动填表、Sync、Relay 和 WebRTC 设置；不照搬退出清理或禁用密码保存，避免影响邮箱凭据与登录状态。不改变账户、服务器、邮件存储、远程内容安全策略或自动更新。

### 安装

1. 在 Thunderbird「帮助 → 故障排除信息」中找到「配置文件夹」，打开当前使用的个人配置目录（macOS 的按钮通常为「在访达中显示」）。
2. **完全退出 Thunderbird**，备份该配置目录，尤其是已有的 `user.js` 和 `prefs.js`。
3. 将 [`Thunderbird/user.js`](./Thunderbird/user.js) 复制到该目录，与 `prefs.js` 同级。已有 `user.js` 时请合并、处理重复键，不要直接覆盖；**不要覆盖或手工追加到 `prefs.js`**。
4. 启动后在「设置 → 常规 → 配置编辑器」核对值，并实际检查邮件显示、滚动和撰写窗口拼写检查。

常见个人配置目录（以 Thunderbird 显示的实际目录为准，不要把文件放在 `Profiles` 父目录）：

| 系统 | 路径示例 |
|---|---|
| macOS | `~/Library/Thunderbird/Profiles/<配置名>/user.js` |
| Windows | `%APPDATA%\Thunderbird\Profiles\<配置名>\user.js` |
| Linux | `~/.thunderbird/<配置名>/user.js`；沙箱打包版本可能不同 |

- 不需要 `thunderbird.cfg`、`defaults/pref/autoconfig.js`、管理员权限或重新签名；多个个人配置需分别部署，只影响放入文件的配置。
- `user_pref()` 不锁定设置，但文件中的值会在每次启动时重新应用；如要长期改值，应同步编辑 `user.js`，不能只改界面选项。不要在文件中加入循环、导入等普通 JavaScript 逻辑。
- 字体需预先安装；缺失时由系统回退。这些是字体候选列表，不强制覆盖 HTML 邮件自带字体，也不指定撰写字体；语言列表不修改界面语言或发信编码。自定义 CSS 需另放在个人配置目录的 `chrome/` 中，本模块不附带样式。
- 卸载时先退出，删除 `user.js`（合并安装时只移除本配置的项），重启后在配置编辑器中逐项重置需要恢复的值；**仅删文件或注释某行不会撤销已写入 `prefs.js` 的偏好值**。不要为重置这些项而删除整个 `prefs.js`，其中还保存账户等设置。

### 从旧 AutoConfig 版本迁移

先备份个人配置。如果之前只在仓库里保存旧文件、未安装到应用目录，直接按上面部署 `user.js` 即可；仓库已移除旧的 `.cfg` 和加载器。

如果实际安装过旧版：完全退出后，在 Windows/Linux 移除本次旧方案添加的 `thunderbird.cfg` 和 `defaults/pref/autoconfig.js`，有预先存在的配置则恢复原文件，不要删除组织管理的 AutoConfig。若曾修改 macOS 的 `Thunderbird.app/Contents/Resources`，建议用官方原版应用包替换整个已修改的 `.app` 以恢复签名完整性，不要临时重签名或关闭系统安全检查；个人配置和邮件位于独立的配置目录，应保留并预先备份。然后按用户层方式部署，避免旧 AutoConfig 与新文件同时生效。

## Firefox 默认应用重复项清理

### 默认应用重复项

清理脚本位于 [`Firefox/fix_duplicate.py`](./Firefox/fix_duplicate.py)，同时处理 Firefox 和 Zen 的注册项。

「设置 > 应用 > 默认应用」每行对应注册表里一条 `RegisteredApplications` 记录，不是一个程序一行。Zen 安装程序把同一个客户端键同时写进机器级和用户级两个位置，于是同一个 Zen 显示两行；Firefox 安装同样会留下机器级与用户级两条：

```text
HKLM\Software\RegisteredApplications   Firefox-<hash> -> Software\Clients\StartMenuInternet\Firefox-<hash>\Capabilities
HKCU\Software\RegisteredApplications   Firefox-<hash> -> 同一目标
                        |
                        +-- 设置 > 默认应用： Zen
                                             Zen
```

只读检查（浏览器运行中也可以执行）：

```powershell
python .\Firefox\fix_duplicate.py detect
```

确认输出后清理：

```powershell
python .\Firefox\fix_duplicate.py fix
```

- 只处理可执行文件名为 `firefox.exe` 或 `zen.exe` 的注册项；Firefox 与 Zen 各自判定，一个浏览器的注册项不会被当成另一个的重复项，其他浏览器不受影响。
- 两处指向同一个可执行文件时删除用户级（HKCU）那条并保留机器级，按用户和按机器两种安装都能保留可用入口。
- 文件已不存在而所在磁盘仍在的注册项按残留删除；磁盘不在的保留，避免误删暂时离线的移动盘安装。
- 同一浏览器有两份都真实存在的可执行文件（两份安装）时不删除，只在输出的 `unresolved` 中列出，由人工判断。
- 删除 HKCU 项不需要管理员权限；涉及 HKLM 项时需要管理员终端，否则以退出码 1 结束并列出失败项。
- 清理后设置页面立即刷新，不需要重启。Zen 再次写入用户级注册时重复项会回来，重跑一次即可。

系统自带的 App Installer 和 Windows 小组件也可能各显示两行，那是同一个 MSIX 包声明了两组 capability（`.msix` 与 `ms-appinstaller:`、`ms-widgetboard:` 与 `ms-widgets:`），属于系统行为，本脚本不处理。

### 文件与备份

`Firefox/fix_duplicate.py` 不写文件，只删除注册表项；删除前可用 `detect` 查看将删除的内容，HKCU 部分可用 `reg export` 自行备份。

## Firefox 扩展

### Auto Sort Bookmarks

[`Firefox/Add-Ons/AutoSortBookmarks`](./Firefox/Add-Ons/AutoSortBookmarks) 是适用于 Firefox 142 及更高版本的 Manifest V3 扩展，递归整理 `Bookmarks Menu` 和 `Other Bookmarks` 两个书签根目录。

- 以分隔线划分互不影响的区段，分隔线位置保持不变
- 每个区段内文件夹置顶并按标题排序
- URL 书签随后按标题、URL 排序，支持自然数字顺序
- 文件夹内部递归使用相同规则
- 在安装、Firefox 启动及书签创建、修改、移动、删除后自动安排排序，并合并连续变化
- 仅在普通 Firefox 浏览器窗口获得焦点时执行，避免用户正在使用 Library 窗口时重排

临时安装：打开 `about:debugging#/runtime/this-firefox`，点击“临时载入附加组件”，选择该目录下的 `manifest.json`。

运行测试：

```powershell
node --test Firefox/Add-Ons/AutoSortBookmarks/tests/sorter.test.js
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

## Userscript

将脚本安装到 Tampermonkey 或 Greasemonkey 后按目标网站使用：

- [`中文字体优化.user.js`](./Scripts/Userscripts/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.user.js) — 全站中文字体优化，与 `CSS/font-face.css` 共用映射规则
- [`EmuParadise Download Workaround.user.js`](./Scripts/Userscripts/EmuParadise%20Download%20Workaround.user.js) — 在 EmuParadise 页面补充可用下载链接，依赖脚本元数据中的 jQuery
- [`Re-add Download Button Vimm's Lair.user.js`](./Scripts/Userscripts/Re-add%20Download%20Button%20Vimm's%20Lair.user.js) — 在 Vimm's Lair 下载按钮被移除时恢复提交按钮
- [`VGMdb Tracklist Copy Button.user.js`](./Scripts/Userscripts/VGMdb%20Tracklist%20Copy%20Button.user.js) — 在 VGMdb 专辑页曲目列表的序号与标题之间插入复制按钮，点击复制该曲名；多语言 tracklist 的每个语言块都有按钮

## ApkRename（APK 改名）

[`Scripts/rename-apk.ps1`](./Scripts/rename-apk.ps1) 是只修改 Android APK 应用名称的 PowerShell 脚本：基于 apktool 反编译，仅改动名称相关的清单/字符串资源，重新打包并用原 keystore 重新签名，包名、代码与其余资源保持不变，最后还会做逐文件哈希校验。工具（apktool、apksigner、zipalign、aapt）可自动下载到脚本目录 `tools\` 下（`.\Scripts\rename-apk.ps1 -SetupTools`）。签名“字节”必然变化（内容变了），但只要使用原 keystore，签名“身份”（同一证书）保持不变，可覆盖安装。

只修改 Android APK 的**应用名称**（`android:label`），其余内容、**包名**、**签名身份**全部保持不变。

### 用法

```powershell
## 第一步（可选但推荐）：把全部工具下载到脚本同目录的 tools\ 下，之后可离线使用
.\Scripts\rename-apk.ps1 -SetupTools

## 最常用：改名称，并用原 keystore 重新签名（保持同一签名身份）
.\Scripts\rename-apk.ps1 -ApkPath .\app.apk -NewName "新应用名" -KeyStore release.jks -KeyAlias mykey -StorePass 123456

## 不提供 keystore：自动生成临时 debug 证书（签名身份会变，需先卸载旧版再安装）
.\Scripts\rename-apk.ps1 .\app.apk "新应用名"

## 只改名称、不签名（输出 APK 无法直接安装，仅用于查看/二次处理）
.\Scripts\rename-apk.ps1 .\app.apk "新应用名" -SkipSign

## 手动指定工具目录 / 指定 build-tools 版本
.\Scripts\rename-apk.ps1 .\app.apk "新应用名" -ToolsDir D:\tools
.\Scripts\rename-apk.ps1 .\app.apk "新应用名" -BuildToolsVersion 35.0.0

## 若执行策略限制：
powershell -ExecutionPolicy Bypass -File .\Scripts\rename-apk.ps1 -ApkPath .\app.apk -NewName "新应用名" ...
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
运行 `.\Scripts\rename-apk.ps1 -SetupTools` 可一次下载齐全。

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
| 提示找不到 apksigner / zipalign | 先运行 `.\Scripts\rename-apk.ps1 -SetupTools` 自动下载，或用 `-ToolsDir` 指定目录 |
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

### 磁盘图标

[`Scripts/PowerShell/Fix-DriveIcon.ps1`](./Scripts/PowerShell/Fix-DriveIcon.ps1) 诊断并修复「此电脑」里显示不对的磁盘图标。默认只读，不改任何东西。

```powershell
powershell -ExecutionPolicy Bypass -File .\Scripts\PowerShell\Fix-DriveIcon.ps1
powershell -ExecutionPolicy Bypass -File .\Scripts\PowerShell\Fix-DriveIcon.ps1 -Drive P -Repair
powershell -ExecutionPolicy Bypass -File .\Scripts\PowerShell\Fix-DriveIcon.ps1 -Drive Q -SetIcon .\disk.ico
```

- 图标来源固定三层：注册表 `DriveIcons\<盘符>\DefaultIcon` → 盘根 `autorun.inf` 的 `Icon=` → 卷类型的内置图标（`DriveType 3` 硬盘、`2` 可移动磁盘），脚本逐层报告命中了哪一层
- `-Drive` 只查指定盘（`P` 或 `P,Q`），省略则检查所有卷
- `-Repair` 删除指向不存在文件的注册表覆盖项（先 `reg export` 备份），注释 `autorun.inf` 里失效的 `Icon=`（先备份 `.bak`）
- `-SetIcon` 把 `.ico` 复制到盘根并写入 `autorun.inf`，图标跟着盘走，换电脑也不丢
- `-RebuildCache` 重建当前用户图标缓存，会重启 `explorer.exe`
- 需要 PowerShell 5.1+；卷被外壳芯片报告为「可移动磁盘」时类型改不了，只能用 `-SetIcon` 覆盖

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

## Sub-Store

把上游 [Sub-Store](https://github.com/sub-store-org/Sub-Store) 与 [Sub-Store-Front-End](https://github.com/sub-store-org/Sub-Store-Front-End) 部署到两个 Cloudflare Worker，全部落在免费额度内。上游源码不入库，构建期按 release tag 拉取。

| 目录 | Cloudflare Worker | 说明 |
|---|---|---|
| [`sub-store`](./sub-store) | `sub-store` | 后端：D1 存数据，路径口令鉴权，CORS 全域放行 |
| [`sub-store-front-end`](./sub-store-front-end) | `sub-store-front-end` | 前端：上游 release 产物，纯静态资源 |

部署由 [`.github/workflows/deploy-sub-store.yml`](./.github/workflows/deploy-sub-store.yml) 负责：**每天北京时间 05:00** 自动拉取两者最新 release 重新部署，也可在 Actions 页面手动触发。维护规范见 [`DEVELOPMENT.md`](./DEVELOPMENT.md#313-sub-storecloudflare-workers)。

### sub-store 后端

把 [Sub-Store](https://github.com/sub-store-org/Sub-Store) 后端跑在 Cloudflare Workers 上，用 D1 存数据、用路径口令鉴权，全部落在免费额度内。

前端见 [`sub-store-front-end`](#sub-store-front-end-前端)。维护规范见仓库根 [`DEVELOPMENT.md`](DEVELOPMENT.md#313-sub-storecloudflare-workers)。

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

后端见 [`sub-store`](#sub-store-后端)。维护规范见仓库根 [`DEVELOPMENT.md`](DEVELOPMENT.md#313-sub-storecloudflare-workers)。

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

Sub-Store 从远程订阅的响应头里读 `subscription-userinfo`（`upload` / `download` / `total` / `expire`）。本 Worker 提供这个头；普通客户端（Sub-Store、curl）拿到的正文是同一串 userinfo，浏览器（`Accept: text/html`）拿到的是一张用量面板。两条路都不含任何节点。

```text
Sub-Store ──▶ bwh-traffic Worker ──▶ 中转 ──▶ api.64clouds.com/v1/getServiceInfo
                    │
                    ├─ 响应头: subscription-userinfo: upload=0; download=<已用>; total=<配额>; expire=<下一年 1 月 1 日>
                    └─ 正文: 同一个串（Sub-Store）；浏览器则是一张用量面板
```

### 它为什么需要中转

**Cloudflare Worker 现在无法直连 KiwiVM API。** `api.64clouds.com` 在 Cloudflare 后面，其网关对来自 Cloudflare 自身出口的 `/v1/*` 请求一律返回：

```json
{ "success": true, "token": 38481974907714 }
```

无论 GET / POST、有无 User-Agent、是否带浏览器头、换 host 或路径，结果都一样；同一个请求从非 Cloudflare 出口（本机 curl、第三方 reader）就能拿到正常响应。也就是说 VEID 和 API Key 根本没参与校验——换个错的 Key 也是同样的 token 响应。2026-10 实测结论，详见 [DEVELOPMENT.md 第 3.14 节](DEVELOPMENT.md#314-bwh-trafficbandwagonhost-流量订阅头)。

所以 `KIWIVM_BASE` 必须指向一个不在 Cloudflare 上的中转，由它转发 `/getServiceInfo`。没有中转时 Worker 会明确报错并提示这一条。

### 部署

```powershell
cd bwh-traffic
npx wrangler deploy
npx wrangler secret put RELAY_TOKEN      # 中转共享口令，只发给中转，不用于访问
npx wrangler secret put BWH_VEID         # KiwiVM 面板里的 VEID
npx wrangler secret put BWH_API_KEY      # KiwiVM 面板 API 页的 private_ 开头的 Key
npx wrangler secret put KIWIVM_BASE      # 中转地址，例如 https://bwh-traffic.ddtwstudio.com
```

| 变量 | 必填 | 说明 |
|---|---|---|
| `RELAY_TOKEN` | 否 | 作为 `X-Relay-Token` 发给中转（不设置则不发该头），中转凭它确认请求来自本 Worker；**不参与访问鉴权**。值只能用 URL 安全字符 |
| `BWH_VEID` | 是 | KiwiVM 的 VEID |
| `BWH_API_KEY` | 是 | KiwiVM 的 API Key（`private_` 开头） |
| `KIWIVM_BASE` | 否 | 中转基地址，只填 origin，Worker 自己接 `/getServiceInfo`；默认 `https://api.64clouds.com/v1`（直连，当前会失败） |

`BWH_VEID`、`BWH_API_KEY`、`RELAY_TOKEN` 一律走 `wrangler secret put`：secret 在 `wrangler deploy` 之间会保留，而 `wrangler.jsonc` 里的明文 `vars` 会被每次部署覆盖，把口令放进去等于每次上云都要重新配一遍。

#### 当前部署

| 项 | 值 |
|---|---|
| Worker | `https://bwh-traffic.aenerv7.workers.dev` |
| 中转兼面板入口 | `https://bwh-traffic.ddtwstudio.com` → 搬瓦工 VPS `magi-bandwagonhost` 上的 Caddy（`/etc/caddy/Caddyfile`）：`/getServiceInfo` 转发到 KiwiVM，其余路径反代回 Worker |
| 证书 | `/etc/ssl/ddtwstudio.com.fullchain`（`*.ddtwstudio.com` 通配，acme.sh 每日 00:00 UTC 续期） |
| DNS | `bwh-traffic.ddtwstudio.com` A `23.106.154.176`，DNS only（不经过 Cloudflare 代理，必须如此，见下） |

### 中转

任何不在 Cloudflare 上的 HTTP 服务都行，只需把 `/getServiceInfo` 连同查询串转发给 `https://api.64clouds.com/v1/getServiceInfo`。自己的 VPS 用 Caddy（当前实现，中转域名专用于本 Worker，所以路径没有额外前缀）：

```caddyfile
bwh-traffic.ddtwstudio.com {
    tls /etc/ssl/ddtwstudio.com.fullchain /etc/ssl/ddtwstudio.com.key

    # 只放行 Worker 的 getServiceInfo，且必须带共享口令，避免变成开放代理
    @relay {
        method GET
        path /getServiceInfo
        header X-Relay-Token <RELAY_TOKEN>
    }

    handle @relay {
        uri replace /getServiceInfo /v1/getServiceInfo
        reverse_proxy https://api.64clouds.com {
            header_up Host api.64clouds.com
        }
    }

    # 其余路径（浏览器面板、Sub-Store）反代回 Worker。
    # Worker 取 /getServiceInfo 时命中的是上面的 @relay，不会回到这里，所以不自环。
    handle {
        reverse_proxy https://bwh-traffic.aenerv7.workers.dev
    }
}
```

Worker 不校验路径，两个域名的任意路径都回同一份数据，`https://bwh-traffic.ddtwstudio.com/` 和 `https://bwh-traffic.aenerv7.workers.dev/` 等价，Sub-Store 填哪个都行。

**这个域名必须保持 DNS only。** 一旦改成橙云代理（或把 Worker 挂成它的自定义域/路由），Worker 再取 `https://bwh-traffic.ddtwstudio.com/getServiceInfo` 时就落不到 Caddy 上，Cloudflare 会回 `error code: 522`，Sub-Store 那边直接 502。

改完 `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` 再 `systemctl reload caddy`。`<RELAY_TOKEN>` 只保护中转，与访问无关：换口令要同时改 Caddyfile 和 `wrangler secret put RELAY_TOKEN`。

nginx 等价写法：

```nginx
location = /getServiceInfo {
    if ($http_x_relay_token != "<RELAY_TOKEN>") { return 403; }
    if ($request_method != GET) { return 403; }

    proxy_pass https://api.64clouds.com/v1/getServiceInfo;
    proxy_ssl_server_name on;
    proxy_set_header Host api.64clouds.com;
}
```

中转域名原则上也可以放在 Cloudflare 后面（被拒的是 Cloudflare 访问 `api.64clouds.com` 这条腿，不是 Cloudflare 访问你自己的源站），但**不能既当 Worker 的对外地址又当中转**：那样 Worker 取它时 CF 按同区回源处理，源站连不上就回 `error code: 522`（2026-10-15 踩过，Sub-Store 直接 502）。其他形态同理（Deno Deploy、另一台 VPS、家里的机器 + Cloudflare Tunnel 等），Worker 只管把 `/getServiceInfo` 接到 `KIWIVM_BASE` 后面。

### 在 Sub-Store 里用

填到**单条订阅编辑弹窗里的「订阅流量信息」字段**（英文界面是 `Subscription-Userinfo`，占位符写着「值/链接」，问号弹窗标题是「手动设置订阅流量信息」）。两个域名通用，不需要任何口令：

```text
https://bwh-traffic.aenerv7.workers.dev/
https://bwh-traffic.ddtwstudio.com/
```

后者经 VPS 的 Caddy 反代到同一个 Worker，参数与响应完全一致。路径随便写都行（`/<任意串>` 与 `/` 同值），旧配置里带口令的地址继续有效。

不要填到订阅自己的「订阅链接」里：那个字段的内容会被当节点订阅解析，本 Worker 没有节点。组合订阅也有同名「订阅流量信息」字段，填法一样。

行为取自上游 `backend/src/utils/flow.js` 的 `getFlowHeaders`：GET 这个 URL → 先 `parseFlowHeaders(正文)`，正文里 `upload` / `download` / `total` 齐全就用正文，否则退回响应头 `subscription-userinfo` / `profile-web-page-url` / `plan-name`。本 Worker 两条路都是同一串值，面板（HTML）只发给浏览器。

Sub-Store 会拿 `expire` 判「订阅已过期」，所以这里写死为下一年 1 月 1 日 UTC 零点，不用 KiwiVM 的流量重置时间。

想每次都拿最新用量（Sub-Store 对流量信息有缓存）就在地址后加片段参数：

```text
https://bwh-traffic.aenerv7.workers.dev/#noCache
```

`#headersCacheTtl=60` 也可以，单位秒。

### 浏览器面板

同一地址用浏览器打开（或 `curl -H "Accept: text/html"`）会得到一张用量面板：已用／配额、进度条、剩余、使用率和到期日，页签图标是内联的 BandwagonHost 标记。面板不引用任何外部资源，`subscription-userinfo` 响应头照旧。两个域名打开都是这张面板。

面板每 60 秒自动刷新一次：页面在原地重取同一地址并只替换卡片内容，不整页重载、不闪屏，页脚会显示最后一次更新时间。刷新失败（例如上游报错）时保留上一次的数据，只在页脚标出失败原因。

### 排查

```powershell
## 回显上游 HTTP 状态、返回字段、原始正文和算出来的 userinfo
curl.exe "https://<worker 域名>/?debug=1"

## 单元测试
node --test bwh-traffic/worker.test.js
```

`upstream_keys` 是 `["success","token"]` 就说明还在走 Cloudflare 出口，`KIWIVM_BASE` 没配好或中转自己也在 Cloudflare 上；`upstream_status` 是 `522` 说明中转域名不再是 DNS only（或它同时被 Worker 占着）。

### 维护约束

- 成功响应近几个月是平铺字段（`error`、`plan_monthly_data`、`data_counter`、`monthly_data_multiplier`、`data_next_reset`）；代码兼容网关加 `data` 信封的情况。`data_next_reset` 只作参考，已不再进 `expire`。
- 正文与 `subscription-userinfo` 必须同值：Sub-Store 的流量信息 URL 先读正文，正文非法才回退响应头。所以正文只在 `Accept` 含 `text/html`（浏览器）时换成 HTML 面板，其余客户端一律拿纯文本；面板里也埋一份同值 userinfo，被正则扫描时数字不变。
- 用量一律按字节、口径为 `字段 × monthly_data_multiplier`；搬瓦工双向计费，已用量统一写进 `download`。
- `expire` 写死为**下一年 1 月 1 日 UTC 零点**，不取上游：`data_next_reset` 是流量重置时间，而 Sub-Store 的 `validCheck` 拿 `expire` 判「订阅已过期」，照抄会误报。
- 标签页图标是内联 SVG 品牌标记：bandwagonhost.com 没有 favicon（`/favicon.ico` 等全是 404），唯一的官方图形是 814×100 的 wordmark，当图标会糊。页面不引用任何外部地址。
- `redirect: "manual"` + 3xx 判失败：Workers 不支持 `redirect: "error"`，所以手动拒绝重定向，避免 API Key 被转发到第二个主机。

## strelaysrv（VPS 私有中继状态页）

状态页入口为 <https://strelaysrv.ddtwstudio.com/>，显示 Syncthing Relay 的运行时长、流量和连接情况，每 60 秒从同域 `/status` 更新；原始状态 JSON 可直接访问 <https://strelaysrv.ddtwstudio.com/status>。

网页与中继服务一起部署在搬瓦工 VPS 的 `/usr/local` 安装前缀下，不在 Cloudflare Workers 上，也不再占用作为文件存储的 `/srv/`。程序、网页、私有配置的实际路径及维护/回滚方法见 [DEVELOPMENT.md 第 3.16 节](./DEVELOPMENT.md#316-strelaysrvvps-私有中继状态页)。
