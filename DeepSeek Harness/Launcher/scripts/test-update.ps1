# ============================================================================
# test-update.ps1 — 更新检查功能自动化测试
#
# 场景 1：受限 PATH（无 npm）→ 检查失败路径：日志断言 + 错误框自动关闭
# 场景 2：真实环境 → 检查流程：日志断言检查完成（已最新走系统通知，有更新走询问框）
# 场景 3-5：kMsgUpdateDone 完成通知的提示策略：
#   * (成功, 重启)  → 系统通知 + 自动重启，不弹窗口
#   * (失败, _)     → 弹错误框
#   * (成功, 不重启) → 系统通知，不启动、不弹窗口
# 场景 6-7：更新通道判定（npm dist-tag）——安装的是哪条通道就查哪条通道：
#   * 全局安装 alpha 版本 → 日志通道=alpha，远端版本=npm 的 alpha 版本
#   * UpdateChannel 显式指定 → 日志通道=指定值
#
# 注意：本测试不会执行真实更新（避免修改全局 npm 环境），只验证
# “检查更新 → 结果提示” 的完整链路。
#
# 运行前提：本机不能有另一个 Launcher 在运行。托盘是单实例（互斥体
# Local\DSHLauncher_SingleInstance），已有实例时测试实例只会弹「已在运行」
# 并退出；且 FindWindow 按类名+标题查找，会命中那个已有实例的窗口，
# 导致日志断言落空（读到的仍是 bin\Launcher.log，但消息发给了别人）。
# ============================================================================
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$bin  = Join-Path $root "bin"
$exe  = Join-Path $bin "Launcher.exe"
$ini  = Join-Path $bin "Launcher.ini"
$log  = Join-Path $bin "Launcher.log"

if (-not (Test-Path $exe)) { throw "未找到 $exe，请先运行 scripts\build.ps1" }

$kMsgCheckUpdate = 0x8000 + 105   # WM_APP+105
$pkgName = '@deepseek-ai/dsh'

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
UpdateChannel=auto
'@ | Set-Content -Path $ini -Encoding ascii
}

