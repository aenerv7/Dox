# 默认应用（Defaults）

Material 3 的默认应用管理器。普通应用没有修改默认项的权限，本应用通过
[Shizuku](https://shizuku.rikka.app/) 以 shell（UID 2000）身份调用系统接口：

- `PackageManager.addUniquePreferredActivity`：设置 APK、邮件、地图、音乐、视频、PDF、日历、相机等 Intent 的默认处理者。
- `RoleManager.addRoleHolderAsUser` / `clearRoleHoldersAsUser`：设置浏览器、电话、短信、主屏幕、数字助理、笔记等系统角色。

## 要求

- Android 10+。
- Shizuku 13+（ADB 无线调试或 root 启动均可）。Sui 也可。
- 首次打开时授予本应用 Shizuku 权限。

## 构建

二进制工具链在 `tools/` 下，已被 `.gitignore` 排除：

- `jdk17/`、`gradle-8.9/`、`sdk/`
- `gradle-home/`、`android-home/`：Gradle / Android 缓存

`tools/build.ps1` 随仓库保留。`tools/debug.keystore` 首次构建时本地生成，不提交。

```powershell
.\tools\build.ps1
```

产物：`app/build/outputs/apk/debug/app-debug.apk`。

脚本会设置 `JAVA_HOME`、`ANDROID_HOME`、`GRADLE_USER_HOME`、`ANDROID_USER_HOME`，
不写用户目录。首次构建需要联网；缓存建立后可以：

```powershell
.\tools\build.ps1 clean assembleDebug --offline
```

`tools/debug.keystore` 保证本机 debug 签名稳定；它不进入仓库。

## 用自己的 JKS 签名

1. 把 JKS 放到 `keystore/release.jks`（或任意路径）。
2. 复制 `keystore.properties.example` 为 `keystore.properties`，填写：

```properties
storeFile=keystore/release.jks
storePassword=你的密码
keyAlias=你的别名
keyPassword=你的密码
```

`storeFile` 相对 `DefaultApps/` 解析；路径里的 `\` 要写成 `/` 或 `\\`。

3. 构建：

```powershell
.\tools\build.ps1 assembleRelease
```

产物：`app/build/outputs/apk/release/app-release.apk`。

校验：

```powershell
.\tools\sdk\build-tools\35.0.0\apksigner.bat verify --print-certs .\app\build\outputs\apk\release\app-release.apk
```

没有 `keystore.properties` 时，release 产出 `app-release-unsigned.apk`，构建不会失败。

`keystore.properties`、`keystore/`、`*.jks`、`*.keystore` 已 gitignore；不要提交 JKS。构建产物 `*.apk` 也不提交。
release 与 debug 签名不同，安装前先卸载旧 APK（否则 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`）。

没有现成 JKS 时：

```powershell
.\tools\jdk17\bin\keytool.exe -genkeypair -v -keystore .\keystore\release.jks `
    -alias defaultapps -keyalg RSA -keysize 4096 -validity 10000
```

不想改 Gradle 也可以手动签 `app-release-unsigned.apk`：

```powershell
$bt = ".\tools\sdk\build-tools\35.0.0"
& "$bt\zipalign.exe" -p -f 4 .\app\build\outputs\apk\release\app-release-unsigned.apk .\app-release-aligned.apk
& "$bt\apksigner.bat" sign --ks .\keystore\release.jks --ks-key-alias defaultapps `
    --out .\DefaultApps-release.apk .\app-release-aligned.apk
& "$bt\apksigner.bat" verify --print-certs .\DefaultApps-release.apk
```

## 限制

- 系统角色会校验应用资格；设置失败通常表示该应用不满足角色要求。
- “安装包”只改变点击 APK 时接管的应用。真正写包仍由系统 `PackageInstaller`
  完成，第三方安装器绕不过“安装未知应用”授权和系统确认。
- “清除默认”会清除所选包的全部 preferred activity，可能影响该包的其他默认项。

