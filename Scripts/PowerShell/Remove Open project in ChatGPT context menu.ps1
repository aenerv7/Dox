[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$NoExplorerRestart
)

Set-StrictMode -Version Latest

$packageName = 'OpenAI.Codex'
$verbId = 'OpenProjectInCodex'
$blockedKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked'

$legacyKeys = @(
    'HKCU:\Software\Classes\Directory\shell\OpenProjectInCodex',
    'HKCU:\Software\Classes\Directory\Background\shell\OpenProjectInCodex',
    'HKCU:\Software\Classes\Folder\shell\OpenProjectInCodex',
    'HKCU:\Software\Classes\Drive\shell\OpenProjectInCodex',
    'HKCU:\Software\Classes\*\shell\OpenProjectInCodex'
)

$packages = @(Get-AppxPackage -Name $packageName -ErrorAction SilentlyContinue)

if ($packages.Count -eq 0) {
    throw "ChatGPT MSIX package not found: $packageName"
}

$clsids = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
)

foreach ($package in $packages) {
    $manifestPath = Join-Path $package.InstallLocation 'AppxManifest.xml'

    if (-not (Test-Path -LiteralPath $manifestPath)) {
        continue
    }

    [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
    $verbs = $manifest.SelectNodes(
        "//*[local-name()='Verb' and @Id='$verbId']"
    )

    foreach ($verb in $verbs) {
        $rawClsid = [string]$verb.GetAttribute('Clsid')
        $guid = [guid]::Empty

        if ([guid]::TryParse($rawClsid.Trim('{}'), [ref]$guid)) {
            [void]$clsids.Add(
                '{' + $guid.ToString().ToUpperInvariant() + '}'
            )
        }
    }
}

if ($clsids.Count -eq 0) {
    throw "Explorer verb not found: $verbId"
}

if ($PSCmdlet.ShouldProcess($blockedKey, 'block Explorer extension')) {
    New-Item -Path $blockedKey -Force | Out-Null

    foreach ($clsid in $clsids) {
        New-ItemProperty `
            -Path $blockedKey `
            -Name $clsid `
            -PropertyType String `
            -Value 'Disabled' `
            -Force | Out-Null

        Write-Host "Blocked: $clsid"
    }
}

foreach ($legacyKey in $legacyKeys) {
    if (Test-Path -LiteralPath $legacyKey) {
        if ($PSCmdlet.ShouldProcess($legacyKey, 'remove legacy menu entry')) {
            Remove-Item -LiteralPath $legacyKey -Recurse -Force
            Write-Host "Removed: $legacyKey"
        }
    }
}

if (
    -not $NoExplorerRestart `
    -and $PSCmdlet.ShouldProcess('explorer.exe', 'restart Explorer')
) {
    Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
    Start-Process explorer.exe
}

Write-Host 'Done.'
