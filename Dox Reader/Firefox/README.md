# Dox Reader for Firefox

Dox Reader 的 Firefox WebExtension 版本，支持 Firefox 桌面版和 Android 版。扩展使用 Manifest V3，直接请求用户添加的 RSS/Atom 地址和用户配置的 HTTPS WebDAV 服务，不依赖开发者运营的后端。

## 安装

AMO 商店地址：[Dox Reader](https://addons.mozilla.org/firefox/addon/dox-reader/)。`1.0.0` 已提交公开审核，需等待 Mozilla 批准后开放安装。最低支持 Firefox 142（桌面及 Android）。

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

- IndexedDB 保存订阅和文章缓存，`browser.storage.local` 保存设置与 WebDAV 凭据。
- WebDAV 同步文档位于用户提供的 URL 前缀下的 `Dox Reader/state.json`。
- `http://*/*` 与 `https://*/*` host 权限用于访问用户自行添加的订阅源和 WebDAV 地址。
- 应用不包含广告、分析或远程可执行代码。

## 发布

`1.0.0` 起改为 AMO listed 公开发行，当前已提交 Mozilla 审核，审核通过后才可从商店安装。扩展 ID 保持不变；manifest 不再设置 `update_url`，升级后的扩展由 AMO 提供后续更新。

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

发布脚本会测试、构建并提交 AMO listed 审核，公开资料保存在 `amo-listing.json`。待审核时正常退出，不发布未签名包，也不自动提交或推送；审核通过后重新运行 `npm run release:push`，下载并校验 AMO 的签名 XPI，更新 `updates.json`。脚本同时维护 `Firefox/Dox Reader/` 下的旧版更新入口，使 0.x 用户可以升级并转交 AMO 更新；旧目录不再包含源码。使用 `-Push` 前，暂存区必须为空。

统一开发规范见仓库根文档 [`../../DEVELOPMENT.md`](../../DEVELOPMENT.md)；审核与隐私信息见 [`AMO_REVIEW_NOTES.md`](AMO_REVIEW_NOTES.md) 和 [`PRIVACY.md`](PRIVACY.md)。

## 本地与后端模式（1.1.0）

设置 → 数据模式：默认「纯本地」，保留现有 RSS/WebDAV 功能；选择「自建后端」后填写自己的 Dox Reader Backend HTTPS 根地址和访问令牌，等待自动读取后端设置。可调整抓取间隔（默认 60 分钟）及全库最新文章上限（默认 10000 篇，含收藏），保存后生效。关闭全部客户端也会继续抓取，刷新按钮可手动触发后端抓取。

本地与每个后端的缓存独立，切换不会自动迁移或删除数据；可用 OPML 导出/导入订阅。后端模式下 WebDAV 不启用，外观保存在本机；离线可读已缓存内容，状态修改需要联网。调低保留上限会删除远端旧文章。部署说明见 [Dox Reader Backend](../Backend/README.md)。
