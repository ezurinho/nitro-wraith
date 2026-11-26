  /* ==========================================================================
   * 12.1 LIVE READOUT
   * ========================================================================== */

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
    const stateText = safeMode
      ? 'safe mode'
      : off ? 'waiting' : breaking ? 'break' : session.paused ? 'paused' : (session.typing ? 'racing' : 'idle');
    setText(panel.refs.footState, stateText);
    if (safeMode) {
      setText(panel.refs.status, `safe mode · ${safeModeReason || 'automation stopped'}`);
    }
    setText(panel.refs.footMode, MODE);
    setText(panel.refs.footCap, Number.isFinite(CONFIG.wpm.hardCap) ? `cap ${CONFIG.wpm.hardCap}` : 'no cap');
    // El reloj tiene su propio hueco: en compacto se quedan WPM, precision y
    // reloj, y el modo, el techo y la pista desaparecen. Alt+M lo recorre.
    paintLiveClock(measured, wpm, acc);
    setText(panel.refs.footHint, safeMode
      ? 'internal error · report'
      : off
        ? (terminalStop ? 'ban · until cleared'
          : stoppedNow ? `${stopKind.label} · ${stopWaitText(stopLeft)} left` : 'Alt+A resume')
        : session.paused ? 'resume' : 'Alt+S stop');
    // `off` ya ES session.stopped, asi que la rama que volvia a mirarlo nunca
    // se alcanzaba: el descanso se pintaba como "waiting" y no como "break".
    setText(panel.refs.liveTag, safeMode
      ? 'safe mode'
      : off
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

