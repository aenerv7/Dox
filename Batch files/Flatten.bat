@echo off
setlocal

if "%~1"=="" goto :usage

set "FLATTEN_TARGET=%~1"
set "FLATTEN_ASSUME_YES=0"
set "FLATTEN_SCRIPT=%~f0"

if "%~2"=="" goto :run
if /I "%~2"=="/Y" goto :assume_yes
if /I "%~2"=="-Y" goto :assume_yes
goto :usage

:assume_yes
set "FLATTEN_ASSUME_YES=1"
goto :run

:run
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$source = Get-Content -LiteralPath $env:FLATTEN_SCRIPT -Raw -Encoding UTF8; $marker = '# POWERSHELL'; Invoke-Expression $source.Substring($source.LastIndexOf($marker) + $marker.Length)"
set "FLATTEN_EXIT_CODE=%ERRORLEVEL%"
if "%FLATTEN_ASSUME_YES%"=="0" (
    echo.
    pause
)
set "FLATTEN_TARGET="
set "FLATTEN_ASSUME_YES="
set "FLATTEN_SCRIPT="
exit /b %FLATTEN_EXIT_CODE%

:usage
echo Usage:
echo   Flatten.bat "folder path"
echo   Flatten.bat "folder path" /Y
echo.
echo Drag a folder onto this script, or pass its path on the command line.
echo /Y skips confirmation and the final pause.
exit /b 2

# POWERSHELL
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

try {
    $targetItem = Get-Item -LiteralPath $env:FLATTEN_TARGET -Force -ErrorAction Stop
} catch {
    Write-Host "[错误] 找不到目标：$($env:FLATTEN_TARGET)" -ForegroundColor Red
    exit 1
}

if (-not $targetItem.PSIsContainer) {
    Write-Host "[错误] 目标不是文件夹：$($targetItem.FullName)" -ForegroundColor Red
    exit 1
}

if ($targetItem.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    Write-Host "[错误] 为避免越过目录边界，目标不能是符号链接或目录联接：$($targetItem.FullName)" -ForegroundColor Red
    exit 1
}

$root = [IO.Path]::GetFullPath($targetItem.FullName)
$volumeRoot = [IO.Path]::GetPathRoot($root)
if ($root.TrimEnd('\', '/') -eq $volumeRoot.TrimEnd('\', '/')) {
    Write-Host "[错误] 为避免误操作，不能展平磁盘或共享根目录：$root" -ForegroundColor Red
    exit 1
}
$root = $root.TrimEnd('\', '/')

$fileScanErrors = @()
$directoryScanErrors = @()
$files = @(
    Get-ChildItem -LiteralPath $root -File -Recurse -Force `
        -ErrorAction SilentlyContinue -ErrorVariable fileScanErrors |
        Where-Object { $_.DirectoryName -ne $root }
)
$directories = @(
    Get-ChildItem -LiteralPath $root -Directory -Recurse -Force `
        -ErrorAction SilentlyContinue -ErrorVariable directoryScanErrors |
        Where-Object { -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } |
        Sort-Object { $_.FullName.Length } -Descending
)

if ($fileScanErrors.Count -gt 0 -or $directoryScanErrors.Count -gt 0) {
    Write-Host '[错误] 无法完整读取目录树，未移动任何项目。' -ForegroundColor Red
    @($fileScanErrors) + @($directoryScanErrors) |
        ForEach-Object { Write-Host "  $($_.Exception.Message)" }
    exit 1
}

Write-Host "目标文件夹：$root"
Write-Host "待处理文件：$($files.Count) 个"
Write-Host '操作：把所有子文件夹中的文件移到目标文件夹，并删除变空的子文件夹。'
Write-Host '同名项目不会被覆盖，原文件及其所在目录将保留。' -ForegroundColor Yellow

if ($env:FLATTEN_ASSUME_YES -ne '1') {
    $answer = Read-Host '此操作无法撤消。继续？[y/N]'
    if ($answer -notmatch '^(?i:y|yes)$') {
        Write-Host '已取消，未移动任何项目。'
        exit 0
    }
}

$moved = 0
$skipped = 0
$protected = 0
$deletedDirectories = 0
$failures = 0
$scriptPath = [IO.Path]::GetFullPath($env:FLATTEN_SCRIPT)

foreach ($file in $files) {
    if ([StringComparer]::OrdinalIgnoreCase.Equals($file.FullName, $scriptPath)) {
        Write-Host "[保留] 正在运行的脚本：$($file.FullName)" -ForegroundColor Yellow
        $protected++
        continue
    }

    $destination = Join-Path $root $file.Name
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

foreach ($directory in $directories) {
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

Write-Host ''
Write-Host "完成：移动 $moved 个，跳过冲突 $skipped 个，保护脚本 $protected 个，删除空目录 $deletedDirectories 个，失败 $failures 个。"

if ($failures -gt 0) {
    exit 1
}
exit 0
