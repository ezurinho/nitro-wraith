// ==UserScript==
// @name         NITRO WRAITH
// @namespace    nitro.wraith
// @version      8.14.14
// @updateURL    https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.meta.js
// @downloadURL  https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.user.js
// @description  Human-paced Nitro Type racer for one account: auto-calibrated to the account's own WPM average and top speed under a hard 120 WPM ceiling, automatic race loop with breaks and session limits, Mystery Box, stickers, CAPTCHA/session recovery, a live four-view panel and a safety guard. Always AUTO; no fast mode.
// @homepageURL  https://github.com/ezurinho/nitro-wraith
// @supportURL   https://github.com/ezurinho/nitro-wraith/issues
// @author       NITRO WRAITH
// @match        https://www.nitrotype.com/*
// @icon         https://cdn2.steamgriddb.com/icon/2b16a44bb65751bb0ebe5d8b42644bc4/32/512x512.png
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

Both ranges are calibrated against this account's own history (110 WPM average
and 97% accuracy over 44,575 races) instead of a generic average: on another
account, move them to that account's average.

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

AFK farming (CONFIG.queue.backgroundFarm, on by default): the bot keeps racing
with the tab hidden or minimised. A hidden tab has its page timers clamped to
~1/s (and 1/min after five minutes), and a race typed at that pace is
disqualified for inactivity, so the typing cadence and every scheduled press
(the queue's heartbeat, "Race Again", "Race Now", the DQ modal, the re-login and
the Mystery Box) run on a Worker clock, which is not subject to that clamp. The
queue also keeps clicking in the background instead of waiting for the tab to be
visible. The only cases where it still waits are a browser without Workers (the
panel then shows the "clock" row and the console says why) and backgroundFarm
turned off by hand. Brave's
"always keep this site active" only stops the tab from being discarded; it does
not stop timer throttling, so the Worker clock is what matters. The old skew
check is still there as a second guard, using a plain timer on purpose.

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

  /* ==========================================================================
   * 1. CONFIGURATION
   * ========================================================================== */
  const CONFIG = {
    // Este es solo el rango de respaldo cuando el sitio todavia no ha dejado
    // ninguna media en disco. En una instalacion normal manda el perfil de la
    // cuenta: `persist:nt` trae avgSpeed/highestSpeed desde el primer arranque y
    // el API de stats lo refresca despues. Los objetivos se sortean alrededor de
    // ESA media, no de un 104-117 fijo que haria cantar a una cuenta de 30 WPM.
    //
    // hardCap is a ceiling for the whole script, not a suggestion: the planner
    // never plans above it, the live governor slows a race down if its running
    // average reaches it, and the guard aborts if the game's own HUD goes past it.
    wpm: { min: 104, max: 117, hardCap: 120 },
    // Suelo en 96: por debajo el juego paga $0 de bonus de precision (0-95%
    // vale cero). El techo sigue en 98 para no rozar el 100% en cada carrera.
    accuracy: { min: 96, max: 98 },
    sessions: 10,

    // Auto-calibracion del perfil balanced contra la media real de la cuenta
    // (GET /api/v2/stats/summary + persist:nt desde el primer arranque). No es
    // un modo nuevo: mueve el centro y el ancho del rango para que una cuenta
    // de 30 WPM no empiece a 104. El mejor WPM de la cuenta se lee y se pinta
    // como referencia, pero no se usa como objetivo: el objetivo es su media.
    calibration: {
      auto: true,
      refreshMs: 1800000,    // 30 min: el ritmo sigue la media mas reciente
      halfWidth: 6,          // ancho maximo del rango; con 43 WPM da 37-49
      minWpm: 15,            // cuentas principiantes tambien son validas
      timeoutMs: 8000,
    },

    // Popup de Daily Challenge completado: si nadie lo cierra se queda encima
    // del garaje y frena la siguiente carrera. Se busca por texto porque las
    // clases del juego cambian; un selector propio manda cuando esta puesto.
    challenges: {
      enabled: true,
      selector: '',          // CSS del popup; vacio = deteccion por texto
      cooldownMs: 6000,
      clickDelayMs: [250, 900],
    },
    accuracyBuffers: [0.7, 0.7, 0.7, 0.7, 0.7, 0, 0, 0, 0, 0],
    historySize: 10,           // carreras que guarda el historial del panel
    tandaLogSize: 12,          // tandas cerradas que guarda el registro (Alt+H)

    // Estimacion de lo que queda de tanda (fila `limit` del panel): se apoya en
    // los ciclos medidos -del arranque de una carrera al arranque de la
    // siguiente- y en la cadencia de descansos. Es una estimacion, no una
    // promesa, y por eso va marcada con "≈".
    eta: {
      maxCycleMs: 300000,      // un ciclo mas largo (con descanso dentro) no entra en la media
      fallbackCycleMs: 48000,  // sin ciclos medidos: carrera media a este ritmo + el respiro
    },
    sessionResumeMs: 1800000,  // si el iframe se recarga, la tanda sigue viva 30 min
    raceLimit: 0,              // tope de carreras por tanda (0 = libre; se cambia desde el panel)
    timeLimit: 0,              // tope de minutos por tanda (0 = libre; 15/30/60/120 desde el panel)
    xpLimit: 0,                // tope de XP por tanda (0 = libre; 5k/10k/25k/50k desde el panel)

    // Auto nitro: una vez por carrera, Enter salta una palabra que quepa y deje
    // leccion para pagar el tiempo regalado. La estrategia decide cual.
    useNitro: true,
    nitroStrategy: 'longest',   // longest | first | last; se cambia en TUNE

    // Breaks: nobody chains two hundred races without leaving the keyboard. Every
    // N races the bot waits before pressing "Race Again", and now and then the
    // break is long. This only works because the queue in the top window keeps its
    // hands off "Race Again" while the typer is alive.
    breaks: {
      enabled: true,
      afterRaces: [9, 16],       // cada cuantas carreras toca descanso (se sortea)
      shortMs: [20000, 90000],   // descanso normal: 20-90 s
      longMs: [180000, 600000],  // descanso largo: 3-10 min
      longChance: 0.15,
    },

    // Queue and navigation. This lives in the TOP window, not in the race frame.
    queue: {
      enabled: true,
      backgroundFarm: true,   // abrir y escribir con la pestana oculta (reloj Worker)
      tickMs: 1000,
      continueDelayMs: [2400, 5200],  // respiro antes de pulsar Continue/Race Again (se sortea)
      continueLongChance: 0.12,       // y de vez en cuando, una pausa mas larga
      continueLongMs: [6000, 12000],
      raceNowDelayMs: [2600, 7000],   // garaje -> "Race Now": retardo humano
      raceNowCancelHoldMs: 30000,     // cancelado desde el panel: cuanto tarda en volver a ofrecerlo
      stopHoldMs: 600000,             // tras una parada deliberada (tope/Esc) el garaje no arranca solo
      raceNowCooldownMs: 12000,       // no repetir "Race Now" si la vista no cambia
      raceNowBounceMax: 3,            // «Race Now» devuelto al garaje sin carrera: se deja de pulsar
      raceNowBounceResetMs: 600000,   // un rebote viejo (10 min) ya no cuenta: pudo ser el servidor
      // Aviso del propio juego cuando sus ficheros no cargan («Problem Loading
      // Game Files / A required game file failed to load»): trae su boton «Go To
      // Your Garage». Se usa esa salida, pero con tope: si el CDN esta caido,
      // garaje -> Race Now -> error es un bucle y no arregla nada.
      assetErrorMax: 4,
      assetErrorResetMs: 1800000,   // 30 min
      // Aviso de conexion del servidor de la carrera: se le da por actual
      // mientras el vigilante lo siga viendo (lo refresca cada segundo).
      connectionFreshMs: 30000,
      sessionKickDelayMs: [700, 2200],// aviso de sesion: respiro antes de pulsarlo
      sessionKickCooldownMs: 15000,   // enfriamiento compartido del clic del aviso
      autoRelogin: true,              // sesion caida: entrar solo con el SSO recordado
      sso: 'classlink',               // proveedor de un clic: google, classlink, clever o facebook
      reloginDelayMs: [3500, 11000],  // respiro humano antes de pulsar el SSO
      loginHumanHoldMs: 90000,        // tras tocar el login, se te deja terminar sin prisa
      loginNoButtonMs: 15000,         // sin boton de SSO, recarga para desatascarlo
      loginReloadDelayMs: [1500, 3500], // respiro antes de recargar un login atascado
      loginReloadMax: 3,              // recargas del login por ventana
      loginReloadWindowMs: 1800000,   // 30 min: pasada la ventana, vuelve a intentarlo
      sessionRefreshBeforeMs: 150000, // renovar el token antes de que caduque (nunca con carrera viva)
      reloginCooldownMs: 20000,       // separacion entre intentos de re-login
      reloginMaxAttempts: 3,          // tras N intentos, se deja al humano
      reloginWindowMs: 600000,        // ventana en la que vale un re-login pendiente
      reloginResumeMs: 86400000,      // un login manual tardio aun rearma la cola (24 h)
      loginRetryMs: 1800000,          // sin SSO tras gastar recargas: reintento desatendido (30 min)
      actionCooldownMs: 3000,   // separacion minima entre pulsaciones iguales
      captchaCooldownMs: 30000,
    // Un contador de intentos de CAPTCHA mas viejo que esto ya no describe nada:
    // pudo quedar a tope porque la validacion navego antes de que la cola la
    // viera, y entonces el proximo CAPTCHA se quedaba sin llevarte a /race.
    captchaAttemptsResetMs: 1800000,   // 30 min // anti-bucle si el CAPTCHA sigue sin resolverse
      captchaMaxRedirects: 5,   // tras N intentos se deja el CAPTCHA al humano
      navWatchdogMs: 8000,      // si la navegacion no ocurre, se reanuda el bucle
      idleToGarageMs: 180000,   // /race sin carrera viva: volver al garaje
      armedTtlMs: 600000,       // no live typer seen: do not open races
      // Site-side block ("too many disqualifications"): the queue backs off for a
      // long while and then checks by itself instead of waiting for a keypress.
      blockedRetryMs: 900000,
      // DQ modal: a person reads the message before clicking. Randomised, so the
      // same instant press never repeats.
      dqModalDelayMs: [3200, 9000],
      // Anti-stuck watchdog: armed, no live race, no break pending and nothing
      // pressed for this long means something the script does not understand is
      // on screen (an unknown modal, a dead frame, a spinner). A person would
      // reload the page; the bot does the same, at most reloadMax times inside
      // reloadWindowMs so it can never turn into a reload loop.
      stuckMs: 240000,
      reloadMax: 3,
      reloadWindowMs: 900000,
    },

    // Daily Mystery Box (the free reward in the garage). The site hands out one
    // box roughly every 21 hours and it is claimed with its own button; if the
    // box is ready while the bot is busy racing, the same API the site calls is
    // used instead (GET /api/v2/rewards/daily, with the session token when the
    // site has stored one and the session cookie otherwise).
    mysteryBox: {
      enabled: true,
      delayMs: [900, 2600],        // pause before pressing "Claim Now!"
      closeDelayMs: [2400, 4600],  // pause before closing the reward modal
      readyCheckMs: 600000,        // box not ready yet: look again in 10 min
      retryAfterMs: 75600000,      // 21 h, the site's own cooldown between boxes
      retryAfterErrorMs: 1800000,  // a failed claim: try again in 30 min
      minGapMs: 45000,             // never attempt twice within 45 s
      claimSettleMs: 300000,       // a card that outlives a claim is not a new box
      apiFallback: true,           // claim through the API while racing
      requireArmed: false,         // true = solo reclamar con la cola armada
    },

    // Safety guard: the two failures that once pushed the game's counter to 6696
    // WPM. Two copies of the script were injected into the same tab, both were
    // sending keys at the same time and the account ended up banned for 24 h for
    // "Botting". Now the bot aborts the race and stops in both cases instead of
    // chaining races with statistics that scream.
    guard: {
      enabled: true,
      // Tripwire: the hard ceiling itself. The planner tops out at CONFIG.wpm.max
      // and the governor keeps the running average under hardCap, so this number
      // only gets reached when something is genuinely broken (a race the script is
      // not driving, a duplicate copy, a runaway counter). If the game's own HUD
      // reports more than this for a few samples, the bot aborts and stops.
      // paceCap() plans at hardCap - 2 (118) on purpose: the 2 WPM margin keeps
      // the game's own rounding from ever touching this tripwire.
      maxWpmLegit: 120,
      // A value 1.5x above the tripwire stops the race dead, no samples needed.
      absurdFactor: 1.5,
      // 1 s samples that must all sit above the tripwire to stop: the game's HUD
      // rounds and lags, so a single reading is not enough.
      samples: 3,
      // Instance heartbeat: a copy that has not refreshed within this window is
      // considered dead (reloading the race frame does not count as a duplicate).
      instanceStaleMs: 8000,
      // Cross-tab lease: the tab that owns this key is the only one allowed to
      // type, send stickers or start/claim things. It is refreshed every panel
      // beat; without a beat for this long, another tab may take over.
      tabLeaseStaleMs: 15000,
      // Publisher alternations (A, B, A, B... with no reload in between) before
      // assuming two typers are alive in the same tab. A reload never alternates.
      typerFlips: 5,
      // Duplicates are no longer a stop: the window elects one instance and the
      // rest stay silent (they type nothing and click nothing) until the elected
      // one is gone. A stand-down order expires by itself after standbyHoldMs.
      standbyHoldMs: 4000,
      // Impossible reading: finish the race in progress (abandoning it would be a
      // DQ) and then step away for a long, human break. The bot always comes back
      // on its own - it never parks itself waiting for a key.
      cooldownMs: [60000, 180000],
    },

    // Automatic stickers inside the race. Sending one in every race would be an
    // obvious pattern, so 35% of races is enough to look human. The exception
    // is the Daily Challenge "racesWithSticker": while it is pending, every
    // race sends one (otherwise 10/10 is a lottery); when it completes, the
    // 35% shuffle comes back.
    stickers: {
      enabled: true,
      chance: 35,        // % de carreras en las que se manda uno
      challengeBoost: true, // reto racesWithSticker pendiente: 100%
      choice: 0,         // 0 = aleatorio; 1..n = ese sticker de la lista
      delayMs: [3200, 4600],  // espera hasta que el chat está listo
    },

    // LEGIT pace: every value here describes a person typing.
    humanize: {
      // Shape of the log-logistic (beta > 2): larger beta = tighter spread.
      // beta 8.6 leaves a CV of ~0.215, the same tail sigma 0.22 gave under
      // log-normal, with the fit the literature reports as better for free typing
      // intervals (Gonzalez et al. 2021).
      shape: 8.6,
      // Per-word and per-punctuation model: this is what keeps the cadence from
      // being uniform. Length: +2.9-3.1% interval per extra letter in Pinet et al.
      // 2022 (the effect shrinks for proficient typists; here it lands at ~1.5%).
      // Position: a word's first key costs more (word-initiation latency, Baus et
      // al. 2013) and intervals shorten as the word advances: Pinet 2022 measures
      // a slope of ~-0.043 per position in log-IKI, which is ~9% between the first
      // letter and the fourth. Same hand: +17-19% over alternating hands (Pinet
      // 2022); common bigrams a little faster.
      wordLengthPerLetter: 0.015,
      wordLengthClamp: [0.94, 1.08],
      wordStartFactors: [1.06, 1.02, 0.97],
      sameHandFactor: 1.12,
      alternateHandFactor: 0.97,
      commonBigramFactor: 0.97,
      // Pauses at punctuation boundaries: in real writing word, comma and
      // sentence gaps scale ~330 / 721 / 1262 ms geometric means (Fuchs &
      // Krivokapic 2016). Here they are applied to the gap after the sign,
      // scaled down for copy typing.
      sentencePauseMs: [180, 420],
      commaPauseMs: [120, 300],
      wordPauseChance: 0.05,     // pausa corta al empezar palabra
      wordPauseMs: [90, 260],
      hesitationChance: 0.01,    // 1% por palabra: una pausa "de pensar" (>500 ms) cada ~550 caracteres
      hesitationMs: [520, 1200],
      correctionMs: [150, 240],  // fallo -> reintento (medido: 164-182 ms)
      // Ritmo tras una descalificacion o un hueco del guardia: un 6% mas lento
      // durante un par de carreras. Dentro de la variacion humana normal y deja
      // mas margen bajo el techo.
      carefulFactor: 1.06,
      // Fatigue: intervals grow slowly with time on task (+2% per hour, +6% cap).
      // In real office typing the interval rises ~11.6 ms over two hours (~4% on
      // ~300 ms), more so in the afternoon (de Jong et al. 2020). Here it is a
      // gentle drift that resets whenever a new session starts.
      fatiguePerHour: 0.02,
      fatigueMax: 1.06,
    },

    pollMs: 300,
    probeMs: 280,
    maxWaitStartMs: 180000,
    startLagMaxMs: 800,    // tope de la correccion del semaforo al abrir el reloj
    idleLimit: 40,
    stallLimit: 15,        // teclas correctas seguidas sin avanzar => posible bloqueo
    stallGraceMs: 6000,    // cuanto se aguanta sin avanzar antes de dar la carrera por perdida

    // Inactivity disqualification: the server kicks you out if you stop sending
    // keys inside a race (~12 s). Pausing mid-race is therefore a guaranteed loss,
    // so the pause cuts itself at dqGuardMs. Two DQ in a row stop the bot: at five
    // Nitro Type blocks the account for a while.
    dqGuardMs: 6000,
    // Un CAPTCHA a mitad de carrera bloquea las teclas y es lo que el bucle
    // confundia con "la carrera dejo de aceptar entrada". No se abandona: se
    // espera a que lo resuelvas, con tope para no quedarse mirando.
    captchaHoldMs: 150000,
    dqStreakLimit: 2,      // desde aqui, hueco largo (no basta un respiro corto)
    dqStopStreak: 4,       // a la cuarta se para: la quinta es el bloqueo del sitio
    // Streak of DQ: five in a row make the site block the account, so the pause
    // grows with the streak and the fourth stops the bot instead of gambling the
    // fifth. Only a clean race resets the streak.
    dqBreakMs: [180000, 360000],    // 3-6 min
    dqBreak3Ms: [600000, 900000],   // 10-15 min
    dqFreshMs: 2500,       // cuanto vale un avistamiento del modal (el vigilante mira cada 1 s)
    remountGraceMs: 2500,  // margen para que React remonte el componente
    // Delay before pressing "Race Again". It used to be a fixed 2.2 s on every
    // race: ten races with the exact same pause is as odd a signature as typing
    // with no pauses at all. It is drawn now, and once in a while a long pause
    // lands (looking at the result, getting a drink...).
    nextRaceDelayMs: [1700, 4200],
    nextRaceLongChance: 0.12,
    nextRaceLongMs: [5000, 9500],
    nextRaceTimeoutMs: 3000,
    nextRaceRetryMs: 5000,   // segundo intento antes de recargar (la pantalla de resultados a veces tarda)
    idleNudgeMs: 25000,    // sin carrera en pantalla: empujar "Race Now"

  };

  const VERSION = '8.14.14';

  // Aviso de version: el meta del Gist es publico aunque el Gist sea secreto,
  // asi que se puede leer sin token. Se guarda el ultimo resultado y se
  // consulta como mucho cada seis horas; si falla, se reintenta a los 30 min.
  // Un fallo de red no borra un aviso anterior ni bloquea la partida.
  const UPDATE_META_URL = 'https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.meta.js';
  const UPDATE_DOWNLOAD_URL = 'https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.user.js';
  const UPDATE_KEY = 'nta:update';
  const UPDATE_RECHECK_MS = 3600000;
  const UPDATE_RETRY_MS = 30 * 60000;
  const UPDATE_FETCH_TIMEOUT_MS = 8000;
  let updateChecking = false;

  function versionNewer(candidate, current) {
    const a = String(candidate || '').split('.').map((part) => Number(part) || 0);
    const b = String(current || '').split('.').map((part) => Number(part) || 0);
    const size = Math.max(a.length, b.length);
    for (let i = 0; i < size; i += 1) {
      if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    }
    return false;
  }

  // El estado guardado distingue una comprobacion buena de un 404, un meta
  // invalido o una caida de red. Antes los tres dejaban el mismo objeto vacio
  // y el fallo era indistinguible de «no hay version nueva».
  function updateState() {
    try {
      const saved = JSON.parse(localStorage.getItem(UPDATE_KEY) || 'null');
      const at = Number(saved && saved.at) || 0;
      if (!at) return null;
      return {
        at,
        status: Number(saved.status) || 0,
        error: saved.error ? String(saved.error) : null,
        latest: saved.latest ? String(saved.latest) : null,
        ageMs: Math.max(0, Date.now() - at),
        retryMs: saved.error ? UPDATE_RETRY_MS : UPDATE_RECHECK_MS,
      };
    } catch {
      return null;
    }
  }

  function saveUpdateState(next) {
    try { localStorage.setItem(UPDATE_KEY, JSON.stringify(next)); } catch { /* modo privado */ }
  }

  // El panel pregunta por la version nueva en cada tick. El valor solo cambia
  // cuando termina una comprobacion o se edita `nta:update`, asi que se evita
  // volver a parsear el mismo JSON (y el mismo almacenamiento) cada segundo.
  let updateInfoCache = { raw: null, info: null };
  function updateInfo() {
    try {
      const raw = localStorage.getItem(UPDATE_KEY) || 'null';
      if (raw === updateInfoCache.raw) return updateInfoCache.info;
      const saved = JSON.parse(raw);
      const info = saved && saved.latest && versionNewer(saved.latest, VERSION) ? saved : null;
      updateInfoCache = { raw, info };
      return info;
    } catch {
      return null;
    }
  }

  // Texto corto para TUNE: el detalle (estado, error y reintento) va en el
  // tooltip. Un fallo se ve sin abrir la consola y sin esperar a la proxima
  // version del script.
  function updateHealth() {
    const state = updateState();
    if (!state) {
      return {
        text: 'not checked',
        good: null,
        title: 'Update check: not run yet. It runs when the panel opens and every hour.',
      };
    }

    const mins = Math.max(0, Math.round(state.ageMs / 60000));
    const age = mins < 1 ? 'now' : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
    const hasGood = Boolean(state.latest);
    const summary = hasGood && versionNewer(state.latest, VERSION)
      ? `v${state.latest} is available.`
      : hasGood
        ? 'this copy is current.'
        : 'there is no good result yet.';

    if (state.error) {
      const retry = Math.max(0, Math.round((state.retryMs - state.ageMs) / 60000));
      const kept = hasGood ? ' The last good result is kept;' : '';
      const next = retry < 1 ? 'under a minute' : `${retry} min`;
      return {
        text: `failed · ${state.error}`,
        good: false,
        title: `Update check failed ${age}: ${state.error}. ${summary}`
          + `${kept} Next try in ${next}.`,
      };
    }

    return {
      text: `ok · ${age}`,
      good: true,
      title: `Update check ok ${age}; the latest meta says ${summary}`
        + ' It runs again in one hour.',
    };
  }

  function paintUpdateHealth(force = false) {
    const node = panel.refs && panel.refs.up;
    if (!node) return;
    const now = Date.now();
    // La edad del chequeo cambia como mucho cada minuto: no hay razon para
    // leer `nta:update` ni tocar el DOM dos veces por segundo. Una comprobacion
    // real pasa `force` para que el cambio se vea al instante.
    if (!force && panel.updateHealthAt && now - panel.updateHealthAt < 30000) return;
    panel.updateHealthAt = now;
    const health = updateHealth();
    setText(node, health.text);
    setGood(node, health.good);
    if (node.title !== health.title) node.title = health.title;
  }

  function paintUpdateBadge(node) {
    if (!node) return;
    const info = updateInfo();
    if (node.hidden !== !info) node.hidden = !info;
    if (!info) return;
    if (node.textContent !== 'update') node.textContent = 'update';
    const title = `v${info.latest} is available; this copy is v${VERSION}. Click to download the new userscript.`;
    if (node.title !== title) node.title = title;
    const label = `Update available: v${info.latest}. Download the new userscript.`;
    if (node.getAttribute('aria-label') !== label) node.setAttribute('aria-label', label);
  }

  async function checkForUpdate(force = false) {
    if (updateChecking || typeof fetch !== 'function') return false;
    let previous = null;
    try { previous = JSON.parse(localStorage.getItem(UPDATE_KEY) || 'null'); } catch { previous = null; }
    const last = Number(previous && previous.at) || 0;
    const wait = previous && previous.error ? UPDATE_RETRY_MS : UPDATE_RECHECK_MS;
    if (!force && Date.now() - last < wait) return false;
    updateChecking = true;

    let timeout = 0;
    const fail = (status, error) => {
      const keep = previous && previous.latest ? previous.latest : '';
      saveUpdateState({ at: Date.now(), latest: keep, status, error });
      paintUpdateHealth(true);
      paintUpdateBadge(panel.refs && panel.refs.update);
      if (!previous || previous.error !== error) {
        log(`Update check failed: ${error} (retrying in 30 min).`);
      }
      return false;
    };

    try {
      // Una red que no contesta no puede dejar el chequeo «en vuelo» para
      // siempre: el siguiente intento se quedaria bloqueado por updateChecking.
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      if (controller) timeout = setTimeout(() => controller.abort(), UPDATE_FETCH_TIMEOUT_MS);
      const response = await fetch(UPDATE_META_URL, {
        cache: 'no-store',
        credentials: 'omit',
        signal: controller ? controller.signal : undefined,
      });
      if (!response || !response.ok) {
        return fail(Number(response && response.status) || 0, `HTTP ${Number(response && response.status) || 0}`);
      }

      const text = await response.text();
      const match = String(text || '').match(/@version\s+([\d.]+)/);
      if (!match) {
        return fail(200, 'meta has no @version');
      }

      const fetched = match[1];
      const keep = previous && previous.latest && versionNewer(previous.latest, VERSION)
        ? previous.latest
        : fetched;
      saveUpdateState({ at: Date.now(), latest: keep, status: response.status || 200, error: null });
      paintUpdateHealth(true);
      paintUpdateBadge(panel.refs && panel.refs.update);
      if (previous && previous.error) log(`Update check recovered: latest meta v${fetched}.`);
      return true;
    } catch (error) {
      const message = error && error.name === 'AbortError'
        ? 'timeout'
        : String(error && error.message ? error.message : error || 'network error').slice(0, 120);
      return fail(0, message);
    } finally {
      if (timeout) clearTimeout(timeout);
      updateChecking = false;
    }
  }

  function openUpdateDownload() {
    try { window.open(UPDATE_DOWNLOAD_URL, '_blank', 'noopener,noreferrer'); } catch { /* bloqueado */ }
  }

  // Handshake para el dry-run y el banco: la version se publica en el window
  // aunque esta ventana solo lleve la cola y no pinte panel.
  try { window.__ntaVersion = VERSION; } catch { /* sin acceso */ }

  // 7.14.0: fuera MANUAL. Solo existe AUTO: no hay tecla, chip ni valor guardado
  // con el que cambiar de modo. "Apagado" es un ESTADO (waiting), no un modo, y
  // la cola del garaje se rearma sola. El viejo corrector de teclas se fue con
  // MANUAL: el script no engancha el teclado de nadie.
  const MODE = 'auto';

  // One pace only. The old BLATANT mode was removed completely in 5.0.0: the
  // cadence is always human and there is no way left (key, panel chip or saved
  // state) to activate anything else.
  const PACE_LEGIT = 'legit';

  const KEYS = {
    wpmCount: 'typingWpmSessionCount',
    accCount: 'typingAccuracySessionCount',
    bufferCount: 'typingAccuracyBufferCount',
    wpmSeries: 'dynamicWpmValues',
    accSeries: 'dynamicAccuracies',
    panelCollapsed: 'autoTyperPanelCollapsed',
    panelPosition: 'autoTyperPanelPosition',
    panelTheme: 'autoTyperPanelTheme',
    season: 'autoTyperSeason',
    ntUser: 'persist:nt',
    footMode: 'autoTyperFootMode',
    garageFolded: 'autoTyperGarageFolded',
    paused: 'autoTyperPaused',
    history: 'autoTyperRaceHistory',
    session: 'autoTyperSessionCounters',
    tandaLog: 'autoTyperTandaLog',
    raceLimit: 'autoTyperRaceLimit',
    timeLimit: 'autoTyperTimeLimit',
    xpLimit: 'autoTyperXpLimit',
    dailyRaceLimit: 'autoTyperDailyRaceLimit',
    dailyXpLimit: 'autoTyperDailyXpLimit',
    activeOn: 'autoTyperActiveOn',
    activeStart: 'autoTyperActiveStart',
    activeEnd: 'autoTyperActiveEnd',
    calibratedRange: 'autoTyperCalibratedRange',
    calibratedAccuracy: 'autoTyperCalibratedAccuracy',
    calibrationAt: 'autoTyperCalibrationAt',
    challengeSelector: 'autoTyperChallengeSelector',
    trim: 'autoTyperTrim',
    sfx: 'autoTyperSfx',
    paceProfile: 'autoTyperPaceProfile',
    prefs: 'autoTyperPrefs',
  };

  // Keys the queue writes for the daily Mystery Box. They are plain localStorage
  // (not the queue's sessionStorage) so the panel inside the race frame can read
  // them: the claim happens in the top window, the badge is painted in here.
  const BOX_STATE_NEXT = 'ntQueue:boxNextAt';
  const BOX_STATE_LAST = 'ntQueue:boxLastAt';
  // La tarjeta Claim Now! vista en el garaje. La escribe el panel de arriba y
  // la lee el panel de carrera: sin esto, un boxNextAt viejo seguia pintando
  // una espera que el sitio ya habia vencido.
  const BOX_STATE_READY = 'ntQueue:boxReadyAt';
  const BOX_STATE_READY_MS = 5 * 60000;
  // Historial de cajas: fecha y premio de las ultimas reclamaciones. Lo escribe
  // la cola y lo lee el panel (mismo localStorage, ventanas distintas).
  const BOX_STATE_LOG = 'ntQueue:boxLog';
  // Ultimo intento (via, HTTP, reward, next crudo y hora programada): lo escribe
  // la cola y lo lee el informe de diagnostico del tipador.
  const BOX_STATE_DIAG = 'ntQueue:boxDiag';

  // Marca de atasco del vigilante de la cola: se deja aqui para que el panel
  // (otra ventana) pueda ensenarla. Existe solo mientras el bot esta clavado y
  // sin presupuesto de recargas; cualquier progreso la borra.
  const STUCK_STATE = 'ntQueue:stuckAt';

  // Resumen del dia: carreras, WPM medio, cajas y DQ. Vive en localStorage
  // porque lo escriben las dos mitades del script (la cola suma las cajas, el
  // tipador suma las carreras) y lo pinta el panel. Se reinicia solo al cambiar
  // de fecha.
  const DAY_STATE = 'ntQueue:today';

  // Cada ventana suma en su propia clave y todayRead las fusiona. DAY_STATE se
  // escribia con leer-modificar-escribir desde la cola y desde el tipador, y la
  // ultima en guardar borraba lo que la otra acababa de sumar (una Mystery Box
  // reclamada, una carrera contada). DAY_STATE se sigue leyendo -es lo que dejo
  // la version anterior-, pero ya no se reescribe.
  // Un premio de carrera real no llega a miles de dolares ni a cientos de XP.
  // Hasta la 7.6.9 el historial y el resumen del dia guardaban el saldo de la
  // cuenta en `cash`/`xp` (el fallo del premio); todo lo que pase de estos
  // topes es ese dato viejo y se descarta al leer. La carrera y su WPM quedan.
  const MAX_RACE_CASH = 1000000;
  const MAX_RACE_XP = 100000;
  const MAX_DAY_CASH = 10000000;

  const DAY_PART_PREFIX = 'ntQueue:todayPart:';
  // El <id> se genera en cada carga (no es estable por pestana), asi que
  // todayRead poda las partes de otro dia o con mas de 24 h sin actualizar.
  const DAY_WINDOW_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const DAY_PART_KEY = `${DAY_PART_PREFIX}${DAY_WINDOW_ID}`;

  // Historico de 7 dias para la vista LOG. Misma idea que las partes del dia
  // -una clave por ventana, nadie reescribe lo que sumo la otra-, pero con la
  // fecha DENTRO de la clave: al cambiar de dia la parte del dia se sobrescribe
  // y el historico no. Se poda a los 8 dias.
  const DAY_HIST_PREFIX = 'ntQueue:dayHist:';
  const DAY_HIST_DAYS = 7;
  const DAY_HIST_KEEP_MS = 8 * 24 * 3600000;
  const DAY_HIST_KEY = (date = todayKey()) => `${DAY_HIST_PREFIX}${date}:${DAY_WINDOW_ID}`;

  function todayKey(at = Date.now()) {
    const d = new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function todayEmpty() {
    return {
      date: todayKey(), races: 0, sumWpm: 0, sumTarget: 0, boxes: 0, dq: 0,
      xp: 0, chKeys: [],
      best: 0, bestAcc: 0, clean: 0, firstAt: 0, lastAt: 0, dqAt: 0, cash: 0,
      updatedAt: 0,
    };
  }

  // Fusion de dos resumenes del mismo dia: lo contable se suma, el record de WPM
  // se queda con el mayor (y con SU precision) y las marcas de tiempo con la
  // primera y la ultima.
  function mergeDay(into, part) {
    into.races += part.races;
    into.sumWpm += part.sumWpm;
    into.sumTarget += part.sumTarget;
    into.boxes += part.boxes;
    into.dq += part.dq;
    into.clean += part.clean;
    into.cash += part.cash;
    into.xp += Math.max(0, Number(part.xp) || 0);
    for (const key of part.chKeys || []) {
      if (!into.chKeys.includes(key)) into.chKeys.push(key);
    }

    if (part.best > into.best) {
      into.best = part.best;
      into.bestAcc = part.bestAcc;
    }
    if (part.firstAt > 0 && (!into.firstAt || part.firstAt < into.firstAt)) into.firstAt = part.firstAt;
    into.lastAt = Math.max(into.lastAt, part.lastAt);
    into.dqAt = Math.max(into.dqAt, part.dqAt);
    return into;
  }

  // Objeto guardado -> resumen de SU fecha (null si es ilegible). El historico
  // lee dias pasados, asi que este no filtra por fecha; todayParse lo hace
  // encima, que es donde importa.
  function dayParseAny(raw) {
    let saved = null;
    try {
      saved = JSON.parse(raw || 'null');
    } catch {
      return null;
    }
    if (!saved || !/^\d{4}-\d{2}-\d{2}$/.test(String(saved.date || ''))) return null;

    const day = todayEmpty();
    day.date = String(saved.date);
    for (const field of ['races', 'sumWpm', 'sumTarget', 'boxes', 'dq', 'xp', 'best', 'bestAcc', 'clean', 'firstAt', 'lastAt', 'dqAt', 'cash']) {
      day[field] = Math.max(0, Number(saved[field]) || 0);
    }
    day.chKeys = Array.isArray(saved.chKeys)
      ? [...new Set(saved.chKeys.filter((key) => typeof key === 'string' && key).slice(-50))]
      : [];
    day.updatedAt = Math.max(0, Number(saved.updatedAt) || 0);
    return day;
  }

  // Objeto guardado -> resumen del dia (null si es de otra fecha o ilegible).
  function todayParse(raw) {
    const day = dayParseAny(raw);
    return day && day.date === todayKey() ? day : null;
  }

  function todayPartKeys() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(DAY_PART_PREFIX)) keys.push(key);
      }
    } catch { /* almacenamiento bloqueado */ }
    return keys;
  }

  let todayCache = null;
  let todayCacheAt = 0;

  // Un storage event dice que otra ventana cambio el dia o un tope. El latido
  // normal puede esperar 1,5 s, pero un evento tiene que ver el dato nuevo ya.
  function invalidateTodayCache() {
    todayCacheAt = 0;
  }

  function todayRead() {
    const now = Date.now();
    // Se pinta muchas veces por carrera; el resumen no cambia tan rapido.
    if (todayCache && now - todayCacheAt < 1500) return todayCache;

    const day = todayEmpty();
    try {
      const base = todayParse(localStorage.getItem(DAY_STATE));
      if (base) mergeDay(day, base);
      for (const key of todayPartKeys()) {
        const part = todayParse(localStorage.getItem(key));
        const stamp = part ? Number(part.updatedAt) || 0 : 0;
        // Poda: partes de otro dia o sin tocar en 24 h. El id se genera en cada
        // carga, asi que sin esto cada recarga dejaria una clave para siempre.
        if (!part || (stamp > 0 && now - stamp > 24 * 3600000)) {
          try { localStorage.removeItem(key); } catch { /* almacenamiento bloqueado */ }
          continue;
        }
        mergeDay(day, part);
      }
    } catch { /* almacenamiento bloqueado */ }

    // Saldo de la cuenta guardado como premio por las versiones anteriores: no
    // cabe en un dia de carreras, asi que se deja el resumen sin esa cifra.
    if (day.cash > MAX_DAY_CASH) day.cash = 0;

    todayCache = day;
    todayCacheAt = now;
    return day;
  }

  let dayHistCache = null;
  let dayHistCacheRaw = '';
  let dayHistCacheAt = 0;
  // La tarjeta de 7 dias se pinta dos veces por segundo y no cambia tan rapido.
  // Antes la huella se recalculaba leyendo TODAS las claves de localStorage en
  // cada tick (y cada ventana tiene su latido); ahora el escaneo se hace una
  // vez por segundo y el resto de ticks reutilizan la lista.
  const DAY_HIST_TTL_MS = 1500;

  // Trabajo real, no llamadas: el banco de rendimiento comprueba que el panel
  // no repite DOM ni almacenamiento en cada tick.
  const perfCounters = {
    hudReads: 0, dayScans: 0, panelPaints: 0, userParses: 0,
    warningScans: 0, challengeScans: 0, captchaScans: 0, captchaUiScans: 0,
    resultsWatches: 0, storageReads: 0, panelNodes: 0,
  };

  function noteStorageRead() {
    perfCounters.storageReads += 1;
  }

  // El arranque pide las mismas claves varias veces (perfil, calibracion,
  // challenges). Una cache de un segundo, invalidada en cada escritura, evita
  // repetir getItem sin dejar valores viejos cuando algo cambia.
  let persistRawAt = 0;
  let persistRawValue = null;
  const countReadCache = new Map();
  let calibrationReadAt = 0;
  let calibrationReadValue = 0;

  function clearPersistRaw() {
    persistRawAt = 0;
    persistRawValue = null;
  }

  function persistRaw() {
    const now = Date.now();
    if (persistRawAt && now - persistRawAt < 1000) return persistRawValue;
    persistRawAt = now;
    persistRawValue = disk.get('persist:nt', 'null');
    return persistRawValue;
  }

  function calibrationStamp() {
    const now = Date.now();
    if (calibrationReadAt && now - calibrationReadAt < 500) return calibrationReadValue;
    calibrationReadAt = now;
    calibrationReadValue = Number(disk.get(KEYS.calibrationAt, 0)) || 0;
    return calibrationReadValue;
  }

  // Acceso propio para las funciones que viven antes de `disk`: `dayHistoryRead`,
  // `todayBump` y las marcas de la Mystery Box no pueden depender de una constante
  // declarada mas abajo (TDZ) ni de que el objeto ya exista si un dia se llama
  // durante la inicializacion.
  const dayStore = {
    get(key) {
      noteStorageRead(key);
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
    remove(key) { try { localStorage.removeItem(key); return true; } catch { return false; } },
  };

  // Ultimos 7 dias, de mas viejo a mas nuevo, fusionando las partes de cada
  // fecha. Se poda sola: una parte sin tocar en 8 dias ya no la mira nadie.
  function dayHistoryRead() {
    const now = Date.now();
    if (dayHistCache && now - dayHistCacheAt < DAY_HIST_TTL_MS) return dayHistCache;
    perfCounters.dayScans += 1;

    const byDate = new Map();
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(DAY_HIST_PREFIX)) keys.push(key);
      }
    } catch { /* almacenamiento bloqueado */ }

    // La firma es el texto crudo de las partes, no un reloj: el panel la llama
    // dos veces por segundo y solo hace falta volver a parsear cuando una
    // parte cambia (esta ventana u otra pestana). La poda invalida la firma.
    const fingerprint = keys.map((key) => `${key}\u0000${dayStore.get(key) || ''}`).join('\u0001');
    if (dayHistCache && fingerprint === dayHistCacheRaw) {
      dayHistCacheAt = now;
      return dayHistCache;
    }

    let pruned = false;
    for (const key of keys) {
      const day = dayParseAny(dayStore.get(key));
      const stamp = day ? Number(day.updatedAt) || 0 : 0;
      if (!day || (stamp > 0 && now - stamp > DAY_HIST_KEEP_MS)) {
        dayStore.remove(key);
        pruned = true;
        continue;
      }

      const into = byDate.get(day.date) || todayEmpty();
      into.date = day.date;
      mergeDay(into, day);
      byDate.set(day.date, into);
    }

    const list = [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-DAY_HIST_DAYS);

    dayHistCache = list;
    dayHistCacheRaw = pruned ? '' : fingerprint;
    dayHistCacheAt = now;
    return list;
  }

  // "14:03" en corto, para el tooltip del resumen del dia.
  function clockText(at) {
    if (!Number.isFinite(at) || at <= 0) return '';
    const d = new Date(at);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // Espera de la Mystery Box en formato corto pero exacto: minutos por debajo
  // de una hora y horas+minutos por encima, sin redondear 20h 59m a "21 h".
  function boxWaitText(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    if (min < 1) return 'less than a minute';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  // Suma un incremento en la parte de esta ventana. Recibe incrementos, no
  // valores absolutos: los absolutos se calculaban sobre una lectura compartida
  // y la ultima pestana en guardar borraba lo que la otra acababa de sumar.
  // Suma un incremento a un resumen (el del dia o el del historico): la misma
  // cuenta para los dos, en un solo sitio, para que no se separen con el tiempo.
  function applyDayBump(part, delta, at) {
    if (!Array.isArray(part.chKeys)) part.chKeys = [];
    for (const field of ['races', 'sumWpm', 'sumTarget', 'boxes', 'dq', 'clean', 'cash', 'xp']) {
      part[field] += Math.max(0, Number(delta[field]) || 0);
    }
    if (typeof delta.chKey === 'string' && delta.chKey && !part.chKeys.includes(delta.chKey)) {
      part.chKeys.push(delta.chKey);
    }

    if (at > 0) {
      if (!part.firstAt || at < part.firstAt) part.firstAt = at;
      part.lastAt = Math.max(part.lastAt, at);
    }
    if (Number(delta.best) > part.best) {
      part.best = Number(delta.best);
      part.bestAcc = Math.max(0, Number(delta.bestAcc) || 0);
    }
    part.dqAt = Math.max(part.dqAt, Math.max(0, Number(delta.dqAt) || 0));
    if (delta.resetClean) part.clean = 0;
    return part;
  }

  function todayBump(delta) {
    let part = null;
    try { part = todayParse(localStorage.getItem(DAY_PART_KEY)); } catch { part = null; }
    if (!part) part = todayEmpty();

    const at = Math.max(0, Number(delta.at) || 0);
    applyDayBump(part, delta, at);

    // La DQ corta la racha limpia de TODAS las partes del dia: si solo se
    // borrara la de esta ventana, la suma de partes resucitaria la racha.
    if (delta.resetClean) {
      part.clean = 0;
      for (const key of todayPartKeys()) {
        if (key === DAY_PART_KEY) continue;
        const other = todayParse(dayStore.get(key));
        if (!other || !other.clean) continue;
        other.clean = 0;
        other.updatedAt = Date.now();
        dayStore.set(key, JSON.stringify(other));
      }

      // El historico tambien tiene una parte por ventana. Si solo se limpia la
      // de esta, la lectura fusionada resucita la racha que la DQ acaba de
      // cortar; se limpian todas las partes de hoy, no solo la propia.
      const histPrefix = `${DAY_HIST_PREFIX}${todayKey()}:`;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith(histPrefix)) continue;
          const other = dayParseAny(localStorage.getItem(key));
          if (!other || !other.clean) continue;
          other.clean = 0;
          other.updatedAt = Date.now();
          localStorage.setItem(key, JSON.stringify(other));
        }
      } catch { /* almacenamiento bloqueado */ }
    }

    disk.set(DAY_PART_KEY, JSON.stringify({ ...part, date: todayKey(), updatedAt: Date.now() }));

    // El historico de 7 dias recibe la misma suma, en su clave por ventana y
    // fecha. Aqui no se tocan las partes de las otras ventanas: cada una escribe
    // la suya y la lectura las fusiona. Es la regla que evito que el resumen del
    // dia se pisara entre pestanas.
    const stampDate = todayKey();
    let hist = null;
    try { hist = dayParseAny(dayStore.get(DAY_HIST_KEY(stampDate))); } catch { hist = null; }
    if (!hist) hist = todayEmpty();
    applyDayBump(hist, delta, at);
    dayStore.set(DAY_HIST_KEY(stampDate), JSON.stringify({ ...hist, date: stampDate, updatedAt: Date.now() }));

    // Poda al escribir: otro dia o mas de 24 h sin actualizarse.
    for (const key of todayPartKeys()) {
      const saved = todayParse(disk.get(key));
      const stamp = saved ? Number(saved.updatedAt) || 0 : 0;
      if (!saved || (stamp > 0 && Date.now() - stamp > 24 * 3600000)) dayStore.remove(key);
    }

    todayCache = null;
    dayHistCache = null;
    return todayRead();
  }

  // `next` (y `rewardCountdown`) pueden venir como marca de tiempo (epoch en
  // segundos, lo que usa el sitio) o como duracion (versiones antiguas). Se
  // devuelve la espera en ms, saneada: fuera de (0, 48 h] no es creible y cae
  // al valor de reserva. Vive aqui para que la cola y el panel lean igual.
  function boxWaitFromNext(value, fallbackMs, { pastMeansReady = false, epochOnly = false } = {}) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return { wait: fallbackMs, raw: value, bad: 'missing' };
    // `rewardCountdown` es una hora del sitio, no una duracion: un valor pequeno
    // se leeria como "faltan N segundos desde ahora" en cada latido y bloquearia
    // la caja para siempre.
    if (epochOnly && n <= 1e9) return { wait: fallbackMs, raw: value, bad: 'not-epoch' };

    const wait = n > 1e9 ? n * 1000 - Date.now() : n * 1000;
    if (wait > 48 * 3600000) return { wait: fallbackMs, raw: value, bad: 'too-far' };
    if (wait <= 0) {
      return pastMeansReady
        ? { wait: 0, raw: value, bad: null }
        : { wait: fallbackMs, raw: value, bad: 'past' };
    }
    return { wait, raw: value, bad: null };
  }

  // Tiempo transcurrido: largo para el tooltip de la caja ("1.5 h ago") y
  // compacto para la nota de temporada ("1h ago"), con una sola escala.
  function elapsedText(at, compact = false) {
    const raw = Date.now() - Number(at);
    if (!Number.isFinite(raw) || raw < 0) return 'just now';
    if (compact) {
      const minutes = Math.floor(raw / 60000);
      if (minutes < 1) return 'just now';
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      return `${Math.floor(hours / 24)}d ago`;
    }
    const minutes = Math.round(raw / 60000);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = minutes / 60;
    if (hours < 24) return `${hours.toFixed(1)} h ago`;
    return `${(hours / 24).toFixed(1)} d ago`;
  }

  // La caja se reclama con el boton del sitio, en el garaje. Cuando vence en
  // plena carrera, la cola deja esta marca para que el tipador retenga "Race
  // Again" unos segundos mientras la navegacion al garaje llega. Caduca sola.
  const BOX_VISIT = 'ntQueue:boxVisitAt';
  function boxVisitPending() {
    const at = Number(dayStore.get(BOX_VISIT)) || 0;
    return at > 0 && Date.now() - at < 900000;   // 15 min
  }
  function setBoxVisit(on) {
    if (on) dayStore.set(BOX_VISIT, String(Date.now()));
    else dayStore.remove(BOX_VISIT);
  }

  // Reclamo pedido (boton del panel) que aun no se ha podido pulsar. Mientras
  // dure, la caja cuenta como vencida aunque la estimacion local diga que no:
  // un intento fallido dejaba 30 min de espera con la caja delante.
  const BOX_FORCE = 'ntQueue:boxForceAt';
  function boxForcePending() {
    const at = Number(dayStore.get(BOX_FORCE)) || 0;
    return at > 0 && Date.now() - at < 600000;   // 10 min
  }
  function setBoxForce(on) {
    if (on) dayStore.set(BOX_FORCE, String(Date.now()));
    else dayStore.remove(BOX_FORCE);
  }

  // Cuando arranco esta pagina: un intento fallido anterior no bloquea la
  // visita nueva, pero uno de esta misma pagina si (no se insiste en caliente).
  const PAGE_AT = Date.now();

  /* ==========================================================================
   * 2. UTILITIES
   * ========================================================================== */
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const average = ([min, max]) => (min + max) / 2;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Reloj de tecleo. Con la pestana oculta el navegador clampa setTimeout a ~1 s
  // (y a 1/min tras cinco minutos), asi que la cadencia se arrastraba y el
  // servidor descalificaba la carrera por inactividad. Los temporizadores de un
  // Worker no pasan por esa cola de la pagina: el aviso vuelve como mensaje, que
  // no es un temporizador. Si el Worker no se puede crear (CSP del sitio), se
  // usa el setTimeout de siempre y todo funciona como antes.
  let preciseClockKind = 'page';
  const preciseSleep = (() => {
    let worker = null;

    try {
      const source = 'self.onmessage = function (event) {'
        + 'var id = event.data[0];'
        + 'setTimeout(function () { self.postMessage(id); }, event.data[1]);'
        + '};';
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      worker = new Worker(url);
      URL.revokeObjectURL(url);
    } catch {
      return null;
    }

    preciseClockKind = 'worker';
    let nextId = 1;
    const pending = new Map();

    worker.onmessage = (event) => {
      const resolve = pending.get(event.data);
      if (!resolve) return;
      pending.delete(event.data);
      resolve();
    };

    // Un error del Worker no puede dejar una carrera colgada: se resuelven las
    // esperas pendientes y se vuelve al reloj normal.
    worker.onerror = () => {
      for (const resolve of pending.values()) resolve();
      pending.clear();
      worker = null;
      preciseClockKind = 'page';
    };

    return (ms) => new Promise((resolve) => {
      if (!worker) {
        setTimeout(resolve, ms);
        return;
      }

      const id = nextId++;
      pending.set(id, resolve);
      worker.postMessage([id, Math.max(0, ms)]);
    });
  })() || sleep;
  // Temporizadores de la cola (Continue, Race Now, DQ, re-login, caja). Con la
  // pestana oculta el navegador los clampa igual que los del tecleo: a ~1/s, y a
  // 1/min tras cinco minutos, asi que el encadenado se arrastraba justo cuando el
  // farmeo tiene que ir solo. Con el modo AFK y el reloj Worker se espera con el
  // Worker, que no pasa por esa cola. El asa sigue siendo un numero (negativo)
  // para que `if (timer)` y `clearLater` funcionen sin tocar cada sitio. Los
  // argumentos van como en setTimeout(fn, ms), para que el cambio de un sitio a
  // otro sea solo el nombre.
  const bgTimers = new Map();
  let bgTimerSeq = 0;

  function later(fn, ms) {
    if (!(backgroundFarm() && pageHidden() && preciseClockKind === 'worker')) {
      return setTimeout(fn, ms);
    }

    const id = ++bgTimerSeq;
    bgTimers.set(id, true);
    preciseSleep(ms).then(() => {
      if (!bgTimers.delete(id)) return;   // cancelado mientras esperaba
      try {
        fn();
      } catch (error) {
        try { console.error('[NTAuto · timer]', error); } catch { /* sin consola */ }
      }
    });
    return -id;
  }

  function clearLater(handle) {
    if (!handle) return;
    if (typeof handle !== 'number' || handle > 0) {
      clearTimeout(handle);
      return;
    }
    bgTimers.delete(-handle);
  }

  const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();

  // "Human" delay: a short range plus, now and then, a longer pause. Used by the
  // race chaining and by the queue: a person never presses with the same
  // millisecond gap every time.
  function humanDelay(range, longChance = 0, longRange = [0, 0]) {
    if (longChance > 0 && longRange[1] > 0 && Math.random() < longChance) {
      return randInt(longRange[0], longRange[1]);
    }
    return randInt(range[0], range[1]);
  }

  // Eleccion de instancia en el window actual. Cada copia del script deja un
  // latido en el objeto window del documento, asi que dos copias de la MISMA
  // pagina (o del mismo marco) se ven entre si. Manda la registrada primero, con
  // el id como desempate; las demas esperan en silencio y toman el relevo cuando
  // la primera desaparece. Antes, dos copias se paraban la una a la otra a
  // base de "kill" compartido, y una parada a mitad de carrera dejaba la carrera
  // sin teclas (DQ por inactividad) y al bot mudo hasta recargar.
  function electInstance(registryKey, id, since, staleMs) {
    const now = Date.now();
    let list = [];

    try {
      const raw = window[registryKey];
      if (Array.isArray(raw)) {
        list = raw.filter((item) => item && item.id && now - item.at < staleMs);
      }
    } catch { /* sin acceso al registro: se sigue como copia unica */ }

    const mine = list.find((item) => item.id === id);
    if (mine) mine.at = now;
    else list.push({ id, at: now, since: since || now });

    try {
      window[registryKey] = list.slice(-5);
    } catch { /* sin acceso: el aviso de duplicadas no se puede dar */ }

    if (list.length < 2) return { count: list.length, primary: true, leader: list[0] || null };

    const ranked = list.slice().sort((a, b) => {
      const as = a.since || a.at;
      const bs = b.since || b.at;
      if (as !== bs) return as - bs;
      return a.id < b.id ? -1 : 1;
    });

    return { count: list.length, primary: ranked[0].id === id, leader: ranked[0] };
  }

  // El modal de DQ del juego: "Uh oh! You have been disqualified..." (y el
  // bloqueo por racha). No vale buscar "disqualified" a secas: la tabla de
  // resultados marca asi a otros corredores y daria un falso positivo.
  // Bloqueo temporal de la cuenta: no es una carrera mas, es el castigo por
  // encadenar DQ. Seguir abriendo carreras solo alarga la racha.
  function looksDqBlocked(text) {
    return String(text || '').toLowerCase().includes('too many disqualifications');
  }

  // El aviso del sitio ("wait a few minutes") no dice cuanto dura. Con una
  // espera fija el bot volvia justo cuando el castigo seguia: otra carrera, otro
  // bloqueo, y asi toda la tarde. Cada bloqueo seguido dobla la espera, con
  // tope, y una carrera terminada la devuelve al minimo.
  const DQ_BLOCK_STAGE = 'ntQueue:dqBlockStage';
  const DQ_BLOCK_STAGE_MAX = 3;          // 15 -> 30 -> 60 -> 90 min
  // El castigo entero vive en localStorage, no en sessionStorage: cerrar la
  // pestana (que es lo que hace cualquiera al ver una espera de 30 min) borraba
  // la hora de fin pero no la etapa, asi que al reabrir no habia espera que
  // respetar, el garaje abria carrera, chocaba otra vez y escalaba sola. De
  // paso las dos pestanas comparten una sola hora de fin en vez de una cada una.
  const DQ_BLOCK_UNTIL = 'ntQueue:dqBlockUntil';
  const DQ_BLOCK_CHECKED_AT = 'ntQueue:dqBlockCheckedAt';
  const DQ_BLOCK_WAIT_MAX = 90 * 60000;  // mas que eso ya es cosa tuya, no del bot

  function dqBlockWaitMs(stage) {
    const n = clamp(Number(stage) || 0, 0, DQ_BLOCK_STAGE_MAX);
    const base = Math.max(600000, Number(CONFIG.queue.blockedRetryMs) || 0);
    return Math.min(DQ_BLOCK_WAIT_MAX, base * Math.pow(2, n));
  }

  function looksDisqualified(text) {
    const t = normalize(text);
    return t.includes('you have been disqualified') || t.includes('too many disqualifications');
  }

  // El servidor de la carrera cerro la conexion ("Communications Error /
  // Connection Closed"): el aviso tapa la app y las teclas dejan de llegar.
  // Las dos frases son del propio bundle; se aceptan por separado porque el
  // titulo y el cuerpo pueden venir en nodos distintos.
  function looksLikeConnectionError(text) {
    const t = normalize(text);
    return t.includes('communications error')
      || t.includes('error communicating with the race server')
      || t.includes('connection closed');
  }

  // Avance de la carrera en tanto por ciento, ya acotado: el indice de React
  // puede adelantarse un tick al final y sacaria una barra de 101%.
  function progressPct(pos, total) {
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(pos)) return 0;
    return clamp((pos / total) * 100, 0, 100);
  }

  // El log va a la consola, pero el ultimo aviso tambien se pinta en el panel:
  // si el bot se para por una DQ o un bloqueo, la razon tiene que verse sin
  // abrir las herramientas del navegador.
  let statusEl = null;
  let lastStatus = '';

  // Copia corta de los ultimos avisos, con su hora. El panel solo pinta el
  // ultimo, asi que sin esto un informe de diagnostico no tendria historia: el
  // detalle de que paso antes de que algo fallara se perdia en la consola.
  const NOTICE_RING = 16;
  const noticeRing = [];

  const log = (...args) => {
    console.log('%c[NTAuto]', 'color:#7cc7ff;font-weight:bold', ...args);

    const text = args.filter((arg) => typeof arg === 'string').join(' ').trim();
    // Las lineas de progreso (cada 5 s) no son estado: taparian los avisos.
    if (!text || text.startsWith('WPM ')) return;

    lastStatus = text;
    noticeRing.push({ at: Date.now(), text });
    if (noticeRing.length > NOTICE_RING) noticeRing.shift();
    if (statusEl) setText(statusEl, text);
  };

  /* ==========================================================================
   * 3. PROFILE: WPM AND ACCURACY PER SESSION
   * ========================================================================== */
  // localStorage puede estar bloqueado (modo privado, politicas del sitio).
  // Un getItem que lanza no puede tumbar el script entero: se degrada a
  // memoria y todo lo que dependa de el se comporta como recien instalado.
  const disk = {
    get(key, fallback = null) {
      noteStorageRead(key);
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : raw;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        countReadCache.delete(key);
        if (key === KEYS.calibrationAt) calibrationReadAt = 0;
        if (key === 'persist:nt') clearPersistRaw();
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
        countReadCache.delete(key);
        if (key === KEYS.calibrationAt) calibrationReadAt = 0;
        if (key === 'persist:nt') clearPersistRaw();
        return true;
      } catch {
        return false;
      }
    },
  };

  function readCount(key) {
    const now = Date.now();
    const hit = countReadCache.get(key);
    if (hit && now - hit.at < 500) return hit.value;
    const parsed = parseInt(disk.get(key, '') || '', 10);
    // 0 es un valor valido: es el estado "sin ciclo" y hace que el primer
    // advanceSessions empiece en 1. Un valor corrupto tambien cae a 0; devolver
    // 1 retrasaba el reinicio de la serie hasta que el contador volvia a 1.
    const value = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    countReadCache.set(key, { at: now, value });
    return value;
  }

  // Escribir de verdad, no preguntar si se puede: un almacenamiento bloqueado
  // (modo privado, permisos) es lo primero que hay que descartar cuando la tanda
  // se olvida de todo entre recarga y recarga. Va en el informe de diagnostico.
  function storageUsable() {
    const probe = `${KEYS.session}:probe`;
    try {
      localStorage.setItem(probe, '1');
      const ok = localStorage.getItem(probe) === '1';
      localStorage.removeItem(probe);
      return ok;
    } catch {
      return false;
    }
  }

  // Datos que el propio sitio guarda del jugador en `localStorage.persist:nt`
  // (redux-persist serializa `user` como texto). Los usa el script de
  // estadisticas del juego y son de solo lectura: aqui sirven para el
  // `rewardCountdown` de la Mystery Box y para el nombre/ID del corredor.
  let siteUserAt = 0;
  let siteUserValue = null;
  let siteUserRaw = null;

  // Lectura unica del JWT del sitio. `player_token` puede estar como JWT crudo,
  // con comillas (la app lo guardo con JSON.stringify) o con el prefijo
  // "Bearer": las tres formas se aceptan aqui y en ningun otro sitio. Antes se
  // parseaba en tres funciones y la de la Mystery Box leia el valor crudo, asi
  // que mandaba comillas en la cabecera Authorization.
  function readToken() {
    const raw = disk.get('player_token', '');
    return String(raw || '').replace(/^"|"$/g, '').replace(/^Bearer\s+/i, '');
  }

  function jwtClaims(token = readToken()) {
    const payload = token && token.split('.')[1];
    if (!payload) return null;
    try {
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const claims = JSON.parse(atob(padded));
      return claims && typeof claims === 'object' ? claims : null;
    } catch {
      return null;   // token ilegible o almacenamiento bloqueado
    }
  }

  // Tiempo que le queda al token de sesion del sitio (`player_token`). Se cachea
  // un segundo: el panel se repinta muchas veces por carrera y el JWT no cambia.
  let sessionExpAt = 0;
  let sessionExpReadAt = 0;
  function sessionExpiryAt() {
    const now = Date.now();
    if (now - sessionExpReadAt < 1000) return sessionExpAt;
    sessionExpReadAt = now;
    sessionExpAt = 0;
    const claims = jwtClaims();
    const exp = Number(claims && claims.exp);
    if (Number.isFinite(exp) && exp > 0) sessionExpAt = exp * 1000;
    return sessionExpAt;
  }

  function siteUser(maxAge = 3000) {
    const now = Date.now();
    if (siteUserAt && now - siteUserAt < maxAge) return siteUserValue;

    try {
      const raw = persistRaw();
      // `persist:nt` puede ser grande. Si el texto no cambio, el objeto cacheado
      // sigue siendo valido: no hay que volver a parsearlo cada pocos segundos.
      if (raw === siteUserRaw) {
        siteUserAt = now;
        return siteUserValue;
      }
      siteUserRaw = raw;
      siteUserValue = null;
      siteUserAt = now;
      const root = raw ? JSON.parse(raw) : null;
      if (!root || !root.user) return siteUserValue;
      const user = typeof root.user === 'string' ? JSON.parse(root.user) : root.user;
      if (user && typeof user === 'object') siteUserValue = user;
    } catch {
      /* almacenamiento corrupto o bloqueado */
    }
    return siteUserValue;
  }

  /* ==========================================================================
   * 3a. PERFIL DE RITMO Y PREFERENCIAS
   * ========================================================================== */
  // Tres perfiles DENTRO del sobre legitimo: los tres gastan la misma cadencia
  // humana y los tres quedan por debajo del techo duro. Lo unico que cambian es
  // el rango del que se sortea el objetivo de cada sesion, para poder bajar el
  // ritmo en una cuenta nueva (soft) o apretar un poco en la tuya (fast, topado a
  // un WPM del techo). No es un modo rapido: el antiguo BLATANT sigue borrado.
  // El perfil del medio se llama BALANCED: es el rango calibrado de la cuenta.
  // Antes se llamaba «normal», y ese nombre se lee todavia como balanced para
  // que una preferencia vieja en disco no caiga al perfil por defecto.
  // Temas del panel. El orden es el de la rejilla de TUNE y el primero es el
  // que se pinta en una instalacion nueva.
  const THEMES = ['carbon', 'aurora', 'sunset', 'ice', 'violet', 'rgb'];
  const THEME_LABELS = {
    carbon: 'Carbon',
    aurora: 'Aurora',
    sunset: 'Sunset',
    ice: 'Ice',
    violet: 'Violet',
    rgb: 'RGB',
  };

  let panelTheme = (() => {
    const saved = disk.get(KEYS.panelTheme, 'carbon');
    return THEMES.includes(saved) ? saved : 'carbon';
  })();

  // @property no se registra dentro de un shadow root: el navegador lo ignora
  // y --nt-hue salta de 0 a 360 en seco, que es quedarse en rojo/amarillo.
  // CSS.registerProperty lo registra en el documento y los dos paneles lo
  // heredan; no depende de inyectar estilos ni del CSP de la pagina.
  function registerThemeProperties() {
    try {
      if (window.__ntaThemeProps || !window.CSS || typeof CSS.registerProperty !== 'function') return;
      CSS.registerProperty({ name: '--nt-hue', syntax: '<number>', inherits: true, initialValue: '160' });
      CSS.registerProperty({ name: '--nt-angle', syntax: '<angle>', inherits: true, initialValue: '0deg' });
      window.__ntaThemeProps = true;
    } catch { /* ya registradas o navegador sin soporte */ }
  }

  const PACE_PROFILES = {
    soft: { min: 98, max: 108 },
    balanced: { min: CONFIG.wpm.min, max: CONFIG.wpm.max },
    fast: { min: 110, max: 119 },
  };
  const PACE_ORDER = ['soft', 'balanced', 'fast'];
  const NITRO_STRATEGIES = ['longest', 'first', 'last'];
  function normalizeNitroStrategy(value) {
    return NITRO_STRATEGIES.includes(value) ? value : 'longest';
  }

  let paceProfile = (() => {
    const saved = disk.get(KEYS.paceProfile);
    const name = saved === 'normal' ? 'balanced' : saved;
    if (!PACE_PROFILES[name]) return 'balanced';
    // La migracion se escribe: lo guardado con el nombre viejo no vuelve a
    // aparecer en una exportacion de la configuracion.
    if (name !== saved) disk.set(KEYS.paceProfile, name);
    return name;
  })();

  // Rango leido del API de stats. `null` = nunca se ha leido y manda el rango
  // escrito a mano en PACE_PROFILES.balanced.
  let calibratedRange = (() => {
    try {
      const raw = JSON.parse(disk.get(KEYS.calibratedRange, 'null'));
      if (raw && Number.isFinite(raw.min) && Number.isFinite(raw.max)) {
        return { min: Math.round(raw.min), max: Math.round(raw.max) };
      }
    } catch { /* preferencia corrupta: se ignora */ }
    return null;
  })();

  // Media de precision leida del API. `null` = nunca se ha leido y manda el
  // 96-98 escrito a mano.
  let accountStats = null;

  let calibratedAccuracy = (() => {
    try {
      const raw = JSON.parse(disk.get(KEYS.calibratedAccuracy, 'null'));
      if (raw && Number.isFinite(raw.min) && Number.isFinite(raw.max)) {
        return { min: Math.round(raw.min), max: Math.round(raw.max) };
      }
    } catch { /* preferencia corrupta: se ignora */ }
    return null;
  })();

  // Un rango simetrico alrededor de la media real. La mitad crece con el ritmo
  // (2 WPM en una cuenta de 15, 6 a partir de 86) para que la media de los
  // objetivos sea la media de la persona, sin convertir cada carrera en una
  // copia exacta. El techo duro sigue mandando.
  function wpmRangeFor(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;

    const cap = Number.isFinite(CONFIG.wpm.hardCap) ? CONFIG.wpm.hardCap : 120;
    const floor = Math.max(1, Number(CONFIG.calibration.minWpm) || 15);
    const center = clamp(Math.round(number), floor, cap - 1);
    const half = clamp(Math.round(center * 0.14), 2, Math.max(2, CONFIG.calibration.halfWidth | 0));
    let min = clamp(center - half, floor, cap);
    let max = clamp(center + half, floor, cap);
    if (max - min < 6) {
      const middle = (min + max) / 2;
      min = clamp(Math.floor(middle - 3), floor, cap);
      max = clamp(min + 6, floor, cap);
    }
    return { min, max };
  }

  function paceRange(name = paceProfile) {
    const cap = Number.isFinite(CONFIG.wpm.hardCap) ? CONFIG.wpm.hardCap : 120;
    const floor = Math.max(1, Number(CONFIG.calibration.minWpm) || 15);

    // Con una media de cuenta, los tres perfiles se mueven alrededor de ELLA:
    // soft baja media anchura, fast sube media anchura y balanced se queda en
    // el centro. Antes soft/fast eran 98-108/110-119 fijos: una cuenta de 43
    // que tocara fast saltaba a 90+ y eso es justo lo que hay que evitar.
    if (CONFIG.calibration.auto && calibratedRange) {
      const width = Math.max(0, calibratedRange.max - calibratedRange.min);
      const shift = name === 'soft'
        ? -Math.round(width / 2)
        : name === 'fast' ? Math.round(width / 2) : 0;
      const max = clamp(calibratedRange.max + shift, floor, cap);
      const min = clamp(calibratedRange.min + shift, floor, max);
      return { min: Math.min(min, max), max };
    }

    const tier = PACE_PROFILES[name] || PACE_PROFILES.balanced;
    const max = clamp(tier.max, floor, cap);
    const min = clamp(tier.min, floor, max);
    return { min: Math.min(min, max), max };
  }

  // Interruptores que antes vivian solo en CONFIG: apagar uno desde el panel se
  // perdia en la siguiente recarga. Ahora se guardan en autoTyperPrefs.
  function readPrefs() {
    let saved = null;
    try {
      saved = JSON.parse(disk.get(KEYS.prefs) || 'null');
    } catch {
      saved = null;
    }
    if (!saved || typeof saved !== 'object') saved = {};

    const flag = (key) => (typeof saved[key] === 'boolean' ? saved[key] : true);
    return {
      breaks: flag('breaks'),
      mysteryBox: flag('mysteryBox'),
      stickers: flag('stickers'),
      guard: flag('guard'),
      useNitro: flag('useNitro'),
      nitroStrategy: normalizeNitroStrategy(saved.nitroStrategy),
      challenges: flag('challenges'),
      calibration: true,
    };
  }

  function savePrefs() {
    disk.set(KEYS.prefs, JSON.stringify({
      breaks: CONFIG.breaks.enabled !== false,
      mysteryBox: CONFIG.mysteryBox.enabled !== false,
      stickers: CONFIG.stickers.enabled !== false,
      guard: CONFIG.guard.enabled !== false,
      useNitro: CONFIG.useNitro !== false,
      nitroStrategy: normalizeNitroStrategy(CONFIG.nitroStrategy),
      challenges: CONFIG.challenges.enabled !== false,
      calibration: CONFIG.calibration.auto !== false,
    }));
  }

  // Se aplica ANTES de que se sortee la serie de WPM: el rango del perfil entra
  // en la firma de la serie, asi que cambiarlo rehace los objetivos solo.
  (function applyPrefs() {
    const prefs = readPrefs();
    CONFIG.breaks.enabled = prefs.breaks;
    CONFIG.mysteryBox.enabled = prefs.mysteryBox;
    CONFIG.stickers.enabled = prefs.stickers;
    CONFIG.guard.enabled = prefs.guard;
    CONFIG.useNitro = prefs.useNitro;
    CONFIG.nitroStrategy = prefs.nitroStrategy;
    CONFIG.challenges.enabled = prefs.challenges;
    // La calibracion no es un modo que se pueda apagar: el ritmo SIEMPRE sale
    // de las estadisticas de la cuenta. Se ignora cualquier `false` viejo y se
    // conserva el interruptor guardado solo por compatibilidad.
    CONFIG.calibration.auto = true;
    CONFIG.challenges.selector = disk.get(KEYS.challengeSelector, '') || '';

    // Primera foto SIN esperar al fetch: el garaje ya dejo avgSpeed y
    // highestSpeed en persist:nt. Asi el primer objetivo de una instalacion
    // nueva ya sale de la media del jugador y nunca del 104-117 de respaldo.
    if (CONFIG.calibration.auto) {
      const persisted = readPersistedUser();
      const range = wpmRangeFor(persisted && persisted.wpm);
      if (range) {
        const savedCenter = calibratedRange
          ? (calibratedRange.min + calibratedRange.max) / 2 : null;
        // Si la media guardada se alejo de la cuenta (otra cuenta, o el
        // jugador mejoro), se corrige ya; no se espera al refresco del API.
        // Medio WPM basta: el rango se redondea a enteros y no queremos que una
        // mejora real se quede congelada por una diferencia pequena.
        if (!calibratedRange || Math.abs(savedCenter - persisted.wpm) >= 0.5) {
          calibratedRange = range;
          disk.set(KEYS.calibratedRange, JSON.stringify(range));
        }
        if (!accountStats) accountStats = persisted;
      }
    }

    const range = paceRange();
    CONFIG.wpm.min = range.min;
    CONFIG.wpm.max = range.max;
  })();

  function series(key, count, min, max, pace = '') {
    // El perfil forma parte de la firma: dos perfiles pueden compartir rango
    // (balanced calibrado y otro futuro), y la serie no debe reutilizarse como
    // si sus objetivos fueran del mismo ritmo.
    const signature = `${pace}:${count}:${min}:${max}`;
    let stored = null;
    try {
      stored = JSON.parse(disk.get(key, 'null'));
    } catch {
      stored = null;
    }

    const valid = disk.get(`${key}:signature`) === signature
      && Array.isArray(stored)
      && stored.length === count
      && stored.every((value) => Number.isInteger(value) && value >= min && value <= max);

    if (valid) return stored;

    const next = Array.from({ length: count }, () => randInt(min, max));
    disk.set(key, JSON.stringify(next));
    disk.set(`${key}:signature`, signature);
    return next;
  }

  const profile = {
    wpm: series(KEYS.wpmSeries, CONFIG.sessions, CONFIG.wpm.min, CONFIG.wpm.max, paceProfile),
    accuracy: series(KEYS.accSeries, CONFIG.sessions, CONFIG.accuracy.min, CONFIG.accuracy.max),

    get wpmSession() {
      return clamp(readCount(KEYS.wpmCount), 1, this.wpm.length);
    },
    get accSession() {
      return clamp(readCount(KEYS.accCount), 1, this.accuracy.length);
    },
    get bufferSession() {
      return clamp(readCount(KEYS.bufferCount), 1, CONFIG.accuracyBuffers.length);
    },
    get targetWPM() {
      return this.wpm[this.wpmSession - 1];
    },
    get targetAccuracy() {
      return this.accuracy[this.accSession - 1];
    },
    get accuracyGoal() {
      return this.targetAccuracy + CONFIG.accuracyBuffers[this.bufferSession - 1];
    },
  };

  function advanceSessions() {
    const bump = (key, max) => {
      const next = readCount(key) + 1;
      const value = next > max ? 1 : next;
      disk.set(key, String(value));
      return value;
    };

    const wpmSession = bump(KEYS.wpmCount, profile.wpm.length);
    bump(KEYS.accCount, profile.accuracy.length);
    bump(KEYS.bufferCount, CONFIG.accuracyBuffers.length);

    // Al cerrar el ciclo se sortean series nuevas.
    if (wpmSession === 1) {
      for (const key of [KEYS.wpmSeries, KEYS.accSeries]) {
        disk.remove(key);
        disk.remove(`${key}:signature`);
      }
      profile.wpm = series(KEYS.wpmSeries, CONFIG.sessions, CONFIG.wpm.min, CONFIG.wpm.max, paceProfile);
      profile.accuracy = series(KEYS.accSeries, CONFIG.sessions, CONFIG.accuracy.min, CONFIG.accuracy.max);
    }
  }

  // Cambio de perfil en caliente: reajusta el rango y vuelve a sortear la serie
  // de objetivos (la firma guardada en disco deja de coincidir y series() la
  // regenera sola). No toca la precision ni el historial.
  function setPaceProfile(name, options = {}) {
    if (!PACE_PROFILES[name]) return false;

    const before = paceProfile;
    paceProfile = name;
    const range = paceRange(name);
    CONFIG.wpm.min = range.min;
    CONFIG.wpm.max = range.max;
    // El perfil va en la firma igual que en la declaracion y en advanceSessions:
    // si no, la serie guardada de otro perfil con el mismo rango se reutilizaba.
    profile.wpm = series(KEYS.wpmSeries, CONFIG.sessions, CONFIG.wpm.min, CONFIG.wpm.max, paceProfile);
    if (options.persist !== false) disk.set(KEYS.paceProfile, name);

    if (before !== name || options.force) {
      log(`Pace profile ${name.toUpperCase()}: target ${CONFIG.wpm.min}-${CONFIG.wpm.max} WPM (ceiling ${CONFIG.wpm.hardCap}).`);
      paintPace();
      paintConfig();
      updatePanel();
    }
    return true;
  }

  /* --------------------------------------------------------------------------
   * Auto-calibracion del ritmo (API de stats)
   * ------------------------------------------------------------------------ */
  // El API devuelve la media de la cuenta dentro de un objeto con varias capas
  // (`data.stats.wpm`, `data.speed`, etc.). No hay contrato publico del JSON, asi
  // que se busca la primera clave conocida con un valor plausible en vez de
  // clavar una ruta que cambie con el proximo parche.
  function pickAccountStat(value, keys, min, max, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 4) return null;

    for (const key of keys) {
      const number = Number(value[key]);
      // El rango descarta velocidades de coche, niveles y porcentajes.
      if (Number.isFinite(number) && number >= min && number <= max) return number;
    }

    for (const child of Object.values(value)) {
      const found = pickAccountStat(child, keys, min, max, depth + 1);
      if (found) return found;
    }
    return null;
  }

  // El resumen del API no siempre trae las medias: el juego las guarda en
  // `persist:nt`, con el objeto `user` serializado otra vez. Es la misma cifra
  // que el perfil pinta en el garaje, asi que sirve de respaldo cuando el API
  // solo devuelve contadores de carreras.
  function readPersistedUser() {
    try {
      const raw = JSON.parse(persistRaw());
      if (!raw || !raw.user) return null;
      const user = JSON.parse(raw.user);
      const wpm = Number(user.avgSpeed);
      const accuracy = Number(user.avgAcc);
      const bestWpm = Number(user.highestSpeed !== undefined ? user.highestSpeed : user.bestSpeed);
      const races = Number(user.racesPlayed !== undefined ? user.racesPlayed : user.races);
      return {
        wpm: Number.isFinite(wpm) && wpm >= 15 && wpm <= 300 ? wpm : null,
        accuracy: Number.isFinite(accuracy) && accuracy >= 50 && accuracy <= 100 ? accuracy : null,
        bestWpm: Number.isFinite(bestWpm) && bestWpm >= 15 && bestWpm <= 400 ? bestWpm : null,
        races: Number.isFinite(races) && races >= 0 ? Math.round(races) : null,
        source: 'persist:nt',
      };
    } catch {
      return null;
    }
  }

  async function fetchAccountStats() {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), CONFIG.calibration.timeoutMs) : null;
    const failed = (reason) => ({ wpm: null, accuracy: null, reason });

    try {
      const token = readToken();
      const headers = { accept: 'application/json, text/plain, */*' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        const claims = jwtClaims(token);
        if (claims && claims.sub) headers['x-uid'] = String(claims.sub);
      }

      const response = await fetch('/api/v2/stats/summary', {
        method: 'GET',
        credentials: 'include',
        headers,
        signal: controller ? controller.signal : undefined,
      });
      if (!response.ok) return failed(`HTTP ${response.status}`);

      const body = await response.json();
      const data = (body && (body.data || body.results)) || body;
      const wpm = pickAccountStat(data, ['wpm', 'avgWpm', 'averageWpm', 'avg_wpm', 'average_wpm', 'speed'], 15, 300);
      const accuracy = pickAccountStat(data, ['accuracy', 'acc', 'avgAccuracy', 'averageAccuracy', 'avg_accuracy'], 50, 100);
      // El resumen tampoco tiene un contrato publico estable. Se buscan los
      // nombres que usa el perfil; si faltan, persist:nt los completa.
      const persisted = readPersistedUser();
      const bestWpm = pickAccountStat(data, ['bestWpm', 'highestSpeed', 'highestWpm', 'bestSpeed', 'topWpm', 'topSpeed'], 15, 400)
        || (persisted && persisted.bestWpm) || null;
      const races = pickAccountStat(data, ['racesPlayed', 'totalRaces', 'races'], 0, 100000000)
        || (persisted && persisted.races) || null;
      if (wpm || accuracy) {
        accountStats = { wpm, accuracy, bestWpm, races, source: 'api' };
        return { wpm, accuracy, bestWpm, races, reason: null };
      }

      if (persisted && (persisted.wpm || persisted.accuracy)) {
        accountStats = persisted;
        return { ...persisted, reason: null };
      }
      return failed('no average in the response');
    } catch (error) {
      return failed(error && error.name === 'AbortError' ? 'timeout' : 'network');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Coloca el centro del rango balanced en la media real de la cuenta. El
  // ancho lo decide wpmRangeFor; el techo duro se aplica alli.
  function applyCalibration(stats) {
    const beforeWpm = { min: CONFIG.wpm.min, max: CONFIG.wpm.max };
    const beforeAcc = { min: CONFIG.accuracy.min, max: CONFIG.accuracy.max };

    if (stats.wpm) {
      const range = wpmRangeFor(stats.wpm);
      if (range) {
        calibratedRange = range;
        disk.set(KEYS.calibratedRange, JSON.stringify(calibratedRange));
        const top = Number(stats.bestWpm) > 0 ? ` (top ${Number(stats.bestWpm).toFixed(0)} WPM)` : '';
        const count = Number(stats.races) > 0 ? `, ${Number(stats.races).toLocaleString()} races` : '';
        log(`Pace auto-calibrated: account average ${Number(stats.wpm).toFixed(1)} WPM${top}${count} -> ${range.min}-${range.max}.`);
        setPaceProfile(paceProfile, { force: true });
      }
    }

    if (stats.accuracy) {
      // 96% es el acantilado de la recompensa: por debajo se cobra $0. Se deja
      // un punto arriba y otro abajo de la media, sin llegar nunca al 100% (que
      // canta en una cuenta normal) ni bajar del suelo.
      if (stats.accuracy < 96) {
        log(`Accuracy calibration skipped: account average ${stats.accuracy.toFixed(1)}% is under the 96% reward floor; keeping ${CONFIG.accuracy.min}-${CONFIG.accuracy.max}%.`);
      } else {
        const center = clamp(Math.round(stats.accuracy), 96, 99);
        const min = Math.max(96, center - 1);
        const max = Math.min(99, center + 1);
        calibratedAccuracy = { min, max };
        CONFIG.accuracy.min = min;
        CONFIG.accuracy.max = max;
        disk.set(KEYS.calibratedAccuracy, JSON.stringify(calibratedAccuracy));
        profile.accuracy = series(KEYS.accSeries, CONFIG.sessions, min, max);
        log(`Accuracy auto-calibrated: account average ${stats.accuracy.toFixed(1)}% -> ${min}-${max}%.`);
      }
    }

    const moved = beforeWpm.min !== CONFIG.wpm.min || beforeWpm.max !== CONFIG.wpm.max
      || beforeAcc.min !== CONFIG.accuracy.min || beforeAcc.max !== CONFIG.accuracy.max;
    if (moved && session && session.races > 0) {
      log(`Calibration changed the target mid-session (race ${session.races}): ${beforeWpm.min}-${beforeWpm.max} -> ${CONFIG.wpm.min}-${CONFIG.wpm.max} WPM, ${beforeAcc.min}-${beforeAcc.max} -> ${CONFIG.accuracy.min}-${CONFIG.accuracy.max}% accuracy. The rest of this session uses the new range.`);
    }

    disk.set(KEYS.calibrationAt, String(Date.now()));
    paintCalibration();
    updatePanel();
    return { wpm: calibratedRange, accuracy: calibratedAccuracy };
  }

  let calibrating = false;
  let calibrationProbeAt = 0;

  async function maybeCalibrate(force = false) {
    if (calibrating) return;
    // No competir con una carrera viva: el fetch espera a que el tipador pare.
    if (session && session.typing) return;

    // El latido llama aqui cada 500 ms; leer `calibrationAt` dos veces por
    // segundo para descubrir que aun faltan 30 min es trabajo inutil. Esta
    // sonda en memoria deja pasar una comprobacion por minuto como maximo.
    const now = Date.now();
    if (!force && now - calibrationProbeAt < 60000) return;
    calibrationProbeAt = now;

    const last = calibrationStamp();
    if (!force && now - last < CONFIG.calibration.refreshMs) return;

    calibrating = true;
    try {
      const result = await fetchAccountStats();
      if (result.wpm || result.accuracy) {
        applyCalibration(result);
        return;
      }
      // Un fallo tambien marca la hora: si no, el latido reintentaria cada
      // 500 ms contra un API que no contesta.
      disk.set(KEYS.calibrationAt, String(Date.now()));
      if (force) log(`Pace calibration: ${result.reason || 'no data'}; keeping ${CONFIG.wpm.min}-${CONFIG.wpm.max} WPM / ${CONFIG.accuracy.min}-${CONFIG.accuracy.max}%.`);
    } finally {
      calibrating = false;
    }
  }

  // La calibracion es siempre automatica; este pequeño gesto solo adelanta la
  // lectura. No existe un estado "off" que pueda dejar el ritmo congelado.
  function refreshCalibration() {
    clearPersistRaw();
    log('Pace auto-calibration: refreshing from the account stats.');
    maybeCalibrate(true);
    paintCalibration();
  }

  function paintCalibration() {
    if (!panel.refs || !panel.refs.cal) return;

    if (!accountStats) accountStats = readPersistedUser();
    const accountText = accountStats && (accountStats.wpm || accountStats.accuracy)
      ? [
        accountStats.wpm ? `${accountStats.wpm.toFixed(1)} WPM` : '',
        accountStats.accuracy ? `${accountStats.accuracy.toFixed(1)}%` : '',
      ].filter(Boolean).join(' · ')
      : '—';

    const wpmText = calibratedRange ? `${calibratedRange.min}-${calibratedRange.max}` : '—';
    const accText = calibratedAccuracy ? `${calibratedAccuracy.min}-${calibratedAccuracy.max}%` : '—';
    const at = calibrationStamp();
    const calSig = [wpmText, accText, accountText, at,
      Number(accountStats && accountStats.bestWpm) || 0,
      Number(accountStats && accountStats.races) || 0].join('|');
    if (panel.calSig === calSig) {
      paintAccuracyDelta();
      return;
    }
    panel.calSig = calSig;

    setText(panel.refs.cal, 'on');
    setText(panel.refs.calWpm, wpmText);
    setText(panel.refs.calAcc, accText);
    setText(panel.refs.calAccount, accountText);

    // La chapa de la vista Live: el usuario ve de donde sale su objetivo sin
    // abrir TUNE. La media manda; el top se ensena como referencia.
    if (panel.refs.paceSource) {
      const average = accountStats && Number(accountStats.wpm) > 0
        ? Math.round(Number(accountStats.wpm)) : null;
      const top = accountStats && Number(accountStats.bestWpm) > 0
        ? Math.round(Number(accountStats.bestWpm)) : null;
      const label = average
        ? `auto · ${average} avg${top ? ` · ${top} top` : ''}`
        : calibratedRange
          ? `auto · ${calibratedRange.min}–${calibratedRange.max} wpm`
          : 'auto · reading account';
      setText(panel.refs.paceSource, label);
      panel.refs.paceSource.title = `Pace target ${wpmText} WPM, always centred on this account's average${top ? `; account top ${top} WPM` : ''}. Read automatically from the site profile and the stats API.`;
    }

    // La tarjeta de la vista LOG: cuando se leyo y que rango dejo. Se pinta
    // aqui porque este es el unico sitio que corre al calibrar y al crear el
    // panel; no depende de que la pestana este abierta.
    setText(panel.refs.calLogWhen, at ? new Date(at).toLocaleString() : 'never');
    setText(panel.refs.calLogWpm, calibratedRange ? `${wpmText} WPM` : '—');
    setText(panel.refs.calLogAcc, calibratedAccuracy ? accText : '—');

    if (panel.refs.calRow) {
      panel.refs.calRow.title = `Always automatic from the account average${at ? ` (read ${new Date(at).toLocaleString()})` : ' (not read yet)'}: ${wpmText} WPM / ${accText} accuracy. Click: refresh the stats now.`;
    }

    paintAccuracyDelta();
  }

  /* --------------------------------------------------------------------------
   * Popup de Daily Challenge
   * ------------------------------------------------------------------------ */
  let challengeSelectorWarned = false;
  let challengeScanAt = 0;
  let challengeClosedAt = 0;

  // El popup no tiene un HTML publico estable: se busca por lo que dice (la
  // palabra "challenge" y el aviso de completado) y se pulsa el boton de
  // siempre. Un selector puesto en TUNE manda y evita el barrido.
  // La ventana de arriba no comparte `session.typing` con el iframe: el contrato
  // `__ntaFrame` dice si hay tecleo vivo. Sirve para no barrer el DOM caro desde
  // las dos ventanas a la vez.
  function typerIsTyping() {
    if (session.typing) return true;
    try {
      const frame = window.__ntaFrame
        || (window.top !== window ? window.top.__ntaFrame : null);
      return Boolean(frame && Date.now() - frame.at < 5000
        && !frame.stopped && (frame.typing || frame.chars > 0));
    } catch {
      return false;
    }
  }

  function closeChallengePopup() {
    if (CONFIG.challenges.enabled === false) return false;
    if (!document.body) return false;
    // El popup aparece al cerrar la carrera; durante el tecleo no hay nada que
    // cerrar y el barrido de selectores anchos solo compite con el juego.
    if (typerIsTyping()) return false;
    if (Date.now() - challengeClosedAt < CONFIG.challenges.cooldownMs) return false;
    // Sin tecleo, un barrido cada 1,2 s basta: el popup sigue visible varios
    // segundos y no cambia de un tick a otro.
    if (Date.now() - challengeScanAt < 1200) return false;
    challengeScanAt = Date.now();
    perfCounters.challengeScans += 1;

    const selector = String(CONFIG.challenges.selector || '').trim();
    let roots = [];
    if (selector) {
      try {
        roots = Array.from(document.querySelectorAll(selector));
      } catch {
        if (!challengeSelectorWarned) {
          challengeSelectorWarned = true;
          log(`Challenge selector "${selector}" is not valid CSS; using text detection instead.`);
        }
      }
    }
    if (!roots.length) {
      roots = Array.from(document.querySelectorAll(
        '[class*="challenge" i], [id*="challenge" i], [role="dialog"], .modal, .popup, .race-results'
      ));
    }

    for (const root of roots) {
      if (!root || !root.getBoundingClientRect) continue;
      const box = root.getBoundingClientRect();
      if (box.width < 40 || box.height < 20) continue;

      const text = (root.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (!/challenge/i.test(text)) continue;
      if (!/(complete|completed|claim|collect|reward|earned)/i.test(text)) continue;
      // Un modal de DQ o de sesion puede contener "challenge" en un texto
      // secundario; cerrarlo antes de que clearDqModal lo vea seria peor que
      // dejar el popup abierto un latido mas.
      if (/(disqualif|logout warning|session will expire|currently in a race)/i.test(text)) continue;

      const buttons = Array.from(root.querySelectorAll('button, [role="button"], a'))
        .map((candidate) => {
          const rect = candidate.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) return null;
          if (candidate.disabled || candidate.getAttribute('aria-disabled') === 'true') return null;
          const label = (candidate.textContent || candidate.getAttribute('aria-label') || '').trim();
          // Cobrar manda: si el popup ofrece Collect y Continue, se pulsa
          // Collect. Cerrar con el generico dejaria el premio sin reclamar.
          const claim = /^(collect|claim)\b/i.test(label);
          const close = /^(continue|ok|okay|close|next|nice|got it|awesome|great)\b/i.test(label);
          if (!claim && !close) return null;
          return { candidate, label, score: claim ? 2 : 1 };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);
      const pick = buttons[0];
      if (!pick) continue;

      challengeClosedAt = Date.now();
      log(pick.score === 2
        ? `Daily Challenge popup: claiming the reward (${pick.label}).`
        : `Daily Challenge popup: closing it (${pick.label}).`);
      const delay = randInt(CONFIG.challenges.clickDelayMs[0], CONFIG.challenges.clickDelayMs[1]);
      // Con la pestana oculta el setTimeout se clampa; el reloj de fondo sigue
      // el retardo real del humano.
      preciseSleep(delay).then(() => {
        try { pick.candidate.click(); } catch { /* el popup se repinta */ }
      });
      return true;
    }
    return false;
  }

  function paintChallenges() {
    if (!panel.refs || !panel.refs.ch) return;

    const on = CONFIG.challenges.enabled !== false;
    setText(panel.refs.ch, on ? (CONFIG.challenges.selector ? 'on · sel' : 'on') : 'off');

    if (panel.refs.chRow) {
      const title = on
        ? `Daily Challenge popups are claimed/closed automatically${CONFIG.challenges.selector ? ` (selector: ${CONFIG.challenges.selector})` : ' (detected by text)'}. Click: turn off. Shift+click: set a CSS selector`
        : 'Daily Challenge popups are left alone. Click: claim and close them automatically. Shift+click: set a CSS selector';
      if (panel.refs.chRow.title !== title) panel.refs.chRow.title = title;
    }
  }

  // El chip del encabezado: sigue diciendo LEGIT (no hay otro ritmo) y ahora
  // lleva detras el perfil activo. Se pinta tambien al crear el panel.
  function paintPace() {
    if (!panel.refs || !panel.refs.pace) return;

    const tier = paceRange();
    setText(panel.refs.pace, `LEGIT · ${paceProfile}`);
    const paceTitle = `Pace profile: ${paceProfile} (target ${tier.min}-${tier.max} WPM, hard ceiling ${CONFIG.wpm.hardCap}). Click to change; all three keep the human cadence.`;
    if (panel.refs.pace.title !== paceTitle) panel.refs.pace.title = paceTitle;
    if (panel.root) panel.root.dataset.paceProfile = paceProfile;

    paintCalibration();
    paintChallenges();
  }

  /* ==========================================================================
   * 3b. HISTORIAL DE CARRERAS
   * ========================================================================== */
  // Se guardan los resultados REALES de cada carrera (no los objetivos), para
  // ver si el ritmo marcado se esta cumpliendo de verdad.
  let raceHistory = loadHistory();

  function loadHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEYS.history) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((item) => item && Number.isFinite(item.wpm) && Number.isFinite(item.acc))
        .slice(-CONFIG.historySize)
        .map((item) => {
          // Premio corrupto de una version anterior: se cae el campo, no la fila.
          if (Number(item.cash) > MAX_RACE_CASH) delete item.cash;
          if (Number(item.xp) > MAX_RACE_XP) delete item.xp;
          return item;
        });
    } catch {
      return [];
    }
  }

  function recordRace() {
    // Una carrera cortada (descalificacion, nodo muerto, parada manual) tiene
    // una muestra demasiado pequena para decir nada: no se registra.
    if (session.correct < 20) return false;

    const wpm = wpmNow();
    if (!wpm) return false;
    const acc = accuracyNow();

    raceHistory.push({
      wpm: Math.round(wpm * 10) / 10,
      acc: Math.round(acc * 10) / 10,
      // El ultimo WPM que marco el HUD del juego: sirve para comparar el reloj
      // calibrado con el numero oficial, no para pintar la fila.
      gameWpm: Number(session.lastHudWpm) || null,
      // Lo que el nitro regalo en esta carrera. Se guarda en la fila porque el
      // contador vivo se reinicia al empezar la siguiente.
      nitroWords: session.nitroWords || 0,
      nitroChars: session.nitroChars || 0,
      target: profile.targetWPM,   // para poder mostrar el desvio de cada carrera
      at: Date.now(),
    });

    // El resultado de la carrera puede llegar antes que la propia carrera: se
    // engancha aqui, cuando ya existe la fila que lo recibe.
    if (pendingResult) {
      const result = pendingResult;
      pendingResult = null;
      Object.assign(raceHistory[raceHistory.length - 1], result);
      if (result.cash) todayBump({ cash: result.cash });
      if (result.xp) {
        noteSessionXp(result.xp);
        todayBump({ xp: result.xp });
      }
    }

    // El WPM oficial pudo llegar antes de que la carrera existiera en la fila:
    // se engancha ahora, igual que el premio.
    if (pendingServerWpm !== null) {
      const value = pendingServerWpm;
      pendingServerWpm = null;
      stampServerWpm(raceHistory[raceHistory.length - 1], value);
    }

    // Acumulado de la tanda (no del historial, que solo guarda las ultimas).
    // Se persiste con los contadores: el resumen sobrevive a una recarga.
    // Si el paquete llego antes de crear la fila, `stampServerWpm` ya dejo el
    // WPM oficial en ella: la media tiene que sumar ese, no el del modelo.
    const recorded = raceHistory[raceHistory.length - 1];
    const countedWpm = Number.isFinite(recorded.wpm) ? recorded.wpm : wpm;
    if (!Array.isArray(session.sumWpmLedger)) session.sumWpmLedger = [];
    session.sumRaces++;
    session.sumWpm += countedWpm;
    // Lo que esta carrera aporta a la media, para poder corregirlo cuando el
    // paquete oficial llegue despues (otra carrera registrada, una recarga).
    session.sumWpmLedger.push({ at: recorded.at, wpm: countedWpm });
    if (session.sumWpmLedger.length > 8) session.sumWpmLedger.shift();
    session.sumTarget += profile.targetWPM;
    session.sumAcc += acc;
    // Contabilidad del nitro de la tanda: una carrera con nitro suma una
    // unidad y los caracteres que el juego escribio por esta copia.
    if (session.nitroWords > 0) {
      session.nitroRaces++;
      session.nitroCharsTotal += session.nitroChars;
    }
    saveCounters();

    if (raceHistory.length > CONFIG.historySize) {
      raceHistory = raceHistory.slice(-CONFIG.historySize);
    }

    try {
      localStorage.setItem(KEYS.history, JSON.stringify(raceHistory));
    } catch {
      /* almacenamiento lleno o bloqueado: queda solo en memoria */
    }

    return true;
  }

  // Una carrera medida: se apunta en el historial y, solo si de verdad conto,
  // suma a la tanda. Vive aqui y no en finishRace porque es la misma cuenta que
  // el banco necesita para probar el tope sin teclear una carrera entera.
  function countRace() {
    const counted = recordRace();
    if (counted) {
      session.races++;
      session.blockRaces++;
      saveCounters();
      updatePanel();   // la fila de carreras no espera al siguiente latido
    }
    return counted;
  }

  // Resumen del historial visible: media y mejor de las carreras que se estan
  // mostrando. Se calcula de la lista, no de un acumulador, para que al vaciar
  // el historial no queden restos de la sesion anterior.
  function historyStats(list) {
    if (!Array.isArray(list) || !list.length) return null;

    let sumWpm = 0;
    let sumAcc = 0;
    let best = 0;

    for (const item of list) {
      sumWpm += item.wpm;
      sumAcc += item.acc;
      if (item.wpm > best) best = item.wpm;
    }

    return {
      avgWpm: sumWpm / list.length,
      avgAcc: sumAcc / list.length,
      bestWpm: best,
    };
  }

  // La comparacion de WPM usa el historial medido (las ultimas 10 carreras),
  // para no mezclar el contador de la tanda con una muestra distinta. Sin al
  // menos una carrera de cada tipo no hay diferencia que ensenar.
  function nitroWpmStats(list) {
    if (!Array.isArray(list) || !list.length) return null;

    const withNitro = [];
    const without = [];
    for (const item of list) {
      const wpm = Number(item && item.wpm);
      if (!Number.isFinite(wpm)) continue;
      if (Number(item.nitroWords) > 0) withNitro.push(wpm);
      else without.push(wpm);
    }
    if (!withNitro.length || !without.length) return null;

    const avg = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const usedWpm = avg(withNitro);
    const plainWpm = avg(without);
    return {
      used: withNitro.length,
      plain: without.length,
      usedWpm,
      plainWpm,
      delta: usedWpm - plainWpm,
    };
  }

  // Alt+R: dejar el panel limpio al empezar una sesion nueva.
  function clearHistory() {
    raceHistory = [];
    // Sin filas no hay nada que corregir: las aportaciones guardadas ya no
    // pueden casar con una carrera del historial.
    session.sumWpmLedger = [];
    // La calibracion pendiente apunta a una fila que ya no existe.
    session.trimAt = 0;
    try {
      localStorage.removeItem(KEYS.history);
    } catch {
      /* almacenamiento bloqueado */
    }

    if (panel.refs) {
      panel.historySig = '';
      renderHistory();
    }
    log('Race history cleared.');
  }

  /* ==========================================================================
   * 3c. REGISTRO DE TANDAS (Alt+H)
   * ========================================================================== */
  // Cada tanda cerrada (tope o parada) se anota con lo que midio el panel: asi
  // se comparan sesiones de un vistazo, sin depender del historial de 5
  // carreras ni de rebuscar en la consola.
  let tandaLog = loadTandaLog();

  function loadTandaLog() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEYS.tandaLog) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((item) => item && Number.isFinite(item.at) && Number.isFinite(item.races))
        .slice(-CONFIG.tandaLogSize);
    } catch {
      return [];
    }
  }

  // Cierra la tanda en curso: se anota una sola vez (closed) y la cadencia de
  // descansos vuelve a cero. Las medias quedan en el registro y en el panel
  // hasta que la siguiente A abre tanda nueva.
  function closeTanda(reason) {
    if (session.closed) return null;
    if (session.sumRaces < 1 && session.dqCount < 1) return null;

    session.closed = true;
    session.blockRaces = 0;
    session.blockTarget = 0;
    saveCounters();

    const entry = {
      at: Date.now(),
      races: session.sumRaces,
      wpm: session.sumRaces > 0 ? session.sumWpm / session.sumRaces : null,
      target: session.sumRaces > 0 ? session.sumTarget / session.sumRaces : null,
      acc: session.sumRaces > 0 ? session.sumAcc / session.sumRaces : null,
      dq: session.dqCount | 0,
      xp: session.xp | 0,
      reason: reason || 'manual stop',
    };

    tandaLog.push(entry);
    if (tandaLog.length > CONFIG.tandaLogSize) {
      tandaLog = tandaLog.slice(-CONFIG.tandaLogSize);
    }

    try {
      localStorage.setItem(KEYS.tandaLog, JSON.stringify(tandaLog));
    } catch {
      /* almacenamiento lleno o bloqueado: queda solo en memoria */
    }
    return entry;
  }

  // Alt+H: las tandas cerradas, en una tabla de consola. En el panel solo cabe
  // la media viva; aqui esta el detalle de cada sesion (fecha, carreras, WPM,
  // objetivo, desvio, precision, DQ, XP y motivo de cierre).
  function showTandaLog() {
    if (!tandaLog.length) {
      log('No closed sessions yet.');
      return;
    }

    const rows = tandaLog.map((item, i) => ({
      '#': i + 1,
      date: new Date(item.at).toLocaleString(),
      races: item.races,
      wpm: Number.isFinite(item.wpm) ? Number(item.wpm.toFixed(1)) : '—',
      target: Number.isFinite(item.target) ? Number(item.target.toFixed(1)) : '—',
      deviation: Number.isFinite(item.wpm) && Number.isFinite(item.target) && item.target > 0
        ? `${item.wpm >= item.target ? '+' : ''}${(((item.wpm - item.target) / item.target) * 100).toFixed(1)}%`
        : '—',
      accuracy: Number.isFinite(item.acc) ? Number(item.acc.toFixed(1)) : '—',
      dq: item.dq,
      xp: Number.isFinite(item.xp) ? Math.max(0, Math.round(item.xp)) : '—',
      reason: item.reason,
    }));

    console.log('%c[NTAuto]', 'color:#7cc7ff;font-weight:bold', `Closed sessions: ${tandaLog.length}`);
    if (typeof console.table === 'function') console.table(rows);
    else rows.forEach((row) => console.log(row));
    log(`Closed sessions: ${tandaLog.length} (table in the console).`);
  }

  // Pasadas del banco live. El userscript no puede leer un archivo del disco,
  // asi que el CSV se carga a mano una vez y queda guardado en el navegador.
  // Se compara lo que de verdad midio cada pasada: media, sd y cuantas muestras
  // se salieron de la banda.
  const LIVE_PASSES_KEY = 'autoTyperLivePasses';
  // Una pasada aislada no dice nada; la ultima contra la media de las
  // anteriores si: mas de medio punto de deriva ya es el modelo separandose.
  const LIVE_DRIFT_LIMIT = 0.5;
  // La sd de un bloque de 10+ carreras mide dispersion, no deriva. Con 10
  // muestras, mas de una decima de punto ya no es ruido de una carrera.
  const LIVE_SPREAD_LIMIT = 0.10;

  // Formato unico para una cifra de model Δ: siempre con signo y dos decimales.
  function signedPts(value) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
  }

  // La ultima pasada contra la media de las anteriores. Devuelve null cuando no
  // hay dos pasadas con media: una sola no tiene con que compararse.
  function liveDrift() {
    const list = livePasses.slice(-10);
    const previous = list.slice(0, -1).filter((item) => Number.isFinite(item.mean));
    const latest = list[list.length - 1];
    if (!previous.length || !latest || !Number.isFinite(latest.mean)) return null;

    const avg = previous.reduce((sum, item) => sum + item.mean, 0) / previous.length;
    return { latest: latest.mean, avg, drift: latest.mean - avg, count: previous.length };
  }

  // Ultimo bloque de 10+ carreras. La sd de una pasada de 1 o 5 carreras no se
  // compara contra el umbral de 10: con pocas muestras la sd es demasiado
  // inestable para decir que el bloque esta disperso.
  function liveSpreadBlock() {
    const list = livePasses.filter((item) => item
      && Number(item.races) >= 10
      && Number(item.samples || item.races) >= 10
      && Number.isFinite(item.sd));
    return list.length ? list[list.length - 1] : null;
  }

  // La ultima pasada contra la inmediatamente anterior, no contra la media: es
  // el comparador de dos sesiones concretas que el panel ensena con una flecha.
  function liveCompare() {
    const list = livePasses.slice(-10).filter((item) => Number.isFinite(item.mean));
    if (list.length < 2) return null;
    const previous = list[list.length - 2];
    const latest = list[list.length - 1];
    return { previous, latest, diff: latest.mean - previous.mean };
  }

  // Etiqueta corta de una pasada para los dos selectores: fecha, cuenta si el
  // archivo mezcla varias, carreras y media. La fecha sale en el mismo formato
  // que la lista (`11-02 20:36`).
  function livePassLabel(pass, showAccount) {
    const bits = [String(pass.at).slice(5, 16).replace('T', ' ')];
    if (showAccount) bits.push(String(pass.user || '').trim() || 'unknown');
    bits.push(`${pass.races}r`);
    if (Number.isFinite(pass.mean)) bits.push(signedPts(pass.mean));
    return bits.join(' · ');
  }

  function livePickPair() {
    if (!panel.refs || !panel.refs.livePickA || !panel.refs.livePickB) return null;
    const pick = (value) => livePasses.find((pass) => String(pass.at) === value && Number.isFinite(pass.mean));
    const a = pick(panel.refs.livePickA.value);
    const b = pick(panel.refs.livePickB.value);
    if (!a || !b) return null;
    return { a, b, diff: b.mean - a.mean };
  }

  function paintLivePick() {
    if (!panel.refs || !panel.refs.livePickResult) return;
    const pair = livePickPair();
    if (!pair) {
      setText(panel.refs.livePickResult, '—');
      setGood(panel.refs.livePickResult, null);
      if (panel.refs.livePickExport) panel.refs.livePickExport.disabled = true;
      return;
    }
    setText(panel.refs.livePickResult,
      `${signedPts(pair.a.mean)} → ${signedPts(pair.b.mean)} · ${signedPts(pair.diff)} pts`);
    setGood(panel.refs.livePickResult, Math.abs(pair.diff) <= LIVE_DRIFT_LIMIT);
    if (panel.refs.livePickExport) panel.refs.livePickExport.disabled = false;
    if (panel.refs.livePickRow) {
      panel.refs.livePickRow.title =
        `${livePassLabel(pair.a, false)} → ${livePassLabel(pair.b, false)}`
        + ` · B − A = ${signedPts(pair.diff)} pts (band ±${LIVE_DRIFT_LIMIT})`;
    }
  }

  // CSV de la pareja A/B: una fila con las dos pasadas y B − A, para abrirla al
  // lado de live-history.csv sin recomponer nada a mano.
  function liveCompareCsv(pair) {
    const cell = (value) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const at = (value) => {
      const time = new Date(value);
      return Number.isNaN(time.getTime()) ? '' : time.toISOString();
    };
    const rows = [
      ['generated_at', 'a_at', 'a_races', 'a_mean_pts', 'a_sd_pts', 'a_user',
        'b_at', 'b_races', 'b_mean_pts', 'b_sd_pts', 'b_user', 'diff_pts', 'band_pts'],
      [
        new Date().toISOString(),
        at(pair.a.at),
        pair.a.races,
        Number.isFinite(pair.a.mean) ? pair.a.mean.toFixed(2) : '',
        Number.isFinite(pair.a.sd) ? pair.a.sd.toFixed(2) : '',
        pair.a.user || '',
        at(pair.b.at),
        pair.b.races,
        Number.isFinite(pair.b.mean) ? pair.b.mean.toFixed(2) : '',
        Number.isFinite(pair.b.sd) ? pair.b.sd.toFixed(2) : '',
        pair.b.user || '',
        pair.diff.toFixed(2),
        LIVE_DRIFT_LIMIT.toFixed(2),
      ],
    ];
    return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  function downloadLiveCompareCsv() {
    const pair = livePickPair();
    if (!pair) {
      log('Live passes: choose A and B before exporting the comparison.');
      return;
    }
    const csv = liveCompareCsv(pair);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const name = `live-compare-${stamp}.csv`;
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.style.display = 'none';
      (document.body || document.documentElement).appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      log(`Live passes: A/B comparison exported to ${name} (B − A = ${signedPts(pair.diff)} pts).`);
    } catch (error) {
      log('Live passes: the browser refused the A/B CSV download.', error);
    }
  }

  // Rellena los dos selectores conservando la eleccion por fecha. La primera
  // vez (o al cambiar de archivo) arranca con las dos ultimas pasadas, que es
  // el mismo par que ya ensena la fila `last two`.
  function paintLivePickOptions(list) {
    if (!panel.refs || !panel.refs.livePickRow || !panel.refs.livePickA || !panel.refs.livePickB) return;
    const usable = (list || []).filter((pass) => pass && pass.at && Number.isFinite(pass.mean));
    if (usable.length < 2) {
      panel.refs.livePickRow.style.display = 'none';
      if (panel.refs.livePickExport) panel.refs.livePickExport.disabled = true;
      return;
    }
    panel.refs.livePickRow.style.display = 'grid';

    const accounts = new Set(usable.map((pass) => String(pass.user || '').trim()).filter(Boolean));
    const showAccount = accounts.size > 1;
    const values = new Set(usable.map((pass) => String(pass.at)));
    const previousA = panel.refs.livePickA.value;
    const previousB = panel.refs.livePickB.value;
    const fallbackA = String(usable[usable.length - 2].at);
    const fallbackB = String(usable[usable.length - 1].at);
    const targetA = values.has(previousA) ? previousA : fallbackA;
    const targetB = values.has(previousB) ? previousB : fallbackB;

    for (const select of [panel.refs.livePickA, panel.refs.livePickB]) {
      select.textContent = '';
      for (const pass of usable) {
        const option = document.createElement('option');
        option.value = String(pass.at);
        option.textContent = livePassLabel(pass, showAccount);
        select.appendChild(option);
      }
    }
    panel.refs.livePickA.value = targetA;
    panel.refs.livePickB.value = targetB;
    paintLivePick();
  }

  // Deriva de cada pasada contra la media de las que la preceden. Dos AVISOS
  // seguidos ya no son una carrera rara: son el modelo separandose en dos
  // tandas. Devuelve null si no hay al menos dos seguidas fuera de la banda.
  function liveDriftStreak() {
    const list = livePasses.slice(-10).filter((item) => Number.isFinite(item.mean));
    const drifts = [];

    for (let i = list.length - 1; i >= 1; i--) {
      let sum = 0;
      for (let j = 0; j < i; j++) sum += list[j].mean;
      const drift = list[i].mean - sum / i;
      if (Math.abs(drift) <= LIVE_DRIFT_LIMIT) break;
      drifts.unshift({ at: list[i].at, drift });
    }

    return drifts.length >= 2 ? { count: drifts.length, drifts } : null;
  }
  let livePasses = (() => {
    try {
      const raw = JSON.parse(disk.get(LIVE_PASSES_KEY, '[]'));
      return Array.isArray(raw) ? raw.filter((item) => item && item.at).slice(-10) : [];
    } catch { return []; }
  })();

  // CSV con comillas (el usuario puede llevar coma) y CRLF. Devuelve solo las
  // filas que entiende; un archivo que no es el historico se ignora.
  function parseLiveCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];

    const head = rows.shift().map((name) => String(name).trim().toLowerCase());
    const at = head.indexOf('at');
    if (at < 0 || head.indexOf('races') < 0 || head.indexOf('deltas') < 0) return [];

    return rows
      .filter((cells) => cells[at])
      .map((cells) => {
        const get = (name) => {
          const index = head.indexOf(name);
          return index >= 0 ? cells[index] || '' : '';
        };
        return {
          at: get('at'),
          races: Number(get('races')) || 0,
          samples: Number(get('samples')) || 0,
          // Sin dato no es 0: un CSV viejo o recortado no puede pintarse como
          // "+0.00 pts" en el panel. NaN deja la fila sin media, como el resto
          // del panel ya espera (`Number.isFinite`).
          mean: get('mean_pts') === '' ? NaN : Number(get('mean_pts')),
          sd: get('sd_pts') === '' ? NaN : Number(get('sd_pts')),
          outside: Number(get('outside')) || 0,
          user: get('user').trim(),
          deltas: get('deltas').trim(),
        };
      })
      .slice(-10);
  }

  function renderLivePasses() {
    if (!panel.refs || !panel.refs.liveList) return;
    const list = livePasses.slice(-10);

    panel.refs.liveList.textContent = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'log-empty';
      empty.textContent = 'load the csv or the json to compare passes';
      panel.refs.liveList.appendChild(empty);
      setText(panel.refs.liveCount, 'none');
      if (panel.refs.liveDriftRow) panel.refs.liveDriftRow.style.display = 'none';
      if (panel.refs.liveCompareRow) panel.refs.liveCompareRow.style.display = 'none';
      if (panel.refs.livePickRow) panel.refs.livePickRow.style.display = 'none';
      if (panel.refs.liveStreakRow) panel.refs.liveStreakRow.style.display = 'none';
      if (panel.refs.liveSpreadRow) panel.refs.liveSpreadRow.style.display = 'none';
      if (panel.refs.livePickExport) panel.refs.livePickExport.disabled = true;
      return;
    }

    // Con una sola cuenta el nombre sobra; con varias, cada fila dice la suya.
    const accounts = new Set(list.map((pass) => String(pass.user || '').trim()).filter(Boolean));
    const showAccount = accounts.size > 1;

    for (const pass of [...list].reverse()) {
      const row = document.createElement('div');
      row.className = 'log-item';

      const at = document.createElement('i');
      at.textContent = String(pass.at).slice(5, 16).replace('T', ' ');

      const mid = document.createElement('span');
      const bits = [];
      if (showAccount) bits.push(String(pass.user || '').trim() || 'unknown');
      bits.push(`${pass.races} race${pass.races === 1 ? '' : 's'}`);
      if (Number.isFinite(pass.mean)) bits.push(`${pass.mean >= 0 ? '+' : ''}${pass.mean.toFixed(2)} pts`);
      if (Number.isFinite(pass.sd)) bits.push(`sd ${pass.sd.toFixed(2)}`);
      if (pass.outside) bits.push(`${pass.outside}/${pass.samples || '?'} outside`);
      mid.textContent = bits.join(' · ');
      if (pass.deltas) {
        const who = showAccount && pass.user ? `${pass.user} · ` : '';
        mid.title = `${who}model Δ: ${pass.deltas}`;
      }

      const val = document.createElement('b');
      val.textContent = pass.outside ? 'WARN' : 'ok';
      val.dataset.good = pass.outside ? '0' : '1';

      row.append(at, mid, val);
      panel.refs.liveList.appendChild(row);
    }

    setText(panel.refs.liveCount, accounts.size
      ? `${list.length} stored · ${accounts.size} account${accounts.size === 1 ? '' : 's'}`
      : `${list.length} stored`);

    // Deriva entre pasadas: la ultima contra la media de las anteriores. Se
    // compara en puntos de model Δ y no en carreras, porque es la unica cifra
    // comparable entre tandas de distinto tamano.
    const trend = liveDrift();
    if (panel.refs.liveDriftRow) {
      panel.refs.liveDriftRow.style.display = trend ? 'flex' : 'none';
      if (trend) {
        setText(panel.refs.liveDrift, `${signedPts(trend.drift)} pts vs ${signedPts(trend.avg)} avg`);
        setGood(panel.refs.liveDrift, Math.abs(trend.drift) <= LIVE_DRIFT_LIMIT);
        panel.refs.liveDriftRow.title = `Latest pass ${signedPts(trend.latest)} pts vs ${signedPts(trend.avg)} pts average`
          + ` of the previous ${trend.count} pass${trend.count === 1 ? '' : 'es'}`
          + ` · drift ${Math.abs(trend.drift).toFixed(2)} pts (band ±${LIVE_DRIFT_LIMIT})`;
      }
    }

    // Racha: dos o mas pasadas seguidas que se salieron de la banda contra la
    // media anterior. Es distinto de una pasada suelta descentrada.
    const streak = liveDriftStreak();
    if (panel.refs.liveStreakRow) {
      panel.refs.liveStreakRow.style.display = streak ? 'flex' : 'none';
      if (streak) {
        setText(panel.refs.liveStreak, streak.count >= 3
          ? `${streak.count} in a row · sustained`
          : `${streak.count} in a row`);
        setGood(panel.refs.liveStreak, false);
        panel.refs.liveStreakRow.title = `${streak.count} passes in a row are off the average before them`
          + ` (${streak.drifts.map((item) => signedPts(item.drift)).join(', ')} pts, band ±${LIVE_DRIFT_LIMIT})`
          + (streak.count >= 3
            ? '; sustained drift across three or more passes, check the model before the next block.'
            : '; the model is drifting, not one odd pass.');
      }
    }

    // Dispersion del ultimo bloque de 10+ carreras. Se enciende solo si la sd
    // supera 0.10; una sd baja no ocupa una fila que no hace falta.
    const spread = liveSpreadBlock();
    if (panel.refs.liveSpreadRow) {
      const high = Boolean(spread && spread.sd > LIVE_SPREAD_LIMIT);
      panel.refs.liveSpreadRow.style.display = high ? 'flex' : 'none';
      if (high) {
        setText(panel.refs.liveSpread, `sd ${spread.sd.toFixed(2)} · ${spread.races} races`);
        setGood(panel.refs.liveSpread, false);
        panel.refs.liveSpreadRow.title = `Latest ${spread.races}-race block: sd ${spread.sd.toFixed(2)} pts > ${LIVE_SPREAD_LIMIT.toFixed(2)}`
          + ' · the block is too scattered';
      }
    }

    // Comparador de dos pasadas: no es una media movil, son las dos ultimas
    // sesiones con su fecha. La flecha dice hacia donde se movio el modelo.
    const pair = liveCompare();
    if (panel.refs.liveCompareRow) {
      panel.refs.liveCompareRow.style.display = pair ? 'flex' : 'none';
      if (pair) {
        setText(panel.refs.liveCompare,
          `${signedPts(pair.previous.mean)} → ${signedPts(pair.latest.mean)} · ${signedPts(pair.diff)} pts`);
        setGood(panel.refs.liveCompare, Math.abs(pair.diff) <= LIVE_DRIFT_LIMIT);
        panel.refs.liveCompareRow.title =
          `${String(pair.previous.at).slice(0, 16).replace('T', ' ')} ${signedPts(pair.previous.mean)} pts`
          + ` → ${String(pair.latest.at).slice(0, 16).replace('T', ' ')} ${signedPts(pair.latest.mean)} pts`
          + ` · ${Math.abs(pair.diff).toFixed(2)} pts move (band ±${LIVE_DRIFT_LIMIT})`;
      }
    }

    paintLivePickOptions(list);
  }

  // El `live-history.json` que escribe `npm run live` trae las pasadas ya
  // parseadas en `passes`. Se aceptan las dos formas: el CSV completo o el
  // informe corto (las ultimas cinco) que deja la pasada.
  function parseLiveJson(text) {
    let payload;
    try { payload = JSON.parse(text); } catch { return []; }
    const list = payload && Array.isArray(payload.passes) ? payload.passes : [];

    return list
      .filter((item) => item && item.at && Number.isFinite(Number(item.mean)))
      .map((item) => ({
        at: String(item.at),
        races: Number(item.races) || 0,
        samples: Number(item.samples) || 0,
        mean: Number(item.mean),
        // Mismo contrato que el CSV: sin sd no hay dispersion que ensenar; un
        // `0.00` fingido se leeria como una pasada perfectamente estable.
        sd: item.sd === null || item.sd === undefined || item.sd === '' ? NaN : Number(item.sd),
        outside: Number(item.outside) || 0,
        user: String(item.user || '').trim(),
        deltas: Array.isArray(item.deltas)
          ? item.deltas.filter((value) => Number.isFinite(Number(value))).map((value) => signedPts(Number(value))).join(' ')
          : String(item.deltas || ''),
      }))
      .slice(-10);
  }

  function loadLiveCsv(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = text.trim().startsWith('{') ? parseLiveJson(text) : parseLiveCsv(text);
      if (!parsed.length) {
        log('Live passes: that file has no readable rows (expected the CSV or live-history.json from npm run live).');
        return;
      }
      livePasses = parsed;
      try { disk.set(LIVE_PASSES_KEY, JSON.stringify(livePasses)); } catch { /* almacenamiento bloqueado */ }
      renderLivePasses();
      log(`Live passes: ${livePasses.length} loaded from the CSV.`);

      const streak = liveDriftStreak();
      const trend = liveDrift();
      const spread = liveSpreadBlock();

      if (spread && spread.sd > LIVE_SPREAD_LIMIT) {
        log(`Live passes: the latest ${spread.races}-race block is too scattered`
          + ` (sd ${spread.sd.toFixed(2)} pts > ${LIVE_SPREAD_LIMIT.toFixed(2)}); check the block before adding more races.`);
      }

      if (streak) {
        log(`Live passes: ${streak.count} passes in a row are off the average before them`
          + ` (${streak.drifts.map((item) => signedPts(item.drift)).join(', ')} pts, band ±${LIVE_DRIFT_LIMIT})`
          + (streak.count >= 3
            ? '; sustained drift, check the model before the next block.'
            : '; the model is drifting, not just one odd pass.'));
      } else if (trend && Math.abs(trend.drift) > LIVE_DRIFT_LIMIT) {
        log(`Live passes: the latest pass is ${signedPts(trend.drift)} pts off the previous average`
          + ` (${signedPts(trend.latest)} vs ${signedPts(trend.avg)}, band ±${LIVE_DRIFT_LIMIT}); check the model.`);
      }
      // El aviso acaba de entrar en el anillo; se pinta ya en vez de esperar al
      // siguiente latido del panel.
      updatePanel();
    };
    reader.onerror = () => log('Live passes: the file could not be read.');
    reader.readAsText(file);
  }

  // Olvidar lo cargado no toca el CSV del disco: solo la copia del panel. El
  // selector se limpia para que volver a elegir el mismo archivo dispare change.
  function clearLivePasses() {
    livePasses = [];
    disk.remove(LIVE_PASSES_KEY);
    if (panel.refs && panel.refs.liveFile) panel.refs.liveFile.value = '';
    renderLivePasses();
    log('Live passes: cleared from the panel. The CSV on disk is untouched.');
    if (panel.refs && panel.refs.liveDriftRow) panel.refs.liveDriftRow.style.display = 'none';
    if (panel.refs && panel.refs.liveCompareRow) panel.refs.liveCompareRow.style.display = 'none';
    if (panel.refs && panel.refs.livePickRow) panel.refs.livePickRow.style.display = 'none';
    if (panel.refs && panel.refs.livePickExport) panel.refs.livePickExport.disabled = true;
    if (panel.refs && panel.refs.liveStreakRow) panel.refs.liveStreakRow.style.display = 'none';
    if (panel.refs && panel.refs.liveSpreadRow) panel.refs.liveSpreadRow.style.display = 'none';
  }

  // Las tandas cerradas tambien salen en CSV. El registro del panel y la tabla
  // de Alt+H sirven para mirar, pero para sumar una semana o comparar sesiones
  // hace falta una hoja de calculo. Se genera con los mismos datos que ya estan
  // guardados: esto no toca el estado ni abre nada.
  function exportSessionsCsv() {
    const days = dayHistoryRead();
    if (!tandaLog.length && !days.length) {
      setConfigNote('Nothing to export yet: no closed sessions and no days recorded.');
      return;
    }

    // Comillas solo cuando hacen falta; las de dentro, dobladas. El motivo de
    // cierre es texto libre y puede traer comas.
    const csvCell = (value) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    // Una sola tabla con `kind` delante: primero las sesiones cerradas y debajo
    // el resumen de cada dia del historico. Comparten las columnas que tienen
    // sentido en ambos; las que no (precision en un dia, cajas en una sesion)
    // van vacias en vez de inventar un cero.
    const rows = [['kind', 'at', 'races', 'wpm', 'target_wpm', 'deviation_pct', 'accuracy_pct', 'dq', 'boxes', 'xp', 'reason']];

    for (const item of tandaLog) {
      const deviation = Number.isFinite(item.wpm) && Number.isFinite(item.target) && item.target > 0
        ? (((item.wpm - item.target) / item.target) * 100).toFixed(2)
        : '';

      rows.push([
        'session',
        new Date(item.at).toISOString(),
        item.races,
        Number.isFinite(item.wpm) ? item.wpm.toFixed(2) : '',
        Number.isFinite(item.target) ? item.target.toFixed(2) : '',
        deviation,
        Number.isFinite(item.acc) ? item.acc.toFixed(2) : '',
        item.dq | 0,
        '',
        Number.isFinite(item.xp) ? Math.max(0, Math.round(item.xp)) : '',
        item.reason || '',
      ]);
    }

    for (const day of days) {
      const wpm = day.races > 0 ? day.sumWpm / day.races : null;
      const target = day.races > 0 ? day.sumTarget / day.races : null;
      const deviation = wpm !== null && target > 0
        ? (((wpm - target) / target) * 100).toFixed(2)
        : '';

      rows.push([
        'day',
        day.date,
        day.races,
        wpm === null ? '' : wpm.toFixed(2),
        target === null ? '' : target.toFixed(2),
        deviation,
        '',
        day.dq | 0,
        day.boxes | 0,
        Math.max(0, Math.round(day.xp || 0)),
        '',
      ]);
    }

    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const stamp = todayKey().replace(/-/g, '');

    try {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `nitrotype-history-${stamp}.csv`;
      link.style.display = 'none';
      (document.body || document.documentElement).appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);

      const bits = [];
      if (tandaLog.length) bits.push(`${tandaLog.length} closed session${tandaLog.length === 1 ? '' : 's'}`);
      if (days.length) bits.push(`${days.length} day${days.length === 1 ? '' : 's'}`);
      setConfigNote(`Exported ${bits.join(' + ')}.`);
      log(`History exported to CSV: ${bits.join(' + ')} in ${rows.length - 1} rows.`);
    } catch (error) {
      setConfigNote('The browser refused the download: the numbers are still in Alt+H.');
      log('CSV export failed:', error);
    }
  }

  /* ==========================================================================
   * 4. FINDING THE TYPING COMPONENT (REACT)
   * ========================================================================== */
  const FIBER_KEY = /^__reactFiber\$/;
  const PROPS_KEY = /^__reactProps\$/;

  function getFiber(node) {
    if (!node) return null;
    const key = Object.keys(node).find((name) => FIBER_KEY.test(name));
    return key ? node[key] : null;
  }

  function isTypingNode(node) {
    return Boolean(
      node
      && typeof node.handleKeyPress === 'function'
      && node.props
      && node.props.lessonContent != null
    );
  }

  function findTypingApp() {
    const container = document.querySelector('div.dash-copyContainer')
      || document.querySelector('[class*="copyContainer"]');
    if (!container) return null;

    // 1) Subir por el arbol de React hasta el componente que sabe escribir.
    //    Es estable entre versiones, a diferencia de Object.values(...)[1].
    let fiber = getFiber(container);
    let depth = 0;
    while (fiber && depth++ < 80) {
      if (isTypingNode(fiber.stateNode)) return fiber.stateNode;
      fiber = fiber.return;
    }

    // 2) Compatibilidad con scripts antiguos: props.children._owner.stateNode.
    for (const key of Object.keys(container)) {
      if (!PROPS_KEY.test(key)) continue;
      const props = container[key];
      const owner = props && props.children && props.children._owner;
      if (owner && isTypingNode(owner.stateNode)) return owner.stateNode;
    }

    return null;
  }

  function getContent(app) {
    const raw = app && app.props && app.props.lessonContent;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return raw.join('');
    return '';
  }

  function getIndex(app) {
    if (!app) return -1;
    if (typeof app.typedIndex === 'number') return app.typedIndex;
    if (app.state && typeof app.state.typedIndex === 'number') return app.state.typedIndex;
    if (app.props && typeof app.props.typedIndex === 'number') return app.props.typedIndex;
    return -1;
  }

  function press(app, key) {
    const event = new KeyboardEvent('keypress', {
      key,
      bubbles: true,
      cancelable: true,
    });

    try {
      app.handleKeyPress('character', event);
      return true;
    } catch {
      /* segundo intento con objeto plano */
    }

    try {
      app.handleKeyPress('character', { key });
      return true;
    } catch {
      return false;
    }
  }

  async function waitForIndexChange(app, before, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (getIndex(app) !== before) return true;
      await preciseSleep(30);
    }
    return false;
  }

  function isVisible(el) {
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    if (el.closest('[hidden], [aria-hidden="true"]')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  // Texto de los modales visibles, con el mismo criterio que `innerText` (lo
  // oculto no cuenta) pero sin recorrer el body entero. Los textos de DQ y de
  // "currently in a race" los pinta el juego dentro de `.modal`; la captcha
  // sigue leyendo `innerText` porque su frase no consta en el bundle.
  function modalText(root = document) {
    const doc = root || document;
    const view = doc.defaultView || window;
    const texts = [];
    const seen = new Set();

    for (const modal of doc.querySelectorAll('.modal, [role="dialog"], [role="alertdialog"]')) {
      if (seen.has(modal)) continue;
      seen.add(modal);
      if (modal.closest('[hidden], [aria-hidden="true"]')) continue;
      const style = view.getComputedStyle(modal);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = modal.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const text = normalize(modal.innerText);
      if (text) texts.push(text);
    }

    return texts.join(' ');
  }

  function clickByText(patterns) {
    const nodes = document.querySelectorAll('button, a, [role="button"]');
    for (const el of nodes) {
      const label = normalize(el.textContent);
      if (!label) continue;
      if (!patterns.some((pattern) => label === pattern)) continue;
      if (!isVisible(el)) continue;
      el.click();
      return true;
    }
    return false;
  }

  /* --------------------------------------------------------------------------
   * CAPTCHA RESUELTO -> CONTINUE
   * --------------------------------------------------------------------------
   * El modal de verificacion del juego (bundle ra) pinta, al quedar validado:
   *
   *   <div class="tc-i">Validated!  Play on.</div>
   *   <button class="btn btn--primary btn--fw">Continue</button>
   *
   * y ese Continue llama a window.__reloadPage(). Sin pulsarlo el bot se queda
   * mirando el modal aunque el captcha ya este resuelto (por el usuario o por
   * una extension que lo resuelve solo).
   *
   * Se comprueba en los dos documentos posibles: la carrera (iframe) y la
   * ventana de arriba. El clic lleva enfriamiento porque el boton recarga la
   * app y, si esa recarga no ocurre, no queremos martillearlo.
   * -------------------------------------------------------------------------- */
  let captchaContinueAt = 0;
  let captchaContinueScanAt = 0;

  // Ultima vez que se vio el modal de descalificacion. Lo refresca un vigilante
  // cada segundo (leer innerText es caro para hacerlo en cada tecla).
  let dqSeenAt = 0;
  let dqBlockedNoted = false;
  // Ultima vez que el vigilante vio el aviso de conexion del servidor de la
  // carrera y ultima salida por el garaje. El aviso lo pinta el juego dentro
  // del marco, asi que se marca aqui y el bucle de carrera lo lee sin volver a
  // mirar el DOM en cada tecla.
  let connErrorSeenAt = 0;
  let lastConnExitAt = 0;

  function clickCaptchaContinue(doc) {
    const target = doc || document;
    const now = Date.now();
    if (!target || now - captchaContinueAt < 4000) return false;
    // El modal no cambia de un latido a otro: una lectura por segundo basta y
    // deja libre el hilo para las teclas. El clic mantiene su enfriamiento de 4 s.
    if (now - captchaContinueScanAt < 1000) return false;
    captchaContinueScanAt = now;
    perfCounters.captchaUiScans += 1;

    let validated = false;
    for (const el of target.querySelectorAll('.tc-i')) {
      if (/validated/i.test(el.textContent || '')) {
        validated = true;
        break;
      }
    }
    if (!validated) return false;

    for (const el of target.querySelectorAll('button, a, [role="button"]')) {
      if (normalize(el.textContent) !== 'continue') continue;
      if (!isVisible(el)) continue;

      captchaContinueAt = Date.now();
      log('CAPTCHA validated: pressing Continue to move on.');
      el.click();
      return true;
    }
    return false;
  }

  /* --------------------------------------------------------------------------
   * AVISO DE SESION ("Logout Warning") -> «Yes, I'm here!»
   * --------------------------------------------------------------------------
   * Cuando la sesion esta a punto de caducar, la app pinta un modal con:
   *
   *   <h3 class="mbxs">Logout Warning</h3>
   *   <p class="mbf">Your session will expire soon. Do you want to stay logged in?</p>
   *   <button type="button" class="btn btn--light btn--thin">Yes, I'm here!</button>
   *
   * y ese boton hace boton.remove() + window.__reloadPage(): quita el modal y
   * RECARGA la app, que es lo que renueva la sesion. Sin pulsarlo, la sesion
   * caduca de verdad y el bot acaba en /login a medias de la tanda (eso corto
   * una sesion de 30 carreras).
   *
   * El aviso puede salir tanto en la carrera (iframe) como en la ventana de
   * arriba, asi que se buscan los dos documentos. El clic se hace en cuanto
   * aparece y no al terminar la carrera: la recarga aborta la carrera en curso,
   * pero esperar solo cambiaria una DQ por un cierre de sesion, que es peor.
   * El enfriamiento vive en window.top para que las dos instancias del script
   * no pulsen el mismo boton a la vez.
   * -------------------------------------------------------------------------- */
  let sessionKickAt = 0;
  let sessionKickTimer = null;

  // Documentos donde puede aparecer el aviso: el propio, la ventana de arriba
  // (misma origen) y los iframes accesibles.
  function candidateDocs() {
    const docs = [];
    const push = (doc) => {
      if (doc && doc.body && !docs.includes(doc)) docs.push(doc);
    };
    push(document);
    try { push(window.top && window.top.document); } catch { /* otro origen */ }
    for (const frame of document.querySelectorAll('iframe')) {
      try { push(frame.contentDocument); } catch { /* otro origen */ }
    }
    return docs;
  }

  function findSessionWarningButton(doc) {
    if (!doc) return null;

    for (const el of doc.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')) {
      // El boton real puede ser un <input> (el texto vive en `value`) y el
      // apostrofo puede ser tipografico (’): normalize no lo convierte, y sin
      // esto el aviso se quedaba sin pulsar y la sesion caducaba.
      const raw = el.tagName === 'INPUT' ? (el.value || '') : (el.textContent || '');
      const label = normalize(raw).replace(/[\u2018\u2019\u02bc]/g, "'");
      if (!label) continue;
      if (el.disabled === true || el.getAttribute('aria-disabled') === 'true') continue;

      // El texto exacto del sitio es "Yes, I'm here!", pero el boton se busca
      // tambien por el contexto del aviso: si le cambian una coma o el signo,
      // no puede quedarse sin pulsar. El contexto se mira en el modal y, si no
      // hay .modal, en los contenedores cercanos: nunca en todo el body, que
      // este latido pasa cada 500 ms.
      const looksRight = /^yes,?\s*i'?m here!?$/.test(label) || /stay (logged|signed) in/.test(label);
      let inWarning = false;
      if (!looksRight) {
        let scope = el.closest ? el.closest('.modal') : null;
        if (!scope) {
          scope = el;
          for (let i = 0; i < 4 && scope.parentElement; i++) scope = scope.parentElement;
        }
        const context = normalize((scope && scope.textContent) || '');
        inWarning = /logout warning|session will expire|stay logged in/.test(context);
      }
      // El fallback por contexto no puede aceptar un "Continue" cualquiera:
      // exige que el boton siga nombrando el "here" o el "stay logged in".
      const contextual = inWarning
        && (/^yes\b.*\bhere\b/.test(label) || /^stay (logged|signed) in\b/.test(label));
      if (!looksRight && !contextual) continue;

      if (isVisible(el)) return el;
    }
    return null;
  }

  // Gancho inerte del banco: resuelve el boton sin esperar al latido.
  window.__ntaDebug = window.__ntaDebug || {};
  window.__ntaDebug.sessionWarningButton = (doc) => findSessionWarningButton(doc || document);

  // Enfriamiento compartido entre la ventana de arriba y el iframe: el aviso es
  // uno solo, y no queremos dos clics (ni dos recargas) a la vez.
  // El enfriamiento vive siempre en window.top para que lo vean las dos
  // instancias (la de la carrera y la de la ventana de arriba): la marca se
  // escribe y se lee en el mismo sitio, sin depender de quien pulso.
  function sessionKickFresh() {
    const now = Date.now();
    if (now - sessionKickAt < CONFIG.queue.sessionKickCooldownMs) return false;
    try {
      const shared = window.top.__ntaSessionKickAt;
      if (shared && now - shared < CONFIG.queue.sessionKickCooldownMs) return false;
    } catch { /* otro origen */ }
    return true;
  }

  function markSessionKick() {
    sessionKickAt = Date.now();
    try { window.top.__ntaSessionKickAt = sessionKickAt; } catch { /* otro origen */ }
  }

  // Si el aviso desaparece antes del clic, la marca compartida no puede quedarse
  // 15 s bloqueando un aviso nuevo: las dos instancias volverian a mirar y la
  // sesion seguiria cayendose sin que nadie pulse.
  function clearSessionKick() {
    sessionKickAt = 0;
    try { window.top.__ntaSessionKickAt = 0; } catch { /* otro origen */ }
  }

  // Devuelve true si el aviso esta en pantalla (lo haya pulsado o no): mientras
  // se ve, la cola no debe navegar ni abrir carreras por detras.
  let sessionWarningScanAt = 0;

  function handleSessionWarning(force = false) {
    // El aviso espera a que lo veas: escanearlo dos veces por segundo era mas
    // caro que util. Con una carrera viva baja a 1,5 s; parado, a 1 s.
    const now = Date.now();
    const every = typerIsTyping() ? 1500 : 1000;
    if (!force && now - sessionWarningScanAt < every) return false;
    sessionWarningScanAt = now;
    perfCounters.warningScans += 1;

    for (const doc of candidateDocs()) {
      const button = findSessionWarningButton(doc);
      if (!button) continue;

      if (sessionKickTimer || !sessionKickFresh()) return true;

      markSessionKick();
      const delay = randInt(CONFIG.queue.sessionKickDelayMs[0], CONFIG.queue.sessionKickDelayMs[1]);
      const fromTop = doc !== document;

      sessionKickTimer = later(() => {
        sessionKickTimer = null;
        if (!button.isConnected) {
          // El aviso desaparecio solo (o lo pulso la otra instancia): se libera
          // el enfriamiento local y el compartido por si vuelve a salir.
          clearSessionKick();
          return;
        }
        log(`Session warning: pressing «Yes, I'm here!»${fromTop ? ' (top window)' : ''}; the app reloads and the session is renewed.`);
        button.click();
      }, delay);

      log(`Session warning ("Logout Warning"): pressing it in ${(delay / 1000).toFixed(1)}s.`);
      return true;
    }
    return false;
  }

  // Ganchos inertes del banco: programar el aviso sin esperar al latido y ver
  // el enfriamiento local/compartido.
  window.__ntaDebug = window.__ntaDebug || {};
  window.__ntaDebug.sessionWarningHandle = () => handleSessionWarning(true);
  window.__ntaDebug.sessionKick = () => {
    let shared = 0;
    try { shared = Number(window.top.__ntaSessionKickAt) || 0; } catch { /* otro origen */ }
    return { local: sessionKickAt, shared, pending: Boolean(sessionKickTimer) };
  };
  window.__ntaDebug.sessionKickReset = () => {
    if (sessionKickTimer) {
      clearLater(sessionKickTimer);
      sessionKickTimer = null;
    }
    clearSessionKick();
    return window.__ntaDebug.sessionKick();
  };

  // The queue (top window) has no panel: it leaves its notices in localStorage and
  // the typer paints them on boot, so an automatic re-login shows up in the race
  // panel without opening the console.
  function flushQueueNotice() {
    const raw = disk.get('ntQueue:notice');
    if (!raw) return;

    disk.remove('ntQueue:notice');
    try {
      const notice = JSON.parse(raw);
      if (notice && notice.text && Date.now() - notice.at < 600000) log(notice.text);
    } catch { /* aviso corrupto: se ignora */ }
  }

  /* ==========================================================================
   * 5. STATE
   * ========================================================================== */
  const session = {
    // Fijo: no existe otro modo. Cualquier valor viejo que quede en disco se
    // ignora, y nada vuelve a escribirlo.
    mode: MODE,
    // Fijo: no hay ritmo alternativo que restaurar (5.0.0).
    pace: PACE_LEGIT,
    running: false,
    stopped: false,
    paused: false,
    stopAfterRace: false, // parada pedida en carrera: se termina antes de parar
    stopManual: false,    // la parada la pidio el usuario, no el guardia
    capLogged: false,     // ya se aviso del recorte del gobernador en esta carrera
    capMaxWait: 0,        // mayor recorte del gobernador en la carrera (diagnostico)
    pauseEndsAt: 0,       // fin de la pausa en carrera (cuenta atras del panel)
    typing: false,
    chars: 0,
    pos: 0,              // letras aceptadas de la carrera (indice de React)
    total: 0,            // letras de la leccion: para la barra de progreso
    correct: 0,
    startedAt: 0,
    endedAt: 0,          // congelado al cerrar la carrera: el reloj no sigue
    lastErrorAt: 0,
    lastLogAt: 0,
    // Estado del reloj de carrera; resetRaceState los vuelve a cero, pero
    // updatePanel puede pintar antes y no debe encontrarse undefined.
    clockSamples: [],
    clockDone: false,
    clockShiftAt: 0,     // ultimo ajuste de startedAt (el gobernador lo mira)
    lastHudWpm: 0,
    lastProgress: null,
    dqStreak: 0,         // descalificaciones seguidas (se reinicia al terminar una)
    carefulRaces: 0,     // carreras que se escriben mas despacio tras un susto
    nitroTries: 0,
    nitroDone: false,
    nitroChars: 0,       // caracteres que el nitro regalo (no los tecleo esta copia)
    nitroWords: 0,       // palabras que el nitro completo en esta carrera (0 o 1)
    nitroRaces: 0,       // carreras de la tanda en las que se gasto el nitro
    nitroCharsTotal: 0,  // caracteres regalados por el nitro en toda la tanda
    nitroSpread: 0,      // ms extra por tecla para pagar esos caracteres sin frenar de golpe
    races: 0,            // carreras cerradas desde que se cargo la pagina
    // 10 cortaba justo antes del bonus de sesion y 20 dejaba la tanda a cinco
    // carreras del techo (250 XP en la 25): las dos preferencias viejas suben
    // a 25, que es el primer tope que cobra el bonus entero.
    raceLimit: (() => {
      const raw = clamp(parseInt(disk.get(KEYS.raceLimit), 10) || CONFIG.raceLimit, 0, 500);
      if (raw === 10 || raw === 20) {
        disk.set(KEYS.raceLimit, '25');
        return 25;
      }
      return raw;
    })(),
    timeLimit: clamp(parseInt(disk.get(KEYS.timeLimit), 10) || CONFIG.timeLimit, 0, 1440),
    xpLimit: clamp(parseInt(disk.get(KEYS.xpLimit), 10) || CONFIG.xpLimit, 0, 1000000),
    // Presupuesto del dia: no reinicia con la tanda, se apoya en el resumen
    // real de hoy (todayRead), que cambia solo al cambiar la fecha.
    dailyRaceLimit: clamp(parseInt(disk.get(KEYS.dailyRaceLimit), 10) || 0, 0, 2000),
    dailyXpLimit: clamp(parseInt(disk.get(KEYS.dailyXpLimit), 10) || 0, 0, 10000000),
    // Ventana de horas activas. Apagada de fabrica: el bot sigue como siempre
    // hasta que la enciendas. `start === end` significa todo el dia.
    activeOn: disk.get(KEYS.activeOn) === '1',
    activeStart: (() => {
      const n = parseInt(disk.get(KEYS.activeStart), 10);
      return Number.isFinite(n) ? clamp(n, 0, 23) : 8;
    })(),
    activeEnd: (() => {
      const n = parseInt(disk.get(KEYS.activeEnd), 10);
      return Number.isFinite(n) ? clamp(n, 0, 23) : 23;
    })(),
    xp: 0,               // XP que ha pagado el juego en esta tanda
    tandaStartedAt: 0,   // arranque de la tanda (reloj del tope por tiempo)
    sumRaces: 0,         // carreras que han aportado a los acumulados
    sumWpm: 0,           // acumulados de la tanda para el resumen de cierre
    sumTarget: 0,
    sumAcc: 0,
    // Aportacion de cada carrera a sumWpm, con su marca de tiempo: el WPM
    // oficial puede llegar tras una recarga o con la carrera siguiente ya
    // registrada, y el acumulador debe corregir la fila que le toca, no la
    // ultima que se haya apuntado.
    sumWpmLedger: [],
    dqCount: 0,          // DQ de toda la tanda (dqStreak solo cuenta las seguidas)
    closed: false,       // la tanda ya cerro: la siguiente A abre una nueva
    errors: 0,           // fallos cometidos en la carrera actual
    errorBudget: 0,      // fallos que admite esta carrera para clavar el objetivo
    trim: clamp(parseFloat(disk.get(KEYS.trim)) || 1, 0.9, 1.1),
    // La correccion de ritmo se cierra con el WPM del modelo. El oficial de esa
    // misma carrera puede llegar despues: se guarda de donde se partio para
    // recalcularla, no para apilar una segunda correccion sobre la primera.
    trimAt: 0,           // `at` de la carrera cuyo trim se calibro
    trimBase: 0,         // trim antes de esa correccion
    trimApplied: 0,      // trim que dejo (si sigue igual, el oficial puede pisarla)
    trimTarget: 0,       // objetivo de esa carrera: la serie avanza antes del paquete
    blockRaces: 0,       // carreras desde el ultimo descanso
    blockTarget: 0,      // cuantas tocan hasta el siguiente (se sortea)
    breakUntil: 0,       // fin del descanso en curso (0 = ninguno)
    lastStartAt: 0,      // arranque de la ultima carrera medida (para medir el ciclo)
    lastEndAt: 0,        // fin de la ultima carrera (para medir el hueco hasta la siguiente)
    gapSamples: [],      // huecos normales de la tanda en ms (ultimos 20)
    sumCycleMs: 0,       // suma de los ciclos normales de la tanda
    cycleCount: 0,       // cuantos ciclos entran en esa media
    breaksTaken: 0,      // descansos tomados en la tanda (para estimar los que faltan)
  };

  // Session limit: only measured races count towards it, never a DQ. The time
  // limit is checked between races, never mid-race: the loop asks before it
  // opens one, and a live race always finishes (leaving it is a DQ).
  const timeLimitLeft = () => {
    if (!session.timeLimit) return null;
    if (!session.tandaStartedAt) return session.timeLimit * 60000;
    return Math.max(0, session.tandaStartedAt + session.timeLimit * 60000 - Date.now());
  };

  // Presupuesto del dia: carreras y XP reales de hoy. El override solo lo usa
  // el banco para probar los bordes sin mover el resumen del dia.
  let dailyCountsOverride = null;
  function dailyCaps() {
    const day = dailyCountsOverride || todayRead();
    const races = Math.max(0, Number(day.races) || 0);
    const xp = Math.max(0, Number(day.xp) || 0);
    const raceCap = Math.max(0, Number(session.dailyRaceLimit) || 0);
    const xpCap = Math.max(0, Number(session.dailyXpLimit) || 0);
    return {
      races,
      xp,
      raceCap,
      xpCap,
      raceHit: raceCap > 0 && races >= raceCap,
      xpHit: xpCap > 0 && xp >= xpCap,
      warn: (raceCap > 0 && races >= raceCap * 0.8)
        || (xpCap > 0 && xp >= xpCap * 0.8),
    };
  }

  const dailyLimitReached = () => {
    const daily = dailyCaps();
    return daily.raceHit || daily.xpHit;
  };

  /* --------------------------------------------------------------------------
   * Ventana de horas activas
   * ------------------------------------------------------------------------ */
  // Hora local del navegador. Admite cruzar medianoche (22:00–02:00); con
  // start === end la ventana es todo el dia, y apagada no limita nada.
  const padHour = (hour) => `${String(hour).padStart(2, '0')}:00`;

  function activeWindowAt(settings, at = Date.now()) {
    const on = Boolean(settings && settings.on);
    const start = clamp((settings && settings.start) | 0, 0, 23);
    const end = clamp((settings && settings.end) | 0, 0, 23);
    const startText = padHour(start);
    const endText = padHour(end);
    const allDay = start === end;
    const date = new Date(at);
    const startAt = new Date(at);
    const endAt = new Date(at);
    startAt.setHours(start, 0, 0, 0);
    endAt.setHours(end, 0, 0, 0);

    const nextStart = () => {
      const next = new Date(startAt);
      if (next.getTime() <= at) next.setDate(next.getDate() + 1);
      return next;
    };
    const nextEnd = () => {
      const next = new Date(endAt);
      if (next.getTime() <= at) next.setDate(next.getDate() + 1);
      return next;
    };

    if (!on || allDay) {
      return {
        on, start, end, startText, endText, allDay: true, open: true,
        nextAt: 0, closesAt: 0, nextText: startText, closesText: endText,
        msUntilOpen: 0, msUntilClose: 0,
      };
    }

    let open = false;
    let nextAt = 0;
    let closesAt = 0;

    if (start < end) {
      open = date >= startAt && date < endAt;
      if (open) closesAt = endAt.getTime();
      else nextAt = date < startAt ? startAt.getTime() : nextStart().getTime();
    } else {
      // Cruza medianoche: abierta desde start hasta las 24:00 y desde las
      // 00:00 hasta end. Cerrada en el hueco entre end y start.
      open = date >= startAt || date < endAt;
      if (open) closesAt = date < endAt ? endAt.getTime() : nextEnd().getTime();
      else nextAt = startAt.getTime();
    }

    return {
      on, start, end, startText, endText, allDay, open,
      nextAt, closesAt, nextText: startText, closesText: endText,
      msUntilOpen: nextAt ? Math.max(0, nextAt - at) : 0,
      msUntilClose: closesAt ? Math.max(0, closesAt - at) : 0,
    };
  }

  function activeWindow(at = Date.now()) {
    return activeWindowAt({
      on: session.activeOn,
      start: session.activeStart,
      end: session.activeEnd,
    }, at);
  }

  function gateFromActiveWindow(win) {
    if (!win || !win.on || win.open) return null;
    return {
      key: 'hours',
      label: `hours ${win.startText}–${win.endText}`,
      left: win.msUntilOpen,
      nextText: win.startText,
      reason: `active hours ${win.startText}–${win.endText}; opens at ${win.startText}`,
    };
  }

  const activeGate = (at = Date.now()) => gateFromActiveWindow(activeWindow(at));

  function activeLeftText(ms) {
    const minutes = Math.max(0, Math.ceil(ms / 60000));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${String(rest).padStart(2, '0')}m`;
    return `${rest}m`;
  }

  let activeWaitNoted = false;
  let activeResumeTimer = 0;

  function scheduleActiveResume() {
    if (activeResumeTimer) return;
    const gate = activeGate();
    if (!gate) return;

    // later() usa el reloj del Worker cuando la pestana esta oculta: una
    // ventana que abre en dos horas se espera de una vez en vez de reprogramar
    // el setTimeout cada minuto (que ademas se clampa en segundo plano).
    activeResumeTimer = later(() => {
      activeResumeTimer = 0;
      if (activeGate()) {
        scheduleActiveResume();
        return;
      }
      if (session.stopped) {
        log('Active hours open; resuming.');
        resumeAuto();
      }
    }, Math.max(1000, gate.left + 500));
  }

  function setActiveOn(on, quiet = false) {
    const next = on === true;
    if (next === session.activeOn) return;

    session.activeOn = next;
    disk.set(KEYS.activeOn, next ? '1' : '0');
    if (!next && activeResumeTimer) {
      clearLater(activeResumeTimer);
      activeResumeTimer = 0;
    }
    if (!quiet) {
      log(next
        ? `Active hours on: ${padHour(session.activeStart)}–${padHour(session.activeEnd)}.`
        : 'Active hours off: races can start at any time.');
    }
    updatePanel();
    if (next) scheduleActiveResume();
  }

  function setActiveHour(which, hour, quiet = false) {
    const next = clamp(hour | 0, 0, 23);
    const field = which === 'start' ? 'activeStart' : 'activeEnd';
    if (session[field] === next) return;

    session[field] = next;
    disk.set(which === 'start' ? KEYS.activeStart : KEYS.activeEnd, String(next));
    if (!quiet) log(`Active hours: ${padHour(session.activeStart)}–${padHour(session.activeEnd)}.`);
    updatePanel();
    if (session.activeOn) scheduleActiveResume();
  }

  const limitReached = () => (session.raceLimit > 0 && session.races >= session.raceLimit)
    || (session.timeLimit > 0 && session.tandaStartedAt > 0
      && Date.now() >= session.tandaStartedAt + session.timeLimit * 60000)
    || (session.xpLimit > 0 && session.xp >= session.xpLimit)
    || dailyLimitReached();

  // Texto corto para el tope por tiempo: "45m", "2h", "1h 30m".
  function limitMinutesText(minutes) {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    if (!value) return 'free';
    if (value < 60) return `${value}m`;
    return value % 60 === 0 ? `${value / 60}h` : `${Math.floor(value / 60)}h ${value % 60}m`;
  }

  // "38s", "12m", "1h 05m": lo que queda de reloj, sin decimales.
  function clockSpan(ms) {
    const seconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  }

  // "5k", "50k": el tope de XP, corto para la fila.
  function limitXpText(value) {
    const xp = Math.max(0, Math.round(Number(value) || 0));
    if (!xp) return 'free';
    if (xp < 1000) return String(xp);
    return `${(xp / 1000).toFixed(xp % 1000 === 0 ? 0 : 1)}k`;
  }

  // Averages of the running session, or null when no race has been measured yet.
  // Used by the closing summary and by the panel's session row.
  function tandaAverages() {
    if (session.sumRaces < 1 || session.sumWpm <= 0 || session.sumTarget <= 0) return null;

    const wpm = session.sumWpm / session.sumRaces;
    const target = session.sumTarget / session.sumRaces;
    const acc = session.sumAcc / session.sumRaces;
    if (!Number.isFinite(wpm) || !Number.isFinite(target) || !Number.isFinite(acc)) return null;
    return { wpm, target, acc };
  }

  // Session summary: real average against the average target, mean accuracy and
  // accumulated DQ. Built from the running totals, not from the visible list of a
  // few races.
  function tandaSummary() {
    const avg = tandaAverages();
    if (!avg) return '';

    const dev = ((avg.wpm - avg.target) / avg.target) * 100;
    const dq = session.dqCount > 0 ? ` · ${session.dqCount} DQ` : '';
    // Con presupuesto diario, el cierre dice como va el dia: es lo que decide
    // si la proxima tanda puede empezar o toca esperar a manana. Sin
    // presupuesto la linea queda como estaba.
    const daily = dailyCaps();
    // El prefijo va una sola vez: los dos topes son el mismo dia, no dos dias.
    const day = [
      daily.raceCap ? `${daily.races}/${daily.raceCap} races` : '',
      daily.xpCap
        ? `${Math.round(daily.xp).toLocaleString()}/${daily.xpCap.toLocaleString()} XP`
        : '',
    ].filter(Boolean).join(' · ');
    return `avg ${avg.wpm.toFixed(1)} WPM (${dev >= 0 ? '+' : ''}${dev.toFixed(1)}%) · ${avg.acc.toFixed(1)}%${dq}${day ? ` · today ${day}` : ''}`;
  }

  // Un hueco normal entre carreras son unos segundos; mas de 90 s es un
  // descanso, una pausa o una espera del guardia, y no dice nada del ritmo.
  const GAP_MAX_MS = 90000;
  const GAP_SAMPLES = 20;

  // Ciclo entre carreras: de un arranque al siguiente. Es lo que de verdad
  // consume una tanda (carrera + respiro hasta la siguiente) y no depende de
  // adivinar lo que tarda una leccion. Un ciclo con descanso dentro dura varias
  // veces mas y no representa nada, asi que no entra en la media.
  function noteRaceStart(at = Date.now()) {
    const previous = session.lastStartAt;
    if (previous > 0 && at > previous) {
      const cycle = at - previous;
      if (cycle <= CONFIG.eta.maxCycleMs) {
        session.sumCycleMs += cycle;
        session.cycleCount++;
      }
    }

    // Hueco real: del final de la carrera anterior al arranque de esta. Se
    // guarda aparte del ciclo porque el ciclo incluye la carrera entera; esto
    // es solo el tiempo muerto que se puede recortar sin tocar el WPM.
    if (session.lastEndAt > 0 && at > session.lastEndAt) {
      const gap = at - session.lastEndAt;
      if (gap <= GAP_MAX_MS) {
        session.gapSamples.push(gap);
        if (session.gapSamples.length > GAP_SAMPLES) session.gapSamples.shift();
      }
    }
    // Se consume: una carrera no puede aportar el mismo hueco dos veces si el
    // arranque se anuncia por mas de un camino (pestana, marco, reanudacion).
    session.lastEndAt = 0;
    session.lastStartAt = at;
    // El reloj del tope por tiempo arranca con la primera carrera de la tanda,
    // no al pulsar el boton: poner 30 min a mitad de tanda no puede cerrarla en
    // el acto, y una tanda que se retoma tras una recarga sigue contando.
    if (!session.tandaStartedAt) {
      session.tandaStartedAt = at;
      saveCounters();
    }
  }

  // Lo que queda de tanda con lo medido hasta ahora. Devuelve null cuando no hay
  // tope (sin final no hay nada que estimar) o cuando ya no queda nada.
  function etaRemaining() {
    if (!session.raceLimit) return null;

    const remaining = Math.max(0, session.raceLimit - session.races);
    if (remaining <= 0) return null;

    const measured = session.cycleCount > 0 && session.sumCycleMs > 0;
    const cycle = measured ? session.sumCycleMs / session.cycleCount : CONFIG.eta.fallbackCycleMs;
    let ms = remaining * cycle;

    // Descansos que quedan por delante: manda la media real de la tanda (cada
    // cuantas carreras para de verdad); sin datos, la cadencia configurada.
    let breaks = 0;
    if (CONFIG.breaks.enabled) {
      const perBreak = session.breaksTaken > 0
        ? session.races / session.breaksTaken
        : average(CONFIG.breaks.afterRaces);
      breaks = perBreak > 0 ? Math.floor(remaining / perBreak) : 0;
      const breakMs = (1 - CONFIG.breaks.longChance) * average(CONFIG.breaks.shortMs)
        + CONFIG.breaks.longChance * average(CONFIG.breaks.longMs);
      ms += breaks * breakMs;
    }

    return {
      remaining,
      breaks,
      measured,
      cycleMs: cycle,
      minutes: Math.max(1, Math.round(ms / 60000)),
    };
  }

  // Cuando salta el tope por XP con el ritmo medido: XP por carrera y lo que
  // falta en carreras y minutos. Sin carreras medidas no hay ritmo del que
  // tirar, asi que no se estima: mejor un guion que un numero inventado.
  function xpEta() {
    if (!session.xpLimit) return null;
    const left = Math.max(0, session.xpLimit - session.xp);
    if (left <= 0) return { left: 0, races: 0, minutes: 0, perRace: 0 };

    const perRace = session.races > 0 ? session.xp / session.races : 0;
    if (perRace <= 0) return { left, races: null, minutes: null, perRace };

    const races = Math.ceil(left / perRace);
    const cycle = session.cycleCount > 0 && session.sumCycleMs > 0
      ? session.sumCycleMs / session.cycleCount
      : CONFIG.eta.fallbackCycleMs;
    return { left, races, minutes: Math.max(1, Math.round((races * cycle) / 60000)), perRace };
  }

  // The limit is only the reason: panic() appends the session summary to any stop,
  // so there are never two different closing formats.
  function capReason() {
    const reasons = [];
    if (session.raceLimit > 0) {
      reasons.push(`limit ${session.raceLimit} ${session.raceLimit === 1 ? 'race' : 'races'}`);
    }
    if (session.timeLimit > 0) reasons.push(`time limit ${session.timeLimit} min`);
    if (session.xpLimit > 0) reasons.push(`xp limit ${session.xpLimit.toLocaleString()}`);
    const daily = dailyCaps();
    if (daily.raceHit) reasons.push(`daily limit ${daily.raceCap} races`);
    if (daily.xpHit) reasons.push(`daily XP limit ${daily.xpCap.toLocaleString()}`);
    return reasons.length ? reasons.join(' · ') : 'session limit';
  }

  // Momento de la ultima recarga que hizo este tipador por su cuenta. Vive en
  // localStorage porque justo despues de escribirla la pagina se recarga.
  const RELOAD_GUARD = 'ntQueue:typerReloadedAt';

  // Una recarga por ventana. Si "Race Again" no arranca tras dos intentos, lo
  // que suele haber es una pagina de resultados rota, y recargarla cada pocos
  // segundos no arregla nada: tapa el fallo y deja la pestana dando vueltas sin
  // que se vea por que. Lo que decide es lo que hay en disco, porque el propio
  // marcador se escribe justo antes de perder la memoria con la recarga.
  function mayReloadPage() {
    const last = Number(disk.get(RELOAD_GUARD, 0)) || 0;
    const now = Date.now();
    if (now - last < CONFIG.queue.reloadWindowMs) return false;

    disk.set(RELOAD_GUARD, String(now));
    return true;
  }

  // Session counters are stored in localStorage: the race app reloads on some
  // transitions (when "Race Again" does not start first try, or when Race Now is
  // pressed from the lobby) and without this the panel counter went back to zero
  // and breaks never fired.
  function loadCounters() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEYS.session) || 'null');
      if (!saved || !Number.isFinite(saved.at)) return null;
      if (Date.now() - saved.at > CONFIG.sessionResumeMs) {
        localStorage.removeItem(KEYS.session);
        return null;
      }
      return saved;
    } catch {
      return null;
    }
  }

  function saveCounters() {
    try {
      localStorage.setItem(KEYS.session, JSON.stringify({
        races: session.races,
        sumRaces: session.sumRaces,
        sumWpm: session.sumWpm,
        sumTarget: session.sumTarget,
        sumAcc: session.sumAcc,
        // Aportacion por carrera a la media: sobrevive a la recarga para que el
        // WPM oficial pueda corregirla cuando llegue despues de cambiar de
        // pagina, que es lo que hace la cola entre carrera y carrera.
        sumWpmLedger: session.sumWpmLedger.slice(-8),
        // La calibracion pendiente viaja con la tanda: el paquete oficial puede
        // llegar tras la recarga que hace la cola entre carrera y carrera.
        trimAt: session.trimAt,
        trimBase: session.trimBase,
        trimApplied: session.trimApplied,
        trimTarget: session.trimTarget,
        dqCount: session.dqCount,
        closed: session.closed === true,
        dqStreak: session.dqStreak,
        carefulRaces: session.carefulRaces,
        blockRaces: session.blockRaces,
        blockTarget: session.blockTarget,
        breakUntil: session.breakUntil,
        lastStartAt: session.lastStartAt,
        lastEndAt: session.lastEndAt,
        gapSamples: session.gapSamples.slice(-GAP_SAMPLES),
        sumCycleMs: session.sumCycleMs,
        cycleCount: session.cycleCount,
        breaksTaken: session.breaksTaken,
        tandaStartedAt: session.tandaStartedAt,
        xp: session.xp,
        nitroRaces: session.nitroRaces,
        nitroCharsTotal: session.nitroCharsTotal,
        // Tambien el presupuesto del dia: se guarda en sus claves propias, pero
        // la foto de la tanda debe llevarlo para que no haya dos verdades.
        dailyRaceLimit: session.dailyRaceLimit,
        dailyXpLimit: session.dailyXpLimit,
        at: Date.now(),
      }));
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  }

  // A pause survives a reload too: pause and let the app reload and the bot must
  // not start typing by itself. It is discarded after CONFIG.sessionResumeMs so
  // opening the page the next day does not start paused for no reason.
  function loadPaused() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEYS.paused) || 'null');
      if (!saved || saved.paused !== true || !Number.isFinite(saved.at)) return null;
      if (Date.now() - saved.at > CONFIG.sessionResumeMs) {
        localStorage.removeItem(KEYS.paused);
        return null;
      }
      return saved;
    } catch {
      return null;
    }
  }

  // Se reanuda la tanda anterior solo si es reciente: abrir la pagina al dia
  // siguiente no debe arrastrar los descansos de ayer.
  const resumedCounters = loadCounters();
  if (resumedCounters) {
    session.races = Math.max(0, resumedCounters.races | 0);
    session.sumRaces = Math.max(0, resumedCounters.sumRaces | 0);
    session.sumWpm = Math.max(0, Number(resumedCounters.sumWpm) || 0);
    session.sumTarget = Math.max(0, Number(resumedCounters.sumTarget) || 0);
    session.sumAcc = Math.max(0, Number(resumedCounters.sumAcc) || 0);
    session.sumWpmLedger = Array.isArray(resumedCounters.sumWpmLedger)
      ? resumedCounters.sumWpmLedger
        .filter((item) => item && Number.isFinite(Number(item.at)) && Number.isFinite(Number(item.wpm)))
        .map((item) => ({ at: Number(item.at), wpm: Number(item.wpm) }))
        .slice(-8)
      : [];
    const savedTrimAt = Number(resumedCounters.trimAt);
    const savedTrimBase = Number(resumedCounters.trimBase);
    const savedTrimApplied = Number(resumedCounters.trimApplied);
    const savedTrimTarget = Number(resumedCounters.trimTarget);
    if (savedTrimAt > 0 && savedTrimBase > 0 && savedTrimApplied > 0 && savedTrimTarget > 0
      && Number.isFinite(savedTrimAt) && Number.isFinite(savedTrimBase)
      && Number.isFinite(savedTrimApplied) && Number.isFinite(savedTrimTarget)) {
      session.trimAt = savedTrimAt;
      session.trimBase = savedTrimBase;
      session.trimApplied = savedTrimApplied;
      session.trimTarget = savedTrimTarget;
    }
    session.dqCount = Math.max(0, resumedCounters.dqCount | 0);
    session.closed = resumedCounters.closed === true;
    session.dqStreak = Math.max(0, resumedCounters.dqStreak | 0);
    session.carefulRaces = clamp(Number(resumedCounters.carefulRaces) || 0, 0, 5);
    session.blockRaces = Math.max(0, resumedCounters.blockRaces | 0);
    session.blockTarget = Math.max(0, resumedCounters.blockTarget | 0);
    if (resumedCounters.breakUntil > Date.now()) {
      session.breakUntil = resumedCounters.breakUntil;
    }
    // Los ciclos y los descansos de la tanda se retoman con ella: sin esto la
    // estimacion de lo que queda volveria a empezar en cada recarga del marco.
    session.lastStartAt = Math.max(0, Number(resumedCounters.lastStartAt) || 0);
    session.lastEndAt = Math.max(0, Number(resumedCounters.lastEndAt) || 0);
    session.gapSamples = Array.isArray(resumedCounters.gapSamples)
      ? resumedCounters.gapSamples
        .map(Number)
        .filter((ms) => Number.isFinite(ms) && ms > 0 && ms <= GAP_MAX_MS)
        .slice(-GAP_SAMPLES)
      : [];
    session.sumCycleMs = Math.max(0, Number(resumedCounters.sumCycleMs) || 0);
    session.cycleCount = Math.max(0, resumedCounters.cycleCount | 0);
    session.breaksTaken = Math.max(0, resumedCounters.breaksTaken | 0);
    session.tandaStartedAt = Math.max(0, Number(resumedCounters.tandaStartedAt) || 0);
    session.xp = Math.max(0, Number(resumedCounters.xp) || 0);
    session.nitroRaces = Math.max(0, resumedCounters.nitroRaces | 0);
    session.nitroCharsTotal = Math.max(0, Number(resumedCounters.nitroCharsTotal) || 0);
    // Desde 7.71.0 la foto de la tanda guarda tambien los topes diarios, pero
    // la clave suelta sigue siendo la fuente de verdad: el panel del garaje la
    // lee directamente y puede haber cambiado sin pasar por esta sesion. La
    // foto solo rellena el hueco cuando la clave falta (no resucita una vieja).
    const savedDailyRaces = Number(resumedCounters.dailyRaceLimit);
    if (localStorage.getItem(KEYS.dailyRaceLimit) === null && Number.isFinite(savedDailyRaces)) {
      session.dailyRaceLimit = clamp(savedDailyRaces | 0, 0, 2000);
    }
    const savedDailyXp = Number(resumedCounters.dailyXpLimit);
    if (localStorage.getItem(KEYS.dailyXpLimit) === null && Number.isFinite(savedDailyXp)) {
      session.dailyXpLimit = clamp(savedDailyXp | 0, 0, 10000000);
    }
  }

  const resumedPause = loadPaused();
  if (resumedPause) session.paused = true;

  function resetRaceState() {
    dqSeenAt = 0;
    connErrorSeenAt = 0;
    session.chars = 0;
    session.pos = 0;
    session.startIndex = 0;
    session.total = 0;
    session.correct = 0;
    session.errors = 0;
    session.errorBudget = 0;
    session.startedAt = 0;
    session.endedAt = 0;
    session.lastErrorAt = 0;
    session.lastLogAt = 0;
    session.nitroTries = 0;
    session.nitroDone = false;
    session.nitroChars = 0;
    session.nitroWords = 0;
    session.nitroSpread = 0;
    nitroPreview = null;
    session.typing = false;
    session.capLogged = false;
    session.capMaxWait = 0;
    // El reloj se calibra una vez por carrera con el HUD del juego.
    session.clockSamples = [];
    session.clockDone = false;
    session.lastHudWpm = 0;
    session.lastProgress = null;
  }

  // Formula exacta del cliente (dist/site/js/ra.js, citada por el userscript
  // Race Result Enhancements): accuracy = 1 - errors / (typed - skipped).
  // `chars` hace de `typed` (incluye las pulsaciones erroneas) y `nitroChars`
  // es lo que regalo el nitro: no se tecleo, asi que no cuenta ni arriba ni
  // abajo. Antes se dividia `correct / chars`, que con nitro salia bajo.
  const accuracyNow = () => {
    const typed = Math.max(0, session.chars - session.nitroChars);
    if (!typed) return 100;
    return clamp((1 - session.errors / typed) * 100, 0, 100);
  };

  function wpmNow() {
    if (!session.startedAt) return 0;

    // Al terminar se congela: sin esto el panel sigue dividiendo por un tiempo
    // que crece durante la pantalla de resultados y el numero se desmorona
    // delante del jugador.
    const end = session.endedAt || Date.now();
    const minutes = (end - session.startedAt) / 60000;
    if (minutes < 0.02) return 0;
    // Misma base que el juego: (typed - skipped) / 5 / minutos. Contar solo
    // `correct` dejaba el WPM 1-2 puntos bajo (los fallos tambien se teclean).
    const typed = Math.max(0, session.chars - session.nitroChars);
    return (typed / 5) / minutes;
  }

  // WPM oficial del paquete de meta. Nitro Type manda el progreso con los
  // caracteres tecleados y la marca de meta; si el paquete trae tambien su
  // propia marca de salida (o un WPM ya calculado), el numero se saca del
  // reloj del servidor y no del HUD, que redondea a entero y actualiza una vez
  // por segundo. Sin reloj en el paquete devuelve null: el historial se queda
  // con `gameWpm` y no se inventa una cifra.
  function progressWpm(progress) {
    if (!progress || typeof progress !== 'object') return null;

    const direct = Number(progress.wpm ?? progress.speed);
    if (Number.isFinite(direct) && direct >= 10 && direct <= 400) {
      return Math.round(direct * 10) / 10;
    }

    const typed = Number(progress.typed);
    const skipped = Number(progress.skipped) || 0;
    const chars = typed - skipped;
    const end = Number(progress.completeStamp ?? progress.endStamp);

    let start = 0;
    for (const field of ['startStamp', 'startedAt', 'startTime', 'start']) {
      const value = Number(progress[field]);
      if (Number.isFinite(value) && value > 0) { start = value; break; }
    }

    if (!(chars > 0) || !(end > 0) || !(start > 0) || end <= start) return null;

    // Nitro Type cuenta en milisegundos. Un paquete en segundos daria una
    // carrera de 0,06 s; se descarta antes de dividir.
    const minutes = (end - start) / 60000;
    if (minutes < 0.1) return null;

    const wpm = (chars / 5) / minutes;
    if (!(wpm >= 10 && wpm <= 400)) return null;
    return Math.round(wpm * 10) / 10;
  }

  // The absolute pace ceiling, with two WPM of margin so that neither the
  // auto-calibration nor the game's own rounding can ever show more than
  // CONFIG.wpm.hardCap on screen.
  function paceCap() {
    const cap = CONFIG.wpm.hardCap;
    return Number.isFinite(cap) && cap > 2 ? cap - 2 : Infinity;
  }

  // Hard ceiling governor. Nitro Type measures WPM as characters per five over
  // the time since the light goes out, so a race's running average can be capped
  // exactly: this returns how long to hold before the next keystroke so that this
  // race can never average past CONFIG.wpm.hardCap - 1. It counts every character
  // already sent (wrong ones included), so it matches the game's own math.
  function paceCapWait() {
    const cap = CONFIG.wpm.hardCap;
    // Solo las teclas de esta copia: lo que el nitro salto no se tecleo, y el
    // coste ya va repartido en nitroSpread. Contarlo aqui frenaba la carrera
    // entera de golpe justo despues de usarlo.
    const typed = session.chars - session.nitroChars;
    if (!Number.isFinite(cap) || cap <= 1 || !session.startedAt || typed <= 0) return 0;

    const msPerChar = 60000 / ((cap - 1) * 5);

    // The key about to be sent counts as well. With only the keys already sent,
    // the average could sit one keystroke ahead of the budget, which is exactly
    // the overshoot the bench caught: a race that ends at 119 WPM but reads 130
    // during its first seconds, right when the game's HUD first refreshes.
    const dueAt = session.startedAt + (typed + 1) * msPerChar;
    return clamp(dueAt - Date.now(), 0, 15000);
  }

  /* ==========================================================================
   * 6. PACE
   * ========================================================================== */
  const LEFT_HAND = new Set('qwertasdfgzxcvb');
  const COMMON_BIGRAMS = new Set([
    'th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd', 'ti', 'es',
    'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar', 'st', 'to', 'nt', 'ng',
    'se', 'ha', 'as', 'ou', 'io', 'le', 've', 'co', 'me', 'de', 'hi', 'ri',
    'ro', 'ic', 'ne', 'ea', 'ra', 'ce', 'li', 'ch', 'll', 'be', 'ma', 'si',
  ]);

  function baseDelay() {
    // T is the time per CORRECT character that targetWPM implies.
    const correctMs = 60000 / (profile.targetWPM * 5);

    // A mistake costs a whole keystroke (which does not advance) plus the
    // correction pause. With p mistakes per correct character, T = d(1 + p) + p*c,
    // hence d = (T - p*c) / (1 + p). Without this the measured WPM drops ~8% at
    // 97% accuracy, because the old discount was a flat 1%.
    const p = clamp(1 - profile.accuracyGoal / 100, 0, 0.3);
    const correction = average(CONFIG.humanize.correctionMs);
    // trim: auto-calibration factor (see autocalibrate). 1 = as configured.
    // Mismo suelo que en autocalibrate y por el mismo motivo: como el trim
    // multiplica el retardo, el valor que puede pasarse del techo es el BAJO
    // (escribir mas rapido), no el alto. Un trim viejo y pequeno se sube hasta
    // el suelo en vez de dejarlo planificar por encima del techo.
    const trim = Math.max(session.trim, Math.max(0.9, profile.targetWPM / paceCap()));
    const motor = ((correctMs - p * correction) / (1 + p)) * trim;
    // Tras un susto (una DQ o un hueco del guardia) las siguientes carreras se
    // escriben un poco mas despacio: es lo que hace una persona a la que acaban
    // de descalificar, y ademas deja un margen extra bajo el techo.
    const careful = session.carefulRaces > 0 ? CONFIG.humanize.carefulFactor : 1;

    // Pauses (word starts and punctuation) are discounted from the cadence using
    // the real rate measured on the reference text instead of a fixed 1/5.5:
    // MODEL_STATS computes them once at load time.
    return Math.max(12, (motor * careful) - MODEL_STATS.pausePerChar);
  }

  // Log-logistic by inverse transform: X = (U/(1-U))^(1/beta). Free typing
  // intervals are asymmetric with a right tail, and the log-logistic fits better
  // than the log-normal (Gonzalez et al. 2021, "On the shape of timings
  // distributions in free-text keystroke dynamics").
  function logLogistic(beta) {
    let u = Math.random();
    while (u === 0 || u === 1) u = Math.random();

    return Math.pow(u / (1 - u), 1 / beta);
  }

  // Media de la log-logistica: (pi/beta)/sin(pi/beta). Se usa para reescalar la
  // cadencia al objetivo de WPM: cambia la forma, no la media.
  function logLogisticMean(beta) {
    return (Math.PI / beta) / Math.sin(Math.PI / beta);
  }

  // Fatigue: intervals grow slowly with time on task (+2% per hour, +6% cap).
  // Source: de Jong et al. 2020 (PLOS One): over two hours of real work the
  // inter-keystroke interval rises ~11.6 ms (~4%). Here it is a gentle drift that
  // resets when a session starts.
  let fatigueAt = 0;

  function fatigueFactor() {
    if (!fatigueAt) return 1;

    const { fatiguePerHour, fatigueMax } = CONFIG.humanize;
    const hours = (Date.now() - fatigueAt) / 3600000;
    const factor = 1 + hours * fatiguePerHour;

    // Un valor raro en la config no puede acabar en tecleo a maquina: si el
    // resultado no es un numero sano, la fatiga no se aplica.
    if (!Number.isFinite(factor) || !Number.isFinite(fatigueMax)) return 1;

    return clamp(factor, 1, fatigueMax);
  }

  // The same hand is slower than alternating hands; common digraphs are faster.
  // The same-hand/alternating ratio lands at 1.12/0.97 = ~1.15, inside the
  // +17-19% reported by Pinet et al. 2022 (beta = 0.16-0.17 in log-IKI for
  // unimanual transitions).
  function digraphFactor(previous, expected) {
    const a = (previous || '').toLowerCase();
    const b = (expected || '').toLowerCase();
    if (!/[a-z]/.test(a) || !/[a-z]/.test(b)) return 1;

    const { sameHandFactor, alternateHandFactor, commonBigramFactor } = CONFIG.humanize;
    let factor = LEFT_HAND.has(a) === LEFT_HAND.has(b) ? sameHandFactor : alternateHandFactor;
    if (COMMON_BIGRAMS.has(a + b)) factor *= commonBigramFactor;
    return factor;
  }

  // Per-word model: a longer word is typed slower per letter and its first key
  // costs more; from there on intervals shorten. All three are in the literature
  // (Pinet et al. 2022 for length, position and hand; Baus et al. 2013 for
  // word-initiation latency).
  function wordShapeFactor(pos, length) {
    const { wordLengthPerLetter, wordLengthClamp, wordStartFactors } = CONFIG.humanize;
    const lengthFactor = clamp(1 + wordLengthPerLetter * (length - 5), wordLengthClamp[0], wordLengthClamp[1]);

    if (pos === 0) return lengthFactor * wordStartFactors[0];
    if (pos === 1) return lengthFactor * wordStartFactors[1];
    return lengthFactor * wordStartFactors[2];
  }

  // Posicion dentro de la palabra y longitud de la palabra para el caracter
  // que toca: dos recorridos cortos (hasta el espacio anterior y hasta el
  // siguiente), sin tablas ni cache que mantener.
  function wordContext(content, index) {
    if (!content) return { pos: 0, length: 1 };

    let start = index;
    while (start > 0 && content[start - 1] !== ' ') start--;

    let end = index;
    while (end < content.length && content[end] !== ' ') end++;

    return { pos: index - start, length: Math.max(1, end - start) };
  }

  // Pausas al empezar palabra. La de "pensar" supera los 500 ms, que es el
  // umbral con el que la literatura clasifica un intervalo como pausa.
  function wordPause(previous) {
    if (previous !== ' ') return 0;
    const { wordPauseChance, wordPauseMs, hesitationChance, hesitationMs } = CONFIG.humanize;

    if (Math.random() < hesitationChance) return randInt(hesitationMs[0], hesitationMs[1]);
    if (Math.random() < wordPauseChance) return randInt(wordPauseMs[0], wordPauseMs[1]);
    return 0;
  }

  // Pausa tras un signo de puntuacion: el hueco que sigue a una coma o a un
  // final de frase es mas largo que un limite de palabra normal (Fuchs &
  // Krivokapic 2016). Se aplica al espacio que va despues del signo, que es
  // donde el mecanografo respira.
  function punctuationPause(content, index) {
    if (!content || index < 2 || content[index - 1] !== ' ') return 0;

    const before = content[index - 2];
    const { sentencePauseMs, commaPauseMs } = CONFIG.humanize;

    if (before === '.' || before === '!' || before === '?') return randInt(sentencePauseMs[0], sentencePauseMs[1]);
    if (before === ',') return randInt(commaPauseMs[0], commaPauseMs[1]);
    return 0;
  }

  // Texto de referencia: una leccion tipica de Nitro Type con palabras cortas,
  // largas, comas y finales de frase. Sobre el se mide, una sola vez, la
  // ganancia media del modelo (digrafo x palabra) y la pausa media por
  // caracter. Sin esa normalizacion, estas reglas moverian el WPM medido: la
  // escala se calcula para que la cadencia media siga siendo la del objetivo.
  const REFERENCE_TEXT = 'the quick brown fox jumps over the lazy dog, and the race keeps going while the clock runs. a steady pace wins races, but nobody types the same way twice. ';

  function modelStats(text) {
    const lengths = String(text).split(' ').map((word) => Math.max(1, word.length));
    const h = CONFIG.humanize;
    let gain = 0;
    let pause = 0;
    let wordIndex = -1;
    let pos = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const previous = i > 0 ? text[i - 1] : '';

      if (previous === ' ' || i === 0) {
        wordIndex++;
        pos = 0;
      }

      gain += digraphFactor(previous, char) * wordShapeFactor(pos, lengths[wordIndex] || 1);
      pos++;

      if (previous === ' ') {
        pause += h.wordPauseChance * average(h.wordPauseMs)
          + h.hesitationChance * average(h.hesitationMs);

        const before = i >= 2 ? text[i - 2] : '';
        if (before === '.' || before === '!' || before === '?') pause += average(h.sentencePauseMs);
        else if (before === ',') pause += average(h.commaPauseMs);
      }
    }

    return { gain: gain / text.length, pausePerChar: pause / text.length };
  }

  const MODEL_STATS = modelStats(REFERENCE_TEXT);

  function nextDelay(content, index) {
    const expected = content ? content[index] || '' : '';
    const previous = content && index > 0 ? content[index - 1] : '';
    const { pos, length } = wordContext(content, index);

    // La cadencia base ya lleva descontadas las pausas esperadas. Aqui va todo
    // lo demas: la forma de la log-logistica (dividida por su media, que es
    // 1), la fatiga y la estructura del caracter (digrafo x palabra),
    // normalizada por la ganancia media del texto de referencia para que estas
    // reglas no muevan el WPM medido.
    const { shape } = CONFIG.humanize;
    const scale = (baseDelay() / logLogisticMean(shape)) * fatigueFactor() / MODEL_STATS.gain;
    const delay = scale * digraphFactor(previous, expected) * wordShapeFactor(pos, length) * logLogistic(shape);

    // Nunca un intervalo no-finito: setTimeout(NaN) dispara al instante y eso
    // es tecleo a maquina (justo el fallo que encendio el guardia en las
    // pruebas del banco).
    if (!Number.isFinite(delay)) return baseDelay();

    // La deuda del nitro se paga aqui: 1-2 ms por tecla no se notan, pero
    // suman exactamente el tiempo que costaria haber tecleado lo que salto.
    return clamp(delay + wordPause(previous) + punctuationPause(content, index) + session.nitroSpread, 10, 4000);
  }

  /* ==========================================================================
   * 7. ACCURACY
   * ========================================================================== */
  const WRONG_POOL = 'abcdefghijklmnopqrstuvwxyz';

  // Physical neighbours on a QWERTY. Human errors are not random letters: the
  // typical mistake is the key next to it (a finger slip), not a 'q' when typing
  // an 'l'. With uniform luck, 1 in 4 errors landed on the far side of the
  // keyboard, which is exactly what a hand never does.
  const KEY_NEIGHBORS = {
    q: 'wa', w: 'qeas', e: 'wrsd', r: 'etdf', t: 'ryfg', y: 'tugh', u: 'yihj',
    i: 'uojk', o: 'ipkl', p: 'ol',
    a: 'qwsz', s: 'awedxz', d: 'serfcx', f: 'drtgvc', g: 'ftyhbv', h: 'gyujnb',
    j: 'huikmn', k: 'jiolm', l: 'kop',
    z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk',
  };

  function wrongChar(expected) {
    const lower = (expected || '').toLowerCase();
    const neighbors = KEY_NEIGHBORS[lower];

    // 85% desliz a una tecla contigua; el resto, un caracter del pool. El
    // espacio y la puntuacion no tienen vecinos en el mapa y caen al pool.
    if (neighbors && Math.random() < 0.85) {
      return neighbors[randInt(0, neighbors.length - 1)];
    }

    let candidate = lower;
    while (candidate === lower) {
      candidate = WRONG_POOL[randInt(0, WRONG_POOL.length - 1)];
    }
    return candidate;
  }

  // Fixed mistake budget per race. The older version compared the target with the
  // OBSERVED accuracy, which can only fall: a few early mistakes pushed accuracy
  // below target and the controller switched itself off for good. Measured in the
  // game: 96-97% against a 98.7% target, with the pace paying for mistakes it had
  // not budgeted (-5.7% real WPM). Now exactly the mistakes that fit the target
  // are allowed and spread over the remaining characters.
  function rollError(content) {
    if (session.chars < 5) return false;                       // sin fallos al arrancar
    if (session.chars - session.lastErrorAt < 4) return false; // sin fallos pegados

    const chars = content ? content.length : 0;
    if (!chars) return false;

    if (!session.errorBudget) {
      session.errorBudget = Math.max(1, Math.round((1 - profile.accuracyGoal / 100) * chars));
      session.errors = 0;
    }
    if (session.errors >= session.errorBudget) return false;

    const remaining = Math.max(1, chars - session.chars);
    const rate = (session.errorBudget - session.errors) / remaining;

    if (Math.random() < rate) {
      session.errors++;
      return true;
    }
    return false;
  }

  /* ==========================================================================
   * 8. NITRO
   * ========================================================================== */
  function useNitro(app) {
    // Camino normal: el mismo que usa el tecleo, con el salto de linea que el
    // juego interpreta como nitro (Enter salta la palabra actual, una por
    // carrera desde el cambio de 2019).
    try {
      app.handleKeyPress('character', new KeyboardEvent('keypress', {
        key: '\n', bubbles: true, cancelable: true,
      }));
      return true;
    } catch {
      return false;
    }
  }

  // Si el juego no acepta el evento sintetico de `handleKeyPress`, Enter sigue
  // siendo la tecla real del nitro: se despacha el keydown/keyup que escucha el
  // documento. Solo se llama cuando el indice NO se movio, para no gastar dos
  // veces el nitro ni disparar el Enter de «race again» en los resultados.
  function pressNitroKey() {
    try {
      for (const type of ['keydown', 'keyup']) {
        document.dispatchEvent(new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true,
        }));
      }
      return true;
    } catch {
      return false;
    }
  }

  // Tope del reparto del nitro: mas de esto por tecla se nota en la cadencia.
  // El mismo numero sirve para decidir si el nitro se gasta (ver shouldUseNitro).
  const NITRO_MAX_SPREAD = 25;

  // Ultima palabra que Auto nitro usaria en la carrera actual. Vive solo en
  // memoria: el panel la ensena antes de gastar el unico nitro, y se limpia al
  // gastarlo o al empezar otra carrera.
  let nitroPreview = null;

  // El nitro se gasta en la palabra MAS LARGA que deje leccion suficiente para
  // pagar el tiempo que regala. Se elige entre las palabras que quedan por
  // delante: si la mejor ya quedo atras (un fallo o un remontaje), no se anuncia
  // una palabra que el bot ya no puede saltar. La primera palabra se descarta:
  // shouldUseNitro no dispara en index 0.
  function nitroFits(content, index) {
    if (!content || index <= 0 || index >= content.length) return false;
    const length = wordContext(content, index).length;
    if (length < 4) return false;

    const left = content.length - (index + length);
    const perCharMs = 60000 / ((CONFIG.wpm.hardCap - 1) * 5);
    const planMs = 60000 / (profile.targetWPM * 5);
    const slack = Math.max(0, planMs - perCharMs);
    const roomPerChar = Math.max(0, NITRO_MAX_SPREAD - slack);
    return roomPerChar > 0 && length * perCharMs <= left * roomPerChar;
  }

  function nitroTarget(content, from = 0, strategy = CONFIG.nitroStrategy) {
    if (!content) return -1;
    const start = Math.max(0, Number(from) || 0);
    const mode = normalizeNitroStrategy(strategy);

    let best = -1;
    let bestLength = 0;
    const re = /\S+/g;
    let match;

    while ((match = re.exec(content))) {
      const index = match.index;
      if (index <= 0 || index < start) continue;
      const length = match[0].length;
      // Una palabra de una o dos letras no amortiza el unico nitro de la
      // carrera: se reserva para una palabra de verdad, que es lo dificil.
      if (!nitroFits(content, index)) continue;
      if (mode === 'first') return index;
      if (mode === 'last') {
        best = index;
        continue;
      }
      if (length > bestLength) {
        bestLength = length;
        best = index;
      }
    }
    return best;
  }

  function shouldUseNitro(content, index) {
    const target = nitroTarget(content, index);
    const canTry = !session.nitroDone && session.nitroTries < 3;

    // La vista previa se calcula aunque el interruptor este apagado: asi TUNE
    // puede decir que saltaria si se enciende. Se apaga cuando el nitro ya se
    // gasto o cuando se agotaron los intentos, para no anunciar un salto que no
    // va a ocurrir.
    if (canTry && target >= 0) {
      const length = wordContext(content, target).length;
      const word = content.slice(target, target + length);
      nitroPreview = word ? { index: target, word, chars: length } : null;
    } else {
      nitroPreview = null;
    }

    if (!CONFIG.useNitro || !canTry) return false;
    if (index <= 0) return false;
    return target >= 0 && index === target;
  }

  /* ==========================================================================
   * 9. LOGS
   * ========================================================================== */
  function logStart() {
    log(`WPM sample ${profile.wpmSession}/${profile.wpm.length}: ${profile.targetWPM} WPM`);
    log(`Accuracy sample ${profile.accSession}/${profile.accuracy.length}: ${profile.accuracyGoal.toFixed(1)}%`);
    log(`LEGIT pace · ${baseDelay().toFixed(1)} ms/char base · trim x${session.trim.toFixed(2)} · mode AUTO`);
  }

  function logProgress(force = false) {
    const now = Date.now();
    if (!force && now - session.lastLogAt < 5000) return;
    session.lastLogAt = now;

    const wpm = wpmNow();
    if (!wpm) return;
    log(`WPM ${wpm.toFixed(1)}/${profile.targetWPM} · accuracy ${accuracyNow().toFixed(1)}%/${profile.accuracyGoal.toFixed(1)}% · ${session.chars} keys`);
  }

  /* ==========================================================================
   * 10. SESSION CONTROL
   * ========================================================================== */
  // 25 es el primer escalon que llega al techo del bonus de sesion (250 XP
  // por carrera en la 25). 10 lo perdia entero y 20 se quedaba a cinco carreras
  // del techo, asi que ninguno de los dos sigue en la lista.
  const LIMIT_STEPS = [0, 25, 50, 100];
  const TIME_LIMIT_STEPS = [0, 15, 30, 60, 120];
  // Presupuesto diario: mas alto que el de sesion porque se reparte entre
  // varias tandas. 100/200/300 carreras y 50k/100k/200k XP son techos de un
  // dia de juego normal, no de una sesion.
  const DAILY_RACE_STEPS = [0, 100, 200, 300];
  const DAILY_XP_STEPS = [0, 50000, 100000, 200000];
  // Una carrera a ~110 WPM paga 700-1.000 XP: 2k eran dos o tres carreras y no
  // daba tiempo ni a cobrar el bonus de sesion, que empieza en la decima.
  const XP_LIMIT_STEPS = [0, 5000, 10000, 25000, 50000];

  // El tope no vive en CONFIG sino en localStorage: se cambia con la fila
  // "tope" del panel y sobrevive a las recargas.
  function setRaceLimit(value) {
    const next = clamp(value | 0, 0, 500);
    if (next === session.raceLimit) return;

    session.raceLimit = next;
    disk.set(KEYS.raceLimit, String(next));
    log(next ? `Session limit: ${next} races.` : 'Session limit: none.');
    updatePanel();
  }

  // Mismo contrato que el tope de carreras, en minutos. Vive en localStorage y
  // se cambia desde el panel. Si la tanda ya lleva carreras y no tenia reloj
  // (contadores de una version anterior), se cuenta desde ahora: un tope nuevo
  // no puede cerrar en el acto una tanda que empezo antes.
  function setTimeLimit(value) {
    const next = clamp(value | 0, 0, 1440);
    if (next === session.timeLimit) return;

    session.timeLimit = next;
    disk.set(KEYS.timeLimit, String(next));

    if (next && !session.tandaStartedAt && session.races > 0) {
      session.tandaStartedAt = Date.now();
      saveCounters();
    }

    log(next ? `Session time limit: ${next} min.` : 'Session time limit: none.');
    updatePanel();
  }

  // Tercer tope, en XP: el unico que no depende del reloj sino de lo que el
  // juego paga en cada carrera. Se acumula con el premio real, no con una
  // estimacion (ver noteSessionXp).
  function setXpLimit(value) {
    const next = clamp(value | 0, 0, 1000000);
    if (next === session.xpLimit) return;

    session.xpLimit = next;
    disk.set(KEYS.xpLimit, String(next));
    log(next ? `Session XP limit: ${next.toLocaleString()} XP.` : 'Session XP limit: none.');
    updatePanel();
  }

  // Presupuesto del dia. Se guarda aparte de los contadores de la tanda: no
  // vuelve a cero al abrir una sesion nueva, solo al cambiar la fecha.
  function setDailyRaceLimit(value) {
    const next = clamp(value | 0, 0, 2000);
    if (next === session.dailyRaceLimit) return;

    session.dailyRaceLimit = next;
    disk.set(KEYS.dailyRaceLimit, String(next));
    saveCounters();
    log(next ? `Daily race budget: ${next} races.` : 'Daily race budget: none.');
    updatePanel();
  }

  function setDailyXpLimit(value) {
    const next = clamp(value | 0, 0, 10000000);
    if (next === session.dailyXpLimit) return;

    session.dailyXpLimit = next;
    disk.set(KEYS.dailyXpLimit, String(next));
    saveCounters();
    log(next ? `Daily XP budget: ${next.toLocaleString()} XP.` : 'Daily XP budget: none.');
    updatePanel();
  }

  // Suma el XP de una carrera a la tanda. Lo llaman los dos caminos por los que
  // llega el premio (la carrera registrada con el resultado ya aplicado y el
  // `update` del servidor que lo completa despues), y cada uno suma solo lo que
  // de verdad ha atribuido: nunca se cuenta dos veces.
  function noteSessionXp(amount) {
    const xp = Math.max(0, Math.round(Number(amount) || 0));
    if (!xp) return;

    session.xp += xp;
    saveCounters();
  }

  // Abre tanda nueva: contadores, medias y cadencia de descansos a cero. Lo
  // comparten Alt+A y la vuelta del garaje despues del tope. Hace falta
  // que sea una sola cosa: el tipador ya se encontro el contador en el tope en
  // cada carga y volvia a pararse, asi que el garaje rearmaba, abria carrera y
  // no se corria ninguna.
  function startFreshTanda(reason) {
    session.races = 0;
    session.sumRaces = 0;
    session.sumWpm = 0;
    // El libro de aportaciones es parte de sumWpm y se vacia con el: aunque
    // hoy el guardia de 20 s ya impide casar una fila vieja, dos mitades del
    // mismo numero no pueden reiniciarse por caminos distintos.
    session.sumWpmLedger = [];
    session.sumTarget = 0;
    session.sumAcc = 0;
    session.dqCount = 0;
    session.closed = false;
    session.blockRaces = 0;
    session.blockTarget = 0;
    session.breakUntil = 0;
    session.carefulRaces = 0;
    session.lastStartAt = 0;
    session.lastEndAt = 0;
    session.gapSamples = [];
    session.sumCycleMs = 0;
    session.cycleCount = 0;
    session.breaksTaken = 0;
    session.tandaStartedAt = 0;   // el reloj del tope por tiempo vuelve a cero
    session.xp = 0;               // y el XP acumulado de la tanda
    session.nitroRaces = 0;       // y la contabilidad del nitro de la tanda
    session.nitroCharsTotal = 0;
    fatigueAt = Date.now();   // la fatiga cuenta desde el arranque de la tanda
    saveCounters();
    log(reason || 'New session: race counter back to zero.');
    return true;
  }

  // Volver a correr. No cambia de modo (no hay otro): solo deshace el estado de
  // parada y relanza el bucle. La usan Alt+A y el chip del garaje.
  function resumeAuto() {
    if (!session.stopped) return false;

    // El presupuesto del dia no se salta con A: si ya esta gastado, la cuenta
    // espera a manana. Es la unica parada que no se puede reanudar a mano.
    if (dailyLimitReached()) {
      log(`Daily budget spent (${capReason()}); it resumes tomorrow.`);
      return false;
    }

    const hours = activeGate();
    if (hours) {
      log(`Active hours closed (${hours.label}); it resumes at ${hours.nextText}.`);
      scheduleActiveResume();
      return false;
    }

    session.stopped = false;
    session.stopAfterRace = false;
    session.stopManual = false;
    dqBlockedNoted = false;
    // Deshacer la marca de parada: el garaje ya puede arrancar solo otra vez.
    clearStopped();

    // Retomar a mano es una decision tuya: la racha de DQ empieza de cero.
    if (session.dqStreak) {
      session.dqStreak = 0;
      saveCounters();
    }

    // La tanda anterior ya cerro (tope o parada): volver abre una nueva, con
    // contadores, medias y cadencia de descansos a cero.
    if (limitReached() || session.closed) {
      startFreshTanda();
    } else if (!fatigueAt) {
      fatigueAt = Date.now();
    }

    // Si la app quedo en la pantalla de resultados, A debe abrir la siguiente
    // carrera ya; si no, hay que esperar al empujon de 25 s.
    if (clickByText(['race again', 'play again', 'next race'])) {
      log('Next race: "Race Again".');
    }

    log('Mode: AUTO (always).');
    runAuto();
    updatePanel();
    return true;
  }

  // Parada limpia: si hay una carrera en curso se termina y no se abre otra.
  // Cortar en seco deja la carrera viva sin teclas, y eso es una DQ.
  // "Carrera viva" incluye la cuenta atras: hasta la primera tecla aceptada
  // session.typing sigue a false, pero el servidor ya nos esta cronometrando.
  function raceIsLive() {
    return !session.stopped && (session.typing || Boolean(findTypingApp()));
  }

  function requestStop() {
    if (raceIsLive()) {
      if (session.paused) setPaused(false);
      if (session.stopAfterRace) {
        // Puede ser un hueco del guardia: confirmar que la parada es tuya hace
        // que no se retome sola al acabar el descanso.
        session.stopManual = true;
        return;
      }
      session.stopManual = true;
      session.stopAfterRace = true;
      log('Stopping after this race; no new race will be opened. A second press cuts right now.');
      updatePanel();
      return;
    }

    panic();
  }

  // Apagar el bot sin cortar una carrera viva: lo comparten Alt+N, Stop y Esc.
  // Apagar a media carrera es una DQ segura, asi que se pide la parada y
  // se apaga al terminar. No hay modo NORMAL: parar es un estado y el modo sigue
  // siendo AUTO, asi que encenderlo otra vez es un solo clic.
  function turnOffBot() {
    if (raceIsLive()) {
      log('There is a race on screen: the bot turns off when it ends (cutting it now is a disqualification).');
      requestStop();
      return;
    }

    panic('turned off from the panel');
  }

  // Marca de parada deliberada, compartida con la cola del garaje: si el bot se
  // paro por el tope de la tanda o por Esc, el garaje no debe abrir otra carrera
  // (saldria sin teclas y el servidor la descalifica por inactividad). Caduca
  // sola, y volver a encenderlo (Alt+A / MODE) la borra.
  const STOP_MARK = 'ntQueue:stoppedAt';
  const LAST_STOP = 'ntQueue:lastStop';
  const STOP_HOLD_MAX = 24 * 60 * 60 * 1000;

  // La retencion se calcula igual en la marca activa y en la tarjeta de la
  // ultima parada. Una salida por resultados no debe retener horas: ese fallo
  // ya se resuelve yendo al garaje.
  function stopHoldMs(saved) {
    const raw = Math.min(Number(saved && saved.holdMs) || 0, STOP_HOLD_MAX);
    const hold = raw || CONFIG.queue.stopHoldMs;
    if (/results page will not open another race/i.test(String((saved && saved.reason) || '')) && hold > 2 * 60000) {
      return 2 * 60000;
    }
    return hold;
  }

  function markStopped(reason, holdMs) {
    const entry = {
      at: Date.now(),
      reason: String(reason || ''),
      holdMs: Number(holdMs) > 0 ? Number(holdMs) : 0,
    };
    try {
      localStorage.setItem(STOP_MARK, JSON.stringify(entry));
      localStorage.setItem(LAST_STOP, JSON.stringify({ ...entry, clearedAt: 0, clearedBy: '' }));
    } catch {
      /* almacenamiento bloqueado */
    }
  }

  function clearStopped() {
    try {
      const raw = localStorage.getItem(STOP_MARK);
      const stop = raw ? JSON.parse(raw) : null;
      if (stop && Number.isFinite(Number(stop.at))) {
        localStorage.setItem(LAST_STOP, JSON.stringify({
          at: Number(stop.at),
          reason: String(stop.reason || ''),
          holdMs: Number(stop.holdMs) > 0 ? Number(stop.holdMs) : 0,
          clearedAt: Date.now(),
          clearedBy: 'manual',
        }));
      }
      localStorage.removeItem(STOP_MARK);
    } catch {
      /* almacenamiento bloqueado */
    }
  }

  function lastStopInfo() {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_STOP) || 'null');
      if (!saved || !Number.isFinite(Number(saved.at))) return null;
      const holdMs = stopHoldMs(saved);
      return {
        at: Number(saved.at),
        reason: String(saved.reason || ''),
        clearedAt: Number(saved.clearedAt) || 0,
        clearedBy: String(saved.clearedBy || ''),
        holdMs,
        endAt: Number(saved.at) + holdMs,
      };
    } catch {
      return null;
    }
  }

  // Aviso para el panel del tipador (la cola no tiene panel): se deja en
  // localStorage y el tipador lo pinta al arrancar. Vive arriba porque tambien
  // lo usa el tipador al pararse por una racha de DQ.
  function storeNotice(text) {
    try {
      localStorage.setItem('ntQueue:notice', JSON.stringify({ text, at: Date.now() }));
    } catch { /* modo privado */ }
  }

  // Parada de emergencia: corta el bucle y devuelve el teclado al juego.
  // reason se pinta en la linea de estado: el ultimo aviso debe decir POR QUE
  // se paro, no solo que se paro.
  function panic(reason, holdMs) {
    clearPauseGuard();
    session.paused = false;
    session.stopAfterRace = false;
    session.stopManual = false;
    session.pauseEndsAt = 0;

    // Parar tambien termina un descanso en curso: al volver con A se empieza a
    // correr, no a esperar los minutos que quedaban.
    if (session.breakUntil) {
      session.breakUntil = 0;
      saveCounters();
    }
    try {
      localStorage.removeItem(KEYS.paused);
    } catch {
      /* almacenamiento bloqueado */
    }
    // Parar es un estado, no un modo: no hay nada que escribir en disco ni
    // teclado que devolver. Alt+A o el garaje lo ponen a correr otra vez.
    session.typing = false;
    session.stopped = true;
    releaseTabLease();
    fatigueAt = 0;   // session over: fatigue back to zero
    markStopped(reason || 'stopped', holdMs);

    // Cualquier parada cierra la tanda: se anota en el registro (Alt+H) y el
    // aviso lleva el resumen (media, desvio, precision y DQ) que antes solo
    // aparecia al llegar al tope.
    closeTanda(reason);
    const summary = tandaSummary();
    const detail = [reason || 'automation stopped; keyboard handed back to the game', summary]
      .filter(Boolean)
      .join(' · ');
    log(`STOP: ${detail}.`);
    updatePanel();
  }

  // Teclas de mando. Se atienden igual si vienen del teclado de este marco o
  // reenviadas por la ventana de arriba: el foco suele estar fuera del iframe de
  // la carrera (la pantalla de resultados, la pagina alrededor), y alli los
  // atajos no llegaban a este documento: Alt+A parecia muerto y no habia forma
  // de entender por que. Devuelve true si la tecla era nuestra.
  function handleHotkey(info) {
    const key = info.key;
    const alt = Boolean(info.altKey);
    const ctrl = Boolean(info.ctrlKey);
    const meta = Boolean(info.metaKey);

    // Escape: parada, disponible incluso escribiendo. En plena carrera no
    // corta en seco (seria una DQ): deja terminar la carrera; un segundo Esc
    // corta de inmediato.
    if (key === 'Escape' && !ctrl && !alt && !meta) {
      if (raceIsLive() && !session.stopAfterRace) {
        requestStop();
        return true;
      }

      if (!session.stopped || session.running || session.paused) {
        panic();
        return true;
      }
      return false;
    }

    // Alt+S: parar sin abandonar la carrera en curso (igual que el boton).
    if (alt && info.code === 'KeyS') {
      requestStop();
      return true;
    }

    // Alt+R: vaciar el historial del panel sin tocar el localStorage a mano.
    if (alt && info.code === 'KeyR') {
      clearHistory();
      return true;
    }

    // Alt+Shift+C: la tendencia de precision, de cero (las carreras no se tocan).
    if (alt && info.shiftKey && info.code === 'KeyC') {
      resetAccuracyTrend();
      return true;
    }

    // Alt+H: las tandas cerradas, en una tabla de consola.
    if (alt && info.code === 'KeyH') {
      showTandaLog();
      return true;
    }

    // Alt+T: ciclar la piel sin abrir TUNE. Funciona tambien con el foco dentro
    // del iframe; el storage event lleva el cambio al panel del garaje.
    if (alt && info.code === 'KeyT') {
      cycleTheme();
      return true;
    }

    // Alt+M: el mini-HUD de la barra inferior. Completo -> compacto (WPM,
    // precision y reloj) -> oculto. Se guarda para no reaparecer tras recargar.
    if (alt && info.code === 'KeyM') {
      cycleFootMode();
      return true;
    }

    // Alt+N: parar (el viejo "off"). Se conserva el atajo aunque el modo NORMAL
    // ya no exista: parar sigue siendo lo mismo y no hay tecla muerta.
    if (alt && info.code === 'KeyN') {
      turnOffBot();
      return true;
    }

    if (ctrl || meta) return false;

    // Reanudar tambien respeta el foco: escribir en el chat no puede relanzar
    // el bot.
    const target = info.target;
    if (target && (target.isContentEditable
      || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ''))) {
      return false;
    }

    // Solo con Alt. Las teclas sueltas a/n apagaban el bot sin querer: una "n"
    // durante la cuenta atras dejaba la carrera muda y el juego descalificaba en
    // segundos. Alt+A vuelve a correr; no hay otra tecla de modo.
    if (!alt) return false;
    if (info.code !== 'KeyA') return false;

    resumeAuto();
    return true;
  }

  function onKeyDown(event) {
    if (!handleHotkey(event)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  // La cola de la ventana de arriba reenvia aqui las pulsaciones que ocurren
  // fuera del marco (ahi no hay panel ni tipador). Solo se aceptan mensajes de
  // la propia ventana de arriba y del mismo origen: cualquier otro se ignora.
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    if (event.source !== window.top && event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.__ntaHotkey !== true) return;
    handleHotkey({ key: data.key, code: data.code, altKey: data.altKey, ctrlKey: data.ctrlKey, metaKey: data.metaKey });
  });

  /* ==========================================================================
   * 11. MAIN LOOP
   * ========================================================================== */
  let lastAssetClickAt = 0;

  function handleBlockingModal() {
    if (!document.body || hiddenBlocked()) return;

    const text = modalText();
    // El aviso de los ficheros no siempre se pinta dentro de un `.modal`: si no
    // hay ningun modal visible se mira el texto del marco. Esta funcion solo se
    // llama mientras se espera a la app (marco sin carrera), asi que el barrido
    // del body cae justo donde hace falta.
    const frameText = text || (document.body ? document.body.innerText : '');

    // El servidor de la carrera cerro la conexion. El aviso trae su propia
    // salida ("Go To Your Garage"); se toma esa y no "Try Again", porque el
    // bundle del juego conecta ese boton a window.__reloadPage(window): recarga
    // la pagina en vez de reconectar en el sitio y tira el estado del panel. La
    // cola lleva la pagina entera al garaje.
    if (looksLikeConnectionError(frameText)) {
      const now = Date.now();
      if (now - lastConnExitAt < CONFIG.queue.actionCooldownMs * 2) return;
      lastConnExitAt = now;
      // El vigilante tarda hasta 1 s en marcar el aviso; el bucle de carrera
      // no debe seguir tecleando a la app muerta mientras tanto.
      connErrorSeenAt = now;
      log('Lost the connection to the race server: taking the game\'s way out (garage).');
      clickByText(['go to your garage', 'view garage', 'your garage']);
      notifyTopNeedGarage();
      return;
    }

    // Los ficheros del juego que no cargan: el propio aviso del juego ("Problem
    // Loading Game Files / A required game file failed to load") trae su salida,
    // "Go To Your Garage". Sin reconocerlo, el marco se quedaba muerto y habia
    // que esperar al vigilante, minutos despues, para que recargara la pagina; el
    // boton del juego lo resuelve en un clic y sin perder el estado del panel.
    if (/game file failed to load|problem loading game files/i.test(frameText)) {
      const now = Date.now();
      if (now - lastAssetClickAt < CONFIG.queue.actionCooldownMs * 2) return;
      lastAssetClickAt = now;
      if (clickByText(['go to your garage', 'try again'])) {
        log('The game could not load its files: taking the way out it offers (garage).');
      }
      // Si esto corre dentro del marco de la carrera, pulsar alli solo navega el
      // marco. Se avisa a la ventana de arriba para que lleve la pagina entera al
      // garaje, que es lo que hace un humano.
      try {
        if (window.top && window.top !== window) {
          window.top.postMessage({ __ntaAssetError: true }, location.origin);
        }
      } catch {
        /* marco de otro origen */
      }
      return;
    }

    if (!text.includes('currently in a race')) return;

    if (clickByText(['try again', 'go to your garage'])) {
      log('Modal "Currently in a Race": retrying...');
    }
  }

  // Mantiene el bucle vivo sin enviar teclas mientras esta pausado.
  async function waitWhilePaused() {
    while (session.paused && !session.stopped) {
      await preciseSleep(200);
    }
  }

  /**
   * Detecta si el navegador esta frenando los temporizadores (pestana en
   * segundo plano: setTimeout pasa a ir a ~1/s). Se mide el desfase real de un
   * temporizador corto en vez de mirar document.hidden, porque dentro del iframe
   * de la carrera visibilityState vale "hidden" SIEMPRE, aunque el panel se vea
   * perfectamente y los temporizadores vayan finos. Midiendo el desfase se
   * detecta justo lo que rompe la carrera, y nada mas.
   */
  async function isThrottled() {
    const start = performance.now();
    await sleep(250);
    return performance.now() - start > 600;
  }

  // Antes de abrir una carrera, si los temporizadores van frenados se espera a
  // que vuelvan a ir finos: una carrera a 60 WPM con mala precision es peor que
  // no correrla. Devuelve true si hubo que esperar.
  async function waitWhileThrottled() {
    // Con el reloj Worker la cadencia no depende de los timers de la pagina. Si
    // el Worker no se pudo crear, la espera sigue siendo necesaria: en segundo
    // plano los timers normales se frenan y la carrera saldria con DQ.
    if (backgroundFarm() && pageHidden() && preciseClockKind === 'worker') return false;

    if (!(await isThrottled())) return false;

    log('Precise clock unavailable in the background: waiting for the tab.');
    while (!session.stopped) {
      // Reloj preciso para que, al volver a la pestana, la comprobacion no se
      // quede esperando el clamp de un minuto.
      await preciseSleep(1000);
      if (!(await isThrottled())) {
        log('Timers healthy again: moving on to the next race.');
        break;
      }
    }
    return true;
  }

  // Visibilidad real de la pestana. Se pregunta a la ventana de arriba porque
  // dentro del marco de la carrera document.visibilityState no es de fiar (lee
  // "hidden" aunque el panel se vea). Si el marco fuera de otro origen y no se
  // puede leer, se devuelve "visible": mejor no bloquear que quedarse esperando
  // para siempre.
  function pageHidden() {
    try {
      const doc = window.top && window.top !== window ? window.top.document : document;
      if (doc && typeof doc.visibilityState === 'string') return doc.visibilityState === 'hidden';
    } catch {
      /* marco de otro origen */
    }
    return false;
  }

  // Farmeo AFK: la pestana puede estar oculta. El reloj Worker mantiene la
  // cadencia y la cola tambien late con el; por eso no se espera a volver al
  // foco. Si se desactiva, se conserva el comportamiento antiguo.
  function backgroundFarm() {
    return CONFIG.queue.backgroundFarm !== false;
  }

  function hiddenBlocked() {
    return pageHidden() && !backgroundFarm();
  }

  // Con backgroundFarm activo no se abre una espera por estar oculto. Solo se
  // espera si el modo AFK esta apagado; ahi el navegador frena los timers y la
  // carrera se quedaria sin teclas (DQ por inactividad).
  async function waitWhileHidden() {
    if (!pageHidden() || backgroundFarm()) return false;

    log('Background farming is off: no new race until the tab is visible again.');
    while (!session.stopped && pageHidden()) await preciseSleep(1000);
    return true;
  }

  // El modal de DQ tapa la app y no queda carrera viva. Sin esto habia que
  // esperar al empujon de 25 s (CONFIG.idleNudgeMs) para volver a jugar.
  let lastDqClickAt = 0;
  function recoverFromDqModal() {
    if (!document.body || !looksDisqualified(modalText())) return false;

    // Con el farmeo AFK activo tambien se cierra el modal en segundo plano; si
    // esta apagado, se deja y se vuelve al entrar en foco.
    if (hiddenBlocked()) return true;

    const now = Date.now();
    if (now - lastDqClickAt < CONFIG.queue.actionCooldownMs) return true;
    lastDqClickAt = now;
    log('Disqualification modal: looking for the next race.');

    // Tras una DQ "Race Again" a veces sale deshabilitado; el garaje siempre
    // esta y desde ahi se abre otra carrera con Race Now.
    if (clickByText(['race again', 'play again', 'next race'])) return true;

    // Ojo: si este modal esta DENTRO del marco de la carrera, ese boton navega
    // el marco y dejaria un garaje incrustado en /race. Se avisa a la ventana de
    // arriba para que lleve la pagina entera, que es lo que hace un humano.
    if (clickByText(['go to your garage', 'view garage', 'your garage'])) notifyTopNeedGarage();
    return true;
  }

  // La conexion con el servidor de la carrera se cerro a mitad de carrera. El
  // modal tapa la app y las teclas ya no llegan; el reloj y los caracteres de
  // esta copia dejan de describir lo que paso en el servidor, asi que la
  // carrera no se apunta. Se toma la salida que ofrece el juego (garaje) y se
  // avisa a la ventana de arriba para que navegue la pagina entera. "Try Again"
  // no se usa: el bundle lo conecta a __reloadPage, no a un reconnect.
  function abandonRaceForConnectionError() {
    session.typing = false;

    const now = Date.now();
    if (now - lastConnExitAt < CONFIG.queue.actionCooldownMs * 2) return false;
    lastConnExitAt = now;

    log('Lost the connection to the race server: this race is not counted; going back to the garage.');
    clickByText(['go to your garage', 'view garage', 'your garage']);
    notifyTopNeedGarage();
    return false;
  }

  // Un CAPTCHA del juego tapa la carrera y hace que las teclas se ignoren: es
  // justo el sintoma que el bucle confundia con "la carrera dejo de aceptar
  // entrada", y lo cerraba dando la carrera por perdida. La frase es del bundle
  // y vive en el documento que pinta el aviso (el marco), asi que se busca aqui
  // y se avisa a la ventana de arriba, que es la que puede pausar la cola y —mas
  // importante— dejar de recargar mientras lo resuelves.
  function captchaOnScreen() {
    if (/captcha is not resolved/i.test(modalText())) return true;
    const body = document.body ? document.body.innerText : '';
    return /captcha is not resolved/i.test(body);
  }

  let captchaNotifiedAt = 0;

  async function waitForCaptchaSolved() {
    if (Date.now() - captchaNotifiedAt > 30000) {
      captchaNotifiedAt = Date.now();
      try {
        if (window.top && window.top !== window) {
          window.top.postMessage({ __ntaCaptcha: true }, location.origin);
        }
      } catch {
        /* marco de otro origen */
      }
    }

    log('CAPTCHA on the race screen: waiting for you to solve it before touching the race.');
    const deadline = Date.now() + CONFIG.captchaHoldMs;

    while (!session.stopped && Date.now() < deadline) {
      await preciseSleep(1500);
      // Al quedar resuelto, el juego pinta "Validated! Play on." con su Continue.
      clickCaptchaContinue(document);
      if (!captchaOnScreen()) {
        log('CAPTCHA solved; back to the race.');
        return true;
      }
    }

    return false;
  }

  // Aviso a la ventana de arriba: "esto necesita navegar de verdad". Con tope,
  // porque el modal sigue en pantalla hasta que la pagina se va.
  let lastNeedGarageAt = 0;
  function notifyTopNeedGarage(reason) {
    try {
      if (!window.top || window.top === window) return false;
      const now = Date.now();
      if (now - lastNeedGarageAt < 5000) return true;
      lastNeedGarageAt = now;
      window.top.postMessage({ __ntaNeedGarage: true, reason: String(reason || '') }, location.origin);
      return true;
    } catch {
      return false;
    }
  }

  // Y si este documento acabo en /login, la sesion murio para el marco: el juego
  // no va a aparecer aqui y la pantalla de entrar no se resuelve desde dentro.
  // Mismo canal, tercera razon: la cola lleva la ventana entera a /login, donde
  // ya sabe reintentar el SSO, en vez de dejar que el vigilante recargue a los
  // 4 minutos o que el tipador espere una carrera que no existe.
  let lastNeedLoginAt = 0;
  function notifyTopNeedLogin() {
    try {
      if (!window.top || window.top === window) return;
      const now = Date.now();
      if (now - lastNeedLoginAt < 10000) return;
      lastNeedLoginAt = now;
      window.top.postMessage({ __ntaNeedLogin: true }, location.origin);
    } catch {
      /* marco de otro origen */
    }
  }

  // El modal de DQ vive en la ventana de arriba (lo cierra la cola). Si esa
  // ventana no tiene la cola viva (script recien actualizado, pestana abierta
  // antes de instalarlo), el tipador se quedaba en «waiting» para siempre con el
  // modal delante y sin decir por que. Mismo origen: se cierra tambien desde el
  // marco de la carrera; si el marco es de otro origen, se ignora y la cola
  // sigue siendo la unica que lo toca.
  // Este cierre es el ultimo recurso, no el primero: la cola tiene su propio
  // respiro humano (3-9 s) y es la que debe pulsar. Aqui se espera unos segundos
  // para no adelantarse; si la cola esta viva, el modal ya no estara.
  const DQ_TOP_GRACE_MS = 7000;
  let dqTopSeenAt = 0;

  function closeDqModalInTopFrame() {
    let topDoc = null;
    try {
      topDoc = window.top && window.top !== window ? window.top.document : null;
    } catch {
      return false;   // otro origen: no se puede (ni se debe) tocar
    }
    if (!topDoc || !topDoc.body) return false;
    if (!looksDisqualified(modalText(topDoc))) {
      dqTopSeenAt = 0;
      return false;
    }

    // Con el farmeo AFK activo se toca tambien en segundo plano; si esta
    // apagado, el respiro empieza al volver, no durante la ausencia.
    if (hiddenBlocked()) {
      dqTopSeenAt = 0;
      return true;
    }

    // Se vio el modal: se le da margen a la cola antes de tocarlo nosotros.
    if (!dqTopSeenAt) dqTopSeenAt = Date.now();
    if (Date.now() - dqTopSeenAt < DQ_TOP_GRACE_MS) return true;

    // Respiro mas largo que el de la cola: si el primer clic no navega (boton
    // muerto), reintentar cada 3 s desde aqui parecia un metronomo.
    const now = Date.now();
    if (now - lastDqClickAt < CONFIG.queue.actionCooldownMs * 2) return true;
    lastDqClickAt = now;
    log('Disqualification modal around the race: closing it to get the next race.');

    const view = topDoc.defaultView;
    const target = [...topDoc.querySelectorAll('button, a, [role="button"]')].find((el) => {
      const label = normalize(el.textContent);
      if (!label || !/your garage|race again|play again|next race/.test(label)) return false;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const style = view ? view.getComputedStyle(el) : null;
      return !style || (style.display !== 'none' && style.visibility !== 'hidden');
    });

    if (!target) return false;
    target.click();
    return true;
  }

  async function waitForApp(timeoutMs = 0) {
    const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : 0;
    let announced = false;
    let lastModalCheck = 0;
    let lastNudge = Date.now();

    while (!session.stopped) {
      const app = findTypingApp();
      if (app) return app;
      if (deadline && Date.now() >= deadline) return null;

      if (!announced) {
        log('Waiting for the race screen...');
        announced = true;
      }

      // Si la ruta cambia a /login sin recargar (SPA), boot() no vuelve a
      // correr: se avisa desde aqui, que es el unico latido vivo del marco.
      if (location.pathname.startsWith('/login')) {
        notifyTopNeedLogin();
        await preciseSleep(CONFIG.pollMs);
        continue;
      }

      if (Date.now() - lastModalCheck > 2000) {
        lastModalCheck = Date.now();
        if (!recoverFromDqModal() && !closeDqModalInTopFrame()) handleBlockingModal();
      }

      // Sin carrera en pantalla durante un rato (descanso largo, recarga,
      // modal): se empuja la interfaz. Antes esto se quedaba esperando para
      // siempre y habia que refrescar a mano.
      if (!hiddenBlocked() && Date.now() - lastNudge > CONFIG.idleNudgeMs) {
        lastNudge = Date.now();
        if (clickByText(['race now', 'race again', 'play again', 'next race'])) {
          log('No race on screen: pressing "Race Now".');
        }
      }

      await preciseSleep(CONFIG.pollMs);
    }
    return null;
  }

  // Prueba a escribir el siguiente caracter correcto hasta que la carrera
  // acepte entrada. Evita el desfase de escribir durante la cuenta atras.
  async function waitForRaceStart(app) {
    const deadline = Date.now() + CONFIG.maxWaitStartMs;
    let previousAttemptAt = 0;

    while (!session.stopped && Date.now() < deadline) {
      await waitWhilePaused();
      if (session.stopped) break;

      // El aviso de conexion puede aparecer durante la cuenta atras. Sin esto
      // se seguian probando teclas durante maxWaitStartMs (3 min) en una app
      // que ya estaba muerta detras del modal.
      if (connErrorSeenAt && Date.now() - connErrorSeenAt < CONFIG.queue.connectionFreshMs) {
        abandonRaceForConnectionError();
        return false;
      }

      // React puede remontar el componente durante la cuenta atras: la
      // referencia vieja ya no recibe teclas y el bucle se quedaba hasta 3 min
      // (maxWaitStartMs) mandandolas al vacio. Se vuelve a localizar antes de
      // escribir, que es lo mismo que ya hace el bucle de la carrera.
      const live = findTypingApp();
      if (live && live !== app) app = live;

      const content = getContent(app);
      const index = getIndex(app);

      if (!content || index < 0) {
        await preciseSleep(CONFIG.pollMs);
        continue;
      }
      if (index >= content.length) return true;

      // Otra copia esta escribiendo: aqui no se manda ni la tecla de sondeo.
      if (standbyActive()) {
        await preciseSleep(400);
        continue;
      }

      const attemptAt = Date.now();

      // Sondeo con retorno: si la tecla no salio (componente muerto), el indice
      // que avance despues no es merito de esta copia.
      const probed = press(app, content[index]);

      if (probed && await waitForIndexChange(app, index, CONFIG.probeMs)) {
        // Nitro Type cronometra desde que se apaga el semaforo. La tecla solo
        // se acepta desde ese instante, asi que el cambio cayo entre el
        // intento anterior y este: el punto medio es la mejor estimacion y
        // hace que el panel marque lo mismo que el juego al terminar.
        const bracket = previousAttemptAt ? attemptAt - previousAttemptAt : CONFIG.probeMs;
        session.startedAt = attemptAt - clamp(bracket / 2, 0, CONFIG.startLagMaxMs);
        // Ciclo medido desde el arranque de la carrera anterior: es la base de la
        // estimacion de lo que queda de tanda.
        noteRaceStart(session.startedAt);
        session.chars++;
        session.correct++;
        session.total = content.length;
        session.pos = index + 1;
        // Desde donde se cuenta esta carrera: el guardia mide con esto, no con
        // el indice absoluto de la leccion.
        session.startIndex = index;
        session.lastLogAt = session.startedAt;
        session.typing = true;
        log(`Race started. Target: ${profile.targetWPM} WPM / ${profile.accuracyGoal.toFixed(1)}%`);
        return true;
      }

      previousAttemptAt = attemptAt;
      await preciseSleep(250);
    }
    return false;
  }

  // El juego entra a otra carrera desde los resultados por DOS caminos: el
  // boton «Race Again» y un listener global de Enter. Son independientes, asi
  // que cuando el boton sigue en pantalla pero ya no responde (una capa encima,
  // un remontaje a medias) Enter puede seguir abriendo la carrera. Se despacha
  // sobre `document`: no escribe en un input aunque haya uno con el foco.
  function pressNextRaceKey() {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    }));
  }

  function clickNextRace() {
    if (clickByText(['race again', 'play again', 'next race'])) return true;

    // Sin boton que pulsar, queda el otro camino.
    pressNextRaceKey();
    return false;
  }

  async function waitForNewRace(previousContent, timeoutMs) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const app = findTypingApp();
      if (app) {
        const content = getContent(app);
        if (content && content !== previousContent) return true;
      }
      // Reloj preciso: en segundo plano el setTimeout normal se clampa a 1 s y
      // esta espera de 3 s se quedaba sin comprobaciones utiles.
      await preciseSleep(100);
    }
    return false;
  }

  /**
   * Descanso entre carreras. Se espera ANTES de pulsar "Race Again": es el
   * unico punto del bucle en el que no hay carrera en curso, asi que no se
   * pierde ninguna tecla ni se queda el marcador a medias.
   * @returns {Promise<boolean>} true si se ha descansado.
   */
  async function takeBreakIfDue() {
    // Los contadores de la carrera (races/blockRaces) ya los lleva finishRace:
    // aqui solo se decide si toca descanso.
    //
    // Tope de tanda: se cierra aqui para no abrir un descanso justo antes de
    // parar. El bucle comprueba limitReached() al volver y para la tanda.
    if (limitReached()) return false;

    const { breaks } = CONFIG;
    if (!breaks.enabled) return false;

    if (!session.blockTarget) {
      session.blockTarget = randInt(breaks.afterRaces[0], breaks.afterRaces[1]);
    }
    if (session.blockRaces < session.blockTarget) return false;

    const long = Math.random() < breaks.longChance;
    const [min, max] = long ? breaks.longMs : breaks.shortMs;
    const total = randInt(min, max);

    session.blockRaces = 0;
    session.blockTarget = randInt(breaks.afterRaces[0], breaks.afterRaces[1]);
    session.breakUntil = Date.now() + total;
    session.breaksTaken++;
    saveCounters();

    log(`Break of ${Math.round(total / 1000)} s (${long ? 'long' : 'short'}) after ${session.races} races.`);
    updatePanel();

    while (!session.stopped && Date.now() < session.breakUntil) {
      await waitWhilePaused();
      // Reloj preciso: con la pestana oculta, un temporizador normal tarda hasta
      // un minuto en despertar y el descanso se alargaba de mas.
      await preciseSleep(250);
    }

    session.breakUntil = 0;
    saveCounters();
    // Si te has parado durante el descanso, el ultimo aviso es el PANIC.
    if (!session.stopped) {
      log('Break over; next race.');
      beep('resume');
    }
    updatePanel();
    return true;
  }

  // Un descanso que estaba en curso cuando la app se recargo se retoma aqui:
  // el bucle no puede abrir carrera hasta que termine.
  async function waitWhileBreaking() {
    if (session.breakUntil <= Date.now()) return false;

    log('Break in progress; waiting before opening the next race.');
    updatePanel();

    while (!session.stopped && Date.now() < session.breakUntil) {
      await waitWhilePaused();
      // Reloj preciso: con la pestana oculta, un temporizador normal tarda hasta
      // un minuto en despertar y el descanso se alargaba de mas.
      await preciseSleep(250);
    }

    session.breakUntil = 0;
    saveCounters();
    updatePanel();
    return true;
  }

  /**
   * Autocalibrado del ritmo. Ni la simulacion ni las constantes fijas pueden
   * modelar el hueco real del arranque ni la mezcla de pausas de cada leccion:
   * medido en el juego, las carreras salian de media un 5,7% por debajo del
   * objetivo. Si eso pasa, el factor se corrige solo; se mueve despacio (35%
   * del error) y con tope +/-10% para no perseguir la varianza de una carrera
   * suelta, que es de varios puntos por las pausas de 520-1200 ms.
   */
  // Formula unica del autocalibrado: `base` es el trim antes de la carrera,
  // `achieved` el WPM que se corrige (modelo al cerrar, oficial si ya llego) y
  // `target` el objetivo de ESA carrera. No vale el actual: la cola avanza la
  // serie al cerrar, asi que cuando llega el paquete ya es el de la siguiente.
  function trimFor(achieved, base, target = profile.targetWPM) {
    if (!Number.isFinite(achieved) || achieved <= 0) return base;
    if (!Number.isFinite(target) || target <= 0) return base;
    // trim multiplica el RETARDO (ver baseDelay), asi que un trim pequeno
    // escribe mas rapido: el techo del juego se respeta con un SUELO, no con un
    // techo. Estaba al reves -se limitaba el trim alto, que solo frena- y el
    // suelo fijo de 0.9 dejaba planificar hasta un 11% por encima del objetivo:
    // con 115 de objetivo y 120 de techo, casi 128 WPM, que es lo que el
    // gobernador tenia que frenar en vivo carrera tras carrera.
    const minTrim = Math.max(0.9, target / paceCap());
    return clamp(base * Math.pow(achieved / target, 0.35), minTrim, 1.1);
  }

  function autocalibrate(row = null) {
    // Cada cierre apunta su propia calibracion o ninguna: la de la carrera
    // anterior ya no puede recibir un paquete que llegue tarde.
    session.trimAt = 0;
    if (session.correct < 100) return;   // carrera cortada: muestra insuficiente

    const achieved = wpmNow();
    if (!achieved) return;

    // Si la fila ya trae el paquete oficial (llego antes de cerrar), se usa
    // ese: la calibracion persigue el reloj del juego, no el del modelo.
    const official = row ? Number(row.serverWpm) : NaN;
    const sample = Number.isFinite(official) && official > 0 ? official : achieved;

    const base = session.trim;
    const target = profile.targetWPM;
    const next = trimFor(sample, base, target);
    if (Math.abs(next - base) >= 0.002) {
      session.trim = next;
      try {
        localStorage.setItem(KEYS.trim, String(next));
      } catch {
        /* almacenamiento lleno o bloqueado */
      }
    }
    if (row) {
      // Se apunta el trim ya aplicado: la foto y la memoria no pueden contar
      // cosas distintas si la pagina se recarga justo despues.
      session.trimAt = Number(row.at) || 0;
      session.trimBase = base;
      session.trimApplied = session.trim;
      session.trimTarget = target;
      // La foto de la tanda guarda la calibracion pendiente: el paquete puede
      // llegar despues de la recarga que hace la cola entre carreras.
      saveCounters();
    }
  }

  /**
   * Cierra la carrera y deja lista la siguiente.
   * @returns {Promise<boolean>} true si hay carrera nueva.
   */
  // Una DQ no se puede deshacer (la decide el servidor), pero si se puede
  // llevar la cuenta: a las 5 seguidas Nitro Type bloquea la cuenta unos
  // minutos, asi que a la segunda se para el bot en vez de encadenar.
  function noteDisqualification() {
    session.dqStreak++;
    session.dqCount++;
    saveCounters();
    // La racha limpia del dia vuelve a cero y se guarda cuando fue: el resumen
    // del dia lo ensena para saber si el ritmo esta aguantando hoy.
    todayBump({ dq: 1, resetClean: true, dqAt: Date.now() });
    log(`Disqualification #${session.dqStreak} in a row; not recorded in the history.`);

    // A la cuarta se para: la quinta ya es el bloqueo del sitio. Dos o tres DQ
    // seguidas paran el tiempo suficiente para que algo se arregle (assets,
    // sesion, una carrera abierta sin manos), pero no se juega la quinta.
    if (session.dqStreak >= CONFIG.dqStopStreak) {
      storeNotice(`Stopped after ${session.dqStreak} disqualifications in a row, before the site blocks the account. Press Alt+A to restart.`);
      beep('block');
      // Seis horas de retencion: si la parada fuera de 10 min, el garaje volveria
      // a abrir carrera solo y la quinta DQ llegaria igual. Solo la deshace una
      // accion tuya (MODE / Alt+A).
      panic('DQ streak: stopped before the site block (5 in a row)', 6 * 3600000);
      return;
    }

    if (session.dqStreak >= CONFIG.dqStreakLimit) {
      const ms = session.dqStreak >= 3
        ? humanDelay(CONFIG.dqBreak3Ms)
        : humanDelay(CONFIG.dqBreakMs);
      session.breakUntil = Math.max(session.breakUntil, Date.now() + ms);
      saveCounters();
      log(`DQ streak ${session.dqStreak}: stepping away for ${Math.round(ms / 1000)} s; the bot resumes by itself.`);
      beep('break');
    }

    // Y las siguientes carreras salen mas despacio: nadie que acaba de perder
    // una vuelve a la misma cadencia en la carrera siguiente.
    session.carefulRaces = Math.max(session.carefulRaces, 2);
    updatePanel();
  }

  /* ==========================================================================
   * 8.B RESULTADO DE LA CARRERA (puesto y premio)
   * ========================================================================== */
  // El juego publica el resultado dentro del marco de la carrera: su objeto
  // `server` emite `update` con los corredores y, en el nuestro, `progress`
  // (cuando cruzo la meta) y las lineas de premio `rewards.cashBonuses` /
  // `rewards.xpBonuses`. Es la misma fuente que usa el marcador del juego, asi
  // que no se inventa nada: si no hay dato, la fila del panel no aparece.
  let resultServerObj = null;      // el `server` al que esta suscrito el listener
  let resultServerHandler = null;
  let pendingResult = null;
  // El nombre del evento que publica el juego. Si una version lo renombra, se
  // cambia aqui y quedan cubiertos el alta y la baja del listener.
  const RESULT_EVENT = 'update';
  // WPM del paquete de meta pendiente de fila (llega antes que `recordRace`) y
  // clave de la carrera ya muestreada, para que los update repetidos no lo
  // reescriban.
  let pendingServerWpm = null;
  let serverWpmKey = '';

  const ordinal = (value) => {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n) || n <= 0) return '';
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
  };

  // `rewards.current` es el USUARIO ya actualizado (dinero y XP TOTALES de la
  // cuenta), no el premio de la carrera. El premio son las lineas que suma el
  // marcador del juego: `cashBonuses` (o `bonuses` en la version vieja) y
  // `xpBonuses`. Antes se leia `current` y el panel ensenaba el saldo de la
  // cuenta como si fuera el premio ("+$167.765.912 · +1.292.392 xp"), y el
  // resumen del dia sumaba esa burrada.
  // Cada linea puede venir como numero o como `{ cash, experience }` (el
  // marcador del juego contempla las dos formas), asi que se lee el campo que
  // toca segun el mapa.
  function bonusTotal(map, field) {
    if (!map || typeof map !== 'object') return 0;
    let total = 0;
    for (const value of Object.values(map)) {
      const amount = value && typeof value === 'object' ? value[field] : value;
      const n = Number(amount);
      if (Number.isFinite(n) && n > 0) total += n;
    }
    return total;
  }

  function raceReward(racer) {
    const rewards = racer && racer.rewards;
    if (!rewards || typeof rewards !== 'object') return { cash: 0, xp: 0 };

    // `bonuses` es el nombre viejo del mapa de dinero; si estan los dos manda
    // el nuevo. Las lineas de XP van siempre en su propio mapa.
    const cash = bonusTotal(rewards.cashBonuses || rewards.bonuses, 'cash');
    const xp = bonusTotal(rewards.xpBonuses, 'experience');
    return { cash, xp };
  }

  // Se guarda en la ultima carrera del historial (y de ahi al resumen del dia).
  // Si el aviso llega antes de que recordRace la apunte, queda pendiente.
  function applyRaceResult(result, source) {
    if (!result || (!result.place && !result.cash && !result.xp)) return;

    result.source = source;
    const last = raceHistory[raceHistory.length - 1];

    if (!last || Date.now() - (last.at || 0) > 20000) {
      pendingResult = result;
      return;
    }
    // Un paquete posterior del servidor puede traer el premio que faltaba (el
    // puesto suele llegar antes que el dinero). Antes cualquier dato ya escrito
    // cerraba la puerta y esa carrera quedaba en $0 para siempre; ahora se
    // completa el hueco, sin volver a sumar lo que ya estaba.
    const fillsGap = Boolean(
      (result.place && !last.place) || (result.cash && !last.cash) || (result.xp && !last.xp),
    );
    if ((last.place || last.cash || last.xp) && !fillsGap) return;

    const addedCash = result.cash && !last.cash ? result.cash : 0;
    const addedXp = result.xp && !last.xp ? result.xp : 0;

    Object.assign(last, result);
    try {
      localStorage.setItem(KEYS.history, JSON.stringify(raceHistory));
    } catch { /* almacenamiento bloqueado */ }

    if (addedCash) todayBump({ cash: addedCash });
    if (addedXp) {
      noteSessionXp(addedXp);
      todayBump({ xp: addedXp });
    }
    if (panel.refs) {
      panel.historySig = '';
      renderHistory();
    }
    updatePanel();

    log(`Race result (${source}): ${[
      ordinal(result.place),
      result.cash ? `+$${result.cash.toLocaleString()}` : '',
      result.xp ? `+${result.xp} xp` : '',
    ].filter(Boolean).join(' · ')}`);
  }

  // Escribe el WPM oficial en su fila y lo compara con el modelo. `gameWpm`
  // era la ultima lectura del HUD; esto es el reloj del paquete de meta.
  function stampServerWpm(row, value) {
    if (!row) return;

    const official = Math.round(Number(value) * 10) / 10;
    const previous = Number(row.wpm);
    // El oficial manda: pasa a ser el WPM de la fila y de la media. El del
    // modelo se guarda aparte para no perder el diagnostico de calibracion.
    if (Number.isFinite(previous) && Math.abs(previous - official) > 0.05) {
      row.modelWpm = Math.round(previous * 10) / 10;
    }
    row.wpm = official;
    row.serverWpm = official;

    const model = Number.isFinite(Number(row.modelWpm)) ? Number(row.modelWpm)
      : (Number.isFinite(previous) ? previous : official);
    const diff = model - official;
    log(`Server WPM (progress): game ${official} · model ${model.toFixed(1)}`
      + ` (${diff >= 0 ? '+' : ''}${diff.toFixed(1)})`);
  }

  function applyServerWpm(value, key = '') {
    if (!Number.isFinite(value) || value <= 0) return false;
    if (key && key === serverWpmKey) return false;
    if (key) serverWpmKey = key;

    const last = raceHistory[raceHistory.length - 1];
    // Sin fila reciente el paquete va por delante de la carrera y espera a que
    // `recordRace` cree la suya. Pero si la fila ya lleva el oficial, el
    // paquete es un repetido o un resto de la anterior: guardarlo como
    // pendiente lo aplicaria a la carrera siguiente, que no es la suya.
    if (!last || Date.now() - (last.at || 0) > 20000) {
      pendingServerWpm = value;
      return false;
    }
    if (last.serverWpm) return false;

    stampServerWpm(last, value);

    // La fila ya estaba contada en la media de la tanda: el oficial manda. La
    // aportacion se busca por `at`, no por "la ultima registrada": el paquete
    // puede llegar despues de una recarga (lo normal al cambiar de carrera) y
    // antes el ajuste se perdia en silencio. Solo se corrige una carrera que
    // siga aportando a la tanda; una fila vieja no se reescribe.
    const entry = Array.isArray(session.sumWpmLedger)
      ? session.sumWpmLedger.find((item) => item.at === last.at)
      : null;
    if (entry) {
      const delta = last.wpm - entry.wpm;
      if (Number.isFinite(delta) && Math.abs(delta) > 0.001) {
        session.sumWpm = Math.max(0, session.sumWpm + delta);
        entry.wpm = last.wpm;
        saveCounters();
      }
    }

    // La calibracion del ritmo cerro con el WPM del modelo, que puede ir varios
    // puntos por encima del juego. Si el oficial llega para esa misma carrera y
    // el trim sigue siendo el que dejo la correccion, se recalcula desde su
    // base: sustituye la correccion del modelo, no la apila.
    if (session.trimAt && session.trimAt === last.at
      && Number.isFinite(Number(session.trimBase))
      && Math.abs(session.trim - Number(session.trimApplied)) < 1e-6) {
      const savedTarget = Number(session.trimTarget);
      const next = trimFor(
        last.serverWpm,
        Number(session.trimBase),
        Number.isFinite(savedTarget) && savedTarget > 0 ? savedTarget : profile.targetWPM,
      );
      session.trimAt = 0;
      if (Math.abs(next - session.trim) >= 0.002) {
        session.trim = next;
        try {
          localStorage.setItem(KEYS.trim, String(next));
        } catch { /* almacenamiento lleno o bloqueado */ }
        log(`Pace trim x${next.toFixed(2)} from the official WPM (${last.serverWpm}).`);
        updatePanel();
      }
      saveCounters();
    }

    try {
      localStorage.setItem(KEYS.history, JSON.stringify(raceHistory));
    } catch { /* almacenamiento bloqueado */ }

    // El paquete puede llegar despues de pintar la fila: se repinta ya, sin
    // esperar al siguiente latido ni a que entre otra carrera.
    if (panel.refs) {
      panel.historySig = '';
      renderHistory();
    }
    return true;
  }

  // Busca el objeto de la carrera subiendo por el arbol de React desde
  // `#raceContainer` (el mismo nodo que usa el script de estadisticas) y se
  // suscribe a sus eventos. Se llama al arrancar y, si el marco aun no estaba,
  // el latido del panel lo reintenta.
  function watchRaceResults() {
    const container = document.getElementById('raceContainer');
    let fiber = container ? getFiber(container) : null;
    let depth = 0;
    let found = null;

    while (fiber && depth++ < 80) {
      const node = fiber.stateNode;
      if (node && node.server && typeof node.server.on === 'function') {
        found = node;
        break;
      }
      fiber = fiber.return;
    }

    // El juego puede crear un `server` nuevo por carrera: si el suscrito ya no
    // es el que hay en pantalla, el listener viejo quedaria huerfano y la
    // carrera nueva no daria puesto ni premio. Se compara el `server` suscrito,
    // no el nodo: el juego puede reemplazar `node.server` en el mismo nodo.
    if (found && found.server === resultServerObj && resultServerHandler) return;

    if (resultServerObj && resultServerHandler) {
      try {
        if (typeof resultServerObj.off === 'function') {
          resultServerObj.off(RESULT_EVENT, resultServerHandler);
        } else if (typeof resultServerObj.removeListener === 'function') {
          resultServerObj.removeListener(RESULT_EVENT, resultServerHandler);
        }
      } catch { /* server ya cerrado por el juego */ }
    }
    resultServerObj = null;
    resultServerHandler = null;

    if (!found) return;

    const user = siteUser();
    const userId = (found.props && found.props.user && found.props.user.userID)
      || (user && user.userID)
      || null;
    if (!userId) return;

    const handler = (event) => {
      const racers = event && event.racers;
      if (!Array.isArray(racers) || !racers.length) return;

      const me = racers.find((racer) => racer
        && String(racer.userID) === String(userId)
        && racer.progress
        && Number(racer.progress.completeStamp) > 0);
      if (!me) return;

      // El puesto sale del orden de llegada (completeStamp), que el juego
      // ya pone en cada corredor; no hay que adivinarlo del marcado.
      const stamp = Number(me.progress.completeStamp);
      const place = racers.filter((racer) => racer
        && racer.progress
        && Number(racer.progress.completeStamp) > 0
        && Number(racer.progress.completeStamp) <= stamp).length;

      // Precision del juego con su formula exacta, a partir de los campos que
      // trae `progress`. Se compara con la nuestra para medir el desvio.
      const progress = me.progress || {};
      const gameTyped = Number(progress.typed);
      const gameSkipped = Number(progress.skipped) || 0;
      const gameErrors = Number(progress.errors) || 0;
      // Un `update` por cada corredor que llega y otro por los premios: la
      // misma carrera llega varias veces. `noteAccuracyDelta` deduplica por
      // esta clave; un paquete sin campos no la consume, asi que el siguiente
      // con datos si puede muestrear.
      const sampleKey = `${session.startedAt}:${stamp}`;
      const gameBasis = gameTyped - gameSkipped;
      if (Number.isFinite(gameBasis) && gameBasis > 0) {
        noteAccuracyDelta(clamp((1 - gameErrors / gameBasis) * 100, 0, 100), 'progress', sampleKey);
      } else {
        const rawAcc = me.accuracy ?? progress.accuracy ?? (me.stats && me.stats.accuracy);
        if (rawAcc !== undefined && rawAcc !== null) {
          noteAccuracyDelta(Number(rawAcc), 'server/accuracy', sampleKey);
        } else if (!accFieldWarned) {
          accFieldWarned = true;
          log('Accuracy delta: the race update has no typed/skipped/errors; model Δ stays empty until the field is found.');
        }
      }

      // Foto del paquete de meta: `__ntaDebug.lastProgress()` la devuelve y
      // sirve para confirmar qué campos manda el servidor sin adivinar.
      session.lastProgress = { ...progress };

      const officialWpm = progressWpm(progress);
      if (officialWpm !== null) {
        applyServerWpm(officialWpm, sampleKey);
      } else if (!serverWpmWarned) {
        serverWpmWarned = true;
        log(`Server WPM: progress has no start clock (${Object.keys(progress).join(', ') || 'empty'}).`);
      }

      const reward = raceReward(me);
      applyRaceResult({ place, cash: reward.cash, xp: reward.xp }, 'server');
    };

    try {
      found.server.on(RESULT_EVENT, handler);
      resultServerObj = found.server;
      resultServerHandler = handler;
    } catch {
      /* otra version del juego: se prueba en la proxima carrera */
    }
  }

  async function finishRace(app, disqualified = false) {
    session.typing = false;

    // Otra copia lleva esta carrera: no se apunta nada ni se pulsa nada, o las
    // estadisticas de la cuenta salen dobles.
    if (standbyActive()) {
      log('Another copy is driving this race; this one records nothing.');
      return false;
    }

    if (!session.endedAt) session.endedAt = Date.now();
    // El final queda marcado para medir el hueco hasta la siguiente carrera.
    session.lastEndAt = session.endedAt;
    logProgress(true);

    // Cada carrera consume un turno de "cuidado" (los que pone una DQ o el
    // guardia). Se descuenta antes de contar la DQ de hoy, que abre los suyos.
    if (session.carefulRaces > 0) session.carefulRaces--;

    let counted = false;

    if (disqualified) {
      dqSeenAt = 0;
      noteDisqualification();
    } else {
      counted = countRace();
      log(`Race finished · WPM ${wpmNow().toFixed(1)}/${profile.targetWPM} · accuracy ${accuracyNow().toFixed(1)}%/${profile.accuracyGoal.toFixed(1)}%`);
      // La fila recien apuntada, para que la calibracion sepa a que carrera
      // pertenece y pueda rehacerse cuando llegue su WPM oficial.
      autocalibrate(counted ? raceHistory[raceHistory.length - 1] : null);

      // El resumen del dia solo cuenta carreras medidas: una DQ no es una carrera
      // jugada (y se apunta aparte), y una carrera cortada tampoco. Ademas de la
      // media se guardan la mejor carrera de hoy, la racha limpia y entre que
      // horas se jugo.
      if (counted) {
        const measured = wpmNow();
        const measuredAcc = accuracyNow();
        const at = Date.now();
        // Incrementos, no valores absolutos: cada ventana suma en su propia clave
        // y todayRead las fusiona (dos pestanas ya no se pisan el resumen).
        todayBump({
          races: 1,
          sumWpm: measured,
          sumTarget: profile.targetWPM,
          best: measured,
          bestAcc: measuredAcc,
          clean: 1,
          at,
        });
      }

      // Carrera limpia: la racha de DQ vuelve a cero.
      if (session.dqStreak) {
        session.dqStreak = 0;
        saveCounters();
      }

      // Si el sitio habia bloqueado la cuenta, una carrera terminada demuestra
      // que el castigo ya paso: la proxima espera vuelve a los 15 min de base.
      if (disk.get(DQ_BLOCK_STAGE, 0)) disk.remove(DQ_BLOCK_STAGE);
    }

    // La serie de WPM/precision solo avanza con una carrera medida: una DQ (o
    // una carrera cortada) cambiaria el objetivo sin datos que lo justifiquen.
    if (counted) advanceSessions();


    // Parada pedida a mitad de carrera: ya esta terminada, asi que se para sin
    // abrir otra (abrir otra o cortar antes seria peor). Un hueco del guardia no
    // es una parada: se espera aqui y se sigue con el flujo normal.
    if (session.stopAfterRace) {
      if (session.stopManual) {
        // La parada la pidio el usuario, aunque hubiera un hueco del guardia en
        // curso: no se espera ni se retoma sola la tanda.
        panic('stop requested; no new race opened');
        return false;
      }
      if (session.breakUntil > Date.now()) {
        // Antes se salia con `return false` tras esperar el hueco, sin pulsar
        // "Race Again": la carrera se quedaba en la pantalla de resultados.
        log('Guard break: the next race waits for it, then the bot continues.');
        await waitWhileBreaking();
        session.stopAfterRace = false;
        session.stopManual = false;
        if (session.stopped) return false;
      } else {
        panic('stop requested; no new race opened');
        return false;
      }
    }

    const previous = getContent(app);

    // Si estas pausado, no se arranca la siguiente carrera hasta reanudar.
    await waitWhilePaused();
    if (session.stopped) return false;

    // Pestana en segundo plano: el navegador frena los temporizadores a ~1/s y
    // la carrera saldria a 60 WPM con mala precision. Mejor esperar aqui, que
    // es el unico punto sin carrera en curso.
    await waitWhileThrottled();
    if (session.stopped) return false;

    // Pudo ocultarse durante las esperas anteriores: las teclas ya no se pueden
    // garantizar, asi que no se abre carrera hasta que se vea.
    await waitWhileHidden();
    if (session.stopped) return false;

    // Solo una carrera medida cuenta para la tanda y para los descansos: una
    // DQ o una carrera cortada no son una carrera jugada.
    if (counted) {
      await takeBreakIfDue();
      if (session.stopped) return false;

      // Tope de tanda: se cierra con la carrera ya registrada.
      if (limitReached()) {
        panic(capReason());
        return false;
      }
    }

    // Racha de DQ: el hueco se respeta antes de abrir otra carrera. Sin esto la
    // carrera siguiente arrancaba antes de que pasara el castigo.
    await waitWhileBreaking();

    // Caja lista: la cola va a reclamarla al garaje. Se retiene "Race Again"
    // unos segundos para que esa navegacion llegue antes de abrir otra carrera
    // (si no llega, se sigue: la cola lo reintenta al final de la siguiente).
    if (boxVisitPending()) {
      log('Mystery Box ready: holding the next race while the queue claims it at the garage.');
      const holdUntil = Date.now() + 15000;
      while (!session.stopped && Date.now() < holdUntil && boxVisitPending()) {
        await preciseSleep(250);
      }
    }

    // El descanso pudo terminar con la pestana ya oculta: ultima comprobacion
    // justo antes de pulsar.
    await waitWhileHidden();
    if (session.stopped) return false;

    // La pausa se sortea aqui, con la pestana ya visible y los temporizadores
    // finos: si se dejara antes, el navegador la gastaria en segundo plano y al
    // volver saldria un "Race Again" instantaneo. Si se oculta a mitad de la
    // pausa, no se pulsa a ciegas: se espera a volver y se sortea otra.
    while (!session.stopped) {
      await waitWhileHidden();
      if (session.stopped) return false;

      await waitWhilePaused();
      if (session.stopped) return false;

      await preciseSleep(humanDelay(CONFIG.nextRaceDelayMs, CONFIG.nextRaceLongChance, CONFIG.nextRaceLongMs));
      if (session.stopped) return false;

      if (!hiddenBlocked()) break;
    }
    if (session.stopped) return false;

    clickNextRace();

    if (await waitForNewRace(previous, CONFIG.nextRaceTimeoutMs)) {
      return true;
    }

    // En las pruebas reales la pantalla de resultados tardaba mas de 3 s en
    // dejar pulsar "Race Again", y cada carrera acababa en recarga completa:
    // se perdia el estado del panel y se sumaban ~20 s muertos. Se reintenta
    // antes de recargar.
    //
    // Primero con Enter, que es el OTRO camino del juego: repetir el mismo clic
    // que acaba de fallar no aporta nada cuando el boton esta y su handler ya no
    // responde, que es justo el caso en el que la carrera no arranca.
    log('The next race did not start; trying Enter (the game takes it too)...');
    pressNextRaceKey();

    if (await waitForNewRace(previous, CONFIG.nextRaceRetryMs)) {
      return true;
    }

    log('The next race did not start with Enter either; retrying "Race Again"...');
    clickNextRace();

    if (await waitForNewRace(previous, CONFIG.nextRaceRetryMs)) {
      return true;
    }

    // Si la parada llego durante la espera, recargar solo perderia el estado.
    if (session.stopped) return false;

    if (!mayReloadPage()) {
      // La pantalla de resultados no abre otra carrera y otra recarga dejaria
      // la pestana dando vueltas. Se vuelve al garaje: la cola de arriba
      // rearma y pulsa «Race Now», que es el camino que si funciona.
      log('The next race will not start and the page was already reloaded a moment ago: going back to the garage.');
      if (notifyTopNeedGarage('the results page would not open another race')) {
        storeNotice('The results page did not open another race; the queue is going back to the garage.');
        return false;
      }
      panic('the results page will not open another race', 2 * 60000);
      return false;
    }

    log('The next race did not start; reloading the page.');
    location.reload();
    return false;
  }

  async function raceOnce() {
    // Otra copia manda: esta no entra en la carrera ni la mide. Antes entraba, y
    // al ver avanzar la leccion (por las teclas de la otra copia) creia que
    // habia arrancado su propio reloj: media el WPM de otro y el guardia saltaba
    // con un numero que no era suyo.
    if (standbyActive()) {
      await sleep(1000);
      return false;
    }

    // El aviso de conexion pudo aparecer entre carrera y carrera. Se resuelve
    // antes de resetear el estado: si la app sigue detras del modal,
    // waitForApp la encontraria y waitForRaceStart perderia los 3 min de
    // arranque probando teclas que el modal se come.
    const connError = connErrorSeenAt && Date.now() - connErrorSeenAt < CONFIG.queue.connectionFreshMs;
    resetRaceState();
    if (connError) return abandonRaceForConnectionError();

    // Si se recargo la pagina en mitad de un descanso, se termina antes de
    // abrir carrera: para eso estaba el descanso.
    await waitWhileBreaking();
    if (session.stopped) return false;

    // Ninguna carrera empieza con los temporizadores frenados: saldria lenta y
    // con mala precision, y eso queda en el historial de la cuenta.
    await waitWhileThrottled();
    if (session.stopped) return false;

    let app = await waitForApp();
    if (!app) return false;

    logStart();

    if (!(await waitForRaceStart(app))) return false;

    // El modal de la carrera anterior ("Disqualified") sigue en pantalla
    // mientras se pulsa Race Again. Si no se borra la marca al arrancar de
    // verdad, la carrera nueva se daria por descalificada nada mas empezar y
    // la racha falsa pararia el bot.
    dqSeenAt = 0;

    let lastIndex = getIndex(app);
    let idle = 0;
    let stalls = 0;
    let sendFails = 0;
    let blockedSince = 0;
    let expectedAfter = -1;

    while (!session.stopped) {
      await waitWhilePaused();
      if (session.stopped) break;

      // El servidor cerro la conexion: el modal tapa la app y las teclas ya no
      // llegan. Se sale por el garaje y esta carrera no se cuenta.
      if (connErrorSeenAt && Date.now() - connErrorSeenAt < CONFIG.queue.connectionFreshMs) {
        return abandonRaceForConnectionError();
      }

      // El servidor ya nos expulso: seguir mandando teclas al modal no hace
      // nada, asi que se cierra la carrera y se pasa a la siguiente.
      if (dqSeenAt && Date.now() - dqSeenAt < CONFIG.dqFreshMs) {
        log('Disqualified in this race; moving on to the next one.');
        return finishRace(app, true);
      }

      // React puede remontar el componente (nueva carrera, repintado). Si el
      // nodo ya no es el mismo, se vuelve a localizar en vez de escribir
      // sobre una instancia muerta.
      if (findTypingApp() !== app) {
        const next = await waitForApp(CONFIG.remountGraceMs);

        if (!next) {
          log('The race disappeared; calling it finished.');
          return finishRace(app);
        }

        app = next;
        lastIndex = getIndex(app);
        idle = 0;
        stalls = 0;
        sendFails = 0;
        blockedSince = 0;
        expectedAfter = -1;
        continue;
      }

      const content = getContent(app);
      const index = getIndex(app);

      if (!content || index < 0) {
        await sleep(CONFIG.pollMs);
        continue;
      }
      if (index >= content.length) {
        session.pos = content.length;
        session.total = content.length;
        return finishRace(app);
      }

      session.total = content.length;
      session.pos = index;

      // Guardia en carrera: con el reloj del juego en marcha se mira a menudo
      // (el guardia se limita solo a dos lecturas por segundo), antes de mandar
      // la siguiente tecla.
      guardCheck();
      if (session.stopped) break;

      // El guardia mando soltar esta carrera: se deja sin teclas (el hueco ya
      // esta abierto) y el bucle decide cuando vuelve.
      if (abandonRace) {
        abandonRace = false;
        session.stopAfterRace = false;
        session.stopManual = false;
        session.typing = false;
        log('Race released; the break continues before the next one.');
        return false;
      }

      // Otra copia lleva el teclado: esta no manda teclas. El turno caduca solo,
      // asi que aqui se vuelve a escribir en cuanto el aviso desaparece.
      if (standbyActive()) {
        await sleep(600);
        continue;
      }

      // Enviamos la tecla correcta y el indice no avanzo: la carrera dejo de
      // aceptar entrada. Puede ser el final (resultados), una instancia muerta
      // o un overlay que la bloquea un momento (CAPTCHA): salirse de una
      // carrera viva es descalificacion segura, asi que se aguanta un margen
      // (CONFIG.stallGraceMs) antes de darla por perdida.
      if (expectedAfter >= 0) {
        if (index < expectedAfter) {
          if (!blockedSince) {
            blockedSince = Date.now();
            log('The race is not accepting keys; giving it a few seconds before calling it finished.');
          }

          stalls++;
          if (Date.now() - blockedSince >= CONFIG.stallGraceMs) {
            // Antes de darla por perdida: si lo que la bloquea es un CAPTCHA, la
            // carrera no esta perdida, esta esperando a una persona. Se aguanta
            // sin mandar teclas (mandarlas sobre el aviso no hace nada) y se
            // avisa arriba para que la cola no recargue por encima.
            if (captchaOnScreen()) {
              const solved = await waitForCaptchaSolved();
              if (solved) {
                blockedSince = 0;
                stalls = 0;
                continue;
              }
              log(`The CAPTCHA was not solved in ${Math.round(CONFIG.captchaHoldMs / 1000)} s; moving on.`);
              return finishRace(app);
            }

            log(`The race has ignored keys for ${Math.round((Date.now() - blockedSince) / 1000)} s; moving on.`);
            return finishRace(app);
          }

          // Sin avanzar pero dentro del margen: se reintenta sin martillear.
          if (stalls >= CONFIG.stallLimit) {
            stalls = 0;
            await sleep(400);
          }
        } else {
          stalls = 0;
          blockedSince = 0;
        }
        expectedAfter = -1;
      }

      // Si el indice deja de avanzar puede que la carrera haya terminado.
      if (index === lastIndex) {
        if (++idle >= CONFIG.idleLimit) {
          idle = 0;
          await sleep(1000);
        }
      } else {
        idle = 0;
        lastIndex = index;
        blockedSince = 0;
      }

      if (shouldUseNitro(content, index)) {
        session.nitroTries++;
        useNitro(app);
        await sleep(150);

        let afterNitro = getIndex(app);
        if (afterNitro === index) {
          // El evento de caracter no basto: se prueba la tecla real una vez.
          pressNitroKey();
          await sleep(180);
          afterNitro = getIndex(app);
        }
        if (afterNitro !== index) {
          session.nitroDone = true;
          nitroPreview = null;
          // El nitro completa la palabra sin mandar teclas y el juego la cuenta
          // como escrita. Aqui tambien: si no, el WPM medido sale 5-8% bajo y
          // autocalibrate acelera para corregir una lentitud que no existe.
          const skipped = Math.max(0, afterNitro - index);
          session.chars += skipped;
          session.correct += skipped;
          session.nitroChars += skipped;
          session.nitroWords += 1;
          // La prueba de que el nitro se gasto y en que palabra: es lo que se
          // mira en una pasada real para confirmarlo sin adivinar.
          const nitroWord = content.slice(index, index + wordContext(content, index).length);
          log(`Nitro: skipped ${skipped} chars from "${nitroWord}".`);
          // Los caracteres del nitro los cuenta el juego, y aqui tambien (WPM y
          // calibracion), pero no los teclea esta copia: el gobernador y el
          // guardia miran lo tecleado, no lo regalado. El precio va aparte: lo
          // que el nitro regala cuesta N * (ms por caracter del techo), y parte
          // entra en el margen que ya hay entre el ritmo y el techo (R * slack),
          // que es ganancia limpia como la de un humano. Solo el resto se paga,
          // repartido en migajas por el resto de la leccion: ni un tiron de 1,4 s
          // ni un frenazo del 8% (lo que pasaba al cargarselo entero de golpe).
          const left = Math.max(1, (content ? content.length : afterNitro) - afterNitro);
          const perCharMs = 60000 / ((CONFIG.wpm.hardCap - 1) * 5);
          // El margen se mide contra el ritmo OBJETIVO, no contra baseDelay():
          // el retardo por tecla ya lleva descontados los fallos y la correccion,
          // y el techo limita caracteres CORRECTOS por minuto, no pulsaciones.
          const planMs = 60000 / (profile.targetWPM * 5);
          const slack = Math.max(0, planMs - perCharMs);
          // Reparto con tope: 25 ms de mas por tecla ya es un 25% de freno, y
          // arrastrarlo en las ultimas cuatro teclas se ve. Lo que no quepa se
          // paga de una vez al cerrar la carrera (finishRace).
          session.nitroSpread = clamp((skipped * perCharMs - left * slack) / left, 0, NITRO_MAX_SPREAD);
          session.pos = afterNitro;
        }
        continue;
      }

      // La cadencia va por el reloj del Worker: es lo unico que mantiene el
      // ritmo cuando la pestana esta oculta.
      await preciseSleep(nextDelay(content, index));

      // Hard ceiling: if this race is running faster than CONFIG.wpm.hardCap, hold
      // here until its average is legal again. At the calibrated account pace this
      // never triggers; it exists so that no combination of settings, lessons or
      // calibration can ever push a race past the cap.
      const capWait = paceCapWait();
      if (capWait > 0) {
        // Un recorte largo no es normal con el tope puesto: se dice una vez por
        // carrera en vez de frenar en silencio (tope mal puesto, reloj roto).
        if (capWait > session.capMaxWait) session.capMaxWait = Math.round(capWait);
        if (capWait >= 2000 && !session.capLogged) {
          session.capLogged = true;
          log(`Hard cap: holding ${(capWait / 1000).toFixed(1)} s before the next key (${CONFIG.wpm.hardCap - 1} WPM ceiling).`);
        }
        const shiftAt = session.clockShiftAt;
        await preciseSleep(capWait);
        // La calibracion del reloj puede caer mientras el gobernador duerme:
        // ese recorte se calculo con el arranque viejo. Se recalcula una vez
        // con el inicio nuevo para no dormir de mas ni de menos.
        if (session.clockShiftAt !== shiftAt) {
          const again = paceCapWait();
          if (again > 0) await preciseSleep(again);
        }
      }

      if (session.stopped) break;
      if (session.paused) continue;

      const freshContent = getContent(app);
      const freshIndex = getIndex(app);
      if (!freshContent || freshIndex < 0 || freshIndex >= freshContent.length) {
        continue;
      }

      const expected = freshContent[freshIndex];
      const fail = rollError(freshContent);

      // Si el componente rechaza la llamada (instancia muerta, metodo cambiado)
      // la tecla no se cuenta: si no, el WPM del panel se inventa letras que el
      // juego nunca vio.
      const sent = press(app, fail ? wrongChar(expected) : expected);
      if (!sent) {
        if (++sendFails >= CONFIG.stallLimit) {
          log('The component is refusing keystrokes; calling it finished.');
          return finishRace(app);
        }
        await sleep(CONFIG.pollMs);
        continue;
      }
      sendFails = 0;

      session.chars++;

      if (!fail) {
        session.correct++;
        expectedAfter = freshIndex + 1;
      }

      logProgress();

      if (fail) {
        session.lastErrorAt = session.chars;
        await preciseSleep(randInt(CONFIG.humanize.correctionMs[0], CONFIG.humanize.correctionMs[1]));
      }
    }

    return false;
  }

  async function runAuto() {
    if (session.running) return;

    session.running = true;
    session.stopped = false;

    try {
      while (!session.stopped) {
        // Tras una recarga con AUTO guardado, el tope ya alcanzado no debe
        // abrir una carrera mas. Si la tanda cerro por el tope, la cola ya
        // espero su respiro antes de abrir esta pagina: aqui empieza una tanda
        // nueva. Antes se llamaba a panic() otra vez, el garaje rearmaba a los
        // 10 min, abria carrera y el tipador se paraba al instante: un bucle que
        // no corria ninguna y que solo curaba una A a mano.
        if (limitReached()) {
          if (dailyLimitReached()) {
            panic(capReason());
            break;
          }
          if (session.closed) {
            startFreshTanda(`${capReason()} reached; starting a fresh session.`);
          } else {
            panic(capReason());
            break;
          }
        }

        // Fuera de la ventana no se abre carrera. Se espera en trozos cortos
        // para que Alt+N, el tope diario y un cambio de ajustes sigan mandando.
        const hours = activeGate();
        if (hours) {
          if (!activeWaitNoted) {
            activeWaitNoted = true;
            log(`${hours.reason}; waiting.`);
            scheduleActiveResume();
          }
          await sleep(Math.max(1000, Math.min(hours.left + 1000, 15000)));
          continue;
        }
        if (activeWaitNoted) {
          activeWaitNoted = false;
          log('Active hours open; resuming.');
        }

        try {
          const keepGoing = await raceOnce();
          if (!keepGoing && !session.stopped) await sleep(1500);
        } catch (error) {
          log('Loop error; retrying:', error);
          await sleep(1500);
        }
      }
    } finally {
      session.running = false;
    }
  }

  /* ==========================================================================
   * 11.B AVISOS CON SONIDO (OPCIONAL)
   * ========================================================================== */
  // Apagados de fabrica: un pitido que no has pedido es lo mas molesto que puede
  // hacer un script. Se encienden con el boton "♪" del panel (ese clic es tambien
  // el gesto que el navegador exige para poder sonar) y quedan guardados.
  // No hay fichero de audio ni libreria: un tono corto y suave, distinto para
  // cada cosa, para saber que pasa sin mirar la pantalla.
  let sfxCtx = null;
  let sfxOn = disk.get(KEYS.sfx) === '1';

  const SFX_TONES = {
    break: [420, 170],    // descanso largo / hueco del guardia
    standby: [640, 130],  // otra copia lleva el teclado
    block: [520, 240],    // bloqueo del sitio por racha de DQ
    resume: [780, 110],   // vuelve solo
  };

  function beep(kind) {
    if (!sfxOn) return;

    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;

      if (!sfxCtx) sfxCtx = new Ctx();
      if (sfxCtx.state === 'suspended') sfxCtx.resume();

      const [freq, ms] = SFX_TONES[kind] || SFX_TONES.break;
      const osc = sfxCtx.createOscillator();
      const gain = sfxCtx.createGain();
      const at = sfxCtx.currentTime;

      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.055, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
      osc.connect(gain).connect(sfxCtx.destination);
      osc.start(at);
      osc.stop(at + ms / 1000 + 0.02);

      // Gancho de pruebas (inerte): cuenta los avisos que han sonado.
      if (window.__ntaDebug) window.__ntaDebug.sfx = (window.__ntaDebug.sfx || 0) + 1;
    } catch { /* sin audio: el aviso del panel sigue */ }
  }

  // `quiet` en el arranque: el panel se crea en cada recarga y anunciar el estado
  // del sonido en cada una seria ruido en la consola.
  function setSfx(on, quiet = false) {
    sfxOn = on === true;
    disk.set(KEYS.sfx, sfxOn ? '1' : '0');

    // El chip del sonido ya no existe: el sonido es un interruptor mas del cajon.
    paintConfig();

    if (quiet) return;

    if (sfxOn) beep('resume');   // el clic ya es gesto valido: suena al activarlo
    log(sfxOn ? 'Sound alerts on.' : 'Sound alerts off.');
  }

  /* ==========================================================================
   * 12. FLOATING PANEL
   * ========================================================================== */
  const PANEL_ID = 'nt-autotyper-panel';
  const panel = {
    root: null, refs: null, host: null, historySig: '', logSig: '', noticeSig: '',
    weekSig: '', chSig: '', seasonSig: '', seasonBaseSig: '',
    calSig: '', accSig: null, updateHealthAt: 0, mountedViews: new Set(['stats']),
  };

  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  // Las filas que aparecen y desaparecen se tocan en cada latido. Escribir el
  // mismo display invalida el estilo aunque el valor no cambie, asi que solo
  // se escribe cuando de verdad cambia.
  function setDisplay(el, show) {
    if (!el) return;
    const value = show ? 'flex' : 'none';
    if (el.style.display !== value) el.style.display = value;
  }

  function setColor(el, value) {
    if (el && el.style.color !== value) el.style.color = value;
  }

  function setGood(el, good) {
    if (!el) return;
    if (good === null) {
      if (el.dataset.good) delete el.dataset.good;
      return;
    }
    const value = good ? '1' : '0';
    if (el.dataset.good !== value) el.dataset.good = value;
  }

  /* --------------------------------------------------------------------------
   * Ajustes del panel (boton ⚙)
   * ------------------------------------------------------------------------ */
  // Lo que viaja en el JSON de exportacion: perfil, tope de tanda, avisos y los
  // interruptores. La version va dentro para poder cambiar el formato mas
  // adelante sin adivinar de que script salio el texto.
  function configSnapshot() {
    return {
      app: 'nitro-wraith',
      version: 1,
      paceProfile,
      raceLimit: session.raceLimit,
      xpLimit: session.xpLimit,
      timeLimit: session.timeLimit,
      activeHours: {
        on: session.activeOn === true,
        start: session.activeStart,
        end: session.activeEnd,
      },
      sound: sfxOn === true,
      breaks: CONFIG.breaks.enabled !== false,
      mysteryBox: CONFIG.mysteryBox.enabled !== false,
      stickers: CONFIG.stickers.enabled !== false,
      guard: CONFIG.guard.enabled !== false,
      useNitro: CONFIG.useNitro !== false,
      nitroStrategy: normalizeNitroStrategy(CONFIG.nitroStrategy),
    };
  }

  // El interruptor de Auto nitro consulta CONFIG en cada tecla. Tambien se
  // guarda en prefs para que una recarga no lo vuelva a encender sin querer.
  function setUseNitro(on, options = {}) {
    const next = on !== false;
    if (CONFIG.useNitro === next) return false;

    CONFIG.useNitro = next;
    if (options.persist !== false) savePrefs();
    paintConfig();
    log(next
      ? `Auto nitro: on (one word per race; strategy ${CONFIG.nitroStrategy}).`
      : 'Auto nitro: off.');
    return true;
  }

  function setNitroStrategy(value, options = {}) {
    const next = normalizeNitroStrategy(value);
    if (CONFIG.nitroStrategy === next) return false;

    CONFIG.nitroStrategy = next;
    nitroPreview = null;
    if (options.persist !== false) savePrefs();
    paintConfig();
    log(`Nitro strategy: ${next}.`);
    return true;
  }

  function setConfigNote(text) {
    if (panel.refs && panel.refs.cfgNote) setText(panel.refs.cfgNote, text);
  }

  // La fila de TUNE que dice que palabra va a saltar el Enter. No se inventa
  // un objetivo fuera de carrera: sin leccion enseña un guion.
  function paintNitroPreview() {
    const node = panel.refs && panel.refs.nitroPreview;
    if (!node) return;

    if (session.nitroDone) {
      nitroPreview = null;
      setText(node, 'used');
      setGood(node, null);
      node.title = 'Nitro target: the one nitro of this race was already spent.';
      return;
    }

    if (session.nitroTries >= 3) {
      nitroPreview = null;
      setText(node, 'blocked');
      setGood(node, false);
      node.title = 'Nitro target: Auto nitro tried three times this race; it will wait for the next race.';
      return;
    }

    if (!nitroPreview) {
      setText(node, '—');
      setGood(node, null);
      node.title = 'Nitro target: waiting for a race with a word of at least 4 letters that leaves enough lesson to pay it back.';
      return;
    }

    setText(node, `${nitroPreview.word} · ${nitroPreview.chars} ch`);
    setGood(node, CONFIG.useNitro ? true : null);
    node.title = `${CONFIG.useNitro ? 'Auto nitro will press Enter on' : 'Auto nitro is off; Enter would skip'}`
      + ` "${nitroPreview.word}" (${nitroPreview.chars} characters).`
      + ` Strategy: ${CONFIG.nitroStrategy}.`
      + ' The saved time is paid back over the rest of the lesson, so WPM does not jump.';
  }

  /* --------------------------------------------------------------------------
   * Tema del panel
   * ------------------------------------------------------------------------ */
  // La piel la manda data-theme en el nodo raiz; el CSS deriva bordes, halos y
  // rellenos del acento. Aqui solo se cambia el atributo, se marca la muestra
  // activa y se guarda la eleccion.
  function paintTheme() {
    // En la pagina del garaje no existe el panel grande: el pequeno se pinta
    // igual, sin depender de `panel.root`.
    if (panel.root) {
      if (panel.root.dataset.theme !== panelTheme) panel.root.dataset.theme = panelTheme;
      if (panel.refs && panel.refs.themeName) {
        setText(panel.refs.themeName, THEME_LABELS[panelTheme] || panelTheme);
      }
      if (panel.refs && panel.refs.themes) {
        for (const button of panel.refs.themes.querySelectorAll('[data-theme-btn]')) {
          const name = button.dataset.themeBtn;
          const active = name === panelTheme;
          button.setAttribute('aria-pressed', active ? 'true' : 'false');
          button.title = `${THEME_LABELS[name] || name}${active ? ': active' : ': switch theme'}`;
        }
      }
    }

    // El panel pequeno del garaje usa la misma piel: se sincroniza en caliente
    // para que cambiar de tema no obligue a recargar la pagina.
    try {
      const host = document.getElementById('nt-queue-panel');
      const small = host && host.shadowRoot ? host.shadowRoot.querySelector('.p') : null;
      if (small && small.dataset.theme !== panelTheme) small.dataset.theme = panelTheme;
      // La fila `theme` del garaje tambien dice cual esta activo; sin esto el
      // ciclo cambiaba la piel pero la etiqueta se quedaba en la anterior.
      const label = host && host.shadowRoot ? host.shadowRoot.querySelector('[data-f="theme"]') : null;
      if (label) {
        const name = THEME_LABELS[panelTheme] || panelTheme;
        label.textContent = name;
        label.setAttribute('aria-label', `Panel theme: ${name}. Activate to cycle.`);
      }
    } catch { /* el panel del garaje todavia no existe */ }
  }

  function setTheme(name, options = {}) {
    if (!THEMES.includes(name) || name === panelTheme) return false;

    panelTheme = name;
    if (options.persist !== false) disk.set(KEYS.panelTheme, name);
    paintTheme();
    log(`Theme: ${THEME_LABELS[name]}.`);
    return true;
  }

  // Alt+T y el control del garaje comparten este ciclo: el orden es el de la
  // rejilla de TUNE y el de siempre, sin una segunda lista que se pueda desfasar.
  function cycleTheme() {
    const index = Math.max(0, THEMES.indexOf(panelTheme));
    return setTheme(THEMES[(index + 1) % THEMES.length]);
  }

  // El panel del garaje vive en la ventana de arriba y el selector en el iframe
  // de la carrera: el aviso de storage es el puente entre los dos. Tambien
  // cubre otra pestaña abierta con el mismo perfil.
  try {
    addEventListener('storage', (event) => {
      if (event.key !== KEYS.panelTheme || !THEMES.includes(event.newValue)) return;
      if (event.newValue === panelTheme) return;
      panelTheme = event.newValue;
      paintTheme();
      log(`Theme: ${THEME_LABELS[panelTheme]} (other tab).`);
    });
  } catch { /* almacenamiento bloqueado */ }

  // Los topes y las horas viven en localStorage y se editan en el panel de la
  // carrera. El aviso storage los lleva a la otra ventana (garaje/cola) sin
  // recargar, para que la cola no abra una carrera con un tope viejo.
  try {
    addEventListener('storage', (event) => {
      const key = event.key;
      if (!key || !event.newValue) return;
      if (key === KEYS.dailyRaceLimit || key === KEYS.dailyXpLimit) invalidateTodayCache();
      const value = Number(event.newValue);
      let changed = false;

      if (key === KEYS.raceLimit && Number.isFinite(value)) {
        session.raceLimit = clamp(value | 0, 0, 500);
        changed = true;
      } else if (key === KEYS.timeLimit && Number.isFinite(value)) {
        const next = clamp(value | 0, 0, 1440);
        if (next && !session.tandaStartedAt && session.races > 0) session.tandaStartedAt = Date.now();
        session.timeLimit = next;
        changed = true;
      } else if (key === KEYS.xpLimit && Number.isFinite(value)) {
        session.xpLimit = clamp(value | 0, 0, 1000000);
        changed = true;
      } else if (key === KEYS.dailyRaceLimit && Number.isFinite(value)) {
        session.dailyRaceLimit = clamp(value | 0, 0, 2000);
        changed = true;
      } else if (key === KEYS.dailyXpLimit && Number.isFinite(value)) {
        session.dailyXpLimit = clamp(value | 0, 0, 10000000);
        changed = true;
      } else if (key === KEYS.activeOn) {
        session.activeOn = event.newValue === '1';
        changed = true;
      } else if (key === KEYS.activeStart || key === KEYS.activeEnd) {
        if (Number.isFinite(value)) {
          if (key === KEYS.activeStart) session.activeStart = clamp(value | 0, 0, 23);
          else session.activeEnd = clamp(value | 0, 0, 23);
          changed = true;
        }
      }

      if (!changed) return;
      updatePanel();
      if (session.activeOn) scheduleActiveResume();
    });
  } catch { /* almacenamiento bloqueado */ }

  // Las caches cortas del arranque no pueden sobrevivir a un cambio hecho en
  // otra ventana. Este evento las invalida antes de que el siguiente tick lea.
  try {
    addEventListener('storage', (event) => {
      const key = event.key;
      if (!key) {
        clearPersistRaw();
        countReadCache.clear();
        calibrationReadAt = 0;
        return;
      }
      if (key === 'persist:nt') clearPersistRaw();
      if (key === KEYS.calibrationAt) calibrationReadAt = 0;
      countReadCache.delete(key);
    });
  } catch { /* almacenamiento bloqueado */ }

  // La foto de temporada la escribe la pestana /season y la lee el panel de la
  // carrera. El evento storage es el puente entre las dos, sin recargar.
  try {
    addEventListener('storage', (event) => {
      if (event.key === KEYS.ntUser) {
        seasonRefreshFromUser(true);
      } else if (event.key !== KEYS.season) return;
      if (panel.refs) panel.seasonSig = '';
      paintSeason(true);
    });
  } catch { /* almacenamiento bloqueado */ }

  function paintConfig() {
    if (!panel.refs || !panel.refs.cfg) return;

    // Perfil de ritmo: los tres botones del segmentado y el deslizador que dice
    // cual manda (el indice, no el texto: es lo que mueve el CSS con muelle).
    for (const button of panel.refs.cfg.querySelectorAll('[data-pace]')) {
      button.dataset.active = button.dataset.pace === paceProfile ? '1' : '0';
    }
    if (panel.refs.seg) {
      const index = Math.max(0, PACE_ORDER.indexOf(paceProfile));
      if (panel.refs.seg.dataset.index !== String(index)) panel.refs.seg.dataset.index = String(index);
    }

    // Interruptores: la pastilla (data-on) es lo que anima la bola; el texto de
    // al lado solo lo cuenta. El sonido entra en el mismo saco aunque no viva en
    // CONFIG: es un interruptor mas de la vista de ajustes.
    const toggles = {
      breaks: CONFIG.breaks.enabled !== false,
      mysteryBox: CONFIG.mysteryBox.enabled !== false,
      stickers: CONFIG.stickers.enabled !== false,
      guard: CONFIG.guard.enabled !== false,
      useNitro: CONFIG.useNitro !== false,
      sound: sfxOn === true,
    };

    for (const button of panel.refs.cfg.querySelectorAll('[data-toggle]')) {
      const key = button.dataset.toggle;
      const on = toggles[key] !== false;
      const value = on ? '1' : '0';
      if (button.dataset.on !== value) button.dataset.on = value;
      button.setAttribute('aria-checked', on ? 'true' : 'false');

      const label = panel.refs.cfg.querySelector(`[data-sw-txt="${key}"]`);
      if (label) {
        setText(label, on ? 'on' : 'off');
        if (label.dataset.on !== value) label.dataset.on = value;
      }
    }

    // Tecno y rango del perfil activo, en la tarjeta de ritmo y en la de guardia.
    const tier = paceRange();
    setText(panel.refs.tuneCap, Number.isFinite(CONFIG.wpm.hardCap) ? `≤ ${CONFIG.wpm.hardCap} wpm` : 'no cap');
    setText(panel.refs.tuneRange, `${tier.min}-${tier.max}`);
    setText(panel.refs.infoCap, String(CONFIG.wpm.hardCap));

    if (panel.refs.nitroStrategy) {
      const strategy = normalizeNitroStrategy(CONFIG.nitroStrategy);
      if (panel.refs.nitroStrategy.value !== strategy) panel.refs.nitroStrategy.value = strategy;
      panel.refs.nitroStrategy.title = `Nitro strategy: ${strategy}. longest fills the most characters; first spends it as soon as a word fits; last waits for the last word that fits. The saved time is paid back over the rest of the lesson.`;
    }

    paintPace();
    paintTheme();
    paintUpdateHealth();
    paintNitroPreview();
  }

  /* --------------------------------------------------------------------------
   * Pestañas del rail
   * ------------------------------------------------------------------------ */
  const TAB_ORDER = ['stats', 'tune', 'log', 'info'];

  // El rail cambia de vista y la vista de ajustes ES el cajon (⚙): asi el boton
  // de siempre sigue significando "ajustes" y no hay dos mecanicas peleandose
  // por el mismo espacio.
  // Una vista inactiva se monta la primera vez que se abre. Sus campos ya
  // existen dentro del <template>, asi que los repintados de fondo no se
  // pierden: al mover el contenido al DOM aparece con los datos al dia.
  function hydrateView(name) {
    if (!panel.host || !panel.host.shadowRoot || !panel.mountedViews) return false;
    if (panel.mountedViews.has(name)) return false;

    const shadow = panel.host.shadowRoot;
    const template = shadow.querySelector(`template[data-view="${name}"]`);
    const views = shadow.querySelector('.views');
    if (!template || !views) return false;

    views.appendChild(template.content);
    template.remove();
    panel.mountedViews.add(name);
    if (name === 'log') {
      panel.logSig = '';
      panel.chSig = '';
      paintLogLists();
      paintChallengeList();
    }
    return true;
  }

  function showTab(name) {
    if (!panel.root || !TAB_ORDER.includes(name)) return;

    hydrateView(name);
    const index = TAB_ORDER.indexOf(name);
    panel.root.dataset.tab = name;
    if (panel.refs.rail) {
      if (panel.refs.rail.dataset.index !== String(index)) {
        panel.refs.rail.dataset.index = String(index);
      }
      // El rail se anuncia como tablist: solo la pestaña activa entra en el
      // orden de tabulacion. Las flechas mueven entre vistas sin usar el raton.
      for (const button of panel.refs.rail.querySelectorAll('[data-tab-btn]')) {
        const active = button.dataset.tabBtn === name;
        const selected = active ? 'true' : 'false';
        if (button.getAttribute('aria-selected') !== selected) {
          button.setAttribute('aria-selected', selected);
        }
        button.tabIndex = active ? 0 : -1;
      }
    }

    const tune = name === 'tune';
    if (panel.root.dataset.cfg !== (tune ? '1' : '0')) panel.root.dataset.cfg = tune ? '1' : '0';
    if (panel.refs.gear) {
      panel.refs.gear.dataset.open = tune ? '1' : '0';
      panel.refs.gear.title = tune
        ? 'Back to the live stats'
        : 'Settings: pace profile, switches, session limit and export/import of the config';
    }

    if (tune) paintConfig();
  }

  // El relleno verde del deslizador no lo pone el navegador: se calcula a mano
  // con --fill, que es lo que lee el degradado del carril.
  function paintLimitSlider() {
    const input = panel.refs && panel.refs.limitSlider;
    if (!input) return;

    const index = LIMIT_STEPS.indexOf(session.raceLimit) >= 0 ? LIMIT_STEPS.indexOf(session.raceLimit) : 0;
    if (input.value !== String(index)) input.value = String(index);
    const fill = `${(index / (LIMIT_STEPS.length - 1)) * 100}%`;
    if (input.style.getPropertyValue('--fill') !== fill) input.style.setProperty('--fill', fill);
    input.title = session.raceLimit
      ? `Races per session: ${session.raceLimit}`
        + (session.raceLimit >= 25 ? ' · the session bonus is capped at 250 XP per race' : '')
      : 'Races per session: free (the bot keeps going until you stop it)';
  }

  // El mismo relleno, para el deslizador de minutos.
  function paintTimeSlider() {
    const input = panel.refs && panel.refs.timeSlider;
    if (!input) return;

    const index = TIME_LIMIT_STEPS.indexOf(session.timeLimit) >= 0 ? TIME_LIMIT_STEPS.indexOf(session.timeLimit) : 0;
    if (input.value !== String(index)) input.value = String(index);
    const fill = `${(index / (TIME_LIMIT_STEPS.length - 1)) * 100}%`;
    if (input.style.getPropertyValue('--fill') !== fill) input.style.setProperty('--fill', fill);
    input.title = session.timeLimit
      ? `Minutes per session: ${session.timeLimit}`
      : 'Minutes per session: free (the bot keeps going until you stop it)';
  }

  // Y el mismo relleno, para el deslizador de XP.
  function paintXpSlider() {
    const input = panel.refs && panel.refs.xpSlider;
    if (!input) return;

    const index = XP_LIMIT_STEPS.indexOf(session.xpLimit) >= 0 ? XP_LIMIT_STEPS.indexOf(session.xpLimit) : 0;
    if (input.value !== String(index)) input.value = String(index);
    const fill = `${(index / (XP_LIMIT_STEPS.length - 1)) * 100}%`;
    if (input.style.getPropertyValue('--fill') !== fill) input.style.setProperty('--fill', fill);
    input.title = session.xpLimit
      ? `XP per session: ${session.xpLimit.toLocaleString()}`
      : 'XP per session: free (the bot keeps going until you stop it)';
  }

  function paintDailyRaceSlider() {
    const input = panel.refs && panel.refs.dailyRaceSlider;
    if (!input) return;

    const index = DAILY_RACE_STEPS.indexOf(session.dailyRaceLimit) >= 0 ? DAILY_RACE_STEPS.indexOf(session.dailyRaceLimit) : 0;
    if (input.value !== String(index)) input.value = String(index);
    const fill = `${(index / (DAILY_RACE_STEPS.length - 1)) * 100}%`;
    if (input.style.getPropertyValue('--fill') !== fill) input.style.setProperty('--fill', fill);
    input.title = session.dailyRaceLimit
      ? `Races per day: ${session.dailyRaceLimit}`
      : 'Races per day: free (no daily race budget)';
  }

  function paintDailyXpSlider() {
    const input = panel.refs && panel.refs.dailyXpSlider;
    if (!input) return;

    const index = DAILY_XP_STEPS.indexOf(session.dailyXpLimit) >= 0 ? DAILY_XP_STEPS.indexOf(session.dailyXpLimit) : 0;
    if (input.value !== String(index)) input.value = String(index);
    const fill = `${(index / (DAILY_XP_STEPS.length - 1)) * 100}%`;
    if (input.style.getPropertyValue('--fill') !== fill) input.style.setProperty('--fill', fill);
    input.title = session.dailyXpLimit
      ? `XP per day: ${session.dailyXpLimit.toLocaleString()}`
      : 'XP per day: free (no daily XP budget)';
  }

  function paintActiveSlider(which) {
    const input = panel.refs && (which === 'start' ? panel.refs.activeStartSlider : panel.refs.activeEndSlider);
    if (!input) return;

    const hour = which === 'start' ? session.activeStart : session.activeEnd;
    if (input.value !== String(hour)) input.value = String(hour);
    const fill = `${(hour / 23) * 100}%`;
    if (input.style.getPropertyValue('--fill') !== fill) input.style.setProperty('--fill', fill);
    const crosses = which === 'end' && session.activeStart >= hour;
    input.title = `${which === 'start' ? 'Start' : 'End'} hour: ${padHour(hour)}${crosses ? ' (the window crosses midnight)' : ''}`;
  }

  // Listas de la vista de registro: las ultimas tandas cerradas y los ultimos
  // avisos. Se construyen nodo a nodo, no con innerHTML: lo que hay en
  // localStorage lo puede haber escrito cualquier cosa.
  /* --------------------------------------------------------------------------
   * Delta del modelo de precision
   * ------------------------------------------------------------------------ */
  const ACC_DELTA_KEY = 'autoTyperAccDeltas';
  let accDeltas = (() => {
    try {
      const raw = JSON.parse(disk.get(ACC_DELTA_KEY, '[]'));
      return Array.isArray(raw) ? raw.filter((n) => Number.isFinite(n)).slice(-20) : [];
    } catch { return []; }
  })();
  // Carrera ya muestreada para model Δ. El juego emite varios `update` por
  // carrera; sin esta clave, una sola llenaba las 20 muestras.
  let accSampleKey = '';
  let accFieldWarned = false;
  // Aviso unico si el paquete de meta no trae reloj: la lista de campos es lo
  // que permite confirmar en vivo que cambio el protocolo del juego.
  let serverWpmWarned = false;

  // Dibuja las ultimas muestras de model Δ como una mini-grafica: el cero es
  // la linea de puntos y la escala se adapta al mayor desvio, para que una
  // muestra de 0.1 pts no se vea como una montaña.
  function paintAccuracySpark() {
    if (!panel.refs || !panel.refs.accSpark) return;
    const spark = panel.refs.accSpark;
    const line = panel.refs.accSparkLine;
    const area = panel.refs.accSparkArea;
    const values = accDeltas.slice(-20);

    if (values.length < 2) {
      spark.dataset.empty = '1';
      line.setAttribute('points', '');
      area.setAttribute('d', '');
      spark.setAttribute('aria-label', values.length
        ? `Accuracy model delta: one sample, ${signedPts(values[0])} pts.`
        : 'Accuracy model delta history: no samples yet.');
      return;
    }

    spark.dataset.empty = '0';
    const top = Math.max(1, ...values.map((value) => Math.abs(value)));
    const width = 100;
    const height = 24;
    const middle = height / 2;
    const points = values.map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = middle - (value / top) * (middle - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    line.setAttribute('points', points.join(' '));
    area.setAttribute('d', `M0,${height} L${points.join(' L')} L${width},${height} Z`);
    spark.setAttribute('aria-label', `Accuracy model delta history: ${values.map((value) => signedPts(value)).join(', ')} pts.`);
  }

  function paintAccuracyDelta() {
    const sig = accDeltas.join(',');
    if (panel.accSig === sig) return;
    panel.accSig = sig;
    paintAccuracySpark();
    if (!panel.refs || !panel.refs.calDelta) return;

    if (!accDeltas.length) {
      setText(panel.refs.calDelta, '—');
      panel.refs.calDelta.title = 'No model Δ samples yet: the first race with a server result fills this row. Alt+Shift+C clears it.';
      return;
    }

    const avg = accDeltas.reduce((sum, n) => sum + n, 0) / accDeltas.length;
    const last = accDeltas.slice(-5).map((n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`).join(' ');
    const range = accDeltas.length > 1 ? Math.max(...accDeltas) - Math.min(...accDeltas) : 0;
    setText(panel.refs.calDelta, `${avg >= 0 ? '+' : ''}${avg.toFixed(1)} pts · n=${accDeltas.length}`);

    // El tooltip lleva lo que la fila no cabe: de donde sale la media y como se
    // mueve. Asi una racha corta no se confunde con una tendencia.
    panel.refs.calDelta.title = `Model Δ (ours − game): avg ${avg >= 0 ? '+' : ''}${avg.toFixed(1)} pts`
      + ` over ${accDeltas.length} race${accDeltas.length === 1 ? '' : 's'}`
      + ` · last ${last}`
      + `${accDeltas.length > 1 ? ` · range ${range.toFixed(1)}` : ''}`
      + ' · Alt+Shift+C clears the trend.';
  }

  // La tendencia se acumula entre sesiones a proposito, pero tras un cambio de
  // modelo (o de cuenta) las muestras viejas pueden tapar una regresion nueva:
  // Alt+Shift+C la empieza de cero sin tocar el historial de carreras.
  function resetAccuracyTrend(silent = false) {
    accDeltas = [];
    accSampleKey = '';
    try { disk.remove(ACC_DELTA_KEY); } catch { /* modo privado */ }
    paintAccuracyDelta();
    if (!silent) log('Accuracy model delta cleared; the trend starts fresh.');
  }

  // ours = correctas/totales; game = lo que el juego imprime. Una diferencia
  // sistematica dice que el modelo de precision esta mal, no que la carrera.
  function noteAccuracyDelta(gameAcc, source = 'server', sampleKey = '') {
    if (sampleKey && sampleKey === accSampleKey) return;
    if (!Number.isFinite(gameAcc) || gameAcc <= 0 || gameAcc > 100) return;
    if (!session || !(session.correct > 0)) return;
    const ours = accuracyNow();
    if (!ours) return;
    if (sampleKey) accSampleKey = sampleKey;

    const delta = Math.round((ours - gameAcc) * 10) / 10;
    accDeltas.push(delta);
    if (accDeltas.length > 20) accDeltas.shift();
    try { disk.set(ACC_DELTA_KEY, JSON.stringify(accDeltas)); } catch { /* modo privado */ }
    paintAccuracyDelta();
    log(`Accuracy model (${source}): ours ${ours.toFixed(1)}% vs game ${gameAcc.toFixed(1)}% -> ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts.`);
  }

  // Gancho de pruebas (inerte en el flujo normal). El banco siembra los
  // contadores de una carrera y engancha el server falso sin teclear, para
  // probar el muestreo de model Δ por el mismo camino que el juego.
  window.__ntaDebug = window.__ntaDebug || {};
  window.__ntaDebug.seedRaceCounters = (patch = {}) => {
    for (const key of ['chars', 'errors', 'correct', 'nitroChars', 'nitroWords', 'startedAt']) {
      const value = Number(patch[key]);
      if (Number.isFinite(value)) session[key] = Math.max(0, value);
    }
  };
  window.__ntaDebug.watchRaceResults = () => watchRaceResults();
  window.__ntaDebug.versionNewer = (candidate, current) => versionNewer(candidate, current || VERSION);
  window.__ntaDebug.readCount = (key) => {
    const name = String(key || '');
    countReadCache.delete(name);
    return readCount(name);
  };
  window.__ntaDebug.accuracyTrend = () => ({
    n: accDeltas.length,
    avg: accDeltas.length ? accDeltas.reduce((sum, n) => sum + n, 0) / accDeltas.length : null,
    deltas: accDeltas.slice(),
  });
  window.__ntaDebug.noteAccuracyDelta = (gameAcc, key = '') =>
    noteAccuracyDelta(Number(gameAcc), 'harness', String(key || ''));
  window.__ntaDebug.resetAccuracy = () => { resetAccuracyTrend(true); return true; };
  window.__ntaDebug.diagnostic = () => diagnosticReport();
  window.__ntaDebug.accuracyTitle = () =>
    (panel.refs && panel.refs.calDelta ? panel.refs.calDelta.title : null);
  window.__ntaDebug.paceProfile = () => paceProfile;
  window.__ntaDebug.paceSignature = () => disk.get(`${KEYS.wpmSeries}:signature`, '');
  window.__ntaDebug.setPaceProfile = (name) => setPaceProfile(String(name || ''), { persist: false });
  window.__ntaDebug.paceRangeFor = (wpm) => wpmRangeFor(wpm);
  window.__ntaDebug.autoPace = () => ({
    range: paceRange(),
    account: accountStats ? { ...accountStats } : null,
    calibrated: calibratedRange ? { ...calibratedRange } : null,
  });
  window.__ntaDebug.progressWpm = (progress) => progressWpm(progress);
  window.__ntaDebug.lastProgress = () => session.lastProgress || null;
  window.__ntaDebug.liveCompareCsv = () => {
    const pair = livePickPair();
    return pair ? liveCompareCsv(pair) : null;
  };

  // Nitro: el banco comprueba la eleccion de palabra y los dos caminos de
  // tecla (handleKeyPress y el Enter real) sin una carrera de verdad.
  window.__ntaDebug.nitroTarget = (content, from, strategy) =>
    nitroTarget(String(content || ''), Number(from), strategy);
  window.__ntaDebug.shouldUseNitro = (content, index) => shouldUseNitro(String(content || ''), Number(index));
  window.__ntaDebug.autoNitro = () => CONFIG.useNitro !== false;
  window.__ntaDebug.setAutoNitro = (on) => setUseNitro(Boolean(on));
  window.__ntaDebug.nitroStrategy = () => CONFIG.nitroStrategy;
  window.__ntaDebug.setNitroStrategy = (value) => setNitroStrategy(String(value || ''));
  window.__ntaDebug.useNitro = (app) => useNitro(app);
  window.__ntaDebug.pressNitroKey = () => pressNitroKey();
  window.__ntaDebug.nitroPreview = () => (nitroPreview ? { ...nitroPreview } : null);
  window.__ntaDebug.updateState = () => updateState();
  window.__ntaDebug.updateBusy = () => updateChecking;
  window.__ntaDebug.checkForUpdate = (force) => checkForUpdate(Boolean(force));
  window.__ntaDebug.calibrationAuto = () => CONFIG.calibration.auto === true;
  window.__ntaDebug.refreshCalibration = () => refreshCalibration();

  // El banco detiene esta copia sin tocar el teclado: el guardia debe soltar el
  // registro en el siguiente latido para que la otra copia tome el relevo.
  window.__ntaDebug.stop = () => panic('debug stop');
  window.__ntaDebug.resume = () => resumeAuto();

  // Mapa de refs del panel con una identidad por nodo. El banco comprueba que
  // dos refs no comparten elemento y que una ref con data-field apunta al suyo;
  // asi se caza un selector ancho que robe la fila de otra tarjeta.
  window.__ntaDebug.refsAudit = () => {
    if (!panel.refs) return null;

    const ids = new Map();
    const out = {};
    let next = 0;

    for (const [key, el] of Object.entries(panel.refs)) {
      if (!el) {
        out[key] = { id: null, field: null };
        continue;
      }

      if (!ids.has(el)) ids.set(el, `n${++next}`);
      out[key] = {
        id: ids.get(el),
        field: typeof el.getAttribute === 'function' ? el.getAttribute('data-field') : null,
      };
    }

    return out;
  };

  // Estado de los tres topes y si ya se alcanzo alguno. Lo usa el banco para
  // probar los bordes; en el flujo normal nadie lo llama.
  window.__ntaDebug.session = () => ({
    races: session.races,
    xp: session.xp,
    gaps: session.gapSamples.length,
    nitroRaces: session.nitroRaces,
    nitroCharsTotal: session.nitroCharsTotal,
    dailyRaceLimit: session.dailyRaceLimit,
    dailyXpLimit: session.dailyXpLimit,
    dailyRaces: dailyCaps().races,
    dailyXp: dailyCaps().xp,
    dailyReached: dailyLimitReached(),
    activeOn: session.activeOn,
    activeStart: session.activeStart,
    activeEnd: session.activeEnd,
    activeOpen: activeWindow().open,
    activeNextAt: activeWindow().nextAt,
    tandaStartedAt: session.tandaStartedAt,
    raceLimit: session.raceLimit,
    timeLimit: session.timeLimit,
    xpLimit: session.xpLimit,
    reached: limitReached(),
    reason: capReason(),
    timeLeft: timeLimitLeft(),
  });

  // Mueve los contadores de la tanda sin esperar a que lleguen carreras. Solo
  // escribe en memoria: no guarda el resumen del dia ni el historico.
  window.__ntaDebug.patchSession = (patch = {}) => {
    for (const key of ['races', 'xp', 'tandaStartedAt', 'raceLimit', 'timeLimit', 'xpLimit', 'dailyRaceLimit', 'dailyXpLimit', 'activeOn', 'activeStart', 'activeEnd', 'nitroRaces', 'nitroCharsTotal', 'lastEndAt', 'sumRaces', 'sumWpm', 'sumTarget', 'sumAcc']) {
      const value = Number(patch[key]);
      if (Number.isFinite(value)) session[key] = Math.max(0, value);
    }
    // El banco tambien puede sembrar el reloj de la carrera y sus muestras.
    for (const key of ['startedAt', 'endedAt', 'chars', 'nitroChars', 'correct', 'errors', 'pos', 'startIndex']) {
      if (patch[key] === undefined) continue;
      const value = Number(patch[key]);
      if (Number.isFinite(value)) session[key] = Math.max(0, value);
    }
    if (patch.clockDone !== undefined) session.clockDone = Boolean(patch.clockDone);
    // El harness tambien puede fotografiar el panel en estado de carrera sin
    // teclear de verdad; no toca ninguna otra parte del flujo.
    if (patch.typing !== undefined) session.typing = Boolean(patch.typing);
    if (patch.stopped !== undefined) session.stopped = Boolean(patch.stopped);
    if (patch.closed !== undefined) session.closed = Boolean(patch.closed);
    if (Array.isArray(patch.clockSamples)) {
      session.clockSamples = patch.clockSamples.map(Number).filter(Number.isFinite);
    }
    if (patch.lastHudWpm !== undefined) session.lastHudWpm = Math.max(0, Number(patch.lastHudWpm) || 0);
    // El nitro tambien se puede sembrar: el banco prueba su eleccion y sus dos
    // caminos de tecla sin esperar a que llegue una carrera.
    if (patch.trim !== undefined) session.trim = clamp(Number(patch.trim) || 1, 0.9, 1.1);
    if (patch.nitroDone !== undefined) session.nitroDone = Boolean(patch.nitroDone);
    if (patch.nitroTries !== undefined) session.nitroTries = Math.max(0, Number(patch.nitroTries) || 0);
    updatePanel();
  };

  // Una carrera registrada por el camino normal (recordRace) y el estado de la
  // eleccion entre copias. Sirven para probar el XP real y el guardia sin
  // teclear una carrera de verdad.
  window.__ntaDebug.recordRace = () => recordRace();
  window.__ntaDebug.countRace = () => countRace();
  window.__ntaDebug.freshTanda = (reason) => startFreshTanda(String(reason || ''));
  window.__ntaDebug.tandaSummary = () => tandaSummary();
  // El banco aplica el paquete oficial por el mismo camino que el juego y lee
  // la aportacion guardada para comprobar la correccion de la media.
  window.__ntaDebug.serverWpm = (value, key = '') => applyServerWpm(Number(value), String(key || ''));
  window.__ntaDebug.sessionTotals = () => {
    const avg = tandaAverages();
    return {
      sumRaces: session.sumRaces,
      sumWpm: Math.round(session.sumWpm * 100) / 100,
      avg: avg ? Number(avg.wpm.toFixed(2)) : null,
      ledger: Array.isArray(session.sumWpmLedger)
        ? session.sumWpmLedger.map((item) => ({ ...item }))
        : [],
    };
  };
  // El banco comprueba que el oficial rehace la calibracion del ritmo desde la
  // misma base y que la pendiente sobrevive a la foto de la tanda.
  window.__ntaDebug.autocalibrate = (row = null) => {
    autocalibrate(row || raceHistory[raceHistory.length - 1] || null);
    return window.__ntaDebug.trimState();
  };
  window.__ntaDebug.trimState = () => {
    const target = Number(profile.targetWPM);
    return {
      trim: Math.round(session.trim * 10000) / 10000,
      at: session.trimAt,
      base: session.trimBase,
      applied: session.trimApplied,
      target,
      targetAt: session.trimTarget,
      min: Math.max(0.9, target / paceCap()),
    };
  };
  // La cola avanza la serie justo al cerrar: el banco reproduce ese cambio de
  // objetivo antes de entregar el paquete oficial.
  window.__ntaDebug.advanceSessions = () => {
    advanceSessions();
    return window.__ntaDebug.trimState();
  };
  window.__ntaDebug.hudWpm = (force = true) => hudWpm(Boolean(force));
  window.__ntaDebug.hudForGuard = (typed = 60) => hudForGuard(Number(typed) || 0);
  // Aviso de conexion del servidor de la carrera: el banco comprueba el
  // detector y la salida (garaje) sin esperar a que se caiga una conexion.
  window.__ntaDebug.connectionText = (text) => looksLikeConnectionError(String(text || ''));
  window.__ntaDebug.connectionError = () => ({ seen: connErrorSeenAt, exit: lastConnExitAt });
  window.__ntaDebug.connectionExit = () => {
    lastConnExitAt = 0;
    return abandonRaceForConnectionError();
  };
  window.__ntaDebug.perf = () => ({ ...perfCounters });
  window.__ntaDebug.paintEveryMs = () => panelPaintEveryMs();
  window.__ntaDebug.typing = () => Boolean(session.typing);
  window.__ntaDebug.startup = () => ({
    nodes: panel.host && panel.host.shadowRoot
      ? panel.host.shadowRoot.querySelectorAll('*').length
      : 0,
    createdNodes: perfCounters.panelNodes,
    views: panel.host && panel.host.shadowRoot
      ? panel.host.shadowRoot.querySelectorAll('.view').length
      : 0,
    storageReads: perfCounters.storageReads,
    at: Date.now(),
  });
  window.__ntaDebug.hydrateAllViews = () => {
    for (const name of ['tune', 'log', 'info']) hydrateView(name);
    return window.__ntaDebug.startup();
  };
  window.__ntaDebug.perfReset = () => {
    for (const key of Object.keys(perfCounters)) perfCounters[key] = 0;
    return { ...perfCounters };
  };
  window.__ntaDebug.paint = (force = false) => {
    updatePanel(Boolean(force));
    return { ...perfCounters };
  };
  window.__ntaDebug.calibrateClock = () => calibrateRaceClock(
    Date.now(), hudWpm(), Math.max(0, session.chars - session.nitroChars),
  );
  window.__ntaDebug.clock = () => ({
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    done: session.clockDone,
    samples: Array.isArray(session.clockSamples) ? session.clockSamples.slice() : [],
    wpm: wpmNow(),
    hud: Number(session.lastHudWpm) || null,
  });

  // El banco siembra el historial sin teclear diez carreras: comprueba la
  // tarjeta (hora, puesto, XP, WPM) por el mismo render que usa el panel.
  // Huecos entre carreras: el banco los siembra y los mide por el mismo
  // camino que el juego (noteRaceStart), sin esperar a dos carreras reales.
  window.__ntaDebug.seedGaps = (list = []) => {
    session.gapSamples = (Array.isArray(list) ? list : [])
      .map((ms) => Number(ms))
      .filter((ms) => Number.isFinite(ms) && ms > 0 && ms <= GAP_MAX_MS)
      .slice(-GAP_SAMPLES);
    if (panel.refs) updatePanel();
    return session.gapSamples.length;
  };
  window.__ntaDebug.gaps = () => session.gapSamples.slice();
  window.__ntaDebug.noteRaceStart = (at) => noteRaceStart(Number(at) || Date.now());
  window.__ntaDebug.daily = () => dailyCaps();
  window.__ntaDebug.setDailyCounts = (races, xp) => {
    dailyCountsOverride = {
      races: Math.max(0, Number(races) || 0),
      xp: Math.max(0, Number(xp) || 0),
    };
    updatePanel();
    return dailyCaps();
  };
  window.__ntaDebug.clearDailyCounts = () => {
    dailyCountsOverride = null;
    updatePanel();
  };
  // Sin cabecera de datos la fila no puede inventarse una media.
  window.__ntaDebug.parseLiveCsv = (text) => parseLiveCsv(String(text || ''));
  window.__ntaDebug.parseLiveJson = (text) => parseLiveJson(String(text || ''));
  window.__ntaDebug.active = () => activeWindow();
  window.__ntaDebug.activeAt = (start, end, hour, minute = 0, dayOffset = 0) => {
    const at = new Date();
    at.setDate(at.getDate() + dayOffset);
    at.setHours(hour, minute, 0, 0);
    return activeWindowAt({ on: true, start, end }, at.getTime());
  };
  window.__ntaDebug.activeGateAt = (start, end, hour, minute = 0, dayOffset = 0) => {
    const at = new Date();
    at.setDate(at.getDate() + dayOffset);
    at.setHours(hour, minute, 0, 0);
    return gateFromActiveWindow(activeWindowAt({ on: true, start, end }, at.getTime()));
  };
  window.__ntaDebug.seedHistory = (rows = []) => {
    raceHistory = (Array.isArray(rows) ? rows : [])
      .filter((item) => item && Number.isFinite(item.wpm) && Number.isFinite(item.acc))
      .slice(-CONFIG.historySize)
      .map((item) => ({ ...item, at: Number.isFinite(item.at) ? item.at : Date.now() }));
    try { localStorage.setItem(KEYS.history, JSON.stringify(raceHistory)); } catch { /* bloqueado */ }
    if (panel.refs) {
      panel.historySig = '';
      renderHistory();
    }
    return raceHistory.length;
  };
  // La foto de temporada se puede leer, parsear y repintar sin abrir Season:
  // el banco le pasa un DOM de prueba y comprueba el mismo camino que la web.
  window.__ntaDebug.season = () => seasonRead();
  window.__ntaDebug.parseSeason = (root) => parseSeasonPage(root || document);
  window.__ntaDebug.paintSeason = () => {
    panel.seasonSig = '';
    paintSeason(true);
    return seasonRead();
  };
  // El banco fuerza el repintado del panel de carrera para comprobar el
  // puente de la Mystery Box sin esperar al latido.
  window.__ntaDebug.paintPanel = () => {
    updatePanel();
  };
  window.__ntaDebug.captureSeason = () => captureSeasonPage();
  window.__ntaDebug.seasonRefresh = (force = true) => seasonRefreshFromUser(Boolean(force));
  window.__ntaDebug.seasonUserXp = () => seasonUserXp();
  window.__ntaDebug.seasonPace = () => seasonPace(seasonRead());
  window.__ntaDebug.seasonAlerts = () => seasonAlertText(seasonRead());
  window.__ntaDebug.seasonXpPerRace = () => seasonXpPerRace();

  window.__ntaDebug.tabLease = () => tabLeaseInfo();
  window.__ntaDebug.dropTabLease = () => releaseTabLease(true);
  // Liberacion normal (sin force), para el banco: comprueba que una pestaña
  // suelta el lease aunque lo haya escrito su otra mitad.
  window.__ntaDebug.releaseLease = () => releaseTabLease();
  window.__ntaDebug.role = () => {
    const standby = standbyActive();
    let frame = null;
    try {
      if (window.top !== window) frame = window.top.__ntaFrame || null;
    } catch { frame = null; }
    return {
      id: guardId,
      primary: primaryRole && tabPrimary,
      local: primaryRole,
      peers: peerCount,
      standby,
      tab: tabLeaseInfo(),
      typing: session.typing,
      frame: frame ? { standby: frame.standby, typing: frame.typing } : null,
    };
  };

  /* --------------------------------------------------------------------------
   * Daily Challenges: progreso real
   * ------------------------------------------------------------------------ */
  let chCache = [];
  let chAllCache = [];
  let chReadAt = 0;
  let chResetAt = 0;
  let chKnown = new Set();
  let chDone = new Set();
  let chStamp = -1;

  // Un aviso por reto, una sola vez. La primera lectura de cada definicion solo
  // siembra el estado: abrir la pagina con un reto ya hecho no genera avisos.
  function noteChallengeState(list) {
    const stamp = chResetAt || 0;
    if (stamp !== chStamp) {
      chStamp = stamp;
      chKnown = new Set();
      chDone = new Set();
    }
    let completed = false;
    for (const item of list) {
      const done = item.goal > 0 && item.progress >= item.goal;
      if (!chKnown.has(item.key)) {
        chKnown.add(item.key);
        if (done) chDone.add(item.key);
        continue;
      }
      if (done && !chDone.has(item.key)) {
        chDone.add(item.key);
        // La lectura se fuerza para ver lo que acaba de escribir otra ventana;
        // la clave del reto evita contarlo dos veces en el mismo dia.
        todayCache = null;
        const day = todayRead();
        if (!Array.isArray(day.chKeys) || !day.chKeys.includes(item.key)) {
          todayBump({ chKey: item.key, at: Date.now() });
        }
        log(`Daily Challenge complete: ${item.title} (${item.goal}/${item.goal}).`);
        completed = true;
      }
    }
    return completed;
  }

  function challengeEntries(active, progress, types) {
    return active.map((challenge) => {
      const entry = progress.find((item) => item && item.challengeID === challenge.challengeID);
      let short = String(challenge.type || 'challenge');
      let title = `Challenge ${challenge.type}`;
      if (types && types[challenge.type]) {
        const [template, field] = types[challenge.type];
        if (typeof field === 'string' && field) short = field;
        if (typeof template === 'string') {
          title = template
            .replace(/\$\{goal\}/g, String(challenge.goal ?? '?'))
            .replace(/\$\{field\}/g, `${field}${Number(challenge.goal) === 1 ? '' : 's'}`);
        }
      }
      return {
        key: String(challenge.challengeID ?? `${challenge.type}:${challenge.goal}`),
        short,
        title,
        progress: Number(entry && entry.progress) || 0,
        goal: Number(challenge.goal) || 0,
      };
    });
  }

  function readChallengeProgress() {
    if (Date.now() - chReadAt < 5000) return chCache;
    chReadAt = Date.now();

    let user = null;
    try {
      const raw = JSON.parse(persistRaw());
      if (raw && raw.user) user = JSON.parse(raw.user);
    } catch { user = null; }

    const progress = user && Array.isArray(user.challenges) ? user.challenges : [];
    // El garaje pinta las definiciones en la ventana de arriba; la carrera es
    // un iframe y alli `window.NTGLOBALS` puede faltar. Se miran las dos
    // ventanas (mismo origen) antes de quedarse sin titulos ni metas.
    const windows = [window];
    try {
      if (window.top && window.top !== window) windows.push(window.top);
    } catch { /* otro origen */ }
    let defs = [];
    let types = null;
    for (const win of windows) {
      try {
        const globals = win.NTGLOBALS;
        if (!defs.length && globals && Array.isArray(globals.CHALLENGES) && globals.CHALLENGES.length) {
          defs = globals.CHALLENGES;
        }
        if (!types && globals && globals.CHALLENGE_TYPES) types = globals.CHALLENGE_TYPES;
      } catch { /* otro origen */ }
    }
    const now = Math.floor(Date.now() / 1000);

    if (defs.length) {
      const active = defs.filter((challenge) => challenge && Number(challenge.expiration) > now);
      chResetAt = active.reduce((min, challenge) => {
        const at = Number(challenge.expiration) * 1000;
        return at > 0 && (!min || at < min) ? at : min;
      }, 0);
      chAllCache = challengeEntries(active, progress, types);
      chCache = chAllCache.slice(0, 3);
      if (noteChallengeState(chCache)) schedulePanelRefresh();
      return chCache;
    }

    chResetAt = 0;
    chAllCache = progress.map((item, index) => {
      const at = Number(item.expiration) * 1000;
      if (at > 0 && (!chResetAt || at < chResetAt)) chResetAt = at;
      return {
        key: String(item.challengeID ?? `c${index}`),
        short: String(item.type || 'challenge'),
        title: `Challenge ${item.challengeID ?? '?'}`,
        progress: Number(item.progress) || 0,
        goal: Number(item.goal) || 0,
      };
    });
    chCache = chAllCache.slice(0, 3);
    if (noteChallengeState(chCache)) schedulePanelRefresh();
    return chCache;
  }

  function challengeProgressAll() {
    readChallengeProgress();
    return chAllCache;
  }

  window.__ntaDebug = window.__ntaDebug || {};
  window.__ntaDebug.challengeProgress = () => readChallengeProgress();
  window.__ntaDebug.challengeProgressAll = () => challengeProgressAll();
  window.__ntaDebug.challengeReset = () => chResetAt;
  window.__ntaDebug.refreshChallenges = () => {
    chReadAt = 0;
    clearPersistRaw();
    return readChallengeProgress();
  };

  function paintChallengeList() {
    if (!panel.refs || !panel.refs.chList) return;

    const list = readChallengeProgress();
    const sig = JSON.stringify(list);
    if (panel.chSig === sig) return;
    panel.chSig = sig;

    panel.refs.chList.textContent = '';
    const done = list.filter((item) => item.goal > 0 && item.progress >= item.goal).length;
    setText(panel.refs.chCount, list.length ? `${done}/${list.length}` : 'no data');
    if (panel.refs.chCount) {
      const resetMin = chResetAt > Date.now() ? Math.ceil((chResetAt - Date.now()) / 60000) : 0;
      const resetLeft = resetMin >= 60 ? `${Math.round(resetMin / 60)} h` : (resetMin > 0 ? `${resetMin} min` : '');
      panel.refs.chCount.title = list.length
        ? `${done} of ${list.length} Daily Challenges complete.${resetLeft ? ` Resets in ${resetLeft} (00:00 ET).` : ''}`
        : '';
    }

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'log-empty';
      empty.textContent = 'no challenge data yet';
      panel.refs.chList.appendChild(empty);
      return;
    }

    for (const item of list) {
      const row = document.createElement('div');
      row.className = 'log-item';
      const label = document.createElement('span');
      label.textContent = item.title;
      const value = document.createElement('b');
      value.textContent = item.goal
        ? `${Math.min(item.progress, item.goal)}/${item.goal}`
        : String(item.progress);
      row.append(label, value);
      panel.refs.chList.appendChild(row);
    }
  }

  function paintLogLists() {
    const prevSig = `${tandaLog.length}:${tandaLog.length ? tandaLog[tandaLog.length - 1].at : 0}`;
    if (panel.refs.closedList && panel.logSig !== prevSig) {
      panel.logSig = prevSig;
      const recent = tandaLog.slice(-4).reverse();
      panel.refs.closedList.textContent = '';

      if (!recent.length) {
        const empty = document.createElement('div');
        empty.className = 'log-empty';
        empty.textContent = 'no closed sessions yet';
        panel.refs.closedList.appendChild(empty);
      } else {
        for (const item of recent) {
          const row = document.createElement('div');
          row.className = 'log-item';

          const at = document.createElement('i');
          at.textContent = clockText(item.at) || '—';

          const mid = document.createElement('span');
          const bits = [`${item.races} race${item.races === 1 ? '' : 's'}`];
          if (item.dq) bits.push(`${item.dq} DQ`);
          bits.push(item.reason || 'closed');
          mid.textContent = bits.join(' · ');
          mid.title = `${item.races} races closed · by ${item.reason || 'hand'}${item.dq ? ` · ${item.dq} DQ` : ''}`;

          const dev = Number.isFinite(item.wpm) && item.target > 0
            ? ((item.wpm - item.target) / item.target) * 100
            : null;
          const val = document.createElement('b');
          val.textContent = Number.isFinite(item.wpm)
            ? `${item.wpm.toFixed(1)}${dev === null ? '' : ` ${dev >= 0 ? '+' : ''}${dev.toFixed(1)}%`}`
            : '—';
          if (dev !== null) val.dataset.good = Math.abs(dev) <= 2 ? '1' : '0';

          row.append(at, mid, val);
          panel.refs.closedList.appendChild(row);
        }
      }

      setText(panel.refs.logCount, tandaLog.length ? `${tandaLog.length} in the log` : 'empty');
    }

    // Historico de la semana: una fila por dia, de mas nuevo a mas viejo. La
    // firma incluye todo lo que pinta la fila: si cambian los retos completados
    // sin cambiar las carreras, la tarjeta tiene que repintarse igual.
    const week = dayHistoryRead();
    const weekSig = week.map((day) => `${day.date}:${day.races}:${day.dq}:${day.boxes}`
      + `:${day.chKeys ? day.chKeys.length : 0}:${day.xp}:${Math.round(day.sumWpm)}`).join('|');
    if (panel.refs.weekList && panel.weekSig !== weekSig) {
      panel.weekSig = weekSig;
      panel.refs.weekList.textContent = '';

      if (!week.length) {
        const empty = document.createElement('div');
        empty.className = 'log-empty';
        empty.textContent = 'no days recorded yet';
        panel.refs.weekList.appendChild(empty);
      } else {
        for (const day of [...week].reverse()) {
          const row = document.createElement('div');
          row.className = 'log-item';

          const at = document.createElement('i');
          at.textContent = day.date.slice(5);

          const bits = [`${day.races} race${day.races === 1 ? '' : 's'}`];
          if (day.dq) bits.push(`${day.dq} DQ`);
          if (day.boxes) bits.push(`${day.boxes} box${day.boxes === 1 ? '' : 'es'}`);
          if (day.chKeys && day.chKeys.length) {
            bits.push(`${day.chKeys.length} challenge${day.chKeys.length === 1 ? '' : 's'}`);
          }
          if (day.xp) bits.push(`${day.xp.toLocaleString()} XP`);

          const mid = document.createElement('span');
          mid.textContent = bits.join(' · ');

          const avg = day.races > 0 ? day.sumWpm / day.races : null;
          const target = day.races > 0 ? day.sumTarget / day.races : 0;
          mid.title = avg === null
            ? `${day.date}: no measured races`
            : `${day.date}: ${bits.join(', ')} · ${avg.toFixed(1)} WPM against ${target.toFixed(1)}`;

          const val = document.createElement('b');
          val.textContent = avg === null ? '—' : avg.toFixed(1);
          if (avg !== null && target > 0) {
            val.dataset.good = Math.abs((avg - target) / target) <= 0.02 ? '1' : '0';
          }

          row.append(at, mid, val);
          panel.refs.weekList.appendChild(row);
        }
      }

      const total = week.reduce((sum, day) => sum + day.races, 0);
      const xpTotal = week.reduce((sum, day) => sum + (day.xp || 0), 0);
      setText(panel.refs.weekTotal, total
        ? `${total} races${xpTotal ? ` · ${xpTotal.toLocaleString()} XP` : ''}`
        : 'empty');
    }

    const noticeSig = `${noticeRing.length}:${noticeRing.length ? noticeRing[noticeRing.length - 1].at : 0}`;
    if (panel.refs.noticeList && panel.noticeSig !== noticeSig) {
      panel.noticeSig = noticeSig;
      const recent = noticeRing.slice(-5).reverse();
      panel.refs.noticeList.textContent = '';

      if (!recent.length) {
        const empty = document.createElement('div');
        empty.className = 'log-empty';
        empty.textContent = 'nothing to report yet';
        panel.refs.noticeList.appendChild(empty);
      } else {
        for (const item of recent) {
          const row = document.createElement('div');
          row.className = 'notice-item';

          const at = document.createElement('i');
          at.textContent = clockText(item.at) || '—';
          const text = document.createElement('span');
          text.textContent = item.text;
          text.title = item.text;

          row.append(at, text);
          panel.refs.noticeList.appendChild(row);
        }
      }
    }
  }

  // Un numero que cambia se anuncia con un golpe corto de escala. Solo cuando
  // cambia la parte entera: si no, el WPM vivo parpadearia en cada tick.
  function flashValue(el, text) {
    if (!el) return;

    const bucket = String(Math.round(parseFloat(text)));
    if (el.dataset.bucket === bucket) {
      setText(el, text);
      return;
    }

    const had = el.dataset.bucket !== undefined && el.textContent !== '—';
    el.dataset.bucket = bucket;
    setText(el, text);
    if (!had) return;

    // Reiniciar la animacion leyendo offsetWidth fuerza un layout sincrono
    // dentro de la carrera. El bump puede empezar en el siguiente frame: se ve
    // igual y no bloquea el hilo que esta mandando las teclas.
    el.classList.remove('bump');
    if (typeof requestAnimationFrame === 'function') {
      if (el.__ntaBumpFrame) cancelAnimationFrame(el.__ntaBumpFrame);
      el.__ntaBumpFrame = requestAnimationFrame(() => {
        el.__ntaBumpFrame = 0;
        if (el.isConnected) el.classList.add('bump');
      });
    } else {
      el.classList.add('bump');
    }
  }

  // Export: al portapapeles y al cuadro de texto a la vez. Si el portapapeles
  // esta bloqueado (permiso, contexto sin foco) queda el texto seleccionado para
  // copiarlo a mano, que es lo que haria cualquiera.
  function exportConfig() {
    const text = JSON.stringify(configSnapshot(), null, 1);
    const box = panel.refs && panel.refs.cfgText;

    if (box) {
      box.value = text;
      try {
        box.select();
      } catch { /* seleccion no disponible */ }
    }

    const manual = () => setConfigNote('Clipboard blocked: the config is in the box, copy it by hand.');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => setConfigNote('Config copied to the clipboard.'))
          .catch(manual);
      } else {
        manual();
      }
    } catch {
      manual();
    }
    log('Config exported: pace, limit, sound and the switches.');
  }

  function importConfig() {
    const box = panel.refs && panel.refs.cfgText;
    const raw = box ? box.value.trim() : '';
    if (!raw) return setConfigNote('Paste a config in the box first.');

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      return setConfigNote('That is not valid JSON.');
    }
    if (!data || typeof data !== 'object') return setConfigNote('That is not a config object.');

    const done = [];

    // Un config exportado antes de 7.13.0 trae paceProfile: "normal"; se lee
    // como balanced en vez de rechazar la importacion entera.
    const importedPace = data.paceProfile === 'normal' ? 'balanced' : data.paceProfile;
    if (typeof importedPace === 'string' && PACE_PROFILES[importedPace]) {
      setPaceProfile(importedPace);
      done.push(`pace ${importedPace}`);
    }

    if (Number.isFinite(Number(data.raceLimit))) {
      setRaceLimit(clamp(Math.round(Number(data.raceLimit)), 0, 500));
      done.push(session.raceLimit ? `limit ${session.raceLimit}` : 'limit free');
    }

    if (Number.isFinite(Number(data.timeLimit))) {
      setTimeLimit(clamp(Math.round(Number(data.timeLimit)), 0, 1440));
      done.push(session.timeLimit ? `time limit ${limitMinutesText(session.timeLimit)}` : 'time limit free');
    }

    if (Number.isFinite(Number(data.xpLimit))) {
      setXpLimit(clamp(Math.round(Number(data.xpLimit)), 0, 1000000));
      done.push(session.xpLimit ? `xp limit ${limitXpText(session.xpLimit)}` : 'xp limit free');
    }

    if (data.activeHours && typeof data.activeHours === 'object') {
      const hours = data.activeHours;
      if (Number.isFinite(Number(hours.start))) {
        setActiveHour('start', clamp(Math.round(Number(hours.start)), 0, 23), true);
      }
      if (Number.isFinite(Number(hours.end))) {
        setActiveHour('end', clamp(Math.round(Number(hours.end)), 0, 23), true);
      }
      if (typeof hours.on === 'boolean') setActiveOn(hours.on, true);
      done.push(session.activeOn ? `hours ${padHour(session.activeStart)}–${padHour(session.activeEnd)}` : 'hours off');
    }

    for (const key of ['breaks', 'mysteryBox', 'stickers', 'guard']) {
      if (typeof data[key] === 'boolean' && CONFIG[key]) {
        CONFIG[key].enabled = data[key];
        done.push(`${key} ${data[key] ? 'on' : 'off'}`);
      }
    }

    if (typeof data.useNitro === 'boolean') {
      setUseNitro(data.useNitro, { persist: false });
      done.push(`auto nitro ${data.useNitro ? 'on' : 'off'}`);
    }

    if (typeof data.nitroStrategy === 'string'
      && setNitroStrategy(data.nitroStrategy, { persist: false })) {
      done.push(`nitro strategy ${CONFIG.nitroStrategy}`);
    }

    if (typeof data.sound === 'boolean') {
      setSfx(data.sound, true);
      done.push(`sound ${data.sound ? 'on' : 'off'}`);
    }

    savePrefs();
    paintConfig();

    if (!done.length) return setConfigNote('Nothing in there this script understands.');
    setConfigNote(`Applied: ${done.join(' · ')}.`);
    log(`Config imported: ${done.join(', ')}.`);
  }

  // Informe de diagnostico: todo lo necesario para entender que esta pasando
  // sin abrir la consola y sin contarlo de memoria. Va con los ultimos avisos y
  // su hora, que es lo que se pierde cuando el panel solo pinta el ultimo.
  function diagnosticReport() {
    const tier = paceRange();
    const day = todayRead();
    const readJson = (key) => {
      try {
        return JSON.parse(disk.get(key, 'null'));
      } catch {
        return null;
      }
    };

    const queueNotice = readJson('ntQueue:notice');
    const stuck = readJson(STUCK_STATE);
    const boxNext = Number(disk.get(BOX_STATE_NEXT, '0')) || 0;
    const boxLast = Number(disk.get(BOX_STATE_LAST, '0')) || 0;
    const averages = tandaAverages();
    const closed = readJson(KEYS.tandaLog);
    const eta = etaRemaining();
    const previous = Array.isArray(closed) && closed.length ? closed[closed.length - 1] : null;
    const update = updateState();

    return {
      app: 'nitro-wraith',
      version: VERSION,
      at: new Date().toISOString(),
      page: location.pathname,
      mode: MODE,
      profile: { name: paceProfile, min: tier.min, max: tier.max, hardCap: CONFIG.wpm.hardCap },
      target: {
        wpm: profile.targetWPM,
        accuracyGoal: Number(profile.accuracyGoal.toFixed(1)),
        sample: `${profile.wpmSession}/${profile.wpm.length}`,
      },
      typing: {
        live: Number(wpmNow().toFixed(1)),
        accuracy: Number(accuracyNow().toFixed(1)),
        chars: session.chars,
        pos: session.pos,
        total: session.total,
        // Mayor recorte del gobernador en la carrera actual: si es grande, el
        // reporte ensena por que una carrera se arrastro sin abrir el log.
        capHoldMs: Math.round(session.capMaxWait || 0),
      },
      flags: {
        paused: session.paused,
        stopped: session.stopped,
        typing: session.typing,
        stopAfterRace: session.stopAfterRace,
        primary: primaryRole,
        copies: peerCount,
      },
      switches: {
        breaks: CONFIG.breaks.enabled !== false,
        mysteryBox: CONFIG.mysteryBox.enabled !== false,
        stickers: CONFIG.stickers.enabled !== false,
        guard: CONFIG.guard.enabled !== false,
        useNitro: CONFIG.useNitro !== false,
        nitroStrategy: CONFIG.nitroStrategy,
        sound: sfxOn === true,
      },
      nitro: nitroPreview
        ? { index: nitroPreview.index, word: nitroPreview.word, chars: nitroPreview.chars }
        : null,
      update: update
        ? {
          checkedAt: new Date(update.at).toISOString(),
          ageMin: Math.round(update.ageMs / 60000),
          status: update.status,
          error: update.error,
          latest: update.latest,
        }
        : null,
      model: {
        samples: accDeltas.length,
        average: accDeltas.length
          ? Number((accDeltas.reduce((sum, n) => sum + n, 0) / accDeltas.length).toFixed(1))
          : null,
        last: accDeltas.slice(-5),
        range: accDeltas.length > 1
          ? Number((Math.max(...accDeltas) - Math.min(...accDeltas)).toFixed(1))
          : null,
      },
      session: {
        races: session.races,
        limit: session.raceLimit,
        timeLimit: session.timeLimit,
        xpLimit: session.xpLimit,
        xp: session.xp,
        dayXp: Math.max(0, Math.round(day.xp || 0)),
        dq: session.dqCount,
        dqStreak: session.dqStreak,
        carefulRaces: session.carefulRaces,
        breakLeftMin: session.breakUntil > Date.now() ? Math.round((session.breakUntil - Date.now()) / 60000) : 0,
        average: averages ? Number(averages.wpm.toFixed(1)) : null,
        averageTarget: averages ? Number(averages.target.toFixed(1)) : null,
        averageAccuracy: averages ? Number(averages.acc.toFixed(1)) : null,
        closedSessions: Array.isArray(closed) ? closed.length : 0,
        eta: eta
          ? {
            minutes: eta.minutes,
            racesLeft: eta.remaining,
            breaks: eta.breaks,
            cycleS: Math.round(eta.cycleMs / 1000),
            measured: eta.measured,
          }
          : null,
        previousSession: previous
          ? {
            at: clockText(previous.at),
            races: previous.races,
            wpm: Number.isFinite(previous.wpm) ? Number(previous.wpm.toFixed(1)) : null,
            target: Number.isFinite(previous.target) ? Number(previous.target.toFixed(1)) : null,
            dq: previous.dq | 0,
            xp: Number.isFinite(previous.xp) ? Math.max(0, Math.round(previous.xp)) : null,
            reason: previous.reason || null,
          }
          : null,
      },
      // Lo que ve el navegador, que es la mitad de las veces la respuesta a
      // "por que no escribe": una pestana en segundo plano frena los timers y el
      // bot espera a proposito, y con el almacenamiento bloqueado nada de lo que
      // se guarda sobrevive a una recarga.
      env: {
        frame: window === window.top ? 'top' : 'iframe',
        visibility: document.visibilityState,
        // 'worker' = la cadencia sobrevive a una pestana oculta; 'page' = el
        // Worker no se pudo crear (CSP) y se usa el reloj normal.
        clock: preciseClockKind,
        focused: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
        online: navigator.onLine !== false,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        ready: document.readyState,
        uptimeMin: Math.round(performance.now() / 60000),
        storage: storageUsable() ? 'ok' : 'blocked',
        audio: sfxCtx ? sfxCtx.state : (sfxOn ? 'armed, no sound yet' : 'off'),
        panel: {
          collapsed: panel.root ? panel.root.dataset.collapsed === 'true' : null,
          drawer: panel.root ? panel.root.dataset.cfg === '1' : null,
          pinned: Boolean(panel.host && panel.host.style.left),
        },
      },
      day,
      lastRaces: raceHistory.slice(-CONFIG.historySize),
      notices: noticeRing.slice(-10).map((item) => `${clockText(item.at)} ${item.text}`),
      queueNotice: queueNotice && queueNotice.text ? `${clockText(queueNotice.at)} ${queueNotice.text}` : null,
      box: {
        nextInMin: (() => {
          const now = Date.now();
          // Misma cordura que la cola: una fecha absurda no se pinta como un siglo.
          return boxNext > now && boxNext <= now + CONFIG.mysteryBox.retryAfterMs + 3600000
            ? Math.round((boxNext - now) / 60000)
            : null;
        })(),
        lastAt: boxLast ? clockText(boxLast) : null,
        // Ultimo intento de reclamacion tal cual lo dejo la cola: via, HTTP,
        // `reward`, `next` crudo y la hora programada. Null si aun no hubo.
        attempt: (() => {
          const diag = readJson(BOX_STATE_DIAG);
          if (!diag || !Number.isFinite(diag.at)) return null;
          return {
            at: new Date(diag.at).toISOString(),
            via: diag.via || null,
            status: Number.isFinite(diag.status) ? diag.status : null,
            reward: typeof diag.reward === 'boolean' ? diag.reward : null,
            next: diag.next === undefined ? null : diag.next,
            scheduledAt: Number.isFinite(diag.scheduledAt) ? new Date(diag.scheduledAt).toISOString() : null,
            reason: diag.reason || null,
            detail: diag.detail || null,
          };
        })(),
      },
      stuck: stuck && Number.isFinite(stuck.at)
        ? { minutesAgo: Math.round((Date.now() - stuck.at) / 60000), reloads: stuck.reloads }
        : null,
    };
  }

  function exportDiagnostics() {
    const text = JSON.stringify(diagnosticReport(), null, 1);
    const box = panel.refs && panel.refs.cfgText;

    if (box) {
      box.value = text;
      try {
        box.select();
      } catch { /* seleccion no disponible */ }
    }

    const manual = () => setConfigNote(`Diagnostics are in the box (${text.length} chars): copy it by hand.`);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => setConfigNote(`Diagnostics copied (${text.length} chars).`))
          .catch(manual);
      } else {
        manual();
      }
    } catch {
      manual();
    }

    log(`Diagnostic report ready: v${VERSION}, ${session.races} races, ${session.dqCount} DQ, ${session.dqStreak} in a row.`);
  }

  function placeHost(left, top) {
    if (!panel.host) return;

    const maxLeft = Math.max(0, window.innerWidth - panel.host.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - panel.host.offsetHeight);

    panel.host.style.left = `${clamp(left, 0, maxLeft)}px`;
    panel.host.style.top = `${clamp(top, 0, maxTop)}px`;
    panel.host.style.bottom = 'auto';
  }

  function savePosition() {
    if (!panel.host) return;

    // Se leen los valores ya aplicados (placeHost los dejo saneados) en vez de
    // getBoundingClientRect, que forzaria un recalculo de layout.
    const left = Math.round(parseFloat(panel.host.style.left));
    const top = Math.round(parseFloat(panel.host.style.top));
    if (!Number.isFinite(left) || !Number.isFinite(top)) return;

    disk.set(KEYS.panelPosition, JSON.stringify({ left, top }));
  }

  function restorePosition() {
    const raw = disk.get(KEYS.panelPosition);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw);
      if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        placeHost(saved.left, saved.top);
      }
    } catch {
      disk.remove(KEYS.panelPosition);
    }
  }

  function makeDraggable(shadow) {
    const handle = shadow.querySelector('.head');
    if (!handle) return;

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;

      const rect = panel.host.getBoundingClientRect();
      dragging = true;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;

      placeHost(rect.left, rect.top);
      handle.setPointerCapture?.(event.pointerId);
      handle.style.cursor = 'grabbing';
      event.preventDefault();
    });

    handle.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      placeHost(event.clientX - offsetX, event.clientY - offsetY);
    });

    const stop = () => {
      if (!dragging) return;
      dragging = false;
      handle.style.cursor = 'grab';
      savePosition();
    };

    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID) || !document.body) return;

    // Un panel nuevo trae nodos nuevos: las firmas del anterior ya no valen.
    panel.calSig = '';
    panel.accSig = null;
    panel.updateHealthAt = 0;

    registerThemeProperties();

    const host = document.createElement('div');
    host.id = PANEL_ID;
    host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483000;';

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        /* ====================================================================
           Panel: una sola pieza de shadow DOM. Paleta de overlay de juego
           (carbon casi negro + verde neon), tipografia pequena y animaciones
           cortas: entrada, tarjetas escalonadas, rail con deslizador, muelle en
           los interruptores y un parpadeo cuando un numero cambia.
           Regla de oro de aqui abajo: el calcado de datos (filas, chips, cajon)
           no cambia, solo la piel. Todo lo que el JS busca sigue existiendo.
           ==================================================================== */
        * { box-sizing: border-box; }

        .panel {
          /* Una sola piel se cambia con data-theme: todo lo de abajo es el
             contrato que comparten los seis temas. El borde, el halo y los
             rellenos se derivan del acento con color-mix, asi que un tema nuevo
             solo declara su acento, su segundo color y su fondo. */
          --acc: #35ea86;
          --acc-2: #9bf7c5;
          --acc-dim: color-mix(in srgb, var(--acc) 14%, transparent);
          --line: color-mix(in srgb, var(--acc) 12%, transparent);
          --line-strong: color-mix(in srgb, var(--acc) 26%, transparent);
          --ink: #e9f7ef;
          --ink-2: #cfe9db;
          --dim: #7d9188;
          --dim-2: #7f9389;
          --warn: #ffb340;
          --bad: #ff6f6f;
          --info: #63c8ff;
          --card: rgba(255, 255, 255, .028);
          --bg-hi: rgba(12, 17, 14, .985);
          --bg-lo: rgba(5, 8, 6, .995);
          position: relative;
          isolation: isolate;
          width: 322px;
          max-width: calc(100vw - 32px);
          color: var(--ink);
          background:
            repeating-linear-gradient(0deg, rgba(255, 255, 255, .014) 0 1px, transparent 1px 3px),
            radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--acc) 10%, transparent), transparent 58%),
            radial-gradient(90% 80% at 100% 100%, color-mix(in srgb, var(--acc-2) 8%, transparent), transparent 62%),
            linear-gradient(168deg, var(--bg-hi), var(--bg-lo));
          border: 1px solid var(--line-strong);
          border-radius: 13px;
          box-shadow:
            0 22px 44px -18px rgba(0, 0, 0, .85),
            0 0 0 1px rgba(0, 0, 0, .6),
            0 0 34px -14px color-mix(in srgb, var(--acc) 50%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, .05);
          font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          -webkit-font-smoothing: antialiased;
          user-select: none;
          animation: nt-boot .42s cubic-bezier(.2, .9, .25, 1) both;
        }
        @keyframes nt-boot {
          from { opacity: 0; transform: translateY(10px) scale(.97); }
          to   { opacity: 1; transform: none; }
        }

        /* ---------- temas --------------------------------------------------- */
        /* Carbon es la piel de siempre. Las demas solo mueven el acento y el
           fondo: bordes, halos, rellenos y barras salen de --acc con color-mix,
           asi que un tema nuevo no toca ni una regla mas. Los avisos (ambar) y
           los errores (rojo) no cambian: el color sigue significando lo mismo
           en cualquier tema. */
        .panel, .panel[data-theme="carbon"] { color-scheme: dark; }
        .panel[data-theme="aurora"] {
          --acc: #3fe0c5;
          --acc-2: #a78bfa;
          --ink: #e8fbf7;
          --ink-2: #c3ece5;
          --dim: #7c9a98;
          --dim-2: #789693;
          --bg-hi: rgba(7, 19, 20, .985);
          --bg-lo: rgba(4, 10, 13, .995);
        }
        .panel[data-theme="sunset"] {
          --acc: #ff9a5c;
          --acc-2: #ff77b0;
          --ink: #fff3ea;
          --ink-2: #f6d8c7;
          --dim: #a08a80;
          --dim-2: #9c877d;
          --bg-hi: rgba(24, 12, 11, .985);
          --bg-lo: rgba(12, 6, 8, .995);
        }
        .panel[data-theme="ice"] {
          --acc: #66e3ff;
          --acc-2: #d7f7ff;
          --ink: #eefaff;
          --ink-2: #c9e9f6;
          --dim: #7e97a4;
          --dim-2: #7a93a0;
          --bg-hi: rgba(8, 16, 24, .985);
          --bg-lo: rgba(4, 8, 14, .995);
        }
        .panel[data-theme="violet"] {
          --acc: #c08bff;
          --acc-2: #f0a9ff;
          --ink: #f7f0ff;
          --ink-2: #ddcbf2;
          --dim: #93849f;
          --dim-2: #8f809b;
          --bg-hi: rgba(18, 11, 27, .985);
          --bg-lo: rgba(8, 5, 14, .995);
        }
        /* RGB: el acento es un tono HSL registrado con @property, asi que el
           navegador puede interpolarlo. El borde conico y el titulo giran con
           el; sin @property se queda en rojo fijo, que sigue siendo legible. */
        .panel[data-theme="rgb"] {
          --nt-hue: 0;
          --nt-angle: 0deg;
          --acc: hsl(var(--nt-hue) 92% 63%);
          --acc-2: hsl(calc(var(--nt-hue) + 70) 94% 76%);
          --ink: #f6f7ff;
          --ink-2: #d9dcf0;
          --dim: #8d90a6;
          --dim-2: #8a8da3;
          --bg-hi: rgba(11, 11, 19, .985);
          --bg-lo: rgba(5, 5, 10, .995);
          animation:
            nt-boot .42s cubic-bezier(.2, .9, .25, 1) both,
            nt-rgb-hue 16s linear infinite,
            nt-rgb-angle 8s linear infinite;
        }
        @keyframes nt-rgb-hue { to { --nt-hue: 360; } }
        @keyframes nt-rgb-angle { to { --nt-angle: 360deg; } }

        /* Con una carrera viva no se animan propiedades registradas del panel:
           cada frame obligaria a recalcular todos los color-mix y el borde
           conico, y el juego necesita ese tiempo. Al terminar la carrera los
           colores vuelven a girar solos. */
        .panel[data-theme="rgb"][data-state="running"] {
          animation-play-state: paused;
        }
        .panel[data-theme="rgb"][data-state="running"] .title,
        .panel[data-theme="rgb"][data-collapsed="true"],
        .panel[data-theme="rgb"][data-collapsed="true"] .title {
          animation-play-state: paused;
        }

        /* El marco arcoiris: una capa conica recortada a 1 px con mask. Solo se
           enciende en RGB; en el resto queda transparente y no cuesta nada. */
        .panel::after {
          content: '';
          position: absolute;
          inset: -1px;
          z-index: 3;
          padding: 1px;
          border-radius: 14px;
          background: conic-gradient(from var(--nt-angle, 0deg),
            #ff5f6d, #ffc371, #47ffa1, #5ad1ff, #b06bff, #ff5f6d);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          display: none;
          opacity: .9;
          pointer-events: none;
        }
        .panel[data-theme="rgb"]::after { display: block; }
        .panel[data-theme="rgb"] .title {
          background: linear-gradient(90deg, #ff5f6d, #ffc371, #47ffa1, #5ad1ff, #b06bff, #ff5f6d);
          background-size: 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow: none;
          animation: nt-rgb-title 6s linear infinite;
        }
        @keyframes nt-rgb-title { to { background-position: 300% 0; } }

        /* ---------- cabecera ------------------------------------------------- */
        .head { position: relative; display: flex; align-items: center; gap: 8px; padding: 10px 11px 8px; cursor: grab; touch-action: none; }
        .head::after {
          content: '';
          position: absolute;
          left: 11px; right: 11px; bottom: 0; height: 1px;
          background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--acc) 55%, transparent), transparent);
          pointer-events: none;
        }
        .head:active { cursor: grabbing; }
        .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--dim-2); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dim-2) 14%, transparent); transition: background .25s ease, box-shadow .25s ease; }
        .panel[data-state="running"] .dot { background: var(--acc); box-shadow: 0 0 0 3px var(--acc-dim), 0 0 12px color-mix(in srgb, var(--acc) 80%, transparent); animation: nt-pulse 1.7s ease-in-out infinite; }
        .panel[data-state="paused"] .dot { background: var(--warn); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 16%, transparent), 0 0 12px color-mix(in srgb, var(--warn) 60%, transparent); }
        .panel[data-state="break"] .dot { background: var(--info); box-shadow: 0 0 0 3px color-mix(in srgb, var(--info) 16%, transparent), 0 0 12px color-mix(in srgb, var(--info) 60%, transparent); }
        @keyframes nt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }

        .brand { flex: 1 1 auto; min-width: 0; }
        .title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 800 12.5px/1.15 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .13em; text-transform: uppercase; color: var(--ink); text-shadow: 0 0 14px color-mix(in srgb, var(--acc) 35%, transparent); }
        .sub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; font: 600 8.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .13em; text-transform: uppercase; color: var(--dim-2); }
        .sub b { color: var(--acc); font-weight: 700; }

        .who { flex: none; display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 7px; font: 600 9px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .06em; color: var(--ink-2); background: rgba(255, 255, 255, .045); border: 1px solid var(--line); }
        .upd { all: unset; flex: none; cursor: pointer; padding: 4px 7px; border-radius: 7px;
               font: 800 8px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif;
               letter-spacing: .08em; text-transform: uppercase; color: #20160a;
               background: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 70%, #fff 30%);
               box-shadow: 0 0 12px -4px var(--warn); }
        .upd[hidden] { display: none; }
        .upd:hover { filter: brightness(1.08); }
        .upd:focus-visible { outline: 2px solid var(--warn); outline-offset: 2px; }
        .who i { width: 5px; height: 5px; border-radius: 50%; background: var(--acc); box-shadow: 0 0 7px var(--acc); }
        .iconbtn { all: unset; flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; cursor: pointer; color: var(--dim); background: rgba(255, 255, 255, .04); border: 1px solid var(--line); transition: color .15s ease, background .15s ease, border-color .15s ease, transform .12s ease; }
        .iconbtn:hover { color: var(--acc-2); background: var(--acc-dim); border-color: var(--line-strong); }
        .iconbtn:active { transform: scale(.92); }
        .iconbtn:focus-visible, .pace:focus-visible, .toggle:focus-visible, .stop:focus-visible, .gear:focus-visible, .rail-btn:focus-visible, .act:focus-visible, .sw:focus-visible, .seg-btn:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
        .iconbtn svg { width: 13px; height: 13px; display: block; }

        /* ---------- tira de chips ------------------------------------------- */
        .chips-row { display: flex; align-items: center; gap: 6px; padding: 0 11px 9px; }
        /* Progreso de la carrera visible desde cualquier pestaña. Es una
           linea compositada: scaleX no toca el layout ni el texto de al lado. */
        .race-line { height: 2px; margin: 0 11px; border-radius: 99px; background: rgba(255, 255, 255, .05); overflow: hidden; opacity: 0; transition: opacity .2s ease; }
        .panel[data-state="running"] .race-line, .panel[data-state="paused"] .race-line { opacity: 1; }
        .race-line i { display: block; height: 100%; transform: scaleX(var(--race-fill, 0)); transform-origin: left center; background: linear-gradient(90deg, color-mix(in srgb, var(--acc) 95%, transparent), color-mix(in srgb, var(--acc-2) 95%, transparent)); box-shadow: 0 0 9px color-mix(in srgb, var(--acc) 55%, transparent); }
        .panel[data-collapsed="true"] .race-line { display: none; }
        .pace { all: unset; flex: none; padding: 4px 8px; border-radius: 999px; cursor: pointer; font: 700 8.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .1em; color: var(--acc-2); background: color-mix(in srgb, var(--acc) 12%, transparent); border: 1px solid color-mix(in srgb, var(--acc) 32%, transparent); transition: filter .15s ease, transform .12s ease, box-shadow .2s ease; }
        .pace:hover { filter: brightness(1.16); box-shadow: 0 0 14px -4px color-mix(in srgb, var(--acc) 70%, transparent); }
        .pace:active { transform: scale(.96); }
        .panel[data-pace-profile="soft"] .pace { color: var(--info); background: color-mix(in srgb, var(--info) 12%, transparent); border-color: color-mix(in srgb, var(--info) 32%, transparent); }
        .panel[data-pace-profile="fast"] .pace { color: #ffe3b8; background: color-mix(in srgb, var(--warn) 12%, transparent); border-color: color-mix(in srgb, var(--warn) 32%, transparent); }
        /* El chip es un ESTADO, no un interruptor: el bot es siempre AUTO y la
           cola se arma sola. Para parar esta Stop (o Esc / Alt+N). */
        .mode { flex: none; padding: 4px 8px; border-radius: 999px; font: 700 8.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .1em; color: var(--acc-2); background: var(--acc-dim); border: 1px solid color-mix(in srgb, var(--acc) 30%, transparent); cursor: default; }
        .cap { flex: 1 1 auto; padding: 4px 8px; border-radius: 999px; text-align: center; font: 700 8.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .1em; color: #ffe0b0; background: color-mix(in srgb, var(--warn) 10%, transparent); border: 1px solid color-mix(in srgb, var(--warn) 26%, transparent); transition: color .2s ease, background .2s ease, border-color .2s ease; }
        .panel[data-cap-hit="1"] .cap { color: #ffd6d6; background: color-mix(in srgb, var(--bad) 18%, transparent); border-color: color-mix(in srgb, var(--bad) 45%, transparent); }


        /* ---------- cuerpo: rail + vistas ----------------------------------- */
        .main { display: flex; align-items: stretch; gap: 0; border-top: 1px solid var(--line); }
        .rail { position: relative; flex: none; display: flex; flex-direction: column; gap: 2px; padding: 9px 6px; border-right: 1px solid var(--line); background: linear-gradient(180deg, rgba(255, 255, 255, .02), transparent); }
        .rail-btn { all: unset; position: relative; z-index: 1; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; cursor: pointer; color: var(--dim-2); transition: color .18s ease, transform .12s ease; }
        .rail-btn:hover { color: var(--acc-2); }
        .rail-btn:active { transform: scale(.9); }
        .rail-btn svg { width: 15px; height: 15px; display: block; }
        /* Etiqueta flotante del rail: aparece solo al apuntar o enfocar, con
           transform y opacity (nada de width ni filtros). */
        .rail-btn::after { content: attr(data-label); position: absolute; left: calc(100% + 7px); top: 50%; z-index: 6; padding: 4px 7px; border-radius: 6px; white-space: nowrap; pointer-events: none; font: 700 8px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); background: var(--bg-hi); border: 1px solid var(--line-strong); box-shadow: 0 8px 18px -12px rgba(0, 0, 0, .9); opacity: 0; transform: translate(-3px, -50%); transition: opacity .16s ease, transform .16s ease; }
        .rail-btn:hover::after, .rail-btn:focus-visible::after { opacity: 1; transform: translate(0, -50%); }
        /* El deslizador del rail: un cuadrado con glow que viaja con muelle. */
        .rail-glide { position: absolute; left: 6px; top: 9px; width: 30px; height: 30px; border-radius: 9px; background: var(--acc-dim); border: 1px solid var(--line-strong); box-shadow: 0 0 16px -6px var(--acc), inset 0 0 12px -6px var(--acc); transition: transform .34s cubic-bezier(.34, 1.4, .5, 1); transition: transform .34s linear(0, 0.32 14%, 0.82 28%, 1.06 44%, 1.02 58%, 0.995 72%, 1); pointer-events: none; }
        .rail[data-index="1"] .rail-glide { transform: translateY(32px); }
        .rail[data-index="2"] .rail-glide { transform: translateY(64px); }
        .rail[data-index="3"] .rail-glide { transform: translateY(96px); }
        .rail[data-index="0"] .rail-btn[data-tab-btn="stats"],
        .rail[data-index="1"] .rail-btn[data-tab-btn="tune"],
        .rail[data-index="2"] .rail-btn[data-tab-btn="log"],
        .rail[data-index="3"] .rail-btn[data-tab-btn="info"] { color: var(--acc); }

        .views { flex: 1 1 auto; min-width: 0; max-height: 62vh; overflow-y: auto; overscroll-behavior: contain; padding: 10px 11px 11px; }
        .views::-webkit-scrollbar { width: 6px; }
        .views::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--acc) 22%, transparent); border-radius: 99px; }
        .views::-webkit-scrollbar-track { background: transparent; }
        .views { scrollbar-gutter: stable; }
        .view { display: none; }
        /* Cabecera corta de cada vista: dice donde estas sin ocupar una tarjeta. */
        .view-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 2px 8px; margin: 0 1px 8px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
        .view-head span { display: inline-flex; align-items: center; gap: 6px; font: 800 7.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .18em; text-transform: uppercase; color: var(--acc); }
        .view-head span::before { content: ''; width: 10px; height: 1px; border-radius: 99px; background: var(--acc); box-shadow: 0 0 7px var(--acc); }
        .view-head b { font: 600 8px/1.2 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .04em; color: var(--dim-2); text-align: right; }
        .panel[data-tab="stats"] .v-stats,
        .panel[data-tab="tune"] .v-tune,
        .panel[data-tab="log"] .v-log,
        .panel[data-tab="info"] .v-info { display: block; animation: nt-view .28s cubic-bezier(.2, .9, .25, 1) both; }
        @keyframes nt-view { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
        /* TUNE se lee en tres bloques: ritmo, limites y automatizacion. La
           cabecera solo separa; las tarjetas y sus controles siguen igual. */
        .tune-sec { margin: 0 0 11px; }
        .tune-sec:last-child { margin-bottom: 0; }
        .tune-sec-h { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 8px; margin: 1px 1px 7px; }
        .tune-sec-h span { display: inline-flex; align-items: center; gap: 6px; font: 800 7.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .18em; text-transform: uppercase; color: var(--acc); }
        .tune-sec-h span::before { content: ''; width: 12px; height: 1px; border-radius: 99px; background: var(--acc); box-shadow: 0 0 7px var(--acc); }
        .tune-sec-h b { font: 600 8px/1.2 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .04em; color: var(--dim-2); }
        .tune-sec-h::after { content: ''; flex: 1 1 20px; min-width: 12px; height: 1px; align-self: center; background: linear-gradient(90deg, var(--line), transparent); }

        /* ---------- tarjetas ------------------------------------------------- */
        .card { position: relative; contain: layout style; margin-bottom: 9px; padding: 9px 10px 10px; border-radius: 10px; background: linear-gradient(180deg, rgba(255, 255, 255, .035), rgba(255, 255, 255, .012)); border: 1px solid var(--line); transition: border-color .2s ease, box-shadow .25s ease, transform .18s ease; }
        .card:last-child { margin-bottom: 2px; }
        .card:hover { border-color: var(--line-strong); box-shadow: 0 10px 22px -16px rgba(0, 0, 0, .9), 0 0 22px -14px color-mix(in srgb, var(--acc) 65%, transparent); }
        .card::before { content: ''; position: absolute; left: 0; top: 9px; bottom: 9px; width: 2px; border-radius: 99px; background: linear-gradient(180deg, var(--acc), color-mix(in srgb, var(--acc) 12%, transparent)); box-shadow: 0 0 10px color-mix(in srgb, var(--acc) 55%, transparent); opacity: .85; transition: opacity .2s ease; }
        .card:hover::before { opacity: 1; }
        /* Marca de agua: se ve por detras de las filas de arriba, como el icono
           fantasma del panel de referencia. Muy tenue a proposito. */
        .card > .ghost { position: absolute; right: 7px; top: 6px; width: 26px; height: 26px; color: var(--acc); opacity: .07; pointer-events: none; z-index: 0; }
        .card > .ghost svg { width: 100%; height: 100%; }
        /* Lo que se lee siempre por delante del adorno. */
        .card > *:not(.ghost) { position: relative; z-index: 1; }
        /* El titulo manda y el subtitulo va pegado a el; la esquina derecha queda
           libre para el icono fantasma, que si no cae debajo del texto. */
        .card-h { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 7px; margin-bottom: 7px; }
        .card-t { font: 800 9px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .19em; text-transform: uppercase; color: var(--ink-2); }
        .card-s { font: 600 8.5px/1.2 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .05em; color: var(--dim-2); }

        /* Aparecen una tras otra, como si el panel se montara delante de ti. */
        .panel[data-fresh="1"] .card { animation: nt-card .40s cubic-bezier(.2, .9, .25, 1) both; }
        .panel[data-fresh="1"] .card:nth-child(2) { animation-delay: .05s; }
        .panel[data-fresh="1"] .card:nth-child(3) { animation-delay: .1s; }
        .panel[data-fresh="1"] .card:nth-child(4) { animation-delay: .15s; }
        @keyframes nt-card { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

        /* ---------- marcador grande ----------------------------------------- */
        .hero { display: grid; grid-template-columns: 1fr 1px 1fr; align-items: center; padding: 8px 2px 9px; }
        .stat { text-align: center; }
        .stat b { display: block; font: 700 26px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: -.02em; font-variant-numeric: tabular-nums; color: var(--ink); text-shadow: 0 0 18px color-mix(in srgb, var(--acc) 28%, transparent); transition: color .25s ease, text-shadow .25s ease; }
        .stat b[data-good="1"] { color: var(--acc); text-shadow: 0 0 18px color-mix(in srgb, var(--acc) 50%, transparent); }
        .stat b[data-good="0"] { color: var(--warn); text-shadow: 0 0 18px color-mix(in srgb, var(--warn) 45%, transparent); }
        .stat b.bump { animation: nt-bump .32s cubic-bezier(.34, 1.4, .5, 1); }
        @keyframes nt-bump { 0% { transform: scale(1); } 35% { transform: scale(1.11); } 100% { transform: scale(1); } }
        .stat span { display: block; margin-top: 5px; font: 700 8px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .17em; text-transform: uppercase; color: var(--dim); }
        .sep { display: block; width: 1px; height: 34px; background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--acc) 25%, transparent), transparent); }

        .prog { position: relative; height: 4px; margin: 2px 2px 0; border-radius: 99px; background: rgba(255, 255, 255, .06); overflow: hidden; opacity: 0; transition: opacity .25s ease; }
        .panel[data-state="running"] .prog, .panel[data-state="paused"] .prog { opacity: 1; }
        .prog i { display: block; width: 0; height: 100%; border-radius: 99px; background: linear-gradient(90deg, color-mix(in srgb, var(--acc) 95%, transparent), color-mix(in srgb, var(--acc-2) 95%, transparent)); box-shadow: 0 0 10px color-mix(in srgb, var(--acc) 60%, transparent); transition: width .18s linear; }
        .season-card .season-prog { opacity: 1; margin: 0 2px 2px; }
        .season-card .season-name { margin: 1px 0 8px; font: 700 13px/1.25 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--ink-2); }
        .season-card.is-empty .season-name { color: var(--dim-2); }
        .season-card .season-alert { margin: 8px 2px 0; padding: 6px 8px; border-radius: 7px; font: 600 11px/1.35 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--warn, #ffcf6e); background: rgba(255, 190, 90, .08); border: 1px solid rgba(255, 190, 90, .28); }
        .season-card .season-actions { display: flex; gap: 6px; margin-top: 8px; }
        .season-card .season-actions .act { flex: 0 1 auto; padding: 5px 10px; }
        /* Reflejo que barre la barra mientras escribe: vida sin ruido. */
        .prog::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .35), transparent); transform: translateX(-100%); opacity: 0; }
        .panel[data-state="running"] .prog::after { opacity: 1; animation: nt-sheen 2.1s ease-in-out infinite; }
        @keyframes nt-sheen { 0% { transform: translateX(-100%); } 60%, 100% { transform: translateX(100%); } }

        /* ---------- filas ---------------------------------------------------- */
        .auto-pace {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          width: max-content; max-width: 100%; margin: 5px auto 0; padding: 3px 8px;
          border: 1px solid var(--line); border-radius: 999px;
          background: color-mix(in srgb, var(--acc) 7%, transparent);
          color: var(--acc-2); font: 600 8px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          letter-spacing: .08em; text-transform: uppercase; white-space: nowrap;
        }
        .auto-pace::before {
          content: ''; width: 5px; height: 5px; flex: none; border-radius: 50%;
          background: var(--acc); box-shadow: 0 0 8px color-mix(in srgb, var(--acc) 70%, transparent);
        }
        .rows { display: grid; gap: 1px; margin-top: 8px; }
        /* La vista Live ensena lo que se mira de verdad. El resto sigue en el DOM
           (y en los tooltips) para no romper el contrato del panel, pero no
           convierte la tarjeta en una lista de telemetria. */
        .v-stats .live-card .rows .row.secondary { display: none; }
        .row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 2.5px 0; font: 500 10.5px/1.45 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim); border-bottom: 1px solid rgba(255, 255, 255, .03); }
        .row:last-child { border-bottom: 0; }
        .row span { letter-spacing: .05em; }
        .row b { font: 600 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; color: var(--ink-2); }
        .row b[data-good="1"] { color: var(--acc); }
        .row b[data-good="0"] { color: var(--warn); }
        .row .cmp-select { flex: 1 1 auto; min-width: 0; max-width: 100%; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--line); background: rgba(255, 255, 255, .04); color: var(--acc-2); font: 600 9.5px/1.4 ui-monospace, monospace; letter-spacing: 0; text-transform: none; color-scheme: dark; cursor: pointer; }
        .row .cmp-select:focus-visible { outline: 2px solid color-mix(in srgb, var(--acc) 70%, transparent); outline-offset: 1px; }
        .row .cmp-select option { background: #0b0f0d; color: var(--ink); }
        .cmp-row { gap: 8px; }
        .break-row { display: flex; }
        .panel[data-state="break"] .break-row b { color: var(--info); }
        .dq-row b { color: var(--warn); }
        .limit-row { cursor: pointer; }
        .limit-row b { color: var(--acc); }
        .limit-row:hover b { text-decoration: underline dotted; }
        .panel[data-limit="on"] .limit-row b { color: var(--acc); }
        .prev-row { cursor: pointer; }
        .prev-row b { color: var(--ink-2); }
        .prev-row:hover b { text-decoration: underline dotted; }
        .hud-row b, .box-row b { color: var(--acc-2); }
        .guard-row b { color: var(--warn); }
        .panel[data-standby="1"] .guard-row b { color: var(--info); }
        .panel[data-box="ready"] .box-row b { color: var(--acc); }
        .panel[data-box="waiting"] .box-row b { color: var(--dim); }
        .today-row b { color: var(--acc); }
        .today-row b[data-good="0"] { color: var(--warn); }

        /* ---------- historial ------------------------------------------------ */
        .hist { margin-top: 8px; }
        .hist-head, .hist-row { display: grid; grid-template-columns: 34px 34px 46px 1fr 42px; gap: 6px; align-items: center; }
        .hist-head { padding-bottom: 3px; font: 700 8px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: var(--dim-2); }
        .hist-head span:not(:first-child), .hist-row b { text-align: right; }
        .hist-row { padding: 3px 0; border-radius: 6px; font-variant-numeric: tabular-nums; transition: background .2s ease, transform .2s ease; }
        .hist-row:hover { background: rgba(255, 255, 255, .035); transform: translateX(1px); }
        .hist-row span { font-size: 9.5px; color: var(--dim); }
        .hist-row b { font-size: 11px; font-weight: 600; color: var(--ink-2); }
        .hist-row:first-child b { color: var(--ink); text-shadow: 0 0 12px color-mix(in srgb, var(--acc) 30%, transparent); }
        .hist-row:first-child span { color: var(--acc); }
        .hist-row .dev { font-size: 10px; color: var(--dim-2); }
        .hist-row .dev[data-good="1"] { color: var(--acc); }
        .hist-row .dev[data-good="0"] { color: var(--warn); }
        /* WPM oficial del paquete de meta, pegado al del modelo. Solo aparece
           en las carreras que lo traen; las viejas no inventan el dato. */
        .hist-row .wpm { white-space: nowrap; }
        .hist-row .wpm .model { margin-left: 5px; font: 700 8px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--dim-2); }
        .hist-row:first-child .wpm .model { color: var(--acc-2); }
        .hist-row .nitro-tag { margin-right: 4px; padding: 0 3px; border-radius: 3px; background: color-mix(in srgb, var(--acc) 18%, transparent); color: var(--acc); font-style: normal; font-size: 7.5px; letter-spacing: .06em; vertical-align: 1px; }
        .hist-row .place { color: var(--dim); }
        .hist-row .place[data-medal="1"] { color: #ffd166; }
        .hist-row .place[data-medal="2"] { color: #d7dee8; }
        .hist-row .place[data-medal="3"] { color: #e0a273; }
        .hist-row .xp { color: var(--acc-2); }
        .hist-empty { padding-top: 2px; font: italic 500 10px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim-2); }
        .hist-foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; padding-top: 6px; border-top: 1px dashed color-mix(in srgb, var(--acc) 14%, transparent); font: 700 8.5px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .13em; text-transform: uppercase; color: var(--dim); }
        .hist-foot b { font: 600 10px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; letter-spacing: 0; color: var(--acc-2); }

        /* ---------- listas del registro -------------------------------------- */
        .log-list { display: grid; gap: 4px; }
        .log-item { display: grid; grid-template-columns: 46px 1fr auto; gap: 7px; align-items: baseline; padding: 4px 6px; border-radius: 7px; background: rgba(255, 255, 255, .022); border: 1px solid rgba(255, 255, 255, .045); font-variant-numeric: tabular-nums; transition: border-color .2s ease, transform .18s ease; }
        .log-item:hover { border-color: var(--line-strong); transform: translateX(1px); }
        .log-item i { font: 600 9px/1.4 ui-monospace, monospace; color: var(--dim-2); font-style: normal; }
        .log-item span { font: 500 10px/1.35 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .log-item b { font: 600 10.5px/1.35 ui-monospace, monospace; color: var(--acc-2); }
        .log-item b[data-good="0"] { color: var(--warn); }
        .log-empty { font: italic 500 10px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim-2); }
        .notice-item { display: grid; grid-template-columns: 44px 1fr; gap: 7px; padding: 3px 0; font: 500 10px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--ink-2); border-bottom: 1px solid rgba(255, 255, 255, .03); }
        .notice-item:last-child { border-bottom: 0; }
        .notice-item i { font: 600 9px/1.4 ui-monospace, monospace; color: var(--dim-2); font-style: normal; }
        .notice-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* ---------- interruptores y ajustes --------------------------------- */
        .set-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px solid rgba(255, 255, 255, .03); }
        .set-row:last-child { border-bottom: 0; }
        .set-lbl { font: 600 10.5px/1.3 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .03em; color: var(--ink-2); }
        .set-lbl i { display: block; margin-top: 2px; font: 500 8.5px/1.25 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; font-style: normal; letter-spacing: .04em; color: var(--dim-2); }
        .set-val { display: inline-flex; align-items: center; gap: 8px; }
        .set-val b { font: 600 9px/1 ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; color: var(--dim); }
        .set-val b[data-on="1"] { color: var(--acc); }
        .set-val b[data-field="nitroPreview"] { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: none; letter-spacing: 0; color: var(--ink); }
        .set-val b[data-field="nitroPreview"][data-good="1"] { color: var(--acc); }
        .set-val b[data-field="nitroPreview"][data-good="0"] { color: var(--warn); }
        /* En 320 px el rail deja la fila demasiado estrecha para la etiqueta y
           la palabra a la vez: el valor baja a la segunda linea y se alinea a
           la derecha, en vez de empujar el panel fuera del viewport. */
        .set-row.nitro-target-row { flex-wrap: wrap; }
        .set-row.nitro-target-row .set-val { min-width: 0; max-width: 100%; margin-left: auto; }
        .set-row.nitro-strategy-row { flex-wrap: wrap; }
        .set-row.nitro-strategy-row .set-val { min-width: 0; max-width: 100%; margin-left: auto; }
        .nitro-strategy { max-width: 100%; padding: 4px 6px; border-radius: 7px; cursor: pointer; color: var(--ink-2); background: rgba(0, 0, 0, .32); border: 1px solid var(--line); font: 700 8.5px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .03em; text-transform: uppercase; }
        .nitro-strategy:hover { color: var(--acc-2); border-color: var(--line-strong); }
        .nitro-strategy:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
        .nitro-strategy option { color: #111; background: #fff; }
        .row.nitro-delta-row b[data-good="1"] { color: var(--acc); }
        .row.nitro-delta-row b[data-good="0"] { color: var(--warn); }

        /* Interruptor tipo iOS con muelle: el muelle va en linear() y el
           cubic-bezier queda de repuesto para navegadores viejos. */
        .sw { all: unset; position: relative; flex: none; width: 34px; height: 18px; border-radius: 999px; cursor: pointer; background: rgba(255, 255, 255, .09); border: 1px solid rgba(255, 255, 255, .12); transition: background .25s ease, border-color .25s ease, box-shadow .25s ease; }
        .sw::after { content: ''; position: absolute; top: 1px; left: 1px; width: 14px; height: 14px; border-radius: 50%; background: linear-gradient(180deg, var(--ink), #b9cfc2); box-shadow: 0 1px 3px rgba(0, 0, 0, .5); transition: transform .32s cubic-bezier(.34, 1.4, .5, 1); transition: transform .32s linear(0, 0.3 14%, 0.84 30%, 1.07 46%, 1.02 60%, 0.998 74%, 1); }
        .sw[data-on="1"] { background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 90%, transparent), rgba(41, 196, 110, .85)); border-color: color-mix(in srgb, var(--acc) 55%, transparent); box-shadow: 0 0 14px -3px color-mix(in srgb, var(--acc) 80%, transparent), inset 0 0 8px -4px rgba(0, 0, 0, .6); }
        .sw[data-on="1"]::after { transform: translateX(16px); }
        .sw:hover { border-color: var(--line-strong); }
        .sw:active::after { width: 17px; }

        .seg { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; padding: 3px; border-radius: 9px; background: rgba(0, 0, 0, .32); border: 1px solid var(--line); }
        .seg-glide { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / 3); border-radius: 7px; background: var(--acc-dim); border: 1px solid var(--line-strong); box-shadow: inset 0 0 12px -6px var(--acc), 0 0 14px -8px var(--acc); transition: transform .32s cubic-bezier(.34, 1.4, .5, 1); transition: transform .32s linear(0, 0.3 14%, 0.84 30%, 1.07 46%, 1.02 60%, .998 74%, 1); }
        .seg[data-index="1"] .seg-glide { transform: translateX(100%); }
        .seg[data-index="2"] .seg-glide { transform: translateX(200%); }
        .seg-btn { all: unset; position: relative; z-index: 1; padding: 5px 0; text-align: center; border-radius: 7px; cursor: pointer; font: 700 9px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); transition: color .2s ease; }
        .seg-btn:hover { color: var(--acc-2); }
        .seg[data-index="0"] .seg-btn[data-pace="soft"], .seg[data-index="1"] .seg-btn[data-pace="balanced"], .seg[data-index="2"] .seg-btn[data-pace="fast"] { color: var(--acc); }

        .sld { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; margin: 2px 0 0; background: transparent; cursor: pointer; }
        .sld::-webkit-slider-runnable-track { height: 4px; border-radius: 99px; background: linear-gradient(90deg, var(--acc) 0 var(--fill, 0%), rgba(255, 255, 255, .1) var(--fill, 0%) 100%); }
        .sld::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; margin-top: -4.5px; border-radius: 50%; background: linear-gradient(180deg, #ffffff, var(--acc-2)); border: 1px solid color-mix(in srgb, var(--acc) 80%, transparent); box-shadow: 0 0 12px -2px color-mix(in srgb, var(--acc) 90%, transparent); transition: transform .16s cubic-bezier(.34, 1.5, .5, 1); }
        .sld:active::-webkit-slider-thumb { transform: scale(1.25); }
        .sld:focus-visible { outline: 2px solid var(--acc); outline-offset: 3px; border-radius: 99px; }
        .sld-ends { display: flex; justify-content: space-between; font: 600 8px/1.2 ui-monospace, monospace; letter-spacing: .08em; color: var(--dim-2); }

        .act { all: unset; flex: 1 1 0; padding: 6px 0; text-align: center; border-radius: 8px; cursor: pointer; font: 700 9px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); background: rgba(255, 255, 255, .045); border: 1px solid var(--line); transition: color .18s ease, background .18s ease, border-color .18s ease, transform .12s ease; }
        .act:hover { color: var(--acc); background: var(--acc-dim); border-color: var(--line-strong); }
        .act:active { transform: translateY(1px); }
        .act:disabled { opacity: .38; cursor: default; }
        .act[data-act="report"] { color: #ffe3b8; border-color: color-mix(in srgb, var(--warn) 26%, transparent); }
        .act[data-act="report"]:hover { color: #ffcf88; background: color-mix(in srgb, var(--warn) 12%, transparent); border-color: color-mix(in srgb, var(--warn) 45%, transparent); }
        .cfg-text { display: block; width: 100%; height: 46px; margin-top: 7px; padding: 6px 7px; resize: vertical; color: var(--ink); background: rgba(0, 0, 0, .35); border: 1px solid var(--line); border-radius: 8px; font: 500 9.5px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; transition: border-color .2s ease, box-shadow .2s ease; }
        .cfg-text:focus-visible { outline: none; border-color: var(--line-strong); box-shadow: 0 0 16px -8px var(--acc); }
        .cfg-note { margin-top: 6px; font: 500 9px/1.35 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim); }

        .keys { display: grid; gap: 3px; }
        .key-row { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: baseline; font: 500 10px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--ink-2); }
        .key-row kbd { padding: 2px 6px; border-radius: 5px; font: 600 9px/1.2 ui-monospace, monospace; color: var(--acc); background: color-mix(in srgb, var(--acc) 10%, transparent); border: 1px solid color-mix(in srgb, var(--acc) 24%, transparent); white-space: nowrap; }
        .about { font: 500 10px/1.5 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim); }
        .about b { color: var(--acc-2); font-weight: 700; }

        /* ---------- barra de estado y acciones ------------------------------ */
        .foot { padding: 7px 11px 8px; border-top: 1px solid var(--line); background: linear-gradient(180deg, rgba(255, 255, 255, .012), rgba(0, 0, 0, .22)); }
        .status { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 26px; margin-bottom: 6px; font: 500 9.5px/1.35 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim); }
        .foot-bar { display: flex; align-items: center; flex-wrap: nowrap; min-width: 0; gap: 5px; overflow: hidden; white-space: nowrap; font: 600 8.5px/1 ui-monospace, monospace; font-variant-numeric: tabular-nums; letter-spacing: .05em; text-transform: uppercase; color: var(--dim-2); }
        .led { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--dim-2); box-shadow: 0 0 8px color-mix(in srgb, var(--dim-2) 50%, transparent); transition: background .25s ease, box-shadow .25s ease; }
        .panel[data-state="running"] .led { background: var(--acc); box-shadow: 0 0 10px var(--acc); animation: nt-pulse 1.9s ease-in-out infinite; }
        .panel[data-state="paused"] .led { background: var(--warn); box-shadow: 0 0 10px var(--warn); }
        .panel[data-state="break"] .led { background: var(--info); box-shadow: 0 0 10px var(--info); }
        .foot-bar b { color: #cfe6d8; font-weight: 700; }
        .foot-bar [data-field="footAcc"] { color: var(--acc-2); }
        .foot-bar .fsep { opacity: .35; }
        .foot-bar .hint { margin-left: auto; color: var(--dim-2); }
        .panel[data-foot="compact"] .foot-bar { gap: 7px; }
        .panel[data-foot="compact"] .foot-bar [data-field="footMode"],
        .panel[data-foot="compact"] .foot-bar [data-field="footCap"],
        .panel[data-foot="compact"] .foot-bar .hint,
        .panel[data-foot="compact"] .foot-bar .fsep { display: none; }
        .panel[data-foot="hidden"] .foot-bar { display: none; }
        .panel[data-standby="1"] .foot-bar .led { background: var(--info); box-shadow: 0 0 10px var(--info); }
        /* Parado (sin modo NORMAL): ambar en la barra y en la etiqueta de la
           tarjeta live. Es un estado, y se tiene que ver de un vistazo. */
        .panel[data-stopped="1"][data-mode="auto"] .foot-bar .led { background: var(--warn); box-shadow: 0 0 10px color-mix(in srgb, var(--warn) 75%, transparent); }
        .panel[data-stopped="1"][data-mode="auto"] .foot-bar b[data-field="footState"] { color: #ffcf7a; }
        .panel[data-stopped="1"][data-mode="auto"] .card-s[data-field="liveTag"] { color: var(--warn); }

        /* Mini-grafica de model Δ: la linea de puntos es el cero; el area y la
           linea usan el acento del tema y no necesitan ningun canvas. */
        .spark { display: block; width: calc(100% - 22px); height: 24px; margin: 0 11px 6px; overflow: visible; }
        .spark-line { fill: none; stroke: var(--acc); stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; transition: opacity .2s ease; }
        .spark-area { fill: color-mix(in srgb, var(--acc) 16%, transparent); stroke: none; }
        .spark-zero { stroke: color-mix(in srgb, var(--acc) 22%, transparent); stroke-width: .6; stroke-dasharray: 2 3; }
        .spark[data-empty="1"] { opacity: .35; }

        .actions { display: flex; gap: 6px; padding: 0 11px 11px; }
        .toggle { all: unset; flex: 1 1 auto; padding: 9px 0; text-align: center; border-radius: 9px; cursor: pointer; font: 800 9.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: var(--ink); background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 22%, transparent), color-mix(in srgb, var(--acc) 10%, transparent)); border: 1px solid color-mix(in srgb, var(--acc) 34%, transparent); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1); transition: filter .15s ease, transform .1s ease, box-shadow .25s ease; }
        .toggle:hover { filter: brightness(1.16); box-shadow: 0 0 20px -8px var(--acc), inset 0 1px 0 rgba(255, 255, 255, .12); }
        .toggle:active { transform: translateY(1px); }
        .panel[data-state="paused"] .toggle { color: var(--ink); background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 30%, transparent), color-mix(in srgb, var(--acc) 14%, transparent)); border-color: color-mix(in srgb, var(--acc) 50%, transparent); }
        .stop { all: unset; flex: none; display: grid; place-items: center; padding: 9px 14px; border-radius: 9px; cursor: pointer; font: 800 9.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #ffd0d0; background: linear-gradient(180deg, color-mix(in srgb, var(--bad) 18%, transparent), color-mix(in srgb, var(--bad) 8%, transparent)); border: 1px solid color-mix(in srgb, var(--bad) 32%, transparent); transition: filter .15s ease, transform .1s ease, color .2s ease, background .2s ease, border-color .2s ease; }
        .stop:hover { filter: brightness(1.16); box-shadow: 0 0 20px -9px var(--bad); }
        .stop:active { transform: translateY(1px); }
        .stop[data-pending="true"] { color: #ffe6b8; background: linear-gradient(180deg, color-mix(in srgb, var(--warn) 24%, transparent), color-mix(in srgb, var(--warn) 12%, transparent)); border-color: color-mix(in srgb, var(--warn) 42%, transparent); }
        /* Parado no hay nada que parar: el boton se apaga en vez de cerrar una
           tanda ya cerrada. */
        .stop:disabled { opacity: .42; cursor: default; }
        .stop:disabled:hover, .stop:disabled:active { filter: none; box-shadow: none; transform: none; }
        .gear { all: unset; flex: none; display: grid; place-items: center; width: 32px; border-radius: 9px; cursor: pointer; color: var(--dim); background: rgba(255, 255, 255, .04); border: 1px solid var(--line); transition: filter .15s ease, color .18s ease, background .18s ease, border-color .18s ease, transform .12s ease; }
        .gear:hover { color: var(--acc); background: var(--acc-dim); border-color: var(--line-strong); }
        .gear:active { transform: scale(.94); }
        .gear[data-open="1"] { color: var(--acc); background: var(--acc-dim); border-color: var(--line-strong); box-shadow: 0 0 18px -8px var(--acc); }
        .gear svg { width: 14px; height: 14px; display: block; }

        /* ---------- selector de tema ---------------------------------------- */
        .themes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 2px; }
        .theme { all: unset; display: flex; flex-direction: column; gap: 4px; padding: 5px 5px 4px; border-radius: 8px; cursor: pointer; border: 1px solid var(--line); background: rgba(255, 255, 255, .022); transition: border-color .18s ease, background .18s ease, box-shadow .22s ease, transform .12s ease; }
        .theme:hover { border-color: var(--line-strong); transform: translateY(-1px); }
        .theme:active { transform: translateY(0) scale(.97); }
        .theme:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
        .theme i { display: block; height: 16px; border-radius: 5px; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .18), 0 2px 8px -4px rgba(0, 0, 0, .9); }
        .theme span { text-align: center; font: 700 7.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--dim-2); }
        .theme[aria-pressed="true"] { border-color: var(--line-strong); background: var(--acc-dim); box-shadow: 0 0 18px -9px var(--acc), inset 0 0 0 1px var(--line); }
        .theme[aria-pressed="true"] span { color: var(--acc); }
        .theme[aria-pressed="true"] i { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .35), 0 0 12px -3px var(--acc); }
        /* Las muestras no heredan el tema activo: cada tile ensena el suyo. */
        .theme i.sw-carbon { background: linear-gradient(135deg, #0c110e, #35ea86 60%, #9bf7c5); }
        .theme i.sw-aurora { background: linear-gradient(135deg, #071314, #3fe0c5 55%, #a78bfa); }
        .theme i.sw-sunset { background: linear-gradient(135deg, #180c0b, #ff9a5c 55%, #ff77b0); }
        .theme i.sw-ice { background: linear-gradient(135deg, #080f18, #66e3ff 55%, #d7f7ff); }
        .theme i.sw-violet { background: linear-gradient(135deg, #120b1b, #c08bff 55%, #f0a9ff); }
        .theme i.sw-rgb {
          background: conic-gradient(from 0deg, #ff5f6d, #ffc371, #47ffa1, #5ad1ff, #b06bff, #ff5f6d);
        }

        /* ---------- plegado -------------------------------------------------- */
        /* Plegado: cabecera con el LED y el nombre, y los tres botones. Todo lo
           demas fuera, que para eso esta el boton. */
        .panel[data-collapsed="true"] { width: auto; min-width: 210px; }
        .panel[data-collapsed="true"] .main,
        .panel[data-collapsed="true"] .foot,
        .panel[data-collapsed="true"] .chips-row,
        .panel[data-collapsed="true"] .who { display: none; }
        .panel[data-collapsed="true"] .head { padding-bottom: 9px; }
        .panel[data-collapsed="true"] .actions { padding-top: 0; }

        /* En una ventana estrecha la cuenta ocupa el sitio del nombre. Se
           retira antes de que el titulo empiece a cortarse. */
        @media (max-width: 340px) {
          .who { display: none; }
        }

        /* 160 CSS px (320 px fisicos al 200 %): el rail lateral y la columna
           de botones ya no caben. El panel se vuelve una columna, el rail pasa
           arriba y las vistas hacen scroll dentro de una altura maxima. */
        @media (max-width: 200px) {
          :host { left: 8px !important; }
          .panel {
            display: flex;
            flex-direction: column;
            width: calc(100vw - 16px);
            max-width: calc(100vw - 16px);
            max-height: calc(100vh - 32px);
          }
          .panel[data-collapsed="true"] { min-width: 0; }
          .head { flex: none; gap: 6px; padding: 8px 8px 6px; }
          .head::after { left: 8px; right: 8px; }
          .head .dot,
          .head .who,
          .head .sub,
          .head .upd { display: none; }
          .title { font-size: 11px; letter-spacing: .08em; }
          .chips-row { flex: none; flex-wrap: wrap; row-gap: 5px; padding: 0 8px 7px; }
          .chips-row > * { flex: 0 1 auto; white-space: nowrap; }
          .set-row { flex-direction: column; align-items: stretch; gap: 4px; }
          .set-row .set-val { justify-content: flex-end; margin-left: auto; }
          .main { flex: 1 1 auto; min-height: 0; flex-direction: column; }
          .rail {
            flex: none;
            flex-direction: row;
            justify-content: space-around;
            padding: 4px;
            border-right: 0;
            border-bottom: 1px solid var(--line);
          }
          .rail-glide { display: none; }
          .rail-btn { width: 24px; height: 24px; border-radius: 7px; }
          .rail-btn svg { width: 13px; height: 13px; }
          .rail-btn::after { display: none; }
          .views { flex: 1 1 auto; min-height: 0; max-height: none; padding: 8px; }
          .foot { display: none; }
          .actions { flex: none; gap: 5px; padding: 0 8px 8px; }
          .actions .gear { display: none; }
          .actions .stop { padding-left: 10px; padding-right: 10px; }
        }

        /* Con el sistema pidiendo menos animacion se van las animaciones de
           entrada (lo grande y decorativo) pero se quedan los cambios de estado
           cortos: el muelle del interruptor y de los deslizadores es informacion
           (dice si algo esta encendido), no adorno. */
        @media (prefers-reduced-motion: reduce) {
          .panel, .panel[data-fresh="1"] .card, .view, .stat b.bump, .prog::after,
          .panel .dot, .panel .led, .theme i.sw-rgb, .panel[data-theme="rgb"] .title { animation: none !important; }
          /* El ciclo de tono no mueve nada: es color, no adorno. Se conserva
             para que RGB siga cambiando aunque el sistema pida menos animacion;
             el marco conico y el titulo si se quedan quietos. */
          .panel[data-theme="rgb"] { animation: nt-rgb-hue 16s linear infinite !important; }
        }
      </style>
      <div class="panel" role="region" aria-label="Nitro Wraith control panel" data-state="waiting" data-mode="auto" data-pace="legit" data-cfg="0" data-collapsed="false" data-tab="stats" data-fresh="1" data-theme="carbon">
        <div class="head">
          <span class="dot"></span>
          <span class="brand">
            <b class="title" data-field="title">NITRO WRAITH</b>
            <span class="sub">nitro type · <b data-field="ver">v7.0.0</b></span>
          </span>
          <span class="who" title="Account this pace is calibrated for"><i></i>HUMAN PACE</span>
          <button class="upd" type="button" data-field="update" hidden>update</button>
          <button class="iconbtn collapse" type="button" data-act="expand" aria-label="Collapse panel" aria-expanded="true" title="Collapse / expand the panel">−</button>
        </div>
        <div class="chips-row">
          <button class="pace" type="button">LEGIT · balanced</button>
          <span class="mode" role="status" aria-live="polite" title="Always AUTO: the bot starts by itself. Stop stops it; it comes back on the next garage visit.">AUTO</span>
          <span class="cap" data-field="cap" title="Hard ceiling: no race is ever allowed above this WPM">≤ 120 wpm</span>
        </div>
        <div class="race-line" aria-hidden="true"><i></i></div>
        <div class="main">
          <div class="rail" data-index="0" role="tablist" aria-label="Panel views">
            <i class="rail-glide"></i>
            <button class="rail-btn" type="button" role="tab" aria-selected="true" aria-controls="nt-view-stats" aria-label="Live" data-tab-btn="stats" data-label="Live">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17a9 9 0 1 1 18 0"/><path d="M12 13l4-3"/><circle cx="12" cy="13" r="1.4" fill="currentColor" stroke="none"/></svg>
            </button>
            <button class="rail-btn" type="button" role="tab" aria-selected="false" aria-controls="nt-view-tune" aria-label="Tune" data-tab-btn="tune" data-label="Tune" tabindex="-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h9M17 6h3M4 18h3M11 18h9M4 12h13M20 12h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="18" r="2"/><circle cx="18" cy="12" r="2"/></svg>
            </button>
            <button class="rail-btn" type="button" role="tab" aria-selected="false" aria-controls="nt-view-log" aria-label="Log" data-tab-btn="log" data-label="Log" tabindex="-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h11M8 12h11M8 18h11"/><circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none"/></svg>
            </button>
            <button class="rail-btn" type="button" role="tab" aria-selected="false" aria-controls="nt-view-info" aria-label="Info" data-tab-btn="info" data-label="Info" tabindex="-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none"/></svg>
            </button>
          </div>
          <div class="views">
            <!-- ------------------------------ STATS ------------------------- -->
            <section class="view v-stats" id="nt-view-stats" role="tabpanel" aria-label="Live">
              <div class="view-head"><span>Live</span><b>race telemetry</b></div>
              <div class="card live-card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 17a9 9 0 1 1 18 0"/><path d="M12 13l4-3"/></svg></span>
                <div class="card-h"><span class="card-t">Live</span><span class="card-s" data-field="liveTag">waiting</span></div>
                <div class="hero">
                  <div class="stat"><b data-field="live">—</b><span>live wpm</span></div>
                  <i class="sep"></i>
                  <div class="stat"><b data-field="acc">—</b><span>accuracy</span></div>
                </div>
                <div class="auto-pace" data-field="paceSource">auto · reading account</div>
                <div class="prog"><i data-field="progfill"></i></div>
                <svg class="spark" data-field="accSpark" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label="Accuracy model delta history: no samples yet.">
                  <line class="spark-zero" x1="0" y1="12" x2="100" y2="12"></line>
                  <path class="spark-area" data-field="accSparkArea" d=""></path>
                  <polyline class="spark-line" data-field="accSparkLine" points=""></polyline>
                </svg>
                <div class="rows">
                  <div class="row"><span>target</span><b data-field="target">—</b></div>
                  <div class="row race-row secondary" title="Race progress"><span>race</span><b data-field="progress">—</b></div>
                  <div class="row"><span>races</span><b data-field="races">0</b></div>
                  <div class="row day-xp-row" title="XP the game awarded today, read from the same daily summary as the 7-day card"><span>today</span><b data-field="dayXp">—</b></div>
                  <div class="row tanda-row" title="Average of every measured race in this session, not just the ones in the list"><span>session</span><b data-field="tanda">—</b></div>
                  <div class="row secondary" title="Which WPM calibration sample is active"><span>set</span><b data-field="session">—</b></div>
                  <div class="row rate-row secondary" title="XP per hour at the current session pace"><span>rate</span><b data-field="rate">—</b></div>
                  <div class="row nitro-row secondary" title="Nitro this session: races that used it, characters the game typed for you and the time they would have taken at the planned pace"><span>nitro</span><b data-field="nitro">—</b></div>
                  <div class="row nitro-delta-row secondary" title="Nitro WPM check: races with nitro minus races without it, over the last 10 measured races. Zero or below means the nitro is not lifting the average; positive is a warning"><span>nitro Δ</span><b data-field="nitroDelta">—</b></div>
                  <div class="row cycle-row secondary" title="Dead time between races: median and best gap from the end of one race to the first key of the next"><span>cycle</span><b data-field="cycle">—</b></div>
                  <div class="row xp-break-row secondary" title="Last race XP split into place, speed, accuracy and session or other bonuses"><span>xp/race</span><b data-field="xpBreak">—</b></div>
                  <div class="row session-row" style="display:none" title="Site session token: time left before it expires. The queue renews it on the garage, between races"><span>login</span><b data-field="sessionLeft">—</b></div>
                  <div class="row trim-row" style="display:none"><span>trim</span><b data-field="trim">—</b></div>
                  <div class="row hud-row" style="display:none" title="The WPM Nitro Type itself is printing right now, next to the hard ceiling"><span>game</span><b data-field="hud">—</b></div>
                  <div class="row result-row" style="display:none" title="Place and prize of the last race, read from the game's own race result"><span>result</span><b data-field="result">—</b></div>
                  <div class="row clock-row" style="display:none" title="The precise clock could not start (the site's CSP blocked the Worker). In a background tab the browser slows page timers down and typing can stall long enough for a disqualification."><span>clock</span><b data-field="clock">page</b></div>
                  <div class="row guard-row" style="display:none" title="Why the bot is waiting: a guard break, duplicate copies of the script or a site block"><span>guard</span><b data-field="guard">—</b></div>
                  <div class="row box-row" style="display:none" title="Daily Mystery Box in the garage"><span>box</span><b data-field="box">—</b></div>
                  <div class="row break-row secondary"><span>break</span><b data-field="break">—</b></div>
                  <div class="row dq-row" style="display:none"><span>dq streak</span><b data-field="dq">×0</b></div>
                </div>
              </div>
              <div class="card season-card" data-field="seasonCard">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 4h10v3a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 12v5M8 21h8"/></svg></span>
                <div class="card-h"><span class="card-t">Season</span><span class="card-s" data-field="seasonTag">no snapshot</span></div>
                <div class="season-name" data-field="seasonName">Season</div>
                <div class="prog season-prog"><i data-field="seasonFill"></i></div>
                <div class="rows">
                  <div class="row"><span>tier</span><b data-field="seasonTier">—</b></div>
                  <div class="row"><span>xp</span><b data-field="seasonXp">—</b></div>
                  <div class="row"><span>to next</span><b data-field="seasonNext">—</b></div>
                  <div class="row" title="How many races the next reward needs at the XP per race of the last races"><span>races</span><b data-field="seasonRaces">—</b></div>
                  <div class="row season-pace-row" title="XP per active day over the last week, projected to the season end at that pace"><span>pace</span><b data-field="seasonPace">—</b></div>
                  <div class="row"><span>ends</span><b data-field="seasonEnds">—</b></div>
                </div>
                <div class="season-alert" data-field="seasonAlert" role="status" style="display:none"></div>
                <div class="season-actions">
                  <button class="act" type="button" data-act="season" data-field="seasonOpen" title="Open Nitro Type's Season page; the script captures the tier and XP for this card">open season</button>
                </div>
                <div class="cfg-note" data-field="seasonNote">Open Season once to capture the tier and XP.</div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg></span>
                <div class="card-h"><span class="card-t">Last 10 races</span><span class="card-s">place · xp · wpm</span></div>
                <div class="hist">
                  <div class="hist-head"><span>time</span><span>place</span><span>xp</span><span>wpm</span><span>dev</span></div>
                  <div data-field="history"></div>
                  <div class="hist-foot" data-field="foot" style="display:none">
                    <span>avg <b data-field="avg">—</b></span>
                    <span>best <b data-field="best">—</b></span>
                  </div>
                </div>
              </div>
            </section>

            <!-- Las vistas que no estan activas se montan al abrirlas. Asi el
                 primer segundo solo cuesta la vista Live, no las cuatro. -->
            <template data-view="tune">
            <section class="view v-tune cfg" id="nt-view-tune" role="tabpanel" aria-label="Tune">
              <div class="view-head"><span>Tune</span><b>rhythm · limits · automation</b></div>
              <div class="tune-sec" role="group" aria-labelledby="tune-rhythm-label">
                <div class="tune-sec-h"><span id="tune-rhythm-label">Rhythm</span><b>pace and calibration</b></div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h9M17 6h3M4 18h3M11 18h9"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="18" r="2"/></svg></span>
                  <div class="card-h"><span class="card-t">Pace</span><span class="card-s">all under the ceiling</span></div>
                  <div class="seg" data-index="1">
                    <i class="seg-glide"></i>
                    <button class="seg-btn" type="button" data-pace="soft" title="A little below the account average, for an easier session">soft</button>
                    <button class="seg-btn" type="button" data-pace="balanced" title="The account's own average and calibrated range">balanced</button>
                    <button class="seg-btn" type="button" data-pace="fast" title="A little above the account average, still under the ceiling">fast</button>
                  </div>
                  <div class="rows">
                    <div class="row"><span>ceiling</span><b data-field="tuneCap">≤ 120 wpm</b></div>
                    <div class="row"><span>range</span><b data-field="tuneRange">—</b></div>
                    <div class="row cal-row" data-field="calRow" title="Always automatic: reads the account average from the site profile and the stats API, and centres the balanced range on it. Click to refresh now."><span>auto</span><b data-field="cal">on</b></div>
                    <div class="row"><span>calibrated</span><b data-field="calWpm">—</b></div>
                    <div class="row"><span>accuracy</span><b data-field="calAcc">—</b></div>
                    <div class="row"><span>account</span><b data-field="calAccount">—</b></div>
                  </div>
                </div>
              </div>
              <div class="tune-sec" role="group" aria-labelledby="tune-limits-label">
                <div class="tune-sec-h"><span id="tune-limits-label">Limits</span><b>session, day and hours</b></div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h16M4 16h16"/><circle cx="9" cy="8" r="2"/><circle cx="15" cy="16" r="2"/></svg></span>
                  <div class="card-h"><span class="card-t">Session limit</span><span class="card-s">the bot stops on its own</span></div>
                  <div class="limit-row row" data-field="raceLimitRow" title="Click: races per session (free, 25, 50, 100). 25 is where the session bonus reaches its 250 XP per race cap">
                    <span>races</span><b data-field="limit">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="3" step="1" value="0" data-field="limitSlider" aria-label="Races per session" title="Races per session: free, 25, 50 or 100">
                  <div class="sld-ends"><span>free</span><span>25</span><span>50</span><span>100</span></div>
                  <div class="limit-row row time-row" data-field="timeLimitRow" title="Click: minutes per session (free, 15, 30, 60, 120). The clock starts with the first race of the session">
                    <span>time</span><b data-field="timeLimit">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="4" step="1" value="0" data-field="timeSlider" aria-label="Minutes per session" title="Minutes per session: free, 15, 30, 60 or 120">
                  <div class="sld-ends"><span>free</span><span>15m</span><span>30m</span><span>1h</span><span>2h</span></div>
                  <div class="limit-row row xp-row" data-field="xpLimitRow" title="Click: XP per session (free, 5k, 10k, 25k, 50k). Counts the XP the game itself awards in each race">
                    <span>xp</span><b data-field="xpLimit">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="4" step="1" value="0" data-field="xpSlider" aria-label="XP per session" title="XP per session: free, 5k, 10k, 25k or 50k">
                  <div class="sld-ends"><span>free</span><span>5k</span><span>10k</span><span>25k</span><span>50k</span></div>
                  <div class="rows">
                    <div class="row"><span>left</span><b data-field="etaLeft">—</b></div>
                    <div class="row time-left-row" data-field="timeLeftRow" style="display:none"><span>time left</span><b data-field="timeLeft">—</b></div>
                    <div class="row xp-left-row" data-field="xpRow" style="display:none"><span>xp</span><b data-field="xpTotal">—</b></div>
                  </div>
                </div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 18V6M4 18h16"/><path d="M8 14v-3M12 14V7M16 14v-5"/></svg></span>
                  <div class="card-h"><span class="card-t">Daily budget</span><span class="card-s">stop before tomorrow</span></div>
                  <div class="limit-row row" data-field="dailyRaceRow" title="Click: races per day (free, 100, 200, 300). Counts the races the game recorded today">
                    <span>races/day</span><b data-field="dailyRaces">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="3" step="1" value="0" data-field="dailyRaceSlider" aria-label="Races per day" title="Races per day: free, 100, 200 or 300">
                  <div class="sld-ends"><span>free</span><span>100</span><span>200</span><span>300</span></div>
                  <div class="limit-row row xp-row" data-field="dailyXpRow" title="Click: XP per day (free, 50k, 100k, 200k). Counts the XP the game paid today">
                    <span>xp/day</span><b data-field="dailyXp">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="3" step="1" value="0" data-field="dailyXpSlider" aria-label="XP per day" title="XP per day: free, 50k, 100k or 200k">
                  <div class="sld-ends"><span>free</span><span>50k</span><span>100k</span><span>200k</span></div>
                  <div class="rows">
                    <div class="row" data-field="dailyLeftRow" title="Budget left today; both counters reset at midnight"><span>left</span><b data-field="dailyLeft">—</b></div>
                  </div>
                </div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg></span>
                  <div class="card-h"><span class="card-t">Active hours</span><span class="card-s">races only in this window</span></div>
                  <div class="limit-row row" data-field="activeRow" title="Click: turn the active window on/off. Shift+click resets 08:00–23:00">
                    <span>window</span><b data-field="activeState">off</b>
                  </div>
                  <div class="limit-row row" data-field="activeStartRow" title="Click: start hour +1 (Shift+click: −1). The window can cross midnight">
                    <span>from</span><b data-field="activeStart">08:00</b>
                  </div>
                  <input class="sld" type="range" min="0" max="23" step="1" value="8" data-field="activeStartSlider" aria-label="Active window start hour" title="Start of the active window">
                  <div class="sld-ends"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
                  <div class="limit-row row" data-field="activeEndRow" title="Click: end hour +1 (Shift+click: −1). An end before the start crosses midnight">
                    <span>to</span><b data-field="activeEnd">23:00</b>
                  </div>
                  <input class="sld" type="range" min="0" max="23" step="1" value="23" data-field="activeEndSlider" aria-label="Active window end hour" title="End of the active window">
                  <div class="sld-ends"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
                  <div class="rows">
                    <div class="row" data-field="activeNowRow" title="Local time. Races only start while the window is open"><span>now</span><b data-field="activeNow">always</b></div>
                  </div>
                </div>
              </div>
              <div class="tune-sec" role="group" aria-labelledby="tune-automation-label">
                <div class="tune-sec-h"><span id="tune-automation-label">Automation</span><b>behavior, panel and tools</b></div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg></span>
                  <div class="card-h"><span class="card-t">Switches</span><span class="card-s">saved on this browser</span></div>
                  <div class="set-row">
                    <span class="set-lbl">Breaks<i>human pauses between races</i></span>
                    <span class="set-val"><b data-sw-txt="breaks" data-on="1">on</b><button class="sw" type="button" role="switch" aria-checked="true" data-toggle="breaks" data-on="1" title="Human pauses between races (9-16 races apart, 20-90 s, 15% of them 3-10 min)"></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">Mystery Box<i>free garage reward, every ~21 h</i></span>
                    <span class="set-val"><b data-sw-txt="mysteryBox" data-on="1">on</b><button class="sw" type="button" role="switch" aria-checked="true" data-toggle="mysteryBox" data-on="1" title="Claim the free garage reward roughly every 21 h"></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">Stickers<i>one in ~35% of the races</i></span>
                    <span class="set-val"><b data-sw-txt="stickers" data-on="1">on</b><button class="sw" type="button" role="switch" aria-checked="true" data-toggle="stickers" data-on="1" title="Send a sticker in ~35% of the races"></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">Auto nitro<i>skips one long word per race</i></span>
                    <span class="set-val"><b data-sw-txt="useNitro" data-on="1">on</b><button class="sw" type="button" role="switch" aria-checked="true" data-toggle="useNitro" data-on="1" title="Auto nitro: press Enter once per race to skip one word chosen by the nitro strategy. It does not raise WPM; the saved time is paid back over the rest of the lesson"></button></span>
                  </div>
                  <div class="set-row nitro-strategy-row">
                    <span class="set-lbl">Nitro strategy<i>which word Enter skips</i></span>
                    <span class="set-val"><select class="nitro-strategy" data-field="nitroStrategy" aria-label="Nitro strategy"><option value="longest">longest</option><option value="first">first</option><option value="last">last</option></select></span>
                  </div>
                  <div class="set-row nitro-target-row" title="The word the nitro strategy would skip on the current lesson. It updates live and clears after the nitro is spent.">
                    <span class="set-lbl">Nitro target<i>the word Enter would skip</i></span>
                    <span class="set-val"><b data-field="nitroPreview">—</b></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">Guard<i>stops on an impossible reading</i></span>
                    <span class="set-val"><b data-sw-txt="guard" data-on="1">on</b><button class="sw" type="button" role="switch" aria-checked="true" data-toggle="guard" data-on="1" title="Safety guard: ends the race and opens a long break if the measured WPM goes past the ceiling. Turn it off only if you know what you are doing"></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">Sound<i>discreet tone when the bot waits</i></span>
                    <span class="set-val"><b data-sw-txt="sound" data-on="0">off</b><button class="sw" type="button" role="switch" aria-checked="false" data-toggle="sound" data-on="0" title="Sound alerts: a short tone on long breaks, duplicate copies and site blocks"></button></span>
                  </div>
                </div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3a9 9 0 1 0 0 18h1.6a1.7 1.7 0 0 0 1.2-2.9l-.5-.5a1.7 1.7 0 0 1 1.2-2.9H18a3 3 0 0 0 3-3 9 9 0 0 0-9-8.7Z"/><circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.2" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="8.3" r="1.1" fill="currentColor" stroke="none"/></svg></span>
                  <div class="card-h"><span class="card-t">Theme</span><span class="card-s" data-field="themeName">Carbon</span></div>
                  <div class="themes" data-field="themes" role="group" aria-label="Panel theme">
                    <button class="theme" type="button" data-theme-btn="carbon" aria-pressed="true" title="Carbon: green on carbon, the classic"><i class="sw-carbon"></i><span>Carbon</span></button>
                    <button class="theme" type="button" data-theme-btn="aurora" aria-pressed="false" title="Aurora: teal fading into violet"><i class="sw-aurora"></i><span>Aurora</span></button>
                    <button class="theme" type="button" data-theme-btn="sunset" aria-pressed="false" title="Sunset: warm orange and pink"><i class="sw-sunset"></i><span>Sunset</span></button>
                    <button class="theme" type="button" data-theme-btn="ice" aria-pressed="false" title="Ice: cold cyan on deep blue"><i class="sw-ice"></i><span>Ice</span></button>
                    <button class="theme" type="button" data-theme-btn="violet" aria-pressed="false" title="Violet: purple neon"><i class="sw-violet"></i><span>Violet</span></button>
                    <button class="theme" type="button" data-theme-btn="rgb" aria-pressed="false" title="RGB: animated rainbow border and title"><i class="sw-rgb"></i><span>RGB</span></button>
                  </div>
                </div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 5h14v14H5z"/><path d="M8 9h8M8 13h5"/></svg></span>
                  <div class="card-h"><span class="card-t">Config</span><span class="card-s">carry it anywhere</span></div>
                  <div class="rows" style="display:flex; gap:6px; margin:0 0 2px">
                    <button class="act" type="button" data-act="export" title="Copy this configuration (profile, limit, sound, switches) so it can be pasted in another browser or account">copy</button>
                    <button class="act" type="button" data-act="import" title="Apply whatever config is pasted in the box below">apply</button>
                    <button class="act" type="button" data-act="report" title="Copy a diagnostic report (version, profile, counters, last races, recent notices, environment) to paste when something is off">report</button>
                    <button class="act" type="button" data-act="csv" title="Download the closed sessions as a CSV (date, races, WPM, target, deviation, accuracy, DQ, reason) for a spreadsheet">csv</button>
                  </div>
                  <div class="rows">
                    <div class="row up-row" data-field="upRow" title="Auto-update check: the last result, its error and when it will retry"><span>update</span><b data-field="up">—</b></div>
                    <div class="row ch-row" data-field="chRow" title="Daily Challenge popup: close it automatically. Shift+click sets a CSS selector"><span>challenge</span><b data-field="ch">on</b></div>
                  </div>
                  <textarea class="cfg-text" data-field="cfgText" spellcheck="false" placeholder="Paste a copied config here and press apply."></textarea>
                  <div class="cfg-note" data-field="cfgNote">Pace and switches are saved on this browser and survive reloads.</div>
                </div>
              </div>
            </section>
            </template>

            <!-- ------------------------------ LOG --------------------------- -->
            <template data-view="log">
            <section class="view v-log" id="nt-view-log" role="tabpanel" aria-label="Log">
              <div class="view-head"><span>Log</span><b>sessions · challenges</b></div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/></svg></span>
                <div class="card-h"><span class="card-t" data-field="prevLabel">prev</span><span class="card-s">click for the table</span></div>
                <div class="prev-row row" style="display:none" title="The last session that closed: races, average WPM and deviation from target">
                  <span>session</span><b data-field="prev">—</b>
                </div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg></span>
                <div class="card-h"><span class="card-t">Closed sessions</span><span class="card-s" data-field="logCount">0</span></div>
                <div class="log-list" data-field="closedList"></div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20V9M10 20V4M16 20v-6M22 20H2"/></svg></span>
                <div class="card-h"><span class="card-t">Last 7 days</span><span class="card-s" data-field="weekTotal">empty</span></div>
                <div class="log-list" data-field="weekList"></div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h16M4 12h16M4 18h10"/></svg></span>
                <div class="card-h"><span class="card-t">Daily Challenges</span><span class="card-s" data-field="chCount">no data</span></div>
                <div class="log-list" data-field="chList"></div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/></svg></span>
                <div class="card-h"><span class="card-t">Calibration</span><span class="card-s">account average</span></div>
                <div class="rows">
                  <div class="row"><span>when</span><b data-field="calLogWhen">never</b></div>
                  <div class="row"><span>wpm</span><b data-field="calLogWpm">—</b></div>
                  <div class="row"><span>accuracy</span><b data-field="calLogAcc">—</b></div>
                  <div class="row" title="Our accuracy model minus the one the game printed, averaged over the last 20 races"><span>model Δ</span><b data-field="calDelta">—</b></div>
                </div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/></svg></span>
                <div class="card-h"><span class="card-t">Live passes</span><span class="card-s" data-field="liveCount">none</span></div>
                <div class="rows" style="display:flex; gap:6px; margin:0 0 2px">
                  <button class="act" type="button" data-field="liveLoad" title="Load tests/live/live-history.csv or live-history.json (the files npm run live writes) to compare the last passes">load file</button>
                  <button class="act" type="button" data-field="liveClear" title="Forget the loaded passes; the CSV on disk is untouched">clear</button>
                  <button class="act" type="button" data-field="livePickExport" disabled title="Download the selected A/B comparison as live-compare-*.csv">export A/B</button>
                </div>
                <input type="file" accept=".csv,.json,text/csv,application/json" data-field="liveFile" style="display:none" aria-label="Load the live pass CSV or JSON">
                <div class="today-row row" data-field="liveDriftRow" style="display:none" title="Latest pass mean vs the average of the previous passes"><span>trend</span><b data-field="liveDrift">—</b></div>
                <div class="today-row row" data-field="liveCompareRow" style="display:none" title="The last two passes, side by side (mean model Δ)"><span>last two</span><b data-field="liveCompare">—</b></div>
                <div class="rows" data-field="livePickRow" style="display:none">
                  <div class="row cmp-row" title="First pass; the difference is B minus A"><span>A</span><select class="cmp-select" data-field="livePickA" aria-label="First live pass"></select></div>
                  <div class="row cmp-row" title="Second pass; the difference is B minus A"><span>B</span><select class="cmp-select" data-field="livePickB" aria-label="Second live pass"></select></div>
                  <div class="row" title="Mean model Δ of B minus A"><span>diff</span><b data-field="livePickResult">—</b></div>
                </div>
                <div class="today-row row" data-field="liveStreakRow" style="display:none" title="Two or more passes in a row drifted past the band"><span>streak</span><b data-field="liveStreak">—</b></div>
                <div class="today-row row" data-field="liveSpreadRow" style="display:none" title="Latest block of 10+ races: model Δ spread (sd); above 0.10 pts means the block is too scattered"><span>spread</span><b data-field="liveSpread">—</b></div>
                <div class="log-list" data-field="liveList"></div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 8h12M6 12h12M6 16h8"/></svg></span>
                <div class="card-h"><span class="card-t">Today</span><span class="card-s">resets at midnight</span></div>
                <div class="today-row row" data-field="todayRow" style="display:none" title="Today: races · average WPM · Mystery Boxes claimed · disqualifications"><span>summary</span><b data-field="today">—</b></div>
                <div class="log-list" data-field="noticeList"></div>
              </div>
            </section>
            </template>

            <!-- ------------------------------ INFO -------------------------- -->
            <template data-view="info">
            <section class="view v-info" id="nt-view-info" role="tabpanel" aria-label="Info">
              <div class="view-head"><span>Info</span><b>keys · guardrails</b></div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/></svg></span>
                <div class="card-h"><span class="card-t">About</span><span class="card-s" data-field="aboutVer">v7.0.0</span></div>
                <p class="about">Human-paced racer for one account: calibrated typing inside the account's own envelope, human breaks, a queue that recovers the garage, reloads, CAPTCHAs and re-logins, and a guard that stops everything on an impossible reading. <b>There is no fast mode.</b></p>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h9M17 6h3M4 18h3M11 18h9"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="18" r="2"/></svg></span>
                <div class="card-h"><span class="card-t">Keys</span><span class="card-s">any time</span></div>
                <div class="keys">
                  <div class="key-row"><kbd>MODE chip</kbd><span>status only: always AUTO, it starts by itself</span></div>
                  <div class="key-row"><kbd>Alt+A</kbd><span>resume, from anywhere and even while typing</span></div>
                  <div class="key-row"><kbd>Alt+N / Stop</kbd><span>stop it (the chip never turns it off)</span></div>
                  <div class="key-row"><kbd>Alt+R</kbd><span>clear the race history</span></div>
                  <div class="key-row"><kbd>Alt+Shift+C</kbd><span>clear the accuracy trend (model Δ)</span></div>
                  <div class="key-row"><kbd>Alt+H</kbd><span>closed sessions, table in the console</span></div>
                  <div class="key-row"><kbd>Alt+T</kbd><span>cycle the panel theme (saved)</span></div>
                  <div class="key-row"><kbd>Alt+G</kbd><span>fold / unfold the garage panel</span></div>
                  <div class="key-row"><kbd>Alt+M</kbd><span>footer HUD: full / compact / hidden</span></div>
                  <div class="key-row"><kbd>Alt+S / Esc</kbd><span>stop (mid-race it waits for the race to end)</span></div>
                </div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l8 4v6c0 5-3.4 7.4-8 8-4.6-.6-8-3-8-8V7z"/></svg></span>
                <div class="card-h"><span class="card-t">Guard</span><span class="card-s">two failures, no excuses</span></div>
                <div class="keys">
                  <div class="key-row"><kbd>ceiling</kbd><span>no race may average above <b data-field="infoCap">120</b> WPM</span></div>
                  <div class="key-row"><kbd>copies</kbd><span>two copies alive: one types, the rest wait</span></div>
                  <div class="key-row"><kbd>report</kbd><span>TUNE → report copies a full diagnostic</span></div>
                </div>
              </div>
            </section>
            </template>
          </div>
        </div>
        <div class="foot">
          <div class="status" data-field="status">waiting…</div>
          <div class="foot-bar">
            <span class="led"></span>
            <b data-field="footState">idle</b>
            <span class="fsep">|</span>
            <span data-field="footMode">auto</span>
            <span class="fsep">|</span>
            <span data-field="footWpm">— wpm</span>
            <span class="fsep">|</span>
            <span data-field="footAcc" title="Live accuracy">— acc</span>
            <span class="fsep">|</span>
            <span data-field="footClock" title="Race clock">0:00</span>
            <span class="fsep">|</span>
            <span data-field="footCap">cap 120</span>
            <span class="hint" data-field="footHint">Alt+S stop</span>
          </div>
        </div>
        <div class="actions">
          <button class="toggle" type="button">Pause</button>
          <button class="gear" type="button" data-open="0" title="Settings: pace profile, switches, session limit and export/import of the config">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>
          </button>
          <button class="stop" type="button" title="Stop after the current race · Alt+S">Stop</button>
        </div>
      </div>
    `;

    // Las vistas inactivas viven en <template>: sus nodos se parsean, pero no
    // entran en el arbol del documento ni en el layout. `pick` las encuentra
    // para que el codigo que ya las pinta siga funcionando, y `hydrateView`
    // las mueve a su sitio la primera vez que se abre la pestana.
    const templates = [...shadow.querySelectorAll('template[data-view]')];
    const pick = (selector) => {
      const found = shadow.querySelector(selector);
      if (found) return found;
      for (const template of templates) {
        const node = template.content.querySelector(selector);
        if (node) return node;
      }
      return null;
    };

    document.body.appendChild(host);
    perfCounters.panelNodes = shadow.querySelectorAll('*').length;
    panel.host = host;
    panel.mountedViews = new Set(['stats']);

    panel.root = pick('.panel');
    panel.refs = {
      mode: pick('.mode'),
      pace: pick('.pace'),
      cap: pick('[data-field="cap"]'),
      hudRow: pick('.hud-row'),
      hud: pick('[data-field="hud"]'),
      clockRow: pick('.clock-row'),
      clock: pick('[data-field="clock"]'),
      resultRow: pick('.result-row'),
      result: pick('[data-field="result"]'),
      guardRow: pick('.guard-row'),
      guard: pick('[data-field="guard"]'),
      todayRow: pick('[data-field="todayRow"]'),
      today: pick('[data-field="today"]'),
      boxRow: pick('.box-row'),
      box: pick('[data-field="box"]'),
      target: pick('[data-field="target"]'),
      live: pick('[data-field="live"]'),
      acc: pick('[data-field="acc"]'),
      paceSource: pick('[data-field="paceSource"]'),
      session: pick('[data-field="session"]'),
      sessionRow: pick('.session-row'),
      sessionLeft: pick('[data-field="sessionLeft"]'),
      breakLeft: pick('[data-field="break"]'),
      dqRow: pick('.dq-row'),
      dq: pick('[data-field="dq"]'),
      status: pick('[data-field="status"]'),
      trimRow: pick('.trim-row'),
      trim: pick('[data-field="trim"]'),
      history: pick('[data-field="history"]'),
      progress: pick('[data-field="progress"]'),
      progFill: pick('[data-field="progfill"]'),
      races: pick('[data-field="races"]'),
      dayXp: pick('[data-field="dayXp"]'),
      rate: pick('[data-field="rate"]'),
      nitro: pick('[data-field="nitro"]'),
      nitroDelta: pick('[data-field="nitroDelta"]'),
      cycle: pick('[data-field="cycle"]'),
      xpBreak: pick('[data-field="xpBreak"]'),
      tanda: pick('[data-field="tanda"]'),
      raceLimitRow: pick('[data-field="raceLimitRow"]'),
      limit: pick('[data-field="limit"]'),
      prevRow: pick('.prev-row'),
      prevLabel: pick('[data-field="prevLabel"]'),
      prev: pick('[data-field="prev"]'),
      // --- rediseno v7: rail, cabecera, ajustes y barra de estado ---
      title: pick('[data-field="title"]'),
      ver: pick('[data-field="ver"]'),
      update: pick('[data-field="update"]'),
      rail: pick('.rail'),
      views: pick('.views'),
      liveTag: pick('[data-field="liveTag"]'),
      footState: pick('[data-field="footState"]'),
      footMode: pick('[data-field="footMode"]'),
      footWpm: pick('[data-field="footWpm"]'),
      footAcc: pick('[data-field="footAcc"]'),
      footClock: pick('[data-field="footClock"]'),
      footCap: pick('[data-field="footCap"]'),
      footHint: pick('[data-field="footHint"]'),
      seg: pick('.seg'),
      themes: pick('[data-field="themes"]'),
      themeName: pick('[data-field="themeName"]'),
      tuneCap: pick('[data-field="tuneCap"]'),
      tuneRange: pick('[data-field="tuneRange"]'),
      limitSlider: pick('[data-field="limitSlider"]'),
      etaLeft: pick('[data-field="etaLeft"]'),
      timeLimitRow: pick('[data-field="timeLimitRow"]'),
      timeLimit: pick('[data-field="timeLimit"]'),
      timeSlider: pick('[data-field="timeSlider"]'),
      timeLeftRow: pick('[data-field="timeLeftRow"]'),
      timeLeft: pick('[data-field="timeLeft"]'),
      xpLimitRow: pick('[data-field="xpLimitRow"]'),
      xpLimit: pick('[data-field="xpLimit"]'),
      xpSlider: pick('[data-field="xpSlider"]'),
      xpRow: pick('[data-field="xpRow"]'),
      xpTotal: pick('[data-field="xpTotal"]'),
      dailyRaceRow: pick('[data-field="dailyRaceRow"]'),
      dailyRaces: pick('[data-field="dailyRaces"]'),
      dailyRaceSlider: pick('[data-field="dailyRaceSlider"]'),
      dailyXpRow: pick('[data-field="dailyXpRow"]'),
      dailyXp: pick('[data-field="dailyXp"]'),
      dailyXpSlider: pick('[data-field="dailyXpSlider"]'),
      dailyLeft: pick('[data-field="dailyLeft"]'),
      activeRow: pick('[data-field="activeRow"]'),
      activeState: pick('[data-field="activeState"]'),
      activeStartRow: pick('[data-field="activeStartRow"]'),
      activeStart: pick('[data-field="activeStart"]'),
      activeStartSlider: pick('[data-field="activeStartSlider"]'),
      activeEndRow: pick('[data-field="activeEndRow"]'),
      activeEnd: pick('[data-field="activeEnd"]'),
      activeEndSlider: pick('[data-field="activeEndSlider"]'),
      activeNow: pick('[data-field="activeNow"]'),
      calRow: pick('[data-field="calRow"]'),
      cal: pick('[data-field="cal"]'),
      calWpm: pick('[data-field="calWpm"]'),
      calAcc: pick('[data-field="calAcc"]'),
      calAccount: pick('[data-field="calAccount"]'),
      calDelta: pick('[data-field="calDelta"]'),
      accSpark: pick('[data-field="accSpark"]'),
      accSparkLine: pick('[data-field="accSparkLine"]'),
      accSparkArea: pick('[data-field="accSparkArea"]'),
      liveCount: pick('[data-field="liveCount"]'),
      liveLoad: pick('[data-field="liveLoad"]'),
      liveFile: pick('[data-field="liveFile"]'),
      liveList: pick('[data-field="liveList"]'),
      liveClear: pick('[data-field="liveClear"]'),
      liveDriftRow: pick('[data-field="liveDriftRow"]'),
      liveDrift: pick('[data-field="liveDrift"]'),
      liveCompareRow: pick('[data-field="liveCompareRow"]'),
      liveCompare: pick('[data-field="liveCompare"]'),
      livePickRow: pick('[data-field="livePickRow"]'),
      livePickA: pick('[data-field="livePickA"]'),
      livePickB: pick('[data-field="livePickB"]'),
      livePickResult: pick('[data-field="livePickResult"]'),
      livePickExport: pick('[data-field="livePickExport"]'),
      liveStreakRow: pick('[data-field="liveStreakRow"]'),
      liveStreak: pick('[data-field="liveStreak"]'),
      liveSpreadRow: pick('[data-field="liveSpreadRow"]'),
      liveSpread: pick('[data-field="liveSpread"]'),
      chCount: pick('[data-field="chCount"]'),
      chList: pick('[data-field="chList"]'),
      calLogWhen: pick('[data-field="calLogWhen"]'),
      calLogWpm: pick('[data-field="calLogWpm"]'),
      calLogAcc: pick('[data-field="calLogAcc"]'),
      chRow: pick('[data-field="chRow"]'),
      ch: pick('[data-field="ch"]'),
      weekList: pick('[data-field="weekList"]'),
      weekTotal: pick('[data-field="weekTotal"]'),
      closedList: pick('[data-field="closedList"]'),
      logCount: pick('[data-field="logCount"]'),
      noticeList: pick('[data-field="noticeList"]'),
      aboutVer: pick('[data-field="aboutVer"]'),
      infoCap: pick('[data-field="infoCap"]'),
      gear: pick('.gear'),
      cfg: pick('.cfg'),
      cfgText: pick('[data-field="cfgText"]'),
      cfgNote: pick('[data-field="cfgNote"]'),
      up: pick('[data-field="up"]'),
      nitroStrategy: pick('[data-field="nitroStrategy"]'),
      nitroPreview: pick('[data-field="nitroPreview"]'),
      foot: pick('[data-field="foot"]'),
      avg: pick('[data-field="avg"]'),
      best: pick('[data-field="best"]'),
      toggle: pick('.toggle'),
      stop: pick('.stop'),
      collapse: pick('.collapse'),
      seasonCard: pick('[data-field="seasonCard"]'),
      seasonTag: pick('[data-field="seasonTag"]'),
      seasonName: pick('[data-field="seasonName"]'),
      seasonFill: pick('[data-field="seasonFill"]'),
      seasonTier: pick('[data-field="seasonTier"]'),
      seasonXp: pick('[data-field="seasonXp"]'),
      seasonNext: pick('[data-field="seasonNext"]'),
      seasonRaces: pick('[data-field="seasonRaces"]'),
      seasonPace: pick('[data-field="seasonPace"]'),
      seasonEnds: pick('[data-field="seasonEnds"]'),
      seasonAlert: pick('[data-field="seasonAlert"]'),
      seasonNote: pick('[data-field="seasonNote"]'),
      seasonOpen: pick('[data-field="seasonOpen"]'),
    };

    // El ultimo aviso importante se pinta aqui desde ya: si el panel se crea
    // despues de una DQ, la razon no se pierde.
    statusEl = panel.refs.status;
    if (statusEl) setText(statusEl, lastStatus || 'waiting…');

    panel.refs.toggle.title = 'Pause or resume sending keys (inside a race the pause resumes by itself after 6 s)';
    // El chip del ritmo sigue siendo LEGIT (no hay otro tipo de ritmo) y ahora
    // cicla el perfil: soft, normal, fast, todos con la misma cadencia humana.
    paintPace();
    paintTheme();

    // Cabecera: version. No cambia en caliente, se pinta una vez.
    setText(panel.refs.ver, `v${VERSION}`);
    setText(panel.refs.aboutVer, `v${VERSION}`);
    if (!panel.mountedViews || panel.mountedViews.has('log')) {
      paintLogLists();
      paintChallengeList();
    } else {
      readChallengeProgress();
    }
    if (panel.refs.cap) {
      const cap = CONFIG.wpm.hardCap;
      setText(panel.refs.cap, Number.isFinite(cap) ? `≤ ${cap} wpm` : 'no cap');
    }

    if (panel.refs.raceLimitRow) {
      panel.refs.raceLimitRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = LIMIT_STEPS.find((value) => value > session.raceLimit);
        setRaceLimit(next === undefined ? 0 : next);
      });
    }

    // La fila del tope por tiempo cicla igual que la de carreras, con sus
    // propios escalones: libre, 15 min, 30 min, 1 h, 2 h.
    if (panel.refs.timeLimitRow) {
      panel.refs.timeLimitRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = TIME_LIMIT_STEPS.find((value) => value > session.timeLimit);
        setTimeLimit(next === undefined ? 0 : next);
      });
    }

    // Y el tercero, en XP: mismos escalones que se pintan en sld-ends.
    if (panel.refs.xpLimitRow) {
      panel.refs.xpLimitRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = XP_LIMIT_STEPS.find((value) => value > session.xpLimit);
        setXpLimit(next === undefined ? 0 : next);
      });
    }

    // La tarjeta Season no adivina: abre la pagina oficial y deja que su propia
    // pestana escriba la foto que este panel leera al volver.
    if (panel.refs.seasonOpen) {
      panel.refs.seasonOpen.addEventListener('click', (event) => {
        event.stopPropagation();
        try {
          window.open('https://www.nitrotype.com/season', '_blank', 'noopener');
          setText(panel.refs.seasonNote, 'Season opened. This card refreshes when that tab finishes loading.');
        } catch {
          location.href = '/season';
        }
      });
    }

    // La fila de la ultima tanda cerrada abre la misma tabla que Alt+H: el
    // detalle de cada sesion, sin tener que recordar el atajo.
    if (panel.refs.prevRow) {
      panel.refs.prevRow.addEventListener('click', (event) => {
        event.stopPropagation();
        showTandaLog();
      });
    }

    // Rail: cada icono abre su vista. El cuadrado verde que viaja lo mueve el
    // data-index del contenedor, con muelle, desde el CSS.
    if (panel.refs.rail) {
      panel.refs.rail.addEventListener('click', (event) => {
        const btn = event.target && event.target.closest ? event.target.closest('[data-tab-btn]') : null;
        if (!btn) return;
        event.stopPropagation();
        showTab(btn.dataset.tabBtn);
        btn.blur();
      });

      // Patron tablist: flechas, Home y End mueven la vista y el foco. No toca
      // el teclado del juego porque solo se activa con el foco dentro del rail.
      panel.refs.rail.addEventListener('keydown', (event) => {
        const btn = event.target && event.target.closest ? event.target.closest('[data-tab-btn]') : null;
        if (!btn) return;
        const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        const buttons = Array.from(panel.refs.rail.querySelectorAll('[data-tab-btn]'));
        const current = buttons.indexOf(btn);
        if (current < 0) return;
        let next = current;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (current + 1) % buttons.length;
        else next = (current - 1 + buttons.length) % buttons.length;
        event.preventDefault();
        event.stopPropagation();
        showTab(buttons[next].dataset.tabBtn);
        buttons[next].focus();
      });
    }

    // Tope de tanda con deslizador: los mismos escalones que el clic en la fila
    // (libre, 10, 20, 50, 100). El relleno verde lo pinta paintLimitSlider.
    if (panel.refs.limitSlider) {
      panel.refs.limitSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.limitSlider.value, 10) || 0, 0, LIMIT_STEPS.length - 1);
        setRaceLimit(LIMIT_STEPS[index]);
      });
      paintLimitSlider();
    }

    // Mismo deslizador, otro reloj: el relleno verde lo pinta paintTimeSlider.
    if (panel.refs.timeSlider) {
      panel.refs.timeSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.timeSlider.value, 10) || 0, 0, TIME_LIMIT_STEPS.length - 1);
        setTimeLimit(TIME_LIMIT_STEPS[index]);
      });
      paintTimeSlider();
    }

    if (panel.refs.xpSlider) {
      panel.refs.xpSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.xpSlider.value, 10) || 0, 0, XP_LIMIT_STEPS.length - 1);
        setXpLimit(XP_LIMIT_STEPS[index]);
      });
      paintXpSlider();
    }

    // Presupuesto diario: mismos dos controles (fila + deslizador) que los
    // topes de tanda, pero guardados en sus propias claves.
    if (panel.refs.dailyRaceRow) {
      panel.refs.dailyRaceRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = DAILY_RACE_STEPS.find((value) => value > session.dailyRaceLimit);
        setDailyRaceLimit(next === undefined ? 0 : next);
      });
    }
    if (panel.refs.dailyRaceSlider) {
      panel.refs.dailyRaceSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.dailyRaceSlider.value, 10) || 0, 0, DAILY_RACE_STEPS.length - 1);
        setDailyRaceLimit(DAILY_RACE_STEPS[index]);
      });
      paintDailyRaceSlider();
    }
    if (panel.refs.dailyXpRow) {
      panel.refs.dailyXpRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = DAILY_XP_STEPS.find((value) => value > session.dailyXpLimit);
        setDailyXpLimit(next === undefined ? 0 : next);
      });
    }
    if (panel.refs.dailyXpSlider) {
      panel.refs.dailyXpSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.dailyXpSlider.value, 10) || 0, 0, DAILY_XP_STEPS.length - 1);
        setDailyXpLimit(DAILY_XP_STEPS[index]);
      });
      paintDailyXpSlider();
    }

    // Horas activas: la fila enciende/apaga y los dos deslizadores eligen la
    // hora exacta. Shift en las filas mueve al reves (o resetea el rango).
    if (panel.refs.activeRow) {
      panel.refs.activeRow.addEventListener('click', (event) => {
        event.stopPropagation();
        if (event.shiftKey) {
          setActiveHour('start', 8, true);
          setActiveHour('end', 23, true);
          setActiveOn(true);
          return;
        }
        setActiveOn(!session.activeOn);
      });
    }
    if (panel.refs.activeStartRow) {
      panel.refs.activeStartRow.addEventListener('click', (event) => {
        event.stopPropagation();
        setActiveHour('start', (session.activeStart + (event.shiftKey ? 23 : 1)) % 24);
      });
    }
    if (panel.refs.activeEndRow) {
      panel.refs.activeEndRow.addEventListener('click', (event) => {
        event.stopPropagation();
        setActiveHour('end', (session.activeEnd + (event.shiftKey ? 23 : 1)) % 24);
      });
    }
    if (panel.refs.activeStartSlider) {
      panel.refs.activeStartSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        setActiveHour('start', parseInt(panel.refs.activeStartSlider.value, 10) || 0, true);
        paintActiveSlider('start');
      });
      paintActiveSlider('start');
    }
    if (panel.refs.activeEndSlider) {
      panel.refs.activeEndSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        setActiveHour('end', parseInt(panel.refs.activeEndSlider.value, 10) || 0, true);
        paintActiveSlider('end');
      });
      paintActiveSlider('end');
    }

    // Fila de auto-calibracion: no hay apagado; el clic solo fuerza una lectura
    // nueva para que el rango se mueva ya con la media mas reciente.
    if (panel.refs.calRow) {
      panel.refs.calRow.addEventListener('click', (event) => {
        event.stopPropagation();
        refreshCalibration();
      });
    }

    // Fila del popup de challenges: clic normal enciende/apaga; Mayus+clic pide
    // el selector CSS para cuando el barrido por texto no baste.
    if (panel.refs.chRow) {
      panel.refs.chRow.addEventListener('click', (event) => {
        event.stopPropagation();
        if (event.shiftKey) {
          const next = prompt('CSS selector for the Daily Challenge popup (empty = detect by text):', CONFIG.challenges.selector || '');
          if (next !== null) {
            CONFIG.challenges.selector = next.trim();
            disk.set(KEYS.challengeSelector, CONFIG.challenges.selector);
            log(CONFIG.challenges.selector ? `Challenge selector set: ${CONFIG.challenges.selector}` : 'Challenge selector cleared: text detection.');
            paintChallenges();
          }
          return;
        }
        CONFIG.challenges.enabled = !CONFIG.challenges.enabled;
        savePrefs();
        log(CONFIG.challenges.enabled ? 'Daily Challenge popups: auto-close on.' : 'Daily Challenge popups: auto-close off.');
        paintChallenges();
      });
    }

    // El panel es nuevo: hay que repintar el historial y la temporada aunque
    // los datos no hayan cambiado (si no, quedan vacios hasta el proximo cambio).
    panel.historySig = '';
    panel.seasonSig = '';
    panel.seasonBaseSig = '';
    seasonPaintAt = 0;

    applyCollapsed(disk.get(KEYS.panelCollapsed) === '1');
    applyFootMode();
    restorePosition();
    makeDraggable(shadow);

    panel.refs.toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setPaused(!session.paused);
      panel.refs.toggle.blur();
    });

    panel.refs.stop.addEventListener('click', (event) => {
      event.stopPropagation();
      // Parado no hay nada que parar: el mismo boton vuelve a arrancar. Hace
      // lo mismo que Alt+A, con las mismas puertas (tope diario y horas).
      if (session.stopped) resumeAuto();
      else requestStop();
      panel.refs.stop.blur();
    });

    panel.refs.collapse.addEventListener('click', (event) => {
      event.stopPropagation();
      const collapsed = panel.root.dataset.collapsed !== 'true';
      applyCollapsed(collapsed);
      restorePosition();
      if (!collapsed) updatePanel(true);
      panel.refs.collapse.blur();
    });

    // El chip del modo no es un interruptor: dice AUTO y nada mas. Parar es
    // cosa de Stop / Esc, y la cola se rearma sola.

    // El chip LEGIT cambia de perfil al pulsarlo: soft -> balanced -> fast.
    if (panel.refs.pace) {
      panel.refs.pace.addEventListener('click', (event) => {
        event.stopPropagation();
        const index = PACE_ORDER.indexOf(paceProfile);
        setPaceProfile(PACE_ORDER[(index + 1) % PACE_ORDER.length]);
        panel.refs.pace.blur();
      });
    }

    // Tema: un solo escuchador para las seis muestras. El CSS hace el resto.
    if (panel.refs.themes) {
      panel.refs.themes.addEventListener('click', (event) => {
        const chip = event.target && event.target.closest ? event.target.closest('[data-theme-btn]') : null;
        if (!chip) return;
        event.stopPropagation();
        setTheme(chip.dataset.themeBtn);
        chip.blur();
      });
    }

    // ⚙ lleva a la vista de ajustes (y vuelve): es el mismo cajon de siempre,
    // ahora como una pestaña mas del rail.
    if (panel.refs.gear) {
      panel.refs.gear.addEventListener('click', (event) => {
        event.stopPropagation();
        showTab(panel.root.dataset.tab === 'tune' ? 'stats' : 'tune');
        panel.refs.gear.blur();
      });
    }

    // Los chips del cajon: perfil, interruptores y exportar/importar. Un solo
    // escuchador para todos, que el cajon se repinta entero y no hay que
    // reenganchar nada al cambiar de perfil.
    if (panel.refs.cfg) {
      panel.refs.cfg.addEventListener('click', (event) => {
        const target = event.target;
        const chip = target && target.closest ? target.closest('button') : null;
        if (!chip) return;
        event.stopPropagation();

        if (chip.dataset.pace) {
          setPaceProfile(chip.dataset.pace);
        } else if (chip.dataset.toggle === 'useNitro') {
          setUseNitro(CONFIG.useNitro === false);
        } else if (chip.dataset.toggle === 'sound') {
          // El click ya es gesto valido para el audio: al encenderlo suena.
          setSfx(!sfxOn);
        } else if (chip.dataset.toggle && CONFIG[chip.dataset.toggle]) {
          const key = chip.dataset.toggle;
          CONFIG[key].enabled = CONFIG[key].enabled === false;
          savePrefs();
          paintConfig();
          log(`${key} ${CONFIG[key].enabled === false ? 'off' : 'on'}.`);
        } else if (chip.dataset.act === 'export') {
          exportConfig();
        } else if (chip.dataset.act === 'import') {
          importConfig();
        } else if (chip.dataset.act === 'report') {
          exportDiagnostics();
        } else if (chip.dataset.act === 'csv') {
          exportSessionsCsv();
        }

        chip.blur();
      });
    }

    if (panel.refs.nitroStrategy) {
      panel.refs.nitroStrategy.addEventListener('change', (event) => {
        event.stopPropagation();
        setNitroStrategy(panel.refs.nitroStrategy.value);
      });
    }

    // Pasadas del banco live: el boton abre el selector y el CSV se queda
    // guardado. La tarjeta vive en LOG y no depende de la consola.
    if (panel.refs.liveLoad && panel.refs.liveFile) {
      panel.refs.liveLoad.addEventListener('click', (event) => {
        event.stopPropagation();
        panel.refs.liveFile.click();
        panel.refs.liveLoad.blur();
      });
      panel.refs.liveFile.addEventListener('change', () => {
        const file = panel.refs.liveFile.files && panel.refs.liveFile.files[0];
        if (file) loadLiveCsv(file);
        panel.refs.liveFile.value = '';
      });
    }

    if (panel.refs.liveClear) {
      panel.refs.liveClear.addEventListener('click', (event) => {
        event.stopPropagation();
        clearLivePasses();
        panel.refs.liveClear.blur();
      });
    }
    for (const select of [panel.refs.livePickA, panel.refs.livePickB]) {
      if (select) select.addEventListener('change', paintLivePick);
    }
    if (panel.refs.livePickExport) {
      panel.refs.livePickExport.addEventListener('click', (event) => {
        event.stopPropagation();
        downloadLiveCompareCsv();
        panel.refs.livePickExport.blur();
      });
    }
    renderLivePasses();

    paintConfig();
    updatePanel();
  }

  function applyCollapsed(collapsed) {
    if (!panel.root) return;

    panel.root.dataset.collapsed = collapsed ? 'true' : 'false';
    panel.refs.collapse.textContent = collapsed ? '+' : '−';
    panel.refs.collapse.title = collapsed ? 'Expand' : 'Minimize';
    panel.refs.collapse.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    panel.refs.collapse.setAttribute('aria-label', collapsed ? 'Expand panel' : 'Collapse panel');
    disk.set(KEYS.panelCollapsed, collapsed ? '1' : '0');
  }

  // El mini-HUD se queda pegado al borde inferior mientras el panel esta
  // minimizado. Alt+M lo recorre: completo -> compacto (LED, estado, WPM,
  // precision y reloj) -> oculto -> completo. El estado se guarda para que
  // una recarga no devuelva la barra si la habias escondido.
  let footMode = 'full';
  const FOOT_MODES = ['full', 'compact', 'hidden'];

  function applyFootMode(mode) {
    if (!panel.root) return;
    const next = mode === undefined ? disk.get(KEYS.footMode, 'full') : mode;
    footMode = FOOT_MODES.includes(next) ? next : 'full';
    panel.root.dataset.foot = footMode;
  }

  function cycleFootMode() {
    const index = Math.max(0, FOOT_MODES.indexOf(footMode));
    footMode = FOOT_MODES[(index + 1) % FOOT_MODES.length];
    disk.set(KEYS.footMode, footMode);
    applyFootMode(footMode);
    log(footMode === 'compact'
      ? 'Footer HUD compact: wpm · acc · clock (Alt+M).'
      : footMode === 'hidden'
        ? 'Footer HUD hidden (Alt+M).'
        : 'Footer HUD full (Alt+M).');
  }

  let pauseGuard = null;

  function clearPauseGuard() {
    if (pauseGuard) {
      clearTimeout(pauseGuard);
      pauseGuard = null;
    }
  }

  function setPaused(paused) {
    if (session.paused === paused) return;
    session.paused = paused;

    // Pausar DENTRO de una carrera es una descalificacion segura: si dejas de
    // mandar teclas ~12 s, el servidor te expulsa. La pausa se corta sola.
    if (paused) {
      if (session.typing && !session.stopped) {
        clearPauseGuard();
        session.pauseEndsAt = Date.now() + CONFIG.dqGuardMs;
        pauseGuard = setTimeout(() => {
          pauseGuard = null;
          if (!session.paused || !session.typing) return;
          log('Pause inside a race resumed by itself: sitting still for ~12 s disqualifies you.');
          setPaused(false);
        }, CONFIG.dqGuardMs);
        log(`Pause inside a race capped at ${CONFIG.dqGuardMs / 1000} s (longer = DQ for inactivity).`);
      }
    } else {
      clearPauseGuard();
      session.pauseEndsAt = 0;
    }

    // Se recuerda para que una recarga de la app no reanude el tipado sola.
    try {
      if (paused) {
        localStorage.setItem(KEYS.paused, JSON.stringify({ paused: true, at: Date.now() }));
      } else {
        localStorage.removeItem(KEYS.paused);
      }
    } catch {
      /* almacenamiento bloqueado */
    }

    log(paused ? 'Paused: the loop stops sending keys.' : 'Resumed.');
    updatePanel();
  }

  // Contrato con la ventana de arriba: un resumen pequeño del estado, para que
  // la cola no pulse "Race Again" mientras el tipador esta trabajando.
  function publishState() {
    try {
      if (window.top === window) return;
      window.top.__ntaFrame = {
        mode: MODE,
        pace: session.pace,
        paused: session.paused,
        stopped: session.stopped,
        running: session.running,
        typing: session.typing,
        breakUntil: session.breakUntil,
        chars: session.chars,
        standby: standbyActive(), // otra copia lleva el teclado
        instance: INSTANCE_ID,   // dos ids alternando = dos tipadores vivos
        at: Date.now(),
      };
    } catch {
      /* marco inaccesible: la cola se queda sin señal y no actua */
    }
  }

  /* --------------------------------------------------------------------------
   * Season tracker
   *
   * La pagina /season renderiza el tier activo en React. El estado no viaja en
   * el HTML (es un shell), asi que la foto se toma ALLI, donde el DOM ya esta
   * hidratado, y se guarda para que el panel de la carrera la lea despues. El
   * XP exacto sale de las props del componente; si React cambia de forma, el
   * parser se queda con el tier y el porcentaje visibles en vez de inventar.
   * ------------------------------------------------------------------------ */
  function seasonClean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function seasonFiberProps(node) {
    if (!node) return null;
    let fiber = null;
    try {
      const key = Object.keys(node).find((name) => name.startsWith('__reactFiber$'));
      fiber = key ? node[key] : null;
    } catch {
      return null;
    }
    for (let depth = 0; depth < 30 && fiber; depth++) {
      const props = fiber.memoizedProps;
      if (props && typeof props === 'object'
        && props.userSeasonExperience !== null && props.userSeasonExperience !== undefined
        && Number.isFinite(Number(props.userSeasonExperience))) {
        return props;
      }
      fiber = fiber.return;
    }
    return null;
  }

  function seasonDateRange(text, now = Date.now()) {
    const match = String(text || '').match(/([A-Z][a-z]{2})\s+(\d{1,2})\s*[-–]\s*([A-Z][a-z]{2})\s+(\d{1,2})/);
    if (!match) return { endsAt: null, endsText: '' };
    const year = new Date(now).getFullYear();
    const start = Date.parse(`${match[1]} ${match[2]}, ${year} 00:00:00`);
    let endsAt = Date.parse(`${match[3]} ${match[4]}, ${year} 23:59:59`);
    if (!Number.isFinite(start) || !Number.isFinite(endsAt)) return { endsAt: null, endsText: '' };
    if (endsAt < start) endsAt = Date.parse(`${match[3]} ${match[4]}, ${year + 1} 23:59:59`);
    return {
      endsAt: Number.isFinite(endsAt) ? endsAt : null,
      endsText: `${match[3]} ${match[4]}`,
    };
  }

  function parseSeasonPage(root = document) {
    const scope = root && typeof root.querySelector === 'function' ? root : document;
    const card = scope.querySelector('.seasonReward.is-selected, .seasonReward--free.is-selected');
    if (!card) return null;

    const tier = Number(seasonClean((card.querySelector('.seasonReward-tier') || {}).textContent));
    if (!Number.isFinite(tier) || tier <= 0) return null;

    const fill = card.querySelector('.prog-barFill') || card.querySelector('.prog-points');
    const rawProgress = fill ? (fill.style.width || fill.style.left || '') : '';
    const progress = Number.parseFloat(rawProgress);
    const props = seasonFiberProps(card.querySelector('.prog-points') || card) || {};

    const rawXp = props.userSeasonExperience;
    const xp = rawXp !== null && rawXp !== undefined && Number.isFinite(Number(rawXp))
      ? Math.max(0, Math.round(Number(rawXp)))
      : null;
    const rawNext = props.experience;
    const nextXp = rawNext !== null && rawNext !== undefined && Number.isFinite(Number(rawNext))
      ? Math.max(0, Math.round(Number(rawNext)))
      : null;
    const season = props.season && typeof props.season === 'object' ? props.season : {};
    const seasonID = season.seasonID !== null && season.seasonID !== undefined && Number.isFinite(Number(season.seasonID))
      ? Number(season.seasonID)
      : null;

    const nameNode = scope.querySelector('.season-header h1, .season-head h1, h1');
    const seasonName = seasonClean(nameNode && nameNode.textContent)
      || seasonClean((scope.querySelector('.seasonTeaser') || {}).textContent)
      || 'Season';
    const teaser = scope.querySelector('.seasonTeaser');
    const dates = seasonDateRange(teaser && teaser.textContent);

    const boot = seasonBoot();
    const levels = boot.levels || SEASON_LEVELS_DEFAULT;
    const totalRewards = Math.max(1, Math.floor(Number(boot.active && boot.active.totalRewards) || 35));
    const computed = xp !== null ? seasonTierForXp(xp, levels, totalRewards) : null;
    return {
      v: 2,
      at: Date.now(),
      auto: false,
      source: 'page',
      seasonID,
      seasonName,
      // El premio seleccionado es el SIGUIENTE, no el tier actual: con 76.701
      // XP la pagina marca T7 a 90.000 y el nivel actual es T6 (70.000).
      tier: computed ? computed.tier : Math.max(1, tier - 1),
      nextTier: computed ? computed.nextTier : tier,
      progress: computed
        ? Math.round(computed.progress)
        : (Number.isFinite(progress)
          ? Math.max(0, Math.min(100, progress))
          : Math.max(0, Math.min(100, Number(props.progress) || 0))),
      xp,
      currentXp: computed ? computed.currentXp : null,
      nextXp: computed ? computed.nextXp : nextXp,
      levels,
      totalRewards,
      endsAt: dates.endsAt,
      endsText: dates.endsText,
    };
  }

  const SEASON_LEVELS_DEFAULT = {
    startingLevels: 3,
    experiencePerStartingLevel: 10000,
    experiencePerAchievementLevel: 20000,
    experiencePerExtraLevels: 40000,
    extraLevelReward: 100000,
  };
  let seasonUserAt = 0;

  // La config de niveles y la temporada activa ya vienen en el bootstrap de
  // cualquier pagina de Nitro Type. El marco de la carrera tambien lo tiene,
  // asi que no hace falta abrir /season para conocer los umbrales.
  function seasonBoot() {
    try {
      if (typeof window.NTBOOTSTRAP !== 'function') return {};
      const data = window.NTBOOTSTRAP();
      if (!data || typeof data !== 'object') return {};
      const list = Array.isArray(data.ACTIVE_SEASONS) ? data.ACTIVE_SEASONS : [];
      const now = Date.now() / 1000;
      const active = list.find((item) => item
        && Number(item.startStamp) <= now && Number(item.endStamp) > now) || list[0] || null;
      return {
        active,
        levels: data.SEASON_LEVELS && typeof data.SEASON_LEVELS === 'object' ? data.SEASON_LEVELS : null,
      };
    } catch {
      return {};
    }
  }

  // XP del umbral de un nivel. Con la config real: 1=0, 2=10k, 3=20k, 4=30k,
  // 5=50k, 6=70k, 7=90k... que es exactamente lo que pinta la pagina.
  function seasonLevelXp(level, levels = SEASON_LEVELS_DEFAULT) {
    const start = Math.max(1, Math.floor(Number(levels.startingLevels) || 3));
    const startCost = Math.max(0, Number(levels.experiencePerStartingLevel) || 10000);
    const achCost = Math.max(0, Number(levels.experiencePerAchievementLevel) || 20000);
    const n = Math.max(1, Math.floor(Number(level) || 1));
    if (n <= start) return (n - 1) * startCost;
    return start * startCost + (n - start - 1) * achCost;
  }

  function seasonTierForXp(xp, levels = SEASON_LEVELS_DEFAULT, totalRewards = 35) {
    const value = Math.max(0, Math.floor(Number(xp) || 0));
    const max = Math.max(1, Math.floor(Number(totalRewards) || 35));
    let tier = 1;
    while (tier < max && value >= seasonLevelXp(tier + 1, levels)) tier += 1;

    const currentXp = seasonLevelXp(tier, levels);
    const nextXp = tier < max ? seasonLevelXp(tier + 1, levels) : null;
    const span = nextXp === null ? 0 : nextXp - currentXp;
    const progress = span > 0
      ? Math.max(0, Math.min(100, ((value - currentXp) / span) * 100))
      : 100;
    return { tier, nextTier: nextXp === null ? null : tier + 1, currentXp, nextXp, progress };
  }

  function seasonEndText(stamp) {
    const value = Number(stamp);
    if (!Number.isFinite(value) || value <= 0) return '';
    try {
      return new Date(value * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  // El XP de temporada que el juego persiste en `persist:nt`. No es
  // playerExperience (de por vida): es el `experience` que el servidor usa
  // para el premio activo. Puede venir como objeto o como JSON anidado en
  // `user`.
  // `persist:nt` es el estado entero del sitio (decenas o cientos de KB). Un
  // JSON.parse cada 5 s se nota en el hilo principal y el panel solo necesita
  // saber si el XP cambio. Se cachea por el texto crudo, igual que la foto de
  // temporada: si el juego escribe otra vez, el texto cambia y se relee.
  let userCacheRaw = null;
  let userCacheXp = null;

  function parseNtUserXp(raw) {
    let root;
    try { root = JSON.parse(raw); } catch { return null; }

    const seen = new Set();
    const queue = [root];
    while (queue.length) {
      const value = queue.shift();
      if (!value) continue;
      if (typeof value === 'string') {
        if (!/^[\[{]/.test(value.trim())) continue;
        try { queue.push(JSON.parse(value)); } catch { /* no era JSON */ }
        continue;
      }
      if (typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);

      if (Number.isFinite(Number(value.experience))
        && value.experience !== null && value.experience !== '') {
        return Math.max(0, Math.round(Number(value.experience)));
      }
      for (const child of Object.values(value)) {
        if (child && typeof child === 'object') queue.push(child);
        else if (typeof child === 'string' && /^[\[{]/.test(child.trim())) queue.push(child);
      }
    }
    return null;
  }

  function seasonUserXp() {
    const raw = disk.get(KEYS.ntUser, '');
    if (raw === userCacheRaw) return userCacheXp;
    userCacheRaw = raw;
    perfCounters.userParses += raw ? 1 : 0;
    userCacheXp = raw ? parseNtUserXp(raw) : null;
    return userCacheXp;
  }

  // La tarjeta se repinta cada 500 ms y esto hacia JSON.parse en cada tick. Se
  // cachea por el texto crudo de localStorage: si la foto cambia (otra pestana,
  // seasonRefreshFromUser) el texto cambia y se vuelve a leer sola.
  let seasonCacheRaw = null;
  let seasonCacheSnap = null;

  function seasonRead() {
    try {
      const raw = disk.get(KEYS.season, '');
      if (raw === seasonCacheRaw) return seasonCacheSnap;
      seasonCacheRaw = raw;
      if (!raw) {
        seasonCacheSnap = null;
        return null;
      }
      const snap = JSON.parse(raw);
      if (!snap || typeof snap !== 'object' || !Number.isFinite(Number(snap.tier))) {
        seasonCacheSnap = null;
        return null;
      }

      // Las fotos de 7.51.0 guardaban el tier del premio seleccionado (el
      // siguiente). Se normalizan al nivel actual sin pedir otra visita, y la
      // migracion se guarda para no repetir el calculo en cada tick.
      let migrated = false;
      if (!Number.isFinite(Number(snap.nextTier)) && Number.isFinite(Number(snap.xp))) {
        const levels = snap.levels && typeof snap.levels === 'object'
          ? snap.levels : SEASON_LEVELS_DEFAULT;
        const total = Math.max(1, Math.floor(Number(snap.totalRewards) || 35));
        const computed = seasonTierForXp(snap.xp, levels, total);
        snap.tier = computed.tier;
        snap.nextTier = computed.nextTier;
        snap.progress = Math.round(computed.progress);
        snap.currentXp = computed.currentXp;
        if (computed.nextXp !== null) snap.nextXp = computed.nextXp;
        migrated = true;
      }
      if (migrated) {
        const text = JSON.stringify(snap);
        disk.set(KEYS.season, text);
        seasonCacheRaw = text;
      }
      seasonCacheSnap = snap;
      return snap;
    } catch {
      seasonCacheRaw = null;
      seasonCacheSnap = null;
      return null;
    }
  }

  // Actualiza la tarjeta con el XP que el juego ya guarda tras cada carrera,
  // sin iframe, sin pestaña y sin esperar a que alguien abra Season.
  function seasonRefreshFromUser(force = false) {
    const now = Date.now();
    if (!force && now - seasonUserAt < 5000) return seasonRead();
    seasonUserAt = now;

    const xp = seasonUserXp();
    if (xp === null) return seasonRead();

    const boot = seasonBoot();
    const active = boot.active;
    let snap = seasonRead();

    // Una temporada nueva resetea el XP: la foto vieja no puede mandar.
    if (snap && active && snap.seasonID && Number(snap.seasonID) !== Number(active.seasonID)) snap = null;
    // Si el almacenamiento va por detras de la foto, no se retrocede el XP.
    if (!force && snap && Number.isFinite(Number(snap.xp)) && xp < Number(snap.xp)) return snap;

    const levels = boot.levels || (snap && snap.levels) || SEASON_LEVELS_DEFAULT;
    const totalRewards = Math.max(1, Math.floor(
      Number(active && active.totalRewards) || Number(snap && snap.totalRewards) || 35,
    ));
    const computed = seasonTierForXp(xp, levels, totalRewards);
    const seasonID = Number(active && active.seasonID) || Number(snap && snap.seasonID) || null;
    const seasonName = (active && active.name) || (snap && snap.seasonName) || 'Season';
    const endsAt = Number(active && active.endStamp)
      ? Number(active.endStamp) * 1000
      : (snap && snap.endsAt) || null;
    const endsText = (active && seasonEndText(active.endStamp)) || (snap && snap.endsText) || '';

    const next = {
      v: 2,
      at: now,
      auto: true,
      source: 'user',
      seasonID,
      seasonName,
      tier: computed.tier,
      nextTier: computed.nextTier,
      progress: Math.round(computed.progress),
      xp,
      currentXp: computed.currentXp,
      nextXp: computed.nextXp,
      levels,
      totalRewards,
      endsAt,
      endsText,
    };

    if (snap && snap.auto && snap.tier === next.tier && snap.nextTier === next.nextTier
      && snap.xp === next.xp && snap.seasonName === next.seasonName
      && snap.endsAt === next.endsAt) {
      return snap;
    }

    if (!disk.set(KEYS.season, JSON.stringify(next))) return snap || next;
    if (panel && panel.refs) panel.seasonSig = '';
    return next;
  }

  function seasonXpText(value) {
    return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))).toLocaleString() : '—';
  }

  // "1.2k" / "950": el ritmo y la proyeccion caben en una fila del panel.
  function seasonXpShort(value) {
    const n = Math.max(0, Math.round(Number(value) || 0));
    if (n < 1000) return String(n);
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }

  // XP por dia activo de la ultima semana. El dia en curso no cuenta: a media
  // tarde su XP esta a medias y hundiria la media. Solo si no hay ningun dia
  // cerrado se usa el de hoy. Sin XP devuelve null y la fila no inventa nada.
  function seasonDailyXp(days = 7) {
    const cutoff = Date.now() - Math.max(1, days) * 86400000;
    const todayDate = todayKey();
    const byDate = new Map();
    for (const day of dayHistoryRead()) {
      const at = Date.parse(`${day.date}T12:00:00`);
      if (!Number.isFinite(at) || at < cutoff || !(Number(day.xp) > 0)) continue;
      if (day.date === todayDate) continue;
      byDate.set(day.date, Number(day.xp));
    }
    if (!byDate.size) {
      const today = todayRead();
      // El dia en curso solo vale como dia completo si lleva al menos 4 h: con
      // 10 minutos de carrera sobreestimaria el ritmo y diria que el premio
      // esta mas cerca de lo que esta.
      const first = Number(today.firstAt) || 0;
      const age = first > 0 ? Date.now() - first : 0;
      if (Number(today.xp) > 0 && age >= 4 * 3600000) byDate.set(today.date, Number(today.xp));
    }
    if (!byDate.size) return null;
    const total = [...byDate.values()].reduce((sum, value) => sum + value, 0);
    return { days: byDate.size, xp: total, perDay: Math.round(total / byDate.size) };
  }

  // Proyeccion al cierre de temporada con el ritmo real. `needed` es el XP
  // diario minimo para llegar al siguiente premio antes de que acabe.
  function seasonPace(snap, now = Date.now()) {
    if (!snap || !Number.isFinite(Number(snap.xp)) || !Number.isFinite(Number(snap.nextXp))) return null;
    const left = Math.max(0, Number(snap.nextXp) - Number(snap.xp));
    if (left <= 0) {
      return { status: 'done', left: 0, daysLeft: null, perDay: null, projected: null, needed: 0, short: 0 };
    }
    if (!Number.isFinite(Number(snap.endsAt)) || Number(snap.endsAt) <= 0) {
      return { status: 'unknown', left, daysLeft: null, perDay: null, projected: null, needed: 0, short: 0 };
    }

    const daysLeft = Math.max(0, Math.ceil((Number(snap.endsAt) - now) / 86400000));
    if (daysLeft <= 0) {
      return { status: 'over', left, daysLeft: 0, perDay: null, projected: 0, needed: 0, short: left };
    }

    const daily = seasonDailyXp();
    if (!daily) {
      return {
        status: 'unknown', left, daysLeft, perDay: null, projected: null,
        needed: Math.ceil(left / daysLeft), short: 0,
      };
    }

    const projected = Math.round(daily.perDay * daysLeft);
    return {
      status: projected >= left ? 'ontrack' : 'short',
      left,
      daysLeft,
      perDay: daily.perDay,
      projected,
      needed: Math.ceil(left / daysLeft),
      short: Math.max(0, left - projected),
    };
  }

  // XP medio por carrera de las ultimas diez: la unica base honesta para decir
  // cuantas carreras faltan. Sin historial cae al resumen de hoy.
  function seasonXpPerRace() {
    let list = [];
    try { list = JSON.parse(disk.get(KEYS.history, '[]')); } catch { list = []; }
    const xp = (Array.isArray(list) ? list : [])
      .map((race) => Number(race && race.xp))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (xp.length) return Math.max(1, Math.round(xp.reduce((sum, value) => sum + value, 0) / xp.length));
    const today = todayRead();
    if (today.races > 0 && today.xp > 0) return Math.max(1, Math.round(today.xp / today.races));
    return null;
  }

  // Las mismas frases para la tarjeta y para el garaje: un solo sitio decide
  // cuando hay prisa (tres dias o menos, menos de 5k XP o ritmo corto).
  function seasonAlertText(snap) {
    if (!snap) return [];
    const alerts = [];
    const xp = Number(snap.xp);
    const nextXp = Number(snap.nextXp);
    const left = Number.isFinite(xp) && Number.isFinite(nextXp) ? Math.max(0, nextXp - xp) : null;
    let daysLeft = null;
    if (Number.isFinite(Number(snap.endsAt)) && Number(snap.endsAt) > 0) {
      daysLeft = Math.ceil((Number(snap.endsAt) - Date.now()) / 86400000);
    }
    if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 3) {
      alerts.push(daysLeft === 0 ? 'Season ends today' : `Season ends in ${daysLeft}d`);
    }
    if (left !== null && left > 0 && left < 5000) {
      alerts.push(`${left.toLocaleString()} XP to next reward`);
    }
    const pace = seasonPace(snap);
    if (pace && pace.status === 'short' && pace.daysLeft >= 1 && pace.needed > 0) {
      alerts.push(`≈ ${seasonXpShort(pace.needed)} XP/day to reach T${Number(snap.nextTier) || 'next'}`);
    }
    return alerts;
  }

  let seasonPaintAt = 0;

  function paintSeason(force = false) {
    if (!panel.refs || !panel.refs.seasonName) return;
    const snap = seasonRead();
    // La firma barata evita calcular el ritmo y leer el historial en cada tick
    // del panel. Con datos iguales basta con refrescar cada 15 s (el ritmo
    // diario no cambia de un tick a otro); si llega XP nuevo, `snap.at` cambia
    // y la tarjeta se repinta en el acto.
    const baseSig = snap
      ? `${snap.at}|${snap.tier}|${snap.nextTier}|${snap.progress}|${snap.xp}|${snap.nextXp}|${snap.endsAt}`
      : 'empty';
    const now = Date.now();
    if (!force && panel.seasonBaseSig === baseSig && now - seasonPaintAt < 15000) return;
    panel.seasonBaseSig = baseSig;
    seasonPaintAt = now;

    const pace = seasonPace(snap);
    const perRace = seasonXpPerRace();
    const leftToNext = snap && Number.isFinite(Number(snap.xp)) && Number.isFinite(Number(snap.nextXp))
      ? Math.max(0, Number(snap.nextXp) - Number(snap.xp))
      : null;
    const racesLeft = leftToNext !== null && perRace ? Math.ceil(leftToNext / perRace) : null;
    const sig = snap
      ? `${snap.at}|${snap.tier}|${snap.nextTier}|${snap.progress}|${snap.xp}|${snap.nextXp}|${snap.endsAt}|${pace ? `${pace.status}:${pace.perDay}` : '-'}|${racesLeft}`
      : 'empty';
    if (panel.seasonSig === sig) return;
    panel.seasonSig = sig;

    if (panel.refs.seasonAlert) {
      panel.refs.seasonAlert.style.display = 'none';
      panel.refs.seasonAlert.textContent = '';
    }

    const empty = !snap;
    if (panel.refs.seasonCard) panel.refs.seasonCard.classList.toggle('is-empty', empty);
    if (empty) {
      setText(panel.refs.seasonTag, 'no snapshot');
      setText(panel.refs.seasonName, 'Season');
      setText(panel.refs.seasonTier, '—');
      setText(panel.refs.seasonXp, '—');
      setText(panel.refs.seasonNext, '—');
      setText(panel.refs.seasonRaces, '—');
      setText(panel.refs.seasonPace, '—');
      setText(panel.refs.seasonEnds, '—');
      setText(panel.refs.seasonNote, 'Waiting for your account XP...');
      if (panel.refs.seasonFill) panel.refs.seasonFill.style.width = '0%';
      return;
    }

    const progress = Math.max(0, Math.min(100, Number(snap.progress) || 0));
    const xp = snap.xp !== null && snap.xp !== undefined && Number.isFinite(Number(snap.xp)) ? Number(snap.xp) : null;
    const nextXp = snap.nextXp !== null && snap.nextXp !== undefined && Number.isFinite(Number(snap.nextXp)) ? Number(snap.nextXp) : null;
    const tier = Number(snap.tier);

    setText(panel.refs.seasonTag, `T${tier} · ${Math.round(progress)}%`);
    setText(panel.refs.seasonName, snap.seasonName || 'Season');
    setText(panel.refs.seasonTier, `T${tier}`);
    setText(panel.refs.seasonXp, xp !== null && nextXp !== null
      ? `${seasonXpText(xp)} / ${seasonXpText(nextXp)} XP`
      : (xp !== null ? `${seasonXpText(xp)} XP` : '—'));

    const left = xp !== null && nextXp !== null ? Math.max(0, nextXp - xp) : null;
    setText(panel.refs.seasonNext, left !== null
      ? `${seasonXpText(left)} XP to go`
      : (nextXp !== null ? `at ${seasonXpText(nextXp)} XP` : '—'));

    // Cuantas carreras caen a ese ritmo de XP, con la media de las ultimas
    // diez. Sin historial no se inventa: deja un guion.
    setText(panel.refs.seasonRaces, racesLeft !== null ? `≈ ${racesLeft} races` : '—');
    if (panel.refs.seasonRaces) {
      panel.refs.seasonRaces.title = racesLeft !== null
        ? `${seasonXpText(left)} XP left at about ${seasonXpText(perRace)} XP per race in the last races.`
        : 'Run a race to estimate how many races the next reward needs.';
    }

    // El ritmo real de la semana, proyectado a los dias que quedan: dice si el
    // siguiente premio esta al alcance y cuanto falta por dia si no lo esta.
    let paceText = '—';
    let paceTitle = 'No daily XP yet: run a few races to project the season.';
    if (pace && pace.status === 'done') {
      paceText = 'max tier';
      paceTitle = 'Every reward of this season is already unlocked.';
    } else if (pace && pace.status === 'over') {
      paceText = 'season over';
      paceTitle = 'The season already ended; this card keeps the last snapshot.';
    } else if (pace && pace.status === 'ontrack') {
      paceText = `${seasonXpShort(pace.perDay)}/day · on pace`;
      paceTitle = `${seasonXpShort(pace.perDay)} XP/day over ${pace.daysLeft}d projects ${seasonXpShort(pace.projected)} XP: the next reward is in reach.`;
    } else if (pace && pace.status === 'short') {
      paceText = `${seasonXpShort(pace.perDay)}/day · ${seasonXpShort(pace.short)} short`;
      paceTitle = `${seasonXpShort(pace.left)} XP left in ${pace.daysLeft}d: ${seasonXpShort(pace.perDay)}/day projects ${seasonXpShort(pace.projected)}, ${seasonXpShort(pace.short)} short of the next reward.`;
    }
    setText(panel.refs.seasonPace, paceText);
    if (panel.refs.seasonPace) panel.refs.seasonPace.title = paceTitle;

    let ends = snap.endsText ? `ends ${snap.endsText}` : '—';
    let daysLeft = null;
    if (snap.endsAt !== null && snap.endsAt !== undefined && Number.isFinite(Number(snap.endsAt))) {
      daysLeft = Math.ceil((Number(snap.endsAt) - Date.now()) / 86400000);
      if (daysLeft <= 0) ends = 'ended';
      else if (daysLeft <= 30) ends += ` · ${daysLeft}d`;
    }
    setText(panel.refs.seasonEnds, ends);
    setText(panel.refs.seasonNote, snap.auto
      ? 'auto · account XP'
      : `snapshot ${elapsedText(snap.at, true)} · open Season to refresh`);
    if (panel.refs.seasonFill) panel.refs.seasonFill.style.width = `${progress}%`;

    // Solo avisa cuando de verdad hay prisa: tres dias o menos de temporada,
    // menos de 5.000 XP para el siguiente premio o un ritmo que no alcanza.
    const alerts = seasonAlertText(snap);
    if (panel.refs.seasonAlert) {
      panel.refs.seasonAlert.textContent = alerts.join(' · ');
      panel.refs.seasonAlert.style.display = alerts.length ? '' : 'none';
    }
  }

  function captureSeasonPage() {
    let saved = false;
    const take = () => {
      const snap = parseSeasonPage(document);
      if (!snap) return false;
      try {
        disk.set(KEYS.season, JSON.stringify(snap));
      } catch {
        return false;
      }
      if (!saved) {
        saved = true;
        log(`Season captured: ${snap.seasonName}, T${snap.tier}${snap.nextTier ? ` (next T${snap.nextTier})` : ''}, ${snap.xp === null ? 'XP unknown' : `${snap.xp.toLocaleString()} XP`}.`);
      }
      return true;
    };

    if (take()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (take() || tries >= 20) clearInterval(timer);
    }, 500);
    setTimeout(() => clearInterval(timer), 12000);
  }

  // Lo unico visible con el panel plegado. El resto del panel se queda tal
  // cual y se repinta entero al desplegarlo, no en cada latido.
  function paintPanelActions() {
    const pauseLeft = session.paused && session.pauseEndsAt
      ? Math.max(0, Math.ceil((session.pauseEndsAt - Date.now()) / 1000))
      : 0;
    setText(panel.refs.toggle, session.paused
      ? (pauseLeft ? `Resume · ${pauseLeft}` : 'Resume')
      : 'Pause');
    if (panel.refs.toggle && panel.refs.toggle.disabled !== session.stopped) {
      panel.refs.toggle.disabled = session.stopped;
    }
    if (panel.refs.stop) {
      const pending = session.stopAfterRace ? 'true' : 'false';
      if (panel.refs.stop.dataset.pending !== pending) panel.refs.stop.dataset.pending = pending;
      setText(panel.refs.stop, session.stopped ? 'Resume' : 'Stop');
      const title = session.stopped
        ? 'Resume now · Alt+A (daily budget and active hours still apply)'
        : 'Stop after the current race · Alt+S';
      if (panel.refs.stop.title !== title) panel.refs.stop.title = title;
      if (panel.refs.stop.disabled !== false) panel.refs.stop.disabled = false;
    }
  }

  // En espera no hay una carrera que seguir: 2 s bastan para el reloj y el
  // estado. Durante el tecleo se vuelve a 1 s para que el panel no pierda
  // ningun cambio visible de la carrera.
  function panelPaintEveryMs() {
    return session.typing ? 1000 : 2000;
  }

  // Un reto completado es un aviso, no un detalle de fondo: no espera al
  // siguiente latido de 2 s. Se agrupa en un solo repintado para que dos retos
  // que caen juntos no encolen dos actualizaciones.
  let panelRefreshTimer = 0;
  function schedulePanelRefresh() {
    if (panelRefreshTimer) return;
    panelRefreshTimer = setTimeout(() => {
      panelRefreshTimer = 0;
      updatePanel();
    }, 0);
  }

  function updatePanel(force = false) {
    publishState();
    // Un panel que ya no esta en el documento (React lo quito al navegar) no
    // se sigue pintando: se reconstruye en el latido y hasta entonces cada
    // escritura era basura para el GC.
    if (!panel.root || !panel.root.isConnected) return;
    // Con la pestaña en segundo plano nadie ve el panel. El estado para la cola
    // ya se publico arriba, asi que se puede saltar todo el DOM hasta volver.
    if (document.hidden && !force) return;
    perfCounters.panelPaints += 1;

    if (panel.refs.update) {
      paintUpdateBadge(panel.refs.update);
      paintUpdateHealth();
      if (panel.refs.update.dataset.bound !== '1') {
        panel.refs.update.dataset.bound = '1';
        panel.refs.update.addEventListener('pointerdown', (event) => event.stopPropagation());
        panel.refs.update.addEventListener('click', (event) => {
          event.stopPropagation();
          openUpdateDownload();
        });
        checkForUpdate();
        // Tick corto: checkForUpdate no repite una comprobacion buena hasta
        // la hora, pero si la anterior fallo vuelve a probar a los 30 min.
        setInterval(checkForUpdate, UPDATE_RETRY_MS);
      }
    }

    const breaking = session.breakUntil > Date.now();
    const state = breaking ? 'break' : session.paused ? 'paused' : (session.typing ? 'running' : 'waiting');
    if (panel.root.dataset.state !== state) panel.root.dataset.state = state;
    if (panel.root.dataset.mode !== MODE) panel.root.dataset.mode = MODE;
    // Parado es un estado visual mas: el chip y el LED lo dicen sin inventarse
    // un tercer modo.
    const stoppedFlag = session.stopped ? '1' : '0';
    if (panel.root.dataset.stopped !== stoppedFlag) panel.root.dataset.stopped = stoppedFlag;

    // Sin teclas todavia no hay medida: se muestra un guion y color neutro.
    const measured = session.chars > 0;
    const wpm = measured ? wpmNow() : 0;
    const acc = measured ? accuracyNow() : 0;

    if (panel.root.dataset.pace !== session.pace) panel.root.dataset.pace = session.pace;

    // Plegado solo queda la cabecera y los tres botones: no hay ninguna fila
    // visible que actualizar. Se pinta lo minimo y se libera el hilo.
    if (panel.root.dataset.collapsed === 'true' && !force) {
      paintPanelActions();
      return;
    }

    // El chip dice el MODO, nunca un OFF que se parezca a NORMAL: AUTO siempre.
    // Que este esperando lo dicen el LED, la barra de estado y el motivo, sin
    // inventarse un tercer modo.
    setText(panel.refs.mode, 'AUTO');
    paintPace();
    seasonRefreshFromUser();
    paintSeason();
    setText(panel.refs.target, `${profile.targetWPM} · ${profile.accuracyGoal.toFixed(1)}%`);
    // Los dos numeros grandes golpean la escala cuando cambian de verdad (parte
    // entera), que es lo que se mira durante la carrera.
    flashValue(panel.refs.live, measured ? wpm.toFixed(1) : '—');
    flashValue(panel.refs.acc, measured ? `${acc.toFixed(1)}%` : '—');
    setText(panel.refs.session, `${profile.wpmSession}/${profile.wpm.length}`);
    setText(panel.refs.races, session.raceLimit
      ? `${session.races} / ${session.raceLimit}`
      : String(session.races));
    // XP del dia, el mismo que suma la tarjeta de 7 dias: aqui se ve sin
    // cambiar de vista, mientras la sesion corre. Sin XP no se inventa un 0.
    if (panel.refs.dayXp) {
      const dayXp = todayRead().xp;
      setText(panel.refs.dayXp, dayXp > 0 ? `${dayXp.toLocaleString()} XP` : '—');
    }
    // Presupuesto del dia: consumo contra el tope, con aviso al 80%. Es lo
    // unico que no se reinicia al abrir una tanda nueva.
    if (panel.refs.dailyRaces) {
      const daily = dailyCaps();
      const racePct = daily.raceCap > 0 ? daily.races / daily.raceCap : 0;
      const xpPct = daily.xpCap > 0 ? daily.xp / daily.xpCap : 0;

      setText(panel.refs.dailyRaces, daily.raceCap ? `${daily.races} / ${daily.raceCap}` : 'free');
      setText(panel.refs.dailyXp, daily.xpCap
        ? `${limitXpText(daily.xp)} / ${limitXpText(daily.xpCap)}`
        : 'free');
      setGood(panel.refs.dailyRaces, daily.raceCap ? racePct < 0.8 : null);
      setGood(panel.refs.dailyXp, daily.xpCap ? xpPct < 0.8 : null);

      const left = [];
      if (daily.raceCap) left.push(`${Math.max(0, daily.raceCap - daily.races)} races`);
      if (daily.xpCap) {
        const xpLeft = Math.max(0, daily.xpCap - daily.xp);
        left.push(`${xpLeft > 0 ? limitXpText(xpLeft) : '0'} XP`);
      }
      setText(panel.refs.dailyLeft, left.length ? left.join(' · ') : 'no caps');

      panel.refs.dailyRaceRow.title = daily.raceCap
        ? `Daily races: ${daily.races} of ${daily.raceCap} (${Math.min(100, Math.round(racePct * 100))}%). Click to change (free, 100, 200, 300); resets at midnight.`
        : 'Daily races: free. Click to set 100, 200 or 300; resets at midnight.';
      panel.refs.dailyXpRow.title = daily.xpCap
        ? `Daily XP: ${daily.xp.toLocaleString()} of ${daily.xpCap.toLocaleString()} (${Math.min(100, Math.round(xpPct * 100))}%). Click to change (free, 50k, 100k, 200k); resets at midnight.`
        : 'Daily XP: free. Click to set 50k, 100k or 200k; resets at midnight.';
      paintDailyRaceSlider();
      paintDailyXpSlider();
    }
    // Ventana de horas: el rango, el estado de ahora y cuanto queda para que
    // abra o cierre. Se calcula en cada tick para que el reloj no se congele.
    if (panel.refs.activeState) {
      const win = activeWindow();
      const range = `${win.startText}–${win.endText}`;
      setText(panel.refs.activeState, win.on ? range : 'off');
      setText(panel.refs.activeStart, win.startText);
      setText(panel.refs.activeEnd, win.endText);
      paintActiveSlider('start');
      paintActiveSlider('end');

      if (!win.on) {
        setText(panel.refs.activeNow, 'always');
        setGood(panel.refs.activeNow, null);
        panel.refs.activeNow.title = 'Active hours are off: races can start at any time.';
      } else if (win.allDay) {
        setText(panel.refs.activeNow, 'open · all day');
        setGood(panel.refs.activeNow, true);
        panel.refs.activeNow.title = `Active hours ${range}: all day. Races can start at any time.`;
      } else if (win.open) {
        setText(panel.refs.activeNow, `open · closes in ${activeLeftText(win.msUntilClose)}`);
        setGood(panel.refs.activeNow, true);
        panel.refs.activeNow.title = `Active hours ${range}. Open now; closes at ${win.endText} in ${activeLeftText(win.msUntilClose)}. Races only start inside the window.`;
      } else {
        setText(panel.refs.activeNow, `closed · opens in ${activeLeftText(win.msUntilOpen)}`);
        setGood(panel.refs.activeNow, false);
        panel.refs.activeNow.title = `Active hours ${range}. Closed now; opens at ${win.startText} in ${activeLeftText(win.msUntilOpen)}. The bot finishes the race in progress and waits.`;
      }

      panel.refs.activeRow.title = win.on
        ? `Active hours ${range} (local time). Click to turn them off; Shift+click resets 08:00–23:00.`
        : 'Active hours are off. Click to turn them on; Shift+click resets 08:00–23:00. The window can cross midnight.';
      panel.refs.activeStartRow.title = `Start: ${win.startText}. Click +1 hour; Shift+click −1 hour. Same start and end means all day.`;
      panel.refs.activeEndRow.title = `End: ${win.endText}. Click +1 hour; Shift+click −1 hour. An end before the start crosses midnight; the same hour as the start means all day.`;
    }
    // Ritmo de XP de la tanda: lo que llevaria en una hora a este paso. Se
    // mide desde la primera carrera, no desde que se abrio el panel, y no
    // inventa cifra con menos de un minuto o sin XP acumulado.
    if (panel.refs.rate) {
      const elapsed = session.tandaStartedAt ? Date.now() - session.tandaStartedAt : 0;
      const xp = Number(session.xp) || 0;
      const rate = elapsed >= 60000 && xp > 0 ? xp / (elapsed / 3600000) : null;
      setText(panel.refs.rate, rate === null ? '—'
        : rate >= 1000 ? `${(rate / 1000).toFixed(1)}k XP/h` : `${Math.round(rate)} XP/h`);
      panel.refs.rate.title = rate === null
        ? 'Session rate: needs at least a minute of measured races and some XP.'
        : `Session rate: ${Math.round(rate).toLocaleString()} XP/h at the current pace`
          + ` (${xp.toLocaleString()} XP in ${Math.max(1, Math.round(elapsed / 60000))}m).`;
    }
    paintNitroPreview();
    // Nitro de la tanda: cuantas carreras lo gastaron, cuantos caracteres
    // regalo el juego y lo que habrian tardado al ritmo objetivo. La ultima
    // carrera va en el tooltip para no perder el detalle por carrera.
    if (panel.refs.nitro) {
      const uses = Math.max(0, Number(session.nitroRaces) || 0);
      const chars = Math.max(0, Number(session.nitroCharsTotal) || 0);
      const races = Math.max(0, Number(session.races) || 0);
      const last = raceHistory[raceHistory.length - 1];

      if (chars > 0) {
        const secs = chars / 5 / (profile.targetWPM / 60);
        setText(panel.refs.nitro, `${uses}/${races || uses} · ${chars} ch · ${secs.toFixed(1)}s`);
        let title = `Nitro this session: ${uses} of ${races || uses} race${(races || uses) === 1 ? '' : 's'}`
          + ` · ${chars} characters the game typed for you · about ${secs.toFixed(1)} s at the ${profile.targetWPM} WPM target.`
          + ' It is not free speed: the planner pays it back over the remaining keys.';
        if (last && Number(last.nitroChars) > 0) {
          title += ` Last race: ${Number(last.nitroWords) || 1} word, ${Number(last.nitroChars)} characters.`;
        }
        panel.refs.nitro.title = title;
      } else {
        setText(panel.refs.nitro, '—');
        panel.refs.nitro.title = 'Nitro this session: none used yet, or the races ended before the nitro could be spent.';
      }
    }
    // Comprobacion de WPM: media de las carreras con nitro contra las que no
    // lo usaron. Es una observacion de las ultimas 10 medidas; si sale
    // positiva, el panel lo marca en ambar en vez de esconderlo.
    if (panel.refs.nitroDelta) {
      const stats = nitroWpmStats(raceHistory);
      if (stats) {
        const sign = stats.delta > 0 ? '+' : '';
        setText(panel.refs.nitroDelta, `${sign}${stats.delta.toFixed(1)} wpm`);
        setGood(panel.refs.nitroDelta, stats.delta <= 0);
        panel.refs.nitroDelta.title = `Nitro WPM check over the last ${stats.used + stats.plain} measured races:`
          + ` ${stats.used} with nitro averaged ${stats.usedWpm.toFixed(1)} WPM;`
          + ` ${stats.plain} without averaged ${stats.plainWpm.toFixed(1)} WPM.`
          + ` Difference ${stats.delta >= 0 ? '+' : ''}${stats.delta.toFixed(1)} WPM; zero or below means no lift.`
          + ' It is an observation, not a guarantee.';
      } else {
        setText(panel.refs.nitroDelta, '—');
        setGood(panel.refs.nitroDelta, null);
        panel.refs.nitroDelta.title = 'Nitro WPM check: needs at least one measured race with nitro and one without in the last 10.';
      }
    }
    // Hueco entre carreras: mediana y mejor de los ultimos 20 huecos normales.
    // Es el tiempo que no se ve en el WPM pero se paga en XP por hora.
    if (panel.refs.cycle) {
      const gaps = Array.isArray(session.gapSamples)
        ? session.gapSamples.filter((ms) => Number.isFinite(ms) && ms > 0)
        : [];

      if (gaps.length) {
        const sorted = gaps.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        const best = sorted[0];
        setText(panel.refs.cycle, `${(median / 1000).toFixed(1)}s med · ${(best / 1000).toFixed(1)}s best`);
        panel.refs.cycle.title = `Dead time between races: median ${(median / 1000).toFixed(1)} s`
          + ` over ${gaps.length} gap${gaps.length === 1 ? '' : 's'}, best ${(best / 1000).toFixed(1)} s.`
          + ` Gaps over ${GAP_MAX_MS / 1000} s (breaks, pauses, guard waits) are left out.`;
      } else {
        setText(panel.refs.cycle, '—');
        panel.refs.cycle.title = `Dead time between races: needs a finished race and the next start.`
          + ` Gaps over ${GAP_MAX_MS / 1000} s (breaks, pauses, guard waits) are left out.`;
      }
    }
    // Desglose del XP de la ultima carrera con las tablas del juego: puesto,
    // velocidad y tramo de precision. Lo que sobra es bonus de sesion u otros.
    if (panel.refs.xpBreak) {
      const split = xpBreakdown(raceHistory[raceHistory.length - 1]);
      if (split) {
        setText(panel.refs.xpBreak, `${split.base}+${split.speed}+${split.accuracy}+${split.session}`);
        const next = xpNextAccuracyTier(split.acc);
        panel.refs.xpBreak.title = `Last race: ${split.place ? '#' + split.place + ' · ' : ''}`
          + `${split.base} base + ${split.speed} speed (2x WPM) + ${split.accuracy} accuracy`
          + ` + ${split.session} session/other = ${split.total.toLocaleString()} XP.`
          + ` Accuracy ${Math.round(split.acc)}% pays ${split.accuracy};`
          + (next
            ? ` ${next.pct}% would pay ${next.xp} (+${next.xp - split.accuracy}).`
            : ' the top tier is already paid.');
      } else {
        setText(panel.refs.xpBreak, '—');
        panel.refs.xpBreak.title = 'Last race XP: waiting for the result packet and its real reward.';
      }
    }
    // Live session average (everything measured, not just the few in the list):
    // green when the deviation from the average target is within +-2%.
    const tandaAvg = tandaAverages();
    if (panel.refs.tanda) {
      setText(panel.refs.tanda, tandaAvg
        ? `${tandaAvg.wpm.toFixed(1)} · ${tandaAvg.acc.toFixed(1)}%`
        : '—');
      setGood(panel.refs.tanda, tandaAvg
        ? Math.abs((tandaAvg.wpm - tandaAvg.target) / tandaAvg.target) * 100 <= 2
        : null);
    }
    // Ultima tanda cerrada: su media y su desvio, aqui mismo. El registro
    // completo (fecha, motivo, DQ) esta en el tooltip y la tabla en la consola.
    if (panel.refs.prevRow) {
      const previous = tandaLog.length ? tandaLog[tandaLog.length - 1] : null;
      const show = Boolean(previous && previous.races >= 1);
      setDisplay(panel.refs.prevRow, show);

      if (show) {
        const dev = Number.isFinite(previous.wpm) && previous.target > 0
          ? ((previous.wpm - previous.target) / previous.target) * 100
          : null;

        setText(panel.refs.prev, `${previous.races} · ${Number.isFinite(previous.wpm) ? previous.wpm.toFixed(1) : '—'}`
          + (dev === null ? '' : ` · ${dev >= 0 ? '+' : ''}${dev.toFixed(1)}%`));
        setGood(panel.refs.prev, dev === null ? null : Math.abs(dev) <= 2);
        // La etiqueta delata cual es: la tanda que acaba de cerrar o la anterior.
        setText(panel.refs.prevLabel, session.closed ? 'last' : 'prev');

        const bits = [
          `${previous.races} race${previous.races === 1 ? '' : 's'}`,
          Number.isFinite(previous.wpm) ? `avg ${previous.wpm.toFixed(1)} WPM` : null,
          Number.isFinite(previous.target) && previous.target > 0 ? `target ${previous.target.toFixed(1)}` : null,
          Number.isFinite(previous.acc) ? `${previous.acc.toFixed(1)}% accuracy` : null,
          previous.dq ? `${previous.dq} DQ` : null,
          `closed ${clockText(previous.at)} (${elapsedText(previous.at)})`,
          previous.reason ? `by ${previous.reason}` : null,
          tandaLog.length > 1 ? `${tandaLog.length} sessions in the log` : null,
          'click for the table',
        ].filter(Boolean);

        panel.refs.prevRow.title = `${session.closed ? 'Session that just closed' : 'Previous closed session'}: ${bits.join(' · ')}.`;
      }
    }

    if (panel.refs.limit) {
      const eta = etaRemaining();
      setText(panel.refs.limit, session.raceLimit
        ? `${session.raceLimit}${eta ? ` · ≈${eta.minutes}m` : ''}`
        : 'free');
      paintLimitSlider();

      // Tope por tiempo: la misma tarjeta, otro reloj. La fila solo se pinta
      // cuando hay un tope puesto, para no llenar la tarjeta de guiones.
      setText(panel.refs.timeLimit, limitMinutesText(session.timeLimit));
      paintTimeSlider();

      const timeLeft = timeLimitLeft();
      if (panel.refs.timeLeftRow) {
        const show = session.timeLimit > 0;
        setDisplay(panel.refs.timeLeftRow, show);
        if (show) {
          setText(panel.refs.timeLeft, timeLeft === null ? '—' : clockSpan(timeLeft));
          panel.refs.timeLeftRow.title = timeLeft === null
            ? `Time limit ${limitMinutesText(session.timeLimit)}: counting from the first race of the session`
            : `Time limit ${limitMinutesText(session.timeLimit)} · ${clockSpan(timeLeft)} left. The bot finishes the race in progress and closes the session`;
        }
      }

      // Tope por XP: lo que el juego ha pagado en la tanda, contra el tope. Si
      // el premio de una carrera no llega (pantalla de resultados perdida), ese
      // XP no se inventa: la fila se queda corta y el tope tarda mas en saltar.
      setText(panel.refs.xpLimit, limitXpText(session.xpLimit));
      paintXpSlider();

      if (panel.refs.xpRow) {
        const show = session.xpLimit > 0;
        setDisplay(panel.refs.xpRow, show);
        if (show) {
          const left = Math.max(0, session.xpLimit - session.xp);
          const xpPlan = xpEta();
          const guess = xpPlan && xpPlan.minutes !== null && left > 0 ? ` · ≈${xpPlan.minutes}m` : '';
          setText(panel.refs.xpTotal, `${session.xp.toLocaleString()} / ${session.xpLimit.toLocaleString()}${guess}`);
          panel.refs.xpRow.title = left > 0
            ? `XP limit ${limitXpText(session.xpLimit)} · ${left.toLocaleString()} XP left`
              + (xpPlan && xpPlan.races !== null
                ? ` · ≈${xpPlan.races} race${xpPlan.races === 1 ? '' : 's'} at ${Math.round(xpPlan.perRace).toLocaleString()} XP per race (≈${xpPlan.minutes}m)`
                : ' · no measured pace yet')
              + '. The bot finishes the race in progress and closes the session'
            : 'XP limit reached: the next A opens a fresh session';
        }
      }

      // La fila `left` de la tarjeta del tope: lo que queda, en claro.
      if (panel.refs.etaLeft) {
        setText(panel.refs.etaLeft, eta
          ? `≈ ${eta.minutes} min · ${eta.remaining} race${eta.remaining === 1 ? '' : 's'}${eta.breaks ? ` + ${eta.breaks} break${eta.breaks === 1 ? '' : 's'}` : ''}`
          : (session.raceLimit ? 'done' : 'no limit'));
      }

      // El tooltip dice de donde sale la estimacion: sin eso el numero parece
      // magia. Se reescribe solo cuando cambia, que esto corre en cada tick.
      if (panel.refs.raceLimitRow) {
        let title;
        if (!session.raceLimit) {
          title = 'No session limit: the bot keeps going until you stop it. Click: 20, 50, 100 races.';
        } else if (!eta) {
          title = `Session limit reached (${session.raceLimit} races): the next A opens a fresh session. Click to change it.`;
        } else {
          const parts = [
            `${eta.remaining} race${eta.remaining === 1 ? '' : 's'} left`,
            `${Math.round(eta.cycleMs / 1000)} s per race (${eta.measured ? 'measured' : 'estimated'})`,
          ];
          let text = `≈ ${eta.minutes} min left: ${parts.join(' · ')}`;
          if (eta.breaks) text += ` + ${eta.breaks} break${eta.breaks === 1 ? '' : 's'}`;
          else if (!CONFIG.breaks.enabled) text += ' · breaks off';
          title = `${text}. Click to change the limit (free, 20, 50, 100).`;
        }
        if (panel.refs.raceLimitRow.title !== title) panel.refs.raceLimitRow.title = title;
      }
    }
    const limitMode = session.raceLimit ? 'on' : 'off';
    if (panel.root.dataset.limit !== limitMode) panel.root.dataset.limit = limitMode;
    paintPanelActions();

    // Avance de la carrera: numero de letras aceptadas y barra fina debajo del
    // marcador. Sin leccion cargada (resultados, descanso) se muestra un guion.
    const total = session.total;
    const pos = clamp(session.pos, 0, total || 0);
    const racePct = total > 0 ? progressPct(pos, total) : 0;
    setText(panel.refs.progress, total > 0 ? `${pos}/${total}` : '—');
    if (panel.refs.progFill) {
      const width = `${racePct.toFixed(1)}%`;
      if (panel.refs.progFill.style.width !== width) panel.refs.progFill.style.width = width;
    }
    // La linea de la cabecera usa scaleX, no width: se queda en el compositor
    // aunque el panel este en otra pestaña o haya una animacion de fondo.
    if (panel.root) {
      const fill = (racePct / 100).toFixed(4);
      if (panel.root.style.getPropertyValue('--race-fill') !== fill) {
        panel.root.style.setProperty('--race-fill', fill);
      }
    }

    if (breaking) {
      const left = Math.max(0, Math.ceil((session.breakUntil - Date.now()) / 1000));
      setText(panel.refs.breakLeft, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    } else {
      // Fuera del descanso la fila dice cuantas carreras faltan para el
      // siguiente: antes solo aparecia cuando ya estabas dentro de el.
      const untilBreak = CONFIG.breaks.enabled && session.blockTarget > 0
        ? Math.max(0, session.blockTarget - session.blockRaces)
        : 0;
      setText(panel.refs.breakLeft, untilBreak > 0 ? `in ${untilBreak}` : '—');
    }

    // El autocalibrado solo se muestra cuando ya se ha movido: si esta a 1.00
    // no aporta nada y ocupa una fila.
    const trimmed = Math.abs(session.trim - 1) >= 0.005;
    setDisplay(panel.refs.trimRow, trimmed);
    if (trimmed) setText(panel.refs.trim, `x${session.trim.toFixed(2)}`);


    // Racha de descalificaciones: solo aparece cuando hay alguna. Es la razon
    // por la que el bot se para solo a las dos seguidas.
    const dqStreak = session.dqStreak | 0;
    setDisplay(panel.refs.dqRow, dqStreak > 0);
    if (dqStreak > 0) setText(panel.refs.dq, `×${dqStreak}`);

    // The game's own reading (the number Nitro Type counts) next to the ceiling.
    // It only appears while a race is live; if it ever reaches the cap the chip
    // turns red, which is the moment the guard is about to stop the whole bot.
    const cap = CONFIG.wpm.hardCap;
    const hud = session.startedAt && !session.endedAt ? hudWpm() : null;
    if (hud !== null && session.typing) session.lastHudWpm = hud;
    setDisplay(panel.refs.hudRow, hud !== null);
    if (hud !== null) {
      setText(panel.refs.hud, Number.isFinite(cap) ? `${hud.toFixed(0)} / ${cap}` : hud.toFixed(0));
      setGood(panel.refs.hud, Number.isFinite(cap) ? hud < cap : null);
    }
    if (panel.root) panel.root.dataset.capHit = Number.isFinite(cap) && hud !== null && hud >= cap ? '1' : '0';

    // Si el Worker del reloj no se pudo crear (CSP del sitio), la cadencia cae a
    // los temporizadores de la pagina: con la pestana en segundo plano el
    // navegador los frena a 1 tecla/s y la carrera termina en DQ por inactividad.
    // Es el fallo que ya paso una vez, asi que se avisa aqui en vez de dejarlo
    // escondido en el informe de diagnostico.
    if (panel.refs.clockRow) {
      const slowClock = preciseClockKind !== 'worker';
      setDisplay(panel.refs.clockRow, slowClock);
      if (slowClock) {
        setText(panel.refs.clock, 'page timers');
        setGood(panel.refs.clock, false);
      }
    }

    // Resultado de la ultima carrera (puesto y premio): solo cuando el juego lo
    // publico. Sale del evento `update` del servidor de la carrera; si el sitio
    // no lo manda, la fila se queda oculta en vez de inventar un numero.
    if (panel.refs.resultRow) {
      const lastResult = raceHistory[raceHistory.length - 1];
      const hasResult = Boolean(lastResult && (lastResult.place || lastResult.cash || lastResult.xp));
      setDisplay(panel.refs.resultRow, hasResult);
      if (hasResult) {
        const bits = [
          ordinal(lastResult.place),
          lastResult.cash ? `+$${lastResult.cash.toLocaleString()}` : '',
          lastResult.xp ? `+${lastResult.xp} xp` : '',
        ].filter(Boolean);
        setText(panel.refs.result, bits.join(' · '));
        panel.refs.resultRow.title = `Last race: ${bits.join(' · ')} (read from the game's own race result).`;
      }
    }

    // Fila guard: solo aparece cuando hay algo que explicar (copia esperando,
    // hueco del guardia o bloqueo del sitio). El resto del tiempo sonaba a ruido.
    if (panel.refs.guardRow) {
      let guardText = '';

      // Atasco con las recargas ya gastadas (lo deja la cola en localStorage
      // cuando no puede salir solo): es lo primero que hay que ver, porque es el
      // unico caso en el que el bot necesita que lo desatasques tu.
      let stuck = null;
      try {
        stuck = JSON.parse(disk.get(STUCK_STATE, 'null'));
      } catch {
        stuck = null;
      }
      const stuckFresh = Boolean(stuck && Number.isFinite(stuck.at) && Date.now() - stuck.at < 600000);

      const pen = penLabel();

      if (stuckFresh) guardText = 'stuck · press F5';
      else if (dqBlockedNoted) guardText = 'site block';
      else if (session.stopped) guardText = '';
      else if (!primaryRole) guardText = `standby · pen ${pen || '—'}`;
      else if (peerCount > 1) guardText = `writing · pen ${pen || '—'}`;
      else if (session.carefulRaces > 0) guardText = `careful · ${session.carefulRaces}`;
      else if (session.breakUntil > Date.now()) guardText = 'long break';

      setDisplay(panel.refs.guardRow, Boolean(guardText));
      if (guardText) setText(panel.refs.guard, guardText);
      const standby = !primaryRole && !session.stopped ? '1' : '0';
      if (panel.root.dataset.standby !== standby) panel.root.dataset.standby = standby;
    }

    // Resumen del dia: carreras, media real frente a la media objetivo, cajas y
    // DQ. Se lee de lo guardado hoy, asi que sobrevive a las recargas del marco.
    if (panel.refs.todayRow) {
      const day = todayRead();
      const parts = [];

      if (day.races > 0) {
        const avg = day.sumWpm / day.races;
        const avgTarget = day.sumTarget / day.races;
        parts.push(`${day.races} race${day.races === 1 ? '' : 's'}`);
        parts.push(`${avg.toFixed(1)}/${Math.round(avgTarget)} wpm`);
      }
      if (day.cash > 0) parts.push(`$${Math.round(day.cash).toLocaleString()}`);
      if (day.boxes > 0) parts.push(`${day.boxes} box${day.boxes === 1 ? '' : 'es'}`);
      if (day.xp > 0) parts.push(`${day.xp.toLocaleString()} XP`);
      if (day.dq > 0) parts.push(`${day.dq} DQ`);

      setDisplay(panel.refs.todayRow, parts.length > 0);
      if (parts.length) setText(panel.refs.today, parts.join(' · '));

      // El detalle del dia va en el tooltip (la fila es corta a proposito):
      // mejor carrera, racha limpia, horario y ultima DQ.
      const detail = [];
      if (day.races > 0) {
        detail.push(`${day.races} measured race${day.races === 1 ? '' : 's'}`);
        if (day.best > 0) detail.push(`best ${day.best.toFixed(1)} WPM (${(day.bestAcc || 0).toFixed(1)}%)`);
        if (day.races > 0 && day.sumTarget > 0) detail.push(`average target ${(day.sumTarget / day.races).toFixed(0)}`);
        detail.push(`${day.clean} in a row without a DQ`);
        if (day.firstAt) detail.push(`${clockText(day.firstAt)}-${clockText(day.lastAt || Date.now())}`);
      } else {
        detail.push('no measured races yet today');
      }
      if (day.cash > 0) detail.push(`$${Math.round(day.cash).toLocaleString()} in race prizes`);
      if (day.xp > 0) detail.push(`${day.xp.toLocaleString()} XP awarded`);
      if (day.dq > 0) detail.push(`${day.dq} DQ (last ${clockText(day.dqAt) || '—'})`);
      detail.push('⚙ → report for the whole picture');
      panel.refs.todayRow.title = `Today: ${detail.join(' · ')}.`;
    }

    // Daily Mystery Box: the queue records the last claim and when the site will
    // hand out the next one, so the panel can show it without asking the site.
    const boxNext = Number(disk.get(BOX_STATE_NEXT)) || 0;
    const boxLast = Number(disk.get(BOX_STATE_LAST)) || 0;
    // Una fecha local absurda (version anterior) no se pinta como "en 100000 h";
    // se ignora para la cuenta atras y el estado cae a "ready", igual que
    // boxDue decide si toca reclamarla.
    const saneBoxNext = (() => {
      const now = Date.now();
      return boxNext > now && boxNext <= now + CONFIG.mysteryBox.retryAfterMs + 3600000 ? boxNext : 0;
    })();
    const boxLogRaw = disk.get(BOX_STATE_LOG, '[]');
    let boxLog = [];
    try {
      const parsed = JSON.parse(boxLogRaw || '[]');
      boxLog = Array.isArray(parsed) ? parsed.filter((item) => item && item.at) : [];
    } catch { /* historial corrupto: se ignora */ }

    // La hora que da el propio sitio manda sobre la estimacion local, pero solo
    // si es creible y viene como epoch; un valor raro se ignora.
    // Dentro de carrera el panel se pinta dos veces por segundo y este JSON
    // puede ser grande. La cuenta atras de la caja no necesita refrescarse tan
    // a menudo como el WPM: se lee como mucho una vez cada 15 s.
    const siteProfile = siteUser(15000);
    const countdownRaw = Number(siteProfile && siteProfile.rewardCountdown);
    const site = countdownRaw > 0
      ? boxWaitFromNext(countdownRaw, CONFIG.mysteryBox.retryAfterMs, { pastMeansReady: true, epochOnly: true })
      : null;
    const siteWait = site && !site.bad ? site.wait : 0;
    const siteBoxAt = siteWait > 0 ? Date.now() + siteWait : 0;
    // El garaje anuncia aqui que ha visto el Claim Now!: la tarjeta manda
    // sobre una espera local o del sitio que ya no es cierta. Caduca sola y
    // no se pisa si el cobro acaba de terminar.
    const boxReadyAt = Number(disk.get(BOX_STATE_READY, 0)) || 0;
    const boxSettled = boxLast && Date.now() - boxLast < CONFIG.mysteryBox.claimSettleMs;
    const boxReadySynced = boxReadyAt > 0 && Date.now() - boxReadyAt < BOX_STATE_READY_MS && !boxSettled;

    if (panel.refs.boxRow) {
      setDisplay(panel.refs.boxRow, Boolean(boxLast || saneBoxNext || siteBoxAt || boxReadySynced));

      // El tooltip lleva la ultima reclamacion completa (premio y cuando): es el
      // unico sitio donde cabe sin cargar la fila.
      const last = boxLog[0];
      panel.refs.boxRow.title = boxReadySynced
        ? `Claim Now! seen in the garage; the box is ready.${last ? ` Last claim: ${last.text} · ${elapsedText(last.at)}.` : ''}`
        : (last
          ? `Last claim: ${last.text} · ${elapsedText(last.at)}${boxLog.length > 1 ? ` · ${boxLog.length} recorded` : ''}`
          : 'Daily Mystery Box in the garage');
      if (boxReadySynced) {
        panel.root.dataset.box = 'ready';
        setText(panel.refs.box, 'ready now');
      } else if (siteBoxAt > Date.now()) {
        panel.root.dataset.box = 'waiting';
        setText(panel.refs.box, `in ${boxWaitText(siteBoxAt - Date.now())}`);
      } else if (!boxLast && saneBoxNext) {
        panel.root.dataset.box = 'coming';
        setText(panel.refs.box, 'never claimed');
      } else if (saneBoxNext) {
        panel.root.dataset.box = 'waiting';
        setText(panel.refs.box, `in ${boxWaitText(saneBoxNext - Date.now())}`);
      } else {
        panel.root.dataset.box = 'ready';
        setText(panel.refs.box, 'ready now');
      }
    }

    // La sesion del sitio, para verla tambien mientras corre la carrera. Si el
    // token no se puede leer, la fila se queda fuera en vez de mentir.
    if (panel.refs.sessionRow) {
      const exp = sessionExpiryAt();
      setDisplay(panel.refs.sessionRow, Boolean(exp));
      if (exp) {
        const left = exp - Date.now();
        if (left <= 0) {
          setText(panel.refs.sessionLeft, 'expired');
          setColor(panel.refs.sessionLeft, 'var(--bad)');
          panel.refs.sessionRow.title = 'Session token expired: the queue logs in again from the login page.';
        } else {
          setText(panel.refs.sessionLeft, left >= 3600000
            ? `${(left / 3600000).toFixed(1)}h`
            : `${Math.max(1, Math.round(left / 60000))}m`);
          setColor(panel.refs.sessionLeft, left <= 5 * 60000 ? 'var(--warn)' : '');
          panel.refs.sessionRow.title = `Site session: expires in ${Math.max(1, Math.round(left / 60000))} min. The queue renews it on the garage, between races.`;
        }
      }
    }

    // Green above target, amber below. WPM gets a 5% margin because an in-race
    // reading always trails a little.
    setGood(panel.refs.live, measured ? wpm >= profile.targetWPM * 0.95 : null);
    setGood(panel.refs.acc, measured ? acc >= profile.accuracyGoal : null);

    // --- v7: cabecera, barra de estado y listas del registro --------------
    // La barra de abajo es la linea que se lee de un vistazo: LED, estado, modo,
    // WPM vivo, techo y la pista de teclas.
    const off = session.stopped;
    const stateText = off ? 'waiting' : breaking ? 'break' : session.paused ? 'paused' : (session.typing ? 'racing' : 'idle');
    setText(panel.refs.footState, stateText);
    setText(panel.refs.footMode, MODE);
    setText(panel.refs.footWpm, measured ? `${wpm.toFixed(1)} wpm` : '— wpm');
    setText(panel.refs.footAcc, measured ? `${acc.toFixed(1)}%` : '— acc');
    setText(panel.refs.footCap, Number.isFinite(CONFIG.wpm.hardCap) ? `cap ${CONFIG.wpm.hardCap}` : 'no cap');
    // El reloj tiene su propio hueco: en compacto se quedan WPM, precision y
    // reloj, y el modo, el techo y la pista desaparecen. Alt+M lo recorre.
    const raceSeconds = measured && session.startedAt
      ? Math.max(0, Math.round((Date.now() - session.startedAt) / 1000))
      : 0;
    const raceClock = raceSeconds
      ? `${Math.floor(raceSeconds / 60)}:${String(raceSeconds % 60).padStart(2, '0')}`
      : '0:00';
    setText(panel.refs.footClock, raceClock);
    setText(panel.refs.footHint, off ? 'resumes itself' : session.paused ? 'resume' : 'Alt+S stop');
    // `off` ya ES session.stopped, asi que la rama que volvia a mirarlo nunca
    // se alcanzaba: el descanso se pintaba como "waiting" y no como "break".
    setText(panel.refs.liveTag, off ? 'waiting · resumes itself' : session.typing ? 'racing' : breaking ? 'break' : 'waiting');

    // El registro ocupa una vista entera y solo se ve al abrir LOG. Mientras
    // tanto basta con leer los retos para contarlos; las listas se pintan al
    // montar la vista, no en cada tick del arranque.
    if (!panel.mountedViews || panel.mountedViews.has('log')) {
      paintLogLists();
      paintChallengeList();
    } else {
      readChallengeProgress();
    }

    // Solo se repinta cuando entra una carrera nueva, no en cada tick.
    const last = raceHistory[raceHistory.length - 1];
    const signature = `${raceHistory.length}:${last ? last.at : 0}`;
    if (panel.historySig !== signature) {
      panel.historySig = signature;
      renderHistory();
    }
  }

  // Tablas de recompensa de Nitro Type. El puesto paga 480/460/440/420 (400
  // desde el quinto), la velocidad paga 2 x WPM y la precision va por tramos.
  const XP_BASE_BY_PLACE = { 1: 480, 2: 460, 3: 440, 4: 420 };

  function xpBaseForPlace(place) {
    return XP_BASE_BY_PLACE[place] || 400;
  }

  function xpAccuracyTier(acc) {
    const rounded = Math.round(Number(acc) || 0);
    if (rounded >= 100) return 100;
    if (rounded === 99) return 75;
    if (rounded === 98) return 50;
    if (rounded === 97) return 25;
    if (rounded === 96) return 15;
    return 0;
  }

  function xpNextAccuracyTier(acc) {
    const rounded = Math.round(Number(acc) || 0);
    if (rounded < 96) return { pct: 96, xp: 15 };
    if (rounded < 97) return { pct: 97, xp: 25 };
    if (rounded < 98) return { pct: 98, xp: 50 };
    if (rounded < 99) return { pct: 99, xp: 75 };
    if (rounded < 100) return { pct: 100, xp: 100 };
    return null;
  }

  // Desglose del premio real. `session` es el resto: bonus de sesion, retos,
  // cajas o cualquier extra que el paquete de la carrera incluya.
  // Las tablas base/velocidad/precision son las del parche actual: si el juego
  // las cambia (evento, temporada o bonus), hay que revisar XP_BASE_BY_PLACE y
  // xpAccuracyTier antes de fiarse de esta fila.
  function xpBreakdown(row) {
    if (!row) return null;
    const total = Number(row.xp);
    if (!Number.isFinite(total) || total <= 0) return null;

    const place = Number(row.place);
    const wpm = Number(row.wpm);
    const acc = Number(row.acc);
    const base = xpBaseForPlace(place);
    const speed = Number.isFinite(wpm) && wpm > 0 ? Math.round(wpm) * 2 : 0;
    const accuracy = xpAccuracyTier(acc);
    const rounded = Math.round(total);

    return {
      total: rounded,
      base,
      speed,
      accuracy,
      session: Math.max(0, rounded - base - speed - accuracy),
      place: Number.isFinite(place) && place > 0 ? place : null,
      acc: Number.isFinite(acc) ? acc : 0,
    };
  }

  function renderHistory() {
    const box = panel.refs && panel.refs.history;
    if (!box) return;

    if (!raceHistory.length) {
      box.innerHTML = '<div class="hist-empty">no races yet</div>';

      // Al vaciar el historial el pie no puede quedarse con la media de antes.
      if (panel.refs.foot) {
        panel.refs.foot.style.display = 'none';
        setText(panel.refs.avg, '—');
        setText(panel.refs.best, '—');
      }
      return;
    }

    // La mas reciente arriba. La hora y el puesto son lo que se mira al volver:
    // el indice de antiguedad no decia nada y el XP se perdia en el reporte.
    box.innerHTML = raceHistory
      .slice()
      .reverse()
      .map((item) => {
        // Desvio frente al objetivo de esa carrera. Verde si cae dentro de +-2%,
        // que es donde el autocalibrado deberia mantenerlo.
        const dev = Number.isFinite(item.target) && item.target > 0
          ? ((item.wpm - item.target) / item.target) * 100
          : null;
        const cell = dev === null
          ? '<b class="dev"></b>'
          : '<b class="dev" data-good="' + (Math.abs(dev) <= 2 ? '1' : '0') + '">'
            + (dev >= 0 ? '+' : '-') + Math.abs(dev).toFixed(1) + '%</b>';

        const place = Number(item.place);
        const placeText = Number.isFinite(place) && place > 0 ? '#' + place : '—';
        const placeAttr = Number.isFinite(place) && place >= 1 && place <= 3
          ? ' data-medal="' + place + '"'
          : '';
        const xp = Number(item.xp);
        const xpText = Number.isFinite(xp) && xp > 0 ? '+' + Math.round(xp) : '—';
        const cash = Number(item.cash);
        // WPM oficial del paquete de meta (reloj del servidor). Se pinta junto
        // al del modelo solo cuando el update lo trajo: si no, la fila queda
        // como siempre en vez de mostrar un cero o una raya.
        // `wpm` ya es el oficial cuando el paquete lo trajo; el del modelo se
        // queda como etiqueta pequena al lado. Las carreras sin paquete no
        // muestran etiqueta y conservan su unico numero.
        const model = Number(item.modelWpm);
        const modelText = Number.isFinite(model) && model > 0 ? 'model ' + model.toFixed(1) : '';
        const server = Number(item.serverWpm);
        const nitroChars = Number(item.nitroChars);
        const nitroWords = Number(item.nitroWords);
        const nitroTag = nitroChars > 0
          ? '<i class="nitro-tag" aria-label="nitro">N</i>'
          : '';
        const title = [
          clockText(item.at) || '—',
          Number.isFinite(place) && place > 0 ? '#' + place : null,
          Number.isFinite(xp) && xp > 0 ? '+' + Math.round(xp) + ' xp' : null,
          Number.isFinite(cash) && cash > 0 ? '+$' + Math.round(cash).toLocaleString('en-US') : null,
          item.acc.toFixed(1) + '% acc',
          'model ' + (Number.isFinite(model) && model > 0 ? model : item.wpm).toFixed(1) + ' wpm',
          Number.isFinite(server) && server > 0 ? 'server ' + server.toFixed(1) + ' wpm (packet clock)' : null,
          nitroChars > 0 ? 'nitro ' + (nitroWords || 1) + ' word · ' + nitroChars + ' ch' : null,
          Number.isFinite(item.target) ? 'target ' + item.target + ' wpm' : null,
        ].filter(Boolean).join(' · ');

        return '<div class="hist-row" title="' + title.replace(/"/g, '&quot;') + '">'
          + '<span>' + (clockText(item.at) || '—') + '</span>'
          + '<b class="place"' + placeAttr + '>' + placeText + '</b>'
          + '<b class="xp">' + xpText + '</b>'
          + '<b class="wpm">' + nitroTag + item.wpm.toFixed(1)
          + (modelText ? '<span class="model">' + modelText + '</span>' : '')
          + '</b>'
          + cell + '</div>';
      })
      .join('');

    // Media y mejor de las que se estan viendo: dice de un vistazo si va en
    // tendencia o si la ultima fue un pico suelto.
    const stats = historyStats(raceHistory);
    if (panel.refs.foot) {
      panel.refs.foot.style.display = stats ? 'flex' : 'none';
      if (stats) {
        setText(panel.refs.avg, `${stats.avgWpm.toFixed(1)} · ${stats.avgAcc.toFixed(1)}%`);
        setText(panel.refs.best, stats.bestWpm.toFixed(1));
      }
    }
  }

  /* ==========================================================================
   * 14. QUEUE AND RECOVERY (TOP WINDOW ONLY)
   * ========================================================================== */
  // Antes era el userscript "Auto Redirect". Ahora es la mitad de arriba del
  // mismo archivo y su unico trabajo es que el bot no se quede colgado: entrar
  // desde el garaje, resolver el modal de "ya estas en una carrera", volver a
  // /race si el CAPTCHA lo pide y salir de una pagina atascada.
  //
  // Lo que NO hace: abrir carreras con el tipador apagado (serian carreras a
  // 0 WPM en el historial) ni tocar "Race Again" mientras el tipador vive,
  // porque ahi manda el iframe con su reloj y sus descansos.
  function runQueue() {
    if (!CONFIG.queue.enabled) return;

    const PREFIX = 'ntQueue:';
    const CONTINUE = new Set(['continue', 'race again', 'play again']);
    const queueLog = (...args) =>
      console.log('%c[NTAuto · queue]', 'color:#4ea1ff;font-weight:bold', ...args);

    // Motivo de la ultima decision que movio la pagina o apago la cola. La
    // consola no sirve para esto: cuando el panel se pinta ya se ha cambiado de
    // documento y el log se fue con el anterior. Vive en sessionStorage, asi que
    // sobrevive a la navegacion dentro de la pestana y no se mezcla con otras.
    const WHY = 'why';

    const store = {
      get(key, fallback) {
        try {
          const raw = sessionStorage.getItem(PREFIX + key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch {
          return fallback;
        }
      },
      set(key, value) {
        try { sessionStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* bloqueado */ }
      },
      remove(key) {
        try { sessionStorage.removeItem(PREFIX + key); } catch { /* bloqueado */ }
      },
    };

    // Igual que queueLog, pero ademas deja el motivo donde el panel lo puede
    // leer despues de navegar.
    function queueWhy(text) {
      queueLog(text);
      try { store.set(WHY, { text: String(text), at: Date.now() }); } catch { /* bloqueado */ }
    }

    // Ultimo FALLO de verdad: que se rompio, con que detalle y a que hora. No es
    // lo mismo que `why` (la ultima decision, que casi siempre es rutina: "a la
    // caja", "a la carrera"). Esto solo se escribe cuando algo se tuerce, y vive
    // en localStorage porque el fallo mas util es justo el que provoca una
    // recarga o un re-login: en sessionStorage se perderia con la pestana.
    const LAST_FAIL = 'ntQueue:lastFail';
    const LAST_FAIL_TTL_MS = 12 * 3600000;

    function noteFailure(kind, detail) {
      try {
        localStorage.setItem(LAST_FAIL, JSON.stringify({
          kind: String(kind || 'unknown'),
          detail: String(detail || '').slice(0, 140),
          at: Date.now(),
        }));
      } catch { /* almacenamiento bloqueado: el informe solo perdera esta fila */ }
    }

    function lastFailure() {
      try {
        const raw = localStorage.getItem(LAST_FAIL);
        const saved = raw ? JSON.parse(raw) : null;
        if (!saved || !saved.kind || !Number.isFinite(Number(saved.at))) return null;
        const at = Number(saved.at);
        // Un fallo de anteayer no explica nada de lo que pasa ahora.
        if (Date.now() - at > LAST_FAIL_TTL_MS) return null;
        return { kind: String(saved.kind), detail: String(saved.detail || ''), at };
      } catch {
        return null;
      }
    }

    let redirecting = false;
    // Estado del cierre del modal de DQ. No hay pestillo permanente: el juego
    // repinta el modal solo, asi que un clic que no aterriza tiene que poder
    // reintentarse en vez de dejar la pagina clavada para siempre.
    let dqPressAt = 0;          // cuando se intento cerrar por ultima vez
    let dqPressTries = 0;       // intentos seguidos con el modal en pantalla
    let dqPressTimer = null;    // cierre programado (el boton se busca al pulsar)
    let dqBlockReloaded = false; // una comprobacion por carga de pagina, pase lo que pase
    const DQ_RETRY_MS = 3500;   // espera entre intentos mientras el modal siga ahi
    let standbyNoted = false;   // the duplicate-copy notice is printed once
    let tabStandbyNoted = false; // otra pestaña tiene el lease (aviso una vez)
    let queueId = null;         // this queue copy in the window registry
    let queueSince = 0;         // when it registered (election tie-break)
    let queuePrimary = true;    // false = another queue copy owns this window
    let queueRoleNoted = false;
    let captchaHandled = false;
    let captchaScanAt = 0;
    let idleTimer = null;
    let continueTimer = null;
    let raceNowTimer = null;
    let raceNowAt = 0;          // cuando toca pulsar «Race Now» (0 = nada programado)
    let raceNowDelay = 0;       // retardo sorteado, para la barra de cuenta atras
    let raceNowHoldUntil = 0;   // cancelado a mano: no reprogramar hasta pasar este rato
    let bounceNoted = false;    // «Race Now» sin carrera: aviso dado una vez
    let activeClosedNoted = false; // ventana de horas cerrada: aviso dado una vez
    let assetWarned = false;    // ficheros del juego que no cargan: aviso dado una vez
    let loginHumanAt = 0;       // ultimo clic/tecla de verdad en /login (0 = pantalla del bot)
    let loggedOutNoted = false;
    let loginReasonNoted = null;
    let reloginTimer = null;
    let reloginGaveUp = false;
    let reloginManualNoted = false; // ultimo login manual: no se pulsa SSO solo
    let loginSeenAt = 0;            // primera vez que esta carga vio /login
    let loginReloadTimer = null;    // recarga programada de un login atascado
    let loginReloadAt = 0;          // cuando dispara la recarga programada
    let loginReloadGaveUp = false;  // presupuesto de recargas agotado
    let loginRetryTimer = null;     // reintento desatendido del login
    let loginRetryAt = 0;           // cuando dispara ese reintento
    let loginRecoveryCleared = false; // sesion buena: presupuesto ya saldado
    let loginTimeoutHash = '';      // hash #timeout-... ya retirado en esta carga
    let loginRefreshBadge = null;   // aviso pequeno mientras se recarga el login
    let loginRefreshTick = null;    // reloj de la cuenta atras del aviso
    let loginCancelledNotice = null; // confirmacion breve tras Cancel
    let loginCancelledTimer = null;  // retira esa confirmacion
    let loginManualHold = false;    // el humano cancelo el refresco en esta carga
    let lastUrl = location.href;
    let armedCache = null;      // ultimo valor pasado a setArmed (para no escribir cada tick)
    const lastPress = Object.create(null);

    // Que se acaba de pulsar en /login: un SSO de un clic o el formulario. Se
    // guarda con su hora para repetir el mismo camino si la sesion cae sola.
    // Pulsar el logo, un enlace cualquiera o un boton de "Sign up" no cuenta.
    const LOGIN_PROVIDERS = ['google', 'classlink', 'clever', 'facebook'];

    function loginMethodFromNode(node) {
      if (!node || typeof node.closest !== 'function') return null;
      const target = node.closest('button, a, input');
      if (!target) return null;

      if (target.tagName === 'INPUT') {
        const label = normalize(target.value || target.getAttribute('aria-label') || '');
        if (/sign ?up|register|create an account/.test(label)) return null;

        const classes = String(target.className || '').toLowerCase();
        for (const method of LOGIN_PROVIDERS) {
          if (classes.includes(`btn--${method}`)) return method;
        }
        for (const method of LOGIN_PROVIDERS) {
          if (label.includes(method) && /log ?in|sign ?in|continue with/.test(label)) return method;
        }

        const type = String(target.type || '').toLowerCase();
        if (type === 'submit' && target.form && target.form.querySelector('input[type="password"]')) return 'manual';
        return null;
      }

      const text = normalize(target.textContent || '');
      if (/sign ?up|register|create an account/.test(text)) return null;

      const classes = String(target.className || '').toLowerCase();
      for (const method of LOGIN_PROVIDERS) {
        if (classes.includes(`btn--${method}`)) return method;
      }
      for (const method of LOGIN_PROVIDERS) {
        if (text.includes(method) && /log ?in|sign ?in/.test(text)) return method;
      }

      // El boton del formulario de usuario/contrasena: solo ese formulario.
      const type = String(target.type || '').toLowerCase();
      if (type === 'submit' && target.form && target.form.querySelector('input[type="password"]')) return 'manual';
      return null;
    }

    function rememberLoginMethod(method) {
      const saved = savedLogin();
      // localStorage, no sessionStorage: el recuerdo tiene que sobrevivir al
      // cierre de la pestaña para el proximo dia de carreras.
      disk.set(LOGIN_MEMORY_KEY, JSON.stringify({ method, at: Date.now() }));
      if (saved && saved.method === method) return;
      queueLog(method === 'manual'
        ? 'Login: remembered username and password; the bot will not press an SSO by itself next time.'
        : `Login: remembered ${SSO_LABEL[method]}; that is the provider the bot will press next time.`);
    }

    // Un clic o una tecla de verdad (isTrusted) en /login: la pantalla es del
    // humano y el bot no pulsa nada en ella. El clic sintetico del bot no cuenta.
    const noteHumanLogin = (event) => {
      if (!event.isTrusted) return;
      if (!location.pathname.startsWith('/login')) return;
      // Los botones del aviso son parte del bot: no cuentan como un toque
      // humano que retire el aviso antes de que su click llegue a ejecutarse.
      if (event.target instanceof Element && event.target.closest('[data-nta-login-refresh]')) return;
      loginHumanAt = Date.now();
      // Si el humano toma la pantalla, el aviso de recarga ya no aplica: el
      // temporizador vera el toque y no recargara encima de el.
      hideLoginRefreshBadge();

      let method = loginMethodFromNode(event.target);
      // Enviar el formulario con Enter no es un clic en el boton: se mira la
      // tecla sobre un campo de contrasena.
      if (!method && event.type === 'keydown' && event.key === 'Enter') {
        const field = event.target instanceof Element ? event.target.closest('input') : null;
        if (field && field.form && field.form.querySelector('input[type="password"]')) method = 'manual';
      }
      if (method) rememberLoginMethod(method);
    };
    document.addEventListener('pointerdown', noteHumanLogin, true);
    document.addEventListener('keydown', noteHumanLogin, true);

    // Ganchos inertes para el banco: leer el recuerdo y clasificar un nodo sin
    // abrir una pantalla de login real.
    window.__ntaDebug = window.__ntaDebug || {};
    window.__ntaDebug.loginMethodFor = (node) => loginMethodFromNode(node);
    window.__ntaDebug.autoSsoProvider = () => autoSsoProvider();

    const pageText = () => (document.body ? normalize(document.body.innerText) : '');

    /* ---- contrato con el iframe de la carrera ---- */

    // El iframe publica un resumen de su estado en window.top.__ntaFrame en
    // cada tick del panel. Si no hay publicacion reciente (recarga, iframe
    // nuevo) se mira dentro de los marcos accesibles.
    function typerState() {
      const direct = window.__ntaFrame;
      if (direct && Date.now() - direct.at < 5000) return direct;

      for (const frame of document.querySelectorAll('iframe')) {
        try {
          const state = frame.contentWindow && frame.contentWindow.__ntaFrame;
          if (state && Date.now() - state.at < 5000) return state;
        } catch {
          /* iframe de otro origen (anuncios) */
        }
      }
      return null;
    }

    // El descanso del tipador (DQ, guardia, pausa humana) se guarda en sus
    // contadores, pero su marco desaparece al salir de la carrera. Sin leer esa
    // copia, el garaje abria otra carrera en pleno descanso y el servidor la
    // descalificaba por inactividad: asi se llegaba a cinco DQ seguidas.
    function savedBreakUntil() {
      try {
        const saved = JSON.parse(localStorage.getItem(KEYS.session) || 'null');
        const until = Number(saved && saved.breakUntil) || 0;
        return until > Date.now() ? until : 0;
      } catch {
        return 0;
      }
    }

    // Two copies of the TYPER in the same tab cannot be seen from here (each frame
    // has its own window and its own instance registry), but their publications
    // can: both overwrite window.top.__ntaFrame and the publisher ALTERNATES from
    // one tick to the next (A, B, A, B...). A reload of the race frame changes the
    // id as well, but it never alternates: the old publisher is gone for good and
    // the new one stays. Only the A-B-A pattern counts, so reloading between races
    // can no longer be mistaken for a second copy (that false alarm used to stop a
    // whole session mid-race and left an inactivity DQ behind).
    let typerId = null;
    let typerSeenAt = 0;
    let typerPrevId = null;
    let typerAlts = 0;

    function noteTyperPublisher(state) {
      const now = Date.now();
      if (!state || !state.instance) return false;

      const fresh = now - typerSeenAt < 2500;

      if (fresh && state.instance !== typerId) {
        // Taking turns with the publisher seen two publications ago.
        typerAlts = state.instance === typerPrevId ? typerAlts + 1 : 1;
        typerPrevId = typerId;
      } else if (!fresh) {
        typerAlts = 0;
        typerPrevId = null;
      }

      typerId = state.instance;
      typerSeenAt = now;

      // El que acaba de publicar es el que sigue escribiendo y al otro se le pide
      // el turno. Es un aviso con caducidad -se refresca mientras dure la
      // alternancia-, no una parada: el bot no se apaga, solo deja de mandar
      // teclas duplicadas. La version anterior paraba el bot entero, y esa parada
      // dejaba la carrera en curso sin teclas (DQ por inactividad) y al bot mudo
      // hasta recargar la pagina.
      if (typerAlts < CONFIG.guard.typerFlips) return false;

      requestStandby(state.instance, 'two typer copies publishing at the same time');
      if (!standbyNoted) {
        standbyNoted = true;
        queueLog('Two copies of the typer are alive in this tab: the one publishing now keeps typing, the other stands by.');
        storeNotice('Two copies of the script detected: one keeps typing, the other waits.');
      }

      return false;
    }

    // Eleccion de copia de la cola en esta ventana: dos colas pulsando a la vez
    // es el mismo fallo que dos tipadores. La que no manda no toca nada.
    function refreshQueueRole() {
      const { count, primary } = electInstance(
        '__ntaQueueInstances',
        queueId || (queueId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`),
        queueSince || (queueSince = Date.now()),
        CONFIG.guard.instanceStaleMs,
      );

      if (primary !== queuePrimary) {
        queuePrimary = primary;
        if (!primary) {
          queueLog(`Another copy of the queue is running in this page (${count} alive); this one stays quiet and takes over if it stops.`);
        } else if (queueRoleNoted) {
          queueLog('The other copy is gone; this queue takes over.');
        }
        queueRoleNoted = !primary;
      }

      return primary;
    }

    // Mientras el tipador este vivo (no parado), abrir y cerrar carreras es
    // cosa suya: es el unico que conoce los descansos y el reloj del semaforo.
    function typerOwnsRaces() {
      const state = typerState();
      return Boolean(state) && !state.stopped;
    }

    // armedAt es un LATIDO, no la duracion de la tanda: mientras el tipador se
    // deje ver se renueva, y armedTtlMs sigue significando lo mismo (diez
    // minutos sin verlo = no abrir nada). Antes solo se escribia al CAMBIAR el
    // valor, y esa guarda dejaba la cola clavada a los 10 min con el tipador
    // vivo: isArmed() pasaba a false, la cola dejaba de pulsar Continue y «Race
    // Now» y de reclamar la caja, y re-armarla no servia porque setArmed(true)
    // volvia a salir por la guarda. Hasta recargar la pagina, nada.
    let lastArmedWrite = 0;

    function setArmed(on) {
      const changed = armedCache !== on;
      armedCache = on;

      if (!on) {
        if (changed) store.set('armedAt', 0);
        return;
      }

      const now = Date.now();
      if (!changed && now - lastArmedWrite < 60000) return;

      lastArmedWrite = now;
      store.set('armedAt', now);
    }

    // Rebotes de «Race Now» que vuelven al garaje sin carrera. Caducan solos:
    // uno de hace media hora no describe lo que pasa ahora (pudo ser el
    // servidor). LA caducidad vive aqui y no dentro del programador de «Race
    // Now», porque el programador no corre sin la cola armada: era justo la
    // puerta que el contador tenia que despejar, asi que un rebote viejo dejaba
    // el garaje sin armar hasta pulsar MODE. Un solo lector para las dos mitades.
    function raceNowBounces() {
      const n = Number(store.get('raceNowBounces', 0)) || 0;
      if (n <= 0) return 0;

      const at = Number(store.get('raceNowBounceAt', 0)) || 0;
      if (Date.now() - at > CONFIG.queue.raceNowBounceResetMs) {
        store.remove('raceNowBounces');
        store.remove('raceNowBounceAt');
        return 0;
      }
      return n;
    }

    // Puertas que hoy pueden tener la cola quieta, con lo que les queda. Vive
    // aqui, y no repartido por los sitios que deciden, para que el panel no
    // cuente una historia distinta de la que de verdad frena al bot. Todas
    // caducan solas: la lista es "que me esta esperando", no "que hay roto".
    function activeGates() {
      const now = Date.now();
      const gates = [];

      const hours = activeGate(now);
      if (hours) gates.push({ key: 'hours', label: hours.label, left: hours.left });

      const stop = stoppedInfo();
      if (stop) {
        const hold = Math.min(Number(stop.holdMs) || 0, 24 * 3600000) || CONFIG.queue.stopHoldMs;
        const left = stop.at + hold - now;
        if (left > 0) gates.push({ key: 'stop', label: stop.reason || 'stopped', left });
      }

      const blockLeft = blockUntil() - now;
      if (blockLeft > 0) gates.push({ key: 'block', label: 'site block', left: blockLeft });

      const retryLeft = loginRetryAt - now;
      if (retryLeft > 0) gates.push({ key: 'login', label: 'login retry', left: retryLeft });

      const bounces = raceNowBounces();
      if (bounces > 0) {
        const at = Number(store.get('raceNowBounceAt', 0)) || 0;
        gates.push({
          key: 'bounces',
          label: `«Race Now» ${bounces}/${CONFIG.queue.raceNowBounceMax}`,
          left: Math.max(0, at + CONFIG.queue.raceNowBounceResetMs - now),
        });
      }

      const attempts = Number(store.get('captchaAttempts', 0)) || 0;
      if (attempts > 0) {
        const at = Number(store.get('captchaAt', 0)) || 0;
        const left = Math.max(0, at + CONFIG.queue.captchaAttemptsResetMs - now);
        gates.push({ key: 'captcha', label: `CAPTCHA ${attempts}/${CONFIG.queue.captchaMaxRedirects}`, left });
      }

      const reloads = reloadBudget();
      if (reloads.n > 0) {
        gates.push({
          key: 'reloads',
          label: `reloads ${reloads.n}/${CONFIG.queue.reloadMax}`,
          left: Math.max(0, reloads.at + CONFIG.queue.reloadWindowMs - now),
        });
      }

      const files = assetFailures();
      if (files.n > 0) {
        gates.push({
          key: 'files',
          label: `game files ${files.n}/${CONFIG.queue.assetErrorMax}`,
          left: Math.max(0, files.at + CONFIG.queue.assetErrorResetMs - now),
        });
      }

      // La mas larga primero: es la que explica de verdad la espera.
      return gates.filter((gate) => gate.left > 0).sort((a, b) => b.left - a.left);
    }

    // Sin haber visto al tipador activo no se abre ninguna carrera: si el bot
    // esta apagado (Esc), encadenar carreras solo llenaria el historial de
    // carreras a 0 WPM.
    function isArmed() {
      const at = store.get('armedAt', 0);
      return Boolean(at) && Date.now() - at < CONFIG.queue.armedTtlMs;
    }

    /* ---- DOM ---- */

    function usable(el) {
      if (!el || el.disabled === true || el.getAttribute('aria-disabled') === 'true') return false;
      if (el.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.pointerEvents !== 'none';
    }

    function findButton(matches) {
      for (const el of document.querySelectorAll('button, a, [role="button"]')) {
        const label = normalize(el.textContent);
        if (label && matches(label) && usable(el)) return el;
      }
      return null;
    }

    /* ---- sesion del sitio ---- */

    // ¿Hay una sesion con la que jugar? El token manda; el «Log In» que el sitio
    // pinta en la cabecera es la prueba de que no la hay. Sin esta puerta, el
    // garaje de invitado se armaba solo, pulsaba «Race Now» y el sitio devolvia
    // la misma pagina cada pocos segundos (se veia como recargas) mientras el
    // boton de entrar no hacia nada.
    let signedCacheAt = 0;
    let signedCacheValue = true;
    let signedOutNoted = false;

    function signedIn() {
      // El token es la prueba fuerte y no cuesta DOM.
      if (readToken()) return true;

      const now = Date.now();
      if (now - signedCacheAt < 1500) return signedCacheValue;

      // Sin token solo se afirma "invitado" si el sitio ensena «Log In» y no hay
      // jugador guardado: un cambio de marcado no puede apagar el bot.
      const user = siteUser();
      const hasUser = Boolean(user && (user.username || user.userID || user.id));
      const logIn = hasUser ? null : findButton((label) => label === 'log in' || label === 'login' || label === 'sign in');

      signedCacheAt = now;
      signedCacheValue = !logIn;
      return signedCacheValue;
    }

    function handleSignedOut() {
      clearRaceNow();
      clearContinue();
      clearIdleTimer();
      setArmed(false);
      if (signedOutNoted) return;
      signedOutNoted = true;
      noteFailure('session', 'signed out while the queue was armed');
      queueWhy('Signed out: there is no session to race with. Press «Log In» and the queue starts again by itself.');
      storeNotice('Signed out: log in and the bot resumes on its own.');
    }

    function fire(el, type, buttons) {
      const base = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, buttons };
      let event;
      try {
        event = (type.startsWith('pointer') && typeof PointerEvent === 'function')
          ? new PointerEvent(type, { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1 })
          : new MouseEvent(type, base);
      } catch {
        event = new MouseEvent(type, base);
      }
      el.dispatchEvent(event);
    }

    // Secuencia completa: hay frameworks que escuchan pointerdown o mouseup en
    // vez de click, y otros exigen foco previo.
    function dispatchClick(el) {
      // Cualquier clic real es movimiento: cuenta para el vigilante anti-atasco
      // (antes solo `press` lo hacia, y una caja reclamada o un Continue podian
      // dejar el reloj de "nada se mueve" corriendo sin motivo).
      noteProgress();
      try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch { /* noop */ }
      fire(el, 'pointerover', 0);
      fire(el, 'mouseover', 0);
      fire(el, 'pointerdown', 1);
      fire(el, 'mousedown', 1);
      if (typeof el.focus === 'function') {
        try { el.focus({ preventScroll: true }); } catch { /* noop */ }
      }
      // Un clic real no mantiene el puntero quieto: un movimiento con el boton
      // pulsado separa la secuencia de un down/up instantaneo.
      fire(el, 'pointermove', 1);
      fire(el, 'mousemove', 1);
      fire(el, 'pointerup', 0);
      fire(el, 'mouseup', 0);
      fire(el, 'click', 0);
    }

    /* ---- acciones ---- */

    function queuePress(key, el) {
      // Con el farmeo AFK la cola tambien pulsa en segundo plano; solo se frena
      // si el modo esta apagado (ahi abrir una carrera oculta es regalar una DQ).
      if (hiddenBlocked()) return false;

      const now = Date.now();
      if (now - (lastPress[key] || 0) < CONFIG.queue.actionCooldownMs) return false;
      lastPress[key] = now;
      queueLog(`Click: «${normalize(el.textContent)}»`);
      dispatchClick(el);
      noteProgress();
      return true;
    }

    /* ---- vigilante anti-atasco ---- */

    // Con el bot armado, sin carrera viva, sin descanso y sin un solo clic en
    // CONFIG.queue.stuckMs, algo que el script no entiende esta en pantalla: un
    // modal nuevo, un marco muerto o un cargando eterno. Es el caso que dejaba la
    // pestana clavada pidiendo un F5 a mano. Lo hace el solo, con tope de
    // recargas por ventana para que no pueda convertirse en un bucle.
    let lastProgressAt = Date.now();
    let stuckWarned = false;

    function noteProgress() {
      lastProgressAt = Date.now();

      // Cualquier movimiento real desmiente el atasco: se borra la marca que
      // pinta el panel y el aviso puede volver a darse la proxima vez.
      if (stuckWarned) {
        stuckWarned = false;
        try { localStorage.removeItem(STUCK_STATE); } catch { /* modo privado */ }
      }
    }

    function reloadBudget() {
      const now = Date.now();
      const saved = store.get('reloads', null);
      if (!saved || !Number.isFinite(saved.at) || now - saved.at > CONFIG.queue.reloadWindowMs) {
        return { at: now, n: 0 };
      }
      return { at: saved.at, n: Math.max(0, saved.n | 0) };
    }

    function watchStuck() {
      if (!isArmed()) {
        // Desarmado a proposito (parada reciente, tope de tanda): no hay nada
        // que desatascar y el vigilante calla.
        if (stoppedRecently() || limitReached()) {
          noteProgress();
          return;
        }
        // Desarmado solo porque el latido del tipador caduco (armedTtlMs): eso
        // no es una decision, es un marco muerto. Antes el vigilante se apagaba
        // en silencio a los 10 min y la pestana se quedaba clavada sin aviso ni
        // recarga; ahora sigue mirando.
      }
      if (Date.now() - lastProgressAt < CONFIG.queue.stuckMs) return;

      // Cualquier cosa que expliques la espera cuenta como progreso: una carrera
      // en curso, un descanso, una pulsacion programada o el propio modal de DQ.
      const state = typerState();
      if (state && (state.typing || state.chars > 0 || state.breakUntil > Date.now())) {
        noteProgress();
        return;
      }
      if (savedBreakUntil()) {
        noteProgress();
        return;
      }
      // La espera por el castigo del sitio (15-90 min) es una espera deliberada,
      // no un atasco: el garaje se queda quieto a proposito. Sin esto el
      // vigilante recargaba la pagina cada `stuckMs` durante todo el bloqueo,
      // gastaba el presupuesto de 3 recargas y luego avisaba de que el bot estaba
      // atascado cuando solo estaba aguantando el castigo. Peor: el presupuesto
      // quedaba gastado para un atasco de verdad en la misma ventana.
      //
      // No hace falta el caso de la pestana oculta: `backgroundFarm` esta fijo a
      // true, asi que `hiddenBlocked()` nunca es cierto y el bot sigue trabajando
      // en segundo plano (una pestana oculta quieta si es un problema real).
      if (blockUntil() > Date.now()) {
        noteProgress();
        return;
      }
      if (redirecting || raceNowTimer || continueTimer || reloginTimer || boxTimer || dqPressTimer || loginRetryAt > Date.now()) {
        noteProgress();
        return;
      }
      // Un arranque cancelado a mano tambien explica la espera: sin esto el
      // vigilante recargaba la pagina en mitad del margen y el garaje volvia a
      // arrancar solo, que es justo lo que se acaba de cancelar.
      if (Date.now() < raceNowHoldUntil) {
        noteProgress();
        return;
      }
      // El modal de DQ explica la espera solo mientras su cierre esta en marcha;
      // si ya se agotaron los intentos, no es progreso: el vigilante tiene que
      // poder recargar (con su presupuesto) para salir del pozo.
      if (looksDisqualified(modalText()) && dqPressTries < 3) {
        noteProgress();
        return;
      }

      // Nunca mientras el turno es del humano: recargar el login (o el CAPTCHA)
      // borraria lo que este escribiendo.
      if (location.pathname.startsWith('/login') || captchaHandled) {
        noteProgress();
        return;
      }

      const budget = reloadBudget();

      // Presupuesto de recargas gastado: el bot ya no sabe desatascarse solo. En
      // vez de quedarse callado -que era justo lo que te dejaba la pestana
      // clavada sin saber por que- se avisa una vez: suena (si el sonido esta
      // encendido) y se deja la marca que el panel pinta como "stuck".
      if (budget.n >= CONFIG.queue.reloadMax) {
        if (!stuckWarned) {
          stuckWarned = true;
          try {
            localStorage.setItem(STUCK_STATE, JSON.stringify({ at: Date.now(), reloads: budget.n }));
          } catch { /* modo privado */ }
          noteFailure('reload', 'nothing moved and the reload budget is spent');
          queueLog('Nothing has moved and the reload budget is spent: press F5 or check the page.');
          storeNotice('The bot is stuck (reloads spent): press F5.');
          beep('block');
        }
        return;
      }

      store.set('reloads', { at: budget.at, n: budget.n + 1 });
      noteFailure('reload', `nothing moved for ${Math.round(CONFIG.queue.stuckMs / 60000)} min (${budget.n + 1}/${CONFIG.queue.reloadMax})`);
      queueLog(`Nothing has moved for ${Math.round(CONFIG.queue.stuckMs / 60000)} min; reloading the page (${budget.n + 1}/${CONFIG.queue.reloadMax} in this window).`);
      storeNotice('Nothing was moving, so the page was reloaded once to unstick the bot.');
      noteProgress();
      location.reload();
    }

    function scheduleContinue(button) {
      if (continueTimer) return;

      const hours = activeGate();
      if (hours) {
        queueWhy(`Active hours: the next race waits until ${hours.nextText}.`);
        scheduleActiveResume();
        return;
      }
      // Descanso pendiente aunque el tipador ya no tenga marco: no se abre otra
      // carrera (el boton de resultados arrancaria una carrera sin manos).
      if (savedBreakUntil()) return;
      const now = Date.now();
      if (now - (lastPress.continue || 0) < CONFIG.queue.actionCooldownMs) return;
      if (!claimTabLease('continue')) return;
      lastPress.continue = now;

      const delay = humanDelay(
        CONFIG.queue.continueDelayMs,
        CONFIG.queue.continueLongChance,
        CONFIG.queue.continueLongMs
      );
      queueLog(`Button «${normalize(button.textContent)}»: pressing in ${(delay / 1000).toFixed(1)}s.`);

      continueTimer = later(() => {
        continueTimer = null;
        if (!button.isConnected) {
          queueLog('The button is gone from the DOM; cancelling.');
          return;
        }
        if (hiddenBlocked()) {
          queueLog('The tab went to the background; the next race waits.');
          return;
        }
        // Si mientras esperabamos arranco el tipador, manda el.
        if (typerOwnsRaces()) {
          queueLog('The typer has taken over; pressing nothing.');
          return;
        }
        if (savedBreakUntil()) {
          queueLog('A break is in progress; the next race waits for it.');
          return;
        }
        const hours = activeGate();
        if (hours) {
          queueWhy(`Active hours: the next race waits until ${hours.nextText}.`);
          scheduleActiveResume();
          return;
        }
        if (!claimTabLease('continue')) return;
        clearIdleTimer();
        dispatchClick(button);
      }, delay);
    }

    function clearContinue() {
      if (continueTimer) {
        clearLater(continueTimer);
        continueTimer = null;
      }
    }

    // Solo se usa como red de seguridad: si en /race no hay carrera viva ni
    // tipador, mejor volver al garaje que quedarse mirando la nada.
    function startIdleTimer() {
      if (idleTimer) return;
      idleTimer = later(() => {
        idleTimer = null;
        if (typerOwnsRaces()) {
          startIdleTimer();
          return;
        }
        queueWhy('No live race on /race; going back to the garage.');
        navigate('/garage');
      }, CONFIG.queue.idleToGarageMs);
    }

    function clearIdleTimer() {
      if (idleTimer) {
        clearLater(idleTimer);
        idleTimer = null;
      }
    }

    function navigate(path) {
      if (redirecting) return;
      // `location.assign` a la misma URL es una recarga: si ya estas donde iba,
      // no se toca nada (era otra forma de "solo se recarga la pagina").
      if (location.pathname + location.search === path) {
        queueLog(`Already at ${path}; not reloading.`);
        return;
      }
      const before = location.href;
      redirecting = true;
      clearIdleTimer();
      clearContinue();
      clearRaceNow();
      queueLog(`Redirecting to ${path}…`);
      location.assign(path);

      // Si la navegacion no ocurre, no dejamos el bucle congelado.
      later(() => {
        if (location.href === before) {
          redirecting = false;
          queueLog('The redirect never completed; resuming the loop.');
        }
      }, CONFIG.queue.navWatchdogMs);
    }

    /* ---- reglas por estado de la pagina ---- */

    // Presupuesto del aviso de ficheros que no cargan. Si el CDN esta caido,
    // garaje -> Race Now -> error es un bucle: a la cuarta se deja de pulsar y se
    // dice por que, en vez de dar vueltas. Una carrera que arranca lo limpia.
    function assetFailures() {
      const now = Date.now();
      const saved = store.get('assetFailAt', 0) || 0;
      const stale = !saved || now - Number(saved) > CONFIG.queue.assetErrorResetMs;
      return { at: stale ? now : Number(saved), n: stale ? 0 : Number(store.get('assetFails', 0)) || 0 };
    }

    // Gasta un intento del presupuesto y deja el log. Devuelve false cuando ya
    // no queda: entonces solo avisa (una vez) y no se toca nada mas.
    function noteAssetFailure(what) {
      const budget = assetFailures();
      if (budget.n >= CONFIG.queue.assetErrorMax) {
        if (!assetWarned) {
          assetWarned = true;
          queueLog('The game keeps failing to load its files: not clicking through it again. Check the connection or the site.');
          storeNotice('The game files are not loading; the bot is waiting instead of looping.');
        }
        return false;
      }

      assetWarned = false;
      store.set('assetFailAt', budget.at);
      store.set('assetFails', budget.n + 1);
      noteFailure('files', `${what} (${budget.n + 1}/${CONFIG.queue.assetErrorMax} in this window)`);
      queueWhy(`The game could not load its files (${budget.n + 1}/${CONFIG.queue.assetErrorMax} in this window): ${what}.`);
      return true;
    }

    function handleAssetError() {
      const budget = assetFailures();
      if (budget.n >= CONFIG.queue.assetErrorMax) {
        noteAssetFailure('waiting');
        return true;
      }

      const target = findButton((label) => label.includes('your garage'))
        || findButton((label) => label.includes('try again'));
      if (target && queuePress('assets', target)) noteAssetFailure('going to the garage');
      return true;
    }

    // Puente con el marco de la carrera. Dentro del marco, pulsar un boton que
    // lleva al garaje solo navega EL MARCO: queda un garaje incrustado en /race
    // con la pagina de arriba creyendo que sigue en la carrera, y el bot
    // esperando minutos a que el temporizador de inactividad la saque. El
    // tipador avisa por aqui y la cola hace la navegacion de verdad.
    let lastNeedGarageAt = 0;
    let lastNeedLoginAt = 0;

    function handleFrameMessage(data, source) {
      if (!data) return false;

      let fromFrame = false;
      try {
        for (let i = 0; i < window.frames.length; i += 1) {
          if (window.frames[i] === source) { fromFrame = true; break; }
        }
      } catch {
        /* marco de otro origen */
      }
      if (!fromFrame) return false;

      if (data.__ntaAssetError === true) {
        if (!noteAssetFailure('reported by the race frame')) return true;
        clearRaceNow();
        navigate('/garage');
        return true;
      }

      if (data.__ntaNeedGarage === true) {
        const now = Date.now();
        if (now - lastNeedGarageAt < 10000) return true;
        lastNeedGarageAt = now;
        const why = typeof data.reason === 'string' && data.reason.trim()
          ? data.reason.trim()
          : 'disqualification screen';
        queueWhy(`The race frame asked for the garage (${why}); taking the whole page there.`);
        clearRaceNow();
        navigate('/garage');
        return true;
      }

      // El marco acabo en /login: ahi no hay carrera posible y desde dentro no
      // se puede entrar. Se lleva la ventana entera a la pantalla de login con el
      // motivo que ella ya sabe leer (#expired), asi el SSO se reintenta por el
      // camino de siempre y no se espera al vigilante de 4 minutos.
      if (data.__ntaNeedLogin === true) {
        const now = Date.now();
        if (now - lastNeedLoginAt < 10000) return true;
        lastNeedLoginAt = now;
        queueLog('The race frame landed on the login page: the session is gone; opening the login screen.');
        storeNotice('Session closed inside the race screen: opening the login page.');
        clearRelogin();
        navigate('/login#expired');
        return true;
      }

      // CAPTCHA visto DENTRO del marco. El barrido de la cola es del documento
      // de arriba, asi que sin este aviso el vigilante recargaba la pagina a los
      // 4 minutos justo mientras lo estabas resolviendo. Con la marca puesta,
      // la cola se queda quieta y lo deja en tus manos.
      if (data.__ntaCaptcha === true) {
        if (!captchaHandled) {
          captchaHandled = true;
          queueLog('CAPTCHA reported by the race frame: solve it by hand. The queue is paused.');
          storeNotice('CAPTCHA on the race screen: solve it by hand.');
          noteProgress();
        }
        return true;
      }

      return false;
    }

    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin) return;
      handleFrameMessage(event.data, event.source);
    });


    function handleModal(modalBody) {
      // El servidor de la carrera cerro la conexion. Si el aviso se pinta en
      // esta ventana, se toma su salida; el marco avisa por `__ntaNeedGarage`.
      if (looksLikeConnectionError(modalBody)) {
        const target = findButton((label) => label.includes('your garage'))
          || findButton((label) => label.includes('try again'));
        if (target) queuePress('connection', target);
        queueWhy('Lost the connection to the race server; going back to the garage.');
        return true;
      }

      if (modalBody.includes('currently in a race')) {
        const target = findButton((label) => label.includes('try again'))
          || findButton((label) => label.includes('your garage'));
        if (target) queuePress('modal', target);
        return true;
      }

      // Aviso del juego cuando sus ficheros no cargan. Antes no se reconocia:
      // el marco se quedaba muerto y la unica salida era que el vigilante
      // recargara la pagina a los 4 minutos.
      if (/game file failed to load|problem loading game files/i.test(modalBody)) {
        return handleAssetError();
      }

      return false;
    }

    function handleCaptcha(bodyText) {
      if (!bodyText.includes('captcha is not resolved')) return false;

      // Ya estamos donde hay que resolverlo: es cosa del humano.
      if (location.pathname === '/race') {
        if (!captchaHandled) {
          captchaHandled = true;
          queueLog('CAPTCHA on /race: solve it by hand. The queue is paused.');
        }
        return true;
      }

      if (captchaHandled) return true;
      captchaHandled = true;

      const now = Date.now();
      if (now - store.get('captchaAt', 0) < CONFIG.queue.captchaCooldownMs) {
        queueLog('Recent CAPTCHA: not redirecting again.');
        return true;
      }

      // El contador de intentos solo se borraba al ver «Validated! Play on.», y
      // esa pantalla navega sola en cuanto la pulsas: la cola muchas veces no
      // llega a verla y el contador se quedaba a tope. Entonces, en el CAPTCHA
      // siguiente (otro dia, misma pestana) se negaba a llevar la pagina a
      // /race —donde unico se puede resolver— sin nada que resolver delante.
      // Caduca con el tiempo, como el resto de contadores.
      const lastCaptchaAt = Number(store.get('captchaAt', 0)) || 0;
      let attempts = Number(store.get('captchaAttempts', 0)) || 0;
      if (attempts > 0 && now - lastCaptchaAt > CONFIG.queue.captchaAttemptsResetMs) {
        store.remove('captchaAttempts');
        store.remove('captchaAt');
        attempts = 0;
      }

      if (attempts >= CONFIG.queue.captchaMaxRedirects) {
        queueLog(`CAPTCHA: ${attempts} failed attempts. Leaving this to you.`);
        return true;
      }

      store.set('captchaAt', now);
      store.set('captchaAttempts', attempts + 1);
      noteFailure('captcha', `attempt ${attempts + 1}/${CONFIG.queue.captchaMaxRedirects} at /race`);
      queueLog(`CAPTCHA detected: going to /race (attempt ${attempts + 1}/${CONFIG.queue.captchaMaxRedirects}).`);
      navigate('/race');
      return true;
    }

    function handleRacePage() {
      // Solo cuenta si el modal se ve: un nodo oculto con el texto validado
      // mandaba a /garage y la cola volvia a /race en bucle.
      const validated = [...document.querySelectorAll('.tc-i')]
        .find((el) => /validated!\s*play on/i.test(el.textContent || '') && isVisible(el));

      if (validated) {
        store.remove('captchaAttempts');
        store.remove('captchaAt');
        queueWhy('CAPTCHA validated; going back to the garage.');
        navigate('/garage');
        return;
      }

      // El tipador esta vivo: la siguiente carrera la abre el, con sus
      // descansos. Aqui solo se le deja trabajar.
      if (typerOwnsRaces()) {
        // La carrera existe: el ultimo «Race Now» si funciono.
        // La carrera demuestra que «Race Now» si lleva a alguna parte: el
        // contador vuelve a cero sin preguntar cuanto valia.
        store.remove('raceNowBounces');
        store.remove('raceNowBounceAt');
        bounceNoted = false;
        // Y los ficheros del juego cargaron: el presupuesto del aviso vuelve a
        // cero, para que un fallo suelto de dentro de dos horas tenga los cuatro
        // intentos otra vez.
        if (store.get('assetFails', 0)) {
          store.remove('assetFails');
          store.remove('assetFailAt');
          assetWarned = false;
        }
        // Y si el sitio habia bloqueado la cuenta, esta carrera demuestra que el
        // castigo ya paso: la proxima espera vuelve a los 15 min de base.
        if (blockUntil()) {
          disk.remove(DQ_BLOCK_UNTIL);
          disk.remove(DQ_BLOCK_CHECKED_AT);
          disk.remove(DQ_BLOCK_STAGE);
        }
        bounceNoted = false;
        clearIdleTimer();
        clearContinue();
        return;
      }

      const button = findButton((label) => CONTINUE.has(label))
        || findButton((label) => /continue|race again|play again/.test(label));

      if (button && isArmed()) scheduleContinue(button);
      if (isArmed()) startIdleTimer();
    }

    function handleGaragePage() {
      if (!isArmed()) return;

      // Con el farmeo AFK se programa tambien en segundo plano; apagado, el
      // temporizador despertaria justo al volver y abriria una carrera sin manos.
      if (hiddenBlocked()) return;

      // Castigo por racha de DQ en curso: abrir otra carrera solo repite el
      // aviso y gasta un intento mas de los que el sitio cuenta.
      if (blockUntil() > Date.now()) return;

      // Fuera de la ventana de horas no se programa «Race Now». El latido de la
      // cola vuelve a pasar por aqui; al abrir, la carrera sale sola.
      const hours = activeGate();
      if (hours) {
        clearRaceNow();
        if (!activeClosedNoted) {
          activeClosedNoted = true;
          queueWhy(`Active hours: races resume at ${hours.nextText}.`);
          queueLog(`Active hours closed (${hours.label}); «Race Now» waits until ${hours.nextText}.`);
        }
        scheduleActiveResume();
        return;
      }
      if (activeClosedNoted) {
        activeClosedNoted = false;
        queueLog('Active hours open; the queue resumes.');
      }

      // «Race Now» que devuelve al garaje sin carrera (sesion caida, cuenta sin
      // acceso, servidor que lo rechaza): tras N vueltas se deja de pulsar en vez
      // de recargar la pagina en bucle.
      const bounces = raceNowBounces();
      // Con el contador caducado, el proximo rebote vuelve a avisar: si no, el
      // aviso se daba una vez por pagina y luego se paraba en silencio.
      if (!bounces) bounceNoted = false;
      if (bounces >= CONFIG.queue.raceNowBounceMax) {
        clearRaceNow();
        setArmed(false);
        if (!bounceNoted) {
          bounceNoted = true;
          noteFailure('race now', `came back to the garage ${bounces} times without a race`);
          queueLog(`«Race Now» came back to the garage without a race ${bounces} times: stopping. Check the session, then press Alt+A.`);
          storeNotice('Race Now is not sticking (session?): the queue stopped.');
          beep('block');
        }
        return;
      }

      // Hueco del tipador en curso (descanso normal, racha de DQ o guardia): no
      // se abre carrera hasta que termina. El tipador lo reanuda solo, pero su
      // marco no existe entre carreras: se lee tambien la copia guardada o el
      // garaje abriria una carrera en pleno descanso (DQ por inactividad).
      const state = typerState();
      if (state && state.breakUntil > Date.now()) return;
      if (savedBreakUntil()) return;

      // "Race Now" no se pulsa al aterrizar en el garaje: una persona mira la
      // pantalla un momento antes de abrir carrera. El retardo tambien cubre la
      // vuelta del aviso de sesion, que recarga la app y dejaba el encadenado
      // demasiado instantaneo.
      if (raceNowTimer) return;
      if (Date.now() < raceNowHoldUntil) return;
      if (Date.now() - (lastPress.raceNow || 0) < CONFIG.queue.raceNowCooldownMs) return;

      const button = findButton((label) => label === 'race now')
        || findButton((label) => label.includes('race now'));
      if (!button) return;

      // Otra pestaña puede haber tomado el lease entre el tick y este punto:
      // no se programa una carrera desde una copia en espera.
      if (!claimTabLease('race now')) return;

      const delay = humanDelay(CONFIG.queue.raceNowDelayMs);
      raceNowDelay = delay;
      raceNowAt = Date.now() + delay;
      raceNowTimer = later(() => {
        raceNowTimer = null;
        raceNowAt = 0;
        raceNowDelay = 0;
        if (!isArmed() || !button.isConnected) return;
        if (hiddenBlocked()) return;
        if (!claimTabLease('race now')) return;
        // Un clic que no llega a carrera cuenta: es la senal de que la sesion o
        // el servidor no dejan jugar y el garaje va a volver a la misma pagina.
        if (queuePress('raceNow', button)) {
          // Se suma sobre el contador ya caducado: si el ultimo rebote es viejo,
          // este empieza de uno en vez de arrastrar una racha que ya no aplica.
          store.set('raceNowBounces', raceNowBounces() + 1);
          store.set('raceNowBounceAt', Date.now());
        }
      }, delay);

      queueLog(`Garage: «Race Now» in ${(delay / 1000).toFixed(1)}s.`);
    }

    function clearRaceNow() {
      if (raceNowTimer) {
        clearLater(raceNowTimer);
        raceNowTimer = null;
      }
      raceNowAt = 0;
      raceNowDelay = 0;
    }

    // Cancelar desde el panel no apaga el bot: la cola sigue armada (y con ella
    // la Mystery Box), solo se retrasa este arranque. Pasado el margen vuelve a
    // ofrecerlo, asi que un clic de mas no deja el garaje mudo para siempre.
    function cancelRaceNow() {
      if (!raceNowTimer) return false;

      clearRaceNow();
      raceNowHoldUntil = Date.now() + CONFIG.queue.raceNowCancelHoldMs;
      // Cancelar es una accion tuya: si no contara como progreso, el vigilante
      // anti-atasco podia recargar la pagina para desatascar un bot que ya
      // estabas controlando tu.
      noteProgress();
      queueLog(`Garage: «Race Now» cancelled; the bot stays armed and offers it again in ${Math.round(CONFIG.queue.raceNowCancelHoldMs / 1000)} s.`);
      return true;
    }

    /* ---- Mystery Box (daily garage reward) ---- */

    // The site hands out one box roughly every 21 hours. When the garage is on
    // screen the box is claimed by clicking the site's own button, exactly like a
    // person would; while the bot is busy racing (no garage to click) the same
    // endpoint the site calls is used instead, so a long session does not miss the
    // day. Everything is scheduled from localStorage, so a reload cannot spam it.
    const BOX_NEXT = 'ntQueue:boxNextAt';
    const BOX_LAST = 'ntQueue:boxLastAt';
    const BOX_TRY = 'ntQueue:boxTriedAt';
    // Momento del ultimo intento fallido: un boton que el sitio dejo en el DOM
    // no se vuelve a pulsar en la misma pagina (era un bucle de "already
    // checked" cada 45 s), pero si en la siguiente visita.
    const BOX_FAIL = 'ntQueue:boxFailAt';

    let boxTimer = null;
    let boxCountdownLogged = null;   // ultimo rewardCountdown no creible ya avisado

    // Una reclamacion por linea: fecha y premio, para que el panel pueda decir
    // cuanto cayo la ultima vez sin abrir la consola.
    function boxRecord(text) {
      const entry = { at: Date.now(), text: String(text || 'reward received') };

      const saved = boxStore.get(BOX_STATE_LOG, []);
      const list = Array.isArray(saved) ? saved.filter((item) => item && item.at) : [];
      list.unshift(entry);
      boxStore.set(BOX_STATE_LOG, list.slice(0, 8));

      return entry;
    }

    // El premio lo dice el modal que abre el sitio; se lee antes de cerrarlo.
    // El modal de la caja, no el primero de la pagina: puede haber otro abierto
    // (aviso de sesion, DQ) y leer su texto daria un premio falso.
    function boxModal() {
      // Mismos selectores que modalText: si el sitio migra los modales a ARIA,
      // el aviso de sesion y la caja no pueden ver cosas distintas.
      const seen = new Set();
      for (const modal of document.querySelectorAll('.modal, [role="dialog"], [role="alertdialog"]')) {
        if (seen.has(modal)) continue;
        seen.add(modal);
        if (modal.closest('[hidden], [aria-hidden="true"]')) continue;
        // Un modal cerrado puede seguir en el DOM (el de la recompensa del garaje
        // nace con display:none): no se lee ni se cierra hasta que se ve.
        if (!isVisible(modal)) continue;
        const text = normalize(modal.innerText);
        // Un modal de error, DQ o sesion no es la caja: antes bastaba con que
        // dijera "error" o "reward" y se leia (y cerraba) el equivocado.
        if (/(disqualif|logout warning|session will expire|currently in a race)/i.test(text)) continue;
        if (/mystery|claim/i.test(text)) return modal;
        if (/reward/i.test(text) && /box|collect|checked/i.test(text)) return modal;
      }
      return null;
    }

    // Gancho de pruebas (inerte): deja comprobar que un modal de error no se
    // confunde con la caja sin abrir una caja real.
    window.__ntaDebug = window.__ntaDebug || {};
    window.__ntaDebug.boxModal = () => boxModal();
    window.__ntaDebug.boxStateText = () => boxStateText();
    window.__ntaDebug.boxWaitText = (ms) => boxWaitText(ms);

    function boxRewardFromModal() {
      const modal = boxModal();
      const text = modal ? normalize(modal.innerText) : '';
      if (!text) return '';

      const money = text.match(/\$[\d,]+/);
      if (money) return money[0];
      if (text.includes('nitro')) return 'nitros';
      if (/car|vehicle/.test(text)) return 'car';
      return '';
    }

    // localStorage on purpose, not the sessionStorage `store` above: the panel
    // lives inside the race frame and shares localStorage with this window.
    const boxStore = {
      get(key, fallback) {
        try {
          const raw = localStorage.getItem(key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch {
          return fallback;
        }
      },
      set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
      },
    };

    function boxDue() {
      const now = Date.now();

      // El perfil del sitio manda: `rewardCountdown` es la hora (epoch, en
      // segundos) en la que la caja vuelve a estar lista. Si aun falta, no se
      // toca; si ya paso, no se espera a la estimacion local.
      const profile = siteUser();
      const countdownRaw = Number(profile && profile.rewardCountdown);
      const site = countdownRaw > 0
        ? boxWaitFromNext(countdownRaw, CONFIG.mysteryBox.retryAfterMs, { pastMeansReady: true, epochOnly: true })
        : null;
      // Un valor no creible se avisa una vez por valor crudo, no en cada latido.
      if (site && site.bad && site.bad !== 'past' && boxCountdownLogged !== countdownRaw) {
        boxCountdownLogged = countdownRaw;
        queueLog(`Mystery Box: rewardCountdown ${site.bad} (${JSON.stringify(countdownRaw)}); ignoring it.`);
      }
      // Solo bloquea un epoch creible: el respaldo de `boxWaitFromNext` no es
      // una espera real que deba repetirse en cada latido.
      if (site && !site.bad && site.wait > 0) return false;
      if (now - (Number(boxStore.get(BOX_TRY, 0)) || 0) < CONFIG.mysteryBox.minGapMs) return false;

      // Un reclamo pedido a mano (o la vuelta al garaje ya decidida) salta la
      // estimacion local, no lo que dice el propio sitio: la cuenta atras de
      // `rewardCountdown` se respeta siempre.
      if (boxForcePending()) return true;

      const next = Number(boxStore.get(BOX_NEXT, 0)) || 0;
      // Una fecha local absurdamente lejana (una version anterior sumaba los
      // segundos epoch al reloj) no debe bloquear la caja para siempre.
      if (next > now && next <= now + CONFIG.mysteryBox.retryAfterMs + 3600000) return false;
      return true;
    }

    function boxSchedule(ms) {
      boxStore.set(BOX_NEXT, Date.now() + ms);
    }

    // Un intento = una linea en consola + el objeto que lee diagnosticReport
    // (campo `box.attempt`). `next` se guarda crudo, como llego del sitio.
    function boxAttempt(entry) {
      const at = Date.now();
      const scheduledAt = Number(entry.scheduledAt) || 0;
      const reward = entry.reward === true ? true : entry.reward === false ? false : null;
      const record = {
        at,
        via: entry.via || null,
        status: entry.status == null ? null : Number(entry.status),
        reward,
        next: entry.next === undefined ? null : entry.next,
        scheduledAt: scheduledAt || null,
        reason: entry.reason || null,
        detail: entry.detail || null,
      };

      const line = [
        `via=${record.via || 'n/a'}`,
        `status=${record.status == null ? 'n/a' : record.status}`,
        `reward=${reward == null ? 'n/a' : String(reward)}`,
        `next=${record.next == null ? 'n/a' : JSON.stringify(record.next)}`,
        `scheduled=${scheduledAt ? new Date(scheduledAt).toISOString() : 'n/a'}`,
        record.reason ? `reason=${record.reason}` : '',
        record.detail ? `detail=${record.detail}` : '',
      ].filter(Boolean).join(' · ');
      queueLog(`Mystery Box attempt: ${line}`);

      try { localStorage.setItem(BOX_STATE_DIAG, JSON.stringify(record)); } catch { /* storage blocked */ }
      return record;
    }

    // Markup actual del garaje (ga.js): la caja lista lleva `.mysteryBox.is-here`
    // y su boton es un `.btn` con el texto "Claim Now!" dentro de
    // `.mysteryBox-action`; `.mysteryBox-btn.is-disabled` es el contador, no se
    // pulsa. El selector viejo (`button.mysteryBox-btn:not(.is-disabled)`) ya no
    // existe en el sitio, y por eso la caja no se reclamaba nunca sola.
    function boxButton() {
      const selectors = [
        '.mysteryBox.is-here .mysteryBox-action button',
        '.mysteryBox.is-here button',
        'button.mysteryBox-btn:not(.is-disabled)',
      ];

      for (const selector of selectors) {
        const button = document.querySelector(selector);
        if (button && usable(button)) return button;
      }

      // El sitio tambien ofrece la caja en el menu del jugador: se acepta un
      // boton visible de reclamar dentro de la cabecera, un menu o la propia
      // caja, pero no un "claim" suelto de otra tarjeta.
      const claimLabel = /^(claim( now| box| reward| the box)?!?|open box)$/;
      const scope = 'header, nav, [role="menu"], [class*="menu"], [class*="Menu"], '
        + '[class*="dropdown"], [class*="Dropdown"], [class*="mystery"], [class*="Mystery"]';
      for (const el of document.querySelectorAll('button, a, [role="button"]')) {
        if (!claimLabel.test(normalize(el.textContent))) continue;
        if (!el.closest(scope)) continue;
        if (el.closest('.mysteryBox.is-coming, .is-disabled')) continue;
        if (usable(el)) return el;
      }

      // Ultimo recurso: si el sitio cambia la clase de la tarjeta, se busca un
      // contenedor visible con el texto de la caja y se pulsa su boton. Se
      // limita el tamano para no confundir la pagina entera con la tarjeta.
      const claimText = /^(claim( now| box| reward| the box)?!?|open box)$/i;
      for (const card of document.querySelectorAll('[class*="mystery" i], [class*="reward" i], [class*="daily" i], [id*="mystery" i], [id*="reward" i]')) {
        if (card.closest('.is-coming, .is-disabled')) continue;
        if (!isVisible(card)) continue;
        const rect = card.getBoundingClientRect();
        if (rect.width < 80 || rect.height < 30 || rect.width > 900 || rect.height > 600) continue;
        const text = normalize(card.textContent);
        if (!/mystery box/i.test(text) || !/claim|open/i.test(text)) continue;
        for (const el of card.querySelectorAll('button, a, [role="button"]')) {
          if (!claimText.test(normalize(el.textContent))) continue;
          if (usable(el)) return el;
        }
      }
      return null;
    }

    function boxBanner() {
      const el = document.querySelector('.mysteryBox-arrival');
      return el ? normalize(el.textContent) : '';
    }

    function boxRewardText(reward) {
      if (!reward) return 'reward received';
      if (reward.type === 'money') return `$${Number(reward.value).toLocaleString()}`;
      if (reward.type === 'nitros') return `${Number(reward.value).toLocaleString()} nitros`;
      if (reward.type === 'car') return `car #${reward.value}`;
      return String(reward.type || 'reward received');
    }

    function boxCloseModal(root) {
      for (const el of (root || document).querySelectorAll('button, a')) {
        if (normalize(el.textContent) === 'close' && usable(el)) return el;
      }
      return null;
    }

    // La caja se puede reclamar aunque la cola no este armada: es el premio
    // diario del garaje, no una carrera, y no escribe nada. `requireArmed` lo
    // vuelve a exigir si se activa en CONFIG.
    function claimBoxByClick(button) {
      // El boton del panel llama aqui directamente: si la cola ya tiene un
      // intento en marcha, el segundo temporizador pisaria al primero.
      if (boxTimer) return;

      const delay = humanDelay(CONFIG.mysteryBox.delayMs);

      boxTimer = later(() => {
        boxTimer = null;
        if (!button.isConnected) {
          const wait = CONFIG.mysteryBox.retryAfterErrorMs;
          boxSchedule(wait);
          boxStore.set(BOX_FAIL, Date.now());
          setBoxForce(false);
          boxAttempt({
            via: 'click', status: null, reward: null, next: null,
            scheduledAt: Date.now() + wait,
            reason: 'markup: claim button disappeared before pressing',
          });
          return;
        }

        boxStore.set(BOX_TRY, Date.now());
        dispatchClick(button);

        // The site answers with a reward modal: it is read and closed the way a
        // player would, a moment later, so the queue can go back to racing.
        const closeDelay = humanDelay(CONFIG.mysteryBox.closeDelayMs);
        boxTimer = later(() => {
          boxTimer = null;
          const modal = boxModal();
          const text = modal ? normalize(modal.textContent) : '';

          if (!modal) {
            const wait = CONFIG.mysteryBox.retryAfterErrorMs;
            boxSchedule(wait);
            boxStore.set(BOX_FAIL, Date.now());
            setBoxForce(false);
            boxAttempt({
              via: 'click', status: null, reward: null, next: null,
              scheduledAt: Date.now() + wait,
              reason: 'modal: none after clicking Claim Now!',
            });
            storeNotice('Mystery Box: no answer from the site; trying later.');
            return;
          }

          const close = boxCloseModal(modal);

          // El sitio contesta con un modal de error si la caja ya no estaba:
          // entonces no se cuenta ni se bloquea 21 h.
          if (/already checked|there was an error|try again/i.test(text)) {
            if (close) dispatchClick(close);
            boxStore.set(BOX_FAIL, Date.now());
            setBoxVisit(false);
            setBoxForce(false);
            const wait = CONFIG.mysteryBox.retryAfterErrorMs;
            boxSchedule(wait);
            boxAttempt({
              via: 'click', status: null, reward: false, next: null,
              scheduledAt: Date.now() + wait,
              reason: `modal: ${text.slice(0, 90) || 'error'}`,
            });
            storeNotice('Mystery Box: not claimed this time.');
            return;
          }

          const reward = boxRewardFromModal();
          if (close) dispatchClick(close);

          // El sitio actualiza su propio `rewardCountdown` al reclamar; se lee
          // sin cache para programar con su dato, no con una estimacion.
          const profile = siteUser(0);
          const rawNext = Number(profile && profile.rewardCountdown) || 0;
          const next = rawNext > 0
            ? boxWaitFromNext(rawNext, CONFIG.mysteryBox.retryAfterMs, { epochOnly: true })
            : { wait: CONFIG.mysteryBox.retryAfterMs, raw: null, bad: 'missing' };

          boxStore.set(BOX_LAST, Date.now());
          boxStore.set(BOX_FAIL, 0);
          boxStore.set(BOX_STATE_READY, 0);
          setBoxVisit(false);
          setBoxForce(false);
          boxSchedule(next.wait);
          todayBump({ boxes: 1 });
          const entry = boxRecord(reward || 'claimed');
          boxAttempt({
            via: 'click', status: null, reward: true,
            next: rawNext || null,
            scheduledAt: Date.now() + next.wait,
            reason: next.bad ? `rewardCountdown ${next.bad}; fallback` : null,
            detail: entry.text,
          });
          storeNotice(`Mystery Box: ${entry.text}.`);
        }, closeDelay);
      }, delay);
    }

    // The site's own call: GET /api/v2/rewards/daily. The site adds the bearer
    // token and x-uid only when `player_token` exists; without it the session
    // still travels in cookies (ClassLink/SSO), so the request is made anyway.
    async function claimBoxByApi(origin = '') {
      const token = readToken();
      const note = origin ? `${origin}; ` : '';
      const headers = {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        const claims = jwtClaims(token);
        if (claims && claims.sub) headers['x-uid'] = String(claims.sub);
      }

      try {
        const response = await fetch('/api/v2/rewards/daily', { method: 'GET', credentials: 'include', headers });
        const status = response.status;
        if (response.ok) {
          let body = null;
          try { body = await response.json(); } catch { /* 200 without a body */ }

          // El sitio resuelve `data` (o `results`) y exige `reward: true` para
          // darlo por bueno; un 200 sin premio significa "todavia no".
          const data = (body && (body.data || body.results)) || body || null;
          const rawNext = data && data.next !== undefined
            ? data.next
            : (body ? body.next : null);

          if (!data || data.reward !== true) {
            const wait = CONFIG.mysteryBox.readyCheckMs;
            boxSchedule(wait);
            boxStore.set(BOX_FAIL, Date.now());
            boxAttempt({
              via: 'api', status, reward: false, next: rawNext,
              scheduledAt: Date.now() + wait,
              reason: `${note}HTTP ${status} without reward:true`,
            });
            // La visita ya se hizo: la API contesto, aunque no hubiera premio.
            // Si la marca se queda puesta, el tipador retiene "Race Again" y la
            // cola vuelve al garaje tras CADA carrera durante 15 min a por una
            // caja que no esta.
            setBoxVisit(false);
            return false;
          }

          boxStore.set(BOX_LAST, Date.now());
          boxStore.set(BOX_FAIL, 0);
          boxStore.set(BOX_STATE_READY, 0);
          setBoxVisit(false);
          setBoxForce(false);
          const next = boxWaitFromNext(rawNext, CONFIG.mysteryBox.retryAfterMs);
          boxSchedule(next.wait);
          todayBump({ boxes: 1 });
          const entry = boxRecord(boxRewardText(data));
          boxAttempt({
            via: 'api', status, reward: true, next: rawNext,
            scheduledAt: Date.now() + next.wait,
            reason: [note.trim(), next.bad ? `next ${next.bad}; fallback` : ''].filter(Boolean).join(' ') || null,
            detail: entry.text,
          });
          storeNotice(`Mystery Box claimed (${entry.text}).`);
          return true;
        }

        // 429 means the site is holding the box back; anything else (403 with a
        // stale token, 5xx...) is worth one more attempt later, never a loop.
        if (status === 429) {
          const wait = CONFIG.mysteryBox.retryAfterMs + 10800000;
          boxSchedule(wait);
          boxAttempt({
            via: 'api', status, reward: null, next: null,
            scheduledAt: Date.now() + wait,
            reason: `${note}HTTP 429`,
          });
        } else {
          const wait = CONFIG.mysteryBox.retryAfterErrorMs;
          boxSchedule(wait);
          boxStore.set(BOX_FAIL, Date.now());
          const cookieNote = !token && (status === 401 || status === 403)
            ? 'no player_token and cookie session refused; '
            : '';
          boxAttempt({
            via: 'api', status, reward: null, next: null,
            scheduledAt: Date.now() + wait,
            reason: `${note}${cookieNote}HTTP ${status}`,
          });
        }
        // Igual que arriba: el intento quedo saldado y no hay que seguir
        // reteniendo el arranque de carreras por una visita que ya ocurrio.
        setBoxVisit(false);
        return false;
      } catch (error) {
        const wait = CONFIG.mysteryBox.retryAfterErrorMs;
        boxSchedule(wait);
        boxStore.set(BOX_FAIL, Date.now());
        boxAttempt({
          via: 'api', status: null, reward: null, next: null,
          scheduledAt: Date.now() + wait,
          reason: `${note}network: ${error && error.message ? error.message : 'unknown'}`,
        });
        setBoxVisit(false);
        return false;
      }
    }

    // @returns {boolean} true while the box is being handled, so the queue does
    // not press "Race Now" in the same breath.
    function handleMysteryBox() {
      if (!CONFIG.mysteryBox.enabled) return false;
      // Interruptor explicito: por defecto la caja se reclama aunque el bot no
      // este armado; con requireArmed = true vuelve a exigir cola armada.
      if (CONFIG.mysteryBox.requireArmed && !isArmed()) return false;
      // En /login no hay sesion util: pedir el premio solo gasta un intento.
      if (location.pathname === '/login' || location.pathname.startsWith('/login/')) return false;
      // Invitado: la API contestaria 401 y el boton del garaje no existe.
      if (!signedIn()) return false;
      if (boxTimer) return true;

      // El boton del sitio manda sobre la estimacion local: un intento fallido
      // dejaba 30 min (o 21 h) de espera con la caja ahi delante. Pero el boton
      // puede seguir en el DOM un momento despues de reclamar, asi que este
      // camino respeta el mismo respiro minimo que el resto.
      const button = boxButton();
      if (button) {
        const now = Date.now();
        const lastTry = Number(boxStore.get(BOX_TRY, 0)) || 0;
        const lastClaim = Number(boxStore.get(BOX_LAST, 0)) || 0;
        if (now - Math.max(lastTry, lastClaim) < CONFIG.mysteryBox.minGapMs) return false;
        // Una tarjeta que sobrevive a la reclamacion (el sitio tarda en
        // repintarla) no es una caja nueva: sin esto se volvia a pulsar a los
        // 45 s y el sitio contestaba "already checked" todo el dia.
        if (lastClaim && now - lastClaim < CONFIG.mysteryBox.claimSettleMs) return false;
        // Un intento fallido en esta misma pagina ya tiene respuesta del sitio;
        // la siguiente visita lo vuelve a probar y el boton del panel lo fuerza.
        const lastFail = Number(boxStore.get(BOX_FAIL, 0)) || 0;
        if (lastFail > 0 && lastFail >= PAGE_AT && !boxForcePending()) return false;

        if (!claimTabLease('mystery box')) return false;
        boxStore.set(BOX_TRY, now);
        setBoxVisit(false);
        setBoxForce(false);
        claimBoxByClick(button);
        return true;
      }

      const state = typerState();
      // Solo vale un estado fresco: la pantalla de resultados se convierte en la
      // carrera siguiente en cuanto el tipador pulsa, y navegar a mitad de una
      // cuenta atras seria una DQ regalada.
      const fresh = Boolean(state) && Date.now() - (Number(state.at) || 0) < 2000;
      const racing = Boolean(fresh && !state.stopped && state.typing);
      const results = Boolean(fresh && !state.stopped && !state.typing && state.chars > 0);
      const onGarage = location.pathname === '/garage' || location.pathname.startsWith('/garage/');
      const wantGarage = boxVisitPending() || boxDue();

      // Carrera viva: la unica via que no abandona la carrera es la API. Se deja
      // ademas la marca de vuelta, porque el boton de verdad esta en el garaje.
      if (racing) {
        if (!boxDue()) return false;
        if (!claimTabLease('mystery box')) return false;
        setBoxVisit(true);
        boxStore.set(BOX_TRY, Date.now());
        if (CONFIG.mysteryBox.apiFallback) claimBoxByApi();
        return true;
      }

      // Fuera de la carrera la caja se reclama donde el sitio la pone: el
      // garaje. Si el bot esta en la home (o en los resultados, que van a abrir
      // otra carrera), se va alli, en vez de esperar a que la API quiera.
      if (wantGarage && !onGarage && (results || !state)) {
        if (!claimTabLease('mystery box')) return false;
        setBoxForce(true);
        setBoxVisit(true);
        queueWhy('Mystery Box is ready: going to the garage to claim it.');
        navigate('/garage');
        return true;
      }

      // Una carrera viva sin resultados (el bot esta parado a mitad) no se
      // abandona por la caja: navegar ahi seria una descalificacion regalada.
      if (state && !results) return false;

      if (!boxDue()) {
        setBoxForce(false);
        return false;
      }

      if (!claimTabLease('mystery box')) return false;
      boxStore.set(BOX_TRY, Date.now());

      // Caja marcada como lista pero sin un boton reconocible (markup nuevo):
      // la API del sitio sigue siendo una via valida para no perder el premio.
      if (document.querySelector('.mysteryBox.is-here')) {
        if (CONFIG.mysteryBox.apiFallback) {
          claimBoxByApi('markup: claim button not recognized');
        } else {
          const wait = CONFIG.mysteryBox.readyCheckMs;
          boxSchedule(wait);
          boxAttempt({
            via: 'click', status: null, reward: null, next: null,
            scheduledAt: Date.now() + wait,
            reason: 'markup: claim button not recognized',
          });
        }
        return false;
      }

      // Garage on screen with the box still on cooldown: read its banner and come
      // back later instead of hammering the page. El sitio acaba de decir que no
      // toca, asi que un reclamo a mano tampoco tiene nada que pulsar.
      if (document.querySelector('.mysteryBox')) {
        const banner = boxBanner();
        boxSchedule(CONFIG.mysteryBox.readyCheckMs);
        setBoxVisit(false);
        setBoxForce(false);
        queueLog(`Mystery Box: not ready yet${banner ? ` (${banner})` : ''}.`);
        return false;
      }

      // Peticion lanzada: se toma como tarea hecha para que este mismo latido
      // no abra ademas una carrera con el premio en el aire (el siguiente, ya
      // con el intento apuntado, deja paso al garaje).
      if (CONFIG.mysteryBox.apiFallback) {
        claimBoxByApi();
        return true;
      }
      return false;
    }

    /* ---- panel del garaje ---- */

    // El tipador vive dentro del iframe de la carrera, asi que en el garaje (que
    // es donde esta la Mystery Box) no habia ni panel ni forma de saber si la
    // cola estaba viva: la caja parecia no reclamarse nunca. Este panel pequeno
    // vive en la ventana de arriba, solo en la home y el garaje, y da lo justo:
    // estado, estado de la caja y los dos botones que se usan aqui.
    const QPANEL_ID = 'nt-queue-panel';

    let qpanel = null;
    let garageAutoDone = false;

    // El tipador deja esta marca al pararse a proposito (tope de la tanda, Esc).
    // El garaje la respeta: abrir una carrera solo para que nadie escriba es una
    // descalificacion por inactividad regalada. Caduca sola y el MODE la borra.
    // La clave es la misma STOP_MARK del tipador (una sola constante).
    function stoppedInfo() {
      try {
        const saved = JSON.parse(localStorage.getItem(STOP_MARK) || 'null');
        if (!saved || !Number.isFinite(saved.at)) return null;
        // Una parada vieja por la pantalla de resultados no debe retener la
        // cola durante horas: ese fallo ya se resuelve yendo al garaje.
        if (/results page will not open another race/i.test(saved.reason || '')
          && Number(saved.holdMs) > 2 * 60000) {
          saved.holdMs = 2 * 60000;
        }
        return saved;
      } catch {
        return null;
      }
    }

    function stoppedRecently() {
      const saved = stoppedInfo();
      if (!saved) return false;
      // Una parada de emergencia (racha de DQ) trae su propia retencion: mas
      // larga que la de un tope normal, para no reanudar sola en mitad de una
      // ausencia y regalar la quinta DQ.
      const hold = Math.min(Number(saved.holdMs) || 0, 24 * 3600000) || CONFIG.queue.stopHoldMs;
      return Date.now() - saved.at < hold;
    }

    function shortWait(ms) {
      const min = Math.max(0, Math.round(ms / 60000));
      if (min < 1) return 'less than a minute';
      if (min < 60) return `${min} min`;
      return `${Math.round(min / 60)} h`;
    }

    function boxStateText() {
      if (!CONFIG.mysteryBox.enabled) return 'off in settings';
      if (boxTimer) return 'claiming…';

      const now = Date.now();
      const next = Number(boxStore.get(BOX_NEXT, 0)) || 0;
      const last = Number(boxStore.get(BOX_LAST, 0)) || 0;
      const fail = Number(boxStore.get(BOX_FAIL, 0)) || 0;

      // Lo que acaba de pasar manda sobre una tarjeta que el sitio aun no ha
      // repintado.
      if (last && now - last < CONFIG.mysteryBox.claimSettleMs) return 'claimed just now';
      // Un fallo de esta pagina tiene su propia espera; no se disfraza de listo.
      if (fail > 0 && fail >= PAGE_AT && now - fail < CONFIG.mysteryBox.retryAfterErrorMs) {
        return `retry in ${boxWaitText(CONFIG.mysteryBox.retryAfterErrorMs - (now - fail))}`;
      }

      // La tarjeta visible es la verdad del garaje: si dice "Claim Now!", la
      // caja esta lista aunque `rewardCountdown` o `boxNextAt` sean viejos.
      if (boxButton()) return 'ready now';

      // Sin tarjeta, el epoch del sitio es la mejor cuenta atras; el respaldo
      // local se etiqueta como "check" para no confundirlo con la caja real.
      const profile = siteUser();
      const countdownRaw = Number(profile && profile.rewardCountdown);
      const site = countdownRaw > 0
        ? boxWaitFromNext(countdownRaw, CONFIG.mysteryBox.retryAfterMs, { pastMeansReady: true, epochOnly: true })
        : null;
      const siteWait = site && !site.bad ? site.wait : 0;
      if (siteWait > 0) return `in ${boxWaitText(siteWait)}`;
      if (site && !site.bad) return 'ready now';
      // Una fecha local absurda (version anterior) no se pinta como un siglo.
      if (next > now && next <= now + CONFIG.mysteryBox.retryAfterMs + 3600000) {
        return `check in ${boxWaitText(next - now)}`;
      }
      if (last) return `claimed ${boxWaitText(now - last)} ago`;
      if (document.querySelector('.mysteryBox')) return 'not ready yet';
      return 'waiting for the garage';
    }

    function raceNowText() {
      // La cuenta atras es la respuesta a "por que se ha abierto una carrera de
      // repente": se ve el segundo exacto y se puede cancelar sin tocar el MODE.
      if (raceNowTimer) {
        const left = Math.max(0, Math.ceil((raceNowAt - Date.now()) / 1000));
        return left > 0 ? `in ${left} s` : 'pressing…';
      }
      if (Date.now() < raceNowHoldUntil) {
        return `cancelled · ${Math.max(1, Math.ceil((raceNowHoldUntil - Date.now()) / 1000))} s`;
      }
      if (!isArmed()) return 'waiting';
      if (findButton((label) => label.includes('race now'))) return 'ready';
      return '—';
    }

    // Se puede arrastrar (y doble clic la devuelve a su esquina): el garaje tiene
    // su propio chat y su publicidad abajo a la derecha.
    const QPANEL_POS = 'ntQueue:garagePanelPos';

    function placeQPanel(left, top) {
      const maxLeft = Math.max(8, innerWidth - 288);
      const maxTop = Math.max(8, innerHeight - 70);
      qpanel.host.style.left = `${clamp(left, 8, maxLeft)}px`;
      qpanel.host.style.top = `${clamp(top, 8, maxTop)}px`;
      qpanel.host.style.right = 'auto';
      qpanel.host.style.bottom = 'auto';
    }

    function restoreQPanel() {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(QPANEL_POS) || 'null'); } catch { saved = null; }
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        placeQPanel(saved.left, saved.top);
      }
    }

    function dragQPanel(handle) {
      let dragging = false;
      let offsetX = 0;
      let offsetY = 0;

      handle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || (event.target.closest && event.target.closest('button'))) return;

        const rect = qpanel.host.getBoundingClientRect();
        dragging = true;
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        placeQPanel(rect.left, rect.top);
        try { handle.setPointerCapture?.(event.pointerId); } catch { /* puntero sintetico */ }
        handle.style.cursor = 'grabbing';
        event.preventDefault();
      });

      handle.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        placeQPanel(event.clientX - offsetX, event.clientY - offsetY);
      });

      const stop = () => {
        if (!dragging) return;
        dragging = false;
        handle.style.cursor = 'grab';
        try {
          localStorage.setItem(QPANEL_POS, JSON.stringify({
            left: parseFloat(qpanel.host.style.left) || 0,
            top: parseFloat(qpanel.host.style.top) || 0,
          }));
        } catch { /* almacenamiento bloqueado */ }
      };

      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);

      handle.addEventListener('dblclick', () => {
        try { localStorage.removeItem(QPANEL_POS); } catch { /* bloqueado */ }
        qpanel.host.style.left = 'auto';
        qpanel.host.style.top = 'auto';
        qpanel.host.style.right = '16px';
        qpanel.host.style.bottom = '16px';
      });
    }

    // Plegar no es ocultar el panel: la cabecera, el LED y el chip AUTO se
    // quedan a la vista; solo se van las filas y los botones. El estado viaja a
    // localStorage para que el garaje no vuelva a abrirse entero en cada visita.
    function applyGarageFold(folded, options = {}) {
      const next = Boolean(folded);
      if (options.persist !== false) disk.set(KEYS.garageFolded, next ? '1' : '0');
      if (!qpanel) return next;

      qpanel.panel.dataset.fold = next ? '1' : '0';
      qpanel.fold.textContent = next ? '+' : '−';
      qpanel.fold.setAttribute('aria-expanded', next ? 'false' : 'true');
      qpanel.fold.setAttribute('aria-label', next ? 'Unfold the garage panel' : 'Fold the garage panel');
      qpanel.fold.title = next ? 'Unfold the garage panel (Alt+G)' : 'Fold the garage panel (Alt+G)';
      return next;
    }

    function toggleGarageFold() {
      if (!qpanel) return false;
      applyGarageFold(qpanel.panel.dataset.fold !== '1');
      return true;
    }

    function buildGaragePanel() {
      registerThemeProperties();
      const host = document.createElement('div');
      host.id = QPANEL_ID;
      host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;';
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <style>
          * { box-sizing: border-box; }

          /* La misma piel que el panel grande: carbon con un verde de fondo,
             lineas de un pixel, numeros en mono y un filo de luz arriba. Los dos
             paneles se reconocen como la misma herramienta. */
          .p {
            --acc: #35ea86;
            --acc-2: #9bf7c5;
            --acc-dim: color-mix(in srgb, var(--acc) 14%, transparent);
            --line: color-mix(in srgb, var(--acc) 12%, transparent);
            --line-strong: color-mix(in srgb, var(--acc) 26%, transparent);
            --ink: #e9f7ef;
            --ink-2: #cfe9db;
            --dim: #8ea49a;
            --dim-2: #7f9389;
            --warn: #ffb340;
            --bad: #ff6f6f;
            --info: #63c8ff;
            --bg-hi: rgba(12, 17, 14, .985);
            --bg-lo: rgba(5, 8, 6, .995);
            position: relative;
            width: 292px;
            max-width: calc(100vw - 32px);
            border-radius: 14px;
            overflow: hidden;
            color: var(--ink);
            background:
              repeating-linear-gradient(0deg, rgba(255, 255, 255, .014) 0 1px, transparent 1px 3px),
              radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--acc) 10%, transparent), transparent 58%),
            radial-gradient(90% 80% at 100% 100%, color-mix(in srgb, var(--acc-2) 8%, transparent), transparent 62%),
              linear-gradient(168deg, var(--bg-hi), var(--bg-lo));
            border: 1px solid var(--line-strong);
            box-shadow:
              0 22px 44px -18px rgba(0, 0, 0, .85),
              0 0 0 1px rgba(0, 0, 0, .6),
              0 0 34px -14px color-mix(in srgb, var(--acc) 50%, transparent),
              inset 0 1px 0 rgba(255, 255, 255, .05);
            font: 12px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif;
            font-variant-numeric: tabular-nums;
            color-scheme: dark;
            animation: nt-qp-boot .4s cubic-bezier(.2, .9, .25, 1) both;
          }
          @keyframes nt-qp-boot {
            from { opacity: 0; transform: translateY(8px) scale(.985); }
            to   { opacity: 1; transform: none; }
          }

          .h { position: relative; display: flex; align-items: center; gap: 9px; padding: 11px 12px 9px;
               cursor: grab; user-select: none; touch-action: none;
               background: linear-gradient(180deg, rgba(255, 255, 255, .025), transparent);
               border-bottom: 1px solid var(--line);
               transition: background .15s ease; }
          .h::after {
            content: '';
            position: absolute;
            left: 12px; right: 12px; bottom: -1px; height: 1px;
            background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--acc) 55%, transparent), transparent);
            pointer-events: none;
          }
          .h:hover { background: rgba(255, 255, 255, .035); }
          .h:active { cursor: grabbing; }
          /* Plegado: la cabecera queda como una pastilla y el garaje recupera
             la pantalla. El estado se guarda, no se pierde al recargar. */
          .p[data-fold="1"] .rows,
          .p[data-fold="1"] .season,
          .p[data-fold="1"] .why,
          .p[data-fold="1"] .acts { display: none; }
          .p[data-fold="1"] .h { border-bottom-color: transparent; }
          /* Social view: no queue controls and no rows that suggest an action.
             The five read-only rows are the whole panel on /friends and /team. */
          .p[data-social="1"] .rows > .r:not(.social),
          .p[data-social="1"] .season,
          .p[data-social="1"] .why,
          .p[data-social="1"] .acts { display: none; }

          .dot { flex: none; width: 8px; height: 8px; border-radius: 50%;
                 background: var(--dim-2); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dim-2) 14%, transparent);
                 transition: background .25s ease, box-shadow .25s ease; }
          /* El LED dice si corre o espera; el chip ya no tiene estado OFF. */
          .p[data-armed="1"] .dot { background: var(--acc);
                 box-shadow: 0 0 0 3px var(--acc-dim), 0 0 12px color-mix(in srgb, var(--acc) 80%, transparent); }
          .p[data-armed="0"] .dot { background: var(--warn);
                 box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 16%, transparent), 0 0 12px color-mix(in srgb, var(--warn) 60%, transparent); }

          .t { display: block; font-weight: 800; font-size: 12px; line-height: 1.15;
               letter-spacing: .13em; text-transform: uppercase; color: var(--ink);
               text-shadow: 0 0 14px color-mix(in srgb, var(--acc) 35%, transparent); }
          .s { display: block; margin-top: 3px; font-weight: 600; font-size: 8px;
               line-height: 1; letter-spacing: .13em; text-transform: uppercase;
               color: var(--dim-2); }

          .mode { margin-left: auto; flex: none; padding: 5px 10px; border-radius: 999px;
                  cursor: default;
                  font: 800 9px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif;
                  letter-spacing: .1em; text-transform: uppercase;
                  color: var(--acc-2); background: var(--acc-dim);
                  border: 1px solid color-mix(in srgb, var(--acc) 30%, transparent);
                  transition: color .2s ease, background .2s ease, border-color .2s ease; }
          .upd { all: unset; flex: none; cursor: pointer; padding: 4px 7px; border-radius: 7px;
                 font: 800 8px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif;
                 letter-spacing: .08em; text-transform: uppercase; color: #20160a;
                 background: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 70%, #fff 30%);
                 box-shadow: 0 0 12px -4px var(--warn); }
          .upd[hidden] { display: none; }
          .upd:hover { filter: brightness(1.08); }
          .upd:focus-visible { outline: 2px solid var(--warn); outline-offset: 2px; }
          .fold { all: unset; flex: none; display: grid; place-items: center;
                  width: 22px; height: 22px; border-radius: 7px; cursor: pointer;
                  font: 800 13px/1 ui-monospace, monospace; color: var(--dim);
                  background: rgba(255, 255, 255, .04); border: 1px solid var(--line);
                  transition: color .15s ease, background .15s ease, border-color .15s ease, transform .12s ease; }
          .fold:hover { color: var(--acc-2); background: var(--acc-dim); border-color: var(--line-strong); }
          .fold:active { transform: scale(.92); }
          .fold:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }

          .rows { display: grid; padding: 8px 12px 6px; }
          .r { display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
               padding: 3px 0; font-weight: 500; font-size: 10.5px; line-height: 1.45;
               color: var(--dim); border-bottom: 1px solid rgba(255, 255, 255, .03); }
          .r:last-child { border-bottom: 0; }
          .r > span { flex: 0 0 auto; letter-spacing: .05em; }
          /* El valor puede ser largo ("next check in 21 h"): se le deja encoger y
             partir en dos lineas en vez de salirse por el borde del panel. */
          .r b { flex: 1 1 auto; min-width: 0; font: 600 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                 font-variant-numeric: tabular-nums; color: var(--ink-2); text-align: right;
                 overflow-wrap: break-word; }
          .r b.race { cursor: pointer; }
          .r b.race[data-cancel="1"] { color: var(--warn); text-decoration: underline dotted; }
          /* La cuenta atras de Race Now, dibujada sobre el borde de la fila:
             dice cuanto falta sin añadir otra barra ni otro numero. */
          .r[data-f="raceRow"] { position: relative; }
          .r[data-f="raceRow"]::after {
            content: '';
            position: absolute;
            left: 0; bottom: -1px; height: 1px;
            width: calc(var(--race-progress, 0) * 1%);
            background: linear-gradient(90deg, transparent, var(--acc));
            box-shadow: 0 0 8px color-mix(in srgb, var(--acc) 60%, transparent);
            pointer-events: none;
            transition: width .2s linear;
          }
          .r[hidden] { display: none; }
          .r b[data-warn="1"] { color: var(--warn); }
          .r b[data-warn="2"] { color: var(--bad); }

          /* Aviso de temporada, el mismo de la tarjeta Season: una franja al
             pie para no tener que abrir una carrera para verlo. */
          .season { margin: 2px 12px 8px; padding: 6px 8px; border-radius: 8px;
                    font-weight: 600; font-size: 9.5px; line-height: 1.35; color: var(--warn);
                    background: color-mix(in srgb, var(--warn) 8%, transparent);
                    border: 1px solid color-mix(in srgb, var(--warn) 22%, transparent); }
          .season[hidden] { display: none; }

          /* La fila de tema es un control, no una metrica: se ve clicable y
             lleva un punto del acento para reconocer la piel activa. */
          .r .theme { all: unset; flex: 1 1 auto; min-width: 0; cursor: pointer;
               font: 600 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
               font-variant-numeric: tabular-nums; color: var(--acc); text-align: right;
               border-radius: 5px; }
          .r .theme::before { content: ''; display: inline-block; width: 7px; height: 7px;
               margin-right: 6px; border-radius: 50%; vertical-align: 1px;
               background: var(--acc); box-shadow: 0 0 8px color-mix(in srgb, var(--acc) 70%, transparent); }
          .r .theme:hover { text-decoration: underline dotted; }
          .r .theme:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }

          /* Las mismas seis pieles, otra vez: cada shadow root tiene su propio
             CSS y no hereda la paleta del panel grande. */
          .p[data-theme="aurora"] { --acc: #3fe0c5; --acc-2: #a78bfa; --ink: #e8fbf7; --ink-2: #c3ece5; --dim: #7c9a98; --dim-2: #789693; --bg-hi: rgba(7, 19, 20, .985); --bg-lo: rgba(4, 10, 13, .995); }
          .p[data-theme="sunset"] { --acc: #ff9a5c; --acc-2: #ff77b0; --ink: #fff3ea; --ink-2: #f6d8c7; --dim: #a08a80; --dim-2: #9c877d; --bg-hi: rgba(24, 12, 11, .985); --bg-lo: rgba(12, 6, 8, .995); }
          .p[data-theme="ice"] { --acc: #66e3ff; --acc-2: #d7f7ff; --ink: #eefaff; --ink-2: #c9e9f6; --dim: #7e97a4; --dim-2: #7a93a0; --bg-hi: rgba(8, 16, 24, .985); --bg-lo: rgba(4, 8, 14, .995); }
          .p[data-theme="violet"] { --acc: #c08bff; --acc-2: #f0a9ff; --ink: #f7f0ff; --ink-2: #ddcbf2; --dim: #93849f; --dim-2: #8f809b; --bg-hi: rgba(18, 11, 27, .985); --bg-lo: rgba(8, 5, 14, .995); }
          .p[data-theme="rgb"] {
            --nt-hue: 0;
            --nt-angle: 0deg;
            --acc: hsl(var(--nt-hue) 92% 63%);
            --acc-2: hsl(calc(var(--nt-hue) + 70) 94% 76%);
            --ink: #f6f7ff;
            --ink-2: #d9dcf0;
            --dim: #8d90a6;
            --dim-2: #8a8da3;
            --bg-hi: rgba(11, 11, 19, .985);
            --bg-lo: rgba(5, 5, 10, .995);
            animation:
              nt-qp-boot .4s cubic-bezier(.2, .9, .25, 1) both,
              nt-rgb-hue 16s linear infinite,
              nt-rgb-angle 8s linear infinite;
          }
          @keyframes nt-rgb-hue { to { --nt-hue: 360; } }
          @keyframes nt-rgb-angle { to { --nt-angle: 360deg; } }

          .p[data-theme="rgb"]::after {
            content: '';
            position: absolute;
            inset: 0;
            z-index: 5;
            padding: 1px;
            border-radius: 14px;
            background: conic-gradient(from var(--nt-angle, 0deg),
              #ff5f6d, #ffc371, #47ffa1, #5ad1ff, #b06bff, #ff5f6d);
            -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            -webkit-mask-composite: xor;
            mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            mask-composite: exclude;
            pointer-events: none;
          }

          /* El mismo titulo arcoiris que el panel grande, para que el garaje no
             parezca otra herramienta cuando el tema es RGB. */
          .p[data-theme="rgb"] .t {
            background: linear-gradient(90deg, #ff5f6d, #ffc371, #47ffa1, #5ad1ff, #b06bff, #ff5f6d);
            background-size: 300% 100%;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            text-shadow: none;
            animation: nt-rgb-title 6s linear infinite;
          }
          @keyframes nt-rgb-title { to { background-position: 300% 0; } }

          /* La espera no es una metrica: es la respuesta a «por que no corre».
             Va en ambar y se separa de la lista, no compite con ella. */
          .r[data-f="waitRow"] { margin: 4px 0; padding: 5px 8px; border-radius: 8px;
               border: 1px solid color-mix(in srgb, var(--warn) 22%, transparent);
               background: color-mix(in srgb, var(--warn) 8%, transparent); color: #cfa96b; font-size: 10px; }
          .r[data-f="waitRow"] b { font-size: 10px; color: var(--warn); }

          /* Pie: el motivo, con la misma linea de separacion que el panel grande
             usa para su barra de estado. */
          .why { margin-top: 2px; padding: 8px 12px 0; border-top: 1px solid var(--line);
                 font-weight: 500; font-size: 9.5px; line-height: 1.35; color: var(--dim); }
          .why b { font-weight: 500; color: #cfe3d6; }
          .why[hidden] { display: none; }

          .acts { display: flex; flex-wrap: wrap; gap: 7px; padding: 9px 12px 12px; }
          .act { flex: 1 1 auto; min-width: 0; padding: 9px 0; text-align: center;
                 border-radius: 9px; cursor: pointer;
                 font: 800 9.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif;
                 letter-spacing: .14em; text-transform: uppercase; color: var(--ink);
                 background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 22%, transparent), color-mix(in srgb, var(--acc) 10%, transparent));
                 border: 1px solid color-mix(in srgb, var(--acc) 34%, transparent);
                 box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1);
                 transition: filter .15s ease, box-shadow .25s ease, transform .1s ease; }
          .act:hover:not(:disabled) { filter: brightness(1.16);
                 box-shadow: 0 0 20px -8px var(--acc), inset 0 1px 0 rgba(255, 255, 255, .12); }
          .act:active:not(:disabled) { transform: translateY(1px); }
          .act:disabled { opacity: .38; cursor: default; }
          .act.ghost { color: #cfe9db; background: rgba(255, 255, 255, .045);
                 border-color: var(--line); box-shadow: none; }
          .act.ghost:hover:not(:disabled) { color: var(--acc); background: var(--acc-dim);
                 border-color: var(--line-strong); }
          /* «Copy» es una herramienta, no una accion de carrera: se queda
             compacto para no apretar los dos botones que se usan de verdad. */
          .act.tool { flex: 0 0 auto; padding: 9px 12px; color: var(--dim); }
          .act.tool:hover:not(:disabled) { color: var(--acc); }
          .act:focus-visible, .mode:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }

          @media (prefers-reduced-motion: reduce) {
            .p, .p *, .p::before, .p::after { animation: none !important; transition: none !important; }
            /* Misma regla que el panel grande: el color sigue, el movimiento no. */
            .p[data-theme="rgb"] { animation: nt-rgb-hue 16s linear infinite !important; }
          }
        </style>
        <div class="p" data-mode="auto" data-theme="${panelTheme}">
          <div class="h" title="Drag to move · double-click to put it back in the corner">
            <i class="dot"></i>
            <span><b class="t">NITRO WRAITH</b><span class="s" data-f="sub">garage · queue</span></span>
            <span class="mode" role="status" aria-live="polite" title="Always AUTO: it starts and re-arms by itself. To stop it, use Stop / Esc in the race.">AUTO</span>
            <button class="upd" type="button" data-f="update" hidden>update</button>
            <button class="fold" type="button" data-f="fold" aria-expanded="true" aria-label="Fold the garage panel" title="Fold the garage panel (Alt+G)">−</button>
          </div>
          <div class="rows">
            <div class="r social" data-f="socialFriendsRow" hidden><span>friends</span><b data-f="socialFriends" aria-live="polite" aria-atomic="true">—</b></div>
            <div class="r social" data-f="socialOnlineRow" hidden><span>online</span><b data-f="socialOnline" aria-live="polite" aria-atomic="true">—</b></div>
            <div class="r social" data-f="socialRequestsRow" hidden><span>requests</span><b data-f="socialRequests" aria-live="polite" aria-atomic="true">—</b></div>
            <div class="r social" data-f="socialTeamRow" hidden><span>team</span><b data-f="socialTeam" aria-live="polite" aria-atomic="true">—</b></div>
            <div class="r social" data-f="socialUpdatedRow" hidden><span>updated</span><b data-f="socialUpdated">—</b></div>
            <div class="r"><span>state</span><b data-f="state">—</b></div>
            <div class="r" data-f="afkRow"><span>afk</span><b data-f="afk">—</b></div>
            <div class="r" data-f="retryRow" hidden><span>login retry</span><b data-f="loginRetry">—</b></div>
            <div class="r"><span>login</span><b data-f="login">—</b></div>
            <div class="r"><span>mystery box</span><b data-f="box">—</b></div>
            <div class="r"><span>session</span><b data-f="session">—</b></div>
            <div class="r" data-f="challengeRow" hidden><span>challenges</span><b data-f="challenges">—</b></div>
            <div class="r" data-f="nextRow" hidden><span>next</span><b data-f="next">—</b></div>
            <div class="r"><span>theme</span><button class="theme" type="button" data-f="theme" aria-live="polite" aria-label="Panel theme: ${THEME_LABELS[panelTheme] || panelTheme}. Activate to cycle." title="Click to cycle the panel theme: carbon, aurora, sunset, ice, violet, rgb. The race panel follows it.">${THEME_LABELS[panelTheme] || panelTheme}</button></div>
            <div class="r" data-f="renewedRow" hidden><span>renewed</span><b data-f="renewed">—</b></div>
            <div class="r" data-f="waitRow" hidden><span>waiting on</span><b data-f="wait">—</b></div>
            <div class="r" data-f="stopRow" hidden><span>last stop</span><b data-f="lastStop">—</b></div>
            <div class="r" data-f="raceRow"><span>next race</span><b class="race" data-f="race" title="Automatic start: click the value to cancel it (the bot stays armed and offers it again a little later)">—</b></div>
            <div class="r" data-f="dayRow" hidden><span>races</span><b data-f="dayRaces">—</b></div>
            <div class="r" data-f="budgetRow" hidden><span>day left</span><b data-f="dayBudget">—</b></div>
            <div class="r" data-f="boxesRow" hidden><span>boxes</span><b data-f="dayBoxes">—</b></div>
            <div class="r" data-f="alertsRow" hidden><span>alerts</span><b data-f="dayAlerts">—</b></div>
          </div>
          <div class="season" data-f="seasonRow" hidden><b data-f="seasonAlert">—</b></div>
          <div class="why" data-f="whyRow" hidden><b data-f="why">—</b></div>
          <div class="acts">
            <button class="act" type="button" data-act="box">Claim box</button>
            <button class="act ghost" type="button" data-act="race">Race now</button>
            <button class="act ghost" type="button" data-act="resume" title="Clear a stop and start now; with a live race this sends the same Alt+A">Resume</button>
            <button class="act ghost" type="button" data-act="retry" hidden title="Advance the next sign-in retry without waiting for the countdown">Retry login</button>
            <button class="act ghost tool" type="button" data-act="diag" title="Copy a diagnostic of the queue: mode, state, active waits, last decision, last failure, today and budgets">Copy</button>
          </div>
        </div>`;
      document.body.appendChild(host);

      const refs = {
        host,
        head: root.querySelector('.h'),
        panel: root.querySelector('.p'),
        mode: root.querySelector('.mode'),
        sub: root.querySelector('[data-f="sub"]'),
        socialFriendsRow: root.querySelector('[data-f="socialFriendsRow"]'),
        socialFriends: root.querySelector('[data-f="socialFriends"]'),
        socialOnlineRow: root.querySelector('[data-f="socialOnlineRow"]'),
        socialOnline: root.querySelector('[data-f="socialOnline"]'),
        socialRequestsRow: root.querySelector('[data-f="socialRequestsRow"]'),
        socialRequests: root.querySelector('[data-f="socialRequests"]'),
        socialTeamRow: root.querySelector('[data-f="socialTeamRow"]'),
        socialTeam: root.querySelector('[data-f="socialTeam"]'),
        socialUpdatedRow: root.querySelector('[data-f="socialUpdatedRow"]'),
        socialUpdated: root.querySelector('[data-f="socialUpdated"]'),
        state: root.querySelector('[data-f="state"]'),
        afkRow: root.querySelector('[data-f="afkRow"]'),
        afk: root.querySelector('[data-f="afk"]'),
        retryRow: root.querySelector('[data-f="retryRow"]'),
        loginRetry: root.querySelector('[data-f="loginRetry"]'),
        login: root.querySelector('[data-f="login"]'),
        box: root.querySelector('[data-f="box"]'),
        session: root.querySelector('[data-f="session"]'),
        challengeRow: root.querySelector('[data-f="challengeRow"]'),
        challenges: root.querySelector('[data-f="challenges"]'),
        nextRow: root.querySelector('[data-f="nextRow"]'),
        next: root.querySelector('[data-f="next"]'),
        theme: root.querySelector('[data-f="theme"]'),
        update: root.querySelector('[data-f="update"]'),
        fold: root.querySelector('[data-f="fold"]'),
        renewedRow: root.querySelector('[data-f="renewedRow"]'),
        renewed: root.querySelector('[data-f="renewed"]'),
        waitRow: root.querySelector('[data-f="waitRow"]'),
        wait: root.querySelector('[data-f="wait"]'),
        stopRow: root.querySelector('[data-f="stopRow"]'),
        lastStop: root.querySelector('[data-f="lastStop"]'),
        raceRow: root.querySelector('[data-f="raceRow"]'),
        race: root.querySelector('[data-f="race"]'),
        dayRow: root.querySelector('[data-f="dayRow"]'),
        dayRaces: root.querySelector('[data-f="dayRaces"]'),
        budgetRow: root.querySelector('[data-f="budgetRow"]'),
        dayBudget: root.querySelector('[data-f="dayBudget"]'),
        boxesRow: root.querySelector('[data-f="boxesRow"]'),
        dayBoxes: root.querySelector('[data-f="dayBoxes"]'),
        alertsRow: root.querySelector('[data-f="alertsRow"]'),
        dayAlerts: root.querySelector('[data-f="dayAlerts"]'),
        seasonRow: root.querySelector('[data-f="seasonRow"]'),
        seasonAlert: root.querySelector('[data-f="seasonAlert"]'),
        whyRow: root.querySelector('[data-f="whyRow"]'),
        why: root.querySelector('[data-f="why"]'),
        boxBtn: root.querySelector('[data-act="box"]'),
        raceBtn: root.querySelector('[data-act="race"]'),
        resumeBtn: root.querySelector('[data-act="resume"]'),
        retryBtn: root.querySelector('[data-act="retry"]'),
        diagBtn: root.querySelector('[data-act="diag"]'),
      };

      // Ciclo de tema desde el garaje: el selector grande vive en el iframe de
      // la carrera, pero volver alli solo para cambiar la piel no tiene sentido.
      // setTheme guarda la eleccion y el storage event la lleva al otro panel.
      refs.theme.addEventListener('click', (event) => {
        event.stopPropagation();
        cycleTheme();
      });

      refs.diagBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const report = queueDiagnostic();
        console.log(`%c[NTAuto · queue] diagnostic\n${report}`, 'color:#4ea1ff;font-weight:bold');
        const label = refs.diagBtn.textContent;
        refs.diagBtn.textContent = 'Copying…';
        const copied = await copyText(report);
        refs.diagBtn.textContent = copied ? 'Copied' : 'In console';
        setTimeout(() => { refs.diagBtn.textContent = label; }, 1600);
      });

      // La caja se pide a mano y se recoge igual que cuando la pilla la cola
      // sola: mismo boton del sitio, mismo modal y mismo registro. Si el boton
      // del sitio no esta en esta pagina, se marca el reclamo y la cola va al
      // garaje sola: un boton que no hace nada es peor que no tenerlo.
      refs.boxBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        // Sin sesion no hay caja que reclamar: se dice, en vez de dejar el boton
        // mudo.
        if (!signedIn()) {
          queueLog('Mystery Box: log in first; the box belongs to the account.');
          paintGaragePanel();
          return;
        }
        if (!claimTabLease('manual mystery box')) {
          queueLog('Another tab has the turn; the box stays with it.');
          paintGaragePanel();
          return;
        }
        const button = boxButton();
        if (button) {
          boxStore.set(BOX_TRY, Date.now());
          setBoxForce(false);
          claimBoxByClick(button);
          paintGaragePanel();
          return;
        }

        // El sitio ya dijo que falta (o el respiro minimo no ha pasado): no se
        // navega para nada, se dice por que en el log.
        if (!boxDue()) {
          setBoxForce(false);
          queueLog('Mystery Box: the site has not handed it out yet; nothing to claim.');
          paintGaragePanel();
          return;
        }

        setBoxForce(true);
        if (location.pathname === '/garage' || location.pathname.startsWith('/garage/')) {
          queueLog('Mystery Box: the garage has not painted the box yet; claiming as soon as it does.');
        } else {
          queueWhy('Mystery Box: going to the garage to claim it.');
          navigate('/garage');
        }
        paintGaragePanel();
      });

      // El boton abre carrera ya: si habia una cuenta atras en marcha se borra
      // antes de pulsar, para que no quede un segundo clic programado sobre un
      // boton que ya no existe (o sobre la carrera siguiente).
      refs.raceBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const hours = activeGate();
        if (hours) {
          queueLog(`Active hours closed; races resume at ${hours.nextText}.`);
          paintGaragePanel();
          return;
        }
        const button = findButton((label) => label.includes('race now'));
        if (!button) return;
        if (!claimTabLease('manual race')) {
          queueLog('Another tab has the turn; the race stays with it.');
          paintGaragePanel();
          return;
        }

        clearRaceNow();
        raceNowHoldUntil = 0;
        queuePress('raceNow', button);
        paintGaragePanel();
      });

      // Reanudar desde el garaje sin recordar Alt+A. Con un tipador vivo se le
      // manda la misma tecla y decide el marco (tope diario, horas, tanda): la
      // marca de parada no se toca aqui, para que un rechazo no la borre. Sin
      // tipador no hay marco que escuche, asi que se borra la marca y se arma
      // la cola; «Race Now» conserva su retardo humano.
      refs.resumeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!signedIn()) {
          queueLog('Resume: log in first; the queue cannot race a guest.');
          paintGaragePanel();
          return;
        }

        const live = typerState();
        if (live) {
          const sent = forwardHotkeyToFrames('KeyA', 'a');
          queueWhy(sent
            ? 'Resume: Alt+A sent to the race; the race decides if it can start.'
            : 'Resume: no race frame answered; click inside the race and press Alt+A.');
          paintGaragePanel();
          return;
        }

        if (!claimTabLease('manual resume')) {
          queueLog('Another tab has the turn; the resume stays with it.');
          paintGaragePanel();
          return;
        }
        clearStopped();
        setArmed(true);
        garageAutoDone = true;
        queueWhy('Resume: stop cleared from the garage panel; the queue is armed.');
        paintGaragePanel();
      });

      // La cuenta atras se cancela desde la propia fila, sin apagar el bot.
      // Adelanta la cita de login con el mismo SSO recordado. No cambia de
      // proveedor ni escribe credenciales; las guardas viven en retryLoginNow.
      refs.retryBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        retryLoginNow();
        paintGaragePanel();
      });

      refs.race.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!cancelRaceNow()) return;
        paintGaragePanel();
      });

      qpanel = refs;
      // Al volver a la pestaña se fuerza una lectura: el latido puede haber
      // estado frenado en segundo plano y los contadores sociales no deben
      // quedarse viejos justo cuando el usuario mira.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) socialWake();
      });
      window.addEventListener('focus', () => socialWake());
      applyGarageFold(disk.get(KEYS.garageFolded) === '1', { persist: false });
      refs.fold.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleGarageFold();
        refs.fold.blur();
      });
      restoreQPanel();
      dragQPanel(refs.head);

      // Si la ventana se encoge, el panel guardado puede quedar fuera de la
      // pantalla: se vuelve a meter con la misma posicion.
      addEventListener('resize', () => {
        if (!qpanel || !qpanel.host.style.left) return;
        placeQPanel(parseFloat(qpanel.host.style.left) || 0, parseFloat(qpanel.host.style.top) || 0);
      });
      return refs;
    }

    // Tiempo que le queda al token de sesion. Sale del mismo `exp` que usa la
    // renovacion proactiva, asi que lo que dice el panel y lo que hace la cola
    // no pueden discrepar.
    function sessionClockText(ms) {
      const total = Math.max(0, Math.round(ms / 1000));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
      if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
      return `${seconds}s`;
    }

    function sessionInfo() {
      const exp = tokenExpiryAt();
      if (!exp) {
        // Sin token no se distingue "caducado" de "invitado"; el «Log In» de la
        // cabecera si lo dice.
        if (!signedIn()) {
          return {
            text: 'signed out',
            warn: 2,
            title: 'No session: press «Log In» (top right). The queue resumes by itself once you are in.',
          };
        }
        return {
          text: 'unknown',
          warn: 0,
          title: 'No readable player_token in localStorage: the site is signed out, or the token is stored another way.',
        };
      }

      const left = exp - Date.now();
      const expires = new Date(exp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const margin = Math.round(CONFIG.queue.sessionRefreshBeforeMs / 1000);
      const renews = margin > 0
        ? `auto-renews ${margin} s before expiry, only between races`
        : 'automatic renewal disabled';

      if (left <= 0) {
        return {
          text: 'expired',
          warn: 2,
          title: `Session token expired at ${expires}. Reloading it (or logging in again) creates a new one.`,
        };
      }

      return {
        text: sessionClockText(left),
        warn: left <= 5 * 60000 ? 1 : 0,
        title: `Session expires at ${expires} · ${renews}.`,
      };
    }

    // Informe corto para pegar en un chat cuando el bot "no hace nada": modo y
    // armado, estado, puertas activas con su tiempo, ultima decision, resumen del
    // dia y presupuestos. Sale de las mismas funciones que deciden, no de una
    // copia, para que no pueda contar otra historia que la del panel.
    function queueDiagnostic() {
      const gates = activeGates();
      const day = todayRead();
      const typer = typerState();
      const reloads = reloadBudget();
      const files = assetFailures();
      const why = store.get(WHY, null);
      const fail = lastFailure();
      // No se llama `session`: tapaba el objeto de sesion del modulo.
      const info = sessionInfo();
      const stop = stoppedInfo();
      const avg = day.races > 0 ? (day.sumWpm / day.races).toFixed(1) : null;

      return [
        `Nitro Type autotyper ${VERSION} · queue diagnostic`,
        `when    ${new Date().toLocaleString()}`,
        `page    ${location.pathname}`,
        `mode    AUTO (always) · ${isArmed() ? 'armed' : 'not armed'} · ${signedIn() ? 'signed in' : 'signed out'}`,
        `state   ${garageStateText()}`,
        `gates   ${gates.length ? gates.map((gate) => `${gate.label} (${shortWait(gate.left)})`).join(' · ') : 'none'}`,
        `last    ${why && why.text ? `${why.text} (${clockText(why.at)})` : 'none'}`,
        `fail    ${fail ? `${fail.kind} · ${fail.detail} (${clockText(fail.at)})` : 'none'}`,
        `today   ${day.races} races${avg ? ` · ${avg} wpm avg` : ''} · ${day.boxes} box${day.boxes === 1 ? '' : 'es'} · ${day.dq} DQ`,
        `session ${info.text}`,
        `box     ${boxStateText()}`,
        `typer   ${typer ? `${typer.mode} · ${typer.typing ? 'typing' : 'not typing'}${typer.paused ? ' · paused' : ''}${typer.stopped ? ' · stopped' : ''}` : 'no frame'}`,
        `budget  reloads ${reloads.n}/${CONFIG.queue.reloadMax} · files ${files.n}/${CONFIG.queue.assetErrorMax} · captcha ${Number(store.get('captchaAttempts', 0)) || 0}/${CONFIG.queue.captchaMaxRedirects} · bounces ${raceNowBounces()}/${CONFIG.queue.raceNowBounceMax}`,
        `stop    ${stop ? `${stop.reason || 'stopped'} · ${shortWait(Math.max(0, Date.now() - stop.at))} ago` : 'none'}`,
      ].join('\n');
    }

    // Portapapeles: `navigator.clipboard` necesita gesto y puede fallar dentro de
    // marcos; el respaldo con textarea funciona en cualquier sitio. Si tampoco,
    // el informe queda igualmente en la consola.
    function fallbackCopy(text) {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
        document.body.appendChild(area);
        area.select();
        const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
        area.remove();
        return Boolean(ok);
      } catch {
        return false;
      }
    }

    // Se ESPERA la escritura antes de decir "Copied": la API moderna rechaza la
    // promesa cuando no hay gesto o falta permiso, y anunciar exito antes de
    // saberlo dejaba al usuario pegando nada. Si falla, se intenta el respaldo y
    // el informe ya esta en la consola en cualquier caso.
    async function copyText(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch {
        /* sin gesto, sin permiso o sin API: se prueba el respaldo */
      }
      return fallbackCopy(text);
    }

    // El estado del garaje, en una sola frase. Vive fuera del pintado porque el
    // diagnostico que se copia tiene que decir exactamente lo mismo: dos copias
    // de esta cadena acabarian contando historias distintas.
    // El indicador AFK no inventa un segundo estado: traduce las mismas
    // puertas que usa la cola. "on" solo cuando hay sesion y la cola esta
    // armada; si hay un reintento de login, esa cita manda sobre el resto.
    function afkStatus() {
      const retryLeft = Math.max(0, loginRetryAt - Date.now());
      const signed = signedIn();
      const blocked = Math.max(0, blockUntil() - Date.now());
      const stop = stoppedInfo();
      const hold = stop
        ? Math.min(Number(stop.holdMs) || 0, 24 * 3600000) || CONFIG.queue.stopHoldMs
        : 0;
      const stopLeft = stop ? Math.max(0, stop.at + hold - Date.now()) : 0;
      const hours = activeGate();
      const bounces = raceNowBounces();

      if (retryLeft > 0) {
        return {
          text: 'waiting',
          warn: 1,
          title: `${signed ? 'Signed in' : 'Signed out'}; the next ${SSO_LABEL[ssoProvider()]} sign-in retry is in ${sessionClockText(retryLeft)}.`,
        };
      }
      if (!signed) {
        return {
          text: 'signed out',
          warn: 2,
          title: 'No session: log in once; the queue then re-arms by itself.',
        };
      }
      if (blocked > 0) {
        return {
          text: 'hold',
          warn: 2,
          title: `Site block after too many disqualifications; ${shortWait(blocked)} left.`,
        };
      }
      if (hours) {
        return {
          text: 'scheduled',
          warn: 1,
          title: `Outside active hours; races resume at ${hours.nextText}.`,
        };
      }
      if (stopLeft > 0) {
        return {
          text: 'stopped',
          warn: 1,
          title: `Stopped${stop && stop.reason ? ` (${stop.reason})` : ''}; ${shortWait(stopLeft)} left before the queue can start again.`,
        };
      }
      if (bounces >= CONFIG.queue.raceNowBounceMax) {
        return {
          text: 'stuck',
          warn: 2,
          title: '«Race Now» is not sticking; the queue is waiting for the site to recover.',
        };
      }
      if (isArmed()) {
        return {
          text: 'on',
          warn: 0,
          title: 'AFK cycle active: signed in, armed and cycling races by itself.',
        };
      }
      return {
        text: 'waiting',
        warn: 1,
        title: 'Signed in; the garage queue arms itself again automatically.',
      };
    }

    function garageStateText() {
      const signed = signedIn();
      const armed = signed && isArmed();
      const blockedMin = Math.max(0, Math.ceil((blockUntil() - Date.now()) / 60000));
      const stop = stoppedInfo();

      if (loginRetryAt > Date.now()) return 'waiting · login retry';
      if (!signed) return 'waiting · sign in';
      if (blockedMin > 0) return `hold · site block ${blockedMin}m`;
      if (activeGate()) return 'waiting · active hours';
      if (armed) return 'on · armed';
      if (stop) {
        // El motivo y la cuenta atras ya los pinta la fila ambar ("waiting on"),
        // que sale de activeGates. Repetir «limit 30 races · back in 8 min» en
        // las dos filas era ruido y partia el texto en dos lineas.
        return 'waiting';
      }
      if (raceNowBounces() >= CONFIG.queue.raceNowBounceMax) return 'waiting · «Race Now» not sticking';
      return 'waiting · starts by itself';
    }

    function paintGaragePanel() {
      if (!qpanel) return;

      paintUpdateBadge(qpanel.update);
      paintUpdateHealth();
      if (qpanel.update && qpanel.update.dataset.bound !== '1') {
        qpanel.update.dataset.bound = '1';
        qpanel.update.addEventListener('pointerdown', (event) => event.stopPropagation());
        qpanel.update.addEventListener('click', (event) => {
          event.stopPropagation();
          openUpdateDownload();
        });
        checkForUpdate();
        setInterval(checkForUpdate, UPDATE_RETRY_MS);
      }

      const signed = signedIn();
      const armed = signed && isArmed();
      const social = socialPanelRoute();
      if (qpanel.panel.dataset.social !== (social ? '1' : '0')) {
        qpanel.panel.dataset.social = social ? '1' : '0';
      }
      if (qpanel.sub) qpanel.sub.textContent = social ? `${socialPageLabel()} · read-only` : 'garage · queue';
      // Nada de OFF: el chip dice AUTO siempre y el LED dice si esta corriendo
      // o esperando. En Amigos/Equipo el chip dice READ: ahi no hay acciones
      // sociales ni cola que armar.
      if (qpanel.panel.dataset.mode !== 'auto') qpanel.panel.dataset.mode = 'auto';
      const armedFlag = armed ? '1' : '0';
      if (qpanel.panel.dataset.armed !== armedFlag) qpanel.panel.dataset.armed = armedFlag;
      qpanel.mode.textContent = social ? 'READ' : 'AUTO';
      if (social) qpanel.mode.setAttribute('aria-label', 'Read-only social panel');
      else qpanel.mode.removeAttribute('aria-label');
      qpanel.mode.title = social
        ? 'Read-only: friends and team data. Accept, deny, invite and send are not available.'
        : (armed
          ? 'Automation runs by itself (always AUTO). To stop it, use Stop / Esc in the race.'
          : 'Waiting; it starts again by itself. There is no off switch: the mode is always AUTO.');
      qpanel.state.textContent = social ? 'read-only' : garageStateText();
      paintSocialRows(social);

      // Indicador AFK y cuenta atras real del reintento de login. La fecha vive
      // en sessionStorage, asi que no se pierde al recargar ni al navegar.
      const afk = afkStatus();
      qpanel.afk.textContent = afk.text;
      qpanel.afk.dataset.warn = String(afk.warn);
      qpanel.afkRow.title = afk.title;
      const retryLeft = Math.max(0, loginRetryAt - Date.now());
      const hasRetry = Boolean(loginRetryAt);
      qpanel.retryRow.hidden = !hasRetry;
      qpanel.retryBtn.hidden = !hasRetry;
      if (hasRetry) {
        qpanel.loginRetry.textContent = retryLeft > 0 ? sessionClockText(retryLeft) : 'now';
        qpanel.loginRetry.dataset.warn = retryLeft > 0 ? '1' : '2';
        qpanel.retryRow.title = retryLeft > 0
          ? `Next ${SSO_LABEL[ssoProvider()]} sign-in retry in ${sessionClockText(retryLeft)}.`
          : `Retrying ${SSO_LABEL[ssoProvider()]} now.`;
        qpanel.retryBtn.title = `Use ${SSO_LABEL[ssoProvider()]} now; skips the remaining wait.`
          + ' The same remembered provider is used.';
      }

      // Que login usara el bot si la sesion cae, leido del mismo recuerdo que
      // decide el re-login. Asi se ve si mandara Google, el formulario o CONFIG.
      const saved = savedLogin();
      const remembered = lastLoginMethod();
      if (remembered === 'manual') {
        qpanel.login.textContent = 'manual · no SSO';
        qpanel.login.title = 'The last sign-in used the username and password form; the bot will not press an SSO by itself.';
      } else if (remembered) {
        const left = Math.max(0, LAST_LOGIN_MAX_AGE - (Date.now() - Number(saved.at)));
        const days = Math.max(1, Math.ceil(left / 86400000));
        const label = SSO_LABEL[remembered];
        qpanel.login.textContent = `${label} · ${days}d`;
        qpanel.login.title = `The bot will press ${label} if the session drops; this memory expires in ${days} day${days === 1 ? '' : 's'}.`;
      } else {
        const label = SSO_LABEL[configuredSsoProvider()];
        qpanel.login.textContent = `${label} · config`;
        qpanel.login.title = 'No recent sign-in saved; if the session drops, the bot uses the provider in CONFIG.';
      }

      const boxText = boxStateText();
      qpanel.box.textContent = boxText;
      // Puente al panel de carrera: mientras el garaje vea el Claim Now!, la
      // otra ventana no debe pintar una espera vieja. Se retira al cobrar o
      // cuando el garaje deja de verlo; el TTL cubre el cambio de pagina.
      const readyAt = Number(boxStore.get(BOX_STATE_READY, 0)) || 0;
      if (signed && boxText === 'ready now' && boxButton()) {
        boxStore.set(BOX_STATE_READY, Date.now());
      } else if (!boxTimer && readyAt) {
        boxStore.set(BOX_STATE_READY, 0);
      }
      // La tarjeta visible manda: el panel tambien dispara el reclamo, para que
      // una cola parada o atascada no deje la caja sin cobrar. handleMysteryBox
      // ya tiene sus guardas (boxTimer, minGap, lease) contra duplicados.
      if (signed && CONFIG.mysteryBox.enabled && !boxTimer && boxButton()) {
        try { handleMysteryBox(); } catch { /* el siguiente latido reintenta */ }
      }
      // Nunca se desactiva: sin boton del sitio en pantalla, el clic lleva al
      // garaje y reclama alli (antes quedaba muerto fuera del garaje, que es lo
      // que hacia que la caja "no se reclamara nunca" a mano).
      qpanel.boxBtn.disabled = false;
      qpanel.boxBtn.title = !signed
        ? 'Sign in first: the Mystery Box belongs to the account'
        : (boxButton()
          ? 'Press the site\'s claim button now'
          : 'Go to the garage and claim the daily Mystery Box');
      qpanel.resumeBtn.title = stoppedRecently()
        ? 'Clear the stop and start now; with a live race this sends the same Alt+A'
        : 'Send Alt+A to a live race, or re-arm the queue from the garage';

      // Resumen de la noche: lo que el dia lleva sumado (carreras, media, cajas
      // y DQ). Vive en localStorage y lo escriben las dos mitades, asi que
      // sobrevive a recargas y re-logins sin llevar cuentas paralelas.
      const day = todayRead();
      const hasDay = day.races > 0 || day.boxes > 0 || day.dq > 0;

      // Los tres Daily Challenges, en el garaje: es donde se decide empezar o
      // seguir. La tarjeta de LOG ya los mostraba, pero habia que abrir el
      // panel grande. Se leen de persist:nt/NTGLOBALS; no se reclama nada.
      const challengeList = readChallengeProgress();
      const challengesDone = challengeList.filter((item) => item.goal > 0 && item.progress >= item.goal).length;
      qpanel.challengeRow.hidden = challengeList.length === 0;
      if (challengeList.length) {
        const resetLeft = chResetAt > Date.now() ? chResetAt - Date.now() : 0;
        qpanel.challenges.textContent = `${challengesDone}/${challengeList.length}`
          + (resetLeft > 0 ? ` · ${shortWait(resetLeft)} left` : '');
        qpanel.challengeRow.title = `${challengesDone} of ${challengeList.length} Daily Challenges complete.`
          + challengeList.map((item) => ` ${item.title}: ${item.goal ? `${Math.min(item.progress, item.goal)}/${item.goal}` : item.progress}.`).join('')
          + (resetLeft > 0 ? ` Resets in ${shortWait(resetLeft)} (00:00 ET).` : '');
      }

      // El reto incompleto con mayor porcentaje de avance: es el que decide si
      // merece la pena seguir o parar. Sin datos suficientes, la fila se oculta.
      const pendingChallenges = challengeList
        .filter((item) => item.goal > 0 && item.progress < item.goal)
        .sort((a, b) => (b.progress / b.goal) - (a.progress / a.goal));
      const nextChallenge = pendingChallenges[0] || null;
      qpanel.nextRow.hidden = !nextChallenge;
      if (nextChallenge) {
        const shownProgress = Math.min(nextChallenge.progress, nextChallenge.goal);
        qpanel.next.textContent = `${nextChallenge.short || 'challenge'} ${shownProgress}/${nextChallenge.goal}`;
        qpanel.nextRow.title = `Closest Daily Challenge: ${nextChallenge.title} · ${shownProgress}/${nextChallenge.goal}.`
          + (chResetAt > Date.now() ? ` Resets in ${shortWait(chResetAt - Date.now())} (00:00 ET).` : '');
      }

      // Atasco con las recargas gastadas: si sigue fresco, es el aviso mas
      // importante del panel, por encima del recuento de DQ.
      let stuck = null;
      try { stuck = JSON.parse(localStorage.getItem(STUCK_STATE) || 'null'); } catch { stuck = null; }
      const stuckFresh = Boolean(stuck && Number.isFinite(stuck.at) && Date.now() - stuck.at < 600000);

      qpanel.dayRow.hidden = !hasDay;
      qpanel.boxesRow.hidden = !hasDay;
      qpanel.alertsRow.hidden = !(hasDay || stuckFresh);

      if (hasDay) {
        const avg = day.races > 0 ? day.sumWpm / day.races : 0;
        const target = day.races > 0 ? day.sumTarget / day.races : 0;

        qpanel.dayRaces.textContent = day.races > 0
          ? `${day.races} · ${avg.toFixed(1)} wpm`
          : 'no races yet';
        qpanel.dayRow.title = [
          `Since midnight: ${day.races} race${day.races === 1 ? '' : 's'}`,
          day.races > 0 ? `${avg.toFixed(1)} wpm avg (target ${Math.round(target)})` : null,
          day.best > 0 ? `best ${day.best.toFixed(1)}` : null,
          day.cash > 0 ? `$${Math.round(day.cash).toLocaleString('en-US')} in race prizes` : null,
          day.firstAt ? `${clockText(day.firstAt)}–${clockText(day.lastAt)}` : null,
        ].filter(Boolean).join(' · ') + '.';

        qpanel.dayBoxes.textContent = String(day.boxes);
        qpanel.boxesRow.title = day.boxes > 0
          ? `${day.boxes} Mystery Box${day.boxes === 1 ? '' : 'es'} claimed since midnight.`
          : 'No Mystery Box claimed since midnight.';
      }

      // Presupuesto diario restante, tambien en el garaje: desde aqui se abre
      // la carrera y antes habia que entrar al panel grande para saber cuanto
      // quedaba del dia. Se pinta solo si hay algun tope diario encendido.
      const daily = dailyCaps();
      const hasBudget = daily.raceCap > 0 || daily.xpCap > 0;
      qpanel.budgetRow.hidden = !hasBudget;
      if (hasBudget) {
        const parts = [];
        if (daily.raceCap) parts.push(`${Math.max(0, daily.raceCap - daily.races)} races`);
        if (daily.xpCap) {
          const left = Math.max(0, daily.xpCap - daily.xp);
          parts.push(`${left > 0 ? limitXpText(left) : '0'} XP`);
        }
        qpanel.dayBudget.textContent = parts.join(' · ');
        qpanel.budgetRow.dataset.warn = daily.raceHit ? '2' : (daily.warn ? '1' : '0');
        qpanel.budgetRow.title = `Daily budget left: ${parts.join(' · ')}`
          + `${daily.raceCap ? ` · ${daily.races} of ${daily.raceCap} races used` : ''}`
          + `${daily.xpCap ? ` · ${daily.xp.toLocaleString()} of ${daily.xpCap.toLocaleString()} XP used` : ''}`
          + '. Resets at midnight.';
      }

      if (hasDay || stuckFresh) {
        if (stuckFresh) {
          qpanel.dayAlerts.textContent = 'stuck';
          qpanel.dayAlerts.dataset.warn = '2';
          qpanel.alertsRow.title = `The bot has been stuck since ${clockText(stuck.at)} with the reload budget spent. Press F5, then MODE to start it again.`;
        } else {
          qpanel.dayAlerts.textContent = day.dq > 0 ? `${day.dq} DQ` : 'none';
          qpanel.dayAlerts.dataset.warn = day.dq > 0 ? '1' : '0';
          qpanel.alertsRow.title = day.dq > 0
            ? `${day.dq} disqualification${day.dq === 1 ? '' : 's'} since midnight${day.dqAt ? ` · last at ${clockText(day.dqAt)}` : ''}. ${day.clean} clean race${day.clean === 1 ? '' : 's'} in a row.`
            : 'No disqualifications since midnight.';
        }
      }

      // Aviso de temporada tambien en el garaje: llegar aqui y no ver que
      // quedan dos dias para el premio era la unica senal que solo existia
      // dentro de una carrera. Sale de la misma funcion que la tarjeta Season.
      const season = seasonRead();
      const seasonAlerts = seasonAlertText(season);
      qpanel.seasonRow.hidden = seasonAlerts.length === 0;
      if (seasonAlerts.length) {
        qpanel.seasonAlert.textContent = seasonAlerts.join(' · ');
        qpanel.seasonRow.title = `Season ${season.seasonName || ''} · T${season.tier} · ${Number(season.xp || 0).toLocaleString()} XP. ${seasonAlerts.join('. ')}.`;
      }

      // Que puerta te tiene quieto y cuanto le queda. Es la respuesta corta a
      // "por que no corre": la larga (el motivo) ya esta en la fila de abajo.
      const gates = activeGates();
      qpanel.waitRow.hidden = gates.length === 0;
      if (gates.length) {
        const first = gates[0];
        qpanel.wait.textContent = `${first.label} · ${shortWait(first.left)}`;
        qpanel.waitRow.title = `Waiting on: ${gates
          .map((gate) => `${gate.label} (${shortWait(gate.left)} left)`)
          .join(' · ')}. Each one clears by itself.`;
      }

      // Ultima parada, con el motivo y si la levantaste a mano. La marca activa
      // caduca; esta tarjeta se queda 24 h para poder reconstruir que paso.
      const lastStop = lastStopInfo();
      const recentStop = lastStop && Date.now() - lastStop.at < 24 * 3600000;
      qpanel.stopRow.hidden = !recentStop;
      if (recentStop) {
        const reason = String(lastStop.reason || 'manual stop').split(' · ')[0].slice(0, 34);
        const state = lastStop.clearedAt
          ? `cleared manually ${shortWait(Date.now() - lastStop.clearedAt)} ago`
          : (Date.now() < lastStop.endAt ? `${shortWait(lastStop.endAt - Date.now())} left` : 'expired');
        qpanel.lastStop.textContent = `${reason} · ${state}`;
        qpanel.stopRow.title = `Last stop: ${new Date(lastStop.at).toLocaleString()} · ${lastStop.reason || 'manual stop'} · hold ${shortWait(lastStop.holdMs)}`
          + (lastStop.clearedAt ? ` · cleared manually at ${new Date(lastStop.clearedAt).toLocaleTimeString()}` : ' · not cleared manually');
      }

      // Ultima decision de la cola: el salto al garaje solo se explicaba en la
      // consola, que desaparece al navegar. Quince minutos es lo que tarda uno
      // en volver a la pestana y preguntarse que paso.
      const why = store.get(WHY, null);
      const whyFresh = Boolean(why && why.text && Number.isFinite(why.at) && Date.now() - why.at < 900000);
      qpanel.whyRow.hidden = !whyFresh;
      if (whyFresh) {
        qpanel.why.textContent = why.text;
        qpanel.whyRow.title = `${why.text} (${clockText(why.at)})`;
      }

      // `info`, no `session`: este ultimo es el objeto de la tanda del modulo.
      const info = sessionInfo();
      qpanel.session.textContent = info.text;
      qpanel.session.title = info.title;
      qpanel.session.dataset.warn = String(info.warn);

      const renewedAt = Number(store.get('refreshAt', 0)) || 0;
      qpanel.renewedRow.hidden = !renewedAt;
      if (renewedAt) {
        const age = Math.max(0, Date.now() - renewedAt);
        qpanel.renewed.textContent = age < 45000 ? 'just now' : `${sessionClockText(age)} ago`;
        qpanel.renewed.title = `Last automatic renewal: ${new Date(renewedAt).toLocaleTimeString()} (kept for this tab only).`;
      }

      const raceButton = findButton((label) => label.includes('race now'));
      qpanel.race.textContent = raceNowText();
      qpanel.race.dataset.cancel = raceNowTimer ? '1' : '0';
      const total = raceNowDelay || 1;
      const leftMs = Math.max(0, raceNowAt - Date.now());
      const progress = raceNowTimer ? Math.max(0, Math.min(100, (1 - leftMs / total) * 100)) : 0;
      qpanel.raceRow.style.setProperty('--race-progress', progress.toFixed(1));
      qpanel.raceBtn.disabled = !(armed && raceButton);
    }

    // La ventana superior no siempre expone la API de depuracion del marco,
    // pero si recibe los storage events del panel de carrera. Este segundo
    // puente mantiene los topes y las horas al dia sin recargar.
    addEventListener('storage', (event) => {
      const key = event.key;
      if (!key || !event.newValue) return;
      if (key === KEYS.dailyRaceLimit || key === KEYS.dailyXpLimit) invalidateTodayCache();
      const value = Number(event.newValue);
      let changed = false;

      if (key === KEYS.raceLimit && Number.isFinite(value)) {
        session.raceLimit = clamp(value | 0, 0, 500);
        changed = true;
      } else if (key === KEYS.timeLimit && Number.isFinite(value)) {
        const next = clamp(value | 0, 0, 1440);
        if (next && !session.tandaStartedAt && session.races > 0) session.tandaStartedAt = Date.now();
        session.timeLimit = next;
        changed = true;
      } else if (key === KEYS.xpLimit && Number.isFinite(value)) {
        session.xpLimit = clamp(value | 0, 0, 1000000);
        changed = true;
      } else if (key === KEYS.dailyRaceLimit && Number.isFinite(value)) {
        session.dailyRaceLimit = clamp(value | 0, 0, 2000);
        changed = true;
      } else if (key === KEYS.dailyXpLimit && Number.isFinite(value)) {
        session.dailyXpLimit = clamp(value | 0, 0, 10000000);
        changed = true;
      } else if (key === KEYS.activeOn) {
        session.activeOn = event.newValue === '1';
        changed = true;
      } else if (key === KEYS.activeStart || key === KEYS.activeEnd) {
        if (Number.isFinite(value)) {
          if (key === KEYS.activeStart) session.activeStart = clamp(value | 0, 0, 23);
          else session.activeEnd = clamp(value | 0, 0, 23);
          changed = true;
        }
      }

      if (!changed) return;
      paintGaragePanel();
      if (session.activeOn) scheduleActiveResume();
    });

    // El banco y la consola pueden repintar sin esperar al latido de la cola.
    window.__ntaDebug = window.__ntaDebug || {};
    window.__ntaDebug.garagePaint = () => paintGaragePanel();

    function garagePanelRoute() {
      const path = location.pathname;
      return path === '/' || path === '/garage' || path.startsWith('/garage/');
    }

    // Amigos y Equipo comparten el panel pequeno, pero en modo de solo lectura.
    // La ruta se mantiene separada de garagePanelRoute(): solo el garaje puede
    // armar la cola o pulsar «Race Now».
    function socialPanelRoute() {
      const path = location.pathname;
      return path === '/friends' || path.startsWith('/friends/')
        || path === '/team' || path.startsWith('/team/');
    }

    function panelRoute() {
      return garagePanelRoute() || socialPanelRoute();
    }

    function socialPageLabel() {
      const path = location.pathname;
      return path === '/team' || path.startsWith('/team/') ? 'team' : 'friends';
    }

    // El perfil que el sitio ya guardo es el respaldo inmediato: el panel tiene
    // algo que enseñar antes de que contesten las tres peticiones de lectura.
    function persistedSocial() {
      const user = siteUser(0) || {};
      const listed = Array.isArray(user.friends)
        ? user.friends.length
        : (user.friends && typeof user.friends === 'object' ? Object.keys(user.friends).length : null);
      const total = Number(user.totalFriends);
      const friends = Number.isFinite(listed) ? listed : (Number.isFinite(total) ? total : null);
      const tag = String(user.tag || user.teamTag || '').trim();
      const role = String(user.teamRole || user.teamRoleName || '').trim();
      const owner = String(user.userID || user.id || user.username || '').trim();
      return {
        friends: Number.isFinite(friends) ? friends : null,
        teamTag: tag || null,
        teamRole: role || null,
        owner,
      };
    }

    // La cache social no puede sobrevivir a un cambio de cuenta sin recargar:
    // los contadores del usuario anterior no son del usuario nuevo. El token
    // cubre el caso en el que el perfil aun no se ha escrito en persist:nt.
    function socialOwner(profile = persistedSocial()) {
      if (profile.owner) return profile.owner;
      const claims = jwtClaims();
      return claims && claims.sub ? String(claims.sub) : '';
    }

    function socialCountText(value, pending = socialCache.pending) {
      if (Number.isFinite(value)) return String(value);
      return pending ? '…' : '—';
    }

    let socialCache = { at: 0, data: null, pending: null, failedAt: 0, owner: '' };
    let socialRouteSeen = '';
    let socialWakeAt = 0;
    // Lectura social: no es informacion que cambie al segundo y son tres GET
    // por refresco. Dos minutos de cache bajan el trafico sin dejar la vista
    // congelada; al abrir la pestana social se fuerza una lectura fresca.
    const SOCIAL_TTL_MS = 120000;
    const SOCIAL_RETRY_MS = 120000;
    const SOCIAL_TIMEOUT_MS = 12000;

    function socialStatusText(cache = socialCache) {
      if (cache.pending) return 'Refreshing now.';
      const last = cache.at
        ? `Last checked ${shortWait(Math.max(1000, Date.now() - cache.at))} ago.`
        : 'Not checked yet.';
      return cache.failedAt ? `${last} The latest read failed; retrying.` : last;
    }

    function socialWake() {
      if (!socialPanelRoute()) return;
      const now = Date.now();
      if (now - socialWakeAt < 1500) return;
      socialWakeAt = now;
      refreshSocial(true).catch(() => {});
    }

    function socialSnapshot() {
      const profile = persistedSocial();
      const owner = socialOwner(profile);
      const current = socialCache.owner === owner;
      // Si la cuenta cambio, se enseña el respaldo del perfil nuevo y se
      // ignoran los contadores de la cuenta anterior hasta la siguiente GET.
      const cached = current ? (socialCache.data || {}) : {};
      return {
        current,
        pending: current && Boolean(socialCache.pending),
        friends: Number.isFinite(cached.friends) ? cached.friends : profile.friends,
        online: Number.isFinite(cached.online) ? cached.online : null,
        requests: Number.isFinite(cached.requests) ? cached.requests : null,
        teamTag: profile.teamTag,
        teamRole: profile.teamRole,
      };
    }

    function setSocialText(el, value) {
      if (el && el.textContent !== value) el.textContent = value;
    }

    function setSocialTitle(el, value) {
      if (el && el.title !== value) el.title = value;
    }

    function paintSocialRows(social) {
      if (!qpanel) return;
      const snapshot = socialSnapshot();
      const rows = [
        [qpanel.socialFriendsRow, qpanel.socialFriends],
        [qpanel.socialOnlineRow, qpanel.socialOnline],
        [qpanel.socialRequestsRow, qpanel.socialRequests],
        [qpanel.socialTeamRow, qpanel.socialTeam],
        [qpanel.socialUpdatedRow, qpanel.socialUpdated],
      ];
      for (const [row] of rows) {
        if (row) row.hidden = !social;
      }
      if (!social) return;

      const cache = snapshot.current
        ? socialCache
        : { at: 0, pending: null, failedAt: 0 };
      setSocialText(qpanel.socialFriends, socialCountText(snapshot.friends, snapshot.pending));
      setSocialText(qpanel.socialOnline, socialCountText(snapshot.online, snapshot.pending));
      setSocialText(qpanel.socialRequests, socialCountText(snapshot.requests, snapshot.pending));
      setSocialText(qpanel.socialTeam, snapshot.teamTag
        ? `[${snapshot.teamTag}]${snapshot.teamRole ? ` · ${snapshot.teamRole}` : ''}`
        : (signedIn() ? 'none' : '—'));
      const age = cache.at
        ? `${shortWait(Math.max(1000, Date.now() - cache.at))} ago`
        : '';
      setSocialText(qpanel.socialUpdated, snapshot.pending
        ? 'refreshing…'
        : (cache.failedAt ? (age ? `${age} · retry` : 'failed') : (age || '—')));

      const status = socialStatusText(cache);
      setSocialTitle(qpanel.socialFriendsRow,
        `Friends on this account. Read-only: the panel never adds or removes friends. ${status}`);
      setSocialTitle(qpanel.socialOnlineRow,
        `Friends online right now. Read-only; the panel does not invite or message anyone. ${status}`);
      setSocialTitle(qpanel.socialRequestsRow,
        `Pending friend requests. Read-only; the panel never accepts or denies them. ${status}`);
      setSocialTitle(qpanel.socialTeamRow,
        `Team tag and role from your profile. Read-only; the panel never invites, applies or leaves. ${status}`);
      setSocialTitle(qpanel.socialUpdatedRow,
        `Last read status for the three GET requests. ${status}`);
    }

    // Tres GET sin efectos: total de amigos, amigos online y solicitudes. El
    // panel no tiene ningun camino hacia accept/deny/invite/send. Si una
    // peticion falla, se conserva el respaldo del perfil y se reintenta luego.
    async function refreshSocial(force = false) {
      if (!socialPanelRoute()) return;
      const now = Date.now();
      const profile = persistedSocial();
      const owner = socialOwner(profile);
      if (socialCache.owner !== owner) {
        // La peticion vieja puede seguir viva, pero su resultado se descarta
        // al ver que el owner ya no coincide. Se suelta el pending para que
        // la cuenta nueva no espere los 12 s de la anterior.
        socialCache = { at: 0, data: null, pending: null, failedAt: 0, owner };
      }
      if (document.hidden && !force) return;
      if (socialCache.pending) return socialCache.pending;
      if (!force && socialCache.data && now - socialCache.at < SOCIAL_TTL_MS) return;
      if (!force && socialCache.failedAt && now - socialCache.failedAt < SOCIAL_RETRY_MS) return;

      if (!socialCache.data) {
        socialCache.data = { friends: profile.friends, online: null, requests: null };
      }

      const pending = (async () => {
        const token = readToken();
        // Un GET colgado no puede dejar el panel en «refreshing» para siempre.
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), SOCIAL_TIMEOUT_MS) : null;
        const headers = { accept: 'application/json, text/plain, */*' };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
          const claims = jwtClaims(token);
          if (claims && claims.sub) headers['x-uid'] = String(claims.sub);
        }

        const stamp = Date.now();
        const read = async (url) => {
          try {
            const response = await fetch(url, {
              method: 'GET',
              credentials: 'include',
              headers,
              cache: 'no-store',
              signal: controller ? controller.signal : undefined,
            });
            if (!response.ok) return null;
            return await response.json();
          } catch {
            return null;
          }
        };

        let all;
        let online;
        let requests;
        try {
          [all, online, requests] = await Promise.all([
            read(`/api/v2/friends?_=${stamp}`),
            read(`/api/v2/friends?online=1&_=${stamp}`),
            read(`/api/v2/friend-requests?r=${stamp}`),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }

        const countValues = (body) => {
          const results = body && body.results;
          return Array.isArray(results && results.values) ? results.values.length : null;
        };
        const countRequests = (body) => {
          const results = body && body.results;
          if (Array.isArray(results && results.requests)) return results.requests.length;
          const total = Number(results && results.totalRecords);
          return Number.isFinite(total) ? total : null;
        };

        // Una respuesta de una cuenta que ya no esta activa no puede
        // reemplazar los contadores de la cuenta nueva.
        if (socialCache.owner !== owner) return;

        const next = {
          friends: countValues(all),
          online: countValues(online),
          requests: countRequests(requests),
        };
        if (next.friends === null && next.online === null && next.requests === null) {
          socialCache.failedAt = Date.now();
        } else {
          socialCache.data = next;
          socialCache.at = Date.now();
          socialCache.failedAt = 0;
        }
      })();

      socialCache.pending = pending;
      try {
        await pending;
      } catch {
        // Un error inesperado no debe quedar como rechazo sin manejar en una
        // llamada fire-and-forget desde el latido.
        if (socialCache.owner === owner) socialCache.failedAt = Date.now();
      } finally {
        if (socialCache.pending === pending) socialCache.pending = null;
        if (socialPanelRoute()) paintGaragePanel();
      }
    }

    function syncGaragePanel() {
      if (!panelRoute() || !document.body) {
        if (qpanel) qpanel.host.style.display = 'none';
        if (!socialPanelRoute()) socialRouteSeen = '';
        return;
      }

      if (!qpanel) buildGaragePanel();
      qpanel.host.style.display = '';

      // Amigos/Equipo: se pinta el mismo panel, pero no se toca la cola. Sin
      // este corte, entrar en /friends podria armar AUTO y abrir una carrera
      // desde una pantalla que solo debia enseñar datos.
      if (!garagePanelRoute()) {
        if (socialRouteSeen !== location.pathname) {
          socialRouteSeen = location.pathname;
          refreshSocial(true).catch(() => {});
        } else {
          refreshSocial().catch(() => {});
        }
        paintGaragePanel();
        return;
      }
      socialRouteSeen = '';

      // El garaje es el unico sitio desde el que la cola abre carrera, y el bot
      // parado tras una redireccion (DQ, recarga, vuelta del garaje) no debia
      // quedarse mudo sin que se viera el motivo. Se entra en AUTO una vez por
      // visita: el chip MODE sigue pudiendo apagarlo y se respeta hasta que
      // vuelvas a entrar. El arranque no es instantaneo: "Race Now" conserva su
      // retardo humano de CONFIG.queue.raceNowDelayMs (2,6-7 s).
      // La retencion tras una parada ya prescribio y el modo sigue en AUTO: se
      // vuelve a evaluar el armado. La marca de "ya mirado" duraba lo que la
      // pagina, asi que pasados los 10 min de retencion el garaje se quedaba
      // apagado hasta que recargaras tu, por mucho que el cooldown hubiera
      // prescrito. Los rebotes de «Race Now» siguen frenandolo.
      // Un tipador vivo que sigue diciendo "parado" tambien frena el rearme: si
      // el marco sobrevive a la navegacion, armar aqui abriria una carrera que
      // nadie va a teclear (DQ por inactividad, la que esto evitaba).
      const liveTyper = typerState();

      if (garageAutoDone && !isArmed() && signedIn()
        && !stoppedRecently() && !(liveTyper && liveTyper.stopped)
        && raceNowBounces() < CONFIG.queue.raceNowBounceMax) {
        garageAutoDone = false;
      }

      if (!garageAutoDone) {
        garageAutoDone = true;

        // Invitado: armarse aqui solo servia para pulsar «Race Now» y volver a
        // la misma pagina en bucle, encima de la pantalla de login.
        if (!signedIn()) {
          setArmed(false);
          signedOutNoted = true;
          queueWhy('Garage: signed out; the queue stays waiting until you log in.');
        } else {
          if (stoppedRecently()) {
            // Se paro a proposito hace un momento (tope de tanda o Esc): se
            // respeta la retencion y se rearma solo al vencer. Sin esto, el
            // garaje abriria otra carrera al instante y el servidor la
            // descalificaria por inactividad.
            setArmed(false);
            const stop = stoppedInfo();
            const hold = Math.min(Number(stop && stop.holdMs) || 0, 24 * 3600000) || CONFIG.queue.stopHoldMs;
            const left = stop ? Math.max(0, stop.at + hold - Date.now()) : 0;
            queueWhy(`Garage: stopped${stop && stop.reason ? ` (${stop.reason})` : ''} · ${shortWait(left)} left. Press Resume or Alt+A to start now.`);
          } else if (!isArmed()) {
            // Con «Race Now» rebotando ya no se arma: volver a encenderlo solo
            // repetia el clic que no lleva a ninguna carrera.
            if (raceNowBounces() >= CONFIG.queue.raceNowBounceMax) {
              queueWhy('Garage: «Race Now» is not sticking; the queue waits until you press Alt+A.');
            } else {
              setArmed(true);
              queueWhy('Garage: queue armed (AUTO).');
            }
          }
        }
      }

      paintGaragePanel();
    }

    function clearRelogin() {
      if (reloginTimer) {
        clearLater(reloginTimer);
        reloginTimer = null;
      }
    }

    /* ---- renovacion proactiva del token ---- */
    // El sitio guarda la sesion en un JWT (`player_token` en localStorage) y la
    // app lo valida por su `exp`: cuando vence, la pantalla que aparece es
    // /login. El aviso "Yes, I'm here!" solo recarga la pagina para que el
    // servidor emita otro token, asi que se hace lo mismo un poco antes, y solo
    // entre carreras: recargar con el tipador vivo es justo lo que se quiere
    // evitar. Si el token no esta o no trae `exp`, no se toca nada.
    function tokenExpiryAt() {
      const claims = jwtClaims();
      const exp = Number(claims && claims.exp);
      return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
    }

    function refreshSessionBeforeExpiry() {
      if (!CONFIG.queue.sessionRefreshBeforeMs) return false;

      // Solo en home y garaje. Recargar /race durante la cuenta atras (sin
      // teclas aun, sin carrera "live") abortaria la carrera, y en /login no hay
      // sesion que renovar. Alli la red de seguridad es el aviso del sitio.
      const path = location.pathname;
      if (!(path === '/' || path === '/garage' || path.startsWith('/garage/'))) return false;

      const exp = tokenExpiryAt();
      if (!exp) return false;

      const left = exp - Date.now();
      if (left <= 0 || left > CONFIG.queue.sessionRefreshBeforeMs) return false;

      // Una recarga por token: si el servidor no emitio uno nuevo, insistir en
      // cada latido recargaria la pagina en bucle.
      if (store.get('refreshExp', 0) === exp) return false;

      const state = typerState();
      if (state && !state.stopped && (state.typing || state.chars > 0)) return false;

      store.set('refreshExp', exp);
      // El panel muestra esta marca como "renewed …": es la ultima vez que la
      // propia cola recargo la pagina para refrescar el token.
      store.set('refreshAt', Date.now());
      queueLog(`Session token expires in ${Math.round(left / 1000)} s: reloading to renew it (no race on screen).`);
      storeNotice('Session renewed a moment before it expired (page reload).');
      location.reload();
      return true;
    }

    /* ---- navegacion SPA ---- */

    function onNavigate() {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      // La pagina nueva puede traer un CAPTCHA: no se espera al siguiente ciclo
      // de 3 s para mirarla.
      captchaScanAt = 0;
      queueLog(`Route: ${location.pathname}`);
      // Cada visita al garaje vuelve a entrar en AUTO: si el bot venia apagado de
      // una pantalla anterior, aqui tiene que poder arrancar solo.
      garageAutoDone = false;
      captchaHandled = false;
      redirecting = false;
      loggedOutNoted = false;
      reloginGaveUp = false;
      loginReloadGaveUp = false;
      dqPressAt = 0;
      dqPressTries = 0;
      if (dqPressTimer) {
        clearLater(dqPressTimer);
        dqPressTimer = null;
      }
      noteProgress();
      clearIdleTimer();
      clearContinue();
      clearRaceNow();
      clearRelogin();
      // La cita del login no se pierde al navegar: si sigue pendiente se
      // restaura en esta pagina y, al vencer, vuelve a /login sola.
      restoreLoginRetry();
      for (const key of Object.keys(lastPress)) delete lastPress[key];
    }

    function hookHistory() {
      for (const method of ['pushState', 'replaceState']) {
        const original = history[method];
        if (typeof original !== 'function' || original.__ntQueueHooked) continue;
        const patched = function (...args) {
          const result = original.apply(this, args);
          setTimeout(loop, 0);
          return result;
        };
        patched.__ntQueueHooked = true;
        history[method] = patched;
      }
      addEventListener('popstate', loop, true);
      addEventListener('hashchange', loop, true);
    }

    /* ---- bucle ---- */

    // Sin sesion no hay nada que automatizar: se desarma para que la cola no
    // intente abrir carreras si vuelves al garaje sin entrar.
    function noteLoggedOut() {
      if (loggedOutNoted) return;
      loggedOutNoted = true;
      setArmed(false);
      queueLog('Session closed (timeout): you need to sign in again.');
    }

    /* ---- re-login automatico (SSO de un clic) ---- */
    // Cuando el aviso de sesion caduca de verdad, la app deja la pestana en
    // /login con #timeout-... y el bot se quedaba mirando la pantalla: la tanda
    // moria ahi. Si el bot estaba trabajando en ese momento, se pulsa el boton
    // del proveedor configurado (ClassLink por defecto: "Log In with ClassLink") y,
    // al volver, la cola retoma las carreras.
    //
    // Solo se pulsa el proveedor configurado y nunca usuario/contrasena: entrar
    // por otro SSO podria abrir una cuenta distinta, y escribir credenciales
    // desde un userscript no es algo que este script haga. Si el proveedor pide
    // algo (elegir cuenta, contrasena, captcha), se deja la pantalla tal cual.

    const SSO_LABEL = {
      google: 'Google',
      classlink: 'ClassLink',
      clever: 'Clever',
      facebook: 'Facebook',
    };

    // Cuanto dura el recuerdo del ultimo login. Pasado ese plazo se vuelve al
    // proveedor de CONFIG: una costumbre vieja no debe decidir para siempre.
    const LAST_LOGIN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
    const LOGIN_MEMORY_KEY = 'ntQueue:lastLogin';

    function savedLogin() {
      try {
        const raw = disk.get(LOGIN_MEMORY_KEY, '');
        const saved = raw ? JSON.parse(raw) : null;
        return saved && typeof saved === 'object' ? saved : null;
      } catch {
        return null;
      }
    }

    function lastLoginMethod() {
      const saved = savedLogin();
      if (!saved) return null;
      const at = Number(saved.at);
      if (!Number.isFinite(at) || Date.now() - at > LAST_LOGIN_MAX_AGE) return null;
      if (saved.method === 'manual') return 'manual';
      return SSO_LABEL[saved.method] ? saved.method : null;
    }

    function configuredSsoProvider() {
      const wanted = String(CONFIG.queue.sso || 'google').toLowerCase();
      return SSO_LABEL[wanted] ? wanted : 'google';
    }

    // null = el ultimo login fue manual: no se pulsa ningun SSO solo.
    function autoSsoProvider() {
      const remembered = lastLoginMethod();
      if (remembered === 'manual') return null;
      return remembered || configuredSsoProvider();
    }

    function ssoProvider() {
      return autoSsoProvider() || configuredSsoProvider();
    }

    function noteManualRelogin() {
      if (reloginManualNoted) return;
      reloginManualNoted = true;
      queueLog('Session dropped: the last sign-in used the username and password form; the bot will not press an SSO by itself.');
      storeNotice('Session closed: sign in yourself (last time you used the login form); the bot resumes after.');
    }

    const isSignUpLabel = (text) => /sign ?up|register/.test(text);

    // El SSO puede venir como <button>, <a> o <input type="button|submit">.
    // `textContent` de un input esta vacio: su etiqueta es `value`.
    function controlLabel(el) {
      if (!el) return '';
      return normalize(el.tagName === 'INPUT' ? el.value : el.textContent);
    }

    // Solo el boton de entrar: si la pantalla tuviera tambien "Sign up with
    // Google", pulsar ese abriria otra cuenta.
    function findLoginButton(name) {
      const button = findButton((text) => !isSignUpLabel(text) && text.includes(name) && text.includes('log in'))
        || findButton((text) => !isSignUpLabel(text) && text.includes(name));
      if (button) return button;

      for (const el of document.querySelectorAll('input[type="button"], input[type="submit"]')) {
        const label = controlLabel(el);
        if (!label || isSignUpLabel(label) || !label.includes(name)) continue;
        if (usable(el)) return el;
      }
      return null;
    }

    // Proveedor y boton que se usarian ahora. Si hay un SSO recordado, manda
    // ese y NUNCA se cambia por otro: pulsar un proveedor distinto podria abrir
    // una cuenta que no es la tuya. Si su boton no esta, se espera y se recarga.
    // CONFIG solo decide cuando no hay recuerdo (primer uso o recuerdo
    // caducado) o cuando el ultimo login fue el formulario.
    function resolveLoginTarget() {
      const provider = autoSsoProvider();
      if (!provider) return { provider: null, manual: true, button: null, label: null };

      return {
        provider,
        manual: false,
        button: findLoginButton(provider),
        label: SSO_LABEL[provider],
      };
    }

    function loginFormPresent() {
      const field = document.querySelector('input[type="password"]');
      return Boolean(field && usable(field));
    }

    const LOGIN_RELOAD_KEY = 'loginReloads';
    // La fecha del reintento vive en sessionStorage: sobrevive a una recarga de
    // la misma pestaña y permite que el panel del garaje enseñe la cuenta atrás
    // real aunque la cola haya navegado fuera de /login.
    const LOGIN_RETRY_KEY = 'loginRetryAt';

    function loginReloadBudget() {
      const saved = store.get(LOGIN_RELOAD_KEY, []);
      const now = Date.now();
      return Array.isArray(saved)
        ? saved.filter((at) => Number.isFinite(Number(at)) && now - Number(at) < CONFIG.queue.loginReloadWindowMs)
        : [];
    }

    function canReloadLogin() {
      return loginReloadBudget().length < CONFIG.queue.loginReloadMax;
    }

    // Aviso pequeno en la esquina de /login mientras el bot recarga una
    // pantalla caducada. Solo los botones capturan el puntero; el resto del
    // aviso deja pasar los clics a la pagina. `Cancel` devuelve la pantalla al
    // humano hasta que navegue, y `Reload now` no espera el respiro.
    function hideLoginCancelledNotice() {
      if (loginCancelledTimer) {
        clearLater(loginCancelledTimer);
        loginCancelledTimer = null;
      }
      if (!loginCancelledNotice) return;
      loginCancelledNotice.remove();
      loginCancelledNotice = null;
    }

    function hideLoginRefreshBadge() {
      hideLoginCancelledNotice();
      if (loginRefreshTick) {
        clearInterval(loginRefreshTick);
        loginRefreshTick = null;
      }
      if (!loginRefreshBadge) return;
      loginRefreshBadge.remove();
      loginRefreshBadge = null;
    }

    function loginRefreshDetail(label) {
      const left = loginReloadAt ? Math.max(0, loginReloadAt - Date.now()) : 0;
      const total = CONFIG.queue.loginReloadMax;
      const remaining = Math.max(0, total - loginReloadBudget().length);
      const budget = `${remaining}/${total} reload${total === 1 ? '' : 's'} left`;
      return left > 0
        ? `Reloading to sign in with ${label} in ${(left / 1000).toFixed(1)}s… · ${budget}`
        : `Reloading to sign in with ${label}… · ${budget}`;
    }

    function paintLoginRefreshBadge() {
      if (!loginRefreshBadge || !loginRefreshBadge.isConnected) return;
      const label = loginRefreshBadge.dataset.ntaLoginRefreshLabel || '';
      const detail = loginRefreshBadge.querySelector('[data-nta-login-refresh-body]');
      if (detail) detail.textContent = loginRefreshDetail(label);
    }

    function ensureLoginRefreshTick() {
      if (loginRefreshTick || !loginReloadAt) return;
      loginRefreshTick = setInterval(() => {
        if (!loginRefreshBadge || !loginRefreshBadge.isConnected) {
          hideLoginRefreshBadge();
          return;
        }
        paintLoginRefreshBadge();
        if (!loginReloadAt || Date.now() >= loginReloadAt) {
          clearInterval(loginRefreshTick);
          loginRefreshTick = null;
        }
      }, 250);
    }

    function cancelLoginRefresh() {
      loginManualHold = true;
      loginHumanAt = Date.now();
      clearLoginRetry();
      if (loginReloadTimer) {
        clearLater(loginReloadTimer);
        loginReloadTimer = null;
      }
      loginReloadAt = 0;
      hideLoginRefreshBadge();
      showLoginCancelledNotice();
      queueLog('Login: automatic refresh cancelled; the login screen is yours until you leave it.');
    }

    // Cancel no deja un hueco mudo: el aviso desaparece, pero queda unos
    // segundos la confirmacion de que el bot no va a recargar ni pulsar SSO.
    function showLoginCancelledNotice(
      text = 'Auto-refresh off. Sign in manually; the bot will wait on this screen.',
      marker = 'cancelled',
      ttl = 6000,
    ) {
      if (!document.body) return;
      hideLoginCancelledNotice();
      const notice = document.createElement('div');
      notice.dataset.ntaLoginStatus = marker;
      if (marker === 'cancelled') notice.dataset.ntaLoginCancelled = '1';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      notice.setAttribute('aria-atomic', 'true');
      const accent = marker === 'budget' ? '#e7c66a' : '#8fe3b3';
      notice.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'box-sizing:border-box',
        'max-width:min(320px, calc(100vw - 32px))',
        'padding:10px 12px',
        'border:1px solid rgba(255,255,255,.22)',
        `border-left:3px solid ${accent}`,
        'border-radius:10px',
        'background:rgba(18,20,24,.97)',
        'color:#dfe9e3',
        'font:600 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif',
        'letter-spacing:.01em',
        'box-shadow:0 8px 28px rgba(0,0,0,.38)',
        'pointer-events:none',
      ].join(';');
      notice.textContent = text;
      document.body.appendChild(notice);
      loginCancelledNotice = notice;
      loginCancelledTimer = later(() => {
        loginCancelledTimer = null;
        if (loginCancelledNotice) {
          loginCancelledNotice.remove();
          loginCancelledNotice = null;
        }
      }, ttl);
    }

    function showLoginRefreshBadge(label) {
      if (!document.body) return;
      if (loginRefreshBadge && loginRefreshBadge.isConnected) {
        loginRefreshBadge.dataset.ntaLoginRefreshLabel = label;
        paintLoginRefreshBadge();
        ensureLoginRefreshTick();
        return;
      }

      const badge = document.createElement('div');
      badge.dataset.ntaLoginRefresh = '1';
      badge.dataset.ntaLoginRefreshLabel = label;
      badge.setAttribute('role', 'status');
      badge.setAttribute('aria-live', 'polite');
      badge.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'box-sizing:border-box',
        'max-width:min(320px, calc(100vw - 32px))',
        'padding:10px 12px',
        'border:1px solid rgba(143,227,179,.34)',
        'border-radius:10px',
        'background:rgba(14,18,24,.96)',
        'color:#eaf2ee',
        'font:600 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif',
        'letter-spacing:.01em',
        'box-shadow:0 8px 28px rgba(0,0,0,.38)',
        'pointer-events:none',
      ].join(';');
      const title = document.createElement('div');
      title.textContent = 'Session expired';
      title.style.cssText = 'margin-bottom:2px;color:#8fe3b3;font-size:10px;letter-spacing:.09em;text-transform:uppercase';
      const detail = document.createElement('div');
      detail.dataset.ntaLoginRefreshBody = '1';
      detail.textContent = loginRefreshDetail(label);
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:6px;margin-top:8px;pointer-events:none';
      const reload = document.createElement('button');
      reload.type = 'button';
      reload.dataset.ntaLoginRefreshReload = '1';
      reload.textContent = 'Reload now';
      reload.style.cssText = 'pointer-events:auto;cursor:pointer;border:1px solid rgba(143,227,179,.5);border-radius:6px;background:#1c6b45;color:#f2fff7;font:700 11px/1 inherit;padding:6px 8px';
      reload.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (loginReloadTimer) {
          clearLater(loginReloadTimer);
          loginReloadTimer = null;
        }
        loginReloadAt = 0;
        queueLog('Login: reloading now from the on-page notice.');
        hideLoginRefreshBadge();
        location.reload();
      });
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.dataset.ntaLoginRefreshCancel = '1';
      cancel.textContent = 'Cancel';
      cancel.style.cssText = 'pointer-events:auto;cursor:pointer;border:1px solid rgba(255,255,255,.22);border-radius:6px;background:transparent;color:#dfe9e3;font:600 11px/1 inherit;padding:6px 8px';
      cancel.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        cancelLoginRefresh();
      });
      actions.append(reload, cancel);
      badge.append(title, detail, actions);
      document.body.appendChild(badge);
      loginRefreshBadge = badge;
      ensureLoginRefreshTick();
    }

    // El hash de timeout trae varios numeros: #timeout-1800-<inicio>-<fin>.
    // Para el LOG solo importa el motivo, no los timestamps.
    function loginReasonFromHash(hash) {
      let raw = String(hash || '').replace(/^#/, '');
      try { raw = decodeURIComponent(raw); } catch { /* conserva el hash crudo */ }
      raw = raw.trim();
      if (!raw) return '';
      if (/^timeout(?:-\d+)*$/i.test(raw)) return 'timeout';
      return raw.replace(/-[0-9]+$/, '');
    }

    // El presupuesto corto evita un bucle de recargas, pero no debe convertir
    // el login en una parada definitiva: pasados unos minutos se vuelve a
    // intentar el mismo SSO recordado, sin escribir credenciales ni cambiar de
    // proveedor. Asi una caida de red o un SSO lento no exige que estes delante.
    function clearLoginRetry() {
      if (loginRetryTimer) {
        clearLater(loginRetryTimer);
        loginRetryTimer = null;
      }
      loginRetryAt = 0;
      store.remove(LOGIN_RETRY_KEY);
    }

    // Se ejecuta cuando vence la espera. Si la pestaña ya no esta en /login,
    // vuelve a entrar en ella: el SSO solo se puede pulsar alli. Es una
    // navegacion normal, no un clic ni una credencial.
    function fireLoginRetry() {
      store.remove(LOGIN_RETRY_KEY);
      if (loginManualHold) return;
      if (signedIn()) {
        clearLoginRetry();
        return;
      }
      if (loginHumanAt && Date.now() - loginHumanAt < CONFIG.queue.loginHumanHoldMs) {
        scheduleLoginRetry();
        return;
      }

      // Se vuelve a dar margen al SSO. El pendiente se renueva para que la
      // vuelta correcta tambien rearme la cola.
      store.remove(LOGIN_RELOAD_KEY);
      store.set('reloginAttempts', 0);
      store.set('reloginPending', { at: Date.now(), afk: true });
      reloginGaveUp = false;
      loginReloadGaveUp = false;
      loginSeenAt = 0;
      loginRecoveryCleared = false;

      const label = SSO_LABEL[ssoProvider()];
      if (!location.pathname.startsWith('/login')) {
        // `navigate` ignora la orden si ya hay otra redireccion en vuelo. La
        // cita no se puede perder por eso: se reprograma corta y se reintenta
        // cuando el navegador este libre.
        if (redirecting) {
          queueLog('Login: retry due while another redirect is in flight; retrying in 1 min.');
          scheduleLoginRetry(60000);
          return;
        }
        queueLog(`Login: retry due; opening /login for ${label}.`);
        storeNotice(`Login retry: opening the sign-in screen for ${label}.`);
        navigate('/login');
        return;
      }

      queueLog(`Login: unattended retry for ${label} after the pause.`);
      storeNotice(`Retrying ${label} sign-in automatically.`);
      handleLoginPage();
    }

    // Adelanta la cita desde el panel del garaje. Con sesion viva solo retira
    // la cita; con una redireccion en vuelo, fireLoginRetry la reprograma. El
    // proveedor recordado no se toca y nunca se escriben credenciales.
    function retryLoginNow() {
      if (!loginRetryAt) return false;
      if (signedIn()) {
        clearLoginRetry();
        queueLog('Login: session is already live; retry cancelled.');
        return true;
      }
      if (loginManualHold) {
        queueLog('Login: manual sign-in is in progress; the retry stays scheduled.');
        return false;
      }
      clearLoginRetry();
      queueLog('Login: retry moved up from the garage panel.');
      fireLoginRetry();
      return true;
    }

    // `at` permite restaurar una fecha guardada tras una recarga; sin el se
    // programa la espera completa de CONFIG.queue.loginRetryMs.
    function scheduleLoginRetry(delayMs = CONFIG.queue.loginRetryMs, at = 0) {
      if (loginRetryTimer || loginManualHold) return false;
      if (!(CONFIG.queue.loginRetryMs > 0) && !at) return false;

      const target = at > 0 ? Number(at) : Date.now() + Math.max(0, Number(delayMs) || 0);
      if (!Number.isFinite(target) || target <= 0) return false;

      const label = SSO_LABEL[ssoProvider()];
      loginRetryAt = target;
      store.set(LOGIN_RETRY_KEY, target);
      loginRetryTimer = later(() => {
        loginRetryTimer = null;
        loginRetryAt = 0;
        fireLoginRetry();
      }, Math.max(0, target - Date.now()));

      const left = Math.max(0, target - Date.now());
      queueLog(`Login: will retry ${label} automatically in ${Math.max(1, Math.round(left / 60000))} min.`);
      return true;
    }

    // Una recarga o una navegacion no deben perder la cita. Si la fecha ya
    // vencio, el trabajador la dispara de inmediato.
    function restoreLoginRetry() {
      if (loginRetryTimer || loginManualHold) return false;
      const at = Number(store.get(LOGIN_RETRY_KEY, 0)) || 0;
      if (!at) return false;
      if (signedIn()) {
        clearLoginRetry();
        return false;
      }
      return scheduleLoginRetry(0, at);
    }

    window.__ntaDebug.loginRetryArm = (ms = CONFIG.queue.loginRetryMs) => {
      clearLoginRetry();
      return scheduleLoginRetry(Math.max(0, Number(ms) || 0));
    };
    window.__ntaDebug.loginRetryCancel = () => {
      clearLoginRetry();
      return true;
    };
    window.__ntaDebug.loginRetryNow = () => retryLoginNow();

    // Un login atascado (sin boton, o que vuelve a /login tras pulsar el SSO)
    // se recarga solo. El presupuesto vive en sessionStorage, asi que sobrevive
    // a la recarga y no puede convertirse en un bucle.
    function reloadLoginPage(why) {
      if (loginReloadTimer) return;

      if (!canReloadLogin()) {
        loginReloadAt = 0;
        hideLoginRefreshBadge();
        if (!loginReloadGaveUp) {
          loginReloadGaveUp = true;
          queueLog(`Login: ${why}; the reload budget is spent, sign in yourself and the bot carries on.`);
          storeNotice('Login screen stuck (reloads spent): sign in yourself and the bot resumes.');
          showLoginCancelledNotice(
            `Auto-refresh paused: ${CONFIG.queue.loginReloadMax} reloads used. Sign in manually; the bot will wait on this screen.`,
            'budget',
            9000,
          );
        }
        scheduleLoginRetry();
        return;
      }

      const delay = humanDelay(CONFIG.queue.loginReloadDelayMs);
      loginReloadAt = Date.now() + delay;
      loginReloadTimer = later(() => {
        loginReloadTimer = null;
        loginReloadAt = 0;
        if (!location.pathname.startsWith('/login')) { hideLoginRefreshBadge(); return; }
        if (loginHumanAt && Date.now() - loginHumanAt < CONFIG.queue.loginHumanHoldMs) {
          hideLoginRefreshBadge();
          return;
        }

        const list = loginReloadBudget();
        list.push(Date.now());
        store.set(LOGIN_RELOAD_KEY, list.slice(-CONFIG.queue.loginReloadMax));
        noteFailure('login', why);
        queueLog(`Login: ${why}; reloading the page (${list.length}/${CONFIG.queue.loginReloadMax} in this window).`);
        storeNotice('Login screen stuck: reloading it to try the last sign-in again.');
        hideLoginRefreshBadge();
        location.reload();
      }, delay);

      queueLog(`Login: ${why}; reloading in ${(delay / 1000).toFixed(1)}s.`);
    }

    window.__ntaDebug.loginTarget = () => {
      const target = resolveLoginTarget();
      return {
        provider: target.provider || null,
        manual: target.manual,
        button: target.button ? controlLabel(target.button) : null,
      };
    };
    window.__ntaDebug.loginTick = () => {
      handleLoginPage();
      return Boolean(reloginTimer);
    };
    window.__ntaDebug.loginScheduled = () => Boolean(reloginTimer);
    window.__ntaDebug.loginCancel = () => {
      clearRelogin();
      if (loginReloadTimer) {
        clearLater(loginReloadTimer);
        loginReloadTimer = null;
      }
      loginReloadAt = 0;
      loginManualHold = false;
      loginHumanAt = 0;
      hideLoginRefreshBadge();
      clearLoginRetry();
    };
    window.__ntaDebug.loginReloadPlan = () => ({ used: loginReloadBudget().length, can: canReloadLogin() });
    window.__ntaDebug.loginReloadPending = () => Boolean(loginReloadTimer);
    window.__ntaDebug.loginRetryPending = () => Boolean(loginRetryTimer);
    window.__ntaDebug.loginRetryIn = () => Math.max(0, loginRetryAt - Date.now());
    window.__ntaDebug.loginReason = (hash) => loginReasonFromHash(hash);
    window.__ntaDebug.queueArmed = () => isArmed();
    window.__ntaDebug.armedReset = () => {
      armedCache = null;
      lastArmedWrite = 0;
      store.remove('armedAt');
    };
    window.__ntaDebug.reloginResume = () => {
      resumeAfterRelogin();
      return { armed: isArmed(), pending: Boolean(store.get('reloginPending', null)) };
    };

    function clearReloginAttempts() {
      if (store.get('reloginAttempts', 0) !== 0) store.set('reloginAttempts', 0);
    }

    // Una sesion confirmada salda el presupuesto de un login atascado: los
    // intentos, las recargas y el aviso de rendicion. Si la sesion vuelve a
    // caer dentro de los 30 min, el bot tiene margen otra vez en vez de pedir
    // ayuda con el contador ya gastado. Se hace una sola vez por carga.
    function clearLoginRecovery() {
      if (loginRecoveryCleared) return;
      loginRecoveryCleared = true;
      clearReloginAttempts();
      store.remove(LOGIN_RELOAD_KEY);
      if (loginReloadTimer) {
        clearLater(loginReloadTimer);
        loginReloadTimer = null;
      }
      loginReloadAt = 0;
      loginReloadGaveUp = false;
      loginManualHold = false;
      hideLoginRefreshBadge();
      clearLoginRetry();
    }

    window.__ntaDebug.loginRecoveryClear = () => {
      loginRecoveryCleared = false;
      clearLoginRecovery();
      return {
        used: loginReloadBudget().length,
        attempts: Number(store.get('reloginAttempts', 0)) || 0,
        gaveUp: loginReloadGaveUp,
      };
    };

    function handleLoginPage() {
      // Cancelar el aviso es una orden para esta carga: no se vuelve a
      // recargar ni a pulsar un SSO hasta que el humano navegue.
      if (loginManualHold) return;

      if (!loginSeenAt) {
        loginSeenAt = Date.now();
        // Un login nuevo vuelve a habilitar la limpieza al confirmar la sesion.
        loginRecoveryCleared = false;
      }

      // El motivo viene en el hash (#timeout-2, #expired...): una linea en el
      // log explica por que aparecio esta pantalla sin tener que adivinarlo.
      const reason = loginReasonFromHash(location.hash);
      if (reason && reason !== loginReasonNoted) {
        loginReasonNoted = reason;
        queueLog(`Login page: ${reason}.`);
      } else if (!reason && !loginReasonNoted) {
        loginReasonNoted = 'manual';
        queueLog('Login page: no expiry marker; the bot still tries the last sign-in when you are not touching it.');
      }

      // Vuelta del SSO (code/state en la URL): la sesion se esta creando. No se
      // pulsa nada aqui para no interrumpir el callback con un segundo intento.
      if (/[?&](code|state)=/.test(location.search)) return;

      // "Siempre": ya no se exige el hash de caducidad ni que el bot estuviera
      // armado. Si has tocado la pantalla hace poco se te deja terminar; pasado
      // el respiro, el bot toma el relevo y prueba el ultimo login.
      if (loginHumanAt && Date.now() - loginHumanAt < CONFIG.queue.loginHumanHoldMs) return;

      const target = resolveLoginTarget();
      const manualLast = target.manual;
      const provider = target.provider || configuredSsoProvider();
      const label = SSO_LABEL[provider];

      if (!CONFIG.queue.autoRelogin) {
        noteLoggedOut();
        return;
      }

      // El sitio deja /login#timeout-... cuando la sesion ya no vale. Pulsar
      // el SSO sobre esa pantalla muerta no devuelve sesion: primero se quita
      // el hash y se recarga; el pase siguiente ya entra limpio y pulsa el SSO.
      if (/^#timeout\b/i.test(location.hash)) {
        if (location.hash !== loginTimeoutHash) {
          loginTimeoutHash = location.hash;
          queueLog(`Login: timeout page; refreshing before trying ${label}.`);
          try { history.replaceState(null, '', location.pathname + location.search); } catch { /* url bloqueada */ }
        }
        if (!loginReloadTimer) reloadLoginPage('the login page carried a timeout marker');
        if (loginReloadTimer) {
          showLoginRefreshBadge(label);
          return;
        }
        // Sin presupuesto de recargas: se intenta el SSO en esta pantalla y el
        // aviso de presupuesto agotado se queda visible mientras tanto.
      }

      if (manualLast) {
        noteLoggedOut();
        noteManualRelogin();
        // Un formulario roto (sin campo de contrasena) no se puede enviar:
        // recargarlo es lo unico que puede desatascarlo.
        if (!loginFormPresent()) reloadLoginPage('the login form is missing');
        return;
      }

      const pending = store.get('reloginPending', null);
      const fresh = Boolean(pending) && Date.now() - pending.at < CONFIG.queue.reloginWindowMs;

      if (!fresh) {
        noteLoggedOut();
        store.set('reloginPending', { at: Date.now() });
        store.set('reloginAttempts', 0);
        reloginGaveUp = false;
        queueLog(`Session closed: trying to sign in again through ${label}.`);
        storeNotice(`Session closed: trying ${label} sign-in again.`);
      } else {
        noteLoggedOut();
      }

      if (reloginTimer || loginReloadTimer) return;

      const button = target.button;
      if (!button) {
        // La pagina no pinta el boton (marco a medias, marcado nuevo): se
        // recarga para desatascarla, con presupuesto para no entrar en bucle.
        if (Date.now() - loginSeenAt >= CONFIG.queue.loginNoButtonMs) {
          reloadLoginPage(`the ${label} sign-in button is missing`);
        }
        return;
      }

      const attempts = store.get('reloginAttempts', 0);
      if (attempts >= CONFIG.queue.reloginMaxAttempts) {
        if (canReloadLogin()) {
          // El SSO no devolvio sesion: recargar y reintentar en vez de rendirse.
          store.set('reloginAttempts', 0);
          reloadLoginPage(`${label} did not return a session after ${attempts} attempts`);
        } else if (!reloginGaveUp) {
          reloginGaveUp = true;
          queueLog(`${label} did not return a session after ${attempts} attempts and the login reloads are spent; sign in yourself and the bot carries on.`);
          storeNotice(`${label} did not return a session: sign in yourself and the bot resumes on its own.`);
        }
        // Tras el margen corto, otro intento desatendido. No cambia de SSO: si
        // el recordado no esta o no devuelve sesion, esto no inventa acceso.
        scheduleLoginRetry();
        return;
      }

      if (Date.now() - (lastPress.relogin || 0) < CONFIG.queue.reloginCooldownMs) return;

      const delay = humanDelay(CONFIG.queue.reloginDelayMs);
      reloginTimer = later(() => {
        reloginTimer = null;
        if (!button.isConnected) return;
        if (loginHumanAt && Date.now() - loginHumanAt < CONFIG.queue.loginHumanHoldMs) return;

        const n = store.get('reloginAttempts', 0) + 1;
        store.set('reloginAttempts', n);
        lastPress.relogin = Date.now();
        queueLog(`Login: pressing «${controlLabel(button)}» (attempt ${n}/${CONFIG.queue.reloginMaxAttempts}).`);
        dispatchClick(button);
      }, delay);

      queueLog(`Login: pressing «${controlLabel(button)}» in ${(delay / 1000).toFixed(1)}s.`);
    }

    // Vuelta de un re-login automatico: si el bot estaba en marcha cuando cayo
    // la sesion, se vuelve a armar para que la cola retome las carreras sola.
    function resumeAfterRelogin() {
      const pending = store.get('reloginPending', null);
      if (!pending) return;

      const attempts = store.get('reloginAttempts', 0);
      store.remove('reloginPending');
      // Un login manual puede llegar mucho despues de que el bot se rindiera:
      // se rearma la cola igualmente dentro de un margen razonable. La ventana
      // corta sigue midiendo los intentos automaticos, no la vuelta del humano.
      if (Date.now() - pending.at > CONFIG.queue.reloginResumeMs) return;

      clearReloginAttempts();
      store.remove(LOGIN_RELOAD_KEY);
      loginReloadGaveUp = false;
      loginSeenAt = 0;
      if (loginReloadTimer) {
        clearLater(loginReloadTimer);
        loginReloadTimer = null;
      }
      loginReloadAt = 0;
      loginManualHold = false;
      hideLoginRefreshBadge();
      setArmed(true);
      clearLoginRetry();

      // El aviso cambia segun lo que paso de verdad: si se llego a pulsar el
      // SSO, se dice; si la sesion simplemente seguia viva (la app reboto de
      // /login sola), no se atribuye nada al proveedor.
      const provider = ssoProvider();
      // Un re-login automatico correcto renueva el recuerdo: la proxima caida
      // vuelve a usar el mismo proveedor aunque hayan pasado semanas.
      if (attempts > 0) disk.set(LOGIN_MEMORY_KEY, JSON.stringify({ method: provider, at: Date.now() }));
      const label = SSO_LABEL[provider];
      const via = attempts > 0 ? ` through ${label}` : '';
      queueLog(`Session recovered${via}; resuming races.`);
      storeNotice(attempts > 0 ? `Session recovered on its own through ${label}.` : 'Session alive again; resuming races.');
    }

    // El modal de la descalificacion se cierra SIEMPRE, y hacia el garaje: desde
    // ahi se abre la siguiente carrera. Funciona tambien con el tipador parado,
    // que era el otro final sin salida.
    //
    // El clic se confirma, no se da por hecho: el juego repinta el modal (React
    // lo desmonta y lo vuelve a pintar) y el boton que se guardo al programar la
    // pulsacion puede estar ya fuera del documento. Con el pestillo de antes,
    // ese fallo en silencio dejaba la pagina clavada en el modal para siempre
    // (y el vigilante lo contaba como progreso, asi que tampoco recargaba).
    // Ahora se busca el boton otra vez en el momento de pulsar y, si el modal
    // sigue en pantalla, se reintenta con respiro; tras unos intentos se sale
    // por el garaje, que siempre esta.
    function dqButton() {
      const garage = findButton((label) => label.includes('your garage'));
      const again = findButton((label) => /race again|play again|next race/.test(label));
      return garage || again;
    }

    // Castigo por racha de DQ ("Too Many Disqualifications … wait a few
    // minutes"): ni el garaje ni «Race Now» lo arreglan, y cada vuelta gasta un
    // intento de los que el sitio cuenta. Vive en la cola porque este aviso sale
    // en la ventana principal: el vigilante del tipador solo ve el iframe de la
    // carrera. La espera dobla con cada bloqueo seguido (15 -> 30 -> 60 -> 90
    // min) y una carrera que llega al final la devuelve al minimo.
    function blockUntil() {
      return Number(disk.get(DQ_BLOCK_UNTIL, 0)) || 0;
    }

    function noteDqBlock() {
      // Un «Race Now» ya programado dispara por detras del aviso (el modal no
      // bloquea el clic, solo tapa): la carrera se abre, vuelve el modal y el
      // rebote suma. Se cancela aqui, que es donde se sabe que hay castigo.
      clearRaceNow();

      const until = blockUntil();
      if (until > Date.now()) return until;

      // La espera ya vencio y el aviso sigue en pantalla. Puede que el castigo
      // este levantado y lo que quede sea la pantalla vieja: se recarga una vez
      // para mirar ANTES de doblar la espera. Sin esto el aviso se relee
      // identico en cada vuelta, la espera dobla sola (15 -> 30 -> 60 -> 90) y
      // la cuenta se queda aguantando un castigo que ya no existe sin llegar a
      // comprobarlo nunca.
      const checkedAt = Number(disk.get(DQ_BLOCK_CHECKED_AT, 0)) || 0;

      // Una comprobacion vale solo para la espera en la que se hizo: se hace con
      // la espera ya vencida, asi que su hora queda por delante de `until`. Una
      // marca de un bloqueo anterior no cuenta, y por eso no hace falta borrarla
      // por tiempo: aquel borrado a los 60 s se llevaba por delante la etapa con
      // el castigo todavia vivo (basta con quedarse en el garaje, donde el aviso
      // no se pinta).
      const alreadyChecked = until > 0 && checkedAt >= until;

      if (until && !alreadyChecked && !dqBlockReloaded) {
        dqBlockReloaded = true;
        disk.set(DQ_BLOCK_CHECKED_AT, String(Date.now()));
        queueLog('The block wait is over: reloading once to see whether the site lifted it.');
        noteProgress();
        location.reload();
        return until;
      }

      // La comprobacion es de hace un momento: la esta haciendo otra pestana (o
      // esta pagina acaba de recargar y aun no pinto el aviso). Escalar aqui era
      // duplicar el castigo por detras de una recarga ajena.

      // La espera vencio, se miro y el aviso sigue ahi: se dobla. La etapa va en
      // localStorage porque el tipador la lee y la escribe tambien (con
      // sessionStorage cada mitad llevaba su propia cuenta y los dos paneles
      // ensenaban esperas distintas).
      if (alreadyChecked && Date.now() - checkedAt < 8000) return until;

      const stage = Math.max(0, Number(disk.get(DQ_BLOCK_STAGE, 0)) || 0);
      const ms = dqBlockWaitMs(stage);
      disk.remove(DQ_BLOCK_CHECKED_AT);
      disk.set(DQ_BLOCK_STAGE, String(Math.min(stage + 1, DQ_BLOCK_STAGE_MAX)));
      disk.set(DQ_BLOCK_UNTIL, String(Date.now() + ms));

      const minutes = Math.round(ms / 60000);
      noteFailure('site block', `${minutes} min after too many disqualifications`);
      queueLog(`The site blocked the account for too many disqualifications: no race for ${minutes} min.`);
      storeNotice(`Site block after too many disqualifications: the queue waits ${minutes} min on its own.`);
      beep('block');
      paintGaragePanel();
      return Date.now() + ms;
    }

    function clearDqModal(cachedText) {
      if (!document.body) return false;

      // El tick lee el modal una vez y comparte el texto con handleModal: leer
      // dos veces los mismos nodos fuerza dos veces el layout de la pagina.
      const text = cachedText === undefined ? modalText() : cachedText;
      if (!looksDisqualified(text)) {
        dqPressAt = 0;
        dqPressTries = 0;
        return false;
      }

      // Castigo por racha: no se pulsa nada hasta que pase. Antes se cerraba el
      // modal yendo al garaje, y el garaje abria otra carrera que volvia al
      // mismo aviso: una vuelta cada pocos segundos durante todo el castigo.
      if (looksDqBlocked(text)) {
        noteDqBlock();
        return true;
      }

      const target = dqButton();

      // Modal aun sin botones (esta pintandose): se reintenta en el proximo tick.
      if (!target) return true;

      // Ya se intento cerrar varias veces y sigue ahi: se sale por el garaje.
      if (dqPressTries >= 3 && !location.pathname.startsWith('/garage')) {
        queueWhy('The disqualification modal will not close: going to the garage.');
        navigate('/garage');
        return true;
      }

      if (dqPressTimer) return true;
      if (dqPressAt && Date.now() - dqPressAt < DQ_RETRY_MS) return true;

      dqPressAt = Date.now();
      dqPressTries += 1;
      const tries = dqPressTries;
      const delay = humanDelay(CONFIG.queue.dqModalDelayMs);
      queueLog(`Disqualification modal: «${normalize(target.textContent)}» in ${(delay / 1000).toFixed(1)}s${tries > 1 ? ` (try ${tries})` : ''}.`);

      dqPressTimer = later(() => {
        dqPressTimer = null;
        // El modal puede haberse repintado mientras se esperaba: se busca de
        // nuevo, en vez de pulsar el nodo viejo (que ya no esta en el documento).
        const fresh = dqButton();
        if (!fresh) {
          dqPressAt = 0;   // desaparecio o se esta repintando: siguiente latido
          return;
        }
        queuePress('dqModal', fresh);
      }, delay);

      return true;
    }

    function tick() {
      // Eleccion de copia en esta ventana: la que no manda no pulsa nada.
      if (!refreshQueueRole()) return;

      // Farmeo AFK: la cola sigue trabajando con la pestana oculta (el reloj
      // Worker evita el clamp de 1 s). Solo con el modo apagado se limita a la
      // sesion: el aviso de caducidad y la renovacion del token no pueden
      // esperar a que vuelvas, y sin carrera viva una recarga no rompe nada.
      if (hiddenBlocked()) {
        const hiddenState = typerState();
        const racing = Boolean(hiddenState && !hiddenState.stopped
          && (hiddenState.typing || hiddenState.chars > 0));
        if (!racing) {
          if (handleSessionWarning()) return;
          refreshSessionBeforeExpiry();
        }
        return;
      }

      // El modal de DQ se atiende antes que nada: es lo que dejaba la pagina
      // clavada cuando el tipador estaba parado o de descanso. El texto se lee
      // una sola vez por tick y se reutiliza al final.
      const modal = modalText();
      if (clearDqModal(modal)) return;

      // El popup de Daily Challenge tambien cae en esta ventana: es el garaje
      // quien lo ve al volver de la carrera.
      if (closeChallengePopup()) return;

      if (redirecting || !document.body) return;

      // Aviso de sesion ("Logout Warning"): pulsarlo recarga la app y renueva
      // la sesion. Mientras esta en pantalla, lo demas sobra.
      if (handleSessionWarning()) return;

      // Sin aviso, el token se renueva un poco antes de vencer: entre carreras
      // una recarga es inocua y evita que la sesion caiga a mitad de la tanda.
      if (refreshSessionBeforeExpiry()) return;

      // Sin sesion no hay nada que automatizar: ni «Race Now», ni caja, ni
      // navegaciones, ni recargas del vigilante. Antes el garaje de invitado se
      // armaba solo y el sitio devolvia la misma pagina cada pocos segundos (se
      // veia como recargas); encima, el boton de entrar no hacia nada porque el
      // SSO se pulsaba dos veces. En /login manda handleLoginPage.
      if (!location.pathname.startsWith('/login') && !signedIn()) {
        handleSignedOut();
        return;
      }
      signedOutNoted = false;

      // Captcha resuelto: el modal espera un Continue que recarga la app. Se
      // atiende antes que nada para no navegar por detras del modal.
      if (clickCaptchaContinue(document)) return;

      const state = typerState();
      if (state) {
        // En el garaje manda syncGaragePanel, no esta linea: un tipador parado
        // que sigue publicando su estado desarmaba justo despues de que el
        // garaje armara, y los dos se turnaban cada segundo (arma/desarma sin
        // parar, con el panel parpadeando y sin abrir nunca carrera). Fuera de
        // /race el boton de parar es del garaje.
        const racePage = location.pathname === '/race' || location.pathname.startsWith('/race/');
        if (racePage || !state.stopped) {
          // Parado es parado: ya no hay un modo NORMAL que mirar aparte.
          setArmed(!state.stopped);
        }
        if (state.typing || state.chars > 0) noteProgress();
      }
      if (noteTyperPublisher(state)) return;

      // La captcha es la excepcion: su frase no consta en el bundle y puede
      // venir fuera de un modal, asi que conserva el barrido completo del body.
      // En una carrera viva el tipador ya vigila el CAPTCHA desde su marco. Leer
      // `body.innerText` aqui cada segundo fuerza layout en la ventana padre y
      // se nota como tirones justo mientras el juego esta pintando la carrera.
      const liveRace = Boolean(state && !state.stopped
        && (state.typing || state.chars > 0)
        && (location.pathname === '/race' || location.pathname.startsWith('/race/')));
      if (!liveRace) {
        // `innerText` recorre el body y fuerza layout. La frase del CAPTCHA no
        // cambia sola: una lectura cada 3 s basta y deja respirar al garaje.
        const scanAt = Date.now();
        if (scanAt - captchaScanAt >= 3000) {
          captchaScanAt = scanAt;
          perfCounters.captchaScans += 1;
          if (handleCaptcha(pageText())) return;
        }
      }

      // Otra pestaña tiene el lease: esta cola no abre carreras ni reclama la
      // caja. Sigue atendiendo sesion, DQ y CAPTCHA, que son cosas de la pagina
      // y no duplican una carrera. El lease caduca solo, asi que esta pestaña
      // retoma el trabajo cuando la otra desaparezca.
      if (tabLeaseHeldByOther()) {
        if (!tabStandbyNoted) {
          tabStandbyNoted = true;
          queueLog('Another tab has the turn; this one stands by.');
        }
        noteProgress();
        return;
      }
      if (tabStandbyNoted) {
        tabStandbyNoted = false;
        queueLog('This tab has the turn again.');
      }

      // El vigilante va despues de la sesion y de la captcha: un aviso de sesion
      // o un CAPTCHA no son "nada se mueve" y no deben provocar una recarga que
      // borre lo que hay en pantalla. El modal de "currently in a race" se deja
      // para despues, como antes, para que su recuperacion siga siendo la ultima.
      watchStuck();

      if (handleModal(modal)) return;

      const path = location.pathname;
      if (path === '/login' || path.startsWith('/login/')) {
        handleLoginPage();
        return;
      }
      loginSeenAt = 0;

      // Fuera del login con el tipador trabajando: la sesion esta viva, asi que
      // un re-login anterior queda saldado y el proximo cierre podra intentarlo
      // de nuevo. Esto NO se hace estando en /login: alli el contador de
      // intentos tiene que aguantar para no reintentar en bucle.
      if (state && !state.stopped) clearReloginAttempts();

      // Vuelta de un re-login automatico: si el bot estaba en marcha cuando
      // cayo la sesion, se vuelve a armar y retoma las carreras solo.
      resumeAfterRelogin();

      // Un login manual correcto tambien salda el presupuesto: la proxima
      // caida no empieza con las recargas de la anterior ya gastadas.
      clearLoginRecovery();

      // Daily Mystery Box: handled before anything else so a claim and a "Race
      // Now" never land in the same tick.
      if (handleMysteryBox()) return;

      if (path === '/' || path === '/garage' || path.startsWith('/garage/')) {
        handleGaragePage();
        return;
      }
      if (path === '/race' || path.startsWith('/race/')) handleRacePage();
    }

    let hiddenLoopQueued = false;

    function loop() {
      onNavigate();
      syncGaragePanel();
      tick();

      // En segundo plano setInterval se clampa a 1/min: el reloj Worker mantiene
      // el latido de la cola al ritmo normal para abrir la siguiente carrera a
      // tiempo. Se reprograma solo mientras la pestana siga oculta.
      if (backgroundFarm() && document.visibilityState === 'hidden' && !hiddenLoopQueued) {
        hiddenLoopQueued = true;
        preciseSleep(CONFIG.queue.tickMs).then(() => {
          hiddenLoopQueued = false;
          if (backgroundFarm() && document.visibilityState === 'hidden' && !session.stopped) loop();
        });
      }
    }

    // Los atajos de mando viven en el tipador, dentro del marco de la carrera, y
    // el teclado solo llega al documento que tiene el foco. Sin este puente habia
    // que hacer clic DENTRO del iframe para que Alt+A/M/N hicieran algo: desde la
    // pantalla de resultados o desde la pagina alrededor parecian muertos. Se
    // reenvian a los marcos del mismo origen; Escape no se toca (cerrar dialogos
    // del navegador no puede apagar el bot).
    function forwardHotkeyToFrames(code, key) {
      const payload = {
        __ntaHotkey: true,
        key,
        code,
        altKey: true,
        ctrlKey: false,
        metaKey: false,
      };

      let sent = false;
      for (const frame of document.querySelectorAll('iframe')) {
        const win = frame.contentWindow;
        if (!win) continue;
        try {
          win.postMessage(payload, location.origin);   // solo mismo origen
          sent = true;
        } catch {
          /* marco ajeno: no se toca */
        }
      }
      return sent;
    }

    document.addEventListener('keydown', (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target;
      if (target && (target.isContentEditable
        || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ''))) {
        return;
      }

      // Alt+T y Alt+G viven en la ventana de arriba: el tema es global y el
      // garaje solo existe aqui. No se reenvian al iframe.
      if (event.code === 'KeyT') {
        cycleTheme();
        event.preventDefault();
        return;
      }
      if (event.code === 'KeyG') {
        if (toggleGarageFold()) event.preventDefault();
        return;
      }
      if (!/^Key[AMNSRHM]$/.test(event.code || '')) return;

      if (forwardHotkeyToFrames(event.code, event.key)) event.preventDefault();
    }, true);

    // Al pasar a segundo plano se cancelan las pulsaciones ya programadas: si no,
    // el primer temporizador que sobrevive abre carrera nada mas volver (o antes)
    // y esa carrera empieza sin manos. Al volver se reprograma todo con su pausa
    // humana normal; el rato oculto tampoco cuenta como atasco.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Con el farmeo AFK las pulsaciones programadas se mantienen: si se
        // cancelaran, cada cambio de pestana cortaria el encadenado.
        if (backgroundFarm()) return;
        clearContinue();
        clearRaceNow();
        clearIdleTimer();
        if (dqPressTimer) {
          clearLater(dqPressTimer);
          dqPressTimer = null;
          dqPressAt = 0;
          dqPressTries = 0;
        }
        return;
      }
      noteProgress();
      // Al volver, el latido periodico puede venir frenado hasta un minuto:
      // este tick inmediato reprograma las pulsaciones con su pausa normal.
      loop();
    });

    hookHistory();
    restoreLoginRetry();
    queueLog(`v${VERSION} · queue and recovery active (typing itself lives inside the race frame).`);
    loop();
    setInterval(loop, CONFIG.queue.tickMs);
  }

  /* ==========================================================================
   * 15. STICKERS (INSIDE THE RACE)
   * ========================================================================== */
  // Era el userscript "Auto Stickers": miraba cada 300 ms si existian las
  // opciones del chat y mandaba una en el 100% de las carreras. Aqui se sortea
  // una vez por carrera (CONFIG.stickers.chance) y solo con el reloj corriendo.
  //
  // El reto diario "10 Races with a Sticker" no avanza si el sorteo no toca:
  // mientras siga pendiente se manda en todas las carreras y, al completarlo,
  // vuelve el sorteo del 35%.
  function stickerChallengePending() {
    if (CONFIG.stickers.challengeBoost === false) return null;
    try {
      return challengeProgressAll().find((item) => item
        && Number(item.goal) > 0
        && Number(item.progress) < Number(item.goal)
        && /sticker/i.test(`${item.short || ''} ${item.title || ''}`)) || null;
    } catch {
      return null;
    }
  }

  // El garaje puede tardar en escribir `user.challenges`; mientras tanto el
  // contador se queda en 0 aunque el reto ya tenga carreras. Sin un tope, el
  // boost mandaria stickers en todas las carreras del dia. El libro vive en la
  // ventana de arriba (sobrevive a la recarga de cada carrera) y apunta el
  // progreso visto al empezar y los envios hechos: al llegar a la meta se
  // apaga aunque el progreso siga a 0.
  const localStickerBoost = {};

  function stickerBoostLedger() {
    try {
      const top = window.top;
      if (top && (!top.__ntaStickerBoost || typeof top.__ntaStickerBoost !== 'object')) {
        top.__ntaStickerBoost = {};
      }
      if (top && top.__ntaStickerBoost) return top.__ntaStickerBoost;
    } catch { /* otro origen */ }
    return localStickerBoost;
  }

  function stickerBoostPlan(challenge, ledger = stickerBoostLedger()) {
    if (!challenge || !ledger) return { boost: false, remaining: 0, entry: null };
    const key = String(challenge.key || challenge.title || 'sticker');
    const goal = Math.max(0, Number(challenge.goal) || 0);
    const progress = Math.max(0, Number(challenge.progress) || 0);
    let entry = ledger[key];
    if (!entry || !Number.isFinite(Number(entry.baseline))) {
      entry = { baseline: progress, sent: 0, at: Date.now() };
      ledger[key] = entry;
    }
    const used = Math.max(0, Number(entry.baseline) || 0) + Math.max(0, Number(entry.sent) || 0);
    const remaining = Math.max(0, goal - used);
    return { boost: remaining > 0, remaining, entry, key };
  }

  function noteStickerBoostSent(plan) {
    if (!plan || !plan.entry) return;
    plan.entry.sent = Math.max(0, Number(plan.entry.sent) || 0) + 1;
    plan.entry.at = Date.now();
  }

  window.__ntaDebug = window.__ntaDebug || {};
  window.__ntaDebug.stickerChallengePending = () => Boolean(stickerChallengePending());
  window.__ntaDebug.stickerBoostPlan = () => {
    const challenge = stickerChallengePending();
    return challenge ? stickerBoostPlan(challenge) : null;
  };
  window.__ntaDebug.stickerBoostSent = () => {
    const challenge = stickerChallengePending();
    if (!challenge) return false;
    noteStickerBoostSent(stickerBoostPlan(challenge));
    return true;
  };

  function initStickers() {
    if (!CONFIG.stickers.enabled) return;

    let sentThisRace = false;
    let pending = false;
    let challengeNoted = false;

    // El chat puede estar cerrado: si hay opciones visibles se usan esas y, si
    // no, las ocultas (que es lo que hacia el script original).
    const options = () => {
      const all = [...document.querySelectorAll('.raceChat-pickerOpt')];
      if (!all.length) return [];
      const shown = all.filter(isVisible);
      return shown.length ? shown : all;
    };

    let lastIndex = -1;

    function send() {
      // La espera pudo terminar con el turno ya cedido a otra copia.
      if (standbyActive()) return false;
      const opts = options();
      if (!opts.length) return false;

      let index;
      if (CONFIG.stickers.choice > 0) {
        index = Math.min(CONFIG.stickers.choice, opts.length) - 1;
      } else {
        index = Math.floor(Math.random() * opts.length);

        // Repetir el mismo sticker dos carreras seguidas canta mas que variar:
        // con mas de una opcion se evita el anterior.
        if (opts.length > 1 && index === lastIndex) {
          index = (index + 1 + Math.floor(Math.random() * (opts.length - 1))) % opts.length;
        }
      }

      lastIndex = index;
      const target = opts[index].firstElementChild || opts[index];
      target.click();
      log(`Sticker ${index + 1}/${opts.length} sent.`);
      return true;
    }

    setInterval(() => {
      // Los stickers son automatizacion: parado no se manda nada, y apagarlos
      // en TUNE debe surtir efecto sin recargar la pagina.
      if (!CONFIG.stickers.enabled) return;
      if (session.stopped) return;
      // Otra copia lleva el teclado: un sticker desde la copia en espera es una
      // accion duplicada y delata que hay dos instancias.
      if (standbyActive()) return;

      // Carrera nueva: la sesion vuelve a cero y se permite otro sticker.
      if (session.chars === 0) {
        sentThisRace = false;
        return;
      }
      if (sentThisRace || pending) return;
      if (!options().length) return;

      // Se decide una sola vez por carrera, no en cada tick.
      sentThisRace = true;
      const challenge = stickerChallengePending();
      const plan = challenge ? stickerBoostPlan(challenge) : null;
      const boost = Boolean(plan && plan.boost);
      if (boost && !challengeNoted) {
        challengeNoted = true;
        log('Daily Challenge: sticker challenge pending; sending a sticker in every race until it is complete.');
      } else if (!boost) {
        challengeNoted = false;
      }
      if (!boost && Math.random() * 100 > CONFIG.stickers.chance) return;

      pending = true;
      const [min, max] = CONFIG.stickers.delayMs;
      preciseSleep(min + Math.random() * (max - min)).then(() => {
        pending = false;
        if (session.chars > 0 && !session.stopped) {
          const sent = send();
          if (sent && boost) noteStickerBoostSent(plan);
        }
      });
    }, 700);
  }

  /* ==========================================================================
   * 12.B GUARDIA: WPM IMPOSIBLE E INSTANCIAS DUPLICADAS
   * ========================================================================== */
  // Los dos fallos que no tienen red, y los dos salieron de la misma prueba: con
  // dos copias del script inyectadas en la misma pestana, las dos mandaban teclas
  // a la vez y el contador del juego se fue a 6696 WPM. Ese numero es justo lo
  // que mira un anti-cheat.
  //
  //  - WPM imposible: se vigilan el HUD del juego (.dash-metrics, el numero que
  //    se lleva el anti-cheat), el avance real de la carrera y lo que ha tecleado
  //    esta copia. Si el que se dispara es el HUD mientras la medida propia es
  //    normal, el aviso apunta a otra copia escribiendo. Si se dispara la medida
  //    propia, la carrera se suelta y se abre un hueco largo (CONFIG.guard).
  //  - Copias duplicadas: cada instancia deja un latido en el window del
  //    documento y la eleccion decide cual escribe (electInstance). Las demas
  //    esperan en silencio y toman el relevo si la primera desaparece. No hay
  //    parada: antes dos copias se apagaban la una a la otra y una parada a mitad
  //    de carrera dejaba la leccion sin teclas (DQ por inactividad).
  //
  // El turno entre tipadores vivos de distintos marcos lo pide la cola con
  // window.top.__ntaStandby: es un prestamo con caducidad, no un apagon.

  const INSTANCE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const GUARD_REGISTRY = '__ntaInstances';
  const GUARD_STANDBY = '__ntaStandby';
  const TAB_ID_KEY = 'nta:tabId';
  const TAB_LEASE = 'nta:tabLease';
  let tabId = null;            // identidad estable de la pestaña (sobrevive recargas)
  let tabPrimary = true;       // false = otra pestaña tiene el lease
  let tabRoleNoted = false;
  let guardId = null;          // id de esta copia en el registro del documento
  let guardSince = 0;          // cuando se registro (desempate de la eleccion)
  let guardReleased = false;   // solto el mando al pararse; al volver entra como nueva
  let guardLeader = null;      // entrada con el turno ahora mismo (id, since, penSince)
  let penSince = 0;            // cuando esta copia tomo el turno (0 = no lo tiene)
  let primaryRole = true;      // false = otra copia de la misma pagina manda
  let peerCount = 1;           // copias del script vivas en esta pagina
  let roleNoted = false;       // el aviso de "otra copia" se da una sola vez
  let roleCheckedAt = 0;       // ultima eleccion consultada (cada 250 ms)
  let hudWarnedAt = 0;         // ultimo aviso de "el HUD no cuadra con lo mio"
  let abandonRace = false;     // el guardia manda: esta carrera se suelta
  let guardLastCheckAt = 0;    // el guardia mira como mucho cada 500 ms
  let guardPaceAtStart = null; // ritmo con el que empezo la carrera en curso
  const guardSamples = [];     // ultimas lecturas de WPM (techo sostenido)

  // Identidad de la pestaña. sessionStorage sobrevive a recargas y a la
  // navegacion dentro de la pestaña; window.top.__ntaTabId une la cola y el
  // iframe cuando los dos cargan el script. Sin eso, cada recarga creaba un id
  // nuevo y el lease dejaba la pestaña bloqueada hasta caducar.
  function tabIdentity() {
    if (tabId) return tabId;

    let id = '';
    try {
      const top = window.top;
      if (top && top.__ntaTabId) id = String(top.__ntaTabId);
    } catch { /* top de otro origen */ }

    if (!id) {
      try { id = String(sessionStorage.getItem(TAB_ID_KEY) || ''); } catch { /* storage bloqueado */ }
    }
    if (!id) id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    tabId = id;
    try { sessionStorage.setItem(TAB_ID_KEY, id); } catch { /* storage bloqueado */ }
    try { if (window.top && !window.top.__ntaTabId) window.top.__ntaTabId = id; } catch { /* top de otro origen */ }
    return tabId;
  }

  // El lease vive en localStorage porque es lo unico que ven todas las
  // pestañas del perfil. No sustituye a la eleccion del window: la complementa.
  // Un tipador de la pestaña A no puede mandar teclas si la pestaña B lo tiene.
  function readTabLease() {
    try {
      const raw = localStorage.getItem(TAB_LEASE);
      if (!raw) return null;
      const lease = JSON.parse(raw);
      const at = Number(lease && lease.at);
      if (!lease || !lease.tab || !Number.isFinite(at)) return null;
      if (Date.now() - at > CONFIG.guard.tabLeaseStaleMs) return null;
      return lease;
    } catch {
      return null;
    }
  }

  function tabLeaseHeldByOther() {
    const lease = readTabLease();
    return Boolean(lease && String(lease.tab) !== tabIdentity());
  }

  // true = esta pestaña puede actuar. Si el lease es de otra pestaña y sigue
  // fresco, no se toca: la copia en espera no abre carreras ni reclama cajas.
  function claimTabLease(reason = '') {
    try {
      const now = Date.now();
      const tab = tabIdentity();
      const lease = readTabLease();
      if (lease && String(lease.tab) !== tab) return false;
      if (lease && lease.id === INSTANCE_ID && now - Number(lease.at) < 900) return true;

      // Si el lease es de esta pestaña pero lo escribio la otra mitad (cola o
      // iframe), se actualiza el titular sin cambiar de pestaña.
      localStorage.setItem(TAB_LEASE, JSON.stringify({
        tab, id: INSTANCE_ID, at: now, reason: String(reason || ''),
      }));
      return true;
    } catch {
      // Sin localStorage no se puede coordinar: se mantiene el comportamiento
      // anterior (la eleccion por window) en vez de bloquear el bot.
      return true;
    }
  }

  // El lease nombra una PESTAÑA, no una mitad: la cola de arriba y el tipador
  // del marco comparten tabId, y cualquiera de las dos puede soltarlo al parar
  // o al cerrarse la pestaña. Antes solo lo borraba la mitad que lo habia
  // escrito; si lo tenia la otra, la pestaña se iba con el lease puesto y la
  // siguiente esperaba los 15 s de caducidad. `force` sigue existiendo para el
  // debug: sin el, una pestaña nunca puede borrar el lease de otra.
  function releaseTabLease(force = false) {
    try {
      const raw = localStorage.getItem(TAB_LEASE);
      if (!raw) return false;
      const lease = JSON.parse(raw);
      if (!lease) return false;
      if (!force && String(lease.tab) !== tabIdentity()) return false;
      localStorage.removeItem(TAB_LEASE);
      return true;
    } catch {
      return false;
    }
  }

  // Renueva el vencimiento sin cambiar de titular: conserva el `id` de la mitad
  // que reclamo el turno y solo mueve `at`. No crea un lease nuevo, asi que una
  // pestaña parada no se queda el turno, y nunca toca el de otra pestaña.
  function renewTabLease() {
    try {
      const raw = localStorage.getItem(TAB_LEASE);
      if (!raw) return false;
      const lease = JSON.parse(raw);
      if (!lease || String(lease.tab) !== tabIdentity()) return false;
      if (Date.now() - Number(lease.at) > CONFIG.guard.tabLeaseStaleMs) return false;
      localStorage.setItem(TAB_LEASE, JSON.stringify({ ...lease, at: Date.now() }));
      return true;
    } catch {
      return false;
    }
  }

  function tabLeaseInfo() {
    const lease = readTabLease();
    const tab = tabIdentity();
    return {
      tab,
      owner: lease ? String(lease.tab) : null,
      holder: lease ? String(lease.id || '') : '',
      mine: Boolean(lease && String(lease.tab) === tab),
      at: lease ? Number(lease.at) : 0,
      // Tiempo que le queda al titular antes de que otra pestaña pueda tomar
      // el relevo. Negativo o 0 = ya caducado (readTabLease lo ignora).
      expiresInMs: lease
        ? Math.max(0, CONFIG.guard.tabLeaseStaleMs - (Date.now() - Number(lease.at)))
        : 0,
    };
  }

  // Latido del lease por el reloj Worker. El `setInterval` del panel se frena a
  // 1/min cuando la pestaña lleva un rato oculta y el lease caduca a los 15 s:
  // el farmeo AFK perdia el turno frente a otra pestaña abierta aunque siguiera
  // corriendo. Este latido no se frena; solo renueva el lease que ya es de esta
  // pestaña (ver `renewTabLease`), asi que parada no lo resucita.
  let leaseBeatQueued = false;
  function leaseBeat() {
    if (leaseBeatQueued) return;
    leaseBeatQueued = true;
    preciseSleep(4000).then(() => {
      leaseBeatQueued = false;
      renewTabLease();
      leaseBeat();
    });
  }

  // Eleccion entre copias de la misma pagina: una escribe, las demas esperan.
  function refreshRole() {
    // Una copia parada no retiene el mando: se borra del registro y la que
    // sigue viva toma el relevo en su siguiente latido. Al volver entra como
    // la mas nueva, para no quitarle el turno a la que ya estaba escribiendo.
    if (session.stopped) {
      guardReleased = true;
      try {
        const list = Array.isArray(window[GUARD_REGISTRY]) ? window[GUARD_REGISTRY] : [];
        const rest = list.filter((item) => item && item.id !== (guardId || INSTANCE_ID));
        if (rest.length !== list.length) window[GUARD_REGISTRY] = rest;
        peerCount = Math.max(1, rest.length);
      } catch {
        peerCount = 1;
      }
      primaryRole = false;
      tabPrimary = false;
      releaseTabLease();
      penSince = 0;
      return false;
    }

    // Volver de una parada no devuelve el mando por antiguedad: esta copia
    // entra como la mas nueva y la que ya escribia lo conserva. Solo lo retoma
    // cuando la otra desaparece o envejece.
    if (guardReleased) {
      guardReleased = false;
      guardSince = Date.now();
    }

    const previousLeader = guardLeader;
    const { count, primary, leader } = electInstance(
      GUARD_REGISTRY,
      guardId || INSTANCE_ID,
      guardSince || (guardSince = Date.now()),
      CONFIG.guard.instanceStaleMs,
    );
    peerCount = count;

    // Turno entre pestañas: la eleccion local decide QUE copia de esta pestaña
    // escribe; el lease decide SI esta pestaña puede escribir. Las dos mitades
    // de una misma pestaña comparten tabIdentity, asi que no compiten aqui.
    const wasTabPrimary = tabPrimary;
    let tabTurn = false;
    if (primary) {
      tabTurn = claimTabLease('typing');
    } else {
      const lease = readTabLease();
      tabTurn = !lease || String(lease.tab) === tabIdentity();
    }
    tabPrimary = tabTurn;

    if (primary && tabTurn !== wasTabPrimary) {
      if (!tabTurn) {
        log('Another tab has the turn; this tab stands by.');
      } else if (tabRoleNoted) {
        log('This tab has the turn again.');
      }
      tabRoleNoted = !tabTurn;
    }

    if (primary !== primaryRole) {
      primaryRole = primary;

      if (!primary) {
        const holder = leader ? `#${shortId(leader.id)}` : 'another copy';
        log(`Pen: ${holder} has the turn; this copy #${shortId(guardId || INSTANCE_ID)} stands by.`);
        beep('standby');
      } else if (roleNoted) {
        const from = previousLeader && previousLeader.id !== (guardId || INSTANCE_ID)
          ? ` from #${shortId(previousLeader.id)}`
          : '';
        log(`Pen: this copy #${shortId(guardId || INSTANCE_ID)} takes the turn${from}.`);
      }

      roleNoted = !primary;
    }

    // El turno se cuenta desde que esta copia lo tomo, no desde que arranco:
    // una copia vieja que vuelve no puede decir que lleva media hora mandando.
    if (primary && tabTurn) {
      if (!penSince) penSince = Date.now();
    } else {
      penSince = 0;
    }
    guardLeader = leader || null;

    // Se publica en la entrada propia para que la otra copia pueda decir
    // "desde cuando" sin adivinar.
    try {
      const list = Array.isArray(window[GUARD_REGISTRY]) ? window[GUARD_REGISTRY] : [];
      const mine = list.find((item) => item && item.id === (guardId || INSTANCE_ID));
      if (mine) mine.penSince = penSince;
    } catch { /* sin registro */ }

    return primary;
  }

  // El final del id identifica la copia sin llenar la fila con un UUID.
  function shortId(id) {
    return String(id || '').slice(-4) || '????';
  }

  // "this #a1b2 · 5s": que copia tiene el turno y desde cuando. El id corto es
  // el final de INSTANCE_ID; `this` es la copia que pinta el panel.
  function penLabel() {
    if (!guardLeader) return '';

    const short = shortId(guardLeader.id);
    if (!short) return '';

    const since = Number(guardLeader.penSince) || Number(guardLeader.since) || 0;
    const age = since > 0 ? clockSpan(Date.now() - since) : '';
    const who = guardLeader.id === (guardId || INSTANCE_ID) ? 'this' : 'other';
    return `${who} #${short}${age ? ` · ${age}` : ''}`;
  }

  // Turno pedido por la cola cuando ve dos publicadores alternando en la misma
  // pestana (dos tipadores vivos = las teclas se mandan dos veces). Es un aviso
  // con caducidad, no una parada: el que sigue publicando manda, el otro espera,
  // y en cuanto el aviso deja de refrescarse la copia en espera vuelve sola.
  function standbyOrder() {
    try {
      const flag = window[GUARD_STANDBY];
      if (flag && Date.now() - flag.at < CONFIG.guard.standbyHoldMs) return flag;
    } catch { /* sin acceso */ }

    try {
      if (window.top !== window) {
        const flag = window.top[GUARD_STANDBY];
        if (flag && Date.now() - flag.at < CONFIG.guard.standbyHoldMs) return flag;
      }
    } catch { /* marco inaccesible */ }

    return null;
  }

  function requestStandby(keepId, reason) {
    const flag = { keep: keepId || null, reason: reason || '', at: Date.now() };
    try { window[GUARD_STANDBY] = flag; } catch { /* sin acceso */ }
    try { if (window.top !== window) window.top[GUARD_STANDBY] = flag; } catch { /* sin acceso */ }
  }

  // Esta copia no manda teclas: o la eleccion de esta ventana ha dado el mando a
  // otra copia, o la cola ha pedido el turno para el publicador que sigue vivo.
  // Se vuelve a mirar como mucho cada 250 ms: lo justo para que dos copias
  // recien inyectadas no manden teclas a la vez ni un instante de mas.
  function standbyActive() {
    const now = Date.now();

    if (now - roleCheckedAt > 250) {
      roleCheckedAt = now;
      refreshRole();
    }

    if (!primaryRole || !tabPrimary) return true;

    const flag = standbyOrder();
    return Boolean(flag && flag.keep && flag.keep !== INSTANCE_ID);
  }

  // WPM que el propio juego pinta en el HUD de la carrera: es el numero que se
  // lleva el anti-cheat, asi que es el que manda. El HUD es .dash-metrics, con
  // un list-item por metrica (rotulo en un span y valor en un span.h4); el
  // rotulo es "WPM" (o "PPM" en NITROMATH).
  //
  // Hay mas de un .dash-metrics en la pagina: el overlay .race-results de la
  // carrera anterior sigue en el DOM (oculto) con su WPM final. Quedarse con el
  // primero leia ese numero viejo mientras el HUD vivo marcaba otro. Se busca
  // el visible, fuera de resultados y, si existe, dentro del arbol de carrera.
  // El HUD del juego se refresca una vez por segundo y esta funcion fuerza
  // layout (querySelectorAll + getBoundingClientRect + getComputedStyle). Se
  // llamaba hasta cuatro veces por segundo entre el panel y el guardia: ahora
  // la primera lectura del tick vale para todas. La clave incluye el arranque y
  // el cierre de la carrera, asi que un cambio de carrera invalida el memo sin
  // tocar `resetRaceState` (que vive antes en el archivo).
  // El HUD del juego se refresca una vez por segundo. Leerlo con mas frecuencia
  // solo fuerza layout en la carrera sin traer un numero nuevo.
  const HUD_TTL_MS = 1000;
  let hudCacheAt = 0;
  let hudCacheKey = '';
  let hudCacheValue = null;

  function hudWpm(force = false) {
    const now = Date.now();
    const key = `${session.startedAt}:${session.endedAt}`;
    if (!force && key === hudCacheKey && now - hudCacheAt < HUD_TTL_MS) return hudCacheValue;

    hudCacheAt = now;
    hudCacheKey = key;
    hudCacheValue = null;
    perfCounters.hudReads += 1;

    const usable = [...document.querySelectorAll('.dash-metrics')].filter((box) => {
      if (box.closest('.race-results')) return false;
      const rect = box.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      const style = getComputedStyle(box);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
    });
    const scoped = usable.filter((box) => box.closest('#raceContainer'));

    for (const box of (scoped.length ? scoped : usable)) {
      for (const item of box.querySelectorAll('.list-item')) {
        const label = item.querySelector('.tsxs');
        const value = item.querySelector('.h4');
        if (!label || !value) continue;

        const name = normalize(label.textContent);
        if (name !== 'wpm' && name !== 'ppm') continue;

        const number = parseFloat(String(value.textContent).replace(/[^0-9.]/g, ''));
        if (Number.isFinite(number)) {
          hudCacheValue = number;
          return number;
        }
      }
    }
    return null;
  }

  // La calibracion del reloj necesita pares (hud, typed) del mismo instante:
  // con el memo de 600 ms y el guardia cada 500 ms, la mitad de las muestras
  // llegarian con el HUD de hace medio segundo y un `typed` fresco, corriendo
  // el arranque estimado. Mientras queden muestras se lee el DOM de verdad; en
  // cuanto `clockDone` se pone, vuelve el memo como en el panel.
  function hudForGuard(typed) {
    return hudWpm(!session.clockDone && Number(typed) >= 50 && !session.endedAt);
  }

  // El reloj del juego arranca en el semaforo; el nuestro, en la primera tecla
  // aceptada. Cuando el bot tarda en arrancar, el panel marca 5-8% de mas. Con
  // varias lecturas del HUD se estima el arranque real y se corrige una sola
  // vez por carrera. Se aplica la mediana para que un HUD rezagado no mande.
  function calibrateRaceClock(now, hud, typed) {
    if (session.clockDone || !session.startedAt || session.endedAt) return;
    if (!Number.isFinite(hud) || hud < 40 || hud > 220) return;
    if (!Number.isFinite(typed) || typed < 50) return;

    const minutes = (typed / 5) / hud;
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const delta = (now - minutes * 60000) - session.startedAt;
    if (!Number.isFinite(delta) || Math.abs(delta) > 6000) return;

    if (!Array.isArray(session.clockSamples)) session.clockSamples = [];
    session.clockSamples.push(delta);
    if (session.clockSamples.length < 8) return;

    const sorted = session.clockSamples.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    session.clockDone = true;
    if (Math.abs(median) < 150) return;

    session.startedAt += median;
    // Marca para que el gobernador sepa que el arranque cambio mientras podia
    // estar esperando: el bucle de teclas recalcula su recorte al despertar.
    session.clockShiftAt = Date.now();
    log(`Race clock aligned to the game: ${median > 0 ? '+' : ''}${Math.round(median)} ms (game ${Math.round(hud)} WPM).`);
  }

  // Techo de WPM: una marca humana dura. Con la 5.0.0 no hay ningun ritmo que
  // pueda superarlo por diseno, asi que este numero es solo una red de
  // seguridad (carrera rota, copia duplicada, contador desbocado).
  function wpmCeiling() {
    return CONFIG.guard.maxWpmLegit;
  }

  // Aborto del guardia: la carrera en curso deja de recibir teclas (mandarlas
  // mientras el contador esta disparado es lo que quema la cuenta) y se abre un
  // hueco largo entre carreras. NO es una parada pegajosa: el propio bucle espera
  // el hueco y sigue, asi que el bot no se queda mudo esperando una tecla.
  function guardStop(reason) {
    if (session.breakUntil > Date.now()) return;   // ya hay un hueco abierto

    guardCooldown(reason);
    abandonRace = true;
    log('Aborting the race: the numbers on screen are not the ones this script can produce.');
  }

  // Cooldown del guardia: se termina la carrera en curso -dejarla sin teclas
  // seria una DQ- y se alarga el hueco entre carreras. Nunca para el bot.
  function guardCooldown(reason) {
    if (session.breakUntil > Date.now()) return;

    const ms = humanDelay(CONFIG.guard.cooldownMs);
    session.breakUntil = Date.now() + ms;
    session.stopAfterRace = true;
    session.carefulRaces = Math.max(session.carefulRaces, 1);
    saveCounters();

    log(`GUARD: ${reason}. Race finished, then a ${Math.round(ms / 1000)} s break; the bot continues on its own.`);
    beep('break');
    updatePanel();
  }

  function guardCheck() {
    if (!CONFIG.guard.enabled) return;

    // El guardia no necesita mas de dos lecturas por segundo: el HUD del juego
    // se refresca una vez por segundo.
    const now = Date.now();
    if (now - guardLastCheckAt < 500) return;
    guardLastCheckAt = now;

    // La orden de espera de la cola (dos publicadores alternando) se aplica en el
    // bucle: aqui no se corta nada, solo se deja de contar la carrera mientras el
    // HUD venga de otra copia.
    if (standbyActive()) {
      guardSamples.length = 0;
      return;
    }

    // Parado el script no escribe: no hay nada que vigilar.
    if (session.stopped) {
      guardSamples.length = 0;
      guardPaceAtStart = null;
      return;
    }

    // Dos copias en la misma pagina: la eleccion decide (una escribe, la otra
    // espera en silencio). Aqui no se para nada; el aviso lo da refreshRole().
    if (!refreshRole()) {
      guardSamples.length = 0;
      guardPaceAtStart = null;
      return;
    }

    // El guardia juzga lo TECLEADO por esta copia. El nitro regala caracteres
    // que no salieron de aqui: contarlos disparaba la media muy por encima del
    // techo y abortaba una carrera buena justo despues de usarlo.
    const typed = Math.max(0, session.chars - session.nitroChars);

    if (!session.startedAt || typed <= 0) {
      guardSamples.length = 0;
      guardPaceAtStart = null;
      return;
    }

    // Nothing is judged in the first instants of a race. Any WPM reading over a
    // window of a few milliseconds is meaningless (one key in half a millisecond
    // divides out to a five figure number), and the game's own HUD can print a
    // wild value until it refreshes. A genuine runaway is still there three
    // seconds later, so the guard loses nothing by waiting that long.
    const earlyMinutes = (now - session.startedAt) / 60000;
    if (earlyMinutes < 0.05 || typed < 8) {
      guardSamples.length = 0;
      return;
    }

    // Ritmo cambiado a mitad de carrera: la media del juego arrastra el ritmo
    // anterior y el HUD se queda por las nubes un buen rato, asi que el guardia
    // no juzga esa carrera. Con un solo ritmo ya no se cambia, pero la
    // proteccion se queda: si algun dia vuelve a haber mas de uno, esto evita
    // un falso positivo.
    if (guardPaceAtStart === null) guardPaceAtStart = session.pace;
    if (guardPaceAtStart !== session.pace) {
      guardSamples.length = 0;
      return;
    }

    const minutes = (now - session.startedAt) / 60000;

    // Lo que ha tecleado ESTA copia desde que arranco el reloj. El indice de la
    // leccion no vale: tras una recarga en mitad de carrera arranca por el medio
    // y dividir ese indice por un tiempo de dos segundos daba un WPM de cinco
    // cifras (fue lo que disparaba el guardia nada mas empezar). Ademas se acota
    // a las teclas que esta copia ha mandado de verdad: la leccion la puede
    // estar moviendo otra copia y eso no es nuestro WPM.
    const elapsedIdx = clamp(session.pos - (session.startIndex | 0), 0, typed);
    const posWpm = minutes > 0.02 && elapsedIdx > 0 ? (elapsedIdx / 5) / minutes : 0;
    const typedWpm = minutes > 0.02 ? ((session.correct - session.nitroChars) / 5) / minutes : 0;
    // Lo que el HUD puede marcar por encima de nosotros sin que haya otra copia:
    // los caracteres del nitro son del juego y tambien entran en su media.
    const nitroWpm = minutes > 0.02 ? (session.nitroChars / 5) / minutes : 0;

    const own = Math.max(typedWpm, posWpm);
    const hud = hudForGuard(typed);
    if (hud !== null && session.typing && !session.endedAt) session.lastHudWpm = hud;
    calibrateRaceClock(now, hud, typed);
    const ceiling = wpmCeiling();

    const readings = [own];
    if (hud !== null) readings.push(hud);
    const values = readings.filter((value) => Number.isFinite(value));
    if (!values.length) return;

    const wpm = Math.max(...values);

    // Testing hook: inert unless a page sets window.__ntaDebug before the script
    // loads. It exposes the last reading (and which metrics produced it) so a bench
    // can tell a real runaway from a bad sample.
    if (window.__ntaDebug) {
      window.__ntaDebug.guard = {
        wpm, ceiling, hud, own, readings: values, samples: guardSamples.slice(),
        minutes, chars: session.chars, correct: session.correct, pos: session.pos, at: Date.now(),
      };
    }

    // El HUD del juego muy por encima del techo con la medida propia dentro: el
    // numero que sube no son las teclas de esta copia. El margen es ancho a
    // proposito: el HUD redondea y arranca su reloj en el semaforo, asi que 121
    // con 112 reales es normal y avisar de eso solo asustaria. Se avisa (una vez
    // cada medio minuto) y se sigue: las teclas de aqui son legales y estan
    // capadas, y cortar la carrera solo dejaria la leccion a medias. Las copias
    // duplicadas de verdad las resuelve la eleccion y el aviso de la cola.
    if (hud !== null && hud > Math.max(ceiling, own + nitroWpm) * 1.15 && own <= ceiling) {
      if (now - hudWarnedAt > 30000) {
        hudWarnedAt = now;
        log(`The game shows ${Math.round(hud)} WPM (ceiling ${Math.round(ceiling)}) while this copy measures ${own.toFixed(1)}: those keys are not this copy's. Check for a second copy of the script.`);
      }
      guardSamples.length = 0;
      return;
    }

    // Lo que se juzga son las cuentas de ESTA copia. El HUD del juego redondea
    // y arranca su reloj en el semaforo, asi que marca 1-3 WPM por encima del
    // trabajo real: usarlo aqui paraba carreras buenas (121 en pantalla con
    // 118 medidos y el techo en 120). El HUD queda para el aviso de arriba, que
    // es donde de verdad aporta.
    guardSamples.push(own);
    if (guardSamples.length > CONFIG.guard.samples) guardSamples.shift();

    // Un valor disparatado del propio reloj para en seco; uno por encima del
    // techo tiene que repetirse en las ultimas muestras.
    if (own >= ceiling * CONFIG.guard.absurdFactor) {
      guardStop(`${own.toFixed(0)} WPM during the race (ceiling ${Math.round(ceiling)} · pace ${session.pace.toUpperCase()})`);
      return;
    }

    if (guardSamples.length >= CONFIG.guard.samples && Math.min(...guardSamples) > ceiling) {
      guardStop(`sustained WPM of ${Math.round(Math.min(...guardSamples))}-${Math.round(own)} (ceiling ${Math.round(ceiling)} · pace ${session.pace.toUpperCase()})`);
    }
  }

  /* ==========================================================================
   * 13. BOOT
   * ========================================================================== */
  function boot() {
    // El registro de instancias se monta antes de repartir el trabajo: las dos
    // mitades del script lo necesitan para saber cuantas copias hay y cual manda.
    guardId = INSTANCE_ID;
    guardSince = Date.now();

    // El turno se renueva tambien por el reloj Worker, no solo por el latido del
    // panel: oculta, la pestaña sigue farmeando y el lease no puede caducar.
    if (!window.__ntaDryProbe) leaseBeat();

    // Ventana de arriba: solo cola y recuperacion. El tipado vive dentro del
    // iframe de la carrera, asi que aqui no se crea panel ni se toca el teclado.
    if (window.top === window) {
      // El garaje ya tiene el XP de la cuenta y el bootstrap de la temporada:
      // deja la tarjeta lista antes de que el iframe de la carrera la lea.
      seasonRefreshFromUser(true);
      setTimeout(() => seasonRefreshFromUser(true), 2000);

      // /season no tiene cola ni panel: solo se toma la foto de temporada y se
      // guarda para que la lea el panel de la carrera.
      if (/^\/season(\/|$)/.test(location.pathname)) {
        captureSeasonPage();
        return;
      }
      // Sonda del dry-run: comprobar la version sin armar la cola ni pulsar
      // Race Now. Solo la activa `npm run live -- --dry-run --inject`.
      if (!window.__ntaDryProbe) runQueue();
      return;
    }

    // Un marco que acaba en /login significa que la sesion murio para el: aqui
    // no hay juego que esperar y la pantalla de entrar no se resuelve desde
    // dentro. Se avisa a la ventana de arriba ANTES de descartar el marco; si no,
    // este se descarta en silencio y la pagina se queda en /race sin carrera
    // hasta que la recarga el vigilante.
    if (/^\/login(\/|$)/.test(location.pathname)) {
      notifyTopNeedLogin();
      return;
    }

    // La app de la carrera es el unico marco que navega como /race; el resto
    // son anuncios y no tienen nada que hacer aqui.
    if (!/^\/race(\/|$)/.test(location.pathname)) return;

    log(`v${VERSION} · mode AUTO (always) · pace ${session.pace.toUpperCase()} (${paceProfile}) · target ${profile.targetWPM} WPM / ${profile.accuracyGoal.toFixed(1)}% · hard cap ${CONFIG.wpm.hardCap} WPM`);
    if (resumedCounters) log(`Session resumed: ${session.races} races so far.`);
    if (resumedPause) log('It was paused before the reload; press Resume to continue.');
    log('Keys: Alt+A resume, Alt+N stop. Alt+R clears the history, Alt+Shift+C clears the accuracy trend, Alt+H prints closed sessions, Alt+T cycles the theme, Alt+G folds the garage panel, Alt+M cycles the footer HUD, Alt+S or Esc stop (inside a race, at the end). There is no other mode: the bot is always AUTO and the garage queue arms itself.');

    flushQueueNotice();
    document.addEventListener('keydown', onKeyDown, true);

    createPanel();

    // Al volver de segundo plano se pinta una vez aunque el latido venga
    // frenado; mientras esta oculto updatePanel no toca el DOM.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) updatePanel(true);
    });

    // Un latido no puede llevarse por delante a los demas. Si `watchRaceResults`
    // tropieza con un DOM a medio montar (React remontando la carrera), sin esto
    // se dejaban de pintar el panel, de pulsar el CAPTCHA y de contestar al
    // aviso de sesion, y el fallo se repetia cada medio segundo hasta recargar.
    // Cada paso va aislado y el primero de cada clase se cuenta una sola vez en
    // la consola, para no inundarla mientras dure.
    const heartErrors = new Set();
    const heart = (label, fn) => {
      try {
        fn();
      } catch (error) {
        if (heartErrors.has(label)) return;
        heartErrors.add(label);
        log(`Panel heartbeat: ${label} failed, the rest keeps running.`, error);
      }
    };

    let lastPanelPaintAt = 0;
    let lastResultsWatchAt = 0;

    setInterval(() => {
      // Eleccion de copia en este marco: una escribe, las demas esperan. Se
      // refresca en cada latido del panel, que es el unico que corre siempre.
      heart('role', refreshRole);
      heart('panel', () => {
        if (!document.getElementById(PANEL_ID)) createPanel();
      });
      // Con un listener ya suscrito no hace falta recorrer el arbol de React dos
      // veces por segundo: el juego tarda ~25 s en cerrar una carrera y un segundo
      // de retraso no pierde el paquete. Sin listener se sigue mirando a 2 Hz.
      heart('results', () => {
        const now = Date.now();
        if (resultServerObj && now - lastResultsWatchAt < 1000) return;
        lastResultsWatchAt = now;
        perfCounters.resultsWatches += 1;
        watchRaceResults();
      });
      // Un panel en espera o en carrera no necesita 2 Hz: sus relojes cambian
      // como mucho una vez por segundo y los eventos que importan ya llaman a
      // updatePanel(). Se pinta en el siguiente latido y se libera el hilo
      // justo cuando la app esta procesando las teclas.
      heart('paint', () => {
        const now = Date.now();
        if (now - lastPanelPaintAt < panelPaintEveryMs()) return;
        lastPanelPaintAt = now;
        updatePanel();
      });
      heart('captcha', () => clickCaptchaContinue(document));
      heart('challenge', closeChallengePopup);
      heart('calibration', () => maybeCalibrate());

      // El aviso de sesion puede caer en esta ventana o en la de arriba: se
      // mira en las dos y, si toca, se pulsa (la app se recarga y la sesion se
      // renueva). Se comprueba aqui, y no en el vigilante de 1 s, porque este
      // intervalo es el que tiene el panel delante para contarlo.
      heart('session', handleSessionWarning);
    }, 500);

    // Vigilante de descalificacion: deja marcado cuando el modal esta en
    // pantalla para que el bucle cierre la carrera en vez de teclear al aire.
    // Aqui tambien vive el guardia (WPM imposible y copias duplicadas): es el
    // unico latido que sigue vivo en todos los modos.
    setInterval(() => {
      if (!document.body) return;
      guardCheck();

      const text = modalText();

      // Castigo por racha del propio sitio: ni una carrera mas hasta que pase.
      // No se para el bot (una parada pegajosa era la que dejaba al script mudo
      // para siempre): se abre un hueco largo y el bucle vuelve solo.
      if (looksDqBlocked(text)) {
        if (!dqBlockedNoted) {
          dqBlockedNoted = true;
          // Un bloqueo detras de otro alarga la espera: si el primero no basto,
          // repetir los mismos 15 min solo gasta el dia.
          const stage = Math.max(0, Number(disk.get(DQ_BLOCK_STAGE, 0)) || 0);
          const ms = dqBlockWaitMs(stage);
          disk.set(DQ_BLOCK_STAGE, String(Math.min(stage + 1, DQ_BLOCK_STAGE_MAX)));
          session.breakUntil = Math.max(session.breakUntil, Date.now() + ms);
          saveCounters();
          log(`The site blocked the account for too many disqualifications. Backing off ${Math.round(ms / 60000)} min${stage ? ` (block ${stage + 1} in a row)` : ''}; the bot checks again by itself.`);
          beep('block');
          updatePanel();
        }
        return;
      }

      if (dqBlockedNoted) dqBlockedNoted = false;
      if (looksDisqualified(text)) dqSeenAt = Date.now();
      if (looksLikeConnectionError(text)) connErrorSeenAt = Date.now();
    }, 1000);

    // Al salir de la pagina se deja de teclear: un marco a medio descargar que
    // sigue mandando teclas es lo ultimo que se quiere. Pero `pagehide` no
    // siempre destruye el documento: si el navegador lo guarda en la cache de
    // ida y vuelta (bfcache), el mismo JS revive con `pageshow` y la sesion tal
    // y como estaba... con la parada dentro. El bot quedaba mudo al volver con
    // el boton Atras y el panel decia "waiting" sin motivo aparente. Se apunta
    // si la parada la puso ESTE manejador, para deshacerla solo en ese caso:
    // una parada pedida por el usuario (Esc, Alt+N, el tope de tanda) se
    // respeta y no se reanuda sola.
    let stoppedByPageHide = false;

    window.addEventListener('pagehide', () => {
      if (session.stopped) return;
      session.stopped = true;
      releaseTabLease();
      stoppedByPageHide = true;
    });

    window.addEventListener('pageshow', (event) => {
      if (!event.persisted || !stoppedByPageHide) return;

      stoppedByPageHide = false;
      session.stopped = false;
      log('Back from the page cache: the bot picks the race up again.');
      updatePanel();
      runAuto();
    });

    initStickers();
    watchRaceResults();

    runAuto();
  }

  boot();
})();
