# Dox

自用的 Windows/macOS 工具、浏览器扩展、用户脚本和界面定制合集。各目录基本是独立模块，可按需直接运行、安装或构建；仓库没有统一的根级构建命令。

## 从哪里开始

- 想直接使用某个工具：先看对应目录的 `README.md`；没有目录说明时看本页对应小节。
- 想构建、测试或修改实现：看 [`DEVELOPMENT.md`](./DEVELOPMENT.md)，其中记录唯一的维护者文档、模块边界和验证命令。
- 想处理 Edge 默认关联残留：先运行 `Batch files/RemoveMSEdge.bat -audit-associations`，确认后再使用 `-repair-associations`；这两个入口只检查/修复关联，不会卸载 Edge。
- 想修改 Helium 翻译：先阅读下方“Helium 语言补丁”，完整实现和测试约束见 [`DEVELOPMENT.md`](./DEVELOPMENT.md#315-heliumlanguagepatcher)。

## 功能一览

| 模块 | 说明 |
|---|---|
| [`AutoHotkey/SizerAHK`](./AutoHotkey/SizerAHK) | AutoHotkey v2 窗口尺寸和位置调整工具 |
| [`SizerWin`](./SizerWin) | 不依赖 AutoHotkey 运行时的原生 Windows 窗口调整工具 |
| [`CapsLockOSD`](./CapsLockOSD) | Windows 原生 Caps Lock 状态屏幕提示 |
| [`SizerSwift`](./SizerSwift) | macOS 菜单栏窗口调整工具 |
| [`Dox Reader`](./Dox%20Reader) | Local-first RSS 阅读器，含 Firefox 扩展版与 Cloudflare Workers 网页版 |
| [`Firefox/AutoSortBookmarks`](./Firefox/AutoSortBookmarks) | Firefox 书签自动整理扩展 |
| [`PortableBridge`](./PortableBridge) | Firefox / Chrome 便携浏览器会话级 HTTP(S) 桥接，最近启动者接管 |
| [`DeepSeek Harness/Launcher`](./DeepSeek%20Harness/Launcher/README.md) | Windows 托盘监督器，负责启动、停止和更新本地 DeepSeek Harness |
| [`Windhawk/CJKSpacer`](./Windhawk/CJKSpacer) | 为 Explorer 菜单和 Tooltip 的中日韩字符边界补空格的 Windhawk 模组 |
| [`CSS`](./CSS) | 中文字体映射和 VS Code 外观自定义 CSS |
| [`Userscript`](./Userscript) | Tampermonkey/Greasemonkey 用户脚本 |
| [`Stash`](./Stash) | Stash 磁贴脚本 |
| [`Android/ApkRename`](./Android/ApkRename) | 只修改 APK 应用名称、保持包名与签名身份不变的脚本 |
| [`HeliumLanguagePatcher`](./HeliumLanguagePatcher) | 扫描 Helium 漏译文案，通过 Codex 配置中的模型 API 补全翻译并修补语言包 |
| [`Batch files/Flatten.bat`](./Batch%20files/Flatten.bat) | Windows 目录展平工具 |
| [`Batch files/RemoveMSEdge.bat`](./Batch%20files/RemoveMSEdge.bat) | Microsoft Edge 清理脚本（保留 WebView2），带关联审计/修复入口 |
| [`Batch files/RemoveMSEdgeAll.bat`](./Batch%20files/RemoveMSEdgeAll.bat) | Microsoft Edge 与 WebView2 的完整清理脚本 |

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

完整实现架构、实现细节和维护约束见仓库根 [`DEVELOPMENT.md`](./DEVELOPMENT.md)。

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

产物为 `bin/PortableBridge.exe`。常驻任务以当前用户、最高权限无参数运行；手动启动会请求 UAC，短命 `open` 入口不重复提升。源码、客户端和构建脚本可独立使用，不依赖 Dox 其他模块。使用与升级步骤见 [模块 README](./PortableBridge/README.md)，架构和验证规则见 [开发文档](./DEVELOPMENT.md#314-portablebridge)。

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

- [`font-face.css`](./CSS/font-face.css) — 跨平台中文字体适配，详见上方“中文字体映射”
- [`vscode.css`](./CSS/vscode.css) — 为 Visual Studio Code 的状态栏和最近项目区域指定中文字体链

## Userscript

将脚本安装到 Tampermonkey 或 Greasemonkey 后按目标网站使用：

- [`中文字体优化.user.js`](./Userscript/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.user.js) — 全站中文字体优化，与 `CSS/font-face.css` 共用映射规则
- [`EmuParadise Download Workaround.user.js`](./Userscript/EmuParadise%20Download%20Workaround.user.js) — 在 EmuParadise 页面补充可用下载链接，依赖脚本元数据中的 jQuery
- [`Re-add Download Button Vimm's Lair.user.js`](./Userscript/Re-add%20Download%20Button%20Vimm's%20Lair.user.js) — 在 Vimm's Lair 下载按钮被移除时恢复提交按钮

## Stash

[`Stash/external-ip-address-tile.js`](./Stash/external-ip-address-tile.js) 是 Stash 外部 IP 地址磁贴脚本，通过 `ip-api.com` 获取 IP 和国家/地区信息，显示为 `IP @ 国家/地区`；请求失败时显示“获取失败”。

## Android

[`Android/ApkRename`](./Android/ApkRename) 是只修改 Android APK 应用名称的 PowerShell 脚本：基于 apktool 反编译，仅改动名称相关的清单/字符串资源，重新打包并用原 keystore 重新签名，包名、代码与其余资源保持不变，最后还会做逐文件哈希校验。工具（apktool、apksigner、zipalign、aapt）可自动下载到脚本目录 `tools\` 下（`.\rename-apk.ps1 -SetupTools`）。签名“字节”必然变化（内容变了），但只要使用原 keystore，签名“身份”（同一证书）保持不变，可覆盖安装。

## Batch files

[`Batch files/Flatten.bat`](./Batch%20files/Flatten.bat) 用于分别将一个或多个目标文件夹的所有子目录文件移动到各自的目标根目录，并删除变空的子目录。

- 支持一次拖拽一个或多个文件夹到脚本，或通过命令行传入多个路径
- 多个目标会统一预检和确认，再按传入顺序分别展平；重复目标会去重，父子目标组合会被拒绝
- 使用 `/Y` 或 `-Y` 跳过确认和结束暂停
- 同名项目不会覆盖，原文件及其所在目录会保留
- 操作不可撤销，脚本会拒绝处理磁盘根目录、共享根目录以及符号链接/目录联接

Edge 删除脚本基于 [ShadowWhisperer/Remove-MS-Edge](https://github.com/ShadowWhisperer/Remove-MS-Edge)，并保留来源链接：

| 脚本 | 用途 |
|---|---|
| [`RemoveMSEdge.bat`](./Batch%20files/RemoveMSEdge.bat) | 删除机器级、用户级 Edge 和相关 AppX，保留 WebView2 Runtime、EdgeCore、EdgeUpdate 及共享更新任务和服务；支持 `-guard`、`-auto`、关联审计/修复及帮助参数 |
| [`RemoveMSEdgeAll.bat`](./Batch%20files/RemoveMSEdgeAll.bat) | 全量删除 Edge、相关 AppX、WebView2 Runtime、EdgeCore、EdgeUpdate 及共享更新任务和服务；支持 `-auto`、关联审计/修复及帮助参数 |

两个 BAT 需与 `EdgeAssociations.ps1` 一起使用。`-audit-associations` 只读检查旧关联残留，`-repair-associations` 备份并修复已识别的父项权限异常；这两个入口不执行卸载。正常清理不再修改 `UserChoice` 权限，受保护或无法判断的选择会保留并报告。详情见 [关联清理与旧权限残留说明](./Batch%20files/RemoveMSEdge.README.md)。

两个脚本都会调用机器级和当前用户级 Edge 卸载器，并清理其他 ProfileList 用户的残留；卸载后扫描各用户 URL 协议和文件扩展名的选择记录，仅清理确认失效、无 Hash 且无冲突的 Edge 选择值。职责边界、计划任务配置、执行流程和维护验证要求见仓库根 [`DEVELOPMENT.md`](./DEVELOPMENT.md)。
