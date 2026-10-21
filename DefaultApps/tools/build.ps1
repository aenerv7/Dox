param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $GradleArgs
)

$ErrorActionPreference = 'Stop'

$tools = $PSScriptRoot
$project = Split-Path -Parent $tools

$env:JAVA_HOME = Join-Path $tools 'jdk17'
$env:ANDROID_HOME = Join-Path $tools 'sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = Join-Path $tools 'gradle-home'
$env:ANDROID_USER_HOME = Join-Path $tools 'android-home'
$env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH

$debugKeystore = Join-Path $tools 'debug.keystore'
if (-not (Test-Path $debugKeystore)) {
    & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -v `
        -keystore $debugKeystore -storepass android -keypass android `
        -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 `
        -dname "CN=Android Debug,O=Android,C=US"
}

if (-not $GradleArgs -or $GradleArgs.Count -eq 0) {
    $GradleArgs = @('assembleDebug')
}

& (Join-Path $tools 'gradle-8.9\bin\gradle.bat') -p $project --no-daemon --console=plain @GradleArgs
exit $LASTEXITCODE

