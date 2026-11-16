// ==UserScript==
// @name         NITRO WRAITH
// @namespace    nitro.wraith
// @version      8.14.46
// @updateURL    https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.meta.js
// @downloadURL  https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.user.js
// @description  Human-paced Nitro Type racer for one account: auto-calibrated to the account's own WPM average and top speed under a hard 120 WPM ceiling, automatic race loop with breaks and session limits, Mystery Box, stickers, CAPTCHA/session recovery, a live four-view panel and a safety guard. Always AUTO; no fast mode.
// @homepageURL  https://github.com/ezurinho/nitro-wraith
// @supportURL   https://github.com/ezurinho/nitro-wraith/issues
// @author       NITRO WRAITH
// @match        https://www.nitrotype.com/*
// @icon         https://raw.githubusercontent.com/ezurinho/nitro-wraith/main/assets/logo.svg
// @license      MIT
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
===================================================================================
QUICK CONFIGURATION
===================================================================================

Everything adjustable lives in CONFIG, a few lines below:

  CONFIG.wpm       -> WPM range drawn once per session (the "balanced" profile)
  CONFIG.accuracy  -> accuracy range drawn once per session
  CONFIG.useNitro  -> Auto nitro: skip one word per race (strategy in TUNE)
  CONFIG.wpm.hardCap -> hard ceiling: no race may ever average above it

Both ranges are calibrated against the signed-in account's own history, not a
generic 110 WPM. The original setup (110 WPM average, 97% accuracy) is only an
example; a 50 WPM account stays near 50 and a 100 WPM account never drops to 45.
Switching accounts in the same browser clears the old range and reads the new
account before racing.

No need to clear localStorage by hand any more: the series are stored with a
signature (min:max:sessions), so they regenerate themselves when the ranges
change.

Day to day you should not need to edit this file at all: the "⚙" button of the
panel opens a settings drawer with the pace profile (soft / balanced / fast, all
inside the calibrated envelope and under the ceiling), the switches (breaks,
Mystery Box, stickers, guard, Auto nitro) and export/import of that little configuration as
JSON, so the same setup can be carried to another browser or account. Everything
there is saved in localStorage and survives reloads; the file stays as the
source of truth for the numbers themselves.

Modes (there is one mode, AUTO, and no switch to leave it: the MODE chip is a
status badge):
  Alt+A                resume, at any time, even while typing, and from
                        anywhere on the page (the top window forwards the keys
                        to the race frame)
  Alt+N                stop the bot: stopping is a state, not a mode, so Alt+A
                        or the next garage visit starts it again
  Alt+T                cycle the panel theme (all six skins, saved)
  Alt+G                fold / unfold the garage panel
  Alt+M                cycle the footer HUD: full -> compact -> hidden

There is no NORMAL mode since 7.12.0, no OFF, and since 7.14.0 no MANUAL either:
the chip always reads AUTO and a waiting bot says "waiting" in amber. The queue
re-arms by itself when the stop hold expires, so the bot never waits for a click
to get going again.

The middle pace profile is BALANCED: the account's own average, read from the
site profile and the stats API. Soft and fast move half a range below or above
it, never to a fixed 100+ range. It used to be called "normal"; a value saved
under that old name is read as balanced, so the chip and the TUNE control never
show the word again.

The panel's WPM uses the same clock as Nitro Type. A race starts when the light
goes out and the first accepted key lands slightly later, so the start is set
back to the midpoint between the previous attempt and that one
(CONFIG.startLagMaxMs caps the correction). Otherwise the panel would run 1-2%
above the game for the whole race.

