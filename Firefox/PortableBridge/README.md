# Firefox PortableBridge

Firefox PortableBridge 为没有 Windows 默认浏览器和有效 HTTP(S) `UserChoice`/`UserChoiceLatest` ProgId 的便携 Firefox 提供**会话级 URL 回退**。它不是默认浏览器注册器：只在目标 Firefox 运行期间临时维护当前用户的 `HKCU\Software\Classes\http` 和 `https`。对于 GitHub CLI，还会在原先同时不存在 `GH_BROWSER` 和 `BROWSER` 时临时写入当前用户环境，让 `gh` 绕过受 UCPD 过滤的 Shell 关联视图，Firefox 退出后撤销。

## 运行布局

当前版本面向以下便携目录结构：

```text
FirefoxRoot\
  App\firefox.exe
  Data\profile\
  Tools\
    FirefoxPortableBridge.exe
    OpenUrl.ps1                  会话期间按需生成；退出后删除
    Portable.ps1                 可选；用于退出后的通用便携清理
```

整个 `FirefoxRoot` 可以移动到任意本地盘符或目录；Bridge 不包含固定盘符。运行时 EXE 必须命名为 `FirefoxPortableBridge.exe` 并位于 `Tools`，因为 `open` 模式需要从自身位置恢复 Firefox 根目录。

## 运行模式

```text
FirefoxPortableBridge.exe watch --root <FirefoxRoot>
FirefoxPortableBridge.exe open <HTTP(S)-URL>
FirefoxPortableBridge.exe <HTTP(S)-URL>
FirefoxPortableBridge.exe gh-open <session-guid> <HTTP(S)-URL>
FirefoxPortableBridge.exe cleanup --root <FirefoxRoot>
```

- `watch`：等待同一根目录中的远程可用 Firefox 主进程，注册临时协议命令；若 `GH_BROWSER` 原先不存在，再以状态文件记录所有权后创建指向 Bridge 的用户环境值。每两秒核验并修复本会话仍可安全证明所有权的结构；非空 `UserChoice` 出现时撤销并暂停回退但继续随 Firefox 常驻，选择恢复为空后自动重试注册；Firefox 消失后立即撤销并结束。
- `open` / 单 URL：校验单个绝对 HTTP(S) URL，优先通过以规范化根路径派生的命名管道交给常驻 `watch` 实例；管道连接或交付失败时，使用同一 EXE、同一 Profile 和相同便携环境直接投递。协议命令使用 `open <URL>`；单 URL 保留向前兼容。
- `gh-open`：仅供 `GH_BROWSER` 使用。先校验命令携带的会话 GUID 与 schema 3 状态一致，再按普通 URL 路径投递；已经退出或被新会话替换的终端环境不能复用旧 GUID。正常路径不会启动 PowerShell；只有 Windows 仍强制执行同目录旧版 `OpenUrl.ps1` 命令时，才经会话兼容垫片转交。
- `cleanup`：读取 `Data\runtime-url-handler.json`，只回收会话 GUID、命令和注册表树形仍匹配的协议内容，并仅在 `GH_BROWSER` 仍精确指向状态中的 Bridge 时删除它；同时迁移清理旧版本自有的 `MSEdgeHTM` 适配、精确指向当前便携根 `Tools\OpenUrl.ps1` 的旧 PowerShell handler，以及内容逐字匹配内置模板的兼容垫片，供启动前处理升级、崩溃、强杀或断电残留。

主 Firefox 和 URL 投递都必须显式绑定 `Data\profile`，并设置 `MOZ_APP_DATA`、`MOZ_LOCAL_APP_DATA` 等便携环境。主实例不能带 `--no-remote`，否则 Firefox 会拒绝外部 URL 投递。

## 安全边界

