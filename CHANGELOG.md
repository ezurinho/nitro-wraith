# Changelog

## 8.14.87 — 2026-11-26

- feat(garage): move the panel with the keyboard and Home

## 8.14.86 — 2026-11-25

- fix(stop): keep a manual stop until an explicit resume

## 8.14.85 — 2026-11-25

- build(lint): gate the built bundle with no-undef
- fix(garage): repaint after freeze and AFK changes

## 8.14.84 — 2026-11-25

- feat(guard): stop the queue when the site stops crediting races

## 8.14.83 — 2026-11-24

- fix(queue): serialize tab actions with a short Web Lock (#27)

## 8.14.82 — 2026-11-24

- fix(profile): reject stale account responses in flight (#26)

## 8.14.81 — 2026-11-24

- fix(profile): clear race state when the account changes (#25)

## 8.14.80 — 2026-11-24

- fix(guard): fail closed when coordination is unavailable (#24)

## 8.14.79 — 2026-11-24

- fix(release): validate Gist metadata outside shell (#23)

## 8.14.78 — 2026-11-24

- feat(api): expose a read-only integration surface (#22)

## 8.14.77 — 2026-11-24

- fix(panel): refresh challenges on race results (#21)
- test(ui): guard palette parity between both sheets (#20)

## 8.14.76 — 2026-11-24

- perf(panel): keep garage heartbeats free of DOM writes (#19)

## 8.14.75 — 2026-11-24

- perf(panel): keep idle ticks free of DOM writes (#18)
- test(browsers): boot the userscript in Firefox and WebKit (#16)

## 8.14.74 — 2026-11-24

- feat(panel): clean streak, result flash and install-now (#15)

## 8.14.73 — 2026-11-24

- feat(panel): motion levels, ambient loops and auto-install countdown (#14)

## 8.14.72 — 2026-11-24

- feat(a11y): audit WCAG contrast and add narrow visual baselines (#13)

## 8.14.71 — 2026-11-24

- feat(brand): redraw the wraith mark and refresh the README art (#11)

## 8.14.70 — 2026-11-24

- fix(panel): give the garage sheet the same design floor as the race panel (#10)

## 8.14.69 — 2026-11-24

- refactor(design): tokenise state inks and close the Hallmark floor (#8)

## 8.14.68 — 2026-11-24

- test(live): widen the boot budget for shared CI runners (#7)
- fix(pace): keep the race drift inside the band the panel shows (#6)

## 8.14.67 — 2026-11-24

- fix(update): serve updates from releases and harden the panel (#4)

## 8.14.66 — 2026-11-24

- perf(panel): defer panel assets, test the queue policy and bound the repaint (#3)

## 8.14.65 — 2026-11-24

- feat(panel): RGB Lab, Race Focus and rhythm chart (#2)

## 8.14.64 — 2026-11-23

- feat(panel): add contextual adaptive UI (#1)

## 8.14.63 — 2026-11-23

- feat(panel): the account card says when it will race and when it will rest
- feat(calendar): give the account rest days and a night curve
- feat(pace): give every race its own pace and accuracy inside the band

## 8.14.62 — 2026-11-23

- feat(panel): readable labels, reduced motion and a spoken race state

## 8.14.61 — 2026-11-23

- feat(pace): make the top-share rule depend on each account, not on a number

## 8.14.60 — 2026-11-23

- feat(pace): aim at the account's own top speed, not at its average

## 8.14.59 — 2026-11-23

- feat(panel): keep every WPM a whole number

## 8.14.58 — 2026-11-23

- refactor(queue): move the 16 helpers that carry no queue state out of runQueue
- refactor(tests): move the visual capture out of run.js
- feat(visual): record the two values that change by themselves

## 8.14.57 — 2026-11-22

- refactor(panel): move the shadow-root markup out of createPanel
- feat(tools): map a module before splitting it

## 8.14.56 — 2026-11-22

- refactor(panel): move the rail and the slider fills

## 8.14.55 — 2026-11-22

- refactor(panel): move the theme block and the storage bridges
- test(source): gate loose equality, debugger and focused tests
- refactor(panel): move the stylesheet into its own module
- fix(tools): keep the launcher readable in any console
- feat(tools): add the overnight launcher and the night runbook
- fix(visual): seed the day on the frozen page and fail when it does not land
- fix(harness): close the tab instead of leaking it
- feat(visual): let accept and compare target a subset of shots

## 8.14.54 — 2026-11-22

- fix(guard): keep the elected copy when the registry is trimmed
- fix(pace): hold the ceiling from the first keystroke and prove it in the harness
- test: fail when src/ and the build manifest disagree
- fix(test): make npm test the synced offline gate and keep the harness apart
- fix(build): stop rewriting the artifacts on line-ending drift
- test: cover the tune, log and garage views in the visual regression

## 8.14.53 — 2026-11-19

- feat: add a recent accuracy readout
- test: refresh the visual baselines for 8.14.52

## 8.14.52 — 2026-11-18

- feat: add panel visual regression and a live readout
- fix: stamp canary builds with the checked-out commit

## 8.14.51 — 2026-11-18

- feat: add a separate canary release channel

## 8.14.50 — 2026-11-18

- fix: only redact real secrets in the flight recorder

## 8.14.49 — 2026-11-18

- feat: add AFK safety interlock, health center and flight recorder

## 8.14.48 — 2026-11-18

- feat: add a GitHub fallback for update checks

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
