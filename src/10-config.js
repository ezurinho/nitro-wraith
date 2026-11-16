
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
      everyRaces: 25,        // ademas, una lectura nueva cada 25 carreras
      halfWidth: 6,          // ancho maximo del rango; con 43 WPM da 37-49
      minWpm: 15,            // cuentas principiantes tambien son validas
      timeoutMs: 8000,
      // Un override manual manda sobre la media. 0 = automatico.
      customWpm: 0,
      customAccuracy: 0,
      // Si la media se hundio pero el top sigue alto, el objetivo no se queda
      // en la media hundida: se usa un suelo de recuperacion proporcional al
      // top. Nunca puede saltar mas de un 25% sobre la media actual: una
      // cuenta de 50 WPM no empieza a 110 solo porque su top sea alto. El
      // trinquete sigue impidiendo que una racha corta baje el objetivo.
      recoveryTopRatio: 0.48,
      recoveryTopMin: 80,
      recoveryTopCap: 110,
      recoveryTopJumpRatio: 1.25,
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
      // Por defecto solo corre con la pestana visible: Chrome puede congelar
      // una pestana oculta y una carrera congelada acaba en DQ. Se puede
      // activar en TUNE si aceptas ese riesgo.
      backgroundFarm: false,
      // Opcional y apagado: una senal de audio casi inaudible mantiene el
      // documento despierto cuando AFK esta encendido. No sustituye al reloj
      // Worker ni garantiza que el navegador no congele la pestana.
      keepAlive: false,
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
    // Si una carrera viva lleva este tiempo sin avanzar y esta copia esta en
    // standby, se recupera el turno: quedarse esperando a una copia que no
    // escribe es una DQ por inactividad.
    standbyRescueMs: 4000,
      // Impossible reading: finish the race in progress (abandoning it would be a
      // DQ) and then step away for a long, human break. The bot always comes back
      // on its own - it never parks itself waiting for a key.
      cooldownMs: [60000, 180000],
    },

    // Un sticker en todas las carreras. El usuario lo pidio explicitamente;
    // se mantiene el envio unico por carrera y el reintento si el chat todavia
    // no esta montado. El reto racesWithSticker ya no necesita boost.
    stickers: {
      enabled: true,
      chance: 100,       // % de carreras en las que se manda uno
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
    stallGraceMs: 6000,    // cuanto se aguanta sin avanzar antes de dejar de insistir
    stallGiveUpMs: 30000,  // sin avance ni DQ: se para el bot, no se abandona la carrera viva

    // Inactivity disqualification: the server kicks you out if you stop sending
    // keys inside a race (~12 s). Pausing mid-race is therefore a guaranteed loss,
    // so the pause cuts itself at dqGuardMs. Two DQ in a row stop the bot: at five
    // Nitro Type blocks the account for a while.
    dqGuardMs: 6000,
    // Red de seguridad si el bucle se queda sin mandar teclas con la carrera
    // viva (lock de otra pestana, pausa o espera inesperada). El servidor
    // descalifica tras ~12 s sin caracteres; a los 7 s se manda una tecla
    // correcta y se vuelve a mirar. No sustituye al bucle: solo lo despierta.
    inactivityRescueMs: 7000,
    inactivityNudgeMs: 7000,
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

  const VERSION = '8.14.46';

  // Aviso de version: el meta del Gist es publico aunque el Gist sea secreto,
  // asi que se puede leer sin token. Se consulta cada 5 min y al volver a la
  // pestana; si falla, se reintenta a los 5 min. Un fallo de red no borra un
  // aviso anterior ni bloquea la partida.
  const UPDATE_META_URL = 'https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.meta.js';
  const UPDATE_DOWNLOAD_URL = 'https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.user.js';
  const UPDATE_PAGE_URL = 'https://github.com/ezurinho/nitro-wraith/releases/latest';
  const UPDATE_GITHUB_URL = 'https://github.com/ezurinho/nitro-wraith/releases/latest/download/nitro-wraith.user.js';
  const UPDATE_KEY = 'nta:update';
  const UPDATE_RECHECK_MS = 5 * 60000;
  const UPDATE_RETRY_MS = 5 * 60000;
  const UPDATE_FETCH_TIMEOUT_MS = 8000;
  let updateChecking = false;
  // El panel del garaje vive en otro bloque lexico; se guarda aqui el boton
  // para que una comprobacion iniciada desde la carrera tambien lo actualice.
  let garageUpdateNode = null;
  let garageCompactUpdateNode = null;

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
        title: 'Update check: not run yet. It runs when the panel opens, every 5 minutes and when the page comes back online.',
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
        + ' It runs again in 5 minutes.',
    };
  }

  function paintUpdateHealth(force = false) {
    const nodes = panel.refs ? [panel.refs.up, panel.refs.upInfo].filter(Boolean) : [];
    if (!nodes.length) return;
    const now = Date.now();
    // La edad del chequeo cambia como mucho cada minuto: no hay razon para
    // leer `nta:update` ni tocar el DOM dos veces por segundo. Una comprobacion
    // real pasa `force` para que el cambio se vea al instante.
    if (!force && panel.updateHealthAt && now - panel.updateHealthAt < 30000) return;
    panel.updateHealthAt = now;
    const health = updateHealth();
    for (const node of nodes) {
      setText(node, health.text);
      setGood(node, health.good);
      if (node.title !== health.title) node.title = health.title;
    }
  }

  function paintUpdateBadge(node, withVersion = false, iconOnly = false) {
    if (!node) return;
    const info = updateInfo();
    if (node.hidden !== !info) node.hidden = !info;
    if (!info) return;
    const textNode = iconOnly ? null : (node.querySelector('span') || node);
    const badgeText = withVersion ? `update v${info.latest}` : 'update';
    if (textNode && textNode.textContent !== badgeText) textNode.textContent = badgeText;
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
      paintUpdateBadge(garageUpdateNode, true);
      paintUpdateBadge(garageCompactUpdateNode, false, true);
      if (!previous || previous.error !== error) {
        log(`Update check failed: ${error} (retrying in 5 min).`);
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
        referrerPolicy: 'no-referrer',
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
      paintUpdateBadge(garageUpdateNode, true);
      paintUpdateBadge(garageCompactUpdateNode, false, true);
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
    calibrationVersion: 'autoTyperCalibrationVersion',
    calibrationAccount: 'autoTyperCalibrationAccount',
    lifetimeWpm: 'autoTyperLifetimeWpm',
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
