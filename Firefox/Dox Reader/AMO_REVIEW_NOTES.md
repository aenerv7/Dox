# AMO Reviewer Notes

## Distribution and Build

This is an unlisted, self-distributed extension for Firefox desktop and Firefox for Android.

The source builds in AMO's default Ubuntu 24.04 environment with Node.js 24 and npm 11. From the source archive root, run:

```text
npm ci
npm run package
```

The command runs the Vitest suite, TypeScript checks, the Vite production build, and `web-ext build`. The submitted archive is reproduced at `web-ext-artifacts/dox_reader-0.2.4.zip`. Dependencies are resolved only through the public npm registry using `package-lock.json`.

## Network Behavior

The extension has no developer-operated backend, analytics, telemetry, advertising, or remote executable code.

- Feed refresh performs GET requests only to RSS or Atom URLs explicitly added by the user.
- WebDAV synchronization connects only to the HTTPS URL prefix explicitly configured by the user. It uses PROPFIND and MKCOL for `Dox Reader/`, and GET and PUT for `Dox Reader/state.json`.
- The WebDAV Authorization header contains the credentials supplied by the user. Credentials remain in `browser.storage.local` and are never written into the synchronization document.
- The synchronization document contains subscription metadata and read/starred state. Article bodies and search queries remain local.

The `http://*/*` and `https://*/*` host permissions are necessary because an RSS reader cannot know feed hosts in advance. WebDAV itself is restricted in application code to HTTPS.

## Data Declaration

The manifest declares the following required data categories because WebDAV synchronization sends data to the server chosen by the user:

- `authenticationInfo`: WebDAV username and password used in the Authorization header.
- `browsingActivity`: subscribed feed and site URLs.
- `websiteActivity`: read and starred state.
- `websiteContent`: feed and site titles included with subscription metadata.

The developer does not receive this data. The destination and credentials are supplied and controlled by the user.

## Content Handling and Linter Warning

Feed XML is parsed locally. Article content is converted into a limited set of Preact elements by `src/article-content.tsx`; application code does not inject feed HTML with `innerHTML` or `dangerouslySetInnerHTML`.

`web-ext lint` reports one `UNSAFE_VAR_ASSIGNMENT` warning in the generated reader bundle. The matching assignment is part of the unmodified Preact 10.29.8 renderer, which supports the framework's `dangerouslySetInnerHTML` API. Dox Reader does not call that API for feed content.

## Third-Party Libraries

Runtime libraries and their upstream source repositories:

- Preact 10.29.8: https://github.com/preactjs/preact
- Dexie 4.4.5: https://github.com/dexie/Dexie.js
- fast-xml-parser 5.10.1: https://github.com/NaturalIntelligence/fast-xml-parser
- Lucide Preact 1.31.0: https://github.com/lucide-icons/lucide

Build and test tooling versions are recorded in `package-lock.json`.
