# release.ps1 - One-command release for Dox Reader.
#
# Builds the extension, creates the source archive, submits both to AMO
# (listed channel = public AMO submission and review),
# downloads the signed XPI into bb7581fa1bbf4b928862.xpi, appends the version to
# updates.json, and optionally commits and pushes everything to GitHub so the
# raw.githubusercontent.com update links go live.
#
# Prerequisites:
#   1. AMO API credentials: create at
#      https://addons.mozilla.org/en-US/developers/addon/api/key/
#      and put them in a local .env.release file (gitignored, never committed):
#        AMO_API_KEY=user:12345678
#        AMO_API_SECRET=<hex secret>
#      or export them as environment variables with the same names.
#   2. The add-on must already exist on AMO. Because the manifest carries a
#      fixed extension ID, `web-ext sign` always targets that existing add-on
#      and never creates a new one.
#   3. Bump the version first in package.json and public/manifest.json
#      (and `npm install` to refresh package-lock.json) - this script uses
#      the version already declared in package.json.
#   4. Pending listed reviews exit without publishing an unsigned package.
#      Run again after AMO approval to download the signed XPI and update the
#      legacy distribution endpoints. Existing versions are never re-submitted.
#
# Usage:
#   pwsh -File release.ps1          # everything up to git push
#   pwsh -File release.ps1 -Push    # also commit and push
#   pwsh -File release.ps1 -SkipSign  # dry run: check + build + source archive only

param(
  [switch]$Push,
  [switch]$SkipSign
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version
$id = 'dox-rss-reader@dox.local'
$xpiName = 'bb7581fa1bbf4b928862.xpi'
$updateLink = "https://raw.githubusercontent.com/aenerv7/Dox/main/Dox%20Reader/Firefox/$xpiName"
$legacyUpdateRoot = [IO.Path]::GetFullPath((Join-Path $root '..\..\Firefox\Dox Reader'))
$sourceZip = Join-Path $root "web-ext-artifacts\dox_reader-$version-source.zip"
$amoMetadata = Join-Path $root 'web-ext-artifacts\amo-metadata.json'
$manifest = Get-Content (Join-Path $root 'public/manifest.json') -Raw | ConvertFrom-Json
if ($manifest.version -ne $version) { throw 'Package and manifest versions must match' }
$lock = Get-Content (Join-Path $root 'package-lock.json') -Raw | ConvertFrom-Json -AsHashtable
if ($lock.version -ne $version -or $lock.packages[''].version -ne $version) { throw 'Lock file version must match' }
if ($manifest.browser_specific_settings.gecko.update_url) { throw 'Listed extensions must not set update_url' }
if ($Push) {
  # git commit includes everything staged, even outside the paths passed to add.
  $staged = @(git diff --cached --name-only)
  if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the git index' }
  if ($staged.Count) { throw 'Commit or unstage existing staged changes before using -Push' }
}

# Load credentials from a gitignored .env.release file when the environment
# variables are not already set. Never commit that file.
$envFile = Join-Path $root '.env.release'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    $line = $line.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    $eq = $line.IndexOf('=')
    if ($eq -le 0) { continue }
    $name = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name))) { continue }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

# --- AMO API helpers (JWT auth, used for recovery checks and downloads) ---
function B64Url([byte[]]$Bytes) {
  return ([Convert]::ToBase64String($Bytes) -replace '\+', '-' -replace '/', '_' -replace '=', '')
}

function Get-AmoToken {
  $header = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
  $iat = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $payloadJson = (@{ iss = $env:AMO_API_KEY; jti = [guid]::NewGuid().ToString(); iat = $iat; exp = $iat + 60 } | ConvertTo-Json -Compress)
  $payload = B64Url ([Text.Encoding]::UTF8.GetBytes($payloadJson))
  $hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($env:AMO_API_SECRET))
  $signature = B64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$payload")))
  return "$header.$payload.$signature"
}

