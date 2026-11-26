# 0002 — The userscript is generated, never hand-edited

## Context

The generated file is 20k lines. Editing it directly makes the source fragments
and the installed artifact diverge, and the divergence is invisible until a user
installs an old build.

## Decision

`nitro-wraith.user.js` and `nitro-wraith.meta.js` are build outputs committed to
the repository. `npm run build:check` fails when the committed artifact does not
match `src/`. `npm run check` starts with that comparison, so tests never run
against a stale artifact.

## Consequences

- Every source change produces a two-file diff: the fragment and the artifact.
- Reviews can read the fragment; users get one installable file.
- A release cannot be cut from an unbuilt tree.
- Conflict resolution must rebuild instead of merging the generated file.
