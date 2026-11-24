# AGENTS.md

NITRO WRAITH is a Tampermonkey userscript for Nitro Type: one ordered `src/`
fragment list, one generated IIFE, no runtime dependencies. Read
[`src/README.md`](src/README.md) for the module map and
[`DESIGN.md`](DESIGN.md) before touching any visual surface.

## Commands

```bash
npm run build       # rebuild the userscript from src/
npm run check       # build sync, syntax, README/release checks, unit + browser suites
npm test            # build sync + queue unit tests + CLI checks (no browser)
npm run test:live   # 413-check browser harness (needs Chrome)
npm run test:browsers # Firefox + WebKit smoke (needs `npx playwright install firefox webkit`)
npm run visual      # 24-shot visual regression
```

## Hard rules

- `nitro-wraith.user.js` and `nitro-wraith.meta.js` are generated. Edit `src/`,
  run `npm run build`, never patch the artifacts by hand.
- No runtime dependencies, no webfonts, no bundler. The userscript stays one
  file. Playwright is dev-only and exists for the cross-engine smoke.
- Never type credentials, never solve a CAPTCHA, never write friend/team actions.
  Never add telemetry or send account data to another host.
- Change versions only through the release workflow (merge to `main` publishes).
- Tests come with the change: add or update the live/unit check that proves it,
  then run `npm run check`.

## Design bar (no AI slop)

NITRO WRAITH vendors the Hallmark design skill at
[`.qoder/skills/hallmark/`](.qoder/skills/hallmark/SKILL.md). For any new or
changed visual surface (panel, garage, HUD, themes, README images):

1. Read [`DESIGN.md`](DESIGN.md) — it is the locked system and overrides
   Hallmark themes and landing-page recipes.
2. Load the skill and follow its Floor gates. They are binding: tokens for
   colours and fonts, no `transition: all`, no animated width/height/top/left,
   instant `:focus-visible`, a `prefers-reduced-motion` path, no invented
   metrics.
3. Waivers live in `DESIGN.md` only, each with a reason. Do not quietly ignore a
   gate, and do not add a waiver for something that can simply be fixed.
4. Before handing back: `npm run test:live`, `npm run test:browsers` and
   `npm run visual` pass, and the
   change does not add a known tell (tracked-caps body copy, decorative dots,
   invented numbers, purple-to-blue gradients, emoji icons, card-in-card).

## Layout

| Path | What it holds |
| --- | --- |
| `src/` | Ordered fragments, one IIFE; `tools/build.js` concatenates them |
| `tests/unit/` | Node VM unit tests (queue policy) |
| `tests/live/` | CDP browser harness, fixtures and the 413-check suite |
| `tests/browsers/` | Firefox + WebKit smoke (Playwright) |
| `tests/visual/` | Pixel baselines and the capture matrix |
| `tools/` | build, release, canary, readme and visual helpers |
| `.github/workflows/` | check (PRs), release (main), canary, windows, screenshots |