Garage panel: the typer's panel only exists inside the race frame, so the garage
(where the daily Mystery Box lives) had no panel at all and the box looked like
it was never claimed. A small second panel lives in the top window, only on the
home page and the garage: LED, NITRO WRAITH and the queue build, a MODE chip that
always reads AUTO, the state, the Mystery Box (ready, when the next check is, or
when it was claimed), the next race, and two buttons:
"Claim box" (presses the site's own button and closes the reward modal; from any
other page it takes the bot to the garage and claims there, instead of sitting
dead because that button is not on screen, and it never goes grey) and "Race
now" (opens a race immediately). The garage always starts in AUTO on a
new visit, so a redirect here (a DQ, a reload) cannot leave the bot silent, and
"Race Now" keeps its human delay before opening anything. During that delay the
panel shows the countdown in the "next race" row and clicking it cancels this
start without turning the bot off (it offers it again 30 s later), so a sudden
race is never a surprise and never needs a click: the queue re-arms itself once
the stop hold expires. A stop that was deliberate (the
session limit or Esc) is respected: the typer leaves a mark and the garage does
not open a race nobody would type for the next 10 minutes (that race would end in
an inactivity DQ). There is no mode to switch: Alt+A (or the chip, which only
starts) turns the bot back on at once. It can be dragged, the position is saved
and a double click sends it back to its corner.

Floating panel (v7, redesigned): dark overlay with a neon-green accent, a header
with the LED, the name and the build, a strip of three chips (pace profile, mode
and hard ceiling) and an icon rail on the left that switches between four views,
with a green square that slides between them:

  - STATS   the live race: big live WPM and accuracy (they knock on every whole
            unit of change), the thin progress bar, and the rows: target, race,
            races closed in this session, the session average (green within
            +-2% of target), which calibration sample is active, the trim factor
            (only once it has moved), the WPM the game itself is printing
            ("game" row, next to the ceiling), the last race's place and prize
            ("result" row, read from the game's own `server` events, so it is the
            real 1st/2nd/3rd and the real cash, not scraped guesses), why the bot
            is waiting, the day
            summary, the daily Mystery Box, the countdown to the next break and
            the DQ streak. Below it, the last 10 races with their time, place,
            XP, WPM and deviation from target (green within +-2%, amber
            outside), plus their average and best.
  - TUNE    the settings in three sections: Rhythm (pace profile and
            calibration), Limits (session, daily budget and active hours) and
            Automation (switches, auto nitro, theme and config tools).
  - LOG     the closed sessions (the last four, with their deviation), a 7-day
            summary (races, average WPM, DQ and Mystery Boxes, one row per day)
            and the last notices with their time, without opening the console.
            The first
            card is the last session that closed: it reads "last" when what you
            are looking at is the session that just closed and "prev" when it is
            an older one, and clicking it prints the table Alt+H prints.
  - INFO    what the script is, the keys and the guard, in plain words.

The bottom bar is the line you read at a glance: LED, state (idle / racing /
paused / break / stopped), mode, live WPM, the ceiling and the key hint. Alt+R
clears the race history (handy when starting a fresh session) and Alt+H prints
closed sessions in the console.

Session limit: three independent limits live in TUNE's Limits section, each with its
clickable row and its slider, and the first one to arrive closes the session:
"limit" cycles free / 10 / 20 / 50 / 100 races, "time" cycles free / 15 min /
30 min / 1 h / 2 h and "xp" cycles free / 5k / 10k / 25k / 50k. All three are
remembered in localStorage. The time limit counts from the first race of the
session, never from the moment the limit is set; the XP limit adds up what the
game itself pays in each race (the same real reward the panel shows), not an
estimate. Both are only checked between races: a race in progress always
finishes. Once a limit is set, the "limit" row also
carries an estimate of what is left ("20 · ≈14m"): it is measured, not guessed
-the cycle from one race start to the next, breaks included, with the break
cadence of the session itself and CONFIG.eta only as the fallback- and the
tooltip spells out the numbers it used. When the limit is reached, the bot
finishes the race, closes the session and stops with the reason on the status
line. That same
summary (average WPM, deviation from target, accuracy and DQ of the session)
accompanies ANY stop -Esc, the Stop button, two DQ in a row or a block-, and
every closed session is logged for Alt+H. Resuming with A opens a new session:
counters, averages, break cadence and the estimate back to zero. A DQ never
counts towards the limit, just like it does not count towards breaks.

