# Auto Sort Bookmarks

适用于 Firefox 142 及更高版本的 Manifest V3 扩展。它会递归处理以下两个书签根目录：

- Bookmarks Menu（`menu________`）
- Other Bookmarks（`unfiled_____`）

每个文件夹会先按分隔线划分为互不影响的区段，每个区段按以下规则排序：

1. 文件夹全部置顶，并按 Title A-Z 排序。
2. URL 书签排在文件夹之后，先按 Title、再按 URL（Title 相同时）进行 A-Z 排序。

比较区分大小写和重音符号，大小写相邻时大写优先，并使用自然数字顺序（例如 `Page 2` 排在 `Page 10` 前）。分隔线位置保持不变，文件夹不会跨越分隔线；文件夹内部也会递归应用同一套分段规则。

## 自动触发

扩展会在安装、Firefox 启动，以及书签创建、修改、移动或删除后自动安排排序。连续变化（包括导入过程中产生的大量创建事件）会合并为一次操作；多条书签使用顺序 `await bookmarks.move()`，避免异步移动互相打乱索引。

只有普通 Firefox 浏览器窗口当前获得焦点时才会执行，因此用户正在前台使用独立 Library 窗口时不会重排；待回到普通浏览器窗口后再处理挂起的排序。

## 安装测试

1. 在 Firefox 打开 `about:debugging#/runtime/this-firefox`。
2. 点击“临时载入附加组件”。
3. 选择本目录中的 `manifest.json`。

正式分发时可将 `manifest.json`、`background.js` 和 `sorter.js` 放在压缩包根目录后提交 Mozilla Add-ons 签名。

## Firefox API 限制

标准 WebExtensions `windows` API 只枚举 `navigator:browser` 窗口，不提供 `Places:Organizer`（Library）窗口的打开/关闭生命周期。因此扩展可以可靠避开**当前获得焦点**的 Library 窗口，但无法区分“Library 已关闭”和“Library 仍打开但退到普通浏览器窗口之后”。要严格识别后一种情况，需要无法在正式版普通扩展中使用的特权 Experiment API 或额外的本机程序。

## 测试

```powershell
node --test tests/sorter.test.js
```
