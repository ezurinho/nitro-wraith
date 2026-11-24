# NITRO WRAITH design system

This is the locked system for every visual surface: the race panel, the garage
panel, the themes, the README captures. Any design run (including the vendored
[Hallmark skill](.qoder/skills/hallmark/SKILL.md)) reads this file first and
treats it as overrides: no theme, macro-structure or landing-page recipe from
that skill replaces what is written here.

The product is a Tampermonkey userscript and a shadow-DOM overlay inside a game
page. It is not a website and not a marketing page.

## What it is

| Surface | Role |
| --- | --- |
| Race panel | 322 px wide overlay, bottom-right, glanceable in under a second while typing |
| Garage panel | Same skin; shows the queue, limits and the next race |
| Mini-HUD | Compact strip: WPM, accuracy, state |
| Six themes | Carbon, Aurora, Sunset, Ice, Violet, RGB; one `data-theme` swap |
| README / releases | Screenshots from the harness, not mockups |

Constraints that outrank taste:

- One userscript, no runtime dependencies, no webfonts (system stacks only).
- 60 fps budget during a race: repaint 4×/s, transforms and opacity only.
- Readable at 8–13 px on a dark overlay; the player looks at it mid-race.
- Every value shown is real account or race data. Never invent a metric, a
  streak, a rank or a testimonial.

## Tokens

Tokens are declared in exactly two places: the `.panel` block of
`src/79-panel-css.js` (race panel) and the `.p` block of the garage sheet
inside `src/90-queue.js`. The garage lives in its own shadow root, so it
repeats the same names and values instead of inheriting them; the two blocks
are kept in step by hand and both are audited. Names: `--acc`, `--acc-2`,
`--ink`, `--dim`, `--dim-2`, `--warn`, `--bad`, `--info`, `--ink-warn`,
`--ink-warn-hi`, `--ink-bad`, `--ink-on-acc`, `--medal-1`/`2`/`3`,
`--card`, `--bg-hi`, `--bg-lo`, `--font-ui`, `--font-mono`. State inks are
`color-mix()` over `--ink`, so each theme tints them. Theme blocks override
accents and background only. Rules use `var(--…)` or an inline
`color-mix()`; they do not write a font stack or a hex colour. Scrim whites
and blacks (`rgba(255,255,255,…)`, `rgba(0,0,0,…)`) are depth layers over a
themed background and are the accepted exception.

## Type

One UI stack and one mono stack, both tokens. Sizes 7.5–13 px. Numerals stay in
the mono stack when they change at 4 Hz so digits do not reflow.

## Motion

- Three levels on the panel root (`data-motion`), picked in TUNE and stored with
  the other visual prefs: **calm** keeps only colour transitions, **standard**
  adds the short entrances and hover feedback, **full** (default) also runs the
  ambient loops while a race is live.
- Entrances and feedback: durations ≤ 250 ms; `transform`/`opacity` only.
- Feedback that marks a real event: the Live clean streak pulses on every 25
  clean keys (0.24 s) and the result row flashes once (0.24 s) when a closed
  race publishes its place and prize. Both are standard/full only and vanish
  under reduced motion.
- Ambient loops (header scan, status ring, mark glow, Live equalizer, progress
  sheen) are the only long animations. They run only with
  `data-state="running"` and `data-motion="full"`, never on an idle panel.
- Never `transition: all`, never animate `width`, `height`, `top` or `left`
  (progress bars use `scaleX`).
- Every animation has a `prefers-reduced-motion: reduce` kill switch that wins
  over all three levels; content is visible with animation off.
- Motion explains state (a value changed, a card arrived); it never decorates an
  idle panel. Idle ticks perform zero DOM writes.

## Accessibility floor

- Small text ≥ 4.5:1 against its own background in all six themes
  (`tests/live/live.test.js` probes the computed colours of the race panel and
  the garage sheet, composes the real surfaces and pins RGB to its worst hue).
- `:focus-visible` is instant and visible on every control; no focus traps.
- State is never colour-only: the dot/chip carries a label and the health card
  spells state out in text.
