# DeepSeek Harness Launcher 开发文档

> 面向维护者/开发者的技术说明。使用说明见 [README.md](README.md)。

## 1. 项目概述

DeepSeek Harness Launcher 是一个系统托盘程序，用于**完全接管** DeepSeek Harness（`dsh web`）的启动状态控制：

- 启动 / 停止（同一菜单项二选一显示）、重启
- 自定义启动端口（写 `Launcher.ini`）
- 随托盘程序自启动 Harness
- 退出托盘（含被强杀）时 Harness 一并终止

**硬性约束**：

- 纯 Win32 原生代码（C++20，MSVC 编译），**零第三方运行时依赖**（`/MT` 静态链接 CRT）
- 目标系统 Windows 10/11（代码以 `_WIN32_WINNT=0x0A00` 编译）
- **完全便携**：不写注册表、无安装过程，所有设置写入 exe 同目录 `Launcher.ini`；
  托盘程序自身的开机自启由外部任务计划程序负责（程序内不再维护任何自启动逻辑）

## 2. 目录结构

```
Launcher/
├── src/
│   ├── Launcher.cpp        # 全部业务逻辑（单文件，约 700 行）
│   ├── Resource.h          # 资源与菜单命令 ID
│   ├── Launcher.rc         # 图标 / 端口对话框 / 清单 / 版本信息（必须 UTF-8 BOM）
│   ├── app.manifest        # DPI 感知、Win11 兼容、长路径、Common-Controls v6
│   └── Launcher.ico        # 托盘图标（由 scripts\make-icon.ps1 生成，纳入版本库）
├── scripts/
│   ├── build.ps1           # MSVC 构建脚本（rc + cl /c + link 三步）
│   ├── make-icon.ps1       # 图标生成脚本（多尺寸 PNG 压缩 ICO）
│   └── test-lifecycle.ps1  # 自动化生命周期测试
├── Launcher.ini.example    # 配置模板（UTF-16LE，含注释）
├── DEVELOPMENT.md          # 本文档
└── README.md               # 用户文档
```

## 3. 架构与模块划分

`src\Launcher.cpp` 按职责分为以下几个区（文件内注释已分段）：

| 模块 | 位置 | 职责 |
|---|---|---|
| 配置 | `Config` / `LoadConfig` / `Read/WriteIniStr` | 读写 exe 同目录 `Launcher.ini` |
| 组件发现 | `FindNodeExe` / `FindDshBin` / `SearchPathFor` | 定位 node.exe 与 dsh 的 `lib\bin.js` |
| 状态探测 | `IsPortOpen` / `PortOwnerPid` | TCP 探测端口、TCP 表定位监听 PID |
| 进程管理 | `StartDSH` / `StopDSH` / `RestartDSH` / `StopManaged` | 派生、整树终止、重启 Harness |
| 托盘 UI | `ShowTrayMenu` / `HandleCommand` / `WndProc` | 托盘图标、右键菜单、命令分发 |
| 端口对话框 | `PortDlgProc` | 端口输入与校验（1-65535） |
| 日志 | `Log` | 追加写 `Launcher.log`（UTF-16LE，超 256KB 截断） |

### 3.1 进程模型（核心）

启动命令（`StartDSH`）：

```
"<node.exe>" "<dsh 的 lib\bin.js>" web --port <Port>
```

