# CJKSpacer

用于 `explorer.exe` 托管的菜单、工具提示（Tooltip）和弹出界面 UI 文本的
Windhawk 模组。在 CJK 字符与字母或数字直接相邻时插入一个半角空格；已有
空格、标点、经典菜单助记键标记和快捷键说明保持不变。

```text
使用VS Code打开     → 使用 VS Code 打开
压缩为ZIP文件       → 压缩为 ZIP 文件
使用 VS Code 打开   → 使用 VS Code 打开
打开(&O)            → 打开(&O)
```

## 效果截图

启用前：

![启用 CJK Spacer 前](./Before.png)

启用后：

![启用 CJK Spacer 后](./After.png)

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
- `classicTooltips = true`
- `modernUiText = true`
- `characterMode = unicode`

## 实现范围

- 经典菜单：在 `HMENU` 显示前处理已有菜单项，并拦截运行时新增或修改的
  Unicode 菜单项。这包括由 `explorer.exe` 托管的文件资源管理器、桌面、
  任务栏、托盘和跳转列表菜单。
- 经典 Tooltip：跟踪为 `TOOLTIP` 类打开的 Windows 主题句柄，通过
  `GetThemeTextExtent` 处理文字测量，并通过 `DrawThemeText` /
  `DrawThemeTextEx` 处理绘制。这覆盖网易 UU 远程等第三方通知区域图标使用
  的旧式 Tooltip，同时不会影响无关 GDI 文本。
- Windows 11 XAML/WinUI 弹出界面：识别 Explorer 使用的 popup 窗口类，
  并只在同一 UI 线程上拦截 DirectWrite 文本布局。此实验性路径包括新版
  菜单、Tooltip 和其他飞出面板，但明确排除任务栏缩略图预览窗口。
- 只注入 `explorer.exe`，不会修改系统文件、注册表或文件名。DirectWrite
  路径只改变显示文字；经典路径会修改 `HMENU` 保存的文字，因此辅助技术读取
  到的经典菜单文本也会包含新增空格。

## 已知限制

- Windows 没有公开的全局菜单文字过滤 API。新版弹出界面实现可能随 Windows
  更新而改变；如果使用了不同的 popup 窗口类，可能漏掉部分文字。
- 新版菜单处理的是最终显示层，不会同步改变 UI Automation 暴露的名称。
- DirectWrite 在创建布局后使用的字符范围不会自动补偿新增空格，因此范围格式、
  命中测试或混合样式文本可能存在偏移。这也是现代路径仅在菜单和 Tooltip
  popup 活动期间启用的原因。
- 经典菜单在显示前改写的字符串会被记录，并在关闭对应功能或卸载模组时尽量
  恢复；如果其他组件已再次修改同一菜单项，则保留其新值。
- 遇到现代 UI 兼容问题时先关闭 `modernUiText`，经典菜单路径仍可独立使用。
- 如果旧式 Tooltip 出现尺寸或绘制问题，可以单独关闭 `classicTooltips`。
- 模组默认把所有 Unicode 字母和数字视为非 CJK“单词字符”。如果只希望处理
  `A-Z`、`a-z` 和 `0-9`，将 `characterMode` 改为 `ascii`。
- 全角拉丁字母和数字已有表意文字宽度，在 Unicode 模式下也不会额外插入空格。

## 排查

如果某个菜单项没有变化：

1. 在模组的“高级”（Advanced）页面启用 Windhawk 调试日志。
2. 打开“显示日志输出”，再复现一次问题。
3. 查看是否出现 `Applied CJK spacing` 和 `Tracking modern popup`；经典
   Tooltip 会显示 `Tracking classic Win32 tooltip theme` 和
   `classic tooltip/...`。

完成排查后关闭 Windhawk 调试日志，避免产生不必要的输出。
