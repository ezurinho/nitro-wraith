# 0001 — One generated IIFE, ordered fragments

## Context

Tampermonkey installs a single file. Splitting the runtime into ES modules would
require a bundler, `@require` entries or a module loader in the page, and the
panel lives inside the game's iframe with no build step at runtime.

## Decision

The installable artifact is one IIFE. Development happens in ordered fragments
under `src/` that share the same lexical scope; `tools/build.js` concatenates
them in a fixed order. Fragments are not independently loadable and must not
gain imports.

## Consequences

- One file to install, update and verify; no runtime dependencies.
- No module boundaries at runtime: order is the dependency graph, documented in
  `src/README.md` and in the architecture diagram.
- The build is a pure concatenation, so it is reproducible byte for byte.
- A future split into modules would need a bundler and a new release format; it
  is not a refactor to take lightly.
