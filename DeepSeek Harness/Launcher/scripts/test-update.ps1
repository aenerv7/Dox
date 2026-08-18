# ============================================================================
# test-update.ps1 — 更新检查功能自动化测试
#
# 场景 1：受限 PATH（无 npm）→ 检查失败路径：日志断言 + 警告框自动关闭
# 场景 2：真实环境 → 检查流程：等待结果对话框出现并关闭，日志断言检查完成
#
# 注意：本测试不会执行真实更新（避免修改全局 npm 环境），只验证
# “检查更新 → 结果提示” 的完整链路。
# ============================================================================
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$bin  = Join-Path $root "bin"
$exe  = Join-Path $bin "Launcher.exe"
$ini  = Join-Path $bin "Launcher.ini"
$log  = Join-Path $bin "Launcher.log"

if (-not (Test-Path $exe)) { throw "未找到 $exe，请先运行 scripts\build.ps1" }

$kMsgCheckUpdate = 0x8000 + 105   # WM_APP+105

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class UpdNative {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@

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
    Remove-Item $log -ErrorAction SilentlyContinue
    Restore-DefaultIni
}

# 等待并关闭 MessageBox（类名 #32770，标题与托盘窗口相同但类名不同可区分）
function Close-MessageBox([int]$timeoutSec = 30) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    $hwnd = [IntPtr]::Zero
    while ((Get-Date) -lt $deadline) {
        $hwnd = [UpdNative]::FindWindow('#32770', 'DeepSeek Harness Launcher')
        if ($hwnd -ne [IntPtr]::Zero) { break }
        Start-Sleep -Milliseconds 300
    }
    if ($hwnd -eq [IntPtr]::Zero) { return $false }
    [UpdNative]::PostMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null  # WM_CLOSE
    Start-Sleep -Milliseconds 400
    return $true
}

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
    $hwnd = [UpdNative]::FindWindow('DSHLauncherWnd', 'DeepSeek Harness Launcher')
    if ($hwnd -eq [IntPtr]::Zero) { throw '找不到 Launcher 窗口（DSHLauncherWnd）' }
    [UpdNative]::PostMessage($hwnd, $msg, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
}

Cleanup-All
Start-Sleep -Milliseconds 500

