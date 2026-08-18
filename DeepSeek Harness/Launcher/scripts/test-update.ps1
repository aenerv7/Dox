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

    Write-Host ''
    Write-Host '更新检查测试全部通过 ✔'
}
finally {
    Cleanup-All
    Write-Host '（已清理测试环境并恢复默认配置）'
}
