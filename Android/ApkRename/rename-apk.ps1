#requires -Version 5.1
<#
.SYNOPSIS
    修改 Android APK 的应用名称（android:label），包名、签名身份和其余内容保持不变。

.DESCRIPTION
    原理：apktool 反编译（-s，不解码 dex）-> 只修改名称相关资源/清单 -> 重新打包
    -> zipalign 对齐 -> 用原 keystore 重新签名（apksigner）。

    关于"签名不变"：
      - APK 内容只要有变化，签名"字节"必然变化（签名是对全部内容的哈希），这是无法避免的。
      - 但只要提供原来的 keystore（同一密钥/证书）重新签名，签名"身份"不变：
        系统仍认为它是同一开发者的应用，可以覆盖安装（要求 versionCode >= 已安装版本）。
      - 如果丢失了原 keystore，签名身份无法保持，只能先卸载旧版再安装新版。

    本脚本不会改动：包名、versionCode、classes.dex、lib/、assets/ 等（最后会做逐文件哈希校验）。

    工具获取（自动下载到脚本同目录的 tools\ 下，之后可离线使用）：
      - apktool.jar              -> tools\apktool.jar（从 GitHub 下载最新版）
      - apksigner / zipalign / aapt -> tools\build-tools\（从 Google 下载 build-tools 压缩包）
      查找顺序：-ToolsDir 指定目录 -> 脚本目录 tools\ -> PATH -> Android SDK（ANDROID_HOME 等）
      -> 自动下载到脚本目录 tools\。

.PARAMETER ApkPath
    原始 APK 路径（使用 -SetupTools 时可不填）。

.PARAMETER NewName
    新的应用名称（使用 -SetupTools 时可不填）。

.PARAMETER SetupTools
    仅下载全部工具到脚本同目录 tools\ 下并退出，不处理 APK。

.PARAMETER BuildToolsVersion
    指定 build-tools 版本号（如 35.0.1）；不指定时自动选择 Google 官方仓库的最新稳定版。

.PARAMETER Output
    输出 APK 路径，默认输出到输入同目录的 "<原名>-renamed.apk"。

.PARAMETER ToolsDir
    包含 apktool.jar / zipalign / apksigner / aapt 的目录（可选）。
    不指定时依次从 PATH、ANDROID_HOME / ANDROID_SDK_ROOT / %LOCALAPPDATA%\Android\Sdk 查找；
    apktool 找不到时会尝试自动从 GitHub 下载最新版。

.PARAMETER KeyStore
    原签名 keystore（.jks/.keystore）。不提供则生成临时 debug 证书（签名身份会改变）。

.PARAMETER KeyAlias
    keystore 中的密钥别名；不提供则自动读取第一个 PrivateKeyEntry。

.PARAMETER StorePass
    keystore 密码；不提供则交互式输入。

.PARAMETER KeyPass
    密钥密码；不提供则默认与 StorePass 相同。

.PARAMETER SkipSign
    只改名称并打包，不签名（输出无法直接安装到设备）。

.PARAMETER KeepWork
    保留临时工作目录（调试用）。

.PARAMETER Quiet
    只输出关键信息。

