# Dox Reader Backend Privacy

The backend runs in the user's own Cloudflare account. It stores subscription addresses and names, article titles, authors, URLs, feed-provided bodies and snippets, publication dates, read/starred state, fetch schedules, retention settings and operational counters in SQLite-backed Durable Objects.

The reader sends its backend access token only to the configured HTTPS backend using the Authorization header. The token remains in local browser settings and Cloudflare secrets, and is not included in article records. All API operations require that token. Possession of it grants access to the personal library.

The backend requests user-added public RSS/Atom feeds on a schedule and on manual refresh, even when no reader is open. Feed servers receive ordinary HTTP request information from Cloudflare and a fixed Dox Reader User-Agent that contains no user or device identifier. The backend does not download article images or crawl linked pages for full text. Displaying images in the reader can contact their original hosts.

The backend operator controls retention; the global latest-article limit applies to all articles including unread and starred items. Removed records are deleted from the live database; Cloudflare's platform backups and logs are governed by the user's Cloudflare configuration and policies. No data is sent to a developer-operated Dox Reader service. There is no advertising or analytics code.
