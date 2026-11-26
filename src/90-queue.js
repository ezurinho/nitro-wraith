
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

      // Dia de descanso: la cuenta no corre hoy. La puerta se cierra sola a
      // medianoche; no deja marca de parada ni cuenta como fallo.
      const rest = restGate(now);
      if (rest) gates.push({ key: 'rest', label: rest.label, left: rest.left });

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
      // El interlock AFK puede mantener la cola quieta a proposito: no es un
      // marco muerto. Recargar aqui solo gastaria el presupuesto de recargas y
      // volveria a abrir la carrera oculta que se acaba de bloquear.
      if (hiddenBlocked()) {
        noteProgress();
        return;
      }
      // «Clear ban» deja la cola pausada a proposito: no es un marco muerto ni
      // un atasco que haya que recargar. Solo un Resume/Alt+A manual la arma.
      if (banClearHeld()) {
        noteProgress();
        return;
      }
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
      // La pestana oculta se trata aparte: con AFK apagado `hiddenBlocked()`
      // detiene la cola antes de abrir carrera; con AFK encendido se usa el reloj
      // Worker y esta espera no debe recargar la pagina.
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
      if (blockUntil() > Date.now()) return;

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

      const delay = humanDelay(
        CONFIG.queue.continueDelayMs,
        CONFIG.queue.continueLongChance,
        CONFIG.queue.continueLongMs
      );
      queueLog(`Button «${normalize(button.textContent)}»: pressing in ${(delay / 1000).toFixed(1)}s.`);

      continueTimer = later(async () => {
        const pressed = await runTabAction('continue', () => {
          if (!button.isConnected) {
            queueLog('The button is gone from the DOM; cancelling.');
            return false;
          }
          if (hiddenBlocked()) {
            queueLog('The tab went to the background; the next race waits.');
            return false;
          }
          if (typerOwnsRaces()) {
            queueLog('The typer has taken over; pressing nothing.');
            return false;
          }
          if (savedBreakUntil()) {
            queueLog('A break is in progress; the next race waits for it.');
            return false;
          }
          if (blockUntil() > Date.now()) {
            queueLog('Site block: the next race waits for it.');
            return false;
          }
          const hours = activeGate();
          if (hours) {
            queueWhy(`Active hours: the next race waits until ${hours.nextText}.`);
            scheduleActiveResume();
            return false;
          }
          clearIdleTimer();
          lastPress.continue = Date.now();
          dispatchClick(button);
          return true;
        });
        continueTimer = null;
        if (!pressed) queueLog('Another tab has the turn; the next race waits.');
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

      const target = findButton((label) => label.includes('garage'))
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

      // El panel del garaje vive en esta ventana, pero quien cambia el AFK o
      // recupera el foco puede estar en el marco de la carrera. Un aviso minimo
      // basta para repintarlo sin compartir el scope de runQueue.
      if (data.__ntaPaintGarage === true) {
        paintGaragePanel();
        return true;
      }

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


    let terminalBanQueueNoted = false;

    function noteTerminalBan(modalBody) {
      if (!looksTerminalBan(modalBody)) return false;
      if (!terminalBanQueueNoted) {
        terminalBanQueueNoted = true;
        markStopped('account permanently banned; queue stopped', STOP_HOLD_MAX);
        queueLog('Account permanently banned: the queue stopped and will not retry.');
        storeNotice('Account permanently banned: the bot stopped and will not retry.');
        beep('block');
        paintGaragePanel();
      }
      return true;
    }

    function handleModal(modalBody) {
      // Cuenta cerrada: ni siquiera se busca un boton en el modal. Cualquier
      // clic aqui solo puede empeorar el estado de la pagina.
      if (noteTerminalBan(modalBody)) return true;

      // El castigo por racha se atiende antes que cualquier boton del modal:
      // no se pulsa «Try Again» ni se navega por detras del aviso.
      if (looksDqBlocked(modalBody)) {
        noteDqBlock();
        return true;
      }

      // El servidor de la carrera cerro la conexion. Si el aviso se pinta en
      // esta ventana, se toma su salida; el marco avisa por `__ntaNeedGarage`.
      if (looksLikeConnectionError(modalBody)) {
        const target = findButton((label) => label.includes('garage'))
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
      // Un baneo permanente puede venir en el texto de la pagina y no dentro
      // de `.modal`; este barrido ya existe para la CAPTCHA, asi que se reutiliza
      // sin anadir otro `innerText` al latido.
      if (noteTerminalBan(bodyText)) return true;
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
      // Mientras dura el castigo no se toca ningun boton de carrera ni se
      // borra la marca: un /race con el aviso encima no es una carrera buena.
      if (blockUntil() > Date.now()) {
        clearContinue();
        return;
      }

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
      // aviso y gasta un intento mas de los que el sitio cuenta. Se cancela
      // tambien el «Race Now» que ya estuviera programado antes del aviso.
      if (blockUntil() > Date.now()) {
        clearRaceNow();
        return;
      }

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

      // Otra pestaña puede reclamar el turno durante el retardo: el clic final
      // vuelve a validarlo dentro del lock corto de acciones.
      const delay = humanDelay(CONFIG.queue.raceNowDelayMs);
      raceNowDelay = delay;
      raceNowAt = Date.now() + delay;
      raceNowTimer = later(async () => {
        const pressed = await runTabAction('race now', () => {
          if (!isArmed() || !button.isConnected) return false;
          if (hiddenBlocked()) return false;
          if (blockUntil() > Date.now()) return false;
          if (queuePress('raceNow', button)) {
            // Se suma sobre el contador ya caducado: si el ultimo rebote es viejo,
            // este empieza de uno en vez de arrastrar una racha que ya no aplica.
            store.set('raceNowBounces', raceNowBounces() + 1);
            store.set('raceNowBounceAt', Date.now());
          }
          return true;
        });
        raceNowTimer = null;
        raceNowAt = 0;
        raceNowDelay = 0;
        if (!pressed) queueLog('Another tab has the turn; the race waits.');
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

      boxTimer = later(async () => {
        const pressed = await runTabAction('mystery box', () => {
          if (!boxDue()) return false;
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
            return false;
          }
          boxStore.set(BOX_TRY, Date.now());
          dispatchClick(button);
          return true;
        });
        boxTimer = null;
        if (!pressed) return;

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

      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;

      try {
        const response = await fetch('/api/v2/rewards/daily', {
          method: 'GET', credentials: 'include', headers,
          signal: controller ? controller.signal : undefined,
        });
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
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    // @returns {boolean} true while the box is being handled, so the queue does
    // not press "Race Now" in the same breath.
    async function handleMysteryBox() {
      if (!CONFIG.mysteryBox.enabled) return false;
      // Sin red el intento solo gasta el boton y deja una espera artificial.
      if (!onlineNow()) return false;
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

        return runTabAction('mystery box', () => {
          if (!boxDue()) return false;
          boxStore.set(BOX_TRY, now);
          setBoxVisit(false);
          setBoxForce(false);
          claimBoxByClick(button);
          return true;
        });
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
        return runTabAction('mystery box', () => {
          if (!boxDue()) return false;
          setBoxVisit(true);
          boxStore.set(BOX_TRY, Date.now());
          if (CONFIG.mysteryBox.apiFallback) claimBoxByApi();
          return true;
        });
      }

      // Fuera de la carrera la caja se reclama donde el sitio la pone: el
      // garaje. Si el bot esta en la home (o en los resultados, que van a abrir
      // otra carrera), se va alli, en vez de esperar a que la API quiera.
      if (wantGarage && !onGarage && (results || !state)) {
        return runTabAction('mystery box', () => {
          if (!boxDue()) return false;
          setBoxForce(true);
          setBoxVisit(true);
          queueWhy('Mystery Box is ready: going to the garage to claim it.');
          navigate('/garage');
          return true;
        });
      }

      // Una carrera viva sin resultados (el bot esta parado a mitad) no se
      // abandona por la caja: navegar ahi seria una descalificacion regalada.
      if (state && !results) return false;

      if (!boxDue()) {
        setBoxForce(false);
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

      return runTabAction('mystery box', () => {
        if (!boxDue()) return false;
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
          return true;
        }

        // Peticion lanzada: se toma como tarea hecha para que este mismo latido
        // no abra ademas una carrera con el premio en el aire (el siguiente, ya
        // con el intento apuntado, deja paso al garaje).
        if (CONFIG.mysteryBox.apiFallback) {
          claimBoxByApi();
          return true;
        }
        return false;
      });
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
      // Un baneo terminal no prescribe: el garaje no puede rearmarse solo al
      // vencer las 24 h, y el vigilante tampoco debe intentar desatascarlo.
      if (terminalBanActive()) return true;
      const saved = stoppedInfo();
      if (!saved) return false;
      // Una parada manual no prescribe: solo Resume/Alt+A la borra.
      if (saved.manual) return true;
      // Una parada de emergencia (racha de DQ) trae su propia retencion: mas
      // larga que la de un tope normal, para no reanudar sola en mitad de una
      // ausencia y regalar la quinta DQ.
      const hold = Math.min(Number(saved.holdMs) || 0, 24 * 3600000) || CONFIG.queue.stopHoldMs;
      return Date.now() - saved.at < hold;
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

    function saveQPanelPos() {
      try {
        localStorage.setItem(QPANEL_POS, JSON.stringify({
          left: Math.round(parseFloat(qpanel.host.style.left) || 0),
          top: Math.round(parseFloat(qpanel.host.style.top) || 0),
        }));
      } catch { /* almacenamiento bloqueado */ }
    }

    function resetQPanelPos() {
      try { localStorage.removeItem(QPANEL_POS); } catch { /* bloqueado */ }
      qpanel.host.style.left = 'auto';
      qpanel.host.style.top = 'auto';
      qpanel.host.style.right = '16px';
      qpanel.host.style.bottom = '16px';
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
        saveQPanelPos();
      };

      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);

      handle.addEventListener('dblclick', resetQPanelPos);

      // La cabecera tambien es un control de teclado, como la del panel de
      // carrera: flechas mueven 8 px, Shift 24 y Home devuelve el panel a su
      // esquina. placeQPanel recorta y saveQPanelPos persiste, asi que puntero
      // y teclado no pueden acabar en dos posiciones distintas.
      handle.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
        if (event.target !== handle && event.target.closest
          && event.target.closest('button, input, select, textarea, a')) return;
        event.preventDefault();
        if (event.key === 'Home') {
          resetQPanelPos();
          return;
        }
        const step = event.shiftKey ? 24 : 8;
        let left = parseFloat(qpanel.host.style.left);
        let top = parseFloat(qpanel.host.style.top);
        if (!Number.isFinite(left) || !Number.isFinite(top)) {
          const rect = qpanel.host.getBoundingClientRect();
          left = rect.left;
          top = rect.top;
        }
        if (event.key === 'ArrowLeft') left -= step;
        else if (event.key === 'ArrowRight') left += step;
        else if (event.key === 'ArrowUp') top -= step;
        else top += step;
        placeQPanel(left, top);
        saveQPanelPos();
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
      root.innerHTML = garagePanelHtml(panelTheme);
      document.body.appendChild(host);

      garageUpdateNode = root.querySelector('[data-f="update"]');
      garageCompactUpdateNode = root.querySelector('[data-f="updateCompact"]');
      const refs = {
        host,
        head: root.querySelector('.h'),
        panel: root.querySelector('.p'),
        context: root.querySelector('.garage-context'),
        contextTitle: root.querySelector('[data-f="contextTitle"]'),
        contextDetail: root.querySelector('[data-f="contextDetail"]'),
        contextPill: root.querySelector('[data-f="contextPill"]'),
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
        keepAliveRow: root.querySelector('[data-f="keepAliveRow"]'),
        keepAlive: root.querySelector('[data-f="keepAlive"]'),
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
        fold: root.querySelector('[data-f="fold"]'),
        renewedRow: root.querySelector('[data-f="renewedRow"]'),
        renewed: root.querySelector('[data-f="renewed"]'),
        waitRow: root.querySelector('[data-f="waitRow"]'),
        wait: root.querySelector('[data-f="wait"]'),
        stopRow: root.querySelector('[data-f="stopRow"]'),
        stopLabel: root.querySelector('[data-f="stopLabel"]'),
        lastStop: root.querySelector('[data-f="lastStop"]'),
        stopHistoryRow: root.querySelector('[data-f="stopHistoryRow"]'),
        stopHistory: root.querySelector('[data-f="stopHistory"]'),
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
        afkBtn: root.querySelector('[data-act="afk"]'),
        stopBtn: root.querySelector('[data-act="stop"]'),
        resumeBtn: root.querySelector('[data-act="resume"]'),
        retryBtn: root.querySelector('[data-act="retry"]'),
        diagBtn: root.querySelector('[data-act="diag"]'),
        update: garageUpdateNode,
        updateCompact: garageCompactUpdateNode,
      };

      // Ciclo de tema desde el garaje: el selector grande vive en el iframe de
      // la carrera, pero volver alli solo para cambiar la piel no tiene sentido.
      // setTheme guarda la eleccion y el storage event la lleva al otro panel.
      refs.theme.addEventListener('click', (event) => {
        event.stopPropagation();
        cycleTheme();
      });

      refs.update.addEventListener('click', (event) => {
        event.stopPropagation();
        openUpdateDownload();
      });
      refs.updateCompact.addEventListener('click', (event) => {
        event.stopPropagation();
        openUpdateDownload();
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
      refs.boxBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (!onlineNow()) {
          queueLog('Mystery Box: no network; the claim waits.');
          paintGaragePanel();
          return;
        }
        // Sin sesion no hay caja que reclamar: se dice, en vez de dejar el boton
        // mudo.
        if (!signedIn()) {
          queueLog('Mystery Box: log in first; the box belongs to the account.');
          paintGaragePanel();
          return;
        }
        const acted = await runTabAction('manual mystery box', () => {
          const button = boxButton();
          if (button) {
            boxStore.set(BOX_TRY, Date.now());
            setBoxForce(false);
            claimBoxByClick(button);
            return true;
          }

          // El sitio ya dijo que falta (o el respiro minimo no ha pasado): no se
          // navega para nada, se dice por que en el log.
          if (!boxDue()) {
            setBoxForce(false);
            queueLog('Mystery Box: the site has not handed it out yet; nothing to claim.');
            return true;
          }

          setBoxForce(true);
          if (location.pathname === '/garage' || location.pathname.startsWith('/garage/')) {
            queueLog('Mystery Box: the garage has not painted the box yet; claiming as soon as it does.');
          } else {
            queueWhy('Mystery Box: going to the garage to claim it.');
            navigate('/garage');
          }
          return true;
        });
        if (!acted) queueLog('Another tab has the turn; the box stays with it.');
        paintGaragePanel();
      });

      // AFK se puede cambiar sin entrar a una carrera. El cambio se guarda y el
      // evento storage lo lleva al iframe y a las demas pestanas; la cola de
      // arriba ya lo tiene en su propio CONFIG.
      if (refs.afkBtn) {
        refs.afkBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          const next = !backgroundFarm();
          setBackgroundFarm(next);
          queueWhy(next
            ? 'AFK farming: on from the garage; a hidden tab keeps racing.'
            : 'AFK farming: off from the garage; new races wait for a visible tab.');
          paintGaragePanel();
          if (next && document.visibilityState === 'hidden') loop();
        });
      }

      // El boton abre carrera ya: si habia una cuenta atras en marcha se borra
      // antes de pulsar, para que no quede un segundo clic programado sobre un
      // boton que ya no existe (o sobre la carrera siguiente).
      refs.raceBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (!onlineNow()) {
          queueLog('Offline: the race waits for the network to return.');
          paintGaragePanel();
          return;
        }
        if (blockUntil() > Date.now()) {
          queueLog('Site block: the account cannot race yet; wait for the block to pass.');
          paintGaragePanel();
          return;
        }
        const hours = activeGate();
        if (hours) {
          queueLog(`Active hours closed; races resume at ${hours.nextText}.`);
          paintGaragePanel();
          return;
        }
        const button = findButton((label) => label.includes('race now'));
        if (!button) return;
        const acted = await runTabAction('manual race', () => {
          clearRaceNow();
          raceNowHoldUntil = 0;
          queuePress('raceNow', button);
          return true;
        });
        if (!acted) queueLog('Another tab has the turn; the race stays with it.');
        paintGaragePanel();
      });

      // Parar desde el garaje: con un tipador vivo se reenvia Alt+S, que deja
      // terminar la carrera en curso antes de apagar (cortarla seria una DQ).
      // Sin marco vivo no hay a quien mandar la tecla: se desarma la cola y se
      // deja la marca de parada, que es la que impide abrir otra carrera sola.
      refs.stopBtn.addEventListener('click', (event) => {
        event.stopPropagation();

        const live = typerState();
        if (live && !live.stopped) {
          const sent = forwardHotkeyToFrames('KeyS', 's');
          queueWhy(sent
            ? 'Stop: Alt+S sent to the race; no new race will be opened.'
            : 'Stop: no race frame answered; click inside the race and press Alt+S.');
          paintGaragePanel();
          return;
        }

        clearRaceNow();
        setArmed(false);
        garageAutoDone = true;
        markStopped('stopped from the garage', CONFIG.queue.stopHoldMs, true);
        queueWhy('Stop: queue stopped from the garage; use Resume or Alt+A to start again.');
        paintGaragePanel();
      });

      // Reanudar desde el garaje sin recordar Alt+A. Con un tipador vivo se le
      // manda la misma tecla y decide el marco (tope diario, horas, tanda): la
      // marca de parada no se toca aqui, para que un rechazo no la borre. Sin
      // tipador no hay marco que escuche, asi que se borra la marca y se arma
      // la cola; «Race Now» conserva su retardo humano.
      refs.resumeBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (!signedIn()) {
          queueLog('Resume: log in first; the queue cannot race a guest.');
          paintGaragePanel();
          return;
        }

        // Un baneo terminal no se reanuda por accidente. El boton cambia a
        // «Clear ban» y solo borra la parada: la cuenta sigue baneada hasta que
        // el sitio diga lo contrario, y despues hay que armar la cola a mano.
        if (terminalBanActive()) {
          clearStopped();
          setArmed(false);
          setBanClearHeld(true);
          garageAutoDone = true;
          queueWhy('Terminal ban: stop cleared manually. The account remains banned unless the site lifts it.');
          queueLog('Terminal ban stop cleared manually; the queue stays paused until you arm it again.');
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

        const acted = await runTabAction('manual resume', () => {
          clearStopped();
          setBanClearHeld(false);
          setArmed(true);
          garageAutoDone = true;
          queueWhy('Resume: stop cleared from the garage panel; the queue is armed.');
          return true;
        });
        if (!acted) queueLog('Another tab has the turn; the resume stays with it.');
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

      // El garaje es donde suele estar el usuario cuando espera una version
      // nueva. La comprobacion es la misma que usa el panel de carrera y el
      // intervalo se apoya en su marca de tiempo: si ya se comprobo hace poco,
      // no vuelve a pedir el meta. Al recuperar el foco se pregunta otra vez.
      checkForUpdate();
      setInterval(checkForUpdate, UPDATE_RECHECK_MS);
      window.addEventListener('focus', () => checkForUpdate());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkForUpdate();
      });

      // Si la ventana se encoge, el panel guardado puede quedar fuera de la
      // pantalla: se vuelve a meter con la misma posicion.
      addEventListener('resize', () => {
        if (!qpanel || !qpanel.host.style.left) return;
        placeQPanel(parseFloat(qpanel.host.style.left) || 0, parseFloat(qpanel.host.style.top) || 0);
      });
      return refs;
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
      if (!onlineNow()) {
        return {
          text: 'offline',
          warn: 2,
          title: 'No network: the queue and the next race wait until the connection returns.',
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
      // La fila `afk` dice el modo, no solo que la cola este armada. Antes
      // decia «on» incluso con AFK apagado, que es justo lo contrario de lo que
      // el usuario acaba de configurar. Cuando esta encendido, `hidden` avisa
      // de que la cola sigue sin depender de que la pestana se vea.
      if (!backgroundFarm()) {
        return {
          text: 'off',
          warn: isArmed() ? 1 : 0,
          title: isArmed()
            ? 'AFK farming is off: races only start while this tab is visible. Turn it on from the garage button or TUNE.'
            : 'AFK farming is off; the queue is waiting and re-arms by itself when it can.',
        };
      }
      if (isArmed()) {
        const hidden = pageHidden();
        return {
          text: hidden ? 'on · hidden' : 'on',
          warn: 0,
          title: hidden
            ? 'AFK cycle active: farming is on and this tab is hidden; the queue keeps racing on the Worker clock.'
            : 'AFK cycle active: farming is on; hiding this tab keeps the queue racing, and the background clock checks itself before opening a race.',
        };
      }
      return {
        text: 'on · waiting',
        warn: 1,
        title: 'AFK farming is on; the queue is waiting and starts again by itself.',
      };
    }

    function garageStateText() {
      const signed = signedIn();
      const armed = signed && isArmed();
      const blockedMin = Math.max(0, Math.ceil((blockUntil() - Date.now()) / 60000));
      const stop = stoppedInfo();

      if (loginRetryAt > Date.now()) return 'waiting · login retry';
      if (!signed) return 'waiting · sign in';
      if (terminalBanActive()) return 'hold · account ban';
      if (banClearHeld()) return 'paused · ban cleared';
      if (blockedMin > 0) return `hold · site block ${blockedMin}m`;
      if (!onlineNow()) return 'waiting · offline';
      if (restGate()) return 'waiting · rest day';
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

    // El contexto y el boton primario del garaje son puros y viven en
    // 36-queue-policy.js, donde `tests/unit` los cubre sin navegador. El banco
    // conserva este atajo porque recibe el parche entero y ya conoce el estado.
    window.__ntaDebug.garageActionFor = (patch = {}) => {
      const context = deriveGarageContext(patch);
      return {
        context,
        primary: garagePrimaryFor(context, {
          box: patch.box !== false,
          resume: patch.resume !== false,
          retry: Boolean(patch.hasRetry),
          race: Boolean(patch.armed && patch.race !== false),
        }),
      };
    };

    function paintGaragePanel() {
      if (!qpanel) return;

      if (qpanel.panel.dataset.theme !== panelTheme) qpanel.panel.dataset.theme = panelTheme;
      applyVisualTheme(qpanel.panel);
      const rgbTyper = typerState();
      const raceState = rgbTyper && !rgbTyper.stopped && rgbTyper.typing ? 'running' : 'waiting';
      if (qpanel.panel.dataset.state !== raceState) qpanel.panel.dataset.state = raceState;
      paintUpdateHealth();
      paintUpdateBadge(qpanel.update, true);
      paintUpdateBadge(qpanel.updateCompact, false, true);

      const signed = signedIn();
      const armed = signed && isArmed();
      const social = socialPanelRoute();
      if (qpanel.panel.dataset.social !== (social ? '1' : '0')) {
        qpanel.panel.dataset.social = social ? '1' : '0';
      }
      setText(qpanel.sub, social ? `${socialPageLabel()} · read-only` : 'garage · queue');
      // Nada de OFF: el chip dice AUTO siempre y el LED dice si esta corriendo
      // o esperando. En Amigos/Equipo el chip dice READ: ahi no hay acciones
      // sociales ni cola que armar.
      if (qpanel.panel.dataset.mode !== 'auto') qpanel.panel.dataset.mode = 'auto';
      const armedFlag = armed ? '1' : '0';
      if (qpanel.panel.dataset.armed !== armedFlag) qpanel.panel.dataset.armed = armedFlag;
      setText(qpanel.mode, social ? 'READ' : 'AUTO');
      if (social) {
        if (qpanel.mode.getAttribute('aria-label') !== 'Read-only social panel') {
          qpanel.mode.setAttribute('aria-label', 'Read-only social panel');
        }
      } else if (qpanel.mode.hasAttribute('aria-label')) {
        qpanel.mode.removeAttribute('aria-label');
      }
      setTitle(qpanel.mode, social
        ? 'Read-only: friends and team data. Accept, deny, invite and send are not available.'
        : (armed
          ? 'Automation runs by itself (always AUTO). To stop it, use Stop / Esc in the race.'
          : 'Waiting; it starts again by itself. There is no off switch: the mode is always AUTO.'));
      setText(qpanel.state, social ? 'read-only' : garageStateText());
      paintSocialRows(social);

      // Indicador AFK y cuenta atras real del reintento de login. La fecha vive
      // en sessionStorage, asi que no se pierde al recargar ni al navegar.
      const afk = afkStatus();
      setText(qpanel.afk, afk.text);
      setWarn(qpanel.afk, String(afk.warn));
      const freeze = refreshAfkFreezeStats();
      const freezeNote = freeze.count
        ? ` This browser froze the tab ${freeze.count} time${freeze.count === 1 ? '' : 's'} in the recorded history.`
        : ' No Page Lifecycle freeze has been recorded in this browser.';
      setTitle(qpanel.afkRow, `${afk.title}${freezeNote}`);
      const keepAlive = keepAliveInfo();
      const keepAliveLabel = keepAlive.enabled ? keepAlive.label : 'off';
      setText(qpanel.keepAlive, keepAliveLabel);
      setWarn(qpanel.keepAlive, keepAliveLabel === 'blocked'
        ? '2'
        : (keepAliveLabel === 'ready' || keepAliveLabel === 'waiting' ? '1' : '0'));
      setTitle(qpanel.keepAliveRow, keepAlive.title);
      if (qpanel.afkBtn) {
        setText(qpanel.afkBtn, backgroundFarm() ? 'AFK on' : 'AFK off');
        setTitle(qpanel.afkBtn, (backgroundFarm()
          ? 'AFK farming is on: hiding this tab keeps the queue running. Turn it off to stop starting races in the background.'
          : 'AFK farming is off: races only start while this tab is visible. Turn it on to keep the queue running hidden; a frozen tab can still end a race in a DQ.')
          + ` Keep-alive: ${keepAliveLabel}.`);
      }
      const retryLeft = Math.max(0, loginRetryAt - Date.now());
      const hasRetry = Boolean(loginRetryAt);
      setHidden(qpanel.retryRow, !hasRetry);
      setHidden(qpanel.retryBtn, !hasRetry);
      if (hasRetry) {
        setText(qpanel.loginRetry, retryLeft > 0 ? sessionClockText(retryLeft) : 'now');
        setWarn(qpanel.loginRetry, retryLeft > 0 ? '1' : '2');
        setTitle(qpanel.retryRow, retryLeft > 0
          ? `Next ${SSO_LABEL[ssoProvider()]} sign-in retry in ${sessionClockText(retryLeft)}.`
          : `Retrying ${SSO_LABEL[ssoProvider()]} now.`);
        setTitle(qpanel.retryBtn, `Use ${SSO_LABEL[ssoProvider()]} now; skips the remaining wait.`
          + ' The same remembered provider is used.');
      }

      // Que login usara el bot si la sesion cae, leido del mismo recuerdo que
      // decide el re-login. Asi se ve si mandara Google, el formulario o CONFIG.
      const saved = savedLogin();
      const remembered = lastLoginMethod();
      if (remembered === 'manual') {
        setText(qpanel.login, 'manual · no SSO');
        setTitle(qpanel.login, 'The last sign-in used the username and password form; the bot will not press an SSO by itself.');
      } else if (remembered) {
        const left = Math.max(0, LAST_LOGIN_MAX_AGE - (Date.now() - Number(saved.at)));
        const days = Math.max(1, Math.ceil(left / 86400000));
        const label = SSO_LABEL[remembered];
        setText(qpanel.login, `${label} · ${days}d`);
        setTitle(qpanel.login, `The bot will press ${label} if the session drops; this memory expires in ${days} day${days === 1 ? '' : 's'}.`);
      } else {
        const label = SSO_LABEL[configuredSsoProvider()];
        setText(qpanel.login, `${label} · config`);
        setTitle(qpanel.login, 'No recent sign-in saved; if the session drops, the bot uses the provider in CONFIG.');
      }

      const boxText = boxStateText();
      setText(qpanel.box, boxText);
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
        handleMysteryBox().catch(() => { /* el siguiente latido reintenta */ });
      }
      // Nunca se desactiva: sin boton del sitio en pantalla, el clic lleva al
      // garaje y reclama alli (antes quedaba muerto fuera del garaje, que es lo
      // que hacia que la caja "no se reclamara nunca" a mano).
      qpanel.boxBtn.disabled = false;
      setTitle(qpanel.boxBtn, !signed
        ? 'Sign in first: the Mystery Box belongs to the account'
        : (boxButton()
          ? 'Press the site\'s claim button now'
          : 'Go to the garage and claim the daily Mystery Box'));
      const terminalBan = terminalBanActive();
      setText(qpanel.resumeBtn, terminalBan ? 'Clear ban' : 'Resume');
      setTitle(qpanel.resumeBtn, terminalBan
        ? 'Account permanently banned: clear the stop only after reviewing the account; the bot stays paused until you arm it again'
        : (banClearHeld()
          ? 'Terminal ban stop cleared; press Resume to arm the queue again'
          : (stoppedRecently()
            ? 'Clear the stop and start now; with a live race this sends the same Alt+A'
            : 'Send Alt+A to a live race, or re-arm the queue from the garage')));

      // El Stop no es un interruptor: una vez parado, Resume es la salida. Se
      // desactiva para que dos clics seguidos no confundan la parada con un
      // arranque ni dejen la marca a medias. Con una carrera viva manda su
      // estado, no la marca vieja: si se reanudo a mano, el boton debe poder
      // pararla otra vez.
      const liveTyper = typerState();
      const alreadyStopped = liveTyper ? Boolean(liveTyper.stopped) : stoppedRecently();
      if (qpanel.stopBtn.disabled !== alreadyStopped) qpanel.stopBtn.disabled = alreadyStopped;
      setTitle(qpanel.stopBtn, alreadyStopped
        ? 'Already stopped; use Resume or Alt+A to start again'
        : 'Stop the bot; mid-race it waits for the current race to end (same as Alt+S)');

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
      setHidden(qpanel.challengeRow, challengeList.length === 0);
      if (challengeList.length) {
        const resetLeft = chResetAt > Date.now() ? chResetAt - Date.now() : 0;
        setText(qpanel.challenges, `${challengesDone}/${challengeList.length}`
          + (resetLeft > 0 ? ` · ${shortWait(resetLeft)} left` : ''));
        setTitle(qpanel.challengeRow, `${challengesDone} of ${challengeList.length} Daily Challenges complete.`
          + challengeList.map((item) => ` ${item.title}: ${item.goal ? `${Math.min(item.progress, item.goal)}/${item.goal}` : item.progress}.`).join('')
          + (resetLeft > 0 ? ` Resets in ${shortWait(resetLeft)} (00:00 ET).` : ''));
      }

      // El reto incompleto con mayor porcentaje de avance: es el que decide si
      // merece la pena seguir o parar. Sin datos suficientes, la fila se oculta.
      const pendingChallenges = challengeList
        .filter((item) => item.goal > 0 && item.progress < item.goal)
        .sort((a, b) => (b.progress / b.goal) - (a.progress / a.goal));
      const nextChallenge = pendingChallenges[0] || null;
      setHidden(qpanel.nextRow, !nextChallenge);
      if (nextChallenge) {
        const shownProgress = Math.min(nextChallenge.progress, nextChallenge.goal);
        setText(qpanel.next, `${nextChallenge.short || 'challenge'} ${shownProgress}/${nextChallenge.goal}`);
        setTitle(qpanel.nextRow, `Closest Daily Challenge: ${nextChallenge.title} · ${shownProgress}/${nextChallenge.goal}.`
          + (chResetAt > Date.now() ? ` Resets in ${shortWait(chResetAt - Date.now())} (00:00 ET).` : ''));
      }

      // Atasco con las recargas gastadas: si sigue fresco, es el aviso mas
      // importante del panel, por encima del recuento de DQ.
      let stuck = null;
      try { stuck = JSON.parse(localStorage.getItem(STUCK_STATE) || 'null'); } catch { stuck = null; }
      const stuckFresh = Boolean(stuck && Number.isFinite(stuck.at) && Date.now() - stuck.at < 600000);

      setHidden(qpanel.dayRow, !hasDay);
      setHidden(qpanel.boxesRow, !hasDay);
      setHidden(qpanel.alertsRow, !(hasDay || stuckFresh));

      if (hasDay) {
        const avg = day.races > 0 ? day.sumWpm / day.races : 0;
        const target = day.races > 0 ? day.sumTarget / day.races : 0;

        setText(qpanel.dayRaces, day.races > 0
          ? `${day.races} · ${avg.toFixed(1)} wpm`
          : 'no races yet');
        setTitle(qpanel.dayRow, [
          `Since midnight: ${day.races} race${day.races === 1 ? '' : 's'}`,
          day.races > 0 ? `${avg.toFixed(1)} wpm avg (target ${Math.round(target)})` : null,
          day.best > 0 ? `best ${day.best.toFixed(1)}` : null,
          day.cash > 0 ? `$${Math.round(day.cash).toLocaleString('en-US')} in race prizes` : null,
          day.firstAt ? `${clockText(day.firstAt)}–${clockText(day.lastAt)}` : null,
        ].filter(Boolean).join(' · ') + '.');

        setText(qpanel.dayBoxes, String(day.boxes));
        setTitle(qpanel.boxesRow, day.boxes > 0
          ? `${day.boxes} Mystery Box${day.boxes === 1 ? '' : 'es'} claimed since midnight.`
          : 'No Mystery Box claimed since midnight.');
      }

      // Presupuesto diario restante, tambien en el garaje: desde aqui se abre
      // la carrera y antes habia que entrar al panel grande para saber cuanto
      // quedaba del dia. Se pinta solo si hay algun tope diario encendido.
      const daily = dailyCaps();
      const hasBudget = daily.raceCap > 0 || daily.xpCap > 0;
      setHidden(qpanel.budgetRow, !hasBudget);
      if (hasBudget) {
        const parts = [];
        if (daily.raceCap) parts.push(`${Math.max(0, daily.raceCap - daily.races)} races`);
        if (daily.xpCap) {
          const left = Math.max(0, daily.xpCap - daily.xp);
          parts.push(`${left > 0 ? limitXpText(left) : '0'} XP`);
        }
        setText(qpanel.dayBudget, parts.join(' · '));
        setWarn(qpanel.budgetRow, daily.raceHit ? '2' : (daily.warn ? '1' : '0'));
        setTitle(qpanel.budgetRow, `Daily budget left: ${parts.join(' · ')}`
          + `${daily.raceCap ? ` · ${daily.races} of ${daily.raceCap} races used` : ''}`
          + `${daily.xpCap ? ` · ${daily.xp.toLocaleString()} of ${daily.xpCap.toLocaleString()} XP used` : ''}`
          + '. Resets at midnight.');
      }

      if (hasDay || stuckFresh) {
        if (stuckFresh) {
          setText(qpanel.dayAlerts, 'stuck');
          setWarn(qpanel.dayAlerts, '2');
          setTitle(qpanel.alertsRow, `The bot has been stuck since ${clockText(stuck.at)} with the reload budget spent. Press F5, then MODE to start it again.`);
        } else {
          setText(qpanel.dayAlerts, day.dq > 0 ? `${day.dq} DQ` : 'none');
          setWarn(qpanel.dayAlerts, day.dq > 0 ? '1' : '0');
          setTitle(qpanel.alertsRow, day.dq > 0
            ? `${day.dq} disqualification${day.dq === 1 ? '' : 's'} since midnight${day.dqAt ? ` · last at ${clockText(day.dqAt)}` : ''}. ${day.clean} clean race${day.clean === 1 ? '' : 's'} in a row.`
            : 'No disqualifications since midnight.');
        }
      }

      // Aviso de temporada tambien en el garaje: llegar aqui y no ver que
      // quedan dos dias para el premio era la unica senal que solo existia
      // dentro de una carrera. Sale de la misma funcion que la tarjeta Season.
      const season = seasonRead();
      const seasonAlerts = seasonAlertText(season);
      setHidden(qpanel.seasonRow, seasonAlerts.length === 0);
      if (seasonAlerts.length) {
        setText(qpanel.seasonAlert, seasonAlerts.join(' · '));
        setTitle(qpanel.seasonRow, `Season ${season.seasonName || ''} · T${season.tier} · ${Number(season.xp || 0).toLocaleString()} XP. ${seasonAlerts.join('. ')}.`);
      }

      // Que puerta te tiene quieto y cuanto le queda. Es la respuesta corta a
      // "por que no corre": la larga (el motivo) ya esta en la fila de abajo.
      const gates = activeGates();
      setHidden(qpanel.waitRow, gates.length === 0);
      if (gates.length) {
        const first = gates[0];
        setText(qpanel.wait, `${first.label} · ${shortWait(first.left)}`);
        setTitle(qpanel.waitRow, `Waiting on: ${gates
          .map((gate) => `${gate.label} (${shortWait(gate.left)} left)`)
          .join(' · ')}. Each one clears by itself.`);
      }

      // Parada actual: el reloj que de verdad frena la cola. La marca activa
      // caduca; despues la misma fila pasa a "last stop" durante 24 h para
      // reconstruir que paso sin confundirlo con una parada en curso.
      const lastStop = lastStopInfo();
      const stopLeft = lastStop ? Math.max(0, lastStop.endAt - Date.now()) : 0;
      const terminalStop = Boolean(lastStop && !lastStop.clearedAt && lastStop.terminal);
      const activeStop = Boolean(lastStop && !lastStop.clearedAt && (terminalStop || stopLeft > 0));
      const recentStop = Boolean(lastStop && Date.now() - lastStop.at < 24 * 3600000);
      setHidden(qpanel.stopRow, !(activeStop || recentStop));
      if (activeStop) {
        const kind = stopReasonKind(lastStop.reason);
        setText(qpanel.stopLabel, 'stopped');
        setText(qpanel.lastStop, terminalStop
          ? 'ban · until cleared'
          : `${kind.label} · ${shortWait(stopLeft)} left`);
        setWarn(qpanel.lastStop, kind.warn);
        setTitle(qpanel.stopRow, terminalStop
          ? `Stopped ${new Date(lastStop.at).toLocaleTimeString()} · ${lastStop.reason || 'permanent ban'} · the account is blocked; automation stays stopped until you clear it with «Clear ban».`
          : `Stopped ${new Date(lastStop.at).toLocaleTimeString()} · ${lastStop.reason || 'manual stop'}`
            + ` · ${shortWait(stopLeft)} left of ${shortWait(lastStop.holdMs)}.`
            + (kind.label === 'ban' ? ' The account is blocked; the bot will not retry.' : ' Resume or Alt+A starts again.'));
      } else if (recentStop) {
        const kind = stopReasonKind(lastStop.reason);
        const state = lastStop.clearedAt
          ? `cleared manually ${shortWait(Date.now() - lastStop.clearedAt)} ago`
          : 'expired';
        setText(qpanel.stopLabel, 'last stop');
        setText(qpanel.lastStop, `${kind.label} · ${state}`);
        setWarn(qpanel.lastStop, '');
        setTitle(qpanel.stopRow, `Last stop: ${new Date(lastStop.at).toLocaleString()} · ${lastStop.reason || 'manual stop'} · hold ${shortWait(lastStop.holdMs)}`
          + (lastStop.clearedAt ? ` · cleared manually at ${new Date(lastStop.clearedAt).toLocaleTimeString()}` : ' · hold elapsed')
          + (kind.label === 'ban' ? ' · the account is blocked; it will not retry.' : ''));
      }

      // Reparto de las ultimas paradas, no solo la ultima: DQ, limite y manual
      // son las tres causas que se mezclan al decidir si se puede volver a
      // correr. La ventana corta evita que un dia viejo pinte la noche de hoy.
      const stopMix = stopHistorySummary();
      const stopMixParts = ['DQ', 'limit', 'manual', 'ban', 'results']
        .filter((kind) => stopMix.counts[kind] > 0)
        .map((kind) => `${kind} ${stopMix.counts[kind]}`);
      setHidden(qpanel.stopHistoryRow, stopMix.total === 0);
      if (stopMix.total) {
        setText(qpanel.stopHistory, stopMixParts.join(' · '));
        setTitle(qpanel.stopHistoryRow, `Last ${stopMix.total} stop${stopMix.total === 1 ? '' : 's'} in ${STOP_HISTORY_DAYS} days: `
          + stopMixParts.join(', ')
          + '. Local history, kept only in this browser.');
      }

      // Ultima decision de la cola: el salto al garaje solo se explicaba en la
      // consola, que desaparece al navegar. Quince minutos es lo que tarda uno
      // en volver a la pestana y preguntarse que paso.
      const why = store.get(WHY, null);
      const whyFresh = Boolean(why && why.text && Number.isFinite(why.at) && Date.now() - why.at < 900000);
      setHidden(qpanel.whyRow, !whyFresh);
      if (whyFresh) {
        setText(qpanel.why, why.text);
        setTitle(qpanel.whyRow, `${why.text} (${clockText(why.at)})`);
      }

      // `info`, no `session`: este ultimo es el objeto de la tanda del modulo.
      const info = sessionInfo();
      setText(qpanel.session, info.text);
      setTitle(qpanel.session, info.title);
      setWarn(qpanel.session, String(info.warn));

      const renewedAt = Number(store.get('refreshAt', 0)) || 0;
      setHidden(qpanel.renewedRow, !renewedAt);
      if (renewedAt) {
        const age = Math.max(0, Date.now() - renewedAt);
        setText(qpanel.renewed, age < 45000 ? 'just now' : `${sessionClockText(age)} ago`);
        setTitle(qpanel.renewed, `Last automatic renewal: ${new Date(renewedAt).toLocaleTimeString()} (kept for this tab only).`);
      }

      const raceButton = findButton((label) => label.includes('race now'));
      const context = deriveGarageContext({
        social,
        banned: terminalBan,
        signed,
        offline: !onlineNow(),
        activeStop,
        reason: activeStop && lastStop ? lastStop.reason : '',
        banCleared: banClearHeld(),
        hasRetry,
        retryText: sessionClockText(retryLeft),
        gates: gates.map((gate) => ({ ...gate, leftText: shortWait(gate.left) })),
        boxReady: boxText === 'ready now',
        armed,
      });
      const primary = garagePrimaryFor(context, {
        box: true,
        resume: true,
        retry: hasRetry,
        race: Boolean(armed && raceButton),
      });
      if (qpanel.panel.dataset.context !== context.key) qpanel.panel.dataset.context = context.key;
      if (qpanel.context && qpanel.context.dataset.context !== context.key) {
        qpanel.context.dataset.context = context.key;
      }
      setText(qpanel.contextTitle, context.title);
      setText(qpanel.contextDetail, context.detail);
      setText(qpanel.contextPill, context.pill);
      for (const button of [qpanel.afkBtn, qpanel.boxBtn, qpanel.raceBtn, qpanel.stopBtn, qpanel.resumeBtn, qpanel.retryBtn]) {
        if (button && button.classList.contains('primary')) button.classList.remove('primary');
      }
      const primaryButton = primary === 'box' ? qpanel.boxBtn
        : primary === 'resume' ? qpanel.resumeBtn
          : primary === 'retry' ? qpanel.retryBtn
            : primary === 'race' ? qpanel.raceBtn
              : null;
      if (primaryButton && !primaryButton.classList.contains('primary')) {
        primaryButton.classList.add('primary');
      }

      setText(qpanel.race, raceNowText());
      if (qpanel.race.dataset.cancel !== (raceNowTimer ? '1' : '0')) {
        qpanel.race.dataset.cancel = raceNowTimer ? '1' : '0';
      }
      const total = raceNowDelay || 1;
      const leftMs = Math.max(0, raceNowAt - Date.now());
      const progress = raceNowTimer ? Math.max(0, Math.min(100, (1 - leftMs / total) * 100)) : 0;
      const progressText = progress.toFixed(1);
      if (qpanel.raceRow.style.getPropertyValue('--race-progress') !== progressText) {
        qpanel.raceRow.style.setProperty('--race-progress', progressText);
      }
      const raceDisabled = !(armed && raceButton);
      if (qpanel.raceBtn.disabled !== raceDisabled) qpanel.raceBtn.disabled = raceDisabled;
    }

    // Ya existe el panel: desde aqui el resto del script puede pedir su
    // repintado sin volver a montarlo ni conocer los refs internos.
    paintGarageHook = paintGaragePanel;

    // La ventana superior no siempre expone la API de depuracion del marco,
    // pero si recibe los storage events del panel de carrera. Este segundo
    // puente mantiene los topes y las horas al dia sin recargar.
    addEventListener('storage', (event) => {
      const key = event.key;
      if (!key || !event.newValue) return;
      if (key === KEYS.prefs) {
        // El cambio de AFK/keep-alive llega desde el iframe u otra pestana. El
        // listener principal ya actualizo CONFIG; aqui se repinta el garaje y,
        // si la pestana esta oculta, se arranca el latido por Worker sin esperar
        // al setInterval frenado.
        let saved = null;
        try { saved = JSON.parse(event.newValue); } catch { return; }
        if (saved && (typeof saved.backgroundFarm === 'boolean' || typeof saved.keepAlive === 'boolean')) {
          paintGaragePanel();
          syncKeepAlive();
          // La ventana superior sobrevive a las recargas del iframe de carrera:
          // si ya tenia activacion por un clic anterior, su AudioContext es el
          // que mantiene la pestana despierta cuando el marco se recarga. Sin
          // activacion queda suspendido y el siguiente clic lo desbloquea.
          if (CONFIG.queue.keepAlive === true && backgroundFarm()) primeKeepAlive();
          if (saved.backgroundFarm && document.visibilityState === 'hidden') loop();
        }
        return;
      }
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
    // El banco comprueba la prioridad del modal de DQ sin abrir una carrera:
    // Garage tiene que ganar aunque "Try Again" aparezca antes en el DOM.
    window.__ntaDebug.dqTarget = () => {
      const button = dqButton();
      return button ? normalize(button.textContent) : '';
    };


    function panelRoute() {
      return garagePanelRoute() || socialPanelRoute();
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
        setHidden(row, !social);
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
      // Las tres GET se reintentan al volver online; offline solo llenarian
      // la cache de fallos y dejarian el panel en «retry» sin motivo.
      if (!onlineNow()) return;
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
        && !banClearHeld() && !stoppedRecently() && !(liveTyper && liveTyper.stopped)
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
          if (terminalBanActive()) {
            setArmed(false);
            queueWhy('Garage: terminal account ban; clear the stop manually before racing again.');
          } else if (banClearHeld()) {
            setArmed(false);
            queueWhy('Garage: terminal ban stop cleared; the queue stays paused until you press Resume.');
          } else if (stoppedRecently()) {
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
      // Recuperar la sesion no salta una parada terminal ni la pausa manual
      // que deja «Clear ban»: la cola sigue quieta hasta un Resume explicito.
      const resumeQueue = !stoppedRecently() && !banClearHeld();
      if (resumeQueue) setArmed(true);
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
      queueLog(`Session recovered${via}; ${resumeQueue ? 'resuming races.' : 'the queue stays paused.'}`);
      storeNotice(resumeQueue
        ? (attempts > 0 ? `Session recovered on its own through ${label}.` : 'Session alive again; resuming races.')
        : 'Session recovered; the queue stays paused until you press Resume.');
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
      // La etiqueta real puede ser «Garage» a secas; exigir «your garage» hacia
      // que el modal se quedara abierto y acabara navegando por timeout.
      const garage = findButton((label) => /garage/.test(label));
      const again = findButton((label) => /race again|play again|next race/.test(label));
      return garage || again;
    }


    function noteDqBlock() {
      // Un «Race Now» ya programado dispara por detras del aviso (el modal no
      // bloquea el clic, solo tapa): la carrera se abre, vuelve el modal y el
      // rebote suma. Se cancela aqui, que es donde se sabe que hay castigo.
      clearRaceNow();
      if (dqPressTimer) {
        clearLater(dqPressTimer);
        dqPressTimer = null;
      }
      dqPressAt = 0;
      dqPressTries = 0;

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
        // El aviso puede haber cambiado a «Too Many Disqualifications» mientras
        // esperabamos: ese cierre ya no vale y no se pulsa nada.
        if (blockUntil() > Date.now()) return;
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

    async function tick() {
      // Eleccion de copia en esta ventana: la que no manda no pulsa nada.
      if (!refreshQueueRole()) return;

      // Offline no se pulsa nada que dependa del servidor (ni Race Now, ni
      // Continue, ni la caja). El estado visible lo explica y el evento online
      // vuelve a llamar a loop() sin esperar al latido frenado.
      if (!onlineNow()) {
        clearContinue();
        clearRaceNow();
        return;
      }

      // Una cuenta cerrada no tiene nada que automatizar: no se pulsa ningun
      // boton del modal, ni se abre una carrera para volver a chocar.
      if (terminalBanNoted) return;

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
      if (handleTerminalBan(modal)) return;
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
        if (terminalBanActive() || banClearHeld()) {
          // Un baneo terminal (o su pausa manual) manda sobre el estado vivo
          // del tipador: una pestana de carrera no puede rearmar la cola sola.
          setArmed(false);
        } else if (racePage || !state.stopped) {
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
      if (await handleMysteryBox()) return;

      if (path === '/' || path === '/garage' || path.startsWith('/garage/')) {
        handleGaragePage();
        return;
      }
      if (path === '/race' || path.startsWith('/race/')) handleRacePage();
    }

    let hiddenLoopQueued = false;

    let loopRunning = false;

    async function loop() {
      if (loopRunning) return;
      loopRunning = true;
      // Un nodo inesperado del sitio no puede tumbar el latido entero ni dejar
      // de programar el siguiente ciclo oculto. El error queda en la consola y
      // el proximo tick vuelve a intentarlo con la pagina ya repintada.
      try {
        onNavigate();
        syncGaragePanel();
        await tick();
        // Si AFK y el keep-alive estan encendidos, se reintenta el audio
        // suspendido sin esperar a otro clic; el throttle interno evita spam.
        syncKeepAlive();
      } catch (error) {
        queueLog('Queue tick failed; retrying on the next beat.', error);
      } finally {
        loopRunning = false;
      }

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
    // La red se trata como una puerta mas: al caer se cancelan los clics ya
    // programados; al volver se despierta la cola de inmediato, sin esperar al
    // intervalo que el navegador pueda tener frenado.
    addEventListener('offline', () => {
      clearContinue();
      clearRaceNow();
      clearIdleTimer();
      queueWhy('Offline: races wait until the network returns.');
      paintGaragePanel();
    });
    addEventListener('online', () => {
      noteProgress();
      queueLog('Online: the queue resumes.');
      paintGaragePanel();
      loop();
    });

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