- Reduced motion, keyboard shortcuts and the diagnostic report stay available.

## Hallmark adoption

The Floor in `.qoder/skills/hallmark/SKILL.md` is binding. The gates that matter
for an overlay are enforced by our own checks; page-only gates are not
applicable and are listed as such, not silently ignored.

| Gate | Status |
| --- | --- |
| F1 tokens for colours and fonts | Enforced: exactly one UI stack and one mono stack in the sheet, both tokens; `live.test.js` scans the built CSS |
| F2 no `transition: all`, no width/height/top/left animation | Enforced: bars use `scaleX`; `live.test.js` scans the CSS |
| F3 no italic word inside a roman heading | Enforced by review |
| F6 `:focus-visible` everywhere | Enforced: every control styles an instant outline, `live.test.js` checks the sheet carries it, and the browser suite keeps keyboard focus after a control action |
| F7 reduced-motion fallback | Enforced: media query at the top of the panel sheet |
| F8 no invented metrics | Enforced by product rule: all values come from the session |
| F12–F14 hero / word count / container | Not applicable: no landing page |
| F15 CSS stamp | Not applicable: generated panel sheet, not an exported page |
| F16 `sloplint --render` | Not applicable to a shadow DOM overlay; the browser suite plays the same role (407 checks + 24 visual baselines) |

### Floor audit

`sloplint --scope component --tier floor` runs against both built sheets
(extract the `panelCssCache` string and the garage `<style>` to `.css` files
after `npm run build`). After the token pass the reports carry four kinds of
findings, all covered by the waivers below: the RGB theme gradients (`2a`),
the CSS stamp (`20`), the token/theme declarations and scrims (`48`), and
tracked-caps labels (`67`). Anything else in a report is a bug, not a style.

### Waivers on the record

1. **F9, tracked capitals.** Card heads, chips and the brand use uppercase +
   0.08–0.19 em tracking. This is the deliberate telemetry convention of a race
   HUD (the same convention as a cockpit label) and is limited to labels, never
   body copy. Changing it would flatten the six themes and the scan pattern
   players already use.
2. **F10, middle-dot meta.** Dense readouts such as `107.0 · 98.7%` and
   `avg · target · top` join numbers with a middle dot. These are fixed-order
   telemetry fields with title text, not marketing meta lines; a table row would
   not fit 322 px. The pattern is banned for prose and for link chrome.
3. **F10, status dot.** The dot is not decorative: it encodes
   running / paused / break and every state also carries a label or a health
   line. It is the fastest way to read state from the corner of the eye.
4. **F4, `100vw`.** The panel uses `max-width: calc(100vw - 32px)` (and wider
   insets on phones) so the overlay fits small screens. The panel never owns the
   page scroll, so there is no page-level overflow to clip.
5. **Hallmark 2a, purple-to-blue gradient.** The RGB theme is a live rainbow
   (`#ff5f6d → #ffc371 → #47ffa1 → #5ad1ff → #b06bff`) on the accent ring, the
   wordmark and the theme swatch. It is the one theme the player picks to see
   hue cycling; the moving hue is the feature. A monochrome alternative exists
   (Carbon, Aurora), so the tell is opt-in and never the default.
6. **Hallmark 48, colour literals.** `sloplint` counts the `.panel` token
   declarations, the six theme accent overrides, the RGB gradient stops, binary
   option lists (`<option>` keeps the native widget in Chromium) and the
   `rgba` scrims/shadows as literals. Those are exactly the declaration sites:
   the tokens exist so every rule can use `var(--…)`. Rules outside the token
   and theme blocks carry no hex.
7. **Hallmark 20, CSS stamp.** The sheet lives inside the userscript and is
   injected into a shadow root; there is no exported page to stamp.
8. **Hallmark 67, tracked caps.** Covered by waiver 1 (F9): labels only, a
   telemetry convention, never body copy.

New waivers go here, one line of reason each. A gate is never waived silently.