.EXAMPLE
    .\rename-apk.ps1 -ApkPath .\app.apk -NewName "新名字" `
        -KeyStore release.jks -KeyAlias mykey -StorePass 123456

.EXAMPLE
    .\rename-apk.ps1 .\app.apk "新名字" -ToolsDir C:\Android\Sdk\build-tools\35.0.0

.EXAMPLE
    .\rename-apk.ps1 -SetupTools   # 先把全部工具下载到脚本目录 tools\ 下

.EXAMPLE
    .\rename-apk.ps1 .\app.apk "新名字" -SkipSign   # 只打包不签名
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$ApkPath,

    [Parameter(Position = 1)]
    [string]$NewName,

    [switch]$SetupTools,
    [string]$BuildToolsVersion,
    [string]$Output,
    [string]$ToolsDir,
    [string]$KeyStore,
    [string]$KeyAlias,
    [string]$StorePass,
    [string]$KeyPass,
    [switch]$SkipSign,
    [switch]$KeepWork,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# 本地工具目录（脚本同目录的 tools\）
$ScriptToolsDir = Join-Path $PSScriptRoot 'tools'

# ================= 输出辅助 =================

function Write-Step([string]$Msg) { if (-not $Quiet) { Write-Host $Msg -ForegroundColor Cyan } }
function Write-Info([string]$Msg) { if (-not $Quiet) { Write-Host "    $Msg" } }
function Write-Ok([string]$Msg)   { if (-not $Quiet) { Write-Host "    $Msg" -ForegroundColor Green } }

# 读取敏感输入（不回显）
function Read-Secret([string]$Prompt) {
    $sec = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try { return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# 统一执行原生命令：合并 stderr、按退出码判成败（stderr 内容不会触发 EAP Stop）
# 注意：参数名不能用 $Args（PowerShell 保留自动变量，声明无效），这里用 $ToolArgs
function Invoke-Native {
    param([string]$File, [string[]]$ToolArgs, [string]$Desc)
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        Write-Step "[运行] $Desc"
        $out = & $File @ToolArgs 2>&1
        $code = $LASTEXITCODE
        if ($code -ne 0) {
            foreach ($o in $out) { Write-Host "    $o" }
            $errText = ($out | Out-String).Trim()
            throw "命令执行失败（退出码 $code）：$Desc$(if ($errText) { "`n$errText" })"
        }
        foreach ($o in $out) { Write-Verbose ("    " + $o) }
        return , $out
    }
    finally { $ErrorActionPreference = $old }
}

# ================= 工具定位 =================

