# CJKSpacer

用于 `explorer.exe` 托管的右键菜单和鼠标工具提示（Tooltip）UI 文本的
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

建议先保持稳定路径的默认设置：

- `classicMenus = true`
- `classicTooltips = true`
- `modernUiText = false`
- `characterMode = unicode`

如果需要处理 Windows 11 新版 XAML 右键菜单和 Tooltip，再手动启用
`modernUiText`。该路径属于实验性功能。

## 实现范围

- 经典菜单：只在 `TrackPopupMenu` / `TrackPopupMenuEx` 正在显示 popup
  菜单时处理 `HMENU`，包括显示前已有的菜单项，以及菜单打开期间动态新增或
  修改的 Unicode 菜单项。这包括由 `explorer.exe` 托管的文件资源管理器、
  桌面、任务栏、托盘和跳转列表右键菜单；菜单关闭后会立即恢复原文，不再
  提前或持续改写尚未显示的普通菜单。
- 经典 Tooltip：跟踪为 `TOOLTIP` 类打开的 Windows 主题句柄，通过
  `GetThemeTextExtent` 处理文字测量，并通过 `DrawThemeText` /
  `DrawThemeTextEx` 处理绘制。这覆盖网易 UU 远程等第三方通知区域图标使用
  的旧式 Tooltip，同时不会影响无关 GDI 文本。此路径仅覆盖通过 `uxtheme`
  绘制的主题化 Tooltip；在已运行的 Explorer 中启用模组时，也会发现已有
  Tooltip 控件的主题句柄。经典/基本主题下直接使用 `DrawTextW` 绘制的
  Tooltip 不在处理范围内。
- Windows 11 XAML 界面：识别新版右键菜单和鼠标 Tooltip 使用的 popup
  窗口类，并只在同一 UI 线程上拦截 DirectWrite 文本布局。任务栏缩略图、
  与缩略图关联的 XAML popup，以及鼠标位于缩略图表面时的布局会被全局排除。
  被跟踪的合格 popup 可见时，同一 UI 线程上布局的其他 XAML 文本仍可能被
  处理；其他 Explorer 线程不受影响。
- 只注入 `explorer.exe`，不会修改系统文件、注册表或文件名。DirectWrite
  路径只改变显示文字；经典路径会修改 `HMENU` 保存的文字，因此辅助技术读取
  到的经典菜单文本也会包含新增空格。文件名本身不会改变，但它出现在经典菜单
  中时，显示文字也可能被加入空格。
- “开始”、搜索以及部分飞出面板由 `StartMenuExperienceHost.exe`、
  `SearchHost.exe` 或 `ShellExperienceHost.exe` 托管，不属于本模组的
  `explorer.exe` 注入范围。

## 已知限制

- Windows 没有公开的全局菜单文字过滤 API。新版弹出界面实现可能随 Windows
  更新而改变；如果使用了不同的 popup 窗口类，可能漏掉部分文字。
- `Xaml_WindowedPopupClass` 是 WinUI 共用窗口类，DirectWrite 布局调用本身
  不携带目标窗口句柄，因此现代路径只能安全地收束到 popup 所在 UI 线程，
  不能保证逐控件绑定；任务栏缩略图采用额外的全局抑制规则。
- 新版菜单处理的是最终显示层，不会同步改变 UI Automation 暴露的名称。
- DirectWrite 在创建布局后使用的字符范围不会自动补偿新增空格，因此范围格式、
  命中测试或混合样式文本可能存在偏移。这也是现代路径仅在菜单和 Tooltip
  popup 活动期间启用的原因。
- 经典菜单在显示前改写的字符串会被记录，并在 popup 关闭时立即尽量恢复；
  如果其他组件已再次修改同一菜单项，则保留其新值。卸载模组时还会清理尚未
  完成的记录。
- 启用 `modernUiText` 后如果遇到现代 UI 兼容问题，请重新关闭；经典菜单和
  Tooltip 路径仍可独立使用。
- 如果旧式 Tooltip 出现尺寸或绘制问题，可以单独关闭 `classicTooltips`。
- 修改功能开关后，Windhawk 会重新加载模组，只安装仍启用功能所需的 Hook。
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
