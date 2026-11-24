
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
    capDebt: 0,           // mayor deuda SIN recortar: si pasa de capMaxWait, el techo se escapo
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
    lastKeyAt: 0,        // ultima tecla enviada (aunque el juego no la acepte)
    lastAcceptedAt: 0,   // ultima tecla que el juego conto: la que evita la DQ
    liveRound: false,    // este bucle esta dentro de una carrera, no en resultados
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

  // AFK observability: a freeze is the event the keep-alive is trying to avoid,
  // so keep a small browser-level count. It survives reloads and is shown in
  // TUNE/garage; no account data is involved.
  const AFK_FREEZE_KEY = 'nta:afkFreeze';
  function loadAfkFreezeStats() {
    try {
      const saved = JSON.parse(localStorage.getItem(AFK_FREEZE_KEY) || 'null');
      return {
        count: Math.max(0, Number(saved && saved.count) || 0),
        lastAt: Math.max(0, Number(saved && saved.lastAt) || 0),
        lastDurationMs: Math.max(0, Number(saved && saved.lastDurationMs) || 0),
        totalMs: Math.max(0, Number(saved && saved.totalMs) || 0),
      };
    } catch {
      return { count: 0, lastAt: 0, lastDurationMs: 0, totalMs: 0 };
    }
  }
  let afkFreezeStats = loadAfkFreezeStats();
  function saveAfkFreezeStats() {
    try { localStorage.setItem(AFK_FREEZE_KEY, JSON.stringify(afkFreezeStats)); } catch { /* modo privado */ }
  }
  function noteAfkFreeze() {
    afkFreezeStats.count += 1;
    afkFreezeStats.lastAt = Date.now();
    saveAfkFreezeStats();
  }
  function noteAfkResume(durationMs) {
    const ms = Math.max(0, Number(durationMs) || 0);
    afkFreezeStats.lastDurationMs = ms;
    afkFreezeStats.totalMs += ms;
    saveAfkFreezeStats();
  }
  function resetAfkFreezeStats() {
    afkFreezeStats = { count: 0, lastAt: 0, lastDurationMs: 0, totalMs: 0 };
    saveAfkFreezeStats();
    return { ...afkFreezeStats };
  }
  // El freeze ocurre en el iframe de la carrera, pero el garaje vive en la
  // ventana de arriba. Sin esta relectura, el contador del garaje se quedaba
  // congelado en el valor del arranque hasta recargar la pagina.
  function refreshAfkFreezeStats() {
    try {
      const saved = JSON.parse(localStorage.getItem(AFK_FREEZE_KEY) || 'null');
      if (!saved) return afkFreezeStats;
      const count = Math.max(0, Number(saved.count) || 0);
      const lastAt = Math.max(0, Number(saved.lastAt) || 0);
      const totalMs = Math.max(0, Number(saved.totalMs) || 0);
      if (count !== afkFreezeStats.count
        || lastAt !== afkFreezeStats.lastAt
        || totalMs !== afkFreezeStats.totalMs) {
        afkFreezeStats = loadAfkFreezeStats();
      }
    } catch { /* modo privado */ }
    return afkFreezeStats;
  }

  // Session limit: only measured races count towards it, never a DQ. The time
  // limit is checked between races, never mid-race: the loop asks before it
  // opens one, and a live race always finishes (leaving it is a DQ).
  const timeLimitLeft = () => timeLimitLeftFor({
    timeLimit: session.timeLimit,
    tandaStartedAt: session.tandaStartedAt,
  });

  // Presupuesto del dia: carreras y XP reales de hoy. El override solo lo usa
  // el banco para probar los bordes sin mover el resumen del dia.
  let dailyCountsOverride = null;
  // La cuenta es pura y vive en 36-queue-policy.js; aqui solo se elige de
  // donde salen los numeros (resumen del dia o el override del banco).
  function dailyCaps() {
    return dailyCapsFor(dailyCountsOverride || todayRead(), {
      raceCap: session.dailyRaceLimit,
      xpCap: session.dailyXpLimit,
    });
  }

  const dailyLimitReached = () => {
    const daily = dailyCaps();
    return daily.raceHit || daily.xpHit;
  };

  /* --------------------------------------------------------------------------
   * Ventana de horas activas
   * ------------------------------------------------------------------------ */
  // La matematica de la ventana (medianoche incluida) vive en
  // 36-queue-policy.js y se prueba en Node; aqui solo se pasan los ajustes de
  // la sesion actual.
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

  const limitReached = () => sessionLimitReached({
    races: session.races,
    raceLimit: session.raceLimit,
    xp: session.xp,
    xpLimit: session.xpLimit,
    timeLimit: session.timeLimit,
    tandaStartedAt: session.tandaStartedAt,
  }, dailyCaps());

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
    return `avg ${wpmInt(avg.wpm)} WPM (${dev >= 0 ? '+' : ''}${dev.toFixed(1)}%) · ${avg.acc.toFixed(1)}%${dq}${day ? ` · today ${day}` : ''}`;
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
    session.lastKeyAt = 0;
    session.lastAcceptedAt = 0;
    session.nitroTries = 0;
    session.nitroDone = false;
    session.nitroChars = 0;
    session.nitroWords = 0;
    session.nitroSpread = 0;
    nitroPreview = null;
    session.typing = false;
    session.inactivityNoted = false;
    session.inactivityRescues = 0;
    session.capLogged = false;
    session.capMaxWait = 0;
    session.capDebt = 0;
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

  // Nucleo puro del gobernador: sin estado y con el reloj inyectado, para que el
  // harness pueda simular una carrera entera y comprobar el techo de verdad en
  // vez de confiar en la revision. Devuelve tambien la deuda SIN recortar: si
  // `debt` supera `maxHold` el gobernador ya no puede sujetar el techo y quien
  // llama tiene que poder decirlo.
  function paceGovernorAt(startedAt, typed, now, cap = CONFIG.wpm.hardCap, dqGuardMs = CONFIG.dqGuardMs) {
    if (!Number.isFinite(cap) || cap <= 1 || !startedAt || typed < 0) {
      return { wait: 0, debt: 0, maxHold: 0, msPerChar: 0, cap };
    }

    const msPerChar = 60000 / ((cap - 1) * 5);
    // The key about to be sent counts as well. With only the keys already sent,
    // the average could sit one keystroke ahead of the budget, which is exactly
    // the overshoot the bench caught: a race that ends at 119 WPM but reads 130
    // during its first seconds, right when the game's HUD first refreshes.
    //
    // typed === 0 (la primera tecla) tambien pasa por aqui: sin esto la media de
    // la carrera empezaba en el primer caracter a la velocidad del dedo (600 WPM
    // en 20 ms), y era el unico tramo del carrera sin tope. Como el retardo
    // normal ya ronda el msPerChar, en la practica la retencion sale 0.
    const dueAt = startedAt + (typed + 1) * msPerChar;
    // Nunca retener 15 s: el servidor descalifica por inactividad a los ~12 s y
    // una espera larga del gobernador es indistinguible de un bot colgado.
    // 5.5 s deja margen incluso con el guard de 6 s.
    const maxHold = Math.max(1000, Math.min(6000, Number(dqGuardMs) || 6000) - 500);
    const debt = dueAt - now;
    return { wait: clamp(debt, 0, maxHold), debt, maxHold, msPerChar, cap };
  }

  // Hard ceiling governor. Nitro Type measures WPM as characters per five over
  // the time since the light goes out, so a race's running average can be capped
  // exactly: this returns how long to hold before the next keystroke so that this
  // race can never average past CONFIG.wpm.hardCap - 1. It counts every character
  // already sent (wrong ones included), so it matches the game's own math.
  function paceCapWait(now = Date.now()) {
    // Solo las teclas de esta copia: lo que el nitro salto no se tecleo, y el
    // coste ya va repartido en nitroSpread. Contarlo aqui frenaba la carrera
    // entera de golpe justo despues de usarlo.
    const typed = session.chars - session.nitroChars;
    const governor = paceGovernorAt(session.startedAt, typed, now);

    // La deuda que el recorte no cubre es la unica forma de que una carrera se
    // pase del techo: se anota entera (sin recortar) para que el diagnostico no
    // diga "retuve 5,5 s" cuando en realidad hacia falta medio minuto.
    if (governor.debt > session.capDebt) session.capDebt = Math.round(governor.debt);
    return governor.wait;
  }

