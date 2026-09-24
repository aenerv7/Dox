# sub-store-front-end（Cloudflare Worker）

把 [Sub-Store-Front-End](https://github.com/sub-store-org/Sub-Store-Front-End) 的 release 产物作为静态资源跑在 Cloudflare Workers 上。

后端见 [`sub-store`](../sub-store/README.md)。维护规范见仓库根 [`DEVELOPMENT.md`](../DEVELOPMENT.md#317-sub-storecloudflare-workers)。

## 部署

由 `.github/workflows/deploy-sub-store.yml` 与后端一起自动部署，每天北京时间 05:00 拉取上游最新 release；也可在 Actions 页面手动触发。

只需要与后端相同的两个 Secret：`CLOUDFLARE_API_TOKEN`（Account → Workers Scripts → Edit）、`CLOUDFLARE_ACCOUNT_ID`。本项目**不需要**数据库、secret 或变量。

## 首次使用

1. 打开 `https://sub-store-front-end.<你的子域>.workers.dev`。
2. 在「后端地址」里填 `https://sub-store.<你的子域>.workers.dev/<口令>`（结尾的 `/<口令>` 不能省）。
3. 保存后即可管理订阅。

也可以直接带参数打开，自动完成配置：

```text
https://sub-store-front-end.<你的子域>.workers.dev/?api=https://sub-store.<你的子域>.workers.dev/<口令>
```

## 说明

- 纯静态资源 Worker，没有 `main` 入口，不做任何请求改写；`not_found_handling` 为 SPA 回退。
- 构建时会把上游默认后端 `https://sub.store` 清空。上游默认指向公开站点，未配置后端时可能误发请求（Sub-Store README 有数据泄露提示）。需要固定默认后端时设环境变量 `SUB_STORE_DEFAULT_BACKEND`。
- 免费额度：静态资源请求与 Worker 共用每天 100,000 次；文件数与单文件大小上限（20,000 个 / 25 MiB）远未触及。

## 本地开发

```bash
cd sub-store-front-end
npm ci
npm run build   # 下载上游最新 release 的 dist.zip 并解压到 dist/
npm run deploy  # 认证交给 wrangler：本地 login 或 CI 的 API Token
```