- 直接以 `node.exe` 派生，**不经过 cmd.exe**，因此进程句柄即 Harness 主进程，可直接判断存活。
- 派生时用 `CREATE_SUSPENDED` 先创建，**AssignProcessToJobObject 后再 ResumeThread**，保证 Harness 及其全部子进程（pwsh 沙箱、vision-router 等）都进入作业对象。
- 作业对象设置 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`：
  - 停止 = `TerminateJobObject`（整树终止）；
  - 托盘进程退出（无论正常退出还是被强杀）→ 最后一个作业句柄关闭 → 系统自动终止整树。这是"托盘完全接管启停状态"的硬保障。
- 兜底：若 `AssignProcessToJobObject` 失败（如托盘自身已处于禁止嵌套的作业中），回退为单进程管理（`TerminateProcess`），`WM_DESTROY` 与 `StopManaged` 均已覆盖该分支。

### 3.2 运行状态判定

`IsRunning() = 托管进程句柄存活 || TCP 探测 127.0.0.1:<Port> 可连接`。

- 句柄判定：`WaitForSingleObject(g_hProc, 0) == WAIT_TIMEOUT`。
- 端口探测：非阻塞 `connect` + `select`，最多等 200ms，避免阻塞 UI 线程。
- 双条件设计使托盘能识别**由外部启动的实例**（如手动 `dsh web`）。停止外部实例时通过 `GetExtendedTcpTable`（`TCP_TABLE_OWNER_PID_LISTENER`）定位监听 PID，并经用户确认后 `OpenProcess(PROCESS_TERMINATE) + TerminateProcess`。

### 3.3 托盘 UI

- 隐藏顶层窗口（类名 `DSHLauncherWnd`），`Shell_NotifyIcon` 挂托盘图标，回调消息 `WM_APP+1`。
- 右键（v3 行为：`WM_RBUTTONUP`）弹出菜单；`TrackPopupMenu` 前 `SetForegroundWindow`，返回后 `PostMessage(WM_NULL)` 保证菜单正确收起。
- 每次弹菜单**重建**（标签随状态切换：运行中显示「停止」，停止显示「启动」；重启/打开网页在停止时置灰）。
- 双击托盘（`WM_LBUTTONDBLCLK`）打开 Web 界面。
- 2 秒定时器刷新托盘提示文字；定时器同时回收已退出进程的句柄。

### 3.4 私有消息协议（自动化/调试接口）

隐藏窗口支持以下私有消息（`WM_APP+100~103`），测试脚本据此驱动，不干扰正常使用：

| 消息 | 值 | 作用 |
|---|---|---|
| `kMsgStart` | `WM_APP+100` (0x8064) | 启动 |
| `kMsgStop` | `WM_APP+101` (0x8065) | 停止 |
| `kMsgRestart` | `WM_APP+102` (0x8066) | 重启 |
| `kMsgQuery` | `WM_APP+103` (0x8067) | 查询运行状态，返回 1/0 |

### 3.5 单实例

命名互斥体 `Local\DSHLauncher_SingleInstance`（`CreateMutex` + `ERROR_ALREADY_EXISTS` 判定）。

## 4. 构建系统

`scripts\build.ps1`（PowerShell 7 / Windows PowerShell 5.1 均可）：

1. **vswhere 定位 VS**：`-requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64`，取 `installationPath`，再定位 `VC\Auxiliary\Build\vcvars64.bat`。
2. **rc 编译资源**：在 `src` 目录下执行 `rc /fo ..\bin\Launcher.res Launcher.rc`（相对路径避开带空格路径的引号问题）。
3. **cl 仅编译**：`cl /c /EHsc /std:c++20 /O2 /MT /DUNICODE /D_UNICODE /D_WIN32_WINNT=0x0A00 /DWINVER=0x0A00 /D_CRT_SECURE_NO_WARNINGS /W3 /utf-8` 产出 `Launcher.obj`。
4. **link 显式链接**：`link /SUBSYSTEM:WINDOWS /MACHINE:X64 Launcher.obj Launcher.res /OUT:Launcher.exe`。

> **为什么拆成 cl /c + link 两步？**
> 踩坑记录：`cl ... /Fo: /Fe: ... /link` 一步式链接时，链接阶段收不到编译产物（`LNK4001: no object files specified` → `LNK2001: unresolved WinMainCRTStartup`），手动 `link` 相同 obj 却成功。拆开编译与链接即可绕开，且更接近标准 Makefile 流程。

## 5. 已知陷阱与约定（重要）

以下是本仓库开发过程中实际踩过、后续改动必须注意的点：

1. **`wWinMain` 必须是全局函数**。放在匿名命名空间内时，MSVC 无法识别入口函数，链接报 `WinMainCRTStartup` 未解析。其余辅助函数统一放入匿名命名空间 `namespace { }`。
2. **`/utf-8` 编译选项必须保留**：系统代码页可能是 GBK（936），不带 `/utf-8` 时中文注释/字符串会被误解析（C4819/C2001 一串报错）。
3. **`.rc` 与 `Resource.h` 必须是 UTF-8 BOM**：`rc.exe` 对无 BOM 的 UTF-8 中文注释会报 `RC1004: unexpected end of file`。写入文件后需转换加 BOM（见 build 流程外的 `[IO.File]::WriteAllText(..., UTF8Encoding($true))` 步骤）。
4. **ini 编码**：`GetPrivateProfileStringW`/`WritePrivateProfileStringW` 对 UTF-16LE（带 BOM）文件可正确读写并保留注释，因此随包发布的 `Launcher.ini` 使用 UTF-16LE；程序首次运行生成的默认 ini 为系统 ANSI，两种编码均被支持。
5. **PowerShell 脚本内避免弯引号**“ ”：PowerShell 会把中文弯引号当作字符串定界符导致解析错误，统一用「」。
6. **PowerShell 的 `$null` 编组**：P/Invoke 传 `$null` 给 `FindWindow` 会被编组成空字符串而非通配 NULL，必须同时传类名与标题（测试脚本已固化此写法）。
7. **`New-Object TypeName(a, b, c)` 多参构造是陷阱**：会按单数组参数绑定，改用 `[TypeName]::new(a, b, c)`（图标脚本中已修正）。
8. **`$PID` 是只读变量**，测试脚本中不要对其赋值。
9. **图标**：`Launcher.ico` 由 `scripts\make-icon.ps1` 生成（PNG 压缩多尺寸 ICO，含 16/20/24/32/48/64/256），已纳入版本库，改图标后需重新生成并提交。
10. **清理残留**：托盘派生进程用作业对象管理后，测试/调试结束务必确认无残留 `node.exe`（`KILL_ON_JOB_CLOSE` 已保证托盘进程死亡即清理，但手工杀进程的场景要注意）。

## 6. 测试

`scripts\test-lifecycle.ps1`（PowerShell 7）：

- 用临时 Node HTTP 服务器（`test-server.js`）**代替真实 Harness**，避免启动第二个完整实例污染 `$DSH_HOME`。
- 通过私有消息驱动 Launcher：随托盘自启动（`AutoStart=1`）→ 状态查询 → 停止 → 再启动 → 重启（对比监听 PID 变化）→ **强杀托盘验证 KILL_ON_JOB_CLOSE**（端口关闭、无残留 node 进程）→ 日志断言。
- `finally` 块统一清理：杀 Launcher/测试服务器、删临时文件、恢复默认 ini。

运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-lifecycle.ps1
```

## 7. 扩展指引

- **新增菜单项**：`Resource.h` 加 ID → `ShowTrayMenu` 加 `AppendMenuW` → `HandleCommand` 加 case。
- **修改端口生效策略**：目前端口在对话框确定后写入 ini，提示"重启后生效"；若改为即时生效，可在 `IDM_PORT` 成功后调用 `RestartDSH()`（注意先确认用户意图）。
- **接入其它 Harness 启动方式**：`FindNodeExe`/`FindDshBin` 已支持 ini 覆盖（`NodePath`/`DshBin`），如需支持自定义命令行模板，可在 `StartDSH` 中扩展。
- **日志级别**：`Log` 目前全量记录生命周期事件；如需降噪可增加 `Debug` 开关（ini 键）。

## 8. 版本库约定

- `bin\` 整体忽略（`DeepSeek Harness/Launcher/bin/` 已在根 `.gitignore`），**产物不入库**。
- 源码、脚本、文档、图标、`Launcher.ini.example` 均入库。
- 提交信息建议前缀：`launcher: ...`。
