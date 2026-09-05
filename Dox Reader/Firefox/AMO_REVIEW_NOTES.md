# AMO Reviewer Notes

## Distribution and Build

Version 1.0.0 is the first listed release for Firefox desktop and Android. It keeps the unlisted extension ID and removes update_url for future AMO updates. The interface is currently Simplified Chinese.

Build on Ubuntu 24.04 with Node.js 24 and npm 11. From the source archive root:

```text
npm ci
npm run package
```

This runs Vitest, TypeScript, Vite and web-ext build; the package is under web-ext-artifacts/. All dependencies resolve from the public npm registry using package-lock.json. No credentials are needed.

## Network Behavior

The extension has no developer-operated backend, analytics, telemetry, advertising, or remote executable code.

- Feed refresh performs GET requests only to RSS or Atom URLs explicitly added by the user.
- Displayed article images may load from HTTP(S) URLs supplied by the feed content, with no-referrer policy.
- WebDAV synchronization connects only to the HTTPS URL prefix explicitly configured by the user. It uses PROPFIND and MKCOL for `Dox Reader/`, and GET and PUT for `Dox Reader/state.json`.
- The WebDAV Authorization header contains the credentials supplied by the user. Credentials remain in `browser.storage.local` and are never written into the synchronization document.
- The synchronization document contains subscription metadata and read/starred state. Article bodies and search queries remain local.

The `http://*/*` and `https://*/*` host permissions are necessary because an RSS reader cannot know feed hosts in advance. WebDAV itself is restricted in application code to HTTPS.

## Data Declaration

Required data declarations describe WebDAV transfers to the user's server:

- `authenticationInfo`: WebDAV username and password used in the Authorization header.
- `browsingActivity`: subscribed feed and site URLs.
- `websiteActivity`: read and starred state.
- `websiteContent`: feed and site titles, plus optional user-defined subscription display names, included with subscription metadata.

The developer does not receive this data.

## Content Handling and Linter Warning

src/article-content.tsx converts feed HTML to allowlisted Preact elements and validates URL protocols. Application code does not inject feed HTML using innerHTML or dangerouslySetInnerHTML.

The bundle has one UNSAFE_VAR_ASSIGNMENT warning in unmodified Preact 10.29.8's renderer, which supports dangerouslySetInnerHTML. Dox Reader does not call that API for feed content.

## Third-Party Libraries

- Preact 10.29.8: https://github.com/preactjs/preact
- Dexie 4.4.5: https://github.com/dexie/Dexie.js
- fast-xml-parser 5.10.1: https://github.com/NaturalIntelligence/fast-xml-parser
- Lucide Preact 1.31.0: https://github.com/lucide-icons/lucide

Build/test versions are locked in package-lock.json.
