# ApkRename — Android APK 应用名称修改脚本

只修改 Android APK 的**应用名称**（`android:label`），其余内容、**包名**、**签名身份**全部保持不变。

## 用法

```powershell
# 第一步（可选但推荐）：把全部工具下载到脚本同目录的 tools\ 下，之后可离线使用
.\rename-apk.ps1 -SetupTools

# 最常用：改名称，并用原 keystore 重新签名（保持同一签名身份）
.\rename-apk.ps1 -ApkPath .\app.apk -NewName "新应用名" -KeyStore release.jks -KeyAlias mykey -StorePass 123456

# 不提供 keystore：自动生成临时 debug 证书（签名身份会变，需先卸载旧版再安装）
.\rename-apk.ps1 .\app.apk "新应用名"

# 只改名称、不签名（输出 APK 无法直接安装，仅用于查看/二次处理）
.\rename-apk.ps1 .\app.apk "新应用名" -SkipSign

# 手动指定工具目录 / 指定 build-tools 版本
.\rename-apk.ps1 .\app.apk "新应用名" -ToolsDir D:\tools
.\rename-apk.ps1 .\app.apk "新应用名" -BuildToolsVersion 35.0.0

# 若执行策略限制：
powershell -ExecutionPolicy Bypass -File .\rename-apk.ps1 -ApkPath .\app.apk -NewName "新应用名" ...
```

输出默认生成在输入同目录的 `<原名>-renamed.apk`，可用 `-Output` 指定其它路径。

## 原理

1. **反编译**：`apktool d -s` 只解资源、不解码 dex（`-s`），代码原样保留；
2. **改名称**：解析 `AndroidManifest.xml` 中 `application` 与启动 Activity（MAIN/LAUNCHER）的 `android:label`：
   - 若 label 引用 `@string/xxx`（最常见），直接修改 `res/values*/strings.xml` 里对应字符串的值；
   - 若 label 是字面量，直接改写清单属性；
3. **重新打包**：`apktool b`（aapt1 失败自动改用 aapt2）；
4. **对齐**：`zipalign -f -p 4`；
5. **签名**：`apksigner sign`，使用你提供的原 keystore；
6. **校验**：对比新旧 APK 的签名证书 SHA-256、`aapt dump badging` 的包名/应用名，并对除名称相关外的所有文件做逐字节哈希对比。

## 参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `-ApkPath` | 是* | 原始 APK 路径（仅用 `-SetupTools` 下载工具时可不填） |
| `-NewName` | 是* | 新的应用名称（同上） |
| `-SetupTools` | 否 | 只把工具下载到脚本同目录 `tools\` 下并退出，不处理 APK |
| `-BuildToolsVersion` | 否 | 指定 build-tools 版本（如 `35.0.1`），不填自动选择 Google 官方仓库的最新稳定版 |
| `-Output` | 否 | 输出路径，默认 `<输入目录>\<原名>-renamed.apk` |
| `-KeyStore` | 否 | 原签名 keystore。**要保持签名身份必须提供**；不提供则用临时 debug 证书 |
| `-KeyAlias` | 否 | keystore 别名，不填自动读取第一个私钥 |
| `-StorePass` | 否 | keystore 密码，不填则交互输入（不回显） |
| `-KeyPass` | 否 | 密钥密码，默认同 StorePass |
| `-ToolsDir` | 否 | apktool.jar / zipalign / apksigner / aapt 所在目录 |
| `-SkipSign` | 否 | 只打包不签名 |
| `-KeepWork` | 否 | 保留临时工作目录（排错用） |
| `-Quiet` | 否 | 只输出关键信息 |

## 工具获取

脚本会自动把工具下载到**脚本同目录的 `tools\`** 下，之后可离线使用：

| 工具 | 下载到 | 来源 |
|---|---|---|
| `apktool.jar` | `tools\apktool.jar` | GitHub 官方最新版 |
| `apksigner` / `zipalign` / `aapt` | `tools\build-tools\` | Google 官方 build-tools 压缩包（约 50 MB） |

查找顺序：`-ToolsDir` 指定目录 → 脚本目录 `tools\` → `PATH` → Android SDK（`ANDROID_HOME` / `ANDROID_SDK_ROOT` / `%LOCALAPPDATA%\Android\Sdk`）→ 自动下载到 `tools\`。
运行 `.\rename-apk.ps1 -SetupTools` 可一次下载齐全。

## 环境要求

- Windows PowerShell 5.1+ 或 PowerShell 7（本仓库在 Windows 下测试）
- **Java 8+**（JDK，提供 `java` 与 `keytool`）——需要手动安装，无法自动下载
- 其余工具（apktool、apksigner、zipalign、aapt）均可自动下载；无网络时手动放入 `tools\` 即可

## 关于“签名不变”

- APK 内容只要有任何变化，**签名“字节”必然变化**——签名是对全部内容做的哈希，这是 Android 的安全机制，任何工具都无法绕过。
- 但只要用**原来的 keystore（同一密钥/证书）**重新签名，**签名“身份”不变**：系统仍认为它是同一开发者的应用，可以**覆盖安装**（要求 `versionCode >=` 已安装版本）。
- 如果**丢失了原 keystore**，签名身份无法保持，只能先卸载旧版再安装新版。

## 常见问题

| 现象 | 处理 |
|---|---|
| 提示找不到 apksigner / zipalign | 先运行 `.\rename-apk.ps1 -SetupTools` 自动下载，或用 `-ToolsDir` 指定目录 |
| apktool / build-tools 自动下载失败（无网络） | 手动下载 [apktool.jar](https://ibotpeaches.github.io/Apktool/) 放入 `tools\apktool.jar`；build-tools 可从 `https://dl.google.com/android/repository/build-tools_r35.0.0-windows.zip` 下载并解压到 `tools\build-tools\` |
| 安装时报“签名不一致” | 说明签名身份变了：请改用原 keystore 签名，或先卸载旧版再安装 |
| 校验提示“签名证书不一致” | 说明**原 APK 不是用你提供的 keystore 签的**（常见于下载的第三方 APK）。可用 `apksigner verify --print-certs` 查看原 APK 的证书 DN 来确认是不是自己的另一把钥匙；否则无法保持原签名身份，只能先卸载原版再安装改名版 |
| 安装时报“版本过低 / 应用未安装” | 新 APK 的 `versionCode` 需 ≥ 已安装版本。本脚本刻意不改版本号（保持“别的都不变”），如确需升级请先用 apktool 修改清单里的 `versionCode` |
| 应用被加固（360、腾讯等） | apktool 可能无法完整反编译，此方法不适用，需在源码层面修改 |
| 改完桌面图标名字没变 | 个别启动器有缓存，重启桌面/重新安装一次即可；桌面名取自启动 Activity 的 label，脚本已一并处理 |

## 验证命令（可手动复核）

```powershell
# 查看签名证书（对比新旧 APK 的 SHA-256 应一致）
apksigner verify --print-certs app-renamed.apk

# 查看包名与应用名
aapt dump badging app-renamed.apk | Select-String '^package:|^application-label:'
```

## 注意事项

- 若 `android:label` 引用的是**共享字符串资源**（如 `@string/app_name` 同时被界面其它地方使用），改名会连带影响所有引用处——这是资源引用的天然行为，无法只改桌面名而保留其它引用。
- 脚本只做名称相关改动，并在最后做逐文件哈希校验，确认 dex、lib、assets 等与原始 APK 完全一致。
- 动手前请**备份原 APK**。
