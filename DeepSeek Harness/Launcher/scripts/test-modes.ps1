# ============================================================================
# test-modes.ps1 — 启动方式（dsh / npx）判定与启动自动化测试
#
# 通过构造受限 PATH + 假 shim（dsh.cmd / npx.cmd）模拟两种环境：
#   * dsh 模式：PATH 前置含 dsh.cmd 的目录 → 判定为全局安装 → 以 dsh 命令启动
#   * npx 模式：PATH 不含 dsh.cmd（只有 npx.cmd）→ 判定为未全局安装 → 以 npx 启动
# 断言日志中的启动方式与命令，结束后清理并恢复默认配置。
# ============================================================================
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$bin  = Join-Path $root "bin"
$exe  = Join-Path $bin "Launcher.exe"
$ini  = Join-Path $bin "Launcher.ini"
$log  = Join-Path $bin "Launcher.log"
$testServer = Join-Path $bin "test-server.js"
$port = 16555

if (-not (Test-Path $exe)) { throw "未找到 $exe，请先运行 scripts\build.ps1" }

$kMsgStart = 0x8000 + 100
$kMsgStop  = 0x8000 + 101

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ModesNative {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam,
                                                   uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
}
"@

function Test-Port([int]$p, [int]$timeoutMs = 800) {
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $c.BeginConnect('127.0.0.1', $p, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne($timeoutMs)) {
            try { $c.EndConnect($iar); return $true } catch { return $false }
        }
        return $false
    } finally { $c.Close() }
}

function Wait-PortState([int]$p, [bool]$wantOpen, [int]$seconds = 15) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        if ((Test-Port $p) -eq $wantOpen) { return $true }
        Start-Sleep -Milliseconds 400
    }
    return $false
}

function Send-Cmd([uint32]$msg) {
    $hwnd = [ModesNative]::FindWindow('DSHLauncherWnd', 'DeepSeek Harness Launcher')
    if ($hwnd -eq [IntPtr]::Zero) { throw '找不到 Launcher 窗口（DSHLauncherWnd）' }
    $out = [IntPtr]::Zero
    [ModesNative]::SendMessageTimeout($hwnd, $msg, [IntPtr]::Zero, [IntPtr]::Zero, 2, 10000, [ref]$out) | Out-Null
    return $out
}

function Restore-DefaultIni {
    @'
[General]
Port=16100
AutoStart=0
NodePath=
DshBin=
'@ | Set-Content -Path $ini -Encoding ascii
}

function Cleanup-All {
    Get-Process Launcher -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*test-server.js*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Remove-Item $testServer, $log -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $bin 'fakebin') -Recurse -Force -ErrorAction SilentlyContinue
    Restore-DefaultIni
}

# ---- 准备测试环境 ----
Cleanup-All
Start-Sleep -Milliseconds 500

@'
const http = require("node:http");
const args = process.argv.slice(2);
let port = 16555;
const i = args.indexOf("--port");
if (i >= 0) port = Number(args[i + 1]);
const server = http.createServer((req, res) => res.end("ok"));
server.listen(port, "127.0.0.1", () => console.log("listening " + port));
'@ | Set-Content -Path $testServer -Encoding ascii

$nodePath = (Get-Command node).Source
$nodeDir  = Split-Path -Parent $nodePath
$sys32    = Join-Path $env:WINDIR 'System32'

# 假 shim 内容：无论收到什么参数，都直接调用 node 执行测试服务器
$shimBody = "@echo off`r`n`"$nodePath`" `"$testServer`" %*"

try {
    # ============ 场景 1：dsh 模式（PATH 前置含 dsh.cmd 的目录） ============
    $fake1 = Join-Path $bin 'fakebin'
    New-Item -ItemType Directory -Force -Path $fake1 | Out-Null
    Set-Content -Path (Join-Path $fake1 'dsh.cmd') -Value $shimBody -Encoding ascii

    @"
[General]
Port=$port
AutoStart=0
NodePath=
DshBin=
"@ | Set-Content -Path $ini -Encoding ascii
    Remove-Item $log -ErrorAction SilentlyContinue

    $env:PATH = "$fake1;$nodeDir;$sys32"   # 不含 %APPDATA%\npm，避免真实 dsh.cmd 干扰
    Write-Host '== 1) dsh 模式：PATH 上有 dsh.cmd → 以 dsh 命令启动 =='
    $proc = Start-Process -FilePath $exe -WorkingDirectory $bin -PassThru
    Start-Sleep -Seconds 2
    Send-Cmd $kMsgStart | Out-Null
    if (-not (Wait-PortState $port $true)) { throw '失败：dsh 模式启动后端口未打开' }
    $log1 = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
    if ($log1 -notlike '*启动方式=dsh*')    { throw "失败：日志未显示启动方式=dsh：$log1" }
    if ($log1 -notlike '*dsh.cmd*')        { throw '失败：日志未包含 dsh.cmd 命令' }
    if ($log1 -notlike '*--host 127.0.0.1*') { throw '失败：日志未包含 --host 参数' }
    if ($log1 -notlike "*--port $port*")   { throw '失败：日志未包含端口参数' }
    Write-Host '   OK：以 dsh.cmd 启动，日志确认 启动方式=dsh 与 --host/--port 参数'
    Send-Cmd $kMsgStop | Out-Null
    if (-not (Wait-PortState $port $false)) { throw '失败：dsh 模式停止后端口未关闭' }
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800

    # ============ 场景 2：npx 模式（PATH 无 dsh.cmd，只有 npx.cmd） ============
    $fake2 = Join-Path $bin 'fakebin2'
    New-Item -ItemType Directory -Force -Path $fake2 | Out-Null
    Set-Content -Path (Join-Path $fake2 'npx.cmd') -Value $shimBody -Encoding ascii

    Remove-Item $log -ErrorAction SilentlyContinue
    $env:PATH = "$fake2;$nodeDir;$sys32"   # 无 dsh.cmd → 判定 npx
    Write-Host '== 2) npx 模式：PATH 无 dsh.cmd → 以 npx 启动 =='
    $proc = Start-Process -FilePath $exe -WorkingDirectory $bin -PassThru
    Start-Sleep -Seconds 2
    Send-Cmd $kMsgStart | Out-Null
    if (-not (Wait-PortState $port $true)) { throw '失败：npx 模式启动后端口未打开' }
    $log2 = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
    if ($log2 -notlike '*启动方式=npx*')    { throw "失败：日志未显示启动方式=npx：$log2" }
    if ($log2 -notlike '*npx -y @deepseek-ai/dsh*') { throw '失败：日志未包含 npx -y @deepseek-ai/dsh 命令' }
    if ($log2 -notlike '*--host 127.0.0.1*') { throw '失败：日志未包含 --host 参数' }
    if ($log2 -notlike "*--port $port*")   { throw '失败：日志未包含端口参数' }
    Write-Host '   OK：以 npx -y @deepseek-ai/dsh 启动，日志确认 启动方式=npx 与 --host/--port 参数'
    Send-Cmd $kMsgStop | Out-Null
    if (-not (Wait-PortState $port $false)) { throw '失败：npx 模式停止后端口未关闭' }
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800

    Write-Host ''
    Write-Host '启动方式测试全部通过 ✔'
}
finally {
    Cleanup-All
    Write-Host '（已清理测试环境并恢复默认配置）'
}
