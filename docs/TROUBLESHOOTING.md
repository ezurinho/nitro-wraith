# Troubleshooting

Start with the panel footer: it names the current state (`waiting`, `break`,
`paused`, `racing`, `safe mode`) and the last stop reason. The garage panel keeps
the queue decision and the last failure.

## The panel is not there

1. Confirm Tampermonkey is enabled and the script is installed.
2. Open `https://www.nitrotype.com/` and reload. The main panel lives in the
   race frame; the smaller garage panel appears on the home/garage pages.
3. Keep only one copy of NITRO WRAITH installed. The old
   `nitrotype-autoqueue.user.js` or `nitrotype-autotyper` scripts fight over the
   queue and the typing lock.
4. Check that the URL is `https://www.nitrotype.com/` (the `@match` does not
   cover other hosts).

## Safe mode

A banner reading **NITRO WRAITH · safe mode** means the script contained an
internal error instead of continuing to click or type. The keyboard is back to
the game and the queue is stopped.

- **resume** clears the flag and reloads the page.
- **copy report** copies the diagnostic JSON.
- The mode is stored in `localStorage` under `nta:safeMode`; three boot failures
  in a row also turn it on.
- If it returns immediately, open an issue with the report and the support
  bundle. Do not keep clearing it and racing: a repeated error may be a browser
  extension conflict or a game change.

## "Game UI changed" / `ui-drift`

The script checks that the race typing component still exists. If it disappears
after a race has started, it stops instead of pressing keys blind. This usually
means Nitro Type changed its page.

- Reload once. If the message returns, the build needs an update.
- Open an issue with the version, the page and the support bundle. The bundle
  includes the contract snapshot and the last flight-recorder events.

## The queue says `waiting` and does not start

The footer or garage row should say why. Common gates:

| Message | Meaning |
| --- | --- |
| `offline` | The browser reports no network; the queue resumes on the `online` event. |
| `break` | A human break is in progress. It ends by itself. |
| `paused` | Pause was requested; `Alt+A` or Resume clears it. |
| `blocked` | The site reported too many disqualifications; the wait escalates. |
| `limit` | A session or daily race/XP/time budget is reached. |
| `active hours` | The active-hours window is closed. |
| `ban` | A terminal account ban was detected; clear it manually only after checking the account. |
| `AFK` / `hidden` | AFK farming is off, or the interlock is waiting for the keep-alive. |
| `login` | The site session expired; sign in manually. The script never types credentials. |

## Updates and canary

- The update badge appears only when the Gist has a newer version. The script
  checks on open, every five minutes, when the network returns and when the tab
  becomes active.
- **canary** installs the test pre-release; in a canary build the same button
  reads **stable** and returns to the normal channel.
- A canary build never edits the stable Gist, stable tags or
  `releases/latest`.
- To roll the canary back, run the **canary** workflow with `ref` set to an
  earlier `canary-<version>` tag. The stable release is untouched.

## "Update blocked" / `integrity`

The panel checks the SHA-256 of the candidate userscript against `build.json`
before offering an install. `integrity: ...` means the bytes did not match, the
manifest was missing, or the browser has no `crypto.subtle`.

- Do not install from a saved copy you cannot verify. Reload and let the normal
  five-minute check try again.
- If the Gist lags behind the release, the check retries; a mismatch that
  persists means one of the two hosts is serving different content. Open a
  security report instead of forcing the install.
- Older releases without `build.json` are not offered through this path.

## Support bundle

In **TUNE → Health**, press **support**. It copies a JSON object with:

- version, channel, browser, language and page;
- the diagnostic report (profile, counters, last races, notices, flight);
- safe-mode and UI-contract state.

It removes token-shaped values and keys such as `username`, `userID`, `email`,
`player_token`, `cookie` and `authorization`. The copy is still worth a quick
review. If the clipboard is blocked, the JSON is placed in the config box so it
can be copied by hand.

## Browser support

Chrome and Edge are the tested browsers. Firefox is not tested; reports are
welcome, but the Web Locks, Page Lifecycle and audio behavior can differ. See
[COMPATIBILITY.md](COMPATIBILITY.md).

## Commands for maintainers

```bash
npm run check                 # build check, syntax, release/README checks, live checks, harness
npm run visual                # 15 panel screenshots against the committed baselines
npm run visual -- --only=view-garage-idle  # one shot while investigating a diff
npm run visual -- --timeout=180            # bound the capture watchdog (seconds)
npm run visual:accept         # accept the current captures as new baselines
npm run release:verify -- vX.Y.Z  # releases with build.json/SHA256SUMS
npm run budget               # artifact size, gzip and fragment limits
npm run score                # static hygiene score printed at the end of npm run check
npm run build:repro          # two clean rebuilds, compared with the artifact
npm run hotfix:plan -- --from v8.14.52
npm run hotfix:build -- --from v8.14.52 --out dist/hotfix
```

`visual` captures in visual-only mode: the 85 live checks are skipped, the
gallery clears storage and seeds its own demo account, and the run takes
seconds. `npm test` still runs the whole harness. `--only` limits the
comparison (and a later `visual:accept`) to the named shots; it does not skip
the captures, because the states are seeded in sequence.

`release:verify` and `hotfix` are documented in [ROLLBACK.md](ROLLBACK.md).
