import {copyFile, mkdir, readFile, readdir, writeFile} from "node:fs/promises";
import path from "node:path";

const legalName = /licen[cs]e|(?:^|[._-])copying|copyright|notice|third[\s._-]*party|patents|attributions/i;
const upstreamTexts = new Map([
  ["@fluentui/react-icons@2.0.344", "@fluentui/react-icons@2.0.344"],
  ...["embla-carousel", "embla-carousel-autoplay", "embla-carousel-fade"].map(name =>
    [`${name}@8.6.0`, "embla-carousel{,-autoplay,-fade}@8.6.0"]),
]);

async function copyFileTo(source, target) {
  await mkdir(path.dirname(target), {recursive: true});
  await copyFile(source, target);
}

async function copyLegalFiles(source, target, folder = "", inLegalFolder = false) {
  const files = [];
  for (const entry of await readdir(path.join(source, folder), {withFileTypes: true})) {
    if (entry.name === "node_modules" || entry.name === ".git") { continue; }
    const rel = path.posix.join(folder, entry.name);
    const legal = inLegalFolder || legalName.test(entry.name);
    if (entry.isDirectory()) {
      files.push(...await copyLegalFiles(source, target, rel, legal));
    } else if (legal && entry.isFile()) {
      await copyFileTo(path.join(source, rel), path.join(target, rel));
      files.push(rel);
    }
  }
  return files;
}

export async function copyLicenses(appRoot, outDir) {
  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.txt"]) {
    await copyFileTo(path.join(appRoot, name), path.join(outDir, name));
  }
  await copyFileTo(path.join(appRoot, "vendor/cat-catch/LICENSE"), path.join(outDir, "licenses/cat-catch/LICENSE"));
  const notices = await readFile(path.join(appRoot, "THIRD_PARTY_NOTICES.txt"), "utf8");
  const lock = JSON.parse(await readFile(path.join(appRoot, "package-lock.json"), "utf8"));
  if (lock.lockfileVersion !== 3) { throw new Error("Expected npm lockfile version 3"); }

  const npmDir = path.join(outDir, "licenses/npm");
  await mkdir(npmDir, {recursive: true});
  const index = [];
  for (const [location, pkg] of Object.entries(lock.packages)) {
    if (!location || pkg.dev) { continue; }
    const source = path.join(appRoot, location);
    let installed;
    try {
      installed = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT" && (pkg.optional || pkg.devOptional)) { continue; }
      throw error;
    }
    if (installed.version !== pkg.version) { throw new Error(`Run npm ci: ${location} does not match lockfile`); }

    // Preserve npm's install paths: nested packages can have distinct versions.
    const output = location.replace(/^node_modules\//, "");
    const target = path.join(npmDir, output);
    const files = await copyLegalFiles(source, target);
    const name = installed.name;
    const id = `${name}@${pkg.version}`;
    const appendix = upstreamTexts.get(id);
    if (appendix) {
      const required = name === "@fluentui/react-icons" ? ["LICENSE", "NOTICE"] : ["LICENSE"];
      const sections = notices.replaceAll("\r\n", "\n").split("\n--- ");
      for (const file of required) {
        const section = sections.find(text => text.startsWith(`${appendix}/${file} ---\nSource: `));
        if (!section) { throw new Error(`Missing notice appendix: ${id}/${file}`); }
        const body = section.slice(section.indexOf("\n\n") + 2, -1);
        await mkdir(target, {recursive: true});
        await writeFile(path.join(target, file), body);
        files.push(file);
      }
    }
    if (!files.some(file => /licen[cs]e|copying/i.test(file))) {
      throw new Error(`Missing license text for ${id}: add the upstream license before distributing`);
    }
    index.push({name, version: pkg.version, license: pkg.license, path: output, files: files.sort()});
  }
  await writeFile(path.join(npmDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
}