The session (races and breaks) is stored in localStorage and survives reloads of
the race frame: before, every reload reset the counter and breaks never fired.
If you open the page again more than 30 minutes later, a new session starts
(CONFIG.sessionResumeMs).

Pausing is remembered too: pause and reload the app and it stays paused instead
of typing on its own. Esc clears it (emergency stop) and it also expires after
30 minutes.

CAPTCHA: once the check is solved (by you or by an extension that solves it), the
game paints a modal with "Validated! Play on." and a "Continue" button that
reloads the app. The script watches for that modal both in the race and in the
top window and presses Continue for you; after that the queue and the typing
carry on as usual.

Session warning: when the app paints the "Logout Warning" ("Your session will
expire soon..."), the script presses «Yes, I'm here!» for you. That button clears
the modal and reloads the app, which is what renews the session; without it the
session really does expire and the bot ends up half way through a session on
/login. The warning is looked for in the race and in the top window, and the
click happens as soon as it appears: if it lands mid-race that race is lost, but
waiting would only trade a DQ for a sign-out. If the reload leaves the bot on the
garage, "Race Now" is pressed after a human delay and the queue carries on. If
the session is already gone, the script disarms itself and says so in the
console.

Automatic re-login: whenever the app leaves you on /login (expired session,
closed PC, a broken redirect...), the queue in the top window presses the same
one-click provider you used last time (remembered for 30 days; e.g. "Log In
with Google" or "Log In with ClassLink"), whether or not the bot was armed,
with a human 3.5-11 s pause and up to 3 attempts. With no recent memory it
falls back to CONFIG.queue.sso (ClassLink by default; also google, clever and
facebook). If your last sign-in was the username/password form it never presses
an SSO by itself: a different account could open. If the login screen renders
without its button, or it comes back after those attempts, the page is reloaded
to unstick it (at most 3 times per 30 min) and the sign-in is tried again. Once
back, it re-arms and resumes races without you touching anything. It never
types a username or a password. The re-login notice shows up in the race panel
as soon as there is a race again.

The session can also be renewed before it dies: the site stores its JWT in
localStorage ("player_token") and the app validates its `exp`, so the queue, on
the home or garage only and never while a race is on screen, reloads once about
2.5 minutes before that timestamp. The reload is what makes the server issue a
fresh token, which is the same thing the site's own "Yes, I'm here!" warning
does, just earlier and without risking a logout mid-race. A token that is not a
readable JWT simply disables this (the warning remains the safety net).

Daily Mystery Box: the free garage reward resets roughly every 21 hours, and the
claim is automatic: the script clicks the site's own claim button (the one inside
`.mysteryBox.is-here`, not the disabled countdown button; a visible "Claim Box"
in the site menu is accepted too) and closes the reward modal afterwards. That
button only exists on the garage, so when the box comes due anywhere else the
queue goes to `/garage` on its own (from the home page, and from the results
screen after the race in progress), claims, and only then goes back to racing;
the site's own button always wins over the local estimate, and a stale
"try again in 30 min" never hides a box that is on screen. While a race is live
it also tries the same endpoint the site calls (GET /api/v2/rewards/daily), since
that is the only claim that does not abandon the race; the site sends the bearer
token and x-uid only when `player_token` exists, so the script does the same and
otherwise relies on the session cookie (ClassLink/SSO). The box is claimed even when the bot is not
armed: it is a daily garage reward, not a race (CONFIG.mysteryBox.requireArmed
re-enables the armed-only gate). A 200 without `reward: true`, or
the site's error modal, is not counted as a claim and does not block the box for
21 h. The next attempt is scheduled from the server's own `next` (an epoch in
seconds), so reloads can never spam it; the panel reads the site's own
`rewardCountdown` (inside localStorage `persist:nt`) so the countdown it shows is
the garage's, not an estimate. The last eight claims are kept in
localStorage too, so the panel's "box" row can say what fell and when (hover it).
Turn it off with CONFIG.mysteryBox.enabled = false.

