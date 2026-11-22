
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

  async function finishRace(app, disqualified = false, abandoned = false) {
    session.typing = false;
    // El lock NO se suelta aqui: se mantiene durante resultados, descansos y
    // esperas mientras el bucle siga vivo. Chrome no congela por Energy Saver
    // una pagina que sostiene un Web Lock, y soltarlo en cada carrera dejaba
    // la pestaña AFK expuesta al freeze justo en el hueco mas largo. Si el
    // turno cambia, refreshRole() o el freeze lo sueltan.

    // Otra copia lleva esta carrera: no se apunta nada ni se pulsa nada, o las
    // estadisticas de la cuenta salen dobles.
    if (standbyActive()) {
      if (typingLockHeld) releaseTypingLock();
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
    } else if (abandoned) {
      // La app desaparecio o dejo de aceptar teclas antes del final. NO es una
      // carrera medida: contarla metia una muestra parcial en el historial, en
      // la media de la tanda y en la calibracion del ritmo.
      log('Race lost before the finish line; it is not counted.');
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

    // La pantalla de resultados tambien espera a la red: pulsar "Race Again"
    // offline solo deja la pagina dando vueltas y gasta el intento de recarga.
    await waitWhileOffline();
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
    await waitWhileSiteBlocked();
    if (session.stopped) return false;

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
    if (siteBlockedUntil() > Date.now()) {
      log('Site block: the next race is not started again until the wait passes.');
      return false;
    }
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

  let lastTypingLockNoteAt = 0;

  async function raceOnce() {
    // Otra copia manda: esta no entra en la carrera ni la mide. Antes entraba, y
    // al ver avanzar la leccion (por las teclas de la otra copia) creia que
    // habia arrancado su propio reloj: media el WPM de otro y el guardia saltaba
    // con un numero que no era suyo.
    if (standbyActive()) {
      if (typingLockHeld) releaseTypingLock();
      await sleep(1000);
      return false;
    }

    session.liveRound = true;

    // El aviso de conexion pudo aparecer entre carrera y carrera. Se resuelve
    // antes de resetear el estado: si la app sigue detras del modal,
    // waitForApp la encontraria y waitForRaceStart perderia los 3 min de
    // arranque probando teclas que el modal se come.
    const connError = connErrorSeenAt && Date.now() - connErrorSeenAt < CONFIG.queue.connectionFreshMs;
    resetRaceState();
    if (connError) return abandonRaceForConnectionError();

    // Primera carrera tras una instalacion o un cambio de cuenta sin datos en
    // persist:nt: se lee la cuenta antes de abrir, en vez de arrancar con el
    // rango de respaldo 104-117. Si el API falla, el bucle sigue con lo que
    // haya y nunca deja la cola parada por esto.
    if (calibrationNeedsAccountRead
      || (!customWpm() && !calibratedRange && !(accountStats && accountStats.wpm))) {
      log('Reading the signed-in account before the first race.');
      await maybeCalibrate(true);
      calibrationNeedsAccountRead = false;
    }

    // Si se recargo la pagina en mitad de un descanso, se termina antes de
    // abrir carrera: para eso estaba el descanso.
    await waitWhileBreaking();
    await waitWhileSiteBlocked();
    if (session.stopped) return false;

    // Sin red no se abre una carrera que no va a poder cargar ni reportar.
    // La espera conserva los contadores y se reanuda sola con el evento online.
    await waitWhileOffline();
    if (session.stopped) return false;

    // Ninguna carrera empieza con los temporizadores frenados: saldria lenta y
    // con mala precision, y eso queda en el historial de la cuenta.
    await waitWhileThrottled();
    if (session.stopped) return false;

    let app = await waitForApp();
    if (!app) {
      releaseTypingLock();
      return false;
    }

    logStart();

    if (!(await waitForRaceStart(app))) {
      releaseTypingLock();
      return false;
    }

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
    let lockWaitSince = 0;
    let stallNoted = false;
    let expectedAfter = -1;
    let lastProgressAt = Date.now();

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
          log('The race disappeared before it finished; discarding the partial race.');
          return finishRace(app, false, true);
        }

        app = next;
        lastIndex = getIndex(app);
        idle = 0;
        stalls = 0;
        sendFails = 0;
        blockedSince = 0;
        stallNoted = false;
        expectedAfter = -1;
        lastProgressAt = Date.now();
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

      // El indice se mira antes de decidir si esta copia espera: si la copia
      // que tiene el turno sigue escribiendo, aqui se ve avanzar y el rescate
      // de abajo no se dispara. Sin esto la copia en standby no veia el
      // progreso de la otra y le quitaba el turno cada cuatro segundos.
      if (index > lastIndex) {
        lastIndex = index;
        lastProgressAt = Date.now();
        session.lastAcceptedAt = Date.now();
        blockedSince = 0;
        stallNoted = false;
      }

      // Otra copia lleva el teclado: esta no manda teclas. El turno caduca solo,
      // asi que aqui se vuelve a escribir en cuanto el aviso desaparece. Si la
      // carrera lleva varios segundos sin avanzar, la otra copia no esta
      // escribiendo y se recupera el turno antes de la DQ por inactividad.
      if (standbyActive()) {
        // Si esta copia deja de ser la que escribe, suelta el Web Lock para no
        // bloquear a la pestaña que tome el relevo.
        if (typingLockHeld) releaseTypingLock();
        if (Date.now() - lastProgressAt >= CONFIG.guard.standbyRescueMs) {
          takeTypingTurn('the other copy is not typing this race');
          lastProgressAt = Date.now();
        }
        await sleep(600);
        continue;
      }

      // El lock pudo liberarse al pasar a standby o al congelarse la pestaña.
      // No se manda una tecla hasta recuperarlo. Si la carrera ya estaba viva
      // y el lock sigue en una pestaña que no escribe, esperar para siempre es
      // una DQ por inactividad: a los 3 s sin progreso se recupera con steal.
      if (!typingLockHeld && !(await acquireTypingLock())) {
        if (!lockWaitSince) lockWaitSince = Date.now();
        const silentFor = Date.now() - (session.lastAcceptedAt || Date.now());
        if (silentFor >= 3000 && Date.now() - lockWaitSince >= 3000) {
          log('The typing lock is held by a tab that is not typing; taking it back to avoid a DQ.');
          if (await acquireTypingLock({ steal: true })) {
            lockWaitSince = 0;
            continue;
          }
        }
        if (Date.now() - lastTypingLockNoteAt > 10000) {
          lastTypingLockNoteAt = Date.now();
          log('Waiting for the typing lock; no keys are sent from this tab.');
        }
        await sleep(300);
        continue;
      }
      lockWaitSince = 0;

      // Enviamos la tecla correcta y el indice no avanzo: la carrera dejo de
      // aceptar entrada. Puede ser el final (resultados), una instancia muerta
      // o un overlay que la bloquea un momento (CAPTCHA). Salirse de una
      // carrera viva es descalificacion segura, asi que no se navega fuera: se
      // sigue reintentando y se espera al resultado o al modal de DQ.
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
                stallNoted = false;
                continue;
              }
              log(`The CAPTCHA was not solved in ${Math.round(CONFIG.captchaHoldMs / 1000)} s; stopping instead of leaving the live race.`);
              panic('CAPTCHA was not solved; no new race opened');
              return false;
            }

            // No se llama a finishRace: el boton Race Again o una recarga con
            // la carrera en marcha la descalifican. Se mantiene la carrera
            // abierta y se sigue reintentando; si el servidor decide DQ, el
            // modal de arriba lo detecta y ahi si se cierra la carrera.
            if (!stallNoted) {
              stallNoted = true;
              log('The race is not accepting keys; keeping it open instead of leaving a live race (leaving would be a DQ).');
            }
            if (Date.now() - blockedSince >= CONFIG.stallGiveUpMs) {
              panic('the race stopped accepting keys; no new race opened');
              return false;
            }
          }

          // Sin avanzar pero dentro del margen: se reintenta sin martillear.
          if (stalls >= CONFIG.stallLimit) {
            stalls = 0;
            await sleep(400);
          }
        } else {
          stalls = 0;
          blockedSince = 0;
          stallNoted = false;
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
        lastProgressAt = Date.now();
        session.lastAcceptedAt = Date.now();
        blockedSince = 0;
        stallNoted = false;
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
          log('The component is refusing keystrokes; discarding the partial race.');
          return finishRace(app, false, true);
        }
        await sleep(CONFIG.pollMs);
        continue;
      }
      sendFails = 0;

      session.chars++;
      session.lastKeyAt = Date.now();

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
        // Si el navegador suspendio el audio, el propio bucle de la carrera
        // vuelve a intentar el resume; el keep-alive no depende solo del panel.
        syncKeepAlive();

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
          session.liveRound = false;
          if (!keepGoing && !session.stopped) await sleep(1500);
        } catch (error) {
          session.liveRound = false;
          log('Loop error; retrying:', error);
          await sleep(1500);
        }
      }
    } finally {
      session.liveRound = false;
      session.running = false;
      releaseTypingLock();
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
