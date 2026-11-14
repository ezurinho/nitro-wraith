# Changelog

## 8.14.15 — 2026-11-14

- feat: give the panel and garage the Nitro Wraith mark
- privacy: replace the third-party userscript icon and omit the referrer on update checks

## 8.14.14 — 2026-11-14

- perf: lazy-mount panel views and trim startup reads

## 8.14.13 — 2026-11-14

- fix: paint a completed challenge without waiting for idle cadence
- perf: halve panel paints while the bot is waiting

## 8.14.12 — 2026-11-14

- perf: cut redundant panel work and social refreshes

## 8.14.11 — 2026-11-14

- feat: keep pace always synced to account stats

## 8.14.10 — 2026-11-14

- feat: calibrate pace to the account's own WPM
- test: seed today's summary for the panel screenshot
- test: size the screenshot viewport for the full live panel

## 8.14.9 — 2026-11-14

- test: force only the screenshot paint, not every debug patch
- test: force the panel repaint when seeding screenshot state
- test: log the seeded panel state for screenshot debugging

## 8.14.8 — 2026-11-14

- test: stop the boot loop before seeding panel screenshots
- fix: repaint the week card when completed challenges change

## 8.14.7 — 2026-11-14

- test: seed a live panel for the theme captures
- test: capture the panel themes from the browser harness

## 8.14.6 — 2026-11-13

- feat: refresh the project page and trim background scans

## 8.14.5 — 2026-11-13

- perf: paint the idle panel once per second

## 8.14.4 — 2026-11-13

- perf: throttle optional DOM scans while racing
- test: count panel DOM mutations while folded and hidden
- test: compare panel performance while folded and hidden

## 8.14.3 — 2026-11-13

- feat: group the TUNE view into rhythm, limits and automation

## 8.14.2 — 2026-11-13

- Paint the live panel at the game HUD rate (1 Hz) and skip the full DOM paint
  while the panel is folded or the tab is in the background.
- Cache the day summary and 7-day history, invalidate them immediately on
  storage changes, and reuse one modal read per queue tick.
- Remove paint-heavy panel effects (boot blur, sparkline drop shadow, animated
  RGB swatch) and pause RGB while racing or folded.
- Add view headers, rail tooltips, ARIA tabs with keyboard navigation, a global
  race progress line, a stable footer, and guarded DOM writes.
- Fix the season card so it repaints after the panel is rebuilt.

## 8.14.1 — 2026-11-13

- Refresh the read-only Friends/Team panel on focus, visibility, and route changes.
- Add a 12-second timeout to the three social GET requests.
- Show a visible `updated` row with `refreshing…`, age, or `retry`.
- Scope the social cache to the active account and ignore late responses after an account switch.
- Stop background polling while the tab is hidden.
- Only rewrite `aria-live` values when the count changes.
- Accept `totalFriends`, `teamTag`, and `teamRoleName` as profile fallbacks.
- Publish `nitro-wraith.*` in the Gist at revision
  `e3704655653c71fe3ff0427c7f86fc5707168316`; the old
  `nitrotype-autotyper.*` files remain for compatibility.

## 8.14.0 — 2026-11-12

- Add the read-only Friends/Team panel.
- Show friends, online friends, pending requests, and team tag/role.
- Use only three GET requests; never accept, deny, invite, apply, or send.
- Keep the race queue disarmed on `/friends` and `/team`.

## 8.13.0 — 2026-11-12

- Import the userscript, browser harness, documentation, and export tool.
- Exclude browser sessions, local exports, and generated account histories.
