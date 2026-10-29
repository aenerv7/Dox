# Dox Reader for Firefox

Dox Reader 的 Firefox WebExtension 版本，支持 Firefox 桌面版和 Android 版。扩展使用 Manifest V3，直接请求用户添加的 RSS/Atom 地址、原文页面和用户配置的 HTTPS WebDAV 服务，不使用开发者运营的服务端。

## 安装

本扩展以 AMO listed channel 发布，商店页为 [Dox Reader](https://addons.mozilla.org/firefox/addon/dox-reader/)，是否可安装以 AMO 上架状态为准。最低支持 Firefox 142（桌面及 Android）。

项目使用 [MIT 许可证](LICENSE)。

## 开发与构建

要求 Node.js 24 或更高版本、npm 11 或更高版本。

```powershell
npm ci
npm run check
npm run dev
```

`npm run dev` 只用于界面调试。要验证扩展权限、后台脚本和真实网络行为，请构建后在 Firefox 中加载：

```powershell
npm run build
npx --yes web-ext@10.6.0 run --source-dir dist
```

生成可提交的未签名包：

```powershell
npm run package
```

## 数据与权限

- IndexedDB 保存订阅、文章和提取的全文，`browser.storage.local` 保存设置与 WebDAV 凭据。
- WebDAV 同步文档位于用户提供的 URL 前缀下的 `Dox Reader/state.json`，只包含订阅、已读/收藏状态、刷新时间和外观/阅读偏好；正文、图片、凭据和本机布局不上传。
- 只有点击“获取全文”时才请求原文页面；Readability 提取的正文和主图只写入本机 IndexedDB。
- 自动刷新按每个订阅源上次成功更新的时间单独判断，间隔在设置中以整数小时配置，0 关闭；仅在阅读器页面打开时运行。
- `http://*/*` 与 `https://*/*` host 权限用于访问用户自行添加的订阅源、原文页面和 WebDAV 地址。
- 应用不包含广告、分析或远程可执行代码。

## 发布

`1.0.0` 起改为 AMO listed 公开发行，版本需经 Mozilla 审核后上架，能否从商店安装以 AMO 上架状态为准。扩展 ID 为 `dox-reader@magi`；manifest 不再设置 `update_url`，升级后的扩展由 AMO 提供后续更新。

在本目录创建被 `.gitignore` 排除的 `.env.release`：

```text
AMO_API_KEY=user:12345678
AMO_API_SECRET=<secret>
```

版本号需在 `package.json` 与 `public/manifest.json` 中保持一致，并通过 `npm install` 刷新 `package-lock.json`。随后运行：

```powershell
npm run release
npm run release:push
pwsh -File release.ps1 -SkipSign
```

发布脚本会测试、构建并提交 AMO listed 审核，公开资料保存在 `amo-listing.json`。待审核时正常退出，不发布未签名包，也不自动提交或推送；审核通过后重新运行 `npm run release:push`，下载并校验 AMO 的签名 XPI，覆盖为本目录下的 `bb7581fa1bbf4b928862.xpi`。目录里的 `updates.json` 只是 1.0 之前（0.x）自托管更新入口，键为旧扩展 ID `dox-rss-reader@dox.local`，脚本不再维护它。使用 `-Push` 前，暂存区必须为空。

统一开发规范见仓库根文档 [`../../DEVELOPMENT.md`](../../DEVELOPMENT.md)；审核与隐私信息见 [`AMO_REVIEW_NOTES.md`](AMO_REVIEW_NOTES.md) 和 [`PRIVACY.md`](PRIVACY.md)。
