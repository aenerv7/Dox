# ============================================================================
# test-port.ps1 — 端口收束功能自动化测试
#
#   * 有效端口（如 16555）→ 原样保留
#   * 越界端口（如 99999）→ 自动改为随机可用端口并写回 ini
#   * 非数字端口（如 abc）→ 自动改为随机可用端口并写回 ini
# ============================================================================
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$bin  = Join-Path $root "bin"
$exe  = Join-Path $bin "Launcher.exe"
$ini  = Join-Path $bin "Launcher.ini"
$log  = Join-Path $bin "Launcher.log"

if (-not (Test-Path $exe)) { throw "未找到 $exe，请先运行 scripts\build.ps1" }

function Get-IniPort {
    $content = Get-Content $ini -ErrorAction SilentlyContinue
    $line = $content | Where-Object { $_ -match '^Port=' } | Select-Object -First 1
    if ($line) { return [int]($line -replace '^Port=', '') }
    return -1
}

function Test-PortOpen([int]$p, [int]$timeoutMs = 600) {
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $c.BeginConnect('127.0.0.1', $p, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne($timeoutMs)) {
            try { $c.EndConnect($iar); return $true } catch { return $false }
        }
        return $false
    } finally { $c.Close() }
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
    Remove-Item $log -ErrorAction SilentlyContinue
    Restore-DefaultIni
}

function Write-TestIni([string]$portValue) {
    @"
[General]
Port=$portValue
AutoStart=0
NodePath=
DshBin=
"@ | Set-Content -Path $ini -Encoding ascii
}

Cleanup-All
Start-Sleep -Milliseconds 500

try {
    # ============ 场景 1：有效端口保持不变 ============
    Write-TestIni '16555'
    Remove-Item $log -ErrorAction SilentlyContinue
    Write-Host '== 1) 有效端口 16555：应保持不变 =='
    Start-Process -FilePath $exe -WorkingDirectory $bin | Out-Null
    Start-Sleep -Seconds 2
    $port1 = Get-IniPort
    if ($port1 -ne 16555) { throw "失败：有效端口被改动（ini=$port1）" }
    $log1 = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
    if ($log1 -like '*端口无效*') { throw '失败：有效端口不应触发修正' }
    Write-Host '   OK：ini 中端口保持 16555，未触发修正'
    Get-Process Launcher -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 800

    # ============ 场景 2：越界端口 → 随机可用端口 ============
    Write-TestIni '99999'
    Remove-Item $log -ErrorAction SilentlyContinue
    Write-Host '== 2) 越界端口 99999：应改为随机可用端口 =='
    Start-Process -FilePath $exe -WorkingDirectory $bin | Out-Null
    Start-Sleep -Seconds 2
    $port2 = Get-IniPort
    if ($port2 -lt 1024 -or $port2 -gt 65535) { throw "失败：修正后的端口越界（ini=$port2）" }
    if ($port2 -eq 99999) { throw '失败：端口未被修正' }
    if (Test-PortOpen $port2) { throw "失败：修正后的端口 $port2 已被占用" }
    $log2 = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
    if ($log2 -notlike '*端口无效，已改为随机可用端口*') { throw '失败：日志未记录端口修正' }
    Write-Host "   OK：端口 99999 → $port2（可用），日志已记录修正"
    Get-Process Launcher -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 800

    # ============ 场景 3：非数字端口 → 随机可用端口 ============
    Write-TestIni 'abc'
    Remove-Item $log -ErrorAction SilentlyContinue
    Write-Host '== 3) 非数字端口 abc：应改为随机可用端口 =='
    Start-Process -FilePath $exe -WorkingDirectory $bin | Out-Null
    Start-Sleep -Seconds 2
    $port3 = Get-IniPort
    if ($port3 -lt 1024 -or $port3 -gt 65535) { throw "失败：修正后的端口越界（ini=$port3）" }
    if (Test-PortOpen $port3) { throw "失败：修正后的端口 $port3 已被占用" }
    $log3 = Get-Content $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
    if ($log3 -notlike '*端口无效，已改为随机可用端口*') { throw '失败：日志未记录端口修正' }
    Write-Host "   OK：端口 abc → $port3（可用），日志已记录修正"
    Get-Process Launcher -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 800

    Write-Host ''
    Write-Host '端口收束测试全部通过 ✔'
}
finally {
    Cleanup-All
    Write-Host '（已清理测试环境并恢复默认配置）'
}
