
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
  const WORKER_REPLY_GRACE_MS = 1500;
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

    // Si el Worker deja de contestar (por ejemplo, porque el navegador congela
    // la pestana), una espera no puede quedarse colgada: la carrera se quedaria
    // sin teclas y terminaria en DQ. Cada espera tiene su propio tope y cae al
    // reloj de la pagina; las demas no se resuelven de golpe, para no disparar
    // varios temporizadores de la cola a la vez. El reloj queda marcado como no
    // fiable para que no se abra otra carrera oculta hasta que responda.
    const degradeClock = () => {
      const dead = worker;
      worker = null;
      preciseClockKind = 'page';
      try { if (dead) dead.terminate(); } catch { /* ya estaba muerto */ }
    };

    worker.onmessage = (event) => {
      const entry = pending.get(event.data);
      if (!entry) return;
      pending.delete(event.data);
      clearTimeout(entry.timer);
      entry.resolve();
    };

    worker.onerror = degradeClock;

    return (ms) => new Promise((resolve) => {
      const delay = Math.max(0, Number(ms) || 0);
      if (!worker) {
        setTimeout(resolve, delay);
        return;
      }

      const id = nextId++;
      let settled = false;
      const entry = {
        resolve: () => {
          if (settled) return;
          settled = true;
          resolve();
        },
        timer: setTimeout(() => {
          if (settled) return;
          settled = true;
          pending.delete(id);
          degradeClock();
          resolve();
        }, delay + WORKER_REPLY_GRACE_MS),
      };
      pending.set(id, entry);

      try {
        worker.postMessage([id, delay]);
      } catch {
        degradeClock();
      }
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

  // Un baneo permanente no es una DQ: no hay carrera que reintentar. El bot
  // tiene que dejar de pulsar botones y guardar una parada larga, no seguir
  // abriendo carreras contra una cuenta que el sitio ya cerro.
  function looksTerminalBan(text) {
    const t = normalize(text);
    // La palabra suelta no basta: una pagina de ayuda puede explicar que las
    // cuentas "pueden ser" baneadas sin que esta cuenta lo este. Se exige el
    // sujeto de la cuenta o el motivo del baneo.
    return /\b(?:your|this|the) account (?:has been|was|is) (?:permanently )?banned\b/.test(t)
      || /\baccount (?:has been|was|is) permanently banned\b/.test(t)
      || /\baccount permanently banned\b/.test(t)
      || /\b(?:permanently banned|permanent ban)\b.{0,60}\b(?:cheating|appeal|support)\b/.test(t)
      || /\bbanned for cheating\b/.test(t);
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
