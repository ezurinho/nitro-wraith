'use strict';

/*
 * Captura de pantalla del panel para la regresion visual.
 *
 * Vivio dentro de tests/live/run.js hasta que el banco paso de 7 k lineas. No
 * comparte estado con las comprobaciones: solo necesita el CDP, el reloj
 * congelado, el directorio de fotos y tres ayudas (sleep, waitFor, captureShot).
 * Por eso entra como fabrica con dependencias explicitas y el cuerpo de las
 * funciones se movio tal cual, sin reescribir una linea.
 *
 *   const capture = createCapture({ fs, os, path, sleep, waitFor, captureShot,
 *     SCRIPT, SCRIPT_VERSION, SHOT_DIR, VISUAL_CAPTURE, VISUAL_FROZEN_AT,
 *     VISUAL_NARROW });
 *   await capture.capturePanelThemes(cdp, appUrl);
 */

module.exports = function createCapture(deps) {
  const {
    fs, os, path, sleep, waitFor, captureShot,
    SCRIPT, SCRIPT_VERSION, SHOT_DIR, VISUAL_CAPTURE, VISUAL_FROZEN_AT, VISUAL_NARROW,
  } = deps;

// Se mide el panel con la vista ya montada y se le da al iframe ese alto: el
// panel es fixed al borde inferior y, si el marco se queda corto, la cabecera
// saldria fuera de la foto. Con `width` se estrecha el marco ANTES de medir:
// el panel recorta su ancho a `100vw - 32px` y ese es el layout que se
// documenta; el alto se vuelve a medir porque la columna crece al envolver.
async function shootViewState(cdp, label, file, width) {
  const widthPx = Number(width) > 0 ? Math.round(Number(width)) : 0;
  const frameHeight = await cdp.evaluate(`(() => {
    const frame = document.querySelector('iframe');
    ${widthPx ? `frame.style.width = '${widthPx}px';` : ''}
    const panel = frame.contentWindow.document
      .getElementById('nt-autotyper-panel').shadowRoot.querySelector('.panel');
    return panel ? Math.ceil(panel.getBoundingClientRect().height) + 48 : 0;
  })()`);
  if (!frameHeight || frameHeight <= 48) throw new Error(`panel height not found: ${label}`);
  await cdp.evaluate(`(() => {
    const frame = document.querySelector('iframe');
    frame.style.height = '${frameHeight}px';
    document.body.style.minHeight = '${frameHeight}px';
    return true;
  })()`);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 520, height: Math.max(1200, frameHeight + 24), deviceScaleFactor: 2, mobile: false,
  });
  await sleep(150);
  await cdp.evaluate('(() => document.querySelector(\'iframe\').contentWindow.__ntaDebug.paint(true))()');
  await sleep(120);

  const clip = await cdp.evaluate(`(() => {
    const frame = document.querySelector('iframe');
    const root = frame.contentWindow.document
      .getElementById('nt-autotyper-panel').shadowRoot;
    const panel = root.querySelector('.panel');
    if (!panel) return null;
    if (typeof panel.getAnimations === 'function') {
      for (const anim of panel.getAnimations({ subtree: true })) {
        try { anim.pause(); anim.currentTime = 0; } catch { /* ya cancelada */ }
      }
    }
    const status = root.querySelector('[data-field="status"]');
    if (status) status.textContent = 'Live · auto pace';
    const f = frame.getBoundingClientRect();
    const r = panel.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round(f.left + r.left - 18)),
      y: Math.max(0, Math.round(f.top + r.top - 18)),
      width: Math.ceil(r.width + 36),
      height: Math.ceil(r.height + 36),
    };
  })()`);
  if (!clip) throw new Error(`panel clip not found: ${label}`);
  await captureShot(cdp, path.join(SHOT_DIR, file), clip);
  return frameHeight;
}

