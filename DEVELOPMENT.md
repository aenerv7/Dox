# Dox 开发文档

> **本文档是 Dox 仓库唯一的开发文档。** 项目定位、全局规则、以及所有模块的架构、维护约束、构建与验证清单都集中在这里。以后任何新增或修改的开发文档，一律写入本文档对应的模块小节，不再在模块目录或 `.codex`、`.kiro` 等位置增建独立的开发文档。
>
> **全仓库只有两份文档：根 `README.md`（用户使用）和本文件（维护规范）。** 不存在模块级 README，也不存在第二份开发文档；同一事实只写一处，不复制到两处。新增模块在根 `README.md` 加一个小节、在本文件加一个小节即可。
>
> 随包分发或合规用途的文件不属于此约定，保持原位：各 `PRIVACY.md`（隐私说明）、`Firefox/Add-Ons/AutoSortBookmarks/THIRD_PARTY_NOTICES.md`（第三方许可）、`Firefox/Add-Ons/Dox Reader/README.md`（随 AMO 源码包分发）。

## 目录

1. [项目概览](#1-项目概览)
2. [全局规则](#2-全局规则)
3. [模块开发文档](#3-模块开发文档)
   - 3.1 [中文字体优化（CJK 字体映射）](#31-中文字体优化cjk-字体映射)
   - 3.2 [SizerWin](#32-sizerwin)
   - 3.3 [SizerSwift](#33-sizerswift)
   - 3.4 [CapsLockOSD](#34-capslockosd)
   - 3.5 [Dox Reader](#35-dox-reader)
   - 3.6 [Firefox Auto Sort Bookmarks](#36-firefox-auto-sort-bookmarks)
   - 3.7 [Userscript 小脚本](#37-userscript-小脚本)
   - 3.8 [AdGuard（magi.txt）](#38-adguardmagitxt)
   - 3.9 [Scripts（Edge 清理与 FFmpeg 安装）](#39-scriptsedge-清理与-ffmpeg-安装)
   - 3.10 [DeepSeek Harness Launcher](#310-deepseek-harness-launcher)
   - 3.11 [ApkRename（APK 改名脚本）](#311-apkrenameapk-改名脚本)
   - 3.12 [Firefox 默认应用重复项清理](#312-firefox-默认应用重复项清理)
   - 3.13 [Sub-Store（Cloudflare Workers）](#313-sub-storecloudflare-workers)
   - 3.14 [bwh-traffic（BandwagonHost 流量订阅头）](#314-bwh-trafficbandwagonhost-流量订阅头)
   - 3.15 [Thunderbird（用户层配置）](#315-thunderbird用户层配置)
   - 3.16 [strelaysrv（VPS 私有中继状态页）](#316-strelaysrvvps-私有中继状态页)
   - 3.17 [Firefox（用户层配置）](#317-firefox用户层配置)
   - 3.18 [foo_vespertine_analyze（foobar2000 假 Hi-Res 检查）](#318-foo_vespertine_analyzefoobar2000-假-hi-res-检查)
4. [开发环境与构建命令速查](#4-开发环境与构建命令速查)
5. [提交前检查](#5-提交前检查)

---

## 1. 项目概览

### 1.1 定位

Dox 是一个个人自用的 Windows/macOS 工具、浏览器扩展、用户脚本和界面定制合集。仓库没有根级包管理器或统一构建系统，各目录基本是独立模块，可按需直接运行、安装或构建。

### 1.2 技术栈与语言

| 类型 | 文件 | 用途 |
|---|---|---|
| C / Win32 API | `SizerWin/*.c`、`SizerWin/*.rc`、`SizerWin/*.manifest`、`CapsLockOSD/` | 原生 Windows 窗口调整工具与 OSD 提示 |
| C++20 / Win32 API | `DeepSeek Harness/Launcher/` | DeepSeek Harness 本地托盘监督器 |
| C++17 / C++20 + foobar2000 SDK | `foo_vespertine_analyze/` | foobar2000 假 Hi-Res 检查组件（核心是纯 C++17，胶水层用 foobar2000 SDK + Win32 API） |
| Python 3.11+ / 标准库 | `Firefox/` | Firefox / Zen 默认应用重复项清理 |
| Swift 5.9 | `SizerSwift/**` | macOS 菜单栏窗口调整工具 |
| JavaScript / Cloudflare Workers | `sub-store/`、`sub-store-front-end/`、`bwh-traffic/` | Sub-Store 前后端在 Cloudflare Workers 上的部署适配（构建期拉取上游源码）、搬瓦工流量订阅头 Worker |
| JavaScript | `Scripts/Userscripts/*.user.js`、`Firefox/Add-Ons/AutoSortBookmarks/`、`Firefox/Add-Ons/Dox Reader/` | 浏览器用户脚本、Manifest V3 扩展 |
| CSS | `CSS/*.css` | 字体映射 |
| 批处理 / PowerShell | `Scripts/*.bat`、`Scripts/*.ps1` | Edge 清理脚本和 FFmpeg 安装脚本 |

### 1.3 模块清单

| 模块 | 状态 | 内容 |
|---|---|---|
| `SizerWin/` | 活跃 | 纯 C + Win32 API 版窗口调整工具 |
| `SizerSwift/` | 活跃 | macOS 原生菜单栏窗口调整工具，Swift Package Manager 项目 |
| `CapsLockOSD/` | 活跃 | Windows 原生 Caps Lock 状态屏幕提示 |
| `foo_vespertine_analyze/` | 活跃 | foobar2000 组件：频谱与位深取证，判假 Hi-Res（分析核心移植自 macOS 应用 Vespertine） |
| `Dox Reader/Cloudflare Workers/` | 活跃 | 本地 IndexedDB + WebDAV 同步的 Web RSS 阅读器，无状态 Cloudflare Worker 代理 |
| `Firefox/Add-Ons/Dox Reader/` | 活跃 | Dox Reader 的 Firefox WebExtension（Manifest V3，AMO listed，扩展 ID `dox-reader@magi`）源码、发布脚本与签名产物 |
| `Firefox/Add-Ons/AutoSortBookmarks/` | 活跃 | Manifest V3 书签自动整理扩展 |
| `Firefox/`（根目录） | 活跃 | Firefox 用户层偏好配置，以及 Firefox / Zen 共用的默认应用重复项清理 |
| `Thunderbird/` | 活跃 | 从 Firefox 偏好设置筛选并适配的 Thunderbird 用户层 user.js |
| `DeepSeek Harness/Launcher/` | 活跃 | DeepSeek Harness `dsh web` 本地托盘监督器 |
| `CSS/` | 活跃 | 中文字体映射 CSS |
| `Scripts/Userscripts/` | 活跃 | Tampermonkey/Greasemonkey 用户脚本和图标 |
| `Scripts/` | 活跃 | Edge 清理脚本（保留/删除 WebView2 两版）、Flatten 和 FFmpeg 安装脚本 |
| `Scripts/rename-apk.ps1` | 活跃 | 只改 APK 应用名的 PowerShell 脚本 |
| `sub-store/` | 活跃 | Sub-Store 后端在 Cloudflare Workers 上的适配（D1 持久化、路径口令鉴权） |
| `sub-store-front-end/` | 活跃 | Sub-Store-Front-End 静态资源 Worker |
| `bwh-traffic/` | 活跃 | 把 BandwagonHost KiwiVM 流量转成 Sub-Store 订阅头 `subscription-userinfo` 的 Worker |
| `.github/workflows/` | 活跃 | Sub-Store 前后端的定时与手动部署 |
| `magi.txt` | 已移除 | 历史 AdGuard 规则，当前检出不提供；保留第 3.8 节历史维护约定 |
| `README.md` | 用户文档 | 仓库主说明 |

> `Windhawk/windhawk-mods` 是 git 子模块（独立的 Windhawk mods 集合），其文档与源码不归本仓库维护，使用方式以子模块内文档为准。

### 1.4 源码与生成产物边界

仓库根 `.gitignore` 当前排除，以下即使出现也应视为生成产物或本地配置，不作为主要源码维护：

- `.DS_Store`
- `Firefox/**/web-ext-artifacts/`
- `SizerSwift/.build/`、`SizerSwift/build/`
- `SizerWin/SizerWin.exe`、`SizerWin/SizerWin_new.exe`、`SizerWin/*.obj`、`SizerWin/*.res`、`SizerWin/SizerWin.ini`
- `DeepSeek Harness/Launcher/bin/`
- `foo_vespertine_analyze/build/`、`foo_vespertine_analyze/.vs/`、`foo_vespertine_analyze/*.user`、`foo_vespertine_analyze/test/swift-parity/.build/`
- `Firefox/__pycache__/`
- `Firefox/Add-Ons/Dox Reader/.env.release`（AMO API 发布凭据）
- `sub-store/.upstream/`、`sub-store/build/`
- `sub-store-front-end/dist/`、`sub-store-front-end/build/`
- `Scripts/tools/`

当前源码入口：

- `SizerWin/SizerWin.c`、`SizerWin/SizerWin.manifest`
- `SizerSwift/Sources/main.swift`、`SizerSwift/build.sh`、`SizerSwift/INSTALL.md`
- `CapsLockOSD/`（C++ 源与资源脚本）
- `foo_vespertine_analyze/src/core/*.h`、`foo_vespertine_analyze/src/core/*.cpp`（纯 C++17 取证核心）、`foo_vespertine_analyze/src/*.h`、`foo_vespertine_analyze/src/*.cpp`（foobar2000 胶水层）、`foo_vespertine_analyze/foo_vespertine_analyze.vcxproj`、`foo_vespertine_analyze/test/core_test.cpp`、`foo_vespertine_analyze/test/parity.sh`
- `CSS/font-face.css`
- `Firefox/Add-Ons/AutoSortBookmarks/manifest.json`、`background.js`、`sorter.js`
- `Firefox/Add-Ons/Dox Reader/src/*.ts`、`Firefox/Add-Ons/Dox Reader/src/*.tsx`、`Firefox/Add-Ons/Dox Reader/public/manifest.json`、`Firefox/Add-Ons/Dox Reader/release.ps1`
- `Firefox/user.js`、`Thunderbird/user.js`（个人配置目录偏好文件）
- `Firefox/fix_duplicate.py`、`Firefox/test_duplicate.py`
- `Scripts/Userscripts/中文字体优化.user.js`、`EmuParadise Download Workaround.user.js`、`Re-add Download Button Vimm's Lair.user.js`、`VGMdb Tracklist Copy Button.user.js`
- `Scripts/InstallFFmpeg.ps1`、`Scripts/EdgeAssociations.ps1`、`Scripts/rename-apk.ps1`
- `sub-store/src/*.js`、`sub-store/scripts/*.mjs`、`sub-store/wrangler.jsonc`、`sub-store/migrations/`
- `sub-store-front-end/scripts/*.mjs`、`sub-store-front-end/wrangler.jsonc`
- `bwh-traffic/worker.js`、`bwh-traffic/wrangler.jsonc`
- `.github/workflows/deploy-sub-store.yml`

### 1.5 资源文件（图标）

| 文件 | 用途 |
|---|---|
| `SizerWin/logo.ico` | Windows 图标 |
| `SizerSwift/AppIcon.icns` | macOS 菜单栏/Bundle 图标 |
| `Scripts/Userscripts/中文字体优化.png` | 512×512 Userscript 图标 |

图标更新时要检查所有平台的引用，不要只替换单一文件。

---

## 2. 全局规则

### 2.1 基本原则

- 本仓库以中文文档和中文注释为主。
- 根目录没有统一构建命令，按模块开发和验证。
- 不要把仓库根 `.gitignore` 中列出的本地产物当作源码修改目标。
- 修改用户可见行为时同步更新 `README.md`；修改维护方式、架构或模块结构时同步更新本文档。
- 文档只有两份：根 `README.md` 只写用户怎么用，本文只写怎么维护、怎么验证。不要新建模块 README、`docs/` 或第三份说明，也不要把同一条事实在根 README 和本文里各写一遍。
- 模块内的相对链接在并入根 `README.md` 后必须仍能解析：图片、脚本和 `PRIVACY.md` 用仓库根相对路径，跨小结引用用页内锚点。
- 除非有特殊要求，项目规则倾向于直接维护 `main` 分支。

### 2.2 资源与图标

- `SizerSwift/AppIcon.icns` 是 macOS 资源，不能直接用 PNG 替代。
- `Scripts/Userscripts/中文字体优化.png` 被 Userscript 元数据 `@icon` 引用，移动或改名时必须更新 URL。
- `DeepSeek Harness/Launcher/src/Launcher.ico` 由 `scripts\make-icon.ps1` 从官方 SVG 生成，不要手工编辑二进制 ICO。

### 2.3 生成产物

生成产物边界统一维护在 [1.4](#14-源码与生成产物边界)，具体忽略模式以 `.gitignore` 为准，不在此重复列表。构建输出、备份、临时文件及本机认证配置不应提交。

忽略规则只写在仓库根 `.gitignore`，不分散到模块目录：

- 模块目录下不新建各自的 `.gitignore`；已有的并入根文件后删除。
- 忽略项按模块分组、加注释，路径从仓库根写起（`Firefox/build/`、`bwh-traffic/**/.wrangler/`），不要沿用只在该模块目录内生效的相对模式（如裸 `build/` 会波及全仓库）。
- 保持原匹配范围：模块 `.gitignore` 里未加斜杠的 `build/`、`__pycache__/`、`*.log` 在该模块下任意深度都生效，并入根文件要写成 `sub-store/**/build/`、`bwh-traffic/**/node_modules/`（`**/` 匹配零层或多层目录）；只锚定直接子目录会漏掉嵌套产物。
- 调整忽略项后确认判定未变：`git check-ignore -v --no-index <路径>`（可指向不存在的路径），并用 `git status --porcelain --ignored=matching` 对比改动前后的忽略清单。
- 例外两处，不再并入根文件：git 子模块 `Windhawk/windhawk-mods/`，以及被忽略的上游源码目录 `sub-store/.upstream/`，其 `.gitignore` 属于上游内容。

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
| `CSS/font-face.css` | 独立样式表，可被其他工具直接引用 |
| `Scripts/Userscripts/中文字体优化.user.js` | Tampermonkey/Greasemonkey 用户脚本；元数据头后把同一套 CSS 放进模板字符串注入页面 |

两个主文件当前各含 **70 条** `@font-face`，其中带 **`unicode-range`** 的 **21 条**。任一改动必须同步到另一文件，并递增脚本 `@version`。

#### 注入方式（Userscript）

脚本在 `document-start` 阶段注入样式：

1. 优先调用 `GM_addStyle(css)`（元数据声明了 `@grant GM_addStyle`）。
2. 没有 `GM_addStyle` 时，新建 `style` 节点写入 CSS，追加到 `head` 或 `documentElement`。

#### 语言默认字体

文件顶部先用 CSS 变量 + `:lang()` 按语言切默认字体，直接作用到 `html`/`body`/`[lang]` 等：

| CSS 变量 | 默认值 | 语言环境覆盖 |
|---|---|---|
| `--dox-default-sans-serif-font` | `SF Pro` | 简中 `PingFang SC`；繁中/日/韩 `PingFang TC` |
| `--dox-default-serif-font` | `New York` | 简中 `Songti SC`；繁中/日/韩 `Songti TC` |
| `--dox-default-monospace-font` | `Maple Mono Normal NF` | 简繁中 `Maple Mono Normal NF CN`；日 `Maple Mono Normal NF JP`；韩 `Maple Mono Normal NF KR` |

`:lang()` 覆盖：简中侧 `zh`、`zh-Hans`、`zh-CN`、`zh-SG`；繁中侧 `zh-Hant`、`zh-TW`、`zh-HK`、`zh-MO`；日侧 `ja`；韩侧 `ko`。`pre`/`code`/`kbd`/`samp`/`textarea` 统一走等宽变量，等宽按语言在 `Maple Mono Normal NF`（默认/英文）、`NF CN`（简繁中）、`NF JP`（日）、`NF KR`（韩）间切换。

#### 目标字体

`local()` 书写顺序即优先级：

| 类别 | 首选 | 回退 |
|---|---|---|
| 无衬线 CJK | PingFang SC（繁中/日/韩 PingFang TC） | Noto Sans SC |
| 衬线 CJK | Songti SC（繁中/日/韩 Songti TC） | Noto Serif SC |
| 等宽 | Maple Mono Normal NF（简繁中 CN、日 JP、韩 KR） | — |
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

21 条 `unicode-range` 共用同一个 Unicode 15.1 全 CJK 值（覆盖 CJK 统一汉字扩展 A–I、兼容表意文字、部首、符号标点、全角、注音、假名、韩文等），修改时必须保持完全一致（以 `CSS/font-face.css` 顶部注释为唯一范本）：

```text
U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+3007, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+400-E5E8, U+E600-E6CF, U+815-E86F, U+3007
```

> 上面为可读性压缩的示意，实际操作请直接复制 `CSS/font-face.css` 顶部注释里的完整值。

#### 维护红线与修改流程

1. 同步修改 `CSS/font-face.css` 和 `Scripts/Userscripts/中文字体优化.user.js` 中的同一处 `@font-face` 规则。
2. 递增 `Scripts/Userscripts/中文字体优化.user.js` 顶部 `@version`。
3. 保持所有实际 `unicode-range` 使用同一个 CJK 范围。
4. 字体名大小写变体成对出现（如 `Helvetica Neue`/`helvetica neue`、`monospace`/`Monospace`），因为浏览器对 `font-family` 大小写敏感性不一致。
5. 保持双规则模式：无 `unicode-range` 的规则做全量回退保底，带 `unicode-range` 的规则只处理 CJK 范围，避免英文字符被替换。
6. 检查 Userscript 元数据中中文文件名的 URL（`@icon`/`@downloadURL`/`@updateURL`）仍使用 URL 编码。
7. 改完在浏览器中安装/刷新脚本，用常见字体名页面人工验证显示效果。

可用 PowerShell 做基础统计：

```powershell
$css = Get-Content -Raw -LiteralPath 'CSS\font-face.css'
$usr = Get-Content -Raw -LiteralPath 'Scripts\Userscripts\中文字体优化.user.js'
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

### 3.2 SizerWin

纯 C + Win32 API 的原生 Windows 窗口调整工具，编译为独立 `SizerWin.exe`，不依赖任何运行时。入口：`SizerWin/SizerWin.c`（单文件，约 1750 行）。`Shift+Alt+Space` 呼出菜单。

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
- 实现一致性：新增菜单动作加 `IDM_*` 分支并保持“先校验 `SW_SHOWNORMAL` → 算工作区 → `SetWindowPos`”；配色只改颜色函数；改默认预设需同步 `LoadDefaultPresets` 与 `GenerateConfigFile`；新增文案中英双份走 `g_isChinese`；`MOD_NOREPEAT`、`DWMWA_*`、`WM_DPICHANGED` 等常量在源码头部 `#ifndef` 兜底，勿删。

验证重点：首次运行生成 `SizerWin.ini`；权限不足弹窗退出；改 ini 后重新呼菜单即时生效；菜单呼出；自动/居中/预设/Control+预设居中/自定义尺寸；自定义窗口无右上角控制按钮；`Tab`/`Shift+Tab`/`Enter`/`Ctrl+Enter`/`Esc`；最大化/最小化不响应；多显示器与任务栏变化；高 DPI 无偏移；热键冲突提示；桌面/任务栏不误处理。

### 3.3 SizerSwift

macOS 原生菜单栏窗口调整工具，Swift 编写，最低 macOS 13，打包为独立 `.app`。入口：`SizerSwift/Sources/main.swift`（单文件，约 1800 行）。Swift tools version 5.9，单个 executable target。功能上是 [3.2 SizerWin](#32-sizerwin) 的 macOS 对应实现，交互与外观遵循 macOS 菜单栏应用规范。

#### 功能

- **自动**：窗口缩放到所在屏幕工作区（`visibleFrame`）的 `3/4` 并居中。
- **居中 / 水平居中 / 垂直居中**：保持尺寸，仅移动位置。
- **预设分辨率**：按 `WxH` 列表设置；按住 `⌥ Option` 点击预设同时居中，菜单标题实时变为「调整并居中 1920x1080」。
- **自定义尺寸**：`NSAlert` + accessoryView 输入宽高，`Return` 调整尺寸、`⌘Return` 调整并居中、`Esc` 取消，区间 `1...32767`，非法输入响铃 + 全选 + 不关闭。
- **动画**：所有位置与尺寸变化都是 0.25 秒缓动过渡，不是瞬移。
- 菜单栏常驻图标，无 Dock 图标；`SMAppService` 开机自启动；英语/繁中/简中；多显示器。

#### 菜单顺序

| 顺序 | 菜单项 | 行为 |
|---|---|---|
| 0 | 打开辅助功能权限… | 仅未授权辅助功能时出现，打开系统设置对应面板 |
| 1 | 自动 | 工作区 3/4 并居中 |
| 2 | 居中 | 保持尺寸，双轴居中 |
| 3 | 水平居中 | 保持尺寸，仅 X 居中 |
| 4 | 垂直居中 | 保持尺寸，仅 Y 居中 |
| — | 分隔线 | |
| 5 | 预设分辨率 | 动态插入，水平组与垂直组之间再插分隔线；按住 ⌥ 变「调整并居中」 |
| — | 分隔线 | |
| 6 | 自定义… | 打开自定义尺寸对话框 |
| 7 | 打开配置文件所在目录 | 在 Finder 中定位 `SizerSwift.ini`；文件被删掉时先按默认内容重新生成 |
| 8 | 开机自启动 | 勾选切换 `SMAppService.mainApp` |
| 9 | 退出 SizerSwift | |

菜单项右侧显示 `[Hotkeys]` 里配置的快捷键（`NSMenuItem.keyEquivalent`），作用等同 SizerWin 的 `&A`/`&C` 助记符。

#### 动画

「丝滑」是本模块的核心要求，实现集中在 `WindowAnimator`：

- 时长 0.25 秒，缓动曲线 Apple easeInEaseOut = `cubic-bezier(0.42, 0, 0.58, 1)`。
- `CVDisplayLink` 逐帧驱动，按 `CACurrentMediaTime()` 的真实经过时间插值，掉帧不会把动画拖长。
- `CAMediaTimingFunction` 在 Swift 里不暴露控制点，`cubicBezier(x1:y1:x2:y2:)` 自行用牛顿迭代（8 次）求解 x→t。
- 每帧先写 `AXSize` 再写 `AXPosition`，避免中间帧出现「尺寸已变、位置未变」的跳动。
- `CVDisplayLink` 回调跑在实时线程上，只做 `scheduleTick()` 排队（`tickPending` 去重）再 `DispatchQueue.main.async` 把 AX 写放回主线程：AX 写属性是同步 IPC，在时间受限线程上等一个忙的应用会造成优先级反转。
- 读几何前先把 `AXUIElementSetMessagingTimeout` 压到 `probeTimeout = 0.05` 秒，动画期间为 `animationTimeout = 0.02` 秒（略大于一帧），结束后恢复 0（全局默认）；所有退出路径（正常结束、被打断接管、帧驱动启动失败）都必须恢复，否则目标窗口会一直处于短超时状态。
- 连续 `maxConsecutiveFailures = 6` 帧写失败（窗口在拖动中或已卡死）就放弃动画、把终值写一次。
- 读不到当前尺寸时不做尺寸插值（第一帧就按目标尺寸起步），但不能因此把 resize 整个丢掉。
- 位移与尺寸变化都小于 2pt、或系统开启「减弱动态效果」（`NSWorkspace.shared.accessibilityDisplayShouldReduceMotion`）时直接落位。
- 动画中途触发新命令：新任务从当前真实位置续跑；若被打断的是**另一个**窗口，先把它落到上一次的终点再换目标。
- 拖拽回退路径（`DragMover`）同样插值：0.18 秒 / 24 步，抓标题栏 `(minX + max(90, width * 0.15), minY + 14)`。合成点击前必须 `CGPreflightPostEventAccess()`，否则事件会被系统静默丢弃（看起来“点了一下什么都没发生”）；结束后用 `CGWarpMouseCursorPosition` + `CGAssociateMouseAndMouseCursorPosition(1)` 把用户指针放回原位（合成拖拽会把光标带到窗口新位置而不会自己回来）。

#### 配置文件

- 路径 `~/Library/Application Support/SizerSwift/SizerSwift.ini`（不放进 `.app`，重装不丢配置）。菜单里「打开配置文件所在目录」直接用 `NSWorkspace.activateFileViewerSelecting` 在 Finder 中定位该文件；文件被手工删掉时先调 `ConfigStore.load()` 重新生成，连目录都建不出来才退化为 `NSWorkspace.open(directory)`。该项不依赖目标窗口，因此不走 `MenuCommand`、也不占用 `[Hotkeys]` 的键位。
- 每次弹菜单、呼出对话框、按下快捷键前重新读取（`ConfigStore.reloadIfChanged()` 按 size + mtime 判定），改文件无需重启进程；打开菜单时顺带刷新快捷键绑定。
- `[Horizontal]`/`[Vertical]` 规则与 SizerWin 完全一致：`;`、`#` 为注释；每行只解析**行首**（跳过空白后）的 `WxH`，`x` 不区分大小写；上限 `maxPresets = 64`；文件为空、超过 `maxFileSize = 8192` 字节或解析结果为空时回退内置默认。
- 内置默认：水平 `640x480, 1024x768, 1280x720, 1280x800, 1600x900, 1600x1000, 1920x1080, 1920x1200`；垂直 `480x854, 720x1280, 800x1280`。
- `[Hotkeys]` 六个动作键：`ShowMenu`、`Auto`、`Centre`、`CentreHorizontal`、`CentreVertical`、`Custom`。格式 `修饰键+按键`，修饰键取 `ctrl`/`opt`/`cmd`/`shift` 且至少含 ctrl/opt/cmd 之一（避免吃掉普通输入），按键名见 `KeyTable.keyCodes`；留空表示不绑定。表头、动作键名、修饰键、按键名**全部大小写不敏感**（`auto`、`AUTO`、`Auto` 等价）——之前只对动作键区分大小写，用户写 `centre = opt+cmd+m` 会被当成未知键忽略，再被 `ensureHotkeyKeys` 用默认值覆盖回去。
- 三个分区可以任意顺序。`parse` 遇到 `[v…`（长度 ≥10）分支时必须同时退出 hotkey 模式，否则把 `[Hotkeys]` 写在 `[Vertical]` 之前会让所有垂直预设被当成 `=` 行静默丢弃。
- 出厂默认**不绑定任何快捷键**：六个动作键全部留空。默认 ini 的 `[Hotkeys]` 分区用注释说明格式，并以旧版默认的 `Auto = ctrl+opt+cmd+c`、`Centre = opt+cmd+c` 作为注释示例（删掉行首 `;` 即生效）。SizerWin 的 `Shift+Alt+Space` 同样不绑定：macOS 上点菜单栏图标即可呼出，而该组合容易与输入法切换冲突。
- **整行缺失**才补默认行（默认值全部为空）；写成 `Centre =`（空值）视为用户显式解绑。`ensureHotkeyKeys` 每次加载都把缺失的键补回 `[Hotkeys]` 分区末尾并落盘，用户误删键后重启即恢复；补写后若超过 `maxFileSize` 就只用在内存里、不落盘（否则下次启动会因文件过大静默回退默认，反而丢配置）。
- 权限类错误（`EACCES`/`EPERM`/`EROFS`，含 `NSError.underlyingErrors` 里嵌套的 `POSIXError`）视为致命：弹窗后 `exit(1)`。

#### 实现要点

目标窗口：`TargetResolver.current()` 取 `NSWorkspace.shared.frontmostApplication`（跳过自身 PID 与 `excludedBundleIdentifiers`：Dock、ControlCenter、SystemUIServer、WindowManager、loginwindow、NotificationCenterUI、SecurityAgent、ScreenSaverEngine、Spotlight）→ AX `kAXFocusedWindow`，失败退 `kAXWindows`（messaging timeout 0.25 秒，只要求尺寸 ≥ 1pt）→ 再退 `CGWindowListCopyWindowInfo`（layer == 0 且尺寸 ≥ 1pt）。`isEligible` 过滤 role 非 `AXWindow`、`excludedWindowSubroles`（`AXDesktopWindow`、`AXDesktopIcon`、`AXSystemFloatingWindow`、`AXSystemDialog`）、`AXMinimized`、`AXFullScreen`，对应 SizerWin 的 `SW_SHOWNORMAL` 校验与任务栏/桌面类名排除。**不要再用尺寸阈值（如 > 10pt / > 100pt）筛窗口**：小工具窗口、检查器面板会被整菜单禁用。也不要把 `AXUnknown` 当成系统窗口排除——很多 Electron/自定义边框窗口就是这个 subrole。

目标窗口的快照会过期：`MenuCommand` 携带的是弹菜单那一刻的 `TargetWindow`，`WindowOps.perform` 必须在执行前用 `refreshed()` 重新读一次 AX 位置与尺寸（对应 SizerWin 执行时再取 `GetWindowRect`），否则菜单开着时用户挪动窗口，非居中的预设会按旧左上角回弹。

几何：`Geometry.screen(for:)` 取相交面积最大的屏幕，完全不相交时取最近屏幕（等价 `MONITOR_DEFAULTTONEAREST`），工作区用 `visibleFrame`（等价 `rcWork`，避开菜单栏与 Dock）。`PlacementMath` 全部整数除法，与 SizerWin 逐位对齐：`intOrigin`/`intSize` 向下取整，`intWindowSize` 四舍五入。`Placement.size == nil` 表示只移动不改尺寸。

坐标：AX 用 CG 坐标（原点左上），AppKit 用左下，统一经 `Geometry.toCG`/`toAppKit` 按主屏高度翻转。

快捷键：`HotkeyCenter` 用 `CGEvent.tapCreate(.cgSessionEventTap, .headInsertEventTap, .defaultTap)` 监听 `keyDown | flagsChanged | tapDisabledByTimeout | tapDisabledByUserInput`；命中绑定的按键在自动重复（`.keyboardEventAutorepeat != 0`）时必须连 auto-repeat 一起吞掉（等价 `MOD_NOREPEAT`，长按不能把字符泄漏给前台应用）；自定义对话框打开期间（`CustomSizeDialog.isOpen`）屏蔽热键（等价 `g_customDialogOpen`）；`flagsChanged` 通过 `.sizerModifiersChanged` 通知驱动菜单预设标题跟随 ⌥。`CFMachPortCreateRunLoopSource` 返回 nil 时视为安装失败（`tap` 不能留下来假装已安装）；权限被撤销时 `installIfTrusted()` 用 `teardown()` 拆掉 tap 与 run loop source，否则重新授权后永远装不上。

执行：`WindowOps.perform(_:target:)` → 有 `axWindow` 走 `WindowAnimator`，否则 `DragMover` 回退；回退路径不能改尺寸，需要 resize 的动作退化为居中。`.showMenu` 在取目标窗口之前处理（对应 SizerWin 先弹菜单再取前台窗口）。菜单与对话框关闭后把焦点还给目标应用。

单实例：`NSRunningApplication.runningApplications(withBundleIdentifier:)` 检查同 bundle 的其它进程，发现则弹窗显示 PID 后退出（等价 SizerWin 的互斥体 + Toolhelp32 扫描）。

#### 构建与部署

```bash
cd SizerSwift
./build.sh --help                             # 选项、证书导入方法与 ad-hoc 说明
./build.sh                                    # release 构建 + ad-hoc 签名 + 打包到 build/SizerSwift.app
./build.sh --identity "MAGI-OpenSource"        # 用钥匙串里这张证书签整包（覆盖升级保留授权）
./build.sh --identity "MAGI-OpenSource" --install  # 再安装到 /Applications：退出旧实例、复制、xattr -cr、校验签名、启动
./build.sh --version 1.2.0
```

`build.sh` 生成 `Contents/Info.plist`（`CFBundleIdentifier = magi.aenerv7.sizerswift`、`LSUIElement = true` 无 Dock 图标、`LSMinimumSystemVersion = 13.0`、`CFBundleIconFile = AppIcon`），并用 `cp` 复制二进制（保留 SwiftPM 自带的 ad-hoc 签名，随后整包重签）。签名后目录结构多出 `_CodeSignature/` 与 `Contents/_CodeSignature/CodeResources`：

```text
SizerSwift.app/
└── Contents/
    ├── Info.plist
    ├── MacOS/
    │   └── SizerSwift
    ├── Resources/
    │   └── AppIcon.icns
    └── _CodeSignature/
        └── CodeResources
```

签名统一走一条路径：`codesign --force --sign <身份> --identifier magi.aenerv7.sizerswift --timestamp=none` 签整包，然后 `codesign --verify` 校验并打印 designated requirement。`--identity` 为空时身份就是 `-`（ad-hoc），所以两种模式产出结构与校验方式一致，差别只在 DR。`--identity` 只认参数（或环境变量 `CODESIGN_IDENTITY`），没有默认证书名：名字写错直接报错退出，不会静默降级成 ad-hoc。身份优先级：`--identity` > `CODESIGN_IDENTITY` > ad-hoc；`--identity none` 可显式压住环境变量。

- **签名身份必须稳定**：TCC（辅助功能）与 `SMAppService`（开机自启动）都按 code signing 的 designated requirement 记录授权。签名身份固定时 DR 是 `identifier "magi.aenerv7.sizerswift" and certificate leaf = H"<证书 SHA1>"`，与产物内容无关，覆盖升级后授权自动保留；不传 `--identity` 时 DR 就是 cdhash（`# designated => cdhash H"…"`），产物内容一变就换身份，等于换了个 App。同一份产物重复构建 cdhash 相同，但只要源码或构建输入变化就变，授权随之失效。
- **证书由开发者自行提供**：仓库不生成证书，也没有生成脚本。可用「钥匙串访问 → 证书助理 → 创建证书」自建一张代码签名证书，或把已有的 `.p12` 导入登录钥匙串：`security import x.p12 -k ~/Library/Keychains/login.keychain-db -P <口令> -T /usr/bin/codesign -A`。不要用 Homebrew 的 OpenSSL 导出 p12：它写 AES-256 + SHA256 MAC，`security import` 会报 `MAC verification failed during PKCS12 import (wrong password?)`，改用 `/usr/bin/openssl pkcs12` 重新导出。自建证书不设信任（无 `security add-trusted-cert`），所以在 `security find-identity -p codesigning` 里带 `(CSSMERR_TP_NOT_TRUSTED)`，加 `-v` 会被过滤掉——这是预期，`build.sh` 因此不带 `-v`；`codesign` 与 TCC 都不受影响。
- **刻意不加 `--options runtime`**：本机自签名不公证、也不分发，硬化运行时只会给动态库校验添麻烦。
- **证书的存放与备份**：证书和私钥只存在于登录钥匙串 `~/Library/Keychains/login.keychain-db`（一条「证书」+ 一条「密钥」，用同一个 CN 关联成 identity），磁盘上没有可直接拷贝的私钥文件，要备份必须从钥匙串导出。备份只认 `.p12`（含私钥）：
  - GUI：钥匙串访问 → 登录 → 我的证书 → 选中 `MAGI-OpenSource`（条目类型是「身份」）→ 文件 → 导出项目 → 格式「个人信息交换 (.p12)」→ 设保护密码。
  - 命令行：`security export -k ~/Library/Keychains/login.keychain-db -t identities -f pkcs12 -o ~/Backups/MAGI-OpenSource.p12`，省略 `-P` 时由系统弹 GUI 口令框（`-P` 会把口令留在 shell 历史里）。注意 `security export` 没有按名字过滤的选项，会把这个钥匙串里所有带私钥的身份（包括 Apple 开发证书）一起导出。
  - `.p12` 等于可伪签的凭证，不要进 git、不要放 iCloud 明文目录；恢复了私钥的人能签出「同一个 App」，本机 TCC 会把它当成已授权。
  - 换机器：`security import x.p12 -k ~/Library/Keychains/login.keychain-db -P <口令> -T /usr/bin/codesign -T /usr/bin/security -A`，然后 `security find-identity -p codesigning`（不加 `-v`）应能看到同一 SHA1 `5906835B4E1C82671505925A32D9A3E86B424456`。若导入报 `MAC verification failed`，是 p12 用了新版 OpenSSL 的 MAC 算法，用 `/usr/bin/openssl pkcs12` 重新导出。
- **同一张证书可以给其它个人小工具用**：`codesign --force --sign "MAGI-OpenSource" --identifier <该工具的 bundle id> --timestamp=none Tool.app`。DR 是 `identifier + certificate leaf`，identifier 不同就是不同 App，各自独立授权，不会互相串；只是所有工具共享同一份私钥风险。当前证书 SHA1 `5906835B4E1C82671505925A32D9A3E86B424456`，有效至 2036-10-19；到期或换证书后所有用它签过的 App 的 TCC/登录项都要重新授权。
- **自签名过不了 Gatekeeper**：`codesign --verify` 通过，但 `spctl -a -vv` 仍 `rejected (origin=…)`；带 `com.apple.quarantine` 的包在别人的机器上首次打开需要在「系统设置 → 隐私与安全性」放行（macOS 15 已无右键「打开」旁路），有时会报成「已损坏」，需 `xattr -dr com.apple.quarantine`。面向接收方的步骤写在 `SizerSwift/INSTALL.md`。
- **改包名或换证书要重新授权**：两次变更都会让旧 DR 失配，TCC 与登录项需要用户重新授权一次（旧条目一般会变成带警告的失效项，先移除再添加）。当前包名 `magi.aenerv7.sizerswift`，历史包名 `com.dox.SizerSwift`。
- **ad-hoc 默认路径**：不传 `--identity`（或显式 `--identity none`）时用 `codesign --sign -` 签整包，DR 是 `cdhash H"…"`，`build.sh` 会把算出的 DR 打印出来便于对照。目录结构与证书签名完全一致（同样有 `_CodeSignature/CodeResources`），所以 `codesign --verify`、`spctl -a -vv` 的判定方式不受影响，`--install` 也照常校验。仅临时调试（不需要保住辅助功能授权）时适合这条路径。
- 只构建不打包用 `swift build -c release`；产物 `.build/release/SizerSwift` 不要直接运行，没有 bundle 就没有 `LSUIElement`（会出现 Dock 图标），`SMAppService` 也无法注册。
- 开机自启动要在安装到 `/Applications` 之后再打开。
- 产物是 thin arm64（`lipo -info` 可确认），Intel Mac 上不能运行；要支持 Intel 需在 `build.sh` 里改成 `--arch arm64 --arch x86_64` 并验证辅助功能路径。

#### 已知限制与维护约束

- 最低平台保持 macOS 13。`CVDisplayLinkCreateWithActiveCGDisplays` 自 macOS 15 起 deprecated，但按 macOS 13 target 编译无警告；改用 `NSView.displayLink(target:selector:)` 需要 macOS 14。
- 事件 tap 回调放行事件必须返回 `Unmanaged.passUnretained(event)`；`passRetained` 会每按一次键泄漏一个 event。
- 必须监听 `.tapDisabledByTimeout`/`.tapDisabledByUserInput` 并重新 `CGEvent.tapEnable`，否则系统禁用 tap 后快捷键永久失效。
- y 轴翻转只能用「主屏高度 − AppKit y − 窗口高度」，AX 路径与拖拽路径必须共用同一公式（旧实现在多屏纵向排列时两条路径不一致）。
- 拖拽回退只能可靠移动窗口，不能可靠调整尺寸，不要在文档里承诺回退路径可 resize。
- `HotkeyBinding` 的 `Equatable`/`Hashable` 只比较 `keyCode` + `modifiers`，带上 `spec` 会让 `ctrl+opt+c` 与 `control+opt+c` 被当成两个绑定。
- 预设不做超出屏幕边界校正（与 SizerWin 一致）。
- `MenuCommand` 携带的 `TargetWindow` 会过期：`WindowOps.perform` 执行前用 `refreshed()` 重读几何，并用 `PlacementMath.isSane` 拒绝非有限值（NaN/±inf）。所有 `CGFloat → Int` 都必须走 `PlacementMath.safeInt`：AX 几何来自目标应用，一个上报 `inf` 的应用会让 `Int(_:)` 陷阱转换直接干掉进程。
- 事件 tap 装在 `.commonModes` 上，意味着菜单跟踪模式里快捷键仍会触发：`MenuBar.showMenuAtCursor()` 需要 `isShowingMenu` 重入保护，`NSMenu.popUp` 不支持嵌套。
- macOS 没有 `SW_SHOWNORMAL` 对应的「缩放（zoom）」状态可查，所以缩放窗口不会被拒绝（平台差异，与 SizerWin 拒绝最大化窗口不同）。
- 非 AX 的拖拽回退本身也依赖辅助功能/合成事件权限；菜单项是否可用由 `AccessStatus.canControlWindows`（`AXIsProcessTrusted() || CGPreflightPostEventAccess()`）决定，避免整个菜单被禁用。
- 菜单栏图标来自 `AppIcon.icns`（`isTemplate = true`，18×18），缺失回退文本 `◫`。
- 未授权辅助功能时：菜单顶部出现「打开辅助功能权限…」；快捷键 tap 建不起来，启动只提示一次权限、不重复报快捷键失败；授权后下次打开菜单自动装上快捷键（`HotkeyCenter.installIfTrusted()`），无需重启。
- 公开 SDK 没有 `AXDesktopWindow` 等 subrole 常量，也没有 `kAXFullScreenAttribute`，只能用字面量。
- macOS 窗口拼贴（Tiling）可能干扰模拟拖拽；重编译后可能需要重新授权辅助功能。
- 新增菜单动作的顺序：加 `MenuCommand` case → `WindowOps.perform` 分支 → `PlacementMath` 计算 → 需要快捷键再加 `HotkeyAction` case（`CaseIterable` 顺序即组合键冲突时的优先级）→ 三种语言文案补齐。改默认预设需同步 `ConfigStore.defaultHorizontal`/`defaultVertical` 与 `defaultContent`。

#### 验证

`swift build` 要求无 error 无 warning。仓库没有测试 target（保持单文件），逻辑自测的做法：把 `Sources/main.swift` 中 `// MARK: - 启动` 之前的部分与测试代码拼成一个临时 executable（复用同一份 `Package.swift`），测试产物不入库。已覆盖：

- `PlacementMath` 与 SizerWin 整数运算逐项对照（含奇数工作区与非整数窗口尺寸的截断行为）。
- `KeyTable.parse`/`equivalent`（拒绝无修饰键、未知键、空值；接受 `ctrl+f12`、`shift+alt+space`）。
- `ConfigStore.parse`/`parsePreset`/`ensureHotkeyKeys`（默认内容、显式空值解绑、冲突时先出现者生效、空文件回退、预设上限、补键幂等、`[Hotkeys]` 位于 `[Vertical]` 之前仍能读到垂直预设、动作键大小写不敏感）。
- `PlacementMath.safeInt`/`isSane`（NaN/±inf 不触发陷阱转换，负数向零截断）。
- `cubicBezier` 与独立二分参考解对照（偏差 < 1e-5）、单调性、前后段速度。
- `Geometry` 坐标往返、工作区、`screen(for:)` 命中与最近屏幕回退。
- `MenuBar.rebuild` 的菜单结构（项数、分隔线位置、快捷键显示）与 ⌥ 标题跟随。

真机验证重点：授权后 `⌥⌘C` 居中、`⌃⌥⌘C` 自动、水平/垂直居中、预设、⌥+预设「调整并居中」、自定义尺寸三种提交方式；动画是否 0.25 秒缓动且不卡顿；多显示器与菜单栏/Dock 变化后工作区正确；全屏与最小化窗口不响应；桌面与菜单栏不误处理；不暴露 AX 窗口的应用能拖拽回退居中；改 ini 后重新打开菜单即时生效；删掉 `[Hotkeys]` 里的键重启后补回；登录项切换；三种语言文案。

### 3.4 CapsLockOSD

Windows 原生 Caps Lock 状态屏幕提示，C++ + Win32 API + 系统 GDI+，不依赖第三方库或运行时。**本节是维护规范，用户使用见根 [README.md 的 CapsLockOSD 小节](./README.md#capslockosd)。**

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

### 3.5 Dox Reader

同一产品有两个源码目录，技术栈均为 Preact、TypeScript、Vite、Dexie 和 fast-xml-parser：

- `Dox Reader/Cloudflare Workers/`：Web 版（阅读器静态资源 + 无状态 Worker 代理），Cloudflare 项目名固定为 `dox-reader`。
- `Firefox/Add-Ons/Dox Reader/`：Firefox WebExtension 版（Manifest V3，桌面版与 Android 版），扩展 ID `dox-reader@magi`，经 AMO listed 渠道发布。

两个目录共享同一套阅读器逻辑：`src/` 下除下表的实现文件（及其对应测试）和扩展独有的 `background.ts` 外应逐文件一致。修改 Web 版 `src/` 时必须把同一改动同步到扩展，反之亦然。

| 文件 | Web 版 | 扩展版 |
|---|---|---|
| `src/runtime-fetch.ts` | 经同源 `/api/feed`、`/api/article`、`/api/webdav` 代理 | 直接 `fetch` 目标地址 |
| `src/settings.ts` | 只用 `localStorage` | 优先 `browser.storage.local`，没有扩展存储时回退 `localStorage` |
| `src/background.ts` | 不存在 | 点击工具栏按钮打开或聚焦阅读器标签页 |

`model.ts`、`database.ts`、`repository.ts`、`app.tsx`、`article-extractor.ts`、`auto-refresh.ts`、`feed-service.ts`、`styles.css` 等其余文件及测试共用。两个 `package.json` 的产品版本保持同步（当前 `1.2.1`）。

不维护 Dox Reader Backend、Durable Objects、服务端文章存储或定时抓取；仓库中不再有后端源码或后端模式字段。

#### Web 版数据与网络边界

- `src/repository.ts` 直接导出 `src/database.ts`，所有阅读数据写入 IndexedDB `dox-rss-reader`；保留原数据库名、同步协议和 localStorage 设置键 `doxReaderSettings`，兼容既有本地/WebDAV 数据。
- `src/settings.ts` 只加载和保存 `DEFAULT_SETTINGS` 中的键，旧设置中的废弃字段和未知字段不再进入运行时或后续保存。默认 `colorScheme` 为 `material`、`theme` 为 `system`，只作用于新用户或缺失字段，不覆盖已保存及同步的配色。
- `src/webdav.ts` 与 `src/sync-model.ts` 负责订阅、文章状态、偏好和刷新时间的合并；使用逻辑版本及 ETag 条件写入，冲突时重新读取合并重试。正文、图片、凭据和布局不进同步文件。
- `src/app.tsx` 启动先显示本地数据库，再进行 WebDAV 同步和到期刷新。保留同步防重入、修改延迟重试、批量已读锁和最低操作反馈时间。连接失败不阻塞缓存阅读。
- `src/auto-refresh.ts` 按各源本机 `lastFetchedAt`（仅成功解析并保存后更新）判断到期，不使用同步的 `lastRefreshAllAt`。`autoRefreshHours` 为本机全局设置，默认 24、整数小时、0 关闭，不加入 WebDAV 偏好协议；启动、每分钟、页面恢复可见及联网时检查。失败重试独立冷却 5 分钟，不推进成功时间。页面关闭后不调度。
- `src/feed-service.ts` 对源 ID 维护共享 Promise 与 FIFO 队列，所有刷新入口复用排队或进行中任务，总并发最多 4。队列订阅驱动单源按钮动画；自动刷新时全部刷新按钮仍可点击并接入现有任务，批次完成独立统计且去重。刷新期间同步与“全部标为已读”按钮置灰。右上角全局刷新按钮只在全局刷新（显示进度遮罩）时播放动画，单源刷新只转该源的按钮。不要恢复全局时间戳驱动的自动刷新。
- WebDAV 设置不在打开对话框或编辑地址/凭据时自动检测。地址必须是可解析的 HTTPS URL，否则“立即同步”按钮置灰不可点；同步是唯一的连通性检查，同步失败即视为未连通并显示错误。编辑连接参数或关闭对话框后清除旧结果，避免过期状态覆盖当前输入。
- `src/runtime-fetch.ts` 将浏览器网络请求路由到同源 `/api/feed`、`/api/article` 与 `/api/webdav`。只有用户在摘要文章中点击“获取全文”时才请求 `/api/article`；Readability 提取的正文和主图只写入本机 IndexedDB，不进入 WebDAV 同步。`worker/index.ts` 是无状态代理，不是个人资料库服务，不得引入数据库或后台抓取。
- `src/article-content.tsx` 用 Preact 白名单渲染正文；图片先按 `strict-origin-when-cross-origin` 只暴露部署 origin，加载失败后自动改用无 Referer 重试一次（有的图床拒绝空 Referer，如 sspai 的 CDN；有的只接受空 Referer）。`src/article-extractor.ts` 在提取前统一解析懒加载图片：`data-*` 地址属性、`srcset`/`data-srcset`、`<picture><source>`、`<noscript>` 兜底，并按最大候选取图。不要删掉这些兼容处理：正文有文字却没有图，通常来自图片地址未被解析或被图床拒绝。
- Worker 校验同源请求标记、目标协议/主机/端口和每次重定向，阻止显式本机、内网及保留地址，限制响应体和超时；`/api/article` 的原网页响应上限为 8 MiB、超时 45 秒，WebDAV 要求 HTTPS，仅放行同步目录/文件及必要方法，凭据只随该请求转发。保留这些保护及对应测试；同源标记不等于用户鉴权。

#### Web 版验证与部署

```powershell
cd "Dox Reader/Cloudflare Workers"
npm ci
npm run check
npx wrangler deploy --dry-run
```

`check` 包含 Vitest、Wrangler 生成类型一致性检查、Worker TypeScript 检查和前端构建。测试覆盖解析、刷新并发、WebDAV 合并/冲突、代理限制、操作锁和本地首屏。手工验收应检查实际 WebDAV 服务、首次同步、离线缓存阅读和 OPML 往返。

`wrangler.jsonc` 的名称固定为 `dox-reader`，静态资源为 `dist/`，`/api/*` 优先交给 Worker。发布使用 `npm run deploy` 或 `deploy-cloudflare.ps1`（支持 `-SkipInstall`、`-DryRun`）；只有明确授权后才部署。`node_modules/`、`dist/`、`.wrangler/` 和本地凭据文件由根 `.gitignore` 排除，不提交产物或认证信息。历史 `dox-reader-backend` 不属于本模块，不重新创建。

`devDependencies` 里的 `overrides: { "sharp": "^0.35.5" }` 是安全修复：`wrangler → miniflare` 把 `sharp` 精确锁在 `0.35.4`（CVE-2026-96889 / GHSA-wq5f-xc86-pv6w），只能靠 override 提升；它只是开发期传递依赖，不进产物。等 wrangler 上游升级后可删除该 override。若 `wrangler types --check` 在某些环境打印结果后不退出，可单独运行 `tsc -p worker/tsconfig.json --noEmit` 和 `npm run build` 代替整条 `check`。

#### Firefox 扩展（`Firefox/Add-Ons/Dox Reader/`）

与 Web 版同源的 Firefox WebExtension（Manifest V3，桌面版与 Android 版），最低 Firefox 142，扩展 ID 固定为 `dox-reader@magi`。目录同时保存源码、发布脚本和 AMO listed 元数据：`src/*.ts|tsx`、`public/manifest.json`、`public/icons/icon-{32,48,64,96,128}.png`（`icon.svg` 为设计源）、`index.html`、`vite.config.ts`、`vitest.config.ts`、`tsconfig.json`、`package.json`、`generate-icons.ps1`、`release.ps1`、`amo-listing.json`、`updates.json`、`AMO_REVIEW_NOTES.md`、`PRIVACY.md`、`README.md`，以及签名产物 `bb7581fa1bbf4b928862.xpi`。

- 图标：`public/manifest.json` 只引用 `public/icons/icon-*.png`。AMO 的商品图标只接受位图，manifest 只给 SVG 时 AMO 会退化为默认占位图。改图标先改 `public/icons/icon.svg`，再运行 `pwsh -File generate-icons.ps1` 重新生成 PNG（脚本按 SVG 的 96×96 坐标 1:1 绘制，不要手改 PNG）。

- 数据边界：IndexedDB 数据库名保留 `dox-rss-reader`，`browser.storage.local` 保存设置与 WebDAV 凭据；只用本地数据加可选 WebDAV，不连接任何服务端。`settings.ts` 加载和保存时只保留 `DEFAULT_SETTINGS` 的键，旧版本遗留的其它字段会被丢弃。
- 与 Web 版共用阅读器逻辑：按需“获取全文”由 `article-extractor.ts` 在扩展内直接请求原文页面并用 `@mozilla/readability` 提取；自动刷新由 `auto-refresh.ts` 按各源 `lastFetchedAt` 在页面打开时判断，两者行为与 Web 版一致。`background.ts` 只负责打开或聚焦阅读器标签页。
- 发布流程：`release.ps1` 依次运行 `npm run check`、`web-ext build`、生成 AMO 源码包并提交 listed 审核；审批后用 AMO API 下载签名 XPI，校验 manifest 的 `id`/`version` 与 Mozilla 签名，再覆盖为 `bb7581fa1bbf4b928862.xpi`。`updates.json` 键仍为旧扩展 ID `dox-rss-reader@dox.local`，仅作 1.0 之前（0.x）的自托管更新入口，脚本不再维护它。
- 首次上架：manifest 固定了扩展 ID 时，`web-ext sign` 只会 `PUT addon/<id>/versions/<version>/`，不会创建 add-on，因此新 ID 必须先注册一次——用 AMO API `POST /api/v5/addons/addon/` 携带 `upload/` 返回的文件 uuid（或 Developer Hub 上传表单）。注册之后 `release.ps1` 即可按上面的流程工作。
- 时钟与 JWT：AMO 会以 HTTP 401 拒绝 `iat` 超前的 JWT，并把 JWT 有效期（`exp - iat`）限制在 60 秒内。本机 `w32time` 未同步时系统时钟比 AMO 快约 18 秒，发布前先确认时钟同步，否则 `release.ps1` 的版本查询和 `web-ext sign` 都会失败。
- 商品页字段：用 AMO API `PATCH /api/v5/addons/addon/<id>/` 可上传商品图标（multipart 字段 `icon`，已上传 `public/icons/icon-128.png`），但 `homepage` 既不会随 create 或版本提交写入，也不会被该 PATCH 采纳（返回 HTTP 200 但字段仍为空），只能在 Developer Hub 手工填写。AMO 对同一账号有请求频率限制，超限返回 HTTP 429 `Request was throttled`。
- AMO 现状：`dox-reader@magi`（slug `dox-reader`，分类 `feeds-news-blogging`）于 2026-10-20 创建，先提交 1.1.8，随后依次被 1.1.9、1.1.10、1.1.11、1.1.12、1.1.13、1.1.14 取代。AMO 上最新提交版本为 1.2.1（版本 id `6636441`，2026-10-29 提交，listed 审核中，状态 `nominated`、文件 `unreviewed`，审核页 <https://addons.mozilla.org/en-US/developers/addon/dox-reader/versions/6636441>）；1.2.0 引入全文提取、自动刷新并移除后端模式，1.2.1 只合并设置文案。审核通过后重新运行 `release.ps1` 下载并校验签名 XPI，覆盖为 `bb7581fa1bbf4b928862.xpi`。同一版本不要重复提交。`AMO_REVIEW_NOTES.md` 会作为审核备注上传，长度上限 3000 字符。
- 维护约束：`public/manifest.json` 的 gecko `id` 固定为 `dox-reader@magi`，不得随发布变动；manifest 不得设置 `update_url`（listed 渠道由 AMO 更新）；版本号在 `package.json`、`public/manifest.json` 与 `package-lock.json` 三处保持一致；`amo-listing.json` 的 `homepage` 与 manifest 的 `homepage_url` 都指向 `Firefox/Add-Ons/Dox Reader`；模块目录不设独立 `.gitignore`，`node_modules/`、`dist/`、`web-ext-artifacts/`、`*.log`、`.env.release` 由根 `.gitignore` 排除。

验证：

```powershell
cd "Firefox/Add-Ons/Dox Reader"
npm ci
npm run check
pwsh -File release.ps1 -SkipSign   # 只做 check、构建与源码包，不提交 AMO
```

### 3.6 Firefox Auto Sort Bookmarks

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

维护约束：排序算法集中在 `sorter.js`，只依赖传入的 `bookmarksApi`（`getChildren`/`move`），不得引用全局 `browser`；`bookmarks.move` 顺序 `await`，不要并发；目标根目录与闹钟名不可改名；行为变更同步 `sorter.test.js`、根 `README.md` 的 Auto Sort Bookmarks 小节、本文档；用户可见名/描述/行为改 `manifest.json` 版本，`_locales` 两语言 key 成对，`default_locale` 保持 `en`；图标以 `icons/icon.svg` 为源，运行 `icons/generate-icons.ps1` 生成 32/48/64/96/128 PNG，第三方许可随 `THIRD_PARTY_NOTICES.md` 入包；已上架 AMO 的扩展必须同时在 Developer Hub 上传 128px 图标，因为 Firefox 扩展管理器从 AMO API 读取已列出扩展的图标元数据；`web-ext-artifacts/` 不提交。

图标发布是双通道流程，不能只更新 XPI：

1. 先生成并检查包内 32/48/64/96/128 PNG，确认 `manifest.json.icons` 全部引用有效，并在 Firefox 亮色、暗色主题下检查可见性。
2. 在发布新版前，先通过 Developer Hub 或 AMO v5 API 的 add-on `PATCH` multipart `icon` 字段上传同一张 128×128 PNG。Manifest 图标不会自动同步到 AMO 图标字段。
3. 等待 AMO 异步缩放完成；只有公共 add-on API 的 `icon_url` 非空、`icons` 包含 32/64/128、缓存戳已更新，且下载到的 128 资源实际尺寸为 128×128，才可继续发布版本。
4. 新版本转为 `public` 后再次检查 AMO v4/v5 公共 API，并用正式安装验证扩展面板、`about:addons` 列表和详情页。网页商品页显示图标不代表 Firefox 本地界面已拿到图标元数据。

上述任一项未通过，图标发布视为失败，不得仅凭签名 XPI 内存在 PNG 或 AMO 网页已有图标结束发布。

测试：

```powershell
node --test Firefox/Add-Ons/AutoSortBookmarks/tests/sorter.test.js
```

验证重点：测试覆盖比较顺序（标题→URL→id）、自然数字、大小写/重音、分隔线分段、递归多根；临时安装 `about:debugging#/runtime/this-firefox`；分隔线不移、文件夹不跨段；创建/改/移/删后约 1.5 秒自动重排且连续变化合并一次；`move` 顺序执行；Library 获焦不重排，切回普通窗口补做。

### 3.7 Userscript 小脚本

涉及 `Scripts/Userscripts/` 下四个脚本。中文字体优化脚本的小节见 [3.1](#31-中文字体优化cjk-字体映射)。

- `EmuParadise Download Workaround.user.js`：从 URL 第 6 段取 `gid`，在 `.download-link` 前插入下载链接，依赖 `@require` jQuery。
- `Re-add Download Button Vimm's Lair.user.js`：查找 `#dl_form`，无目标 submit 按钮则追加按钮。
- `VGMdb Tracklist Copy Button.user.js`：在 VGMdb 专辑页曲目行的「序号与曲名之间」插入复制按钮，点击复制该语言版本的曲名，详见[下方小节](#vgmdb-tracklist-copy-button)。

维护规则：改行为时递增 `@version`；`@match` 尽量窄；DOM 操作必须能承受目标元素不存在；`@downloadURL`/`@updateURL` 指向仓库 raw 地址；GitHub raw URL 中的空格和特殊字符要编码（`Vimm's Lair` 文件名里的单引号当前保留在 URL 中，改 URL 要实测 Tampermonkey 能更新）；外部依赖谨慎（当前仅 EmuParadise 用 jQuery）。

#### VGMdb Tracklist Copy Button

在 `https://vgmdb.net/album/*` 的曲目列表每行插入一个复制按钮，位置在**序号与曲名之间**；点击复制该行曲名。多语言专辑的每个语言块各自独立：英文块复制英文标题，日文/罗马音块复制对应语言的标题。

**目标页面的 DOM 事实**（VGMdb 全站过 Cloudflare，`curl` 直接抓会被拦；改版排查时用浏览器 DevTools 或 Wayback Machine 存档页）：

- 曲目行统一为 `#tracklist tr.rolebit`，固定 3 个 `<td>`：序号（内含 `span.label`，如 `01`）/ 标题（当前为纯文本）/ 时长（内含 `span.time`）。
- 多语言不是同一格堆两行，而是 `#tlnav` 的每个 `<li>` 对应 `#tracklist` 下一个 `<span class="tl" id="tl…">` 块，每块是一整张完整表格，非当前语言的那块带 `style="display:none"`。所以注入必须遍历**所有**块，只处理可见块会导致切换语言后按钮消失。

**实现要点**：

- 序号格不写死 `cells[0]`，而是反查含 `span.label` 的格再取 `nextElementSibling` 作标题格。
- 按钮作为标题格的 `firstChild` 插入，因此天然落在序号与曲名之间。
- 复制内容由标题格克隆而来，先剔除按钮自身再把连续空白压成单个空格（标题格源码里带换行缩进，且按钮文案不能被复制进去）。
- `navigator.clipboard.writeText` 优先，非安全上下文/未授权时回退到临时 `textarea` + `document.execCommand('copy')`。
- 成功后图标换成 ✓ 并转绿，1.2s 后复原。
- `MutationObserver`（`requestAnimationFrame` 去抖）负责补注入；已有按钮的格子直接跳过，因此重入不会产生重复按钮；页面没有 `#tracklist` 时静默返回。

**验证方式**：在仓库外临时目录装 happy-dom，在 Node 里加载 Wayback 存档的专辑页做无浏览器断言（行数=按钮数、每个 `span.tl` 块内行数=按钮数、逐条点击后复制内容与干净 DOM 的标题文本比对、MutationObserver 重入不重复注入、无 tracklist 页面不抛错）。**不要把依赖加进仓库**。

**维护约束**：站点为深色主题，按钮颜色用 `currentColor` 继承，只有成功态写死绿色；无 `@require`、`@grant none`；若改版导致失效，优先怀疑 `tr.rolebit`、`span.label`、`span.tl` 三个选择器。

### 3.8 AdGuard（magi.txt）

`magi.txt` 是历史 AdGuard 兼容规则列表，已从仓库移除，当前无需导入或验证。以下约定仅供以后恢复维护时使用：

1. 递增头部 `! Version`。
2. 更新 `! Last modified`，格式 `YYYY/MM/DD HH:MM:SS +0800`。
3. 按域名后缀和站点分组维护，避免把规则随意追加到文件末尾。
4. 在 AdGuard 中导入或刷新后验证目标网站。

维护要求：保持白名单按顶级域或站点分组；元素隐藏规则尽量落实到具体站点，不写过宽选择器。

### 3.9 Scripts（Edge 清理与 FFmpeg 安装）

`Scripts/` 收纳 Windows 批处理工具、Edge 清理辅助脚本和 FFmpeg 安装脚本。

#### Edge 清理（RemoveMSEdge）

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
- 两脚本共用同目录 `EdgeAssociations.ps1`；缺失时必须在提权、下载、卸载前退出。新增 `-audit-associations` / `-repair-associations` 只检查或修复当前用户关联，在日志初始化前分流，不卸载、不联网、不请求 UAC，以便读取旧日志。使用及残留处理见根 [README.md 的「Edge 关联清理与旧权限残留」](./README.md#edge-关联清理与旧权限残留)。

#### 计划任务约定

保留 WebView2 并自动删除重装 Edge 时只能用 `RemoveMSEdge.bat -guard`。推荐顺序：先 `RemoveMSEdgeAll.bat` → 重装 WebView2 → 创建 `RemoveMSEdge.bat -guard` 计划任务（目标用户账户 + 最高权限运行，登录为触发器）。

```text
程序或脚本: %SystemRoot%\System32\cmd.exe
添加参数:   /d /c ""C:\path\to\Scripts\RemoveMSEdge.bat" -guard"
起始于:     C:\path\to\Scripts
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
9. 用户配置清理扫描 `UrlAssociations` 和 `Explorer\FileExts` 下所有 `UserChoice`/`UserChoiceLatest` 的直接或嵌套 `ProgId`。仅在根/嵌套均无 Hash、只有一个 Edge ProgId、处理程序确认已不存在时备份并原子删除该值；保留空壳键。保留其他浏览器、已安装 Edge、未知命令、DelegateExecute 和重复/冲突选择。
10. 正常关联清理不得修改任何 ACL、所有者或 Hash，不得递归删除选择树。权限拒绝、扫描和备份错误必须可见并返回非零；完整卸载流程必须汇总关联失败，不得无条件报成功。独立 Repair 模式只处理已确认的只读父项 DACL 签名，先持久化原 DACL，恢复继承后校验，失败回滚。旧日志中确有文件 UserChoice ACL 修改尝试且缺少标准拒绝规则的项只报告，不猜测原 ACL；不能把 URL 协议的正常权限当成残留。
11. 依赖文件缓存哈希不匹配时，必须删除失效缓存并重新下载；下载完成后再次校验，二次校验仍失败才返回 `ISSUE_HASH`。

#### 验证清单

静态：`git diff --check`、`git status --short --ignored`；确认所有 `powershell -noprofile -c` 块能被 `[scriptblock]::Create()` 解析、多行管道块经 CMD 转义后可解析、无缺/重标签、`RemoveMSEdge.bat` 无违反保留边界的破坏命令、调试日志保持 ignored。

关联回归：`EdgeAssociations.ps1` 的验证脚本已随模块移除，当前检出不提供自动化关联测试。改动关联清理逻辑后必须人工复核下表场景，不得只凭静态检查通过；不得以实际卸载或关闭 UCPD 的方式运行验证。

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
| 已不存在的 Edge 处理程序、无 Hash 且无冲突的选择 | 备份后只删除 ProgId 值，不更改 ACL |
| 带 Hash / 未知处理程序 / 权限拒绝 | 保留并报告，返回待处理或错误状态 |
| 旧版遗留、符合已确认签名的只读关联父项 | Repair 模式备份并恢复继承，选择值不变 |
| 依赖文件缓存哈希不匹配 | 删除缓存、重新下载并通过二次 SHA-256 校验后继续 |

不要在日常开发机上为语法验证直接跑完整脚本。

#### FFmpeg 安装（InstallFFmpeg.ps1）

`Scripts/InstallFFmpeg.ps1` 安装 FFmpeg 的 Windows full 构建，需要 PowerShell 7。**本脚本刻意单文件、无测试脚本**：它的逻辑是下载与复制，验证方式是真实运行，见下方清单。

`$Binaries` 是安装契约：`ffmpeg.exe`、`ffplay.exe`、`ffprobe.exe`。`$PayloadExtensions` 决定从解压结果中取出哪些文件（`.exe`、`.dll`），其余是 32 个 HTML 手册、`LICENSE.txt`，共享库构建里还有头文件和导入库。

`$ProbeBinary`（即 `$Binaries[0]`，`ffmpeg.exe`）决定安装位置：脚本不自己挑目录，而是从环境变量 `PATH` 里找到系统实际在用的那份 FFmpeg，安装到它所在目录，因此升级永远不会在系统上留下第二份 FFmpeg。查找顺序为当前进程 `$env:PATH` → 注册表机器级 `Path` → 用户级 `Path`（后两者是变量定义处，能覆盖“改过 `PATH` 但当前会话未刷新”的情况）；按 `;` 拆分、大小写不敏感去重、展开 `%VAR%`，在已存在的目录里找 `ffmpeg.exe`，取第一个命中。找不到就不安装：不下载、不创建目录，打印 `No ffmpeg.exe on PATH; nothing to install.` 并以 1 退出。显式传位置参数或 `-Directory` 时跳过整个查找。

安装时**只落盘 `.exe` 和 `.dll`，不安装 `.ffpreset`**：这些构建在 `/presets` 目录下查找预设文件，而归档并不提供该目录，`-vpre libvpx-720p` 在有无 `.ffpreset` 时都报 `File for preset 'libvpx-720p' not found`。libvpx 的 `-deadline`、`-cpu-used` 等参数是内置选项，不依赖这些文件。

##### 来源与变体

上游是 [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds)，它是 [ffmpeg.org Windows 下载页](https://ffmpeg.org/download.html#build-windows)列出的镜像之一。资源名形如：

```text
ffmpeg-<分支>-latest-win64-gpl[-shared][-<版本>].zip
        master | n9.0 等           共享库变体   编号发布才有
```

- `-Git` 选 `master` 分支（每日构建），默认选编号发布（如 `n9.0`）。
- `-Shared` 选 `-shared` 变体：可执行文件变小，但必须连同 7 个 DLL 一起安装，否则无法启动。这是唯一需要安装非 exe 文件的场景，也是 `$PayloadExtensions` 同时收录 `.dll` 的原因。
- GPL 变体是唯一含 libx264/libx265 的变体，等价于 gyan.dev 的 full release；gyan.dev 的 full release 只提供 `.7z`，需要外部 7-Zip，因此不选它。
- **资源名不得硬编码版本号**：编号发布会随上游切换（`n8.1` → `n9.0`）而变。`Select-Asset` 按 `$AssetPattern` 从 release 资源列表里挑选，并优先编号发布、再按 `created_at` 取最新。

##### 下载与校验

1. 先取 `checksums.sha256` 中该资源的行，得到期望摘要；资源不在列表中直接报错，不降级为“跳过校验”。
2. 再下载整包，对文件算 SHA-256 比对；不匹配则重下，`$ArchiveRetries` 次后仍不匹配才失败。校验在解压之前完成。
3. GitHub API 与 `checksums.sha256` 都需要请求头 `User-Agent`；未认证 API 限额为每地址每小时 60 次，每次运行只调一次。

##### 安装语义

- 目标目录：显式位置参数或 `-Directory`；否则为 PATH 中 `ffmpeg.exe` 所在目录。该目录必须已存在（能找到 `ffmpeg.exe` 就意味着存在），且需要可写：`PATH` 里的目录不可写时复制会直接失败，不会回退到其他目录。
- 目录不存在则创建；存在则**无条件覆盖同名文件**，这是“重复运行即升级”的全部实现。切换 `-Shared` 只覆盖可执行文件，另一变体留下的 DLL 或旧文件不会被删除，需要干净目录时先手动清空。
- 临时解压目录在 `finally` 中删除，下载失败、校验失败或解压失败都不留残留。
- 结束时对三个可执行文件跑 `-version` 打印版本；`-Silent` 跳过。这一步同时验证了共享库构建的 DLL 确实可用。

##### macOS 分支

尚未实现。`Get-Platform` 是全脚本唯一的平台判断入口，返回 `MacOS` 时 `Main` 直接 `exit 2`，不触碰任何 Windows 路径。实现时在此分支接入 Homebrew，不要改动 Windows 分支的资产名与校验流程。

##### 验证清单

```powershell
pwsh -NoProfile -File .\Scripts\InstallFFmpeg.ps1 -Directory $env:TEMP\ff-check
```

| 场景 | 预期结果 |
|---|---|
| 默认运行 | 安装到 PATH 中 `ffmpeg.exe` 所在目录（不是新建的默认目录），输出三个可执行文件的版本横幅 |
| 传目录 | 安装到指定目录，不动 PATH 中的安装 |
| 旧目录仍留在 PATH 里 / 多个安装 | 跳过不存在的条目，取 PATH 顺序第一个命中的目录 |
| PATH 中无 `ffmpeg.exe` | 打印 `No ffmpeg.exe on PATH; nothing to install.`，以 1 退出，不下载、不创建目录 |
| 重复运行 | 覆盖同名文件后仍能正常输出 `-version` |
| `-Shared` | 安装三个可执行文件和 7 个 DLL，`ffmpeg.exe` 可运行（下载体积明显小于静态版） |
| `-Git` | 下载 `master` 分支资源，版本横幅为 `N-<hash>-<date>` |
| 静态与共享互切 | 目标目录残留另一变体的 DLL，但三个可执行文件始终可运行 |
| 安装结果 | 静态变体只有 3 个文件，无 `.ffpreset`、无 HTML 手册、无 `.lib`/`.h` |
| 篡改期望摘要 | 报 SHA-256 mismatch，重下 `$ArchiveRetries` 次后失败，目标目录不新增文件 |
| 断开网络 / 无该资源 | 明确报错，不静默跳过校验 |
| 结束后的临时目录 | `%TEMP%` 下无 `dox-ffmpeg-*` 残留 |

### 3.10 DeepSeek Harness Launcher

`DeepSeek Harness/Launcher/` 是 DeepSeek Harness（`dsh web`）的本地托盘监督器，负责受管启动/停止/重启 `dsh web` 并通过系统托盘提供最小控制面。**本节是维护规范，用户使用见根 [README.md 的 DeepSeek Harness Launcher 小节](./README.md#deepseek-harness-launcher)。**

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

1. **不抢前台**：三种模式都保留 `web --no-open`；`CREATE_NO_WINDOW` 只隐藏控制台，不能替代 `--no-open`。dsh 的 `openBrowser` 默认 `true`（`dsh-web-app` 的 `Config.openBrowser` 默认值），**省略该参数即会拉起默认浏览器**，必须由 `kNoOpenFlag` 统一拼接，不可在各模式里手写。
2. **整树托管**：优先带 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 的 Job Object；停止和退出覆盖 Job Object 失败时的单进程兜底。
3. **外部实例可识别**：运行状态不能只看 `g_hProc`，还须探测配置 Host/Port。
4. **配置可恢复**：端口落在 1-65535；无效端口自动选空闲端口并写回 ini。
5. **不介入版本更新**：不检查、不执行 `dsh` 的升级，不新增更新菜单项或 `npm view` 检查链路（见「更新策略」）。

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
│   └── test-port.ps1       # 端口收束
├── Launcher.ini.example    # 配置模板（UTF-16LE，含注释）
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

私有消息协议（`WM_APP+100~103`）：`kMsgStart`(0x8064)/`kMsgStop`(0x8065)/`kMsgRestart`(0x8066)/`kMsgQuery`(0x8067，返回 1/0)。

单实例：互斥体 `Local\DSHLauncher_SingleInstance`（`CreateMutex` + `ERROR_ALREADY_EXISTS`）。

#### 更新策略

Launcher **不检查、也不执行 DeepSeek Harness 的版本更新**。曾经实现过按 npm dist-tag（安装通道）检查并升级，现已整体移除：升级完全由用户自主控制，需要时自行 `npm i -g @deepseek-ai/dsh`（或带 `@alpha`/`@rc` 等 dist-tag），再在托盘里停止并重新启动 Harness。这是刻意保留的边界——**不要重新引入版本检查、`npm view` 调用、更新菜单项或 `UpdateChannel` 配置**；`Launcher.ini` 只保留端口/路径/自启相关键。

<!-- 历史实现（已删除，勿恢复）：按本地版本后缀解析 dist-tag、npm view 比对版本、后台 npm i -g 更新、更新完成后按用户选择重启，以及对应的 kMsgCheckUpdate/kMsgCheckResult/kMsgUpdateDone 私有消息与 test-update.ps1。-->

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
13. 测试脚本严禁按进程名杀 Launcher（`Get-Process Launcher | Stop-Process`）：本机运行中的 Launcher 正是 DSH 的宿主，按名杀会连带掐断正在使用 DSH 的会话。一律按 PID 结束本脚本启动的实例（`Stop-TestLauncher`）。
14. 跑 Launcher 测试前必须先退出正在运行的 Launcher：单实例互斥体使测试实例只弹「已在运行」后退出，而 `FindWindow`（类名+标题）会命中已有实例的窗口，消息发错对象、日志断言全部落空。

#### 测试

在 `DeepSeek Harness/Launcher` 目录：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\test-lifecycle.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\test-modes.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\test-port.ps1
```

- `test-lifecycle.ps1`：用临时 Node HTTP 服务器（`test-server.js`）代替真实 Harness；经私有消息驱动：自启 → 查询 → 停止 → 再启 → 重启（对比监听 PID）→ 强杀托盘验证 `KILL_ON_JOB_CLOSE`（端口关、无残留 node）→ 日志断言；`finally` 清理。
- `test-modes.ps1`：受限 PATH + 假 shim 模拟 dsh/npx 环境，断言 `启动方式=dsh/npx`、命令含 `web --no-open`。
- `test-port.ps1`：有效端口不变；越界/非数字端口被修正为 [1024,65535] 内可用端口且日志记录。

#### 扩展指引与版本库约定

- 新增菜单项：`Resource.h` 加 ID → `ShowTrayMenu` 加 `AppendMenuW` → `HandleCommand` 加 case。
- 端口即时生效可在 `IDM_PORT` 成功后调 `RestartDSH()`（先确认用户意图）。
- 接入其它启动方式集中在 `DetectLaunchMode()`；扩展枚举与 `StartDSH` 命令构造。
- 更新逻辑已移除且不打算再加回（见「更新策略」）；如需新增菜单项，走上面的 `Resource.h` → `ShowTrayMenu` → `HandleCommand` 路径。
- `bin\` 整体忽略，产物不入库；源码、脚本、文档、图标、`Launcher.ini.example` 入库；提交信息前缀 `launcher: ...`。

交接清单：先改行为源（`Launcher.cpp`，配置默认同步 `Launcher.ini.example`）→ 图标先更 SVG 再 `make-icon.ps1` 生成 ICO → 编译并跑到生命周期/启动方式/端口测试 → 检查无残留 exe/测试 node/日志/临时 shim，`git diff --check` 通过 → 根 `README.md` 写使用，本文记录实现约束。

### 3.11 ApkRename（APK 改名脚本）

`Scripts/rename-apk.ps1` 是只修改 APK 应用名称的 PowerShell 脚本：基于 apktool 反编译，仅改动名称相关的清单/字符串资源，重新打包并用原 keystore 重新签名，包名、代码与其余资源保持不变，最后逐文件哈希校验。工具（apktool、apksigner、zipalign、aapt）可下载到 `Scripts/tools/`（`.\Scripts\rename-apk.ps1 -SetupTools`）。

签名“字节”必然变化（内容变了），但只要用原 keystore，签名“身份”（同一证书）不变，可覆盖安装。维护时注意：只改名称相关资源，不得动包名与代码；签名必须用原 keystore。

### 3.12 Firefox 默认应用重复项清理

#### 默认应用重复项

脚本位于 `Firefox/` 根目录，Firefox 与 Zen 共用：

| 文件 | 职责 |
|---|---|
| `Firefox/fix_duplicate.py` | 注册表入口，子命令 `help/detect/fix`；按浏览器、可执行文件和 hive 优先序判定重复的 `RegisteredApplications` 记录，删除注册表值及对应客户端键 |
| `Firefox/test_duplicate.py` | 标准库 unittest；可执行文件解析、卷在线判定、单浏览器保留/删除分类、两浏览器互不干扰，以及假注册表下的检测与过滤，不访问注册表 |

「设置 > 默认应用」每行对应一条 `RegisteredApplications` 记录，不是一个程序一行。Zen 安装程序把同一个客户端键 `Firefox-<hash>` 同时写进 HKLM 和 HKCU，同一个 Zen 因此显示两行；Firefox 安装同样会留下机器级与用户级两条。`detect` 只读报告，`fix` 保留一条注册并删除其余记录。

Firefox 与 Zen 都用 `Firefox-<hash>` 形式的客户端键，因此按可执行文件名（`firefox.exe`、`zen.exe`）分开判定：每个浏览器各自保留一条，一个浏览器的注册项不会被当成另一个的重复项，其他浏览器不受影响。同一可执行文件有多条注册时保留优先序最高的一条（HKLM 优先，其次按注册键名），删除时同时去掉该 hive 的注册表值和 `Software\Clients\StartMenuInternet\<键名>` 键树。文件已不存在且所在卷仍在的注册项按残留删除，卷不在的（移动盘离线）保留；同一浏览器两处可执行文件都真实存在时不删除，只在 `unresolved` 中报告；没有可用项时不执行任何删除。删除 HKLM 项需要管理员权限，失败项以退出码 1 报告。判定逻辑与注册表访问分离，`classify` 为纯函数，测试注入探针而不写注册表。

系统自带的 App Installer 与 Windows 小组件在默认应用里的两行来自同一个 MSIX 包的两组 capability，不属于本脚本处理范围。

#### 验证

在仓库根目录运行：

```powershell
python -B -m unittest discover -s Firefox -p test_duplicate.py -v
python -B Firefox/fix_duplicate.py detect
```

`Firefox/test_duplicate.py` 覆盖可执行文件解析、卷在线判定、两种浏览器各自的重复项分类、跨浏览器互不干扰，以及假注册表下只认 `firefox.exe` 与 `zen.exe` 的检测过滤，不访问注册表。

本机验证结果：`Firefox/test_duplicate.py` 24 项 unittest 通过。

### 3.13 Sub-Store（Cloudflare Workers）

把上游 [Sub-Store](https://github.com/sub-store-org/Sub-Store) 后端与 [Sub-Store-Front-End](https://github.com/sub-store-org/Sub-Store-Front-End) 部署到两个 Cloudflare Worker（`sub-store`、`sub-store-front-end`）。上游源码不入库，构建期按 release tag 拉取；`.github/workflows/deploy-sub-store.yml` 每天北京时间 05:00 自动重部署，也可手动触发。**本节是维护规范，用户使用见根 [README.md 的 Sub-Store 小节](./README.md#sub-store)。**

#### 模块边界

| 路径 | 角色 |
|---|---|
| `sub-store/` | 后端 Worker：上游源码适配、QuickJS 脚本解释器、D1 持久化、路径口令鉴权、构建与部署脚本 |
| `sub-store-front-end/` | 前端 Worker：上游 release `dist.zip` 的静态资源托管 |
| `.github/workflows/deploy-sub-store.yml` | 唯一入口，先部署后端再部署前端 |

`.upstream/`、`build/`、`dist/` 均为构建产物，保持 ignored；两个模块各自带 `package-lock.json`，CI 用 `npm ci`。D1 的 `database_id` 直接入库在 `wrangler.jsonc`：CI 只做 migration，不查询/创建数据库，这样 API Token 只需要 Workers Scripts 与 D1 两项权限。

#### 架构

```text
浏览器 / 客户端
  │  /<token>/api/...        → Sub-Store REST API
  │  /<token>/download/...   → 订阅产物
  │  /share/...              → 公开分享链接（Sub-Store 自校验 ?token=）
  ▼
sub-store Worker
  fetch ─▶ route() 校验口令前缀 ─▶ createContext(D1 预载整表)
        ─▶ runInContext: 首次 import upstream → refreshCache → dispatch
        ─▶ await context.done（$done 落点）─▶ 回写 D1 ─▶ Response

  src/runtime.js 提供 Surge 形态全局对象：
  $persistentStore → 请求上下文 Map → D1 (kv 表)
  $httpClient      → fetch
  $done            → 本次请求的 Promise
```

上游为 QX / Loon / Surge / Stash 设计，通过全局变量访问宿主能力。适配层把 Workers 的 `fetch` 与 D1 包装成 Surge 形态（`isSurge` 为真、`isNode` 为假），上游走它已经过测试的 Surge 分支，业务逻辑零改动。

#### 运行时不变量

1. **禁止动态求值**：Workers 不允许 `eval` / `new Function`。`vendor/open-api.js` 的 `isNode` 探测固定为 `false`；三个 peggy 语法在构建期用 `output: 'source', format: 'bare'` 预编译；脚本过滤 / 脚本操作 / 修改响应改由内置的 QuickJS 解释器执行（见「脚本引擎」）。构建产物中不得出现 `new Function(`。
2. **`$persistentStore.read` 必须同步**：上游在模块初始化时就读取主缓存，所以每次请求先 `loadState()` 预载整表再触发 upstream 导入，顺序不能调换。
3. **请求隔离**：一个 isolate 并发处理多个请求。`$done` 落点、预载数据、待落盘写入全部挂在 `AsyncLocalStorage` 的请求上下文上。禁止改回模块级变量——否则并发请求会串响应，`checkConcurrency` 会以挂起的形式暴露。
4. **`self` 必须存在**：lodash 用 `self` / `global` 探测全局对象，两者都缺失时会执行 `Function("return this")()` 并抛 EvalError。`installGlobals()` 按 Service Worker 规范补 `self`。
5. **落盘时机**：`$done` 之后、返回响应之前 `await saveState()`。`$done` 之后才写的数据会丢，与上游 Surge 行为一致。
6. **`$.cache` 每次请求从 D1 刷新**：isolate 复用会留下上一次请求的内存状态。多 isolate 并发写仍有极小概率丢更新，与上游 Node 版同源，不额外加锁。
7. **CORS 全域放行**：通过全局 `$argument = 'cors=*'` 走上游自带的 CORS 解析，不改上游 `cors.js` 默认值。
8. **未匹配路径返回 404**：上游非 Node 分支把未知路径 302 到官方站点，`restful/miscs.js` 的跳转与问候 catch-all 路由必须保持移除。

#### 上游补丁清单

`sub-store/scripts/upstream-plugin.mjs` 以 esbuild 插件在内存里改上游源码，不落地修改检出，构建可重复。每个补丁带唯一标记，`build.onEnd` 断言命中次数，上游结构变化会直接让构建失败：

| 文件 | 改动 |
|---|---|
| `vendor/open-api.js` | `isNode` 探测 → `false` |
| `vendor/express.js` | 非 Node 的 `app.start` 改为把 `dispatch` 挂到 `globalThis` |
| `utils/rs.js` | 整体替换为 `node:crypto` 版本，去掉 jsrsasign |
| `restful/token.js` | 两处 `eval('require("ms"/"nanoid")')` → 全局变量 |
| `restful/miscs.js` | 移除 302 跳转与 catch-all 问候路由 |
| `core/proxy-utils/processors/index.js` | `createDynamicFunction` 整体替换为委托给 `dox:scripting`；6 个 `const x = createDynamicFunction(` 调用点补 `await`，文件头部注入 `import { createScriptFunction } from 'dox:scripting'` |
| `core/proxy-utils/parsers/peggy/{loon,qx,surge}.js` | 语法构建期预编译 |
| `runtime/{child-process,dgram,fs,net,path,stream-promises,tls}.js` | 替换为显式报错的替身 |

`dox:` 前缀由插件解析到本项目 `src/`，用来在不动上游检出的前提下注入自己的实现。`DYNAMIC_FUNCTION_TAIL` 依赖「`createDynamicFunction` 的 `flowUtils` 块之后直到文件末尾全是 `new Function`」这一结构：上游一旦重排就会断言失败，而不是悄悄留下动态求值。

peggy 自身的语法解析器不可重入，`compileParser()` 必须串行化，否则 esbuild 并发调用 `onLoad` 会让 `peggy.generate` 崩在 `charCodeAt`。

#### 脚本引擎

`src/scripting.js` 用 QuickJS（`quickjs-emscripten-core` + `@jitl/quickjs-wasmfile-release-sync`）解释执行用户脚本，绕开 Workers 的动态求值禁令。

```text
上游 createDynamicFunction(name, script, globals)
  └─ createScriptFunction()                      每个脚本一次
       ├─ Scope.withScopeAsync                    handle 全托管，退出时统一释放
       ├─ QuickJS.newContext()                    运行时至多 64 MB / 2 MB 栈 / 指令预算
       ├─ evalCode('(function (globals...) {...})')  ← 脚本源码
       └─ 调用入口函数 ─▶ 驱动循环 ─▶ 结果搬回宿主
```

- **Wasm 只能预编译导入**：Workers 的 `WebAssembly.instantiate` 不收字节码，`quickjs.wasm` 由 `build.mjs` 复制到 `build/`，`worker.mjs` 里保留 `import ... from './quickjs.wasm'`（esbuild 标记 external），再由 wrangler 打包成 `WebAssembly.Module`。`newVariant(variant, { wasmModule })` 把它接进 emscripten 的 `instantiateWasm`。
- **模块按需初始化**：`loadQuickJS()` 在首次用脚本时才实例化，Wasm 出问题不会拖垮 `/api/utils/env` 等其它路径。
- **搬运规则**：批量数据（节点列表、返回值、宿主函数返回的纯数据）走 JSON；宿主对象与函数在 VM 内是带 `HOST` 符号的 `Proxy`，读写与调用都落回宿主；`$options`、`context` 以及宿主对象上读到的成员一律按引用，脚本里的增删改直接生效。宿主函数调用必须把 `thisArg` 传下去，否则 `array.push` 这类方法会丢调用者。
- **异步**：宿主函数返回 promise 时挂一个 QuickJS deferred，驱动循环 `await Promise.race(pending)` → `executePendingJobs()`，直到脚本返回的 promise 落地；没有待落地宿主操作时直接报错，避免死等。
- **执行边界**：`Date.now()` 在 Workers 里执行期间冻结，做不了墙钟超时，只能给 `setInterruptHandler` 一个指令数预算（`INTERRUPT_BUDGET`），跑飞脚本被中止并翻译成可读报错。另设内存与栈上限。
- **`newContext()` 不会把运行时选项转交给 `newRuntime()`**，内存/栈/中断必须在 `ctx.runtime` 上显式设置；创建上下文要走 `QuickJS.newContext()`（它把 runtime 挂进上下文的 lifetime），否则 `runtime.dispose()` 会先于上下文释放并触发 `JS_FreeRuntime` 断言。

成本：解释执行远慢于原生，实测免费档 10 ms 内可跑完几百节点的一次 `map` 改写，节点上千或脚本密集调用宿主函数时会撞 Error 1102，属预期，不是缺陷。**不得为此引入免费版之外的资源。**

#### 数据与鉴权

- D1 表 `kv(key TEXT PRIMARY KEY, value TEXT NOT NULL)`：`sub-store` 一行是主缓存 JSON，其余是上游 `#key` 形式的旁路键值。
- 鉴权即路径前缀：`SUB_STORE_TOKEN` 以 secret 写入 Worker，前端填 `{sub-store URL}/{token}`。口令限定 `[A-Za-z0-9._~-]+`，含需要百分号编码的字符直接 500，避免前端拼出的地址对不上。
- `/share/` 不带口令前缀：上游前端会把后端地址的路径段裁掉再拼 `/share/`，分享链接自带 `?token=` 由 Sub-Store 自校验。
- 部署顺序固定：migration → deploy → `wrangler secret put` → 自检。首次部署时 Worker 还不存在，secret 必须后写。

#### 构建与验证

```powershell
cd sub-store
npm ci
npm run check          # 拉上游最新 release 构建 + 冒烟测试
```

```powershell
cd sub-store-front-end
npm ci
npm run build          # 下载上游 release dist.zip 并解压到 dist/
```

`sub-store/scripts/smoke.mjs` 用 `node:vm` 的 `codeGeneration.strings = false` 复刻 Workers 禁止动态求值的约束：

| 场景 | 预期 |
|---|---|
| `/api/utils/env` | 200 且含 `data.backend` |
| `OPTIONS` 带任意 Origin | 200 且 `access-control-allow-origin: *` |
| 裸路径 `/api/...`、未知路由、未知分享路径 | 404 |
| 创建订阅后重新读取 | 订阅持久化，D1 出现 `sub-store` 行 |
| 下载本地订阅（`target=ClashMeta`） | 200 且输出含节点地址 |
| 8 个并发请求（必须混入异步的下载端点） | 无串响应，否则挂起 |
| 三个 peggy 解析器解析真实样本 | server / port 正确 |
| 脚本操作改写节点名 / 原地改写后不返回 / 异步脚本 | 三种写法都要生效 |
| 脚本过滤保留一半节点 | 命中的留下，未命中的不出现 |
| 修改响应追加内容 | 输出里出现追加串 |
| 脚本里 `throw` | 500 且报错文案透出，不含 `EvalError` |
| 直接压 `src/scripting.js`：宿主异步函数、宿主对象身份还原、`$options` 嵌套改写、`context` 增删、跑飞脚本 | 全部按桥接规则生效，跑飞被预算中止 |

静态兜底：构建产物不得含 `new Function(`，且必须含解释器标记（`doxHostFunction`）。前端侧另断言 `dist/index.html` 存在且默认后端已被清空。

#### 免费额度与已知限制

免费版 Worker CPU 为 10 ms/请求、10 万请求/天、Cron 5 个/账号；D1 免费版 10 万行写/天。本部署不用 KV、R2、Durable Objects、Queues。**不得为了功能引入免费版之外的资源。**

不支持：本地文件路径订阅、GeoIP/MMDB、UDP/TLS 直连 DNS、请求代理、`insecure`、Node 专属定时同步。上游 `resolve-domain` 走 DNS over HTTPS 正常。脚本功能可用，但在免费档的 10 ms CPU 内只跑得动中小订阅，且 `require` 与上游浏览器分支一样是 `undefined`。

#### 文档维护

用户说明在根 `README.md` 的 Sub-Store 小节（含 `sub-store 后端` 与 `sub-store-front-end 前端` 两个子小节）。改动补丁清单、鉴权方式、存储结构、部署顺序或免费额度取舍时，同一提交更新本节。

### 3.14 bwh-traffic（BandwagonHost 流量订阅头）

`bwh-traffic/worker.js` 是一个单文件 Cloudflare Worker：请求 KiwiVM 的 `getServiceInfo`，把流量同时写进响应头 `subscription-userinfo` 和响应正文，不含节点。浏览器（`Accept` 含 `text/html`）拿到一张自包含的用量面板，其余客户端（Sub-Store、curl）拿到纯文本 userinfo。用户说明见根 [README.md 的 bwh-traffic 小节](./README.md#bwh-trafficbandwagonhost-流量)。

#### 边界与文件

| 文件 | 角色 |
|---|---|
| `bwh-traffic/worker.js` | 唯一实现：上游调用、字段解析、响应头拼装、HTML 面板、内联 favicon、debug 回显 |
| `bwh-traffic/worker.test.js` | `node --test` 单元测试，桩掉 `fetch`，不访问网络 |
| `bwh-traffic/wrangler.jsonc` | Worker 名 `bwh-traffic`，入口 `worker.js` |

Secret：`BWH_VEID`、`BWH_API_KEY`，可选 `RELAY_TOKEN`（只作中转的共享口令，不参与访问鉴权）、`KIWIVM_BASE`。**不含 KV / D1 / R2 / Durable Objects / Cron**，纯请求-响应。

#### 上游事实（2026-10 实测）

1. `api.64clouds.com` 在 Cloudflare 后面；成功响应是平铺 JSON：
   `error`、`plan_monthly_data`、`data_counter`、`monthly_data_multiplier`、`data_next_reset`；`error != 0` 时看 `message`。
2. **来自 Cloudflare 出口的 `/v1/*` 请求被拒**：返回 `HTTP 200` + `{ "success": true, "token": <n> }`（`content-type: text/html`），永远拿不到服务信息。已排除的因素：GET/POST、查询串或表单传参、有无 User-Agent、完整浏览器头、`CF-Worker` / `CDN-Loop` / `X-Forwarded-For` 头、`/v1/` 之外的路径、`kiwivm.64clouds.com` 上的 `/v1` `/api/v1`、明文 HTTP、把 token 回填（查询串 / 头 / Cookie）。同一 URL 从非 Cloudflare 出口（本机 curl、r.jina.ai）能拿到正常响应，含 700005 认证失败。→ 结论是**出口维度**的拦截，不是凭据、请求头或路径问题，Worker 内没有任何代码改动能绕过。
3. 因此上游必须经 `KIWIVM_BASE` 指向的非 Cloudflare 中转访问；默认值仍为 `https://api.64clouds.com/v1`，直连失败时返回明确的 `BLOCKED_HINT`，不再报成"缺流量字段"。

#### 中转现状

中转是搬瓦工 VPS `magi-bandwagonhost`（`23.106.154.176:16022`）上的一个 Caddy 站点块，写在 `/etc/caddy/Caddyfile`：`bwh-traffic.ddtwstudio.com` 只放行 `GET /getServiceInfo` 且必须带 `X-Relay-Token`（值等于 Worker 的 `RELAY_TOKEN`），`uri replace /getServiceInfo /v1/getServiceInfo` 后反代到 `https://api.64clouds.com`（`header_up Host api.64clouds.com`）；**其余路径反代回 `https://bwh-traffic.aenerv7.workers.dev`**，于是两个域名任意路径都等价（面板、Sub-Store 都可用），而 Worker 自己取 `/getServiceInfo` 命中的是 `@relay`，不会自环；第三方不带口令取同一路径会落到兜底 `handle`，拿到的是面板文本而不是 KiwiVM 响应。这个二级域名专用于本 Worker，所以路径里不再有 `/kiwivm` 和 `/v1` 前缀，`KIWIVM_BASE` 就是 `https://bwh-traffic.ddtwstudio.com`。共用 `/etc/ssl/ddtwstudio.com.fullchain`（`*.ddtwstudio.com` 通配，acme.sh 每日 00:00 UTC 续期），**DNS 必须是 DNS only 的 A 记录**（见不变量 8）。改配置后先 `caddy validate`，再 `systemctl reload caddy`（备份沿用 `Caddyfile.bak-<时间戳>` 命名）。

中转口令只有一份：Caddyfile 的 `header X-Relay-Token` 与 Worker 的 `RELAY_TOKEN` 必须同值，换口令改两处（`wrangler secret put RELAY_TOKEN` + Caddyfile）。Caddyfile 里明文写着这个口令，权限固定 `root:caddy` 640（Caddy 以 `User=caddy` 运行，不需要 world-readable），改完 `systemctl reload caddy` 后确认 `is-active` 且中转域名仍返回 200。中转不可用时 Worker 会以 502 报出上游状态，不影响其它模块。

#### 不变量

1. `subscription-userinfo` 格式固定 `upload=0; download=<已用>; total=<配额>; expire=<下一年 1 月 1 日>`，字节数均为 `字段 × monthly_data_multiplier`；搬瓦工双向计费，已用量全部计入 `download`。正文分两路：`Accept` 含 `text/html` 给 HTML 面板，否则是纯文本 userinfo。Sub-Store 的「流量信息 URL」（单条/组合订阅的 `subUserinfo`）在 `utils/flow.js` 的 `getFlowHeaders` 里先 `parseFlowHeaders(正文)`，正文三项齐全就用正文，否则才回退响应头——它发的 `Accept` 不含 `text/html`，永远走纯文本；面板里也埋一份同值 `<meta name="subscription-userinfo">`，万一被纯正则的 `parseFlowHeaders` 扫到，数字不变。
2. `expire` **写死**为下一年 1 月 1 日 UTC 零点（`expireAt()`），不取上游：`data_next_reset` 是流量重置时间，Sub-Store 的 `validCheck` 却拿 `expire` 判「订阅已过期」，照抄会误报。`data_next_reset` 仍在 debug 回显里，但不参与计算。
3. `redirect: "manual"` 且 3xx 判失败（Workers 不支持 `redirect: "error"`）：API Key 不得被转发到第二个主机。
4. 成功响应按平铺字段解析，同时兼容网关加 `data` 信封；两者都不满足时报 502 并列出实际字段名。
5. 访问不设口令：任意路径都回同一份数据，路径不再参与路由，只在 `RELAY_TOKEN` 存在时给中转加 `X-Relay-Token`。`?debug=1` 仍是查询参数，因此也对匿名访问开放——回显正文截断在 `DEBUG_BODY_LIMIT`（400 字节），当前上游正文的 `email` / IP 段落排在截断之后。
6. `?debug=1` 回显上游状态、字段名、截断正文和算出的 userinfo，是排查线上问题的唯一入口，不得删。
7. `BWH_VEID`、`BWH_API_KEY`、`RELAY_TOKEN`、`KIWIVM_BASE` 只用 `wrangler secret put` 配置：secret 跨 `wrangler deploy` 保留，明文 `vars` 会被覆盖清空（历史版本用明文 var 存过 VEID 和访问口令，一次部署就丢了）。`RELAY_TOKEN` 必须存在，否则 Worker 取 `/getServiceInfo` 时不带口令，Caddy 的 `@relay` 不匹配，请求会落到兜底 `handle` 再回 Worker，形成自环。
8. `bwh-traffic.ddtwstudio.com` 只能是 **DNS only**，且不能同时挂成 Worker 的自定义域/路由。一旦它走橙云，Worker 取 `https://bwh-traffic.ddtwstudio.com/getServiceInfo` 会被 CF 当同区回源处理，源站不可达就回 `error code: 522`，Sub-Store 侧表现为 502（2026-10-15 实测）。判据：`?debug=1` 里 `upstream_status=522`、`upstream_body="error code: 522"`，而同一请求从非 Cloudflare 出口取 `api.64clouds.com` 正常返回 700005。
9. 浏览器面板每 `PANEL_REFRESH_MS`（60 秒）静默重取一次同一地址：`fetch(location.href, { headers: { accept: "text/html" }, cache: "no-store" })`，只把新页面的 `main.card` 内容换进来，不整页重载；失败保留上一次数据，只在页脚标「更新失败」。因为刷新会替换整个 `main`（页脚也在里面），脚本里的节点必须现查现用，不能缓存引用。面板仍然自包含（内联 favicon、无任何外部 `src`/`href`）。

#### 验证

```powershell
node --test bwh-traffic/worker.test.js
cd bwh-traffic; npx wrangler deploy --dry-run
```

覆盖：成功正文与响应头同值、查询串、multiplier、`expire` 写死为下一年 1 月 1 日 UTC、`data` 信封、KiwiVM 错误码、Cloudflare 拦截形状、非 JSON、缺字段列名、任意路径都回同一份数据（旧 `/<token>` 与 `?token=` 不影响结果）、缺配置 500、`KIWIVM_BASE` 与 `RELAY_TOKEN` 中转口令、`debug=1`、浏览器 HTML 面板（响应头同值、正则扫描数字不变、图标内联无外链、刷新间隔为 60000 ms）、非浏览器仍是纯文本。

线上验收：`curl.exe "https://<worker>/?debug=1"` 的 `upstream_keys` 应包含 `plan_monthly_data`，正常请求应带 `subscription-userinfo: upload=0; download=<已用>; total=<配额>; expire=<下一年 1 月 1 日>`；浏览器打开同一地址（去掉 `debug=1`）应看到用量面板。若 `upstream_keys` 为 `["success","token"]`，说明 `KIWIVM_BASE` 未生效或中转自己也在 Cloudflare 上。中转自检用假 Key：`curl -H "X-Relay-Token: <RELAY_TOKEN>" "https://bwh-traffic.ddtwstudio.com/getServiceInfo?veid=1&api_key=x"` 应回 KiwiVM 的 700005；去掉口令或不带这个头会落到兜底 `handle`，回的是 userinfo 纯文本而不是 KiwiVM JSON。改上游字段、响应头语义或中转约定时，同一提交更新本节与根 `README.md` 的 bwh-traffic 小节。

### 3.15 Thunderbird（用户层配置）

用户部署、效果、卸载和旧版迁移见根 [README.md 的 Thunderbird 配置小节](./README.md#thunderbird-配置)。源码为 `Thunderbird/user.js`，无需构建；已从安装级 AutoConfig 改为个人配置目录中的声明式 `user_pref()`，移除本模块旧 `.cfg` 和加载器，不操作应用包。

#### 迁移边界

- `font.name-list.*`：完整保留 `Firefox/user.js` 的 116 条字体键值（四类 × 29 个语言组），不在本次迁移中调整原有日/韩字体映射，也不新增强制字体覆盖。
- 原样复用 Gecko/Toolkit 的 `general.smoothScroll`、`intl.accept_languages`、`layout.spellcheckDefault`、`toolkit.legacyUserProfileCustomizations.stylesheets` 和 `ui.key.menuAccessKeyFocuses`。
- `layout.spellcheckDefault=0` 不能代替 Thunderbird 撰写设置，因此补充 `mail.spellcheck.inline=false` 和 `mail.SpellCheckBeforeSend=false`，共 123 条活动偏好设置。此次改用用户层文件只改变加载方式，不改变这些键和值。
- 不迁移 `browser.*`（包括 Firefox 自动提交崩溃报告）、`sidebar.*`、`extensions.formautofill.*`、`services.sync.*`、`media.peerconnection.*` 或 `signon.*`；不要因前缀看似通用就保留。密码管理服务也用于邮箱凭据，不能机械照搬 `signon.rememberSignons=false`。
- `privacy.clearOnShutdown_v2.*` / `privacy.sanitize.*` 属于 Firefox 的清理方案，不能直接当作 Thunderbird 的清理设置；本模块不启用任何退出清理。

#### 维护与验证

- 文件仅包含注释和字面量 `user_pref("key", value);` 声明，不使用 AutoConfig API、`lockPref()`、循环或导入。`user.js` 由 Gecko 偏好解析器读取，不是任意 JavaScript 执行入口。
- 更新 Firefox 来源后只同步已确认适用的键；不要整文件复制。Thunderbird 升级后按该版本的 Gecko 偏好消费者和 Thunderbird `mailnews` / `mail` 源码复核支持情况；配置编辑器能显示自定义键不等于应用实际使用它。
- 静态检查：`git diff --check`；逐行检查声明格式、键唯一性和值类型，确认总计 123 项、116 条字体键值与来源一致，新增项只有上述两个 `mail.*` 开关。可在 Node.js 中用只记录参数的 `user_pref` stub 和 `vm` 执行来辅助核对语法与键值；此检查不能替代 Gecko 解析和实际效果验证。
- 运行验证使用临时个人配置，不修改安装目录：确认启动读取成功；核对 123 项值；用中英文纯文本/HTML 邮件检查字体回退与平滑滚动；撰写及发送前不触发拼写检查；已有账号收发信、密码保存、OAuth 登录及附件打开不应被影响；Windows/Linux 检查单独 Alt 不聚焦菜单、原有快捷键仍可用。
- 检查重启重新应用值、移除文件后值仍保留、重置偏好可恢复默认。macOS 验证部署前后应用包签名检查结果不变。当前仅做静态校验，未进行 Thunderbird 真实启动或 macOS 签名测试。

### 3.16 strelaysrv（VPS 私有中继状态页）

用户入口见根 [README.md 的 strelaysrv 小节](./README.md#strelaysrvvps-私有中继状态页)。这是 VPS 上已有服务的部署记录，仓库不保存其私钥、环境凭据或网页副本，也不创建 Cloudflare Worker。

#### 线上布局

主机沿用第 3.14 节的 `magi-bandwagonhost`，通过本机 Windows OpenSSH 与 ssh-agent 登录。各路径职责独立，但可执行文件与网页均归于 `/usr/local` 安装前缀：

| 路径 | 用途 |
|---|---|
| `/usr/local/bin/strelaysrv` | 中继程序；实测版本 `v2.1.6`，不是符号链接 |
| `/etc/systemd/system/strelaysrv.service` | systemd 单元，以 `strelaysrv` 用户/组运行 |
| `/etc/strelaysrv/` | 中继证书、私钥、`env` 凭据；不能作为 Web 根目录或放入仓库 |
| `/usr/local/share/strelaysrv/www/` | 网页 `index.html` 与 `favicon.png`；目录 `root:root` 755，文件 644 |
| `/etc/caddy/Caddyfile` | `strelaysrv.ddtwstudio.com` 站点；继续使用现有通配证书 |
| `/var/backups/strelaysrv/20261017T070104Z/` | 此次迁移备份：原 `Caddyfile`、完整 `relay-status.tar.gz`、校验清单 `manifest.json`；备份父目录仅 root 可访问 |

Caddy 的 `handle /status*` 仍反代到 `127.0.0.1:16090`，其余请求使用 `root * /usr/local/share/strelaysrv/www` 和 `file_server`。页面继续同域读取 `/status`，不用 CORS。中继仍监听 TCP `22000`，状态接口仍只监听回环地址；本次未更改启动参数、密钥、token、DNS 或证书。

#### 迁移与维护约束

- 原网页位于 `/srv/relay-status/`。迁移时对网页和图标逐字节校验，完整归档旧目录（包括历史 `.bak` 文件），验证归档中每个文件的 SHA-256；新 Web 根目录只部署两个活动资源，不公开旧备份。
- Caddyfile 只改该站点的静态根路径；保持 `root:caddy` 640，先校验再 reload。未重启中继，迁移前后 `MainPID=906` 一致，当时的活跃会话仍在。
- 经回环直连和公网域名分别验证 HTML、图标与原文件一致，`/status` 返回有效 JSON；清理旧目录后再次验证三者正常。Caddy 与 strelaysrv 均 active，bwh-traffic 未鉴权仍返回预期 403，且对照备份确认 Caddyfile 仅有上述根路径差异。
- 已删除的仅为迁移完成的 `/srv/relay-status/`，未改动 `/srv/` 中其他存储；今后不要把网页或备份重新部署进 `/srv/`，也不要为了服务静态页而放宽 `/etc/strelaysrv/` 的访问权限。
- 更新网页只需替换 `/usr/local/share/strelaysrv/www/` 内资源，无需重启中继。调整 Caddy 时先备份并执行 `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`，成功后 `systemctl reload caddy`；检查网页、图标、`/status` 和 relay 进程状态。
- 需要撤销页面内容更新时，可从归档选择性恢复 `index.html` / `favicon.png` 到当前 Web 根目录；不要整包解压进公开目录。若必须回滚本次目录迁移，应先将归档恢复到旧路径，确认 Caddy 可读，再恢复备份 Caddyfile（所有者 `root:caddy`、权限 640），校验并 reload；此操作会重新占用 `/srv/`，须先得到用户同意。

### 3.17 Firefox（用户层配置）

源码为 `Firefox/user.js`，用户说明见根 [README.md 的 Firefox 用户层配置小节](./README.md#firefox-用户层配置)。无需构建，也不修改应用资源。`Firefox/firefox.cfg` 与 `Firefox/defaults/` 保留为旧方案，此次不删除、不扩展。

#### 维护约束

- 只写注释及字面量 `user_pref("key", value);`，不依赖 AutoConfig 的执行上下文；首行不再有 `.cfg` 跳过规则，不需要加载器。不要将本文件当作 Tampermonkey 脚本。
- 优先维护用户层文件，不要求将来所有新项同步到旧 `.cfg`。涉及 Thunderbird 共用字体时，核对两份用户层配置，确认哪些修改需要同步，避免将浏览器专用项带入邮件客户端。
- 涉及密码、自动填充、退出清理、Sync、崩溃报告或隐私窗口搜索建议的键发生改变时，同步核对根 README 的行为说明；注释项与活动项分开检查。不要把“设置了值”描述成跨版本的功能保证。
- 禁止通过重新签名、关闭 Gatekeeper 或修改应用目录来部署用户偏好。真实配置、`prefs.js`、账户资料、备份和密码数据库不进入仓库。

#### 验证

- `git diff --check`；逐行验证活动声明的格式、字面量类型、重复键及语法。可用 Node.js `vm` 配合记录用 `user_pref` stub 辅助校验，但不代表 Gecko 一定支持对应键。
- 用临时 Firefox 配置实测：启动后通过 `about:config` 核对代表项；验证字体回退、垂直标签页、悬停侧栏和拼写检查；对照设置页检查密码、表单、Sync 与退出清理选项，不在真实用户数据上测试清理。
- 验证重启覆盖和卸载后重置流程；macOS 核对部署前后应用包签名检查结果不变。当前未执行 Firefox 真实启动或 macOS 签名验证。

### 3.18 foo_vespertine_analyze（foobar2000 假 Hi-Res 检查）

foobar2000 组件，检查文件是否名不副实：容器写着 24-bit / 96 kHz，内容却是 16-bit 零填充或 44.1 kHz 上采样。用户说明见根 [README.md 的 foo_vespertine_analyze 小节](./README.md#foo_vespertine_analyze)。

分析逻辑是 macOS 应用 [Vespertine](https://github.com/szeremeta1/Vespertine)（GPL-3.0-or-later）的 `VespertineAnalysis` 包 `FileAnalysis.swift` + `SpectralForensics.swift` + `Spectrum.swift` 三个文件的 C++ 移植，判定顺序、阈值、置信度上限和英文结论文字全部照抄。**上游参照代码不在本仓库内**：验证时需要的 Vespertine 检出目录只在本机（`/Users/Gorilla/Workspace/_ref/Vespertine`），`test/swift-parity/Package.swift` 里写的是该绝对路径，换机器必须手工改或从 GitHub 重新克隆并 sparse checkout `Packages/VespertineAnalysis`。

#### 模块边界

| 位置 | 约束 |
|---|---|
| `src/core/` | 纯 C++17，不 include 任何 Windows / foobar2000 头文件，不依赖 MSVC 扩展。可在 macOS / Linux 用 clang++ 直接编测（`test/parity.sh` 就这么做） |
| `src/` | foobar2000 SDK + Win32 胶水层，只能在 Windows 上用 MSVC 编 |
| `test/` | 合成信号自测与 Swift 对照，不参与组件构建 |

#### 文件

| 文件 | 行数 | 内容 |
|---|---|---|
| `src/core/core.h` | 246 | `PortableFFT`、`SpectrumAnalyzer`、`SpectralForensics`/`ForensicsAccumulator`、`AnalysisAccumulator`、`FileAnalyzer`、`Verdict` 与 `FileAnalysis`/`AnalysisError` 的公开接口 |
| `src/core/spectrum.cpp` | 121 | 迭代 radix-2 FFT、Hann 窗、dBFS 归一 |
| `src/core/spectral_forensics.cpp` | 516 | 100 Hz 带谱、噪声底、截止「墙」、台阶/shelf、镜像相关 |
| `src/core/file_analysis.cpp` | 514 | 位深零填充检测、带宽估计、判定分支与全部英文文案 |
| `src/core/report_text.h` / `.cpp` | 47 / 163 | 报告表格三列文本与底部详情文本 |
| `src/app.h` | 39 | `TrackClaim`、UTF-8/UTF-16 转换、`kMaxSeconds`/`kMaxSampleRate` |
| `src/claim.cpp` | 41 | 从 `file_info` 读声称的编码/位深/采样率/声道 |
| `src/scan.h` / `scan.cpp` | 18 / 165 | 后台扫描 `threaded_process_callback`、解码循环 |
| `src/report_window.h` / `.cpp` | 17 / 288 | Win32 报告窗口（ListView + 只读 EDIT）、暗色模式 |
| `src/main.cpp` | 139 | 右键菜单、主菜单、`initquit` 清理、组件版本声明 |
| `foo_vespertine_analyze.vcxproj` | 283 | 6 个配置：Debug/Release × Win32/x64/ARM64EC |
| `test/core_test.cpp` | 410 | 11 个已知答案用例 + 分块无关性断言 + `--dump` 导出 |
| `test/parity.sh` | — | 编 C++ 核心、跑 Swift 参照、逐字节 diff |
| `test/swift-parity/` | — | SwiftPM 包，直接引用上游 Vespertine 源码 |
| `LICENSE` | — | GPL-3.0 全文，与上游一致 |

#### 数据流

`contextmenu_item_simple` / `mainmenu_commands` → `startScan(metadb_handle_list_cref)` → `analyze_process`（`threaded_process_callback`，`run_modeless` + `flag_show_progress_dual|flag_show_item|flag_show_abort`）→ 逐曲 `input_entry::g_open_for_decoding()` + `initialize(subsong, input_flag_simpledecode|input_flag_no_postproc)` → `audio_chunk` → 转 float → `AnalysisAccumulator::addInterleaved()` → `finish()` → `ReportRow` 列表 → `on_done` 里 `showReportWindow()`。扫描结果保存在文件级静态变量里，窗口关掉后 `Show last report` 仍能重开。

#### 构建

- 需要 Visual Studio 2022（v143 工具集）、Windows 10 SDK 和 foobar2000 SDK **2026-10-01**（`SDK-2026-10-01.7z`，BSD-3-Clause，与 GPL-3.0-or-later 兼容）。SDK 解压目录里要有 `foobar2000/`、`pfc/`、`libPPUI/`。
- 工程读 MSBuild 属性 `Fb2kSdkDir`（默认 `$(MSBuildThisFileDirectory)..\..\foobar2000-sdk`），可直接用 VS 打开单个 `.vcxproj`，不需要 `.sln`。
- 输出 `build\$(Platform)\$(Configuration)\foo_vespertine_analyze.dll`，复制到 foobar2000 的 `user-components\foo_vespertine_analyze\`。
- 链接 `$(Fb2kSdkDir)\foobar2000\shared\shared-$(Platform).lib` 与 `comctl32.lib`，并引用 SDK 自带的 `pfc`、`libPPUI`、`foobar2000_component_client`、`helpers`、`SDK` 五个工程。

#### 验证

```sh
cd foo_vespertine_analyze
test/parity.sh
```

`parity.sh`（macOS / Linux，需 clang++ 与 Swift 6.2+）合成 11 个已知答案信号（真 16-bit、零填充 24-bit、真 24-bit、16 kHz 墙、20 kHz 墙、上采样镜像、上采样墙、合成高频 shelf、数字静音、太短、极安静），同一份 PCM 同时喂给 C++ 核心与上游 Swift 实现（`forcePortableFFT: true`），逐字节比对每个频谱数值（9 位有效数字）与英文结论全文。当前 11 个用例全部 `identical`。

`core_test.cpp` 同时断言：分块大小不影响结果（同一信号按 511 帧分块与一次性喂入结果一致）、`Looks genuine` 时报告第二列与第三列必须完全相同。

Windows 端没有自动化测试，只能真机加载组件：选中混合批次（真 Hi-Res、16-bit 零填充、MP3 转的 24/96、上采样）检查三列文本、单选与底部详情、取消扫描、单文件解码失败的表现、亮/暗两套配色。

#### 维护约束

- **`FloatingPointModel` 必须是 `Precise`**，不能沿用 SDK 样例的 `Fast`：分析结果必须与参照实现逐位一致，浮点重排会直接让 `parity.sh` 失败。
- **英文结论文案不能改**。`file_analysis.cpp` 里的文案与阈值是上游实现的逐字复制，改字就会让 `parity.sh` 出现 `DIFFERS`；要改先改上游或接受对照基线失效。
- 声称的位深取容器里的 `%bitspersample%`（`file_info::info_get_int`），不要取 `decoded_bitspersample`，也不要取 `audio_chunk` 的格式：前者是解码后的，后者是后处理后的。
- 解码 flags 必须带 `input_flag_no_postproc`。否则装了会改 PCM 的输入组件（如 HDCD 解码器）时，「低位全 0」判定会被污染。
- foobar2000 64-bit 的 `audio_sample` 是 `double`（Win32 才是 `float`，见 SDK `shared/audio_math.h:11-14`），进核心前必须统一转 `float`；24-bit 以内整数 PCM 与 float32 源转换无损。
- 不要引 `helpers/*.cpp`（`input_helper` 等）：工程只链接 `shared-$(Platform).lib`，需要那些 helper 就得把它们编进来。只用纯头文件接口 `input_entry::g_open_for_decoding()`。
- 两个 group 工厂的参数顺序相反：`contextmenu_group_popup_factory(guid, parent, name, priority)`、`mainmenu_group_popup_factory(guid, parent, priority, name)`。
- 暗色钩子要在**每次创建窗口**时重新 `AddDialogWithControls()`（`WM_DESTROY` 里把单例置空），否则重新打开的报告窗口是暗框亮内容。
- 不提供原生 ARM64 配置：SDK 只有 `shared-ARM64EC.lib`，且 `component_client`、`helpers`、`SDK` 三个工程本身也只有 ARM64EC 配置，硬加 ARM64 会在链接阶段失败。
- `shared/fb2kdebug.h:44` 的 `uBugCheck` 是 `PFC_NORETURN`，所以 `switch` 不必写 `default` 也不会触发 C4715（工程把 4715 当成错误）。
- 本组件没有在真机 MSVC 上编译过（开发机是 macOS），SDK 调用是逐条对照头文件核对的；首次在 Windows 构建时先清编译错误再谈行为。

#### 未实现

- 写标签与自动播放列表：`file_info_filter::apply_filter()` + `metadb_io_v2::update_info_async()` 就能把结论写成 `%vespertine_verdict%` 之类，便于做 autoplaylist。
- CSV 导出、Atmos / DTS 格式识别、多核并行扫描（`fb2k::splitTask`）。

## 4. 开发环境与构建命令速查

| 模块 | 需要的环境 | 主要命令 |
|---|---|---|
| SizerWin | VS Build Tools / Windows SDK `cl.exe`+`rc.exe`，可选 CMake | `cd SizerWin; .\build.ps1` |
| SizerSwift | macOS 13+，Swift 5.9+，辅助功能权限 | `cd SizerSwift; ./build.sh --install`（只构建用 `swift build -c release`） |
| CapsLockOSD | VS Build Tools | `cd CapsLockOSD; .\build.ps1` |
| foo_vespertine_analyze | VS 2022（v143）+ foobar2000 SDK 2026-10-01；验证需 macOS/Linux 的 clang++ 与 Swift 6.2+ | `msbuild foo_vespertine_analyze\foo_vespertine_analyze.vcxproj /p:Configuration=Release /p:Platform=x64`；`cd foo_vespertine_analyze; ./test/parity.sh` |
| Dox Reader（Web 版） | Node.js 24+；Cloudflare 账号 | `cd "Dox Reader/Cloudflare Workers"; npm ci; npm run check`；部署须授权 |
| Firefox/Add-Ons/Dox Reader（Dox Reader 扩展） | Node.js 24+；发布另需 AMO API 凭据 | `cd "Firefox/Add-Ons/Dox Reader"; npm ci; npm run check`；`pwsh -File release.ps1 -SkipSign` |
| Firefox/Add-Ons/AutoSortBookmarks | Firefox 142+；Node.js（测试） | `node --test Firefox/Add-Ons/AutoSortBookmarks/tests/sorter.test.js` |
| Firefox（默认应用重复项清理） | Windows；Python 3.11+ | `python -B -m unittest discover -s Firefox -p test_duplicate.py -v`；`python -B Firefox/fix_duplicate.py detect` |
| DeepSeek Harness Launcher | PowerShell 7，VS Build Tools | `DeepSeek Harness/Launcher/scripts/build.ps1` |
| Sub-Store（Cloudflare Workers） | Node.js 24+；Cloudflare 账号与 API Token | `cd sub-store; npm ci; npm run check`；`cd sub-store-front-end; npm ci; npm run build` |
| bwh-traffic | Node.js 24+；Cloudflare 账号；非 Cloudflare 中转 | `node --test bwh-traffic/worker.test.js`；`cd bwh-traffic; npx wrangler deploy` |
| Userscript | Tampermonkey / Greasemonkey | 浏览器安装脚本 |
| Stash | Stash 运行环境 | 直接导入脚本 |
| CSS | 可加载自定义 CSS 的浏览器/工具 | 直接引用 `CSS/*.css` |
| Scripts（Edge 清理） | Windows（x86/AMD64） | `RemoveMSEdge.bat [-guard\|-userchoice\|-audit-associations\|-repair-associations\|-auto\|-help]` / `RemoveMSEdgeAll.bat [-userchoice\|-audit-associations\|-repair-associations\|-auto\|-help]` |
| Scripts（FFmpeg 安装） | PowerShell 7 | `.\Scripts\InstallFFmpeg.ps1 [-Directory 路径] [-Shared] [-Git] [-Silent]` |
| ApkRename（APK 改名脚本） | PowerShell，apktool/Java 等工具 | `.\Scripts\rename-apk.ps1 [-SetupTools]` |

---

## 5. 提交前检查

```powershell
git status --short
git diff --check
rg -n "TODO|FIXME|BUG" -g "!**/.git/**" -g "!**/*.exe" -g "!**/*.ico" -g "!**/*.png" -g "!**/*.icns"
```

按修改范围补做对应模块的验证清单（见第 3 节各模块小节）。当前仓库没有统一的自动化测试套件，不能只依赖构建成功。
