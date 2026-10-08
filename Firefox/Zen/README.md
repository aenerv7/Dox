# Firefox/Zen

Windows 版 Zen Browser 的两个本机脚本。适用版本：**Zen 1.23.1b / Gecko 157.0.1**，Build ID `20261006042626`。
安装目录和用户配置目录均自动识别，不需要修改脚本中的用户名或随机配置文件名。

| 脚本 | 用途 |
|---|---|
| [`patch_zen.py`](#简体中文补全) | 追加简体中文条目、修正快捷键显示，支持备份还原 |
| [`fix_zen_duplicate.py`](#默认应用重复项) | 删除「设置 > 默认应用」里重复的 Zen 注册项 |

实现结构、资源基线、判定规则、重新构建及测试方法统一见仓库根 [DEVELOPMENT.md](../../DEVELOPMENT.md#316-zen中文补全与默认应用重复项)。

## 简体中文补全

补丁以本机安装包中的英文资源和已有简体中文资源为基准，只追加缺失翻译。
已有简体中文翻译保留。沿用现有界面的“工作区”“活动文件夹”等术语。

### 补全内容

- 新增 327 个简体中文条目：326 个原来缺失的条目，以及新增的快捷键“未设置”提示。
- 补齐资料库（Library）：历史记录、下载、Boost、媒体、工作区五个分区及其筛选、排序、清除历史记录和右键菜单文案。
- 补齐侧边栏跨设备同步及“包含未固定的标签页”的标签和说明。
- 补齐活动文件夹、RSS / GitHub 筛选、分享、欢迎页和同步删除工作区提示。
- 补齐命令面板动作、同步日志、IP 保护站点规则、新标签页引导和错误页搜索引导。
- 补齐安装包中其余 Fluent 中文缺项，包括 PDF 查看器、网络诊断、表单自动填写和开发者工具。
- 修复快捷键设置页显示 `Browser:Reload`、`Browser:ReloadSkipCache`、`Browser:Stop` 的问题，分别引用已有中文标签。
- 将快捷键设置页 3 处写死的 `Not set` 显示改为 Fluent 文案“未设置”，并提供英文回退。
- 功能键显示为大写 `F1`–`F24`，例如 `F5`、`Ctrl+F5`；修饰键和方向键使用文本，例如 `Shift+F5`、`Ctrl+Shift+M`、`Alt+Left`，不使用按键图标。
- 命名按键统一显示为 `Home`、`End`、`Tab`、`Delete`、`Backspace`、`Insert`、`PageUp`、`PageDown` 等规范形式，兼容已有绑定和编辑时的预览。

快捷键 ID、实际动作、键位和保存机制均保持原样。翻译不会启用相关功能，也不会提交同步、分享等操作。

### 安装与还原

`patch_zen.py` 是补全入口，`translations.ftl` 保存中文补全文案。

查看中文使用指南（命令、示例、权限和配置选择）：

```powershell
python .\patch_zen.py --help
python .\patch_zen.py help
```

直接运行 `python .\patch_zen.py` 也只显示帮助，不执行安装；`install --help` 等写法同样显示指南。帮助无需管理员权限，也不查找浏览器或写入文件。

在另一台电脑上使用时，复制本目录的源文件；如果已有本地打包的 `dist/Zen-zh-CN-1.23.1b.zip`，也可解压使用。仓库不包含生成的 ZIP。
不需要复制 `build/`、`backups/` 或本机的浏览器配置。目标电脑需要 Python 3.11+，并安装相同版本、相同构建的 Zen；如果版本或资源包不匹配，脚本会停止并说明原因。

先在补丁目录运行只读检测，可以在 Zen 正在运行时执行：

```powershell
python .\patch_zen.py detect
```

想在改动安装目录之前先校验翻译，可在 Zen 运行时先构建再校验：

```powershell
python .\patch_zen.py build
python .\patch_zen.py validate
```

`validate` 需要 `fluent.syntax`（`python -m pip install fluent.syntax`），省略 `--original-dir` 时自动以 `backups/` 中的原版备份为参照。它只写 `build/` 和 `validation.json`，不碰安装目录。

确认输出的安装和配置目录后，关闭所有 Zen 窗口及后台进程，在有安装目录写入权限的终端中运行（安装在 Program Files 时通常需要管理员终端）：

```powershell
python .\patch_zen.py install
python .\patch_zen.py verify
```

首次安装时会自动用目标电脑的原版资源生成 `build/`，然后验证两个资源包、备份原件并替换自动识别的安装目录下的 `omni.ja` 和 `browser/omni.ja`。

本地翻译对该 Zen 安装下的所有配置生效；脚本只清除所选配置的启动缓存。如果切换到另一个已有配置后仍见旧显示，可通过 `--profile` 选择该配置再次运行安装命令，以清理其启动缓存。

安装完成后清除指定配置的 `startupCache`，下次启动会自动重建。
不会修改 `prefs.js`、`user.js`、`firefox.cfg`、扩展、书签、登录状态或标签页数据。
`Program Files` 的写入权限由 Windows 决定；若提示访问被拒绝，请从有写入权限的终端执行上述命令。

`build/deployment.json` 记录本机最近一次安装结果及识别到的实际路径。

还原时，同样先退出 Zen：

```powershell
python .\patch_zen.py restore
```

若已经安装本补丁，再次执行 `install` 会跳过已经匹配的文件。两个资源包的原版备份均按 SHA-256 核验，替换过程中出错会回滚已替换的资源包。

### 自动识别规则

- 安装目录优先取正在运行的 `zen.exe` 路径；关闭后检查注册表、配置文件中的 `LastPlatformDir` 和常见安装位置。
- 配置目录从当前 Windows 用户的 `%APPDATA%\zen\profiles.ini` 读取，支持相对路径和绝对路径，并读取 `installs.ini` 中的安装默认配置。
- 配置选择依次考虑：正在使用的配置、与该安装对应的默认配置、配置列表中的默认项、唯一可用配置。检查真实的 Windows 文件占用锁，残留的 `parent.lock` 不会被当成运行中。
- 浏览器关闭后无法保证识别出此前临时通过 `-P` 或 `-profile` 打开的非默认配置，此时会选择默认配置。若需指定非默认配置，请使用下面的参数。
- 有多个同优先级候选时列出路径并停止，不根据文件修改时间猜测。首次安装 Zen 后请至少启动一次以创建配置。
- 普通配置的缓存路径从 `%LOCALAPPDATA%\zen` 对应位置推导；外部绝对路径配置使用其自身目录。删除前验证 `startupCache` 的确切路径并拒绝指向其他目录的链接。

手动指定安装目录、配置名称、配置目录名或完整路径：

```powershell
python .\patch_zen.py detect --install-dir 'D:\Apps\Zen Browser'
python .\patch_zen.py install --profile 'Default (release)'
python .\patch_zen.py install --profile 'D:\BrowserData\ZenProfile'
```

便携版或自定义数据根目录可显式指定含有 `profiles.ini` 的目录。默认将该目录同时作为本地缓存根目录，缓存分离存储时再指定 `--local-root`：

```powershell
python .\patch_zen.py install --install-dir 'D:\Apps\Zen' --profiles-root 'D:\ZenData' --local-root 'D:\ZenCache'
```

请使用自己的 Windows 账户执行，避免通过“以其他用户身份运行”选中其他账户的配置。`detect` 不需要管理员权限。

## 默认应用重复项

「设置 > 应用 > 默认应用」每行对应注册表里一条 `RegisteredApplications` 记录，不是一个程序一行。Zen 安装程序把同一个客户端键同时写进机器级和用户级两个位置，于是同一个 Zen 显示两行：

```text
HKLM\Software\RegisteredApplications   Firefox-<hash> -> Software\Clients\StartMenuInternet\Firefox-<hash>\Capabilities
HKCU\Software\RegisteredApplications   Firefox-<hash> -> 同一目标
                        |
                        +-- 设置 > 默认应用： Zen
                                             Zen
```

只读检查（Zen 运行中也可以执行）：

```powershell
python .\fix_zen_duplicate.py detect
```

确认输出后清理：

```powershell
python .\fix_zen_duplicate.py fix
```

- 只处理可执行文件名为 `zen.exe` 的注册项，Firefox 等其他浏览器不受影响。
- 两处指向同一个 `zen.exe` 时删除用户级（HKCU）那条并保留机器级，按用户和按机器两种安装都能保留可用入口。
- 文件已不存在而所在磁盘仍在的注册项按残留删除；磁盘不在的保留，避免误删暂时离线的移动盘安装。
- 两份 `zen.exe` 都真实存在（两份 Zen 安装）时不删除，只在输出的 `unresolved` 中列出，由人工判断。
- 删除 HKCU 项不需要管理员权限；涉及 HKLM 项时需要管理员终端，否则以退出码 1 结束并列出失败项。
- 清理后设置页面立即刷新，不需要重启。Zen 再次写入用户级注册时重复项会回来，重跑一次即可。

系统自带的 App Installer 和 Windows 小组件也可能各显示两行，那是同一个 MSIX 包声明了两组 capability（`.msix` 与 `ms-appinstaller:`、`ms-widgetboard:` 与 `ms-widgets:`），属于系统行为，本脚本不处理。

## 文件与备份

`patch_zen.py` 安装后，`build/` 保存生成的补丁和安装记录，`backups/20261006042626/` 保存原版资源包。请保留备份以便还原；这些文件仅在本地生成，不随仓库提交。安装到另一台电脑时会生成该电脑自己的补丁和备份。

补丁不保存固定的原版哈希基线：每次 `build` 都从输入目录的 `application.ini` 读取版本信息，现算两个资源包的 SHA-256 并写进 `build/manifest.json`。要针对新版本重建补丁，直接指向新的原版目录即可：

```powershell
python .\patch_zen.py build --install-dir 'D:\Apps\Zen Browser'
python .\patch_zen.py build --install-dir '.\backups\20261006042626'
```

`backups/` 不保留 `application.ini` 时，会改用已识别安装目录的信息。输入目录已包含本补丁时会拒绝构建。`keyToDisplayString` 是补丁中唯一整体改写、不检查原文的函数，每次构建都会把原实现另存到 `build/replaced/`，上游改动时输出会提示比对。

`fix_zen_duplicate.py` 不写文件，只删除注册表项；删除前可用 `detect` 查看将删除的内容，HKCU 部分可用 `reg export` 自行备份。

## 浏览器更新

Zen 更新可能覆盖这些本地资源。补丁不依赖固定的原版哈希，所以更新后不需要任何手工准备：直接运行 `install` 即可，检测到未知资源会按新版原包重新构建补丁，再用新原版覆盖备份。万一新版的补丁目标结构变了，构建会明确报错而不是静默改错。

## 来源与许可

原始资源来自本机 Zen 安装包，对应 `zen-browser/desktop` 提交 `f6a167d80b62a50c0ef5b9eedfb3bb777e0372f4`，以及其基于的 Mozilla 资源。
对原有源文件的修改遵循其 Mozilla Public License 2.0；生成的 JavaScript 保留原许可证头。原文与本地翻译之间的消息 ID 对应关系可在 `translations.ftl`、生成资源和校验清单中核对。