async function captureViewStates(cdp) {
  const expanded = await cdp.evaluate(`(() => {
    const root = document.querySelector('iframe').contentWindow.document
      .getElementById('nt-autotyper-panel').shadowRoot;
    if (!root || root.getElementById('nta-visual-expand')) return false;
    const style = document.createElement('style');
    style.id = 'nta-visual-expand';
    // Sin el tope de alto del panel: con la vista sin scroll pero el panel
    // recortado a 100vh, el pie y las acciones (sticky) se pintaban ENCIMA de
    // las tarjetas y la foto documentaba un layout que nadie ve. Con el alto
    // en auto la columna entera fluye y la foto es la UI real.
    style.textContent = '.views{max-height:none!important;overflow:visible!important;}'
      + '.panel{height:auto!important;max-height:none!important;}';
    root.appendChild(style);
    return true;
  })()`);
  if (!expanded) throw new Error('could not expand the views for screenshots');

  // Carbon: las baselines de TUNE/LOG no pueden depender del ultimo tema que
  // recorrio la galeria.
  await cdp.evaluate(`(() => {
    const root = document.querySelector('iframe').contentWindow.document
      .getElementById('nt-autotyper-panel').shadowRoot;
    const button = root.querySelector('[data-theme-btn="carbon"]');
    if (button) button.click();
    return Boolean(button);
  })()`);

  const views = ['tune', 'log'];
  const states = ['idle', 'racing', 'stopped'];
  for (const view of views) {
    const shown = await cdp.evaluate(`(() => {
      const root = document.querySelector('iframe').contentWindow.document
        .getElementById('nt-autotyper-panel').shadowRoot;
      const button = root.querySelector('[data-tab-btn="${view}"]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (!shown) throw new Error(`tab not found: ${view}`);

    for (const state of states) {
      await cdp.evaluate(`(() => {
        const w = document.querySelector('iframe').contentWindow;
        const d = w.__ntaDebug;
        const now = Date.now();
        const stop = { at: now - 120000, reason: 'limit 50 races', holdMs: 600000 };
        if ('${state}' === 'stopped') {
          w.localStorage.setItem('ntQueue:stoppedAt', JSON.stringify(stop));
          w.localStorage.setItem('ntQueue:lastStop', JSON.stringify({ ...stop, clearedAt: 0, clearedBy: '' }));
          d.patchSession({
            races: 128, raceLimit: 310, xp: 1240,
            sumRaces: 128, sumWpm: 13696, sumTarget: 13696, sumAcc: 12633.6,
            chars: 550, correct: 543, errors: 7,
            startedAt: now - 60000, endedAt: now - 3000, clockDone: true,
            typing: false, stopped: 1, closed: 1, lastAcceptedAt: now - 3000,
          });
        } else if ('${state}' === 'racing') {
          w.localStorage.removeItem('ntQueue:stoppedAt');
          w.localStorage.removeItem('ntQueue:lastStop');
          d.patchSession({
            races: 128, raceLimit: 310, xp: 1240,
            sumRaces: 128, sumWpm: 13696, sumTarget: 13696, sumAcc: 12633.6,
            chars: 550, correct: 543, errors: 7,
            startedAt: now - 60000, endedAt: 0, clockDone: true,
            typing: true, stopped: 0, closed: 0, lastAcceptedAt: now - 200,
            raceWpmDrift: 0, raceAccDrift: 0,
          });
        } else {
          w.localStorage.removeItem('ntQueue:stoppedAt');
          w.localStorage.removeItem('ntQueue:lastStop');
          d.patchSession({
            races: 0, raceLimit: 310, xp: 0,
            sumRaces: 0, sumWpm: 0, sumTarget: 0, sumAcc: 0,
            chars: 0, correct: 0, errors: 0,
            startedAt: 0, endedAt: 0, clockDone: false,
            typing: false, stopped: 0, closed: 0, lastAcceptedAt: 0,
          });
        }
        const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
        const status = shadow.querySelector('[data-field="status"]');
        if (status) status.textContent = 'Live · auto pace';
        d.paint(true);
        return true;
      })()`);
      await sleep(120);

      const defaultHeight = await shootViewState(cdp, `${view}/${state}`, `view-${view}-${state}.png`);
      // Mismo estado con el marco estrecho: el panel limita su ancho a
      // `100vw - 32px`, asi que solo asi se ejerce el ajuste de la columna.
      // El alto que deja la pasada estrecha es mayor (la columna envuelve), y
      // el panel se recorta a 100vh: hay que devolver el marco a la caja de la
      // foto normal o la siguiente captura sale con otro recorte.
      if (VISUAL_NARROW) {
        await shootViewState(cdp, `${view}/${state} · narrow`,
          `narrow-view-${view}-${state}.png`, Number(VISUAL_NARROW.width));
        await cdp.evaluate(`(() => {
          const frame = document.querySelector('iframe');
          frame.style.width = '420px';
          frame.style.height = '${defaultHeight}px';
          document.body.style.minHeight = '${defaultHeight}px';
          return true;
        })()`);
        await sleep(120);
      }
    }
  }
}

// El panel pequeno del garaje vive en la ventana de arriba. Se siembra un dia
// fijo y se borra lo que dejaron las pruebas; despues se fuerzan los tres
// estados de la cola: armed (en carrera), waiting (en espera) y stopped.
async function captureGarageStates(cdp, appUrl) {
  const garageUrl = new URL('/garage/', appUrl).toString();
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 520, height: 1200, deviceScaleFactor: 2, mobile: false,
  });

  await cdp.evaluate(`(() => {
    const now = ${VISUAL_FROZEN_AT};
    const version = ${JSON.stringify(SCRIPT_VERSION)};
    const frozen = new Date(now);
    const todayKey = frozen.getFullYear() + '-'
      + String(frozen.getMonth() + 1).padStart(2, '0') + '-'
      + String(frozen.getDate()).padStart(2, '0');
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const key of keys) {
      if (!key) continue;
      if (key.startsWith('ntQueue:todayPart:') || key.startsWith('ntQueue:dayHist:')
        || key.startsWith('ntQueue:box')
        || key === 'ntQueue:stoppedAt' || key === 'ntQueue:lastStop'
        || key === 'ntQueue:stopHistory' || key === 'ntQueue:banClearHold'
        || key === 'ntQueue:lastLogin' || key === 'ntQueue:notice'
        || key === 'ntQueue:lastFail' || key === 'ntQueue:stuckAt'
        || key === 'player_token') {
        localStorage.removeItem(key);
      }
    }
    sessionStorage.removeItem('ntQueue:armedAt');
    localStorage.setItem('autoTyperPanelTheme', 'carbon');
    localStorage.setItem('autoTyperCalibratedRange', JSON.stringify({ min: 103, max: 117 }));
    localStorage.setItem('autoTyperCalibrationAt', String(now - 600000));
    localStorage.setItem('autoTyperCalibrationVersion', version);
    localStorage.setItem('persist:nt', JSON.stringify({
      user: JSON.stringify({
        username: 'visual', userID: 7,
        avgSpeed: 110, avgAcc: 98.7, highestSpeed: 230, racesPlayed: 48756,
      }),
    }));
    localStorage.setItem('autoTyperSeason', JSON.stringify({
      v: 2, at: now, auto: true, source: 'user', seasonID: 73,
      seasonName: 'Spirit Racers', tier: 6, nextTier: 7,
      progress: 34, xp: 76701, currentXp: 70000, nextXp: 90000,
      endsAt: now + 27 * 86400000, endsText: 'Nov 29',
    }));
    localStorage.setItem('nta:update', JSON.stringify({
      at: now - 60000, status: 200, latest: version, via: 'gist',
    }));
    localStorage.setItem('ntQueue:todayPart:visual', JSON.stringify({
      date: todayKey, races: 128, sumWpm: 14080, sumTarget: 14080,
      boxes: 2, dq: 0, xp: 1240, clean: 120, firstAt: now - 7200000,
      lastAt: now, dqAt: 0, updatedAt: now,
    }));
    return true;
  })()`);

  // El fixture del garaje no carga el userscript en la ventana de arriba: el
  // banco lo inyecta. Se hace despues de navegar para que el panel pequeno
  // tenga la ruta correcta desde su arranque.
  const bootGarage = async () => {
    await waitFor(async () => {
      try {
        return await cdp.evaluate(`location.pathname === '/garage/' && document.readyState === 'complete'`);
      } catch {
        return false;
      }
    }, 10000, 'the garage page');
    await cdp.evaluate(fs.readFileSync(SCRIPT, 'utf8'));
    await waitFor(async () => {
      try {
        return await cdp.evaluate(`(() => {
          const host = document.getElementById('nt-queue-panel');
          return Boolean(host && host.shadowRoot && host.shadowRoot.querySelector('.p'));
        })()`);
      } catch {
        return false;
      }
    }, 15000, 'the garage panel for screenshots');
    // El iframe de carrera del fixture no existe en el garaje real y su panel
    // grande se asomaria por el margen de la foto. Se oculta (sus timers y su
    // publicacion de __ntaFrame siguen vivos).
    await cdp.evaluate(`(() => {
      const frame = document.querySelector('iframe');
      if (frame) frame.style.display = 'none';
      return true;
    })()`);
  };

  await cdp.send('Page.navigate', { url: garageUrl });
  await bootGarage();
  await waitFor(async () => {
    try {
      return await cdp.evaluate(`(() => {
        const host = document.getElementById('nt-queue-panel');
        const p = host && host.shadowRoot && host.shadowRoot.querySelector('.p');
        return Boolean(p && p.dataset.armed === '1');
      })()`);
    } catch {
      return false;
    }
  }, 10000, 'the garage queue to arm');

  if (SHOT_DIR) {
    // El garaje se fotografia con el resumen del dia sembrado. Si el seed no
    // llega, la foto sigue siendo valida pero sale vacia: las baselines dejan
    // de significar lo mismo y el gate visual se queda ciego sin avisar. Falla
    // aqui, con el motivo, en vez de guardar una foto que no documenta nada.
    const state = await cdp.evaluate(`(() => {
      const day = window.__ntaDebug && window.__ntaDebug.diagnostic
        ? (window.__ntaDebug.diagnostic().day || null) : null;
      const host = document.getElementById('nt-queue-panel');
      const root = host && host.shadowRoot;
      const row = root ? root.querySelector('[data-f="dayRow"]') : null;
      const parts = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith('ntQueue:todayPart:')) parts.push(key);
      }
      return { day, hidden: row ? row.hidden : null, parts };
    })()`);
    const races = state.day ? Number(state.day.races) : -1;
    if (races !== 128 || state.hidden !== false) {
      throw new Error('the visual seed did not reach the garage panel'
        + ` (races ${races}, dayRow hidden ${state.hidden}, parts ${JSON.stringify(state.parts)})`);
    }
  }

  // Sin animacion de entrada ni transiciones de color: el LED cambia de estado
  // entre capturas y una transicion a medio camino no es una regresion.
  await cdp.evaluate(`(() => {
    const root = document.getElementById('nt-queue-panel').shadowRoot;
    if (!root || root.getElementById('nta-visual-freeze')) return false;
    const style = document.createElement('style');
    style.id = 'nta-visual-freeze';
    style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;}';
    root.appendChild(style);
    return true;
  })()`);

  const garageClip = () => cdp.evaluate(`(() => {
    const host = document.getElementById('nt-queue-panel');
    const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.p');
    if (!panel) return null;
    if (typeof panel.getAnimations === 'function') {
      for (const anim of panel.getAnimations({ subtree: true })) {
        try { anim.pause(); anim.currentTime = 0; } catch { /* ya cancelada */ }
      }
    }
    const r = panel.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round(r.left - 18)),
      y: Math.max(0, Math.round(r.top - 18)),
      width: Math.ceil(r.width + 36),
      height: Math.ceil(r.height + 36),
    };
  })()`);
  const garagePaint = () => cdp.evaluate(
    '(() => { if (window.__ntaDebug && window.__ntaDebug.garagePaint) window.__ntaDebug.garagePaint(); return true; })()',
  );

  const captureGarageShot = async (name) => {
    await garagePaint();
    await sleep(150);
    const clip = await garageClip();
    if (!clip) throw new Error(`garage clip not found: ${name}`);
    await captureShot(cdp, path.join(SHOT_DIR, `view-garage-${name}.png`), clip);

    // La hoja del garaje tambien limita su ancho a `100vw - 32px`: la captura
    // estrecha la ventana y vuelve a medir su caja.
    if (VISUAL_NARROW) {
      const width = Math.round(Number(VISUAL_NARROW.width));
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width, height: 1200, deviceScaleFactor: 2, mobile: false,
      });
      await sleep(180);
      await garagePaint();
      await sleep(120);
      const narrowClip = await garageClip();
      if (!narrowClip) throw new Error(`narrow garage clip not found: ${name}`);
      await captureShot(cdp, path.join(SHOT_DIR, `narrow-view-garage-${name}.png`), narrowClip);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 520, height: 1200, deviceScaleFactor: 2, mobile: false,
      });
      await sleep(120);
    }
  };

  await cdp.evaluate(`(() => {
    const frame = document.querySelector('iframe');
    const typer = frame && frame.contentWindow && frame.contentWindow.__ntaDebug;
    if (typer && typer.patchSession) typer.patchSession({ raceWpmDrift: 0, raceAccDrift: 0 });
    const root = document.getElementById('nt-queue-panel').shadowRoot;
    const style = document.createElement('style');
    style.id = 'nta-visual-fixed-racing';
    style.textContent = '.p{height:540px!important;}';
    root.appendChild(style);
    return true;
  })()`);
  await captureGarageShot('racing');
  await cdp.evaluate(`(() => {
    const root = document.getElementById('nt-queue-panel').shadowRoot;
    const style = root.querySelector('#nta-visual-fixed-racing');
    if (style) style.remove();
    return true;
  })()`);

  // En espera: el tipador del iframe se declara parado, que es la condicion que
  // de verdad frena el rearme automatico del garaje, y se suelta el armed. Asi
  // el LED queda ambar y el estado dice "waiting · starts by itself" sin una
  // parada real ni una puerta inventada.
  await cdp.evaluate(`(() => {
    const frame = document.querySelector('iframe');
    const typer = frame && frame.contentWindow && frame.contentWindow.__ntaDebug;
    if (typer && typer.patchSession) typer.patchSession({ typing: 0, stopped: 1, endedAt: 0 });
    const d = window.__ntaDebug;
    if (d && d.armedReset) d.armedReset();
    // El aviso de la cola dice "queue armed" de la captura anterior; en espera
    // no hay nada que anunciar y la fila "why" se oculta sola.
    try { sessionStorage.removeItem('ntQueue:why'); } catch { /* bloqueado */ }
    if (d && d.garagePaint) d.garagePaint();
    return true;
  })()`);
  await sleep(400);
  await captureGarageShot('idle');

  // Una parada en curso: la cola no se arma sola y el panel ensena las filas
  // "waiting on" y "stopped". Se recarga para que garageAutoDone vuelva a
  // empezar y respete la marca.
  await cdp.evaluate(`(() => {
    const now = Date.now();
    const stop = { at: now - 120000, reason: 'limit 50 races', holdMs: 600000 };
    localStorage.setItem('ntQueue:stoppedAt', JSON.stringify(stop));
    localStorage.setItem('ntQueue:lastStop', JSON.stringify({ ...stop, clearedAt: 0, clearedBy: '' }));
    return true;
  })()`);
  await cdp.send('Page.reload');
  await bootGarage();
  await waitFor(async () => {
    try {
      return await cdp.evaluate(`(() => {
        const host = document.getElementById('nt-queue-panel');
        const root = host && host.shadowRoot;
        const p = root && root.querySelector('.p');
        const row = root && root.querySelector('[data-f="stopRow"]');
        return Boolean(p && p.dataset.armed === '0' && row && !row.hidden);
      })()`);
    } catch {
      return false;
    }
  }, 10000, 'the stopped garage panel');
  await cdp.evaluate(`(() => {
    const root = document.getElementById('nt-queue-panel').shadowRoot;
    if (!root || root.getElementById('nta-visual-freeze')) return false;
    const style = document.createElement('style');
    style.id = 'nta-visual-freeze';
    style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;}';
    root.appendChild(style);
    return true;
  })()`);
  await captureGarageShot('stopped');
}

// Genera la galeria que usa el README. Solo corre cuando el workflow manual
// pasa SHOT_DIR; el check normal no escribe archivos ni cambia su resultado.
async function capturePanelThemes(cdp, appUrl) {
  if (!SHOT_DIR) return;

  // Reloj congelado solo durante la captura visual: las etiquetas relativas
  // ("just now", "27d", "closed 14:05") dejan de cambiar entre ejecuciones.
  // Se inyecta antes de navegar y se retira al terminar, para que el resto del
  // banco siga con el reloj real. El script se aplica tambien al iframe.
  let freezeId = null;
  if (VISUAL_CAPTURE) {
    const frozen = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const RealDate = Date;
        const AT = ${VISUAL_FROZEN_AT};
        function FrozenDate(...args) {
          if (!(this instanceof FrozenDate)) return new RealDate(AT).toString();
          return args.length ? new RealDate(...args) : new RealDate(AT);
        }
        FrozenDate.prototype = RealDate.prototype;
        FrozenDate.now = function () { return AT; };
        FrozenDate.parse = RealDate.parse;
        FrozenDate.UTC = RealDate.UTC;
        window.__ntaVisualUnfreeze = function () { window.Date = RealDate; };
        window.Date = FrozenDate;
      })();`,
    });
    freezeId = frozen.identifier || null;
  }

  // La captura documenta la funcion nueva: una cuenta de 110 WPM con top 230.
  // Se deja la calibracion y el perfil en el almacenamiento antes de navegar
  // para que el panel arranque como en una instalacion real, sin esperar al API.
  //
  // Se navega ANTES de sembrar: el documento que dejo vivo el resto del banco
  // corre con el reloj real, y leer un resumen fechado en el instante congelado
  // lo toma por de otro dia y lo borra (era el motivo de que las fotos del
  // garaje y del log salieran sin races, boxes ni alerts). Con la navegacion
  // delante, el que siembra ya es un documento con el reloj congelado, y el
  // segundo salto deja al panel arrancando sobre el estado sembrado: las caches
  // de 1,5 s no caducan con el reloj fijo, asi que no basta con hidratar.
  const panelReady = `(() => {
    const frame = document.querySelector('iframe');
    return Boolean(frame && frame.contentWindow.__ntaDebug
      && frame.contentWindow.document.getElementById('nt-autotyper-panel'));
  })()`;
  await cdp.send('Page.navigate', { url: appUrl });
  await waitFor(async () => {
    try {
      return await cdp.evaluate(panelReady);
    } catch {
      return false;
    }
  }, 15000, 'the page for screenshots');

  await cdp.evaluate(`(() => {
    localStorage.setItem('autoTyperCalibratedRange', JSON.stringify({ min: 103, max: 117 }));
    localStorage.setItem('persist:nt', JSON.stringify({
      user: JSON.stringify({
        avgSpeed: 110, avgAcc: 98.7, highestSpeed: 230, racesPlayed: 48756,
      }),
    }));
    // Temporada y resumen del dia ANTES de navegar. Con el reloj congelado las
    // caches de 1,5 s no caducan, asi que sembrarlos despues dejaria la foto
    // con guiones donde deberia estar el XP real.
    if (${VISUAL_CAPTURE}) {
      const now = ${VISUAL_FROZEN_AT};
      const version = ${JSON.stringify(SCRIPT_VERSION)};
      // Las pruebas escriben dias, cajas y una calibracion con la hora real
      // antes de llegar aqui. La foto visual necesita el mismo juego de datos
      // en cada ejecucion, asi que se limpian esas claves y se siembran a mano.
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('ntQueue:todayPart:') || key.startsWith('ntQueue:dayHist:')
          || key.startsWith('ntQueue:box'))) {
          localStorage.removeItem(key);
        }
      }
      localStorage.setItem('autoTyperCalibrationAt', String(now - 600000));
      localStorage.setItem('autoTyperCalibrationVersion', version);
      localStorage.setItem('nta:update', JSON.stringify({
        at: now - 60000, status: 200, latest: version, via: 'gist',
      }));
      localStorage.setItem('autoTyperAccDeltas', JSON.stringify([0.3, -0.2, 0.1]));
      localStorage.removeItem('nta:afkFreeze');
      localStorage.setItem('autoTyperSeason', JSON.stringify({
        v: 2, at: now, auto: true, source: 'user', seasonID: 73,
        seasonName: 'Spirit Racers', tier: 6, nextTier: 7,
        progress: 34, xp: 76701, currentXp: 70000, nextXp: 90000,
        endsAt: now + 27 * 86400000, endsText: 'Nov 29',
      }));
      const frozen = new Date(now);
      const todayKey = frozen.getFullYear() + '-'
        + String(frozen.getMonth() + 1).padStart(2, '0') + '-'
        + String(frozen.getDate()).padStart(2, '0');
      localStorage.setItem('ntQueue:todayPart:shot', JSON.stringify({
        date: todayKey, races: 128, sumWpm: 14080, sumTarget: 14080,
        boxes: 2, dq: 0, xp: 1240, clean: 120, firstAt: now - 7200000,
        lastAt: now, dqAt: 0, updatedAt: now,
      }));
      // La vista LOG dibuja la semana pasada; sin esto dependeria de las
      // claves relativas del fixture, que caen fuera de la ventana congelada.
      const week = [
        { ago: 1, races: 42, wpm: 111, dq: 0, boxes: 1, xp: 5120 },
        { ago: 2, races: 56, wpm: 110, dq: 1, boxes: 1, xp: 6480 },
        { ago: 3, races: 38, wpm: 112, dq: 0, boxes: 0, xp: 4410 },
        { ago: 4, races: 61, wpm: 109, dq: 0, boxes: 1, xp: 7020 },
        { ago: 5, races: 47, wpm: 113, dq: 2, boxes: 0, xp: 5380 },
        { ago: 6, races: 51, wpm: 110, dq: 0, boxes: 1, xp: 5940 },
        { ago: 7, races: 44, wpm: 108, dq: 0, boxes: 1, xp: 4980 },
      ];
      for (const [index, day] of week.entries()) {
        const stamp = new Date(now - day.ago * 86400000);
        const dateKey = stamp.getFullYear() + '-'
          + String(stamp.getMonth() + 1).padStart(2, '0') + '-'
          + String(stamp.getDate()).padStart(2, '0');
        localStorage.setItem('ntQueue:dayHist:' + dateKey + ':shot' + index, JSON.stringify({
          date: dateKey, races: day.races, sumWpm: day.races * day.wpm,
          sumTarget: day.races * 110, boxes: day.boxes, dq: day.dq, xp: day.xp,
          clean: day.races - day.dq, firstAt: now - day.ago * 86400000 - 3600000,
          lastAt: now - day.ago * 86400000, dqAt: 0, updatedAt: now,
        }));
      }
    }
    return true;
  })()`);

  await cdp.send('Page.reload');
  await waitFor(async () => {
    try {
      return await cdp.evaluate(panelReady);
    } catch {
      return false;
    }
  }, 15000, 'the panel for screenshots');
  // Deja que boot termine de cargar contadores antes de sembrar la demo. No se
  // llama a stop(): en este fixture no hay carrera que arrancar y la parada
  // dejaria una tanda "debug stop" en la vista LOG que no es del usuario.
  await sleep(900);

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 520, height: 1200, deviceScaleFactor: 2, mobile: false,
  });
  await sleep(180);

  const seeded = await cdp.evaluate(`(() => {
    const frame = document.querySelector('iframe');
    const w = frame && frame.contentWindow;
    const d = w && w.__ntaDebug;
    if (d && d.hydrateAllViews) d.hydrateAllViews();
    const host = w && w.document.getElementById('nt-autotyper-panel');
    const root = host && host.shadowRoot;
    const panel = root && root.querySelector('.panel');
    if (!d || !panel) return { ready: false };

    frame.style.height = '1200px';
    w.document.body.style.minHeight = '1200px';
    const now = Date.now();
    d.patchSession({
      races: 128, raceLimit: 310, xp: 1240,
      sumRaces: 128, sumWpm: 13696, sumTarget: 13696, sumAcc: 12633.6,
      chars: 550, correct: 543, errors: 7,
      startedAt: now - 60000, endedAt: 0, clockDone: true, typing: true,
      lastAcceptedAt: now - 200,
      stopped: 0, closed: 0,
      dailyRaceLimit: 0, dailyXpLimit: 0, activeOn: 0,
    });
    d.seedHistory([
      { at: now - 90000, wpm: 112.6, acc: 97.1, place: 2, cash: 18, xp: 920 },
      { at: now - 240000, wpm: 109.8, acc: 96.2, place: 4, cash: 11, xp: 780 },
      { at: now - 390000, wpm: 114.9, acc: 98.0, place: 1, cash: 24, xp: 1040 },
    ]);
    d.paintSeason();
    const stats = root.querySelector('[data-tab-btn="stats"]');
    if (stats) stats.click();
    if (panel.dataset.collapsed === 'true') {
      const collapse = root.querySelector('.collapse');
      if (collapse) collapse.click();
    }
    // La barra compacta evita que el estado vivo (WPM y precision) empuje el
    // texto del pie fuera del ancho fijo del panel en la captura.
    panel.dataset.foot = 'compact';
    // La pagina del harness queda en segundo plano durante la captura: se pide
    // el repintado forzado para que el panel no dependa de document.hidden.
    d.paint(true);
    return { ready: true, theme: panel.dataset.theme, races: d.session().races };
  })()`);
  if (!seeded.ready) throw new Error('the panel is not ready for screenshots');
  // La fila `today` cachea 1.5 s; se deja pasar la cache y se repinta antes de
  // fotografiar para no ensenar un guion junto a una sesion viva.
  await sleep(1700);
  await cdp.evaluate(`(() => document.querySelector('iframe').contentWindow.__ntaDebug.paint(true))()`);

  // Una regresion visual no puede comparar una animacion a medio camino: se
  // apagan animaciones y transiciones dentro del shadow root. Los colores de
  // cada tema siguen intactos.
  if (VISUAL_CAPTURE) {
    await cdp.evaluate(`(() => {
      const root = document.querySelector('iframe').contentWindow.document
        .getElementById('nt-autotyper-panel').shadowRoot;
      if (!root) return false;
      const style = document.createElement('style');
      style.id = 'nta-visual-freeze';
      style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;}'
        + '.panel,.panel[data-theme],.panel[data-theme] *,.panel[data-theme] *::before,.panel[data-theme] *::after,'
        + '.panel[data-theme]::before,.panel[data-theme]::after{animation:none!important;transition:none!important;}';
      root.appendChild(style);
      return true;
    })()`);
    await cdp.evaluate('(() => document.querySelector(\'iframe\').contentWindow.__ntaDebug.paint(true))()');
  }

  const themes = ['carbon', 'aurora', 'sunset', 'ice', 'violet', 'rgb'];
  try {
    for (const theme of themes) {
      const changed = await cdp.evaluate(`(() => {
        const root = document.querySelector('iframe').contentWindow.document
          .getElementById('nt-autotyper-panel').shadowRoot;
        const button = root.querySelector('[data-theme-btn="${theme}"]');
        if (!button) return false;
        button.click();
        return true;
      })()`);
      if (!changed) throw new Error(`theme button not found: ${theme}`);
      await sleep(300);
      await cdp.evaluate('(() => document.querySelector(\'iframe\').contentWindow.__ntaDebug.paint(true))()');

      const clip = await cdp.evaluate(`(() => {
        const frame = document.querySelector('iframe');
        if (!frame) return null;
        const root = frame.contentWindow.document
          .getElementById('nt-autotyper-panel').shadowRoot;
        const panel = root.querySelector('.panel');
        if (!panel) return null;
        // El tema RGB anima el tono por CSS: se pausan TODAS las animaciones en
        // el instante cero para que dos capturas no salgan con otro gradiente.
        if (typeof panel.getAnimations === 'function') {
          for (const anim of panel.getAnimations({ subtree: true })) {
            try { anim.pause(); anim.currentTime = 0; } catch { /* animacion ya cancelada */ }
          }
        }
        const status = root.querySelector('[data-field="status"]');
        if (status) status.textContent = 'Live · auto pace';
        const guardRow = root.querySelector('[data-field="guard"]');
        if (guardRow && guardRow.closest('.row')) {
          guardRow.closest('.row').style.setProperty('display', 'none', 'important');
        }
        const f = frame.getBoundingClientRect();
        const r = panel.getBoundingClientRect();
        return {
          x: Math.max(0, Math.round(f.left + r.left - 18)),
          y: Math.max(0, Math.round(f.top + r.top - 18)),
          width: Math.ceil(r.width + 36),
          height: Math.ceil(r.height + 36),
        };
      })()`);
      if (!clip) throw new Error(`panel clip not found: ${theme}`);
      await captureShot(cdp, path.join(SHOT_DIR, `theme-${theme}.png`), clip);
    }

    // Fuera de Live: las vistas y los estados que el usuario pidio cubrir.
    await captureViewStates(cdp);
    await captureGarageStates(cdp, appUrl);
  } finally {
    try { await cdp.send('Emulation.clearDeviceMetricsOverride'); } catch { /* ya cerro */ }

    // La huella dice con que navegador y plataforma se tomaron las fotos: las
    // fuentes no son iguales en todas partes y el informe lo avisa antes de
    // mandar a nadie a mirar un diff que solo es texto con otra tipografia.
    //
    // Ademas guarda los dos valores que cambian solos de una corrida a otra y
    // que no son regresiones: la version del script (sube con cada release, se
    // ve en el panel) y el objetivo de ritmo que el panel pinta ("110 · 97.0%"),
    // que sale de una serie sorteada por perfil mas el contador de sesion que
    // avanzan las carreras del banco. Con esto el informe puede decir "la linea
    // de ritmo cambio de 110 a 104" en vez de mandar a recortar PNGs.
    if (VISUAL_CAPTURE) {
      try {
        const version = await cdp.send('Browser.getVersion');
        let target = null;
        try {
          target = await cdp.evaluate(`(() => {
            const frame = document.querySelector('iframe');
            const w = frame && frame.contentWindow;
            const host = w && w.document.getElementById('nt-autotyper-panel');
            const root = host && host.shadowRoot;
            const el = root && root.querySelector('[data-field="target"]');
            return el ? el.textContent.trim() : null;
          })()`);
        } catch { /* la vista ya no esta montada */ }
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        fs.writeFileSync(path.join(SHOT_DIR, 'fingerprint.json'), `${JSON.stringify({
          at: new Date().toISOString(),
          engine: {
            product: version.product,
            browser: String(version.product || '').split('/')[0],
            platform: `${process.platform} ${os.release()}`,
          },
          viewport: { width: 520, height: 1200, deviceScaleFactor: 2 },
          narrow: VISUAL_NARROW || null,
          state: { version: SCRIPT_VERSION, target },
        }, null, 2)}\n`);
      } catch { /* la captura ya esta hecha */ }
    }

    if (freezeId) {
      try {
        await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: freezeId });
      } catch { /* el target ya cerro */ }
    }

    // El resto del banco comprueba tiempos reales (reintentos, esperas). Se
    // descongela el reloj EN EL SITIO, sin navegar: recargar desmontaria las
    // vistas que las pruebas siguientes ya tenian hidratadas.
    if (VISUAL_CAPTURE) {
      try {
        await cdp.evaluate(`(() => {
          try { if (window.__ntaVisualUnfreeze) window.__ntaVisualUnfreeze(); } catch { /* sin reloj congelado */ }
          try {
            const frame = document.querySelector('iframe');
            if (frame && frame.contentWindow.__ntaVisualUnfreeze) frame.contentWindow.__ntaVisualUnfreeze();
          } catch { /* sin reloj congelado */ }
          return true;
        })()`);
      } catch { /* el banco sigue con lo que haya */ }
    }
  }
}
  return { captureViewStates, captureGarageStates, capturePanelThemes };
};
