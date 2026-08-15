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

The resulting extension archive is `web-ext-artifacts/dox_reader-0.1.0.zip`. All dependencies are installed from the public npm registry using the committed `package-lock.json`.

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

The privacy policy is in [`PRIVACY.md`](PRIVACY.md). Reviewer-specific build, dependency, permission, and network notes are in [`AMO_REVIEW_NOTES.md`](AMO_REVIEW_NOTES.md).

## Sync format

The sync document uses schema version 1. A subscription has one Lamport version. Read and starred values are independent last-writer-wins registers, so changing one field on one device does not overwrite a newer change to the other field on another device. Deletions are retained as subscription tombstones.
