# CJKSpacer

用于 Windows 11 文件资源管理器右键菜单 UI 文本的 Windhawk 模组。在 CJK
字符与字母或数字直接相邻时插入一个半角空格；已有空格、标点、助记键标记和
快捷键说明保持不变。

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
- `modernMenus = true`
- `characterMode = unicode`
- `debugLogging = false`

## 实现范围

- 经典菜单：在 `HMENU` 显示前处理已有菜单项，并拦截运行时新增或修改的
  Unicode 菜单项。
- Windows 11 新版菜单：检测 Explorer 的 XAML/WinUI 弹出窗口，在其活动期间
  拦截 DirectWrite 文本布局。这条路径属于启发式实现。
- 只注入 `explorer.exe`，不会修改系统文件、注册表或文件名。

## 已知限制

- Windows 没有公开的全局菜单文字过滤 API。新版菜单实现可能随 Windows
  更新而改变，因此某些版本上可能漏掉部分文字。
- 新版菜单处理的是最终显示层，不会同步改变 UI Automation 暴露的名称。
- Explorer 显示其他 XAML 弹出控件时，其中符合规则的文本也可能被处理。
  遇到问题时先关闭 `modernMenus`，经典菜单路径仍可独立使用。
- 模组默认把所有 Unicode 字母和数字视为非 CJK“单词字符”。如果只希望处理
  `A-Z`、`a-z` 和 `0-9`，将 `characterMode` 改为 `ascii`。

## 排查

如果某个菜单项没有变化：

1. 打开模组设置并启用 `debugLogging`。
2. 在模组的“高级”（Advanced）页面把 Windhawk 调试日志设为详细。
3. 打开“显示日志输出”，再复现一次问题。
4. 查看是否出现 `classic/...` 或 `modern/...` 开头的替换记录。

完成排查后关闭两处调试日志，避免产生不必要的输出。
