import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          BACKEND_TOKEN: "test-only-token-not-for-production-123456",
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
});
