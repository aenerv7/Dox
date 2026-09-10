# PortableBridge

PortableBridge 是 Windows 上的便携浏览器 HTTP(S) 桥接器，支持 **Firefox 和 Chrome**。它从原来的 `Firefox/PortableBridge` 提取而来，可以独立构建和部署，无需 Dox 的其他模块。

便携启动器先报告浏览器 EXE 和配置目录，然后启动浏览器。Bridge 在浏览器主进程存活期间，临时接通 Windows 标准 HTTP(S) 协议入口，供桌面程序、OAuth 登录、Shell 和 GitHub CLI 等打开外部链接。

**最近启动的浏览器接管外部链接；它退出后，自动回退到仍在运行的上一会话。** 例如先启动 Firefox，再启动 Chrome，链接进入 Chrome；Chrome 退出后恢复 Firefox；全部退出后撤销 Bridge 的协议入口。启动时间来自主进程的 WMI `CreationDate`，重复上报、打开新标签页和 URL 转交进程不会刷新优先级。只有上报且匹配成功的浏览器参与选择。

这是无默认浏览器环境下的会话回退：已有有效的 Windows 默认浏览器、第三方协议命令或机器级协议根时，Bridge 不覆盖它们。明确指定浏览器、绕过 Windows 协议关联的应用不经过 Bridge。

## 构建与安装

需要 64 位 Windows 和系统 .NET Framework 4.x，无额外 NuGet 依赖：

```powershell
cd PortableBridge
.\build.ps1
.\test.ps1

# 可选：输出到实际部署目录
.\build.ps1 -OutputPath '<部署目录>\PortableBridge.exe'
```

默认产物为 `bin\PortableBridge.exe`，源码仓库不提交 EXE。测试覆盖参数解析、会话存储、完整切换/故障恢复流程、真实命名管道及 WMI 进程匹配，不修改系统协议关联。

Bridge 可部署到与浏览器无关、当前用户可写的目录。无参数运行 EXE 即成为常驻监视器；未提升时会请求 UAC。登录任务应选择当前用户、仅在用户登录时运行、使用最高权限，并禁止重复实例。程序没有控制台、窗口或托盘图标。

管理员权限用于创建和清理 `HKLM\Software\Classes\http` 和 `https`。协议内部入口 `open <session-guid> <URL>` 不请求 UAC。构建内嵌 `asInvoker` 清单，只有无参数常驻入口主动提升。构建脚本不创建或修改计划任务。

## 启动器接入

启动器只连接稳定的每用户命名管道，不查找或启动 Bridge EXE。仓库提供 `announce.ps1` 作为独立客户端，也可按下方契约将它内嵌到现有启动器。上报失败应中止本次启动。

Firefox 示例（在现有便携启动器完成环境设置后调用）：

```powershell
$firefox = [IO.Path]::GetFullPath('.\App\firefox.exe')
$profile = [IO.Path]::GetFullPath('.\Data\profile')
& '<客户端脚本目录>\announce.ps1' -Browser firefox -Executable $firefox -Profile $profile
if (-not $?) { throw 'Firefox announcement failed.' }
& $firefox --profile $profile
```

Chrome 示例：

```powershell
$chrome = [IO.Path]::GetFullPath('.\App\chrome.exe')
$userData = [IO.Path]::GetFullPath('.\Data\User Data')
& '<客户端脚本目录>\announce.ps1' -Browser chrome -Executable $chrome -Profile $userData
if (-not $?) { throw 'Chrome announcement failed.' }
& $chrome "--user-data-dir=$userData"
```

EXE 和配置目录必须已经存在。Chrome 的 `-Profile` 是 **User Data 根目录**，不是其中的 `Default` 或 `Profile 1` 子目录。如需明确使用子配置，在上报和首次启动中同时指定：

```powershell
& '<客户端脚本目录>\announce.ps1' -Browser chrome -Executable $chrome -Profile $userData -ProfileDirectory 'Profile 1'
if (-not $?) { throw 'Chrome announcement failed.' }
& $chrome "--user-data-dir=$userData" '--profile-directory=Profile 1'
```

| 浏览器 | 主进程匹配 | URL 投递 | 便携维护 |
|---|---|---|---|
| Firefox | 精确 EXE、显式 `--profile`；排除内容进程、`--no-remote`、`-url` 辅助进程 | `firefox.exe --profile <目录> -url <URL>` | 保留原版路径迁移、Mozilla 环境、基线、Launcher 和退出清理 |
| Chrome | 精确 EXE、显式 `--user-data-dir`；排除 `--type` 子进程；如上报子配置则也匹配它 | `chrome.exe --user-data-dir=<目录> [--profile-directory=<名称>] <URL>` | 不执行 Mozilla 清理，也不迁移或删除 Chrome 用户数据 |

Chrome 的安装、更新、初次启动环境及跨电脑迁移由便携启动器负责。指定 User Data 不等于解决 Chrome 密码或 Cookie 的 Windows 加密绑定。Firefox 本体的便携环境仍由原启动器设置，Bridge 负责 URL 转交进程环境和已有维护逻辑。