function Get-AmoVersion([string]$Version) {
  $uri = "https://addons.mozilla.org/api/v5/addons/addon/$id/versions/$Version/"
  $response = Invoke-WebRequest -Uri $uri -Headers @{ Authorization = "JWT $(Get-AmoToken)" } -SkipHttpErrorCheck -UseBasicParsing
  if ($response.StatusCode -eq 404) { return $null }
  if ($response.StatusCode -ne 200) { throw "AMO 查询版本失败（HTTP $($response.StatusCode)）" }
  return ($response.Content | ConvertFrom-Json)
}

function Download-Xpi([string]$Url, [string]$OutPath) {
  try {
    Invoke-WebRequest -Uri $Url -Headers @{ Authorization = "JWT $(Get-AmoToken)" } -OutFile $OutPath -UseBasicParsing
  } catch {
    Write-Host '==>    鉴权下载失败，改用匿名下载'
    Invoke-WebRequest -Uri $Url -OutFile $OutPath -UseBasicParsing
  }
  if (-not (Test-Path $OutPath)) { throw "签名 XPI 下载失败：$Url" }
}

Write-Host "==> Releasing dox-rss-reader $version"

# 1. Tests, type check, and production build.
npm run check
if ($LASTEXITCODE -ne 0) { throw 'npm run check failed' }

# 2. Unsigned package as a local fallback artifact.
npx --yes web-ext@10.6.0 build --source-dir dist --artifacts-dir web-ext-artifacts --overwrite-dest
if ($LASTEXITCODE -ne 0) { throw 'web-ext build failed' }

# 3. Source archive (AMO requires human-readable source for compiled bundles).
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $sourceZip) { Remove-Item $sourceZip -Force }
$archive = [System.IO.Compression.ZipFile]::Open($sourceZip, [System.IO.Compression.ZipArchiveMode]::Create)
$files = Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object {
  $rel = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
  $rel -notmatch '^(node_modules|dist|web-ext-artifacts|\.git)(/|$)' -and
  $rel -ne $xpiName -and
  $rel -ne 'updates.json' -and
  $rel -notmatch '(^|/)\.'
}
foreach ($f in $files) {
  $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
  $entry = $archive.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
  $es = $entry.Open(); $fs = [System.IO.File]::OpenRead($f.FullName)
  $fs.CopyTo($es); $fs.Dispose(); $es.Dispose()
}
$archive.Dispose()
Write-Host "==> Source archive: $sourceZip ($($files.Count) files)"

# 4. Submit to AMO. Human review can take longer than this command runs.
if ($SkipSign) {
  Write-Host '==> Skipping AMO submission (-SkipSign). Source archive is ready.'
  exit 0
}
if (-not $env:AMO_API_KEY -or -not $env:AMO_API_SECRET) {
  throw 'AMO credentials missing. Create them at https://addons.mozilla.org/en-US/developers/addon/api/key/ and set AMO_API_KEY / AMO_API_SECRET in .env.release (see the script header).'
}
if ($env:AMO_API_KEY -notmatch '^user:\d+(:\d+)?$') {
  throw "AMO_API_KEY looks wrong ('$($env:AMO_API_KEY)'); expected the JWT issuer, e.g. 'user:12345678' or 'user:12345678:808'"
}
$signedPath = Join-Path $root "web-ext-artifacts\dox_reader-$version-an+fx.xpi"

