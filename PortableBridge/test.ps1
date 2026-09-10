[CmdletBinding()]
param()
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$sourceDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDirectory = Join-Path $sourceDirectory 'bin\tests'
[void][IO.Directory]::CreateDirectory($outputDirectory)
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$outputPath = Join-Path $outputDirectory 'chrome.exe'
$sources = @('PortableBridge.cs', 'FirefoxMaintenance.cs', 'BrowserSupport.cs', 'SessionCoordinator.cs', 'tests\BridgeTests.cs') |
    ForEach-Object { Join-Path $sourceDirectory $_ }
& $compiler /nologo /target:exe /platform:x64 /warnaserror+ /main:PortableBrowserBridge.TestRunner `
    /reference:System.Management.dll /reference:System.Runtime.Serialization.dll "/out:$outputPath" $sources
if ($LASTEXITCODE -ne 0) { throw 'Test compilation failed.' }
& $outputPath
if ($LASTEXITCODE -ne 0) { throw 'Bridge tests failed.' }
