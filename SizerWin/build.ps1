param(
    [ValidateSet('x64', 'x86', 'arm64')]
    [string]$Arch = 'x64'
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$clArgs = @(
    '/O2',
    '/utf-8',
    '/W4',
    '/Fe:SizerWin.exe',
    'SizerWin.c',
    'SizerWin.res',
    '/link',
    '/SUBSYSTEM:WINDOWS',
    'user32.lib',
    'shell32.lib',
    'advapi32.lib',
    'kernel32.lib',
    'gdi32.lib',
    'dwmapi.lib',
    'comctl32.lib'
)

function Invoke-BuildWithCurrentEnvironment {
    & rc.exe /nologo SizerWin.rc
    if ($LASTEXITCODE -ne 0) {
        throw "rc.exe failed with exit code $LASTEXITCODE."
    }

    & cl.exe @clArgs
    if ($LASTEXITCODE -ne 0) {
        throw "cl.exe failed with exit code $LASTEXITCODE."
    }
}

function Get-VsWherePath {
    $roots = @(${env:ProgramFiles(x86)}, $env:ProgramFiles) | Where-Object { $_ }
    foreach ($root in $roots) {
        $path = Join-Path $root 'Microsoft Visual Studio\Installer\vswhere.exe'
        if ($path -and (Test-Path -LiteralPath $path)) {
            return $path
        }
    }

    $cmd = Get-Command vswhere.exe -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    return $null
}

function Invoke-BuildWithVsTools {
    $vswhere = Get-VsWherePath
    if (-not $vswhere) {
        throw 'Unable to find vswhere.exe. Install Visual Studio Build Tools or run from a Developer PowerShell.'
    }

    $installPath = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
    if (-not $installPath) {
        throw 'Unable to find a Visual Studio installation with C++ build tools.'
    }

    $vcvars = Join-Path $installPath 'VC\Auxiliary\Build\vcvarsall.bat'
    if (-not (Test-Path -LiteralPath $vcvars)) {
        throw "Unable to find vcvarsall.bat: $vcvars"
    }

    $cmd = 'call "{0}" {1} >nul && rc /nologo SizerWin.rc && cl /O2 /utf-8 /W4 /Fe:SizerWin.exe SizerWin.c SizerWin.res /link /SUBSYSTEM:WINDOWS user32.lib shell32.lib advapi32.lib kernel32.lib gdi32.lib dwmapi.lib comctl32.lib' -f $vcvars, $Arch
    & cmd.exe /d /s /c $cmd
    if ($LASTEXITCODE -ne 0) {
        throw "Visual Studio build command failed with exit code $LASTEXITCODE."
    }
}

Push-Location $scriptDir
try {
    $hasCl = [bool](Get-Command cl.exe -ErrorAction SilentlyContinue)
    $hasRc = [bool](Get-Command rc.exe -ErrorAction SilentlyContinue)

    if ($hasCl -and $hasRc) {
        Invoke-BuildWithCurrentEnvironment
    }
    else {
        Invoke-BuildWithVsTools
    }

    Remove-Item -LiteralPath 'SizerWin.obj', 'SizerWin.res' -Force -ErrorAction SilentlyContinue
    Write-Host 'Build succeeded: SizerWin.exe'
}
finally {
    Pop-Location
}
