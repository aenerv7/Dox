# CJKSpacer

用于 `explorer.exe` 托管的菜单和工具提示（Tooltip）UI 文本的 Windhawk
模组。在 CJK 字符与字母或数字直接相邻时插入一个半角空格；已有空格、标点、
经典菜单助记键标记和快捷键说明保持不变。

```text
使用VS Code打开     → 使用 VS Code 打开
压缩为ZIP文件       → 压缩为 ZIP 文件
使用 VS Code 打开   → 使用 VS Code 打开
打开(&O)            → 打开(&O)
```

## 安装

1. 安装并启动 Windhawk。
2. 点击界面右下角的“创建新模组”（Create a new mod）。
3. 用 [`CJKSpacer.wh.cpp`](./CJKSpacer.wh.cpp) 的完整内容替换编辑器中的模板。
4. 点击“编译模组”（Compile Mod）。
5. 编译成功后退出编辑模式并启用 `CJK Spacer`。
6. 如果菜单没有立即变化，在任务管理器中重新启动“Windows 资源管理器”，
   或者注销后重新登录。

建议先保持默认设置：

- `classicMenus = true`
- `modernUiText = true`
- `characterMode = unicode`

## 实现范围

- 经典菜单：在 `HMENU` 显示前处理已有菜单项，并拦截运行时新增或修改的
  Unicode 菜单项。这包括由 `explorer.exe` 托管的文件资源管理器、桌面、
  任务栏、托盘和跳转列表菜单。
- Windows 11 新版菜单和 Tooltip：在 XAML/WinUI popup 显示时，通过
  UI Automation 控件类型仅识别菜单和 Tooltip；普通飞出面板不会开启处理。
  识别成功后，仅在对应 popup 存活期间拦截 DirectWrite 文本布局。
- 只注入 `explorer.exe`，不会修改系统文件、注册表或文件名。DirectWrite
  路径只改变显示文字；经典路径会修改 `HMENU` 保存的文字，因此辅助技术读取
  到的经典菜单文本也会包含新增空格。

## 已知限制

- Windows 没有公开的全局菜单文字过滤 API。新版菜单实现可能随 Windows
  更新而改变；如果 popup 的辅助功能树结构发生变化，可能漏掉部分文字。
- 新版菜单处理的是最终显示层，不会同步改变 UI Automation 暴露的名称。
- DirectWrite 在创建布局后使用的字符范围不会自动补偿新增空格，因此范围格式、
  命中测试或混合样式文本可能存在偏移。这也是现代路径仅在菜单和 Tooltip
  popup 活动期间启用的原因。
- 经典菜单对象可能被 Explorer 重用；关闭模组后，已经写入菜单对象的空格可能
  保留到 Explorer 重启。
- 遇到现代 UI 兼容问题时先关闭 `modernUiText`，经典菜单路径仍可独立使用。
- 模组默认把所有 Unicode 字母和数字视为非 CJK“单词字符”。如果只希望处理
  `A-Z`、`a-z` 和 `0-9`，将 `characterMode` 改为 `ascii`。
- 全角拉丁字母和数字已有表意文字宽度，在 Unicode 模式下也不会额外插入空格。

## 排查

如果某个菜单项没有变化：

1. 在模组的“高级”（Advanced）页面启用 Windhawk 调试日志。
2. 打开“显示日志输出”，再复现一次问题。
3. 查看是否出现 `Applied CJK spacing`，以及 `Tracking modern menu popup`
   或 `Tracking modern tooltip popup`。

完成排查后关闭 Windhawk 调试日志，避免产生不必要的输出。
