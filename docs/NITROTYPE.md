# Nitro Type notes

Short notes on the game behavior this project is built around. The userscript
does not try to beat the game's limits; it tries to stay inside them.

## Pace

- WPM is `(characters / 5) / minutes`; a "word" is five characters including spaces.
- The account average is based on the last 10 races.
- The script keeps its own target below the hard 120 WPM ceiling and never raises
  the target to chase a fast result.
- Accuracy below 96% loses the accuracy bonus, so the floor is 96%.

## Race loop

- Nitro Type fills empty seats with bots and sizes race text for roughly 25 seconds.
- A race with no typing for 12 seconds can trigger an inactivity DQ.
- Five DQs in a row can block racing for a while.
- The queue adds human delays, occasional long breaks, and session or daily limits.
- Mystery Box, daily challenges, stickers, and the season card are read from the
  game's own persisted state where possible.

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