# 在 PATH / ToolsDir / 脚本目录 tools\ / Android SDK build-tools 中查找工具
function Find-BuildTool {
    param([string]$Tool)
    # 1) 显式指定的 -ToolsDir
    if ($ToolsDir) {
        foreach ($n in @($Tool, ($Tool + '.exe'), ($Tool + '.bat'))) {
            $p = Join-Path $ToolsDir $n
            if (Test-Path $p) { return $p }
        }
    }
    # 2) 脚本目录 tools\build-tools\（-SetupTools 下载的位置）
    $local = Join-Path $ScriptToolsDir 'build-tools'
    if (Test-Path $local) {
        $hit = Get-ChildItem -Path $local -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -in @($Tool, ($Tool + '.exe'), ($Tool + '.bat')) } |
            Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    # 3) PATH
    foreach ($n in @($Tool, ($Tool + '.exe'), ($Tool + '.bat'), ($Tool + '.cmd'))) {
        $cmd = Get-Command $n -CommandType Application -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    # 4) Android SDK build-tools
    $roots = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk") |
        Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
    foreach ($r in $roots) {
        $bt = Join-Path $r 'build-tools'
        if (Test-Path $bt) {
            foreach ($v in (Get-ChildItem $bt -Directory | Sort-Object Name -Descending)) {
                foreach ($n in @($Tool, ($Tool + '.exe'), ($Tool + '.bat'))) {
                    $p = Join-Path $v.FullName $n
                    if (Test-Path $p) { return $p }
                }
            }
        }
    }
    return $null
}

# 下载最新版 apktool.jar 到脚本目录 tools\（已存在则跳过），返回 jar 路径
function Get-ApkToolLocal {
    New-Item -ItemType Directory -Force -Path $ScriptToolsDir | Out-Null
    $jar = Join-Path $ScriptToolsDir 'apktool.jar'
    if (Test-Path $jar) { return $jar }
    Write-Step '[下载] apktool.jar -> 脚本目录 tools\ ...'
    $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/iBotPeaches/Apktool/releases/latest' -Headers @{ 'User-Agent' = 'apk-rename' }
    $asset = $rel.assets | Where-Object { $_.name -match '^apktool(_[0-9.]+)?\.jar$' } | Select-Object -First 1
    if (-not $asset) { throw '无法确定 apktool 的下载地址，请手动下载 apktool.jar 放入本脚本同目录的 tools\ 文件夹' }
    Write-Step "[下载] $($asset.browser_download_url)"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $jar -Headers @{ 'User-Agent' = 'apk-rename' }
    return $jar
}

# 从 Google 官方仓库 XML 解析 build-tools 的 Windows 压缩包相对 URL。
# 不指定 -Version 时自动选最新稳定版；指定时精确匹配（如 "35.0.1"）。
function Get-BuildToolsUrl {
    param([string]$Version)
    $repoXml = (Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/repository2-1.xml' -Headers @{ 'User-Agent' = 'apk-rename' } -TimeoutSec 60).Content
    $doc = New-Object System.Xml.XmlDocument
    $doc.LoadXml($repoXml)
    $pkgs = @($doc.GetElementsByTagName('remotePackage') | Where-Object { $_.path -match '^build-tools;\d' })

    if ($Version) {
        foreach ($pkg in $pkgs) {
            if ($pkg.path -ne "build-tools;$Version") { continue }
            $win = $pkg.archives.archive | Where-Object { $_.'host-os' -eq 'windows' } | Select-Object -First 1
            if ($win) { return $win.complete.url }
        }
        throw "Google 仓库中未找到 build-tools;$Version（可先运行 -SetupTools 看自动选中的版本）"
    }

    $best = $null; $bestVer = @(0, 0, 0)
    foreach ($pkg in $pkgs) {
        $ref = $pkg.channelRef
        if ($ref -and $ref.ref -ne 'channel-0') { continue }   # 跳过 rc/beta
        $m = [regex]::Match($pkg.path, '^build-tools;(\d+)\.(\d+)(?:\.(\d+))?$')
        if (-not $m.Success) { continue }
        $ver = @([int]$m.Groups[1].Value, [int]$m.Groups[2].Value, $(if ($m.Groups[3].Success) { [int]$m.Groups[3].Value } else { 0 }))
        $win = $pkg.archives.archive | Where-Object { $_.'host-os' -eq 'windows' } | Select-Object -First 1
        if (-not $win) { continue }
        $better = $false
        for ($k = 0; $k -lt 3; $k++) {
            if ($ver[$k] -gt $bestVer[$k]) { $better = $true; break }
            if ($ver[$k] -lt $bestVer[$k]) { break }
        }
        if ($better) { $best = $win.complete.url; $bestVer = $ver }
    }
    if (-not $best) { throw '未能从 Google 官方仓库解析出 build-tools 下载地址' }
    return $best
}

# 下载 Google build-tools（含 apksigner/zipalign/aapt）到脚本目录 tools\build-tools\，返回该目录
function Get-BuildToolsLocal {
    param([string]$Version)
    $btRoot = Join-Path $ScriptToolsDir 'build-tools'
    New-Item -ItemType Directory -Force -Path $btRoot | Out-Null

    # 已有完整工具则直接复用
    $need = @('apksigner', 'zipalign', 'aapt')
    $missing = @()
    foreach ($t in $need) {
        $hit = Get-ChildItem -Path $btRoot -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match "^$([regex]::Escape($t))(\.exe|\.bat)?$" } |
            Select-Object -First 1
        if (-not $hit) { $missing += $t }
    }
    if ($missing.Count -eq 0) { return $btRoot }

    Write-Step '[下载] 正在从 Google 官方仓库解析 build-tools 下载地址 ...'
    $relUrl = Get-BuildToolsUrl -Version $Version
    $url = 'https://dl.google.com/android/repository/' + $relUrl
    $zip = Join-Path $env:TEMP ('build-tools_' + [guid]::NewGuid().ToString('N') + '.zip')
    Write-Step "[下载] $url"
    try {
        Invoke-WebRequest -Uri $url -OutFile $zip -Headers @{ 'User-Agent' = 'apk-rename' }
        Write-Step "[解压] $zip -> $btRoot"
        Expand-Archive -Path $zip -DestinationPath $btRoot -Force
        $ok = Get-ChildItem -Path $btRoot -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^apksigner(\.exe|\.bat)?$' } | Select-Object -First 1
        if (-not $ok) { throw '解压后未找到 apksigner，请检查下载的 build-tools 压缩包' }
        Write-Ok "build-tools 已就绪：$btRoot"
        return $btRoot
    }
    finally { Remove-Item -Force $zip -ErrorAction SilentlyContinue }
}

# 返回 @{ Type='jar'|'cmd'; Path=... }
function Resolve-ApkTool {
    if ($ToolsDir) {
        $jar = Join-Path $ToolsDir 'apktool.jar'
        if (Test-Path $jar) { return @{ Type = 'jar'; Path = $jar } }
    }
    $localJar = Join-Path $ScriptToolsDir 'apktool.jar'
    if (Test-Path $localJar) { return @{ Type = 'jar'; Path = $localJar } }
    foreach ($n in @('apktool', 'apktool.bat', 'apktool.cmd')) {
        $cmd = Get-Command $n -CommandType Application -ErrorAction SilentlyContinue
        if ($cmd) { return @{ Type = 'cmd'; Path = $cmd.Source } }
    }
    $jar = Get-ApkToolLocal
    return @{ Type = 'jar'; Path = $jar }
}

# 查找可用的 java.exe：JAVA_HOME -> 常见安装目录 -> PATH
function Resolve-Java {
    $cands = @()
    if ($env:JAVA_HOME) { $cands += (Join-Path $env:JAVA_HOME 'bin\java.exe') }
    $cands += 'C:\Program Files\OpenJDK\bin\java.exe'
    $cands += 'C:\Program Files\Java\*\bin\java.exe'
    $cands += 'C:\Program Files\Eclipse Adoptium\*\bin\java.exe'
    $cands += 'C:\Program Files\Microsoft\*\bin\java.exe'
    $cands += 'C:\Program Files\Zulu\*\bin\java.exe'
    $cands += 'C:\Program Files\Android\Android Studio\jbr\bin\java.exe'
    $cands += 'C:\Program Files\Android\Android Studio1\jbr\bin\java.exe'
    $cands += "$env:LOCALAPPDATA\Programs\*\bin\java.exe"
    foreach ($c in $cands) {
        $hit = Get-Item $c -ErrorAction SilentlyContinue
        if ($hit) { return $hit.FullName }
    }
    $cmd = Get-Command java -CommandType Application -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Invoke-ApkTool {
    param([hashtable]$Tool, [string[]]$ToolArgs, [string]$Desc)
    if ($Tool.Type -eq 'jar') {
        $java = Resolve-Java
        if (-not $java) { throw '未找到 java。请安装 JDK 8+（如 OpenJDK 11/17），或设置 JAVA_HOME 环境变量后重试。' }
        return Invoke-Native $java (@('-jar', $Tool.Path) + $ToolArgs) $Desc
    }
    return Invoke-Native $Tool.Path $ToolArgs $Desc
}

# ================= 名称修改逻辑 =================

# 在 res/values*/ 下所有 xml 中定位 <string name="...">，找到则返回其值
function Get-StringValue {
    param([string]$ResDir, [string]$ResName)
    $files = Get-ChildItem -Path (Join-Path $ResDir 'res') -Recurse -Filter '*.xml' -ErrorAction SilentlyContinue |
        Where-Object { $_.DirectoryName -match '(^|[\\/])values' } |
        Sort-Object @{ Expression = { $_.DirectoryName -notmatch '(^|[\\/])values$' } }
    foreach ($f in $files) {
        $m = [regex]::Match([System.IO.File]::ReadAllText($f.FullName),
            '<string\b(?=[^>]*\bname="' + [regex]::Escape($ResName) + '")[^>]*>(.*?)</string>',
            [System.Text.RegularExpressions.RegexOptions]::Singleline)
        if ($m.Success) { return [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value) }
    }
    return $null
}

# 把 <string name="ResName"> 的值替换为新名称（所有语言 values* 目录都改）
function Update-StringResource {
    param([string]$ResDir, [string]$ResName, [string]$NewValue)
    $script:__EscapedName = [System.Security.SecurityElement]::Escape($NewValue)
    $pattern = '<string\b(?=[^>]*\bname="' + [regex]::Escape($ResName) + '")([^>]*)>(.*?)</string>'
    $rx = [regex]::new($pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $changed = @()
    $files = Get-ChildItem -Path (Join-Path $ResDir 'res') -Recurse -Filter '*.xml' -ErrorAction SilentlyContinue |
        Where-Object { $_.DirectoryName -match '(^|[\\/])values' }
    foreach ($f in $files) {
        $content = [System.IO.File]::ReadAllText($f.FullName)
        $new = $rx.Replace($content, { param($m) '<string' + $m.Groups[1].Value + '>' + $script:__EscapedName + '</string>' })
        if ($new -ne $content) {
            [System.IO.File]::WriteAllText($f.FullName, $new, (New-Object System.Text.UTF8Encoding($false)))
            $changed += $f.FullName
        }
    }
    if ($changed.Count -eq 0) { throw "未找到字符串资源 '@string/$ResName'，请确认该资源确实存在" }
    foreach ($c in $changed) { Write-Step "[修改] $c" }
}

# 根据 AndroidManifest.xml 修改应用名（application 与启动 Activity 的 label）
function Update-ManifestLabels {
    param([string]$ManifestPath, [string]$NewName, [string]$ResDir)

    $xml = New-Object System.Xml.XmlDocument
    $xml.PreserveWhitespace = $true
    $xml.Load($ManifestPath)
    $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
    $nsUri = 'http://schemas.android.com/apk/res/android'
    $ns.AddNamespace('a', $nsUri)

    $app = $xml.SelectSingleNode('/manifest/application', $ns)
    if (-not $app) { throw 'AndroidManifest.xml 中未找到 <application> 节点' }

    $oldLabel = $app.GetAttribute('label', $nsUri).Trim()
    $script:OldLabel = $oldLabel
    Write-Info "原应用名: $oldLabel"

    # 桌面显示名实际取自启动 Activity（MAIN + LAUNCHER）的 label，若存在需一并处理
    $launcher = $xml.SelectSingleNode(
        "/manifest/application/activity[intent-filter/action[@a:name='android.intent.action.MAIN'] and intent-filter/category[@a:name='android.intent.category.LAUNCHER']]",
        $ns)

    $needSave = $false

    if ($oldLabel -like '@string/*') {
        # 最常见情况：label 引用 @string/app_name -> 直接改字符串资源（引用处全部生效）
        $resName = $oldLabel.Substring(8)
        Update-StringResource -ResDir $ResDir -ResName $resName -NewValue $NewName
        Write-Ok "新应用名: $(Get-StringValue -ResDir $ResDir -ResName $resName)"
        # 启动 Activity 若引用了其它字符串或字面量，也统一为新名，保证桌面显示一致
        if ($launcher) {
            $lLabel = $launcher.GetAttribute('label', $nsUri)
            if ($lLabel -and $lLabel -ne $oldLabel) {
                if ($lLabel -like '@string/*') {
                    Update-StringResource -ResDir $ResDir -ResName $lLabel.Substring(8) -NewValue $NewName
                }
                else {
                    $null = $launcher.SetAttribute('label', $nsUri, $NewName)
                    $needSave = $true
                }
            }
        }
    }
    elseif ($oldLabel) {
        # application 的 label 是字面量：直接改属性；启动 Activity 的 label 也改成字面量
        $null = $app.SetAttribute('label', $nsUri, $NewName)
        $needSave = $true
        Write-Ok "新应用名: $NewName"
        if ($launcher -and $launcher.HasAttribute('label', $nsUri) -and
            $launcher.GetAttribute('label', $nsUri) -ne $NewName) {
            $null = $launcher.SetAttribute('label', $nsUri, $NewName)
        }
    }
    elseif ($launcher) {
        # application 没有 label，只能改启动 Activity 的 label
        $lLabel = $launcher.GetAttribute('label', $nsUri)
        if (-not $lLabel) { throw 'application 与启动 Activity 均未设置 android:label，无法修改应用名' }
        if ($lLabel -like '@string/*') {
            Update-StringResource -ResDir $ResDir -ResName $lLabel.Substring(8) -NewValue $NewName
            Write-Ok "新应用名: $NewName"
        }
        else {
            $null = $launcher.SetAttribute('label', $nsUri, $NewName)
            $needSave = $true
            Write-Ok "新应用名: $NewName"
        }
    }
    else {
        throw '未找到 android:label（application 与启动 Activity 均无），无法修改应用名'
    }

    if ($needSave) {
        $settings = New-Object System.Xml.XmlWriterSettings
        $settings.Encoding = New-Object System.Text.UTF8Encoding($false)
        $settings.Indent = $false
        $writer = [System.Xml.XmlWriter]::Create($ManifestPath, $settings)
        try { $xml.Save($writer) } finally { $writer.Dispose() }
        Write-Step "[修改] $ManifestPath"
    }
}

# ================= 校验辅助 =================

function Get-ZipEntryHashes {
    param([string]$ZipPath)
    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
    $zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    $map = @{}
    try {
        foreach ($e in $zip.Entries) {
            $s = $e.Open()
            try {
                $sha = [System.Security.Cryptography.SHA256]::Create()
                $h = $sha.ComputeHash($s)
                $map[$e.FullName] = ([System.BitConverter]::ToString($h)) -replace '-', ''
            }
            finally { $s.Dispose() }
        }
    }
    finally { $zip.Dispose() }
    return $map
}

# 对比两个 APK，返回内容不一致的文件条目（忽略名称相关与签名相关条目）
function Compare-ZipContent {
    param([string]$A, [string]$B)
    $ignored = '^res/|^resources\.arsc$|^AndroidManifest\.xml$|^META-INF/|^original/'
    $ma = Get-ZipEntryHashes $A
    $mb = Get-ZipEntryHashes $B
    $names = @($ma.Keys + $mb.Keys | Select-Object -Unique)
    $diffs = @()
    foreach ($k in $names) {
        if ($k -match $ignored) { continue }
        if (-not $ma.ContainsKey($k) -or -not $mb.ContainsKey($k) -or $ma[$k] -ne $mb[$k]) { $diffs += $k }
    }
    return , $diffs
}

# ================= 主流程 =================

if ($SetupTools) {
    Write-Step "== 下载工具到脚本目录 =="
    Write-Info "目标目录: $ScriptToolsDir"
    Write-Ok ("apktool    : " + (Get-ApkToolLocal))
    Write-Ok ("build-tools: " + (Get-BuildToolsLocal -Version $BuildToolsVersion))
    $apksigner = Find-BuildTool 'apksigner'
    $zipalign = Find-BuildTool 'zipalign'
    $aapt = Find-BuildTool 'aapt'
    if ($apksigner) { Write-Ok "apksigner  : $apksigner" }
    if ($zipalign)  { Write-Ok "zipalign   : $zipalign" }
    if ($aapt)      { Write-Ok "aapt       : $aapt" }
    Write-Host ''
    Write-Host '工具准备完成，之后可直接运行：' -ForegroundColor Green
    Write-Host ("    .\$(Split-Path -Leaf $PSCommandPath) <apk路径> <新名称> ...")
    exit 0
}

if (-not $ApkPath) { throw '必须提供 -ApkPath（原始 APK 路径）；仅想下载工具时请用 -SetupTools' }
if ([string]::IsNullOrWhiteSpace($NewName)) { throw '必须提供 -NewName（新的应用名称）' }
if (-not (Test-Path $ApkPath -PathType Leaf)) { throw "APK 文件不存在: $ApkPath" }

$ApkPath = (Resolve-Path $ApkPath).Path
if (-not $Output) {
    $Output = Join-Path (Split-Path $ApkPath -Parent) `
        ([System.IO.Path]::GetFileNameWithoutExtension($ApkPath) + '-renamed.apk')
}
$Output = [System.IO.Path]::GetFullPath($Output)

$workDir = Join-Path ([System.IO.Path]::GetTempPath()) ('apkrename_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $workDir | Out-Null

$unsignedApk = Join-Path $workDir 'unsigned.apk'
$alignedApk  = Join-Path $workDir 'aligned.apk'
$signedApk   = Join-Path $workDir 'signed.apk'

$packageName = '(未知)'
$certMatches = '(未签名)'
$javaHomeSet = $false

try {
    Write-Step "== 1/6 工具准备 =="
    $JavaPath = Resolve-Java
    if (-not $JavaPath) { throw '未找到 java。请安装 JDK 8+（如 OpenJDK 11/17），或设置 JAVA_HOME 环境变量后重试。' }
    $JavaHome = Split-Path (Split-Path $JavaPath -Parent)   # java.exe 上一级目录的上级 = JDK 根目录
    # 让 apksigner.bat 等也使用同一个 JDK（不依赖 PATH）
    $oldJavaHome = $env:JAVA_HOME
    $env:JAVA_HOME = $JavaHome
    $javaHomeSet = $true
    Write-Info "java: $JavaPath"
    $apkTool = Resolve-ApkTool
    Write-Info "apktool: $($apkTool.Path)"
    Invoke-ApkTool $apkTool @('--version') 'apktool 自检'

    Write-Step "== 2/6 反编译（apktool d -s，不解码 dex）=="
    Invoke-ApkTool $apkTool @('d', '-f', '-s', '-o', $workDir, $ApkPath) 'apktool d 反编译 APK'
    $manifest = Join-Path $workDir 'AndroidManifest.xml'
    if (-not (Test-Path $manifest)) { throw '反编译后未找到 AndroidManifest.xml，可能 APK 被加固或损坏' }

    $manifestText0 = [System.IO.File]::ReadAllText($manifest)
    $pkgM = [regex]::Match($manifestText0, '<manifest\b[^>]*\bpackage="([^"]+)"')
    if (-not $pkgM.Success) { $pkgM = [regex]::Match($manifestText0, "<manifest\b[^>]*\bpackage='([^']+)'") }
    $packageName = if ($pkgM.Success) { $pkgM.Groups[1].Value } else { '(未能解析)' }
    Write-Info "包名: $packageName（保持不变）"

    Write-Step "== 3/6 修改应用名称 =="
    Update-ManifestLabels -ManifestPath $manifest -NewName $NewName -ResDir $workDir

    Write-Step "== 4/6 重新打包 =="
    $origDir = Join-Path $workDir 'original'
    if (Test-Path $origDir) { Remove-Item -Recurse -Force $origDir }
    try {
        Invoke-ApkTool $apkTool @('b', $workDir, '-o', $unsignedApk) 'apktool b 重新打包'
    }
    catch {
        Write-Warning 'aapt1 打包失败，改用 --use-aapt2 重试 ...'
        Invoke-ApkTool $apkTool @('b', '--use-aapt2', $workDir, '-o', $unsignedApk) 'apktool b (aapt2) 重新打包'
    }
    if (-not (Test-Path $unsignedApk)) { throw '重新打包失败：未生成 APK' }

    if ($SkipSign) {
        Copy-Item $unsignedApk $Output -Force
        Write-Warning '已跳过签名：输出的是未签名 APK，无法直接安装到设备。'
        $certMatches = '(已跳过签名)'
    }
    else {
        Write-Step "== 5/6 对齐 + 签名 =="
        $apksigner = Find-BuildTool 'apksigner'
        if (-not $apksigner) {
            Write-Step '[下载] 未找到 apksigner，正在下载 build-tools 到脚本目录 tools\build-tools\ ...'
            Get-BuildToolsLocal -Version $BuildToolsVersion | Out-Null
            $apksigner = Find-BuildTool 'apksigner'
            if (-not $apksigner) { throw '下载后仍未找到 apksigner，请手动安装 Android SDK build-tools，或用 -ToolsDir 指定目录。' }
        }
        # keytool 优先取与 java 同目录的，其次 PATH
        $keytoolPath = Join-Path (Split-Path $JavaPath -Parent) 'keytool.exe'
        if (-not (Test-Path $keytoolPath)) {
            $ktCmd = Get-Command keytool -CommandType Application -ErrorAction SilentlyContinue
            $keytoolPath = if ($ktCmd) { $ktCmd.Source } else { $null }
        }
        if (-not $keytoolPath) { throw '未找到 keytool（JDK 自带），请安装 JDK' }

        if (-not $KeyStore) {
            Write-Warning '未提供 -KeyStore：将生成临时 debug 证书。注意：签名身份会改变，无法覆盖安装原应用，需先卸载旧版。'
            $KeyStore = Join-Path $workDir 'debug.keystore'
            $KeyAlias = 'androiddebugkey'
            $StorePass = 'android'
            $KeyPass = 'android'
            Invoke-Native $keytoolPath @('-genkeypair', '-keystore', $KeyStore, '-alias', $KeyAlias,
                '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
                '-storepass', $StorePass, '-keypass', $KeyPass,
                '-dname', 'CN=Android Debug,O=Android,C=US') 'keytool 生成调试证书'
        }
        if (-not $StorePass) { $StorePass = Read-Secret '请输入 keystore 密码 (StorePass)' }
        if (-not $KeyPass)   { $KeyPass = $StorePass }
        if (-not $KeyAlias) {
            $listOut = Invoke-Native $keytoolPath @('-list', '-keystore', $KeyStore, '-storepass', $StorePass) 'keytool 列出别名'
            $line = $listOut | Where-Object { $_ -match 'PrivateKeyEntry' } | Select-Object -First 1
            if (-not $line) { throw '无法从 keystore 中解析密钥别名，请用 -KeyAlias 显式指定' }
            $KeyAlias = (($line -split ',')[0]).Trim()
            Write-Info "自动选择密钥别名: $KeyAlias"
        }
        Write-Info "签名密钥: $KeyStore (alias=$KeyAlias)"

        $zipalign = Find-BuildTool 'zipalign'
        $signInput = $unsignedApk
        if ($zipalign) {
            try {
                Invoke-Native $zipalign @('-f', '-p', '4', $unsignedApk, $alignedApk) 'zipalign 对齐'
            }
            catch {
                Write-Warning 'zipalign -p 失败，改用普通 4 字节对齐 ...'
                Invoke-Native $zipalign @('-f', '4', $unsignedApk, $alignedApk) 'zipalign 对齐'
            }
            $signInput = $alignedApk
        }
        else {
            Write-Warning '未找到 zipalign，跳过对齐（可正常安装，仅性能略受影响）。'
        }

        # 通过环境变量传密码，避免出现在进程命令行中
        $env:APK_RENAME_KS_PASS = $StorePass
        $env:APK_RENAME_KEY_PASS = $KeyPass
        try {
            Invoke-Native $apksigner @('sign', '--ks', $KeyStore, '--ks-key-alias', $KeyAlias,
                '--ks-pass', 'env:APK_RENAME_KS_PASS', '--key-pass', 'env:APK_RENAME_KEY_PASS',
                '--out', $signedApk, $signInput) 'apksigner 签名'
        }
        finally {
            Remove-Item Env:\APK_RENAME_KS_PASS -ErrorAction SilentlyContinue
            Remove-Item Env:\APK_RENAME_KEY_PASS -ErrorAction SilentlyContinue
        }
        Copy-Item $signedApk $Output -Force
    }

    Write-Step "== 6/6 校验 =="
    if (-not $SkipSign) {
        try {
            $cOld = Invoke-Native $apksigner @('verify', '--print-certs', $ApkPath) 'apksigner 校验原 APK 证书'
            $cNew = Invoke-Native $apksigner @('verify', '--print-certs', $Output) 'apksigner 校验新 APK 证书'
            $shaOld = ($cOld | Select-String 'SHA-256 digest').Line
            $shaNew = ($cNew | Select-String 'SHA-256 digest').Line
            Write-Info "原 APK 证书: $shaOld"
            Write-Info "新 APK 证书: $shaNew"
            if ($shaOld -and $shaNew -and ($shaOld -eq $shaNew)) {
                $certMatches = '一致（同一签名身份）'
                Write-Ok '签名证书一致 ✓'
            }
            else {
                $certMatches = '不一致（使用了不同密钥）'
                Write-Warning '签名证书不一致：新旧 APK 使用了不同的签名密钥。若目标是保持同一签名身份，请提供原 keystore。'
            }
        }
        catch {
            $certMatches = '对比失败'
            Write-Warning "证书对比失败：$_"
        }
    }

    $aapt = Find-BuildTool 'aapt'
    if ($aapt) {
        try {
            Write-Info '--- aapt dump badging 对比 ---'
            $bOld = Invoke-Native $aapt @('dump', 'badging', $ApkPath) 'aapt badging (原)'
            $bNew = Invoke-Native $aapt @('dump', 'badging', $Output) 'aapt badging (新)'
            ($bOld | Select-String '^package:|^application-label:') | ForEach-Object { Write-Info ('原: ' + $_.Line) }
            ($bNew | Select-String '^package:|^application-label:') | ForEach-Object { Write-Info ('新: ' + $_.Line) }
        }
        catch { Write-Warning "aapt badging 对比失败：$_" }
    }
    else { Write-Info '（未找到 aapt，跳过 badging 对比）' }

    $diffs = Compare-ZipContent -A $ApkPath -B $Output
    if ($diffs.Count -eq 0) {
        Write-Ok '校验通过：除名称相关（resources.arsc / res / 签名文件）外，其余文件逐字节一致 ✓'
    }
    else {
        Write-Warning '注意：以下文件与原 APK 不一致（非名称相关，请人工确认）：'
        foreach ($d in $diffs) { Write-Host "      - $d" }
    }
}
finally {
    if (-not $KeepWork -and (Test-Path $workDir)) {
        Remove-Item -Recurse -Force $workDir
        Write-Info '[清理] 已删除临时目录'
    }
    if ($javaHomeSet) { $env:JAVA_HOME = $oldJavaHome }
}

Write-Host ''
Write-Host '===== 完成 =====' -ForegroundColor Green
Write-Host "输出 APK : $Output"
Write-Host "包名     : $packageName（未变）"
Write-Host "应用名   : $script:OldLabel -> $NewName"
Write-Host "签名身份 : $certMatches"
Write-Host ''
Write-Host '提示：若要覆盖安装到已装有旧版应用的设备，需使用原 keystore 签名且 versionCode 不低于已装版本；'
Write-Host '      否则请先卸载旧版再安装。'
