# Dox

自用网络工具与脚本合集。所有内容均为独立脚本/配置文件，无需构建，可直接使用。

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
