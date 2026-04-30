---
inclusion: auto
description: Dox 项目的结构、技术栈、编辑规范和各模块设计说明
---

# Dox 项目概览

本仓库 (Dox) 是一个个人自用网络工具集合，由 GitHub 用户 aenerv7 维护。仓库不包含构建系统或包管理器，所有内容均为独立的脚本/配置文件，可直接使用。

## 仓库结构

```
Dox/
├── AutoHotkey/          # Windows 自动化脚本 (AutoHotkey v2)
│   ├── SizerAHK/        # 窗口尺寸/位置调整工具（活跃）
│   └── Test/            # AHK 测试/实验脚本（非活跃）
├── css/                 # CSS 样式表
│   ├── font-face.css    # 跨平台中文字体适配（核心资产）
│   └── vscode.css       # VS Code 外观自定义
├── Stash/               # Stash 代理工具脚本
│   └── external-ip-address-tile.js  # IP 地址及归属地磁贴
├── Userscript/          # 浏览器用户脚本 (Tampermonkey/Greasemonkey)
│   ├── 中文字体优化.user.js          # font-face.css 的用户脚本版本（活跃）
│   ├── EmuParadise Download Workaround.user.js
│   └── Re-add Download Button Vimm's Lair.user.js
├── magi.txt             # AdGuard 广告过滤规则列表
├── README.md            # 项目说明
└── .gitignore
```

## 技术栈与语言

- AutoHotkey v2 (`.ahk`) — Windows 桌面自动化
- JavaScript (`.js`) — 用户脚本 (Userscript) 和 Stash 磁贴
- CSS (`.css`) — 字体映射和 VS Code 样式
- AdGuard 过滤语法 (`.txt`) — 广告屏蔽规则

## 核心设计理念

### 中文字体映射体系

`css/font-face.css` 和 `Userscript/中文字体优化.user.js` 共享同一套字体映射逻辑，两者的 `@font-face` 规则在功能上完全一致。

#### 文件关系与差异

| | `css/font-face.css` | `Userscript/中文字体优化.user.js` |
|---|---|---|
| 用途 | 独立 CSS，可被其他工具引用 | Tampermonkey 用户脚本，通过 `GM_addStyle` 注入 |
| 额外内容 | 顶部有 unicode-range 参考注释；底部有注释掉的 `textarea` 规则 | 包含 UserScript 元数据头（版本号、@match 等） |
| 缩进风格 | 部分块使用 2 空格缩进 | 部分块无缩进（顶格），其余 4 空格 |

修改字体映射时，必须同步更新两个文件。

#### 目标字体清单

| 类别 | 目标字体 | 用途 |
|---|---|---|
| 无衬线 | `Noto Sans SC`，回退 `PingFang SC` | 默认中文显示 |
| 衬线 | `Noto Serif SC` | 正文阅读 |
| 等宽 | `Maple Mono Normal NF CN` | 代码/终端 |
| 手写 | `LXGW WenKai` | cursive 类 |
| 幻想 | `Yozai` | fantasy 类 |

#### 映射规则结构（6 层）

规则按以下分组排列，每组内部遵循统一的声明模式：

1. 标准字体 — 覆盖 CSS 通用族名（`serif`/`sans-serif`/`monospace`/`cursive`/`fantasy`）及其大写变体（如 `Serif`），加上自定义的 `standard`/`Standard` 和 WebKit 专用的 `-webkit-standard`。这些规则不带 `unicode-range`，做全量替换。

2. 英文衬线 — 覆盖 `Georgia`、`Times`、`Times New Roman`。每个字体名有两条规则：
   - 第一条：无 `unicode-range`，`src` 同时包含原字体和中文回退（如 `local(Georgia), local('Noto Serif SC')`）
   - 第二条：带 Chinese `unicode-range`，`src` 仅为中文字体，确保 CJK 字符走中文字体

