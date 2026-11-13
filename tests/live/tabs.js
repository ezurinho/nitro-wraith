'use strict';

/*
 * Lista las pestañas de Nitro Type del Chrome de depuracion y dice cual tiene
 * sesion. No lanza ni navega nada: lee /json/list y `persist:nt` de cada
 * pestaña, igual que hace `npm run live`.
 *
 *   npm run live:tabs
 *   CDP_PORT=9333 npm run live:tabs
 */

const http = require('http');

const PORT = Number(process.env.CDP_PORT || 9222);
const TIMEOUT_MS = 5000;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
      });
    });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

const SESSION_EXPRESSION = `(() => {
  try {
    const raw = localStorage.getItem('persist:nt');
    if (!raw) return { ok: false, guest: false, username: '', reason: 'no hay persist:nt' };
    const store = JSON.parse(raw);
    const user = typeof store.user === 'string' ? JSON.parse(store.user) : store.user;
    const name = user && (user.username || user.userID);
    const guest = Boolean(user && (user.loggedIn === false || /^g0\\./i.test(String(name || ''))));
    return {
      ok: Boolean(name && !guest),
      guest,
      username: name || '',
      reason: guest ? 'invitado' : 'sin usuario con sesión',
    };
  } catch (error) {
    return { ok: false, guest: false, username: '', reason: String(error) };
  }
})()`;

function readSession(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let settled = false;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* ya cerrado */ }
      fn(value);
    };
    const timer = setTimeout(() => done(reject, new Error('sin respuesta del CDP')), TIMEOUT_MS);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: SESSION_EXPRESSION, returnByValue: true },
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      if (message.error) return done(reject, new Error(JSON.stringify(message.error)));
      const result = message.result || {};
      if (result.exceptionDetails) {
        return done(reject, new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text));
      }
      done(resolve, result.result ? result.result.value : null);
    };

    ws.onclose = () => {
      if (settled) return;
      clearTimeout(timer);
      done(reject, new Error('el CDP cerró sin responder'));
    };
    ws.onerror = () => {
      clearTimeout(timer);
      done(reject, new Error('CDP websocket failed'));
    };
  });
}

function stateOf(who) {
  if (!who) return 'none';
  if (who.guest) return 'guest';
  return who.ok ? 'session' : 'none';
}

function labelOf(who) {
  if (!who) return '[none] sin datos';
  if (who.guest) return `[guest] ${who.username || 'invitado'}`;
  if (who.ok) return `[session] ${who.username}`;
  return `[none] ${who.reason || 'sin sesión'}`;
}

async function main() {
  if (typeof WebSocket !== 'function') {
    console.error(`live:tabs: hace falta Node 22+ (WebSocket global). Actual: ${process.version}`);
    return 1;
  }

  let targets;
  try {
    targets = await getJson(`http://127.0.0.1:${PORT}/json/list`);
  } catch {
    console.error(`live:tabs: Chrome no escucha en el puerto ${PORT}. Abre el Chrome dedicado con npm run live:chrome.`);
    return 1;
  }

  const pages = targets.filter((target) => target.type === 'page' && /nitrotype\.com/.test(target.url));
  if (!pages.length) {
    console.error(`live:tabs: no hay pestañas de nitrotype.com en el puerto ${PORT}.`);
    console.error('Abre https://www.nitrotype.com/garage en ese Chrome.');
    return 1;
  }

  console.log(`Nitro Type · ${pages.length} pestaña(s) en el puerto ${PORT}`);
  console.log('');

  const counts = { session: 0, guest: 0, none: 0, error: 0 };
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    let who = null;
    let error = '';
    try {
      who = await readSession(page.webSocketDebuggerUrl);
    } catch (failure) {
      error = failure.message;
    }

    const state = error ? 'error' : stateOf(who);
    counts[state] += 1;
    const mark = state === 'session' ? '*' : ' ';
    console.log(` ${mark}${i + 1}. ${error ? `[error] ${error}` : labelOf(who)}`);
    console.log(`    ${page.title || '(sin título)'}`);
    console.log(`    ${page.url}`);
    if (state === 'session') console.log('    lista para npm run live');
    console.log('');
  }

  console.log(`Resumen: ${counts.session} con sesión · ${counts.guest} invitado(s) · ${counts.none} sin sesión · ${counts.error} sin respuesta.`);
  return 0;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`live:tabs: ${error.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = { SESSION_EXPRESSION, labelOf, stateOf };
