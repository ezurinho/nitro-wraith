<div align="center">
  <img src="assets/hero.png" width="100%" alt="NITRO WRAITH — human pace, zero fast mode">
</div>

<p align="center">
  <img src="assets/logo.svg" width="58" alt="">
</p>

<h1 align="center">NITRO WRAITH</h1>

<p align="center">
  <strong>Human pace. No fast mode.</strong><br>
  A Tampermonkey userscript for one Nitro Type account. It runs the race queue,
  types around your own average, and shows the reason for every pause.
</p>

<p align="center">
  <a href="https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.user.js"><img src="https://img.shields.io/badge/install-userscript-5CF2A0?style=flat-square&labelColor=0B1711" alt="Install NITRO WRAITH"></a>
  <a href="https://github.com/ezurinho/nitro-wraith/releases/latest"><img src="https://img.shields.io/github/v/release/ezurinho/nitro-wraith?style=flat-square&label=release&labelColor=0B1711&color=62E2D0" alt="Latest release"></a>
  <a href="https://github.com/ezurinho/nitro-wraith/actions/workflows/check.yml"><img src="https://github.com/ezurinho/nitro-wraith/actions/workflows/check.yml/badge.svg?branch=main" alt="check"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-FFC66D?style=flat-square&labelColor=0B1711" alt="MIT license"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-8.14.31-5CF2A0?style=flat-square&labelColor=0B1711" alt="version"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#controls">Controls</a> ·
  <a href="#safety">Safety</a> ·
  <a href="#development">Development</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

> One account. One visible panel. No credential typing, no CAPTCHA solving,
> no social writes.

NITRO WRAITH takes the next race, types inside a range calibrated from the
account's own statistics, and stops when the game gives it a reason to stop.
The panel exists so you can see which reason that is.

<!-- release:start -->
## Current release

