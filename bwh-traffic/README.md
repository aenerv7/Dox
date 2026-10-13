# bwh-traffic

把 BandwagonHost（搬瓦工）KiwiVM 的流量用量转成 Sub-Store 能读的订阅响应头。

Sub-Store 从远程订阅的响应头里读 `subscription-userinfo`（`upload` / `download` / `total` / `expire`），本 Worker 就只提供这个头，正文是 `OK`，不含任何节点。

```text
Sub-Store ──▶ bwh-traffic Worker ──▶ 中转 ──▶ api.64clouds.com/v1/getServiceInfo
                    │
                    └─ 响应头: subscription-userinfo: upload=0; download=<已用>; total=<配额>; expire=<下次重置>
```

## 它为什么需要中转

**Cloudflare Worker 现在无法直连 KiwiVM API。** `api.64clouds.com` 在 Cloudflare 后面，其网关对来自 Cloudflare 自身出口的 `/v1/*` 请求一律返回：

```json
{ "success": true, "token": 38481974907714 }
```

无论 GET / POST、有无 User-Agent、是否带浏览器头、换 host 或路径，结果都一样；同一个请求从非 Cloudflare 出口（本机 curl、第三方 reader）就能拿到正常响应。也就是说 VEID 和 API Key 根本没参与校验——换个错的 Key 也是同样的 token 响应。2026-10 实测结论，详见 [DEVELOPMENT.md 第 3.18 节](../DEVELOPMENT.md#318-bwh-trafficbandwagonhost-流量订阅头)。

所以 `KIWIVM_BASE` 必须指向一个不在 Cloudflare 上的中转，由它转发 `/getServiceInfo`。没有中转时 Worker 会明确报错并提示这一条。

## 部署

```powershell
cd bwh-traffic
npx wrangler deploy
npx wrangler secret put ACCESS_TOKEN     # 访问口令，任意随机串
npx wrangler secret put BWH_VEID         # KiwiVM 面板里的 VEID
npx wrangler secret put BWH_API_KEY      # KiwiVM 面板 API 页的 private_ 开头的 Key
npx wrangler secret put KIWIVM_BASE      # 中转地址，例如 https://relay.example.com/kiwivm/v1
```

| 变量 | 必填 | 说明 |
|---|---|---|
| `ACCESS_TOKEN` | 否 | 设置后必须带 `?token=<值>` 才能访问；不设置则公开可读 |
| `BWH_VEID` | 是 | KiwiVM 的 VEID |
| `BWH_API_KEY` | 是 | KiwiVM 的 API Key（`private_` 开头） |
| `KIWIVM_BASE` | 否 | 中转基地址，默认 `https://api.64clouds.com/v1`（直连，当前会失败） |
| `KIWIVM_RELAY_TOKEN` | 否 | 设置后每个上游请求带 `X-Relay-Token` 头，供中转做共享口令校验 |

`BWH_VEID`、`BWH_API_KEY`、`ACCESS_TOKEN` 一律走 `wrangler secret put`：secret 在 `wrangler deploy` 之间会保留，而 `wrangler.jsonc` 里的明文 `vars` 会被每次部署覆盖，把口令放进去等于每次上云都要重新配一遍。

## 中转

任何不在 Cloudflare 上的 HTTP 服务都行，只需把 `/getServiceInfo` 连同查询串转发给 `https://api.64clouds.com/v1/getServiceInfo`。自己的 VPS 用 nginx：

```nginx
location /kiwivm/v1/ {
    # 共享口令，与 KIWIVM_RELAY_TOKEN 一致；不用口令就删掉这两行
    if ($http_x_relay_token != "<共享口令>") { return 403; }

    proxy_pass https://api.64clouds.com/v1/;
    proxy_ssl_server_name on;
    proxy_set_header Host api.64clouds.com;
}
```

放在 Cloudflare 后面的域名也可以：被拒的是 Cloudflare 访问 `api.64clouds.com` 这条腿，不是 Cloudflare 访问你自己的源站。

其他形态的中转同理（Deno Deploy、另一台 VPS、家里的机器 + Cloudflare Tunnel 等）。Worker 只管把 `/getServiceInfo` 接到 `KIWIVM_BASE` 后面。

## 在 Sub-Store 里用

把 `https://<worker 域名>/?token=<ACCESS_TOKEN>` 当作远程订阅地址添加。Sub-Store 会读响应头里的 `subscription-userinfo` 显示流量；正文没有节点，节点请照常由其他订阅提供。

## 排查

```powershell
# 回显上游 HTTP 状态、返回字段、原始正文和算出来的 userinfo
curl.exe "https://<worker 域名>/?debug=1&token=<ACCESS_TOKEN>"

# 单元测试
node --test bwh-traffic/worker.test.js
```

`upstream_keys` 是 `["success","token"]` 就说明还在走 Cloudflare 出口，`KIWIVM_BASE` 没配好或中转自己也在 Cloudflare 上。

## 维护约束

- 成功响应近几个月是平铺字段（`error`、`plan_monthly_data`、`data_counter`、`monthly_data_multiplier`、`data_next_reset`）；代码兼容网关加 `data` 信封的情况。
- 用量一律按字节、口径为 `字段 × monthly_data_multiplier`；搬瓦工双向计费，已用量统一写进 `download`。
- `expire` 用 `data_next_reset`（下次流量重置时间），不是套餐到期时间。这是 Sub-Store 流量条能拿到的最接近的值。
- `redirect: "manual"` + 3xx 判失败：Workers 不支持 `redirect: "error"`，所以手动拒绝重定向，避免 API Key 被转发到第二个主机。
