
  /* ==========================================================================
   * 12. FLOATING PANEL
   * ========================================================================== */
  const PANEL_ID = 'nt-autotyper-panel';
  const panel = {
    root: null, refs: null, host: null, historySig: '', logSig: '', noticeSig: '',
    weekSig: '', chSig: '', seasonSig: '', seasonBaseSig: '',
    calSig: '', accSig: null, updateHealthAt: 0, mountedViews: new Set(['stats']),
  };
  // El panel se puede recrear si el juego lo borra: el listener de resize se
  // engancha una sola vez, no una por cada montaje.
  let panelResizeBound = false;

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
      version: 2,
      prefsSchema: PREFS_SCHEMA,
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
      backgroundFarm: CONFIG.queue.backgroundFarm === true,
      keepAlive: CONFIG.queue.keepAlive === true,
      afkRequireKeepAlive: CONFIG.queue.afkRequireKeepAlive === true,
      afkFreezeGuard: CONFIG.queue.afkFreezeGuard !== false,
      notifications: CONFIG.notifications.enabled === true,
      useNitro: CONFIG.useNitro !== false,
      nitroStrategy: normalizeNitroStrategy(CONFIG.nitroStrategy),
      customWpm: customWpm(),
      customAccuracy: customAccuracy(),
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

  // Audio keep-alive opcional para AFK. Chrome exime del congelado profundo a
  // las pestanas que estan reproduciendo audio; una fuente constante a un
  // nivel casi inaudible mantiene la pagina despierta sin tono audible. No es
  // una garantia: el usuario puede silenciar la pestana, el navegador puede
  // bloquear el AudioContext antes del primer gesto o el sistema puede
  // suspenderlo. Por eso el ajuste viene apagado y el estado se muestra tal
  // cual, sin prometer que el freeze desaparece.
  let keepAliveCtx = null;
  let keepAliveSource = null;
  let keepAliveGain = null;
  let keepAliveMode = '';
  let keepAliveError = '';
  let keepAliveResumeAt = 0;
  let keepAliveGestureBound = false;
  const KEEPALIVE_SHARED_KEY = 'nta:keepAliveState';
  // El latido se escribe cada 15 s; oculto, Chrome puede frenarlo a ~1 min.
  // Dos minutos de margen evitan que el garaje muestre «blocked» con el audio
  // aun corriendo durante una carrera larga.
  const KEEPALIVE_SHARED_TTL = 120000;
  let keepAliveReportAt = 0;
  let keepAliveHeartbeat = 0;

  // El audio vive en la ventana que recibio el gesto (el iframe o el garaje).
  // Este latido comparte solo el estado para que TUNE y el garaje no digan
  // «blocked» cuando otra ventana ya tiene el contexto en `running`.
  function keepAliveShared() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEEPALIVE_SHARED_KEY) || 'null');
      if (!saved || !Number.isFinite(Number(saved.at))) return null;
      if (Date.now() - Number(saved.at) > KEEPALIVE_SHARED_TTL) return null;
      return {
        owner: String(saved.owner || ''),
        state: String(saved.state || ''),
        at: Number(saved.at),
      };
    } catch {
      return null;
    }
  }

  function reportKeepAlive(state) {
    let shared = null;
    try {
      const raw = JSON.parse(localStorage.getItem(KEEPALIVE_SHARED_KEY) || 'null');
      if (raw && Date.now() - Number(raw.at) < KEEPALIVE_SHARED_TTL) shared = raw;
    } catch { /* modo privado */ }
    const now = Date.now();
    try {
      if (state === 'none') {
        if (!shared || shared.owner === INSTANCE_ID || now - Number(shared.at) > KEEPALIVE_SHARED_TTL) {
          localStorage.removeItem(KEEPALIVE_SHARED_KEY);
        }
        return;
      }
      if (state !== 'running' && shared && shared.state === 'running' && shared.owner !== INSTANCE_ID) {
        // Otra ventana ya mantiene la pestana despierta: no se degrada el aviso.
        return;
      }
      if (now - keepAliveReportAt < 5000 && shared && shared.owner === INSTANCE_ID && shared.state === state) return;
      keepAliveReportAt = now;
      localStorage.setItem(KEEPALIVE_SHARED_KEY, JSON.stringify({
        owner: INSTANCE_ID,
        state,
        at: now,
      }));
    } catch { /* modo privado */ }
  }

  function startKeepAliveHeartbeat() {
    if (keepAliveHeartbeat) return;
    keepAliveHeartbeat = setInterval(() => {
      if (keepAliveCtx && keepAliveCtx.state === 'running') reportKeepAlive('running');
    }, 15000);
  }

  function stopKeepAliveHeartbeat() {
    if (!keepAliveHeartbeat) return;
    clearInterval(keepAliveHeartbeat);
    keepAliveHeartbeat = 0;
  }

  function keepAliveSupported() {
    return typeof window.AudioContext === 'function'
      || typeof window.webkitAudioContext === 'function';
  }

  function keepAliveInfo() {
    const enabled = CONFIG.queue.keepAlive === true;
    if (!enabled) {
      return {
        enabled: false,
        label: 'off',
        title: 'AFK keep-alive: off. Optional silent audio that can keep a hidden AFK tab awake. It is off by default and only starts after a click, because browsers require a user gesture for audio.',
      };
    }
    if (!backgroundFarm()) {
      return {
        enabled: true,
        label: 'waiting',
        title: 'AFK keep-alive: waiting. On, but AFK farming is off. Turn AFK farming on and the silent keep-alive starts with it.',
      };
    }
    if (!keepAliveSupported()) {
      return {
        enabled: true,
        label: 'n/a',
        title: 'AFK keep-alive: n/a. This browser has no AudioContext, so the silent keep-alive cannot run.',
      };
    }
    const shared = keepAliveShared();
    if (!keepAliveCtx) {
      if (shared && shared.state === 'running') {
        return {
          enabled: true,
          label: 'on',
          title: 'AFK keep-alive: on in another window. That AudioContext keeps the tab active; this window has no local context.',
        };
      }
      return {
        enabled: true,
        label: 'ready',
        title: 'AFK keep-alive: ready. Click anywhere once to unlock audio. It only runs while AFK farming is on and is near-silent by design.',
      };
    }
    const state = keepAliveCtx.state;
    if (state === 'running') {
      return {
        enabled: true,
        label: 'on',
        title: 'AFK keep-alive: on. Near-silent audio is playing so Chrome treats this tab as active. Muting the tab or the system can still let it freeze.',
      };
    }
    if ((state === 'suspended' || state === 'interrupted')
      && shared && shared.state === 'running' && shared.owner !== INSTANCE_ID) {
      return {
        enabled: true,
        label: 'on',
        title: 'AFK keep-alive: on in another window. That AudioContext keeps the tab active; this window is suspended but does not need its own context.',
      };
    }
    if (state === 'suspended' || state === 'interrupted') {
      return {
        enabled: true,
        label: 'blocked',
        title: `AFK keep-alive: blocked. Audio is ${state}; click anywhere in the page once to unlock it. The keep-alive cannot promise to prevent a freeze until it reads “on”.`,
      };
    }
    return {
      enabled: true,
      label: 'off',
      title: `AFK keep-alive: off. AudioContext is ${state || 'closed'}; it will be recreated on the next click if AFK farming is on.`,
    };
  }

  function keepAliveDebug() {
    return {
      enabled: CONFIG.queue.keepAlive === true,
      afk: backgroundFarm(),
      supported: keepAliveSupported(),
      state: keepAliveCtx ? keepAliveCtx.state : 'none',
      running: Boolean(keepAliveCtx && keepAliveCtx.state === 'running'),
      mode: keepAliveMode,
      gain: keepAliveGain ? keepAliveGain.gain.value : null,
      error: keepAliveError,
      shared: keepAliveShared(),
      heartbeat: keepAliveHeartbeat !== 0,
      label: keepAliveInfo().label,
    };
  }

  // Resumen corto para TUNE: no promete que una pestana oculta este a salvo si
  // el keep-alive esta apagado, bloqueado o pendiente de gesto. Los freezes se
  // cuentan con el evento Page Lifecycle y se guardan en este navegador.
  function afkHealthInfo() {
    const keep = keepAliveInfo();
    const freeze = refreshAfkFreezeStats();
    const count = Math.max(0, Number(freeze.count) || 0);
    const last = freeze.lastAt
      ? ` Last freeze ${clockSpan(Math.max(0, Date.now() - freeze.lastAt))} ago`
        + (freeze.lastDurationMs ? ` (${Math.max(1, Math.round(freeze.lastDurationMs / 1000))}s paused).` : '.')
      : ' No freeze events recorded.';

    if (!backgroundFarm()) {
      return {
        text: 'off · visible-only',
        state: 'off',
        title: `AFK farming is off: races wait for a visible tab.${last}`,
      };
    }

    const hidden = pageHidden();
    const hold = CONFIG.queue.afkFreezeGuard !== false && afkHoldActive();
    if (hold) {
      const info = afkHoldInfo();
      return {
        text: hidden ? 'hidden · needs visible race' : 'visible · race to clear hold',
        state: hidden ? 'blocked' : 'ready',
        title: `AFK freeze hold: ${info.reason}. Hidden races stay paused until one starts with the tab visible; the AFK health reset clears it.${last}`,
      };
    }
    if (!hidden) {
      return {
        text: `visible · keep-alive ${keep.label}${count ? ` · freeze ${count}` : ''}`,
        state: keep.label === 'on' ? 'on' : 'ready',
        title: `AFK is on, but this tab is visible. Hiding it starts the AFK cycle. Keep-alive: ${keep.label}.${last}`,
      };
    }

    const safe = keep.label === 'on';
    return {
      text: `hidden · keep-alive ${keep.label} · freeze ${count}`,
      state: safe ? 'on' : (keep.label === 'ready' ? 'ready' : 'blocked'),
      title: `${safe
        ? 'Hidden AFK with the keep-alive running; Chrome is less likely to freeze this tab.'
        : 'Hidden AFK without a running keep-alive; the tab can still be frozen and the race lost.'}
        Freeze events seen: ${count}.${last}`,
    };
  }

  // Avisos del sistema: opcionales y con permiso explicito. Se deduplican por
  // etiqueta porque la misma DQ puede verla el iframe y el garaje; sin esto
  // sonarian dos notificaciones por un solo evento.
  function notificationSupported() {
    return typeof window.Notification === 'function';
  }

  function notificationInfo() {
    if (!notificationSupported()) {
      return { label: 'n/a', title: 'Desktop alerts: this browser does not expose the Notification API.' };
    }
    const permission = Notification.permission;
    if (permission === 'denied') {
      return { label: 'blocked', title: 'Desktop alerts: blocked. Allow notifications for nitrotype.com in the browser site settings, then try again.' };
    }
    if (!CONFIG.notifications.enabled) {
      return { label: 'off', title: 'Desktop alerts: off. Only DQ, site blocks and the AFK safety guard use them.' };
    }
    if (permission !== 'granted') {
      return { label: 'ready', title: 'Desktop alerts: click the switch to ask the browser for permission.' };
    }
    return { label: 'on', title: 'Desktop alerts: on. They are sent for disqualifications, site blocks and the AFK safety guard.' };
  }

  function notifyUser(title, body, tag = 'event') {
    if (!CONFIG.notifications.enabled || !notificationSupported() || Notification.permission !== 'granted') return false;
    const key = `nta:notify:${String(tag || 'event').slice(0, 40)}`;
    try {
      const last = Number(localStorage.getItem(key)) || 0;
      if (Date.now() - last < 20000) return false;
      localStorage.setItem(key, String(Date.now()));
    } catch { /* modo privado: se avisa igual */ }
    try {
      const notice = new Notification(String(title || 'Nitro Wraith'), {
        body: String(body || '').slice(0, 220),
        tag: String(tag || 'event'),
      });
      notice.onclick = () => {
        try { window.focus(); } catch { /* ventana sin foco */ }
        try { notice.close(); } catch { /* ya cerrada */ }
      };
      noteFlight('notify', `${tag}: ${title}`);
      return true;
    } catch {
      return false;
    }
  }

  function setNotifications(on) {
    const next = on === true;
    const apply = () => {
      CONFIG.notifications.enabled = next;
      savePrefFlag('notifications', next);
      paintConfig();
      log(next
        ? 'Desktop alerts: on. Permission granted; DQ, site blocks and the AFK guard will notify.'
        : 'Desktop alerts: off.');
      noteFlight('settings', `notifications ${next ? 'on' : 'off'}`);
    };

    if (!next) {
      if (!CONFIG.notifications.enabled) return false;
      apply();
      return true;
    }
    if (!notificationSupported()) {
      log('Desktop alerts: this browser does not expose the Notification API.');
      return false;
    }
    if (Notification.permission === 'denied') {
      log('Desktop alerts: permission is blocked in the browser; allow notifications for this site first.');
      paintConfig();
      return false;
    }
    if (Notification.permission === 'granted') {
      apply();
      return true;
    }

    // El clic del interruptor es el gesto que exige el navegador para pedir
    // permiso. Si se rechaza, el interruptor se queda apagado.
    try {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') apply();
        else {
          log(`Desktop alerts: permission ${permission}; the switch stays off.`);
          paintConfig();
        }
      }).catch(() => paintConfig());
    } catch {
      paintConfig();
    }
    return true;
  }

  function bindKeepAliveGesture() {
    if (keepAliveGestureBound) return;
    keepAliveGestureBound = true;
    const unlock = () => {
      if (CONFIG.queue.keepAlive !== true || !backgroundFarm()) return;
      primeKeepAlive();
      syncKeepAlive();
      // El primer gesto puede pasar el audio de `ready` a `on`: el resumen AFK
      // debe reflejarlo en el mismo clic, no en el siguiente repintado.
      if (typeof paintConfig === 'function') paintConfig();
      if (typeof paintGaragePanel === 'function') paintGaragePanel();
    };
    try {
      addEventListener('pointerdown', unlock, true);
      addEventListener('keydown', unlock, true);
      addEventListener('touchstart', unlock, { capture: true, passive: true });
    } catch { /* navegador sin eventos */ }
  }

  function primeKeepAlive() {
    if (!keepAliveSupported()) return false;
    if (keepAliveCtx && keepAliveCtx.state === 'closed') {
      keepAliveCtx = null;
      keepAliveSource = null;
      keepAliveGain = null;
      keepAliveMode = '';
    }
    if (!keepAliveCtx) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const gain = ctx.createGain();
        // El mismo nivel que usan los keep-alive silenciosos conocidos: un DC
        // constante a 0.001 no produce tono audible, pero el navegador ve
        // actividad de audio.
        gain.gain.value = 0.001;
        let source;
        if (typeof ctx.createConstantSource === 'function') {
          source = ctx.createConstantSource();
          keepAliveMode = 'constant';
        } else {
          source = ctx.createOscillator();
          source.frequency.value = 20;
          keepAliveMode = 'oscillator';
        }
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start();
        keepAliveCtx = ctx;
        keepAliveSource = source;
        keepAliveGain = gain;
        keepAliveError = '';
        reportKeepAlive(ctx.state);
        ctx.onstatechange = () => {
          if (!CONFIG.queue.keepAlive) return;
          reportKeepAlive(ctx.state);
          if (ctx.state === 'suspended') keepAliveResumeAt = 0;
          if (typeof paintConfig === 'function') paintConfig();
          if (panel.refs && typeof updatePanel === 'function') updatePanel();
        };
      } catch (error) {
        keepAliveError = error && error.message ? error.message : 'AudioContext failed';
        keepAliveCtx = null;
        keepAliveSource = null;
        keepAliveGain = null;
        keepAliveMode = '';
        return false;
      }
    }

    bindKeepAliveGesture();
    startKeepAliveHeartbeat();
    if (keepAliveCtx.state === 'suspended' || keepAliveCtx.state === 'interrupted') {
      const now = Date.now();
      if (now - keepAliveResumeAt > 5000) {
        keepAliveResumeAt = now;
        try {
          const resumed = keepAliveCtx.resume();
          if (resumed && typeof resumed.then === 'function') {
            resumed.then(() => {
              reportKeepAlive('running');
              if (typeof paintConfig === 'function') paintConfig();
            }).catch(() => { /* el proximo gesto lo reintenta */ });
          }
        } catch { /* sin gesto valido */ }
      }
    }
    if (keepAliveCtx.state === 'running') reportKeepAlive('running');
    return keepAliveCtx.state === 'running';
  }

  function stopKeepAlive() {
    if (keepAliveSource) {
      try { keepAliveSource.stop(); } catch { /* ya parado */ }
    }
    if (keepAliveCtx) {
      keepAliveCtx.onstatechange = null;
      try {
        const closed = keepAliveCtx.close();
        if (closed && typeof closed.catch === 'function') closed.catch(() => {});
      } catch { /* ya cerrado */ }
    }
    keepAliveCtx = null;
    keepAliveSource = null;
    keepAliveGain = null;
    keepAliveMode = '';
    keepAliveResumeAt = 0;
    stopKeepAliveHeartbeat();
    reportKeepAlive('none');
  }

  function syncKeepAlive() {
    if (CONFIG.queue.keepAlive !== true || !backgroundFarm()) {
      if (keepAliveCtx) stopKeepAlive();
      return false;
    }
    // No se crea un AudioContext desde un latido: sin gesto quedaria suspendido
    // y llenaria la consola de avisos. El primer clic lo crea y lo desbloquea.
    bindKeepAliveGesture();
    if (!keepAliveCtx) return false;
    return primeKeepAlive();
  }

  function setKeepAlive(on, options = {}) {
    const next = on === true;
    if (CONFIG.queue.keepAlive === next) return false;

    CONFIG.queue.keepAlive = next;
    if (options.persist !== false) saveKeepAlivePref(next);
    if (next) {
      // El click del interruptor es el gesto que Chrome exige para el audio.
      // Sin AFK no se crea: la opcion queda guardada y espera a que AFK se
      // encienda.
      if (backgroundFarm()) primeKeepAlive();
      syncKeepAlive();
    } else {
      stopKeepAlive();
    }
    paintConfig();
    log(next
      ? 'AFK keep-alive: on. Near-silent audio can keep a hidden tab awake; browsers may still block or ignore it.'
      : 'AFK keep-alive: off.');
    return true;
  }

  // AFK farming es el unico interruptor que puede provocar un DQ sin que el
  // bucle tenga un fallo: una pestana oculta puede congelarse y entonces no hay
  // teclas posibles. Por eso viene apagado y el aviso es explicito.
  function setBackgroundFarm(on, options = {}) {
    const next = on === true;
    if (CONFIG.queue.backgroundFarm === next) return false;

    CONFIG.queue.backgroundFarm = next;
    if (options.persist !== false) saveBackgroundFarmPref(next);
    // El keep-alive solo tiene sentido con AFK: se arranca o se para en el
    // mismo gesto, sin esperar al siguiente latido. Si el AudioContext estaba
    // cerrado, el clic de AFK tambien sirve para crearlo.
    if (next && CONFIG.queue.keepAlive === true) primeKeepAlive();
    syncKeepAlive();
    paintConfig();
    log(next
      ? 'AFK farming: on. A hidden tab can be frozen by the browser and that race can end in a DQ.'
      : 'AFK farming: off. New races only start while this tab is visible.');
    return true;
  }

  function setAfkRequireKeepAlive(on, options = {}) {
    const next = on === true;
    if (CONFIG.queue.afkRequireKeepAlive === next) return false;

    CONFIG.queue.afkRequireKeepAlive = next;
    if (options.persist !== false) savePrefFlag('afkRequireKeepAlive', next);
    paintConfig();
    log(next
      ? 'AFK interlock: hidden races now require a confirmed running keep-alive.'
      : 'AFK interlock: off. Hidden races can start even when the keep-alive is not running.');
    noteFlight('settings', `AFK interlock ${next ? 'on' : 'off'}`);
    return true;
  }

  function setAfkFreezeGuard(on, options = {}) {
    const next = on !== false;
    if (CONFIG.queue.afkFreezeGuard === next) return false;

    CONFIG.queue.afkFreezeGuard = next;
    if (options.persist !== false) savePrefFlag('afkFreezeGuard', next);
    paintConfig();
    log(next
      ? 'AFK safety guard: on. A DQ within 15 min of a freeze turns AFK farming off.'
      : 'AFK safety guard: off.');
    noteFlight('settings', `AFK freeze guard ${next ? 'on' : 'off'}`);
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

  // AFK farming y su keep-alive se cambian desde TUNE (iframe) o desde el boton
  // del garaje (ventana superior). Sin este puente, CONFIG.queue.backgroundFarm
  // se quedaba con el valor del arranque en la otra ventana y el interruptor
  // parecia no hacer nada hasta recargar. El evento storage llega a la otra
  // ventana y a otras pestanas del mismo perfil.
  try {
    addEventListener('storage', (event) => {
      if (event.key !== KEYS.prefs || !event.newValue) return;
      let saved = null;
      try { saved = JSON.parse(event.newValue); } catch { return; }
      if (!saved) return;

      const hasFarm = typeof saved.backgroundFarm === 'boolean';
      const hasKeepAlive = typeof saved.keepAlive === 'boolean';
      if (!hasFarm && !hasKeepAlive) return;

      let changed = false;
      if (hasFarm) {
        const next = saved.backgroundFarm === true;
        if (next !== backgroundFarm()) {
          CONFIG.queue.backgroundFarm = next;
          changed = true;
          log(next
            ? 'AFK farming: on (other panel). Hiding this tab keeps the queue running.'
            : 'AFK farming: off (other panel). New races only start while this tab is visible.');
        }
      }
      if (hasKeepAlive) {
        const next = saved.keepAlive === true;
        if (next !== (CONFIG.queue.keepAlive === true)) {
          CONFIG.queue.keepAlive = next;
          changed = true;
          log(next
            ? 'AFK keep-alive: on (other panel).'
            : 'AFK keep-alive: off (other panel).');
        }
      }
      if (!changed) return;
      syncKeepAlive();
      if (typeof paintConfig === 'function') paintConfig();
      if (panel.refs) updatePanel();
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
      // Otra pestana entro con otra cuenta: no se puede seguir tecleando con
      // el rango de la anterior. Al recargar, el arranque limpia la calibracion
      // y la vuelve a leer de la cuenta nueva.
      if (key === 'persist:nt' || key === 'player_token') {
        const id = readAccountIdentity();
        const stored = disk.get(KEYS.calibrationAccount, '');
        if (Date.now() >= accountReloadMutedUntil && id && stored && id !== stored) {
          location.reload();
          return;
        }
      }
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

  function tuneFilterText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Filtro de TUNE: una tarjeta se queda si su texto o el titulo de su bloque
  // contienen la consulta. No borra ajustes ni cambia valores; solo oculta lo
  // que no coincide para no recorrer una lista larga. Las secciones sin
  // coincidencias tambien se esconden y queda un aviso claro si no hay nada.
  function filterTune() {
    const input = panel.refs && panel.refs.tuneSearch;
    const cfg = panel.refs && panel.refs.cfg;
    if (!cfg) return;
    const query = tuneFilterText(input ? input.value : '');
    const cards = Array.from(cfg.querySelectorAll('.tune-sec .card'));
    let visible = 0;

    for (const card of cards) {
      const section = card.closest('.tune-sec');
      const title = section && section.querySelector('.tune-sec-h');
      const haystack = tuneFilterText(`${card.textContent} ${title ? title.textContent : ''}`);
      const show = !query || haystack.includes(query);
      if (card.hidden !== !show) card.hidden = !show;
      if (show) visible += 1;
    }

    for (const section of cfg.querySelectorAll('.tune-sec')) {
      const show = Array.from(section.querySelectorAll('.card')).some((card) => !card.hidden);
      if (section.hidden !== !show) section.hidden = !show;
    }

    setText(panel.refs.tuneCount, query ? `${visible}/${cards.length}` : `${cards.length} settings`);
    if (panel.refs.tuneClear) panel.refs.tuneClear.hidden = !query;
    if (panel.refs.tuneEmpty) {
      const empty = Boolean(query && visible === 0);
      panel.refs.tuneEmpty.hidden = !empty;
      if (empty) setText(panel.refs.tuneEmpty, `No setting matches “${input.value.trim()}”.`);
    }
  }

  // Centro de salud: un resumen que dice QUE revisar, sin obligar a leer todo
  // TUNE. No inventa un estado "sano" si falta la calibracion o el update.
  function paintHealthCenter() {
    if (!panel.refs || !panel.refs.healthSummary) return;
    const up = updateHealth();
    const freeze = refreshAfkFreezeStats();
    const keep = keepAliveInfo();
    const afk = afkHealthInfo();
    const account = accountStats
      ? `${accountStats.wpm || '?'} avg${accountStats.races ? ` · ${accountStats.races} races` : ''}`
      : calibratedRange ? `${calibratedRange.min}-${calibratedRange.max} wpm` : 'no data';
    const afkGate = !backgroundFarm()
      ? 'visible-only'
      : CONFIG.queue.afkRequireKeepAlive === true
        ? `strict · ${keep.label}`
        : `open · ${keep.label}`;
    const freezeText = freeze.count
      ? `${freeze.count}${freeze.lastAt ? ` · ${Math.max(0, Math.round((Date.now() - freeze.lastAt) / 60000))}m` : ''}`
      : 'none';

    setText(panel.refs.healthAccount, account);
    setText(panel.refs.healthAfk, afkGate);
    setText(panel.refs.healthUpdate, up.text);
    setText(panel.refs.healthFreeze, freezeText);

    const issues = [];
    if (!accountStats && !calibratedRange) issues.push('account');
    if (up.good === false) issues.push('update');
    if (backgroundFarm() && afk.state === 'blocked') issues.push('AFK');
    if (backgroundFarm() && CONFIG.queue.afkRequireKeepAlive === true && keep.label !== 'on') issues.push('keep-alive');
    const summary = issues.length ? `${issues.length} to review` : 'all clear';
    setText(panel.refs.healthSummary, summary);
    if (panel.refs.healthSummary.dataset.state !== (issues.length ? 'warn' : 'ok')) {
      panel.refs.healthSummary.dataset.state = issues.length ? 'warn' : 'ok';
    }
    const note = !accountStats && !calibratedRange
      ? 'First run: open the garage and let calibration read this account. AFK stays off until you enable it; the report has the full state.'
      : issues.length
        ? `Review: ${[...new Set(issues)].join(', ')}. The report includes the flight recorder and the exact AFK state.`
        : `Account ${account}; AFK ${afkGate}; update ${up.text}; freezes ${freezeText}.`;
    setText(panel.refs.healthNote, note);
    panel.refs.healthNote.title = `${note} Copy report puts the full diagnostic on the clipboard.`;
  }

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
      backgroundFarm: CONFIG.queue.backgroundFarm === true,
      keepAlive: CONFIG.queue.keepAlive === true,
      afkRequireKeepAlive: CONFIG.queue.afkRequireKeepAlive === true,
      afkFreezeGuard: CONFIG.queue.afkFreezeGuard !== false,
      notifications: CONFIG.notifications.enabled === true,
      useNitro: CONFIG.useNitro !== false,
      sound: sfxOn === true,
    };
    const keepAlive = keepAliveInfo();
    const notifications = notificationInfo();
    const afkHealth = afkHealthInfo();
    const afkHealthNode = panel.refs.cfg.querySelector('[data-field="afkHealth"]');
    if (afkHealthNode) {
      setText(afkHealthNode, afkHealth.text);
      if (afkHealthNode.dataset.state !== afkHealth.state) afkHealthNode.dataset.state = afkHealth.state;
      if (afkHealthNode.title !== afkHealth.title) afkHealthNode.title = afkHealth.title;
    }

    for (const button of panel.refs.cfg.querySelectorAll('[data-toggle]')) {
      const key = button.dataset.toggle;
      const on = toggles[key] !== false;
      const value = on ? '1' : '0';
      if (button.dataset.on !== value) button.dataset.on = value;
      button.setAttribute('aria-checked', on ? 'true' : 'false');

      const label = panel.refs.cfg.querySelector(`[data-sw-txt="${key}"]`);
      if (label) {
        // El keep-alive tiene estados reales (`ready`, `blocked`): el texto no
        // puede decir "on" si el audio sigue suspendido.
        const text = key === 'keepAlive'
          ? keepAlive.label
          : key === 'notifications' ? notifications.label : (on ? 'on' : 'off');
        setText(label, text);
        if (label.dataset.on !== value) label.dataset.on = value;
        if (label.dataset.state !== text) label.dataset.state = text;
      }
      if (key === 'keepAlive') {
        button.title = keepAlive.title;
        button.dataset.state = keepAlive.label;
        if (label) label.title = keepAlive.title;
      }
      if (key === 'notifications') {
        button.title = notifications.title;
        button.dataset.state = notifications.label;
        if (label) label.title = notifications.title;
      }
    }

    // Tecno y rango del perfil activo, en la tarjeta de ritmo y en la de guardia.
    const tier = paceRange();
    setText(panel.refs.tuneCap, Number.isFinite(CONFIG.wpm.hardCap) ? `≤ ${CONFIG.wpm.hardCap} wpm` : 'no cap');
    setText(panel.refs.tuneRange, `${tier.min}-${tier.max}`);
    setText(panel.refs.infoCap, String(CONFIG.wpm.hardCap));
    paintHealthCenter();

    // Los overrides manuales no se pisan mientras el usuario esta escribiendo.
    const setNumberValue = (el, value) => {
      if (!el || (el.ownerDocument && el.ownerDocument.activeElement === el)) return;
      const next = Number(value) > 0 ? String(Math.round(Number(value))) : '';
      if (el.value !== next) el.value = next;
      el.title = next
        ? `Manual override active: ${next}. Empty or 0 returns to automatic calibration.`
        : 'Empty/auto: calibration comes from the account average, lifetime history and the top-based recovery floor.';
    };
    setNumberValue(panel.refs.customWpm, CONFIG.calibration.customWpm);
    setNumberValue(panel.refs.customAcc, CONFIG.calibration.customAccuracy);

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
  window.__ntaDebug.openUpdateDownload = () => openUpdateDownload();
  window.__ntaDebug.verifyUpdateArtifact = (url) => verifyUpdateArtifact(url);
  // Dry-run de soporte: no teclea ni abre carreras, solo comprueba que las
  // piezas que suelen romperse (storage, panel, contrato DOM, update) responden.
  window.__ntaDebug.selfTest = () => {
    let storage = 'ok';
    try {
      localStorage.setItem('nta:selftest', '1');
      localStorage.removeItem('nta:selftest');
    } catch {
      storage = 'blocked';
    }
    return {
      schema: 2,
      storage,
      panel: Boolean(panel.root),
      contract: typeof typingContract === 'function' ? typingContract() : null,
      update: updateHealth(),
      safeMode: safeModeState(),
    };
  };
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
    accuracy: calibratedAccuracy ? { ...calibratedAccuracy } : null,
    custom: { wpm: customWpm(), accuracy: customAccuracy() },
  });
  window.__ntaDebug.setCustomWpm = (value) => setCustomWpm(value);
  window.__ntaDebug.setCustomAccuracy = (value) => setCustomAccuracy(value);
  window.__ntaDebug.paceCenter = (stats) => effectivePaceCenter(stats || {});
  window.__ntaDebug.accountIdentity = () => readAccountIdentity();
  window.__ntaDebug.calibrationAccount = () => disk.get(KEYS.calibrationAccount, '');
  window.__ntaDebug.ensureCalibrationAccount = () => ensureCalibrationAccount();
  window.__ntaDebug.needsAccountRead = () => calibrationNeedsAccountRead;
  window.__ntaDebug.stickerChance = () => CONFIG.stickers.chance;
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
  window.__ntaDebug.backgroundFarm = () => backgroundFarm();
  window.__ntaDebug.setBackgroundFarm = (on) => setBackgroundFarm(Boolean(on));
  window.__ntaDebug.keepAlive = () => keepAliveDebug();
  window.__ntaDebug.setKeepAlive = (on) => setKeepAlive(Boolean(on));
  window.__ntaDebug.afkRequireKeepAlive = () => CONFIG.queue.afkRequireKeepAlive === true;
  window.__ntaDebug.setAfkRequireKeepAlive = (on) => setAfkRequireKeepAlive(Boolean(on));
  window.__ntaDebug.afkKeepAliveConfirmed = () => afkKeepAliveConfirmed();
  window.__ntaDebug.hiddenBlocked = () => hiddenBlocked();
  window.__ntaDebug.afkHiddenBlocked = (hidden) => afkHiddenBlocked(hidden !== false);
  window.__ntaDebug.prefs = () => readPrefs();
  window.__ntaDebug.afkFreezeGuard = () => CONFIG.queue.afkFreezeGuard !== false;
  window.__ntaDebug.setAfkFreezeGuard = (on) => setAfkFreezeGuard(on !== false);
  window.__ntaDebug.afkGuardDecision = () => afkFreezeGuardDecision();
  window.__ntaDebug.afkFreeze = () => ({ ...afkFreezeStats });
  window.__ntaDebug.afkHold = () => afkHoldInfo();
  window.__ntaDebug.armAfkHold = (reason) => armAfkHold(reason);
  window.__ntaDebug.clearAfkHold = (reason) => clearAfkHold(reason);
  window.__ntaDebug.resetAfkFreeze = () => resetAfkFreezeStats();
  window.__ntaDebug.notifications = () => ({ ...notificationInfo(), enabled: CONFIG.notifications.enabled === true });
  window.__ntaDebug.setNotifications = (on) => setNotifications(Boolean(on));
  window.__ntaDebug.flight = (limit) => flightEvents(limit);
  window.__ntaDebug.clearFlight = () => clearFlight();
  window.__ntaDebug.noteFlight = (kind, detail) => { noteFlight(String(kind || 'event'), String(detail || '')); return true; };
  window.__ntaDebug.flushFlight = () => { saveFlightNow(); return flightRing.length; };
  window.__ntaDebug.noteDq = () => { noteDisqualification(); return { streak: session.dqStreak, count: session.dqCount }; };
  window.__ntaDebug.nitroStrategy = () => CONFIG.nitroStrategy;
  window.__ntaDebug.setNitroStrategy = (value) => setNitroStrategy(String(value || ''));
  window.__ntaDebug.useNitro = (app) => useNitro(app);
  window.__ntaDebug.pressNitroKey = () => pressNitroKey();
  window.__ntaDebug.nitroPreview = () => (nitroPreview ? { ...nitroPreview } : null);
  window.__ntaDebug.updateState = () => updateState();
  window.__ntaDebug.updateBusy = () => updateChecking;
  window.__ntaDebug.checkForUpdate = (force) => checkForUpdate(Boolean(force));
  window.__ntaDebug.live = () => liveSituation();
  window.__ntaDebug.calibrationAuto = () => CONFIG.calibration.auto === true;
  window.__ntaDebug.calibrationHealth = () => ({
    calibrating,
    error: calibrationError,
    failures: calibrationFailures,
    retryIn: Math.max(0, calibrationRetryAt - Date.now()),
    raceMark: calibrationRaceMark,
  });
  window.__ntaDebug.muteAccountReload = (ms = 2000) => {
    accountReloadMutedUntil = Date.now() + Math.max(0, Number(ms) || 0);
    return accountReloadMutedUntil;
  };
  window.__ntaDebug.refreshCalibration = () => refreshCalibration();

  // El banco detiene esta copia sin tocar el teclado: el guardia debe soltar el
  // registro en el siguiente latido para que la otra copia tome el relevo.
  window.__ntaDebug.stop = () => panic('debug stop');
  window.__ntaDebug.resume = () => resumeAuto();
  window.__ntaDebug.safeModeState = () => safeModeState();
  window.__ntaDebug.enterSafeMode = (reason) => { enterSafeMode(String(reason || 'harness')); return safeModeState(); };
  window.__ntaDebug.clearSafeMode = () => { clearSafeMode(); return safeModeState(); };
  window.__ntaDebug.clearBootFailures = () => { clearBootFailures(); return true; };
  window.__ntaDebug.noteRuntimeError = (kind, message) => {
    noteRuntimeError(String(kind || 'test'), new Error(String(message || 'simulated')), { fatal: true, visible: false });
    return safeModeState();
  };
  window.__ntaDebug.noteUiDrift = (reason) => noteUiDrift(String(reason || 'harness'));
  window.__ntaDebug.clearUiDrift = () => { uiDrift = null; return true; };
  window.__ntaDebug.uiDrift = () => (uiDrift ? { ...uiDrift } : null);
  window.__ntaDebug.typingContract = () => typingContract();
  window.__ntaDebug.supportBundle = () => supportBundle();
  // Las pruebas que siembran el historico necesitan un pintado real sin
  // depender de que la pestana este visible o de la cache de 1.5 s.
  window.__ntaDebug.panelRefresh = () => {
    dayHistCache = null;
    dayHistCacheRaw = '';
    dayHistCacheAt = 0;
    updatePanel(true);
    return true;
  };

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
    for (const key of ['startedAt', 'endedAt', 'chars', 'nitroChars', 'correct', 'errors', 'pos', 'startIndex', 'lastAcceptedAt']) {
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
  // El banco siembra un historial corrupto/craftado y comprueba que el panel
  // solo recibe campos saneados. Tambien sirve para recargar el historial sin
  // recargar la pagina entera.
  window.__ntaDebug.historyReload = () => {
    raceHistory = loadHistory();
    if (panel.refs) {
      panel.historySig = '';
      renderHistory();
    }
    return raceHistory;
  };
  window.__ntaDebug.adaptivePace = () => {
    ensureAdaptivePace();
    return {
      ...adaptivePace,
      target: profile.targetWPM,
      goal: profile.accuracyGoal,
      range: baseRange(),
    };
  };
  window.__ntaDebug.adaptPace = (row) => adaptPace(row);
  // El banco prueba que el freno aprendido no se pierde al recargar ni al
  // volver a calibrar: relee el estado del disco y corre el mismo sync del
  // arranque real.
  window.__ntaDebug.adaptiveReload = () => {
    adaptivePace = readAdaptivePace();
    ensureAdaptivePace();
    return window.__ntaDebug.adaptivePace();
  };
  window.__ntaDebug.syncAdaptivePace = () => {
    syncAdaptivePace();
    return window.__ntaDebug.adaptivePace();
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
  // El castigo por racha se prueba sin tocar la red: el banco inyecta el aviso
  // y comprueba que no se pulsa ningun boton y que la espera queda guardada.
  window.__ntaDebug.recoverDq = () => recoverFromDqModal();
  window.__ntaDebug.terminalBanText = (text) => looksTerminalBan(String(text || ''));
  window.__ntaDebug.terminalBan = (text) => handleTerminalBan(String(text || ''));
  window.__ntaDebug.terminalActive = () => terminalBanActive();
  window.__ntaDebug.resetTerminalBan = () => {
    terminalBanNoted = false;
    return true;
  };
  window.__ntaDebug.siteBlock = () => siteBlockedUntil();
  window.__ntaDebug.clearSiteBlock = () => {
    disk.remove(DQ_BLOCK_UNTIL);
    disk.remove(DQ_BLOCK_STAGE);
    disk.remove(DQ_BLOCK_CHECKED_AT);
    session.breakUntil = 0;
    saveCounters();
    return true;
  };
  window.__ntaDebug.perf = () => ({ ...perfCounters });
  window.__ntaDebug.paintEveryMs = () => panelPaintEveryMs();
  window.__ntaDebug.typing = () => Boolean(session.typing);
  // Prueba pura del gobernador sin tocar la carrera real: guarda y restaura
  // los tres contadores que usa paceCapWait.
  window.__ntaDebug.paceCapWaitFor = (startedAt, chars, nitroChars = 0) => {
    const previous = {
      startedAt: session.startedAt,
      chars: session.chars,
      nitroChars: session.nitroChars,
    };
    session.startedAt = Number(startedAt) || 0;
    session.chars = Number(chars) || 0;
    session.nitroChars = Number(nitroChars) || 0;
    const wait = paceCapWait();
    Object.assign(session, previous);
    return wait;
  };
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
  // Lectura viva y formula del ritmo reciente: el banco comprueba el numero y
  // el aviso de carrera muda sin esperar a teclear una carrera entera.
  const liveSamples = (samples = []) => (Array.isArray(samples) ? samples : [])
    .map((item) => ({
      at: Number(item && item.at),
      typed: Number(item && item.typed),
      errors: Number(item && item.errors),
    }))
    .filter((item) => Number.isFinite(item.at) && Number.isFinite(item.typed));
  window.__ntaDebug.liveReadout = () => {
    const measured = session.chars > 0;
    const acceptedAt = Number(session.lastAcceptedAt) || 0;
    const age = acceptedAt ? Math.max(0, Date.now() - acceptedAt) : null;
    const recent = liveRecentNow();
    return {
      wpm: measured ? wpmNow() : 0,
      accuracy: measured ? accuracyNow() : 100,
      pace: recent ? recent.pace : null,
      recentAccuracy: recent ? recent.accuracy : null,
      age,
      stale: Boolean(session.typing && !session.endedAt && age !== null && age > 2500),
      typed: Math.max(0, session.chars - session.nitroChars),
    };
  };
  window.__ntaDebug.liveRecentFrom = (samples = []) => liveRecentFrom(liveSamples(samples));
  // El banco siembra la ventana corta para comprobar el numero pintado sin
  // esperar seis segundos de tecleo real.
  window.__ntaDebug.seedLiveRecent = (samples = []) => {
    liveRecentKey = `${session.startedAt}:${session.endedAt}`;
    liveRecentSamples = liveSamples(samples);
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
  window.__ntaDebug.typingLock = () => ({
    supported: typingLocksAvailable(),
    held: typingLockHeld,
  });
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
      typingLock: typingLockHeld,
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

    if (data.customWpm !== undefined) {
      setCustomWpm(data.customWpm, { persist: false });
      done.push(customWpm() ? `custom wpm ${customWpm()}` : 'custom wpm auto');
    }
    if (data.customAccuracy !== undefined) {
      setCustomAccuracy(data.customAccuracy, { persist: false });
      done.push(customAccuracy() ? `custom acc ${customAccuracy()}%` : 'custom acc auto');
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

    if (typeof data.backgroundFarm === 'boolean') {
      setBackgroundFarm(data.backgroundFarm, { persist: false });
      done.push(`AFK farming ${data.backgroundFarm ? 'on' : 'off'}`);
    }

    if (typeof data.keepAlive === 'boolean') {
      setKeepAlive(data.keepAlive, { persist: false });
      done.push(`AFK keep-alive ${data.keepAlive ? 'on' : 'off'}`);
    }

    if (typeof data.afkRequireKeepAlive === 'boolean') {
      setAfkRequireKeepAlive(data.afkRequireKeepAlive, { persist: false });
      done.push(`AFK interlock ${data.afkRequireKeepAlive ? 'on' : 'off'}`);
    }

    if (typeof data.afkFreezeGuard === 'boolean') {
      setAfkFreezeGuard(data.afkFreezeGuard, { persist: false });
      done.push(`AFK guard ${data.afkFreezeGuard ? 'on' : 'off'}`);
    }

    if (typeof data.notifications === 'boolean') {
      // Un import no debe disparar un prompt de permiso: se aplica solo si el
      // navegador ya lo tiene concedido; si no, se conserva apagado.
      if (data.notifications === false) {
        if (CONFIG.notifications.enabled) setNotifications(false);
        done.push('notifications off');
      } else if (notificationSupported() && Notification.permission === 'granted') {
        setNotifications(true);
        done.push('notifications on');
      } else {
        done.push('notifications need permission');
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
      // Version del contrato del informe: un bundle viejo se puede triar sin
      // adivinar que campos existen.
      schema: 2,
      version: VERSION,
      channel: CHANNEL,
      at: new Date().toISOString(),
      page: location.pathname,
      mode: MODE,
      // Estado de la red de seguridad y del contrato con la UI. Van en el
      // informe para que un fallo raro se pueda diagnosticar sin consola.
      safeMode: safeModeState(),
      contract: {
        ...typingContract(),
        drift: uiDrift
          ? { at: new Date(uiDrift.at).toISOString(), reason: uiDrift.reason }
          : null,
      },
      profile: { name: paceProfile, min: tier.min, max: tier.max, hardCap: CONFIG.wpm.hardCap },
      calibration: {
        target: calibratedRange ? `${calibratedRange.min}-${calibratedRange.max} WPM` : null,
        accuracy: calibratedAccuracy ? `${calibratedAccuracy.min}-${calibratedAccuracy.max}%` : null,
        at: calibrationStamp() ? new Date(calibrationStamp()).toISOString() : null,
        manual: { wpm: customWpm() || null, accuracy: customAccuracy() || null },
        account: accountStats
          ? {
            wpm: accountStats.wpm || null,
            target: accountStats.targetWpm || null,
            recent: accountStats.currentWpm || null,
            lifetime: accountStats.lifetimeWpm || null,
            accuracy: accountStats.accuracy || null,
            races: accountStats.races || null,
            source: accountStats.source || null,
            recovery: accountStats.recovery || null,
          }
          : null,
        lifetime: accountStats && accountStats.lifetime
          ? {
            wpm: accountStats.lifetime.wpm,
            months: accountStats.lifetime.rows,
            pages: accountStats.lifetime.pages,
            cached: accountStats.lifetime.cached === true,
            stale: accountStats.lifetime.stale === true,
            at: accountStats.lifetime.at ? new Date(accountStats.lifetime.at).toISOString() : null,
          }
          : null,
      },
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
        tab: tabLeaseInfo(),
        typingLock: typingLockHeld ? 'held' : (typingLocksAvailable() ? 'free' : 'unsupported'),
        typingRescue: typingRescueUntil > Date.now() ? 'active' : 'off',
        live: liveSituation(),
      },
      switches: {
        breaks: CONFIG.breaks.enabled !== false,
        mysteryBox: CONFIG.mysteryBox.enabled !== false,
        stickers: CONFIG.stickers.enabled !== false,
        guard: CONFIG.guard.enabled !== false,
        useNitro: CONFIG.useNitro !== false,
        nitroStrategy: CONFIG.nitroStrategy,
        backgroundFarm: CONFIG.queue.backgroundFarm === true,
        afkRequireKeepAlive: CONFIG.queue.afkRequireKeepAlive === true,
        afkFreezeGuard: CONFIG.queue.afkFreezeGuard !== false,
        notifications: CONFIG.notifications.enabled === true,
        notificationPermission: notificationSupported() ? Notification.permission : 'unsupported',
        sound: sfxOn === true,
      },
      afk: {
        keepAlive: keepAliveInfo().label,
        freeze: (() => {
          const stats = refreshAfkFreezeStats();
          return {
            count: stats.count,
            lastAt: stats.lastAt ? new Date(stats.lastAt).toISOString() : null,
            lastMinutes: stats.lastAt ? Math.round((Date.now() - stats.lastAt) / 60000) : null,
            lastDurationMs: stats.lastDurationMs,
            totalMs: stats.totalMs,
          };
        })(),
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
        browser: browserFamily(),
        browserSupported: browserSupported(),
        userAgent: navigator.userAgent,
        language: navigator.language,
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
      flight: flightEvents(80),
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

  // Claves que identifican a la cuenta o a la sesion. El paquete de soporte
  // conserva lo tecnico (WPM, contadores, vuelo) y tapa lo personal.
  const SUPPORT_REDACT_KEY = /^(?:username|userName|userID|userId|user_id|email|player_token|access_token|refresh_token|id_token|authorization|cookie|password|secret|token)$/i;

  function scrubSupport(value, key = '') {
    if (SUPPORT_REDACT_KEY.test(key)) return '[redacted]';
    if (Array.isArray(value)) return value.map((item) => scrubSupport(item));
    if (value && typeof value === 'object') {
      const out = {};
      for (const [name, item] of Object.entries(value)) out[name] = scrubSupport(item, name);
      return out;
    }
    if (typeof value === 'string') return scrubSecrets(value);
    return value;
  }

  function supportBundle() {
    return {
      schema: 'nitro-wraith-support/2',
      generatedAt: new Date().toISOString(),
      redacted: true,
      diagnostic: scrubSupport(diagnosticReport()),
    };
  }

  function exportSupportBundle() {
    const text = JSON.stringify(supportBundle(), null, 1);
    const box = panel.refs && panel.refs.cfgText;

    if (box) {
      box.value = text;
      try { box.select(); } catch { /* seleccion no disponible */ }
    }

    const manual = () => setConfigNote(`Support bundle is in the box (${text.length} chars); copy it by hand.`);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => setConfigNote(`Support bundle copied (${text.length} chars, redacted).`))
          .catch(manual);
      } else {
        manual();
      }
    } catch {
      manual();
    }

    log(`Support bundle ready: v${VERSION}, ${session.races} races, ${flightRing.length} flight events, redacted.`);
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

  function resetPanelPosition() {
    if (!panel.host) return false;
    disk.remove(KEYS.panelPosition);
    panel.host.style.left = '16px';
    panel.host.style.top = 'auto';
    panel.host.style.bottom = '16px';
    return true;
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

    // El arrastre no puede depender del raton: con el foco en la cabecera, las
    // flechas mueven el panel y Home lo devuelve a su esquina. Es la misma
    // posicion que se guarda al soltar el puntero.
    handle.tabIndex = 0;
    handle.setAttribute('role', 'group');
    handle.setAttribute(
      'aria-label',
      'Panel position. Arrow keys move it; hold Shift for bigger steps; Home restores the corner.',
    );
    handle.addEventListener('keydown', (event) => {
      if (event.target !== handle) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === 'Home') {
        event.preventDefault();
        resetPanelPosition();
        return;
      }

      const step = event.shiftKey ? 32 : 8;
      const rect = panel.host.getBoundingClientRect();
      let left = rect.left;
      let top = rect.top;
      if (event.key === 'ArrowLeft') left -= step;
      else if (event.key === 'ArrowRight') left += step;
      else if (event.key === 'ArrowUp') top -= step;
      else if (event.key === 'ArrowDown') top += step;
      else return;

      event.preventDefault();
      placeHost(left, top);
      savePosition();
    });
    handle.addEventListener('dblclick', (event) => {
      if (event.target.closest && event.target.closest('button')) return;
      resetPanelPosition();
    });

    if (!panelResizeBound) {
      panelResizeBound = true;
      window.addEventListener('resize', () => {
        const left = parseFloat(panel.host && panel.host.style.left);
        const top = parseFloat(panel.host && panel.host.style.top);
        if (Number.isFinite(left) && Number.isFinite(top)) placeHost(left, top);
      });
    }
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
      // later() devuelve un asa negativa cuando usa el reloj Worker; clearTimeout
      // sobre ella no cancelaba el timer del Worker y la pausa podia reanudarse
      // sola mas tarde. clearLater entiende las dos formas.
      clearLater(pauseGuard);
      pauseGuard = null;
    }
  }

  function setPaused(paused) {
    if (session.paused === paused) return;
    session.paused = paused;

    // Pausar DENTRO de una carrera es una descalificacion segura: si dejas de
    // mandar teclas ~12 s, el servidor te expulsa. La pausa se corta sola.
    // `session.typing` sigue a false durante la cuenta atras, pero la carrera
    // ya esta viva: se usa raceIsLive() para no quedarse sin guardia justo en
    // el tramo en el que el servidor ya cronometra.
    if (paused) {
      if (!session.stopped && raceIsLive()) {
        clearPauseGuard();
        session.pauseEndsAt = Date.now() + CONFIG.dqGuardMs;
        pauseGuard = later(() => {
          pauseGuard = null;
          if (!session.paused || !raceIsLive()) return;
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
      const title = session.stopped && terminalBanActive()
        ? 'Account banned: clear the stop in the garage before racing again'
        : session.stopped
          ? 'Resume now · Alt+A (daily budget and active hours still apply)'
          : 'Stop after the current race · Alt+S';
      if (panel.refs.stop.title !== title) panel.refs.stop.title = title;
      if (panel.refs.stop.disabled !== false) panel.refs.stop.disabled = false;
    }
  }

  // En espera no hay una carrera que seguir: 2 s bastan para el reloj y el
  // estado. Durante el tecleo se vuelve a 1 s para que el panel no pierda
  // ningun cambio visible de la carrera. La lectura viva (WPM, precision,
  // reloj y progreso) va aparte a 4 Hz: estos dos segundos son para las
  // tarjetas completas, no para el marcador.
  function panelPaintEveryMs() {
    return session.typing ? 1000 : 2000;
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
      // Nodo, no innerHTML: el historial es dato de localStorage y no debe
      // tener un parser de HTML en el camino.
      const empty = document.createElement('div');
      empty.className = 'hist-empty';
      empty.textContent = 'no races yet';
      box.replaceChildren(empty);

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
    const frag = document.createDocumentFragment();
    for (const item of raceHistory.slice().reverse()) {
      // Desvio frente al objetivo de esa carrera. Verde si cae dentro de +-2%,
      // que es donde el autocalibrado deberia mantenerlo.
      const dev = Number.isFinite(item.target) && item.target > 0
        ? ((item.wpm - item.target) / item.target) * 100
        : null;

      const row = document.createElement('div');
      row.className = 'hist-row';

      const time = document.createElement('span');
      time.textContent = clockText(item.at) || '—';
      row.appendChild(time);

      const place = Number(item.place);
      const placeEl = document.createElement('b');
      placeEl.className = 'place';
      placeEl.textContent = Number.isFinite(place) && place > 0 ? '#' + place : '—';
      if (Number.isFinite(place) && place >= 1 && place <= 3) {
        placeEl.dataset.medal = String(place);
      }
      row.appendChild(placeEl);

      const xp = Number(item.xp);
      const xpEl = document.createElement('b');
      xpEl.className = 'xp';
      xpEl.textContent = Number.isFinite(xp) && xp > 0 ? '+' + Math.round(xp) : '—';
      row.appendChild(xpEl);

      // WPM oficial del paquete de meta (reloj del servidor). Se pinta junto
      // al del modelo solo cuando el update lo trajo: si no, la fila queda
      // como siempre en vez de mostrar un cero o una raya.
      const wpm = document.createElement('b');
      wpm.className = 'wpm';
      const nitroChars = Number(item.nitroChars);
      const nitroWords = Number(item.nitroWords);
      if (nitroChars > 0) {
        const tag = document.createElement('i');
        tag.className = 'nitro-tag';
        tag.setAttribute('aria-label', 'nitro');
        tag.textContent = 'N';
        wpm.appendChild(tag);
      }
      wpm.appendChild(document.createTextNode(item.wpm.toFixed(1)));
      const model = Number(item.modelWpm);
      if (Number.isFinite(model) && model > 0) {
        const modelEl = document.createElement('span');
        modelEl.className = 'model';
        modelEl.textContent = 'model ' + model.toFixed(1);
        wpm.appendChild(modelEl);
      }
      row.appendChild(wpm);

      const devEl = document.createElement('b');
      devEl.className = 'dev';
      if (dev !== null) {
        devEl.dataset.good = Math.abs(dev) <= 2 ? '1' : '0';
        devEl.textContent = (dev >= 0 ? '+' : '-') + Math.abs(dev).toFixed(1) + '%';
      }
      row.appendChild(devEl);

      const cash = Number(item.cash);
      const server = Number(item.serverWpm);
      const title = [
        clockText(item.at) || '—',
        Number.isFinite(place) && place > 0 ? '#' + place : null,
        Number.isFinite(xp) && xp > 0 ? '+' + Math.round(xp) + ' xp' : null,
        Number.isFinite(cash) && cash > 0 ? '+$' + Math.round(cash).toLocaleString('en-US') : null,
        Number(item.acc).toFixed(1) + '% acc',
        'model ' + (Number.isFinite(model) && model > 0 ? model : item.wpm).toFixed(1) + ' wpm',
        Number.isFinite(server) && server > 0 ? 'server ' + server.toFixed(1) + ' wpm (packet clock)' : null,
        nitroChars > 0 ? 'nitro ' + (nitroWords || 1) + ' word · ' + nitroChars + ' ch' : null,
        Number.isFinite(item.target) ? 'target ' + item.target + ' wpm' : null,
      ].filter(Boolean).join(' · ');
      row.title = title;
      frag.appendChild(row);
    }
    box.replaceChildren(frag);

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

