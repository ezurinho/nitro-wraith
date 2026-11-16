
  /* ==========================================================================
   * 13. BOOT
   * ========================================================================== */
  function boot() {
    // El registro de instancias se monta antes de repartir el trabajo: las dos
    // mitades del script lo necesitan para saber cuantas copias hay y cual manda.
    guardId = INSTANCE_ID;
    guardSince = Date.now();

    // El keep-alive es opt-in: si estaba activado en la sesion anterior, se
    // intenta arrancar ya. Sin gesto el AudioContext queda suspendido y el
    // primer clic (capturado por bindKeepAliveGesture) lo desbloquea.
    syncKeepAlive();

    // Auto-update: una comprobacion al arrancar, otra al recuperar red y otra
    // al volver a la pestana. La comprobacion periodica sigue en el panel.
    if (!window.__ntaDryProbe && window.top === window) {
      checkForUpdate();
      addEventListener('online', () => checkForUpdate(true));
      addEventListener('focus', () => checkForUpdate());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkForUpdate();
      });
    }

    // El turno se renueva tambien por el reloj Worker, no solo por el latido del
    // panel: oculta, la pestaña sigue farmeando y el lease no puede caducar.
    if (!window.__ntaDryProbe) leaseBeat();

    // Ventana de arriba: solo cola y recuperacion. El tipado vive dentro del
    // iframe de la carrera, asi que aqui no se crea panel ni se toca el teclado.
    if (window.top === window) {
      // El garaje ya tiene el XP de la cuenta y el bootstrap de la temporada:
      // deja la tarjeta lista antes de que el iframe de la carrera la lea.
      seasonRefreshFromUser(true);
      setTimeout(() => seasonRefreshFromUser(true), 2000);

      // /season no tiene cola ni panel: solo se toma la foto de temporada y se
      // guarda para que la lea el panel de la carrera.
      if (/^\/season(\/|$)/.test(location.pathname)) {
        captureSeasonPage();
        return;
      }
      // Sonda del dry-run: comprobar la version sin armar la cola ni pulsar
      // Race Now. Solo la activa `npm run live -- --dry-run --inject`.
      if (!window.__ntaDryProbe) runQueue();
      return;
    }

    // Un marco que acaba en /login significa que la sesion murio para el: aqui
    // no hay juego que esperar y la pantalla de entrar no se resuelve desde
    // dentro. Se avisa a la ventana de arriba ANTES de descartar el marco; si no,
    // este se descarta en silencio y la pagina se queda en /race sin carrera
    // hasta que la recarga el vigilante.
    if (/^\/login(\/|$)/.test(location.pathname)) {
      notifyTopNeedLogin();
      return;
    }

    // La app de la carrera es el unico marco que navega como /race; el resto
    // son anuncios y no tienen nada que hacer aqui.
    if (!/^\/race(\/|$)/.test(location.pathname)) return;

    log(`v${VERSION} · mode AUTO (always) · pace ${session.pace.toUpperCase()} (${paceProfile}) · target ${profile.targetWPM} WPM / ${profile.accuracyGoal.toFixed(1)}% · hard cap ${CONFIG.wpm.hardCap} WPM`);
    if (resumedCounters) log(`Session resumed: ${session.races} races so far.`);
    calibrationRaceMark = session.races;
    if (resumedPause) log('It was paused before the reload; press Resume to continue.');
    log('Keys: Alt+A resume, Alt+N stop. Alt+R clears the history, Alt+Shift+C clears the accuracy trend, Alt+H prints closed sessions, Alt+T cycles the theme, Alt+G folds the garage panel, Alt+M cycles the footer HUD, Alt+S or Esc stop (inside a race, at the end). There is no other mode: the bot is always AUTO and the garage queue arms itself.');

    flushQueueNotice();
    document.addEventListener('keydown', onKeyDown, true);

    createPanel();

    // Al volver de segundo plano se pinta una vez aunque el latido venga
    // frenado; mientras esta oculto updatePanel no toca el DOM.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        updatePanel(true);
        // El resumen AFK cambia justo al volver (visible -> hidden y el estado
        // real del keep-alive); TUNE solo se repinta al abrirse si no se fuerza.
        if (typeof paintConfig === 'function') paintConfig();
        checkForUpdate();
        // Si el API fallo, al volver a la pestana se reintenta sin esperar al
        // latido ni a la ventana normal de 30 minutos.
        maybeCalibrate();
      }
    });
    window.addEventListener('focus', () => checkForUpdate());
    window.addEventListener('online', () => {
      // Volver la conexion no debe dejar el objetivo con la foto vieja hasta
      // media hora: se pide la cuenta en cuanto el navegador esta online, pero
      // sin saltarse la sonda de un minuto ni el backoff de un fallo reciente.
      maybeCalibrate();
    });

    // Un latido no puede llevarse por delante a los demas. Si `watchRaceResults`
    // tropieza con un DOM a medio montar (React remontando la carrera), sin esto
    // se dejaban de pintar el panel, de pulsar el CAPTCHA y de contestar al
    // aviso de sesion, y el fallo se repetia cada medio segundo hasta recargar.
    // Cada paso va aislado y el primero de cada clase se cuenta una sola vez en
    // la consola, para no inundarla mientras dure.
    const heartErrors = new Set();
    const heart = (label, fn) => {
      try {
        fn();
      } catch (error) {
        if (heartErrors.has(label)) return;
        heartErrors.add(label);
        log(`Panel heartbeat: ${label} failed, the rest keeps running.`, error);
      }
    };

    let lastPanelPaintAt = 0;
    let lastResultsWatchAt = 0;

    setInterval(() => {
      // Eleccion de copia en este marco: una escribe, las demas esperan. Se
      // refresca en cada latido del panel, que es el unico que corre siempre.
      heart('role', refreshRole);
      heart('supervise', superviseLive);
      heart('panel', () => {
        if (!document.getElementById(PANEL_ID)) createPanel();
      });
      // Con un listener ya suscrito no hace falta recorrer el arbol de React dos
      // veces por segundo: el juego tarda ~25 s en cerrar una carrera y un segundo
      // de retraso no pierde el paquete. Sin listener se sigue mirando a 2 Hz.
      heart('results', () => {
        const now = Date.now();
        if (resultServerObj && now - lastResultsWatchAt < 1000) return;
        lastResultsWatchAt = now;
        perfCounters.resultsWatches += 1;
        watchRaceResults();
      });
      // Un panel en espera o en carrera no necesita 2 Hz: sus relojes cambian
      // como mucho una vez por segundo y los eventos que importan ya llaman a
      // updatePanel(). Se pinta en el siguiente latido y se libera el hilo
      // justo cuando la app esta procesando las teclas.
      heart('paint', () => {
        const now = Date.now();
        if (now - lastPanelPaintAt < panelPaintEveryMs()) return;
        lastPanelPaintAt = now;
        updatePanel();
      });
      heart('captcha', () => clickCaptchaContinue(document));
      heart('challenge', closeChallengePopup);
      heart('calibration', () => maybeCalibrate());

      // El aviso de sesion puede caer en esta ventana o en la de arriba: se
      // mira en las dos y, si toca, se pulsa (la app se recarga y la sesion se
      // renueva). Se comprueba aqui, y no en el vigilante de 1 s, porque este
      // intervalo es el que tiene el panel delante para contarlo.
      heart('session', handleSessionWarning);
    }, 500);

    // Vigilante de descalificacion: deja marcado cuando el modal esta en
    // pantalla para que el bucle cierre la carrera en vez de teclear al aire.
    // Aqui tambien vive el guardia (WPM imposible y copias duplicadas): es el
    // unico latido que sigue vivo en todos los modos.
    setInterval(() => {
      if (!document.body) return;
      if (terminalBanNoted) return;
      guardCheck();

      const text = modalText();
      if (handleTerminalBan(text)) return;

      // Castigo por racha del propio sitio: ni una carrera mas hasta que pase.
      // No se para el bot (una parada pegajosa era la que dejaba al script mudo
      // para siempre): se abre un hueco largo y el bucle vuelve solo.
      if (looksDqBlocked(text)) {
        const until = siteBlockedUntil();
        if (!until || until > Date.now()) {
          if (!dqBlockedNoted) {
            dqBlockedNoted = true;
            rememberFrameDqBlock();
          }
          return;
        }

        // La espera vencio: se abandona el aviso por el garaje para que el
        // siguiente intento sea una carrera nueva, no un clic sobre el modal.
        if (clickByText(['go to your garage', 'view garage', 'your garage'])) notifyTopNeedGarage();
        return;
      }

      if (dqBlockedNoted) dqBlockedNoted = false;
      if (looksDisqualified(text)) dqSeenAt = Date.now();
      if (looksLikeConnectionError(text)) connErrorSeenAt = Date.now();
    }, 1000);

    // Al salir de la pagina se deja de teclear: un marco a medio descargar que
    // sigue mandando teclas es lo ultimo que se quiere. Pero `pagehide` no
    // siempre destruye el documento: si el navegador lo guarda en la cache de
    // ida y vuelta (bfcache), el mismo JS revive con `pageshow` y la sesion tal
    // y como estaba... con la parada dentro. El bot quedaba mudo al volver con
    // el boton Atras y el panel decia "waiting" sin motivo aparente. Se apunta
    // si la parada la puso ESTE manejador, para deshacerla solo en ese caso:
    // una parada pedida por el usuario (Esc, Alt+N, el tope de tanda) se
    // respeta y no se reanuda sola.
    let stoppedByPageHide = false;
    let frozenAt = 0;

    window.addEventListener('pagehide', () => {
      releaseTypingLock();
      if (session.stopped) return;
      session.stopped = true;
      releaseTabLease();
      stoppedByPageHide = true;
    });

    // Chrome puede congelar una pestaña oculta (Energy Saver, memoria, bfcache)
    // y con ella sus timers y sus workers. El freeze se avisa ANTES de suspender
    // el documento: se suelta el Web Lock para que otra pestaña pueda relevar y
    // se deja constancia. Al volver, el bucle vuelve a pedir el lock antes de
    // mandar una tecla; si la carrera ya murio, el DQ modal la cierra.
    document.addEventListener('freeze', () => {
      frozenAt = Date.now();
      noteAfkFreeze();
      releaseTypingLock();
      if (session.liveRound && !session.stopped) {
        log('Browser froze this tab; the typing lock was released.');
      }
      if (typeof paintConfig === 'function') paintConfig();
      if (typeof paintGaragePanel === 'function') paintGaragePanel();
    });

    document.addEventListener('resume', () => {
      if (!frozenAt) return;
      const frozenFor = Math.max(0, Date.now() - frozenAt);
      frozenAt = 0;
      noteAfkResume(frozenFor);
      log(`Browser resumed after ${(frozenFor / 1000).toFixed(1)} s frozen; rechecking the race.`);
      syncKeepAlive();
      updatePanel();
      if (typeof paintConfig === 'function') paintConfig();
      if (typeof paintGaragePanel === 'function') paintGaragePanel();
    });

    window.addEventListener('pageshow', (event) => {
      if (!event.persisted || !stoppedByPageHide) return;

      stoppedByPageHide = false;
      session.stopped = false;
      log('Back from the page cache: the bot picks the race up again.');
      updatePanel();
      runAuto();
    });

    initStickers();
    watchRaceResults();

    runAuto();
  }

  boot();
})();
