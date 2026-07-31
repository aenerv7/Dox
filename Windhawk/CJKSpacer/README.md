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
`modernUiText`。它依赖 XAML Diagnostics，因此仍默认关闭，以避免和其他
同样使用 XAML Diagnostics 的定制工具争用同一连接，例如
Windows 11 Taskbar Styler 和 Windows 11 File Explorer Styler。

## 实现范围

- 经典菜单：只在 `TrackPopupMenu` / `TrackPopupMenuEx` 正在显示 popup
  菜单时处理 `HMENU`，包括显示前已有的菜单项，以及菜单打开期间动态新增或
  修改的 Unicode 菜单项。这包括由 `explorer.exe` 托管的文件资源管理器、
  桌面、任务栏、托盘和跳转列表右键菜单；菜单关闭后会立即恢复原文，不再
  提前或持续改写尚未显示的普通菜单。
- 经典 Tooltip：跟踪为 `TOOLTIP` 类打开的 Windows 主题句柄，通过
  `GetThemeTextExtent` 处理文字测量，并通过 `DrawThemeText` /
  `DrawThemeTextEx` 处理绘制。这覆盖网易 UU 远程等第三方通知区域图标使用
  的旧式 Tooltip。绘制路径先通过已跟踪的主题句柄快速过滤；如果 HDC 能映射
  到窗口，还必须由 `WindowFromDC` 确认该窗口属于 `tooltips_class32`，
  因而复用旧主题句柄的其他控件不会被误改。此路径仅覆盖通过 `uxtheme`
  绘制的主题化 Tooltip；在已运行的 Explorer 中启用模组时，也会发现已有
  Tooltip 控件的主题句柄。经典/基本主题下直接使用 `DrawTextW` 绘制的
  Tooltip 不在处理范围内。
- Windows 11 XAML 界面：通过 XAML Diagnostics 接收视觉树变化，同时支持
  Windows.UI.Xaml 和 Microsoft.UI.Xaml。现代路径修改
  `MenuFlyoutItem.Text`、`MenuFlyoutSubItem.Text` 或字符串形式的
  `ToolTip.Content`，但仅限属性本身保存的普通本地字符串；Binding、Style
  和其他表达式会被跳过，因此不会覆盖数据绑定或呈现层 `TextBlock` 的模板
  绑定。普通 XAML 文本和任务栏缩略图不属于这些源控件。
- 现代路径不猜测 XAML 源属于哪个 popup。XAML Diagnostics 报告受支持的源
  元素进入视觉树时立即处理，元素离开视觉树时恢复；禁用或更新模组时也会
  恢复仍在跟踪的值。这避免了缓存、隐藏或复用的 popup 把源错误归给随后显示
  的菜单或 Tooltip。
- XAML 元素状态按 UI 线程分别保存。禁用或更新模组时，恢复和释放操作会同步
  派发到各元素所属线程；无法到达的线程不会从错误线程执行属性恢复，其中仅含
  弱引用的状态会随所属线程退出正常释放。线程登记使用线程创建时间识别 ID
  复用，并在显式登记和卸载快照时清理死线程，不在线程局部对象析构期间获取
  全局互斥锁。
- XAML Diagnostics 在模组初始化完成后异步连接；如果相关 XAML DLL 稍后
  加载，对 `kernelbase.dll!LoadLibraryExW` 的 Hook 只调度一次短生命周期
  连接任务，不会在 Windows Loader Lock 路径内执行 COM 激活。任务以
  single-flight 方式运行并在执行期间显式保留模组 DLL 引用，因此卸载不必
  等待它，也不会让线程继续执行已经卸载的代码。只有 TAP 实际创建了视觉树
  watcher 才会把连接记为成功，因此被其他工具拦截但返回 `S_OK` 不会造成
  假成功。
- 只注入 `explorer.exe`，不会修改系统文件、注册表或文件名。现代路径临时
  修改目标 XAML 源属性并在源离开视觉树或模组卸载时恢复；经典路径会修改
  `HMENU` 保存的文字，因此辅助技术读取到的经典菜单文本也会包含新增空格。
  文件名本身不会改变，但它出现在经典菜单中时，显示文字也可能被加入空格。
- “开始”、搜索以及部分飞出面板由 `StartMenuExperienceHost.exe`、
  `SearchHost.exe` 或 `ShellExperienceHost.exe` 托管，不属于本模组的
  `explorer.exe` 注入范围。

## 已知限制

- Windows 没有公开的全局菜单文字过滤 API。新版弹出界面实现可能随 Windows
  更新而改变；如果不再使用受支持的 XAML 源控件类型，可能漏掉部分文字。
- XAML Diagnostics 的每个 XAML 连接只能有一个消费者。UWPSpy、其他
  Diagnostics 型 Windhawk 模组（包括 Windows 11 Taskbar Styler 和
  Windows 11 File Explorer Styler）或调试工具已占用连接时，现代路径可能
  无法初始化；经典菜单和 Tooltip 路径不受影响。
- 现代路径只处理带 `Text` 属性的标准 XAML 菜单项，以及内容可解包为字符串
  且属性值是普通本地字符串的 Tooltip。由 Binding、Style 或模板提供的值，
  以及自定义绘制、RichTextBlock、图片或任意自定义内容不在处理范围内。
- 经典菜单在显示前改写的字符串会被记录，并在 popup 关闭时立即尽量恢复；
  如果其他组件已再次修改同一菜单项，则保留其新值。卸载模组时还会清理尚未
  完成的记录。popup 打开期间，其他通过文字匹配菜单项的模组也会读到加入空格
  后的字符串，可能需要相应调整其匹配规则。
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
3. 查看是否出现 `Connected to ... XAML diagnostics` 和
   `Applied CJK spacing (modern XAML menu source/tooltip source)`；经典
   Tooltip 会显示
   `Tracking classic Win32 tooltip theme` 和 `classic tooltip/...`。

完成排查后关闭 Windhawk 调试日志，避免产生不必要的输出。
