  /* ==========================================================================
   * 12.C RAIL DEL PANEL Y RELLENO DE LOS DESLIZADORES
   * ========================================================================== */
  // El orden de las pestanas, el cambio de vista y el relleno verde de los cinco
  // deslizadores (carreras, minutos, XP y ventana activa). TAB_ORDER se va con
  // su unico consumidor, showTab: nadie mas lo lee, asi que no hay orden que se
  // pueda desfasar entre dos archivos.
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
    disk.set(KEYS.panelTab, name);
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
      setTitle(panel.refs.gear, tune
        ? 'Back to the live stats'
        : 'Settings: pace profile, switches, session limit and export/import of the config');
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
    const title = session.raceLimit
      ? `Races per session: ${session.raceLimit}`
        + (session.raceLimit >= 25 ? ' · the session bonus is capped at 250 XP per race' : '')
      : 'Races per session: free (the bot keeps going until you stop it)';
    if (input.title !== title) input.title = title;
  }

  // El mismo relleno, para el deslizador de minutos.
  function paintTimeSlider() {
    const input = panel.refs && panel.refs.timeSlider;
    if (!input) return;

    const index = TIME_LIMIT_STEPS.indexOf(session.timeLimit) >= 0 ? TIME_LIMIT_STEPS.indexOf(session.timeLimit) : 0;
    if (input.value !== String(index)) input.value = String(index);
    const fill = `${(index / (TIME_LIMIT_STEPS.length - 1)) * 100}%`;
    if (input.style.getPropertyValue('--fill') !== fill) input.style.setProperty('--fill', fill);
    const title = session.timeLimit
      ? `Minutes per session: ${session.timeLimit}`
      : 'Minutes per session: free (the bot keeps going until you stop it)';
    if (input.title !== title) input.title = title;
  }

  // Y el mismo relleno, para el deslizador de XP.
  function paintXpSlider() {
    const input = panel.refs && panel.refs.xpSlider;
    if (!input) return;

    const index = XP_LIMIT_STEPS.indexOf(session.xpLimit) >= 0 ? XP_LIMIT_STEPS.indexOf(session.xpLimit) : 0;
    if (input.value !== String(index)) input.value = String(index);
    const fill = `${(index / (XP_LIMIT_STEPS.length - 1)) * 100}%`;
    if (input.style.getPropertyValue('--fill') !== fill) input.style.setProperty('--fill', fill);
    const xpTitle = session.xpLimit
      ? `XP per session: ${session.xpLimit.toLocaleString()}`
      : 'XP per session: free (the bot keeps going until you stop it)';
    if (input.title !== xpTitle) input.title = xpTitle;
  }

  function paintDailyRaceSlider() {
    const input = panel.refs && panel.refs.dailyRaceSlider;
    if (!input) return;

    const index = DAILY_RACE_STEPS.indexOf(session.dailyRaceLimit) >= 0 ? DAILY_RACE_STEPS.indexOf(session.dailyRaceLimit) : 0;
    if (input.value !== String(index)) input.value = String(index);
    const fill = `${(index / (DAILY_RACE_STEPS.length - 1)) * 100}%`;
    if (input.style.getPropertyValue('--fill') !== fill) input.style.setProperty('--fill', fill);
    const title = session.dailyRaceLimit
      ? `Races per day: ${session.dailyRaceLimit}`
      : 'Races per day: free (no daily race budget)';
    if (input.title !== title) input.title = title;
  }

  function paintDailyXpSlider() {
    const input = panel.refs && panel.refs.dailyXpSlider;
    if (!input) return;

    const index = DAILY_XP_STEPS.indexOf(session.dailyXpLimit) >= 0 ? DAILY_XP_STEPS.indexOf(session.dailyXpLimit) : 0;
    if (input.value !== String(index)) input.value = String(index);
    const fill = `${(index / (DAILY_XP_STEPS.length - 1)) * 100}%`;
    if (input.style.getPropertyValue('--fill') !== fill) input.style.setProperty('--fill', fill);
    const title = session.dailyXpLimit
      ? `XP per day: ${session.dailyXpLimit.toLocaleString()}`
      : 'XP per day: free (no daily XP budget)';
    if (input.title !== title) input.title = title;
  }

  function paintActiveSlider(which) {
    const input = panel.refs && (which === 'start' ? panel.refs.activeStartSlider : panel.refs.activeEndSlider);
    if (!input) return;

    const hour = which === 'start' ? session.activeStart : session.activeEnd;
    if (input.value !== String(hour)) input.value = String(hour);
    const fill = `${(hour / 23) * 100}%`;
    if (input.style.getPropertyValue('--fill') !== fill) input.style.setProperty('--fill', fill);
    const crosses = which === 'end' && session.activeStart >= hour;
    const title = `${which === 'start' ? 'Start' : 'End'} hour: ${padHour(hour)}${crosses ? ' (the window crosses midnight)' : ''}`;
    if (input.title !== title) input.title = title;
  }
