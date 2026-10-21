# Dox Reader privacy notice

Dox Reader is a local RSS/Atom reader. It has no advertising, analytics, account service, or remote executable code.

## Local data

Subscriptions, feed-provided article bodies, user-requested extracted HTML (including image URLs), read/starred states and sync metadata are stored in the browser's IndexedDB. Appearance, layout and WebDAV credentials are stored in localStorage. Search queries remain on the device. Clearing site data removes this local library; clearing reader data does not delete the WebDAV file.

## WebDAV sync

Sync is optional and connects only to the HTTPS WebDAV location configured by the user. It stores subscriptions, read/starred states, last-refresh metadata and appearance/reading preferences in `Dox Reader/state.json`. Article bodies, images, WebDAV credentials and local layout are not included. Credentials are used in the Authorization header and retained locally for subsequent sync. Use a dedicated application password. Removing credentials disconnects sync but does not delete remote data; delete the file on your WebDAV server to remove it.

## Network requests

The web app uses its same-origin Cloudflare Worker as a stateless proxy for feeds, original article pages and WebDAV requests to work around browser CORS restrictions. This proxy does not maintain a reader database, schedule feed fetching or store a personal library. The deployment operator handles proxied WebDAV credentials and request contents, so use a deployment you trust. Cloudflare platform logs/telemetry are governed by the operator's account and Cloudflare policies; application code does not log authorization values.

Feed servers receive ordinary HTTP request information and a fixed Dox Reader User-Agent without user/device identifiers. Article images may load directly from feed- or article-provided HTTP(S) hosts with an origin-only referrer (the deployment origin), because some image hosts reject requests without a Referer; image files are not downloaded into IndexedDB. When the user requests full text, the configured Worker fetches the original article through `/api/article`; the deployment operator can observe that request and its response, while extracted HTML and image URLs are stored only in the browser's IndexedDB and are not sent to WebDAV. Opening an original article visits its website. No browsing history is inspected. Closing the reader stops client-driven refresh and sync.