- 不创建或修改 `UserChoice`、`UserChoiceLatest`、Hash、`RegisteredApplications`、Capabilities 或 `StartMenuInternet`。
- 发现 `http`/`https` `UserChoice`/`UserChoiceLatest` 含非空 ProgId 时，Bridge 使用 `AssocQueryStringW(ASSOCF_IS_PROTOCOL | ASSOCF_VERIFY, ASSOCSTR_COMMAND)` 验证它是否真的解析到可用 handler。解析到其他命令时绝不覆盖，Bridge 撤销自身回退并继续随 Firefox 常驻、每两秒重试；若官方 API 返回 `ERROR_NO_ASSOCIATION`，说明候选没有可用处理器，允许建立会话回退但仍不修改选择键。Windows 自动生成但没有 ProgId 的空壳键也不阻断回退。第三方根值、第三方命令或所有权变化仍属于致命结构冲突。
- Firefox 启动初期若 `UserChoiceLatest` 的 ProgId 或协议根正在瞬态变化，每次注册尝试先只读稳定最多 5 秒（每 100 ms 检查选择状态，并同时重试空树接管与完整自有树再认领）；超时只暂停本轮回退，不再结束 Watch，候选随后清空时会自动接管。
- 注册、自愈和撤销后使用 `SHCNE_ASSOCCHANGED` 配合 `SHCNF_DWORD | SHCNF_FLUSH` 同步请求刷新 Shell 关联缓存并等待系统组件处理。Windows 的 UCPD 受保护关联视图仍可能在特定调用进程中返回已删除的旧命令；该通知不能清除或覆盖受保护选择。
- Procmon 已确认 Windows Terminal 中的 `gh.exe` 和系统 `OpenWith.exe` 会在受保护视图中读取失效的 `MSEdgeHTM`，同时看不到临时 `HKCU\Software\Classes\MSEdgeHTM` 或普通 `https\shell` 命令。因此 Bridge 不再创建无效的 ProgId 适配，改用 GitHub CLI 官方支持的 `GH_BROWSER`。只在 `GH_BROWSER` 与其后备 `BROWSER` 都不存在时创建，不覆盖已有用户配置；命令使用带引号的正斜杠 EXE 路径和会话 GUID，兼容根目录空格并避免 `gh` 的 shell 命令解析吞掉反斜杠；写入和删除后广播 `WM_SETTINGCHANGE(Environment)`。运行中若自有 `GH_BROWSER` 被外部值替换，Bridge 放弃该值所有权并继续维护普通协议。已运行的终端无法被 Windows 反向修改进程环境，需在 Bridge 注册后新建终端才能继承；Firefox 退出前已打开的终端可能保留环境文本，但旧 GUID 会被 Bridge 拒绝。
- `watch` 成功注册后生成 `Tools\OpenUrl.ps1` 迁移兼容垫片，仅用于接住旧版 Bridge 在 Windows 受保护关联缓存中留下的同目录命令。垫片只按相对路径调用同目录 `FirefoxPortableBridge.exe open`，不包含固定盘符；退出及下次启动清理时仅在内容逐字匹配内置模板时删除，发现同名第三方文件则拒绝覆盖或删除。
- 启动注册前和退出清理时都会检查普通注册表视图中的旧 PowerShell handler。仅当默认值精确匹配系统 Windows PowerShell 路径、固定隐藏参数、当前根目录的 `Tools\OpenUrl.ps1` 和 `-Url "%1"` 时删除 `command`，再逐层删除变空的 `open`/`shell`；不匹配的命令和原有空 `URL Protocol` 标记保持不动。
- 状态 JSON 丢失但协议树仍能以合法 GUID、精确命令和唯一安全树形证明属于当前 Bridge 时，重建状态并继续会话；`GH_BROWSER` 只有携带同一 GUID 的精确命令才恢复为自有值，缺失时重建，其他值保持外部所有。任一字段不匹配仍拒绝接管。
- 协议回收要求状态文件中的会话 GUID 和命令匹配，并逐层检查 `shell\open\command`；不能证明属于当前会话的结构会被保留。
- 只接受无控制字符的绝对 `http` 或 `https` URL。
- `watch` 使用按 Firefox 根目录派生的命名互斥体和命名管道，不同便携根目录互不混用。
- 注册、自愈和 `cleanup` 另用同根目录派生的状态互斥体串行执行，状态 JSON 与两棵协议注册表不会被并发清理成不一致状态。
- EXE 使用 Windows GUI 子系统，常驻监视和系统 URL 入口都不创建控制台窗口。
- `Data\runtime-url-handler.open.log` 只保留最近一次调用的时间、调用方进程名、目标协议/主机、投递通道和返回码；不记录 URL 路径、查询参数或片段，用于区分系统未调用 Bridge 与 Bridge 内部交付失败。

## 构建

要求 Windows 和 .NET Framework 4.x。脚本调用系统自带的 `csc.exe`，生成 AnyCPU、Windows GUI 子系统程序，并把编译警告视为错误。

```powershell
cd Firefox\PortableBridge

# 默认输出到被 Git 忽略的 bin\FirefoxPortableBridge.exe
.\build.ps1

# 直接部署到实际便携 Firefox
.\build.ps1 -OutputPath 'X:\Portable\Firefox\Tools\FirefoxPortableBridge.exe'
```

仓库只维护源码、构建脚本和文档，不提交编译后的 EXE。维护架构、注册表所有权规则和验证清单见仓库根 `DEVELOPMENT.md`。

## 启动器接入

启动器应先后台启动 Bridge，再启动 Firefox：

```bat
start "" /B "%ROOT%Tools\FirefoxPortableBridge.exe" watch --root "%ROOT%." >nul 2>&1
start "" /D "%ROOT%App" "%ROOT%App\firefox.exe" --profile "%ROOT%Data\profile"
```

Firefox 启动前应先调用 `cleanup` 处理上次未正常收尾的会话。浏览器退出后，如 `Tools\Portable.ps1` 存在，Bridge 会以隐藏 PowerShell 进程调用其 `Cleanup` 模式完成 URL 回退之外的便携痕迹清理。通常每次 URL 都由 GUI EXE 直接接收；只有 Windows 仍命中旧 PowerShell handler 的机器会短暂运行隐藏 PowerShell，由会话垫片立即转交 EXE。
