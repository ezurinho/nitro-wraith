# 0005 — Visual baselines are Windows-only

## Context

The panel uses system fonts and CSS that rasterize differently per platform.
Committed baselines were captured on Windows, which is where the panel is
reviewed. A Linux runner with different fonts produces false failures even when
the layout is correct.

## Decision

The `visual` workflow runs on `windows-latest`, builds from `src/` and compares
the 15 screenshots against the committed baselines. `tests/visual/config.json`
records the viewport, channel tolerance and diff ratio; `report.json` records the
platform fingerprint.

## Consequences

- Pull requests get a real layout check on the platform the baselines describe.
- Linux and macOS are not covered by the visual job. Regenerating baselines
  there would require a second set and a matrix, not a single shared set.
- A baseline update is a reviewed binary diff, not an automatic accept.
