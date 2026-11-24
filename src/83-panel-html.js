  /* ==========================================================================
   * 12.D PLANTILLA DEL PANEL
   * ========================================================================== */
  // Las 485 lineas de HTML del shadow root, fuera de createPanel para que esa
  // funcion se lea como lo que hace (cablear eventos) y no como una plantilla.
  // Solo interpola cuatro constantes de modulo (PANEL_CSS, CHANNEL y las dos
  // URLs de actualizacion), ninguna variable local, asi que el texto viaja tal
  // cual. El modulo se evalua despues de 79-panel-css.js porque PANEL_CSS tiene
  // que existir cuando se arma esta cadena.
  const PANEL_HTML = `
      <style>${PANEL_CSS}</style>
      <div class="panel" role="region" aria-label="Nitro Wraith control panel" data-state="waiting" data-context="waiting" data-mode="auto" data-pace="legit" data-cfg="0" data-collapsed="false" data-tab="stats" data-fresh="1" data-theme="carbon">
        <div class="head" tabindex="0" aria-label="Panel header. Drag with the mouse or move with arrow keys; Shift moves 24 pixels and Home returns to the corner." aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight Home">
          <span class="mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="14" stroke-opacity=".22"/><path d="M6.5 9.5 11 23l5-9 5 9 4.5-13.5"/></svg>
            <i class="dot"></i>
          </span>
          <span class="brand">
            <b class="title" data-field="title">NITRO WRAITH</b>
            <span class="sub">human pace · <b data-field="ver">v7.0.0</b></span>
          </span>
          <a class="ghlink" href="${UPDATE_GITHUB_URL}" target="_blank" rel="noopener noreferrer" hidden title="Download the latest NITRO WRAITH userscript from GitHub" aria-label="Download the latest NITRO WRAITH userscript from GitHub">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M8 11l4 4 4-4M5 20h14"/></svg><span>Update</span>
          </a>
          <button class="iconbtn collapse" type="button" data-act="expand" aria-label="Collapse panel" aria-expanded="true" title="Collapse / expand the panel">−</button>
        </div>
        <div class="chips-row">
          <button class="pace" type="button">LEGIT · balanced</button>
          <span class="mode" role="status" aria-live="polite" title="Always AUTO: the bot starts by itself. Stop stops it; it comes back on the next garage visit.">AUTO</span>
          <span class="cap" data-field="cap" title="Hard ceiling: no race is ever allowed above this WPM">≤ 120 wpm</span>
        </div>
        <div class="context-banner" data-context="waiting" role="status" aria-live="polite" aria-atomic="true">
          <span class="context-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h4l2-5 4 10 2-5h2"/></svg>
          </span>
          <span class="context-copy">
            <b data-field="contextTitle">Ready when you are</b>
            <span data-field="contextDetail">The queue is waiting for the next race.</span>
          </span>
          <span class="context-pill" data-field="contextPill">AUTO</span>
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
                <div class="card-h"><span class="card-t">Live</span><span class="card-s" data-field="liveTag">waiting</span><span class="card-age" data-field="liveAge" title="Data age: seconds since the game accepted the last key. Refreshed four times per second; amber means the race has gone quiet.">—</span></div>
                <div class="focus-strip" data-field="focusStrip" role="group" aria-label="Race focus: pace, accuracy, progress and next action">
                  <span class="focus-state" data-field="focusState">LIVE</span>
                  <b data-field="focusNext">Waiting for the next key.</b>
                </div>
                <div class="sr-only" data-field="focusAnnounce" role="status" aria-live="polite" aria-atomic="true"></div>
                <div class="hero">
                  <div class="stat"><b data-field="live">—</b><span>live wpm</span></div>
                  <i class="sep"></i>
                  <div class="stat"><b data-field="acc">—</b><span>accuracy</span></div>
                </div>
                <div class="auto-pace" data-field="paceSource">auto · reading account</div>
                <div class="prog"><i data-field="progfill"></i></div>
                <div class="rhythm" data-field="rhythmWrap" data-ready="0">
                  <svg class="rhythm-chart" data-field="rhythmChart" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="Rhythm chart: waiting for enough samples.">
                    <rect class="rhythm-band" data-field="rhythmBand" x="0" y="0" width="100" height="0"></rect>
                    <line class="rhythm-target" data-field="rhythmTarget" x1="0" y1="15" x2="100" y2="15"></line>
                    <polyline class="rhythm-line" data-field="rhythmLine" points=""></polyline>
                  </svg>
                  <div class="rhythm-note" data-field="rhythmNote">Rhythm chart appears after a few seconds of typing.</div>
                </div>
                <svg class="spark" data-field="accSpark" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label="Accuracy model delta history: no samples yet.">
                  <line class="spark-zero" x1="0" y1="12" x2="100" y2="12"></line>
                  <path class="spark-area" data-field="accSparkArea" d=""></path>
                  <polyline class="spark-line" data-field="accSparkLine" points=""></polyline>
                </svg>
                <div class="rows">
                  <div class="row"><span>target</span><b data-field="target">—</b></div>
                  <div class="row" title="Recent pace and accuracy: WPM and accuracy over the last 6 seconds of accepted keys, independent of the session averages"><span>recent</span><b class="recent-pair"><i data-field="liveNow">—</i><i class="recent-acc" data-field="liveNowAcc">—</i></b></div>
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
                  <div class="row watch-row" title="Real-time race watchdog: phase, which tab holds the typing lease and how long the game has gone without accepting a key"><span>watch</span><b data-field="watch">—</b></div>
                  <div class="row box-row" style="display:none" title="Daily Mystery Box in the garage"><span>box</span><b data-field="box">—</b></div>
                  <div class="row break-row secondary"><span>break</span><b data-field="break">—</b></div>
                  <div class="row dq-row" style="display:none"><span>dq streak</span><b data-field="dq">×0</b></div>
                </div>
              </div>
              <div class="card account-card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0M4 4h3M4 4v3M20 4h-3M20 4v3"/></svg></span>
                <div class="card-h"><span class="card-t">Account</span><span class="card-s acct-state" data-field="acctState" data-state="idle" role="status" aria-live="polite">waiting</span></div>
                <div class="acct-top">
                  <b class="acct-id" data-field="acctId">—</b>
                  <button class="act acct-refresh" type="button" data-field="acctRefresh" title="Read the signed-in account now: profile and full monthly history">refresh</button>
                </div>
                <div class="acct-metrics">
                  <div><b data-field="acctAvg">—</b><span>avg</span></div>
                  <div><b data-field="acctTarget">—</b><span>target</span></div>
                  <div><b data-field="acctTop">—</b><span>top</span></div>
                </div>
                <div class="rows">
                  <div class="row"><span>history</span><b data-field="acctHistory">—</b></div>
                  <div class="row"><span>range</span><b data-field="acctRange">—</b></div>
                  <div class="row" title="Active hours: outside this window the queue waits instead of racing. All day means the window is off."><span>hours</span><b data-field="acctHours">all day</b></div>
                  <div class="row" title="Rest days: the account takes one day in seven off, chosen from the date. A queue that races 24/7 for weeks is a stronger signature than a fast WPM."><span>rest</span><b data-field="acctRest">—</b></div>
                  <div class="row" title="Day curve: the target moves with the hour (1.0 at 13:30, 0.95 at 01:30) so the pace is not identical at every hour of the day"><span>curve</span><b data-field="acctCurve">—</b></div>
                  <div class="row"><span>read</span><b data-field="acctRead">never</b></div>
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
              <div class="tune-filter">
                <label class="tune-search" title="Filter settings by name, section or description">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
                  <input type="search" data-field="tuneSearch" placeholder="Filter settings…" autocomplete="off" spellcheck="false" aria-label="Filter settings by name, section or description">
                  <button class="tune-clear" type="button" data-field="tuneClear" aria-label="Clear settings filter" title="Clear filter" hidden>×</button>
                </label>
                <span class="tune-count" data-field="tuneCount" aria-live="polite">settings</span>
              </div>
              <div class="tune-empty" data-field="tuneEmpty" role="status" hidden></div>
              <div class="tune-sec" role="group" aria-labelledby="tune-health-label" data-open="true" data-default-open="true">
                <button type="button" class="tune-sec-h" data-tune-disclosure aria-expanded="true" aria-controls="tune-health-body">
                  <span id="tune-health-label">Health</span><b>account · AFK · update</b><i aria-hidden="true">⌄</i>
                </button>
                <div class="tune-sec-body" id="tune-health-body">
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 12h4l2-5 4 10 2-5h6"/><path d="M4 20h16"/></svg></span>
                  <div class="card-h"><span class="card-t">Health center</span><span class="card-s" data-field="healthSummary">checking</span></div>
                  <div class="rows">
                    <div class="row" title="Account calibration source and freshness"><span>account</span><b data-field="healthAccount">—</b></div>
                    <div class="row" title="AFK farming, keep-alive and the strict interlock; the same values as the AFK rows below"><span>AFK gate</span><b data-field="healthAfk">—</b></div>
                    <div class="row" title="Last update check result and age"><span>update</span><b data-field="healthUpdate">—</b></div>
                    <div class="row" title="Page Lifecycle freezes recorded in this browser"><span>freezes</span><b data-field="healthFreeze">—</b></div>
                  </div>
                  <div class="cfg-note" data-field="healthNote">One place to see what needs attention.</div>
                  <button class="act" type="button" data-act="report" title="Copy the full diagnostic report, including the recent flight recorder, to paste when something is off">copy report</button>
                </div>
                </div>
              </div>
              <div class="tune-sec" role="group" aria-labelledby="tune-rhythm-label" data-open="true" data-default-open="true">
                <button type="button" class="tune-sec-h" data-tune-disclosure aria-expanded="true" aria-controls="tune-rhythm-body">
                  <span id="tune-rhythm-label">Rhythm</span><b>pace and calibration</b><i aria-hidden="true">⌄</i>
                </button>
                <div class="tune-sec-body" id="tune-rhythm-body">
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
                    <div class="row custom-row" title="Manual WPM target. Leave empty or 0 for automatic calibration. A manual value overrides the account average and the top-based recovery floor."><span>custom wpm</span><input class="num" type="number" inputmode="numeric" min="15" max="119" step="1" placeholder="auto" data-field="customWpm" aria-label="Custom WPM target; empty or 0 uses automatic calibration"></div>
                    <div class="row custom-row" title="Manual accuracy target from 96% to 100%. Leave empty or 0 for automatic calibration. Below 96% the game pays no accuracy bonus."><span>custom acc</span><input class="num" type="number" inputmode="numeric" min="96" max="100" step="1" placeholder="auto" data-field="customAcc" aria-label="Custom accuracy target; empty or 0 uses automatic calibration"></div>
                    <div class="cfg-note">Custom values override auto. Empty or 0 returns to automatic.</div>
                  </div>
                </div>
                </div>
              </div>
              <div class="tune-sec" role="group" aria-labelledby="tune-limits-label" data-open="true" data-default-open="true">
                <button type="button" class="tune-sec-h" data-tune-disclosure aria-expanded="true" aria-controls="tune-limits-body">
                  <span id="tune-limits-label">Limits</span><b>session, day and hours</b><i aria-hidden="true">⌄</i>
                </button>
                <div class="tune-sec-body" id="tune-limits-body">
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h16M4 16h16"/><circle cx="9" cy="8" r="2"/><circle cx="15" cy="16" r="2"/></svg></span>
                  <div class="card-h"><span class="card-t">Session limit</span><span class="card-s">the bot stops on its own</span></div>
                  <button type="button" class="limit-row row" data-field="raceLimitRow" title="Click: races per session (free, 25, 50, 100). 25 is where the session bonus reaches its 250 XP per race cap">
                    <span>races</span><b data-field="limit">free</b>
                  </button>
                  <input class="sld" type="range" min="0" max="3" step="1" value="0" data-field="limitSlider" aria-label="Races per session" title="Races per session: free, 25, 50 or 100">
                  <div class="sld-ends"><span>free</span><span>25</span><span>50</span><span>100</span></div>
                  <button type="button" class="limit-row row time-row" data-field="timeLimitRow" title="Click: minutes per session (free, 15, 30, 60, 120). The clock starts with the first race of the session">
                    <span>time</span><b data-field="timeLimit">free</b>
                  </button>
                  <input class="sld" type="range" min="0" max="4" step="1" value="0" data-field="timeSlider" aria-label="Minutes per session" title="Minutes per session: free, 15, 30, 60 or 120">
                  <div class="sld-ends"><span>free</span><span>15m</span><span>30m</span><span>1h</span><span>2h</span></div>
                  <button type="button" class="limit-row row xp-row" data-field="xpLimitRow" title="Click: XP per session (free, 5k, 10k, 25k, 50k). Counts the XP the game itself awards in each race">
                    <span>xp</span><b data-field="xpLimit">free</b>
                  </button>
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
                  <button type="button" class="limit-row row" data-field="dailyRaceRow" title="Click: races per day (free, 100, 200, 300). Counts the races the game recorded today">
                    <span>races/day</span><b data-field="dailyRaces">free</b>
                  </button>
                  <input class="sld" type="range" min="0" max="3" step="1" value="0" data-field="dailyRaceSlider" aria-label="Races per day" title="Races per day: free, 100, 200 or 300">
                  <div class="sld-ends"><span>free</span><span>100</span><span>200</span><span>300</span></div>
                  <button type="button" class="limit-row row xp-row" data-field="dailyXpRow" title="Click: XP per day (free, 50k, 100k, 200k). Counts the XP the game paid today">
                    <span>xp/day</span><b data-field="dailyXp">free</b>
                  </button>
                  <input class="sld" type="range" min="0" max="3" step="1" value="0" data-field="dailyXpSlider" aria-label="XP per day" title="XP per day: free, 50k, 100k or 200k">
                  <div class="sld-ends"><span>free</span><span>50k</span><span>100k</span><span>200k</span></div>
                  <div class="rows">
                    <div class="row" data-field="dailyLeftRow" title="Budget left today; both counters reset at midnight"><span>left</span><b data-field="dailyLeft">—</b></div>
                  </div>
                </div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg></span>
                  <div class="card-h"><span class="card-t">Active hours</span><span class="card-s">races only in this window</span></div>
                  <button type="button" class="limit-row row" data-field="activeRow" title="Click: turn the active window on/off. Shift+click resets 08:00–23:00">
                    <span>window</span><b data-field="activeState">off</b>
                  </button>
                  <button type="button" class="limit-row row" data-field="activeStartRow" title="Click: start hour +1 (Shift+click: −1). The window can cross midnight">
                    <span>from</span><b data-field="activeStart">08:00</b>
                  </button>
                  <input class="sld" type="range" min="0" max="23" step="1" value="8" data-field="activeStartSlider" aria-label="Active window start hour" title="Start of the active window">
                  <div class="sld-ends"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
                  <button type="button" class="limit-row row" data-field="activeEndRow" title="Click: end hour +1 (Shift+click: −1). An end before the start crosses midnight">
                    <span>to</span><b data-field="activeEnd">23:00</b>
                  </button>
                  <input class="sld" type="range" min="0" max="23" step="1" value="23" data-field="activeEndSlider" aria-label="Active window end hour" title="End of the active window">
                  <div class="sld-ends"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
                  <div class="rows">
                    <div class="row" data-field="activeNowRow" title="Local time. Races only start while the window is open"><span>now</span><b data-field="activeNow">always</b></div>
                  </div>
                </div>
                </div>
              </div>
              <div class="tune-sec" role="group" aria-labelledby="tune-automation-label" data-open="true" data-default-open="true">
                <button type="button" class="tune-sec-h" data-tune-disclosure aria-expanded="true" aria-controls="tune-automation-body">
                  <span id="tune-automation-label">Automation</span><b>behavior, panel and tools</b><i aria-hidden="true">⌄</i>
                </button>
                <div class="tune-sec-body" id="tune-automation-body">
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
                    <span class="set-lbl">Stickers<i>one in every race</i></span>
                    <span class="set-val"><b data-sw-txt="stickers" data-on="1">on</b><button class="sw" type="button" role="switch" aria-checked="true" data-toggle="stickers" data-on="1" title="Send one sticker in every race"></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">AFK farming<i>race while this tab is hidden</i></span>
                    <span class="set-val"><b data-sw-txt="backgroundFarm" data-on="0">off</b><button class="sw" type="button" role="switch" aria-checked="false" data-toggle="backgroundFarm" data-on="0" title="Off by default. Chrome can freeze a hidden tab, and a race with no keys ends in a disqualification. Turn it on only if you accept that risk."></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">AFK keep-alive<i>near-silent audio holds the tab</i></span>
                    <span class="set-val"><b data-sw-txt="keepAlive" data-on="0">off</b><button class="sw" type="button" role="switch" aria-checked="false" data-toggle="keepAlive" data-on="0" title="Optional and off by default. Near-silent audio makes Chrome treat this tab as active while AFK farming is on. It needs one click to unlock audio and cannot guarantee that the tab will not freeze. Muting the tab can disable it."></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">AFK interlock<i>hidden races need keep-alive running</i></span>
                    <span class="set-val"><b data-sw-txt="afkRequireKeepAlive" data-on="0">off</b><button class="sw" type="button" role="switch" aria-checked="false" data-toggle="afkRequireKeepAlive" data-on="0" title="Recommended with AFK farming: a hidden tab cannot open a race unless the keep-alive reports a running AudioContext. A suspended or blocked keep-alive holds the queue instead of risking a DQ."></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">AFK safety guard<i>DQ after a freeze turns AFK off</i></span>
                    <span class="set-val"><b data-sw-txt="afkFreezeGuard" data-on="1">on</b><button class="sw" type="button" role="switch" aria-checked="true" data-toggle="afkFreezeGuard" data-on="1" title="On by default. If a disqualification happens within 15 minutes of a recorded freeze while AFK farming is on, AFK is turned off and a notice is kept. It does not undo the DQ."></button></span>
                  </div>
                  <div class="set-row afk-health-row" title="Live AFK state, keep-alive state and freeze events recorded by this browser">
                    <span class="set-lbl">AFK health<i>hidden state · freeze count</i></span>
                    <span class="set-val"><b data-field="afkHealth" data-state="off" role="status" aria-live="polite">off · visible-only</b><button class="afk-health-reset" type="button" data-act="afkFreezeReset" title="Clear the freeze history recorded in this browser">reset</button></span>
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
                  <div class="set-row">
                    <span class="set-lbl">Desktop alerts<i>DQ and site blocks, with permission</i></span>
                    <span class="set-val"><b data-sw-txt="notifications" data-on="0">off</b><button class="sw" type="button" role="switch" aria-checked="false" data-toggle="notifications" data-on="0" title="Desktop alerts: permission is requested on the first click. Only disqualifications, site blocks and the AFK safety guard use them; the panel and sound settings are unchanged."></button></span>
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
                  <div class="rgb-lab" data-field="rgbLab" role="group" aria-label="RGB Lab">
                    <div class="rgb-lab-h"><span>RGB Lab</span><b>shape the rainbow</b></div>
                    <div class="rgb-colors">
                      <label>primary<input type="color" data-field="rgbColorA" value="#ff5f6d" aria-label="RGB primary color"></label>
                      <label>secondary<input type="color" data-field="rgbColorB" value="#b06bff" aria-label="RGB secondary color"></label>
                    </div>
                    <div class="rgb-speed" role="group" aria-label="RGB animation speed">
                      <button type="button" data-rgb-speed="0.5" aria-pressed="false">0.5×</button>
                      <button type="button" data-rgb-speed="1" aria-pressed="true">1×</button>
                      <button type="button" data-rgb-speed="2" aria-pressed="false">2×</button>
                    </div>
                    <label class="rgb-range">intensity <output data-field="rgbIntensityValue">90%</output><input type="range" min="25" max="100" step="1" value="90" data-field="rgbIntensity" aria-label="RGB intensity"></label>
                    <label class="rgb-mode">during races<select data-field="rgbRaceMode" aria-label="RGB behavior during races"><option value="static">Static</option><option value="border">Border only</option><option value="full">Full RGB</option></select></label>
                  </div>
                </div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="19" r="2" fill="currentColor" stroke="none"/></svg></span>
                  <div class="card-h"><span class="card-t">Display</span><span class="card-s">density · contrast · focus</span></div>
                  <div class="rows">
                    <div class="row" title="Comfortable keeps the roomy rhythm; compact trims padding so more rows fit while racing"><span>density</span><select class="cmp-select" data-field="panelDensity" aria-label="Panel density"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div>
                    <div class="row" title="115% widens the panel and the type for long sessions and high-DPI screens"><span>scale</span><select class="cmp-select" data-field="panelScale" aria-label="Panel scale"><option value="100">100%</option><option value="115">115%</option></select></div>
                    <div class="row" title="High contrast: pure white text and stronger hairlines on every theme"><span>contrast</span><button class="sw" type="button" role="switch" aria-checked="false" data-visual-toggle="highContrast" data-on="0" title="High contrast: pure white text and stronger hairlines on every theme"></button></div>
                    <div class="row" title="Race focus: a pace, accuracy and next-action strip while racing, with the account card out of the way"><span>race focus</span><button class="sw" type="button" role="switch" aria-checked="true" data-visual-toggle="raceFocus" data-on="1" title="Race focus: a pace, accuracy and next-action strip while racing, with the account card out of the way"></button></div>
                  </div>
                  <div class="cfg-note">Display choices are saved with the theme and travel with an exported config.</div>
                </div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 5h14v14H5z"/><path d="M8 9h8M8 13h5"/></svg></span>
                  <div class="card-h"><span class="card-t">Config</span><span class="card-s">carry it anywhere</span></div>
                  <div class="rows" style="display:flex; gap:6px; margin:0 0 2px">
                    <button class="act" type="button" data-act="export" title="Copy this configuration (profile, limit, sound, switches) so it can be pasted in another browser or account">copy</button>
                    <button class="act" type="button" data-act="import" title="Apply whatever config is pasted in the box below">apply</button>
                    <button class="act" type="button" data-act="report" title="Copy a diagnostic report (version, profile, counters, last races, recent notices, flight recorder, environment) to paste when something is off">report</button>
                    <button class="act" type="button" data-act="csv" title="Download the closed sessions as a CSV (date, races, WPM, target, deviation, accuracy, DQ, reason) for a spreadsheet">csv</button>
                    <button class="act" type="button" data-act="releases" title="Open the GitHub release history to install a previous version if the newest one misbehaves">versions</button>
                    <button class="act" type="button" data-act="channel" title="${CHANNEL === 'canary' ? 'Download the stable release and go back to the normal channel' : 'Install the canary test build; it updates itself from the canary release and never changes the stable one'}">${CHANNEL === 'canary' ? 'stable' : 'canary'}</button>
                  </div>
                  <div class="rows">
                    <div class="row up-row" data-field="upRow" title="Auto-update check: the last result, its error and when it will retry"><span>update</span><b data-field="up">—</b></div>
                    <div class="row ch-row" data-field="chRow" title="Daily Challenge popup: close it automatically. Shift+click sets a CSS selector"><span>challenge</span><b data-field="ch">on</b></div>
                  </div>
                  <textarea class="cfg-text" data-field="cfgText" spellcheck="false" placeholder="Paste a copied config here and press apply."></textarea>
                  <div class="cfg-note" data-field="cfgNote">Pace and switches are saved on this browser and survive reloads.</div>
                </div>
                </div>
              </div>
            </section>
            </template>

            <!-- ------------------------------ LOG --------------------------- -->
            <template data-view="log">
            <section class="view v-log" id="nt-view-log" role="tabpanel" aria-label="Log">
              <div class="view-head"><span>Log</span><b>sessions · challenges</b></div>
              <div class="log-toolbar">
                <label class="log-search" title="Filter sessions, days, challenges and notices">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
                  <input type="search" data-field="logSearch" placeholder="Filter log…" autocomplete="off" spellcheck="false" aria-label="Filter log entries">
                  <button type="button" class="log-clear" data-field="logClear" aria-label="Clear log filter" title="Clear filter" hidden>×</button>
                </label>
                <span class="log-filter-count" data-field="logCountFiltered" aria-live="polite">all entries</span>
              </div>
              <div class="log-empty" data-field="logEmpty" role="status" hidden></div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/></svg></span>
                <div class="card-h"><span class="card-t" data-field="prevLabel">prev</span><span class="card-s">click for the table</span></div>
                <button type="button" class="prev-row row" style="display:none" title="The last session that closed: races, average WPM and deviation from target">
                  <span>session</span><b data-field="prev">—</b>
                </button>
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
              <div class="card update-card">
                <div class="card-h"><span class="card-t">Updates</span><span class="card-s">GitHub releases</span></div>
                <div class="rows">
                  <div class="row" title="Last public update check. A newer build is downloaded from GitHub, never installed without your click."><span>check</span><b data-field="upInfo">—</b></div>
                </div>
                <div class="season-actions">
                  <a class="act" href="${UPDATE_PAGE_URL}" target="_blank" rel="noopener noreferrer" title="Open the latest release on GitHub">open GitHub</a>
                  <button class="act" type="button" data-act="updateCheck" title="Check the public Gist for a newer version now">check now</button>
                </div>
                <div class="cfg-note">The Gist meta is checked every 5 minutes, when you return to the tab and when the connection comes back; if the Gist is down, the latest GitHub release asset is used. The installed copy changes only when you download a release.</div>
              </div>
              <div class="card">
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
