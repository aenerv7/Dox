#Requires -Version 5.1

<#
.SYNOPSIS
    诊断并修复「此电脑」里的磁盘图标。

.DESCRIPTION
    Windows 决定一个盘显示什么图标，顺序固定：

        1. 注册表 Applications\Explorer.exe\Drives\<盘符>\DefaultIcon
           应用级覆盖，只对 explorer.exe 生效。挂虚拟盘的程序（手机/平板助手等）
           会写这里，软件卸载后残留就会让对应盘符变成空白图标。
        2. 注册表 DriveIcons\<盘符>\DefaultIcon   （HKLM 优先于 HKCU）
        3. <盘根>\autorun.inf 的 [Autorun] Icon=
        4. 按卷类型的内置图标
             DriveType 3 本地磁盘   -> 硬盘图标
             DriveType 2 可移动磁盘 -> U 盘图标

    所以「图标不对」只有四种原因，本脚本逐条检查：

        - 覆盖项（应用级或 DriveIcons）指向不存在的文件
        - autorun.inf 指向不存在或损坏的 .ico
        - 图标缓存损坏
        - 卷被识别成另一种 DriveType（外壳芯片决定，改不了）

    默认只读诊断，不改动任何东西。

.PARAMETER Drive
    盘符，如 P 或 P,Q。省略则检查所有卷。

.PARAMETER Repair
    清理失效的注册表覆盖项（DriveIcons 和应用级 Applications\Explorer.exe\Drives），
    注释掉 autorun.inf 里失效的 Icon= 行。
    改动前都会备份到 %TEMP% 和 <盘根>\autorun.inf.bak。

.PARAMETER SetIcon
    指定一个 .ico，复制到盘根并写进 autorun.inf，让图标跟着盘走。

.PARAMETER RebuildCache
    重建当前用户的图标缓存（会重启 explorer.exe）。

.EXAMPLE
    .\Fix-DriveIcon.ps1

.EXAMPLE
    .\Fix-DriveIcon.ps1 -Drive P -Repair

.EXAMPLE
    .\Fix-DriveIcon.ps1 -Drive Q -SetIcon .\disk.ico
#>

[CmdletBinding()]
param(
    [string]$Drive,

    [switch]$Repair,

    [string]$SetIcon,

    [switch]$RebuildCache
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# 两个覆盖机制，键结构都是 <root>\<盘符>\DefaultIcon，按优先级排列：
# 应用级覆盖只影响 explorer.exe，卸载残留最常见
$OverrideRoots = @(
    'HKCU:\Software\Classes\Applications\Explorer.exe\Drives'
    'HKLM:\SOFTWARE\Classes\Applications\Explorer.exe\Drives'
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons'
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons'
)

$DriveTypeNames = @{
    '2' = '可移动磁盘'
    '3' = '本地磁盘'
    '4' = '网络驱动器'
    '5' = '光驱'
    '6' = 'RAM 盘'
}

# autorun.inf 可能存成 ANSI 或带 BOM 的 Unicode，按 BOM 判断编码
function Read-TextFile {
    param([string]$Path)

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
        return [System.Text.Encoding]::Unicode.GetString($bytes, 2, $bytes.Length - 2)
    }
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        return [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
    }
    return [System.Text.Encoding]::Default.GetString($bytes)
}

# 校验 ICO 结构：6 字节头 + n 个 16 字节目录项，每项数据必须落在文件内
function Test-IconFile {
    param([string]$Path)

    $result = [pscustomobject]@{ Path = $Path; Valid = $false; Frames = 0; MaxEdge = 0; Reason = '' }

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        $result.Reason = '文件不存在'
        return $result
    }

    try {
        $bytes = [System.IO.File]::ReadAllBytes($Path)
    } catch {
        $result.Reason = '无法读取'
        return $result
    }

    if ($bytes.Length -lt 6) {
        $result.Reason = '文件过小'
        return $result
    }

    $reserved = [BitConverter]::ToUInt16($bytes, 0)
    $kind     = [BitConverter]::ToUInt16($bytes, 2)
    $count    = [BitConverter]::ToUInt16($bytes, 4)
    if ($reserved -ne 0 -or $kind -ne 1 -or $count -lt 1) {
        $result.Reason = '不是 ICO'
        return $result
    }
    if ($bytes.Length -lt 6 + 16 * $count) {
        $result.Reason = '目录被截断'
        return $result
    }

    $maxEdge = 0
    for ($i = 0; $i -lt $count; $i++) {
        $offset = 6 + 16 * $i
        $size   = [BitConverter]::ToUInt32($bytes, $offset + 8)
        $start  = [BitConverter]::ToUInt32($bytes, $offset + 12)
        if ($size -eq 0 -or [int64]$start + $size -gt $bytes.Length) {
            $result.Reason = '图像数据越界'
            return $result
        }

        # 0 表示 256px，ICO 目录项里宽高各占 1 字节
        $edge = $bytes[$offset]
        if ($edge -eq 0) {
            $edge = 256
        }
        if ($edge -gt $maxEdge) {
            $maxEdge = $edge
        }
    }

    $result.Valid   = $true
    $result.Frames  = $count
    $result.MaxEdge = $maxEdge
    return $result
}

