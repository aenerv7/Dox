# Dox Reader for Firefox

Dox Reader 的 Firefox WebExtension 版本，支持 Firefox 桌面版和 Android 版。扩展使用 Manifest V3，直接请求用户添加的 RSS/Atom 地址和用户配置的 HTTPS WebDAV 服务，不依赖开发者运营的后端。

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

发布脚本会测试、构建、提交 AMO unlisted 签名、下载稳定文件名的 XPI，并更新 `updates.json`。为保障 0.3.3 及更早版本继续升级，它还会同步仓库旧路径 `Firefox/Dox Reader/` 下的兼容更新清单和 XPI；该旧目录不再包含项目源码。

更多实现和审核信息见 [`DEVELOPMENT.md`](DEVELOPMENT.md)、[`AMO_REVIEW_NOTES.md`](AMO_REVIEW_NOTES.md) 与 [`PRIVACY.md`](PRIVACY.md)。
