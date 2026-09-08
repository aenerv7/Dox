# AMO Reviewer Notes

Version 1.1.0 adds an optional user-operated backend; local mode remains the default. Firefox desktop/Android 142+, Simplified Chinese UI. The listed extension has no update_url or remote executable code.

## Build

Ubuntu 24.04, Node.js 24+, npm 11+. From the source archive root run npm ci followed by npm run package. This runs Vitest, TypeScript, Vite and web-ext build. Public npm dependencies are locked; credentials are not needed. Output is web-ext-artifacts/dox_reader-1.1.0.zip.

## Data and network

Local mode requests user-added RSS/Atom feeds directly. Optional HTTPS WebDAV sync uses PROPFIND/MKCOL for Dox Reader/ and GET/PUT for Dox Reader/state.json. Credentials stay in local extension storage, are used for authentication only, and never enter state.json. WebDAV syncs subscription metadata, read/starred state and selected preferences, not bodies or search queries.

Backend mode is explicitly selected in Settings. The user provides an HTTPS root URL and bearer token for their own Dox Reader Backend. POST /api/v1 sends commands to manage subscriptions, update read/starred state, trigger fetching and configure the interval/retention. The backend returns article metadata/content and state. It persists these in the user's Cloudflare Durable Object and continues scheduled fetching with clients closed. No shared developer service is used. Token is stored in browser.storage.local, only sent in Authorization; redirects are rejected. No WebDAV runs in backend mode. Local database and per-backend IndexedDB caches stay separate; local articles are not automatically uploaded. Theme and layout remain device-local in backend mode.

Declarations: authenticationInfo covers WebDAV credentials/backend token; browsingActivity covers feed/site URLs; websiteActivity covers read/starred state; websiteContent covers subscription titles/custom names. Broad HTTP(S) permissions support arbitrary user-selected feeds and servers. Browser history is not read. Search runs locally. No analytics or advertising.

Article HTML is rendered through allowed Preact tags by src/article-content.tsx, with validated link/image protocols. Images can contact feed-specified HTTP(S) hosts with no-referrer. No application innerHTML injection occurs. The single UNSAFE_VAR_ASSIGNMENT linter warning is in unmodified Preact's renderer (its optional dangerouslySetInnerHTML support), unused for feed content.

Runtime: Preact 10.29.8, Dexie 4.4.5, fast-xml-parser 5.10.1, Lucide Preact 1.31.0. Tooling/test versions are in package-lock.json. fake-indexeddb is test-only.
