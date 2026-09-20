@echo off
setlocal

set "FLATTEN_ASSUME_YES=0"
set "FLATTEN_SCRIPT=%~f0"
set "FLATTEN_TARGET_COUNT=0"

:parse_arguments
if "%~1"=="" goto :arguments_done
if /I "%~1"=="/Y" goto :enable_assume_yes
if /I "%~1"=="-Y" goto :enable_assume_yes
set /a FLATTEN_TARGET_COUNT+=1 >nul
set "FLATTEN_TARGET_%FLATTEN_TARGET_COUNT%=%~1"
shift
goto :parse_arguments

:enable_assume_yes
set "FLATTEN_ASSUME_YES=1"
shift
goto :parse_arguments

:arguments_done
if "%FLATTEN_TARGET_COUNT%"=="0" goto :usage

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$source = Get-Content -LiteralPath $env:FLATTEN_SCRIPT -Raw -Encoding UTF8; $marker = '# POWERSHELL'; Invoke-Expression $source.Substring($source.LastIndexOf($marker) + $marker.Length)"
set "FLATTEN_EXIT_CODE=%ERRORLEVEL%"
if "%FLATTEN_ASSUME_YES%"=="0" (
    echo.
    pause
)
exit /b %FLATTEN_EXIT_CODE%

:usage
echo Usage:
echo   Flatten.bat "folder 1" ["folder 2" ...] [/Y]
echo.
echo Drag one or more folders onto this script, or pass their paths on the command line.
echo /Y can appear anywhere and skips confirmation and the final pause.
exit /b 2

