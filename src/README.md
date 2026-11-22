# Source modules

`nitro-wraith.user.js` is the only file users install. It is generated from
these ordered fragments by `node tools/build.js`; do not edit the generated
userscript by hand.

The fragments are **not** ES modules and have no imports. They are concatenated
inside the same IIFE, so they share one lexical scope and must stay in the order
listed in `tools/build.js`:

| File | Area |
| --- | --- |
| `00-header.js` | Userscript metadata, quick configuration, IIFE opening |
| `10-config.js` | CONFIG, update constants, storage keys |
| `20-utils.js` | Small pure helpers, logging, timing |
| `30-profile.js` | Pace profile, calibration and preferences |
| `32-history.js` | Race history and tanda log |
| `40-dom.js` | React/game DOM discovery |
| `50-state.js` | Runtime state and session helpers |
| `60-pacing.js` | Typing model, accuracy, nitro and logs |
| `70-session.js` | Session control and the main race loop |
| `72-results.js` | Race results, rewards and optional sounds |
| `79-panel-css.js` | Panel stylesheet (one `<style>` block, no interpolation) |
| `80-panel.js` | Panel, garage, TUNE, AFK controls |
| `81-panel-theme.js` | Theme paint/set/cycle and the cross-window storage bridges |
| `90-queue.js` | Queue, navigation and recovery |
| `95-stickers.js` | Sticker selection |
| `96-guard.js` | WPM guard and duplicate-instance protection |
| `97-boot.js` | Boot and lifecycle listeners |

## Editing

1. Edit the source fragment.
2. Run `npm run build`.
3. Run `npm run check` (it starts with `build:check`).
4. Commit both `src/` and the generated `nitro-wraith.user.js` +
   `nitro-wraith.meta.js`.

The release workflow bumps the version in `src/00-header.js` and the `VERSION`
constant in `src/10-config.js`, rebuilds, and commits the generated files. The
Gist and release assets remain one `.user.js` and one `.meta.js`.
