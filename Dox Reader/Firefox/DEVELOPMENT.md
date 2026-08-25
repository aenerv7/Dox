# Firefox 版开发说明

## 目录职责

```text
Dox Reader/Firefox/
├── public/                 # manifest.json 与扩展图标
├── src/
│   ├── app.tsx             # Preact 主界面
│   ├── background.ts       # 单击工具栏按钮时打开或聚焦阅读器
│   ├── database.ts         # Dexie/IndexedDB 持久层
│   ├── runtime-fetch.ts    # RSS 与 WebDAV 直接请求
│   ├── settings.ts         # browser.storage.local 设置存储
│   ├── sync-model.ts       # Lamport/LWW 同步合并
│   └── webdav.ts           # PROPFIND/MKCOL/GET/PUT 客户端
├── test/                   # 测试 fixture
├── release.ps1            # AMO 签名与自托管更新发布
├── updates.json            # Firefox 自托管更新清单
└── package.json
```

## 数据约定

IndexedDB 数据库名为 `dox-rss-reader`。WebDAV 文档使用 schema v1，位置为 `{用户 URL 前缀}/Dox Reader/state.json`。订阅以整条记录的 Lamport 版本进行 LWW 合并；已读与收藏分别使用独立寄存器，避免不同设备对两个字段的修改互相覆盖。

WebDAV 用户名和密码只存放在本机 `browser.storage.local`，不会写入同步文档。修改 schema 时必须考虑 Cloudflare Workers 版以及旧扩展版本的兼容性。

## 提交前检查

```powershell
npm ci
npm run check
npm run package
```

`npm run check` 会运行 Vitest、TypeScript 检查和生产构建。`npm run package` 还会通过固定版本的 `web-ext` 生成包。不要提交 `.env.release`、`node_modules/`、`dist/` 或 `web-ext-artifacts/`。

功能逻辑也存在于相邻的 `../Cloudflare Workers/src/`。任何 Dox Reader 核心修改都必须遵循根级 [`../DEVELOPMENT.md`](../DEVELOPMENT.md) 的跨版本同步要求；`runtime-fetch.ts`、`settings.ts`、`main.tsx` 与后台/Worker 入口属于平台专用实现。