一次允许一个 Firefox 便携会话，以及使用不同 User Data 根的 Chrome 会话；Firefox 的主机 Mozilla 基线不能被多个 Firefox 会话并发维护。同一个 Chrome User Data 根不能作为多个独立会话上报。Chrome 开启后台应用时，关闭最后一个窗口可能仍保留主进程；此时它仍参与接管，直到主进程真正退出。

## 命名管道契约

| 项目 | 约定 |
|---|---|
| 管道名 | `PortableBridge-Control-<identity>` |
| identity | 当前用户 SID 转大写，取 UTF-8 SHA-256 的前 12 字节，编码为 24 位小写十六进制 |
| ACL | 仅当前用户 SID 的 `FullControl` |
| 编码 | .NET `BinaryWriter` / `BinaryReader`，UTF-8，字节流模式 |
| 请求 | 五个字符串：`announce-v3`、`firefox` 或 `chrome`、EXE 绝对路径、配置根绝对路径、Chrome 子配置名（不使用时为空字符串） |
| 响应 | Int32：0 接受；73 会话冲突或容量已满；75 相同/冲突会话正在退出或清理；其他非零值或断开连接表示失败 |

上报后最多等待 90 秒匹配主进程；超时清理该会话的准备工作。已经匹配并仍在运行的待接管会话不受此超时影响。相同 pending 或运行中会话重复上报幂等成功；退出中的同一会话返回 75。`announce.ps1` 对 75 每 500 ms 重试，整体等待约 60 秒；连接等待上限 5 秒。

旧端点 `FirefoxPortableBridge-Control-<identity>` 继续接受三个字符串 `announce-v2`、Firefox EXE、Profile，自动视为 Firefox 会话。原 Firefox 启动器可以继续使用；新客户端统一使用 v3。两个端点由同一个 Monitor 管理，不会产生两套协议入口。

## 生命周期与系统边界

- 上报先原子保存状态，再执行浏览器专有准备。开始匹配后按真实主进程启动时间选择目标。
- 切换先使原目标不可投递、清除其自有协议树，再注册新目标。仍在运行的 Firefox 被切到后台时，不执行便携退出清理。
- 只有两个机器级协议根原本均不存在时才取得所有权，不覆盖既有空根、第三方值、子键或命令。每次注册/自愈都用 `AssocQueryStringW` 检查 Windows 实际解析的命令。
- 有效 `UserChoice`/Hash、`RegisteredApplications`、Capabilities、`StartMenuInternet` 不被修改。仅可清除没有 Hash 且已没有有效 open 命令的 `MSEdge*` 卸载残留；带 Hash 的选择保持原样。
- 切换或退出清理失败时保留状态并重试，无法证明所有权的树不覆盖、不删除。WMI 失败视为未知，不据此判定退出或切换浏览器。
- 每次 URL 投递都重新校验会话 GUID、active 状态、EXE、配置和主进程身份；已被替换的会话 GUID 不会投递。只接受单个绝对 HTTP(S) URL，拒绝控制字符及超过 32768 字符的输入，不按调用方名称筛选。
- 全部会话退出后，删除状态和 Bridge 创建的机器级协议根。崩溃重启后恢复仍存活的会话，并回收已退出会话；状态丢失时仅回收 GUID、当前 EXE 命令和树形都严格匹配的孤立协议树。
- 不创建 `GH_BROWSER`、`OpenUrl.ps1` 等应用旁路。旧版本 `gh-open` 环境残留仅按原来的严格所有权规则清理。

运行文件位于 EXE 同目录：

```text
PortableBridge.exe
runtime-session.json   # schema 2，多会话；全部收尾后删除
runtime-error.log      # 最近错误；成功收尾后删除
runtime-open.log       # 最近一次 URL 投递摘要
```

URL 日志只记录时间、调用方、协议/主机、通道和结果，不记录路径、查询参数或片段。Firefox 的 `portable-state.json` 是迁移元数据，按原版保留。

## 从 Firefox PortableBridge 升级

1. 退出便携 Firefox，等待旧 Bridge 完成清理，确认旧部署目录没有 `runtime-session.json`。
2. 停止旧 Monitor，构建和部署 `PortableBridge.exe`，将登录任务入口改为新 EXE。
3. 启动新 Monitor；旧 Firefox 的 v2 上报仍可用，Chrome 使用 v3。

新版本保留旧实例互斥体名称，防止两个版本并行接管；协议注册表的 `FirefoxPortableSessionId` 所有权值也暂时保留，以维持原有严格清理规则。它们是兼容标识，不限制浏览器类型。

不支持带活动会话直接升级 schema 1 状态文件；新版本会拒绝读取并保留文件，需先用旧版完成收尾。移动 EXE 也应先结束全部会话并停止旧进程。不要在活动期间仅改 EXE 名称或路径。

维护者架构和完整验证清单位于仓库根 [DEVELOPMENT.md](../DEVELOPMENT.md#314-portablebridge)。
