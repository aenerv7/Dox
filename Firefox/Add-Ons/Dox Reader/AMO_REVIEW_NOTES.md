# AMO Reviewer Notes

Version 1.2.3 fixes WebDAV sync and read actions on plain-HTTP deployments by generating IDs without crypto.randomUUID, keeps mark-read usable while feeds refresh in the background, and times out stalled feed requests after 45 seconds. It builds on 1.2.0, which removed the retired Backend mode and brought the extension in line with the web version: optional on-demand full-text extraction, per-feed automatic refresh, shared refresh queuing and the same local-only data model. Firefox desktop/Android 142+, Simplified Chinese UI. The listed extension has no update_url or remote executable code.

## Build

Ubuntu 24.04, Node.js 24+, npm 11+. From the source archive root run npm ci followed by npm run package. This runs Vitest, TypeScript, Vite and web-ext build. Public npm dependencies are locked; credentials are not needed. Output is web-ext-artifacts/dox_reader-1.2.3.zip.

## Data and network

The extension requests user-added RSS/Atom feeds and, only when the user clicks "获取全文", the original article page, directly from the browser. Optional HTTPS WebDAV sync uses PROPFIND/MKCOL for Dox Reader/ and GET/PUT for Dox Reader/state.json. Credentials stay in local extension storage, are used for authentication only, and never enter state.json. WebDAV syncs subscription metadata, read/starred state, last-refresh metadata and selected preferences, not bodies, images, credentials or layout.

Extracted article HTML and image URLs are stored only in the local IndexedDB and are never uploaded. Automatic refresh checks due feeds while the reader page is open; closing the page stops it. There is no backend mode, developer-operated service or remote data store.

Declarations: authenticationInfo covers WebDAV credentials; browsingActivity covers feed/site URLs; websiteActivity covers read/starred state; websiteContent covers subscription titles/custom names and article content. Broad HTTP(S) permissions support arbitrary user-selected feeds, article pages and servers. Browser history is not read. Search runs locally. No analytics or advertising.

Article HTML is rendered by src/article-content.tsx through allowed Preact tags with validated link/image protocols. Images use an origin-only referrer because some hosts reject Referer-less requests. No application innerHTML injection occurs. The single UNSAFE_VAR_ASSIGNMENT warning is in unmodified Preact, unused for feed content. Full-text extraction runs locally with @mozilla/readability after the page is fetched; no remote service processes content.

Runtime: Preact 10.29.8, Dexie 4.4.5, fast-xml-parser 5.10.1, Lucide Preact 1.31.0, @mozilla/readability 0.6.0. Tooling/test versions are in package-lock.json. fake-indexeddb is test-only.
