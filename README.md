<div align="center">
  <img src="assets/hero.png" width="100%" alt="NITRO WRAITH — human pace, zero fast mode">
</div>

<h1 align="center"><img src="assets/logo.svg" width="44" alt="" valign="middle"> NITRO WRAITH</h1>

<p align="center">
  <strong>Human pace. No fast mode.</strong><br>
  A Tampermonkey userscript for one Nitro Type account. It runs the race queue,
  types at a pace based on your own stats, and shows you what it is doing.
</p>

<p align="center">
  <a href="https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.user.js">
    <img src="https://img.shields.io/badge/INSTALL_USERSCRIPT-70FFAB?style=for-the-badge&logo=tampermonkey&logoColor=07100C&labelColor=0B1711" alt="Install NITRO WRAITH">
  </a>
  <a href="https://github.com/ezurinho/nitro-wraith/releases/tag/v8.14.20">
    <img src="https://img.shields.io/github/v/release/ezurinho/nitro-wraith?style=for-the-badge&label=release&labelColor=0B1711&color=62E2D0" alt="Latest release">
  </a>
  <a href="CHANGELOG.md">
    <img src="https://img.shields.io/badge/CHANGELOG-0B1711?style=for-the-badge&logo=keepachangelog&logoColor=FFC66D" alt="Changelog">
  </a>
</p>

<p align="center">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-8.14.20-5CF2A0?style=flat-square&labelColor=0B1711" alt="version"></a>
  <a href="https://github.com/ezurinho/nitro-wraith/actions/workflows/check.yml"><img src="https://github.com/ezurinho/nitro-wraith/actions/workflows/check.yml/badge.svg?branch=main" alt="check"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-62E2D0?style=flat-square&labelColor=0B1711" alt="license"></a>
  <a href="https://www.tampermonkey.net/"><img src="https://img.shields.io/badge/Tampermonkey-userscript-FFC66D?style=flat-square&labelColor=0B1711" alt="Tampermonkey"></a>
  <img src="https://img.shields.io/badge/fast_mode-never-FF766F?style=flat-square&labelColor=0B1711" alt="No fast mode">
</p>

> **One account, not a farm.** NITRO WRAITH races with human delays, keeps the
> typing inside a calibrated range, and never pretends to be faster than the
> game allows.

I built it around a simple rule: if the bot cannot explain why it is waiting,
it should not be racing. That is why the panel gives a reason for every hold,
and why the queue would rather pause than guess.

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>It takes its time</h3>
      <p>Races start after a short, varied delay. Breaks, session limits and active hours are part of the loop, not an afterthought.</p>
    </td>
    <td width="33%" valign="top">
      <h3>It shows its work</h3>
      <p>Four views, six themes, and a reason for every wait. You can see the current pace, the next race and whatever is holding it up.</p>
    </td>
    <td width="33%" valign="top">
      <h3>It only reads</h3>
      <p>Friends and team counters use GET requests. The script never accepts, denies, invites, applies or sends anything.</p>
    </td>
  </tr>
</table>

## The panel

<p align="center">
  <img src="assets/panel-preview.png" width="460" alt="NITRO WRAITH live panel during a race: 107.0 WPM, 98.7% accuracy, an AUTO pace badge with 110 average and 230 top, season progress and session controls">
</p>

<p align="center"><sub>A real capture from the browser harness, with seeded demo values. The panel lives in the bottom-right corner of the game.</sub></p>

The panel is the control surface, not a black box:

- **Live:** WPM, accuracy, the account-backed AUTO pace badge, target range, race count, session average, result and the game HUD.
- **Garage queue:** what the bot is waiting for, the next race, Mystery Box timing and a one-line reason for every hold.
- **TUNE:** pace profile, limits, breaks, stickers, sound and the safety guard.
- **LOG / INFO:** history, season snapshot, diagnostics and the keyboard map.
- **Header:** a small `UPDATE` button that appears only when the Gist has a newer version. If there is no button, the copy is current.

### Pace that looks like yours

The first start reads the average and top WPM already stored on the account,
then the stats API refreshes them every 30 minutes. Auto-calibration is always
on; there is no toggle that freezes the pace at an old range. A 30 WPM account
gets a 26–34 WPM range. A 43 WPM account gets 37–49. The target is the average,
not the top, so every race is drawn around the player's normal pace instead of
starting at a generic 100+ WPM.

Clicking the `auto` row in TUNE only forces a fresh read. It never turns
calibration off.

### Six themes

<p align="center">
  <img src="assets/themes.png" width="100%" alt="The six NITRO WRAITH themes: Carbon, Aurora, Sunset, Ice, Violet and RGB">
</p>

<p align="center"><sub><strong>Carbon</strong>, <strong>Aurora</strong>, <strong>Sunset</strong>, <strong>Ice</strong>, <strong>Violet</strong> and <strong>RGB</strong>. All six keep the same layout; switch with <kbd>Alt</kbd> + <kbd>T</kbd> or the theme button.</sub></p>

