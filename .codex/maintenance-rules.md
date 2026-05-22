# 维护规则

## 全局规则

- 文档和注释优先使用中文。
- 保持脚本独立可用，不为了统一工程化而引入根级构建系统。
- 修改用户可见行为时同步更新 `README.md`。
- 新增或改变模块维护方式时同步更新 `.codex` 文档。
- 不提交 `.gitignore` 中列出的生成产物和本地配置。

## 字体映射规则

涉及文件：

- `css/font-face.css`
- `Userscript/中文字体优化.user.js`
- `.kiro/steering/userscript-version.md`

必须遵守：

- 修改任一文件中的 `@font-face` 映射后，另一个文件必须同步。
- 修改 `Userscript/中文字体优化.user.js` 内容后，必须递增顶部 `@version`。
- `@downloadURL` 和 `@updateURL` 中的中文文件名必须保持 URL 编码。
- 标准字体大小写变体要成对维护，例如 `serif` / `Serif`、`monospace` / `Monospace`。
- 双规则模式要保持：第一条无 `unicode-range` 作为全量回退，第二条带 CJK `unicode-range` 精准覆盖中文字符。
- 所有实际 CJK `unicode-range` 必须完全一致。
- `css/font-face.css` 顶部保留完整范围参考注释。

当前基线：

- 有效 `@font-face` 规则：77 条。
- 实际 CJK `unicode-range` 规则：21 条。
- Userscript 当前版本：`5.8`。

目标字体链：

| 类别 | 字体 |
|---|---|
| 无衬线 | `PingFang SC`, `Noto Sans SC` |
| 衬线 | `Songti SC`, `Noto Serif SC` |
| 等宽 | `Maple Mono Normal NF CN` |
| 手写 | `LXGW WenKai` |
| 幻想 | `Yozai` |

## SizerAHK 和 SizerWin 行为一致性

Windows 两个实现的核心行为应尽量保持一致：

- 快捷键：`Shift+Alt+Space`。
- 自动尺寸：当前显示器宽高的 3/4。
- 居中逻辑：以窗口中心点所在显示器为准。
- 中英文菜单：中文系统显示中文，其他系统显示英文。
- 深色模式：读取 Windows 个性化设置，并尽量保持菜单可读。

允许差异：

- `SizerAHK` 和 `SizerWin` 都有自定义尺寸 GUI，但 SizerWin 使用原生 Win32 自绘控件，不引入 WinUI / Windows App SDK。
- `SizerWin` 使用 `SizerWin.ini` 配置预设尺寸，且菜单弹出前实时读取。
- `SizerAHK` 仍通过任务栏设置注册表计算偏移；`SizerWin` 使用 `MonitorFromWindow` + `GetMonitorInfo.rcWork` 获取工作区，不手动读任务栏设置。
- `SizerWin` 会排除桌面、任务栏等系统窗口，并只处理普通窗口状态；最大化和最小化窗口无效。
- `SizerWin` 的全局热键应包含 `MOD_NOREPEAT`，避免长按连续触发。
- `SizerWin` 的 `SizerWin.ini` 仍位于 exe 同目录；权限不足导致无法读取或创建时，应提示并退出，不静默回退。
- `SizerWin` 需要随资源文件嵌入 Per-Monitor DPI awareness manifest。
- `SizerWin` 的 manifest 需要保留 ComCtl32 v6 依赖，自定义尺寸窗口依赖 visual styles，并通过自绘消除旧式输入框/按钮边框。
- `SizerWin` 自定义尺寸窗口不显示右上角最小化、最大化、关闭按钮；关闭路径使用按钮和 `Esc`。
- `SizerWin` 自定义尺寸窗口必须保留 `Tab` / `Shift+Tab` 焦点遍历，顺序为宽度、高度、调整尺寸、调整并居中、取消。
- `SizerWin` 源码包含中文注释，所有 MSVC 构建入口必须保留 `/utf-8`。

如果改动预设尺寸：

- `SizerAHK` 的菜单项和 `Adjust_MenuHandler` 索引必须一起改。
- `SizerWin` 的 `LoadDefaultPresets()` 和默认 `SizerWin.ini` 生成内容必须一起改。
- `README.md` 和 `.codex` 说明按需更新。

## SizerSwift 规则

- 最低平台保持 macOS 13，除非明确需要兼容更老系统。
- 窗口操作优先使用 Accessibility API；仅在 AX 窗口不可用时走 CGWindowList + CGEvent 拖拽回退。
- 拖拽回退只能可靠移动窗口，不能可靠调整尺寸，不要在文档里承诺回退路径可 resize。
- 全局快捷键目前监听 C 键 keyCode `8`：
  - `Option+Command+C`：居中。
  - `Control+Option+Command+C`：调整到 75% 并居中。
- 菜单栏图标来自 Bundle 内 `AppIcon.icns`，缺失时回退为文本符号。
- 登录项功能依赖 `SMAppService`，只在 macOS 13+ 可用。
- 保持不 codesign 的部署策略，除非明确接受辅助功能权限重新授权成本。

## Userscript 小脚本规则

- 改脚本逻辑时递增对应 `@version`。
- `@match` 应尽量限定到目标站点。
- DOM 操作必须能承受目标元素不存在。
- 外部依赖要谨慎；当前只有 EmuParadise 脚本通过 `@require` 使用 jQuery。
- GitHub raw URL 中的空格和特殊字符要编码。`Vimm's Lair` 文件名里的单引号当前保留在 URL 中，修改 URL 时要实际验证 Tampermonkey 能更新。

## Stash 规则

- 必须调用 `$done` 结束脚本。
- 网络错误路径和成功路径都要返回简短 `content`。
- 如果改用新 API，确认隐私、速率限制和返回字段。

## AdGuard 规则

涉及文件：`magi.txt`

修改规则内容时必须：

- 递增 `! Version`。
- 更新 `! Last modified` 为当前北京时间，格式 `YYYY/MM/DD HH:MM:SS +0800`。
- 保持白名单按顶级域或站点分组。
- 对元素隐藏规则，尽量保留到具体站点，不写过宽选择器。

## 图标和资源规则

- `AutoHotkey/SizerAHK/logo.ico` 和 `SizerWin/logo.ico` 当前内容一致，更新一个时要评估另一个是否同步。
- `SizerSwift/AppIcon.icns` 是 macOS 资源，不能直接用 PNG 替代。
- `Userscript/中文字体优化.png` 被 Userscript 元数据 `@icon` 引用，移动或改名时必须更新 URL。

## 生成产物规则

以下文件或目录不应作为源码提交：

- `AutoHotkey/Test/Test.exe`
- `SizerSwift/.build/`
- `SizerSwift/build/`
- `SizerWin/SizerWin.exe`
- `SizerWin/SizerWin_new.exe`
- `SizerWin/*.obj`
- `SizerWin/*.res`
- `SizerWin/SizerWin.ini`
- `.DS_Store`

如果这些文件在工作区存在，通常是本地运行或构建产生的结果。
