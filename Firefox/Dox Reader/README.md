# Dox Reader

A local-first RSS/Atom reader for Firefox desktop and Firefox for Android. Subscriptions, read state, and starred state synchronize through a user-provided WebDAV JSON file; article bodies remain in each browser's IndexedDB.

## Scope

- One responsive WebExtension for desktop and Android Firefox
- Manual feed refresh; no background polling or notifications
- RSS 2.0, Atom, and common RDF feed parsing
- Local article cache, search, read/unread state, and starring
- WebDAV sync with ETag/`If-Match` conflict retries
- Deterministic per-field merge using Lamport versions and device IDs
- OPML import and export
- System, light, and dark themes

The extension requests access to all HTTP and HTTPS sites because private builds need to fetch arbitrary feed and WebDAV URLs directly. It does not collect or transmit data to the developer.

## Development

Requirements: Node.js 24 or later, npm 11 or later, and a current Firefox installation. The project builds in AMO's default Ubuntu 24.04 review environment; it does not require platform-specific tools.

```powershell
npm ci
npm run check
npm run dev
```

To reproduce the submitted extension archive from a clean source package:

```text
npm ci
npm run package
```

The resulting extension archive is `web-ext-artifacts/dox_reader-0.2.4.zip`. All dependencies are installed from the public npm registry using the committed `package-lock.json`.

Because the extension ships as a compiled bundle, AMO requires the source code alongside the signed XPI. Produce the source archive with `release.ps1` (see below) or any zip tool, keeping the repository layout intact — `package.json`, `package-lock.json`, `index.html`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `public/`, `src/`, and `test/`. Reviewers reproduce the build by running `npm ci` and `npm run package` from the extracted archive.

To run the built extension in desktop Firefox:

```powershell
npm run build
npx --yes web-ext@10.6.0 run --source-dir dist
```

To run it on a USB-connected Android device with remote debugging enabled:

```powershell
npm run build
npx --yes web-ext@10.6.0 run --source-dir dist --target firefox-android --android-device <device-id> --firefox-apk org.mozilla.firefox
```

## WebDAV setup

Enter the URL prefix of an existing WebDAV location. For example:

```text
https://dav.example.com/remote.php/dav/files/user/
```

The extension creates `Dox Reader/` under that location and stores the sync document at `Dox Reader/state.json`. HTTPS is required. Use an application-specific password where the provider supports one. The folder and file are created automatically when testing the connection or synchronizing for the first time.

The remote file contains subscription metadata and item state only. The WebDAV username and password remain in `browser.storage.local` on each device.

## Private AMO distribution

1. Run `npm run package` to produce an XPI-compatible ZIP in `web-ext-artifacts`.
2. Submit the package on AMO and choose **On your own** / unlisted distribution.
3. Download the signed XPI returned by AMO.
4. Install the signed XPI in desktop Firefox.
5. On Android Firefox, unlock **Install Extension from File** by opening **Settings > About Firefox** and tapping the Firefox logo five times, then select the signed XPI.

The fixed extension ID is `dox-rss-reader@dox.local`, so updates retain the same local database and settings.

## Automated release

`release.ps1` automates the whole cycle — build, source archive, AMO submission, signing wait, XPI download, and update-manifest bump:

```powershell
npm run release          # everything up to git push
npm run release:push     # also commits and pushes
pwsh -File release.ps1 -SkipSign   # dry run: check + build + source archive only
```

Setup once:

1. Create AMO API credentials at <https://addons.mozilla.org/en-US/developers/addon/api/key/>.
2. Put them in a local `.env.release` file in this directory (gitignored, never committed), or export `AMO_API_KEY` (JWT issuer, e.g. `user:12345678` or `user:12345678:808`) and `AMO_API_SECRET` (JWT secret) as environment variables.
3. The add-on must already exist on AMO. Because the manifest carries a fixed extension ID, `web-ext sign` always targets that existing add-on and never creates a new one.

How it works: `web-ext sign` submits the built `dist/` to the unlisted channel with `--upload-source-code` (the source archive AMO requires for compiled bundles). Unlisted add-ons are validated and signed automatically — no human review — and the command polls until signing finishes, then downloads the signed XPI. The script then saves it as `bb7581fa1bbf4b928862.xpi` and appends the version to `updates.json`.

The script is idempotent: before submitting it checks the AMO API, and if the version already exists (e.g. a previous run was interrupted after the submission landed), it skips the upload and downloads the signed XPI directly. The same recovery kicks in automatically if `web-ext sign` fails mid-poll after creating the version.

Before running, bump the version in `package.json` and `public/manifest.json` (and `npm install` to refresh `package-lock.json`).

## Self-hosted updates

The manifest points `browser_specific_settings.gecko.update_url` at `updates.json` in this directory (served over HTTPS via GitHub raw). The update manifest is keyed by the fixed extension ID and references the XPI file `bb7581fa1bbf4b928862.xpi`:

- Replace `bb7581fa1bbf4b928862.xpi` with the **AMO-signed** XPI for each release (an unsigned build does not auto-update; Firefox verifies the signature of downloaded updates).
- When releasing a new version, add an entry to the `updates` array in `updates.json` and commit both files. The `update_link` is HTTPS, so no `update_hash` is required.
- Existing installs keep using the `update_url` baked into the version they have installed. Installs of 0.1.0 (no `update_url`) must install 0.2.0 manually once; subsequent versions auto-update.
- Firefox checks for updates every 24 hours by default; set `extensions.update.interval` to `120` in `about:config` to test more quickly.

The privacy policy is in [`PRIVACY.md`](PRIVACY.md). Reviewer-specific build, dependency, permission, and network notes are in [`AMO_REVIEW_NOTES.md`](AMO_REVIEW_NOTES.md). A complete architecture and cross-device development reference is in [`DEVELOPMENT.md`](DEVELOPMENT.md).

## Sync format

The sync document uses schema version 1. A subscription has one Lamport version. Read and starred values are independent last-writer-wins registers, so changing one field on one device does not overwrite a newer change to the other field on another device. Deletions are retained as subscription tombstones.
