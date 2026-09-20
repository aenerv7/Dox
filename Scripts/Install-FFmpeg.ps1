#Requires -Version 7.0

<#
.SYNOPSIS
  Downloads the latest FFmpeg full release build and installs it.

.DESCRIPTION
  Windows is the only implemented platform; macOS exits with a message.

  Source is BtbN/FFmpeg-Builds, the GitHub mirror linked from
  https://ffmpeg.org/download.html#build-windows. Its win64 GPL asset is the same
  "full" variant as gyan.dev's full release: essentials plus libx264 and libx265.
  Unlike gyan.dev it ships a zip and a published SHA-256, so extraction needs no
  external tool and the archive can be verified before it is unpacked.

  Two asset families exist, and the payload differs by more than the executables:

    static  ffmpeg.exe ffplay.exe ffprobe.exe
    shared  the same three, plus the DLLs they link against

  Nothing else from the archive is installed. The .ffpreset files are left behind
  as well: these builds look for preset files under a /presets directory that the
  archive does not ship, so -vpre libvpx-720p fails with or without them.

.PARAMETER Directory
  Install directory. Defaults to %LOCALAPPDATA%\Programs\FFmpeg.

.PARAMETER Shared
  Install the shared build (smaller download, more files) instead of the static
  one. The two families only differ in the ffmpeg libraries; switching overwrites
  the executables and leaves the other family's library files behind.

.PARAMETER Git
  Install the daily master build instead of the latest numbered release.

.PARAMETER Silent
  Skip the summary at the end.

.EXAMPLE
  .\Install-FFmpeg.ps1

.EXAMPLE
  .\Install-FFmpeg.ps1 -Git -Directory 'D:\Tools\FFmpeg'
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Directory,

    [switch]$Git,

    [switch]$Shared,

    [switch]$Silent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest progress bars slow downloads

$Binaries = @('ffmpeg.exe', 'ffplay.exe', 'ffprobe.exe')

# Only these are installed. The archive also carries 32 HTML manuals, a
# LICENSE.txt, and for shared builds the headers and import libraries used to
# link against FFmpeg; none of that is needed to run the executables.
$PayloadExtensions = @('.exe', '.dll')

$ArchiveRetries = 3

# The moving "latest" tag always carries a fresh release, so the asset is picked by
# name pattern from the release rather than by a version number pinned in here.
$ApiUrl = 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/tags/latest'
$DownloadRoot = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest'
$ChecksumsFile = 'checksums.sha256'

# Asset names are ffmpeg-<branch>-latest-win64-gpl[-shared][-<version>].zip. The
# numbered releases carry a -<version> suffix, the master branch does not.
$AssetPattern = '^ffmpeg-(?<branch>.+?)-latest-win64-gpl(?<variant>-shared)?(?<version>-[0-9.]+)?\.zip$'

function Get-Platform {
    if ($IsWindows) { return 'Windows' }
    if ($IsMacOS) { return 'MacOS' }
    throw 'Unsupported platform. This script installs FFmpeg on Windows and macOS only.'
}

function Get-InstallDirectory([string]$Requested) {
    if ($Requested) { return $Requested }
    return (Join-Path $env:LOCALAPPDATA 'Programs\FFmpeg')
}

function Get-ReleaseAssets {
    # Unauthenticated GitHub API calls are rate limited to 60/hour per address; one
    # call per run keeps well clear of that.
    $headers = @{ 'User-Agent' = 'Dox-Scripts'; 'Accept' = 'application/vnd.github+json' }
    return (Invoke-RestMethod -Uri $ApiUrl -Headers $headers).assets
}

function Select-Asset($Assets, [bool]$Git, [bool]$Shared) {
    $variant = if ($Shared) { '-shared' } else { '' }
    $candidates = @()

    foreach ($asset in $Assets) {
        $match = [regex]::Match($asset.name, $AssetPattern)
        if (-not $match.Success) { continue }
        if ($match.Groups['variant'].Value -ne $variant) { continue }

        $isGit = $match.Groups['branch'].Value -eq 'master'
        if ($isGit -ne $Git) { continue }
        $candidates += $asset
    }
    if (-not $candidates) { throw "The release publishes no $variant win64 GPL build matching -Git:$Git." }

    # Prefer the highest numbered release over a bare branch build, then the newest.
    return ($candidates | Sort-Object -Property @{Expression = { $_.name }; Descending = $true} |
        Sort-Object -Property @{Expression = { $_.created_at }; Descending = $true} |
        Select-Object -First 1)
}

