
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

  // Los title largos de las cifras vivas se reescribian cuatro veces por
  // segundo aunque el texto fuese el mismo. El expando vive en el nodo, asi que
  // un panel nuevo empieza sin cache y no hereda valores del anterior.
  function setTitle(el, text) {
    if (!el || el.__ntaTitle === text) return;
    el.__ntaTitle = text;
    el.title = text;
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
      visuals: { ...visualPrefs },
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

  function tuneFilterText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function setTuneSectionOpen(section, open) {
    if (!section) return;
    const value = open ? 'true' : 'false';
    if (section.dataset.open !== value) section.dataset.open = value;
    const button = section.querySelector('[data-tune-disclosure]');
    if (button && button.getAttribute('aria-expanded') !== value) {
      button.setAttribute('aria-expanded', value);
    }
  }

  // Filtro de TUNE: una tarjeta se queda si su texto o el titulo de su bloque
  // contienen la consulta. No borra ajustes ni cambia valores; solo oculta lo
  // que no coincide para no recorrer una lista larga. Las secciones con
  // coincidencias se abren aunque estuvieran plegadas y recuperan su estado al
  // limpiar el filtro.
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
      if (query && show) {
        if (section.dataset.searchReveal !== '1') {
          section.dataset.beforeSearchOpen = section.dataset.open || 'true';
          section.dataset.searchReveal = '1';
        }
        setTuneSectionOpen(section, true);
      } else if (!query && section.dataset.searchReveal === '1') {
        setTuneSectionOpen(section, section.dataset.beforeSearchOpen !== 'false');
        delete section.dataset.beforeSearchOpen;
        delete section.dataset.searchReveal;
      }
    }

    setText(panel.refs.tuneCount, query ? `${visible}/${cards.length}` : `${cards.length} settings`);
    if (panel.refs.tuneClear) panel.refs.tuneClear.hidden = !query;
    if (panel.refs.tuneEmpty) {
      const empty = Boolean(query && visible === 0);
      panel.refs.tuneEmpty.hidden = !empty;
      if (empty) setText(panel.refs.tuneEmpty, `No setting matches “${input.value.trim()}”.`);
    }
  }

  function filterLog() {
    const input = panel.refs && panel.refs.logSearch;
    const view = panel.root && panel.root.querySelector('.v-log');
    if (!input || !view) return;
    const query = tuneFilterText(input.value);
    const items = Array.from(view.querySelectorAll('.log-item, .notice-item'));
    let visible = 0;
    for (const item of items) {
      const show = !query || tuneFilterText(item.textContent).includes(query);
      if (item.hidden !== !show) item.hidden = !show;
      if (show) visible += 1;
    }
    if (panel.refs.logClear) panel.refs.logClear.hidden = !query;
    setText(panel.refs.logCountFiltered, query ? `${visible}/${items.length}` : `${items.length} entries`);
    if (panel.refs.logEmpty) {
      const empty = Boolean(query && visible === 0);
      panel.refs.logEmpty.hidden = !empty;
      if (empty) setText(panel.refs.logEmpty, `No log entry matches “${input.value.trim()}”.`);
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

  function paintVisualControls() {
    if (!panel.refs || !panel.refs.rgbLab) return;
    if (panel.refs.rgbColorA) panel.refs.rgbColorA.value = visualPrefs.rgbColorA;
    if (panel.refs.rgbColorB) panel.refs.rgbColorB.value = visualPrefs.rgbColorB;
    if (panel.refs.rgbIntensity) panel.refs.rgbIntensity.value = String(visualPrefs.rgbIntensity);
    if (panel.refs.rgbRaceMode) panel.refs.rgbRaceMode.value = visualPrefs.rgbRaceMode;
    setText(panel.refs.rgbIntensityValue, `${visualPrefs.rgbIntensity}%`);
    for (const button of panel.refs.rgbLab.querySelectorAll('[data-rgb-speed]')) {
      const selected = Number(button.dataset.rgbSpeed) === visualPrefs.rgbSpeed;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.dataset.active = selected ? '1' : '0';
    }

    // Nivel de movimiento: el mismo segmentado que el perfil de ritmo. El
    // indice mueve el deslizador; el texto de cada boton solo lo cuenta.
    const motionSeg = panel.refs.motionSeg;
    if (motionSeg) {
      const index = Math.max(0, PANEL_MOTIONS.indexOf(visualPrefs.motion));
      const value = String(index);
      if (motionSeg.dataset.index !== value) motionSeg.dataset.index = value;
      for (const button of motionSeg.querySelectorAll('[data-motion-btn]')) {
        const selected = button.dataset.motionBtn === visualPrefs.motion;
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      }
    }

    // Pantalla: densidad, escala, contraste y foco de carrera. Los dos selects y
    // los dos interruptores comparten el mismo modelo que el RGB Lab.
    if (panel.refs.panelDensity) panel.refs.panelDensity.value = visualPrefs.density;
    if (panel.refs.panelScale) panel.refs.panelScale.value = String(visualPrefs.scale);
    if (panel.refs.cfg) {
      for (const button of panel.refs.cfg.querySelectorAll('[data-visual-toggle]')) {
        const on = button.dataset.visualToggle === 'highContrast'
          ? visualPrefs.highContrast === true
          : visualPrefs.raceFocus !== false;
        const value = on ? '1' : '0';
        if (button.dataset.on !== value) button.dataset.on = value;
        button.setAttribute('aria-checked', on ? 'true' : 'false');
      }
    }
  }

  function paintConfig() {
    if (!panel.refs || !panel.refs.cfg) return;

    paintVisualControls();
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
    // El maximo del campo sigue al techo: con una cuenta de 230 el input no
    // puede seguir diciendo que el tope manual es 119.
    if (panel.refs.customWpm) {
      const max = String(Math.max(16, wpmInt(CONFIG.wpm.hardCap) - 1));
      if (panel.refs.customWpm.max !== max) panel.refs.customWpm.max = max;
      panel.refs.customWpm.title = `Manual WPM target, 15-${max}. Empty or 0 returns to automatic calibration (${wpmInt(Number(CONFIG.calibration.topShare) * 100)}% of the account top).`;
    }

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
  // El techo puro y el que resulta de un top, para que el harness compruebe la
  // formula sin tener que leer una cuenta de verdad.
  window.__ntaDebug.ceilingFor = (top) => ceilingFor(top);
  window.__ntaDebug.applyCeiling = (top) => applyCeiling(top);
  window.__ntaDebug.topPaceTarget = (top, average) => topPaceTarget(top, average);
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
  window.__ntaDebug.autoUpdate = () => autoUpdateState();
  window.__ntaDebug.setAutoUpdate = (on) => setAutoUpdate(Boolean(on));
  window.__ntaDebug.armAutoUpdate = () => {
    autoUpdateBlockedUntil = 0;
    if (!autoUpdateArm) armAutoUpdate();
    return autoUpdateState();
  };
  window.__ntaDebug.tickAutoUpdate = (advanceMs = 0) => autoUpdateTick(Number(advanceMs) || 0);
  window.__ntaDebug.installAutoUpdateNow = () => installAutoUpdateNow();
  window.__ntaDebug.cancelAutoUpdate = () => cancelAutoUpdate('user');
  window.__ntaDebug.lastAutoUpdate = () => window.__ntaAutoUpdateLast || null;
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
    todayCache = null;
    todayCacheAt = 0;
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

  // Matriz de contexto pura: el banco comprueba precedencia y texto sin tocar
  // el motor ni esperar a que ocurra cada estado real.
  window.__ntaDebug.panelContextFor = (patch = {}) => derivePanelContext({
    now: Date.now(),
    ...patch,
  });

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
    for (const key of ['startedAt', 'endedAt', 'chars', 'nitroChars', 'correct', 'errors', 'pos', 'total', 'startIndex', 'lastAcceptedAt']) {
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
    if (Number.isFinite(Number(patch.raceWpmDrift))) session.raceWpmDrift = Number(patch.raceWpmDrift);
    if (Number.isFinite(Number(patch.raceAccDrift))) session.raceAccDrift = Number(patch.raceAccDrift);
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

  // El banco dibuja la grafica de ritmo sin esperar una carrera: vacia las
  // muestras y añade valores por el mismo camino que el muestreo real.
  window.__ntaDebug.rhythmReset = () => rhythmReset();
  window.__ntaDebug.rhythmAdd = (value) => rhythmAdd(Number(value));

  // Una carrera registrada por el camino normal (recordRace) y el estado de la
  // eleccion entre copias. Sirven para probar el XP real y el guardia sin
  // teclear una carrera de verdad.
  window.__ntaDebug.recordRace = () => recordRace();
  window.__ntaDebug.countRace = () => countRace();
  window.__ntaDebug.freshTanda = (reason) => startFreshTanda(String(reason || ''));
  window.__ntaDebug.tandaSummary = () => tandaSummary();
  // Cada tecla del bucle real pasa por noteKeystroke; el banco usa el mismo
  // camino para probar la racha limpia sin teclear una carrera.
  window.__ntaDebug.keyStroke = (ok = true) => noteKeystroke(Boolean(ok));
  window.__ntaDebug.cleanStreak = () => ({
    now: session.cleanStreak,
    best: session.cleanBest,
    pulseAt: session.streakPulseAt,
  });

  // El banco aplica el paquete oficial por el mismo camino que el juego y lee
  // la aportacion guardada para comprobar la correccion de la media.
  window.__ntaDebug.serverWpm = (value, key = '') => applyServerWpm(Number(value), String(key || ''));
  // Cierre de carrera con premio por el mismo camino que el evento del juego.
  window.__ntaDebug.applyRaceResult = (result = {}) => {
    applyRaceResult({ ...result }, 'debug');
    return raceHistory[raceHistory.length - 1] || null;
  };
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
    // El objetivo contra el que se corrige el trim es el de la carrera (con la
    // curva del dia), no el centro de la tanda: es el numero con el que se
    // tecleo esta carrera y contra el que se mide el paquete oficial.
    const target = raceWpm();
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
  // Arranque medido: cuanto tarda el IIFE desde su primera instruccion hasta
  // el final de boot(), y cuantas veces se armaron el CSS y el HTML del panel.
  // En garaje los dos contadores tienen que quedarse en cero.
  window.__ntaDebug.boot = () => ({
    startedAt: BOOT_STARTED_AT,
    readyAt: BOOT_READY_AT,
    ms: BOOT_READY_AT ? Math.round(BOOT_READY_AT - BOOT_STARTED_AT) : null,
    cssBuilds: perfCounters.panelCssBuilds,
    htmlBuilds: perfCounters.panelHtmlBuilds,
  });
  window.__ntaDebug.paintEveryMs = () => panelPaintEveryMs();
  window.__ntaDebug.typing = () => Boolean(session.typing);
  // Muestra de cadencia pura: cuanto tarda el motor por tecla a un objetivo
  // dado. Subir el techo solo cambia el numero del panel si la cadencia no
  // llega, asi que el harness mide el motor y no la etiqueta.
  // Objetivo de la carrera en curso y la banda de desvio que puede sortear, para
  // que el harness compruebe que dos carreras no son la misma foto.
  window.__ntaDebug.raceTarget = () => ({
    wpm: raceWpm(),
    planned: plannedRaceWpm(),
    band: wpmRangeFor(profile.targetWPM),
    curve: dayCurveAt(),
    accuracy: raceAccuracyGoal(),
    sessionWpm: profile.targetWPM,
    sessionAccuracy: profile.accuracyGoal,
    drift: Number(session.raceWpmDrift) || 0,
    accDrift: Number(session.raceAccDrift) || 0,
  });
  window.__ntaDebug.raceWpmFor = (base, drift) => raceWpmAt(base, drift);
  // Ritmo con desvio recortado a la banda calibrada: el harness comprueba el
  // recorte con el suelo y el techo sin depender de la hora real.
  window.__ntaDebug.raceWpmInBand = (planned, drift) => raceWpmInBand(Number(planned), Number(drift) || 0);
  // Calendario: descanso y curva diurna. `at` explicito para que el harness
  // pueda preguntar por un dia y una hora sin tocar el reloj de la maquina.
  window.__ntaDebug.calendar = (at = Date.now()) => ({
    restDay: isRestDay(at),
    restPerWeek: restDaysPerWeek(),
    gate: restGate(at),
    curve: dayCurveAt(at),
  });
  window.__ntaDebug.isRestDay = (at) => isRestDay(at);
  window.__ntaDebug.dayCurve = (hour) => dayCurve(hour);
  window.__ntaDebug.localDayKey = (at) => localDayKey(at);
  window.__ntaDebug.rollRaceDrift = () => rollRaceDrift();
  window.__ntaDebug.paceSample = (target, keys = 2000) => {
    const text = 'the quick brown fox jumps over the lazy dog and then some more words to type ';
    const count = Math.max(2, Math.round(Number(keys) || 2000));
    const wpm = Number(target) > 0 ? Number(target) : profile.targetWPM;
    // El trim y el modo cuidadoso son estado de la tanda, no del modelo: la
    // muestra se toma con los dos neutralizados para que mida la cadencia del
    // motor y no lo que hoy pida la sesion.
    const savedTrim = session.trim;
    const savedCareful = session.carefulRaces;
    const savedSpread = session.nitroSpread;
    const savedFatigue = fatigueAt;
    let total = 0;
    session.trim = 1;
    session.carefulRaces = 0;
    // La deuda del nitro y la fatiga tampoco son el modelo: suman milisegundos
    // fijos por tecla, y un fijo pesa mas cuanto mas rapido se pide (medido: 3%
    // a 196 WPM, 1% a 110). Medir el motor es medir sin ellas.
    session.nitroSpread = 0;
    fatigueAt = 0;
    try {
      for (let i = 1; i < count; i++) total += nextDelay(text, i % (text.length - 1), wpm);
    } finally {
      session.trim = savedTrim;
      session.carefulRaces = savedCareful;
      session.nitroSpread = savedSpread;
      fatigueAt = savedFatigue;
    }
    const msPerChar = total / (count - 1);
    return {
      target: wpm,
      keys: count,
      msPerChar: Number(msPerChar.toFixed(2)),
      wpm: Number((60000 / (msPerChar * 5)).toFixed(1)),
    };
  };
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
      // Sembrar no es cerrar una carrera: el destello de resultado no se dispara
      // por una foto del banco.
      panel.resultSig = undefined;
      panel.resultCount = undefined;
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
      filterLog();
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
    filterLog();
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
            ? `${wpmInt(item.wpm)}${dev === null ? '' : ` ${dev >= 0 ? '+' : ''}${dev.toFixed(1)}%`}`
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
            : `${day.date}: ${bits.join(', ')} · ${wpmInt(avg)} WPM against ${wpmInt(target)}`;

          const val = document.createElement('b');
          val.textContent = avg === null ? '—' : String(wpmInt(avg));
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
    filterLog();
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

  // Un pulso de una sola vez: quita la clase y la vuelve a poner en el
  // siguiente frame para que la animacion se reinicie sin forzar un layout
  // sincrono dentro de la carrera. El CSS decide si el nivel de movimiento
  // lo deja correr; la clase solo marca el hecho.
  function pulseOnce(el, className) {
    if (!el) return;
    if (!el.__ntaPulseCleanup) {
      el.__ntaPulseCleanup = true;
      el.addEventListener('animationend', (event) => {
        if (event.target !== el) return;
        el.classList.remove('nt-pulse', 'nt-flash');
      });
    }
    el.classList.remove(className);
    if (typeof requestAnimationFrame === 'function') {
      if (el.__ntaPulseFrame) cancelAnimationFrame(el.__ntaPulseFrame);
      el.__ntaPulseFrame = requestAnimationFrame(() => {
        el.__ntaPulseFrame = 0;
        if (el.isConnected) el.classList.add(className);
      });
    } else {
      el.classList.add(className);
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

    if (data.visuals && typeof data.visuals === 'object') {
      visualPrefs = normalizeVisualPrefs(data.visuals);
      saveVisualPrefs();
      done.push('visuals applied');
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

  let panelReclampTimer = 0;
  let panelResizeBound = false;
  let updateTickerBound = false;

  // Escala, densidad o un cambio de ventana pueden dejar el panel fuera del
  // viewport. Se vuelve a la ultima posicion guardada (placeHost la recorta al
  // tamano nuevo) en vez de arrastrar una posicion que ya no cabe.
  function schedulePanelReclamp() {
    if (panelReclampTimer) return;
    panelReclampTimer = setTimeout(() => {
      panelReclampTimer = 0;
      if (!panel.host) return;
      if (!disk.get(KEYS.panelPosition)) return;
      restorePosition();
      savePosition();
    }, 60);
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

    // La cabecera tambien es un control de teclado: flechas mueven 8 px,
    // Shift+flecha 24 px y Home vuelve a la esquina. Es el mismo camino que el
    // puntero (placeHost recorta y savePosition persiste), asi que no hay dos
    // posiciones que se puedan desincronizar.
    handle.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      if (event.target !== handle && event.target.closest
        && event.target.closest('button, input, select, textarea')) return;
      event.preventDefault();
      const rect = panel.host.getBoundingClientRect();
      const step = event.shiftKey ? 24 : 8;
      let left = rect.left;
      let top = rect.top;
      if (event.key === 'Home') {
        left = 16;
        top = 16;
      } else if (event.key === 'ArrowLeft') left -= step;
      else if (event.key === 'ArrowRight') left += step;
      else if (event.key === 'ArrowUp') top -= step;
      else top += step;
      // El panel puede ser mas alto que la ventana: el teclado mantiene al
      // menos la cabecera dentro (44 px) en vez de exigir el panel entero,
      // que dejaria el modo teclado sin sitio para bajar.
      const maxLeft = Math.max(0, window.innerWidth - panel.host.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - 44);
      panel.host.style.left = `${clamp(left, 0, maxLeft)}px`;
      panel.host.style.top = `${clamp(top, 0, maxTop)}px`;
      panel.host.style.bottom = 'auto';
      savePosition();
    });
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
    shadow.innerHTML = panelHtml();

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
      contextBanner: pick('.context-banner'),
      contextTitle: pick('[data-field="contextTitle"]'),
      contextDetail: pick('[data-field="contextDetail"]'),
      contextPill: pick('[data-field="contextPill"]'),
      hudRow: pick('.hud-row'),
      hud: pick('[data-field="hud"]'),
      clockRow: pick('.clock-row'),
      clock: pick('[data-field="clock"]'),
      resultRow: pick('.result-row'),
      result: pick('[data-field="result"]'),
      streakRow: pick('.streak-row'),
      streak: pick('[data-field="streak"]'),
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
      focusStrip: pick('[data-field="focusStrip"]'),
      focusState: pick('[data-field="focusState"]'),
      focusNext: pick('[data-field="focusNext"]'),
      focusAnnounce: pick('[data-field="focusAnnounce"]'),
      rhythmWrap: pick('[data-field="rhythmWrap"]'),
      rhythmChart: pick('[data-field="rhythmChart"]'),
      rhythmLine: pick('[data-field="rhythmLine"]'),
      rhythmBand: pick('[data-field="rhythmBand"]'),
      rhythmTarget: pick('[data-field="rhythmTarget"]'),
      rhythmNote: pick('[data-field="rhythmNote"]'),
      panelDensity: pick('[data-field="panelDensity"]'),
      panelScale: pick('[data-field="panelScale"]'),
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
      rgbLab: pick('[data-field="rgbLab"]'),
      rgbColorA: pick('[data-field="rgbColorA"]'),
      rgbColorB: pick('[data-field="rgbColorB"]'),
      rgbIntensity: pick('[data-field="rgbIntensity"]'),
      rgbIntensityValue: pick('[data-field="rgbIntensityValue"]'),
      rgbRaceMode: pick('[data-field="rgbRaceMode"]'),
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
      acctHours: pick('[data-field="acctHours"]'),
      acctRest: pick('[data-field="acctRest"]'),
      acctCurve: pick('[data-field="acctCurve"]'),
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
      logSearch: pick('[data-field="logSearch"]'),
      logClear: pick('[data-field="logClear"]'),
      logCountFiltered: pick('[data-field="logCountFiltered"]'),
      logEmpty: pick('[data-field="logEmpty"]'),
      noticeList: pick('[data-field="noticeList"]'),
      aboutVer: pick('[data-field="aboutVer"]'),
      infoCap: pick('[data-field="infoCap"]'),
      gear: pick('.gear'),
      cfg: pick('.cfg'),
      cfgText: pick('[data-field="cfgText"]'),
      cfgNote: pick('[data-field="cfgNote"]'),
      up: pick('[data-field="up"]'),
      upInfo: pick('[data-field="upInfo"]'),
      upAuto: pick('[data-field="upAuto"]'),
      updateAuto: pick('[data-update-toggle="auto"]'),
      updateCancel: pick('[data-act="updateCancel"]'),
      motionSeg: pick('[data-field="motionSeg"]'),
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

    // Auto-instalacion: el interruptor vive en la tarjeta Updates. El contador
    // es un boton doble: clic = instalar ya, Escape = cancelar (el aviso sigue
    // ahi y el reintento llega a los 30 min). Ningun aviso se convierte en
    // instalacion sin pasar por aqui.
    if (panel.refs.updateAuto) {
      panel.refs.updateAuto.addEventListener('click', (event) => {
        event.stopPropagation();
        setAutoUpdate(autoUpdateEnabled() !== true);
      });
    }
    if (panel.refs.updateCancel) {
      panel.refs.updateCancel.addEventListener('click', (event) => {
        event.stopPropagation();
        if (autoUpdateState().phase === 'armed') installAutoUpdateNow();
        else cancelAutoUpdate('user');
      });
      panel.refs.updateCancel.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        cancelAutoUpdate('user');
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
        btn      });

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
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          panel.refs.tuneSearch.value = '';
          filterTune();
          return;
        }
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
    if (panel.refs.logSearch) {
      panel.refs.logSearch.addEventListener('input', filterLog);
      panel.refs.logSearch.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        panel.refs.logSearch.value = '';
        filterLog();
      });
    }
    if (panel.refs.logClear) {
      panel.refs.logClear.addEventListener('click', (event) => {
        event.stopPropagation();
        if (panel.refs.logSearch) panel.refs.logSearch.value = '';
        filterLog();
        if (panel.refs.logSearch) panel.refs.logSearch.focus();
      });
    }
    filterTune();
    filterLog();

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
        panel.refs.acctRefresh      });
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
        setCustomWpm(panel.refs.customWpm.value);
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
        setCustomAccuracy(panel.refs.customAcc.value);
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
    // Una sola escucha por ventana aunque el panel se reconstruya: cada
    // montaje traia la suya y el latido puede remontar el panel tras navegar.
    if (!panelResizeBound) {
      panelResizeBound = true;
      window.addEventListener('resize', schedulePanelReclamp);
    }

    panel.refs.toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setPaused(!session.paused);
      panel.refs.toggle    });

    panel.refs.stop.addEventListener('click', (event) => {
      event.stopPropagation();
      // Parado no hay nada que parar: el mismo boton vuelve a arrancar. Hace
      // lo mismo que Alt+A, con las mismas puertas (tope diario y horas).
      if (session.stopped) resumeAuto();
      else requestStop();
      panel.refs.stop    });

    panel.refs.collapse.addEventListener('click', (event) => {
      event.stopPropagation();
      const collapsed = panel.root.dataset.collapsed !== 'true';
      applyCollapsed(collapsed);
      restorePosition();
      if (!collapsed) updatePanel(true);
      panel.refs.collapse    });

    // El chip del modo no es un interruptor: dice AUTO y nada mas. Parar es
    // cosa de Stop / Esc, y la cola se rearma sola.

    // El chip LEGIT cambia de perfil al pulsarlo: soft -> balanced -> fast.
    if (panel.refs.pace) {
      panel.refs.pace.addEventListener('click', (event) => {
        event.stopPropagation();
        const index = PACE_ORDER.indexOf(paceProfile);
        setPaceProfile(PACE_ORDER[(index + 1) % PACE_ORDER.length]);
        panel.refs.pace      });
    }

    // Tema: un solo escuchador para las seis muestras. El CSS hace el resto.
    if (panel.refs.themes) {
      panel.refs.themes.addEventListener('click', (event) => {
        const chip = event.target && event.target.closest ? event.target.closest('[data-theme-btn]') : null;
        if (!chip) return;
        event.stopPropagation();
        setTheme(chip.dataset.themeBtn);
        chip      });
    }

    if (panel.refs.rgbLab) {
      panel.refs.rgbLab.addEventListener('click', (event) => {
        const button = event.target && event.target.closest ? event.target.closest('[data-rgb-speed]') : null;
        if (!button) return;
        event.stopPropagation();
        setVisualPref('rgbSpeed', Number(button.dataset.rgbSpeed));
        paintVisualControls();
      });
    }
    for (const [ref, key] of [[panel.refs.rgbColorA, 'rgbColorA'], [panel.refs.rgbColorB, 'rgbColorB']]) {
      if (!ref) continue;
      ref.addEventListener('input', (event) => {
        event.stopPropagation();
        setVisualPref(key, event.target.value);
      });
    }
    if (panel.refs.rgbIntensity) {
      panel.refs.rgbIntensity.addEventListener('input', (event) => {
        event.stopPropagation();
        setVisualPref('rgbIntensity', Number(event.target.value));
        paintVisualControls();
      });
    }
    if (panel.refs.rgbRaceMode) {
      panel.refs.rgbRaceMode.addEventListener('change', (event) => {
        event.stopPropagation();
        setVisualPref('rgbRaceMode', event.target.value);
        paintVisualControls();
      });
    }
    for (const [ref, key] of [[panel.refs.panelDensity, 'density'], [panel.refs.panelScale, 'scale']]) {
      if (!ref) continue;
      ref.addEventListener('change', (event) => {
        event.stopPropagation();
        setVisualPref(key, key === 'scale' ? Number(event.target.value) : event.target.value);
        paintVisualControls();
      });
    }

    // ⚙ lleva a la vista de ajustes (y vuelve): es el mismo cajon de siempre,
    // ahora como una pestaña mas del rail.
    if (panel.refs.gear) {
      panel.refs.gear.addEventListener('click', (event) => {
        event.stopPropagation();
        showTab(panel.root.dataset.tab === 'tune' ? 'stats' : 'tune');
        panel.refs.gear      });
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

        if (chip.hasAttribute('data-tune-disclosure')) {
          const section = chip.closest('.tune-sec');
          const open = !section || section.dataset.open !== 'true';
          setTuneSectionOpen(section, open);
          if (section && section.dataset.searchReveal === '1') {
            section.dataset.beforeSearchOpen = open ? 'true' : 'false';
          }
          return;
        }

        if (chip.dataset.pace) {
          setPaceProfile(chip.dataset.pace);
        } else if (chip.dataset.motionBtn) {
          setVisualPref('motion', chip.dataset.motionBtn);
          paintVisualControls();
        } else if (chip.dataset.visualToggle) {
          const key = chip.dataset.visualToggle;
          setVisualPref(key, key === 'highContrast' ? visualPrefs.highContrast !== true : visualPrefs.raceFocus === false);
          paintVisualControls();
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
          // En canary el boton vuelve a la release estable; en estable abre el
          // build de prueba. Ninguno de los dos cambia la release por si solo.
          const url = CHANNEL === 'canary' ? UPDATE_STABLE_URL : UPDATE_CANARY_URL;
          try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* bloqueado */ }
        }

        chip      });
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
        panel.refs.liveLoad      });
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
        panel.refs.liveClear      });
    }
    for (const select of [panel.refs.livePickA, panel.refs.livePickB]) {
      if (select) select.addEventListener('change', paintLivePick);
    }
    if (panel.refs.livePickExport) {
      panel.refs.livePickExport.addEventListener('click', (event) => {
        event.stopPropagation();
        downloadLiveCompareCsv();
        panel.refs.livePickExport      });
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
      if (panel.refs.seasonFill) panel.refs.seasonFill.style.transform = 'scaleX(0)';
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
    if (panel.refs.seasonFill) {
      const scale = `scaleX(${(progress / 100).toFixed(4)})`;
      if (panel.refs.seasonFill.style.transform !== scale) panel.refs.seasonFill.style.transform = scale;
    }

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

  // El contexto es una derivacion del estado real, no un segundo motor. La
  // precedencia importa: una cuenta bloqueada no debe parecer solo detenida y
  // una carrera pausada manda sobre cualquier espera de garaje.
  function derivePanelContext(input = {}) {
    const now = Number(input.now) || Date.now();
    if (input.banned) {
      return { key: 'banned', title: 'Account blocked', detail: 'Clear the ban in the garage before racing again.', pill: 'BAN' };
    }
    if (input.offline) {
      return { key: 'offline', title: 'Waiting for network', detail: 'The queue resumes when the connection returns.', pill: 'OFFLINE' };
    }
    if (Number(input.blockedUntil) > now) {
      const left = Math.max(1, Math.ceil((Number(input.blockedUntil) - now) / 60000));
      return { key: 'blocked', title: 'Cooling down', detail: `Site block clears in about ${left} min.`, pill: 'BLOCKED' };
    }
    if (input.stopped) {
      return { key: 'stopped', title: 'Stopped', detail: input.reason || 'Press Resume when you are ready.', pill: 'STOPPED' };
    }
    if (input.stopAfterRace) {
      return { key: 'stopped', title: 'Stopping after this race', detail: 'The current race finishes before the queue stops.', pill: 'PENDING' };
    }
    if (Number(input.breakUntil) > now) {
      const left = Math.max(1, Math.ceil((Number(input.breakUntil) - now) / 60000));
      return { key: 'break', title: 'Taking a human break', detail: `Next race in about ${left} min.`, pill: 'BREAK' };
    }
    if (input.paused) {
      return { key: 'paused', title: 'Typing paused', detail: 'Resume now or wait for the short auto-resume.', pill: 'PAUSED' };
    }
    if (input.typing) {
      return { key: 'running', title: 'Race in progress', detail: 'Pace and accuracy are following this account.', pill: 'LIVE' };
    }
    if (input.activeGate) {
      return { key: 'scheduled', title: 'Outside active hours', detail: `The queue opens at ${input.activeGate.nextText || 'the next window'}.`, pill: 'SCHEDULED' };
    }
    if (input.restGate) {
      return { key: 'rest', title: 'Rest day', detail: 'This account does not race again until tomorrow.', pill: 'REST' };
    }
    if (input.dailyReached || input.limitReached) {
      return { key: 'limit', title: 'Session complete', detail: input.reason || 'A fresh session is ready when you resume.', pill: 'LIMIT' };
    }
    return { key: 'waiting', title: 'Ready when you are', detail: 'The queue is waiting for the next race.', pill: 'AUTO' };
  }

  function currentPanelContext() {
    const now = Date.now();
    return derivePanelContext({
      now,
      banned: terminalBanActive(),
      offline: !onlineNow(),
      blockedUntil: siteBlockedUntil(),
      stopped: session.stopped,
      stopAfterRace: session.stopAfterRace,
      breakUntil: session.breakUntil,
      paused: session.paused,
      typing: session.typing,
      activeGate: activeGate(now),
      restGate: restGate(now),
      dailyReached: dailyLimitReached(),
      limitReached: limitReached(),
      reason: capReason(),
    });
  }

  function paintPanelContext(context) {
    if (!panel.root || !panel.refs.contextBanner) return;
    const next = context || currentPanelContext();
    if (panel.root.dataset.context !== next.key) panel.root.dataset.context = next.key;
    if (panel.refs.contextBanner.dataset.context !== next.key) panel.refs.contextBanner.dataset.context = next.key;
    setText(panel.refs.contextTitle, next.title);
    setText(panel.refs.contextDetail, next.detail);
    setText(panel.refs.contextPill, next.pill);
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
    flashValue(panel.refs.live, measured ? wpmInt(wpm) : '—');
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
    flashValue(panel.refs.liveNow, stale || recentPace === null ? '—' : wpmInt(recentPace));
    flashValue(panel.refs.liveNowAcc, stale || recentAcc === null ? '—' : `${recentAcc.toFixed(1)}%`);
    setGood(panel.refs.liveNow, stale ? false : null);
    setGood(panel.refs.liveNowAcc,
      stale ? false : recentAcc === null ? null : recentAcc >= profile.accuracyGoal);
    setTitle(panel.refs.liveNow, stale
      ? frozenWarning
      : recentPace === null
        ? `Recent pace: needs at least ${LIVE_PACE_MIN_MS / 1000} seconds and a few accepted keys inside the last ${LIVE_PACE_WINDOW_MS / 1000} seconds.`
        : `Recent pace: ${recentPace.toFixed(1)} WPM over the last ${LIVE_PACE_WINDOW_MS / 1000} seconds of accepted keys. The session row is the cumulative average.`);
    setTitle(panel.refs.liveNowAcc, stale
      ? frozenWarning
      : recentAcc === null
        ? `Recent accuracy: needs at least ${LIVE_PACE_MIN_MS / 1000} seconds and a few accepted keys inside the last ${LIVE_PACE_WINDOW_MS / 1000} seconds.`
        : `Recent accuracy: ${recentAcc.toFixed(1)}% over the last ${LIVE_PACE_WINDOW_MS / 1000} seconds of accepted keys (errors / typed, the game formula). The accuracy above is cumulative.`);

    let ageText = '—';
    if (session.endedAt) ageText = 'final';
    else if (age !== null && (racing || measured)) {
      ageText = stale ? `stalled ${Math.round(age / 1000)}s` : `${(age / 1000).toFixed(1)}s`;
    }
    setText(panel.refs.liveAge, ageText);
    setGood(panel.refs.liveAge, stale ? false : null);
    setTitle(panel.refs.liveAge, stale
      ? frozenWarning
      : 'Data age: seconds since the game accepted the last key. Refreshed four times per second; amber means the race has gone quiet.');
    return { pace: recentPace, accuracy: recentAcc, stale };
  }

  /* --------------------------------------------------------------------------
   * Foco de carrera y grafica de ritmo
   * ------------------------------------------------------------------------ */
  // La tira de foco responde a tres preguntas durante la carrera sin obligar a
  // mirar la tabla: sigo en marcha, cuanto queda y que ritmo mantener. El
  // aria-live vive en una region aparte y solo cambia por tramos (cuartos de
  // carrera), para no soltar una frase por tecla aceptada.
  let focusAnnounceKey = '';

  function paintRaceFocus(measured, wpm, acc) {
    if (!panel.refs || !panel.refs.focusStrip) return;
    const running = Boolean(session.typing) && !session.endedAt;
    if (!running) {
      focusAnnounceKey = '';
      return;
    }
    const total = Math.max(0, Number(session.total) || 0);
    const pos = clamp(session.pos, 0, total || 0);
    const left = total > 0 ? Math.max(0, total - pos) : null;
    const target = Math.round(raceWpm());
    setText(panel.refs.focusState, 'LIVE');
    setText(panel.refs.focusNext, left === null
      ? `hold ${target} wpm`
      : left === 0 ? `finish · hold ${target} wpm`
        : `${left} left · hold ${target} wpm`);
    const bucket = total > 0 ? Math.floor((pos / total) * 4) : 0;
    const key = `${session.startedAt}:${bucket}`;
    if (key !== focusAnnounceKey && panel.refs.focusAnnounce) {
      focusAnnounceKey = key;
      setText(panel.refs.focusAnnounce, measured
        ? `Race in progress: ${pos} of ${total || '?'} at ${wpmInt(wpm)} wpm, ${acc.toFixed(1)}% accuracy.`
        : 'Race in progress.');
    }
  }

  // Ritmo: una muestra por segundo de la velocidad reciente (no la media de la
  // carrera) contra el objetivo, con una banda de +-2 wpm. La grafica no
  // aparece hasta tener tres muestras y se vacia al empezar otra carrera.
  const RHYTHM_MAX = 24;
  const RHYTHM_MIN = 3;
  let rhythmSamples = [];
  let rhythmLastSampleAt = 0;
  let rhythmRaceKey = '';
  let rhythmPaintEl = null;
  let rhythmPaintSig = '';

  function rhythmReset() {
    rhythmSamples = [];
    rhythmLastSampleAt = 0;
    paintRhythm();
    return true;
  }

  function rhythmAdd(value) {
    const wpm = Math.round(Number(value));
    if (!Number.isFinite(wpm) || wpm <= 0) return false;
    rhythmSamples.push(wpm);
    if (rhythmSamples.length > RHYTHM_MAX) rhythmSamples.shift();
    paintRhythm();
    return true;
  }

  function maybeSampleRhythm(measured, recent) {
    if (!measured || !session.typing || session.endedAt || !recent) return;
    if (recent.stale || recent.pace === null) return;
    const key = `${session.startedAt}:${session.endedAt}`;
    if (key !== rhythmRaceKey) {
      rhythmRaceKey = key;
      rhythmSamples = [];
      rhythmLastSampleAt = 0;
    }
    const now = Date.now();
    if (rhythmLastSampleAt && now - rhythmLastSampleAt < 1000) return;
    rhythmLastSampleAt = now;
    rhythmAdd(recent.pace);
  }

  function paintRhythm() {
    if (!panel.refs || !panel.refs.rhythmWrap) return;
    const wrap = panel.refs.rhythmWrap;
    // El repintado completo corre a 1-2 Hz con las mismas muestras casi
    // siempre. La firma incluye el nodo para que un panel remontado pinte una
    // vez aunque las muestras no hayan cambiado.
    const sig = `${rhythmSamples.length}:${rhythmSamples.join(',')}:${raceWpm()}`;
    if (wrap === rhythmPaintEl && sig === rhythmPaintSig) return;
    rhythmPaintEl = wrap;
    rhythmPaintSig = sig;
    const ready = rhythmSamples.length >= RHYTHM_MIN;
    const readyFlag = ready ? '1' : '0';
    if (wrap.dataset.ready !== readyFlag) wrap.dataset.ready = readyFlag;
    const line = panel.refs.rhythmLine;
    if (!ready) {
      if (line) line.setAttribute('points', '');
      return;
    }
    const avgRaw = rhythmSamples.reduce((sum, value) => sum + value, 0) / rhythmSamples.length;
    const avg = Math.round(avgRaw);
    const planned = Number(raceWpm());
    const target = Number.isFinite(planned) && planned > 0 ? Math.round(planned) : avg;
    // El eje se ajusta a lo que se esta viendo, con un minimo de 8 wpm para que
    // una racha plana no se convierta en una linea que salta de borde a borde.
    let min = Math.min(...rhythmSamples, target - 2);
    let max = Math.max(...rhythmSamples, target + 2);
    if (max - min < 8) {
      const mid = (min + max) / 2;
      min = mid - 4;
      max = mid + 4;
    }
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;
    const yFor = (value) => clamp(30 - ((value - min) / (max - min)) * 30, 0, 30);
    const count = rhythmSamples.length;
    if (line) {
      const points = rhythmSamples
        .map((value, index) => `${((index / (count - 1)) * 100).toFixed(2)},${yFor(value).toFixed(2)}`)
        .join(' ');
      line.setAttribute('points', points);
    }
    const bandTop = yFor(target + 2);
    const bandBottom = yFor(target - 2);
    if (panel.refs.rhythmBand) {
      const height = Math.max(0.8, bandBottom - bandTop);
      panel.refs.rhythmBand.setAttribute('y', bandTop.toFixed(2));
      panel.refs.rhythmBand.setAttribute('height', height.toFixed(2));
    }
    if (panel.refs.rhythmTarget) {
      const y = yFor(target).toFixed(2);
      panel.refs.rhythmTarget.setAttribute('y1', y);
      panel.refs.rhythmTarget.setAttribute('y2', y);
    }
    const summary = `${count} samples · ${avg} wpm avg · target ${target} wpm`;
    setText(panel.refs.rhythmNote, summary);
    if (panel.refs.rhythmChart) {
      panel.refs.rhythmChart.setAttribute('aria-label', `Rhythm chart: ${summary}. The band is two wpm either side of the target.`);
    }
  }

  function paintRaceProgress() {
    const total = session.total;
    const pos = clamp(session.pos, 0, total || 0);
    const racePct = total > 0 ? progressPct(pos, total) : 0;
    setText(panel.refs.progress, total > 0 ? `${pos}/${total}` : '—');
    if (panel.refs.progFill) {
      // scaleX en vez de width: el navegador anima el transform sin re-layout.
      const scale = `scaleX(${(racePct / 100).toFixed(4)})`;
      if (panel.refs.progFill.style.transform !== scale) panel.refs.progFill.style.transform = scale;
    }
    if (panel.root) {
      const fill = (racePct / 100).toFixed(4);
      if (panel.root.style.getPropertyValue('--race-fill') !== fill) {
        panel.root.style.setProperty('--race-fill', fill);
      }
    }
  }

  function paintLiveClock(measured, wpm, acc) {
    setText(panel.refs.footWpm, measured ? `${wpmInt(wpm)} wpm` : '— wpm');
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
    const recent = paintLiveNumbers(measured, wpm, acc);
    paintRaceFocus(measured, wpm, acc);
    paintRaceProgress();
    paintLiveClock(measured, wpm, acc);
    maybeSampleRhythm(measured, recent);
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
      // La cuenta atras de auto-instalacion se rearma sola cuando vuelve a
      // haber un hueco sin carrera; con el panel en segundo plano no corre.
      maybeArmAutoUpdate();
      paintAutoUpdate();
      if (panel.refs.update.dataset.bound !== '1') {
        panel.refs.update.dataset.bound = '1';
        panel.refs.update.addEventListener('pointerdown', (event) => event.stopPropagation());
        panel.refs.update.addEventListener('click', (event) => {
          event.stopPropagation();
          openUpdateDownload();
        });
        // La consulta y su tick son por ventana, no por nodo: remontar el panel
        // no debe dejar un intervalo huerfano por cada montaje.
        checkForUpdate();
        if (!updateTickerBound) {
          updateTickerBound = true;
          // Tick corto: checkForUpdate no repite una comprobacion buena hasta
          // los 5 min; al volver a la pestana tambien se pregunta sin esperar.
          setInterval(checkForUpdate, UPDATE_RECHECK_MS);
        }
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
    paintPanelContext(currentPanelContext());

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
    // El objetivo que se pinta es el de ESTA carrera (curva del dia y desvio
    // incluidos); el centro de la tanda sigue en la tarjeta de la cuenta.
    setText(panel.refs.target, `${raceWpm()} · ${raceAccuracyGoal().toFixed(1)}%`);
    // Los dos numeros grandes golpean la escala cuando cambian de verdad (parte
    // entera), que es lo que se mira durante la carrera. El mismo pintado corre
    // a 4 Hz entre repintados completos (updateLiveReadout).
    paintLiveNumbers(measured, wpm, acc);
    paintRaceFocus(measured, wpm, acc);
    paintRhythm();
    setText(panel.refs.session, `${profile.wpmSession}/${profile.wpm.length}`);
    setText(panel.refs.races, session.raceLimit
      ? `${session.races} / ${session.raceLimit}`
      : String(session.races));
    // Racha limpia: teclas correctas seguidas en la carrera viva. Cada 25 se
    // celebra una vez con un pulso corto; una tecla erronea la devuelve a cero
    // y esconde la fila.
    if (panel.refs.streakRow) {
      const streak = session.cleanStreak | 0;
      const showStreak = Boolean(session.typing) && !session.endedAt && streak > 0;
      setDisplay(panel.refs.streakRow, showStreak);
      if (showStreak) setText(panel.refs.streak, `×${streak}`);
      const pulseAt = session.streakPulseAt | 0;
      if (panel.streakPulse !== pulseAt) {
        panel.streakPulse = pulseAt;
        if (showStreak && pulseAt) pulseOnce(panel.refs.streak, 'nt-pulse');
      }
    }
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
        ? `${wpmInt(tandaAvg.wpm)} · ${tandaAvg.acc.toFixed(1)}%`
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

        setText(panel.refs.prev, `${previous.races} · ${Number.isFinite(previous.wpm) ? wpmInt(previous.wpm) : '—'}`
          + (dev === null ? '' : ` · ${dev >= 0 ? '+' : ''}${dev.toFixed(1)}%`));
        setGood(panel.refs.prev, dev === null ? null : Math.abs(dev) <= 2);
        // La etiqueta delata cual es: la tanda que acaba de cerrar o la anterior.
        setText(panel.refs.prevLabel, session.closed ? 'last' : 'prev');

        const bits = [
          `${previous.races} race${previous.races === 1 ? '' : 's'}`,
          Number.isFinite(previous.wpm) ? `avg ${wpmInt(previous.wpm)} WPM` : null,
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
      // Destello de cierre: una carrera nueva (o el primer premio que llega
      // tarde para la ultima fila) enciende la fila una vez. El arranque con
      // historico guardado no destella: panel.resultSig empieza sin definir.
      const sig = hasResult
        ? `${raceHistory.length}:${lastResult.at || 0}:${lastResult.place || 0}:${lastResult.cash || 0}:${lastResult.xp || 0}`
        : '';
      const grew = panel.resultCount !== undefined && raceHistory.length > panel.resultCount;
      const firstResult = panel.resultSig === '' && sig !== '';
      const fresh = Boolean(sig) && (grew || firstResult);
      panel.resultSig = sig;
      panel.resultCount = raceHistory.length;
      setDisplay(panel.refs.resultRow, hasResult);
      if (!hasResult) panel.refs.resultRow.classList.remove('nt-flash');
      if (hasResult) {
        const bits = [
          ordinal(lastResult.place),
          lastResult.cash ? `+$${lastResult.cash.toLocaleString()}` : '',
          lastResult.xp ? `+${lastResult.xp} xp` : '',
        ].filter(Boolean);
        setText(panel.refs.result, bits.join(' · '));
        panel.refs.resultRow.title = `Last race: ${bits.join(' · ')} (read from the game's own race result).`;
        if (fresh) pulseOnce(panel.refs.resultRow, 'nt-flash');
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
        parts.push(`${wpmInt(avg)}/${wpmInt(avgTarget)} wpm`);
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
    // Las filas se construyen con nodos: el historial sale de datos guardados y
    // no necesita pasar por innerHTML ni escapar atributos a mano.
    const ownerDoc = box.ownerDocument;

    if (!raceHistory.length) {
      const empty = ownerDoc.createElement('div');
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
    const frag = ownerDoc.createDocumentFragment();
    raceHistory
      .slice()
      .reverse()
      .forEach((item) => {
        // Desvio frente al objetivo de esa carrera. Verde si cae dentro de +-2%,
        // que es donde el autocalibrado deberia mantenerlo.
        const dev = Number.isFinite(item.target) && item.target > 0
          ? ((item.wpm - item.target) / item.target) * 100
          : null;

        const place = Number(item.place);
        const placeText = Number.isFinite(place) && place > 0 ? '#' + place : '—';
        const medal = Number.isFinite(place) && place >= 1 && place <= 3 ? String(place) : '';
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

        const row = ownerDoc.createElement('div');
        row.className = 'hist-row';
        row.title = title;

        const timeCell = ownerDoc.createElement('span');
        timeCell.textContent = clockText(item.at) || '—';

        const placeCell = ownerDoc.createElement('b');
        placeCell.className = 'place';
        if (medal) placeCell.dataset.medal = medal;
        placeCell.textContent = placeText;

        const xpCell = ownerDoc.createElement('b');
        xpCell.className = 'xp';
        xpCell.textContent = xpText;

        const wpmCell = ownerDoc.createElement('b');
        wpmCell.className = 'wpm';
        if (nitroChars > 0) {
          const nitroTag = ownerDoc.createElement('i');
          nitroTag.className = 'nitro-tag';
          nitroTag.setAttribute('aria-label', 'nitro');
          nitroTag.textContent = 'N';
          wpmCell.append(nitroTag);
        }
        wpmCell.append(item.wpm.toFixed(1));
        if (modelText) {
          const modelCell = ownerDoc.createElement('span');
          modelCell.className = 'model';
          modelCell.textContent = modelText;
          wpmCell.append(modelCell);
        }

        const devCell = ownerDoc.createElement('b');
        devCell.className = 'dev';
        if (dev !== null) {
          devCell.dataset.good = Math.abs(dev) <= 2 ? '1' : '0';
          devCell.textContent = (dev >= 0 ? '+' : '-') + Math.abs(dev).toFixed(1) + '%';
        }

        row.append(timeCell, placeCell, xpCell, wpmCell, devCell);
        frag.append(row);
      });
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

