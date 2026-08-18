# ============================================================================
# build.ps1 — 使用 Visual Studio (MSVC) 工具链编译 Launcher.exe
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\build.ps1
# 产物：bin\Launcher.exe（x64，静态链接运行时，无需安装 VC++ 运行库）
# ============================================================================
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root "src"
$out  = Join-Path $root "bin"
New-Item -ItemType Directory -Force -Path $out | Out-Null

# ---- 定位 Visual Studio（vswhere）----
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhere)) { throw "未找到 vswhere.exe，请确认已安装 Visual Studio" }
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw "未找到 Visual Studio 的 C++ 工具集（请安装「使用 C++ 的桌面开发」工作负载）" }
$vcvars = Join-Path $vs "VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vcvars)) { throw "未找到 $vcvars" }

# ---- 编译命令（用相对路径避免带空格路径的引号问题）----
$defs  = '/DUNICODE /D_UNICODE /D_WIN32_WINNT=0x0A00 /DWINVER=0x0A00 /D_CRT_SECURE_NO_WARNINGS'
$flags = "/nologo /EHsc /std:c++20 /O2 /MT $defs /W3 /utf-8"

# 1) rc：在 src 目录下编译资源（Launcher.ico / 对话框 / 清单 / 版本信息）
$rcCmd = "cd /d `"$src`" && rc /nologo /fo ..\bin\Launcher.res Launcher.rc"
# 2) cl：仅编译（/c），输出 Launcher.obj 到 bin
$compileCmd = "cd /d `"$out`" && cl /nologo /c $flags ..\src\Launcher.cpp /Fo:Launcher.obj"
# 3) link：显式链接 obj 与 res（cl 一步式链接在 /Fo: 空值下有兼容性问题，故拆开）
$linkCmd = "cd /d `"$out`" && link /nologo /SUBSYSTEM:WINDOWS /MACHINE:X64 Launcher.obj Launcher.res /OUT:Launcher.exe"

$cmd = "call `"$vcvars`" >nul 2>&1 && $rcCmd && $compileCmd && $linkCmd"
Write-Host "==> $cmd"
& cmd.exe /c $cmd
if ($LASTEXITCODE -ne 0) { throw "构建失败（退出码 $LASTEXITCODE）" }

$exe = Join-Path $out "Launcher.exe"
Write-Host ""
Write-Host "构建成功：$exe"
