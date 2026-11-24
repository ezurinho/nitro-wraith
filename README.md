<div align="center">
  <img src="assets/hero.png" width="100%" alt="NITRO WRAITH">
</div>

<p align="center">
  <img src="assets/logo.svg" width="58" alt="">
</p>

<h1 align="center">NITRO WRAITH</h1>

<p align="center">
  <strong>Nitro Type, at your pace.</strong><br>
  A Tampermonkey userscript that queues races, types at a pace based on your own
  stats, and pauses when something needs a human.
</p>

<p align="center">
  <a href="https://github.com/ezurinho/nitro-wraith/releases/latest/download/nitro-wraith.user.js"><img src="https://img.shields.io/badge/install-userscript-5CF2A0?style=flat-square&labelColor=0B1711" alt="Install NITRO WRAITH"></a>
  <a href="https://github.com/ezurinho/nitro-wraith/releases/latest"><img src="https://img.shields.io/github/v/release/ezurinho/nitro-wraith?style=flat-square&label=release&labelColor=0B1711&color=62E2D0" alt="Latest release"></a>
  <a href="https://github.com/ezurinho/nitro-wraith/actions/workflows/check.yml"><img src="https://github.com/ezurinho/nitro-wraith/actions/workflows/check.yml/badge.svg?branch=main" alt="check"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-FFC66D?style=flat-square&labelColor=0B1711" alt="MIT license"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-8.14.76-5CF2A0?style=flat-square&labelColor=0B1711" alt="version"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#controls">Controls</a> ·
  <a href="#safety">Safety</a> ·
  <a href="#development">Development</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

> One account. No passwords, no CAPTCHAs, no friend or team writes. One chat
> sticker per race, only while stickers are on.

NITRO WRAITH opens the next race, types inside a range built from your account
stats, and shows why it is waiting.

<!-- release:start -->
## Current release

