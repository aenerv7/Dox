# Dox Reader

Dox Reader 是一个 local-first RSS/Atom 阅读器。订阅、已读状态、收藏状态和外观偏好保存在浏览器本地，并可通过用户自己的 WebDAV 服务跨设备同步；文章正文只保存在各设备的 IndexedDB 中。

## 项目结构

| 版本 | 目录 | 网络方式 | 发布方式 |
|---|---|---|---|
| Firefox 扩展 | [`Firefox/`](Firefox/) | 扩展直接访问 RSS 与 WebDAV | Vite 构建，AMO 签名或自托管 XPI |
| Cloudflare Workers 网页版 | [`Cloudflare Workers/`](Cloudflare%20Workers/) | 浏览器通过同源 Worker 受限代理访问 RSS 与 WebDAV | Workers Static Assets + Worker |

两个目录都是独立 npm 工程，拥有各自的依赖锁、构建配置、测试和发布脚本。它们共享相同的界面、IndexedDB 数据模型与 WebDAV schema，但运行时网络和设置存储实现分别针对 Firefox 与普通网页进行了裁剪。

开发和跨版本同步规则见 [`DEVELOPMENT.md`](DEVELOPMENT.md)。

## 快速验证

```powershell
cd "Dox Reader/Firefox"
npm ci
npm run check

cd "../Cloudflare Workers"
npm ci
npm run check
npx wrangler deploy --dry-run
```

功能改动涉及 `src/` 内的共享界面或同步协议时，需要同步修改两个子项目并分别运行 `npm run check`。运行时适配文件（例如 `runtime-fetch.ts` 和 `settings.ts`）有意保持独立，不应直接互相覆盖。

WebDAV 同步文件固定为用户所填 URL 前缀下的 `Dox Reader/state.json`，本次目录调整不会改变远端数据位置或 schema。
