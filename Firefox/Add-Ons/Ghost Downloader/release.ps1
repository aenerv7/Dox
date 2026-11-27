#requires -Version 7.2
# From the module root, run npm ci once (or npm ci --offline with a primed cache),
# then pwsh -File ./release.ps1. No AMO, credential, signing or Git operations.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dist = Join-Path $root 'dist'
$out = Join-Path $root 'web-ext-artifacts'
$id = 'ghost-downloader@magi'
$version = '1.0.0'
$stem = "ghost-downloader-$version"
$npm = if ($IsWindows) { 'npm.cmd' } else { 'npm' }

function Read-Json([string]$path) {
    Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
}

# Use ZIP-standard paths and fixed timestamps so reruns are byte-comparable.
function Add-File($archive, [string]$file, [string]$name) {
    if ($name -match '(^|/)(\.|node_modules/)|\.(pem|pfx|key)$' -or
        (Get-Item -LiteralPath $file).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
        throw "Unexpected private or linked archive input: $name"
    }
    $entry = $archive.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal)
    $entry.LastWriteTime = [DateTimeOffset]'2000-01-01T00:00:00Z'
    $writer = $entry.Open()
    try {
        $reader = [IO.File]::OpenRead($file)
        try { $reader.CopyTo($writer) } finally { $reader.Dispose() }
    } finally { $writer.Dispose() }
}

function Add-Tree($archive, [string]$base, [string]$prefix) {
    $items = Get-ChildItem -LiteralPath $base -Recurse -Force | Sort-Object FullName -CaseSensitive -Culture en-US
    foreach ($item in $items) {
        if ($item.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw "Linked input: $($item.Name)" }
        if ($item.PSIsContainer) { continue }
        $name = [IO.Path]::GetRelativePath($base, $item.FullName).Replace('\', '/')
        Add-File $archive $item.FullName ($prefix + $name)
    }
}

function Write-Zip([string]$name, [scriptblock]$populate) {
    # Build away from the final name so a failing build never publishes a partial ZIP.
    $path = Join-Path $out $name
    $tmp = "$path.$([guid]::NewGuid()).tmp"
    try {
        $zip = [IO.Compression.ZipFile]::Open($tmp, [IO.Compression.ZipArchiveMode]::Create)
        try { & $populate $zip } finally { $zip.Dispose() }
        [IO.File]::Move($tmp, $path, $true)
    } finally {
        if ([IO.File]::Exists($tmp)) { [IO.File]::Delete($tmp) }
    }
}

Push-Location $root
try {
    $pkg = Read-Json 'package.json'
    $lock = Read-Json 'package-lock.json'
    if ($pkg.version -ne $version -or $lock.version -ne $version -or $lock.packages[''].version -ne $version) {
        throw "Expected matching package and lockfile versions ($version)"
    }
    if (!(Test-Path -LiteralPath 'node_modules')) { throw 'Install the locked dependencies with npm ci first' }
    foreach ($target in 'test','typecheck','build') {
        & $npm --offline run $target
        if ($LASTEXITCODE -ne 0) { throw "npm run $target failed" }
    }

    $manifest = Read-Json 'dist/manifest.json'
    $gecko = $manifest.browser_specific_settings.gecko
    if ($gecko.id -cne $id -or $manifest.version -ne $version -or $gecko.Contains('update_url')) {
        throw 'Unexpected Firefox identity, version or update channel'
    }
    if ($manifest.incognito -ne 'not_allowed') { throw 'The listing requires private browsing to be disabled' }
    $licenses = Join-Path $dist 'licenses'
    foreach ($required in 'npm/index.json','cat-catch/LICENSE') {
        if (!(Test-Path -LiteralPath (Join-Path $licenses $required) -PathType Leaf)) { throw "Missing licenses/$required" }
    }
    foreach ($required in 'LICENSE','THIRD_PARTY_NOTICES.txt','manifest.json','background.js','popup.html') {
        if (!(Test-Path -LiteralPath (Join-Path $dist $required) -PathType Leaf)) { throw "Missing dist/$required" }
    }
    $listing = Read-Json 'amo-listing.json'
    if ($listing.name.'zh-CN' -cne 'Ghost Downloader 浏览器扩展（Dox 修改版）' -or $listing.version.license -ne 'GPL-3.0-only') {
        throw 'Unexpected public name or license'
    }

    [IO.Directory]::CreateDirectory($out) | Out-Null
    $nodeVersion = (& node --version)
    $npmVersion = (& $npm --version)
    $instructions = @"
# Reproduce Ghost Downloader $version ($id)

Tested with Node.js $nodeVersion and npm $npmVersion. Extract this ZIP to an empty directory and run from its root:

    npm ci --no-audit --no-fund
    npm test
    npm run typecheck
    npm run build

Dependency installation needs the npm registry, or use npm ci --offline with a populated cache. The build itself is local. dist/ is the complete Firefox extension: its manifest.json belongs at the root of the install archive. Load the manifest in about:debugging to test temporarily. No desktop application, AMO keys or signing service is required to build. To generate both ZIPs, run pwsh -File ./release.ps1 with PowerShell 7.2 or later after npm ci. The unsigned ZIP is for submission or temporary testing; normal Firefox distribution requires Mozilla's signature.

src/, public/, scripts/, tests/ and vendor/ contain the preferred source and pinned vendored code. The lockfile pins npm dependencies. LICENSE, THIRD_PARTY_NOTICES.txt, LICENSES/ and vendor/cat-catch/LICENSE document redistribution terms. This is an unofficial fork, not a release by the upstream project.

Reviewer privacy notes: task handoff to the local desktop may include Cookie, Authorization and media decryption keys. Webpages or recording tools can request online FFmpeg, but each transfer requires separate approval in the extension. Verify that dismissing or refusing sends nothing to the online tool. If approved, https://ffmpeg.bmmmd.com/ can receive filenames, source URLs and actual media. The manifest disallows private browsing. See PRIVACY.md. Successful packaging does not imply AMO policy approval.
"@
    Write-Zip "$stem-unsigned.zip" { param($zip) Add-Tree $zip $dist '' }
    Write-Zip "$stem-source.zip" {
        param($zip)
        foreach ($file in 'package.json','package-lock.json','popup.html','tsconfig.json','vite.config.ts','LICENSE','THIRD_PARTY_NOTICES.txt','amo-listing.json','PRIVACY.md','release.ps1') {
            Add-File $zip (Join-Path $root $file) $file
        }
        foreach ($dir in 'src','public','scripts','tests','vendor') { Add-Tree $zip (Join-Path $root $dir) "$dir/" }
        Add-Tree $zip $licenses 'LICENSES/'
        $entry = $zip.CreateEntry('BUILD.md')
        $entry.LastWriteTime = [DateTimeOffset]'2000-01-01T00:00:00Z'
        $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
        try { $writer.Write($instructions.Replace("`r`n", "`n") + "`n") } finally { $writer.Dispose() }
    }
    Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $out "$stem-unsigned.zip"),(Join-Path $out "$stem-source.zip")
} finally { Pop-Location }