# 覆盖值可能指向 .ico，也可能指向 DLL/EXE 里的图标资源（如 imageres.dll,-108）
function Test-IconRef {
    param([string]$Path)

    if (-not $Path) {
        return $false
    }
    if ([System.IO.Path]::GetExtension($Path) -ieq '.ico') {
        return (Test-IconFile -Path $Path).Valid
    }
    return Test-Path -LiteralPath $Path -PathType Leaf
}

# Icon= 的值可能是 "x.ico,0"，路径里也可能带引号
function Split-IconRef {
    param([string]$Value)

    $text = $Value.Trim().Trim('"')
    if ($text -match '^(?<path>.*),\s*(?<index>-?\d+)\s*$') {
        return [pscustomobject]@{ Path = $Matches['path'].Trim('"'); Index = [int]$Matches['index'] }
    }
    return [pscustomobject]@{ Path = $text; Index = 0 }
}

function Get-AutorunIcon {
    param([string]$Root)

    $inf = Join-Path $Root 'autorun.inf'
    $result = [pscustomobject]@{
        InfPath   = $inf
        Exists    = $false
        Broken    = $false
        IconPath  = ''
        IconIndex = 0
        Icon      = $null
    }

    if (-not (Test-Path -LiteralPath $inf -PathType Leaf)) {
        return $result
    }
    $result.Exists = $true

    $text = Read-TextFile -Path $inf
    $match = [regex]::Match($text, '(?im)^[ \t]*icon[ \t]*=[ \t]*(?<value>[^;\r\n]+)')
    if (-not $match.Success) {
        return $result
    }

    $ref = Split-IconRef -Value $match.Groups['value'].Value
    $result.IconIndex = $ref.Index
    $result.IconPath  = [Environment]::ExpandEnvironmentVariables($ref.Path)
    if (-not [System.IO.Path]::IsPathRooted($result.IconPath)) {
        $result.IconPath = Join-Path $Root $result.IconPath
    }

    $result.Icon = Test-IconFile -Path $result.IconPath
    $result.Broken = -not $result.Icon.Valid
    return $result
}

function Get-RegistryIcons {
    param([string]$Letter)

    $found = foreach ($root in $OverrideRoots) {
        $key = Join-Path $root "$Letter\DefaultIcon"
        if (-not (Test-Path -LiteralPath $key)) {
            continue
        }

        $raw = [string](Get-Item -LiteralPath $key).GetValue('')
        $ref = Split-IconRef -Value $raw
        $target = [Environment]::ExpandEnvironmentVariables($ref.Path)

        $source = 'DriveIcons'
        if ($root -match 'Applications') {
            $source = '应用级'
        }

        [pscustomobject]@{
            Source = $source
            Hive   = $root.Split(':')[0]
            Key    = $key
            Raw    = $raw
            Target = $target
            Broken = -not (Test-IconRef -Path $target)
        }
    }

    return @($found)
}

