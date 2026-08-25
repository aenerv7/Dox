# Dox Reader 开发说明

## 跨版本同步要求

对 Dox Reader 本身的功能、界面、数据模型或同步协议进行修改时，必须同步到以下所有版本：

- `Firefox/`
- `Cloudflare Workers/`

通常需要同步维护的内容包括主界面、样式、RSS/Atom 解析、文章处理、IndexedDB 数据模型、OPML、WebDAV 客户端和同步合并逻辑，以及对应测试。

平台适配代码应分别维护，不应直接互相覆盖：

- Firefox 使用扩展权限直接访问 RSS 与 WebDAV，并通过 `browser.storage.local` 保存设置。
- Cloudflare Workers 网页版通过同源 Worker 代理网络请求，并通过 `localStorage` 保存设置。
- `background.ts` 仅属于 Firefox；`worker/`、`wrangler.jsonc` 和部署脚本仅属于 Cloudflare Workers。

## 首次同步

同步前若本地不存在任何订阅记录、文章或文章状态，而 WebDAV 同步后得到有效订阅，应用必须立即刷新全部订阅。该判断不受从其他设备同步而来的 `lastRefreshAllAt` 影响，因为新设备尚未建立本地文章缓存。刷新结束后需要更新全量刷新时间并静默回写 WebDAV。

删除墓碑和文章状态也属于本地阅读器数据；存在这些记录时，不应把设备误判为首次同步。

## 文章列表视图

- “全部文章”和“未读”是跨订阅聚合视图，文章来源显示为“订阅源名称 - 文章域名”；进入单个订阅源后只显示文章域名。
- 在“未读”中点开文章时，已读状态应立即写入本地并参与同步，但该文章要保留在本次“未读”浏览会话中。
- 切换到其他视图会结束本次“未读”会话；下次进入“未读”时按最新已读状态重新筛选。

完成 Dox Reader 核心修改后，必须分别验证两个工程：

```powershell
cd "Dox Reader/Firefox"
npm run check

cd "../Cloudflare Workers"
npm run check
npx wrangler deploy --dry-run
```

只有某项修改明确属于单一平台适配层时，才可以只修改一个版本；提交说明中应注明该平台范围。
