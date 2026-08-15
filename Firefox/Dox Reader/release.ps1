# release.ps1 - One-command release for Dox Reader.
#
# Builds the extension, creates the source archive, submits both to AMO
# (unlisted channel = automated validation + signing, no human review),
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
#   4. The script is idempotent: if the version already exists on AMO (e.g. a
#      previous run was interrupted after submitting), it skips submission and
#      downloads the signed XPI directly. If `web-ext sign` itself fails after
#      creating the version (transient network error), it recovers the same way.
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
$updateLink = "https://raw.githubusercontent.com/aenerv7/Dox/main/Firefox/Dox%20Reader/$xpiName"
$sourceZip = Join-Path $root "web-ext-artifacts\dox_reader-$version-source.zip"

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

function Wait-ForSigning([string]$Version) {
  $deadline = (Get-Date).AddMinutes(10)
  $versionInfo = $null
  do {
    Start-Sleep -Seconds 20
    $versionInfo = Get-AmoVersion $Version
    if (-not $versionInfo) { throw "AMO 上找不到版本 $Version" }
    $status = $versionInfo.file.status
    if ($status -eq 'rejected' -or $status -eq 'disabled') {
      throw "版本 $Version 被拒绝或禁用（file.status=$status）"
    }
    Write-Host ("==>    file.status = {0}" -f $status)
  } while ($status -ne 'public' -and (Get-Date) -lt $deadline)
  if ($versionInfo.file.status -ne 'public') { throw "版本 $Version 在 10 分钟内未完成签名" }
  return $versionInfo
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
  $rel -ne '.env.release'
}
foreach ($f in $files) {
  $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
  $entry = $archive.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
  $es = $entry.Open(); $fs = [System.IO.File]::OpenRead($f.FullName)
  $fs.CopyTo($es); $fs.Dispose(); $es.Dispose()
}
$archive.Dispose()
Write-Host "==> Source archive: $sourceZip ($($files.Count) files)"

# 4. Submit to AMO and wait for the automated signing to finish.
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
if ($existing) {
  Write-Host "==> Version $version already exists on AMO (file.status=$($existing.file.status)); downloading instead of re-submitting."
  if ($existing.file.status -ne 'public') { $existing = Wait-ForSigning $version }
  Download-Xpi $existing.file.url $signedPath
} else {
  Get-ChildItem (Join-Path $root 'web-ext-artifacts') -Filter '*.xpi' -ErrorAction SilentlyContinue | Remove-Item -Force
  Write-Host '==> Submitting to AMO (unlisted) and waiting for signing...'
  npx --yes web-ext@10.6.0 sign --source-dir dist --artifacts-dir web-ext-artifacts `
    --api-key $env:AMO_API_KEY --api-secret $env:AMO_API_SECRET `
    --channel unlisted --upload-source-code $sourceZip
  if ($LASTEXITCODE -ne 0) {
    # The submission may have succeeded while the polling failed (transient
    # network error). Check AMO and recover instead of failing outright.
    Write-Host '==> web-ext sign 失败；检查版本是否已在 AMO 创建并尝试恢复...'
    $recovered = Get-AmoVersion $version
    if (-not $recovered) { throw 'web-ext sign failed and no version was created on AMO' }
    if ($recovered.file.status -ne 'public') { $recovered = Wait-ForSigning $version }
    Download-Xpi $recovered.file.url $signedPath
  }
}

# 5. Install the signed XPI under the stable update filename.
$signed = Get-ChildItem (Join-Path $root 'web-ext-artifacts') -Filter '*.xpi' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $signed) { throw 'Signed XPI not found in web-ext-artifacts' }
Copy-Item $signed.FullName (Join-Path $root $xpiName) -Force
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

# 7. Optionally commit and push so the raw update links go live.
if ($Push) {
  git add -A -- $root
  git commit -m "Release $version"
  git push
  if ($LASTEXITCODE -ne 0) { throw 'git push failed' }
  Write-Host '==> Pushed to remote'
}

Write-Host "==> Done. Version $version is live for existing 0.2.0+ installs."