$existing = Get-AmoVersion $version
if (-not $existing) {
  $metadata = Get-Content (Join-Path $root 'amo-listing.json') -Raw | ConvertFrom-Json -AsHashtable
  $metadata.version.approval_notes = Get-Content (Join-Path $root 'AMO_REVIEW_NOTES.md') -Raw
  if ($metadata.version.approval_notes.Length -gt 3000) { throw 'AMO reviewer notes exceed 3000 characters' }
  $metadata | ConvertTo-Json -Depth 10 | Set-Content $amoMetadata -Encoding utf8
  Write-Host '==> Submitting to AMO (listed)...'
  $previousKey = $env:WEB_EXT_API_KEY
  $previousSecret = $env:WEB_EXT_API_SECRET
  try {
    $env:WEB_EXT_API_KEY = $env:AMO_API_KEY
    $env:WEB_EXT_API_SECRET = $env:AMO_API_SECRET
    npx --yes web-ext@10.6.0 sign --source-dir dist --artifacts-dir web-ext-artifacts `
      --channel listed --approval-timeout 0 --amo-metadata $amoMetadata --upload-source-code $sourceZip
    $signExitCode = $LASTEXITCODE
  } finally {
    $env:WEB_EXT_API_KEY = $previousKey
    $env:WEB_EXT_API_SECRET = $previousSecret
  }
  $existing = Get-AmoVersion $version
  if (-not $existing) { throw "AMO submission failed (exit $signExitCode); no version created" }
}
if ($existing.channel -ne 'listed') { throw "Version $version is not listed" }
if ($existing.file.status -in @('rejected', 'disabled')) { throw "AMO file.status=$($existing.file.status)" }
if ($existing.file.status -ne 'public') {
  Write-Host "==> Version $version submitted to listed review (file.status=$($existing.file.status))."
  Write-Host "==> Review: $($existing.edit_url)"
  Write-Host '==> No public XPI or update feed published. Run again after AMO approval.'
  exit 0
}
Download-Xpi $existing.file.url $signedPath
if ($existing.file.hash -notmatch '^sha256:([a-f0-9]{64})$') { throw 'Missing AMO SHA-256 hash' }
if ((Get-FileHash $signedPath -Algorithm SHA256).Hash -ne $Matches[1]) { throw 'Downloaded XPI hash mismatch' }

# 5. Install the signed XPI under the stable update filename.
$signedArchive = [IO.Compression.ZipFile]::OpenRead($signedPath)
try {
  $reader = [IO.StreamReader]::new($signedArchive.GetEntry('manifest.json').Open())
  try { $signedManifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
  if ($signedManifest.version -ne $version -or $signedManifest.browser_specific_settings.gecko.id -ne $id) {
    throw 'Downloaded XPI identity/version mismatch'
  }
  if (-not $signedArchive.GetEntry('META-INF/mozilla.rsa')) { throw 'XPI has no Mozilla signature' }
} finally { $signedArchive.Dispose() }
Copy-Item $signedPath (Join-Path $root $xpiName) -Force
Write-Host "==> Signed XPI saved as $xpiName"

# 6. Append this version to the update manifest (idempotent).
$updatesPath = Join-Path $root 'updates.json'
$updates = Get-Content $updatesPath -Raw | ConvertFrom-Json -AsHashtable
$list = $updates['addons'][$id]['updates']
$exists = @($list | Where-Object { $_['version'] -eq $version }).Count -gt 0
if (-not $exists) {
  $list = @($list) + @{ version = $version; update_link = $updateLink }
  $updates['addons'][$id]['updates'] = $list
  ($updates | ConvertTo-Json -Depth 10) | Set-Content $updatesPath -Encoding utf8
  Write-Host "==> updates.json: added $version"
} else {
  Write-Host "==> updates.json: $version already present, leaving as-is"
}

# Existing installs through 0.3.3 still request the original raw GitHub URL.
# Keep that endpoint current until all of them have crossed to the new manifest.
New-Item -ItemType Directory -Path $legacyUpdateRoot -Force | Out-Null
Copy-Item (Join-Path $root $xpiName) (Join-Path $legacyUpdateRoot $xpiName) -Force
Copy-Item $updatesPath (Join-Path $legacyUpdateRoot 'updates.json') -Force
Write-Host "==> Legacy update bridge synchronized"

# 7. Optionally commit and push so the raw update links go live.
if ($Push) {
  git add -A -- $root $legacyUpdateRoot
  if ($LASTEXITCODE -ne 0) { throw 'git add failed' }
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 1) {
    git commit --only -m "Release Dox Reader $version (AMO listed)" -- $root $legacyUpdateRoot
    if ($LASTEXITCODE -ne 0) { throw 'git commit failed' }
  } elseif ($LASTEXITCODE -ne 0) { throw 'Cannot inspect staged diff' }
  git push
  if ($LASTEXITCODE -ne 0) { throw 'git push failed' }
  Write-Host '==> Pushed to remote'
}

Write-Host "==> AMO approved $version. Legacy update files are ready locally."
if (-not $Push) { Write-Host '==> Commit and push the update files to publish the legacy upgrade.' }
