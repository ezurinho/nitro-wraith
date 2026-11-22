  /* ==========================================================================
   * 12.B TEMA DEL PANEL Y PUENTES DE ALMACENAMIENTO
   * ========================================================================== */
  // El tema (pintar, fijar, ciclar) y los cinco puentes de storage que avisan a
  // la otra ventana del garaje cuando algo cambia en el iframe de la carrera.
  // Vive aparte de 80-panel.js para que ese archivo se lea como estructura del
  // panel; el orden en MODULES lo deja despues, porque los try de abajo corren
  // al evaluar el modulo y para entonces `panel` ya existe.
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
