# Dox Reader 开发文档

面向跨设备开发的完整参考。用户说明见 [`README.md`](README.md)，AMO 审核说明见 [`AMO_REVIEW_NOTES.md`](AMO_REVIEW_NOTES.md)，隐私说明见 [`PRIVACY.md`](PRIVACY.md)。

---

## 1. 项目概览

本地优先（local-first）的 RSS/Atom 阅读器，作为 Firefox WebExtension（Manifest V3）同时支持桌面版和 Android 版。订阅、已读/收藏状态通过用户自备的 WebDAV 同步；文章正文仅存本机 IndexedDB。

| 项 | 值 |
|---|---|
| 扩展 ID | `dox-rss-reader@dox.local`（固定，升级保留数据分区） |
| 当前版本 | 0.3.1 |
| 最低 Firefox | 142.0（桌面 + Android） |
| 运行时依赖 | preact 10、dexie 4、fast-xml-parser 5、lucide-preact |
| 构建 | Vite 8 + TypeScript 7（`tsc --noEmit` 先做类型检查） |
| 测试 | Vitest 4（当前 11 个用例） |
| 环境要求 | Node.js ≥ 24、npm ≥ 11、PowerShell 7（仅发布脚本需要）、Firefox（调试需要） |

> 注意：`package.json` 中 `typescript` 为 `^7.0.2`（TS 7 原生支持 TS 语法检查），开发时请勿降级。

### 目录结构

```
Firefox/Dox Reader/
├── index.html              # 阅读器页面入口（Vite 单页）
├── public/
│   ├── manifest.json       # MV3 清单（ID / update_url / 权限）
│   └── icons/icon.svg
├── src/
│   ├── main.tsx            # Preact 挂载
│   ├── app.tsx             # 主 UI（三栏布局、弹窗、刷新/同步触发）
│   ├── background.ts       # 点工具栏图标打开/聚焦阅读器标签页
│   ├── model.ts            # 全部类型定义
│   ├── database.ts         # Dexie 层：表、Lamport 版本、同步文档导出/应用
│   ├── feed-parser.ts      # RSS 2.0 / Atom / RDF 解析，稳定 ID，摘要
│   ├── feed-service.ts     # 抓取订阅源（4 并发）
│   ├── article-content.tsx # 文章 HTML 白名单净化渲染
│   ├── opml.ts             # OPML 导入/导出
│   ├── settings.ts         # 设置持久化（storage.local，降级 localStorage）+ 主题与配色
│   ├── sync-model.ts       # 同步文档合并/校验（LWW）
│   ├── webdav.ts           # WebDAV 客户端（PROPFIND/MKCOL/GET/PUT + ETag）
│   └── styles.css          # 全部样式（含移动端响应式）
├── test/fixtures/demo-feed.xml
├── release.ps1             # 一键发布（构建→AMO 签名→下载→更新 updates.json→推送）
├── updates.json            # 自托管更新清单（raw GitHub 提供）
├── bb7581fa1bbf4b928862.xpi# 签名版 XPI（更新链接指向它）
├── .env.release            # AMO API 凭证（gitignored，禁止提交）
├── tsconfig.json / vite.config.ts / vitest.config.ts
└── package.json / package-lock.json
```

---

## 2. 架构与数据流

### 数据流

```
[Feed URL] ──fetch──> feed-parser ──> database.saveParsedFeed ──> IndexedDB(items)
                                                                      │
[UI 操作: 已读/收藏/整源标已读] ──> database.setItemState ────────> IndexedDB(itemStates)
                                                                      │
[WebDAV] ◄──syncWithWebDav── database.exportSyncDocument（合并后）──┘
   ▲  │                                    │
   │  └── getRemote(ETag) → mergeSyncDocuments → applySyncDocument → IndexedDB
   └── putRemote(If-Match, 412 冲突重试 ≤4 次)
```

- 订阅与文章正文只写 IndexedDB；同步文档只包含**订阅元数据 + 已读/收藏状态 + 上次全量刷新时间**。
- 所有写操作产生 Lamport 版本号（`meta.actor` = 设备 UUID，`meta.clock` = 单调计数器），同步合并按版本仲裁。