function Get-PublishedHash([string]$AssetName) {
    # checksums.sha256 lists every asset of the release as "<hash>  <name>" per line.
    $url = "$DownloadRoot/$ChecksumsFile"
    $text = (Invoke-WebRequest -Uri $url).Content
    if ($text -is [byte[]]) { $text = [Text.Encoding]::UTF8.GetString($text) }

    foreach ($line in ([string]$text -split "`n")) {
        $fields = $line.Trim() -split '\s+', 2
        if ($fields.Count -eq 2 -and $fields[1].Trim() -eq $AssetName) { return $fields[0] }
    }
    throw "$AssetName is not listed in $url; the build may have been withdrawn."
}

function Save-VerifiedArchive($Asset, [string]$Destination) {
    # Verify before extracting so a truncated or tampered archive is never unpacked.
    $expected = Get-PublishedHash $Asset.name
    $url = "$DownloadRoot/$($Asset.name)"

    for ($attempt = 1; $attempt -le $ArchiveRetries; $attempt++) {
        Write-Host "Downloading $($Asset.name)"
        try {
            Invoke-WebRequest -Uri $url -OutFile $Destination
        }
        catch {
            if ($attempt -eq $ArchiveRetries) { throw }
            # A ~190 MB transfer over a flaky link fails mid-stream often enough to retry.
            Write-Warning "Download failed (attempt $attempt of $ArchiveRetries): $_"
            continue
        }

        $actual = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash
        if ($actual -eq $expected.ToUpperInvariant()) { return }

        Write-Warning "SHA-256 mismatch (attempt $attempt of $ArchiveRetries), re-downloading."
    }
    throw "Could not obtain a $($Asset.name) matching its published SHA-256 ($expected)."
}

function Assert-Binaries($Root) {
    $names = @(Get-ChildItem -LiteralPath $Root -Recurse -File | Select-Object -ExpandProperty Name)
    $missing = @($Binaries | Where-Object { $names -notcontains $_ })
    if ($missing) { throw "Archive is missing: $($missing -join ', ')" }
}

function Copy-Payload([string]$Root, [string]$Target) {
    $files = @(Get-ChildItem -LiteralPath $Root -Recurse -File |
        Where-Object { $PayloadExtensions -contains $_.Extension })
    Assert-Binaries $Root

    foreach ($file in $files) {
        # Always replace: rerunning the script is how a new build gets picked up.
        Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $Target $file.Name) -Force
    }
    return $files.Count
}

function Install-Windows([string]$Target, [bool]$Git, [bool]$Shared) {
    $asset = Select-Asset (Get-ReleaseAssets) $Git $Shared

    $work = Join-Path ([IO.Path]::GetTempPath()) "dox-ffmpeg-$([guid]::NewGuid().ToString('n'))"
    New-Item -ItemType Directory -Path $work | Out-Null

    try {
        $archive = Join-Path $work $asset.name
        Save-VerifiedArchive $asset $archive

        $expanded = Join-Path $work 'content'
        Expand-Archive -LiteralPath $archive -DestinationPath $expanded

        Write-Host "Installing $($asset.name)"
        return Copy-Payload $expanded $Target
    }
    finally {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Show-Result([string]$Target) {
    if ($Silent) { return }

    foreach ($name in $Binaries) {
        # ffmpeg -version prints its build banner on stdout and exits 0.
        $banner = (& (Join-Path $Target $name) -version 2>$null | Select-Object -First 1)
        Write-Host "$name`t$banner"
    }
}

function Main {
    if ((Get-Platform) -ne 'Windows') {
        Write-Error 'macOS is not implemented yet; only the Windows install path exists.'
        exit 2
    }

    $target = Get-InstallDirectory $Directory
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Write-Host "Installing into $target"

    $count = Install-Windows $target $Git.IsPresent $Shared.IsPresent
    Write-Host "Installed $count file(s)"

    Show-Result $target
}

Main
