# Architecture

`nitro-wraith.user.js` is one generated IIFE. The source is split into ordered
fragments under `src/`; they share one lexical scope, so there are no imports and
the order in `tools/build.js` is the dependency graph.

## Modules

```mermaid
flowchart TD
  H[00-header<br/>metadata + IIFE] --> C[10-config<br/>CONFIG, update channel]
  C --> U[20-utils<br/>logging, safe mode, storage helpers]
  U --> P[30-profile<br/>account, calibration, prefs]
  P --> HI[32-history<br/>races, tandas, CSV]
  HI --> D[40-dom<br/>game DOM + typing contract]
  D --> S[50-state<br/>session state, counters]
  S --> PA[60-pacing<br/>cadence, accuracy, nitro]
  PA --> SE[70-session<br/>race loop and controls]
  SE --> R[72-results<br/>results, rewards, sound]
  R --> PN[80-panel<br/>panel shell, TUNE, support]
  PN --> LV[81-panel-live<br/>live readout + paint loop]
  LV --> SS[82-panel-season<br/>season snapshot + card]
  SS --> PS[83-panel-shell<br/>shadow root + panel markup]
  PS --> SO[85-queue-social<br/>read-only friends/team panel]
  SO --> GD[87-queue-garage-dom<br/>garage panel template + refs]
  GD --> Q[90-queue<br/>garage queue, navigation]
  Q --> ST[95-stickers]
  ST --> G[96-guard<br/>WPM guard, single instance]
  G --> B[97-boot<br/>lifecycle listeners]
```

The concatenation is byte-checked by `npm run build:check`; the harness also
rebuilds the modules in memory and compares the full artifact, so a stale
generated file cannot reach a release.

## Race loop

```mermaid
stateDiagram-v2
  [*] --> Garage
  Garage --> Race: gate open + human delay
  Race --> Typing: typing component found
  Typing --> Results: last character accepted
  Results --> Garage: rewards, calibration, budget
  Typing --> Stopped: safe mode / UI drift / DQ
  Garage --> Stopped: manual stop / limit / ban / offline
  Stopped --> Garage: resume
```

`typingContract()` is the boundary with the game: if the typing component
disappears while a race is live, the loop stops instead of pressing keys blind.
`superviseLive` re-checks it periodically and records `ui-drift`.

## Update trust boundary

```mermaid
sequenceDiagram
  participant Panel
  participant Gist
  participant GitHub
  Panel->>Gist: meta.js (version)
  Panel->>GitHub: build.json (expected SHA-256)
  Panel->>Gist: user.js (bytes)
  Panel->>Panel: SHA-256(bytes) == build.json?
  alt match
    Panel-->>Panel: offer install
  else mismatch / missing manifest
    Panel-->>Panel: block, show integrity error
  end
```

The version notice and the artifact are served by different hosts. The hash in
`build.json` binds them: a modified Gist, a stale CDN copy or a truncated asset
does not match and is not offered. The verification runs only when a newer
version exists, so the normal 5-minute check stays cheap.

## Storage

State lives in `localStorage` under `autoTyper*` and `ntQueue:*` keys. Reads and
writes go through `disk`, which catches blocked storage and quota errors. The
panel and the garage queue are different windows, so settings that must travel
between them use the `storage` event (theme, AFK, pause) instead of polling.

## Tests

- `tests/live/live.test.js`: static checks over the source, workflows, manifests
  and docs (no browser).
- `tests/live/run.js`: Chrome harness, seeded fixtures, real DOM and shadow DOM.
- `tests/visual`: 15 screenshots compared pixel by pixel on Windows.
- `tools/repro.js`: clean rebuild in two environments, compared by SHA-256.
- `tools/score.js`: reproducible static hygiene score (duplicates, risky
  patterns, same-origin message coverage, tests, docs and artifact size). It is
  printed at the end of `npm run check`; it does not replace the harness or a
  real race.