**[8.14.76](https://github.com/ezurinho/nitro-wraith/releases/tag/v8.14.76)** · 2026-11-24

- perf(panel): keep garage heartbeats free of DOM writes (#19)

[Full changelog](CHANGELOG.md)
<!-- release:end -->

## What it does

| Area | Behaviour |
| --- | --- |
| **Race loop** | Opens the next race after a short human delay. After a DQ it returns to the garage instead of pressing Try Again. |
| **Typing** | Builds a WPM range from the account that is signed in, capped at 120. A slow streak cannot lower the target, and a high top can recover it by at most 25% above the real average. The panel shows `avg · target · top` together. Accuracy stays at 96% or above. |
| **Rewards** | Claims the Mystery Box, closes daily challenges and sends one sticker in every race when stickers are on. |
| **Session care** | Renews the session when needed. Passwords and CAPTCHAs stay manual. |
| **Limits** | Session races, time, XP, active hours and daily race/XP budgets. |
| **Social** | Read-only Friends and Team counters. |

## The panel

<p align="center">
  <img src="assets/panel-preview.png" width="460" alt="NITRO WRAITH live panel during a race: WPM and accuracy, the AUTO pace badge with target and top, season progress, last races and the session controls">
</p>

<p align="center"><sub>A harness capture with demo values. The real panel sits in the bottom-right corner of the game.</sub></p>

- **Live:** WPM, accuracy, a **recent** pace and accuracy for the last six seconds of accepted keys, a **clean** streak (correct keys in a row, reset by a mistake and pulsing every 25), the AUTO pace badge, target range, race count, session average, result and the game HUD. The header carries a dot and a freshness label: the figures are repainted four times per second, and if the race stops accepting keys the label turns amber (`stalled 3s`) and both recent figures blank, instead of pretending the frozen numbers are live. When a race closes and the game publishes its place and prize, the result row flashes once. The **Account** card shows the signed-in account, effective average, target, top, monthly rows/pages, last read and a one-click refresh.
- **Garage queue:** what the bot is waiting for, the next race, Mystery Box timing, the last stop and a seven-day mix of DQ, limit, manual and ban stops. The same panel has the **AFK off/on** control, the keep-alive state and whether the queue is visible, hidden or blocked by another gate.
- **Tune:** pace profile, limits, breaks, stickers, sound, desktop alerts, AFK farming (off by default), the optional AFK keep-alive, the **AFK interlock**, the **AFK safety guard**, a live **AFK health** row, a **Health center** that summarizes account, AFK, update and freeze state, and a **Motion** row with calm, standard and full. The filter at the top narrows the cards by setting name, description or section and clears back to all with one click.
- **Log / Info:** history, season snapshot, diagnostics and the keyboard map.

The update badge only appears when the latest release has a newer version. The script
checks every 5 minutes and again whenever you return to the tab, so a new
release shows up without waiting an hour. When one does, the **Updates** card
chains into the installer by itself: a 12-second countdown, shown on a row you
can click to **install now** (Escape cancels), that only runs while no race is
typing and the tab is
visible (otherwise it waits for a pause and retries). Cancelling keeps the
badge for 30 minutes, and the **Auto-update** switch in the same card turns the
countdown off entirely. Tampermonkey still asks before replacing the script.
If you do not see the badge, your copy is current. **versions** in TUNE opens
the GitHub release history and **canary**
installs the test channel (in a canary build that button reads **stable** and
goes back), so a release that misbehaves can be replaced without touching the
stable one; the diagnostic report now includes the recent flight recorder
(sanitized events across reloads).

## Pace

The first load reads your average, top WPM and full monthly history from the
account that is signed in. The stats API refreshes them every 30 minutes, and
another read is triggered automatically every 25 completed races so a long
session follows the account without waiting for the clock. Clicking `auto` or
the **refresh** button on the Live Account card forces a fresh read, and a new
script version triggers one immediately after the update. A transient monthly
page failure is retried once before the last complete snapshot is used.
Calibration is tied to the account ID: if you switch accounts in the same
browser, the old range is cleared and the new account is read before racing.
If a read fails, the card shows the retry and the bot tries again after two
minutes, then after fifteen minutes while the API stays down; coming back
online or returning to the tab also asks again.

Automatic calibration has two rules:

- **It only goes up.** A lower average cannot replace a higher target that is
  already saved. Only the custom override can bring it down.
- **The top sets a proportional recovery floor.** If your top is at least 80
  WPM and at least 1.8× your average, the target becomes
  `min(110, round(top × 0.48), round(average × 1.25))`. A 38 WPM average with a
  230 top recovers to 48 WPM (range 41–55); a 50 WPM account reaches 63, not
  110. A 100 WPM account can still reach the 110 cap. A beginner with a 50 top
  stays where they are.

When the API exposes monthly totals, the target also anchors to the higher
lifetime average. The report shows how many rows and pages were used; if a page
fails, the last complete snapshot is kept. The account row shows the short
average, the effective target and the top together, for example
`38.0 avg · 48 target · 230 top`; the target is the middle of the range being
  typed, never the top and never a fixed 110.

`TUNE` has optional **custom WPM** (15–119) and **custom accuracy** (96–100)
fields. Leave them empty or at 0 for automatic calibration. The values are saved
with the rest of the configuration and included in exports. **AFK farming** is
off by default: with it off, no new race starts while the tab is hidden, which
removes the hidden-tab freeze DQ risk. It can be switched from `TUNE` or from
the garage's **AFK off/on** button; the change reaches the race frame, the
garage queue and other tabs at once, without a reload. With no other gate
active, the `afk` row reads `off`, `on` or `on · hidden`; a sign-in, stop,
block or active-hours gate still takes priority. Turn it on only if you accept
that risk.

The optional **AFK keep-alive** is still off by default. When AFK farming is on,
it plays a near-silent constant signal through a local `AudioContext` so Chrome
has a reason to treat the tab as active instead of freezing it. No file is
downloaded and nothing is audible; the switch shows `on`, `ready`, `blocked`,
`waiting` or `n/a` so a suspended context is not advertised as protection. A
first click is required because browsers only allow audio after a gesture, and
muting the tab or the system can still disable it. This is best effort, not a
guarantee: keep the tab visible for long runs if the race cannot be lost.

**AFK interlock** is opt-in: with it on, a hidden tab cannot open a race until
the keep-alive reports a running context. **AFK safety guard** is on by default:
if a disqualification arrives within 15 minutes of a recorded freeze while AFK
is on, AFK is turned off and the reason is kept in the panel and the diagnostic
report. It cannot undo the disqualification. **Desktop alerts** are opt-in and
ask for browser permission on the first click; they are used only for DQ, site
blocks and the AFK guard.

## Themes

<p align="center">
  <img src="assets/themes.png" width="100%" alt="The six NITRO WRAITH themes: Carbon, Aurora, Sunset, Ice, Violet and RGB">
</p>

<p align="center"><sub><strong>Carbon</strong>, <strong>Aurora</strong>, <strong>Sunset</strong>, <strong>Ice</strong>, <strong>Violet</strong> and <strong>RGB</strong>. Press <kbd>Alt</kbd> + <kbd>T</kbd> to switch.</sub></p>

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [install link](https://github.com/ezurinho/nitro-wraith/releases/latest/download/nitro-wraith.user.js) and confirm.
3. Sign in at [nitrotype.com](https://www.nitrotype.com/).
4. Reload the page. The panel appears in the bottom-right corner.

To test the next build before it is stable, install the
[canary userscript](https://github.com/ezurinho/nitro-wraith/releases/download/canary/nitro-wraith.user.js).
It updates itself from the canary pre-release, and the **stable** button in TUNE
returns to the normal channel.

> [!IMPORTANT]
> Use one userscript only. NITRO WRAITH replaces the old "Auto Redirect Script"
> and "Auto Stickers"; another copy will fight over the queue.

Manual install: create a new Tampermonkey script and paste
[`nitro-wraith.user.js`](nitro-wraith.user.js).

## Controls

| Shortcut | Action |
| --- | --- |
| <kbd>Alt</kbd> + <kbd>A</kbd> | Resume, including mid-race |
| <kbd>Alt</kbd> + <kbd>N</kbd> | Stop |
| <kbd>Esc</kbd> / <kbd>Alt</kbd> + <kbd>S</kbd> | Stop after the current race |
| <kbd>Alt</kbd> + <kbd>T</kbd> | Cycle the panel theme |
| <kbd>Alt</kbd> + <kbd>G</kbd> | Fold the garage panel |
| <kbd>Alt</kbd> + <kbd>M</kbd> | Mini-HUD: full, compact or hidden |
| <kbd>Alt</kbd> + <kbd>R</kbd> | Clear the panel history |
| <kbd>Alt</kbd> + <kbd>H</kbd> | Print closed sessions to the console |

In the garage, **Resume** does the same as <kbd>Alt</kbd> + <kbd>A</kbd>.

## Safety

> [!WARNING]
> Nitro Type does not allow bots, and its anti-cheat can ban an account. NITRO
> WRAITH tries to keep the stats believable, but it cannot make automation
> invisible. Use your own account, at your own risk.

The script never types credentials and never attempts a CAPTCHA. If the site
reports a permanent ban, it stops and does not try the account again. When the
browser reports no network, the garage stops pressing "Race Now"/"Continue" and
shows `waiting · offline`; the queue resumes by itself on the `online` event. Chrome can
freeze a hidden tab, so keep the race tab visible for long unattended runs; AFK
farming is off by default for the same reason. Its garage button makes the
choice explicit, and the row tells you whether the hidden mode is actually on.
The optional AFK keep-alive can reduce the freeze risk with near-silent local
audio, but it is disabled by default and cannot guarantee that a browser,
Energy Saver or a muted tab will keep running. The race loop also recovers a Web
Lock left by a frozen tab and sends a watchdog key if a live race goes too long
without an accepted character.

**Privacy:** there is no telemetry, analytics or third-party logging. The
`player_token` is read only to call Nitro Type's own same-origin API. It is never
printed, exported or sent to another host. The only off-site request is the
public meta asset of the latest GitHub release and, if that is unavailable, the
Gist mirror; a canary build checks the public canary pre-release meta instead. All are made without credentials.

## Releases

Releases are automatic. When `check` passes on `main` and the userscript changed,
the workflow bumps the version, updates the changelog and README, syncs the Gist
mirror, tags the commit and publishes the release. README-only changes do not release.

### Canary channel

`canary` is a separate test channel. A push to the `canary` branch runs the same
checks and publishes a GitHub **pre-release** tagged `canary`, with fixed install
and update URLs:

- [Install the canary userscript](https://github.com/ezurinho/nitro-wraith/releases/download/canary/nitro-wraith.user.js)
- [Canary meta](https://github.com/ezurinho/nitro-wraith/releases/download/canary/nitro-wraith.meta.js)

Canary builds are versioned `<stable>.<build>` (for example `8.14.51.7`), so they
update themselves from the canary alias, while the next stable release is newer
and takes over when it ships. The workflow never edits the Gist, the stable tags
or `releases/latest`; every publish also keeps an immutable `canary-<version>`
tag when its workflows match `main`. A rollback to an old tag skips that tag
instead of failing, because the Actions token cannot create a ref that changes
`.github/workflows`; the release's `build.json` records the exact commit, source
ref and run.

To roll the canary back, run the **canary** workflow (Actions → canary → Run
workflow) with `ref` set to an earlier `canary-<version>` tag. It rebuilds that
commit and republishes the alias with a fresh build number; the stable release is
untouched. The **stable** button in TUNE, or the release install link, returns a
canary copy to the normal channel.

- [Changelog](CHANGELOG.md)
- [All releases](https://github.com/ezurinho/nitro-wraith/releases)
- [Gist mirror](https://gist.github.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58)

## Development

The userscript has no runtime dependencies. The harness needs Node 22+ and
Chrome; the cross-engine smoke also needs Playwright's Firefox and WebKit
builds (`npx playwright install firefox webkit`). CI runs that job inside the
[matching Playwright image](https://mcr.microsoft.com/en-us/artifact/mar/playwright),
which already ships the browsers and their system libraries.

```bash
npm run build       # concatenate src/ into nitro-wraith.user.js and .meta.js
npm test            # synced build + queue unit tests + CLI checks, no browser needed
npm run test:unit   # queue policy unit tests only (Node, no browser)
npm run test:live   # browser harness (needs Chrome)
npm run test:browsers # Firefox + WebKit smoke: boot, theme, shortcuts, no page errors
npm run live:test   # CLI checks only, without the build sync
npm run check       # synced build, syntax, release/README checks and both suites
npm run visual      # capture Live themes + Tune/Log/garage states and compare
```

### Cross-engine smoke

`npm run test:browsers` loads the built userscript and the same fixtures in
Firefox and WebKit through Playwright and asks the questions Chrome cannot
answer for them: the race and garage panels mount, the skin paints, Alt+T
reaches both panels, Alt+G folds the garage sheet, Alt+M cycles the footer HUD,
and no uncaught exception reaches the page. It answers the update-check request
locally, so the run is offline and deterministic. The `browsers` job in
`check.yml` runs it on every pull request and on `main`, inside the Playwright
image pinned to the same version as the dev dependency.

### Visual regression

`npm run visual` drives the harness through the same seeded state and captures
24 shots: fifteen at 520×1200 (2×) — the six Live themes plus Tune, Log and the
garage panel in three states (waiting, racing and stopped) — and nine narrow
views that shrink the race frame to 300 px so the panel's `100vw - 32px`
clamp and its wrapped column are exercised too. Tune and Log are captured
with the whole card stack — the visual run expands the panel's internal 62vh
scroll and lifts the height cap — so a layout change below the fold also
fails. The PNGs are compared
against [`tests/visual/baselines/`](tests/visual/baselines/) pixel by pixel
with the limits in [`tests/visual/config.json`](tests/visual/config.json): a
channel tolerance of 12/255 absorbs antialiasing, and a shot fails when more
than 0.25% of its pixels differ. The matrix is configured by `themes`, `views`
and `states` in that file. Captures freeze the clock and disable animations so
the result is reproducible; a failing run writes `diff-<shot>.png` (for example
`diff-view-tune-idle.png`) with the changed pixels in red next to `report.json`
in `tests/visual/current/`.

Contrast is a check, not a promise: the browser suite probes the computed
colour of every text token in all six themes, composes the real surfaces
(`--bg-lo`/`--bg-hi`/`--card`) and fails below WCAG AA (4.5:1) for both the
race panel and the garage sheet. The RGB theme is pinned to its worst hue
during the audit, because the animated accent must stay legible across the
whole cycle.

After an intentional UI change, review the new images and save them with
`npm run visual:accept`. Baselines are tied to a browser and platform because
fonts change between operating systems; `report.json` records the fingerprint,
and the compare step warns when it does not match. Regenerate the baselines on
the platform where you run the check.

The source lives in [`src/`](src/README.md): 22 ordered fragments concatenated
inside one IIFE. `nitro-wraith.user.js` is still the only installable file and
**is not edited by hand**; edit `src/`, run `npm run build` and verify with
`npm run check`. `build:check` prevents testing or publishing an artifact that
does not match `src/`.

Visual work follows the locked system in [`DESIGN.md`](DESIGN.md) and the
vendored [Hallmark](.qoder/skills/hallmark/SKILL.md) design skill: its Floor
gates are binding and every waiver is on the record there. Contributors (human
or agent) start from [`AGENTS.md`](AGENTS.md).

The main configuration lives in `CONFIG` (`src/10-config.js`) and daily settings
in `TUNE`, stored in `localStorage`. The **Updates** card checks the latest release
meta (with the Gist as mirror) on
open, every 5 minutes, when the network returns and when the tab becomes active;
it also has **check now**, the auto-install countdown with its on/off switch and
the garage badge for installing the new version. The **Motion** row in TUNE's
Display card picks how alive the panel feels: **calm** (colour changes only),
**standard** (entrances and hover feedback) and **full** (adds the ambient loops
while racing). All three respect `prefers-reduced-motion`. The Live card adds
the clean streak and the one-shot flash when a race result lands; the update
countdown row installs on click and cancels with Escape.

README release notes are generated between the `release:start` and
`release:end` markers. Run `npm run readme:sync` after editing the changelog.

## Docs

- [`docs/NITROTYPE.md`](docs/NITROTYPE.md): game notes and design limits.
- [`tests/live/`](tests/live/): browser harness, live mode and fixtures.
- [`SECURITY.md`](SECURITY.md): how to report a session-affecting issue privately.
- [`CHANGELOG.md`](CHANGELOG.md): changes by version.

## License

MIT. See [`LICENSE`](LICENSE).

<p align="center"><sub>NITRO WRAITH · one account · your pace</sub></p>
