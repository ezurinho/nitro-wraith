
  /* ==========================================================================
   * 3b. HISTORIAL DE CARRERAS
   * ========================================================================== */
  // Se guardan los resultados REALES de cada carrera (no los objetivos), para
  // ver si el ritmo marcado se esta cumpliendo de verdad.
  let raceHistory = loadHistory();

  // Una fila se reconstruye campo a campo. El panel la pinta con innerHTML, asi
  // que un valor corrupto en localStorage no puede llegar al DOM como texto:
  // los numeros se validan y cualquier campo fuera de esta lista se descarta.
  // De paso normaliza filas viejas (sin `goal`) y olvida restos de versiones
  // anteriores.
  function historyNumber(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  }

  function sanitizeHistoryRow(item) {
    if (!item || typeof item !== 'object') return null;
    const wpm = historyNumber(item.wpm, 1, 400);
    const acc = historyNumber(item.acc, 0, 100);
    if (wpm === null || acc === null) return null;

    const row = {
      wpm: Math.round(wpm * 10) / 10,
      acc: Math.round(acc * 10) / 10,
    };
    const at = historyNumber(item.at, 1, Number.MAX_SAFE_INTEGER);
    if (at !== null) row.at = at;
    const target = historyNumber(item.target, 15, 400);
    if (target !== null) row.target = Math.round(target);
    const goal = historyNumber(item.goal, 90, 100);
    if (goal !== null) row.goal = Math.round(goal * 10) / 10;
    const place = historyNumber(item.place, 1, 1000);
    if (place !== null) row.place = Math.trunc(place);
    const xp = historyNumber(item.xp, 0, MAX_RACE_XP);
    if (xp !== null) row.xp = Math.round(xp);
    const cash = historyNumber(item.cash, 0, MAX_RACE_CASH);
    if (cash !== null) row.cash = Math.round(cash);
    const model = historyNumber(item.modelWpm, 0, 400);
    if (model !== null) row.modelWpm = Math.round(model * 10) / 10;
    const server = historyNumber(item.serverWpm, 0, 400);
    if (server !== null) row.serverWpm = Math.round(server * 10) / 10;
    const game = historyNumber(item.gameWpm, 0, 400);
    if (game !== null) row.gameWpm = Math.round(game * 10) / 10;
    const nitroWords = historyNumber(item.nitroWords, 0, 1000000);
    if (nitroWords !== null) row.nitroWords = Math.trunc(nitroWords);
    const nitroChars = historyNumber(item.nitroChars, 0, 1000000);
    if (nitroChars !== null) row.nitroChars = Math.trunc(nitroChars);
    return row;
  }

  function loadHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEYS.history) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .map(sanitizeHistoryRow)
        .filter(Boolean)
        .slice(-CONFIG.historySize);
    } catch {
      return [];
    }
  }

  function recordRace() {
    // Una carrera cortada (descalificacion, nodo muerto, parada manual) tiene
    // una muestra demasiado pequena para decir nada: no se registra.
    if (session.correct < 20) return false;

    const wpm = wpmNow();
    if (!wpm) return false;
    const acc = accuracyNow();

    raceHistory.push({
      wpm: Math.round(wpm * 10) / 10,
      acc: Math.round(acc * 10) / 10,
      // El ultimo WPM que marco el HUD del juego: sirve para comparar el reloj
      // calibrado con el numero oficial, no para pintar la fila.
      gameWpm: Number(session.lastHudWpm) || null,
      // Lo que el nitro regalo en esta carrera. Se guarda en la fila porque el
      // contador vivo se reinicia al empezar la siguiente.
      nitroWords: session.nitroWords || 0,
      nitroChars: session.nitroChars || 0,
      target: profile.targetWPM,   // para poder mostrar el desvio de cada carrera
      // Precision exigida en esta carrera, con su buffer: el gobernador
      // compara contra esta cifra y no contra la sesion siguiente.
      goal: Math.round(profile.accuracyGoal * 10) / 10,
      at: Date.now(),
    });

    // El resultado de la carrera puede llegar antes que la propia carrera: se
    // engancha aqui, cuando ya existe la fila que lo recibe.
    if (pendingResult) {
      const result = pendingResult;
      pendingResult = null;
      Object.assign(raceHistory[raceHistory.length - 1], result);
      if (result.cash) todayBump({ cash: result.cash });
      if (result.xp) {
        noteSessionXp(result.xp);
        todayBump({ xp: result.xp });
      }
    }

    // El WPM oficial pudo llegar antes de que la carrera existiera en la fila:
    // se engancha ahora, igual que el premio.
    if (pendingServerWpm !== null) {
      const value = pendingServerWpm;
      pendingServerWpm = null;
      stampServerWpm(raceHistory[raceHistory.length - 1], value);
    }

    // Acumulado de la tanda (no del historial, que solo guarda las ultimas).
    // Se persiste con los contadores: el resumen sobrevive a una recarga.
    // Si el paquete llego antes de crear la fila, `stampServerWpm` ya dejo el
    // WPM oficial en ella: la media tiene que sumar ese, no el del modelo.
    const recorded = raceHistory[raceHistory.length - 1];
    const countedWpm = Number.isFinite(recorded.wpm) ? recorded.wpm : wpm;
    if (!Array.isArray(session.sumWpmLedger)) session.sumWpmLedger = [];
    session.sumRaces++;
    session.sumWpm += countedWpm;
    // Lo que esta carrera aporta a la media, para poder corregirlo cuando el
    // paquete oficial llegue despues (otra carrera registrada, una recarga).
    session.sumWpmLedger.push({ at: recorded.at, wpm: countedWpm });
    if (session.sumWpmLedger.length > 8) session.sumWpmLedger.shift();
    session.sumTarget += profile.targetWPM;
    session.sumAcc += acc;
    // Contabilidad del nitro de la tanda: una carrera con nitro suma una
    // unidad y los caracteres que el juego escribio por esta copia.
    if (session.nitroWords > 0) {
      session.nitroRaces++;
      session.nitroCharsTotal += session.nitroChars;
    }
    saveCounters();

    if (raceHistory.length > CONFIG.historySize) {
      raceHistory = raceHistory.slice(-CONFIG.historySize);
    }

    try {
      localStorage.setItem(KEYS.history, JSON.stringify(raceHistory));
    } catch {
      /* almacenamiento lleno o bloqueado: queda solo en memoria */
    }

    return true;
  }

  // Una carrera medida: se apunta en el historial y, solo si de verdad conto,
  // suma a la tanda. Vive aqui y no en finishRace porque es la misma cuenta que
  // el banco necesita para probar el tope sin teclear una carrera entera.
  function countRace() {
    const counted = recordRace();
    if (counted) {
      session.races++;
      session.blockRaces++;
      saveCounters();
      updatePanel();   // la fila de carreras no espera al siguiente latido

      // El reloj de 30 minutos no siempre basta: en una tanda rapida la cuenta
      // puede cambiar antes de la siguiente foto. Cada bloque de carreras pide
      // una lectura nueva, asi el objetivo sigue a la cuenta sin tocar el raton.
      const step = Math.max(1, Number(CONFIG.calibration.everyRaces) || 25);
      if (session.races - calibrationRaceMark >= step) {
        calibrationRaceMark = session.races;
        log(`Account refresh: ${step} races since the last calibration; reading the account again.`);
        maybeCalibrate(true);
      }
    }
    return counted;
  }

  // Resumen del historial visible: media y mejor de las carreras que se estan
  // mostrando. Se calcula de la lista, no de un acumulador, para que al vaciar
  // el historial no queden restos de la sesion anterior.
  function historyStats(list) {
    if (!Array.isArray(list) || !list.length) return null;

    let sumWpm = 0;
    let sumAcc = 0;
    let best = 0;

    for (const item of list) {
      sumWpm += item.wpm;
      sumAcc += item.acc;
      if (item.wpm > best) best = item.wpm;
    }

    return {
      avgWpm: sumWpm / list.length,
      avgAcc: sumAcc / list.length,
      bestWpm: best,
    };
  }

  // La comparacion de WPM usa el historial medido (las ultimas 10 carreras),
  // para no mezclar el contador de la tanda con una muestra distinta. Sin al
  // menos una carrera de cada tipo no hay diferencia que ensenar.
  function nitroWpmStats(list) {
    if (!Array.isArray(list) || !list.length) return null;

    const withNitro = [];
    const without = [];
    for (const item of list) {
      const wpm = Number(item && item.wpm);
      if (!Number.isFinite(wpm)) continue;
      if (Number(item.nitroWords) > 0) withNitro.push(wpm);
      else without.push(wpm);
    }
    if (!withNitro.length || !without.length) return null;

    const avg = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const usedWpm = avg(withNitro);
    const plainWpm = avg(without);
    return {
      used: withNitro.length,
      plain: without.length,
      usedWpm,
      plainWpm,
      delta: usedWpm - plainWpm,
    };
  }

  // Alt+R: dejar el panel limpio al empezar una sesion nueva.
  function clearHistory() {
    raceHistory = [];
    // Sin filas no hay nada que corregir: las aportaciones guardadas ya no
    // pueden casar con una carrera del historial.
    session.sumWpmLedger = [];
    // La calibracion pendiente apunta a una fila que ya no existe.
    session.trimAt = 0;
    try {
      localStorage.removeItem(KEYS.history);
    } catch {
      /* almacenamiento bloqueado */
    }

    if (panel.refs) {
      panel.historySig = '';
      renderHistory();
    }
    log('Race history cleared.');
  }

  /* ==========================================================================
   * 3c. REGISTRO DE TANDAS (Alt+H)
   * ========================================================================== */
  // Cada tanda cerrada (tope o parada) se anota con lo que midio el panel: asi
  // se comparan sesiones de un vistazo, sin depender del historial de 5
  // carreras ni de rebuscar en la consola.
  let tandaLog = loadTandaLog();

  function loadTandaLog() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEYS.tandaLog) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((item) => item && Number.isFinite(item.at) && Number.isFinite(item.races))
        .slice(-CONFIG.tandaLogSize);
    } catch {
      return [];
    }
  }

  // Cierra la tanda en curso: se anota una sola vez (closed) y la cadencia de
  // descansos vuelve a cero. Las medias quedan en el registro y en el panel
  // hasta que la siguiente A abre tanda nueva.
  function closeTanda(reason) {
    if (session.closed) return null;
    if (session.sumRaces < 1 && session.dqCount < 1) return null;

    session.closed = true;
    session.blockRaces = 0;
    session.blockTarget = 0;
    saveCounters();

    const entry = {
      at: Date.now(),
      races: session.sumRaces,
      wpm: session.sumRaces > 0 ? session.sumWpm / session.sumRaces : null,
      target: session.sumRaces > 0 ? session.sumTarget / session.sumRaces : null,
      acc: session.sumRaces > 0 ? session.sumAcc / session.sumRaces : null,
      dq: session.dqCount | 0,
      xp: session.xp | 0,
      reason: reason || 'manual stop',
    };

    tandaLog.push(entry);
    if (tandaLog.length > CONFIG.tandaLogSize) {
      tandaLog = tandaLog.slice(-CONFIG.tandaLogSize);
    }

    try {
      localStorage.setItem(KEYS.tandaLog, JSON.stringify(tandaLog));
    } catch {
      /* almacenamiento lleno o bloqueado: queda solo en memoria */
    }
    return entry;
  }

  // Alt+H: las tandas cerradas, en una tabla de consola. En el panel solo cabe
  // la media viva; aqui esta el detalle de cada sesion (fecha, carreras, WPM,
  // objetivo, desvio, precision, DQ, XP y motivo de cierre).
  function showTandaLog() {
    if (!tandaLog.length) {
      log('No closed sessions yet.');
      return;
    }

    const rows = tandaLog.map((item, i) => ({
      '#': i + 1,
      date: new Date(item.at).toLocaleString(),
      races: item.races,
      wpm: Number.isFinite(item.wpm) ? Number(item.wpm.toFixed(1)) : '—',
      target: Number.isFinite(item.target) ? Number(item.target.toFixed(1)) : '—',
      deviation: Number.isFinite(item.wpm) && Number.isFinite(item.target) && item.target > 0
        ? `${item.wpm >= item.target ? '+' : ''}${(((item.wpm - item.target) / item.target) * 100).toFixed(1)}%`
        : '—',
      accuracy: Number.isFinite(item.acc) ? Number(item.acc.toFixed(1)) : '—',
      dq: item.dq,
      xp: Number.isFinite(item.xp) ? Math.max(0, Math.round(item.xp)) : '—',
      reason: item.reason,
    }));

    console.log('%c[NTAuto]', 'color:#7cc7ff;font-weight:bold', `Closed sessions: ${tandaLog.length}`);
    if (typeof console.table === 'function') console.table(rows);
    else rows.forEach((row) => console.log(row));
    log(`Closed sessions: ${tandaLog.length} (table in the console).`);
  }

  // Pasadas del banco live. El userscript no puede leer un archivo del disco,
  // asi que el CSV se carga a mano una vez y queda guardado en el navegador.
  // Se compara lo que de verdad midio cada pasada: media, sd y cuantas muestras
  // se salieron de la banda.
  const LIVE_PASSES_KEY = 'autoTyperLivePasses';
  // Una pasada aislada no dice nada; la ultima contra la media de las
  // anteriores si: mas de medio punto de deriva ya es el modelo separandose.
  const LIVE_DRIFT_LIMIT = 0.5;
  // La sd de un bloque de 10+ carreras mide dispersion, no deriva. Con 10
  // muestras, mas de una decima de punto ya no es ruido de una carrera.
  const LIVE_SPREAD_LIMIT = 0.10;

  // Formato unico para una cifra de model Δ: siempre con signo y dos decimales.
  function signedPts(value) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
  }

  // La ultima pasada contra la media de las anteriores. Devuelve null cuando no
  // hay dos pasadas con media: una sola no tiene con que compararse.
  function liveDrift() {
    const list = livePasses.slice(-10);
    const previous = list.slice(0, -1).filter((item) => Number.isFinite(item.mean));
    const latest = list[list.length - 1];
    if (!previous.length || !latest || !Number.isFinite(latest.mean)) return null;

    const avg = previous.reduce((sum, item) => sum + item.mean, 0) / previous.length;
    return { latest: latest.mean, avg, drift: latest.mean - avg, count: previous.length };
  }

  // Ultimo bloque de 10+ carreras. La sd de una pasada de 1 o 5 carreras no se
  // compara contra el umbral de 10: con pocas muestras la sd es demasiado
  // inestable para decir que el bloque esta disperso.
  function liveSpreadBlock() {
    const list = livePasses.filter((item) => item
      && Number(item.races) >= 10
      && Number(item.samples || item.races) >= 10
      && Number.isFinite(item.sd));
    return list.length ? list[list.length - 1] : null;
  }

  // La ultima pasada contra la inmediatamente anterior, no contra la media: es
  // el comparador de dos sesiones concretas que el panel ensena con una flecha.
  function liveCompare() {
    const list = livePasses.slice(-10).filter((item) => Number.isFinite(item.mean));
    if (list.length < 2) return null;
    const previous = list[list.length - 2];
    const latest = list[list.length - 1];
    return { previous, latest, diff: latest.mean - previous.mean };
  }

  // Etiqueta corta de una pasada para los dos selectores: fecha, cuenta si el
  // archivo mezcla varias, carreras y media. La fecha sale en el mismo formato
  // que la lista (`11-02 20:36`).
  function livePassLabel(pass, showAccount) {
    const bits = [String(pass.at).slice(5, 16).replace('T', ' ')];
    if (showAccount) bits.push(String(pass.user || '').trim() || 'unknown');
    bits.push(`${pass.races}r`);
    if (Number.isFinite(pass.mean)) bits.push(signedPts(pass.mean));
    return bits.join(' · ');
  }

  function livePickPair() {
    if (!panel.refs || !panel.refs.livePickA || !panel.refs.livePickB) return null;
    const pick = (value) => livePasses.find((pass) => String(pass.at) === value && Number.isFinite(pass.mean));
    const a = pick(panel.refs.livePickA.value);
    const b = pick(panel.refs.livePickB.value);
    if (!a || !b) return null;
    return { a, b, diff: b.mean - a.mean };
  }

  function paintLivePick() {
    if (!panel.refs || !panel.refs.livePickResult) return;
    const pair = livePickPair();
    if (!pair) {
      setText(panel.refs.livePickResult, '—');
      setGood(panel.refs.livePickResult, null);
      if (panel.refs.livePickExport) panel.refs.livePickExport.disabled = true;
      return;
    }
    setText(panel.refs.livePickResult,
      `${signedPts(pair.a.mean)} → ${signedPts(pair.b.mean)} · ${signedPts(pair.diff)} pts`);
    setGood(panel.refs.livePickResult, Math.abs(pair.diff) <= LIVE_DRIFT_LIMIT);
    if (panel.refs.livePickExport) panel.refs.livePickExport.disabled = false;
    if (panel.refs.livePickRow) {
      panel.refs.livePickRow.title =
        `${livePassLabel(pair.a, false)} → ${livePassLabel(pair.b, false)}`
        + ` · B − A = ${signedPts(pair.diff)} pts (band ±${LIVE_DRIFT_LIMIT})`;
    }
  }

  // CSV de la pareja A/B: una fila con las dos pasadas y B − A, para abrirla al
  // lado de live-history.csv sin recomponer nada a mano.
  function liveCompareCsv(pair) {
    const cell = (value) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const at = (value) => {
      const time = new Date(value);
      return Number.isNaN(time.getTime()) ? '' : time.toISOString();
    };
    const rows = [
      ['generated_at', 'a_at', 'a_races', 'a_mean_pts', 'a_sd_pts', 'a_user',
        'b_at', 'b_races', 'b_mean_pts', 'b_sd_pts', 'b_user', 'diff_pts', 'band_pts'],
      [
        new Date().toISOString(),
        at(pair.a.at),
        pair.a.races,
        Number.isFinite(pair.a.mean) ? pair.a.mean.toFixed(2) : '',
        Number.isFinite(pair.a.sd) ? pair.a.sd.toFixed(2) : '',
        pair.a.user || '',
        at(pair.b.at),
        pair.b.races,
        Number.isFinite(pair.b.mean) ? pair.b.mean.toFixed(2) : '',
        Number.isFinite(pair.b.sd) ? pair.b.sd.toFixed(2) : '',
        pair.b.user || '',
        pair.diff.toFixed(2),
        LIVE_DRIFT_LIMIT.toFixed(2),
      ],
    ];
    return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  function downloadLiveCompareCsv() {
    const pair = livePickPair();
    if (!pair) {
      log('Live passes: choose A and B before exporting the comparison.');
      return;
    }
    const csv = liveCompareCsv(pair);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const name = `live-compare-${stamp}.csv`;
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.style.display = 'none';
      (document.body || document.documentElement).appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      log(`Live passes: A/B comparison exported to ${name} (B − A = ${signedPts(pair.diff)} pts).`);
    } catch (error) {
      log('Live passes: the browser refused the A/B CSV download.', error);
    }
  }

  // Rellena los dos selectores conservando la eleccion por fecha. La primera
  // vez (o al cambiar de archivo) arranca con las dos ultimas pasadas, que es
  // el mismo par que ya ensena la fila `last two`.
  function paintLivePickOptions(list) {
    if (!panel.refs || !panel.refs.livePickRow || !panel.refs.livePickA || !panel.refs.livePickB) return;
    const usable = (list || []).filter((pass) => pass && pass.at && Number.isFinite(pass.mean));
    if (usable.length < 2) {
      panel.refs.livePickRow.style.display = 'none';
      if (panel.refs.livePickExport) panel.refs.livePickExport.disabled = true;
      return;
    }
    panel.refs.livePickRow.style.display = 'grid';

    const accounts = new Set(usable.map((pass) => String(pass.user || '').trim()).filter(Boolean));
    const showAccount = accounts.size > 1;
    const values = new Set(usable.map((pass) => String(pass.at)));
    const previousA = panel.refs.livePickA.value;
    const previousB = panel.refs.livePickB.value;
    const fallbackA = String(usable[usable.length - 2].at);
    const fallbackB = String(usable[usable.length - 1].at);
    const targetA = values.has(previousA) ? previousA : fallbackA;
    const targetB = values.has(previousB) ? previousB : fallbackB;

    for (const select of [panel.refs.livePickA, panel.refs.livePickB]) {
      select.textContent = '';
      for (const pass of usable) {
        const option = document.createElement('option');
        option.value = String(pass.at);
        option.textContent = livePassLabel(pass, showAccount);
        select.appendChild(option);
      }
    }
    panel.refs.livePickA.value = targetA;
    panel.refs.livePickB.value = targetB;
    paintLivePick();
  }

  // Deriva de cada pasada contra la media de las que la preceden. Dos AVISOS
  // seguidos ya no son una carrera rara: son el modelo separandose en dos
  // tandas. Devuelve null si no hay al menos dos seguidas fuera de la banda.
  function liveDriftStreak() {
    const list = livePasses.slice(-10).filter((item) => Number.isFinite(item.mean));
    const drifts = [];

    for (let i = list.length - 1; i >= 1; i--) {
      let sum = 0;
      for (let j = 0; j < i; j++) sum += list[j].mean;
      const drift = list[i].mean - sum / i;
      if (Math.abs(drift) <= LIVE_DRIFT_LIMIT) break;
      drifts.unshift({ at: list[i].at, drift });
    }

    return drifts.length >= 2 ? { count: drifts.length, drifts } : null;
  }
  let livePasses = (() => {
    try {
      const raw = JSON.parse(disk.get(LIVE_PASSES_KEY, '[]'));
      return Array.isArray(raw) ? raw.filter((item) => item && item.at).slice(-10) : [];
    } catch { return []; }
  })();

  // CSV con comillas (el usuario puede llevar coma) y CRLF. Devuelve solo las
  // filas que entiende; un archivo que no es el historico se ignora.
  function parseLiveCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];

    const head = rows.shift().map((name) => String(name).trim().toLowerCase());
    const at = head.indexOf('at');
    if (at < 0 || head.indexOf('races') < 0 || head.indexOf('deltas') < 0) return [];

    return rows
      .filter((cells) => cells[at])
      .map((cells) => {
        const get = (name) => {
          const index = head.indexOf(name);
          return index >= 0 ? cells[index] || '' : '';
        };
        return {
          at: get('at'),
          races: Number(get('races')) || 0,
          samples: Number(get('samples')) || 0,
          // Sin dato no es 0: un CSV viejo o recortado no puede pintarse como
          // "+0.00 pts" en el panel. NaN deja la fila sin media, como el resto
          // del panel ya espera (`Number.isFinite`).
          mean: get('mean_pts') === '' ? NaN : Number(get('mean_pts')),
          sd: get('sd_pts') === '' ? NaN : Number(get('sd_pts')),
          outside: Number(get('outside')) || 0,
          user: get('user').trim(),
          deltas: get('deltas').trim(),
        };
      })
      .slice(-10);
  }

  function renderLivePasses() {
    if (!panel.refs || !panel.refs.liveList) return;
    const list = livePasses.slice(-10);

    panel.refs.liveList.textContent = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'log-empty';
      empty.textContent = 'load the csv or the json to compare passes';
      panel.refs.liveList.appendChild(empty);
      setText(panel.refs.liveCount, 'none');
      if (panel.refs.liveDriftRow) panel.refs.liveDriftRow.style.display = 'none';
      if (panel.refs.liveCompareRow) panel.refs.liveCompareRow.style.display = 'none';
      if (panel.refs.livePickRow) panel.refs.livePickRow.style.display = 'none';
      if (panel.refs.liveStreakRow) panel.refs.liveStreakRow.style.display = 'none';
      if (panel.refs.liveSpreadRow) panel.refs.liveSpreadRow.style.display = 'none';
      if (panel.refs.livePickExport) panel.refs.livePickExport.disabled = true;
      return;
    }

    // Con una sola cuenta el nombre sobra; con varias, cada fila dice la suya.
    const accounts = new Set(list.map((pass) => String(pass.user || '').trim()).filter(Boolean));
    const showAccount = accounts.size > 1;

    for (const pass of [...list].reverse()) {
      const row = document.createElement('div');
      row.className = 'log-item';

      const at = document.createElement('i');
      at.textContent = String(pass.at).slice(5, 16).replace('T', ' ');

      const mid = document.createElement('span');
      const bits = [];
      if (showAccount) bits.push(String(pass.user || '').trim() || 'unknown');
      bits.push(`${pass.races} race${pass.races === 1 ? '' : 's'}`);
      if (Number.isFinite(pass.mean)) bits.push(`${pass.mean >= 0 ? '+' : ''}${pass.mean.toFixed(2)} pts`);
      if (Number.isFinite(pass.sd)) bits.push(`sd ${pass.sd.toFixed(2)}`);
      if (pass.outside) bits.push(`${pass.outside}/${pass.samples || '?'} outside`);
      mid.textContent = bits.join(' · ');
      if (pass.deltas) {
        const who = showAccount && pass.user ? `${pass.user} · ` : '';
        mid.title = `${who}model Δ: ${pass.deltas}`;
      }

      const val = document.createElement('b');
      val.textContent = pass.outside ? 'WARN' : 'ok';
      val.dataset.good = pass.outside ? '0' : '1';

      row.append(at, mid, val);
      panel.refs.liveList.appendChild(row);
    }

    setText(panel.refs.liveCount, accounts.size
      ? `${list.length} stored · ${accounts.size} account${accounts.size === 1 ? '' : 's'}`
      : `${list.length} stored`);

    // Deriva entre pasadas: la ultima contra la media de las anteriores. Se
    // compara en puntos de model Δ y no en carreras, porque es la unica cifra
    // comparable entre tandas de distinto tamano.
    const trend = liveDrift();
    if (panel.refs.liveDriftRow) {
      panel.refs.liveDriftRow.style.display = trend ? 'flex' : 'none';
      if (trend) {
        setText(panel.refs.liveDrift, `${signedPts(trend.drift)} pts vs ${signedPts(trend.avg)} avg`);
        setGood(panel.refs.liveDrift, Math.abs(trend.drift) <= LIVE_DRIFT_LIMIT);
        panel.refs.liveDriftRow.title = `Latest pass ${signedPts(trend.latest)} pts vs ${signedPts(trend.avg)} pts average`
          + ` of the previous ${trend.count} pass${trend.count === 1 ? '' : 'es'}`
          + ` · drift ${Math.abs(trend.drift).toFixed(2)} pts (band ±${LIVE_DRIFT_LIMIT})`;
      }
    }

    // Racha: dos o mas pasadas seguidas que se salieron de la banda contra la
    // media anterior. Es distinto de una pasada suelta descentrada.
    const streak = liveDriftStreak();
    if (panel.refs.liveStreakRow) {
      panel.refs.liveStreakRow.style.display = streak ? 'flex' : 'none';
      if (streak) {
        setText(panel.refs.liveStreak, streak.count >= 3
          ? `${streak.count} in a row · sustained`
          : `${streak.count} in a row`);
        setGood(panel.refs.liveStreak, false);
        panel.refs.liveStreakRow.title = `${streak.count} passes in a row are off the average before them`
          + ` (${streak.drifts.map((item) => signedPts(item.drift)).join(', ')} pts, band ±${LIVE_DRIFT_LIMIT})`
          + (streak.count >= 3
            ? '; sustained drift across three or more passes, check the model before the next block.'
            : '; the model is drifting, not one odd pass.');
      }
    }

    // Dispersion del ultimo bloque de 10+ carreras. Se enciende solo si la sd
    // supera 0.10; una sd baja no ocupa una fila que no hace falta.
    const spread = liveSpreadBlock();
    if (panel.refs.liveSpreadRow) {
      const high = Boolean(spread && spread.sd > LIVE_SPREAD_LIMIT);
      panel.refs.liveSpreadRow.style.display = high ? 'flex' : 'none';
      if (high) {
        setText(panel.refs.liveSpread, `sd ${spread.sd.toFixed(2)} · ${spread.races} races`);
        setGood(panel.refs.liveSpread, false);
        panel.refs.liveSpreadRow.title = `Latest ${spread.races}-race block: sd ${spread.sd.toFixed(2)} pts > ${LIVE_SPREAD_LIMIT.toFixed(2)}`
          + ' · the block is too scattered';
      }
    }

    // Comparador de dos pasadas: no es una media movil, son las dos ultimas
    // sesiones con su fecha. La flecha dice hacia donde se movio el modelo.
    const pair = liveCompare();
    if (panel.refs.liveCompareRow) {
      panel.refs.liveCompareRow.style.display = pair ? 'flex' : 'none';
      if (pair) {
        setText(panel.refs.liveCompare,
          `${signedPts(pair.previous.mean)} → ${signedPts(pair.latest.mean)} · ${signedPts(pair.diff)} pts`);
        setGood(panel.refs.liveCompare, Math.abs(pair.diff) <= LIVE_DRIFT_LIMIT);
        panel.refs.liveCompareRow.title =
          `${String(pair.previous.at).slice(0, 16).replace('T', ' ')} ${signedPts(pair.previous.mean)} pts`
          + ` → ${String(pair.latest.at).slice(0, 16).replace('T', ' ')} ${signedPts(pair.latest.mean)} pts`
          + ` · ${Math.abs(pair.diff).toFixed(2)} pts move (band ±${LIVE_DRIFT_LIMIT})`;
      }
    }

    paintLivePickOptions(list);
  }

  // El `live-history.json` que escribe `npm run live` trae las pasadas ya
  // parseadas en `passes`. Se aceptan las dos formas: el CSV completo o el
  // informe corto (las ultimas cinco) que deja la pasada.
  function parseLiveJson(text) {
    let payload;
    try { payload = JSON.parse(text); } catch { return []; }
    const list = payload && Array.isArray(payload.passes) ? payload.passes : [];

    return list
      .filter((item) => item && item.at && Number.isFinite(Number(item.mean)))
      .map((item) => ({
        at: String(item.at),
        races: Number(item.races) || 0,
        samples: Number(item.samples) || 0,
        mean: Number(item.mean),
        // Mismo contrato que el CSV: sin sd no hay dispersion que ensenar; un
        // `0.00` fingido se leeria como una pasada perfectamente estable.
        sd: item.sd === null || item.sd === undefined || item.sd === '' ? NaN : Number(item.sd),
        outside: Number(item.outside) || 0,
        user: String(item.user || '').trim(),
        deltas: Array.isArray(item.deltas)
          ? item.deltas.filter((value) => Number.isFinite(Number(value))).map((value) => signedPts(Number(value))).join(' ')
          : String(item.deltas || ''),
      }))
      .slice(-10);
  }

  function loadLiveCsv(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = text.trim().startsWith('{') ? parseLiveJson(text) : parseLiveCsv(text);
      if (!parsed.length) {
        log('Live passes: that file has no readable rows (expected the CSV or live-history.json from npm run live).');
        return;
      }
      livePasses = parsed;
      try { disk.set(LIVE_PASSES_KEY, JSON.stringify(livePasses)); } catch { /* almacenamiento bloqueado */ }
      renderLivePasses();
      log(`Live passes: ${livePasses.length} loaded from the CSV.`);

      const streak = liveDriftStreak();
      const trend = liveDrift();
      const spread = liveSpreadBlock();

      if (spread && spread.sd > LIVE_SPREAD_LIMIT) {
        log(`Live passes: the latest ${spread.races}-race block is too scattered`
          + ` (sd ${spread.sd.toFixed(2)} pts > ${LIVE_SPREAD_LIMIT.toFixed(2)}); check the block before adding more races.`);
      }

      if (streak) {
        log(`Live passes: ${streak.count} passes in a row are off the average before them`
          + ` (${streak.drifts.map((item) => signedPts(item.drift)).join(', ')} pts, band ±${LIVE_DRIFT_LIMIT})`
          + (streak.count >= 3
            ? '; sustained drift, check the model before the next block.'
            : '; the model is drifting, not just one odd pass.'));
      } else if (trend && Math.abs(trend.drift) > LIVE_DRIFT_LIMIT) {
        log(`Live passes: the latest pass is ${signedPts(trend.drift)} pts off the previous average`
          + ` (${signedPts(trend.latest)} vs ${signedPts(trend.avg)}, band ±${LIVE_DRIFT_LIMIT}); check the model.`);
      }
      // El aviso acaba de entrar en el anillo; se pinta ya en vez de esperar al
      // siguiente latido del panel.
      updatePanel();
    };
    reader.onerror = () => log('Live passes: the file could not be read.');
    reader.readAsText(file);
  }

  // Olvidar lo cargado no toca el CSV del disco: solo la copia del panel. El
  // selector se limpia para que volver a elegir el mismo archivo dispare change.
  function clearLivePasses() {
    livePasses = [];
    disk.remove(LIVE_PASSES_KEY);
    if (panel.refs && panel.refs.liveFile) panel.refs.liveFile.value = '';
    renderLivePasses();
    log('Live passes: cleared from the panel. The CSV on disk is untouched.');
    if (panel.refs && panel.refs.liveDriftRow) panel.refs.liveDriftRow.style.display = 'none';
    if (panel.refs && panel.refs.liveCompareRow) panel.refs.liveCompareRow.style.display = 'none';
    if (panel.refs && panel.refs.livePickRow) panel.refs.livePickRow.style.display = 'none';
    if (panel.refs && panel.refs.livePickExport) panel.refs.livePickExport.disabled = true;
    if (panel.refs && panel.refs.liveStreakRow) panel.refs.liveStreakRow.style.display = 'none';
    if (panel.refs && panel.refs.liveSpreadRow) panel.refs.liveSpreadRow.style.display = 'none';
  }

  // Las tandas cerradas tambien salen en CSV. El registro del panel y la tabla
  // de Alt+H sirven para mirar, pero para sumar una semana o comparar sesiones
  // hace falta una hoja de calculo. Se genera con los mismos datos que ya estan
  // guardados: esto no toca el estado ni abre nada.
  function exportSessionsCsv() {
    const days = dayHistoryRead();
    if (!tandaLog.length && !days.length) {
      setConfigNote('Nothing to export yet: no closed sessions and no days recorded.');
      return;
    }

    // Comillas solo cuando hacen falta; las de dentro, dobladas. El motivo de
    // cierre es texto libre y puede traer comas.
    const csvCell = (value) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    // Una sola tabla con `kind` delante: primero las sesiones cerradas y debajo
    // el resumen de cada dia del historico. Comparten las columnas que tienen
    // sentido en ambos; las que no (precision en un dia, cajas en una sesion)
    // van vacias en vez de inventar un cero.
    const rows = [['kind', 'at', 'races', 'wpm', 'target_wpm', 'deviation_pct', 'accuracy_pct', 'dq', 'boxes', 'xp', 'reason']];

    for (const item of tandaLog) {
      const deviation = Number.isFinite(item.wpm) && Number.isFinite(item.target) && item.target > 0
        ? (((item.wpm - item.target) / item.target) * 100).toFixed(2)
        : '';

      rows.push([
        'session',
        new Date(item.at).toISOString(),
        item.races,
        Number.isFinite(item.wpm) ? item.wpm.toFixed(2) : '',
        Number.isFinite(item.target) ? item.target.toFixed(2) : '',
        deviation,
        Number.isFinite(item.acc) ? item.acc.toFixed(2) : '',
        item.dq | 0,
        '',
        Number.isFinite(item.xp) ? Math.max(0, Math.round(item.xp)) : '',
        item.reason || '',
      ]);
    }

    for (const day of days) {
      const wpm = day.races > 0 ? day.sumWpm / day.races : null;
      const target = day.races > 0 ? day.sumTarget / day.races : null;
      const deviation = wpm !== null && target > 0
        ? (((wpm - target) / target) * 100).toFixed(2)
        : '';

      rows.push([
        'day',
        day.date,
        day.races,
        wpm === null ? '' : wpm.toFixed(2),
        target === null ? '' : target.toFixed(2),
        deviation,
        '',
        day.dq | 0,
        day.boxes | 0,
        Math.max(0, Math.round(day.xp || 0)),
        '',
      ]);
    }

    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const stamp = todayKey().replace(/-/g, '');

    try {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `nitrotype-history-${stamp}.csv`;
      link.style.display = 'none';
      (document.body || document.documentElement).appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);

      const bits = [];
      if (tandaLog.length) bits.push(`${tandaLog.length} closed session${tandaLog.length === 1 ? '' : 's'}`);
      if (days.length) bits.push(`${days.length} day${days.length === 1 ? '' : 's'}`);
      setConfigNote(`Exported ${bits.join(' + ')}.`);
      log(`History exported to CSV: ${bits.join(' + ')} in ${rows.length - 1} rows.`);
    } catch (error) {
      setConfigNote('The browser refused the download: the numbers are still in Alt+H.');
      log('CSV export failed:', error);
    }
  }
