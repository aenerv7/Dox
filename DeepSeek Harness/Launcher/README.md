# DeepSeek Harness Launcher

DeepSeek Harness 系统托盘启动器 —— **纯 Windows 11 原生代码实现**（C++ / Win32 API，MSVC 编译，静态链接运行时，无任何第三方依赖）。**完全便携：不写注册表、无安装过程**，托盘程序自身的开机自启交由任务计划程序负责。

## 功能

- **系统托盘图标**，右键弹出菜单
- **启动 / 停止 DeepSeek Harness**：同一菜单项二选一显示（运行中显示「停止」，已停止显示「启动」）
- **重启 DeepSeek Harness**（先停止、等端口释放、再启动）
- **自定义启动端口**：菜单项打开设置对话框，写入 ini，下次启动生效
- **随托盘程序自启动 DeepSeek Harness**：勾选后，托盘程序一启动就自动拉起 Harness（配合任务计划程序的登录自启即可实现开机全自动启动）
- **双击托盘图标**直接打开 Web 界面
- 托盘提示文字实时显示运行状态与当前端口
- 所有设置写入 **exe 同目录的 `Launcher.ini`**

## 目录结构

```
Launcher/
├── src/
│   ├── Launcher.cpp        # 主程序（纯 Win32）
│   ├── Resource.h          # 资源 / 命令 ID
│   ├── Launcher.rc         # 图标、端口对话框、清单、版本信息
│   ├── app.manifest        # DPI 感知、Win11 兼容、长路径
│   └── Launcher.ico        # 托盘图标（脚本生成）
├── scripts/
│   ├── build.ps1           # Visual Studio (MSVC) 构建脚本
│   ├── make-icon.ps1       # 图标生成脚本
│   └── test-lifecycle.ps1  # 自动化生命周期测试
├── Launcher.ini.example    # 配置模板（含注释）
├── DEVELOPMENT.md          # 开发文档（架构 / 构建 / 陷阱 / 扩展）
└── bin/                    # 构建产物（Launcher.exe 等，不入库）
```

## 构建

前置：本机安装 Visual Studio，且安装了 **「使用 C++ 的桌面开发」** 工作负载。

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
```

产物：`bin\Launcher.exe`（x64，`/MT` 静态链接，目标机器无需安装 VC++ 运行库）。

重新生成托盘图标（可选）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\make-icon.ps1
```

## 使用

1. 双击 `bin\Launcher.exe`，任务栏托盘区出现图标（无窗口）。
2. 右键托盘图标 → 选择「启动 DeepSeek Harness」。
3. 双击托盘图标可打开 Web 界面（`http://127.0.0.1:<端口>`）。
4. 首次运行会自动在 exe 同目录生成默认 `Launcher.ini`。

> 托盘程序一次只能运行一个实例（互斥体保证）。**退出托盘程序会同时停止 DeepSeek Harness**（若 Harness 由外部启动，退出前会提示并一并结束），托盘完全接管 Harness 的启动状态控制。

**开机自启动（便携方式）**：本程序不写注册表，请用任务计划程序（`taskschd.msc`）新建任务：登录时运行 `Launcher.exe`，并勾选菜单「随托盘程序自启动 DeepSeek Harness」即可实现开机后自动启动 Harness。

## 配置（Launcher.ini，与 Launcher.exe 同目录）

```ini
[General]
; Web 界面启动端口（1-65535），对应 dsh web --port <port>
Port=16100
; 随托盘程序启动时自动启动 DeepSeek Harness（0=否，1=是）
AutoStart=0
; 高级：node.exe 的完整路径（留空自动查找：PATH → 常见安装目录）
NodePath=
; 高级：dsh 的 lib\bin.js 完整路径（留空自动查找：%APPDATA%\npm 全局安装）
DshBin=
```

托盘程序启动的完整命令为：

```
"<node.exe>" "<dsh 的 lib\bin.js>" web --port <Port>
```

## 实现要点

- **进程管理**：直接以 `node.exe …\dsh\lib\bin.js web --port <N>` 派生进程，进程句柄可直接判断存活；停止时用**作业对象**整树终止（Harness 可能派生子进程）。作业对象启用 `KILL_ON_JOB_CLOSE`：托盘退出（包括被强制结束、崩溃）时 Harness 一并终止，保证托盘完全接管启停状态。
- **运行状态判定**：托管进程存活 **或** TCP 探测 `127.0.0.1:<端口>` 可连接，二者任一为真即视为运行中——因此能正确识别“由其他方式启动的实例”。
- **外部实例停止**：若端口被外部启动的 Harness 占用，停止时会先询问用户，再通过 TCP 表找到监听进程并结束。
- **单实例**：命名互斥体 `Local\DSHLauncher_SingleInstance`。
- **自动化接口**：隐藏窗口支持私有消息 `WM_APP+100~103`（启动/停止/重启/状态查询），测试脚本据此驱动。
- **日志**：`Launcher.log`（exe 同目录，UTF-16，超 256KB 自动截断）。

## 测试

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-lifecycle.ps1
```

用一个临时 Node HTTP 服务器代替真实 Harness，通过私有消息驱动验证：随托盘自启动、状态查询、停止、再启动、重启（进程 PID 变化）、无残留进程、日志记录；结束后自动清理并恢复默认配置。

## 常见问题

**Q：启动时提示「未找到启动组件」？**
需要 Node.js 与全局安装的 dsh 包（`npm i -g @deepseek-ai/dsh`）。也可以在 ini 中手动指定 `NodePath` / `DshBin`。

**Q：端口被占用 / Harness 由别的方式启动？**
托盘菜单的「停止」会检测到端口上的非托管实例并询问是否结束（通过 TCP 表定位 PID）。

**Q：修改端口后没有生效？**
端口在下次启动 DeepSeek Harness 时生效；若当前正在运行，先重启（或停止后重新启动）。

**Q：退出托盘程序后 DeepSeek Harness 会怎样？**
会一并停止。托盘程序是 Harness 的唯一启停控制器：菜单「退出」（或托盘进程被强制结束）都会终止 Harness（外部启动的实例退出前会先询问）。

**Q：如何实现开机自动启动 Harness？**
本程序完全便携、不写注册表。请用任务计划程序（`taskschd.msc`）新建任务：登录时运行 `Launcher.exe`，并在托盘菜单勾选「随托盘程序自启动 DeepSeek Harness」：开机 → 任务计划启动托盘程序 → Harness 自动启动。
