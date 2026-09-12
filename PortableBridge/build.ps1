[CmdletBinding()]
param(
    [string]$OutputPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourcePath = Join-Path $scriptPath 'PortableBridge.cs'
$maintenanceSourcePath = Join-Path $scriptPath 'FirefoxMaintenance.cs'
$chromeMaintenanceSourcePath = Join-Path $scriptPath 'ChromeMaintenance.cs'
$coordinatorSourcePath = Join-Path $scriptPath 'SessionCoordinator.cs'
$browserSourcePath = Join-Path $scriptPath 'BrowserSupport.cs'
$manifestPath = Join-Path $scriptPath 'app.manifest'
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $scriptPath 'bin\PortableBridge.exe'
}

$outputFullPath = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [IO.Path]::GetDirectoryName($outputFullPath)
if ([string]::IsNullOrWhiteSpace($outputDirectory)) {
    throw "The output path has no parent directory: $outputFullPath"
}
if (-not [string]::Equals([IO.Path]::GetExtension($outputFullPath), '.exe', [StringComparison]::OrdinalIgnoreCase)) {
    throw "The output path must end in .exe: $outputFullPath"
}

[void][IO.Directory]::CreateDirectory($outputDirectory)
$compilerCandidates = @(
    (Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compilerPath = $compilerCandidates | Where-Object {
    Test-Path -LiteralPath $_ -PathType Leaf
} | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($compilerPath)) {
    throw 'The .NET Framework 4 C# compiler was not found.'
}
if (-not (Test-Path -LiteralPath $maintenanceSourcePath -PathType Leaf)) {
    throw "The portable maintenance source was not found: $maintenanceSourcePath"
}
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "The application manifest was not found: $manifestPath"
}

& $compilerPath `
    /nologo `
    /target:winexe `
    /platform:x64 `
    /optimize+ `
    /warnaserror+ `
    /reference:System.Management.dll `
    /reference:System.Runtime.Serialization.dll `
    "/win32manifest:$manifestPath" `
    "/out:$outputFullPath" `
    $sourcePath `
    $maintenanceSourcePath `
    $chromeMaintenanceSourcePath `
    $browserSourcePath `
    $coordinatorSourcePath
if ($LASTEXITCODE -ne 0) {
    throw "csc.exe failed with exit code $LASTEXITCODE."
}
if (-not (Test-Path -LiteralPath $outputFullPath -PathType Leaf)) {
    throw "The compiler did not create the expected output: $outputFullPath"
}

$bytes = [IO.File]::ReadAllBytes($outputFullPath)
if ($bytes.Length -lt 512 -or $bytes[0] -ne 0x4D -or $bytes[1] -ne 0x5A) {
    throw 'The generated file is not a valid PE image.'
}
$peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
$subsystem = [BitConverter]::ToUInt16($bytes, $peOffset + 4 + 20 + 68)
if ($subsystem -ne 2) {
    throw "The generated PE subsystem is $subsystem instead of Windows GUI (2)."
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $outputFullPath
Write-Host "Build succeeded: $outputFullPath"
Write-Host "SHA-256: $($hash.Hash)"
