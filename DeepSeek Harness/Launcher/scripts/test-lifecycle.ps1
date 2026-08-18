# ============================================================================
# test-lifecycle.ps1 — Launcher.exe 生命周期自动化测试
#
# 用一个临时 Node 测试服务器代替真实的 dsh web（避免启动第二个完整 Harness
# 实例），通过隐藏窗口的私有消息驱动启动/停止/重启，校验端口状态。
# 结束后恢复 bin\Launcher.ini 为默认值并清理测试文件。
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

# ---- 私有消息 ID（与 Launcher.cpp 保持一致）----
$kMsgStart   = 0x8000 + 100   # WM_APP+100
$kMsgStop    = 0x8000 + 101
$kMsgRestart = 0x8000 + 102
$kMsgQuery   = 0x8000 + 103

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DshTestNative {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam,
                                                   uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
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

function Wait-PortState([int]$p, [bool]$wantOpen, [int]$seconds = 12) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        if ((Test-Port $p) -eq $wantOpen) { return $true }
        Start-Sleep -Milliseconds 400
    }
    return $false
}

function Send-Cmd([uint32]$msg) {
    # 注意：FindWindow 的 $null 会被 PowerShell 编组成空字符串，必须同时给出类名与标题
    $hwnd = [DshTestNative]::FindWindow('DSHLauncherWnd', 'DeepSeek Harness Launcher')
    if ($hwnd -eq [IntPtr]::Zero) { throw '找不到 Launcher 窗口（DSHLauncherWnd）' }
    $out = [IntPtr]::Zero
    [DshTestNative]::SendMessageTimeout($hwnd, $msg, [IntPtr]::Zero, [IntPtr]::Zero, 2, 10000, [ref]$out) | Out-Null
    return $out
}

function Restore-DefaultIni {
    # 恢复默认配置（与 Launcher 首次运行生成的默认值一致）
    @'
[General]
Port=16100
AutoStart=0
NodePath=
DshBin=
'@ | Set-Content -Path $ini -Encoding ascii
}

function Test-Cleanup {
    Get-Process Launcher -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*test-server.js*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Remove-Item $testServer, $log -ErrorAction SilentlyContinue
    Restore-DefaultIni
}

# ---- 1. 准备测试环境 ----
Test-Cleanup
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

# 测试配置：DshBin 指向测试服务器；NodePath 留空以验证 PATH 自动查找 node.exe
@"
[General]
Port=$port
AutoStart=1
NodePath=
DshBin=$($testServer.Replace('\','\\'))
"@ | Set-Content -Path $ini -Encoding ascii

Remove-Item $log -ErrorAction SilentlyContinue

try {
    Write-Host '== 1) 启动 Launcher（AutoStart=1，应自动启动测试服务器） =='
    $proc = Start-Process -FilePath $exe -WorkingDirectory $bin -PassThru
    if (-not (Wait-PortState $port $true 15)) { throw '失败：AutoStart 后端口未打开' }
    Write-Host '   OK：随托盘自启动生效，端口已打开'
    Start-Sleep -Milliseconds 500

    Write-Host '== 2) 状态查询 =='
    if ((Send-Cmd $kMsgQuery).ToInt64() -ne 1) { throw '失败：运行中状态查询应返回 1' }
    Write-Host '   OK：IsRunning = 1'

    Write-Host '== 3) 停止 =='
    Send-Cmd $kMsgStop | Out-Null
    if (-not (Wait-PortState $port $false)) { throw '失败：停止后端口未关闭' }
    if ((Send-Cmd $kMsgQuery).ToInt64() -ne 0) { throw '失败：停止后状态查询应返回 0' }
    Write-Host '   OK：已停止'

    Write-Host '== 4) 再次启动 =='
    Send-Cmd $kMsgStart | Out-Null
    if (-not (Wait-PortState $port $true)) { throw '失败：启动后端口未打开' }
    if ((Send-Cmd $kMsgQuery).ToInt64() -ne 1) { throw '失败：启动后状态查询应返回 1' }
    Write-Host '   OK：已启动'

    Write-Host '== 5) 重启 =='
    function Get-ListenerPid([int]$p) {
        $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($c) { return $c.OwningProcess }
        return 0
    }
    $pidBefore = Get-ListenerPid $port
    if (-not $pidBefore) { throw '失败：重启前未检测到监听进程' }
    # 用异步 PostMessage 触发重启（重启在 Launcher 线程内同步完成，无法观察中间态）
    $hwndR = [DshTestNative]::FindWindow('DSHLauncherWnd', 'DeepSeek Harness Launcher')
    if (-not [DshTestNative]::PostMessage($hwndR, $kMsgRestart, [IntPtr]::Zero, [IntPtr]::Zero)) {
        throw '失败：PostMessage 重启消息发送失败'
    }
    if (-not (Wait-PortState $port $true 15)) { throw '失败：重启后端口未重新打开' }
    # TCP 表刷新有延迟：轮询直到监听 PID 变为新的非零进程
    $pidAfter = 0
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        $pidAfter = Get-ListenerPid $port
        if ($pidAfter -ne 0 -and $pidAfter -ne $pidBefore) { break }
        Start-Sleep -Milliseconds 300
    }
    if ($pidAfter -eq 0 -or $pidAfter -eq $pidBefore) { throw "失败：重启后监听进程未变化（PID $pidBefore）" }
    Write-Host "   OK：重启成功（PID $pidBefore -> $pidAfter）"

    Write-Host '== 6) 退出托盘即停止 Harness（直接强杀托盘进程，验证 KILL_ON_JOB_CLOSE 兜底） =='
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    if (-not (Wait-PortState $port $false 10)) { throw '失败：托盘退出后端口未关闭' }
    Start-Sleep -Milliseconds 800
    $stray = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*test-server.js*' }
    if ($stray) { throw '失败：托盘退出后存在残留的测试服务器进程' }
    Write-Host '   OK：Harness 已随托盘一并停止，无残留进程'

    Write-Host '== 7) 日志检查 =='
    $logText = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
    foreach ($expect in 'start:', 'stop:', 'restart:', 'node.exe') {
        if ($logText -notlike "*$expect*") { throw "失败：日志缺少 $expect" }
    }
    Write-Host '   OK：日志包含启动/停止/重启记录与 node.exe 路径'

    Write-Host ''
    Write-Host '全部测试通过 ✔'
}
finally {
    Test-Cleanup
    Write-Host '（已清理测试文件并恢复默认配置）'
}
