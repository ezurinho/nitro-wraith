# 0006 — Verify the update artifact before offering it

## Context

The update check compared `@version` strings. The version notice comes from the
Gist, while the installable file is also served from the Gist. Anyone able to
change that Gist could serve a different script with a higher version, and the
panel would offer it as a normal update. The release already publishes
`build.json` and `SHA256SUMS`, but the panel did not use them.

## Decision

When a newer version is found, the panel fetches `build.json` from the release
of the same channel and downloads the candidate userscript. It computes the
SHA-256 with `crypto.subtle` and compares it with
`files["nitro-wraith.user.js"].sha256` before showing an actionable badge. A
missing manifest, an unparsable one, a missing hash or a mismatch stores
`verified: false` and an `integrity:` error; the download button refuses to open
and the diagnostic explains why. Normal checks (no newer version) do not
download the artifact.

## Consequences

- A modified Gist or a stale CDN copy cannot be installed through the badge.
- An update is delayed until GitHub and the Gist agree on the bytes; a transient
  mismatch is retried by the normal update cadence.
- The check needs `crypto.subtle` (Chrome/Edge, secure contexts). Without it the
  update is reported as blocked rather than installed unverified.
- `build.json` must be published for any release that should be installable this
  way; older tags without it are not offered through this path.
