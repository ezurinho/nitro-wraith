# Changelog

## 8.14.47 — 2026-11-18

- feat: keep AFK health fresh and allow freeze reset
- fix: compare build output without line-ending noise

## 8.14.46 — 2026-11-16

- fix: keep build output out of release metadata
- feat: split userscript into modules and improve AFK, UI and updates

## 8.14.45 — 2026-11-16

- feat: add optional silent AFK keep-alive

## 8.14.44 — 2026-11-16

- feat: hold races while offline and keep the queue tick alive

## 8.14.43 — 2026-11-16

- feat: sync AFK farming between the race panel and garage

## 8.14.42 — 2026-11-16

- feat: refresh account calibration by races and retry monthly pages

## 8.14.41 — 2026-11-16

- feat: add instant settings filter to TUNE

## 8.14.40 — 2026-11-16

- feat: show account health and retry failed stats reads

## 8.14.39 — 2026-11-16

- fix: read the full account before the first race after a switch

## 8.14.38 — 2026-11-16

- feat: calibrate each account and send stickers every race

## 8.14.37 — 2026-11-16

- fix: prevent inactivity DQs and surface updates and real targets

## 8.14.36 — 2026-11-16

- fix: stop automatic pace from lowering the target

## 8.14.35 — 2026-11-15

- feat: keep the garage update reachable when folded

## 8.14.34 — 2026-11-15

- feat: audit lifetime calibration and keep the last complete snapshot
- test: bring the lease owner forward before checking the typing lock

## 8.14.33 — 2026-11-15

- feat: give the garage update button a download icon

## 8.14.32 — 2026-11-15

- feat: show the new version in the garage update button

## 8.14.31 — 2026-11-15

- feat: show the update control in the garage panel

## 8.14.30 — 2026-11-15

- fix: anchor pace calibration to the lifetime average
- test: give the Web Lock handoff more time

## 8.14.29 — 2026-11-15

- fix: identify a tab by document/window.name instead of cloned sessionStorage
- fix: elect the typing tab with the Web Locks API and release the lock on standby
- fix: discard partial races when the app disappears or refuses keys
- fix: keep the pause guard armed during the countdown and on the worker clock
- fix: hold the Web Lock across breaks to opt out of Energy Saver freeze, and release it on freeze/resume
- fix: make liveSituation a pure read so panel paints do not change roles
- feat: disqualification modal always exits through Garage, never Try Again
- test: require the primary tab to hold the Web Lock and follow the lease handoff

## 8.14.28 — 2026-11-15

- feat: live race watchdog with real phase, lease owner and accepted-key age
- fix: standby copies now see the active copy's progress before rescuing the turn
- fix: the watchdog stays out of results and only rescues inside a live race loop

## 8.14.27 — 2026-11-15

- fix: recover a live race when the standby tab stops typing
- fix: expose the tab lease in the diagnostic report

## 8.14.26 — 2026-11-15

- fix: keep a terminal account ban stopped until it is cleared
- fix: keep the queue paused until Resume after a ban is cleared
- fix: keep login recovery from rearming a terminal stop
- fix: keep a live race tab ahead of the garage tab
- fix: stop a live race from abandoning itself after 6 s
- fix: fall back to the timer when the worker clock does not answer
- test: cover a terminal ban after 24 h

## 8.14.25 — 2026-11-14

- test: measure the folded panel by DOM work
- feat: separate permanent bans from manual stops

## 8.14.24 — 2026-11-14

- feat: stop automation on a terminal account ban

## 8.14.23 — 2026-11-14

- feat: summarize recent stops by reason in the garage

## 8.14.22 — 2026-11-14

- fix: carry the stop reason into the race panel

## 8.14.21 — 2026-11-14

- test: allow background storage reads during panel startup
- test: make panel performance checks robust at sub-ms resolution
- fix: show why the garage is stopped and for how long

## 8.14.20 — 2026-11-14

- fix: keep the garage stop available while a race is live

## 8.14.19 — 2026-11-14

- fix: add a real stop control to the garage

## 8.14.18 — 2026-11-14

- fix: keep a single update control in the header

## 8.14.17 — 2026-11-14

- fix: wait out the site block before opening another race

## 8.14.16 — 2026-11-14

- feat: add an always-visible GitHub Update link and a simpler, flatter panel layout

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
