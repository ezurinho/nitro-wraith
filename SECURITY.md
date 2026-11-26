# Security policy

## Reporting a vulnerability

Open a private report through GitHub Security Advisories
(<https://github.com/ezurinho/nitro-wraith/security/advisories/new>). Do not open
a public issue for a vulnerability that could be used against users.

Include the script version, channel, browser, the steps and, if possible, a
redacted support bundle from **TUNE → Health → support**. The bundle removes
tokens, account names and identifiers; review it before sending.

## Scope

- The userscript runs on `https://www.nitrotype.com/*` with `@grant none`.
- It reads `player_token` only to call Nitro Type's same-origin API. It is never
  printed, exported or sent to another host.
- The only off-site requests are the public version check, the update manifest
  and the optional update download; all are made without credentials.
- Passwords and CAPTCHAs are never handled.
- There is no telemetry, analytics or third-party logging.

## Update integrity

Before offering a newer build, the panel downloads `build.json` from the release
of the same channel, computes the SHA-256 of the candidate userscript with
`crypto.subtle` and compares it with `files["nitro-wraith.user.js"].sha256`. A
missing manifest or hash, an unparsable manifest or a mismatch sets
`verified: false`, hides the update link and refuses to open the download. The
diagnostic records the reason as `integrity: ...`.

A report that can make the panel install bytes that do not match `build.json`,
or that can bypass the verification, is in scope.

## Release artifacts

Every stable release publishes `build.json` and `SHA256SUMS`. The release
workflow verifies the public assets and the Gist against the same hashes, and
`npm run release:verify -- vX.Y.Z` re-checks them from a clean workspace.

## Supported versions

Only the latest stable release and the current canary pre-release are supported.
Older tags may not have `build.json`, so their updates are not offered through
the verified path.