# POWERSHELL
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Resolve-FlattenRoot([string]$InputPath) {
    try {
        $targetItem = Get-Item -LiteralPath $InputPath -Force -ErrorAction Stop
    } catch {
        throw "找不到目标：$InputPath"
    }

    if (-not $targetItem.PSIsContainer) {
        throw "目标不是文件夹：$($targetItem.FullName)"
    }

    if ($targetItem.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "为避免越过目录边界，目标不能是符号链接或目录联接：$($targetItem.FullName)"
    }

    $root = [IO.Path]::GetFullPath($targetItem.FullName)
    $volumeRoot = [IO.Path]::GetPathRoot($root)
    if ($root.TrimEnd('\', '/') -eq $volumeRoot.TrimEnd('\', '/')) {
        throw "为避免误操作，不能展平磁盘或共享根目录：$root"
    }

    return $root.TrimEnd('\', '/')
}

function New-FlattenPlan([string]$Root) {
    $fileScanErrors = @()
    $directoryScanErrors = @()
    $files = @(
        Get-ChildItem -LiteralPath $Root -File -Recurse -Force `
            -ErrorAction SilentlyContinue -ErrorVariable fileScanErrors |
            Where-Object { $_.DirectoryName -ne $Root }
    )
    $directories = @(
        Get-ChildItem -LiteralPath $Root -Directory -Recurse -Force `
            -ErrorAction SilentlyContinue -ErrorVariable directoryScanErrors |
            Where-Object { -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } |
            Sort-Object { $_.FullName.Length } -Descending
    )

    if ($fileScanErrors.Count -gt 0 -or $directoryScanErrors.Count -gt 0) {
        $details = @($fileScanErrors) + @($directoryScanErrors) |
            ForEach-Object { $_.Exception.Message }
        throw "无法完整读取目录树：$Root`n  $($details -join "`n  ")"
    }

    return [pscustomobject]@{
        Root = $Root
        Files = $files
        Directories = $directories
    }
}

function Invoke-FlattenPlan($Plan, [string]$ScriptPath) {
    $moved = 0
    $skipped = 0
    $protected = 0
    $deletedDirectories = 0
    $failures = 0

    foreach ($file in $Plan.Files) {
        if ([StringComparer]::OrdinalIgnoreCase.Equals($file.FullName, $ScriptPath)) {
            Write-Host "[保留] 正在运行的脚本：$($file.FullName)" -ForegroundColor Yellow
            $protected++
            continue
        }

        $destination = Join-Path $Plan.Root $file.Name
        if (Test-Path -LiteralPath $destination) {
            Write-Host "[跳过] 同名项目已存在：$($file.Name)" -ForegroundColor Yellow
            $skipped++
            continue
        }

        try {
            Move-Item -LiteralPath $file.FullName -Destination $destination -ErrorAction Stop
            Write-Host "[移动] $($file.FullName) -> $destination"
            $moved++
        } catch {
            Write-Host "[失败] $($file.FullName)：$($_.Exception.Message)" -ForegroundColor Red
            $failures++
        }
    }

    foreach ($directory in $Plan.Directories) {
        if (-not (Test-Path -LiteralPath $directory.FullName -PathType Container)) {
            continue
        }

        try {
            $firstItem = Get-ChildItem -LiteralPath $directory.FullName -Force -ErrorAction Stop |
                Select-Object -First 1
            if ($null -eq $firstItem) {
                Remove-Item -LiteralPath $directory.FullName -Force -ErrorAction Stop
                Write-Host "[删除空目录] $($directory.FullName)"
                $deletedDirectories++
            }
        } catch {
            Write-Host "[失败] 无法检查或删除目录 $($directory.FullName)：$($_.Exception.Message)" -ForegroundColor Red
            $failures++
        }
    }

    return [pscustomobject]@{
        Moved = $moved
        Skipped = $skipped
        Protected = $protected
        DeletedDirectories = $deletedDirectories
        Failures = $failures
    }
}

$targetCount = 0
if (-not [int]::TryParse($env:FLATTEN_TARGET_COUNT, [ref]$targetCount) -or $targetCount -lt 1) {
    Write-Host '[错误] 没有收到有效的目标参数。' -ForegroundColor Red
    exit 2
}

$targetPaths = @(
    for ($index = 1; $index -le $targetCount; $index++) {
        [Environment]::GetEnvironmentVariable("FLATTEN_TARGET_$index")
    }
)

$roots = @()
$seenRoots = @{}
$preflightFailed = $false

foreach ($targetPath in $targetPaths) {
    try {
        $root = Resolve-FlattenRoot $targetPath
        if ($seenRoots.ContainsKey($root)) {
            Write-Host "[跳过重复] $root" -ForegroundColor Yellow
            continue
        }
        $seenRoots[$root] = $true
        $roots += $root
    } catch {
        Write-Host "[错误] $($_.Exception.Message)" -ForegroundColor Red
        $preflightFailed = $true
    }
}

for ($leftIndex = 0; $leftIndex -lt $roots.Count; $leftIndex++) {
    for ($rightIndex = $leftIndex + 1; $rightIndex -lt $roots.Count; $rightIndex++) {
        $left = $roots[$leftIndex]
        $right = $roots[$rightIndex]
        $leftPrefix = $left + [IO.Path]::DirectorySeparatorChar
        $rightPrefix = $right + [IO.Path]::DirectorySeparatorChar

        if ($right.StartsWith($leftPrefix, [StringComparison]::OrdinalIgnoreCase) -or
            $left.StartsWith($rightPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            Write-Host "[错误] 不能同时处理存在父子关系的目标：$left；$right" -ForegroundColor Red
            $preflightFailed = $true
        }
    }
}

if ($preflightFailed) {
    Write-Host '预检失败，未移动任何项目。' -ForegroundColor Red
    exit 1
}

$plans = @()
foreach ($root in $roots) {
    try {
        $plans += New-FlattenPlan $root
    } catch {
        Write-Host "[错误] $($_.Exception.Message)" -ForegroundColor Red
        $preflightFailed = $true
    }
}

if ($preflightFailed) {
    Write-Host '预检失败，未移动任何项目。' -ForegroundColor Red
    exit 1
}

$totalFiles = ($plans | ForEach-Object { $_.Files.Count } | Measure-Object -Sum).Sum
Write-Host "将依次展平 $($plans.Count) 个文件夹，共有 $totalFiles 个子目录文件待处理："
for ($index = 0; $index -lt $plans.Count; $index++) {
    Write-Host "  [$($index + 1)/$($plans.Count)] $($plans[$index].Root)（$($plans[$index].Files.Count) 个文件）"
}
Write-Host '操作：分别把每个目标的所有子文件夹文件移到该目标根目录，并删除变空的子文件夹。'
Write-Host '同名项目不会被覆盖，原文件及其所在目录将保留。' -ForegroundColor Yellow

if ($env:FLATTEN_ASSUME_YES -ne '1') {
    $answer = Read-Host '此操作无法撤消。继续处理以上所有文件夹？[y/N]'
    if ($answer -notmatch '^(?i:y|yes)$') {
        Write-Host '已取消，未移动任何项目。'
        exit 0
    }
}

$scriptPath = [IO.Path]::GetFullPath($env:FLATTEN_SCRIPT)
$totalMoved = 0
$totalSkipped = 0
$totalProtected = 0
$totalDeletedDirectories = 0
$totalFailures = 0

for ($index = 0; $index -lt $plans.Count; $index++) {
    $plan = $plans[$index]
    Write-Host ''
    Write-Host "[$($index + 1)/$($plans.Count)] 正在展平：$($plan.Root)" -ForegroundColor Cyan
    $result = Invoke-FlattenPlan $plan $scriptPath
    $totalMoved += $result.Moved
    $totalSkipped += $result.Skipped
    $totalProtected += $result.Protected
    $totalDeletedDirectories += $result.DeletedDirectories
    $totalFailures += $result.Failures
    Write-Host "本目录完成：移动 $($result.Moved) 个，跳过冲突 $($result.Skipped) 个，保护脚本 $($result.Protected) 个，删除空目录 $($result.DeletedDirectories) 个，失败 $($result.Failures) 个。"
}

Write-Host ''
Write-Host "全部完成：处理 $($plans.Count) 个文件夹，移动 $totalMoved 个，跳过冲突 $totalSkipped 个，保护脚本 $totalProtected 个，删除空目录 $totalDeletedDirectories 个，失败 $totalFailures 个。"

if ($totalFailures -gt 0) {
    exit 1
}
exit 0