# 只结束本脚本启动的实例（按 PID），绝不按进程名杀 ——
# 运行中的 Launcher 正是本机 DSH 的宿主，按名杀会连带掐断当前开发会话。
function Stop-TestLauncher($proc) {
    if ($null -eq $proc) { return }
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

function Cleanup-All {
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
    Stop-TestLauncher $proc
    Start-Sleep -Milliseconds 800

    # ============ 场景 2：真实环境 → 正常检查链路 ============
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'User') + ';' + [System.Environment]::GetEnvironmentVariable('PATH', 'Machine')
    Remove-Item $log -ErrorAction SilentlyContinue
    Write-Host '== 2) 真实环境：检查更新应完成（已最新走系统通知，有更新走询问框） =='
    $proc = Start-Process -FilePath $exe -WorkingDirectory $bin -PassThru
    Start-Sleep -Seconds 2
    $hwnd = [UpdNative]::FindWindow('DSHLauncherWnd', 'DeepSeek Harness Launcher')
    if ($hwnd -eq [IntPtr]::Zero) { throw '找不到 Launcher 窗口' }
    [UpdNative]::PostMessage($hwnd, $kMsgCheckUpdate, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    # 等待检查结果写入日志（网络可能需要数秒）；若有询问/提示框出现则关闭
    $log2 = ''
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        $log2 = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
        if ($log2 -like '*update: 通道=*') { break }
        $mb = [UpdNative]::FindWindow('#32770', 'DeepSeek Harness Launcher')
        if ($mb -ne [IntPtr]::Zero) {
            [UpdNative]::PostMessage($mb, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
        }
        Start-Sleep -Milliseconds 500
    }
    # 清理可能残留的询问框（有更新时询问是否更新）
    Close-MessageBox 3 | Out-Null
    $log2 = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
    if ($log2 -notlike '*update:*') { throw "失败：日志未记录检查结果：$log2" }
    if ($log2 -like '*远端版本=*') {
        $line = ($log2 -split "`r?`n" | Select-String 'update:' | Select-Object -Last 1).ToString()
        Write-Host "   OK：检查完成，日志：$line"
    } else {
        Write-Host '   OK：检查完成（网络不可用时为失败提示，链路本身正常）'
    }
    Stop-TestLauncher $proc
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
    Stop-TestLauncher $proc
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
    Stop-TestLauncher $proc
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
    Stop-TestLauncher $proc
    Start-Sleep -Milliseconds 800

    # ============ 场景 6-7：更新通道判定 ============
    # 只断言日志里的通道与远端版本，不触碰全局 npm。
    # 本机若未全局安装 dsh（Npx 模式）则跳过：npx 无安装通道可言。
    $globalDsh = Get-Command dsh.cmd -ErrorAction SilentlyContinue
    if (-not $globalDsh) {
        Write-Host '== 6-7) 跳过：本机未全局安装 dsh（npx 模式无安装通道） =='
    } else {
        $dshPkg = Join-Path (Split-Path $globalDsh.Source) "node_modules\@deepseek-ai\dsh\package.json"
        $localVersion = (Get-Content $dshPkg -Raw | ConvertFrom-Json).version
        # 本地版本后缀即期望通道："0.1.6-alpha.1" → "alpha"；正式版 → "latest"
        $expectedChannel = if ($localVersion -match '-([A-Za-z]+)\.') { $Matches[1] } else { 'latest' }
        $distTags = (npm view $pkgName dist-tags --json 2>$null | Out-String | ConvertFrom-Json)
        $expectedRemote = $distTags.$expectedChannel

        # 用空闲端口，避免与正在运行的实例（本机 16100 上的 DSH）互相干扰
        $chanPort = 16611

        function Write-ChannelIni([string]$channel) {
            $lines = @('[General]', "Port=$chanPort", 'AutoStart=0', 'NodePath=', 'DshBin=')
            if ($channel) { $lines += "UpdateChannel=$channel" }
            $lines -join "`r`n" | Set-Content -Path $ini -Encoding ascii
        }

        function Assert-Channel([string]$channel, [string]$expectedRemote, [string]$label) {
            Remove-Item $log -ErrorAction SilentlyContinue
            $p = Start-Process -FilePath $exe -WorkingDirectory $bin -PassThru
            Start-Sleep -Seconds 2
            $h = [UpdNative]::FindWindow('DSHLauncherWnd', 'DeepSeek Harness Launcher')
            if ($h -eq [IntPtr]::Zero) { throw '找不到 Launcher 窗口' }
            [UpdNative]::PostMessage($h, $kMsgCheckUpdate, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
            $text = ''
            $deadline = (Get-Date).AddSeconds(45)
            while ((Get-Date) -lt $deadline) {
                $text = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
                if ($text -like '*update: 通道=*') { break }
                $mb = [UpdNative]::FindWindow('#32770', 'DeepSeek Harness Launcher')
                if ($mb -ne [IntPtr]::Zero) {
                    [UpdNative]::PostMessage($mb, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
                }
                Start-Sleep -Milliseconds 500
            }
            Close-MessageBox 3 | Out-Null
            Stop-TestLauncher $p
            Start-Sleep -Milliseconds 800
            $text = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
            $line = ($text -split "`r?`n" | Select-String 'update: 通道=' | Select-Object -Last 1)
            if (-not $line) { throw "失败：$label 未记录通道日志：$text" }
            $line = $line.ToString()
            if ($line -notlike "*通道=$channel，*") { throw "失败：$label 期望通道 $channel，实际：$line" }
            if ($expectedRemote -and $line -notlike "*远端版本=$expectedRemote*") {
                throw "失败：$label 期望远端版本 $expectedRemote，实际：$line"
            }
            Write-Host "   OK：$line"
        }

        Write-Host "== 6) 全局安装 v$localVersion：应按本地版本后缀查 $expectedChannel 通道 =="
        Write-ChannelIni ''      # 不写 UpdateChannel → 默认 auto
        Assert-Channel $expectedChannel $expectedRemote '按本地版本推断通道'

        Write-Host '== 7) UpdateChannel=latest 显式指定：应查 latest 通道 =='
        Write-ChannelIni 'latest'
        Assert-Channel 'latest' $distTags.latest 'ini 指定通道'
    }

    Write-Host ''
    Write-Host '更新检查测试全部通过 ✔'
}
finally {
    Cleanup-All
    Write-Host '（已清理测试环境并恢复默认配置）'
}
