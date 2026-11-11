param(
    [ValidateSet('x64', 'Win32')]
    [string]$Platform = 'x64',
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = Join-Path $scriptDir 'foo_vespertine_analyze.vcxproj'
$sdkDir = Join-Path $scriptDir '..\..\foobar2000-sdk'
$outDir = Join-Path $scriptDir "build\$Platform\Release"
$stageDir = Join-Path $scriptDir "build\tmp\package-$Platform"
$package = Join-Path $outDir 'foo_vespertine_analyze.fb2k-component'

function Get-VsWherePath {
    $roots = @(${env:ProgramFiles(x86)}, $env:ProgramFiles) | Where-Object { $_ }
    foreach ($root in $roots) {
        $path = Join-Path $root 'Microsoft Visual Studio\Installer\vswhere.exe'
        if (Test-Path -LiteralPath $path) {
            return $path
        }
    }

    return $null
}

function Get-VsInstallPath {
    $vswhere = Get-VsWherePath
    if (-not $vswhere) {
        throw 'Unable to find vswhere.exe. Install Visual Studio 2022 or newer.'
    }

    $path = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
    if (-not $path) {
        throw 'Unable to find a Visual Studio installation with C++ build tools.'
    }

    return $path
}

function Get-MSBuildPath([string]$vsPath) {
    $path = Join-Path $vsPath 'MSBuild\Current\Bin\MSBuild.exe'
    if (Test-Path -LiteralPath $path) {
        return $path
    }

    $cmd = Get-Command msbuild.exe -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    throw 'Unable to find MSBuild.exe.'
}

# The SDK ships v143-only projects, so the build needs a toolset that exists on this machine.
# Pick the newest installed one and pass it to every project: pfc/SDK and this component then
# share one compiler instead of mixing v143 SDK libraries with the VS default.
function Get-LatestToolset([string]$vsPath) {
    $pattern = Join-Path $vsPath 'MSBuild\Microsoft\VC\v*\Platforms\x64\PlatformToolsets\*'
    $toolsets = Get-ChildItem -Path $pattern -Directory -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty Name
    if (-not $toolsets) {
        return $null
    }

    return ($toolsets | Sort-Object { [int]($_ -replace '\D', '') } | Select-Object -Last 1)
}

function Invoke-Build([string]$vsPath, [string]$toolset) {
    $msbuild = Get-MSBuildPath $vsPath
    $msbuildArgs = @(
        $project,
        '/p:Configuration=Release',
        "/p:Platform=$Platform",
        "/p:Fb2kSdkDir=$sdkDir",
        '/m',
        '/v:minimal',
        '/nologo'
    )
    if ($toolset) {
        $msbuildArgs += "/p:PlatformToolset=$toolset"
    }

    & $msbuild @msbuildArgs
    if ($LASTEXITCODE -ne 0) {
        throw "MSBuild failed with exit code $LASTEXITCODE."
    }
}

function Invoke-Package {
    $dll = Join-Path $outDir 'foo_vespertine_analyze.dll'
    if (-not (Test-Path -LiteralPath $dll)) {
        throw "Missing build output: $dll"
    }

    if (Test-Path -LiteralPath $stageDir) {
        Remove-Item -LiteralPath $stageDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force $stageDir | Out-Null
    Copy-Item -LiteralPath $dll $stageDir
    # foobar2000 unpacks the archive as-is, so the license travels with the binary.
    Copy-Item -LiteralPath (Join-Path $scriptDir 'LICENSE') (Join-Path $stageDir 'LICENSE.txt')

    if (Test-Path -LiteralPath $package) {
        Remove-Item -LiteralPath $package -Force
    }
    [System.IO.Compression.ZipFile]::CreateFromDirectory($stageDir, $package, [System.IO.Compression.CompressionLevel]::Optimal, $false)
    Remove-Item -LiteralPath $stageDir -Recurse -Force

    Write-Host "Packaged: $package"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path -LiteralPath (Join-Path $sdkDir 'foobar2000'))) {
    throw "foobar2000 SDK not found at $sdkDir. Extract SDK-2026-10-01.7z there."
}

if (-not $NoBuild) {
    $vsPath = Get-VsInstallPath
    $toolset = Get-LatestToolset $vsPath
    if ($toolset) {
        Write-Host "Building with toolset $toolset."
    }
    Invoke-Build $vsPath $toolset
}

Invoke-Package
