import path from "node:path";
import {fileURLToPath} from "node:url";

import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: path.resolve(__dirname),
  publicDir: path.resolve(__dirname, "public"),
  plugins: [react()],
  build: {
    outDir: path.join(__dirname, "dist"),
    emptyOutDir: true,
    target: "firefox140",
    cssCodeSplit: false,
    // Extension assets load from the local package, so the web-oriented 500 kB warning doesn't apply.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      input: {
        popup: path.resolve(__dirname, "popup.html"),
      },
      output: {
        codeSplitting: {
          groups: [
            {name: "fluent-vendor", test: /node_modules[\\/]@(fluentui|griffel)[\\/]/, priority: 30},
            {name: "react-vendor", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 20},
            {name: "vendor", test: /node_modules[\\/]/, priority: 10},
          ],
        },
      },
    },
  },
});
