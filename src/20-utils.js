
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
  // Un fallo aislado no puede dejar AFK sin reloj hasta recargar. Tras degradar
  // se reintenta crear el Worker; mientras tanto se usa el reloj de la pagina y
  // `backgroundClockHealthy` sigue negando abrir carrera oculta.
  const CLOCK_REVIVE_MS = 30000;
  const preciseSleep = (() => {
    let worker = null;
    let nextId = 1;
    let reviveAt = 0;
    const pending = new Map();

    const onMessage = (event) => {
      const entry = pending.get(event.data);
      if (!entry) return;
      pending.delete(event.data);
      clearTimeout(entry.timer);
      entry.resolve();
    };

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
      reviveAt = Date.now() + CLOCK_REVIVE_MS;
      try { if (dead) dead.terminate(); } catch { /* ya estaba muerto */ }
    };

    const startClock = () => {
      if (worker) return true;
      if (Date.now() < reviveAt) return false;

      let next = null;
      let url = '';
      try {
        const source = 'self.onmessage = function (event) {'
          + 'var id = event.data[0];'
          + 'setTimeout(function () { self.postMessage(id); }, event.data[1]);'
          + '};';
        url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        next = new Worker(url);
      } catch {
        reviveAt = Date.now() + CLOCK_REVIVE_MS;
        try { if (url) URL.revokeObjectURL(url); } catch { /* nada que revocar */ }
        return false;
      }
      try { URL.revokeObjectURL(url); } catch { /* nada que revocar */ }

      worker = next;
      worker.onmessage = onMessage;
      // El handler se ata a ESTA instancia: un error tardio del Worker viejo no
      // puede tumbar el nuevo que acaba de arrancar.
      worker.onerror = () => { if (worker === next) degradeClock(); };
      preciseClockKind = 'worker';
      reviveAt = 0;
      return true;
    };

    startClock();

    return (ms) => new Promise((resolve) => {
      const delay = Math.max(0, Number(ms) || 0);
      if (!worker) startClock();
      if (!worker) {
        setTimeout(resolve, delay);
        return;
      }

      const id = nextId++;
      // Una espera larga del Worker viejo no puede degradar al Worker nuevo que
      // ya se creo despues de un fallo: solo degrada si sigue siendo el actual.
      const origin = worker;
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
          if (worker === origin) degradeClock();
          resolve();
        }, delay + WORKER_REPLY_GRACE_MS),
      };
      pending.set(id, entry);

      try {
        worker.postMessage([id, delay]);
      } catch {
        if (worker === origin) degradeClock();
      }
    });
  })();
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

  // El harness y el panel comparten un solo navegador de pruebas; la politica
  // de soporte se decide por familia, no por una lista de versiones.
  function browserFamily() {
    const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
    if (/Firefox\//i.test(ua)) return 'firefox';
    if (/Edg\//i.test(ua)) return 'edge';
    if (/OPR\//i.test(ua)) return 'opera';
    if (/Chrome\//i.test(ua)) return 'chrome';
    if (/Safari\//i.test(ua)) return 'safari';
    return 'other';
  }

  function browserSupported() {
    const family = browserFamily();
    return family === 'chrome' || family === 'edge';
  }

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

  // Grabador de vuelo: un anillo corto de eventos y avisos, persistido entre
  // recargas. No lleva tokens ni HTML: solo hora, tipo y una linea saneada.
  // Sirve para reconstruir «que paso justo antes» sin abrir la consola, sobre
  // todo cuando el iframe se recarga o el freeze impide leerla.
  const FLIGHT_KEY = 'nta:flight';
  const FLIGHT_LIMIT = 240;
  let flightRing = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FLIGHT_KEY) || '[]');
      return Array.isArray(saved)
        ? saved.filter((row) => row && Number.isFinite(Number(row.at)) && row.text)
          .slice(-FLIGHT_LIMIT)
          .map((row) => ({ at: Number(row.at), kind: String(row.kind || 'event').slice(0, 24), text: String(row.text).slice(0, 240) }))
        : [];
    } catch { return []; }
  })();
  let flightSavedAt = 0;
  let flightSaveTimer = 0;

  // Sanea lo que llega al grabador. Solo tapa valores que parecen un secreto
  // real: una clave de token/sesion/cookie con `=` o `:` y un valor opaco.
  // Prosa como «Session resumed: 5 races» se conserva tal cual.
  function looksSecret(value) {
    const text = String(value || '');
    if (text.length < 12) return false;
    if (/^\$?[A-Za-z0-9+/=_-]{12,}$/.test(text)) return true;
    return text.length >= 16 && /[A-Za-z]/.test(text) && /\d/.test(text);
  }

  function scrubSecrets(text) {
    return String(text || '')
      // Cabecera Authorization: el valor va tras «Bearer» y puede ser corto.
      .replace(/Authorization(\s*[=:]\s*)(Bearer\s+)?[^\s,;"'}]+/gi,
        (_match, sep, bearer) => `Authorization${sep}${bearer ? 'Bearer ' : ''}***`)
      // Clave=valor o clave:valor, con comillas opcionales; se tapa solo el
      // valor si parece secreto (`token=abc...`, `"session":"..."`, etc.).
      .replace(/((?:access[_-]?token|refresh[_-]?token|player[_-]?token|id[_-]?token|token|api[_-]?key|apikey|password|secret|session[_-]?(?:id|key|token)?|cookie|authorization)["']?\s*[=:]\s*["']?)([^\s,;"'}]+)/gi,
        (match, key, value) => (looksSecret(value) ? `${key}***` : match))
      // Un JWT o una cadena base64 larga son secretos aunque no lleven clave.
      .replace(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '***')
      .replace(/[A-Za-z0-9+/=_-]{80,}/g, '***');
  }

  function scrubFlightText(text) {
    return scrubSecrets(text).slice(0, 240);
  }

  function saveFlightNow() {
    flightSavedAt = Date.now();
    if (flightSaveTimer) {
      clearTimeout(flightSaveTimer);
      flightSaveTimer = 0;
    }
    try { localStorage.setItem(FLIGHT_KEY, JSON.stringify(flightRing)); } catch { /* modo privado */ }
  }

  function noteFlight(kind, detail) {
    const text = scrubFlightText(detail);
    if (!text) return;
    flightRing.push({ at: Date.now(), kind: String(kind || 'event').slice(0, 24), text });
    if (flightRing.length > FLIGHT_LIMIT) flightRing.splice(0, flightRing.length - FLIGHT_LIMIT);
    if (Date.now() - flightSavedAt > 1500) saveFlightNow();
    else if (!flightSaveTimer) flightSaveTimer = setTimeout(saveFlightNow, 1500);
  }

  function flightEvents(limit = FLIGHT_LIMIT) {
    const count = clamp(parseInt(limit, 10) || FLIGHT_LIMIT, 1, FLIGHT_LIMIT);
    return flightRing.slice(-count).map((row) => ({ ...row }));
  }

  function clearFlight() {
    flightRing = [];
    saveFlightNow();
    return true;
  }

  const log = (...args) => {
    console.log('%c[NTAuto]', 'color:#7cc7ff;font-weight:bold', ...args);

    const text = args.filter((arg) => typeof arg === 'string').join(' ').trim();
    // Las lineas de progreso (cada 5 s) no son estado: taparian los avisos.
    if (!text || text.startsWith('WPM ')) return;

    lastStatus = text;
    noticeRing.push({ at: Date.now(), text });
    if (noticeRing.length > NOTICE_RING) noticeRing.shift();
    noteFlight('log', text);
    if (statusEl) setText(statusEl, text);
  };

  /* --------------------------------------------------------------------------
   * RED DE SEGURIDAD
   * --------------------------------------------------------------------------
   * Un fallo asincrono no puede dejar el bot "en carrera" sin teclear. El
   * latido aísla sus pasos con `heart()`, pero no cubre promesas sueltas, el
   * arranque ni los callbacks de eventos. Este bloque contiene esos fallos,
   * los apunta en el grabador y, si son durante una carrera o se repiten,
   * entra en modo seguro: suelta el lock, para la cola y lo dice en pantalla.
   * ------------------------------------------------------------------------ */
  const SAFE_MODE_KEY = 'nta:safeMode';
  const BOOT_FAIL_KEY = 'nta:bootFails';
  const RUNTIME_ERROR_WINDOW_MS = 30000;
  const RUNTIME_ERROR_LIMIT = 3;
  let safeMode = false;
  let safeModeReason = '';
  let runtimeErrorCount = 0;
  let runtimeErrorFirstAt = 0;
  let safeModeBanner = null;
  let bootFailures = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BOOT_FAIL_KEY) || 'null');
      if (!saved || !Number.isFinite(Number(saved.count))) return { count: 0, lastAt: 0, message: '' };
      return {
        count: clamp(Number(saved.count) || 0, 0, 99),
        lastAt: Number(saved.lastAt) || 0,
        message: String(saved.message || '').slice(0, 240),
      };
    } catch {
      return { count: 0, lastAt: 0, message: '' };
    }
  })();

  function safeModeState() {
    return {
      on: safeMode,
      reason: safeModeReason || null,
      errors: runtimeErrorCount,
      bootFailures: bootFailures.count,
    };
  }

  function readSafeModeRecord() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAFE_MODE_KEY) || 'null');
      return saved && saved.on ? saved : null;
    } catch {
      return null;
    }
  }

  function writeSafeModeRecord(reason) {
    try {
      localStorage.setItem(SAFE_MODE_KEY, JSON.stringify({
        on: true,
        reason: String(reason || 'internal error').slice(0, 240),
        at: Date.now(),
      }));
    } catch { /* almacenamiento bloqueado: el modo sigue en memoria */ }
  }

  function clearSafeModeRecord() {
    try { localStorage.removeItem(SAFE_MODE_KEY); } catch { /* bloqueado */ }
  }

  function noteBootFailure(error) {
    const now = Date.now();
    if (!bootFailures.lastAt || now - bootFailures.lastAt > 10 * 60000) {
      bootFailures = { count: 0, lastAt: now, message: '' };
    }
    bootFailures.count += 1;
    bootFailures.lastAt = now;
    bootFailures.message = String((error && error.message) || error || 'boot failed').slice(0, 240);
    try { localStorage.setItem(BOOT_FAIL_KEY, JSON.stringify(bootFailures)); } catch { /* bloqueado */ }
    noteFlight('boot-error', `boot ${bootFailures.count}/${RUNTIME_ERROR_LIMIT}: ${bootFailures.message}`);
    showSafeModeBanner(
      `The script failed to start (${bootFailures.count}/${RUNTIME_ERROR_LIMIT}): ${bootFailures.message}`,
      bootFailures.count < RUNTIME_ERROR_LIMIT,
    );
    if (bootFailures.count >= RUNTIME_ERROR_LIMIT) {
      enterSafeMode(`three boot failures in a row: ${bootFailures.message}`);
    }
  }

  function clearBootFailures() {
    bootFailures = { count: 0, lastAt: 0, message: '' };
    try { localStorage.removeItem(BOOT_FAIL_KEY); } catch { /* bloqueado */ }
  }

  function safeModeBannerHost() {
    return document.body || document.documentElement;
  }

  function removeSafeModeBanner() {
    if (!safeModeBanner) return;
    try { safeModeBanner.remove(); } catch { /* ya estaba fuera */ }
    safeModeBanner = null;
  }

  function showSafeModeBanner(reason, resumable = true) {
    const mount = () => {
      if (safeModeBanner || !document.documentElement) return;
      const host = safeModeBannerHost();
      if (!host) return;

      const banner = document.createElement('div');
      banner.id = 'nta-safe-mode';
      banner.setAttribute('role', 'alert');
      banner.style.cssText = [
        'position:fixed', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
        'z-index:2147483647', 'max-width:min(560px,calc(100vw - 32px))',
        'padding:12px 14px', 'border:1px solid #ffb340', 'border-radius:10px',
        'background:rgba(12,17,14,.98)', 'color:#f4f1e8', 'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
        'box-shadow:0 10px 30px rgba(0,0,0,.45)', 'white-space:pre-wrap',
      ].join(';');

      const title = document.createElement('b');
      title.textContent = safeMode ? 'NITRO WRAITH · safe mode' : 'NITRO WRAITH · internal error';
      title.style.cssText = 'display:block;color:#ffb340;margin-bottom:4px';

      const body = document.createElement('span');
      body.textContent = String(reason || 'automation stopped');
      body.style.cssText = 'display:block;color:#cfe9db';

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px';

      const makeButton = (label, handler) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.style.cssText = 'appearance:none;border:1px solid #35ea86;border-radius:7px;background:transparent;color:#35ea86;font:inherit;padding:4px 9px;cursor:pointer';
        button.addEventListener('click', handler);
        actions.appendChild(button);
        return button;
      };

      if (resumable) {
        makeButton('resume', () => {
          clearSafeMode();
          try { location.reload(); } catch { /* sin acceso */ }
        });
      }
      makeButton('copy report', () => {
        try {
          if (typeof diagnosticReport !== 'function') return;
          const text = JSON.stringify(diagnosticReport(), null, 1);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => {});
          }
        } catch { /* portapapeles bloqueado */ }
      });

      banner.appendChild(title);
      banner.appendChild(body);
      banner.appendChild(actions);
      host.appendChild(banner);
      safeModeBanner = banner;
    };

    if (document.documentElement) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });
  }

  function enterSafeMode(reason) {
    if (safeMode) return;
    safeMode = true;
    safeModeReason = String(reason || 'internal error').slice(0, 240);
    writeSafeModeRecord(safeModeReason);
    noteFlight('safe-mode', safeModeReason);
    log(`SAFE MODE: ${safeModeReason}. Automation stopped; the keyboard is back to the game.`);

    try {
      if (typeof panic === 'function') panic(`safe mode: ${safeModeReason}`, 24 * 60 * 60 * 1000);
      else if (typeof releaseTypingLock === 'function') releaseTypingLock();
    } catch (error) {
      try { console.error('[NTAuto · safe mode]', error); } catch { /* sin consola */ }
    }

    showSafeModeBanner(safeModeReason, true);
    try { if (typeof updatePanel === 'function') updatePanel(true); } catch { /* panel no listo */ }
  }

  function clearSafeMode() {
    safeMode = false;
    safeModeReason = '';
    runtimeErrorCount = 0;
    runtimeErrorFirstAt = 0;
    clearSafeModeRecord();
    clearBootFailures();
    removeSafeModeBanner();
  }

  // Un fallo de la pagina del juego no es un fallo del script: se apunta, pero
  // no cuenta para el modo seguro. Solo se aceptan stacks que lleven nombres de
  // funciones de este archivo; asi un error de React no apaga la automatizacion.
  function isOwnFailure(error, filename) {
    const text = [
      error && error.stack,
      error && error.message,
      typeof error === 'string' ? error : '',
      filename,
    ].filter(Boolean).join(' ');
    if (!text) return false;
    return /(?:nitro-wraith|NTAUTO|ntaWraith|runAuto|superviseLive|watchRaceResults|guardCheck|updatePanel|paintGaragePanel|paintConfig|runQueue|typeRace|clickCaptchaContinue|closeChallengePopup|handleSessionWarning)/.test(text);
  }

  function noteRuntimeError(kind, error, options = {}) {
    const message = String((error && error.message) || error || 'unknown error').slice(0, 240);
    noteFlight('error', `${kind}: ${message}`);
    try { console.error(`[NTAuto · ${kind}]`, error); } catch { /* sin consola */ }

    const now = Date.now();
    if (!runtimeErrorFirstAt || now - runtimeErrorFirstAt > RUNTIME_ERROR_WINDOW_MS) {
      runtimeErrorCount = 0;
      runtimeErrorFirstAt = now;
    }
    runtimeErrorCount += 1;

    if (options.fatal === true || runtimeErrorCount >= RUNTIME_ERROR_LIMIT) {
      enterSafeMode(`${kind}: ${message}`);
      return;
    }
    if (options.visible !== false) {
      showSafeModeBanner(
        `An internal error was contained (${runtimeErrorCount}/${RUNTIME_ERROR_LIMIT}): ${message}`,
        true,
      );
    }
  }

  function installErrorBoundary() {
    if (window.__ntaErrorBoundaryInstalled) return;
    window.__ntaErrorBoundaryInstalled = true;

    const inLiveRace = () => Boolean(
      typeof session === 'object' && session
      && session.liveRound && !session.stopped
      && (session.typing || Date.now() - (session.startedAt || 0) < 60000),
    );

    window.addEventListener('error', (event) => {
      if (!event || !event.error) return;   // recursos e imagenes no cuentan
      if (!isOwnFailure(event.error, event.filename)) {
        noteFlight('page-error', String(event.message || 'page error'));
        return;
      }
      noteRuntimeError('error', event.error, { fatal: inLiveRace() });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event && event.reason;
      if (!isOwnFailure(reason, '')) {
        noteFlight('page-rejection', String((reason && reason.message) || reason || 'page rejection'));
        return;
      }
      noteRuntimeError('rejection', reason, { fatal: inLiveRace() });
    });

    // Si otra pestana sale del modo seguro, esta retira el banner. La recarga
    // completa la hace el boton de la pestana que lo pulso.
    window.addEventListener('storage', (event) => {
      if (event.key !== SAFE_MODE_KEY || readSafeModeRecord()) return;
      safeMode = false;
      safeModeReason = '';
      removeSafeModeBanner();
    });
  }
