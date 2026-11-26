# Nitro Type notes

Short notes on the game behavior this project is built around. The userscript
does not try to beat the game's limits; it tries to stay inside them.

## Pace

- WPM is `(characters / 5) / minutes`; a "word" is five characters including spaces.
- The profile's short WPM average is a rolling recent window, not the average of
  every race on the account.
- The stats API's monthly totals cover a much longer history. The script uses the
  higher lifetime average as an anchor when those totals are available; this
  keeps its own low races from dragging the target downward.
- Calibration sets the account envelope: a new average can raise the envelope
  but cannot lower a saved range. The live target inside it is a governor, not a
  random ten-session series: it starts at the account center, rises after three
  clean races and falls after a miss or a DQ, except a DQ that follows a
  recorded freeze: that is a timing failure, not a pace miss. The learned center
  survives reloads. Only custom WPM can pin it.
- When the short average collapses relative to the account top, the recovery
  floor is `min(110, round(top × 0.48), round(average × 1.25))`, provided the
  top is at least 80 WPM and at least 1.8× the average. A 38 WPM / 230 top
  account recovers to about 48 WPM, not 110; a 50 WPM account reaches 63. The
  floor can never jump more than 25% above the account average. Beginner
  accounts with a low top do not trigger it.
- Calibration is stored per account ID. Switching accounts clears the previous
  range, lifetime cache and calibration timestamp, then reads the signed-in
  account before applying a target. A 50 WPM account cannot inherit the 110 WPM
  range of another account in the same browser.
- The Live **Account** card shows the signed-in ID, effective average, live
  target, accuracy, adaptive range, monthly rows/pages, last read and a refresh
  button. A failed account read
  keeps the last usable range, retries after two minutes, then relaxes to
  fifteen minutes while the API stays down. Coming online or returning to the
  tab also triggers a read.
- `TUNE` exposes custom WPM (15–119) and custom accuracy (96–100). Empty means
  automatic; a value overrides auto calibration and is persisted with the
  exported configuration.
- A monthly snapshot is cached for 24 hours. A transient page failure is
  retried once; if it still fails, the last complete snapshot is reused and
  marked as stale. A partial page is never used to lower the target.
- Besides the 30-minute clock, a new account read is requested every 25
  completed races. It refreshes the envelope; the governor keeps the recent
  corrections, so a stale high objective can still be lowered by a bad race.
- The calibration diagnostic reports the recent average, the lifetime average,
  the number of monthly rows and API pages, and whether the snapshot is cached
  or stale.
- The script keeps its target below the hard 120 WPM ceiling and raises it at
  most one WPM per three clean races; it never chases a single fast result.
- The ten-value series is only a ±3 WPM human band around the governor's center;
  the first race of each cycle uses the recommended center. The band is seeded
  from the account ID, so the same account repeats it instead of reshuffling on
  every reload.
- Accuracy below 96% loses the accuracy bonus, so the floor is 96%. The same
  governor lowers the accuracy target one point after a race below it and only
  raises it after four clean races. Each race is compared against the accuracy
  goal it actually used, including the buffer of that session.

## Race loop

- Nitro Type fills empty seats with bots and sizes race text for roughly 25 seconds.
- A race with no typing for 12 seconds can trigger an inactivity DQ.
- Five DQs in a row can block racing for a while.
- A hidden tab can be frozen by Chrome (Energy Saver, memory pressure or
  bfcache). A frozen page cannot type, so `backgroundFarm` is off by default;
  it can be enabled in `TUNE` or with the garage's **AFK off/on** button only if
  that freeze risk is accepted. If a freeze lands while a race is live, a
  **freeze hold** stops new hidden races until one race starts with the tab
  visible (or the AFK health reset clears it); it does not turn AFK off. Both panels and every open tab receive the
  switch through localStorage events; with no other gate active, the garage row
  reads `off`, `on` or `on · hidden`, while sign-in, stop, block and active-hours
  gates keep priority.
- `keepAlive` (AFK keep-alive) is a second, independent opt-in and is off by
  default. While AFK farming is enabled it creates a local `AudioContext` with
  a constant source at gain `0.001` (the known silent keep-alive level), so the
  tab is not a quiet background tab from Chrome's point of view. It downloads
  nothing and is inaudible. The context needs a user gesture; the TUNE label
  reports `on`, `ready`, `blocked`, `waiting` or `n/a` instead of claiming it is
  active when suspended. It is best effort: muted tabs, Energy Saver, browser
  policies and OS audio suspension can still freeze or discard the tab, so the
  visible-tab default remains the safe option.
- The pace ceiling never holds a key more than 5.5 seconds, and a live-race
  watchdog sends one correct key if it sees no accepted key for 7 seconds and
  no key sent for 7 seconds. That stays below the ~12 second DQ window when the
  main loop is stuck behind a lock or an unexpected wait.
- The queue adds human delays, occasional long breaks, and session or daily limits.
- With `navigator.onLine === false` the queue cancels scheduled clicks, stops
  pressing Race Now/Continue/claim, and shows `waiting · offline`; the `online`
  event wakes it immediately. The race loop waits before opening the next race.
  A false "offline" reading is conservative: it clears on the browser event and
  is rechecked every second.
- Mystery Box, daily challenges, stickers, and the season card are read from the
  game's own persisted state where possible. When stickers are enabled, one is
  sent in every race; if the chat is not mounted yet, the next tick retries.

## Friends and Team

The social panel is read-only. It performs three GET requests:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v2/friends` | friends total |
| `GET /api/v2/friends?online=1` | friends online now |
| `GET /api/v2/friend-requests` | pending requests |

The panel never accepts, denies, invites, applies, or sends anything. It also does
not arm the race queue from `/friends` or `/team`.

## Session

- The script renews the site token before it expires.
- It may use the browser's remembered SSO provider after a session drop.
- It never types a username or password.
- It never tries to solve a CAPTCHA.
- CAPTCHA and credential login stay manual by design.

## Reliability

- If an internal error repeats, or happens while a race is live, the script
  enters **safe mode**: it releases the typing lock, stops the queue and shows a
  banner instead of continuing to click. The flag survives a reload until the
  user presses **resume**.
- The race frame is checked against a small DOM contract (the React typing
  component and its lesson content). If the component disappears after the race
  has started, the script reports `ui-drift` and stops instead of pressing keys
  blind. A slow mount is covered by a five-second grace window.
- The diagnostic report and the support bundle include the flight recorder, the
  safe-mode state and the contract snapshot. Tokens and account identifiers are
  redacted before the bundle is copied.

## Risk

Nitro Type prohibits bots. Its anti-cheat can ban an account even when the typing
pace looks human. The script cannot make automation invisible. Use it on your own
account and at your own risk.

## Tests

The browser harness uses a clean Chrome profile and local fixtures; it does not
touch an account. The live mode can attach to an already signed-in Chrome session
when you explicitly run it.

```bash
npm run live:test   # CLI checks without Chrome
npm run check       # syntax, Node checks, and browser harness
npm test            # browser harness only
```
