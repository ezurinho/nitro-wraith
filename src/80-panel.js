
  /* ==========================================================================
   * 12. FLOATING PANEL
   * ========================================================================== */
  const PANEL_ID = 'nt-autotyper-panel';
  const panel = {
    root: null, refs: null, host: null, historySig: '', logSig: '', noticeSig: '',
    weekSig: '', chSig: '', seasonSig: '', seasonBaseSig: '',
    calSig: '', accSig: null, updateHealthAt: 0, mountedViews: new Set(['stats']),
  };

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
  // los tres contadores que usa paceCapWait. El reloj es opcional para que el
  // harness pueda recorrer una carrera entera sin esperar en tiempo real.
  window.__ntaDebug.paceCapWaitFor = (startedAt, chars, nitroChars = 0, now = Date.now()) => {
    const previous = {
      startedAt: session.startedAt,
      chars: session.chars,
      nitroChars: session.nitroChars,
    };
    session.startedAt = Number(startedAt) || 0;
    session.chars = Number(chars) || 0;
    session.nitroChars = Number(nitroChars) || 0;
    const wait = paceCapWait(Number(now) || Date.now());
    Object.assign(session, previous);
    return wait;
  };
  // El nucleo puro, sin efectos: devuelve la retencion y la deuda sin recortar.
  window.__ntaDebug.paceGovernorFor = (startedAt, typed, now) =>
    paceGovernorAt(Number(startedAt) || 0, Number(typed) || 0, Number(now) || Date.now());
  // Constantes del techo, para que el harness no repita los numeros magicos.
  window.__ntaDebug.wpmCeiling = () => ({
    cap: CONFIG.wpm.hardCap,
    dqGuardMs: CONFIG.dqGuardMs,
    maxHold: paceGovernorAt(1, 1, 1).maxHold,
    msPerChar: 60000 / ((CONFIG.wpm.hardCap - 1) * 5),
  });
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
  // La eleccion de copia, sobre un registro de mentira: el harness comprueba
  // que con seis copias el turno no cambia solo cuando el registro se recorta.
  window.__ntaDebug.electInstance = (key, id, since, staleMs) => electInstance(key, id, since, staleMs);
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
      version: VERSION,
      channel: CHANNEL,
      at: new Date().toISOString(),
      page: location.pathname,
      mode: MODE,
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
        // Deuda que el recorte NO cubre: si supera capHoldMs el gobernador ya no
        // pudo sujetar el techo. Cero en una carrera normal.
        capDebtMs: Math.round(Math.max(0, (session.capDebt || 0) - (session.capMaxWait || 0))),
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
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID) || !document.body) return;

    // Un panel nuevo trae nodos nuevos: las firmas del anterior ya no valen.
    panel.calSig = '';
    panel.accSig = null;
    panel.updateHealthAt = 0;

    registerThemeProperties();

    const host = document.createElement('div');
    host.id = PANEL_ID;
    host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483000;';

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="panel" role="region" aria-label="Nitro Wraith control panel" data-state="waiting" data-mode="auto" data-pace="legit" data-cfg="0" data-collapsed="false" data-tab="stats" data-fresh="1" data-theme="carbon">
        <div class="head">
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
                <div class="hero">
                  <div class="stat"><b data-field="live">—</b><span>live wpm</span></div>
                  <i class="sep"></i>
                  <div class="stat"><b data-field="acc">—</b><span>accuracy</span></div>
                </div>
                <div class="auto-pace" data-field="paceSource">auto · reading account</div>
                <div class="prog"><i data-field="progfill"></i></div>
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
              <div class="tune-sec" role="group" aria-labelledby="tune-health-label">
                <div class="tune-sec-h"><span id="tune-health-label">Health</span><b>account · AFK · update</b></div>
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
              <div class="tune-sec" role="group" aria-labelledby="tune-rhythm-label">
                <div class="tune-sec-h"><span id="tune-rhythm-label">Rhythm</span><b>pace and calibration</b></div>
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
              <div class="tune-sec" role="group" aria-labelledby="tune-limits-label">
                <div class="tune-sec-h"><span id="tune-limits-label">Limits</span><b>session, day and hours</b></div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h16M4 16h16"/><circle cx="9" cy="8" r="2"/><circle cx="15" cy="16" r="2"/></svg></span>
                  <div class="card-h"><span class="card-t">Session limit</span><span class="card-s">the bot stops on its own</span></div>
                  <div class="limit-row row" data-field="raceLimitRow" title="Click: races per session (free, 25, 50, 100). 25 is where the session bonus reaches its 250 XP per race cap">
                    <span>races</span><b data-field="limit">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="3" step="1" value="0" data-field="limitSlider" aria-label="Races per session" title="Races per session: free, 25, 50 or 100">
                  <div class="sld-ends"><span>free</span><span>25</span><span>50</span><span>100</span></div>
                  <div class="limit-row row time-row" data-field="timeLimitRow" title="Click: minutes per session (free, 15, 30, 60, 120). The clock starts with the first race of the session">
                    <span>time</span><b data-field="timeLimit">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="4" step="1" value="0" data-field="timeSlider" aria-label="Minutes per session" title="Minutes per session: free, 15, 30, 60 or 120">
                  <div class="sld-ends"><span>free</span><span>15m</span><span>30m</span><span>1h</span><span>2h</span></div>
                  <div class="limit-row row xp-row" data-field="xpLimitRow" title="Click: XP per session (free, 5k, 10k, 25k, 50k). Counts the XP the game itself awards in each race">
                    <span>xp</span><b data-field="xpLimit">free</b>
                  </div>
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
                  <div class="limit-row row" data-field="dailyRaceRow" title="Click: races per day (free, 100, 200, 300). Counts the races the game recorded today">
                    <span>races/day</span><b data-field="dailyRaces">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="3" step="1" value="0" data-field="dailyRaceSlider" aria-label="Races per day" title="Races per day: free, 100, 200 or 300">
                  <div class="sld-ends"><span>free</span><span>100</span><span>200</span><span>300</span></div>
                  <div class="limit-row row xp-row" data-field="dailyXpRow" title="Click: XP per day (free, 50k, 100k, 200k). Counts the XP the game paid today">
                    <span>xp/day</span><b data-field="dailyXp">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="3" step="1" value="0" data-field="dailyXpSlider" aria-label="XP per day" title="XP per day: free, 50k, 100k or 200k">
                  <div class="sld-ends"><span>free</span><span>50k</span><span>100k</span><span>200k</span></div>
                  <div class="rows">
                    <div class="row" data-field="dailyLeftRow" title="Budget left today; both counters reset at midnight"><span>left</span><b data-field="dailyLeft">—</b></div>
                  </div>
                </div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg></span>
                  <div class="card-h"><span class="card-t">Active hours</span><span class="card-s">races only in this window</span></div>
                  <div class="limit-row row" data-field="activeRow" title="Click: turn the active window on/off. Shift+click resets 08:00–23:00">
                    <span>window</span><b data-field="activeState">off</b>
                  </div>
                  <div class="limit-row row" data-field="activeStartRow" title="Click: start hour +1 (Shift+click: −1). The window can cross midnight">
                    <span>from</span><b data-field="activeStart">08:00</b>
                  </div>
                  <input class="sld" type="range" min="0" max="23" step="1" value="8" data-field="activeStartSlider" aria-label="Active window start hour" title="Start of the active window">
                  <div class="sld-ends"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
                  <div class="limit-row row" data-field="activeEndRow" title="Click: end hour +1 (Shift+click: −1). An end before the start crosses midnight">
                    <span>to</span><b data-field="activeEnd">23:00</b>
                  </div>
                  <input class="sld" type="range" min="0" max="23" step="1" value="23" data-field="activeEndSlider" aria-label="Active window end hour" title="End of the active window">
                  <div class="sld-ends"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
                  <div class="rows">
                    <div class="row" data-field="activeNowRow" title="Local time. Races only start while the window is open"><span>now</span><b data-field="activeNow">always</b></div>
                  </div>
                </div>
              </div>
              <div class="tune-sec" role="group" aria-labelledby="tune-automation-label">
                <div class="tune-sec-h"><span id="tune-automation-label">Automation</span><b>behavior, panel and tools</b></div>
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
            </section>
            </template>

            <!-- ------------------------------ LOG --------------------------- -->
            <template data-view="log">
            <section class="view v-log" id="nt-view-log" role="tabpanel" aria-label="Log">
              <div class="view-head"><span>Log</span><b>sessions · challenges</b></div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/></svg></span>
                <div class="card-h"><span class="card-t" data-field="prevLabel">prev</span><span class="card-s">click for the table</span></div>
                <div class="prev-row row" style="display:none" title="The last session that closed: races, average WPM and deviation from target">
                  <span>session</span><b data-field="prev">—</b>
                </div>
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

    // Las vistas inactivas viven en <template>: sus nodos se parsean, pero no
    // entran en el arbol del documento ni en el layout. `pick` las encuentra
    // para que el codigo que ya las pinta siga funcionando, y `hydrateView`
    // las mueve a su sitio la primera vez que se abre la pestana.
    const templates = [...shadow.querySelectorAll('template[data-view]')];
    const pick = (selector) => {
      const found = shadow.querySelector(selector);
      if (found) return found;
      for (const template of templates) {
        const node = template.content.querySelector(selector);
        if (node) return node;
      }
      return null;
    };

    document.body.appendChild(host);
    perfCounters.panelNodes = shadow.querySelectorAll('*').length;
    panel.host = host;
    panel.mountedViews = new Set(['stats']);

    panel.root = pick('.panel');
    panel.refs = {
      mode: pick('.mode'),
      pace: pick('.pace'),
      cap: pick('[data-field="cap"]'),
      hudRow: pick('.hud-row'),
      hud: pick('[data-field="hud"]'),
      clockRow: pick('.clock-row'),
      clock: pick('[data-field="clock"]'),
      resultRow: pick('.result-row'),
      result: pick('[data-field="result"]'),
      guardRow: pick('.guard-row'),
      guard: pick('[data-field="guard"]'),
      watchRow: pick('.watch-row'),
      watch: pick('[data-field="watch"]'),
      todayRow: pick('[data-field="todayRow"]'),
      today: pick('[data-field="today"]'),
      boxRow: pick('.box-row'),
      box: pick('[data-field="box"]'),
      target: pick('[data-field="target"]'),
      live: pick('[data-field="live"]'),
      acc: pick('[data-field="acc"]'),
      paceSource: pick('[data-field="paceSource"]'),
      session: pick('[data-field="session"]'),
      sessionRow: pick('.session-row'),
      sessionLeft: pick('[data-field="sessionLeft"]'),
      breakLeft: pick('[data-field="break"]'),
      dqRow: pick('.dq-row'),
      dq: pick('[data-field="dq"]'),
      status: pick('[data-field="status"]'),
      trimRow: pick('.trim-row'),
      trim: pick('[data-field="trim"]'),
      history: pick('[data-field="history"]'),
      progress: pick('[data-field="progress"]'),
      progFill: pick('[data-field="progfill"]'),
      races: pick('[data-field="races"]'),
      dayXp: pick('[data-field="dayXp"]'),
      rate: pick('[data-field="rate"]'),
      nitro: pick('[data-field="nitro"]'),
      nitroDelta: pick('[data-field="nitroDelta"]'),
      cycle: pick('[data-field="cycle"]'),
      xpBreak: pick('[data-field="xpBreak"]'),
      tanda: pick('[data-field="tanda"]'),
      raceLimitRow: pick('[data-field="raceLimitRow"]'),
      limit: pick('[data-field="limit"]'),
      prevRow: pick('.prev-row'),
      prevLabel: pick('[data-field="prevLabel"]'),
      prev: pick('[data-field="prev"]'),
      // --- rediseno v7: rail, cabecera, ajustes y barra de estado ---
      title: pick('[data-field="title"]'),
      ver: pick('[data-field="ver"]'),
      update: pick('.ghlink'),
      rail: pick('.rail'),
      views: pick('.views'),
      liveTag: pick('[data-field="liveTag"]'),
      liveAge: pick('[data-field="liveAge"]'),
      liveNow: pick('[data-field="liveNow"]'),
      liveNowAcc: pick('[data-field="liveNowAcc"]'),
      footState: pick('[data-field="footState"]'),
      footMode: pick('[data-field="footMode"]'),
      footWpm: pick('[data-field="footWpm"]'),
      footAcc: pick('[data-field="footAcc"]'),
      footClock: pick('[data-field="footClock"]'),
      footCap: pick('[data-field="footCap"]'),
      footHint: pick('[data-field="footHint"]'),
      seg: pick('.seg'),
      themes: pick('[data-field="themes"]'),
      themeName: pick('[data-field="themeName"]'),
      tuneCap: pick('[data-field="tuneCap"]'),
      tuneRange: pick('[data-field="tuneRange"]'),
      healthSummary: pick('[data-field="healthSummary"]'),
      healthAccount: pick('[data-field="healthAccount"]'),
      healthAfk: pick('[data-field="healthAfk"]'),
      healthUpdate: pick('[data-field="healthUpdate"]'),
      healthFreeze: pick('[data-field="healthFreeze"]'),
      healthNote: pick('[data-field="healthNote"]'),
      tuneSearch: pick('[data-field="tuneSearch"]'),
      tuneClear: pick('[data-field="tuneClear"]'),
      tuneCount: pick('[data-field="tuneCount"]'),
      tuneEmpty: pick('[data-field="tuneEmpty"]'),
      limitSlider: pick('[data-field="limitSlider"]'),
      etaLeft: pick('[data-field="etaLeft"]'),
      timeLimitRow: pick('[data-field="timeLimitRow"]'),
      timeLimit: pick('[data-field="timeLimit"]'),
      timeSlider: pick('[data-field="timeSlider"]'),
      timeLeftRow: pick('[data-field="timeLeftRow"]'),
      timeLeft: pick('[data-field="timeLeft"]'),
      xpLimitRow: pick('[data-field="xpLimitRow"]'),
      xpLimit: pick('[data-field="xpLimit"]'),
      xpSlider: pick('[data-field="xpSlider"]'),
      xpRow: pick('[data-field="xpRow"]'),
      xpTotal: pick('[data-field="xpTotal"]'),
      dailyRaceRow: pick('[data-field="dailyRaceRow"]'),
      dailyRaces: pick('[data-field="dailyRaces"]'),
      dailyRaceSlider: pick('[data-field="dailyRaceSlider"]'),
      dailyXpRow: pick('[data-field="dailyXpRow"]'),
      dailyXp: pick('[data-field="dailyXp"]'),
      dailyXpSlider: pick('[data-field="dailyXpSlider"]'),
      dailyLeft: pick('[data-field="dailyLeft"]'),
      activeRow: pick('[data-field="activeRow"]'),
      activeState: pick('[data-field="activeState"]'),
      activeStartRow: pick('[data-field="activeStartRow"]'),
      activeStart: pick('[data-field="activeStart"]'),
      activeStartSlider: pick('[data-field="activeStartSlider"]'),
      activeEndRow: pick('[data-field="activeEndRow"]'),
      activeEnd: pick('[data-field="activeEnd"]'),
      activeEndSlider: pick('[data-field="activeEndSlider"]'),
      activeNow: pick('[data-field="activeNow"]'),
      calRow: pick('[data-field="calRow"]'),
      cal: pick('[data-field="cal"]'),
      calWpm: pick('[data-field="calWpm"]'),
      calAcc: pick('[data-field="calAcc"]'),
      calAccount: pick('[data-field="calAccount"]'),
      acctId: pick('[data-field="acctId"]'),
      acctState: pick('[data-field="acctState"]'),
      acctAvg: pick('[data-field="acctAvg"]'),
      acctTarget: pick('[data-field="acctTarget"]'),
      acctTop: pick('[data-field="acctTop"]'),
      acctHistory: pick('[data-field="acctHistory"]'),
      acctRange: pick('[data-field="acctRange"]'),
      acctRead: pick('[data-field="acctRead"]'),
      acctRefresh: pick('[data-field="acctRefresh"]'),
      customWpm: pick('[data-field="customWpm"]'),
      customAcc: pick('[data-field="customAcc"]'),
      calDelta: pick('[data-field="calDelta"]'),
      accSpark: pick('[data-field="accSpark"]'),
      accSparkLine: pick('[data-field="accSparkLine"]'),
      accSparkArea: pick('[data-field="accSparkArea"]'),
      liveCount: pick('[data-field="liveCount"]'),
      liveLoad: pick('[data-field="liveLoad"]'),
      liveFile: pick('[data-field="liveFile"]'),
      liveList: pick('[data-field="liveList"]'),
      liveClear: pick('[data-field="liveClear"]'),
      liveDriftRow: pick('[data-field="liveDriftRow"]'),
      liveDrift: pick('[data-field="liveDrift"]'),
      liveCompareRow: pick('[data-field="liveCompareRow"]'),
      liveCompare: pick('[data-field="liveCompare"]'),
      livePickRow: pick('[data-field="livePickRow"]'),
      livePickA: pick('[data-field="livePickA"]'),
      livePickB: pick('[data-field="livePickB"]'),
      livePickResult: pick('[data-field="livePickResult"]'),
      livePickExport: pick('[data-field="livePickExport"]'),
      liveStreakRow: pick('[data-field="liveStreakRow"]'),
      liveStreak: pick('[data-field="liveStreak"]'),
      liveSpreadRow: pick('[data-field="liveSpreadRow"]'),
      liveSpread: pick('[data-field="liveSpread"]'),
      chCount: pick('[data-field="chCount"]'),
      chList: pick('[data-field="chList"]'),
      calLogWhen: pick('[data-field="calLogWhen"]'),
      calLogWpm: pick('[data-field="calLogWpm"]'),
      calLogAcc: pick('[data-field="calLogAcc"]'),
      chRow: pick('[data-field="chRow"]'),
      ch: pick('[data-field="ch"]'),
      weekList: pick('[data-field="weekList"]'),
      weekTotal: pick('[data-field="weekTotal"]'),
      closedList: pick('[data-field="closedList"]'),
      logCount: pick('[data-field="logCount"]'),
      noticeList: pick('[data-field="noticeList"]'),
      aboutVer: pick('[data-field="aboutVer"]'),
      infoCap: pick('[data-field="infoCap"]'),
      gear: pick('.gear'),
      cfg: pick('.cfg'),
      cfgText: pick('[data-field="cfgText"]'),
      cfgNote: pick('[data-field="cfgNote"]'),
      up: pick('[data-field="up"]'),
      upInfo: pick('[data-field="upInfo"]'),
      updateCheck: pick('[data-act="updateCheck"]'),
      afkFreezeReset: pick('[data-act="afkFreezeReset"]'),
      nitroStrategy: pick('[data-field="nitroStrategy"]'),
      nitroPreview: pick('[data-field="nitroPreview"]'),
      foot: pick('[data-field="foot"]'),
      avg: pick('[data-field="avg"]'),
      best: pick('[data-field="best"]'),
      toggle: pick('.toggle'),
      stop: pick('.stop'),
      collapse: pick('.collapse'),
      seasonCard: pick('[data-field="seasonCard"]'),
      seasonTag: pick('[data-field="seasonTag"]'),
      seasonName: pick('[data-field="seasonName"]'),
      seasonFill: pick('[data-field="seasonFill"]'),
      seasonTier: pick('[data-field="seasonTier"]'),
      seasonXp: pick('[data-field="seasonXp"]'),
      seasonNext: pick('[data-field="seasonNext"]'),
      seasonRaces: pick('[data-field="seasonRaces"]'),
      seasonPace: pick('[data-field="seasonPace"]'),
      seasonEnds: pick('[data-field="seasonEnds"]'),
      seasonAlert: pick('[data-field="seasonAlert"]'),
      seasonNote: pick('[data-field="seasonNote"]'),
      seasonOpen: pick('[data-field="seasonOpen"]'),
    };

    // El ultimo aviso importante se pinta aqui desde ya: si el panel se crea
    // despues de una DQ, la razon no se pierde.
    statusEl = panel.refs.status;
    if (statusEl) setText(statusEl, lastStatus || 'waiting…');

    panel.refs.toggle.title = 'Pause or resume sending keys (inside a race the pause resumes by itself after 6 s)';
    // El chip del ritmo sigue siendo LEGIT (no hay otro tipo de ritmo) y ahora
    // cicla el perfil: soft, normal, fast, todos con la misma cadencia humana.
    paintPace();
    paintTheme();

    // Cabecera: version. No cambia en caliente, se pinta una vez.
    const versionLabel = `v${VERSION}${CHANNEL === 'canary' ? ' · canary' : ''}`;
    setText(panel.refs.ver, versionLabel);
    setText(panel.refs.aboutVer, versionLabel);
    if (!panel.mountedViews || panel.mountedViews.has('log')) {
      paintLogLists();
      paintChallengeList();
    } else {
      readChallengeProgress();
    }
    if (panel.refs.cap) {
      const cap = CONFIG.wpm.hardCap;
      setText(panel.refs.cap, Number.isFinite(cap) ? `≤ ${cap} wpm` : 'no cap');
    }

    if (panel.refs.raceLimitRow) {
      panel.refs.raceLimitRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = LIMIT_STEPS.find((value) => value > session.raceLimit);
        setRaceLimit(next === undefined ? 0 : next);
      });
    }

    // La fila del tope por tiempo cicla igual que la de carreras, con sus
    // propios escalones: libre, 15 min, 30 min, 1 h, 2 h.
    if (panel.refs.timeLimitRow) {
      panel.refs.timeLimitRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = TIME_LIMIT_STEPS.find((value) => value > session.timeLimit);
        setTimeLimit(next === undefined ? 0 : next);
      });
    }

    // Y el tercero, en XP: mismos escalones que se pintan en sld-ends.
    if (panel.refs.xpLimitRow) {
      panel.refs.xpLimitRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = XP_LIMIT_STEPS.find((value) => value > session.xpLimit);
        setXpLimit(next === undefined ? 0 : next);
      });
    }

    // La tarjeta Season no adivina: abre la pagina oficial y deja que su propia
    // pestana escriba la foto que este panel leera al volver.
    if (panel.refs.afkFreezeReset) {
      panel.refs.afkFreezeReset.addEventListener('click', (event) => {
        event.stopPropagation();
        resetAfkFreezeStats();
        log('AFK freeze history cleared for this browser.');
        paintConfig();
        if (typeof paintGaragePanel === 'function') paintGaragePanel();
      });
    }

    if (panel.refs.updateCheck) {
      panel.refs.updateCheck.addEventListener('click', async (event) => {
        event.stopPropagation();
        const button = panel.refs.updateCheck;
        if (button.disabled) return;
        button.disabled = true;
        setText(button, 'checking…');
        const ok = await checkForUpdate(true);
        setText(button, ok ? 'check now' : 'retry');
        paintUpdateHealth(true);
        setTimeout(() => {
          if (!button.isConnected) return;
          setText(button, 'check now');
          button.disabled = false;
        }, 1400);
      });
    }

    if (panel.refs.seasonOpen) {
      panel.refs.seasonOpen.addEventListener('click', (event) => {
        event.stopPropagation();
        try {
          window.open('https://www.nitrotype.com/season', '_blank', 'noopener');
          setText(panel.refs.seasonNote, 'Season opened. This card refreshes when that tab finishes loading.');
        } catch {
          location.href = '/season';
        }
      });
    }

    // La fila de la ultima tanda cerrada abre la misma tabla que Alt+H: el
    // detalle de cada sesion, sin tener que recordar el atajo.
    if (panel.refs.prevRow) {
      panel.refs.prevRow.addEventListener('click', (event) => {
        event.stopPropagation();
        showTandaLog();
      });
    }

    // Rail: cada icono abre su vista. El cuadrado verde que viaja lo mueve el
    // data-index del contenedor, con muelle, desde el CSS.
    if (panel.refs.rail) {
      panel.refs.rail.addEventListener('click', (event) => {
        const btn = event.target && event.target.closest ? event.target.closest('[data-tab-btn]') : null;
        if (!btn) return;
        event.stopPropagation();
        showTab(btn.dataset.tabBtn);
        btn.blur();
      });

      // Patron tablist: flechas, Home y End mueven la vista y el foco. No toca
      // el teclado del juego porque solo se activa con el foco dentro del rail.
      panel.refs.rail.addEventListener('keydown', (event) => {
        const btn = event.target && event.target.closest ? event.target.closest('[data-tab-btn]') : null;
        if (!btn) return;
        const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        const buttons = Array.from(panel.refs.rail.querySelectorAll('[data-tab-btn]'));
        const current = buttons.indexOf(btn);
        if (current < 0) return;
        let next = current;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (current + 1) % buttons.length;
        else next = (current - 1 + buttons.length) % buttons.length;
        event.preventDefault();
        event.stopPropagation();
        showTab(buttons[next].dataset.tabBtn);
        buttons[next].focus();
      });
    }

    // Tope de tanda con deslizador: los mismos escalones que el clic en la fila
    // (libre, 10, 20, 50, 100). El relleno verde lo pinta paintLimitSlider.
    if (panel.refs.limitSlider) {
      panel.refs.limitSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.limitSlider.value, 10) || 0, 0, LIMIT_STEPS.length - 1);
        setRaceLimit(LIMIT_STEPS[index]);
      });
      paintLimitSlider();
    }

    // Mismo deslizador, otro reloj: el relleno verde lo pinta paintTimeSlider.
    if (panel.refs.timeSlider) {
      panel.refs.timeSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.timeSlider.value, 10) || 0, 0, TIME_LIMIT_STEPS.length - 1);
        setTimeLimit(TIME_LIMIT_STEPS[index]);
      });
      paintTimeSlider();
    }

    if (panel.refs.xpSlider) {
      panel.refs.xpSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.xpSlider.value, 10) || 0, 0, XP_LIMIT_STEPS.length - 1);
        setXpLimit(XP_LIMIT_STEPS[index]);
      });
      paintXpSlider();
    }

    // Presupuesto diario: mismos dos controles (fila + deslizador) que los
    // topes de tanda, pero guardados en sus propias claves.
    if (panel.refs.dailyRaceRow) {
      panel.refs.dailyRaceRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = DAILY_RACE_STEPS.find((value) => value > session.dailyRaceLimit);
        setDailyRaceLimit(next === undefined ? 0 : next);
      });
    }
    if (panel.refs.dailyRaceSlider) {
      panel.refs.dailyRaceSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.dailyRaceSlider.value, 10) || 0, 0, DAILY_RACE_STEPS.length - 1);
        setDailyRaceLimit(DAILY_RACE_STEPS[index]);
      });
      paintDailyRaceSlider();
    }
    if (panel.refs.dailyXpRow) {
      panel.refs.dailyXpRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = DAILY_XP_STEPS.find((value) => value > session.dailyXpLimit);
        setDailyXpLimit(next === undefined ? 0 : next);
      });
    }
    if (panel.refs.dailyXpSlider) {
      panel.refs.dailyXpSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.dailyXpSlider.value, 10) || 0, 0, DAILY_XP_STEPS.length - 1);
        setDailyXpLimit(DAILY_XP_STEPS[index]);
      });
      paintDailyXpSlider();
    }

    // Horas activas: la fila enciende/apaga y los dos deslizadores eligen la
    // hora exacta. Shift en las filas mueve al reves (o resetea el rango).
    if (panel.refs.activeRow) {
      panel.refs.activeRow.addEventListener('click', (event) => {
        event.stopPropagation();
        if (event.shiftKey) {
          setActiveHour('start', 8, true);
          setActiveHour('end', 23, true);
          setActiveOn(true);
          return;
        }
        setActiveOn(!session.activeOn);
      });
    }
    if (panel.refs.activeStartRow) {
      panel.refs.activeStartRow.addEventListener('click', (event) => {
        event.stopPropagation();
        setActiveHour('start', (session.activeStart + (event.shiftKey ? 23 : 1)) % 24);
      });
    }
    if (panel.refs.activeEndRow) {
      panel.refs.activeEndRow.addEventListener('click', (event) => {
        event.stopPropagation();
        setActiveHour('end', (session.activeEnd + (event.shiftKey ? 23 : 1)) % 24);
      });
    }
    if (panel.refs.activeStartSlider) {
      panel.refs.activeStartSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        setActiveHour('start', parseInt(panel.refs.activeStartSlider.value, 10) || 0, true);
        paintActiveSlider('start');
      });
      paintActiveSlider('start');
    }
    if (panel.refs.activeEndSlider) {
      panel.refs.activeEndSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        setActiveHour('end', parseInt(panel.refs.activeEndSlider.value, 10) || 0, true);
        paintActiveSlider('end');
      });
      paintActiveSlider('end');
    }

    // Buscador de TUNE: filtra por texto de la tarjeta y por el titulo del
    // bloque. Los ajustes ocultos siguen existiendo; solo dejan de ocupar sitio.
    if (panel.refs.tuneSearch) {
      panel.refs.tuneSearch.addEventListener('input', () => filterTune());
      panel.refs.tuneSearch.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
      });
    }
    if (panel.refs.tuneClear) {
      panel.refs.tuneClear.addEventListener('click', (event) => {
        event.stopPropagation();
        if (panel.refs.tuneSearch) panel.refs.tuneSearch.value = '';
        filterTune();
        if (panel.refs.tuneSearch) panel.refs.tuneSearch.focus();
      });
    }
    filterTune();

    // Fila de auto-calibracion: no hay apagado; el clic solo fuerza una lectura
    // nueva para que el rango se mueva ya con la media mas reciente.
    if (panel.refs.calRow) {
      panel.refs.calRow.addEventListener('click', (event) => {
        event.stopPropagation();
        refreshCalibration();
      });
    }

    if (panel.refs.acctRefresh) {
      panel.refs.acctRefresh.addEventListener('click', (event) => {
        event.stopPropagation();
        refreshCalibration();
        panel.refs.acctRefresh.blur();
      });
    }

    // Overrides manuales de WPM y precision. `change` evita aplicar cada tecla
    // a medias; Enter confirma sin tener que pulsar fuera del campo.
    if (panel.refs.customWpm) {
      panel.refs.customWpm.addEventListener('change', (event) => {
        event.stopPropagation();
        setCustomWpm(panel.refs.customWpm.value);
      });
      panel.refs.customWpm.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        panel.refs.customWpm.blur();
      });
    }
    if (panel.refs.customAcc) {
      panel.refs.customAcc.addEventListener('change', (event) => {
        event.stopPropagation();
        setCustomAccuracy(panel.refs.customAcc.value);
      });
      panel.refs.customAcc.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        panel.refs.customAcc.blur();
      });
    }

    // Fila del popup de challenges: clic normal enciende/apaga; Mayus+clic pide
    // el selector CSS para cuando el barrido por texto no baste.
    if (panel.refs.chRow) {
      panel.refs.chRow.addEventListener('click', (event) => {
        event.stopPropagation();
        if (event.shiftKey) {
          const next = prompt('CSS selector for the Daily Challenge popup (empty = detect by text):', CONFIG.challenges.selector || '');
          if (next !== null) {
            CONFIG.challenges.selector = next.trim();
            disk.set(KEYS.challengeSelector, CONFIG.challenges.selector);
            log(CONFIG.challenges.selector ? `Challenge selector set: ${CONFIG.challenges.selector}` : 'Challenge selector cleared: text detection.');
            paintChallenges();
          }
          return;
        }
        CONFIG.challenges.enabled = !CONFIG.challenges.enabled;
        savePrefs();
        log(CONFIG.challenges.enabled ? 'Daily Challenge popups: auto-close on.' : 'Daily Challenge popups: auto-close off.');
        paintChallenges();
      });
    }

    // El panel es nuevo: hay que repintar el historial y la temporada aunque
    // los datos no hayan cambiado (si no, quedan vacios hasta el proximo cambio).
    panel.historySig = '';
    panel.seasonSig = '';
    panel.seasonBaseSig = '';
    seasonPaintAt = 0;

    applyCollapsed(disk.get(KEYS.panelCollapsed) === '1');
    applyFootMode();
    restorePosition();
    makeDraggable(shadow);

    panel.refs.toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setPaused(!session.paused);
      panel.refs.toggle.blur();
    });

    panel.refs.stop.addEventListener('click', (event) => {
      event.stopPropagation();
      // Parado no hay nada que parar: el mismo boton vuelve a arrancar. Hace
      // lo mismo que Alt+A, con las mismas puertas (tope diario y horas).
      if (session.stopped) resumeAuto();
      else requestStop();
      panel.refs.stop.blur();
    });

    panel.refs.collapse.addEventListener('click', (event) => {
      event.stopPropagation();
      const collapsed = panel.root.dataset.collapsed !== 'true';
      applyCollapsed(collapsed);
      restorePosition();
      if (!collapsed) updatePanel(true);
      panel.refs.collapse.blur();
    });

    // El chip del modo no es un interruptor: dice AUTO y nada mas. Parar es
    // cosa de Stop / Esc, y la cola se rearma sola.

    // El chip LEGIT cambia de perfil al pulsarlo: soft -> balanced -> fast.
    if (panel.refs.pace) {
      panel.refs.pace.addEventListener('click', (event) => {
        event.stopPropagation();
        const index = PACE_ORDER.indexOf(paceProfile);
        setPaceProfile(PACE_ORDER[(index + 1) % PACE_ORDER.length]);
        panel.refs.pace.blur();
      });
    }

    // Tema: un solo escuchador para las seis muestras. El CSS hace el resto.
    if (panel.refs.themes) {
      panel.refs.themes.addEventListener('click', (event) => {
        const chip = event.target && event.target.closest ? event.target.closest('[data-theme-btn]') : null;
        if (!chip) return;
        event.stopPropagation();
        setTheme(chip.dataset.themeBtn);
        chip.blur();
      });
    }

    // ⚙ lleva a la vista de ajustes (y vuelve): es el mismo cajon de siempre,
    // ahora como una pestaña mas del rail.
    if (panel.refs.gear) {
      panel.refs.gear.addEventListener('click', (event) => {
        event.stopPropagation();
        showTab(panel.root.dataset.tab === 'tune' ? 'stats' : 'tune');
        panel.refs.gear.blur();
      });
    }

    // Los chips del cajon: perfil, interruptores y exportar/importar. Un solo
    // escuchador para todos, que el cajon se repinta entero y no hay que
    // reenganchar nada al cambiar de perfil.
    if (panel.refs.cfg) {
      panel.refs.cfg.addEventListener('click', (event) => {
        const target = event.target;
        const chip = target && target.closest ? target.closest('button') : null;
        if (!chip) return;
        event.stopPropagation();

        if (chip.dataset.pace) {
          setPaceProfile(chip.dataset.pace);
        } else if (chip.dataset.toggle === 'useNitro') {
          setUseNitro(CONFIG.useNitro === false);
        } else if (chip.dataset.toggle === 'backgroundFarm') {
          setBackgroundFarm(CONFIG.queue.backgroundFarm !== true);
        } else if (chip.dataset.toggle === 'keepAlive') {
          setKeepAlive(CONFIG.queue.keepAlive !== true);
        } else if (chip.dataset.toggle === 'afkRequireKeepAlive') {
          setAfkRequireKeepAlive(CONFIG.queue.afkRequireKeepAlive !== true);
        } else if (chip.dataset.toggle === 'afkFreezeGuard') {
          setAfkFreezeGuard(CONFIG.queue.afkFreezeGuard === false);
        } else if (chip.dataset.toggle === 'notifications') {
          setNotifications(CONFIG.notifications.enabled !== true);
        } else if (chip.dataset.toggle === 'sound') {
          // El click ya es gesto valido para el audio: al encenderlo suena.
          setSfx(!sfxOn);
        } else if (chip.dataset.toggle && CONFIG[chip.dataset.toggle]) {
          const key = chip.dataset.toggle;
          CONFIG[key].enabled = CONFIG[key].enabled === false;
          savePrefs();
          paintConfig();
          log(`${key} ${CONFIG[key].enabled === false ? 'off' : 'on'}.`);
        } else if (chip.dataset.act === 'export') {
          exportConfig();
        } else if (chip.dataset.act === 'import') {
          importConfig();
        } else if (chip.dataset.act === 'report') {
          exportDiagnostics();
        } else if (chip.dataset.act === 'csv') {
          exportSessionsCsv();
        } else if (chip.dataset.act === 'releases') {
          try { window.open(UPDATE_RELEASES_URL, '_blank', 'noopener,noreferrer'); } catch { /* bloqueado */ }
        } else if (chip.dataset.act === 'channel') {
          // En canary el boton vuelve al Gist estable; en estable abre el build
          // de prueba. Ninguno de los dos cambia la release estable por si solo.
          const url = CHANNEL === 'canary' ? UPDATE_STABLE_URL : UPDATE_CANARY_URL;
          try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* bloqueado */ }
        }

        chip.blur();
      });
    }

    if (panel.refs.nitroStrategy) {
      panel.refs.nitroStrategy.addEventListener('change', (event) => {
        event.stopPropagation();
        setNitroStrategy(panel.refs.nitroStrategy.value);
      });
    }

    // Pasadas del banco live: el boton abre el selector y el CSV se queda
    // guardado. La tarjeta vive en LOG y no depende de la consola.
    if (panel.refs.liveLoad && panel.refs.liveFile) {
      panel.refs.liveLoad.addEventListener('click', (event) => {
        event.stopPropagation();
        panel.refs.liveFile.click();
        panel.refs.liveLoad.blur();
      });
      panel.refs.liveFile.addEventListener('change', () => {
        const file = panel.refs.liveFile.files && panel.refs.liveFile.files[0];
        if (file) loadLiveCsv(file);
        panel.refs.liveFile.value = '';
      });
    }

    if (panel.refs.liveClear) {
      panel.refs.liveClear.addEventListener('click', (event) => {
        event.stopPropagation();
        clearLivePasses();
        panel.refs.liveClear.blur();
      });
    }
    for (const select of [panel.refs.livePickA, panel.refs.livePickB]) {
      if (select) select.addEventListener('change', paintLivePick);
    }
    if (panel.refs.livePickExport) {
      panel.refs.livePickExport.addEventListener('click', (event) => {
        event.stopPropagation();
        downloadLiveCompareCsv();
        panel.refs.livePickExport.blur();
      });
    }
    renderLivePasses();

    paintConfig();
    updatePanel();
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

  /* --------------------------------------------------------------------------
   * Season tracker
   *
   * La pagina /season renderiza el tier activo en React. El estado no viaja en
   * el HTML (es un shell), asi que la foto se toma ALLI, donde el DOM ya esta
   * hidratado, y se guarda para que el panel de la carrera la lea despues. El
   * XP exacto sale de las props del componente; si React cambia de forma, el
   * parser se queda con el tier y el porcentaje visibles en vez de inventar.
   * ------------------------------------------------------------------------ */
  function seasonClean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function seasonFiberProps(node) {
    if (!node) return null;
    let fiber = null;
    try {
      const key = Object.keys(node).find((name) => name.startsWith('__reactFiber$'));
      fiber = key ? node[key] : null;
    } catch {
      return null;
    }
    for (let depth = 0; depth < 30 && fiber; depth++) {
      const props = fiber.memoizedProps;
      if (props && typeof props === 'object'
        && props.userSeasonExperience !== null && props.userSeasonExperience !== undefined
        && Number.isFinite(Number(props.userSeasonExperience))) {
        return props;
      }
      fiber = fiber.return;
    }
    return null;
  }

  function seasonDateRange(text, now = Date.now()) {
    const match = String(text || '').match(/([A-Z][a-z]{2})\s+(\d{1,2})\s*[-–]\s*([A-Z][a-z]{2})\s+(\d{1,2})/);
    if (!match) return { endsAt: null, endsText: '' };
    const year = new Date(now).getFullYear();
    const start = Date.parse(`${match[1]} ${match[2]}, ${year} 00:00:00`);
    let endsAt = Date.parse(`${match[3]} ${match[4]}, ${year} 23:59:59`);
    if (!Number.isFinite(start) || !Number.isFinite(endsAt)) return { endsAt: null, endsText: '' };
    if (endsAt < start) endsAt = Date.parse(`${match[3]} ${match[4]}, ${year + 1} 23:59:59`);
    return {
      endsAt: Number.isFinite(endsAt) ? endsAt : null,
      endsText: `${match[3]} ${match[4]}`,
    };
  }

  function parseSeasonPage(root = document) {
    const scope = root && typeof root.querySelector === 'function' ? root : document;
    const card = scope.querySelector('.seasonReward.is-selected, .seasonReward--free.is-selected');
    if (!card) return null;

    const tier = Number(seasonClean((card.querySelector('.seasonReward-tier') || {}).textContent));
    if (!Number.isFinite(tier) || tier <= 0) return null;

    const fill = card.querySelector('.prog-barFill') || card.querySelector('.prog-points');
    const rawProgress = fill ? (fill.style.width || fill.style.left || '') : '';
    const progress = Number.parseFloat(rawProgress);
    const props = seasonFiberProps(card.querySelector('.prog-points') || card) || {};

    const rawXp = props.userSeasonExperience;
    const xp = rawXp !== null && rawXp !== undefined && Number.isFinite(Number(rawXp))
      ? Math.max(0, Math.round(Number(rawXp)))
      : null;
    const rawNext = props.experience;
    const nextXp = rawNext !== null && rawNext !== undefined && Number.isFinite(Number(rawNext))
      ? Math.max(0, Math.round(Number(rawNext)))
      : null;
    const season = props.season && typeof props.season === 'object' ? props.season : {};
    const seasonID = season.seasonID !== null && season.seasonID !== undefined && Number.isFinite(Number(season.seasonID))
      ? Number(season.seasonID)
      : null;

    const nameNode = scope.querySelector('.season-header h1, .season-head h1, h1');
    const seasonName = seasonClean(nameNode && nameNode.textContent)
      || seasonClean((scope.querySelector('.seasonTeaser') || {}).textContent)
      || 'Season';
    const teaser = scope.querySelector('.seasonTeaser');
    const dates = seasonDateRange(teaser && teaser.textContent);

    const boot = seasonBoot();
    const levels = boot.levels || SEASON_LEVELS_DEFAULT;
    const totalRewards = Math.max(1, Math.floor(Number(boot.active && boot.active.totalRewards) || 35));
    const computed = xp !== null ? seasonTierForXp(xp, levels, totalRewards) : null;
    return {
      v: 2,
      at: Date.now(),
      auto: false,
      source: 'page',
      seasonID,
      seasonName,
      // El premio seleccionado es el SIGUIENTE, no el tier actual: con 76.701
      // XP la pagina marca T7 a 90.000 y el nivel actual es T6 (70.000).
      tier: computed ? computed.tier : Math.max(1, tier - 1),
      nextTier: computed ? computed.nextTier : tier,
      progress: computed
        ? Math.round(computed.progress)
        : (Number.isFinite(progress)
          ? Math.max(0, Math.min(100, progress))
          : Math.max(0, Math.min(100, Number(props.progress) || 0))),
      xp,
      currentXp: computed ? computed.currentXp : null,
      nextXp: computed ? computed.nextXp : nextXp,
      levels,
      totalRewards,
      endsAt: dates.endsAt,
      endsText: dates.endsText,
    };
  }

  const SEASON_LEVELS_DEFAULT = {
    startingLevels: 3,
    experiencePerStartingLevel: 10000,
    experiencePerAchievementLevel: 20000,
    experiencePerExtraLevels: 40000,
    extraLevelReward: 100000,
  };
  let seasonUserAt = 0;

  // La config de niveles y la temporada activa ya vienen en el bootstrap de
  // cualquier pagina de Nitro Type. El marco de la carrera tambien lo tiene,
  // asi que no hace falta abrir /season para conocer los umbrales.
  function seasonBoot() {
    try {
      if (typeof window.NTBOOTSTRAP !== 'function') return {};
      const data = window.NTBOOTSTRAP();
      if (!data || typeof data !== 'object') return {};
      const list = Array.isArray(data.ACTIVE_SEASONS) ? data.ACTIVE_SEASONS : [];
      const now = Date.now() / 1000;
      const active = list.find((item) => item
        && Number(item.startStamp) <= now && Number(item.endStamp) > now) || list[0] || null;
      return {
        active,
        levels: data.SEASON_LEVELS && typeof data.SEASON_LEVELS === 'object' ? data.SEASON_LEVELS : null,
      };
    } catch {
      return {};
    }
  }

  // XP del umbral de un nivel. Con la config real: 1=0, 2=10k, 3=20k, 4=30k,
  // 5=50k, 6=70k, 7=90k... que es exactamente lo que pinta la pagina.
  function seasonLevelXp(level, levels = SEASON_LEVELS_DEFAULT) {
    const start = Math.max(1, Math.floor(Number(levels.startingLevels) || 3));
    const startCost = Math.max(0, Number(levels.experiencePerStartingLevel) || 10000);
    const achCost = Math.max(0, Number(levels.experiencePerAchievementLevel) || 20000);
    const n = Math.max(1, Math.floor(Number(level) || 1));
    if (n <= start) return (n - 1) * startCost;
    return start * startCost + (n - start - 1) * achCost;
  }

  function seasonTierForXp(xp, levels = SEASON_LEVELS_DEFAULT, totalRewards = 35) {
    const value = Math.max(0, Math.floor(Number(xp) || 0));
    const max = Math.max(1, Math.floor(Number(totalRewards) || 35));
    let tier = 1;
    while (tier < max && value >= seasonLevelXp(tier + 1, levels)) tier += 1;

    const currentXp = seasonLevelXp(tier, levels);
    const nextXp = tier < max ? seasonLevelXp(tier + 1, levels) : null;
    const span = nextXp === null ? 0 : nextXp - currentXp;
    const progress = span > 0
      ? Math.max(0, Math.min(100, ((value - currentXp) / span) * 100))
      : 100;
    return { tier, nextTier: nextXp === null ? null : tier + 1, currentXp, nextXp, progress };
  }

  function seasonEndText(stamp) {
    const value = Number(stamp);
    if (!Number.isFinite(value) || value <= 0) return '';
    try {
      return new Date(value * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  // El XP de temporada que el juego persiste en `persist:nt`. No es
  // playerExperience (de por vida): es el `experience` que el servidor usa
  // para el premio activo. Puede venir como objeto o como JSON anidado en
  // `user`.
  // `persist:nt` es el estado entero del sitio (decenas o cientos de KB). Un
  // JSON.parse cada 5 s se nota en el hilo principal y el panel solo necesita
  // saber si el XP cambio. Se cachea por el texto crudo, igual que la foto de
  // temporada: si el juego escribe otra vez, el texto cambia y se relee.
  let userCacheRaw = null;
  let userCacheXp = null;

  function parseNtUserXp(raw) {
    let root;
    try { root = JSON.parse(raw); } catch { return null; }

    const seen = new Set();
    const queue = [root];
    while (queue.length) {
      const value = queue.shift();
      if (!value) continue;
      if (typeof value === 'string') {
        if (!/^[\[{]/.test(value.trim())) continue;
        try { queue.push(JSON.parse(value)); } catch { /* no era JSON */ }
        continue;
      }
      if (typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);

      if (Number.isFinite(Number(value.experience))
        && value.experience !== null && value.experience !== '') {
        return Math.max(0, Math.round(Number(value.experience)));
      }
      for (const child of Object.values(value)) {
        if (child && typeof child === 'object') queue.push(child);
        else if (typeof child === 'string' && /^[\[{]/.test(child.trim())) queue.push(child);
      }
    }
    return null;
  }

  function seasonUserXp() {
    const raw = disk.get(KEYS.ntUser, '');
    if (raw === userCacheRaw) return userCacheXp;
    userCacheRaw = raw;
    perfCounters.userParses += raw ? 1 : 0;
    userCacheXp = raw ? parseNtUserXp(raw) : null;
    return userCacheXp;
  }

  // La tarjeta se repinta cada 500 ms y esto hacia JSON.parse en cada tick. Se
  // cachea por el texto crudo de localStorage: si la foto cambia (otra pestana,
  // seasonRefreshFromUser) el texto cambia y se vuelve a leer sola.
  let seasonCacheRaw = null;
  let seasonCacheSnap = null;

  function seasonRead() {
    try {
      const raw = disk.get(KEYS.season, '');
      if (raw === seasonCacheRaw) return seasonCacheSnap;
      seasonCacheRaw = raw;
      if (!raw) {
        seasonCacheSnap = null;
        return null;
      }
      const snap = JSON.parse(raw);
      if (!snap || typeof snap !== 'object' || !Number.isFinite(Number(snap.tier))) {
        seasonCacheSnap = null;
        return null;
      }

      // Las fotos de 7.51.0 guardaban el tier del premio seleccionado (el
      // siguiente). Se normalizan al nivel actual sin pedir otra visita, y la
      // migracion se guarda para no repetir el calculo en cada tick.
      let migrated = false;
      if (!Number.isFinite(Number(snap.nextTier)) && Number.isFinite(Number(snap.xp))) {
        const levels = snap.levels && typeof snap.levels === 'object'
          ? snap.levels : SEASON_LEVELS_DEFAULT;
        const total = Math.max(1, Math.floor(Number(snap.totalRewards) || 35));
        const computed = seasonTierForXp(snap.xp, levels, total);
        snap.tier = computed.tier;
        snap.nextTier = computed.nextTier;
        snap.progress = Math.round(computed.progress);
        snap.currentXp = computed.currentXp;
        if (computed.nextXp !== null) snap.nextXp = computed.nextXp;
        migrated = true;
      }
      if (migrated) {
        const text = JSON.stringify(snap);
        disk.set(KEYS.season, text);
        seasonCacheRaw = text;
      }
      seasonCacheSnap = snap;
      return snap;
    } catch {
      seasonCacheRaw = null;
      seasonCacheSnap = null;
      return null;
    }
  }

  // Actualiza la tarjeta con el XP que el juego ya guarda tras cada carrera,
  // sin iframe, sin pestaña y sin esperar a que alguien abra Season.
  function seasonRefreshFromUser(force = false) {
    const now = Date.now();
    if (!force && now - seasonUserAt < 5000) return seasonRead();
    seasonUserAt = now;

    const xp = seasonUserXp();
    if (xp === null) return seasonRead();

    const boot = seasonBoot();
    const active = boot.active;
    let snap = seasonRead();

    // Una temporada nueva resetea el XP: la foto vieja no puede mandar.
    if (snap && active && snap.seasonID && Number(snap.seasonID) !== Number(active.seasonID)) snap = null;
    // Si el almacenamiento va por detras de la foto, no se retrocede el XP.
    if (!force && snap && Number.isFinite(Number(snap.xp)) && xp < Number(snap.xp)) return snap;

    const levels = boot.levels || (snap && snap.levels) || SEASON_LEVELS_DEFAULT;
    const totalRewards = Math.max(1, Math.floor(
      Number(active && active.totalRewards) || Number(snap && snap.totalRewards) || 35,
    ));
    const computed = seasonTierForXp(xp, levels, totalRewards);
    const seasonID = Number(active && active.seasonID) || Number(snap && snap.seasonID) || null;
    const seasonName = (active && active.name) || (snap && snap.seasonName) || 'Season';
    const endsAt = Number(active && active.endStamp)
      ? Number(active.endStamp) * 1000
      : (snap && snap.endsAt) || null;
    const endsText = (active && seasonEndText(active.endStamp)) || (snap && snap.endsText) || '';

    const next = {
      v: 2,
      at: now,
      auto: true,
      source: 'user',
      seasonID,
      seasonName,
      tier: computed.tier,
      nextTier: computed.nextTier,
      progress: Math.round(computed.progress),
      xp,
      currentXp: computed.currentXp,
      nextXp: computed.nextXp,
      levels,
      totalRewards,
      endsAt,
      endsText,
    };

    if (snap && snap.auto && snap.tier === next.tier && snap.nextTier === next.nextTier
      && snap.xp === next.xp && snap.seasonName === next.seasonName
      && snap.endsAt === next.endsAt) {
      return snap;
    }

    if (!disk.set(KEYS.season, JSON.stringify(next))) return snap || next;
    if (panel && panel.refs) panel.seasonSig = '';
    return next;
  }

  function seasonXpText(value) {
    return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))).toLocaleString() : '—';
  }

  // "1.2k" / "950": el ritmo y la proyeccion caben en una fila del panel.
  function seasonXpShort(value) {
    const n = Math.max(0, Math.round(Number(value) || 0));
    if (n < 1000) return String(n);
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }

  // XP por dia activo de la ultima semana. El dia en curso no cuenta: a media
  // tarde su XP esta a medias y hundiria la media. Solo si no hay ningun dia
  // cerrado se usa el de hoy. Sin XP devuelve null y la fila no inventa nada.
  function seasonDailyXp(days = 7) {
    const cutoff = Date.now() - Math.max(1, days) * 86400000;
    const todayDate = todayKey();
    const byDate = new Map();
    for (const day of dayHistoryRead()) {
      const at = Date.parse(`${day.date}T12:00:00`);
      if (!Number.isFinite(at) || at < cutoff || !(Number(day.xp) > 0)) continue;
      if (day.date === todayDate) continue;
      byDate.set(day.date, Number(day.xp));
    }
    if (!byDate.size) {
      const today = todayRead();
      // El dia en curso solo vale como dia completo si lleva al menos 4 h: con
      // 10 minutos de carrera sobreestimaria el ritmo y diria que el premio
      // esta mas cerca de lo que esta.
      const first = Number(today.firstAt) || 0;
      const age = first > 0 ? Date.now() - first : 0;
      if (Number(today.xp) > 0 && age >= 4 * 3600000) byDate.set(today.date, Number(today.xp));
    }
    if (!byDate.size) return null;
    const total = [...byDate.values()].reduce((sum, value) => sum + value, 0);
    return { days: byDate.size, xp: total, perDay: Math.round(total / byDate.size) };
  }

  // Proyeccion al cierre de temporada con el ritmo real. `needed` es el XP
  // diario minimo para llegar al siguiente premio antes de que acabe.
  function seasonPace(snap, now = Date.now()) {
    if (!snap || !Number.isFinite(Number(snap.xp)) || !Number.isFinite(Number(snap.nextXp))) return null;
    const left = Math.max(0, Number(snap.nextXp) - Number(snap.xp));
    if (left <= 0) {
      return { status: 'done', left: 0, daysLeft: null, perDay: null, projected: null, needed: 0, short: 0 };
    }
    if (!Number.isFinite(Number(snap.endsAt)) || Number(snap.endsAt) <= 0) {
      return { status: 'unknown', left, daysLeft: null, perDay: null, projected: null, needed: 0, short: 0 };
    }

    const daysLeft = Math.max(0, Math.ceil((Number(snap.endsAt) - now) / 86400000));
    if (daysLeft <= 0) {
      return { status: 'over', left, daysLeft: 0, perDay: null, projected: 0, needed: 0, short: left };
    }

    const daily = seasonDailyXp();
    if (!daily) {
      return {
        status: 'unknown', left, daysLeft, perDay: null, projected: null,
        needed: Math.ceil(left / daysLeft), short: 0,
      };
    }

    const projected = Math.round(daily.perDay * daysLeft);
    return {
      status: projected >= left ? 'ontrack' : 'short',
      left,
      daysLeft,
      perDay: daily.perDay,
      projected,
      needed: Math.ceil(left / daysLeft),
      short: Math.max(0, left - projected),
    };
  }

  // XP medio por carrera de las ultimas diez: la unica base honesta para decir
  // cuantas carreras faltan. Sin historial cae al resumen de hoy.
  function seasonXpPerRace() {
    let list = [];
    try { list = JSON.parse(disk.get(KEYS.history, '[]')); } catch { list = []; }
    const xp = (Array.isArray(list) ? list : [])
      .map((race) => Number(race && race.xp))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (xp.length) return Math.max(1, Math.round(xp.reduce((sum, value) => sum + value, 0) / xp.length));
    const today = todayRead();
    if (today.races > 0 && today.xp > 0) return Math.max(1, Math.round(today.xp / today.races));
    return null;
  }

  // Las mismas frases para la tarjeta y para el garaje: un solo sitio decide
  // cuando hay prisa (tres dias o menos, menos de 5k XP o ritmo corto).
  function seasonAlertText(snap) {
    if (!snap) return [];
    const alerts = [];
    const xp = Number(snap.xp);
    const nextXp = Number(snap.nextXp);
    const left = Number.isFinite(xp) && Number.isFinite(nextXp) ? Math.max(0, nextXp - xp) : null;
    let daysLeft = null;
    if (Number.isFinite(Number(snap.endsAt)) && Number(snap.endsAt) > 0) {
      daysLeft = Math.ceil((Number(snap.endsAt) - Date.now()) / 86400000);
    }
    if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 3) {
      alerts.push(daysLeft === 0 ? 'Season ends today' : `Season ends in ${daysLeft}d`);
    }
    if (left !== null && left > 0 && left < 5000) {
      alerts.push(`${left.toLocaleString()} XP to next reward`);
    }
    const pace = seasonPace(snap);
    if (pace && pace.status === 'short' && pace.daysLeft >= 1 && pace.needed > 0) {
      alerts.push(`≈ ${seasonXpShort(pace.needed)} XP/day to reach T${Number(snap.nextTier) || 'next'}`);
    }
    return alerts;
  }

  let seasonPaintAt = 0;

  function paintSeason(force = false) {
    if (!panel.refs || !panel.refs.seasonName) return;
    const snap = seasonRead();
    // La firma barata evita calcular el ritmo y leer el historial en cada tick
    // del panel. Con datos iguales basta con refrescar cada 15 s (el ritmo
    // diario no cambia de un tick a otro); si llega XP nuevo, `snap.at` cambia
    // y la tarjeta se repinta en el acto.
    const baseSig = snap
      ? `${snap.at}|${snap.tier}|${snap.nextTier}|${snap.progress}|${snap.xp}|${snap.nextXp}|${snap.endsAt}`
      : 'empty';
    const now = Date.now();
    if (!force && panel.seasonBaseSig === baseSig && now - seasonPaintAt < 15000) return;
    panel.seasonBaseSig = baseSig;
    seasonPaintAt = now;

    const pace = seasonPace(snap);
    const perRace = seasonXpPerRace();
    const leftToNext = snap && Number.isFinite(Number(snap.xp)) && Number.isFinite(Number(snap.nextXp))
      ? Math.max(0, Number(snap.nextXp) - Number(snap.xp))
      : null;
    const racesLeft = leftToNext !== null && perRace ? Math.ceil(leftToNext / perRace) : null;
    const sig = snap
      ? `${snap.at}|${snap.tier}|${snap.nextTier}|${snap.progress}|${snap.xp}|${snap.nextXp}|${snap.endsAt}|${pace ? `${pace.status}:${pace.perDay}` : '-'}|${racesLeft}`
      : 'empty';
    if (panel.seasonSig === sig) return;
    panel.seasonSig = sig;

    if (panel.refs.seasonAlert) {
      panel.refs.seasonAlert.style.display = 'none';
      panel.refs.seasonAlert.textContent = '';
    }

    const empty = !snap;
    if (panel.refs.seasonCard) panel.refs.seasonCard.classList.toggle('is-empty', empty);
    if (empty) {
      setText(panel.refs.seasonTag, 'no snapshot');
      setText(panel.refs.seasonName, 'Season');
      setText(panel.refs.seasonTier, '—');
      setText(panel.refs.seasonXp, '—');
      setText(panel.refs.seasonNext, '—');
      setText(panel.refs.seasonRaces, '—');
      setText(panel.refs.seasonPace, '—');
      setText(panel.refs.seasonEnds, '—');
      setText(panel.refs.seasonNote, 'Waiting for your account XP...');
      if (panel.refs.seasonFill) panel.refs.seasonFill.style.width = '0%';
      return;
    }

    const progress = Math.max(0, Math.min(100, Number(snap.progress) || 0));
    const xp = snap.xp !== null && snap.xp !== undefined && Number.isFinite(Number(snap.xp)) ? Number(snap.xp) : null;
    const nextXp = snap.nextXp !== null && snap.nextXp !== undefined && Number.isFinite(Number(snap.nextXp)) ? Number(snap.nextXp) : null;
    const tier = Number(snap.tier);

    setText(panel.refs.seasonTag, `T${tier} · ${Math.round(progress)}%`);
    setText(panel.refs.seasonName, snap.seasonName || 'Season');
    setText(panel.refs.seasonTier, `T${tier}`);
    setText(panel.refs.seasonXp, xp !== null && nextXp !== null
      ? `${seasonXpText(xp)} / ${seasonXpText(nextXp)} XP`
      : (xp !== null ? `${seasonXpText(xp)} XP` : '—'));

    const left = xp !== null && nextXp !== null ? Math.max(0, nextXp - xp) : null;
    setText(panel.refs.seasonNext, left !== null
      ? `${seasonXpText(left)} XP to go`
      : (nextXp !== null ? `at ${seasonXpText(nextXp)} XP` : '—'));

    // Cuantas carreras caen a ese ritmo de XP, con la media de las ultimas
    // diez. Sin historial no se inventa: deja un guion.
    setText(panel.refs.seasonRaces, racesLeft !== null ? `≈ ${racesLeft} races` : '—');
    if (panel.refs.seasonRaces) {
      panel.refs.seasonRaces.title = racesLeft !== null
        ? `${seasonXpText(left)} XP left at about ${seasonXpText(perRace)} XP per race in the last races.`
        : 'Run a race to estimate how many races the next reward needs.';
    }

    // El ritmo real de la semana, proyectado a los dias que quedan: dice si el
    // siguiente premio esta al alcance y cuanto falta por dia si no lo esta.
    let paceText = '—';
    let paceTitle = 'No daily XP yet: run a few races to project the season.';
    if (pace && pace.status === 'done') {
      paceText = 'max tier';
      paceTitle = 'Every reward of this season is already unlocked.';
    } else if (pace && pace.status === 'over') {
      paceText = 'season over';
      paceTitle = 'The season already ended; this card keeps the last snapshot.';
    } else if (pace && pace.status === 'ontrack') {
      paceText = `${seasonXpShort(pace.perDay)}/day · on pace`;
      paceTitle = `${seasonXpShort(pace.perDay)} XP/day over ${pace.daysLeft}d projects ${seasonXpShort(pace.projected)} XP: the next reward is in reach.`;
    } else if (pace && pace.status === 'short') {
      paceText = `${seasonXpShort(pace.perDay)}/day · ${seasonXpShort(pace.short)} short`;
      paceTitle = `${seasonXpShort(pace.left)} XP left in ${pace.daysLeft}d: ${seasonXpShort(pace.perDay)}/day projects ${seasonXpShort(pace.projected)}, ${seasonXpShort(pace.short)} short of the next reward.`;
    }
    setText(panel.refs.seasonPace, paceText);
    if (panel.refs.seasonPace) panel.refs.seasonPace.title = paceTitle;

    let ends = snap.endsText ? `ends ${snap.endsText}` : '—';
    let daysLeft = null;
    if (snap.endsAt !== null && snap.endsAt !== undefined && Number.isFinite(Number(snap.endsAt))) {
      daysLeft = Math.ceil((Number(snap.endsAt) - Date.now()) / 86400000);
      if (daysLeft <= 0) ends = 'ended';
      else if (daysLeft <= 30) ends += ` · ${daysLeft}d`;
    }
    setText(panel.refs.seasonEnds, ends);
    setText(panel.refs.seasonNote, snap.auto
      ? 'auto · account XP'
      : `snapshot ${elapsedText(snap.at, true)} · open Season to refresh`);
    if (panel.refs.seasonFill) panel.refs.seasonFill.style.width = `${progress}%`;

    // Solo avisa cuando de verdad hay prisa: tres dias o menos de temporada,
    // menos de 5.000 XP para el siguiente premio o un ritmo que no alcanza.
    const alerts = seasonAlertText(snap);
    if (panel.refs.seasonAlert) {
      panel.refs.seasonAlert.textContent = alerts.join(' · ');
      panel.refs.seasonAlert.style.display = alerts.length ? '' : 'none';
    }
  }

  function captureSeasonPage() {
    let saved = false;
    const take = () => {
      const snap = parseSeasonPage(document);
      if (!snap) return false;
      try {
        disk.set(KEYS.season, JSON.stringify(snap));
      } catch {
        return false;
      }
      if (!saved) {
        saved = true;
        log(`Season captured: ${snap.seasonName}, T${snap.tier}${snap.nextTier ? ` (next T${snap.nextTier})` : ''}, ${snap.xp === null ? 'XP unknown' : `${snap.xp.toLocaleString()} XP`}.`);
      }
      return true;
    };

    if (take()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (take() || tries >= 20) clearInterval(timer);
    }, 500);
    setTimeout(() => clearInterval(timer), 12000);
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

  // -------------------------------------------------------------------------
  // Lectura viva: lo que se mira durante la carrera, a 4 Hz.
  // -------------------------------------------------------------------------
  // Ventana corta de caracteres aceptados: mide el ritmo de AHORA, no la media
  // acumulada de la carrera. Se muestrea desde el latido de 250 ms y nunca
  // toca el estado del juego ni vuelve a leer el DOM.
  const LIVE_PACE_WINDOW_MS = 6000;
  const LIVE_PACE_MIN_MS = 3000;
  const LIVE_PACE_MIN_CHARS = 3;
  let liveRecentSamples = [];
  let liveRecentKey = '';

  // Puro: las dos cifras salen de la misma ventana de muestras, asi que el WPM
  // y la precision recientes siempre describen los mismos caracteres. La
  // precision usa la formula del juego (errores / tecleados) y no la acumulada.
  function liveRecentFrom(samples) {
    if (!Array.isArray(samples) || samples.length < 2) return null;
    const first = samples[0];
    const end = samples[samples.length - 1];
    const minutes = (end.at - first.at) / 60000;
    const typed = end.typed - first.typed;
    if (!(minutes > 0) || minutes < LIVE_PACE_MIN_MS / 60000) return null;
    if (!(typed >= LIVE_PACE_MIN_CHARS)) return null;
    const errors = end.errors - first.errors;
    return {
      pace: (typed / 5) / minutes,
      accuracy: Number.isFinite(errors)
        ? clamp((1 - errors / typed) * 100, 0, 100)
        : null,
    };
  }

  function liveRecentNow(now = Date.now()) {
    const key = `${session.startedAt}:${session.endedAt}`;
    if (key !== liveRecentKey) {
      liveRecentKey = key;
      liveRecentSamples = [];
    }
    const typed = Math.max(0, session.chars - session.nitroChars);
    const errors = Math.max(0, Number(session.errors) || 0);
    // Tras una pausa mas larga que la ventana no se arrastra la media vieja: la
    // racha nueva empieza a medirse desde la primera tecla aceptada al volver.
    if (liveRecentSamples.length
      && now - liveRecentSamples[liveRecentSamples.length - 1].at > LIVE_PACE_WINDOW_MS) {
      liveRecentSamples = [];
    }
    const last = liveRecentSamples[liveRecentSamples.length - 1];
    if (!last || last.typed !== typed || last.errors !== errors) {
      liveRecentSamples.push({ at: now, typed, errors });
    }
    const horizon = now - LIVE_PACE_WINDOW_MS;
    while (liveRecentSamples.length > 2 && liveRecentSamples[0].at < horizon) liveRecentSamples.shift();
    return liveRecentFrom(liveRecentSamples);
  }

  function paintLiveNumbers(measured, wpm, acc) {
    flashValue(panel.refs.live, measured ? wpm.toFixed(1) : '—');
    flashValue(panel.refs.acc, measured ? `${acc.toFixed(1)}%` : '—');
    setGood(panel.refs.live, measured ? wpm >= profile.targetWPM * 0.95 : null);
    setGood(panel.refs.acc, measured ? acc >= profile.accuracyGoal : null);

    // Frescura: cuanto hace que el juego acepto la ultima tecla. Si la carrera
    // sigue viva pero los numeros no se mueven, se dice en ambar y las dos
    // cifras recientes se tapan en vez de dejar que parezcan telemetria viva.
    const racing = Boolean(session.typing && !session.endedAt);
    const acceptedAt = Number(session.lastAcceptedAt) || 0;
    const age = acceptedAt ? Math.max(0, Date.now() - acceptedAt) : null;
    const stale = racing && age !== null && age > 2500;
    const frozenWarning = `No accepted key for ${(Math.max(0, age || 0) / 1000).toFixed(1)} s while the race is live: the readout is frozen, not current.`;

    const recent = liveRecentNow();
    const recentPace = recent ? recent.pace : null;
    const recentAcc = recent ? recent.accuracy : null;
    flashValue(panel.refs.liveNow, stale || recentPace === null ? '—' : recentPace.toFixed(1));
    flashValue(panel.refs.liveNowAcc, stale || recentAcc === null ? '—' : `${recentAcc.toFixed(1)}%`);
    setGood(panel.refs.liveNow, stale ? false : null);
    setGood(panel.refs.liveNowAcc,
      stale ? false : recentAcc === null ? null : recentAcc >= profile.accuracyGoal);
    if (panel.refs.liveNow) {
      panel.refs.liveNow.title = stale
        ? frozenWarning
        : recentPace === null
          ? `Recent pace: needs at least ${LIVE_PACE_MIN_MS / 1000} seconds and a few accepted keys inside the last ${LIVE_PACE_WINDOW_MS / 1000} seconds.`
          : `Recent pace: ${recentPace.toFixed(1)} WPM over the last ${LIVE_PACE_WINDOW_MS / 1000} seconds of accepted keys. The session row is the cumulative average.`;
    }
    if (panel.refs.liveNowAcc) {
      panel.refs.liveNowAcc.title = stale
        ? frozenWarning
        : recentAcc === null
          ? `Recent accuracy: needs at least ${LIVE_PACE_MIN_MS / 1000} seconds and a few accepted keys inside the last ${LIVE_PACE_WINDOW_MS / 1000} seconds.`
          : `Recent accuracy: ${recentAcc.toFixed(1)}% over the last ${LIVE_PACE_WINDOW_MS / 1000} seconds of accepted keys (errors / typed, the game formula). The accuracy above is cumulative.`;
    }

    let ageText = '—';
    if (session.endedAt) ageText = 'final';
    else if (age !== null && (racing || measured)) {
      ageText = stale ? `stalled ${Math.round(age / 1000)}s` : `${(age / 1000).toFixed(1)}s`;
    }
    setText(panel.refs.liveAge, ageText);
    setGood(panel.refs.liveAge, stale ? false : null);
    if (panel.refs.liveAge) {
      panel.refs.liveAge.title = stale
        ? frozenWarning
        : 'Data age: seconds since the game accepted the last key. Refreshed four times per second; amber means the race has gone quiet.';
    }
  }

  function paintRaceProgress() {
    const total = session.total;
    const pos = clamp(session.pos, 0, total || 0);
    const racePct = total > 0 ? progressPct(pos, total) : 0;
    setText(panel.refs.progress, total > 0 ? `${pos}/${total}` : '—');
    if (panel.refs.progFill) {
      const width = `${racePct.toFixed(1)}%`;
      if (panel.refs.progFill.style.width !== width) panel.refs.progFill.style.width = width;
    }
    if (panel.root) {
      const fill = (racePct / 100).toFixed(4);
      if (panel.root.style.getPropertyValue('--race-fill') !== fill) {
        panel.root.style.setProperty('--race-fill', fill);
      }
    }
  }

  function paintLiveClock(measured, wpm, acc) {
    setText(panel.refs.footWpm, measured ? `${wpm.toFixed(1)} wpm` : '— wpm');
    setText(panel.refs.footAcc, measured ? `${acc.toFixed(1)}%` : '— acc');
    // El reloj se congela al cerrar la carrera: antes seguia sumando durante
    // la pantalla de resultados y parecia que la carrera no habia acabado.
    const end = session.endedAt || Date.now();
    const raceSeconds = measured && session.startedAt
      ? Math.max(0, Math.round((end - session.startedAt) / 1000))
      : 0;
    setText(panel.refs.footClock, raceSeconds
      ? `${Math.floor(raceSeconds / 60)}:${String(raceSeconds % 60).padStart(2, '0')}`
      : '0:00');
  }

  function updateLiveReadout() {
    if (!panel.root || !panel.root.isConnected) return;
    if (document.hidden) return;
    if (panel.root.dataset.collapsed === 'true') return;
    if (!session.startedAt && !session.chars) return;
    const measured = session.chars > 0;
    const wpm = measured ? wpmNow() : 0;
    const acc = measured ? accuracyNow() : 0;
    paintLiveNumbers(measured, wpm, acc);
    paintRaceProgress();
    paintLiveClock(measured, wpm, acc);
  }

  // Un reto completado es un aviso, no un detalle de fondo: no espera al
  // siguiente latido de 2 s. Se agrupa en un solo repintado para que dos retos
  // que caen juntos no encolen dos actualizaciones.
  let panelRefreshTimer = 0;
  function schedulePanelRefresh() {
    if (panelRefreshTimer) return;
    panelRefreshTimer = setTimeout(() => {
      panelRefreshTimer = 0;
      updatePanel();
    }, 0);
  }

  function updatePanel(force = false) {
    publishState();
    // Un panel que ya no esta en el documento (React lo quito al navegar) no
    // se sigue pintando: se reconstruye en el latido y hasta entonces cada
    // escritura era basura para el GC.
    if (!panel.root || !panel.root.isConnected) return;
    // Con la pestaña en segundo plano nadie ve el panel. El estado para la cola
    // ya se publico arriba, asi que se puede saltar todo el DOM hasta volver.
    if (document.hidden && !force) return;
    perfCounters.panelPaints += 1;

    if (panel.refs.update) {
      paintUpdateBadge(panel.refs.update);
      paintUpdateHealth();
      if (panel.refs.update.dataset.bound !== '1') {
        panel.refs.update.dataset.bound = '1';
        panel.refs.update.addEventListener('pointerdown', (event) => event.stopPropagation());
        panel.refs.update.addEventListener('click', (event) => {
          event.stopPropagation();
          openUpdateDownload();
        });
        checkForUpdate();
        // Tick corto: checkForUpdate no repite una comprobacion buena hasta
        // los 5 min; al volver a la pestana tambien se pregunta sin esperar.
        setInterval(checkForUpdate, UPDATE_RECHECK_MS);
      }
    }

    const breaking = session.breakUntil > Date.now();
    const state = breaking ? 'break' : session.paused ? 'paused' : (session.typing ? 'running' : 'waiting');
    if (panel.root.dataset.state !== state) panel.root.dataset.state = state;
    if (panel.root.dataset.mode !== MODE) panel.root.dataset.mode = MODE;
    // Parado es un estado visual mas: el chip y el LED lo dicen sin inventarse
    // un tercer modo.
    const stoppedFlag = session.stopped ? '1' : '0';
    if (panel.root.dataset.stopped !== stoppedFlag) panel.root.dataset.stopped = stoppedFlag;

    // Sin teclas todavia no hay medida: se muestra un guion y color neutro.
    const measured = session.chars > 0;
    const wpm = measured ? wpmNow() : 0;
    const acc = measured ? accuracyNow() : 0;

    if (panel.root.dataset.pace !== session.pace) panel.root.dataset.pace = session.pace;

    // Plegado solo queda la cabecera y los tres botones: no hay ninguna fila
    // visible que actualizar. Se pinta lo minimo y se libera el hilo.
    if (panel.root.dataset.collapsed === 'true' && !force) {
      paintPanelActions();
      return;
    }

    // El chip dice el MODO, nunca un OFF que se parezca a NORMAL: AUTO siempre.
    // Que este esperando lo dicen el LED, la barra de estado y el motivo, sin
    // inventarse un tercer modo.
    setText(panel.refs.mode, 'AUTO');
    paintPace();
    seasonRefreshFromUser();
    paintSeason();
    setText(panel.refs.target, `${profile.targetWPM} · ${profile.accuracyGoal.toFixed(1)}%`);
    // Los dos numeros grandes golpean la escala cuando cambian de verdad (parte
    // entera), que es lo que se mira durante la carrera. El mismo pintado corre
    // a 4 Hz entre repintados completos (updateLiveReadout).
    paintLiveNumbers(measured, wpm, acc);
    setText(panel.refs.session, `${profile.wpmSession}/${profile.wpm.length}`);
    setText(panel.refs.races, session.raceLimit
      ? `${session.races} / ${session.raceLimit}`
      : String(session.races));
    // XP del dia, el mismo que suma la tarjeta de 7 dias: aqui se ve sin
    // cambiar de vista, mientras la sesion corre. Sin XP no se inventa un 0.
    if (panel.refs.dayXp) {
      const dayXp = todayRead().xp;
      setText(panel.refs.dayXp, dayXp > 0 ? `${dayXp.toLocaleString()} XP` : '—');
    }
    // Presupuesto del dia: consumo contra el tope, con aviso al 80%. Es lo
    // unico que no se reinicia al abrir una tanda nueva.
    if (panel.refs.dailyRaces) {
      const daily = dailyCaps();
      const racePct = daily.raceCap > 0 ? daily.races / daily.raceCap : 0;
      const xpPct = daily.xpCap > 0 ? daily.xp / daily.xpCap : 0;

      setText(panel.refs.dailyRaces, daily.raceCap ? `${daily.races} / ${daily.raceCap}` : 'free');
      setText(panel.refs.dailyXp, daily.xpCap
        ? `${limitXpText(daily.xp)} / ${limitXpText(daily.xpCap)}`
        : 'free');
      setGood(panel.refs.dailyRaces, daily.raceCap ? racePct < 0.8 : null);
      setGood(panel.refs.dailyXp, daily.xpCap ? xpPct < 0.8 : null);

      const left = [];
      if (daily.raceCap) left.push(`${Math.max(0, daily.raceCap - daily.races)} races`);
      if (daily.xpCap) {
        const xpLeft = Math.max(0, daily.xpCap - daily.xp);
        left.push(`${xpLeft > 0 ? limitXpText(xpLeft) : '0'} XP`);
      }
      setText(panel.refs.dailyLeft, left.length ? left.join(' · ') : 'no caps');

      panel.refs.dailyRaceRow.title = daily.raceCap
        ? `Daily races: ${daily.races} of ${daily.raceCap} (${Math.min(100, Math.round(racePct * 100))}%). Click to change (free, 100, 200, 300); resets at midnight.`
        : 'Daily races: free. Click to set 100, 200 or 300; resets at midnight.';
      panel.refs.dailyXpRow.title = daily.xpCap
        ? `Daily XP: ${daily.xp.toLocaleString()} of ${daily.xpCap.toLocaleString()} (${Math.min(100, Math.round(xpPct * 100))}%). Click to change (free, 50k, 100k, 200k); resets at midnight.`
        : 'Daily XP: free. Click to set 50k, 100k or 200k; resets at midnight.';
      paintDailyRaceSlider();
      paintDailyXpSlider();
    }
    // Ventana de horas: el rango, el estado de ahora y cuanto queda para que
    // abra o cierre. Se calcula en cada tick para que el reloj no se congele.
    if (panel.refs.activeState) {
      const win = activeWindow();
      const range = `${win.startText}–${win.endText}`;
      setText(panel.refs.activeState, win.on ? range : 'off');
      setText(panel.refs.activeStart, win.startText);
      setText(panel.refs.activeEnd, win.endText);
      paintActiveSlider('start');
      paintActiveSlider('end');

      if (!win.on) {
        setText(panel.refs.activeNow, 'always');
        setGood(panel.refs.activeNow, null);
        panel.refs.activeNow.title = 'Active hours are off: races can start at any time.';
      } else if (win.allDay) {
        setText(panel.refs.activeNow, 'open · all day');
        setGood(panel.refs.activeNow, true);
        panel.refs.activeNow.title = `Active hours ${range}: all day. Races can start at any time.`;
      } else if (win.open) {
        setText(panel.refs.activeNow, `open · closes in ${activeLeftText(win.msUntilClose)}`);
        setGood(panel.refs.activeNow, true);
        panel.refs.activeNow.title = `Active hours ${range}. Open now; closes at ${win.endText} in ${activeLeftText(win.msUntilClose)}. Races only start inside the window.`;
      } else {
        setText(panel.refs.activeNow, `closed · opens in ${activeLeftText(win.msUntilOpen)}`);
        setGood(panel.refs.activeNow, false);
        panel.refs.activeNow.title = `Active hours ${range}. Closed now; opens at ${win.startText} in ${activeLeftText(win.msUntilOpen)}. The bot finishes the race in progress and waits.`;
      }

      panel.refs.activeRow.title = win.on
        ? `Active hours ${range} (local time). Click to turn them off; Shift+click resets 08:00–23:00.`
        : 'Active hours are off. Click to turn them on; Shift+click resets 08:00–23:00. The window can cross midnight.';
      panel.refs.activeStartRow.title = `Start: ${win.startText}. Click +1 hour; Shift+click −1 hour. Same start and end means all day.`;
      panel.refs.activeEndRow.title = `End: ${win.endText}. Click +1 hour; Shift+click −1 hour. An end before the start crosses midnight; the same hour as the start means all day.`;
    }
    // Ritmo de XP de la tanda: lo que llevaria en una hora a este paso. Se
    // mide desde la primera carrera, no desde que se abrio el panel, y no
    // inventa cifra con menos de un minuto o sin XP acumulado.
    if (panel.refs.rate) {
      const elapsed = session.tandaStartedAt ? Date.now() - session.tandaStartedAt : 0;
      const xp = Number(session.xp) || 0;
      const rate = elapsed >= 60000 && xp > 0 ? xp / (elapsed / 3600000) : null;
      setText(panel.refs.rate, rate === null ? '—'
        : rate >= 1000 ? `${(rate / 1000).toFixed(1)}k XP/h` : `${Math.round(rate)} XP/h`);
      panel.refs.rate.title = rate === null
        ? 'Session rate: needs at least a minute of measured races and some XP.'
        : `Session rate: ${Math.round(rate).toLocaleString()} XP/h at the current pace`
          + ` (${xp.toLocaleString()} XP in ${Math.max(1, Math.round(elapsed / 60000))}m).`;
    }
    paintNitroPreview();
    // Nitro de la tanda: cuantas carreras lo gastaron, cuantos caracteres
    // regalo el juego y lo que habrian tardado al ritmo objetivo. La ultima
    // carrera va en el tooltip para no perder el detalle por carrera.
    if (panel.refs.nitro) {
      const uses = Math.max(0, Number(session.nitroRaces) || 0);
      const chars = Math.max(0, Number(session.nitroCharsTotal) || 0);
      const races = Math.max(0, Number(session.races) || 0);
      const last = raceHistory[raceHistory.length - 1];

      if (chars > 0) {
        const secs = chars / 5 / (profile.targetWPM / 60);
        setText(panel.refs.nitro, `${uses}/${races || uses} · ${chars} ch · ${secs.toFixed(1)}s`);
        let title = `Nitro this session: ${uses} of ${races || uses} race${(races || uses) === 1 ? '' : 's'}`
          + ` · ${chars} characters the game typed for you · about ${secs.toFixed(1)} s at the ${profile.targetWPM} WPM target.`
          + ' It is not free speed: the planner pays it back over the remaining keys.';
        if (last && Number(last.nitroChars) > 0) {
          title += ` Last race: ${Number(last.nitroWords) || 1} word, ${Number(last.nitroChars)} characters.`;
        }
        panel.refs.nitro.title = title;
      } else {
        setText(panel.refs.nitro, '—');
        panel.refs.nitro.title = 'Nitro this session: none used yet, or the races ended before the nitro could be spent.';
      }
    }
    // Comprobacion de WPM: media de las carreras con nitro contra las que no
    // lo usaron. Es una observacion de las ultimas 10 medidas; si sale
    // positiva, el panel lo marca en ambar en vez de esconderlo.
    if (panel.refs.nitroDelta) {
      const stats = nitroWpmStats(raceHistory);
      if (stats) {
        const sign = stats.delta > 0 ? '+' : '';
        setText(panel.refs.nitroDelta, `${sign}${stats.delta.toFixed(1)} wpm`);
        setGood(panel.refs.nitroDelta, stats.delta <= 0);
        panel.refs.nitroDelta.title = `Nitro WPM check over the last ${stats.used + stats.plain} measured races:`
          + ` ${stats.used} with nitro averaged ${stats.usedWpm.toFixed(1)} WPM;`
          + ` ${stats.plain} without averaged ${stats.plainWpm.toFixed(1)} WPM.`
          + ` Difference ${stats.delta >= 0 ? '+' : ''}${stats.delta.toFixed(1)} WPM; zero or below means no lift.`
          + ' It is an observation, not a guarantee.';
      } else {
        setText(panel.refs.nitroDelta, '—');
        setGood(panel.refs.nitroDelta, null);
        panel.refs.nitroDelta.title = 'Nitro WPM check: needs at least one measured race with nitro and one without in the last 10.';
      }
    }
    // Hueco entre carreras: mediana y mejor de los ultimos 20 huecos normales.
    // Es el tiempo que no se ve en el WPM pero se paga en XP por hora.
    if (panel.refs.cycle) {
      const gaps = Array.isArray(session.gapSamples)
        ? session.gapSamples.filter((ms) => Number.isFinite(ms) && ms > 0)
        : [];

      if (gaps.length) {
        const sorted = gaps.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        const best = sorted[0];
        setText(panel.refs.cycle, `${(median / 1000).toFixed(1)}s med · ${(best / 1000).toFixed(1)}s best`);
        panel.refs.cycle.title = `Dead time between races: median ${(median / 1000).toFixed(1)} s`
          + ` over ${gaps.length} gap${gaps.length === 1 ? '' : 's'}, best ${(best / 1000).toFixed(1)} s.`
          + ` Gaps over ${GAP_MAX_MS / 1000} s (breaks, pauses, guard waits) are left out.`;
      } else {
        setText(panel.refs.cycle, '—');
        panel.refs.cycle.title = `Dead time between races: needs a finished race and the next start.`
          + ` Gaps over ${GAP_MAX_MS / 1000} s (breaks, pauses, guard waits) are left out.`;
      }
    }
    // Desglose del XP de la ultima carrera con las tablas del juego: puesto,
    // velocidad y tramo de precision. Lo que sobra es bonus de sesion u otros.
    if (panel.refs.xpBreak) {
      const split = xpBreakdown(raceHistory[raceHistory.length - 1]);
      if (split) {
        setText(panel.refs.xpBreak, `${split.base}+${split.speed}+${split.accuracy}+${split.session}`);
        const next = xpNextAccuracyTier(split.acc);
        panel.refs.xpBreak.title = `Last race: ${split.place ? '#' + split.place + ' · ' : ''}`
          + `${split.base} base + ${split.speed} speed (2x WPM) + ${split.accuracy} accuracy`
          + ` + ${split.session} session/other = ${split.total.toLocaleString()} XP.`
          + ` Accuracy ${Math.round(split.acc)}% pays ${split.accuracy};`
          + (next
            ? ` ${next.pct}% would pay ${next.xp} (+${next.xp - split.accuracy}).`
            : ' the top tier is already paid.');
      } else {
        setText(panel.refs.xpBreak, '—');
        panel.refs.xpBreak.title = 'Last race XP: waiting for the result packet and its real reward.';
      }
    }
    // Live session average (everything measured, not just the few in the list):
    // green when the deviation from the average target is within +-2%.
    const tandaAvg = tandaAverages();
    if (panel.refs.tanda) {
      setText(panel.refs.tanda, tandaAvg
        ? `${tandaAvg.wpm.toFixed(1)} · ${tandaAvg.acc.toFixed(1)}%`
        : '—');
      setGood(panel.refs.tanda, tandaAvg
        ? Math.abs((tandaAvg.wpm - tandaAvg.target) / tandaAvg.target) * 100 <= 2
        : null);
    }
    // Ultima tanda cerrada: su media y su desvio, aqui mismo. El registro
    // completo (fecha, motivo, DQ) esta en el tooltip y la tabla en la consola.
    if (panel.refs.prevRow) {
      const previous = tandaLog.length ? tandaLog[tandaLog.length - 1] : null;
      const show = Boolean(previous && previous.races >= 1);
      setDisplay(panel.refs.prevRow, show);

      if (show) {
        const dev = Number.isFinite(previous.wpm) && previous.target > 0
          ? ((previous.wpm - previous.target) / previous.target) * 100
          : null;

        setText(panel.refs.prev, `${previous.races} · ${Number.isFinite(previous.wpm) ? previous.wpm.toFixed(1) : '—'}`
          + (dev === null ? '' : ` · ${dev >= 0 ? '+' : ''}${dev.toFixed(1)}%`));
        setGood(panel.refs.prev, dev === null ? null : Math.abs(dev) <= 2);
        // La etiqueta delata cual es: la tanda que acaba de cerrar o la anterior.
        setText(panel.refs.prevLabel, session.closed ? 'last' : 'prev');

        const bits = [
          `${previous.races} race${previous.races === 1 ? '' : 's'}`,
          Number.isFinite(previous.wpm) ? `avg ${previous.wpm.toFixed(1)} WPM` : null,
          Number.isFinite(previous.target) && previous.target > 0 ? `target ${previous.target.toFixed(1)}` : null,
          Number.isFinite(previous.acc) ? `${previous.acc.toFixed(1)}% accuracy` : null,
          previous.dq ? `${previous.dq} DQ` : null,
          `closed ${clockText(previous.at)} (${elapsedText(previous.at)})`,
          previous.reason ? `by ${previous.reason}` : null,
          tandaLog.length > 1 ? `${tandaLog.length} sessions in the log` : null,
          'click for the table',
        ].filter(Boolean);

        panel.refs.prevRow.title = `${session.closed ? 'Session that just closed' : 'Previous closed session'}: ${bits.join(' · ')}.`;
      }
    }

    if (panel.refs.limit) {
      const eta = etaRemaining();
      setText(panel.refs.limit, session.raceLimit
        ? `${session.raceLimit}${eta ? ` · ≈${eta.minutes}m` : ''}`
        : 'free');
      paintLimitSlider();

      // Tope por tiempo: la misma tarjeta, otro reloj. La fila solo se pinta
      // cuando hay un tope puesto, para no llenar la tarjeta de guiones.
      setText(panel.refs.timeLimit, limitMinutesText(session.timeLimit));
      paintTimeSlider();

      const timeLeft = timeLimitLeft();
      if (panel.refs.timeLeftRow) {
        const show = session.timeLimit > 0;
        setDisplay(panel.refs.timeLeftRow, show);
        if (show) {
          setText(panel.refs.timeLeft, timeLeft === null ? '—' : clockSpan(timeLeft));
          panel.refs.timeLeftRow.title = timeLeft === null
            ? `Time limit ${limitMinutesText(session.timeLimit)}: counting from the first race of the session`
            : `Time limit ${limitMinutesText(session.timeLimit)} · ${clockSpan(timeLeft)} left. The bot finishes the race in progress and closes the session`;
        }
      }

      // Tope por XP: lo que el juego ha pagado en la tanda, contra el tope. Si
      // el premio de una carrera no llega (pantalla de resultados perdida), ese
      // XP no se inventa: la fila se queda corta y el tope tarda mas en saltar.
      setText(panel.refs.xpLimit, limitXpText(session.xpLimit));
      paintXpSlider();

      if (panel.refs.xpRow) {
        const show = session.xpLimit > 0;
        setDisplay(panel.refs.xpRow, show);
        if (show) {
          const left = Math.max(0, session.xpLimit - session.xp);
          const xpPlan = xpEta();
          const guess = xpPlan && xpPlan.minutes !== null && left > 0 ? ` · ≈${xpPlan.minutes}m` : '';
          setText(panel.refs.xpTotal, `${session.xp.toLocaleString()} / ${session.xpLimit.toLocaleString()}${guess}`);
          panel.refs.xpRow.title = left > 0
            ? `XP limit ${limitXpText(session.xpLimit)} · ${left.toLocaleString()} XP left`
              + (xpPlan && xpPlan.races !== null
                ? ` · ≈${xpPlan.races} race${xpPlan.races === 1 ? '' : 's'} at ${Math.round(xpPlan.perRace).toLocaleString()} XP per race (≈${xpPlan.minutes}m)`
                : ' · no measured pace yet')
              + '. The bot finishes the race in progress and closes the session'
            : 'XP limit reached: the next A opens a fresh session';
        }
      }

      // La fila `left` de la tarjeta del tope: lo que queda, en claro.
      if (panel.refs.etaLeft) {
        setText(panel.refs.etaLeft, eta
          ? `≈ ${eta.minutes} min · ${eta.remaining} race${eta.remaining === 1 ? '' : 's'}${eta.breaks ? ` + ${eta.breaks} break${eta.breaks === 1 ? '' : 's'}` : ''}`
          : (session.raceLimit ? 'done' : 'no limit'));
      }

      // El tooltip dice de donde sale la estimacion: sin eso el numero parece
      // magia. Se reescribe solo cuando cambia, que esto corre en cada tick.
      if (panel.refs.raceLimitRow) {
        let title;
        if (!session.raceLimit) {
          title = 'No session limit: the bot keeps going until you stop it. Click: 20, 50, 100 races.';
        } else if (!eta) {
          title = `Session limit reached (${session.raceLimit} races): the next A opens a fresh session. Click to change it.`;
        } else {
          const parts = [
            `${eta.remaining} race${eta.remaining === 1 ? '' : 's'} left`,
            `${Math.round(eta.cycleMs / 1000)} s per race (${eta.measured ? 'measured' : 'estimated'})`,
          ];
          let text = `≈ ${eta.minutes} min left: ${parts.join(' · ')}`;
          if (eta.breaks) text += ` + ${eta.breaks} break${eta.breaks === 1 ? '' : 's'}`;
          else if (!CONFIG.breaks.enabled) text += ' · breaks off';
          title = `${text}. Click to change the limit (free, 20, 50, 100).`;
        }
        if (panel.refs.raceLimitRow.title !== title) panel.refs.raceLimitRow.title = title;
      }
    }
    const limitMode = session.raceLimit ? 'on' : 'off';
    if (panel.root.dataset.limit !== limitMode) panel.root.dataset.limit = limitMode;
    paintPanelActions();

    // Avance de la carrera: numero de letras aceptadas y barra fina debajo del
    // marcador. Sin leccion cargada (resultados, descanso) se muestra un guion.
    paintRaceProgress();

    if (breaking) {
      const left = Math.max(0, Math.ceil((session.breakUntil - Date.now()) / 1000));
      setText(panel.refs.breakLeft, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    } else {
      // Fuera del descanso la fila dice cuantas carreras faltan para el
      // siguiente: antes solo aparecia cuando ya estabas dentro de el.
      const untilBreak = CONFIG.breaks.enabled && session.blockTarget > 0
        ? Math.max(0, session.blockTarget - session.blockRaces)
        : 0;
      setText(panel.refs.breakLeft, untilBreak > 0 ? `in ${untilBreak}` : '—');
    }

    // El autocalibrado solo se muestra cuando ya se ha movido: si esta a 1.00
    // no aporta nada y ocupa una fila.
    const trimmed = Math.abs(session.trim - 1) >= 0.005;
    setDisplay(panel.refs.trimRow, trimmed);
    if (trimmed) setText(panel.refs.trim, `x${session.trim.toFixed(2)}`);


    // Racha de descalificaciones: solo aparece cuando hay alguna. Es la razon
    // por la que el bot se para solo a las dos seguidas.
    const dqStreak = session.dqStreak | 0;
    setDisplay(panel.refs.dqRow, dqStreak > 0);
    if (dqStreak > 0) setText(panel.refs.dq, `×${dqStreak}`);

    // The game's own reading (the number Nitro Type counts) next to the ceiling.
    // It only appears while a race is live; if it ever reaches the cap the chip
    // turns red, which is the moment the guard is about to stop the whole bot.
    const cap = CONFIG.wpm.hardCap;
    const hud = session.startedAt && !session.endedAt ? hudWpm() : null;
    if (hud !== null && session.typing) session.lastHudWpm = hud;
    setDisplay(panel.refs.hudRow, hud !== null);
    if (hud !== null) {
      setText(panel.refs.hud, Number.isFinite(cap) ? `${hud.toFixed(0)} / ${cap}` : hud.toFixed(0));
      setGood(panel.refs.hud, Number.isFinite(cap) ? hud < cap : null);
    }
    if (panel.root) panel.root.dataset.capHit = Number.isFinite(cap) && hud !== null && hud >= cap ? '1' : '0';

    // Si el Worker del reloj no se pudo crear (CSP del sitio), la cadencia cae a
    // los temporizadores de la pagina: con la pestana en segundo plano el
    // navegador los frena a 1 tecla/s y la carrera termina en DQ por inactividad.
    // Es el fallo que ya paso una vez, asi que se avisa aqui en vez de dejarlo
    // escondido en el informe de diagnostico.
    if (panel.refs.clockRow) {
      const slowClock = preciseClockKind !== 'worker';
      setDisplay(panel.refs.clockRow, slowClock);
      if (slowClock) {
        setText(panel.refs.clock, 'page timers');
        setGood(panel.refs.clock, false);
      }
    }

    // Resultado de la ultima carrera (puesto y premio): solo cuando el juego lo
    // publico. Sale del evento `update` del servidor de la carrera; si el sitio
    // no lo manda, la fila se queda oculta en vez de inventar un numero.
    if (panel.refs.resultRow) {
      const lastResult = raceHistory[raceHistory.length - 1];
      const hasResult = Boolean(lastResult && (lastResult.place || lastResult.cash || lastResult.xp));
      setDisplay(panel.refs.resultRow, hasResult);
      if (hasResult) {
        const bits = [
          ordinal(lastResult.place),
          lastResult.cash ? `+$${lastResult.cash.toLocaleString()}` : '',
          lastResult.xp ? `+${lastResult.xp} xp` : '',
        ].filter(Boolean);
        setText(panel.refs.result, bits.join(' · '));
        panel.refs.resultRow.title = `Last race: ${bits.join(' · ')} (read from the game's own race result).`;
      }
    }

    // Fila guard: solo aparece cuando hay algo que explicar (copia esperando,
    // hueco del guardia o bloqueo del sitio). El resto del tiempo sonaba a ruido.
    if (panel.refs.guardRow) {
      let guardText = '';

      // Atasco con las recargas ya gastadas (lo deja la cola en localStorage
      // cuando no puede salir solo): es lo primero que hay que ver, porque es el
      // unico caso en el que el bot necesita que lo desatasques tu.
      let stuck = null;
      try {
        stuck = JSON.parse(disk.get(STUCK_STATE, 'null'));
      } catch {
        stuck = null;
      }
      const stuckFresh = Boolean(stuck && Number.isFinite(stuck.at) && Date.now() - stuck.at < 600000);

      const pen = penLabel();

      if (stuckFresh) guardText = 'stuck · press F5';
      else if (dqBlockedNoted) guardText = 'site block';
      else if (session.stopped) guardText = '';
      else if (!primaryRole) guardText = `standby · pen ${pen || '—'}`;
      else if (peerCount > 1) guardText = `writing · pen ${pen || '—'}`;
      else if (session.carefulRaces > 0) guardText = `careful · ${session.carefulRaces}`;
      else if (session.breakUntil > Date.now()) guardText = 'long break';

      setDisplay(panel.refs.guardRow, Boolean(guardText));
      if (guardText) setText(panel.refs.guard, guardText);
      const standby = !primaryRole && !session.stopped ? '1' : '0';
      if (panel.root.dataset.standby !== standby) panel.root.dataset.standby = standby;
    }

    // Fila watch: la foto en vivo. El panel puede decir "waiting" mientras la
    // carrera ya esta en cuenta atras; aqui se ve la fase real, quien tiene el
    // lease y cuanto lleva el juego sin contar una tecla.
    if (panel.refs.watchRow) {
      const live = liveSituation();
      const owner = live.lease.mine ? 'this tab' : live.lease.owner ? 'other tab' : 'no lease';
      const age = live.phase === 'racing' || live.phase === 'countdown'
        ? ` · ${live.acceptedAgeMs < 10000
          ? (live.acceptedAgeMs / 1000).toFixed(1)
          : Math.round(live.acceptedAgeMs / 1000)}s`
        : '';
      setText(panel.refs.watch, `${live.phase} · ${owner}${age}${live.rescue ? ' · rescue' : ''}`);
      panel.refs.watchRow.title = `Real-time watchdog: ${live.phase}; typing lease ${owner}${live.lease.expiresInMs ? ` (${Math.ceil(live.lease.expiresInMs / 1000)} s left)` : ''}; last accepted key ${live.acceptedAgeMs ? `${(live.acceptedAgeMs / 1000).toFixed(1)} s ago` : 'not yet'}; last sent key ${live.sentAgeMs ? `${(live.sentAgeMs / 1000).toFixed(1)} s ago` : 'not yet'}.`;
    }

    // Resumen del dia: carreras, media real frente a la media objetivo, cajas y
    // DQ. Se lee de lo guardado hoy, asi que sobrevive a las recargas del marco.
    if (panel.refs.todayRow) {
      const day = todayRead();
      const parts = [];

      if (day.races > 0) {
        const avg = day.sumWpm / day.races;
        const avgTarget = day.sumTarget / day.races;
        parts.push(`${day.races} race${day.races === 1 ? '' : 's'}`);
        parts.push(`${avg.toFixed(1)}/${Math.round(avgTarget)} wpm`);
      }
      if (day.cash > 0) parts.push(`$${Math.round(day.cash).toLocaleString()}`);
      if (day.boxes > 0) parts.push(`${day.boxes} box${day.boxes === 1 ? '' : 'es'}`);
      if (day.xp > 0) parts.push(`${day.xp.toLocaleString()} XP`);
      if (day.dq > 0) parts.push(`${day.dq} DQ`);

      setDisplay(panel.refs.todayRow, parts.length > 0);
      if (parts.length) setText(panel.refs.today, parts.join(' · '));

      // El detalle del dia va en el tooltip (la fila es corta a proposito):
      // mejor carrera, racha limpia, horario y ultima DQ.
      const detail = [];
      if (day.races > 0) {
        detail.push(`${day.races} measured race${day.races === 1 ? '' : 's'}`);
        if (day.best > 0) detail.push(`best ${day.best.toFixed(1)} WPM (${(day.bestAcc || 0).toFixed(1)}%)`);
        if (day.races > 0 && day.sumTarget > 0) detail.push(`average target ${(day.sumTarget / day.races).toFixed(0)}`);
        detail.push(`${day.clean} in a row without a DQ`);
        if (day.firstAt) detail.push(`${clockText(day.firstAt)}-${clockText(day.lastAt || Date.now())}`);
      } else {
        detail.push('no measured races yet today');
      }
      if (day.cash > 0) detail.push(`$${Math.round(day.cash).toLocaleString()} in race prizes`);
      if (day.xp > 0) detail.push(`${day.xp.toLocaleString()} XP awarded`);
      if (day.dq > 0) detail.push(`${day.dq} DQ (last ${clockText(day.dqAt) || '—'})`);
      detail.push('⚙ → report for the whole picture');
      panel.refs.todayRow.title = `Today: ${detail.join(' · ')}.`;
    }

    // Daily Mystery Box: the queue records the last claim and when the site will
    // hand out the next one, so the panel can show it without asking the site.
    const boxNext = Number(disk.get(BOX_STATE_NEXT)) || 0;
    const boxLast = Number(disk.get(BOX_STATE_LAST)) || 0;
    // Una fecha local absurda (version anterior) no se pinta como "en 100000 h";
    // se ignora para la cuenta atras y el estado cae a "ready", igual que
    // boxDue decide si toca reclamarla.
    const saneBoxNext = (() => {
      const now = Date.now();
      return boxNext > now && boxNext <= now + CONFIG.mysteryBox.retryAfterMs + 3600000 ? boxNext : 0;
    })();
    const boxLogRaw = disk.get(BOX_STATE_LOG, '[]');
    let boxLog = [];
    try {
      const parsed = JSON.parse(boxLogRaw || '[]');
      boxLog = Array.isArray(parsed) ? parsed.filter((item) => item && item.at) : [];
    } catch { /* historial corrupto: se ignora */ }

    // La hora que da el propio sitio manda sobre la estimacion local, pero solo
    // si es creible y viene como epoch; un valor raro se ignora.
    // Dentro de carrera el panel se pinta dos veces por segundo y este JSON
    // puede ser grande. La cuenta atras de la caja no necesita refrescarse tan
    // a menudo como el WPM: se lee como mucho una vez cada 15 s.
    const siteProfile = siteUser(15000);
    const countdownRaw = Number(siteProfile && siteProfile.rewardCountdown);
    const site = countdownRaw > 0
      ? boxWaitFromNext(countdownRaw, CONFIG.mysteryBox.retryAfterMs, { pastMeansReady: true, epochOnly: true })
      : null;
    const siteWait = site && !site.bad ? site.wait : 0;
    const siteBoxAt = siteWait > 0 ? Date.now() + siteWait : 0;
    // El garaje anuncia aqui que ha visto el Claim Now!: la tarjeta manda
    // sobre una espera local o del sitio que ya no es cierta. Caduca sola y
    // no se pisa si el cobro acaba de terminar.
    const boxReadyAt = Number(disk.get(BOX_STATE_READY, 0)) || 0;
    const boxSettled = boxLast && Date.now() - boxLast < CONFIG.mysteryBox.claimSettleMs;
    const boxReadySynced = boxReadyAt > 0 && Date.now() - boxReadyAt < BOX_STATE_READY_MS && !boxSettled;

    if (panel.refs.boxRow) {
      setDisplay(panel.refs.boxRow, Boolean(boxLast || saneBoxNext || siteBoxAt || boxReadySynced));

      // El tooltip lleva la ultima reclamacion completa (premio y cuando): es el
      // unico sitio donde cabe sin cargar la fila.
      const last = boxLog[0];
      panel.refs.boxRow.title = boxReadySynced
        ? `Claim Now! seen in the garage; the box is ready.${last ? ` Last claim: ${last.text} · ${elapsedText(last.at)}.` : ''}`
        : (last
          ? `Last claim: ${last.text} · ${elapsedText(last.at)}${boxLog.length > 1 ? ` · ${boxLog.length} recorded` : ''}`
          : 'Daily Mystery Box in the garage');
      if (boxReadySynced) {
        panel.root.dataset.box = 'ready';
        setText(panel.refs.box, 'ready now');
      } else if (siteBoxAt > Date.now()) {
        panel.root.dataset.box = 'waiting';
        setText(panel.refs.box, `in ${boxWaitText(siteBoxAt - Date.now())}`);
      } else if (!boxLast && saneBoxNext) {
        panel.root.dataset.box = 'coming';
        setText(panel.refs.box, 'never claimed');
      } else if (saneBoxNext) {
        panel.root.dataset.box = 'waiting';
        setText(panel.refs.box, `in ${boxWaitText(saneBoxNext - Date.now())}`);
      } else {
        panel.root.dataset.box = 'ready';
        setText(panel.refs.box, 'ready now');
      }
    }

    // La sesion del sitio, para verla tambien mientras corre la carrera. Si el
    // token no se puede leer, la fila se queda fuera en vez de mentir.
    if (panel.refs.sessionRow) {
      const exp = sessionExpiryAt();
      setDisplay(panel.refs.sessionRow, Boolean(exp));
      if (exp) {
        const left = exp - Date.now();
        if (left <= 0) {
          setText(panel.refs.sessionLeft, 'expired');
          setColor(panel.refs.sessionLeft, 'var(--bad)');
          panel.refs.sessionRow.title = 'Session token expired: the queue logs in again from the login page.';
        } else {
          setText(panel.refs.sessionLeft, left >= 3600000
            ? `${(left / 3600000).toFixed(1)}h`
            : `${Math.max(1, Math.round(left / 60000))}m`);
          setColor(panel.refs.sessionLeft, left <= 5 * 60000 ? 'var(--warn)' : '');
          panel.refs.sessionRow.title = `Site session: expires in ${Math.max(1, Math.round(left / 60000))} min. The queue renews it on the garage, between races.`;
        }
      }
    }

    // --- v7: cabecera, barra de estado y listas del registro --------------
    // La barra de abajo es la linea que se lee de un vistazo: LED, estado, modo,
    // WPM vivo, techo y la pista de teclas.
    const off = session.stopped;
    // La barra del panel de carrera tambien tiene que decir por que esta parado:
    // antes decia "resumes itself" incluso despues de un Stop manual. La marca
    // compartida trae el motivo y la retencion, asi que las dos ventanas cuentan
    // la misma historia.
    const activeStop = off ? lastStopInfo() : null;
    const stopLeft = activeStop ? Math.max(0, activeStop.endAt - Date.now()) : 0;
    // Un baneo terminal no tiene cuenta atras: sigue parado hasta que se borre
    // a mano, aunque la retencion de 24 h ya haya vencido.
    const terminalStop = Boolean(activeStop && !activeStop.clearedAt && activeStop.terminal);
    const stoppedNow = terminalStop || Boolean(activeStop && !activeStop.clearedAt && stopLeft > 0);
    const stopKind = stoppedNow ? stopReasonKind(activeStop.reason) : null;
    const stateText = off ? 'waiting' : breaking ? 'break' : session.paused ? 'paused' : (session.typing ? 'racing' : 'idle');
    setText(panel.refs.footState, stateText);
    setText(panel.refs.footMode, MODE);
    setText(panel.refs.footCap, Number.isFinite(CONFIG.wpm.hardCap) ? `cap ${CONFIG.wpm.hardCap}` : 'no cap');
    // El reloj tiene su propio hueco: en compacto se quedan WPM, precision y
    // reloj, y el modo, el techo y la pista desaparecen. Alt+M lo recorre.
    paintLiveClock(measured, wpm, acc);
    setText(panel.refs.footHint, off
      ? (terminalStop ? 'ban · until cleared'
        : stoppedNow ? `${stopKind.label} · ${stopWaitText(stopLeft)} left` : 'Alt+A resume')
      : session.paused ? 'resume' : 'Alt+S stop');
    // `off` ya ES session.stopped, asi que la rama que volvia a mirarlo nunca
    // se alcanzaba: el descanso se pintaba como "waiting" y no como "break".
    setText(panel.refs.liveTag, off
      ? (terminalStop ? 'stopped · ban'
        : stoppedNow ? `stopped · ${stopKind.label}` : 'stopped · Alt+A resume')
      : session.typing ? 'racing' : breaking ? 'break' : 'waiting');

    // El registro ocupa una vista entera y solo se ve al abrir LOG. Mientras
    // tanto basta con leer los retos para contarlos; las listas se pintan al
    // montar la vista, no en cada tick del arranque.
    if (!panel.mountedViews || panel.mountedViews.has('log')) {
      paintLogLists();
      paintChallengeList();
    } else {
      readChallengeProgress();
    }

    // Solo se repinta cuando entra una carrera nueva, no en cada tick.
    const last = raceHistory[raceHistory.length - 1];
    const signature = `${raceHistory.length}:${last ? last.at : 0}`;
    if (panel.historySig !== signature) {
      panel.historySig = signature;
      renderHistory();
    }
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
      box.innerHTML = '<div class="hist-empty">no races yet</div>';

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
    box.innerHTML = raceHistory
      .slice()
      .reverse()
      .map((item) => {
        // Desvio frente al objetivo de esa carrera. Verde si cae dentro de +-2%,
        // que es donde el autocalibrado deberia mantenerlo.
        const dev = Number.isFinite(item.target) && item.target > 0
          ? ((item.wpm - item.target) / item.target) * 100
          : null;
        const cell = dev === null
          ? '<b class="dev"></b>'
          : '<b class="dev" data-good="' + (Math.abs(dev) <= 2 ? '1' : '0') + '">'
            + (dev >= 0 ? '+' : '-') + Math.abs(dev).toFixed(1) + '%</b>';

        const place = Number(item.place);
        const placeText = Number.isFinite(place) && place > 0 ? '#' + place : '—';
        const placeAttr = Number.isFinite(place) && place >= 1 && place <= 3
          ? ' data-medal="' + place + '"'
          : '';
        const xp = Number(item.xp);
        const xpText = Number.isFinite(xp) && xp > 0 ? '+' + Math.round(xp) : '—';
        const cash = Number(item.cash);
        // WPM oficial del paquete de meta (reloj del servidor). Se pinta junto
        // al del modelo solo cuando el update lo trajo: si no, la fila queda
        // como siempre en vez de mostrar un cero o una raya.
        // `wpm` ya es el oficial cuando el paquete lo trajo; el del modelo se
        // queda como etiqueta pequena al lado. Las carreras sin paquete no
        // muestran etiqueta y conservan su unico numero.
        const model = Number(item.modelWpm);
        const modelText = Number.isFinite(model) && model > 0 ? 'model ' + model.toFixed(1) : '';
        const server = Number(item.serverWpm);
        const nitroChars = Number(item.nitroChars);
        const nitroWords = Number(item.nitroWords);
        const nitroTag = nitroChars > 0
          ? '<i class="nitro-tag" aria-label="nitro">N</i>'
          : '';
        const title = [
          clockText(item.at) || '—',
          Number.isFinite(place) && place > 0 ? '#' + place : null,
          Number.isFinite(xp) && xp > 0 ? '+' + Math.round(xp) + ' xp' : null,
          Number.isFinite(cash) && cash > 0 ? '+$' + Math.round(cash).toLocaleString('en-US') : null,
          item.acc.toFixed(1) + '% acc',
          'model ' + (Number.isFinite(model) && model > 0 ? model : item.wpm).toFixed(1) + ' wpm',
          Number.isFinite(server) && server > 0 ? 'server ' + server.toFixed(1) + ' wpm (packet clock)' : null,
          nitroChars > 0 ? 'nitro ' + (nitroWords || 1) + ' word · ' + nitroChars + ' ch' : null,
          Number.isFinite(item.target) ? 'target ' + item.target + ' wpm' : null,
        ].filter(Boolean).join(' · ');

        return '<div class="hist-row" title="' + title.replace(/"/g, '&quot;') + '">'
          + '<span>' + (clockText(item.at) || '—') + '</span>'
          + '<b class="place"' + placeAttr + '>' + placeText + '</b>'
          + '<b class="xp">' + xpText + '</b>'
          + '<b class="wpm">' + nitroTag + item.wpm.toFixed(1)
          + (modelText ? '<span class="model">' + modelText + '</span>' : '')
          + '</b>'
          + cell + '</div>';
      })
      .join('');

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

