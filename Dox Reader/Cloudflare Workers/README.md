# Dox Reader for Cloudflare Workers

Dox Reader 的 self-hosted local-first 网页版。Vite 构建的 Preact 应用由 Workers Static Assets 提供，Worker 只处理 `/api/feed` 和 `/api/webdav` 两个受限代理入口。应用不使用 KV、D1、R2、Durable Objects、Queues 或 Workers AI，适合部署在 Cloudflare Workers 免费权益内。

## 一键部署

要求一个 Cloudflare 账号，以及 Node.js 24 或更高版本。在 Windows 双击：

```text
deploy-cloudflare.cmd
```

也可以在 PowerShell 中运行：

```powershell
pwsh -File deploy-cloudflare.ps1
```

脚本会执行 `npm ci`、完整测试与构建、Wrangler 类型检查，然后部署到当前 Wrangler 登录的 Cloudflare 账号。首次运行会打开 Cloudflare 登录流程。

```powershell
pwsh -File deploy-cloudflare.ps1 -DryRun
pwsh -File deploy-cloudflare.ps1 -SkipInstall
```

任何人克隆仓库后都可以在自己的 Cloudflare 账号中运行该脚本；`wrangler.jsonc` 不包含账号 ID 或密钥。

## 本地开发

```powershell
npm ci
npm run dev       # 构建后启动完整 Worker + Static Assets
npm run dev:ui    # 只调试界面，不提供 RSS/WebDAV 代理
npm run check
```

正式部署的 npm 入口是：

```powershell
npm run deploy
```

## 安全边界

代理只接受 Dox Reader 同源网页发起并带有客户端标记的请求。它限制方法、头部、请求体大小、重定向次数和目标端口，拒绝私有/保留地址以及非 HTTPS WebDAV 地址，也不记录或持久化 WebDAV 凭据。

订阅、文章、设置和凭据保存在访问该部署域名的浏览器中；只有用户选择同步的数据会写入其自己的 `Dox Reader/state.json`。更换部署域名会形成新的浏览器存储分区，迁移前应先完成 WebDAV 同步。

隐私说明见 [`PRIVACY.md`](PRIVACY.md)。根目录的 [`../README.md`](../README.md) 说明两个版本的关系，所有核心修改必须遵循仓库根文档 [`../../DEVELOPMENT.md`](../../DEVELOPMENT.md) 的跨版本同步要求。