### 模块职责

| 文件 | 职责 | 关键导出 |
|---|---|---|
| `database.ts` | 唯一的持久层入口 | `addFeed / removeFeed / listFeeds / saveParsedFeed / setItemState / markFeedRead / listItems / exportSyncDocument / applySyncDocument / clearAllData / get|setLastRefreshAllAt` |
| `feed-service.ts` | 网络抓取 + 批量 | `refreshFeed / refreshFeeds` |
| `webdav.ts` | WebDAV 协议 | `syncWithWebDav / testWebDav` |
| `sync-model.ts` | 纯函数合并/校验 | `mergeSyncDocuments / parseSyncDocument / compareVersion` |
| `app.tsx` | 全部 UI 状态与交互 | `App` 组件 |
| `article-content.tsx` | 富文本净化 | `renderArticleContent` |

---

## 3. 数据模型

### IndexedDB（Dexie `dox-rss-reader`，schema v1）

```ts
feeds:       "&id, &url, deleted, title"
items:       "&id, feedId, publishedAt, [feedId+publishedAt]"
itemStates:  "&id, feedId, publishedAt"
meta:        "&key"
```

| 表 | 记录 | 说明 |
|---|---|---|
| feeds | `FeedRecord` | `{id, url, title, siteUrl, folder, addedAt, updatedAt, lastFetchedAt?, error?, deleted, version}`；`deleted=true` 为墓碑 |
| items | `ItemRecord` | `{id, feedId, guid, title, url, author, publishedAt, content, snippet, read, starred, fetchedAt}`；`id` 为 `sha256(feedId\0identity)` 前 32 位 |
| itemStates | `ItemStateRecord` | `{id, feedId, publishedAt, read: Register<bool>, starred: Register<bool>}`；与 items 分离以便独立同步 |
| meta | `MetaRecord` | `actor`（设备 UUID）、`clock`（Lamport 计数器）、`lastRefreshAllAt`（上次全量刷新时间） |

`Register<T> = { value: T; version: Version }`，`Version = readonly [counter: number, actor: string]`。

### 同步文档（WebDAV `Dox Reader/state.json`，schema v1）

```ts
interface SyncDocument {
  schemaVersion: 1;
  actor: string;                          // 上次写入者设备
  clock: number;                          // 上次写入时的 Lamport 时钟
  generatedAt: string;
  subscriptions: Record<string, SubscriptionSync>;
  itemStates: Record<string, ItemStateRecord>;
  lastRefreshAllAt?: number;              // 0.2.1 新增，可选，向后兼容
}
```

`SubscriptionSync` 即 `FeedRecord` 去掉本地字段。**不要在未验证兼容性的情况下改 schemaVersion**——旧客户端会拒绝不认识的版本；新增字段应保持可选。

---

## 4. 同步机制（WebDAV）

### 位置与鉴权

- 由设置里的 URL 前缀推导：`{prefix}/Dox Reader/state.json`（目录 `Dox Reader`，文件名 `state.json`）。
- 强制 HTTPS（`resolveWebDavLocations` 里校验，非 https 直接抛错）。
- 凭证 `username:password` 拼 `Basic` 头，只存 `browser.storage.local`，**永不写入同步文档**。

### 流程（`syncWithWebDav`）

1. `ensureDirectory`：`PROPFIND Depth:0` 探测目录，404 则 `MKCOL` 创建（405 重试探测）。
2. `getRemote`：GET 文件；404 = 远程不存在；返回 ETag。
3. `mergeSyncDocuments(本地导出, 远程)`：纯函数合并。
4. `applySyncDocument(合并结果)`：写回本地。
5. `putRemote`：`If-Match: <ETag>`（已存在）或 `If-None-Match: *`（新建）。
6. 412 冲突 → 回到第 2 步重试，最多 4 次，仍冲突则报"持续被其他设备修改"。

### 合并规则（LWW）

