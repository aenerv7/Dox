---
inclusion: fileMatch
fileMatchPattern: "Userscript/中文字体优化.user.js"
---

# Userscript 版本号规则

修改 `Userscript/中文字体优化.user.js` 的内容后，必须递增 `@version` 字段（位于文件顶部的 UserScript 元数据块中）。

# CSS 同步规则

修改 `Userscript/中文字体优化.user.js` 中的 `@font-face` 规则后，必须将对应的变更同步到 `css/font-face.css`，保持两个文件的 `@font-face` 定义一致。