**[8.14.31](https://github.com/ezurinho/nitro-wraith/releases/tag/v8.14.31)** · 2026-11-15

- feat: show the update control in the garage panel

[Full changelog](CHANGELOG.md)
<!-- release:end -->

## What it does

| Area | Behaviour |
| --- | --- |
| **Race loop** | Opens the next race from the garage or results screen with a human delay. After a disqualification it goes to Garage, not Try Again. |
| **Typing** | Reads the account's average and top WPM, anchors to the lifetime average when available, then races around it under a hard 120 WPM ceiling. A 30 WPM account stays near 30; a 43 WPM account stays near 43. Accuracy stays at the 96% reward floor or above. |
| **Rewards** | Claims the Mystery Box, closes daily challenges and uses stickers when the settings allow it. |
| **Session care** | Renews the session when needed. Usernames, passwords and CAPTCHAs stay manual. |
| **Limits** | Session races, time, XP, active hours and daily race/XP budgets. |
| **Social** | Read-only Friends and Team counters. No write actions. |

It does not type credentials, solve CAPTCHAs, accept friend requests or run
multiple accounts. Those are boundaries, not missing features.

## The panel

<p align="center">
  <img src="assets/panel-preview.png" width="460" alt="NITRO WRAITH live panel during a race: 107.0 WPM, 98.7% accuracy, an AUTO pace badge with 110 average and 230 top, season progress and session controls">
</p>

<p align="center"><sub>A browser-harness capture with seeded demo values. The panel sits in the bottom-right corner of the game.</sub></p>

- **Live:** WPM, accuracy, the account-backed AUTO pace badge, target range, race count, session average, result and the game HUD.
- **Garage queue:** what the bot is waiting for, the next race, Mystery Box timing, the last stop and a seven-day mix of DQ, limit, manual and ban stops.
- **Tune:** pace profile, limits, breaks, stickers, sound and the safety guard.
- **Log / Info:** history, season snapshot, diagnostics and the keyboard map.

The race header and the garage panel show a small `UPDATE` button only when the
Gist has a newer version. If the button is absent, the installed copy is current.

### Pace that looks like yours

The first start reads the average and top WPM already stored on the account;
the stats API refreshes them every 30 minutes. Auto-calibration stays on, and
clicking the `auto` row only forces a fresh read. The target is the average,
not the top, so a 30 WPM account gets a 26–34 WPM range and a 43 WPM account
gets 37–49. No generic 100+ WPM default.

The profile average is a short rolling window, so a slow streak can drag it
down. When the stats API exposes the monthly totals, the script anchors the
target to the higher lifetime average and never calibrates below it. The recent
profile average still appears in the panel; it just cannot pull the bot into a
self-reinforcing slow loop.

### Six themes

<p align="center">
  <img src="assets/themes.png" width="100%" alt="The six NITRO WRAITH themes: Carbon, Aurora, Sunset, Ice, Violet and RGB">
</p>

<p align="center"><sub><strong>Carbon</strong>, <strong>Aurora</strong>, <strong>Sunset</strong>, <strong>Ice</strong>, <strong>Violet</strong> and <strong>RGB</strong>. The layout stays the same; switch with <kbd>Alt</kbd> + <kbd>T</kbd>.</sub></p>

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [install link](https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.user.js) and confirm.
3. Sign in at [nitrotype.com](https://www.nitrotype.com/).
4. Reload the page. The panel appears in the bottom-right corner.

> [!IMPORTANT]
> Install one userscript only. NITRO WRAITH replaces the old "Auto Redirect
> Script" and "Auto Stickers"; keeping another copy loaded will fight over the
> queue.

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

In the garage, **Resume** does the same as <kbd>Alt</kbd> + <kbd>A</kbd>. During
a live race it forwards the key; otherwise it clears the hold and re-arms the
queue.

## Safety

> [!WARNING]
> Nitro Type does not allow bots, and its anti-cheat can ban an account. NITRO
> WRAITH tries to keep the stats believable, but it cannot make automation
> invisible. This is your account and your risk. Never share cookies, tokens or
> credentials.

The script never types credentials and never attempts a CAPTCHA. If the site
reports a permanent account ban, the bot stops and does not press Race Again or
retry the account.

**Privacy:** there is no telemetry, analytics or third-party logging. The
`player_token` from the page is read only to call Nitro Type's own same-origin
API. It is never printed, included in an exported config or diagnostic, or sent
to another host. The only off-site request is the public Gist version check,
made with credentials omitted.

## Under the hood

<details>
  <summary><strong>What gets automated, and what stays manual</strong></summary>

  <br>

  - The queue, race loop, typing plan, Mystery Box, stickers, daily challenges and session renewal are automated.
  - Username, password, CAPTCHA and account changes are manual.
  - The panel reads the game's own persisted state where possible; it does not invent XP or race results.
  - The social panel is GET-only and never posts, accepts, denies, invites, applies or sends.
  - The guard stops the race on impossible WPM readings and warns when two copies are publishing at the same time.
  - The panel paints at 1 Hz during a race and every two seconds while waiting; hidden tabs skip DOM work. Only the Live view is mounted at boot; Tune, Log and Info are mounted when first opened. Repeated reads of `persist:nt`, session counters and the calibration stamp are cached until a write. Read-only social GETs are kept for two minutes.

</details>

<details>
  <summary><strong>Why it pauses so much</strong></summary>

  <br>

  A fast queue is easy to detect and easy to get wrong. NITRO WRAITH leaves a
  visible reason for every wait: a break, a session limit, an active-hours gate,
  a DQ block or a missing race screen. The goal is not to race nonstop; it is to
  keep going without leaving the account stuck on a results screen or typing
  into a dead race.

> [!NOTE]
> Chrome can freeze a hidden tab (Energy Saver, memory pressure or bfcache), and
> a frozen tab cannot send keys. While the bot runs, NITRO WRAITH keeps a Web
> Lock, which opts an active tab out of Energy Saver freezing. If the page is
> frozen anyway, it releases the lock on `freeze` and asks for it again on
> `resume`. A race frozen past the inactivity timeout may already be lost, so
> for unattended runs keep the race tab visible or stop the browser from
> freezing it.

</details>

## Releases

Releases are automatic. When the `check` workflow passes on `main` and
`nitro-wraith.user.js` changed, the release workflow:

1. bumps the patch version and adds the commit messages to `CHANGELOG.md`;
2. regenerates the **Current release** block and version links in this README;
3. commits the version bump, updates the Gist, tags the commit and publishes the
   GitHub release.

A README-only change does not create a release. The check workflow still verifies
that the generated block matches the changelog.

- [Changelog](CHANGELOG.md)
- [All releases](https://github.com/ezurinho/nitro-wraith/releases)
- [Gist](https://gist.github.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58)

The release workflow needs a repository secret named `GIST_TOKEN` with Gist
write access. Releases use the built-in `GITHUB_TOKEN`.

## Development

The userscript has no runtime dependencies. The harness needs Node 22+ and
Chrome.

```bash
npm run live:test   # CLI checks without opening Chrome
npm run check       # syntax, release/README checks and the browser harness
npm test            # browser harness only
```

The main configuration lives in `CONFIG` at the top of
`nitro-wraith.user.js`. Daily settings live in `TUNE` and are stored in
`localStorage`.

README release notes are generated by `tools/readme.js` between the
`release:start` and `release:end` markers. Use `npm run readme:sync` after
editing the changelog.

## Docs

- [`docs/NITROTYPE.md`](docs/NITROTYPE.md): game research, limits and design notes.
- [`tests/live/`](tests/live/): browser harness, live mode and fixtures.
- [`CHANGELOG.md`](CHANGELOG.md): what changed in each version.

## License

MIT. See [`LICENSE`](LICENSE).

<p align="center"><sub>NITRO WRAITH · one account · human pace</sub></p>
