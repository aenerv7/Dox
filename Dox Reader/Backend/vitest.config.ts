import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

const bindings = {
  BACKEND_TOKEN: "test-only-token-not-for-production-123456",
};

// 两个独立工程：默认免费档，以及显式声明 PLAN=paid 的付费档。
// 档位来自部署变量，因此必须分别用真实 runtime 验证，不能只在纯函数层测试。
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: { bindings },
          }),
        ],
        test: { name: "free", include: ["test/backend.test.ts"] },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: { bindings: { ...bindings, PLAN: "paid" } },
          }),
        ],
        test: { name: "paid", include: ["test/paid.test.ts"] },
      },
    ],
  },
});
