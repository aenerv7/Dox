param(
    [ValidateSet('help', 'detect', 'install', 'restore', 'verify')]
    [string]$Action = 'install',
    [string]$InstallDir,
    [string]$Profile,
    [string]$ProfilesRoot,
    [string]$LocalRoot
)

$ErrorActionPreference = 'Stop'
if ($Action -eq 'help') {
    & python (Join-Path $PSScriptRoot 'patch_zen.py') --help
    exit $LASTEXITCODE
}
New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'build') -Force | Out-Null
$logPath = Join-Path $PSScriptRoot 'build\installer.log'
$resultPath = Join-Path $PSScriptRoot 'build\installer-result.json'
try {
    $pythonCommand = (Get-Command python -ErrorAction Stop).Source
    $pythonArgs = @((Join-Path $PSScriptRoot 'patch_zen.py'), $Action)
    if ($InstallDir) { $pythonArgs += @('--install-dir', $InstallDir) }
    if ($Profile) { $pythonArgs += @('--profile', $Profile) }
    if ($ProfilesRoot) { $pythonArgs += @('--profiles-root', $ProfilesRoot) }
    if ($LocalRoot) { $pythonArgs += @('--local-root', $LocalRoot) }
    & $pythonCommand @pythonArgs 2>&1 | Tee-Object -FilePath $logPath
    $installerExit = $LASTEXITCODE
    @{ action = $Action; exit_code = $installerExit; finished = (Get-Date).ToString('o') } |
        ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding utf8
    exit $installerExit
} catch {
    $_ | Out-File -LiteralPath $logPath -Encoding utf8 -Append
    @{ action = $Action; exit_code = 1; error = $_.Exception.Message } |
        ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding utf8
    exit 1
}
