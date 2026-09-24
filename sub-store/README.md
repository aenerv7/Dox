# sub-store（Cloudflare Worker）

把 [Sub-Store](https://github.com/sub-store-org/Sub-Store) 后端跑在 Cloudflare Workers 上，用 D1 存数据、用路径口令鉴权，全部落在免费额度内。

前端见 [`sub-store-front-end`](../sub-store-front-end/README.md)。维护规范见仓库根 [`DEVELOPMENT.md`](../DEVELOPMENT.md#317-sub-storecloudflare-workers)。

## 部署前提

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加三个 Secret：

| Secret | 说明 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token，权限：**Account → Workers Scripts → Edit**、**Account → D1 → Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard 右侧的 Account ID |
| `SUB_STORE_TOKEN` | 自定义的后端路径口令，只能用 `A-Z a-z 0-9 . _ ~ -`，建议 24 位以上随机串 |

Token 在 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) 用 **Create Custom Token** 创建，权限选上面两项即可。

## 触发部署

`.github/workflows/deploy-sub-store.yml` 会自动：

- **每天北京时间 05:00**（UTC 21:00）拉取 Sub-Store 与 Sub-Store-Front-End 的最新 release 重新部署；
- 在 Actions 页面 **Run workflow** 手动触发。

部署脚本会自动创建 D1 数据库 `sub-store`、执行 migration、写入 `SUB_STORE_TOKEN`，并在结束时自检线上接口。

## 拿到后端地址

部署日志末尾会打印：

```text
后端就绪：https://sub-store.<你的子域>.workers.dev/<口令>
```

前端「后端地址」里就填这一整串（**结尾的 `/<口令>` 不能省**）。

可以直接验证：

```bash
curl https://sub-store.<你的子域>.workers.dev/<口令>/api/utils/env
```

- 带口令 → 200，返回后端版本信息；
- 不带口令 → 404。

## 自定义域名

给 Worker 绑自定义域名后 CORS 不受影响：本部署固定返回 `Access-Control-Allow-Origin: *`，任何前端域名都能访问。

## 免费额度与限制

| 项 | 情况 |
|---|---|
| Worker 请求 | 免费版 100,000 次/天 |
| Worker CPU | 免费版 **10 ms/请求**；订阅转换较重，节点特别多时可能超时（Error 1102） |
| D1 | 免费版 5 GB、500 万行读/天、10 万行写/天，个人使用远用不满 |
| Worker 数量 | 免费版 100 个，本部署占 2 个 |

功能上的取舍（Cloudflare Workers 运行时禁止 `eval` / `new Function`）：

- **不支持**「脚本过滤」「脚本操作」「修改响应」，使用时后端会返回明确报错；前端界面照常显示这些选项，请勿使用。
- **不支持**依赖 Node 内建模块的能力：本地文件路径订阅、GeoIP/MMDB、UDP/TLS 直连 DNS、请求代理（`proxy`）、跳过证书校验（`insecure`）。
- 上游 `resolve-domain` 走 DNS over HTTPS 时正常。
- 定时同步（`SUB_STORE_BACKEND_SYNC_CRON`）是 Node 专属，本部署不提供；需要定时拉取时用外部定时请求 `/api/sync/artifacts`。
- 数据是「一个 isolate 一份内存缓存 + D1 落盘」。单 isolate 内并发请求已隔离，但多 isolate 同时写入仍有极小概率丢更新（与上游 Node 版同源问题）。

## 本地开发

```bash
cd sub-store
npm ci
npm run build   # 拉取上游最新 release 源码并打包成 build/worker.mjs
npm run check   # 构建 + 冒烟测试
```

冒烟测试用 `node:vm` 的 `codeGeneration.strings = false` 复刻 Workers 禁止动态求值的约束，并覆盖路由、CORS、D1 读写、订阅下载、并发隔离和 peggy 解析器。`SMOKE_VERBOSE=1` 可打印 Sub-Store 日志。

部署需要先准备 Cloudflare 资源（认证交给 wrangler，本地 OAuth 或下面的环境变量都行）：

```bash
npx wrangler login          # 本地登录；CI 里改用 CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
node scripts/prepare.mjs    # 创建 D1 数据库并渲染 wrangler.deploy.jsonc
SUB_STORE_TOKEN=<你的口令> npm run deploy
```
