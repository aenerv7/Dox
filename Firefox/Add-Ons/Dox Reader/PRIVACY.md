# Dox Reader Privacy Policy

Effective date: October 28, 2026

Dox Reader is a local RSS/Atom reader. It has no advertising, analytics, account service, remote executable code or developer-operated server.

## Local data

Subscriptions, feed-provided article bodies, user-requested extracted HTML (including image URLs), read/starred states and sync metadata are stored in the browser's IndexedDB. Appearance, layout and WebDAV credentials are stored in extension storage. Search queries remain on the device. Clearing reader data removes this local library; clearing the extension or browser site data follows the browser's normal behavior.

## WebDAV sync

Sync is optional and connects only to the HTTPS WebDAV location configured by the user. It stores subscriptions, read/starred states, last-refresh metadata and appearance/reading preferences in `Dox Reader/state.json`. Article bodies, images, WebDAV credentials and local layout are not included. Credentials are used in the Authorization header and retained locally for subsequent sync. Use a dedicated application password. Removing credentials disconnects sync but does not delete remote data; delete the file on your WebDAV server to remove it.

## Network requests

The extension connects directly to the feed addresses, original article pages and WebDAV server selected by the user. When the user requests full text, the original article page is fetched directly; extracted HTML and image URLs are stored only in the browser's IndexedDB and are not sent to WebDAV. Feed servers receive ordinary HTTP request information. Article images may load directly from feed- or article-provided HTTP(S) hosts with an origin-only referrer, because some image hosts reject requests without a Referer; image files are not downloaded into IndexedDB. Opening an original article visits its website. No browsing history is inspected.

Automatic refresh runs only while the reader page is open and only requests feeds that are due; closing the page stops it. WebDAV connections require HTTPS.