function Get-Drives {
    param([string]$Spec)

    $volumes = Get-CimInstance -ClassName Win32_LogicalDisk
    if (-not $Spec) {
        return $volumes
    }

    $wanted = $Spec -split '[,;\s]+' |
        Where-Object { $_ } |
        ForEach-Object { $_.TrimEnd(':', '\').ToUpper() }
    return $volumes | Where-Object { $wanted -contains $_.DeviceID.TrimEnd(':') }
}

function Show-IconState {
    param($Volume)

    $letter = $Volume.DeviceID.TrimEnd(':')
    $label  = $Volume.VolumeName
    $stamp  = $DriveTypeNames["$($Volume.DriveType)"]
    if (-not $label) {
        $label = '(无卷标)'
    }

    Write-Host ''
    Write-Host ("[{0}:]  {1}  {2}  {3}  {4:N0} GB" -f $letter, $stamp, $Volume.FileSystem, $label, ($Volume.Size / 1GB)) -ForegroundColor Cyan

    $problems = @()

    $overrides = @(Get-RegistryIcons -Letter $letter)
    foreach ($override in $overrides) {
        $mark = 'OK  '
        if ($override.Broken) {
            $mark = '损坏'
            $problems += 'registry'
        }
        Write-Host ("  注册表覆盖 {0}  {1}  {2} -> {3}" -f $mark, $override.Hive, $override.Source, $override.Raw)
    }

    $autorun = Get-AutorunIcon -Root "$letter`:\"
    if ($autorun.Exists) {
        if ($autorun.IconPath) {
            if ($autorun.Icon.Valid) {
                Write-Host ("  autorun.inf OK    Icon={0}  {1} 帧, 最大 {2}px" -f $autorun.IconPath, $autorun.Icon.Frames, $autorun.Icon.MaxEdge)
            } else {
                $problems += 'autorun'
                Write-Host ("  autorun.inf 损坏  Icon={0}  {1}" -f $autorun.IconPath, $autorun.Icon.Reason) -ForegroundColor Yellow
            }
        } else {
            Write-Host '  autorun.inf 存在，但没有 Icon= 行'
        }
    }

    if ($overrides.Count -eq 0 -and -not $autorun.IconPath) {
        Write-Host ("  无覆盖项，用内置图标（DriveType {0}）" -f $Volume.DriveType)
    }

    return [pscustomobject]@{
        Letter    = $letter
        Problems  = $problems
        Autorun   = $autorun
        Overrides = $overrides
    }
}

function Repair-IconState {
    param($State)

    foreach ($override in $State.Overrides) {
        if (-not $override.Broken) {
            continue
        }

        $backup = Join-Path $env:TEMP ("DriveIcons_{0}_{1}.reg" -f $State.Letter, (Get-Date -Format 'yyyyMMddHHmmssfff'))
        $hivePath = $override.Key -replace 'HKLM:\\', 'HKLM\' -replace 'HKCU:\\', 'HKCU\'
        & reg.exe export $hivePath $backup /y | Out-Null

        # HKLM 覆盖项需要管理员权限，删不掉时保留原样并提示
        try {
            Remove-Item -LiteralPath $override.Key -Recurse -Force

            # DefaultIcon 删掉后 <盘符> 键可能空着，顺手清掉
            $letterKey = Split-Path $override.Key -Parent
            $item = Get-Item -LiteralPath $letterKey
            if ($item.ValueCount -eq 0 -and $item.SubKeyCount -eq 0) {
                Remove-Item -LiteralPath $letterKey -Force
            }

            Write-Host ("  已删除失效覆盖项 {0}\{1}  {2}" -f $override.Hive, $override.Source, $override.Key) -ForegroundColor Green
        } catch {
            Write-Host ("  无法删除 {0}\{1}，需要管理员权限" -f $override.Hive, $override.Key) -ForegroundColor Yellow
        }
    }

    if ($State.Autorun.Broken) {
        $inf = $State.Autorun.InfPath
        Copy-Item -LiteralPath $inf -Destination "$inf.bak" -Force
        $text = Read-TextFile -Path $inf
        $text = [regex]::Replace($text, '(?im)^([ \t]*icon[ \t]*=[ \t]*[^;\r\n]+)', '; $1')
        [System.IO.File]::WriteAllText($inf, $text, [System.Text.Encoding]::Unicode)
        Write-Host ("  已注释 autorun.inf 中失效的 Icon=（备份 {0}.bak）" -f $inf) -ForegroundColor Green
    }
}

function Set-DriveIcon {
    param([string]$Letter, [string]$IcoPath)

    $source = (Resolve-Path -LiteralPath $IcoPath).Path
    $check = Test-IconFile -Path $source
    if (-not $check.Valid) {
        throw "不是有效 ICO：$source（$($check.Reason)）"
    }

    $root = "$Letter`:\"
    $name = 'driveicon.ico'
    $target = Join-Path $root $name
    Copy-Item -LiteralPath $source -Destination $target -Force
    (Get-Item -LiteralPath $target).Attributes = 'Hidden'

    $line = "Icon=$name"
    $inf = Join-Path $root 'autorun.inf'
    $text = ''
    if (Test-Path -LiteralPath $inf) {
        $text = Read-TextFile -Path $inf
    }

    # 只改 [Autorun] 里的 Icon=，其余段落（open 等）原样保留
    if ($text -match '(?im)^[ \t]*\[autorun\]') {
        if ($text -match '(?im)^[ \t]*icon[ \t]*=') {
            $text = [regex]::Replace($text, '(?im)^[ \t]*icon[ \t]*=[^\r\n]*', $line, 1)
        } else {
            $text = [regex]::Replace($text, '(?im)^([ \t]*\[autorun\][^\r\n]*)', "`$1`r`n$line", 1)
        }
    } else {
        $text = "[Autorun]`r`n$line`r`n" + $text
    }

    [System.IO.File]::WriteAllText($inf, $text, [System.Text.Encoding]::Unicode)
    Write-Host ("  已写入 {0} 和 autorun.inf" -f $target) -ForegroundColor Green
}

function Rebuild-IconCache {
    Write-Host '重建图标缓存...' -ForegroundColor Cyan
    Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1

    Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Windows\Explorer" -Filter 'iconcache*' -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue

    if (-not (Get-Process -Name explorer -ErrorAction SilentlyContinue)) {
        Start-Process explorer.exe
    }
    Write-Host ' 完成' -ForegroundColor Green
}

# ---------------- main ----------------

if ($RebuildCache) {
    Rebuild-IconCache
}

if ($SetIcon) {
    if (-not $Drive) {
        throw '-SetIcon 需要 -Drive 指定盘符'
    }
    Set-DriveIcon -Letter $Drive.TrimEnd(':', '\').ToUpper() -IcoPath $SetIcon
    return
}

$volumes = @(Get-Drives -Spec $Drive)
if ($volumes.Count -eq 0) {
    throw "找不到盘符：$Drive"
}

$states = foreach ($volume in $volumes) {
    Show-IconState -Volume $volume
}

if ($Repair) {
    foreach ($state in $states) {
        if ($state.Problems.Count -gt 0) {
            Repair-IconState -State $state
        }
    }
}
