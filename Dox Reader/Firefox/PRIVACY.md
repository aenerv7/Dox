# Dox Reader Privacy Policy

Effective date: August 24, 2026

Dox Reader is a local-first RSS reader available as a Firefox extension and a self-hosted Cloudflare Worker web app. The developer does not operate a Dox Reader service and does not receive, collect, sell, or analyze user data. The application contains no advertising, analytics, or remote executable code. Cloudflare may provide platform-level request logs and telemetry to the owner of a self-hosted Worker under that owner's Cloudflare configuration and Cloudflare's policies.

## Data Stored Locally

The application stores subscriptions, user-defined subscription display names, downloaded feed articles, read and starred state, layout preferences, WebDAV settings, and WebDAV credentials in the user's browser profile. The extension uses extension storage; the web app uses IndexedDB and localStorage under its deployed origin. Article bodies and search queries remain local and are not included in the WebDAV synchronization file.

## Network Requests

Dox Reader makes network requests only for its primary functions:

- When the user adds or refreshes a feed, Dox Reader requests that user-provided RSS or Atom URL. The extension connects directly. The web app relays the request through the Worker in the user's Cloudflare account. The feed server receives the network information normally associated with an HTTP request.
- When an article is displayed, its images may load directly from HTTP(S) hosts specified in the feed content. Those hosts receive normal network request information; the extension sets a no-referrer policy on article images.
- When the user configures and uses WebDAV synchronization, Dox Reader connects only to the HTTPS WebDAV URL supplied by the user. The extension connects directly. The web app relays the request and authentication header through the self-hosted Worker. The WebDAV username and password are sent to the WebDAV server for authentication, but are not stored by Worker code or included in the synchronization file.
- The synchronization file contains subscription URLs, titles, optional user-defined display names, site URLs, read and starred state, appearance and reading preferences, timestamps, and identifiers used to merge changes between the user's devices. It does not contain downloaded article bodies, search queries, or WebDAV credentials.

The WebDAV data is stored in `Dox Reader/state.json` on the server selected and controlled by the user. The developer has no access to that server or file. The Worker implementation is stateless and does not use Cloudflare KV, D1, R2, or other persistent Cloudflare storage.

## User Control and Retention

WebDAV synchronization is disabled until the user enters WebDAV settings. Removing those settings stops synchronization. The user can delete local data from the extension settings and can delete `Dox Reader/state.json` from the WebDAV server at any time.

Uninstalling the extension removes data held in the Firefox extension profile according to Firefox's normal extension-data behavior. Clearing site data for the deployed web origin removes its browser-local data. Neither action deletes data from the user's WebDAV server.

## Security

Dox Reader requires HTTPS for WebDAV synchronization. Users should use an application-specific WebDAV password where their provider supports one.

## Changes

Any material change to the data handled or transmitted by the extension will be reflected in this policy and in the Firefox data-collection permission declaration before release.

## Contact

Questions can be filed at https://github.com/aenerv7/Dox/issues.
