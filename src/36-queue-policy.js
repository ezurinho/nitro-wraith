  /* ==========================================================================
   * 36. POLITICA DE LA COLA (PURO)
   * ==========================================================================
   */
  // Lo que la cola decide mirando solo numeros: si la ventana de horas esta
  // abierta, cuanto queda de la tanda, que tope se alcanzo y que estado y
  // boton enseña el garaje. Nada de aqui toca DOM, almacenamiento ni `session`:
  // reciben sus datos y devuelven la decision.
  //
  // Vive fuera de 50-state.js y 90-queue.js para que `tests/unit` pueda cargar
  // este fragmento en Node y probar los bordes (medianoche, tope exacto, 80%)
  // sin abrir Chrome. Los envoltorios de estado siguen donde estaban y solo
  // pasan los valores; el comportamiento publicado no cambia.
  const clampHour = (hour) => Math.min(23, Math.max(0, hour | 0));

  // Hora local del navegador. Admite cruzar medianoche (22:00–02:00); con
  // start === end la ventana es todo el dia, y apagada no limita nada.
  function padHour(hour) {
    return `${String(hour).padStart(2, '0')}:00`;
  }

  function activeWindowAt(settings, at = Date.now()) {
    const on = Boolean(settings && settings.on);
    const start = clampHour(settings && settings.start);
    const end = clampHour(settings && settings.end);
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

  // Presupuesto del dia: carreras y XP reales de hoy contra los dos topes.
  // `warn` se enciende al 80% para que el panel avise antes de chocar.
  function dailyCapsFor(day, caps) {
    const races = Math.max(0, Number(day && day.races) || 0);
    const xp = Math.max(0, Number(day && day.xp) || 0);
    const raceCap = Math.max(0, Number(caps && caps.raceCap) || 0);
    const xpCap = Math.max(0, Number(caps && caps.xpCap) || 0);
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

  // Topes de sesion. Solo las carreras medidas cuentan: una DQ no llega a
  // `races` y por eso no gasta tope. El reloj de la tanda se mira entre
  // carreras, nunca a mitad de una.
  function sessionLimitReached(state, daily, at = Date.now()) {
    const s = state || {};
    const races = Number(s.races) || 0;
    const raceLimit = Number(s.raceLimit) || 0;
    const xp = Number(s.xp) || 0;
    const xpLimit = Number(s.xpLimit) || 0;
    const timeLimit = Number(s.timeLimit) || 0;
    const tandaStartedAt = Number(s.tandaStartedAt) || 0;
    return (raceLimit > 0 && races >= raceLimit)
      || (timeLimit > 0 && tandaStartedAt > 0
        && at >= tandaStartedAt + timeLimit * 60000)
      || (xpLimit > 0 && xp >= xpLimit)
      || Boolean(daily && (daily.raceHit || daily.xpHit));
  }

  function timeLimitLeftFor(state, at = Date.now()) {
    const s = state || {};
    const timeLimit = Number(s.timeLimit) || 0;
    if (!timeLimit) return null;
    const startedAt = Number(s.tandaStartedAt) || 0;
    if (!startedAt) return timeLimit * 60000;
    return Math.max(0, startedAt + timeLimit * 60000 - at);
  }

  // Estado del panel pequeno del garaje: una sola frase y una pildora. El
  // orden es el contrato: lo primero que aparece es lo que de verdad impide
  // correr (social de solo lectura, baneo, sesion...), y el boton primario
  // solo se enciende si esa accion existe.
  function deriveGarageContext(input = {}) {
    if (input.social) {
      return { key: 'read', title: 'Read-only social', detail: 'Friends and team counters without actions.', pill: 'READ' };
    }
    if (input.banned) {
      return { key: 'banned', title: 'Account blocked', detail: 'Review the account before clearing the ban.', pill: 'BAN' };
    }
    if (!input.signed) {
      return { key: 'signin', title: 'Sign in required', detail: 'The queue waits for a valid session.', pill: 'LOGIN' };
    }
    if (input.offline) {
      return { key: 'offline', title: 'Waiting for network', detail: 'Races resume when the connection returns.', pill: 'OFFLINE' };
    }
    if (input.activeStop) {
      return { key: 'stopped', title: 'Queue stopped', detail: input.reason || 'Resume when you are ready.', pill: 'STOPPED' };
    }
    if (input.banCleared) {
      return { key: 'cleared', title: 'Ban stop cleared', detail: 'Resume to arm the queue again.', pill: 'CLEARED' };
    }
    if (input.hasRetry) {
      return { key: 'retry', title: 'Sign-in retry pending', detail: `Retry in ${input.retryText || 'a moment'}.`, pill: 'LOGIN' };
    }
    if (Array.isArray(input.gates) && input.gates.length) {
      const gate = input.gates[0];
      return { key: 'gate', title: gate.label || 'Queue waiting', detail: `Clears in ${gate.leftText || 'a moment'}.`, pill: 'WAIT' };
    }
    if (input.boxReady) {
      return { key: 'reward', title: 'Mystery Box ready', detail: 'Claim the daily reward before the next race.', pill: 'REWARD' };
    }
    if (!input.armed) {
      return { key: 'stopped', title: 'Queue disarmed', detail: 'Resume to arm the next race.', pill: 'STOPPED' };
    }
    return { key: 'ready', title: 'Queue ready', detail: 'The next race will start automatically.', pill: 'AUTO' };
  }

  function garagePrimaryFor(context, available = {}) {
    if (context.key === 'reward' && available.box) return 'box';
    if ((context.key === 'stopped' || context.key === 'banned' || context.key === 'cleared') && available.resume) return 'resume';
    if (context.key === 'retry' && available.retry) return 'retry';
    if (context.key === 'ready' && available.race) return 'race';
    return '';
  }
