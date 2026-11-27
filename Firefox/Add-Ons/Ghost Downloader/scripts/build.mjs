import {cp} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {build as esbuild} from "esbuild";
import {build as viteBuild} from "vite";
import {copyLicenses} from "./licenses.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = path.join(root, "dist");
const vendor = path.join(root, "vendor/cat-catch");

await viteBuild({configFile: path.join(root, "vite.config.ts"), mode: "production"});
for (const [source, output, format] of [
  ["background", "background", "esm"],
  ["content-script", "content-script", "iife"],
  ["page-media/attribution/mse-probe", "page-media-probe", "iife"],
  ["page-media/media-button/media-button", "page-media-overlay", "iife"],
]) {
  await esbuild({
    entryPoints: [path.join(root, `src/${source}.ts`)],
    outfile: path.join(outDir, `${output}.js`),
    bundle: true, format, target: "firefox140", platform: "browser",
  });
}
await cp(path.join(vendor, "catch-script"), path.join(outDir, "catch-script"), {recursive: true});
await cp(path.join(vendor, "js/content-script.js"), path.join(outDir, "cat-catch-content-script.js"));
await copyLicenses(root, outDir);