3. 英文无衬线 — 覆盖 `-apple-system`、`Helvetica`、`Helvetica Neue`（含小写变体）、`Lucida Grande`（含小写变体）、`Open Sans`、`Segoe UI`、`Tahoma`、`Verdana`。同样采用双规则模式，回退到 `Noto Sans SC` / `PingFang SC`。

4. 等宽 — 覆盖 `Consolas`、`Courier`、`Courier New`、`FantasqueSansMonoRegular`、`Lucida Console`（含小写变体）。英文部分回退到 `Maple Mono Normal NF CN`，CJK 部分回退到 `Noto Sans SC` / `PingFang SC`。
   - 注意：`FantasqueSansMonoRegular` 的回退链比较特殊，使用 `JetBrains Maple Mono` 和 `SF Mono`

5. 旧式中文字体替换 — 根据字体本身是否等宽来决定映射目标：
   - 非等宽 → `Noto Sans SC` / `PingFang SC`：`SimSun` / `simsun` / `宋体` / `宋體`、`MingLiU` / `MingLiU-ExtB` / `MingLiU_HKSCS` / `MingLiU_HKSCS-ExtB`、`细明体` / `細明體`
   - 等宽 → `Maple Mono Normal NF CN`：`NSimSun` / `nsimsun` / `新宋体` / `新宋體`

6. 特殊字体 — `Comic Sans MS` 和 `Impact` 回退到 `LXGW WenKai`（手写风格）；`瀹嬩綋`（"宋体"的 mojibake 编码产物）回退到 `Noto Sans SC` / `PingFang SC`。

#### CJK unicode-range 值 (Unicode 15.1)

所有带 `unicode-range` 的规则使用同一个完整的 All CJK 值，覆盖 CJK 统一汉字全部扩展区（A-I）、兼容汉字、部首、符号标点、全角字符、注音、假名、韩文等：

```
U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D,
U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF,
U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF,
U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F,
U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F,
U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F,
U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF,
U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007
```

修改时必须保持此值在所有规则中完全一致。`css/font-face.css` 顶部注释中记录了此完整范围供参考。

#### 编辑注意事项

- 大小写变体必须成对出现（如 `serif` 和 `Serif`），因为 CSS `font-family` 匹配在不同浏览器中大小写敏感性不一致
- 双规则模式（无 unicode-range + 有 unicode-range）的目的是：第一条做全量回退保底，第二条精确限定 CJK 范围避免英文字符被替换
- Userscript 的 `@version` 字段需在内容变更时手动递增
- Userscript 的 `@downloadURL` / `@updateURL` 中的中文文件名使用 URL 编码（`%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96`）

### SizerAHK 窗口管理器
- 基于 AutoHotkey v2，快捷键 `Shift+Alt+Space` 呼出菜单
- 支持预设分辨率、自动调整（3/4 屏幕）、居中、自定义尺寸
- 支持多显示器检测，居中时根据任务栏状态智能偏移：
  - 主显示器：读取注册表 `StuckRects3\Settings` 字节偏移 8 判断任务栏是否自动隐藏（`03` = 自动隐藏），自动隐藏则绝对居中，否则抬升任务栏高度
  - 副显示器：读取 `MMTaskbarEnabled` 判断是否在所有显示器上显示任务栏，显示则抬升，否则绝对居中
- 支持中英文双语 UI（通过 `A_Language == 0804` 判断）
- 支持 Windows 深色模式

## Git 推送规则

- 除非有特殊说明，所有改动直接推送到 `main` 分支，不需要新建分支或创建 PR。

## 编辑规范

- 本仓库使用中文作为主要语言，注释和文档均使用中文
- AdGuard 规则列表 (`magi.txt`) 头部包含版本号和修改日期，每次修改规则内容时必须同步递增 `Version` 并更新 `Last modified` 为当前时间，格式为 `YYYY/MM/DD HH:MM:SS +0800`
- `.gitignore` 排除了 `AutoHotkey/Test/Test.exe`，测试用二进制文件不入库
