# Dox Reader Privacy Policy

Effective date: September 8, 2026

Dox Reader is a frontend RSS/Atom reader with a default local mode and an optional connection to a user-operated Dox Reader Backend. No shared developer-operated service is required. There is no advertising, analytics, or remote executable code.

## Local mode

Subscriptions, article content, read/starred state and preferences are stored in the browser. Firefox connects directly to user-added feeds; the web frontend uses its self-hosted Worker feed proxy.

Optional WebDAV synchronization sends subscription URLs, titles, custom names, read/starred state, selected appearance preferences and merge metadata to the user's HTTPS WebDAV server, in Dox Reader/state.json. Article bodies, search queries and credentials are not included in that file. Credentials are sent to that server only for authentication (through the user's frontend Worker proxy in the web version).

## Backend mode

The user explicitly selects Backend mode and supplies an HTTPS backend address and access token. The reader sends subscription additions/deletions/renames, read/starred changes, fetch requests and retention/scheduling settings to that backend. It downloads subscription metadata, article titles, authors, URLs, feed-provided content and state from the backend. WebDAV is not used in this mode.

Dox Reader Backend stores this personal library in SQLite-backed Durable Objects in the operator's Cloudflare account. It fetches user-added feeds on a schedule even when all clients are closed. The default is every 60 minutes and the latest 10000 articles across all feeds. The user may change these settings within the supported limits. Retention applies to unread and starred items too. Images are not archived and long article bodies may be shortened.

The backend token is stored in Firefox extension storage or web localStorage and sent only in the Authorization header to the configured backend. It is not included in article data or WebDAV sync. Possession of the token grants access to that backend. The operator must keep it private. Search queries and local appearance/layout settings remain in the browser.

## Cache and control

Local-mode data and per-backend caches are separate. Switching modes does not upload local articles, merge the two libraries, or delete them. In backend mode, article lists and previously opened bodies may remain cached for offline reading. Clearing the local cache does not erase server data. Uninstalling the extension or clearing browser site data removes local data according to the browser's normal behavior.

Removing backend settings disconnects that reader but does not stop the independently deployed backend. To stop background fetching, remove its subscriptions or disable the backend deployment. Retention and subscription deletion remove articles from the live backend database; Cloudflare platform backups/logs are governed by the operator's account settings and Cloudflare policies.

## Network requests and security

Feed servers receive ordinary HTTP request information. Article images can load from HTTP(S) hosts in feed content; the reader uses no-referrer on image requests. Clicking an original-article link opens its website. Backend and WebDAV connections require HTTPS. No browser history is inspected. Request authorization values are not logged by application code; Cloudflare may collect platform-level logs and telemetry for the operator.

Questions: https://github.com/aenerv7/Dox/issues
