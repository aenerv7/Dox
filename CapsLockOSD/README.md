# CapsLockOSD

CapsLockOSD 是一个 Windows 原生 Caps Lock 屏幕提示工具，用 Win32 API 和系统自带 GDI+ 实现，目标是接近 Logitech Options 的大小写提示效果，同时保持单 exe、低依赖。

## 行为

- 仅在 Caps Lock 状态切换时显示 OSD。
- OSD 显示在当前前台窗口所在屏幕约 90% 垂直位置。
- 背景为半透明纯黑圆角矩形，默认透明度为 `155/255`。
- 整体尺寸为初始 Logitech Options 风格复刻尺寸的 `75%`。
- Caps Lock 开启时图标显示大写 `A`，关闭时显示小写 `a`。
- 文字和图标保持不透明，保证可读性。
- OSD 置顶、无焦点、点击穿透，不打断当前输入。
- OSD 显示初期会短时间重申 topmost 层级，改善无边框全屏/伪全屏窗口抢回 z-order 的情况。
- 支持多显示器和 Per-Monitor DPI 缩放。
- 状态文本跟随 Windows UI 语言：
  - 简体中文：`大写锁定已开启` / `大写锁定已关闭`
  - 繁体中文：`大寫鎖定已開啟` / `大寫鎖定已關閉`
  - 英文：`Caps Lock On` / `Caps Lock Off`
- 单实例运行，重复启动会直接退出。
- 不创建托盘图标。
- 不内置开机自启动。
- 启动时读取 exe 同目录的 `CapsLockOSD.ini`；若文件不存在，会自动生成默认配置。

## 配置

配置文件位于 `CapsLockOSD.exe` 同级目录：

```ini
; CapsLockOSD configuration
; BackgroundAlpha: 0-255. 0 is fully transparent, 255 is fully opaque.
; DisplayDurationMs: OSD display duration in milliseconds.

[OSD]
BackgroundAlpha=155
DisplayDurationMs=1000
```

- `BackgroundAlpha` 控制 OSD 黑色背景透明度，范围 `0-255`，默认 `155`。
- `DisplayDurationMs` 控制提示显示时长，单位毫秒，默认 `1000`。程序会将该值限制在 `100-10000` 之间。

## 自启动

如需登录时自动启动，建议使用 Windows 任务计划程序。示例：

```powershell
$exe = 'C:\Workspace\GitHub\Dox\CapsLockOSD\CapsLockOSD.exe'
schtasks /Create /TN 'CapsLockOSD' /TR "`"$exe`"" /SC ONLOGON /RL LIMITED /F
```

删除任务：

```powershell
schtasks /Delete /TN 'CapsLockOSD' /F
```

程序启动时会自动删除旧版本可能留下的 Run 注册表项：

```text
HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Dox CapsLockOSD
```

## 全屏窗口限制

CapsLockOSD 使用普通 Win32 topmost layered window 绘制 OSD。对无边框全屏、伪全屏和普通窗口全屏，程序会尽量保持在最上层；但对 DirectX 独占全屏、独立翻转全屏、受保护内容或游戏/驱动级覆盖层，普通 Win32 窗口无法保证一定显示在最上层。

需要稳定显示 OSD 时，优先把游戏或应用切换为“无边框窗口化 / borderless windowed”。真正覆盖独占全屏通常需要注入渲染管线、使用游戏/驱动覆盖层或系统级 UIAccess/签名部署，这不属于本工具的最小依赖实现范围。

## 停止

因为没有托盘图标，可以在任务管理器结束 `CapsLockOSD.exe`，或执行：

```powershell
taskkill /IM CapsLockOSD.exe /F
```

## 构建

PowerShell 构建脚本会自动定位 Visual Studio / Build Tools：

```powershell
.\build.ps1
```

也可在 Visual Studio Developer Command Prompt 中运行传统批处理：

```bat
build.bat
```

也支持 CMake：

```powershell
cmake -S . -B build
cmake --build build --config Release
```

默认 MSVC 构建使用 `/MT` 静态链接 C/C++ 运行库。运行时只依赖 Windows 系统 DLL：

- `USER32.dll`
- `ADVAPI32.dll`
- `KERNEL32.dll`
- `GDI32.dll`
- `gdiplus.dll`

## 文件

- `CapsLockOSD.cpp` - Win32 消息循环、Caps Lock 状态轮询、OSD 绘制、多语言文本、旧 Run 项清理。
- `app.ico` - 应用图标。
- `CapsLockOSD.rc` / `resource.h` / `CapsLockOSD.manifest` - Windows 资源和 DPI awareness manifest。
- `build.ps1` / `build.bat` / `CMakeLists.txt` - 构建入口。