- **订阅**：整条记录按 `version`（Lamport counter，同 counter 比 actor 字符串）取新；删除保留为墓碑并参与仲裁。
- **已读/收藏**：两个独立 register，各自按 `version` 取新——改一个字段不会覆盖另一设备对另一字段的更新。
- **`lastRefreshAllAt`**：`Math.max(本地, 远程)`（时间戳单调，天然正确）。
- `clock` 取两方 max 后写回本地 meta，保证下一版本号全局单调。

---

## 5. 核心功能实现要点

### 刷新与自动刷新（0.2.1）

- 手动：工具栏"刷新全部"（`handleRefresh()`）或单订阅行刷新按钮。
- `refreshFeeds` 用 4 个并发 worker 抓取，失败逐个收集（不中断整体）。
- **只有"全部刷新"**会记录 `lastRefreshAllAt = Date.now()` 到 meta 并 `queueSync()` 推送（单订阅刷新不记录）。
- **自动刷新**：打开扩展时（挂载 effect 末尾，先加载本地 → 若有 WebDAV 先同步 → 再检查）：
  - 无订阅 → 跳过；
  - `lastRefreshAllAt` 为 0（从未刷过，含从 0.2.0 升级）或距今 > 24h → 自动执行全部刷新。
  - 自动模式从数据库读订阅列表（`listFeeds()`），避免闭包捕获空状态。

### 已读 / 收藏 / 整源标已读

- 单篇：`setItemState(id, {read|starred})` → 写 `itemStates`（新版本号）+ 更新 `items`。
- 整源：`markFeedRead(feedId)` → 单个事务批量把该源未读文章的 `itemStates.read = true`（同一版本号）+ `items.read = true`，返回标记数量；UI 上该按钮在无未读时置灰。

### 解析器（feed-parser）

- 支持 RSS 2.0、Atom、RDF（`rss.channel` / `feed` / `rdf` 根）。
- 相对链接按 `sourceUrl` 解析；`content` 优先取 `encoded > content > description > summary`；snippet 由内容去标签截取 280 字符。
- 文章 ID：`sha256(feedId + "\0" + (guid || title\0日期))` 前 32 位——同一篇文章跨刷新保持稳定，已读/收藏状态因此能持续命中。
- 注意 `parseTagValue: false`：所有值按文本处理，避免数字/布尔被 XML 解析器转换。

### 文章渲染净化（article-content）

- `DOMParser` 解析 HTML → 递归转 Preact 元素；**只放行白名单标签**（a/b/blockquote/code/div/h1-h6/img/li/ol/p/pre/table/td/th/tr/ul 等）。
- `script/style/iframe/object/embed/form` 连内容一起丢弃；`img`/`a` 的 URL 只允许 http/https（`a` 额外放行 mailto/tel）；`img` 强制 `loading=lazy` + `referrerPolicy=no-referrer`。
- 应用代码绝不使用 `innerHTML` / `dangerouslySetInnerHTML` 注入 feed 内容（web-ext lint 的 `UNSAFE_VAR_ASSIGNMENT` 警告来自 Preact 渲染器自身，见 AMO_REVIEW_NOTES）。

### 设置与主题

- 设置：`webdavUrl / webdavUsername / webdavPassword / theme / colorScheme / showItemSnippet / feedPaneRatio / itemPaneRatio / layoutLocked`。
- 持久化优先 `browser.storage.local`，非扩展环境（dev 服务器）自动降级 `localStorage`。
- 主题 `system/light/dark` 通过 `document.documentElement.dataset.theme` 切换；配色 `ink/ocean/violet/amber/graphite`（墨绿/海洋蓝/紫罗兰/暖橙/石墨灰）通过 `data-scheme` 切换。
- 每种配色都有浅色与深色两套 CSS 变量（`--bg/--surface/--accent/--accent-soft` 等）；`theme=system` 时用 `@media (prefers-color-scheme: dark)` 自动套用深色变体，OS 切换明暗即自动适配。`data-theme="dark"` 块和媒体查询块按 `data-scheme` 各自声明，靠属性选择器特异性覆盖基色（墨绿）。
- 新增配色只需在 `styles.css` 的浅色/深色/媒体查询三处各加一个 `data-scheme` 块，并在 `app.tsx` 的 `COLOR_SCHEMES` 数组补一项（`model.ts` 的 `ColorScheme` 联合类型同步加值）。
- `showItemSnippet=false` 时文章列表不渲染简介 `<p>`，`.item-list` 加 `compact` 类：行高 62px、标题单行截断、未读点/收藏星标垂直居中。

