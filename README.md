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
  <a href="https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.user.js"><img src="https://img.shields.io/badge/install-userscript-5CF2A0?style=flat-square&labelColor=0B1711" alt="Install NITRO WRAITH"></a>
  <a href="https://github.com/ezurinho/nitro-wraith/releases/latest"><img src="https://img.shields.io/github/v/release/ezurinho/nitro-wraith?style=flat-square&label=release&labelColor=0B1711&color=62E2D0" alt="Latest release"></a>
  <a href="https://github.com/ezurinho/nitro-wraith/actions/workflows/check.yml"><img src="https://github.com/ezurinho/nitro-wraith/actions/workflows/check.yml/badge.svg?branch=main" alt="check"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-FFC66D?style=flat-square&labelColor=0B1711" alt="MIT license"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-8.14.53-5CF2A0?style=flat-square&labelColor=0B1711" alt="version"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#controls">Controls</a> ·
  <a href="#safety">Safety</a> ·
  <a href="#development">Development</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

> One account. No passwords, no CAPTCHAs, no social writes.

NITRO WRAITH opens the next race, types inside a range built from your account
stats, and shows why it is waiting.

<!-- release:start -->
## Current release

**[8.14.53](https://github.com/ezurinho/nitro-wraith/releases/tag/v8.14.53)** · 2026-11-19

- feat: add a recent accuracy readout
- test: refresh the visual baselines for 8.14.52

[Full changelog](CHANGELOG.md)
<!-- release:end -->

## What it does

| Area | Behaviour |
| --- | --- |
| **Race loop** | Opens the next race after a short human delay. After a DQ it returns to the garage instead of pressing Try Again. |
| **Typing** | Builds a WPM window from the account that is signed in, capped at 120. The live target starts at the account center; a governor raises it after three clean races and cuts it after a miss; a DQ cuts it too unless it followed a recorded freeze. The learned target survives reloads. The top only sets a bounded recovery floor, never the target. The account card shows avg, live target and accuracy. Accuracy stays at 96% or above. |
| **Rewards** | Claims the Mystery Box, closes daily challenges and sends one sticker in every race when stickers are on. |
| **Session care** | Renews the session when needed. Passwords and CAPTCHAs stay manual. |
| **Limits** | Session races, time, XP, active hours and daily race/XP budgets. |
| **Social** | Read-only Friends and Team counters. |

## The panel

<p align="center">
  <img src="assets/panel-preview.png" width="460" alt="NITRO WRAITH live panel during a race: 110.0 WPM, 98.7% accuracy, an adaptive 104-116 WPM pace window, the account card and session controls">
</p>

<p align="center"><sub>A harness capture with demo values. The real panel sits in the bottom-right corner of the game.</sub></p>

- **Live:** WPM, accuracy, a **recent** pace and accuracy for the last six seconds of accepted keys, the AUTO pace badge, the adaptive window, race count, session average, result and the game HUD. The header carries a dot and a freshness label: the figures are repainted four times per second, and if the race stops accepting keys the label turns amber (`stalled 3s`) and both recent figures blank, instead of pretending the frozen numbers are live. The **Account** card shows the signed-in account, effective average, live target, accuracy, adaptive range, monthly rows/pages, last read and a one-click refresh.
- **Safety net:** if an internal error repeats or happens while the race is live, the script releases the typing lock, stops the queue and shows a **safe mode** banner with **resume** and **copy report**. It also checks that the race typing component is still there; when the game UI changes (`ui-drift`), it stops instead of pressing keys blind. The **support** button copies a redacted bundle with the diagnostic report, environment and flight recorder, without tokens, account names or identifiers.
- **Garage queue:** what the bot is waiting for, the next race, Mystery Box timing, the last stop and a seven-day mix of DQ, limit, manual and ban stops. The same panel has the **AFK off/on** control, the keep-alive state and whether the queue is visible, hidden or blocked by another gate.
- **Tune:** pace profile, limits, breaks, stickers, sound, desktop alerts, AFK farming (off by default), the optional AFK keep-alive, the **AFK interlock**, the **AFK safety guard**, a live **AFK health** row and a **Health center** that summarizes account, AFK, update and freeze state. The filter at the top narrows the cards by setting name, description or section and clears back to all with one click.
- **Log / Info:** history, season snapshot, diagnostics and the keyboard map.

The update badge only appears when the Gist has a newer version. The script
checks every 5 minutes and again whenever you return to the tab, so a new
release shows up without waiting an hour. If you do not see it, your copy is
current. **versions** in TUNE opens the GitHub release history and **canary**
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
average and accuracy, for example `38.0 WPM · 98.7%`; the adaptive window and
the live target are separate. The target starts at the account center and a
governor raises it after three clean races and cuts it after a miss; a DQ also
cuts it, unless that DQ followed a recorded freeze, because a freeze is a timing
failure and not a pace miss. The learned target survives a reload and the next
calibration pass. It is never the top and never a fixed 110.

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
report. It cannot undo the disqualification. A freeze recorded while a race is
live also puts hidden farming on hold: the next race must start with the tab
visible. That **freeze hold** does not turn AFK off, and one visible race (or
the AFK health reset) clears it, so a tab that has already frozen is not used to
open another race blind. **Desktop alerts** are opt-in and
ask for browser permission on the first click; they are used only for DQ, site
blocks and the AFK guard.

## Themes

<p align="center">
  <img src="assets/themes.png" width="100%" alt="The six NITRO WRAITH themes: Carbon, Aurora, Sunset, Ice, Violet and RGB">
</p>

<p align="center"><sub><strong>Carbon</strong>, <strong>Aurora</strong>, <strong>Sunset</strong>, <strong>Ice</strong>, <strong>Violet</strong> and <strong>RGB</strong>. Press <kbd>Alt</kbd> + <kbd>T</kbd> to switch.</sub></p>

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [install link](https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.user.js) and confirm.
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
without an accepted character. If an internal error repeats or occurs during a
live race, the script enters **safe mode**: it releases the typing lock, stops
the queue and shows a banner instead of continuing. A broken race UI contract
(`ui-drift`) also stops it. **resume** clears the flag and reloads the page.

**Privacy:** there is no telemetry, analytics or third-party logging. The
`player_token` is read only to call Nitro Type's own same-origin API. It is never
printed, exported or sent to another host. The only off-site request is the
public Gist version check and, if it is unavailable, the public meta asset of the latest GitHub release; a canary build checks the public canary pre-release meta instead. All are made without credentials.

## Browser support

Chrome and Edge (Chromium) are the tested browsers. The harness and the visual
baselines run on Chrome; Edge uses the same engine. Firefox is **not tested**:
Tampermonkey works there, but Web Locks, Page Lifecycle and audio can behave
differently. Safari is not supported. The feature matrix and fallbacks are in
[`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md); a Firefox report is welcome as
long as it does not claim support.

## Support

Start with [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md). If the panel is
still wrong, open a bug report with the version, channel, browser and a support
bundle. The **support** button in TUNE → Health copies a JSON with the
diagnostic report, environment, safe-mode state and flight recorder; tokens,
account names and identifiers are removed. Review it before pasting, and never
include a password, cookie or full account export. Security issues go through
[`SECURITY.md`](SECURITY.md), not a public issue.

## Releases

Releases are automatic. When `check` passes on `main` and the userscript changed,
the workflow bumps the version, updates the changelog and README, syncs the Gist,
tags the commit and publishes the release. README-only changes do not release.

Each new stable release also publishes `build.json` and `SHA256SUMS` with the
version, commit, source ref, run and the SHA-256 of both installable files. The
release workflow uploads those assets, then verifies the public release and the
Gist against the same hashes. To check a published release without trusting the
workspace:

```bash
npm run release:verify -- vX.Y.Z
```

This works for a release that includes `build.json` and `SHA256SUMS` (the next
stable release and later); older tags do not have them. `--wait` retries for
about a minute after a fresh publish.

The panel uses the same manifest before offering an update: when the Gist
advertises a newer version, it downloads `build.json` from the release of that
channel, hashes the candidate userscript and only then shows an actionable
badge. A mismatch or a missing hash is reported as `integrity: ...` and the
download button refuses to open. Verification runs only when there is a newer
version, so the five-minute check stays cheap. The panel's 15 visual
shots run in the separate `visual` workflow on a Windows runner that matches the
committed baselines, so a layout change fails a pull request instead of waiting
for someone to run `npm run visual` locally.

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
untouched. The **stable** button in TUNE, or the Gist install link, returns a
canary copy to the normal channel.

- [Changelog](CHANGELOG.md)
- [All releases](https://github.com/ezurinho/nitro-wraith/releases)
- [Gist](https://gist.github.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58)

## Development

The userscript has no runtime dependencies. The harness needs Node 22+ and
Chrome.

```bash
npm run build       # concatenate src/ into nitro-wraith.user.js and .meta.js
npm run live:test   # CLI checks without opening Chrome
npm run check       # synced build, syntax, release/README checks and harness
npm test            # browser harness only
npm run visual      # capture Live themes + Tune/Log/garage states and compare
npm run budget      # artifact size, gzip and per-fragment limits
npm run score       # static hygiene score (duplicates, risky patterns, tests, docs)
npm run build:repro # clean rebuild in two environments, compared by SHA-256
npm run release:verify -- vX.Y.Z    # verify a published release and the Gist
npm run hotfix:plan -- --from v8.14.52  # plan a stable rollback
npm run hotfix:build -- --from v8.14.52 --out dist/hotfix
```

### Visual regression

`npm run visual` drives the harness through the same seeded state and captures
15 shots at 520×1200 (2×): the six Live themes plus Tune, Log and the garage
panel in three states (waiting, racing and stopped). Tune and Log are captured
with the whole card stack — the visual run expands the panel's internal 62vh
scroll — so a layout change below the fold also fails. The PNGs are compared
against [`tests/visual/baselines/`](tests/visual/baselines/) pixel by pixel
with the limits in [`tests/visual/config.json`](tests/visual/config.json): a
channel tolerance of 12/255 absorbs antialiasing, and a shot fails when more
than 0.25% of its pixels differ. The matrix is configured by `themes`, `views`
and `states` in that file. Captures freeze the clock and disable animations so
the result is reproducible; a failing run writes `diff-<shot>.png` (for example
`diff-view-tune-idle.png`) with the changed pixels in red next to `report.json`
in `tests/visual/current/`.

After an intentional UI change, review the new images and save them with
`npm run visual:accept`. Baselines are tied to a browser and platform because
fonts change between operating systems; `report.json` records the fingerprint,
and the compare step warns when it does not match. Regenerate the baselines on
the platform where you run the check.

The source lives in [`src/`](src/README.md): 20 ordered fragments concatenated
inside one IIFE. `nitro-wraith.user.js` is still the only installable file and
**is not edited by hand**; edit `src/`, run `npm run build` and verify with
`npm run check`. `build:check` prevents testing or publishing an artifact that
does not match `src/`.

The main configuration lives in `CONFIG` (`src/10-config.js`) and daily settings
in `TUNE`, stored in `localStorage`. The **Updates** card checks the Gist on
open, every 5 minutes, when the network returns and when the tab becomes active;
it also has **check now** and the garage badge for installing the new version.

README release notes are generated between the `release:start` and
`release:end` markers. Run `npm run readme:sync` after editing the changelog.

## Docs

- [`README.es.md`](README.es.md): guía rápida en español.
- [`docs/NITROTYPE.md`](docs/NITROTYPE.md): game notes and design limits.
- [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md): safe mode, UI drift, gates, updates and the support bundle.
- [`docs/ROLLBACK.md`](docs/ROLLBACK.md): stable hotfix/rollback and canary rollback.
- [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md): tested browsers and feature fallbacks.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): modules, race loop and update trust boundary.
- [`docs/adr/`](docs/adr/): decisions and their trade-offs.
- [`SECURITY.md`](SECURITY.md): private vulnerability reporting and privacy guarantees.
- [`tests/live/`](tests/live/): browser harness, live mode and fixtures.
- [`CHANGELOG.md`](CHANGELOG.md): changes by version.

## License

MIT. See [`LICENSE`](LICENSE).

<p align="center"><sub>NITRO WRAITH · one account · your pace</sub></p>
