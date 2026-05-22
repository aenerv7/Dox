# Codex 开发文档索引

本目录记录 Dox 仓库后续开发需要优先阅读的上下文、流程和维护规则。内容基于 `.kiro/steering`、`README.md` 以及当前仓库源码整理，最后整理日期：2026-05-22。

## 阅读顺序

1. `project-context.md`：项目定位、目录结构、源码和生成产物边界。
2. `architecture-notes.md`：各模块的实现结构、入口函数和关键行为。
3. `development-guide.md`：本地开发、构建、验证和发布流程。
4. `maintenance-rules.md`：修改时必须遵守的同步、版本和兼容规则。

## 快速判断

- 修改中文字体映射：先看 `maintenance-rules.md` 的字体同步规则，再改 `css/font-face.css` 和 `Userscript/中文字体优化.user.js`。
- 修改 Windows 窗口调整逻辑：同时检查 `AutoHotkey/SizerAHK/SizerAHK.ahk` 和 `SizerWin/SizerWin.c` 的行为是否需要保持一致；SizerWin 的 DPI manifest、构建脚本和 README 说明也要同步。
- 修改 macOS 窗口调整逻辑：重点看 `SizerSwift/Sources/main.swift` 的 Accessibility API 路径和拖拽回退路径。
- 修改广告过滤规则：更新 `magi.txt` 头部版本号和修改时间。
- 新增脚本或工具：先在 `README.md` 增加用户可见说明，再补充本目录文档中的模块清单和维护规则。
