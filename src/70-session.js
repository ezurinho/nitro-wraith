
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
    calibrationRaceMark = 0;
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

    // Un baneo permanente no se salta con A. La marca no caduca sola: solo se
    // quita con «Clear ban» en el garaje, despues de revisar la cuenta. Asi no
    // se entra en un bucle de «Race Again» contra una cuenta cerrada.
    if (terminalBanActive()) {
      log('Account permanently banned: the bot stays stopped. Review the account before racing again.');
      updatePanel();
      return false;
    }

    // Un castigo por racha sigue vigente aunque pulses A: reanudar aqui solo
    // volveria a abrir la carrera que el sitio acaba de rechazar.
    if (siteBlockedUntil() > Date.now()) {
      log('Site block: the account cannot race yet; wait for the block to pass.');
      updatePanel();
      return false;
    }

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
    setBanClearHeld(false);
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

  // Foto de lo que esta pasando AHORA, no de lo que paso al abrir la carrera.
  // La usan el panel, el diagnostico y el vigilante de 500 ms.
  function livePhase(now = Date.now()) {
    if (session.stopped) return 'stopped';
    if (dqSeenAt && now - dqSeenAt < 20000) return 'dq';
    if (siteBlockedUntil() > now) return 'blocked';
    if (session.breakUntil > now) return 'break';
    if (session.paused) return 'paused';
    if (!session.running) return 'idle';
    if (session.endedAt && !session.typing) return 'results';
    const app = findTypingApp();
    if (!app) return 'waiting';
    if (!session.liveRound) return 'results';
    return session.typing ? 'racing' : 'countdown';
  }

  function liveSituation(now = Date.now()) {
    const lease = tabLeaseInfo();
    const acceptedAt = session.lastAcceptedAt || session.startedAt || 0;
    const sentAt = session.lastKeyAt || 0;
    return {
      phase: livePhase(now),
      acceptedAgeMs: acceptedAt ? Math.max(0, now - acceptedAt) : 0,
      sentAgeMs: sentAt ? Math.max(0, now - sentAt) : 0,
      standby: Boolean(standbySnapshot()),
      rescue: typingRescueUntil > now,
      typingLock: typingLockHeld,
      lease,
    };
  }

  // Vigilante de carrera viva: no espera a que el bucle llegue a su siguiente
  // comprobacion. Si el juego lleva varios segundos sin contar una tecla y esta
  // copia esta en standby, recupera el turno ya; si la copia que escribe sigue
  // viva, el indice avanza y esto no se dispara.
  let lastLiveWarnAt = 0;
  function superviseLive() {
    if (!session.running || session.stopped || session.paused || !session.liveRound) return;
    const now = Date.now();
    const phase = livePhase(now);
    if (phase !== 'racing' && phase !== 'countdown') return;
    if (captchaOnScreen()) return;

    const acceptedAt = session.lastAcceptedAt || session.startedAt || 0;
    if (!acceptedAt) return;
    const silent = now - acceptedAt;
    if (silent < CONFIG.guard.standbyRescueMs) return;

    if (standbyActive()) {
      takeTypingTurn(`live watchdog: ${phase} without an accepted key for ${Math.round(silent / 1000)} s`);
      return;
    }

    if (silent >= 8000 && now - lastLiveWarnAt >= 8000) {
      lastLiveWarnAt = now;
      log(`Live watchdog: ${phase} has gone ${(silent / 1000).toFixed(1)} s without an accepted key; the race loop is still in control.`);
    }

    // Ultima red antes del corte de ~12 s: si el bucle sigue vivo pero atascado
    // (una espera larga, React remontando, un lock que no vuelve), se manda una
    // tecla correcta. Se exige que tampoco se hayan enviado teclas en los
    // ultimos 7 s para no duplicar una pulsacion del bucle ni romper la
    // precision durante un stall normal.
    if (phase !== 'racing' || silent < CONFIG.inactivityRescueMs) return;
    if (now - (session.lastKeyAt || 0) < CONFIG.inactivityNudgeMs) return;

    if (!typingLockHeld) {
      acquireTypingLock({ steal: true }).catch(() => false);
      return;
    }

    const app = findTypingApp();
    const content = app ? getContent(app) : '';
    const index = app ? getIndex(app) : -1;
    if (!content || index < 0 || index >= content.length) return;

    if (!session.inactivityNoted) {
      session.inactivityNoted = true;
      log(`Inactivity guard: ${(silent / 1000).toFixed(1)} s without an accepted key; sending one correct key to keep the race alive.`);
    }
    if (press(app, content[index])) {
      session.lastKeyAt = Date.now();
      session.inactivityRescues = (Number(session.inactivityRescues) || 0) + 1;
    }
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

    panic('stopped manually', 0, true);
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

    panic('turned off from the panel', 0, true);
  }

  // Marca de parada deliberada, compartida con la cola del garaje: si el bot se
  // paro por el tope de la tanda o por Esc, el garaje no debe abrir otra carrera
  // (saldria sin teclas y el servidor la descalifica por inactividad). Caduca
  // sola, y volver a encenderlo (Alt+A / MODE) la borra.
  const STOP_MARK = 'ntQueue:stoppedAt';
  const LAST_STOP = 'ntQueue:lastStop';
  const STOP_HISTORY = 'ntQueue:stopHistory';
  const STOP_HISTORY_MAX = 20;
  const STOP_HISTORY_DAYS = 7;
  const STOP_HOLD_MAX = 24 * 60 * 60 * 1000;
  const BAN_CLEAR_HOLD = 'ntQueue:banClearHold';

  // «Clear ban» no debe dejar que el garaje se rearme solo en el siguiente
  // latido: la cuenta sigue siendo la misma y el usuario tiene que decidir
  // cuando vuelve a armar la cola.
  function banClearHeld() {
    try {
      return localStorage.getItem(BAN_CLEAR_HOLD) === '1';
    } catch {
      return false;
    }
  }

  function setBanClearHeld(on) {
    try {
      if (on) localStorage.setItem(BAN_CLEAR_HOLD, '1');
      else localStorage.removeItem(BAN_CLEAR_HOLD);
    } catch {
      /* almacenamiento bloqueado */
    }
  }

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

  function activeStopInfo() {
    try {
      const saved = JSON.parse(localStorage.getItem(STOP_MARK) || 'null');
      return saved && Number.isFinite(Number(saved.at)) ? saved : null;
    } catch {
      return null;
    }
  }

  function manualStopActive() {
    const saved = activeStopInfo();
    return Boolean(saved && saved.manual === true);
  }

  function markStopped(reason, holdMs, manual = false) {
    // Una parada nueva manda sobre la pausa manual que dejó «Clear ban».
    setBanClearHeld(false);
    const entry = {
      at: Date.now(),
      reason: String(reason || ''),
      holdMs: Number(holdMs) > 0 ? Number(holdMs) : 0,
      manual: manual === true,
    };
    try {
      localStorage.setItem(STOP_MARK, JSON.stringify(entry));
      localStorage.setItem(LAST_STOP, JSON.stringify({ ...entry, clearedAt: 0, clearedBy: '' }));
    } catch {
      /* almacenamiento bloqueado */
    }
    noteStopHistory(entry);
  }

  // Una parada puede marcarse dos veces en el mismo latido (por ejemplo al
  // volver de resultados). Se descarta el duplicado inmediato para que el
  // resumen cuente paradas, no llamadas.
  function noteStopHistory(entry) {
    let list = [];
    try {
      const saved = JSON.parse(localStorage.getItem(STOP_HISTORY) || '[]');
      if (Array.isArray(saved)) list = saved;
    } catch {
      /* almacenamiento bloqueado o JSON viejo */
    }

    const last = list[list.length - 1];
    if (last && Number.isFinite(Number(last.at))
      && entry.at - Number(last.at) < 5000
      && String(last.reason || '') === entry.reason) {
      return;
    }

    list.push({ at: entry.at, reason: entry.reason, holdMs: entry.holdMs, manual: entry.manual === true });
    if (list.length > STOP_HISTORY_MAX) list = list.slice(-STOP_HISTORY_MAX);
    try {
      localStorage.setItem(STOP_HISTORY, JSON.stringify(list));
    } catch {
      /* almacenamiento bloqueado */
    }
  }

  function clearStopped() {
    try {
      // La marca activa suele estar, pero si solo queda el registro de la
      // ultima parada (por ejemplo tras limpiar storage o un reload a medias)
      // hay que marcarlo igual: si no, un baneo terminal no se podria borrar.
      const raw = localStorage.getItem(STOP_MARK) || localStorage.getItem(LAST_STOP);
      const stop = raw ? JSON.parse(raw) : null;
      if (stop && Number.isFinite(Number(stop.at))) {
        localStorage.setItem(LAST_STOP, JSON.stringify({
          at: Number(stop.at),
          reason: String(stop.reason || ''),
          holdMs: Number(stop.holdMs) > 0 ? Number(stop.holdMs) : 0,
          clearedAt: Date.now(),
          clearedBy: 'manual',
          manual: Boolean(stop.manual),
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
      const clearedAt = Number(saved.clearedAt) || 0;
      return {
        at: Number(saved.at),
        reason: String(saved.reason || ''),
        clearedAt,
        clearedBy: String(saved.clearedBy || ''),
        holdMs,
        manual: Boolean(saved.manual),
        // Un baneo permanente no caduca con el reloj: solo se quita cuando el
        // usuario borra la parada a mano (Clear ban).
        terminal: Boolean(!clearedAt && looksTerminalBan(saved.reason)),
        endAt: Number(saved.at) + holdMs,
      };
    } catch {
      return null;
    }
  }

  function terminalBanActive() {
    const saved = lastStopInfo();
    if (!saved || saved.clearedAt) return false;
    return saved.terminal === true;
  }

  let terminalBanNoted = false;

  // El tipador es quien tiene el teclado: al ver el aviso se para y deja la
  // marca que el garaje y Alt+A respetan. Se llama desde el latido y desde el
  // vigilante de 1 s; `terminalBanNoted` evita repetir la parada en cada tick.
  function handleTerminalBan(text) {
    if (!looksTerminalBan(text)) return false;
    if (terminalBanNoted) return true;
    terminalBanNoted = true;
    panic('account permanently banned; automation stopped', STOP_HOLD_MAX);
    storeNotice('Account permanently banned: the bot stays stopped until you clear the ban manually.');
    beep('block');
    return true;
  }

  // La fila del garaje no repite el texto tecnico entero: lo reduce a la
  // categoria que se busca de un vistazo. El detalle sigue en el tooltip.
  function stopReasonKind(reason) {
    const text = String(reason || '').toLowerCase();
    if (looksTerminalBan(text)) return { label: 'ban', warn: '2' };
    if (/\bdq\b|disqualif/.test(text)) return { label: 'DQ', warn: '2' };
    if (/limit|tope|cap\b|budget|daily/.test(text)) return { label: 'limit', warn: '1' };
    if (/results page/.test(text)) return { label: 'results', warn: '1' };
    return { label: 'manual', warn: '' };
  }

  function stopWaitText(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    if (min < 1) return 'less than a minute';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  function stopHistoryRead(now = Date.now()) {
    const cutoff = now - STOP_HISTORY_DAYS * 24 * 60 * 60 * 1000;
    try {
      const saved = JSON.parse(localStorage.getItem(STOP_HISTORY) || '[]');
      if (!Array.isArray(saved)) return [];
      const list = saved
        .filter((item) => item && Number.isFinite(Number(item.at)) && Number(item.at) >= cutoff)
        .slice(-STOP_HISTORY_MAX);
      // La ventana se aplica al leer, pero tambien se escribe: sin esto las
      // entradas viejas seguian ocupando el limite de 20 hasta que una parada
      // nueva las empujaba fuera. La limpieza es automatica y silenciosa.
      if (list.length !== saved.length) {
        try {
          localStorage.setItem(STOP_HISTORY, JSON.stringify(list));
        } catch {
          /* almacenamiento bloqueado */
        }
      }
      return list;
    } catch {
      return [];
    }
  }

  function stopHistorySummary(now = Date.now()) {
    const counts = { DQ: 0, limit: 0, manual: 0, ban: 0, results: 0 };
    const list = stopHistoryRead(now);
    for (const item of list) {
      const kind = stopReasonKind(item.reason);
      if (Object.prototype.hasOwnProperty.call(counts, kind.label)) counts[kind.label] += 1;
    }
    return { total: list.length, counts };
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
  function panic(reason, holdMs, manual = false) {
    releaseTypingLock();
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
    markStopped(reason || 'stopped', holdMs, manual);

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
        panic('stopped manually', 0, true);
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
      clickByText(['go to your garage', 'go to garage', 'view garage', 'your garage', 'garage']);
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
      if (clickByText(['go to your garage', 'go to garage', 'view garage', 'your garage', 'garage', 'try again'])) {
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
  async function backgroundClockHealthy() {
    if (preciseClockKind !== 'worker') return false;
    const started = performance.now();
    await preciseSleep(120);
    return preciseClockKind === 'worker' && performance.now() - started < 900;
  }

  async function waitWhileThrottled() {
    // Con el reloj Worker la cadencia no depende de los timers de la pagina. Si
    // el Worker no responde (CSP, pestana congelada o Worker terminado), la
    // espera sigue siendo necesaria: en segundo plano los timers normales se
    // frenan y la carrera saldria con DQ. No basta con que el Worker se haya
    // creado: se comprueba que contesta antes de abrir otra carrera oculta.
    if (backgroundFarm() && pageHidden()) {
      if (await backgroundClockHealthy()) return false;

      log('Background clock unavailable: waiting for the tab.');
      while (!session.stopped && pageHidden()) {
        await sleep(1000);
        if (await backgroundClockHealthy()) return false;
      }
      if (session.stopped) return true;
    }

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

  // `navigator.onLine` no garantiza que el servidor responda, pero cuando el
  // navegador afirma que no hay red no tiene sentido gastar clics de "Race Now"
  // ni contar rebotes: la sesion y el servidor no van a contestar. Se usa solo
  // el valor negativo porque un falso positivo de conexion no debe parar nada.
  function onlineNow() {
    return navigator.onLine !== false;
  }

  async function waitWhileOffline() {
    if (onlineNow()) return false;

    log('No network: holding the next race until the connection returns.');
    while (!session.stopped && !onlineNow()) await preciseSleep(1000);
    if (!session.stopped) log('Network back: the race loop resumes.');
    return true;
  }

  // Farmeo AFK: la pestana puede estar oculta. El reloj Worker mantiene la
  // cadencia y la cola tambien late con el; por eso no se espera a volver al
  // foco. Si se desactiva, se conserva el comportamiento antiguo.
  function backgroundFarm() {
    return CONFIG.queue.backgroundFarm !== false;
  }

  // Interlock: con AFK estricto, una pestana oculta no abre carreras hasta que
  // el keep-alive confirma que esta corriendo. `ready` o `blocked` no cuentan:
  // un AudioContext suspendido no mantiene vivo el documento.
  function afkKeepAliveConfirmed() {
    if (CONFIG.queue.afkRequireKeepAlive !== true) return true;
    if (typeof keepAliveInfo !== 'function') return false;
    try {
      return keepAliveInfo().label === 'on';
    } catch {
      return false;
    }
  }

  // Separado de `hiddenBlocked` para poder probar la decision con hidden=true
  // sin depender de que el navegador de pruebas tenga la página en segundo plano.
  function afkHiddenBlocked(hidden = pageHidden()) {
    if (!hidden) return false;
    return !backgroundFarm() || !afkKeepAliveConfirmed();
  }

  function hiddenBlocked() {
    return afkHiddenBlocked();
  }

  // Con backgroundFarm activo no se abre una espera por estar oculto. Solo se
  // espera si el modo AFK esta apagado; ahi el navegador frena los timers y la
  // carrera se quedaria sin teclas (DQ por inactividad).
  async function waitWhileHidden() {
    if (!pageHidden() || !hiddenBlocked()) return false;

    const strict = backgroundFarm() && CONFIG.queue.afkRequireKeepAlive === true;
    log(strict
      ? 'AFK interlock: hidden tab with no running keep-alive; no new race until it is confirmed or the tab is visible again.'
      : 'Background farming is off: no new race until the tab is visible again.');
    noteFlight('afk-hold', strict ? 'keep-alive not confirmed' : 'background farming off');
    while (!session.stopped && pageHidden() && hiddenBlocked()) await preciseSleep(1000);
    return true;
  }

  // El modal de DQ tapa la app y no queda carrera viva. Sin esto habia que
  // esperar al empujon de 25 s (CONFIG.idleNudgeMs) para volver a jugar.
  let lastDqClickAt = 0;

  function siteBlockedUntil() {
    return Number(disk.get(DQ_BLOCK_UNTIL, 0)) || 0;
  }

  // El aviso de bloqueo puede salir dentro del iframe de la carrera. El
  // vigilante de la ventana de arriba no lo ve, asi que el bloqueo tiene que
  // quedar escrito tambien desde aqui. Si la cola ya lo anoto, no se escala dos
  // veces: solo se copia a la sesion para que ningun camino abra otra carrera.
  function rememberFrameDqBlock() {
    let until = siteBlockedUntil();
    if (until <= Date.now()) {
      const stage = Math.max(0, Number(disk.get(DQ_BLOCK_STAGE, 0)) || 0);
      const ms = dqBlockWaitMs(stage);
      until = Date.now() + ms;
      disk.set(DQ_BLOCK_STAGE, String(Math.min(stage + 1, DQ_BLOCK_STAGE_MAX)));
      disk.set(DQ_BLOCK_UNTIL, String(until));
      log(`The site blocked the account for too many disqualifications: no race for ${Math.round(ms / 60000)} min.`);
      beep('block');
      if (typeof notifyUser === 'function') {
        notifyUser('Nitro Wraith: site block', `Too many disqualifications; waiting ${Math.round(ms / 60000)} min before racing again.`, 'site-block');
      }
      noteFlight('site-block', `${Math.round(ms / 60000)} min`);
    }
    session.breakUntil = Math.max(session.breakUntil, until);
    saveCounters();
    updatePanel();
    return until;
  }

  function recoverFromDqModal() {
    if (!document.body) return false;
    const text = modalText();
    if (!looksDisqualified(text)) return false;

    // Si el usuario paro el bot, no se pulsa Race Again por el: era justo lo
    // que seguia abriendo carreras despues de una descalificacion. El aviso se
    // queda quieto hasta que se reanude a mano (Alt+A / Resume).
    if (session.stopped) return true;

    // El castigo por racha no se cierra ni se reintenta: cada intento gasta
    // otra vuelta de las que el sitio cuenta. Se deja el aviso quieto y se
    // guarda la espera donde la leen la cola y el bucle de carreras.
    if (looksDqBlocked(text)) {
      dqBlockedNoted = true;
      const until = siteBlockedUntil();
      if (!until || until > Date.now()) {
        rememberFrameDqBlock();
        return true;
      }

      // La espera ya vencio y el aviso sigue pintado: se sale por el garaje.
      // «Race Again» no se toca ni aqui: el siguiente intento lo hace la cola
      // con su retardo, no este modal viejo.
      if (clickByText(['go to your garage', 'go to garage', 'view garage', 'your garage', 'garage'])) {
        notifyTopNeedGarage('disqualification block screen');
      }
      return true;
    }

    // Con el farmeo AFK activo tambien se cierra el modal en segundo plano; si
    // esta apagado, se deja y se vuelve al entrar en foco.
    if (hiddenBlocked()) return true;

    const now = Date.now();
    if (now - lastDqClickAt < CONFIG.queue.actionCooldownMs) return true;
    lastDqClickAt = now;
    log('Disqualification modal: going to the garage, not to Try Again.');

    // El garaje va PRIMERO. «Try Again» a veces esta deshabilitado y, sobre
    // todo, vuelve a abrir una carrera desde el mismo modal; el garaje siempre
    // esta y deja que la cola abra la siguiente con Race Now. La etiqueta real
    // puede ser «Garage», «Go To Garage» o «Go To Your Garage».
    if (clickByText(['go to your garage', 'go to garage', 'view garage', 'your garage', 'garage'])) {
      // Ojo: dentro del marco, ese boton navega el MARCO y dejaria un garaje
      // incrustado en /race. Se avisa a la ventana de arriba para que navegue
      // la pagina entera, como haria un humano.
      notifyTopNeedGarage('disqualification screen');
      return true;
    }

    // Solo si el modal no ofrece garaje se usa la salida de reintento.
    if (clickByText(['try again', 'race again', 'play again', 'next race'])) return true;
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
    clickByText(['go to your garage', 'go to garage', 'view garage', 'your garage', 'garage']);
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
    log('Disqualification modal around the race: closing it through the garage.');

    const view = topDoc.defaultView;
    const buttons = [...topDoc.querySelectorAll('button, a, [role="button"]')].filter((el) => {
      const label = normalize(el.textContent);
      if (!label || !/garage|race again|play again|next race/.test(label)) return false;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const style = view ? view.getComputedStyle(el) : null;
      return !style || (style.display !== 'none' && style.visibility !== 'hidden');
    });

    // Garage antes que Race Again: el modal de DQ debe salir por el garaje.
    const target = buttons.find((el) => /garage/.test(normalize(el.textContent))) || buttons[0];
    if (!target) return false;
    target.click();
    return true;
  }

  async function waitForApp(timeoutMs = 0) {
    const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : 0;
    let announced = false;
    let lastModalCheck = 0;
    let lastNudge = Date.now();
    let lockWaitAt = 0;

    while (!session.stopped) {
      // El Web Lock solo se tiene mientras esta copia puede escribir. Si el
      // lease cambia a otra pestaña, se suelta aqui; si no se tiene y el turno
      // es de esta, se pide antes de seguir esperando la pantalla.
      if (standbyActive()) {
        if (typingLockHeld) releaseTypingLock();
      } else if (!typingLockHeld && !(await acquireTypingLock())) {
        if (!lockWaitAt) lockWaitAt = Date.now();
        // Si ya hay una carrera en pantalla y el lock sigue en una pestaña que
        // no escribe, esperar indefinidamente deja la carrera sin teclas. Se
        // recupera solo cuando la app ya existe; antes de abrir carrera no se
        // toca el lock de la otra pestaña.
        if (findTypingApp() && Date.now() - lockWaitAt >= 3000) {
          log('Waiting for the race screen: the typing lock is stale; taking it back.');
          if (await acquireTypingLock({ steal: true })) {
            lockWaitAt = 0;
            continue;
          }
        }
        await preciseSleep(CONFIG.pollMs);
        continue;
      }
      lockWaitAt = 0;

      const app = findTypingApp();
      if (app) return app;
      if (deadline && Date.now() >= deadline) {
        releaseTypingLock();
        return null;
      }

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

      // Castigo por racha: no se pulsa nada mientras dure. Sin esto el empujon
      // de los 25 s buscaba un boton de carrera por detras del aviso y el
      // garaje volvia a abrir una carrera en pleno bloqueo.
      if (siteBlockedUntil() > Date.now()) {
        await preciseSleep(CONFIG.pollMs);
        continue;
      }

      // Sin carrera en pantalla durante un rato (descanso largo, recarga,
      // modal): se empuja la interfaz. Antes esto se quedaba esperando para
      // siempre y habia que refrescar a mano.
      if (!hiddenBlocked() && siteBlockedUntil() <= Date.now() && Date.now() - lastNudge > CONFIG.idleNudgeMs) {
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
    let lastIndex = -1;
    let lastProgressAt = Date.now();
    let lockWaitAt = 0;

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

      if (index > lastIndex) {
        lastIndex = index;
        lastProgressAt = Date.now();
        session.lastAcceptedAt = Date.now();
      }

      // Otra copia esta escribiendo: aqui no se manda ni la tecla de sondeo.
      // Si la carrera lleva demasiado sin avanzar, esa copia no esta haciendo
      // su trabajo: se recupera el turno antes de que el servidor DQ por
      // inactividad.
      if (standbyActive()) {
        if (typingLockHeld) releaseTypingLock();
        if (Date.now() - lastProgressAt >= CONFIG.guard.standbyRescueMs) {
          takeTypingTurn('the other copy is not starting the race');
          lastProgressAt = Date.now();
        }
        await preciseSleep(400);
        continue;
      }

      // La tecla de sondeo tambien es una tecla: no sale sin el Web Lock. Si
      // otra pestaña lo tiene, esta espera en vez de escribir a la vez. Si la
      // app ya esta en pantalla y el lock no vuelve, se recupera para no dejar
      // la cuenta atras sin teclas.
      if (!typingLockHeld && !(await acquireTypingLock())) {
        if (!lockWaitAt) lockWaitAt = Date.now();
        if (findTypingApp() && Date.now() - lockWaitAt >= 3000) {
          log('The typing lock did not come back during the countdown; taking it back.');
          if (await acquireTypingLock({ steal: true })) {
            lockWaitAt = 0;
            continue;
          }
        }
        if (Date.now() - lastTypingLockNoteAt > 10000) {
          lastTypingLockNoteAt = Date.now();
          log('Waiting for the typing lock; no keys are sent from this tab.');
        }
        await preciseSleep(300);
        continue;
      }
      lockWaitAt = 0;

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
        noteKeystroke(true);
        session.total = content.length;
        session.pos = index + 1;
        // Desde donde se cuenta esta carrera: el guardia mide con esto, no con
        // el indice absoluto de la leccion.
        session.startIndex = index;
        session.lastLogAt = session.startedAt;
        session.lastKeyAt = Date.now();
        session.lastAcceptedAt = Date.now();
        session.typing = true;
        // Variacion por carrera, sorteada aqui: la tanda mantiene su objetivo y
        // esta carrera es un poco mas rapida o mas lenta que la anterior.
        const race = rollRaceDrift();
        log(`Race started. Target: ${race.wpm} WPM / ${race.accuracy.toFixed(1)}%`
          + ` (session ${profile.targetWPM} WPM / ${profile.accuracyGoal.toFixed(1)}%, drift ${race.wpmDrift >= 0 ? '+' : ''}${race.wpmDrift})`);
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
    if (siteBlockedUntil() > Date.now()) return false;
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
  async function waitWhileSiteBlocked() {
    let until = siteBlockedUntil();
    if (until <= Date.now()) return false;

    session.breakUntil = Math.max(session.breakUntil, until);
    saveCounters();
    log(`Site block: waiting ${Math.max(1, Math.round((until - Date.now()) / 60000))} min before opening another race.`);
    updatePanel();

    while (!session.stopped) {
      await waitWhilePaused();
      until = siteBlockedUntil();
      if (until <= Date.now()) break;
      session.breakUntil = Math.max(session.breakUntil, until);
      await preciseSleep(1000);
    }

    if (!session.stopped) {
      session.breakUntil = 0;
      saveCounters();
      updatePanel();
    }
    return true;
  }

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
  function trimFor(achieved, base, target = raceWpm()) {
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
    // El objetivo contra el que se corrige es el de ESTA carrera, no el de la
    // tanda: si la carrera salio con +2 de desvio, comparar contra el centro
    // convertiria esa variacion en un error del modelo.
    const target = raceWpm();
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
  // Decisión pura del guardián AFK: una DQ cuenta como consecuencia del freeze
  // solo si AFK estaba activo y el último freeze es reciente. Se expone en
  // debug para probar la decisión sin fabricar una DQ real.
  function afkFreezeGuardDecision(now = Date.now()) {
    const freeze = typeof refreshAfkFreezeStats === 'function' ? refreshAfkFreezeStats() : afkFreezeStats;
    const recent = Boolean(freeze && freeze.lastAt && now - freeze.lastAt < 15 * 60000);
    return {
      tripped: CONFIG.queue.afkFreezeGuard !== false && CONFIG.queue.backgroundFarm === true && recent,
      recent,
      minutes: recent ? Math.round((now - freeze.lastAt) / 60000) : null,
    };
  }

  function noteDisqualification() {
    session.dqStreak++;
    session.dqCount++;
    saveCounters();
    // La racha limpia del dia vuelve a cero y se guarda cuando fue: el resumen
    // del dia lo ensena para saber si el ritmo esta aguantando hoy.
    todayBump({ dq: 1, resetClean: true, dqAt: Date.now() });
    log(`Disqualification #${session.dqStreak} in a row; not recorded in the history.`);
    noteFlight('dq', `#${session.dqStreak} in a row`);
    if (typeof notifyUser === 'function') {
      notifyUser('Nitro Wraith: disqualification', `Race disqualified (${session.dqStreak} in a row).`, 'dq');
    }

    // Correlacion freeze -> DQ: si el contador de freezes se movio hace poco y
    // AFK estaba abierto, esta DQ es la senal para dejar de farmear a ciegas.
    const afkGuard = afkFreezeGuardDecision();
    if (afkGuard.tripped) {
      const text = `AFK safety guard: a disqualification followed a freeze (${afkGuard.minutes} min ago). AFK farming was turned off; keep-alive is left as it was.`;
      if (typeof setBackgroundFarm === 'function') setBackgroundFarm(false);
      storeNotice(text);
      noteFlight('afk-guard', text);
      log(text);
      if (typeof notifyUser === 'function') notifyUser('Nitro Wraith: AFK safety guard', text, 'afk-guard');
    }

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
