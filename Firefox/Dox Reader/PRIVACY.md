# Dox Reader Privacy Policy

Effective date: August 15, 2026

Dox Reader is a local-first RSS reader. The developer does not operate a server for the extension and does not receive, collect, sell, or analyze user data. The extension contains no advertising, analytics, telemetry, or remote executable code.

## Data Stored Locally

The extension stores subscriptions, downloaded feed articles, read and starred state, layout preferences, WebDAV settings, and WebDAV credentials in the user's Firefox profile. Article bodies and search queries remain local and are not included in the WebDAV synchronization file.

## Network Requests

Dox Reader makes network requests only for its primary functions:

- When the user adds or refreshes a feed, the extension requests that user-provided RSS or Atom URL. The feed server receives the network information normally associated with an HTTP request.
- When the user configures and uses WebDAV synchronization, the extension connects only to the HTTPS WebDAV URL supplied by the user. The WebDAV username and password are sent to that server for authentication and are not included in the synchronization file.
- The synchronization file contains subscription URLs and titles, site URLs, read and starred state, timestamps, and identifiers used to merge changes between the user's devices. It does not contain downloaded article bodies or search queries.

The WebDAV data is stored in `Dox Reader/state.json` on the server selected and controlled by the user. The developer has no access to that server or file.

## User Control and Retention

WebDAV synchronization is disabled until the user enters WebDAV settings. Removing those settings stops synchronization. The user can delete local data from the extension settings and can delete `Dox Reader/state.json` from the WebDAV server at any time.

Uninstalling the extension removes data held in the Firefox extension profile according to Firefox's normal extension-data behavior. It does not delete data from the user's WebDAV server.

## Security

Dox Reader requires HTTPS for WebDAV synchronization. Users should use an application-specific WebDAV password where their provider supports one.

## Changes

Any material change to the data handled or transmitted by the extension will be reflected in this policy and in the Firefox data-collection permission declaration before release.

## Contact

Questions can be filed at https://github.com/aenerv7/Dox/issues.
