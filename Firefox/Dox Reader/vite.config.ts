import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const web = mode === "web";
  const input: Record<string, string> = {
    reader: fileURLToPath(new URL("index.html", import.meta.url)),
  };
  if (!web) input.background = fileURLToPath(new URL("src/background.ts", import.meta.url));

  return {
    plugins: [preact()],
    publicDir: web ? "public-web" : "public",
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input,
        output: {
          entryFileNames: (chunk) =>
            chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
