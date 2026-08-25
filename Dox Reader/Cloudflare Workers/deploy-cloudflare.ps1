[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE"
    }
}

Push-Location -LiteralPath $PSScriptRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js 24 or later is required: https://nodejs.org/"
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw "npm was not found. Reinstall Node.js with npm enabled."
    }

    $nodeVersion = [version]((& node -p "process.versions.node").Trim())
    if ($nodeVersion.Major -lt 24) {
        throw "Node.js 24 or later is required; found $nodeVersion"
    }

    if (-not $SkipInstall) {
        Write-Host "Installing reproducible dependencies..."
        Invoke-Checked -Command "npm.cmd" -Arguments @("ci")
    }

    Write-Host "Testing and building Dox Reader..."
    Invoke-Checked -Command "npm.cmd" -Arguments @("run", "check")

    if ($DryRun) {
        Write-Host "Validating the Cloudflare deployment without uploading..."
        Invoke-Checked -Command "npx.cmd" -Arguments @("wrangler", "deploy", "--dry-run")
    } else {
        Write-Host "Deploying to Cloudflare Workers..."
        Write-Host "Wrangler will open Cloudflare sign-in on the first deployment."
        Invoke-Checked -Command "npx.cmd" -Arguments @("wrangler", "deploy")
    }
} finally {
    Pop-Location
}
