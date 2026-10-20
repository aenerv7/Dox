import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact()],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
