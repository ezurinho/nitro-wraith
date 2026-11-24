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

`src/79-panel-css.js`, the `.panel` block, is the only place a token is
declared: `--acc`, `--acc-2`, `--ink`, `--dim`, `--dim-2`, `--warn`, `--bad`,
`--info`, `--card`, `--bg-hi`, `--bg-lo`, `--font-ui`, `--font-mono`.
Theme blocks override accents and background only. Rules use `var(--…)` or
`color-mix()`; they do not write a font stack or a new colour. Scrim whites and
blacks (`rgba(255,255,255,…)`, `rgba(0,0,0,…)`) are depth layers over a themed
background and are the one accepted exception.

## Type

One UI stack and one mono stack, both tokens. Sizes 7.5–13 px. Numerals stay in
the mono stack when they change at 4 Hz so digits do not reflow.

## Motion

- Durations ≤ 250 ms; `transform`/`opacity` only.
- Never `transition: all`, never animate `width`, `height`, `top` or `left`
  (progress bars use `scaleX`).
- Every animation has a `prefers-reduced-motion: reduce` kill switch; content is
  visible with animation off.
- Motion explains state (a value changed, a card arrived); it never decorates an
  idle panel. Idle ticks perform zero DOM writes.

## Accessibility floor

- Small text ≥ 4.5:1 against its own background in all six themes
  (`tests/live/live.test.js` asserts it from the real palettes).
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
| F6 `:focus-visible` everywhere | Enforced by `live.test.js` interaction checks |
| F7 reduced-motion fallback | Enforced: media query at the top of the panel sheet |
| F8 no invented metrics | Enforced by product rule: all values come from the session |
| F12–F14 hero / word count / container | Not applicable: no landing page |
| F15 CSS stamp | Not applicable: generated panel sheet, not an exported page |
| F16 `sloplint --render` | Not applicable to a shadow DOM overlay; the browser suite plays the same role (400 checks + visual baselines) |

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

New waivers go here, one line of reason each. A gate is never waived silently.