Safety guard, and a bot that never parks itself. Two failures can never be
ignored, because they are exactly what an anti-cheat looks at: a race with an
impossible WPM (the game's HUD, the race progress or this copy's own reading
above the ceiling) and two copies of the script alive in the same page, which is
what sends every key twice and what once pushed the game's counter to 6696 WPM.

  - Duplicate copies are resolved by an election, not by a stop: every copy
    leaves a heartbeat in the window it runs in, one of them (the first
    registered) types and the rest stay silent and take over if it stops. The
    queue that sees two live typers instead asks the other one for the turn
    (window.top.__ntaStandby): the alert is a lease, refreshed while the
    alternation lasts, so the copy that waits resumes by itself.
  - The same turn crosses tabs: a lease in localStorage names the tab allowed
    to type, send stickers, open a race or claim the box. It is renewed by the
    panel beat and expires in 15 s; the other tab stays quiet and takes over
    when the owner stops, closes or goes silent. The garage queue and the race
    frame share a tab id, so they do not fight each other.
  - An impossible reading finishes the current race (abandoning it would be a
    DQ) and opens a long, human break of CONFIG.guard.cooldownMs, which is the
    same pause the break system uses. When the break ends the loop opens the
    next race on its own: there is no state to unstick and no key to press.

A DQ streak works the same way: instead of stopping (a stop leaves the live race
without keys and that only feeds the streak), the bot steps away for
CONFIG.dqBreakMs and comes back by itself. Only the site's own block
("Too Many Disqualifications") holds the races back, and even that is retried
after CONFIG.queue.blockedRetryMs. Thresholds live in CONFIG.guard and CONFIG.queue.