The panel's **Update** link downloads the latest userscript directly from the
GitHub release. Auto-update still uses the small Gist metadata file, so an
installed userscript can check for a new version without downloading the whole
script.

## What it does

| Feature | What it does |
| --- | --- |
| **Race loop** | Opens the next race from the garage or the results screen, with a human delay. Rearms after a stop. |
| **Typing** | Reads your account average and top WPM, then races around that average (30 WPM stays near 30, 43 near 43) under a hard 120 WPM ceiling. Accuracy stays at the 96% reward floor or above. |
| **Rewards** | Claims the Mystery Box, closes daily challenges and uses stickers when the settings allow it. |
| **Session care** | Renews the session when needed. It never types a username or password, and never solves a CAPTCHA. |
| **Limits** | Session races, time, XP, active hours and daily race/XP budgets. |
| **Social** | Read-only Friends/Team counters. No write actions, ever. |

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [install link](https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.user.js) and confirm.
3. Sign in at [nitrotype.com](https://www.nitrotype.com/).
4. Reload. The panel appears in the bottom-right corner.

> [!IMPORTANT]
> Install **one** file only. NITRO WRAITH replaces the old "Auto Redirect Script"
> and "Auto Stickers"; keeping another copy loaded will fight over the queue.

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

In the garage, **Resume** does the same as <kbd>Alt</kbd> + <kbd>A</kbd>. With a
live race it forwards the key; otherwise it clears the hold and re-arms the queue.

## Safety

> [!WARNING]
> Nitro Type does not allow bots, and its anti-cheat can ban an account. NITRO
> WRAITH tries to keep the stats believable, but it cannot make automation
> invisible. This is your account and your risk. Never share cookies, tokens or
> credentials.

The script never types credentials and never attempts a CAPTCHA. Both stay
manual by design.

**Privacy:** there is no telemetry, analytics or third-party logging. The
`player_token` from the page is read only to call Nitro Type's own same-origin
API. It is never printed, included in an exported config or diagnostic, or sent
to another host. The only off-site request is the public Gist version check, and
it is made with credentials omitted.

## Under the hood

<details>
  <summary><strong>What gets automated, and what stays manual</strong></summary>

  <br>

  - The queue, the race loop, the typing plan, the Mystery Box, stickers, daily challenges and session renewal are automated.
  - Username, password, CAPTCHA and account changes are manual.
  - The panel reads the game's own persisted state where possible; it does not invent XP or race results.
  - The social panel is GET-only and never posts, accepts, denies, invites, applies or sends.
  - The guard stops the race on impossible WPM readings and warns when two copies are publishing at the same time.
  - The periodic panel paint runs at 1 Hz during a race and drops to one paint every two seconds while the bot is waiting; hidden tabs skip all DOM work. At boot only the Live view is mounted; Tune, Log and Info are templates mounted the first time they are opened. Repeated reads of `persist:nt`, session counters and the calibration stamp are cached until a write. Unchanged calibration/update text is cached, and read-only social GETs are kept for two minutes.

</details>

<details>
  <summary><strong>Why it pauses so much</strong></summary>

  <br>

  A fast queue is easy to detect and easy to get wrong. NITRO WRAITH leaves a
  visible reason for every wait: a break, a session limit, an active-hours gate,
  a DQ block or a missing race screen. The goal is not to race nonstop. It is to
  keep going without leaving the account stuck on a results screen or typing
  into a dead race.

</details>

## Releases

Releases are automatic. When the `check` workflow passes on `main` and
`nitro-wraith.user.js` changed, the release workflow bumps the patch version,
updates the Gist, tags the commit and creates the GitHub release. It needs a
repository secret named `GIST_TOKEN` with Gist write access; releases use the
built-in `GITHUB_TOKEN`.

- [Changelog](CHANGELOG.md)
- [All releases](https://github.com/ezurinho/nitro-wraith/releases)
- [Gist](https://gist.github.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58)

## Development

The script has no runtime dependencies. The harness needs Node 22+ and Chrome.

```bash
npm run live:test   # CLI checks without opening Chrome
npm run check       # syntax, Node checks, and the browser harness
npm test            # browser harness only
```

The main config lives in `CONFIG` at the top of `nitro-wraith.user.js`. Daily
settings live in `TUNE` and are stored in `localStorage`.

## Docs

- [`docs/NITROTYPE.md`](docs/NITROTYPE.md): game research, limits and design notes.
- [`tests/live/`](tests/live/): browser harness, live mode and fixtures.
- [`CHANGELOG.md`](CHANGELOG.md): what changed in each version.

## License

MIT. See [`LICENSE`](LICENSE).

<p align="center"><sub>NITRO WRAITH · human pace, no fast mode · one account</sub></p>
