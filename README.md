# NITRO WRAITH

**Human pace. Zero fast mode.**

A Tampermonkey userscript for a single Nitro Type account. It chains races with
human delays, keeps typing inside a calibrated range, and stays in AUTO. There is
no fast mode and no shortcut around the pace.

[![Version](https://img.shields.io/badge/version-8.14.1-1f6feb?style=flat-square)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-2ea043?style=flat-square)](LICENSE)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-userscript-f59e0b?style=flat-square)](https://www.tampermonkey.net/)
[![check](https://github.com/ezurinho/nitro-wraith/actions/workflows/check.yml/badge.svg)](https://github.com/ezurinho/nitro-wraith/actions/workflows/check.yml)

**[Install latest](https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.user.js)** · [Release](https://github.com/ezurinho/nitro-wraith/releases/tag/v8.14.1) · [Gist](https://gist.github.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58) · [Changelog](CHANGELOG.md)

## What it does

- Chains races from the garage and the results screen with human delays, breaks,
  and limits for session, time, XP, or races per day.
- Keeps WPM and accuracy inside a calibrated range. The hard ceiling is 120 WPM
  and accuracy never drops below 96%.
- Claims the Mystery Box, closes daily challenges, uses stickers when needed, and
  calculates the season from the game's real XP.
- Renews the session when needed. It never types a username or password and never
  tries to solve a CAPTCHA. Those two stay with you.
- Shows a read-only Friends/Team panel with friends, online, requests, and team.
  It never accepts, denies, invites, or sends anything.
- Has four views (`STATS`, `TUNE`, `LOG`, `INFO`), six themes, and a compact
  garage panel.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [install link](https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.user.js)
   and confirm.
3. Sign in at `https://www.nitrotype.com/`.
4. Reload. The panel appears in the bottom-right corner.

To install manually, create a new Tampermonkey script and paste
`nitro-wraith.user.js`. Install **one** file only: this script replaces the old
"Auto Redirect Script" and "Auto Stickers".

## Usage

The bot is always **AUTO**. It starts on its own, chains races, and re-arms after
each stop.

| Shortcut | Action |
| --- | --- |
| `Alt+A` | Resume, including mid-race |
| `Alt+N` | Stop |
| `Esc` / `Alt+S` | Stop after the current race |
| `Alt+T` | Cycle the panel theme |
| `Alt+G` | Fold the garage panel |
| `Alt+M` | Mini-HUD: full, compact, or hidden |
| `Alt+R` | Clear the panel history |
| `Alt+H` | Print closed sessions to the console |

In the garage, **Resume** does the same as `Alt+A`. With a live race it forwards
the key; otherwise it clears the hold and re-arms the queue.

## Development

The script has no dependencies. The harness needs Node 22+ and Chrome.

```bash
npm run live:test   # CLI checks without opening Chrome
npm run check       # syntax, Node checks, and the browser harness
npm test            # browser harness only
```

The main config lives in `CONFIG` at the top of `nitro-wraith.user.js`. Daily
settings live in `TUNE` and are stored in `localStorage`.

## Docs

- [`CHANGELOG.md`](CHANGELOG.md): what changed in each version.
- [`docs/NITROTYPE.md`](docs/NITROTYPE.md): game research, limits, and design
  notes.
- [`tests/live/`](tests/live/): browser harness, live mode, and fixtures.

## Warning

Nitro Type prohibits bots and its anti-cheat can ban an account. This does not
make a bot invisible; it only tries to keep the stats believable. It is your
account and your risk. Never share cookies, tokens, or credentials with the
script.

## License

MIT. See [`LICENSE`](LICENSE).
