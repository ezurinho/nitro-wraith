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
- Automatic calibration is a ratchet: a new average can raise the target but can
  never lower one that is already saved. Only the custom WPM override may lower
  it. This prevents a slow streak from becoming a permanent slow profile.
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
- The Live **Account** card shows the signed-in ID, effective average, target,
  top, monthly rows/pages, last read and a refresh button. A failed account read
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
  completed races. The target is still a ratchet, so this can raise a stale
  objective during a long session but cannot lower it.
- The calibration diagnostic reports the recent average, the lifetime average,
  the number of monthly rows and API pages, and whether the snapshot is cached
  or stale.
- The script keeps its own target below the hard 120 WPM ceiling and never raises
  the target to chase a fast result.
- Accuracy below 96% loses the accuracy bonus, so the floor is 96%.

## Race loop

- Nitro Type fills empty seats with bots and sizes race text for roughly 25 seconds.
- A race with no typing for 12 seconds can trigger an inactivity DQ.
- Five DQs in a row can block racing for a while.
- A hidden tab can be frozen by Chrome (Energy Saver, memory pressure or
  bfcache). A frozen page cannot type, so `backgroundFarm` is off by default;
  it can be enabled in `TUNE` or with the garage's **AFK off/on** button only if
  that freeze risk is accepted. Both panels and every open tab receive the
  switch through localStorage events; with no other gate active, the garage row
  reads `off`, `on` or `on · hidden`, while sign-in, stop, block and active-hours
  gates keep priority.
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
