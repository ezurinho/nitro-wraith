'use strict';

/*
 * Modo de prueba en vivo.
 *
 * No lanza Chrome ni crea un perfil: se conecta al Chrome que ya tienes
 * abierto con `--remote-debugging-port=9222` y a la sesión de Nitro Type que
 * ya está iniciada. Pulsa `Race Now` si hace falta y espera la línea
 * `Accuracy model` que imprime el userscript al terminar la carrera.
 *
 *   npm run live
 *   npm run live -- --dry-run
 *   npm run live -- --inject
 *   npm run live -- --dry-run --inject
 *   LIVE_RACES=5 npm run live
 *   LIVE_TOLERANCE=2.5 npm run live
 *   CDP_PORT=9333 npm run live
 *   LIVE_TIMEOUT_MS=240000 npm run live
 *
 * `LIVE_RACES=N` encadena N carreras y resume la dispersión de model Δ (media,
 * desviación típica y rango). Cada carrera tiene que dejar exactamente una
 * muestra. `--dry-run` valida el puerto, la pestaña, la sesión, la versión del
 * userscript y Race Now sin arrancar la carrera ni escribir el histórico.
 * `--inject` registra el userscript en la sesión CDP para perfiles sin
 * Tampermonkey; junto a `--dry-run`, recarga el garaje en modo sonda para
 * comprobar la versión sin pulsar nada.
 *
 * Requiere el userscript instalado y activo (Tampermonkey) y Node 22+.
 * Falla si no hay puerto, si no hay pestaña de Nitro Type, si no hay sesión,
 * si el evento no trae `typed/skipped/errors` o si una carrera deja más de una
 * muestra.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { PANEL_READ } = require('./panel-read');
const { appendHistory } = require('./history');
const { formatHistory } = require('./report');

const PORT = Number(process.env.CDP_PORT || 9222);
const TIMEOUT_MS = Math.max(30000, Number(process.env.LIVE_TIMEOUT_MS || 180000));
const RACES = Math.max(1, Math.floor(Number(process.env.LIVE_RACES || 1)) || 1);
const TOLERANCE = Math.abs(Number(process.env.LIVE_TOLERANCE || 2)) || 2;
// El userscript guarda como maximo 20 muestras de model Δ: al llegar al tope,
// una carrera nueva entra y desplaza la mas vieja, no hace crecer el array.
const SAMPLE_CAP = 20;
const DRY = process.argv.includes('--dry-run') || process.env.LIVE_DRY === '1';
const INJECT = process.argv.includes('--inject') || process.env.LIVE_INJECT === '1';
const SCRIPT_PATH = path.join(__dirname, '..', '..', 'nitro-wraith.user.js');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function bail(message) {
  console.error(`\nlive: ${message}\n`);
  process.exit(2);
}

// Los campos del panel son texto ya formateado; el JSON del informe conserva
// exactamente lo que se ve, para no inventar un tier que la tarjeta no pinta.
function seasonFromPanel(panel) {
  if (!panel || !panel.seasonTier || panel.seasonTier === '—') return null;
  return {
    name: panel.seasonName || '',
    tier: panel.seasonTier || '',
    xp: panel.seasonXp || '',
    next: panel.seasonNext || '',
    pace: panel.seasonPace || '',
    ends: panel.seasonEnds || '',
    tag: panel.seasonTag || '',
  };
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  const consoleLines = [];

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
      return;
    }

    if (message.method === 'Runtime.consoleAPICalled') {
      const text = (message.params.args || [])
        .map((arg) => (arg.value !== undefined ? String(arg.value) : (arg.description || '')))
        .join(' ');
      consoleLines.push(`[${message.params.type}] ${text}`);
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      consoleLines.push(`[exception] ${details.text} ${details.exception?.description || ''}`);
    }
  };

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({
      send,
      consoleLines,
      async evaluate(expression, awaitPromise = false) {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
        if (result.exceptionDetails) {
          throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        }
        return result.result.value;
      },
      close() { ws.close(); },
    });
    ws.onerror = () => reject(new Error('CDP websocket failed'));
  });
}

function parseSamples(raw) {
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// WPM oficial de la pantalla de resultados. Es el numero que el juego muestra
// al terminar, no la ultima lectura del HUD en vivo (que puede ir un segundo
// atrasada y no es el que se lleva el resultado). Si la carrera vive en un
// iframe, se lee de su documento; si es la pagina entera, del documento top.
const GAME_WPM_READ = `(() => {
  // En la carrera real el userscript vive en el documento top; solo se mira un
  // iframe si no hay __ntaDebug arriba. Antes se cogia el primer iframe de la
  // pagina (un anuncio) y el results screen nunca aparecia.
  const frame = window.__ntaDebug ? null : document.querySelector('iframe');
  const doc = frame && frame.contentDocument ? frame.contentDocument : document;
  const box = doc.querySelector('.race-results .dash-metrics');
  if (!box) return null;
  for (const item of box.querySelectorAll('.list-item')) {
    const label = item.querySelector('.tsxs');
    const value = item.querySelector('.h4');
    if (!label || !value) continue;
    if (!/^wpm$/i.test(label.textContent.trim())) continue;
    const n = parseFloat(value.textContent.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
})()`;

// La linea del userscript termina en "-> +0.0 pts." (o "-0.4 pts.").
function parseDelta(line) {
  const match = String(line || '').match(/->\s*([+-]?\d+(?:\.\d+)?)\s*pts/);
  return match ? Number(match[1]) : null;
}

function signed(value, digits = 1) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

// Media y desviacion tipica muestral (n-1): con dos carreras la poblacional
// saldria mas plana de lo que es.
function summarize(values) {
  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = n > 1
    ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)
    : 0;

  return { n, mean, sd: Math.sqrt(variance), min: Math.min(...values), max: Math.max(...values) };
}

// El userscript publica __ntaVersion en cualquier ventana donde corra. Se lee
// tambien el panel por si una version antigua no tiene el handshake.
async function scriptVersion(cdp) {
  try {
    return await cdp.evaluate(`(() => {
      const version = String(window.__ntaVersion || (window.__ntaDebug && window.__ntaDebug.version) || '').trim();
      const panel = document.getElementById('nt-autotyper-panel');
      const panelVersion = panel && panel.shadowRoot
        ? ((panel.shadowRoot.querySelector('[data-field="ver"]') || {}).textContent || '').trim()
        : '';
      return { version, panel: Boolean(panel), panelVersion };
    })()`);
  } catch {
    return null; // el documento puede estar navegando
  }
}

async function waitForScriptVersion(cdp, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const found = await scriptVersion(cdp);
    if (found && found.version) return found;
    await sleep(500);
  }
  return null;
}

(async () => {
  if (typeof WebSocket !== 'function') {
    bail(`Node 22+ is required (global WebSocket missing). Current: ${process.version}`);
  }

  let targets;
  try {
    targets = await httpJson(`http://127.0.0.1:${PORT}/json/list`);
  } catch {
    bail(`Chrome no escucha en el puerto ${PORT}. Cierra Chrome y ábrelo con --remote-debugging-port=${PORT}, con la sesión de Nitro Type iniciada.`);
  }

  const target = targets.find((item) => item.type === 'page' && /nitrotype\.com/.test(item.url));
  if (!target) {
    bail('No hay una pestaña de nitrotype.com. Abre https://www.nitrotype.com/garage en ese Chrome.');
  }

  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  const who = await cdp.evaluate(`(() => {
    try {
      const raw = localStorage.getItem('persist:nt');
      if (!raw) return { ok: false, reason: 'no hay persist:nt en esta pestaña' };
      const store = JSON.parse(raw);
      const user = typeof store.user === 'string' ? JSON.parse(store.user) : store.user;
      const name = user && (user.username || user.userID);
      // Un invitado (g0.*) tambien deja persist:nt; no es una sesion con la
      // que se pueda correr, asi que no debe pasar la validacion.
      const guest = Boolean(user && (user.loggedIn === false || /^g0\./i.test(String(name || ''))));
      return {
        ok: Boolean(name && !guest),
        guest,
        username: name,
        reason: guest ? 'la pestaña está como invitado' : 'no hay un usuario con sesión',
      };
    } catch (error) {
      return { ok: false, reason: String(error) };
    }
  })()`);
  if (!who.ok) {
    const detail = who.guest
      ? `la pestaña está como invitado (${who.username || 'Guest Racer'})`
      : who.reason;
    bail(`La pestaña no tiene una sesión válida (${detail}). Inicia sesión en Nitro Type en ese Chrome.`);
  }
  console.log(`Nitro Type · sesión de ${who.username}${RACES > 1 ? ` · ${RACES} carreras` : ''}`);

  // El boton cambia de texto y de marco: Race Now en el garaje o en el lobby,
  // Race Again en los resultados, y el juego lo pinta dentro de un iframe del
  // mismo origen. Se recorren los marcos y los shadow roots; se descarta lo
  // oculto (la cabecera tiene un Race Now de 0x0) y se prefiere Race Again al
  // enlace suelto Race del pie. `click` separa la sonda del dry-run del clic.
  const raceButton = (click) => cdp.evaluate(`(() => {
    const nodes = [];
    const visit = (root, depth) => {
      if (!root || depth > 4) return;
      nodes.push(...root.querySelectorAll('button, a, [role="button"]'));
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) visit(el.shadowRoot, depth + 1);
      }
      for (const frame of root.querySelectorAll('iframe')) {
        try { if (frame.contentDocument) visit(frame.contentDocument, depth + 1); } catch { /* marco ajeno */ }
      }
    };
    visit(document, 0);

    const scoreOf = (node) => {
      const text = (node.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      let score = 0;
      if (text === 'race again' || text === 'play again') score = 5;
      else if (text === 'start race') score = 4;
      else if (text === 'race now') score = 3;
      else if (text === 'race') score = 2;
      else if (/race again|race now|start race/.test(text)) score = 1;
      if (!score || node.disabled) return 0;
      if (node.closest('header, nav, .header, .navbar, .site-header')) score -= 4;
      const rect = node.getBoundingClientRect();
      const view = node.ownerDocument.defaultView;
      const style = view ? view.getComputedStyle(node) : null;
      const visible = rect.width >= 2 && rect.height >= 2
        && (!style || (style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05));
      return visible ? score : score - 10;
    };

    let best = null;
    let bestScore = 0;
    for (const node of nodes) {
      const score = scoreOf(node);
      if (score > bestScore) { best = node; bestScore = score; }
    }

    if (!best) {
      return {
        ok: false,
        buttons: nodes.slice(0, 20).map((node) => (node.textContent || '').trim()).filter(Boolean),
      };
    }
    const text = (best.textContent || '').replace(/\\s+/g, ' ').trim();
    ${click ? 'best.click();' : ''}
    return { ok: true, text, score: bestScore };
  })()`);

  // La pantalla de resultados puede tardar unos segundos: se espera al boton
  // en vez de darlo por perdido en el primer latido.
  const waitForRaceButton = async (click, timeoutMs = 20000) => {
    const until = Date.now() + timeoutMs;
    let last = { ok: false, buttons: [] };
    while (Date.now() < until) {
      last = await raceButton(click);
      if (last.ok) return last;
      await sleep(750);
    }
    return last;
  };

  const alreadyRacing = await cdp.evaluate(`location.pathname.includes('/race')`);

  // Un perfil dedicado no tiene por que llevar Tampermonkey. Con --inject el
  // userscript se registra en esta misma sesion CDP, que sigue viva durante la
  // carrera: el documento nuevo y el iframe de /race lo reciben al cargar.
  if (INJECT) {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');

    // En dry-run se recarga el garaje para comprobar la version sin pulsar
    // Race Now: la sonda desactiva la cola de la ventana de arriba.
    if (DRY && !alreadyRacing) {
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__ntaDryProbe = true;' });
    }
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
    console.log(`Userscript inyectado en esta sesión (${source.length} bytes).`);

    if (DRY && !alreadyRacing) {
      await cdp.send('Page.reload', { ignoreCache: false });
      const detected = await waitForScriptVersion(cdp, 10000);
      if (!detected) {
        bail('Inyecté el userscript pero no respondió con su versión en 10 s. Revisa la consola de la pestaña.');
      }
    }
  }

  // Dry-run: valida puerto, pestaña, sesion, version del userscript y boton, y
  // se va sin tocar nada. No lee muestras ni escribe el CSV.
  if (DRY) {
    const bot = await waitForScriptVersion(cdp, 5000);
    if (!bot || !bot.version) {
      bail('No encontré el userscript activo en la pestaña (¿Tampermonkey actualizado?). Instálalo en este perfil o valida el proyecto con: npm run live -- --dry-run --inject');
    }

    const version = /^v/i.test(bot.version) ? bot.version : `v${bot.version}`;
    if (bot.panelVersion) {
      const panelVersion = /^v/i.test(bot.panelVersion) ? bot.panelVersion : `v${bot.panelVersion}`;
      if (panelVersion !== version) {
        bail(`El panel muestra ${bot.panelVersion} y el userscript responde ${bot.version}. Recarga la pestaña.`);
      }
    }
    const scriptLabel = `userscript ${version}`;

    if (alreadyRacing) {
      console.log(`dry-run OK: puerto ${PORT} · pestaña Nitro Type · sesión ${who.username} · ${scriptLabel} · carrera ya abierta.`);
    } else {
      const found = await waitForRaceButton(false, 4000);
      if (!found.ok) {
        bail(`No encontré Race Now. Botones visibles: ${found.buttons.join(' | ') || '(ninguno)'}. Abre el garaje con la sesión iniciada y el userscript activo.`);
      }
      console.log(`dry-run OK: puerto ${PORT} · pestaña Nitro Type · sesión ${who.username} · ${scriptLabel} · botón "${found.text}".`);
    }
    cdp.close();
    return;
  }

  if (alreadyRacing) {
    // /race es tambien el lobby y la pantalla de resultados: si hay un Race
    // Again visible, la carrera anterior termino y se arranca la siguiente.
    // Un "Race" suelto del pie NO se pulsa: podria abandonar una carrera viva.
    const found = await waitForRaceButton(false, 1500);
    if (found.ok && /race again|play again/i.test(found.text)) {
      const clicked = await waitForRaceButton(true, 5000);
      if (!clicked.ok) {
        bail(`No encontré Race Again. Botones visibles: ${clicked.buttons.join(' | ') || '(ninguno)'}.`);
      }
      console.log(`Pulsado: ${clicked.text} (resultados)`);
    } else {
      console.log('Ya hay una carrera abierta; se observa esa.');
    }
  } else {
    const clicked = await waitForRaceButton(true, 5000);
    if (!clicked.ok) {
      bail(`No encontré Race Now. Botones visibles: ${clicked.buttons.join(' | ') || '(ninguno)'}. Abre el garaje con la sesión iniciada y el userscript activo.`);
    }
    console.log(`Pulsado: ${clicked.text}`);
  }

  const before = parseSamples(await cdp.evaluate(`localStorage.getItem('autoTyperAccDeltas') || '[]'`));
  const deltas = [];
  const gameWpms = [];

  for (let race = 1; race <= RACES; race++) {
    const logStart = cdp.consoleLines.length;
    const until = Date.now() + TIMEOUT_MS;
    let sampleLines = [];

    while (Date.now() < until) {
      await sleep(1000);

      const fresh = cdp.consoleLines.slice(logStart);
      sampleLines = fresh.filter((line) => /Accuracy model/.test(line));
      if (sampleLines.length) break;

      const missing = fresh.find((line) => /Accuracy delta:/.test(line));
      if (missing) {
        bail(`Race ${race}/${RACES}: el evento update no trae typed/skipped/errors; model Δ no puede medir. Consola: ${missing}`);
      }
    }

    if (!sampleLines.length) {
      console.log('Últimas líneas de consola:');
      for (const line of cdp.consoleLines.slice(-12)) console.log(`  ${line}`);
      bail(`Race ${race}/${RACES}: no llegó ninguna línea Accuracy model en ${Math.round(TIMEOUT_MS / 1000)} s. ¿Está el bot corriendo? Pulsa Alt+A en la pestaña de la carrera.`);
    }

    const after = parseSamples(await cdp.evaluate(`localStorage.getItem('autoTyperAccDeltas') || '[]'`));
    const expected = Math.min(before.length + race, SAMPLE_CAP);
    const full = before.length >= SAMPLE_CAP;
    const delta = parseDelta(sampleLines[0]);

    console.log(`\nRace ${race}/${RACES}: ${sampleLines.length} línea(s) · muestras ${after.length}/${expected}${full ? ' · buffer full' : ''}`);
    for (const line of sampleLines) console.log(`  ${line}`);

    // El resultado oficial aparece a veces unos cientos de ms despues de la
    // linea: se sondea hasta 2 s, sin bloquear la carrera.
    let gameWpm = null;
    for (let attempt = 0; attempt < 8 && gameWpm === null; attempt++) {
      if (attempt) await sleep(250);
      gameWpm = await cdp.evaluate(GAME_WPM_READ).catch(() => null);
    }
    gameWpms.push({ race, value: Number.isFinite(gameWpm) ? gameWpm : null });
    if (Number.isFinite(gameWpm)) console.log(`  game ${gameWpm} WPM`);

    // El nitro no siempre se gasta (depende de la leccion), pero si se gasto
    // esta linea lo dice con la palabra saltada. Se imprime, no se exige.
    const nitroLines = cdp.consoleLines.slice(logStart).filter((line) => /Nitro: skipped/.test(line));
    for (const line of nitroLines) console.log(`  ${line}`);
    if (delta !== null) deltas.push({ race, value: delta });

    if (sampleLines.length !== 1) {
      bail(`Race ${race}/${RACES}: se esperaba exactamente 1 muestra y llegaron ${sampleLines.length}.`);
    }
    if (after.length !== expected) {
      bail(`Race ${race}/${RACES}: se esperaban ${expected} muestras guardadas (tope ${SAMPLE_CAP}) y hay ${after.length}.`);
    }

    // Con el buffer lleno el conteo no puede crecer: la prueba de que la
    // muestra entro es que la ultima del array sea el delta de esta carrera.
    // Si el array guarda objetos (como el CDP falso), se omite esta parte.
    const lastValue = after.length && typeof after[after.length - 1] === 'number'
      ? after[after.length - 1]
      : null;
    if (full && Number.isFinite(delta) && lastValue !== null && Math.abs(lastValue - delta) > 0.05) {
      bail(`Race ${race}/${RACES}: el buffer está lleno y su última muestra (${lastValue}) no es la de esta carrera (${delta}).`);
    }

    if (race < RACES) {
      const clicked = await waitForRaceButton(true, 30000);
      if (!clicked.ok) {
        bail(`Race ${race}/${RACES}: no encontré el botón para la siguiente (${clicked.buttons.join(' | ') || 'ninguno'}).`);
      }
      console.log(`  next: ${clicked.text}`);
    }
  }

  // Lo que el panel dice de la tanda, leído del marco donde vive. Es un extra:
  // si el userscript no está activo se avisa y se sigue, porque la comprobación
  // que importa es la de las muestras.
  const panel = await cdp.evaluate(PANEL_READ).catch(() => null);
  const season = seasonFromPanel(panel);

  if (panel) {
    console.log(`\nPanel ${panel.version || '(sin versión)'}`);
    console.log(`  races ${panel.races || '—'} · session ${panel.session || '—'} · today ${panel.dayXp || '—'}`);
    if (panel.result) console.log(`  last result ${panel.result}`);
    if (panel.delta) console.log(`  model delta ${panel.delta}`);
    if (season) {
      console.log(`  season ${season.tag || season.tier} · ${season.xp || '—'}`
        + `${season.pace ? ` · ${season.pace}` : ''}`
        + `${season.name ? ` · ${season.name}` : ''}`);
    }
  } else {
    console.log('\nPanel: no está en el marco de la carrera (¿userscript activo?).');
  }

  // WPM oficial frente al modelo. Se prefiere `serverWpm` (el reloj del propio
  // paquete de meta, exacto); despues la pantalla de resultados y, por ultimo,
  // `gameWpm` (la ultima lectura del HUD, redondeada a entero). Es la
  // comprobacion de que el reloj calibrado no se queda corto ni largo.
  const recentRaw = await cdp.evaluate(`(() => {
    try {
      const h = JSON.parse(localStorage.getItem('autoTyperRaceHistory') || '[]');
      return JSON.stringify(h.slice(-${RACES}));
    } catch { return '[]'; }
  })()`).catch(() => '[]');
  const recent = parseSamples(recentRaw);

  const wpmRows = recent.map((race, index) => {
    if (!race || !Number.isFinite(race.wpm)) return null;

    const served = Number(race.serverWpm);
    const results = gameWpms[index] && Number.isFinite(gameWpms[index].value) ? gameWpms[index].value : null;
    const hud = Number(race.gameWpm);
    // La fila ya guarda el oficial como `wpm`; el modelo va en `modelWpm`.
    // Se compara contra ese para no acabar comparando el oficial consigo mismo.
    const storedModel = Number(race.modelWpm);
    const model = Number.isFinite(storedModel) && storedModel > 0 ? storedModel : race.wpm;

    if (Number.isFinite(served) && served > 0) {
      return { race: index + 1, source: 'server', official: served, model };
    }
    if (results !== null) {
      return { race: index + 1, source: 'results', official: results, model };
    }
    if (Number.isFinite(hud) && hud > 0) {
      return { race: index + 1, source: 'hud', official: hud, model };
    }
    return null;
  }).filter(Boolean);

  if (wpmRows.length) {
    console.log('\nWPM oficial vs modelo');
    for (const row of wpmRows) {
      const diff = row.model - row.official;
      console.log(`  race ${row.race}: ${row.source} ${row.official} WPM · model ${row.model} WPM`
        + ` (${diff >= 0 ? '+' : ''}${diff.toFixed(1)})`);
    }
  }

  const values = deltas.map((item) => item.value);
  const stats = values.length ? summarize(values) : null;
  const outside = deltas.filter((item) => Math.abs(item.value) > TOLERANCE);

  if (stats) {
    console.log(`\nmodel Δ: ${values.map((value) => signed(value)).join(', ')}`);
    console.log(`  mean ${signed(stats.mean, 2)} pts · sd ${stats.sd.toFixed(2)} · `
      + `range ${signed(stats.min)} .. ${signed(stats.max)} · n=${stats.n}`);

    // La banda que importa: una muestra suelta fuera de ±2 pts ya dice que el
    // modelo se esta separando del juego, aunque la media salga centrada.
    if (outside.length) {
      console.log(`  AVISO: ${outside.length}/${stats.n} muestras fuera de ±${TOLERANCE} pts`
        + ` (${outside.map((item) => `race ${item.race}: ${signed(item.value)}`).join(', ')})`);
    } else {
      console.log(`  todas dentro de ±${TOLERANCE} pts`);
    }

    if (stats.n < RACES) {
      console.log(`  aviso: solo pude leer el delta en ${stats.n}/${RACES} líneas.`);
    }
  } else {
    console.log('\nmodel Δ: no pude leer el delta de las líneas (¿formato distinto?).');
  }

  // Una fila por pasada, con los deltas ya formateados: la hoja de calculo ve
  // numeros y comparar sesiones no depende de leer la consola de ayer.
  const saved = appendHistory({
    at: new Date().toISOString(),
    races: RACES,
    samples: values.length,
    stats,
    outside: outside.length,
    tolerance: TOLERANCE,
    user: who.username,
    version: panel ? panel.version : '',
    deltas: values,
  });
  console.log(saved
    ? `\nSaved: ${path.relative(process.cwd(), saved) || saved}`
    : '\nSaved: no (no pude escribir el CSV)');

  console.log(RACES === 1
    ? '\nPASS: una sola muestra para una sola carrera.'
    : `\nPASS: ${RACES} carreras, una sola muestra por carrera.`);

  // El informe del historico, con la pasada que se acaba de guardar: la deriva
  // se ve sin abrir el panel ni ejecutar otro comando. Es un extra: si la
  // lectura falla, la pasada ya medida no se toca.
  if (saved) {
    try {
      const reportFile = process.env.LIVE_JSON
        || path.join(path.dirname(saved), 'live-history.json');
      const history = formatHistory(fs.readFileSync(saved, 'utf8'), {
        file: path.relative(process.cwd(), saved) || saved,
        limit: 5,
        season,
        // El WPM oficial de estas carreras viaja al informe y a su JSON; el
        // CSV no lo guarda porque es una lectura de esta pasada, no una columna
        // historica mas.
        wpm: wpmRows,
      });

      if (history.error) {
        console.log(`\nHistórico: ${history.error}`);
      } else {
        console.log('');
        for (const line of history.lines) console.log(line);

        // El mismo informe, legible por otros scripts, se reescribe junto al
        // CSV. No es un historico paralelo: es la foto de la ultima pasada.
        try {
          fs.writeFileSync(reportFile, `${JSON.stringify(history.data, null, 2)}\n`);
          console.log(`Report: ${path.relative(process.cwd(), reportFile) || reportFile}`);
        } catch (error) {
          console.log(`Report: no pude escribirlo (${error.message})`);
        }
      }
    } catch {
      console.log('\nHistórico: no pude leerlo para el informe.');
    }
  }

  cdp.close();
})().catch((error) => {
  console.error('\nlive error:', error.message || error);
  process.exitCode = 2;
});
