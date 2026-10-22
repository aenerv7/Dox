# SizerSwift 首次打开说明

这份说明给**拿到别人编译好的 `SizerSwift.app`** 的人看。自己从源码构建的话不需要放行步骤，直接 `./build.sh --install` 即可。

## 系统要求

- macOS 13 Ventura 或更新版本。
- Apple Silicon（当前发布包是 arm64 构建）。Intel Mac 需要自行在源码目录构建，见文末。

## 安装

1. 关闭正在运行的旧版 SizerSwift（菜单栏图标 → 退出 SizerSwift）。
2. 把 `SizerSwift.app` 拖进 `/Applications`。不要放在「下载」里直接双击——开机自启动项要求 App 位于「应用程序」目录。
3. 如果装过更早的版本（包名是 `com.dox.SizerSwift`），先删掉旧 App，并到「系统设置 → 隐私与安全性 → 辅助功能」里移除同名旧条目。

## 首次打开：系统会拦一次

这个 App 用**自签名证书**签名，没有购买 Apple Developer ID，也没有做公证，所以首次打开会被 Gatekeeper 拦下。这是预期行为，不代表文件损坏。

### 情况一：提示「Apple 无法验证 “SizerSwift” 是否包含恶意软件」

1. 打开 **系统设置 → 隐私与安全性**，下滚到「安全性」一栏，会看到关于 SizerSwift 的提示。
2. 点 **仍要打开**，输入管理员密码。
3. 弹窗里再点 **打开**。

之后双击就能正常启动，不会再询问。

### 情况二：提示「“SizerSwift”已损坏，无法打开。你应该将它移到废纸篓」

下载工具（浏览器、网盘客户端、AirDrop）会给文件打上隔离属性 `com.apple.quarantine`；自签名不在 Apple 信任链上，系统就把「无法验证」报成「已损坏」。确认文件来源可信后，执行：

```bash
xattr -dr com.apple.quarantine /Applications/SizerSwift.app
```

然后重新双击。

> 不要用 `sudo spctl --master-disable` 关闭 Gatekeeper 来解决，那会影响整台机器的所有应用。

## 必须授权辅助功能

SizerSwift 通过辅助功能 API 操作其它应用的窗口。没有授权时菜单能打开，但所有窗口动作都不会生效。

1. 点菜单栏图标，最上面一项是 **打开辅助功能权限…**（只在未授权时出现）。
2. 在「系统设置 → 隐私与安全性 → 辅助功能」里勾选 **SizerSwift**。
   - 列表里如果有旧的、带警告图标的 SizerSwift 条目，先用 `−` 移除，再用 `+` 重新添加当前这个 App。
3. 重新打开菜单，授权立即生效，不需要重启 App。

仍不生效时：退出 SizerSwift 再启动一次；还不行就在「辅助功能」里移除该条目后重新添加。

## 开机自启动

先把 App 放进 `/Applications` 并运行过一次，再在菜单里勾选 **开机自启动**。App 不在应用程序目录时注册会失败。

## 升级

1. 退出旧版（菜单 → 退出 SizerSwift）。
2. 用新版本覆盖 `/Applications/SizerSwift.app`。
3. 重新打开。

新旧版本使用同一张签名证书和同一个包名（`magi.aenerv7.sizerswift`），所以**辅助功能授权和开机自启动都会保留**，不需要重新授权。

反过来，如果签名证书换了（比如提供者在另一台机器上重新生成）或包名变了，系统会把它当成另一个 App，需要重新授权一次。覆盖后若再遇到「已损坏」，仍是隔离属性问题，按上面的 `xattr` 命令处理。

## 配置文件

- 路径：`~/Library/Application Support/SizerSwift/SizerSwift.ini`
- 菜单里的 **打开配置文件所在目录** 会直接在 Finder 中定位这个文件；文件被删掉时会按默认内容重新生成。
- 改完保存即可，下次打开菜单生效，不需要重启 App。

## 卸载

1. 在菜单里取消勾选 **开机自启动**，然后退出 SizerSwift。
2. 删除 `/Applications/SizerSwift.app`。
3. 想把配置一起清掉：`rm -rf ~/Library/Application\ Support/SizerSwift`。
4. 可选：在「系统设置 → 隐私与安全性 → 辅助功能」里移除 SizerSwift 条目。

## 安全提醒

- 自签名包无法向系统证明来源，只从你信任的人或仓库获取；来源核对不了就不要放行。
- App 不联网、不上报数据，只读写本机配置文件，并通过辅助功能调整窗口位置与大小。
- 想在 Intel Mac 上运行或自行核实代码：获取源码后执行

  ```bash
  cd SizerSwift
  ./make-signing-cert.sh   # 创建本机自签名证书
  ./build.sh --install     # 构建、签名并安装
  ```