### UI 布局

- 桌面三栏：订阅栏 / 文章列表 / 阅读区（`--feeds-pane-width`、`--items-pane-width` 变量 + grid），分隔条可拖拽/键盘调整，可锁定。
- 移动端（窄屏媒体查询）：单面板切换（`mobile-pane-feeds/items/reader`）+ 底部导航（订阅/文章/收藏/设置）。
- 全部文案为中文。

---

## 6. 开发与调试

### 常用命令（在 `Firefox/Dox Reader/` 下）

```powershell
npm ci                 # 按 lock 安装（Node 24+）
npm run check          # 测试 + 类型检查 + 构建（发布前必跑）
npm run dev            # Vite dev server（仅 UI 调试，非扩展环境）
npm run package        # check + web-ext 打包未签名 ZIP
npm run release        # 自动发布（不含 git push）
npm run release:push   # 自动发布 + git 提交推送
```

### 加载调试

- 桌面：`npm run build` 后 `npx --yes web-ext@10.6.0 run --source-dir dist`；或 `about:debugging#/runtime/this-firefox` → 临时载入 `dist/manifest.json`。
- Android（USB 连接 + 远程调试）：`npx --yes web-ext@10.6.0 run --source-dir dist --target firefox-android --android-device <id> --firefox-apk org.mozilla.firefox`。
- 浏览器控制台/网络面板是排查网络问题的主要手段（扩展上下文在 `about:debugging` 里可开调试）。

### 常见坑（跨设备开发务必知道）

1. **临时加载 = 随机临时 ID**：`about:debugging` 每次加载的数据分区都不同（和 manifest 的 ID 无关），本地数据不保留；调试 WebDAV/同步要装正式签名版或接受空数据。
2. **dev 服务器不是扩展环境**：`npm run dev` 的普通标签页里没有 `host_permissions`，对 WebDAV 的跨域 PROPFIND/GET 会被 CORS 拦截，报 `NetworkError when attempting to fetch resource`。**WebDAV 只能在实际扩展里测**。
3. **`.env.release` 禁止提交**：内含 AMO JWT Secret，已 gitignore；新设备上从旧设备复制或重新生成。
4. **改版本号要三处一致**：`package.json` + `public/manifest.json` +（`npm install` 刷新）`package-lock.json`。
5. **WebDAV 强制 HTTPS**，且 URL 前缀要带结尾 `/`（代码会自动补）。
6. **同步文档字段只能加不能改语义**：旧版本客户端会重建文档（丢弃未知字段）；schemaVersion 不要轻易升。

---

## 7. 发布与自托管更新

### 自动发布（release.ps1）

流程：`npm run check` → `web-ext build`（未签名兜底包）→ 生成源码包（30 个文件，排除 `node_modules/dist/web-ext-artifacts/.git/.env.release/updates.json/xpi`）→ **查重**：`Get-AmoVersion` 若版本已存在则跳过提交直接下载签名 XPI（幂等）→ 否则 `web-ext sign --channel unlisted --upload-source-code <源码包>` → 若 sign 中途网络失败但版本已创建，自动恢复（轮询 + 下载）→ 存为 `bb7581fa1bbf4b928862.xpi` → `updates.json` 幂等追加版本 → 可选 `git add/commit/push`。

要点：

- unlisted（自己分发）无人工审核，自动验证+签名通常 1 分钟内完成（`web-ext sign` 或脚本内 `Wait-ForSigning` 轮询 `file.status == public`）。
- AMO API 凭证：<https://addons.mozilla.org/en-US/developers/addon/api/key/>，JWT issuer（如 `user:12345678:808`）+ secret，存 `.env.release`（格式 `AMO_API_KEY=...` / `AMO_API_SECRET=...`，环境变量优先）。
- 版本已存在时重跑是安全的（幂等恢复），但**同版本不同内容**不会被 AMO 接受——发新内容必须升版本号。