The panel also answers "why is it waiting?": the "guard" row only shows up when
there is something to explain (a copy standing by, duplicate copies alive, a
long break, a site block, a stuck bot that has spent its reloads) and the status
line keeps the last reason. The "clock" row appears instead when the precise
clock could not start and the cadence fell back to the page timers, which are the
ones a background tab slows down: that is a DQ waiting to happen, so it is
visible and not only in the diagnostic report. The "today" row adds up the day (races, real average
against the day's average target, Mystery Boxes, disqualifications) and resets
itself at midnight; hovering it shows the rest: best race of the day with its
accuracy, races in a row without a DQ, the hours played and when the last DQ
landed. The "♪" button turns on discreet sound alerts (off by default): a short tone when a long break,
a duplicate copy or a site block starts, and another when the bot resumes.

Nothing is allowed to stay stuck. With the bot armed and no race, break, click
or modal to explain the wait, CONFIG.queue.stuckMs without movement reloads the
page once, at most CONFIG.queue.reloadMax times per CONFIG.queue.reloadWindowMs
(and never while a login or a CAPTCHA is yours to finish). That is the F5 a
person would press, done by the bot instead of by you. When that budget runs out
the bot says so instead of going quiet: a tone (if the sound is on), the notice
"press F5" and a "stuck" row in the panel, which clears itself the moment
anything moves again. After a DQ or a guard break the next two races are typed
~6% slower (CONFIG.humanize.carefulFactor): nobody who has just been
disqualified comes back at the same cadence, and it leaves extra room under the
ceiling.

Chaining breathes too: the delay before "Race Again", the queue's Continue/Race
Again delay and the garage's "Race Now" delay are all drawn at random, with an
occasional long pause. They used to be a fixed 2.2 s and 3 s per race, one more
bot signature. The panel can be dragged by its header and the position is
remembered across reloads.

Pace profiles: the "LEGIT" chip is a button now and cycles three targets, all of
     them inside the calibrated envelope and under the hard ceiling - soft (half a
     range below the account average), balanced (the account average) and fast
     (half a range above). Only the range the session target is drawn from changes; the cadence
is the same human one in all three, and the choice is saved in localStorage. The
same three sit in the TUNE view as a segmented control.

TUNE view (the ⚙ button, next to Stop) is split into Rhythm (pace profile and
calibration), Limits (session, daily budget and active hours) and Automation
(switches for breaks, Mystery Box, stickers, Auto nitro, the safety guard and
the sound, plus the theme and export/import/report/csv tools). "csv" downloads
one spreadsheet with the closed sessions (the same ones Alt+H prints) and,
below them, the 7-day summary: a
`kind` column separates `session` rows from `day` rows, and the columns are the
ones that make sense for both (date, races, WPM, target, deviation, accuracy,
DQ, boxes and the reason the session closed). Before 6.4.0 those switches only existed in CONFIG and turning one
off from the panel was lost on the next reload; now they are stored in
localStorage. "copy" puts a small JSON (profile, session limit, sound and the
switches) on the clipboard and in the box below; paste a saved one there
and press "apply" to restore it on another browser or account. Nothing about the
typing itself (ranges, cadence) travels in that JSON, so an imported config can
never make the bot faster. "report" puts a diagnostic report in that same box
and on the clipboard: version, mode, profile and range, target, live reading,
flags, the switches, the session and day counters (with the ETA and the
last closed session), the last races, the last ten notices with their time and
the environment around the script -top window or frame, background tab or
visible, focused, online, viewport, uptime, whether localStorage is writable and
whether the sound has been armed-, which is half of the answer when the question
is "why is it not typing". Everything needed to see why something is off,
without the console. The status line at the bottom keeps the last notice (DQ,
breaks, CAPTCHA, stops): no need to open the console to know what happened.
Pause/Resume stops sending keys without losing the race state (inside a race it
resumes by itself after 6 s, with a countdown on the button), Stop ends it after
the current race and "-" minimizes the panel (header + chips + buttons). The
whole panel can be dragged by its header and the position is remembered.
Animations are short on purpose (panel entrance, cards coming in one after the
other, the spring on every toggle and on the two sliders, the progress bar
sheen) and they all switch off when the system asks for reduced motion.

Esc or Alt+S (or the Stop button): stop. Mid-race it does NOT cut dead, because
leaving a live race is a guaranteed disqualification: it lets the race finish and
opens no other. A second Esc cuts immediately. Outside a race it stops at once
and leaves the keyboard alone until it is started again.

  AUTO   -> the script types on its own. It is the only mode there is: since
            7.14.0 MANUAL is gone, together with its key corrector and its panel
            row. Nothing can switch the bot to anything else.

  and that is all: stopping is a state (waiting), not a mode. Alt+A starts the
  bot again without restoring anything, and the garage queue re-arms by itself.

DISQUALIFICATION (DQ): the server decides it, so it cannot be undone or removed
from the history. It can be avoided and never made worse:
  - pausing mid-race for more than ~12 s kicks you out, so a pause inside a race
    cuts itself at CONFIG.dqGuardMs (6 s);
  - on seeing the "Disqualified" modal the script stops typing into the void and
    closes the race, which counts neither for the history nor for breaks;
  - the pause grows with the streak (3-6 min from the second, 10-15 min from the
    third) and the fourth stops the bot: five in a row make Nitro Type block the
    account ("Too Many Disqualifications"). A pending break is read from the
    typer's saved counters even when its frame is gone, so the queue never opens
    a race during a break that would leave it untyped (that chain is what used
    to reach the block);
  - if the race stops accepting keys (an overlay, the CAPTCHA) it waits
    CONFIG.stallGraceMs before giving up: leaving a live race is as sure a DQ as
    not typing at all.

Breaks (CONFIG.breaks, AUTO only): every 9-16 races the bot waits 20-90 s before
pressing "Race Again", and 15% of the time the break is 3-10 min. The panel shows
the countdown. Chaining hundreds of races with no pause is a louder pattern than
any interval between keys. Turn it off with CONFIG.breaks.enabled = false.

AFK farming (CONFIG.queue.backgroundFarm, off by default): with it off, the bot
only starts a race while this tab is visible. Chrome can freeze a hidden tab
(Energy Saver, memory pressure, bfcache); a frozen race cannot send keys and
ends in a disqualification, and no userscript can type from a frozen page. The
switch is in TUNE and in the garage (AFK off/on); both windows and other tabs
receive the change live. With no other gate active, the garage `afk` row says
`off`, `on` or `on · hidden`; a sign-in, stop, block or active-hours gate still
wins. If you turn it on,
the typing cadence and every scheduled press (the queue's heartbeat, "Race
Again", "Race Now", the DQ modal, the re-login and the Mystery Box) run on a
Worker clock so hidden-tab timer clamping does not slow them down, but the
freeze risk remains. The optional AFK keep-alive (CONFIG.queue.keepAlive, also
off by default) plays a near-silent constant AudioContext signal while AFK is
on, which can keep Chrome from freezing the tab; it needs a click to unlock
audio, reports ready/blocked instead of pretending to run, and is not a
guarantee. Brave's "always keep this site active" only stops the tab from being
discarded, not from being frozen.

All in one: this file replaces three userscripts that used to fight each other.
Install it ONCE and uninstall "Auto Redirect Script" and "Auto Stickers".

  Top window (any nitrotype.com page)
      Queue and recovery: enters the race from the garage, resolves the
      "Currently in a Race" modal, goes back to /race when the CAPTCHA asks for
      it and gets the bot out of a garage it got stuck in. It also claims the
      daily Mystery Box (see below). It does NOT open races while the typer is
      off (no 0 WPM races), and it does not touch "Race Again" while the typer
      is alive: those breaks and that clock are the typer's.

  Race frame
      The typing itself, the panel and the automatic stickers.

Both halves talk through a small contract: the frame publishes its state on
window.top.__ntaFrame and the top window only acts when there is no typer (or
it is stopped).

Ritmo (dentro de AUTO): SOLO LEGIT.

  LEGIT   -> imitates a person. Log-logistic cadence (a better fit than
             log-normal for free typing intervals); longer words are slower per
             letter and their first key costs more; intervals shorten as the
             word advances; the same hand is slower than alternating and common
             bigrams are faster; pauses at word starts and after a comma or a
             sentence end; an occasional >500 ms pause; ~1% corrected errors
             (slips to the next key, never random letters) and gentle fatigue
             with time on task. The whole block is normalised against a
             reference text, so the structure does not move the measured WPM;
             errors come from a fixed per-race budget (the ones that fit the
             target accuracy) and the pace auto-calibrates itself (+-10%).
             Target: the account's own recent average (profile balanced), with a
             proportional range (a 30 WPM account races around 30, a 110 WPM
             account around 110). On top of that, a hard ceiling of 120 WPM is
             enforced at three levels: the planner never plans above it, a live
             governor holds the race average under it key by key, and the guard
             aborts if the game's HUD ever shows more. Soft and fast move that
             range down or up, never to a fixed fast range; the ceiling holds
             for all three.

  There is no fast pace in the old sense. The BLATANT mode was removed completely
  in 5.0.0 and there is no way to bring it back: no key, no saved value and no
  panel chip. What the chip cycles is a profile inside the calibrated range
  (soft / balanced / fast), and the hard ceiling still caps every race.

LEGIT model references: asymmetric intervals with a right tail (log-logistic;
Gonzalez et al. 2021); +2.9-3.1% interval per extra letter, intervals that shorten
as a word advances and the same hand running +17-19% slower than alternating
(Pinet et al. 2022); a longer latency on a word's first key (Baus et al. 2013);
longer gaps after a comma and at the end of a sentence (Fuchs & Krivokapic 2016);
~165-185 ms between a mistake and the retry (Pinet & Nozari 2022); +2% interval
per hour of session (de Jong et al. 2020). What is deliberately NOT simulated,
because the literature does not measure it: the isolated cost of Shift, row
changes, transpositions and warm-up.

Warning: Nitro Type's terms forbid bots and automation, and their support states
that the anti-cheat bans accounts automatically. No pacing setting makes a bot
invisible: the event is still dispatched with no real browser events behind it.
All of this only aims at believable statistics. It is your call and your risk.

===================================================================================
*/

(function () {
  'use strict';