try {
    # ============ 场景 1：无 npm → 检查失败提示 ============
    Restore-DefaultIni
    Remove-Item $log -ErrorAction SilentlyContinue
    $sys32 = Join-Path $env:WINDIR 'System32'
    $env:PATH = $sys32   # 无 npm（node 通过常见安装目录兜底，托盘可启动）
    Write-Host '== 1) 无 npm 环境：检查更新应失败并弹出提示 =='
    $proc = Start-Process -FilePath $exe -WorkingDirectory $bin -PassThru
    Start-Sleep -Seconds 2
    $hwnd = [UpdNative]::FindWindow('DSHLauncherWnd', 'DeepSeek Harness Launcher')
    if ($hwnd -eq [IntPtr]::Zero) { throw '找不到 Launcher 窗口' }
    [UpdNative]::PostMessage($hwnd, $kMsgCheckUpdate, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    if (-not (Close-MessageBox)) { throw '失败：未出现更新失败提示框' }
    Start-Sleep -Milliseconds 500
    $log1 = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
    if ($log1 -notlike '*update: 获取远端版本失败*') { throw "失败：日志未记录检查失败：$log1" }
    Write-Host '   OK：提示框出现，日志确认 获取远端版本失败'
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800

    # ============ 场景 2：真实环境 → 正常检查链路 ============
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'User') + ';' + [System.Environment]::GetEnvironmentVariable('PATH', 'Machine')
    Remove-Item $log -ErrorAction SilentlyContinue
    Write-Host '== 2) 真实环境：检查更新应完成并弹出结果 =='
    $proc = Start-Process -FilePath $exe -WorkingDirectory $bin -PassThru
    Start-Sleep -Seconds 2
    $hwnd = [UpdNative]::FindWindow('DSHLauncherWnd', 'DeepSeek Harness Launcher')
    if ($hwnd -eq [IntPtr]::Zero) { throw '找不到 Launcher 窗口' }
    [UpdNative]::PostMessage($hwnd, $kMsgCheckUpdate, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    if (-not (Close-MessageBox 40)) { throw '失败：未出现更新检查结果框（网络超时或流程异常）' }
    Start-Sleep -Milliseconds 500
    $log2 = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
    if ($log2 -notlike '*update:*') { throw "失败：日志未记录检查结果：$log2" }
    if ($log2 -like '*远端版本=*') {
        $line = ($log2 -split "`r?`n" | Select-String 'update:' | Select-Object -Last 1).ToString()
        Write-Host "   OK：检查完成，日志：$line"
    } else {
        Write-Host '   OK：检查完成（网络不可用时为失败提示，链路本身正常）'
    }
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800

    # ============ 场景 3-5：更新完成通知的弹窗策略 ============
    # 用私有消息 kMsgUpdateDone(WM_APP+104) 模拟更新线程完成通知：
    #   * (成功, 重启) → 静默重启，不弹任何窗口
    #   * (失败, _)    → 弹错误框
    #   * (成功, 不重启) → 静默，不启动、不弹窗
    $kMsgUpdateDone = 0x8000 + 104
    $testServer = Join-Path $bin 'test-server.js'
    @'
const http = require("node:http");
const args = process.argv.slice(2);
let port = 16555;
const i = args.indexOf("--port");
if (i >= 0) port = Number(args[i + 1]);
const server = http.createServer((req, res) => res.end("ok"));
server.listen(port, "127.0.0.1", () => console.log("listening " + port));
'@ | Set-Content -Path $testServer -Encoding ascii

    function Assert-NoMessageBox([string]$label) {
        Start-Sleep -Seconds 2
        $h = [UpdNative]::FindWindow('#32770', 'DeepSeek Harness Launcher')
        if ($h -ne [IntPtr]::Zero) { throw "失败：$label 不应弹出窗口" }
    }

    # 场景 3：更新成功 + 重启 → 静默重启，无弹窗
    @"
[General]
Port=16555
AutoStart=0
NodePath=
DshBin=$($testServer.Replace('\','\\'))
"@ | Set-Content -Path $ini -Encoding ascii
    Remove-Item $log -ErrorAction SilentlyContinue
    Write-Host '== 3) 更新成功并重启：应静默重启，不弹任何窗口 =='
    $proc = Start-Process -FilePath $exe -WorkingDirectory $bin -PassThru
    Start-Sleep -Seconds 2
    $hwnd = [UpdNative]::FindWindow('DSHLauncherWnd', 'DeepSeek Harness Launcher')
    if ($hwnd -eq [IntPtr]::Zero) { throw '找不到 Launcher 窗口' }
    [UpdNative]::PostMessage($hwnd, $kMsgUpdateDone, [IntPtr]1, [IntPtr]1) | Out-Null
    if (-not (Wait-PortState 16555 $true 15)) { throw '失败：更新成功后服务未重启（端口未开）' }
    Assert-NoMessageBox '更新成功+重启'
    $log3 = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
    if ($log3 -notlike '*update: 更新完成，正在重新启动*') { throw '失败：日志未记录静默重启' }
    Write-Host '   OK：服务已重启且无任何弹窗，日志记录静默重启'
    Send-Cmd 0x8065 | Out-Null   # kMsgStop 停止测试服务
    if (-not (Wait-PortState 16555 $false)) { throw '失败：测试服务未停止' }
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800

    # 场景 4：更新失败 → 弹错误框
    Remove-Item $log -ErrorAction SilentlyContinue
    Write-Host '== 4) 更新失败：应弹出错误提示 =='
    $proc = Start-Process -FilePath $exe -WorkingDirectory $bin -PassThru
    Start-Sleep -Seconds 2
    $hwnd = [UpdNative]::FindWindow('DSHLauncherWnd', 'DeepSeek Harness Launcher')
    if ($hwnd -eq [IntPtr]::Zero) { throw '找不到 Launcher 窗口' }
    [UpdNative]::PostMessage($hwnd, $kMsgUpdateDone, [IntPtr]::Zero, [IntPtr]1) | Out-Null
    if (-not (Close-MessageBox 10)) { throw '失败：更新失败应弹出错误框' }
    Start-Sleep -Milliseconds 500
    $log4 = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
    if ($log4 -notlike '*update: 更新失败*') { throw '失败：日志未记录更新失败' }
    Write-Host '   OK：弹出错误框且日志记录更新失败'
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800

    # 场景 5：更新成功但不重启 → 静默，不启动、不弹窗
    Remove-Item $log -ErrorAction SilentlyContinue
    Write-Host '== 5) 更新成功但不重启：应完全静默 =='
    $proc = Start-Process -FilePath $exe -WorkingDirectory $bin -PassThru
    Start-Sleep -Seconds 2
    $hwnd = [UpdNative]::FindWindow('DSHLauncherWnd', 'DeepSeek Harness Launcher')
    if ($hwnd -eq [IntPtr]::Zero) { throw '找不到 Launcher 窗口' }
    [UpdNative]::PostMessage($hwnd, $kMsgUpdateDone, [IntPtr]1, [IntPtr]::Zero) | Out-Null
    Assert-NoMessageBox '更新成功不重启'
    if (Test-Port 16555) { throw '失败：不重启场景不应启动服务' }
    $log5 = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
    if ($log5 -notlike '*update: 更新完成*') { throw '失败：日志未记录更新完成' }
    Write-Host '   OK：无弹窗、未启动服务，日志记录更新完成'
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800

    Write-Host ''
    Write-Host '更新检查测试全部通过 ✔'
}
finally {
    Cleanup-All
    Write-Host '（已清理测试环境并恢复默认配置）'
}
