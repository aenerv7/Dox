# Dox Reader

Dox Reader 是一个 local-first RSS/Atom 阅读器。订阅、已读状态、收藏状态和外观偏好保存在浏览器本地，并可通过用户自己的 WebDAV 服务跨设备同步；文章正文只保存在各设备的 IndexedDB 中。

`1.1.0` 增加可选自建后端模式：前端设置中连接自己的 [Dox Reader Backend](Backend/README.md)，由后端统一存储文章、订阅和阅读状态，默认每小时抓取、全库保留最新 10000 篇。抓取间隔和保留上限可在前端调整；所有客户端关闭也会继续抓取。上述 local-first/WebDAV 行为继续作为默认本地模式独立运行。

应用启动时默认显示全部订阅中的未读文章；资料库导航按“未读、全部文章、收藏”排列。

同步和已读状态操作进行时会显示加载状态并锁定重复点击；切换订阅源后，未完成的批量已读操作仍保留加载状态。

## 项目结构

| 模块 | 目录 | 网络方式 | 发布方式 |
|---|---|---|---|
| Cloudflare Workers 网页版 | [`Cloudflare Workers/`](Cloudflare%20Workers/) | 浏览器通过同源 Worker 受限代理访问 RSS 与 WebDAV | Workers Static Assets + Worker |
| 可选个人后端 | [`Backend/`](Backend/) | 服务端定时抓取 RSS，前端通过 HTTPS API 访问个人文章库 | Worker + SQLite Durable Object |

仅维护网页端和可选个人后端。两者是独立 npm 工程，各有依赖锁、构建配置和测试。

产品行为、架构、数据契约、测试和发布流程统一见仓库根文档 [`../DEVELOPMENT.md`](../DEVELOPMENT.md)。

## 快速验证

```powershell
cd "Dox Reader/Cloudflare Workers"
npm ci
npm run check
npx wrangler deploy --dry-run

cd "../Backend"
npm ci
npm run check
npx wrangler deploy --dry-run
```

改动后运行相关工程的检查和部署预检。

WebDAV 同步文件固定为用户所填 URL 前缀下的 `Dox Reader/state.json`。