### 自托管更新（update_url）

- manifest 中 `browser_specific_settings.gecko.update_url` → raw GitHub 上的 `updates.json`（必须 HTTPS）。
- `updates.json` 以扩展真实 ID 为 key：`addons["dox-rss-reader@dox.local"].updates[]`，每条 `{version, update_link}`；`update_link` 是 HTTPS 故无需 `update_hash`。
- 文件名 `bb7581fa1bbf4b928862.xpi` 只是约定，Firefox 按 XPI 内部 ID 识别。
- 已装版本沿用**安装时那份** manifest 里的 update_url；0.1.0（无 update_url）需手动装一次 0.2.0+ 才能进入自动更新。
- 检查周期默认 24h，调试时 `about:config` 设 `extensions.update.interval=120`；更新问题看浏览器控制台（Tools > Browser Tools > Browser Console）。
- **raw 链接只服务已提交的文件**：换 XPI / 改 updates.json 后必须 push。

---

## 8. 版本历史

| 版本 | 内容 |
|---|---|
| 0.1.0 | 初版：三栏阅读器、RSS/Atom/RDF 解析、WebDAV 同步、OPML、主题 |
| 0.2.0 | 订阅行"全部标为已读"按钮；`update_url` 自托管更新 + `updates.json` + `bb7581fa1bbf4b928862.xpi` |
| 0.2.1 | 记录并同步"上次全部刷新时间"（`lastRefreshAllAt`）；打开时超过 24h 自动刷新全部；`release.ps1` 一键发布（含幂等/断点恢复） |
| 0.2.2 | 订阅行未读数量移到最左侧（无未读时显示 RSS 图标，>99 显示 99+）；"资料库"标题去掉文章总数；扩展标签页 favicon 显示扩展图标 |
| 0.2.3 | 顶部工具栏新增"全部标为已读"按钮（刷新所有订阅左侧）；`markAllRead` 批量标记全部未读 |
| 0.2.4 | 订阅行图标/未读数与标题加 5px 间距；移动端恢复顶栏同步按钮；顶栏操作区超长时横向滚动（桌面通用） |
| 0.2.5 | 移动端单个订阅标题栏右侧新增"全部标为已读"与"更新订阅"按钮 |
| 0.2.6 | 自定义订阅名称，随 WebDAV 同步 |
| 0.2.7 | 移动端触屏移除 hover 效果，仅保留选中/未选中态；hover 规则统一收进 `@media (hover: hover) and (pointer: fine)` |
| 0.2.8 | 新增 5 种可选配色（墨绿默认/海洋蓝/紫罗兰/暖橙/石墨灰），每种配色带浅色与深色变体，跟随明暗模式自动适配 |
| 0.2.9 | 设置新增"文章列表显示简介"开关（`showItemSnippet`）；关闭后列表行高 62px、标题单行截断、未读点/星标垂直居中 |
| 0.3.0 | 设置子项与分节标题对齐；设置页仅当内容超过视口一半高度时才滚动（`50dvh`）；切换文章后正文滚动回顶部；切换订阅源/视图后文章列表滚动回顶部 |
| 0.3.1 | 移动端选中订阅改用强调色背景 + 左侧色条高亮（此前选中行与面板同色，触屏上几乎无法区分）；设置分区适配竖屏窄屏（收窄内边距、去掉内容缩进，修复配色宫格/分段控件在窄屏被裁出视口）；"文章列表显示简介"开关归入独立的"阅读"分区 |

---

## 9. 跨设备开发检查清单

1. 新设备：`git clone` → `cd "Firefox/Dox Reader"` → `npm ci`。
2. 复制或重建 `.env.release`（AMO 凭证；或在新设备上重新生成 API key 并更新）。
3. 改代码后必跑 `npm run check`。
4. 发版：升版本号（三处）→ `npm run release:push` → 确认 raw 链接 200 → （若 AMO 上有旧版本在排队，脚本会自动恢复下载）。
5. 提交前 `git status` 确认没有 `.env.release` 混入。
