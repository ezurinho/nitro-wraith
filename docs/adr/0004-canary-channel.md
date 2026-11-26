# 0004 — Canary is a separate pre-release

## Context

Testing a change in the real game is necessary, but a test build must not become
the stable install for everyone. Tampermonkey updates from the URL in the
header, and `releases/latest` ignores pre-releases.

## Decision

The canary channel builds `<stable>.<run>` from the `canary` branch, rewrites
only its version and update URLs, and publishes a GitHub pre-release tagged
`canary` plus an immutable `canary-<version>` tag when the workflow tree matches
`main`. It never touches the stable Gist, stable tags or `releases/latest`. The
workflow snapshots the stable release before and after publishing and diffs it.

## Consequences

- Canary and stable update independently; a canary build is always newer than
  the stable it derives from, so the next stable takes over.
- Rolling back the canary means republishing an old `canary-<version>` tag, not
  editing stable.
- Workflows that differ from `main` cannot be tagged by the Actions token; the
  build manifest records the exact commit instead of failing the publish.
