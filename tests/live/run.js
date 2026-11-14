'use strict';

/*
 * Banco de pruebas en vivo del userscript.
 *
 * Levanta un servidor local, arranca un Chrome headless con un perfil temporal
 * limpio, carga el userscript dentro de un iframe `/race/` (que es el unico
 * marco donde vive el panel) y comprueba lo que no se puede ver con un `node
 * --check`: el CSV, la vuelta desde bfcache, los tres topes y el aviso de
 * calibracion a mitad de sesion.
 *
 * Sin dependencias: Chrome y el WebSocket nativo de Node 22+.
 *
 *   npm test
 *   CHROME_PATH=/ruta/a/chrome npm test
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { PANEL_READ } = require('./panel-read');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(__dirname, 'fixtures');
const SCRIPT = path.join(ROOT, 'nitro-wraith.user.js');
const SHOT_DIR = process.env.SHOT_DIR ? path.resolve(ROOT, process.env.SHOT_DIR) : '';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function bail(message) {
  console.error(`\nharness: ${message}\n`);
  process.exit(2);
}

if (typeof WebSocket !== 'function') {
  bail(`Node 22+ is required (global WebSocket missing). Current: ${process.version}`);
}
if (!fs.existsSync(SCRIPT)) bail(`userscript not found: ${SCRIPT}`);

function findChrome() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);

  if (process.platform === 'win32') {
    candidates.push(
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    );
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  }

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

const chromePath = findChrome();
if (!chromePath) bail('Chrome not found. Point CHROME_PATH at the binary.');

// El userscript se sirve desde la raiz del proyecto, no desde una copia: lo que
// se prueba es exactamente el archivo que se instala.
function serve() {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    const pathname = requestUrl.pathname;
    let file = null;

    if (pathname === '/nitro-wraith.user.js') file = SCRIPT;
    else if (pathname === '/' || pathname === '/index.html') file = path.join(FIXTURES, 'index.html');
    else if (pathname === '/race' || pathname === '/race/') file = path.join(FIXTURES, 'race', 'index.html');
    // El panel pequeno solo existe en la ruta del garaje: el banco necesita
    // una pagina real con esa ruta para probar que hereda el tema.
    else if (pathname === '/garage' || pathname === '/garage/') file = path.join(FIXTURES, 'index.html');
    // La cola vive en la ventana de arriba: el login se prueba en una pestaña
    // propia con esta ruta, no dentro del iframe de la carrera.
    else if (pathname === '/login' || pathname === '/login/') file = path.join(FIXTURES, 'login', 'index.html');
    // Amigos/Equipo usan el panel de solo lectura. Los dos endpoints se
    // responden aqui para probar los contadores sin una cuenta real.
    else if (pathname === '/friends' || pathname === '/friends/') file = path.join(FIXTURES, 'social', 'index.html');
    else if (pathname === '/team' || pathname === '/team/') file = path.join(FIXTURES, 'social', 'index.html');
    else if (pathname === '/api/v2/friends') {
      const online = requestUrl.searchParams.get('online') === '1';
      const values = online ? [{}] : [{}, {}];
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'success', results: { fields: [], values, friendsHash: 'fixture' } }));
      return;
    } else if (pathname === '/api/v2/friend-requests') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'success', results: { requests: [{}], totalRecords: 1 } }));
      return;
    }

    if (!file) {
      res.writeHead(404).end('not found');
      return;
    }

    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(500).end('read error');
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file)] || 'text/plain',
        'cache-control': 'no-store',
      });
      res.end(data);
    });
  });

  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
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

async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await check()) return true;
    } catch { /* todavia no */ }
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${label}`);
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

// Abre una pestaña nueva en el mismo Chrome/perfil y devuelve su CDP. Se usa
// para comprobar el limite real del guardia: dos pestañas no comparten window.
async function openTab(port, url) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  });
  if (!response.ok) throw new Error(`new tab HTTP ${response.status}`);
  const target = await response.json();
  if (!target.webSocketDebuggerUrl) throw new Error('new tab without a debugger URL');

  const tab = await connect(target.webSocketDebuggerUrl);
  await tab.send('Page.enable');
  await tab.send('Runtime.enable');
  return tab;
}

// Despacha un clic nativo por CDP: no es un element.click(), asi que el evento
// llega con isTrusted=true y pasa por el mismo camino que un dedo o el raton.
async function clickSelector(tab, selector) {
  const point = await tab.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) throw new Error(`real click target not visible: ${selector}`);

  await tab.send('Page.bringToFront');
  await tab.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: point.x, y: point.y, button: 'none', buttons: 0,
  });
  await tab.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1,
  });
  await tab.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1,
  });
}

async function captureShot(cdp, file, clip) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { ...clip, scale: 1 },
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
  console.log(`screenshot: ${path.relative(ROOT, file)}`);
}

// Genera la galeria que usa el README. Solo corre cuando el workflow manual
// pasa SHOT_DIR; el check normal no escribe archivos ni cambia su resultado.
async function capturePanelThemes(cdp, appUrl) {
  if (!SHOT_DIR) return;

  // La captura documenta la funcion nueva: una cuenta de 110 WPM con top 230.
  // Se deja la calibracion y el perfil en el almacenamiento antes de navegar
  // para que el panel arranque como en una instalacion real, sin esperar al API.
  await cdp.evaluate(`(() => {
    localStorage.setItem('autoTyperCalibratedRange', JSON.stringify({ min: 103, max: 117 }));
    localStorage.setItem('persist:nt', JSON.stringify({
      user: JSON.stringify({
        avgSpeed: 110, avgAcc: 98.7, highestSpeed: 230, racesPlayed: 48756,
      }),
    }));
    return true;
  })()`);

  await cdp.send('Page.navigate', { url: appUrl });
  await waitFor(async () => {
    try {
      return await cdp.evaluate(`(() => {
        const frame = document.querySelector('iframe');
        return Boolean(frame && frame.contentWindow.__ntaDebug
          && frame.contentWindow.document.getElementById('nt-autotyper-panel'));
      })()`);
    } catch {
      return false;
    }
  }, 15000, 'the panel for screenshots');
  // Deja que boot termine de cargar contadores antes de sembrar la demo; si no,
  // el panel se queda con los ceros de la carga y la captura no sirve. El
  // runAuto de boot se para primero para que no abra una tanda nueva encima de
  // los contadores sembrados.
  await sleep(900);
  await cdp.evaluate(`(() => {
    const frame = document.querySelector('iframe');
    const d = frame && frame.contentWindow && frame.contentWindow.__ntaDebug;
    if (d && d.stop) d.stop();
    return true;
  })()`);
  await sleep(300);

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
    w.localStorage.setItem('autoTyperSeason', JSON.stringify({
      v: 2, at: now, auto: true, source: 'user', seasonID: 73,
      seasonName: 'Spirit Racers', tier: 6, nextTier: 7,
      progress: 34, xp: 76701, currentXp: 70000, nextXp: 90000,
      endsAt: now + 27 * 86400000, endsText: 'Nov 29',
    }));
    const today = new Date();
    const todayKey = today.getFullYear() + '-'
      + String(today.getMonth() + 1).padStart(2, '0') + '-'
      + String(today.getDate()).padStart(2, '0');
    w.localStorage.setItem('ntQueue:todayPart:shot', JSON.stringify({
      date: todayKey, races: 128, sumWpm: 14080, sumTarget: 14080,
      boxes: 2, dq: 0, xp: 1240, clean: 120, firstAt: now - 7200000,
      lastAt: now, dqAt: 0, updatedAt: now,
    }));
    d.patchSession({
      races: 128, raceLimit: 310, xp: 1240,
      sumRaces: 128, sumWpm: 13696, sumTarget: 13696, sumAcc: 12633.6,
      chars: 550, correct: 543, errors: 7,
      startedAt: now - 60000, endedAt: 0, clockDone: true, typing: true,
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

      const clip = await cdp.evaluate(`(() => {
        const frame = document.querySelector('iframe');
        if (!frame) return null;
        const root = frame.contentWindow.document
          .getElementById('nt-autotyper-panel').shadowRoot;
        const panel = root.querySelector('.panel');
        if (!panel) return null;
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
  } finally {
    try { await cdp.send('Emulation.clearDeviceMetricsOverride'); } catch { /* ya cerro */ }
  }
}

async function waitForLoginHooks(tab) {
  await waitFor(async () => {
    try {
      return await tab.evaluate('Boolean(window.__ntaDebug && window.__ntaDebug.loginTick && window.__ntaDebug.loginScheduled && window.__ntaDebug.loginCancel && window.__ntaDebug.loginReloadPending && window.__ntaDebug.loginRetryPending)');
    } catch {
      return false;
    }
  }, 15000, 'the login hooks for real input');
}

// Prepara una pantalla /login con un SSO falso y el hash de timeout. Devuelve
// cuando el aviso ya esta en el DOM, sin pulsar nada: el clic lo hace CDP.
async function armRefreshBadge(tab, probe) {
  const armed = await tab.evaluate(`(() => {
    const d = window.__ntaDebug;
    if (!d || !d.loginTick || !d.loginScheduled || !d.loginCancel || !d.loginReloadPending) return { ready: false };

    d.loginCancel();
    sessionStorage.removeItem('ntQueue:reloginPending');
    sessionStorage.removeItem('ntQueue:reloginAttempts');
    sessionStorage.removeItem('ntQueue:loginReloads');
    sessionStorage.removeItem('nta:trusted-click');
    sessionStorage.setItem('nta:refresh-probe', ${JSON.stringify(probe)});
    window.__ntaRefreshAlive = 'alive';
    localStorage.setItem('ntQueue:lastLogin', JSON.stringify({ method: 'google', at: Date.now() }));

    const old = document.getElementById('e2e-login-box');
    if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'e2e-login-box';
    box.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:240px;background:#111;z-index:99999';
    box.innerHTML = '<button class="btn--google">Log In with Google</button>';
    document.body.appendChild(box);

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || !target.closest) return;
      if (target.closest('[data-nta-login-refresh]')) {
        sessionStorage.setItem('nta:trusted-click', String(event.isTrusted));
      }
    }, true);

    history.replaceState(null, '', location.pathname + location.search + '#timeout-1800-1794025546-1794023746');
    d.loginTick();
    const badge = document.querySelector('[data-nta-login-refresh]');
    return { ready: true, badge: Boolean(badge), text: badge ? badge.textContent : '' };
  })()`);
  if (!armed.ready || !armed.badge) throw new Error('the refresh badge did not arm');
  await waitFor(async () => {
    try {
      return await tab.evaluate("Boolean(document.querySelector('[data-nta-login-refresh] [data-nta-login-refresh-cancel]'))");
    } catch {
      return false;
    }
  }, 5000, 'the refresh badge buttons');
  return armed;
}

function killTree(child) {
  if (!child || child.killed) return;
  try { child.kill(); } catch { /* ya estaba muerto */ }
  if (process.platform === 'win32' && child.pid) {
    try {
      spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
    } catch { /* sin taskkill: queda el kill de arriba */ }
  }
}

const READ = `(() => {
  const w = document.querySelector('iframe').contentWindow;
  const d = w.__ntaDebug;
  if (d && d.hydrateAllViews) d.hydrateAllViews();
  const host = w.document.getElementById('nt-autotyper-panel');
  if (!host) return { panel: false };
  const s = host.shadowRoot;
  const q = (sel) => s.querySelector(sel);
  const txt = (sel) => q(sel) && q(sel).textContent;
  return {
    panel: true,
    theme: q('.panel') ? q('.panel').dataset.theme : null,
    themeName: txt('[data-field="themeName"]'),
    ver: txt('[data-field="ver"]'),
    foot: txt('[data-field="footState"]'),
    liveTag: txt('[data-field="liveTag"]'),
    timeLimit: txt('[data-field="timeLimit"]'),
    xpLimit: txt('[data-field="xpLimit"]'),
    ch: txt('[data-field="ch"]'),
    cal: txt('[data-field="cal"]'),
    calAcc: txt('[data-field="calAcc"]'),
    calAccount: txt('[data-field="calAccount"]'),
    paceSource: txt('[data-field="paceSource"]'),
    chCount: txt('[data-field="chCount"]'),
    chRows: q('[data-field="chList"]') ? q('[data-field="chList"]').children.length : -1,
    raceLimit: txt('[data-field="limit"]'),
    calLogWhen: txt('[data-field="calLogWhen"]'),
    dayXp: txt('[data-field="dayXp"]'),
    today: txt('[data-field="today"]'),
    calLogWpm: txt('[data-field="calLogWpm"]'),
    timeLeftShown: q('[data-field="timeLeftRow"]') && q('[data-field="timeLeftRow"]').style.display,
    timeLeft: txt('[data-field="timeLeft"]'),
    weekRows: q('[data-field="weekList"]') ? q('[data-field="weekList"]').children.length : -1,
    weekTotal: txt('[data-field="weekTotal"]'),
    weekText: q('[data-field="weekList"]') ? q('[data-field="weekList"]').textContent : '',
    note: txt('[data-field="cfgNote"]'),
    seasonTag: txt('[data-field="seasonTag"]'),
    seasonName: txt('[data-field="seasonName"]'),
    seasonTier: txt('[data-field="seasonTier"]'),
    seasonXp: txt('[data-field="seasonXp"]'),
    seasonNext: txt('[data-field="seasonNext"]'),
    seasonRaces: txt('[data-field="seasonRaces"]'),
    seasonPace: txt('[data-field="seasonPace"]'),
    seasonEnds: txt('[data-field="seasonEnds"]'),
    seasonAlert: txt('[data-field="seasonAlert"]'),
    seasonNote: txt('[data-field="seasonNote"]'),
    seasonFill: q('[data-field="seasonFill"]') ? q('[data-field="seasonFill"]').style.width : null,
  };
})()`;

async function runChecks(cdp, devtoolsPort, appUrl) {
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok });
    const suffix = detail === undefined ? '' : `  ${JSON.stringify(detail)}`;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${suffix}`);
  };

  const panelReadyRaw = async () => (await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const host = w.document.getElementById('nt-autotyper-panel');
    return Boolean(host && host.shadowRoot && host.shadowRoot.querySelector('.panel'));
  })()`)) === true;
  const panelReady = async () => (await cdp.evaluate(READ)).panel === true;
  await waitFor(panelReadyRaw, 15000, 'the panel');

  const startup = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const host = w.document.getElementById('nt-autotyper-panel');
    const root = host && host.shadowRoot;
    const d = w.__ntaDebug;
    return root && d && d.startup ? d.startup() : { nodes: 0, views: 0, storageReads: 0 };
  })()`);
  check('panel startup mounts only the live view',
    startup.nodes > 0 && startup.nodes < 400 && startup.views === 1
      && startup.storageReads < 50, startup);

  const hydrated = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    return w.__ntaDebug && w.__ntaDebug.hydrateAllViews ? w.__ntaDebug.hydrateAllViews() : null;
  })()`);
  check('opening the other views mounts the remaining templates',
    hydrated && hydrated.views === 4 && hydrated.nodes > startup.nodes, hydrated);

  const state = await cdp.evaluate(READ);
  check('panel mounted inside the race frame', state.panel === true, state);
  // La version se lee del propio userscript: subirla no obliga a tocar el test.
  const scriptVersion = (fs.readFileSync(SCRIPT, 'utf8').match(/@version\s+(\S+)/) || [])[1];
  check('panel version matches the userscript header',
    Boolean(scriptVersion) && state.ver === `v${scriptVersion}`, { panel: state.ver, header: scriptVersion });

  // La version no puede vivir en cuatro sitios y separarse: el README ya se
  // quedo atras una vez mientras el script seguia avanzando.
  const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const readmeVersion = (fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
    .match(/badge\/version-([\d.]+)-/) || [])[1];
  const constVersion = (fs.readFileSync(SCRIPT, 'utf8').match(/const VERSION = '([\d.]+)'/) || [])[1];
  check('versions match across package, script and README',
    Boolean(pkgVersion) && pkgVersion === scriptVersion
      && constVersion === scriptVersion && readmeVersion === scriptVersion,
    { package: pkgVersion, header: scriptVersion, constant: constVersion, readme: readmeVersion });

  // Auto-update barato: el @updateURL apunta al meta pequeno del Gist y el
  // @downloadURL al script completo. Sin SHA en la URL, para que no se congele.
  const scriptText = fs.readFileSync(SCRIPT, 'utf8');
  const socialStart = scriptText.indexOf('function socialPanelRoute()');
  const socialEnd = scriptText.indexOf('function syncGaragePanel()');
  const socialBlock = socialStart >= 0 && socialEnd > socialStart
    ? scriptText.slice(socialStart, socialEnd)
    : '';
  check('the social panel only reads: no POST, accept, deny, invite or apply path',
    socialBlock.length > 0
      && !/method:\s*'POST'/.test(socialBlock)
      && !/\/api\/v2\/(friend-requests\/(accept|deny)|teams\/.*(invite|apply))/.test(socialBlock),
    { bytes: socialBlock.length });
  const header = (scriptText.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/) || [])[0] || '';
  const updateURL = (scriptText.match(/@updateURL\s+(\S+)/) || [])[1] || '';
  const downloadURL = (scriptText.match(/@downloadURL\s+(\S+)/) || [])[1] || '';
  const metaPath = path.join(ROOT, 'nitro-wraith.meta.js');
  const metaText = fs.existsSync(metaPath) ? fs.readFileSync(metaPath, 'utf8') : '';
  const metaVersion = (metaText.match(/@version\s+(\S+)/) || [])[1];
  const metaUpdate = (metaText.match(/@updateURL\s+(\S+)/) || [])[1];
  const metaDownload = (metaText.match(/@downloadURL\s+(\S+)/) || [])[1];
  const stableGist = (url) => /^https:\/\/gist\.githubusercontent\.com\/[^/]+\/[0-9a-f]+\/raw\/[^/]+$/.test(url);
  check('auto-update uses a small stable meta next to the full script',
    Boolean(updateURL) && updateURL.endsWith('/nitro-wraith.meta.js')
      && Boolean(downloadURL) && downloadURL.endsWith('/nitro-wraith.user.js')
      && stableGist(updateURL) && stableGist(downloadURL)
      && updateURL.replace(/\.meta\.js$/, '.user.js') === downloadURL
      && metaText.length > 0 && metaText.length <= 2000,
    { updateURL, downloadURL, metaBytes: metaText.length });
  check('meta header matches the userscript and keeps the same version',
    Boolean(metaText) && metaText.trim() === header.trim()
      && metaVersion === scriptVersion && metaUpdate === updateURL && metaDownload === downloadURL,
    { metaBytes: metaText.length, metaVersion, scriptVersion });
  const updateDownload = (scriptText.match(/const UPDATE_DOWNLOAD_URL = '([^']+)'/) || [])[1] || '';
  check('the update badge downloads the raw userscript, not the Gist page',
    updateDownload === downloadURL
      && updateDownload.endsWith('/raw/nitro-wraith.user.js'),
    { updateDownload, downloadURL });

  // Un 404 ya no se guarda como «sin novedades»: deja estado y error visibles,
  // y una respuesta buena posterior los limpia. El fetch se sustituye solo
  // dentro del marco para no tocar la red ni el Gist. El timeout de 8 s se
  // adelanta a 0 para probar el AbortController sin esperar.
  const updateHealth = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    if (!d.checkForUpdate || !d.updateBusy) return { has: false };
    for (let i = 0; i < 100 && d.updateBusy(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (d.updateBusy()) return { has: true, busy: true };

    const key = 'nta:update';
    const row = w.document.getElementById('nt-autotyper-panel').shadowRoot
      .querySelector('[data-field="up"]');
    const saved = w.localStorage.getItem(key);
    const oldFetch = w.fetch;
    const oldSetTimeout = w.setTimeout;
    w.localStorage.removeItem(key);
    try {
      w.fetch = async () => ({ ok: false, status: 404, text: async () => '' });
      const rejected = await d.checkForUpdate(true);
      const failed = d.updateState();
      const failedRow = row ? row.textContent.trim() : '';
      const failedTitle = row ? row.title : '';
      const failedDiagnostic = d.diagnostic().update;

      w.fetch = async () => ({ ok: true, status: 200, text: async () => '// @version ${scriptVersion}' });
      const accepted = await d.checkForUpdate(true);
      const recovered = d.updateState();
      const recoveredRow = row ? row.textContent.trim() : '';
      const recoveredTitle = row ? row.title : '';

      // El fetch no responde nunca. El timeout real de 8 s se adelanta a 0
      // solo dentro de este marco; el AbortController sigue siendo el del
      // script, asi que se prueba el mismo camino que una red colgada.
      w.fetch = (url, options) => new Promise((resolve, reject) => {
        const signal = options && options.signal;
        if (!signal) return;
        signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
      w.setTimeout = (fn, ms, ...args) => oldSetTimeout.call(w, fn, ms === 8000 ? 0 : ms, ...args);
      const timedOut = await d.checkForUpdate(true);
      w.setTimeout = oldSetTimeout;
      const timeoutState = d.updateState();
      const timeoutRow = row ? row.textContent.trim() : '';
      const timeoutTitle = row ? row.title : '';

      w.fetch = async () => ({ ok: true, status: 200, text: async () => '// @version ${scriptVersion}' });
      const final = await d.checkForUpdate(true);
      const finalState = d.updateState();
      return {
        has: true, rejected, failed, failedRow, failedTitle, failedDiagnostic,
        accepted, recovered, recoveredRow, recoveredTitle,
        timedOut, timeoutState, timeoutRow, timeoutTitle, final, finalState,
      };
    } finally {
      if (saved === null) w.localStorage.removeItem(key); else w.localStorage.setItem(key, saved);
      w.fetch = oldFetch;
      w.setTimeout = oldSetTimeout;
      d.patchSession({});
    }
  })()`, true);
  check('a failed update check is stored, visible and clears after recovery',
    updateHealth.has === true && !updateHealth.busy
      && updateHealth.rejected === false
      && updateHealth.failed && updateHealth.failed.status === 404
      && updateHealth.failed.error === 'HTTP 404'
      && /failed · HTTP 404/.test(updateHealth.failedRow)
      && /no good result yet/i.test(updateHealth.failedTitle)
      && updateHealth.failedDiagnostic
      && updateHealth.failedDiagnostic.status === 404
      && updateHealth.accepted === true
      && updateHealth.recovered && updateHealth.recovered.status === 200
      && updateHealth.recovered.error === null
      && updateHealth.recovered.latest === scriptVersion
      && /^ok · /.test(updateHealth.recoveredRow)
      && /current/i.test(updateHealth.recoveredTitle),
    updateHealth);
  check('a hung update check is cut by the 8 s timeout and recovers',
    updateHealth.timedOut === false
      && updateHealth.timeoutState && updateHealth.timeoutState.status === 0
      && updateHealth.timeoutState.error === 'timeout'
      && /failed · timeout/.test(updateHealth.timeoutRow)
      && updateHealth.final === true
      && updateHealth.finalState && updateHealth.finalState.error === null
      && updateHealth.finalState.latest === scriptVersion,
    updateHealth);
  check('results-page failure falls back to the garage before stopping',
    scriptText.includes("notifyTopNeedGarage('the results page would not open another race')")
      && scriptText.includes("panic('the results page will not open another race', 2 * 60000)")
      && scriptText.includes('__ntaNeedGarage: true, reason:')
      && scriptText.includes('Number(saved.holdMs) > 2 * 60000'));

  // Tema: se aplica en el DOM real, marca la muestra y queda guardado para la
  // proxima carga. Se vuelve a carbon para no dejar el resto del banco teñido.
  const themePick = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const buttons = s.querySelectorAll('[data-theme-btn]');
    s.querySelector('[data-theme-btn="violet"]').click();
    const out = {
      count: buttons.length,
      theme: s.querySelector('.panel').dataset.theme,
      name: s.querySelector('[data-field="themeName"]').textContent,
      stored: w.localStorage.getItem('autoTyperPanelTheme'),
    };
    s.querySelector('[data-theme-btn="carbon"]').click();
    return out;
  })()`);
  check('theme picker applies a palette and remembers it',
    themePick.count === 6 && themePick.theme === 'violet'
      && themePick.name === 'Violet' && themePick.stored === 'violet', themePick);

  // Que el CSS resuelva de verdad: seis acentos distintos y fondos propios, no
  // solo el atributo puesto. Si un bloque de paleta se rompe, aqui se ve.
  const themeVars = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const panel = s.querySelector('.panel');
    const read = (name) => {
      s.querySelector('[data-theme-btn="' + name + '"]').click();
      const cs = w.getComputedStyle(panel);
      return { name, acc: cs.getPropertyValue('--acc').trim(), bg: cs.getPropertyValue('--bg-hi').trim() };
    };
    const out = ['carbon', 'aurora', 'sunset', 'ice', 'violet', 'rgb'].map(read);
    s.querySelector('[data-theme-btn="carbon"]').click();
    return out;
  })()`);
  check('every theme resolves its own accent and background',
    new Set(themeVars.map((theme) => theme.acc)).size === 6
      && themeVars.every((theme) => theme.acc && theme.bg), themeVars);

  // Mini-HUD de la barra inferior: precision y hueco de reloj junto al WPM,
  // visibles tambien con el panel minimizado.
  const footStrip = await cdp.evaluate(`(() => {
    const s = document.querySelector('iframe').contentWindow.document
      .getElementById('nt-autotyper-panel').shadowRoot;
    return {
      acc: (s.querySelector('[data-field="footAcc"]') || {}).textContent || '',
      clock: (s.querySelector('[data-field="footClock"]') || {}).textContent || '',
      hint: (s.querySelector('[data-field="footHint"]') || {}).textContent || '',
    };
  })()`);
  check('the status bar carries accuracy and a race clock slot',
    Boolean(footStrip.acc) && Boolean(footStrip.clock) && /Alt\+S/.test(footStrip.hint), footStrip);

  // Alt+M recorre los tres estados del mini-HUD. El test normaliza primero a
  // completo (por si una prueba anterior dejo otro estado guardado), mide el
  // ciclo y termina en completo para no contaminar las siguientes pruebas.
  const footModes = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const panel = s.querySelector('.panel');
    const bar = s.querySelector('.foot-bar');
    const read = () => ({
      mode: panel.dataset.foot,
      bar: w.getComputedStyle(bar).display,
      cap: w.getComputedStyle(s.querySelector('[data-field="footCap"]')).display,
      state: w.getComputedStyle(s.querySelector('[data-field="footState"]')).display,
      stored: w.localStorage.getItem('autoTyperFootMode'),
    });
    const press = async () => {
      w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'm', code: 'KeyM', altKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      return read();
    };

    let guard = 0;
    while (read().mode !== 'full' && guard++ < 4) await press();
    const full = read();
    const compact = await press();
    const hidden = await press();
    const restored = await press();
    return {
      full,
      compact,
      hidden,
      restored,
      sequence: [full.mode, compact.mode, hidden.mode, restored.mode],
    };
  })()`, true);

  check('Alt+M cycles the footer HUD full -> compact -> hidden -> full',
    footModes.sequence.join('>') === 'full>compact>hidden>full'
      && footModes.compact.cap === 'none'
      && footModes.compact.state !== 'none'
      && footModes.hidden.bar === 'none'
      && footModes.restored.bar !== 'none'
      && footModes.restored.stored === 'full',
    footModes);

  // RGB: se muestrea el tono y el acento con 900 ms de diferencia. Si
  // `@property` no estuviera registrado, el tono saltaria de 0 a 360 en seco y
  // las dos lecturas caerian en rojo (0/360), que es el fallo que se veia.
  const rgbMotion = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    s.querySelector('[data-theme-btn="rgb"]').click();
    await new Promise((r) => setTimeout(r, 250));
    const panel = s.querySelector('.panel');
    const h1 = w.getComputedStyle(panel).getPropertyValue('--nt-hue').trim();
    const a1 = w.getComputedStyle(panel).getPropertyValue('--acc').trim();
    await new Promise((r) => setTimeout(r, 900));
    const h2 = w.getComputedStyle(panel).getPropertyValue('--nt-hue').trim();
    const a2 = w.getComputedStyle(panel).getPropertyValue('--acc').trim();
    const anims = panel.getAnimations().map((a) => ({
      name: a.animationName, state: a.playState, t: Math.round(a.currentTime || 0),
    }));
    const reduced = w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    s.querySelector('[data-theme-btn="carbon"]').click();
    return { h1, h2, a1, a2, anims, reduced, registered: Boolean(w.__ntaThemeProps) };
  })()`, true);
  check('RGB animates the hue and the accent instead of freezing on red',
    Number(rgbMotion.h2) > Number(rgbMotion.h1)
      && Number(rgbMotion.h1) > 0 && rgbMotion.a1 !== rgbMotion.a2, rgbMotion);
  check('challenge auto-close is on by default', state.ch === 'on', state.ch);
  check('pace auto-calibration is on by default', state.cal === 'on', state.cal);
  check('7-day card shows the two seeded days', state.weekRows === 2, { rows: state.weekRows, total: state.weekTotal });
  check('7-day card adds both days', state.weekTotal === '16 races · 2,400 XP', state.weekTotal);
  check("7-day card shows each day's XP",
    /1,500 XP/.test(state.weekText) && /900 XP/.test(state.weekText), state.weekText);
  check('time limit starts free on a clean profile', state.timeLimit === 'free', state.timeLimit);

  const csv = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    let captured = null;
    const realCreate = w.URL.createObjectURL;
    const realClick = w.HTMLAnchorElement.prototype.click;
    w.URL.createObjectURL = function (blob) { captured = blob; return 'blob:captured'; };
    w.HTMLAnchorElement.prototype.click = function () {};
    try {
      shadow.querySelector('[data-act="csv"]').click();
      if (!captured) return { error: 'no blob captured' };
      return {
        text: await captured.text(),
        note: shadow.querySelector('[data-field="cfgNote"]').textContent,
      };
    } finally {
      w.URL.createObjectURL = realCreate;
      w.HTMLAnchorElement.prototype.click = realClick;
    }
  })()`, true);

  const csvLines = String(csv.text || '').split('\r\n');
  check('CSV header', csvLines[0] === 'kind,at,races,wpm,target_wpm,deviation_pct,accuracy_pct,dq,boxes,xp,reason', csvLines[0]);
  check('CSV has two sessions and two days', csvLines.length === 5, { lines: csvLines.length });
  check('CSV escapes the quoted reason', String(csv.text || '').includes('"manual stop, ""user"" asked"'), csvLines[2]);
  check('CSV carries the 7-day summary', String(csv.text || '').includes('day,2026-10-31,6,111.00,110.00,0.91,,2,0,900,'), csvLines[4]);
  check('CSV carries the XP of a closed session',
    String(csv.text || '').includes(',1240,limit 10 races'), csvLines[1]);
  check('CSV note reports sessions and days', /Exported 2 closed sessions \+ 2 days/.test(csv.note || ''), csv.note);

  // El historico tambien cuenta retos: se siembra una parte de hace tres dias
  // con dos claves y se espera a que la tarjeta vuelva a leer localStorage.
  const challengeHistory = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const store = w.localStorage;
    const d = new Date(Date.now() - 3 * 86400000);
    const date = d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
    const key = 'ntQueue:dayHist:' + date + ':chtest';
    store.setItem(key, JSON.stringify({
      date, races: 0, sumWpm: 0, sumTarget: 0, boxes: 0, dq: 0,
      xp: 0, best: 0, bestAcc: 0, clean: 0, firstAt: 0, lastAt: 0, dqAt: 0,
      cash: 0, chKeys: ['11', '12'], updatedAt: Date.now(),
    }));
    // En espera el panel pinta cada 2 s y el historico tiene 1.5 s de cache:
    // hay que dejar pasar dos latidos completos para no competir con el borde.
    await new Promise((resolve) => setTimeout(resolve, 3600));
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const text = shadow.querySelector('[data-field="weekList"]').textContent;
    store.removeItem(key);
    await new Promise((resolve) => setTimeout(resolve, 3600));
    return { text };
  })()`, true);
  check('the 7-day card counts completed challenges per day',
    /2 challenges/.test(challengeHistory.text), challengeHistory);

  // XP del dia en STATS: se siembra una parte del dia de hoy y se espera a que
  // la fila la pinte. Va en las claves del dia, no en las del historico de 7
  // dias, asi que no puede mover las comprobaciones de la tarjeta semanal.
  await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = new Date();
    const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    w.localStorage.setItem('ntQueue:todayPart:harness', JSON.stringify({
      date, races: 3, sumWpm: 330, sumTarget: 330, boxes: 0, dq: 0, xp: 777,
      clean: 1, firstAt: Date.now() - 60000, lastAt: Date.now(), dqAt: 0, updatedAt: Date.now()
    }));
    return true;
  })()`);
  await waitFor(async () => (await cdp.evaluate(READ)).dayXp === '777 XP', 8000, "today's XP in STATS");
  const dayXpText = (await cdp.evaluate(READ)).dayXp;
  check('STATS shows the XP earned today', dayXpText === '777 XP', dayXpText);
  const todayText = (await cdp.evaluate(READ)).today;
  check('LOG Today summary carries the same XP', /777 XP/.test(todayText || ''), todayText);

  // La misma expresion que usa `npm run live`, contra el DOM real del banco:
  // si el marco o el panel se mueven, esto falla antes que una carrera de
  // verdad. Se compara la version y un valor que acaba de cambiar.
  const livePanel = await cdp.evaluate(PANEL_READ);
  check('live panel reader finds the panel in a real DOM',
    Boolean(livePanel)
      && livePanel.version === `v${scriptVersion}`
      && livePanel.dayXp === '777 XP',
    livePanel);

  // Rendimiento del latido: 20 ticks seguidos no pueden repetir el escaneo de
  // localStorage ni la lectura del HUD, y el tick medio debe caber de sobra en
  // un frame. Los contadores miden trabajo real (DOM/almacenamiento), no
  // llamadas, asi que un memo roto los hace subir.
  const perf = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    // El latido sigue vivo durante la prueba, asi que la cache puede llegar
    // caliente: lo que se exige es que 20 ticks no repitan el escaneo, no que
    // empiecen en frio.
    d.perfReset();
    const before = d.perf();
    for (let i = 0; i < 20; i++) d.paint();
    const afterPaint = d.perf();

    d.hudWpm(true);
    for (let i = 0; i < 20; i++) d.hudWpm(false);
    const afterHud = d.perf();

    const times = [];
    for (let i = 0; i < 40; i++) {
      const t0 = w.performance.now();
      d.paint();
      times.push(w.performance.now() - t0);
    }
    times.sort((a, b) => a - b);

    return {
      dayScans: afterPaint.dayScans - before.dayScans,
      hudReads: afterHud.hudReads - afterPaint.hudReads,
      paints: afterPaint.panelPaints - before.panelPaints,
      medianMs: times[Math.floor(times.length / 2)],
    };
  })()`, true);

  check('20 panel ticks scan the day history at most once', perf.dayScans <= 1, perf);
  check('20 HUD reads share one DOM read inside the tick', perf.hudReads === 1, perf);
  check('panel ticks still repaint a connected panel', perf.paints === 20, perf);
  check('a steady panel tick stays well inside a frame', perf.medianMs < 8, perf);

  // En espera el panel no necesita 1 Hz: baja a 2 s. Durante el tecleo vuelve
  // a 1 Hz para no perder ningun cambio visible de la carrera.
  const cadence = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const original = d.typing();
    d.patchSession({ typing: false });
    const waiting = d.paintEveryMs();
    d.patchSession({ typing: true });
    const racing = d.paintEveryMs();
    d.patchSession({ typing: original });
    return { waiting, racing, restored: d.typing() === original };
  })()`, true);
  check('the panel halves its paint cadence while waiting',
    cadence.waiting === 2000 && cadence.racing === 1000 && cadence.restored, cadence);

  // Perfil de rendimiento del panel: el mismo tick con datos nuevos cuesta
  // distinto plegado, desplegado y con la pestaña en segundo plano. El plegado
  // solo pinta las acciones; el fondo no toca el DOM. Se comparan medianas y
  // contadores de trabajo real, no solo llamadas.
  const panelPerf = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const panel = shadow && shadow.querySelector('.panel');
    const collapse = shadow && shadow.querySelector('.collapse');
    if (!d || !panel || !collapse) return { has: false };

    const original = d.session();
    const count = 80;
    const bench = () => {
      // Calienta caches y deja un valor visible distinto en cada tick.
      for (let i = 0; i < 6; i++) d.patchSession({ races: original.races + i });
      d.perfReset();
      const observer = new w.MutationObserver(() => {});
      observer.observe(panel, { subtree: true, childList: true, attributes: true, characterData: true });
      const times = [];
      for (let i = 0; i < count; i++) {
        const t0 = w.performance.now();
        d.patchSession({ races: original.races + 100 + i });
        times.push(w.performance.now() - t0);
      }
      const paints = d.perf().panelPaints;
      const mutations = observer.takeRecords().length;
      observer.disconnect();
      times.sort((a, b) => a - b);
      return {
        medianMs: times[Math.floor(times.length / 2)],
        p95Ms: times[Math.floor(times.length * 0.95)],
        totalMs: times.reduce((sum, value) => sum + value, 0),
        paints, mutations,
        collapsed: panel.dataset.collapsed,
        hidden: w.document.hidden,
      };
    };

    if (panel.dataset.collapsed === 'true') collapse.click();
    const expanded = bench();
    collapse.click();
    const collapsed = bench();
    collapse.click();
    d.patchSession({ races: original.races });
    return { has: true, count, expanded, collapsed };
  })()`, true);

  check('the folded panel costs less than the expanded panel',
    panelPerf.has
      && panelPerf.expanded.collapsed === 'false'
      && panelPerf.collapsed.collapsed === 'true'
      && panelPerf.expanded.paints === panelPerf.count
      && panelPerf.collapsed.paints === panelPerf.count
      && panelPerf.expanded.mutations > panelPerf.collapsed.mutations
      && panelPerf.expanded.medianMs < 8
      && panelPerf.collapsed.medianMs < panelPerf.expanded.medianMs
      && panelPerf.collapsed.totalMs < panelPerf.expanded.totalMs,
    panelPerf);

  // La pestaña en segundo plano es real: se abre otra pestaña, se lleva al
  // frente y se mide el iframe original mientras su documento esta oculto.
  let backgroundPerf = { has: false };
  let backgroundTab = null;
  try {
    backgroundTab = await openTab(devtoolsPort, 'about:blank');
    await backgroundTab.send('Page.bringToFront');
    await sleep(120);

    const visibility = await cdp.evaluate(`(() => {
      const w = document.querySelector('iframe').contentWindow;
      return { hidden: w.document.hidden, state: w.document.visibilityState };
    })()`);

    backgroundPerf = await cdp.evaluate(`(() => {
      const w = document.querySelector('iframe').contentWindow;
      const d = w.__ntaDebug;
      const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
      const panel = shadow && shadow.querySelector('.panel');
      if (!d || !panel) return { has: false };

      const original = d.session();
      const count = 80;
      for (let i = 0; i < 6; i++) d.patchSession({ races: original.races + i });
      d.perfReset();
      const observer = new w.MutationObserver(() => {});
      observer.observe(panel, { subtree: true, childList: true, attributes: true, characterData: true });
      const times = [];
      for (let i = 0; i < count; i++) {
        const t0 = w.performance.now();
        d.patchSession({ races: original.races + 100 + i });
        times.push(w.performance.now() - t0);
      }
      const paints = d.perf().panelPaints;
      const mutations = observer.takeRecords().length;
      observer.disconnect();
      times.sort((a, b) => a - b);
      d.patchSession({ races: original.races });
      return {
        has: true, count, paints, mutations,
        medianMs: times[Math.floor(times.length / 2)],
        p95Ms: times[Math.floor(times.length * 0.95)],
        totalMs: times.reduce((sum, value) => sum + value, 0),
        collapsed: panel.dataset.collapsed,
        hidden: w.document.hidden,
      };
    })()`, true);
    backgroundPerf.hidden = visibility.hidden;
    backgroundPerf.visibilityState = visibility.state;
  } finally {
    if (backgroundTab) {
      try { await backgroundTab.send('Page.close'); } catch { /* el target ya cerro */ }
      try { backgroundTab.close(); } catch { /* el websocket ya cerro */ }
    }
    try { await cdp.send('Page.bringToFront'); } catch { /* la pestaña ya no responde */ }
    await sleep(120);
  }

  check('a background panel tick skips DOM paints',
    backgroundPerf.has && backgroundPerf.hidden === true
      && backgroundPerf.visibilityState === 'hidden'
      && backgroundPerf.paints === 0
      && backgroundPerf.mutations === 0
      && backgroundPerf.medianMs < panelPerf.expanded.medianMs,
    backgroundPerf);

  // El memo del HUD no puede contaminar la calibracion del reloj: mientras
  // quedan muestras (`clockDone` falso) el guardia necesita una lectura fresca
  // por muestra; despues comparte el memo con el panel.
  const clockHud = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    // Se guarda el estado para devolverlo: las comprobaciones que vienen
    // despues siembran la sesion y no deben heredar una carrera a medias.
    const before = d.clock();
    d.patchSession({ clockDone: false, startedAt: Date.now() - 1000, endedAt: 0 });
    d.perfReset();
    d.hudWpm(true);      // deja el memo caliente
    d.hudForGuard(60);   // calibracion pendiente: debe volver al DOM
    const fresh = d.perf().hudReads;
    d.patchSession({ clockDone: true });
    d.hudForGuard(60);   // ya calibrada: comparte el memo
    const cached = d.perf().hudReads;
    d.patchSession({ clockDone: before.done, startedAt: before.startedAt, endedAt: before.endedAt });
    return { fresh, cached };
  })()`, true);
  check('the clock calibration reads the HUD fresh even with the memo warm',
    clockHud.fresh === 2, clockHud);
  check('after calibration the guard shares the HUD memo', clockHud.cached === 2, clockHud);

  // Invariantes de las refs: dos tarjetas no pueden compartir nodo (la fila de
  // tendencia llego a robarle la del resumen del dia) y una ref con data-field
  // debe apuntar a su propio campo.
  const refs = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    return w.__ntaDebug.refsAudit();
  })()`, true);

  const refEntries = Object.entries(refs || {});
  const refByNode = new Map();
  const sharedRefs = [];
  const mislabeledRefs = [];
  // Dos refs llevan el nombre de otro campo a proposito: `breakLeft` pinta el
  // valor de `break` y `progFill` el relleno de `progfill`. No son refs cruzadas.
  const refAliases = new Map([['breakLeft', 'break'], ['progFill', 'progfill']]);

  for (const [key, info] of refEntries) {
    if (!info || !info.id) continue;
    if (refByNode.has(info.id)) sharedRefs.push(`${refByNode.get(info.id)} + ${key}`);
    else refByNode.set(info.id, key);
    if (info.field && info.field !== key && refAliases.get(key) !== info.field) {
      mislabeledRefs.push(`${key} -> ${info.field}`);
    }
  }

  check('panel refs point to distinct nodes', sharedRefs.length === 0, sharedRefs);
  check('panel refs that name a data-field point to that field',
    mislabeledRefs.length === 0, mislabeledRefs);
  check('the two summary rows have their own element',
    Boolean(refs && refs.todayRow && refs.liveDriftRow
      && refs.todayRow.id && refs.todayRow.id !== refs.liveDriftRow.id),
    { today: refs && refs.todayRow, drift: refs && refs.liveDriftRow });

  // Season tracker: el parser lee la tarjeta activa y las props de React. El
  // banco le pone una fibra falsa para probar el XP exacto sin una cuenta.
  const seasonParsed = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const box = w.document.createElement('div');
    box.innerHTML = '<h1>Spirit Racers</h1>'
      + '<a class="seasonTeaser">Oct 18 - Nov 29</a>'
      + '<div class="seasonReward seasonReward--free is-selected">'
      + '<div class="seasonReward-bottom"><div class="seasonReward-tier">7</div>'
      + '<div class="seasonReward-progress"><div class="prog">'
      + '<div class="prog-points" style="left: 34%;">You</div>'
      + '<div class="prog-bar"><div class="prog-barFill" style="width: 34%;"></div></div>'
      + '</div></div></div></div>';
    const you = box.querySelector('.prog-points');
    you.__reactFiber$test = { return: { memoizedProps: {
      userSeasonExperience: 76701, experience: 90000, progress: 34,
      season: { seasonID: 73, totalRewards: 35 }, extraTier: false,
    } } };
    return w.__ntaDebug.parseSeason(box);
  })()`);
  check('season parser reads the current tier, next tier, exact XP and season id',
    Boolean(seasonParsed)
      && seasonParsed.seasonName === 'Spirit Racers'
      && seasonParsed.tier === 6 && seasonParsed.nextTier === 7
      && seasonParsed.progress === 34
      && seasonParsed.xp === 76701 && seasonParsed.nextXp === 90000
      && seasonParsed.seasonID === 73 && seasonParsed.endsText === 'Nov 29',
    seasonParsed);

  const seasonCard = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    w.localStorage.setItem('autoTyperSeason', JSON.stringify({
      v: 2, at: Date.now(), auto: true, source: 'user', seasonID: 73,
      seasonName: 'Spirit Racers', tier: 6, nextTier: 7,
      progress: 34, xp: 76701, currentXp: 70000, nextXp: 90000,
      endsAt: Date.now() + 27 * 86400000, endsText: 'Nov 29',
    }));
    w.__ntaDebug.paintSeason();
    const q = (sel) => shadow.querySelector(sel);
    return {
      tag: q('[data-field="seasonTag"]').textContent,
      name: q('[data-field="seasonName"]').textContent,
      tier: q('[data-field="seasonTier"]').textContent,
      xp: q('[data-field="seasonXp"]').textContent,
      next: q('[data-field="seasonNext"]').textContent,
      ends: q('[data-field="seasonEnds"]').textContent,
      note: q('[data-field="seasonNote"]').textContent,
      alert: q('[data-field="seasonAlert"]').style.display,
      fill: q('[data-field="seasonFill"]').style.width,
    };
  })()`);
  check('season card shows current tier, exact XP, XP left and the end date',
    seasonCard.tag === 'T6 · 34%' && seasonCard.name === 'Spirit Racers'
      && seasonCard.tier === 'T6' && seasonCard.xp === '76,701 / 90,000 XP'
      && seasonCard.next === '13,299 XP to go' && /Nov 29/.test(seasonCard.ends)
      && seasonCard.alert === 'none' && seasonCard.fill === '34%', seasonCard);

  const seasonEmpty = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    w.localStorage.removeItem('autoTyperSeason');
    w.__ntaDebug.paintSeason();
    const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    return {
      tag: s.querySelector('[data-field="seasonTag"]').textContent,
      note: s.querySelector('[data-field="seasonNote"]').textContent,
      fill: s.querySelector('[data-field="seasonFill"]').style.width,
    };
  })()`);
  check('season card waits for account XP when there is no snapshot',
    seasonEmpty.tag === 'no snapshot' && /account xp/i.test(seasonEmpty.note)
      && seasonEmpty.fill === '0%', seasonEmpty);

  // Sin abrir /season: el XP persistido por el juego y el bootstrap bastan
  // para pintar el tier actual, el siguiente y el progreso.
  const seasonAuto = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    w.localStorage.removeItem('autoTyperSeason');
    w.localStorage.setItem('persist:nt', JSON.stringify({
      user: JSON.stringify({ experience: 76701, playerExperience: 82423 }),
    }));
    w.NTBOOTSTRAP = () => ({
      ACTIVE_SEASONS: [{
        seasonID: 73, name: 'Spirit Racers', startStamp: 1,
        endStamp: Math.floor(Date.now() / 1000) + 20 * 86400, totalRewards: 35,
      }],
      SEASON_LEVELS: {
        startingLevels: 3, experiencePerStartingLevel: 10000,
        experiencePerAchievementLevel: 20000, experiencePerExtraLevels: 40000,
        extraLevelReward: 100000,
      },
    });
    const snap = w.__ntaDebug.seasonRefresh(true);
    w.__ntaDebug.paintSeason();
    const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const read = (sel) => (s.querySelector(sel) || {}).textContent || '';
    return {
      snap,
      tag: read('[data-field="seasonTag"]'),
      name: read('[data-field="seasonName"]'),
      tier: read('[data-field="seasonTier"]'),
      xp: read('[data-field="seasonXp"]'),
      next: read('[data-field="seasonNext"]'),
      alert: (s.querySelector('[data-field="seasonAlert"]') || {}).style.display,
    };
  })()`);
  check('season card updates from account XP without opening Season',
    Boolean(seasonAuto.snap)
      && seasonAuto.snap.tier === 6 && seasonAuto.snap.nextTier === 7
      && seasonAuto.snap.xp === 76701 && seasonAuto.snap.nextXp === 90000
      && seasonAuto.tag === 'T6 · 34%' && seasonAuto.tier === 'T6'
      && seasonAuto.xp === '76,701 / 90,000 XP' && seasonAuto.name === 'Spirit Racers'
      && seasonAuto.alert === 'none', seasonAuto);

  const seasonAutoNext = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const user = JSON.parse(w.localStorage.getItem('persist:nt'));
    user.user = JSON.stringify({ experience: 91000, playerExperience: 82423 });
    w.localStorage.setItem('persist:nt', JSON.stringify(user));
    const snap = w.__ntaDebug.seasonRefresh(true);
    w.__ntaDebug.paintSeason();
    const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const read = (sel) => (s.querySelector(sel) || {}).textContent || '';
    return {
      snap,
      tag: read('[data-field="seasonTag"]'),
      tier: read('[data-field="seasonTier"]'),
      xp: read('[data-field="seasonXp"]'),
      next: read('[data-field="seasonNext"]'),
    };
  })()`);
  check('season card crosses to the next tier from account XP',
    Boolean(seasonAutoNext.snap)
      && seasonAutoNext.snap.tier === 7 && seasonAutoNext.snap.nextTier === 8
      && seasonAutoNext.snap.xp === 91000 && seasonAutoNext.snap.nextXp === 110000
      && seasonAutoNext.tag === 'T7 · 5%' && seasonAutoNext.tier === 'T7'
      && seasonAutoNext.xp === '91,000 / 110,000 XP', seasonAutoNext);

  const seasonAlert = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    w.localStorage.setItem('autoTyperSeason', JSON.stringify({
      v: 2, at: Date.now(), auto: true, source: 'user', seasonID: 73,
      seasonName: 'Spirit Racers', tier: 6, nextTier: 7, progress: 82,
      xp: 86500, currentXp: 70000, nextXp: 90000,
      endsAt: Date.now() + 2 * 86400000, endsText: 'Nov 29',
    }));
    w.__ntaDebug.paintSeason();
    const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const alert = s.querySelector('[data-field="seasonAlert"]');
    return { text: alert.textContent, display: alert.style.display };
  })()`);
  check('season card warns when it ends in three days or less and under 5k XP remains',
    seasonAlert.display !== 'none'
      && /Season ends in 2d/.test(seasonAlert.text)
      && /3,500 XP to next reward/.test(seasonAlert.text), seasonAlert);

  // Proyeccion de temporada: el banco siembra cinco dias con XP y comprueba
  // que la fila pace y el aviso salen del ritmo real, no de un numero fijo.
  const seasonPace = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const store = w.localStorage;
    const saved = [];
    const savedHistory = store.getItem('autoTyperRaceHistory');
    const hist = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && key.startsWith('ntQueue:dayHist:')) hist.push(key);
    }
    for (const key of hist) {
      saved.push([key, store.getItem(key)]);
      store.removeItem(key);
    }

    const stamp = (offset) => {
      const d = new Date(Date.now() - offset * 86400000);
      return d.getFullYear() + '-'
        + String(d.getMonth() + 1).padStart(2, '0') + '-'
        + String(d.getDate()).padStart(2, '0');
    };
    const seed = (xp) => {
      for (let offset = 1; offset <= 5; offset++) {
        const date = stamp(offset);
        store.setItem('ntQueue:dayHist:' + date + ':pace', JSON.stringify({
          date, races: 10, sumWpm: 1000, sumTarget: 1000, boxes: 0, dq: 0,
          xp, clean: 0, firstAt: 0, lastAt: 0, dqAt: 0, updatedAt: Date.now(),
        }));
      }
    };

    store.setItem('autoTyperSeason', JSON.stringify({
      v: 2, at: Date.now(), auto: true, source: 'user', seasonID: 73,
      seasonName: 'Spirit Racers', tier: 6, nextTier: 7, progress: 34,
      xp: 76701, currentXp: 70000, nextXp: 90000,
      endsAt: Date.now() + 7 * 86400000, endsText: 'Nov 29',
    }));
    store.setItem('autoTyperRaceHistory', JSON.stringify(Array.from({ length: 10 }, (_, i) => ({
      at: Date.now() - i * 60000, wpm: 110, acc: 98, target: 110, xp: 800,
    }))));

    const read = () => {
      w.__ntaDebug.paintSeason();
      const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
      const pace = s.querySelector('[data-field="seasonPace"]');
      const alert = s.querySelector('[data-field="seasonAlert"]');
      return {
        pace: pace.textContent,
        title: pace.title,
        races: s.querySelector('[data-field="seasonRaces"]').textContent,
        alert: alert.textContent,
        display: alert.style.display,
      };
    };

    seed(2000);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const onPace = read();

    seed(1000);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const short = read();

    const seeded = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && key.startsWith('ntQueue:dayHist:') && key.endsWith(':pace')) seeded.push(key);
    }
    for (const key of seeded) store.removeItem(key);
    for (const [key, value] of saved) store.setItem(key, value);
    if (savedHistory === null) store.removeItem('autoTyperRaceHistory');
    else store.setItem('autoTyperRaceHistory', savedHistory);

    return { onPace, short };
  })()`, true);
  check('season card projects the week pace and marks the next reward reachable',
    seasonPace.onPace.pace === '2k/day · on pace'
      && seasonPace.onPace.races === '≈ 17 races'
      && seasonPace.onPace.display === 'none', seasonPace.onPace);
  check('season card says how much XP/day is missing when the pace falls short',
    seasonPace.short.pace === '1k/day · 6.3k short'
      && seasonPace.short.display !== 'none'
      && /≈ 1\.9k XP\/day to reach T7/.test(seasonPace.short.alert), seasonPace.short);

  // El HUD vivo y el de la carrera anterior comparten clase: manda el visible.
  const hudPick = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const hidden = [...w.document.querySelectorAll('.dash-metrics')];
    const saved = hidden.map((el) => el.style.display);
    hidden.forEach((el) => { el.style.display = 'none'; });
    const stale = w.document.createElement('div');
    stale.className = 'race-results';
    stale.innerHTML = '<div class="dash-metrics"><div class="list-item"><span class="tsxs">WPM</span><span class="h4">108</span></div></div>';
    const live = w.document.createElement('div');
    live.className = 'dash-metrics';
    live.innerHTML = '<div class="list-item"><span class="tsxs">WPM</span><span class="h4">101</span></div></div>';
    w.document.body.append(stale, live);
    const value = d.hudWpm();
    stale.remove();
    live.remove();
    hidden.forEach((el, i) => { el.style.display = saved[i]; });
    return value;
  })()`);
  check('the game HUD reader takes the live WPM, not the stale results overlay',
    hudPick === 101, hudPick);

  // Reloj: 200 teclas y 20 s dan 120 WPM; el HUD dice 100, asi que el arranque
  // real fue 4 s antes. Tras ocho lecturas el panel cae a 100 sin tocar el HUD.
  const clockCal = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const hidden = [...w.document.querySelectorAll('.dash-metrics')];
    const saved = hidden.map((el) => el.style.display);
    hidden.forEach((el) => { el.style.display = 'none'; });
    const host = w.document.createElement('div');
    host.className = 'dash-metrics';
    host.innerHTML = '<div class="list-item"><span class="tsxs">WPM</span><span class="h4">100</span></div>';
    w.document.body.appendChild(host);
    d.patchSession({
      startedAt: Date.now() - 20000, endedAt: 0, chars: 200, nitroChars: 0,
      correct: 195, errors: 5, clockDone: false, clockSamples: [],
    });
    const before = d.clock();
    for (let i = 0; i < 8; i++) d.calibrateClock();
    const after = d.clock();
    host.remove();
    d.patchSession({
      startedAt: 0, endedAt: 0, chars: 0, nitroChars: 0, correct: 0, errors: 0,
      clockDone: false, clockSamples: [], lastHudWpm: 0,
    });
    hidden.forEach((el, i) => { el.style.display = saved[i]; });
    return { before, after };
  })()`);
  check('race clock aligns to the game HUD when the start estimate is late',
    Math.abs(clockCal.after.wpm - 100) < 1
      && clockCal.after.startedAt < clockCal.before.startedAt - 3000
      && clockCal.after.done === true, clockCal);

  // Tarjeta Live passes: se le da un CSV como el de tests/live/history.js por
  // el input de archivo, igual que lo haria una persona.
  const liveCard = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const input = shadow.querySelector('[data-field="liveFile"]');
    const csv = 'at,races,samples,mean_pts,sd_pts,min_pts,max_pts,outside,tolerance,user,version,deltas\\r\\n'
      + '2026-11-02T09:00:00.000Z,4,4,-0.20,0.10,-0.3,-0.1,0,2,TestRacer,v7.29.0,-0.3 -0.2 -0.1 -0.2\\r\\n'
      + '2026-11-02T10:00:00.000Z,5,5,0.20,0.16,-0.1,0.4,0,2,AltRacer,v7.29.0,+0.1 -0.1 +0.2 +0.3 +0.4\\r\\n'
      + '2026-11-02T11:00:00.000Z,3,3,1.10,0.80,0.2,2.4,1,2,TestRacer,v7.29.0,+0.2 +0.7 +2.4\\r\\n';
    const file = new w.File([csv], 'live-history.csv', { type: 'text/csv' });
    const dt = new w.DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 400));

    const list = shadow.querySelector('[data-field="liveList"]');
    return {
      rows: list.children.length,
      text: list.textContent,
      count: shadow.querySelector('[data-field="liveCount"]').textContent,
      drift: shadow.querySelector('[data-field="liveDrift"]').textContent,
      driftGood: shadow.querySelector('[data-field="liveDrift"]').dataset.good,
      driftShown: shadow.querySelector('[data-field="liveDriftRow"]').style.display,
      compare: shadow.querySelector('[data-field="liveCompare"]').textContent,
      compareShown: shadow.querySelector('[data-field="liveCompareRow"]').style.display,
      pickShown: shadow.querySelector('[data-field="livePickRow"]').style.display,
      pickOptions: shadow.querySelector('[data-field="livePickA"]').options.length,
      pickA: shadow.querySelector('[data-field="livePickA"]').value,
      pickB: shadow.querySelector('[data-field="livePickB"]').value,
      spreadShown: shadow.querySelector('[data-field="liveSpreadRow"]').style.display,
      exportEnabled: !shadow.querySelector('[data-field="livePickExport"]').disabled,
      notices: (shadow.querySelector('[data-field="noticeList"]') || {}).textContent,
      stored: Boolean(w.localStorage.getItem('autoTyperLivePasses')),
    };
  })()`, true);

  check('live passes card lists the CSV rows',
    liveCard.rows === 3 && /5 races/.test(liveCard.text) && /3 races/.test(liveCard.text), liveCard);
  check('live passes card shows the account when passes mix accounts',
    /TestRacer/.test(liveCard.text) && /AltRacer/.test(liveCard.text), liveCard.text);
  check('live passes card marks the pass outside the band',
    /WARN/.test(liveCard.text) && /1\/3 outside/.test(liveCard.text), liveCard.text);
  check('live passes card stores the last load',
    liveCard.count === '3 stored · 2 accounts' && liveCard.stored === true, liveCard);
  check('live passes card compares the latest pass with the previous average',
    liveCard.driftShown !== 'none'
      && liveCard.drift === '+1.10 pts vs +0.00 avg'
      && liveCard.driftGood === '0',
    { drift: liveCard.drift, good: liveCard.driftGood, shown: liveCard.driftShown });
  check('live passes card compares the last two passes side by side',
    liveCard.compareShown !== 'none'
      && liveCard.compare === '+0.20 → +1.10 · +0.90 pts',
    { compare: liveCard.compare, shown: liveCard.compareShown });
  check('live passes card offers a picker for any two loaded passes',
    liveCard.pickShown === 'grid' && liveCard.pickOptions === 3
      && liveCard.pickA === '2026-11-02T10:00:00.000Z'
      && liveCard.pickB === '2026-11-02T11:00:00.000Z',
    { shown: liveCard.pickShown, options: liveCard.pickOptions, a: liveCard.pickA, b: liveCard.pickB });
  check('live passes card keeps the spread warning hidden without a 10-race block',
    liveCard.spreadShown === 'none' && liveCard.exportEnabled === true,
    { spread: liveCard.spreadShown, exportEnabled: liveCard.exportEnabled });
  check('live passes card warns in the log when the drift leaves the band',
    /latest pass is \+1\.10 pts off the previous average/.test(liveCard.notices || ''),
    liveCard.notices);

  const livePick = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const a = shadow.querySelector('[data-field="livePickA"]');
    const b = shadow.querySelector('[data-field="livePickB"]');
    a.value = '2026-11-02T09:00:00.000Z';
    b.value = '2026-11-02T11:00:00.000Z';
    a.dispatchEvent(new w.Event('change', { bubbles: true }));
    b.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      result: shadow.querySelector('[data-field="livePickResult"]').textContent,
      good: shadow.querySelector('[data-field="livePickResult"]').dataset.good,
      title: shadow.querySelector('[data-field="livePickRow"]').title,
      exportEnabled: !shadow.querySelector('[data-field="livePickExport"]').disabled,
    };
  })()`, true);

  check('live passes picker compares the two chosen passes',
    livePick.result === '-0.20 → +1.10 · +1.30 pts' && livePick.good === '0'
      && livePick.exportEnabled === true
      && /B − A = \+1\.30 pts/.test(livePick.title),
    livePick);

  const liveCompareCsv = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    return w.__ntaDebug.liveCompareCsv();
  })()`);
  const compareCsvRows = String(liveCompareCsv || '').trim().split(/\r?\n/);

  check('live passes A/B exports a CSV row with both passes and B minus A',
    compareCsvRows.length === 2
      && compareCsvRows[0] === 'generated_at,a_at,a_races,a_mean_pts,a_sd_pts,a_user,b_at,b_races,b_mean_pts,b_sd_pts,b_user,diff_pts,band_pts'
      && compareCsvRows[1].includes('2026-11-02T09:00:00.000Z,4,-0.20,0.10,TestRacer')
      && compareCsvRows[1].includes('2026-11-02T11:00:00.000Z,3,1.10,0.80,TestRacer')
      && compareCsvRows[1].endsWith(',1.30,0.50'),
    compareCsvRows);

  const liveClear = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    shadow.querySelector('[data-field="liveClear"]').click();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const drift = shadow.querySelector('[data-field="liveDriftRow"]');
    return {
      rows: shadow.querySelector('[data-field="liveList"]').children.length,
      text: shadow.querySelector('[data-field="liveList"]').textContent,
      count: shadow.querySelector('[data-field="liveCount"]').textContent,
      drift: drift.style.display,
      pick: shadow.querySelector('[data-field="livePickRow"]').style.display,
      exportDisabled: shadow.querySelector('[data-field="livePickExport"]').disabled,
      stored: w.localStorage.getItem('autoTyperLivePasses'),
    };
  })()`, true);

  check('live passes card clears the loaded history',
    liveClear.rows === 1
      && /load the csv/.test(liveClear.text)
      && liveClear.count === 'none'
      && liveClear.drift === 'none'
      && liveClear.pick === 'none'
      && liveClear.exportDisabled === true
      && liveClear.stored === null,
    liveClear);

  // Dos pasadas seguidas fuera de la banda: el panel lo dice como racha, no
  // como una pasada rara. Cada deriva se mide contra la media anterior.
  const liveStreak = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const input = shadow.querySelector('[data-field="liveFile"]');
    const csv = 'at,races,samples,mean_pts,sd_pts,min_pts,max_pts,outside,tolerance,user,version,deltas\\r\\n'
      + '2026-11-02T12:00:00.000Z,3,3,0.10,0.05,0.0,0.2,0,2,TestRacer,v7.41.0,+0.1 +0.1 +0.1\\r\\n'
      + '2026-11-02T13:00:00.000Z,3,3,0.90,0.10,0.8,1.0,0,2,TestRacer,v7.41.0,+0.8 +0.9 +1.0\\r\\n'
      + '2026-11-02T14:00:00.000Z,3,3,1.70,0.10,1.6,1.8,0,2,TestRacer,v7.41.0,+1.6 +1.7 +1.8\\r\\n';
    const file = new w.File([csv], 'live-history.csv', { type: 'text/csv' });
    const dt = new w.DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 400));

    const row = shadow.querySelector('[data-field="liveStreakRow"]');
    return {
      shown: row.style.display,
      value: shadow.querySelector('[data-field="liveStreak"]').textContent,
      good: shadow.querySelector('[data-field="liveStreak"]').dataset.good,
      notices: (shadow.querySelector('[data-field="noticeList"]') || {}).textContent,
    };
  })()`, true);

  check('live passes card flags two passes drifting in a row',
    liveStreak.shown !== 'none'
      && liveStreak.value === '2 in a row'
      && liveStreak.good === '0'
      && /2 passes in a row are off the average before them/.test(liveStreak.notices || ''),
    liveStreak);

  // Tres seguidas: la racha deja de ser una anomalia y pasa a "sustained".
  const liveSustained = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const input = shadow.querySelector('[data-field="liveFile"]');
    const csv = 'at,races,samples,mean_pts,sd_pts,min_pts,max_pts,outside,tolerance,user,version,deltas\\r\\n'
      + '2026-11-02T12:00:00.000Z,3,3,0.10,0.05,0.0,0.2,0,2,TestRacer,v7.41.0,+0.1 +0.1 +0.1\\r\\n'
      + '2026-11-02T13:00:00.000Z,3,3,0.90,0.10,0.8,1.0,0,2,TestRacer,v7.41.0,+0.8 +0.9 +1.0\\r\\n'
      + '2026-11-02T14:00:00.000Z,3,3,1.70,0.10,1.6,1.8,0,2,TestRacer,v7.41.0,+1.6 +1.7 +1.8\\r\\n'
      + '2026-11-02T15:00:00.000Z,3,3,2.50,0.10,2.4,2.6,0,2,TestRacer,v7.41.0,+2.4 +2.5 +2.6\\r\\n';
    const file = new w.File([csv], 'live-history.csv', { type: 'text/csv' });
    const dt = new w.DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 400));

    return {
      shown: shadow.querySelector('[data-field="liveStreakRow"]').style.display,
      value: shadow.querySelector('[data-field="liveStreak"]').textContent,
      good: shadow.querySelector('[data-field="liveStreak"]').dataset.good,
      count: shadow.querySelector('[data-field="liveCount"]').textContent,
      text: shadow.querySelector('[data-field="liveList"]').textContent,
      notices: (shadow.querySelector('[data-field="noticeList"]') || {}).textContent,
    };
  })()`, true);

  check('live passes card escalates a three-pass streak',
    liveSustained.shown !== 'none'
      && liveSustained.value === '3 in a row · sustained'
      && liveSustained.good === '0'
      && /3 passes in a row are off the average before them/.test(liveSustained.notices || '')
      && /sustained drift/.test(liveSustained.notices || ''),
    liveSustained);
  check('live passes card keeps the account out of a single-account list',
    !/TestRacer/.test(liveSustained.text || '')
      && liveSustained.count === '4 stored · 1 account',
    liveSustained);

  // El JSON que escribe npm run live se carga igual que el CSV (ultimas cinco).
  const liveJson = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const input = shadow.querySelector('[data-field="liveFile"]');
    const payload = {
      total: 4,
      passes: [
        { at: '2026-11-02T12:00:00.000Z', races: 3, samples: 3, mean: 0.10, sd: 0.05, outside: 0, deltas: [0.1, 0.1, 0.1], user: 'Ana' },
        { at: '2026-11-02T13:00:00.000Z', races: 3, samples: 3, mean: 0.90, sd: 0.10, outside: 0, deltas: [0.8, 0.9, 1.0], user: 'Bob' },
      ],
    };
    const file = new w.File([JSON.stringify(payload)], 'live-history.json', { type: 'application/json' });
    const dt = new w.DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 400));

    const list = shadow.querySelector('[data-field="liveList"]');
    return {
      rows: list.children.length,
      text: list.textContent,
      count: shadow.querySelector('[data-field="liveCount"]').textContent,
      stored: Boolean(w.localStorage.getItem('autoTyperLivePasses')),
    };
  })()`, true);

  check('live passes card loads the JSON report',
    liveJson.rows === 2 && liveJson.count === '2 stored · 2 accounts'
      && /\+0\.10 pts/.test(liveJson.text) && /\+0\.90 pts/.test(liveJson.text)
      && /Ana/.test(liveJson.text) && /Bob/.test(liveJson.text)
      && liveJson.stored === true,
    liveJson);

  // Un JSON sin pasadas no borra la lista cargada: avisa y se queda como esta.
  const liveEmptyJson = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const input = shadow.querySelector('[data-field="liveFile"]');
    const file = new w.File([JSON.stringify({ total: 0, passes: [] })], 'live-history.json', { type: 'application/json' });
    const dt = new w.DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    // El aviso llega cuando termina el FileReader: se espera al texto exacto.
    const noticeText = () => (shadow.querySelector('[data-field="noticeList"]') || {}).textContent || '';
    const emptyUntil = Date.now() + 2500;
    while (Date.now() < emptyUntil && !/no readable rows/.test(noticeText())) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return {
      rows: shadow.querySelector('[data-field="liveList"]').children.length,
      notices: noticeText(),
      stored: Boolean(w.localStorage.getItem('autoTyperLivePasses')),
    };
  })()`, true);

  check('live passes card warns about a JSON with no passes',
    liveEmptyJson.rows === 2
      && /no readable rows/.test(liveEmptyJson.notices || '')
      && liveEmptyJson.stored === true,
    liveEmptyJson);

  // Una pasada sin cuenta se rotula `unknown` cuando la lista mezcla cuentas.
  const liveNoUser = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const input = shadow.querySelector('[data-field="liveFile"]');
    const csv = 'at,races,samples,mean_pts,sd_pts,min_pts,max_pts,outside,tolerance,user,version,deltas\\r\\n'
      + '2026-11-02T16:00:00.000Z,1,1,0.10,0.00,0.1,0.1,0,2,Ana,v7.41.0,+0.1\\r\\n'
      + '2026-11-02T17:00:00.000Z,1,1,0.20,0.00,0.2,0.2,0,2,,v7.41.0,+0.2\\r\\n'
      + '2026-11-02T18:00:00.000Z,1,1,0.30,0.00,0.3,0.3,0,2,Bob,v7.41.0,+0.3\\r\\n';
    const file = new w.File([csv], 'live-history.csv', { type: 'text/csv' });
    const dt = new w.DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 400));

    return {
      text: shadow.querySelector('[data-field="liveList"]').textContent,
      count: shadow.querySelector('[data-field="liveCount"]').textContent,
    };
  })()`, true);

  check('live passes card labels a pass with no account',
    /unknown/.test(liveNoUser.text)
      && /Ana/.test(liveNoUser.text) && /Bob/.test(liveNoUser.text)
      && liveNoUser.count === '3 stored · 2 accounts',
    liveNoUser);

  // El aviso de dispersion solo mira bloques de 10+ carreras y solo se enciende
  // cuando la sd supera 0.10. Un bloque de 10 con sd 0.14 avisa; uno con 0.06 no.
  const liveSpread = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const input = shadow.querySelector('[data-field="liveFile"]');
    const header = 'at,races,samples,mean_pts,sd_pts,min_pts,max_pts,outside,tolerance,user,version,deltas\\r\\n';
    const load = async (sd) => {
      const csv = header
        + '2026-11-02T12:00:00.000Z,10,10,0.08,' + sd + ',0.0,0.3,0,2,TestRacer,v7.50.0,+0.1 +0.1 +0.0 +0.1 +0.0 +0.1 +0.0 +0.1 +0.1 +0.2\\r\\n';
      const file = new w.File([csv], 'live-history.csv', { type: 'text/csv' });
      const dt = new w.DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new w.Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 400));
      return {
        shown: shadow.querySelector('[data-field="liveSpreadRow"]').style.display,
        value: shadow.querySelector('[data-field="liveSpread"]').textContent,
        good: shadow.querySelector('[data-field="liveSpread"]').dataset.good,
        title: shadow.querySelector('[data-field="liveSpreadRow"]').title,
        notices: (shadow.querySelector('[data-field="noticeList"]') || {}).textContent,
      };
    };
    return { high: await load('0.14'), low: await load('0.06') };
  })()`, true);

  check('live passes warns when a 10-race block sd exceeds 0.10',
    liveSpread.high.shown !== 'none'
      && liveSpread.high.value === 'sd 0.14 · 10 races'
      && liveSpread.high.good === '0'
      && /sd 0\.14 pts > 0\.10/.test(liveSpread.high.title)
      && /latest 10-race block is too scattered/.test(liveSpread.high.notices || ''),
    liveSpread.high);
  check('live passes hides the spread warning when the block is tight',
    liveSpread.low.shown === 'none',
    liveSpread.low);

  // Historial de carreras: diez filas con hora, puesto, XP y WPM. Se siembra
  // por el gancho del banco y se lee el DOM real de la tarjeta.
  const historyCard = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const now = Date.now();
    d.seedHistory(Array.from({ length: 10 }, (_, i) => ({
      wpm: 100 + i * 1.1,
      acc: 97.5,
      target: 100,
      at: now - (10 - i) * 60000,
      place: (i % 5) + 1,
      xp: 500 + i * 10,
      ...(i === 9 ? { nitroWords: 1, nitroChars: 8 } : {}),
    })));
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const list = shadow.querySelector('[data-field="history"]');
    const first = list.children[0];
    const out = {
      rows: list.children.length,
      first: first ? first.textContent : '',
      title: first ? first.getAttribute('title') : '',
      badge: first ? (first.querySelector('.nitro-tag') || {}).textContent || '' : '',
      header: shadow.querySelector('.hist-head').textContent,
    };
    d.seedHistory([]);
    return out;
  })()`, true);

  check('last races card shows ten races with place, xp and wpm',
    historyCard.rows === 10
      && /#5/.test(historyCard.first)
      && /\+590/.test(historyCard.first)
      && /109\.9/.test(historyCard.first)
      && /place/.test(historyCard.header) && /xp/.test(historyCard.header),
    historyCard);
  check('a race that used nitro carries its badge in the history row',
    historyCard.badge === 'N' && /nitro 1 word · 8 ch/.test(historyCard.title), historyCard);

  // El tope de carreras ya no ofrece 20: 25 es donde el bonus de sesión llega
  // a su techo de 250 XP. El primer clic desde libre tiene que caer ahí.
  const limitStep = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    d.patchSession({ raceLimit: 0, races: 0 });
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    shadow.querySelector('[data-field="limit"]').parentElement.click();
    const text = shadow.querySelector('[data-field="limit"]').textContent.trim();
    const stored = w.localStorage.getItem('autoTyperRaceLimit');
    // Se deja libre otra vez: el test siguiente parte de cero.
    d.patchSession({ raceLimit: 0 });
    w.localStorage.setItem('autoTyperRaceLimit', '0');
    return { text, stored };
  })()`);
  check('the race limit steps straight to 25, where the session bonus caps',
    /^25( · ≈\d+m)?$/.test(limitStep.text) && limitStep.stored === '25', limitStep);

  const time = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const row = shadow.querySelector('[data-field="timeLimitRow"]');
    row.click();
    const first = shadow.querySelector('[data-field="timeLimit"]').textContent;
    const stored = w.localStorage.getItem('autoTyperTimeLimit');
    const slider = shadow.querySelector('[data-field="timeSlider"]');
    slider.value = '4';
    slider.dispatchEvent(new w.Event('input', { bubbles: true }));
    return {
      first,
      stored,
      second: shadow.querySelector('[data-field="timeLimit"]').textContent,
      fill: slider.style.getPropertyValue('--fill'),
      storedSecond: w.localStorage.getItem('autoTyperTimeLimit'),
      leftShown: shadow.querySelector('[data-field="timeLeftRow"]').style.display,
      left: shadow.querySelector('[data-field="timeLeft"]').textContent,
    };
  })()`);

  check('time row cycles to 15m', time.first === '15m', time.first);
  check('15m persisted', time.stored === '15', time.stored);
  check('time slider sets 2h', time.second === '2h', time.second);
  check('2h persisted', time.storedSecond === '120', time.storedSecond);
  check('time slider fill is 100%', time.fill === '100%', time.fill);
  check('time-left row becomes visible', time.leftShown === 'flex', time.leftShown);

  const xp = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    shadow.querySelector('[data-field="xpLimitRow"]').click();
    const first = shadow.querySelector('[data-field="xpLimit"]').textContent;
    const stored = w.localStorage.getItem('autoTyperXpLimit');
    const slider = shadow.querySelector('[data-field="xpSlider"]');
    slider.value = '4';
    slider.dispatchEvent(new w.Event('input', { bubbles: true }));
    return {
      first,
      stored,
      second: shadow.querySelector('[data-field="xpLimit"]').textContent,
      storedSecond: w.localStorage.getItem('autoTyperXpLimit'),
      fill: slider.style.getPropertyValue('--fill'),
      rowShown: shadow.querySelector('[data-field="xpRow"]').style.display,
    };
  })()`);

  check('xp row cycles to 5k', xp.first === '5k', xp.first);
  check('5k persisted', xp.stored === '5000', xp.stored);
  check('xp slider sets 50k', xp.second === '50k', xp.second);
  check('50k persisted', xp.storedSecond === '50000', xp.storedSecond);
  check('xp slider fill is 100%', xp.fill === '100%', xp.fill);
  check('xp row becomes visible', xp.rowShown === 'flex', xp.rowShown);

  const dailyStep = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    d.patchSession({ dailyRaceLimit: 0, dailyXpLimit: 0 });
    w.localStorage.setItem('autoTyperDailyRaceLimit', '0');
    w.localStorage.setItem('autoTyperDailyXpLimit', '0');

    shadow.querySelector('[data-field="dailyRaceRow"]').click();
    const first = shadow.querySelector('[data-field="dailyRaces"]').textContent;
    const stored = w.localStorage.getItem('autoTyperDailyRaceLimit');
    const raceSlider = shadow.querySelector('[data-field="dailyRaceSlider"]');
    raceSlider.value = '3';
    raceSlider.dispatchEvent(new w.Event('input', { bubbles: true }));

    const xpSlider = shadow.querySelector('[data-field="dailyXpSlider"]');
    xpSlider.value = '2';
    xpSlider.dispatchEvent(new w.Event('input', { bubbles: true }));
    const out = {
      first,
      stored,
      second: shadow.querySelector('[data-field="dailyRaces"]').textContent,
      storedSecond: w.localStorage.getItem('autoTyperDailyRaceLimit'),
      fill: raceSlider.style.getPropertyValue('--fill'),
      xpText: shadow.querySelector('[data-field="dailyXp"]').textContent,
      xpStored: w.localStorage.getItem('autoTyperDailyXpLimit'),
      xpFill: xpSlider.style.getPropertyValue('--fill'),
      left: shadow.querySelector('[data-field="dailyLeft"]').textContent,
    };

    d.patchSession({ dailyRaceLimit: 0, dailyXpLimit: 0 });
    w.localStorage.setItem('autoTyperDailyRaceLimit', '0');
    w.localStorage.setItem('autoTyperDailyXpLimit', '0');
    return out;
  })()`);

  check('daily race row cycles to 100',
    /^\d+ \/ 100$/.test(dailyStep.first) && dailyStep.stored === '100', dailyStep);
  check('daily race slider sets 300',
    /^\d+ \/ 300$/.test(dailyStep.second) && dailyStep.storedSecond === '300', dailyStep);
  check('daily race slider fill is 100%', dailyStep.fill === '100%', dailyStep.fill);
  check('daily XP slider sets 100k',
    /^\d+k? \/ 100k$/.test(dailyStep.xpText) && dailyStep.xpStored === '100000', dailyStep);
  check('daily budget shows what is left today',
    /\d+ races/.test(dailyStep.left) && /XP$/.test(dailyStep.left), dailyStep.left);

  const activeStep = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    d.patchSession({ activeOn: false, activeStart: 8, activeEnd: 23 });
    w.localStorage.setItem('autoTyperActiveOn', '0');
    w.localStorage.setItem('autoTyperActiveStart', '8');
    w.localStorage.setItem('autoTyperActiveEnd', '23');

    shadow.querySelector('[data-field="activeRow"]').click();
    const onText = shadow.querySelector('[data-field="activeState"]').textContent;
    const storedOn = w.localStorage.getItem('autoTyperActiveOn');

    const startSlider = shadow.querySelector('[data-field="activeStartSlider"]');
    startSlider.value = '9';
    startSlider.dispatchEvent(new w.Event('input', { bubbles: true }));
    const endSlider = shadow.querySelector('[data-field="activeEndSlider"]');
    endSlider.value = '17';
    endSlider.dispatchEvent(new w.Event('input', { bubbles: true }));

    const out = {
      onText,
      storedOn,
      from: shadow.querySelector('[data-field="activeStart"]').textContent,
      to: shadow.querySelector('[data-field="activeEnd"]').textContent,
      storedStart: w.localStorage.getItem('autoTyperActiveStart'),
      storedEnd: w.localStorage.getItem('autoTyperActiveEnd'),
      now: shadow.querySelector('[data-field="activeNow"]').textContent,
      title: shadow.querySelector('[data-field="activeNow"]').title,
    };

    shadow.querySelector('[data-field="activeRow"]').click();
    d.patchSession({ activeOn: false, activeStart: 8, activeEnd: 23 });
    w.localStorage.setItem('autoTyperActiveOn', '0');
    w.localStorage.setItem('autoTyperActiveStart', '8');
    w.localStorage.setItem('autoTyperActiveEnd', '23');
    return out;
  })()`);

  check('active hours toggle turns the window on and persists',
    activeStep.onText === '08:00–23:00' && activeStep.storedOn === '1', activeStep);
  check('active hours sliders set the start and end',
    activeStep.from === '09:00' && activeStep.to === '17:00'
      && activeStep.storedStart === '9' && activeStep.storedEnd === '17', activeStep);
  check('active hours now row says whether the window is open or closed',
    /^(open|closed) · /.test(activeStep.now)
      && activeStep.title.includes('Active hours 09:00–17:00'), activeStep);

  const hours = await cdp.evaluate(`(() => {
    const d = document.querySelector('iframe').contentWindow.__ntaDebug;
    return {
      before: d.activeAt(8, 23, 7, 59),
      at: d.activeAt(8, 23, 8, 0),
      late: d.activeAt(8, 23, 22, 59),
      after: d.activeAt(8, 23, 23, 0),
      overnightBefore: d.activeAt(22, 2, 21, 59),
      overnightAt: d.activeAt(22, 2, 22, 0),
      overnightEarly: d.activeAt(22, 2, 1, 59, 1),
      overnightAfter: d.activeAt(22, 2, 2, 0, 1),
      allDay: d.activeAt(0, 0, 12, 0),
    };
  })()`);

  check('active hours stay closed before the start',
    hours.before.open === false && hours.before.nextText === '08:00', hours.before);
  check('active hours open exactly at the start',
    hours.at.open === true && hours.at.closesText === '23:00', hours.at);
  check('active hours stay open until the end',
    hours.late.open === true, hours.late);
  check('active hours close exactly at the end',
    hours.after.open === false && hours.after.msUntilOpen > 0, hours.after);
  check('a window that crosses midnight is open after 22:00',
    hours.overnightAt.open === true && hours.overnightAt.closesAt > 0, hours.overnightAt);
  check('a window that crosses midnight is still open at 01:59',
    hours.overnightEarly.open === true, hours.overnightEarly);
  check('a window that crosses midnight closes at 02:00',
    hours.overnightAfter.open === false && hours.overnightAfter.nextText === '22:00', hours.overnightAfter);
  check('an all-day window never closes',
    hours.allDay.open === true && hours.allDay.allDay === true, hours.allDay);

  const hoursGate = await cdp.evaluate(`(() => {
    const d = document.querySelector('iframe').contentWindow.__ntaDebug;
    return {
      closed: d.activeGateAt(8, 23, 7, 0),
      open: d.activeGateAt(8, 23, 10, 0),
      overnight: d.activeGateAt(22, 2, 3, 0),
    };
  })()`);

  check('active hours gate blocks before the start',
    hoursGate.closed && hoursGate.closed.left > 0
      && /opens at 08:00/.test(hoursGate.closed.reason), hoursGate.closed);
  check('active hours gate stays open inside the window',
    hoursGate.open === null, hoursGate.open);
  check('active hours gate blocks the gap of an overnight window',
    hoursGate.overnight && /opens at 22:00/.test(hoursGate.overnight.reason), hoursGate.overnight);

  // Sincronizacion entre ventanas: un storage event con la clave de un tope
  // tiene que cambiar la sesion de este marco, que es lo que lee la cola.
  const sync = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const fire = (key, value) => w.dispatchEvent(new w.StorageEvent('storage', { key, newValue: String(value) }));

    d.patchSession({ raceLimit: 0, timeLimit: 0, xpLimit: 0, dailyRaceLimit: 0, dailyXpLimit: 0, activeOn: false, activeStart: 8, activeEnd: 23 });
    fire('autoTyperRaceLimit', 50);
    fire('autoTyperTimeLimit', 30);
    fire('autoTyperXpLimit', 25000);
    fire('autoTyperDailyRaceLimit', 200);
    fire('autoTyperDailyXpLimit', 100000);
    fire('autoTyperActiveOn', '1');
    fire('autoTyperActiveStart', 9);
    fire('autoTyperActiveEnd', 18);
    const out = d.session();

    fire('autoTyperActiveOn', '0');
    d.patchSession({ raceLimit: 0, timeLimit: 0, xpLimit: 0, dailyRaceLimit: 0, dailyXpLimit: 0, activeOn: false, activeStart: 8, activeEnd: 23 });
    // No se toca localStorage: los topes de tiempo/XP guardados tienen que
    // seguir ahi para la prueba de recarga inmediatamente posterior.
    return out;
  })()`);

  check('limits sync from the other window without a reload',
    sync.raceLimit === 50 && sync.timeLimit === 30 && sync.xpLimit === 25000
      && sync.dailyRaceLimit === 200 && sync.dailyXpLimit === 100000, sync);
  check('active hours sync from the other window without a reload',
    sync.activeOn === true && sync.activeStart === 9 && sync.activeEnd === 18, sync);

  const race = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    shadow.querySelector('[data-field="raceLimitRow"]').click();
    return {
      label: shadow.querySelector('[data-field="limit"]').textContent,
      stored: w.localStorage.getItem('autoTyperRaceLimit'),
    };
  })()`);
  // La fila añade el ETA cuando hay tope: "25 · ≈18m".
  check('race limit cycles to 25, where the session bonus caps',
    String(race.label).startsWith('25') && race.stored === '25', race);

  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(panelReady, 15000, 'the panel after a reload');
  const reloaded = await cdp.evaluate(READ);
  check('time limit survives a reload', reloaded.timeLimit === '2h', reloaded.timeLimit);
  check('time-left row still visible after reload', reloaded.timeLeftShown === 'flex', reloaded.timeLeftShown);
  check('xp limit survives a reload', reloaded.xpLimit === '50k', reloaded.xpLimit);

  const s1 = await cdp.evaluate(READ);
  check('bot idle before pagehide', s1.foot === 'idle', s1.foot);

  await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    w.dispatchEvent(new w.Event('pagehide'));
  })()`);
  await sleep(800);
  const s2 = await cdp.evaluate(READ);
  check('pagehide stops the bot', s2.foot === 'waiting', s2.foot);

  await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    w.dispatchEvent(new w.PageTransitionEvent('pageshow', { persisted: true }));
  })()`);
  await sleep(900);
  const s3 = await cdp.evaluate(READ);
  check('pageshow from bfcache resumes the bot', s3.foot === 'idle', s3.foot);

  await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  })()`);
  await sleep(800);
  const s4 = await cdp.evaluate(READ);
  check('Escape stops the bot', s4.foot === 'waiting', s4.foot);

  await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    w.dispatchEvent(new w.Event('pagehide'));
    w.dispatchEvent(new w.PageTransitionEvent('pageshow', { persisted: true }));
  })()`);
  await sleep(900);
  const s5 = await cdp.evaluate(READ);
  check('a deliberate stop is not resumed by pageshow', s5.foot === 'waiting', s5.foot);

  // Comportamiento, no solo UI: se inyecta el popup que el juego pinta al
  // completar un challenge y se comprueba que el latido lo cierra solo.
  const challenge = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const doc = w.document;
    w.__challengeClicked = false;
    const box = doc.createElement('div');
    // Marcado real del juego: el overlay .race-results contiene la fila del
    // challenge, pero el boton de continuar cuelga del overlay, no de la fila.
    box.className = 'race-results';
    box.style.cssText = 'position:fixed;left:40px;top:40px;width:320px;height:160px;background:#111;z-index:99999';
    box.innerHTML = '<div class="raceResults--dailyChallenge"><h2>Daily Challenge complete!</h2><p>Typing 3 races without a mistake</p></div><button type="button">Continue</button>';
    box.querySelector('button').addEventListener('click', () => {
      w.__challengeClicked = true;
      box.remove();
    });
    doc.body.appendChild(box);
    await new Promise((resolve) => setTimeout(resolve, 4000));
    return { clicked: w.__challengeClicked === true, removed: !box.isConnected };
  })()`, true);
  check('daily challenge popup closes by itself', challenge.clicked && challenge.removed, challenge);

  // Si el popup ofrece Collect y Continue, se cobra. Cerrar con el boton
  // generico dejaria el premio sin reclamar.
  await sleep(6500);
  const challengeClaim = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const box = w.document.createElement('div');
    box.className = 'race-results';
    box.style.cssText = 'position:fixed;left:40px;top:40px;width:320px;height:160px;background:#111;z-index:99999';
    box.innerHTML = '<div class="raceResults--dailyChallenge"><h2>Daily Challenge complete!</h2></div>'
      + '<button type="button" data-k="continue">Continue</button>'
      + '<button type="button" data-k="collect">Collect</button>';
    w.__challengePicked = null;
    box.querySelector('[data-k="continue"]').addEventListener('click', () => { w.__challengePicked = 'continue'; box.remove(); });
    box.querySelector('[data-k="collect"]').addEventListener('click', () => { w.__challengePicked = 'collect'; box.remove(); });
    w.document.body.appendChild(box);
    await new Promise((resolve) => setTimeout(resolve, 4000));
    return { picked: w.__challengePicked, removed: !box.isConnected };
  })()`, true);
  check('a challenge popup claims instead of just closing when both buttons exist',
    challengeClaim.picked === 'collect' && challengeClaim.removed, challengeClaim);

  // Selector propio: el popup de prueba no tiene clase "challenge" ni ".modal",
  // asi que el barrido por defecto no lo ve. Solo se cierra si el selector
  // configurado manda. Se espera el cooldown de 6 s del cierre anterior.
  await sleep(6500);
  const custom = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const realPrompt = w.prompt;
    w.prompt = () => '#boss-modal';
    shadow.querySelector('[data-field="chRow"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true, shiftKey: true }));
    w.prompt = realPrompt;

    w.__customClicked = false;
    const box = w.document.createElement('div');
    box.id = 'boss-modal';
    box.style.cssText = 'position:fixed;left:40px;top:240px;width:320px;height:160px;background:#111;z-index:99999';
    box.innerHTML = '<h2>Daily Challenge complete!</h2><p>Win 3 races</p><button type="button">Collect</button>';
    box.querySelector('button').addEventListener('click', () => { w.__customClicked = true; box.remove(); });
    w.document.body.appendChild(box);

    await new Promise((resolve) => setTimeout(resolve, 4000));
    return {
      clicked: w.__customClicked === true,
      stored: w.localStorage.getItem('autoTyperChallengeSelector'),
      label: shadow.querySelector('[data-field="ch"]').textContent,
    };
  })()`, true);
  check('custom challenge selector reaches a popup the default scan ignores',
    custom.clicked && custom.stored === '#boss-modal' && custom.label === 'on · sel', custom);

  // Un selector roto no puede dejar el popup sin cerrar: se avisa una vez y se
  // vuelve al barrido por texto.
  await sleep(6500);
  const fallback = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const realPrompt = w.prompt;
    w.prompt = () => '###';
    shadow.querySelector('[data-field="chRow"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true, shiftKey: true }));
    w.prompt = realPrompt;

    w.__fallbackClicked = false;
    const box = w.document.createElement('div');
    box.className = 'modal';
    box.style.cssText = 'position:fixed;left:40px;top:440px;width:320px;height:160px;background:#111;z-index:99999';
    box.innerHTML = '<h2>Daily Challenge complete!</h2><button type="button">Continue</button>';
    box.querySelector('button').addEventListener('click', () => { w.__fallbackClicked = true; box.remove(); });
    w.document.body.appendChild(box);

    await new Promise((resolve) => setTimeout(resolve, 4000));

    // Se limpia el selector roto para no dejar el panel con un CSS invalido.
    w.prompt = () => '';
    shadow.querySelector('[data-field="chRow"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true, shiftKey: true }));
    w.prompt = realPrompt;
    return {
      clicked: w.__fallbackClicked === true,
      stored: w.localStorage.getItem('autoTyperChallengeSelector'),
      label: shadow.querySelector('[data-field="ch"]').textContent,
    };
  })()`, true);
  check('invalid selector falls back to text detection',
    fallback.clicked && fallback.stored === '' && fallback.label === 'on', fallback);

  // El reto de stickers: mientras `racesWithSticker` siga pendiente, la
  // politica deja de sortear el 35% y manda uno en cada carrera. Las
  // definiciones viven en la ventana de arriba; el tipador corre en un iframe.
  const stickerChallenge = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const oldFrame = w.NTGLOBALS;
    const oldTop = w.top.NTGLOBALS;
    const oldLedger = w.top.__ntaStickerBoost;
    const oldStore = w.localStorage.getItem('persist:nt');
    delete w.top.__ntaStickerBoost;
    const expires = Math.floor(Date.now() / 1000) + 3600;
    w.NTGLOBALS = null;
    w.top.NTGLOBALS = {
      CHALLENGES: [
        { challengeID: 9901, type: 'race', goal: 5, expiration: expires },
        { challengeID: 9902, type: 'accuracy', goal: 100, expiration: expires },
        { challengeID: 9903, type: 'nitro', goal: 3, expiration: expires },
        { challengeID: 9911, type: 'racesWithSticker', goal: 10, expiration: expires },
      ],
      CHALLENGE_TYPES: {
        race: ['Races', 'race'],
        accuracy: ['Accuracy', 'accuracy'],
        nitro: ['Nitro', 'nitro'],
        racesWithSticker: ['Races with a Sticker', 'Race'],
      },
    };
    const seed = (progress) => w.localStorage.setItem('persist:nt', JSON.stringify({
      user: JSON.stringify({ challenges: [
        { challengeID: 9901, progress: 1 },
        { challengeID: 9902, progress: 10 },
        { challengeID: 9903, progress: 1 },
        { challengeID: 9911, progress },
      ] }),
    }));
    seed(4);
    w.__ntaDebug.refreshChallenges();
    const pending = w.__ntaDebug.stickerChallengePending();
    const plan = w.__ntaDebug.stickerBoostPlan();
    for (let i = 0; i < 6; i += 1) w.__ntaDebug.stickerBoostSent();
    const capped = w.__ntaDebug.stickerBoostPlan();
    seed(10);
    w.__ntaDebug.refreshChallenges();
    const done = w.__ntaDebug.stickerChallengePending();

    w.NTGLOBALS = oldFrame;
    if (oldTop === undefined) delete w.top.NTGLOBALS;
    else w.top.NTGLOBALS = oldTop;
    if (oldStore === null) w.localStorage.removeItem('persist:nt');
    else w.localStorage.setItem('persist:nt', oldStore);
    if (oldLedger === undefined) delete w.top.__ntaStickerBoost;
    else w.top.__ntaStickerBoost = oldLedger;
    w.__ntaDebug.refreshChallenges();
    return {
      pending,
      done,
      firstRemaining: plan && plan.remaining,
      capped: Boolean(capped && capped.boost === false && capped.remaining === 0),
    };
  })()`, true);
  check('sticker challenge is found outside the visible three and stops at its local cap',
    stickerChallenge.pending === true && stickerChallenge.done === false
      && stickerChallenge.firstRemaining === 6 && stickerChallenge.capped === true,
    stickerChallenge);

  // El aviso de sesion real recarga la app al pulsar; aqui el boton es falso,
  // pero el latido debe encontrarlo y pulsarlo sin tocar la sesion.
  const sessionWarning = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    try { w.top.__ntaSessionKickAt = 0; } catch { /* otro origen */ }
    w.__sessionWarningClicked = false;
    const box = w.document.createElement('div');
    box.className = 'modal';
    box.style.cssText = 'position:fixed;left:40px;top:640px;width:320px;height:160px;background:#111;z-index:99999';
    box.innerHTML = '<h3>Logout Warning</h3><p>Your session will expire soon. Do you want to stay logged in?</p>'
      + '<button type="button">Yes, I' + String.fromCharCode(39) + 'm here!</button>';
    const button = box.querySelector('button');
    button.addEventListener('click', () => { w.__sessionWarningClicked = true; box.remove(); });
    w.document.body.appendChild(box);
    await new Promise((resolve) => setTimeout(resolve, 4000));
    return { clicked: w.__sessionWarningClicked === true, removed: !box.isConnected };
  })()`, true);
  check('session warning is answered automatically',
    sessionWarning.clicked && sessionWarning.removed, sessionWarning);

  // El marcado real puede cambiar: apostrofo tipografico, boton <input> o un
  // aviso sin la clase .modal. El buscador tiene que encontrarlo igual.
  const warningVariants = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    if (!d.sessionWarningButton) return { hasHook: false };

    const find = (html) => {
      const box = w.document.createElement('div');
      box.style.cssText = 'position:fixed;left:40px;top:400px;width:360px;height:180px;background:#111;z-index:99999';
      box.innerHTML = html;
      w.document.body.appendChild(box);
      const found = d.sessionWarningButton(w.document);
      const out = {
        found: Boolean(found),
        label: found ? String(found.value || found.textContent || '').trim() : null,
      };
      box.remove();
      return out;
    };

    return {
      hasHook: true,
      curly: find('<h3>Logout Warning</h3><p>Your session will expire soon.</p>'
        + '<button type="button">Yes, I&rsquo;m here!</button>'),
      input: find('<p>Your session will expire soon.</p>'
        + '<input type="button" value="Yes, I&apos;m here!">'),
      plain: find('<p>Logout Warning: the session will expire soon.</p>'
        + '<button type="button">Yes, I am here!</button>'),
    };
  })()`);
  check('session warning: finds the button with a typographic apostrophe',
    warningVariants.hasHook && warningVariants.curly.found, warningVariants);
  check('session warning: finds an input-button warning',
    warningVariants.hasHook && warningVariants.input.found, warningVariants);
  check('session warning: finds it without a .modal wrapper',
    warningVariants.hasHook && warningVariants.plain.found, warningVariants);

  // Si el aviso se desmonta antes del clic, el enfriamiento compartido no puede
  // quedarse 15 s: un aviso nuevo tiene que poder programarse otra vez.
  const kickReset = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    if (!d.sessionWarningHandle || !d.sessionKick || !d.sessionKickReset) return { hasHook: false };

    d.sessionKickReset();
    const box = w.document.createElement('div');
    box.style.cssText = 'position:fixed;left:40px;top:300px;width:360px;height:180px;background:#111;z-index:99999';
    box.innerHTML = '<h3>Logout Warning</h3><p>Your session will expire soon.</p>'
      + '<button type="button">Yes, I&rsquo;m here!</button>';
    w.document.body.appendChild(box);

    const handled = d.sessionWarningHandle();
    const scheduled = d.sessionKick();
    box.remove();
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const after = d.sessionKick();
    d.sessionKickReset();
    return { hasHook: true, handled, scheduled, after };
  })()`, true);
  check('session warning: a vanished button releases the shared cooldown',
    kickReset.hasHook && kickReset.handled === true
      && kickReset.scheduled.pending === true
      && kickReset.after.pending === false
      && kickReset.after.local === 0 && kickReset.after.shared === 0,
    kickReset);

  // La calibracion lee el API: se sustituye fetch por una respuesta con las
  // medias de la cuenta y se fuerza una lectura con la fila auto. La fila ya no
  // apaga nada: solo adelanta el refresco.
  const calibration = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const realFetch = w.fetch;
    w.fetch = (url, options) => {
      if (String(url).includes('/api/v2/stats/summary')) {
        return Promise.resolve(new w.Response(
          JSON.stringify({ success: true, data: { stats: {
            wpm: 112.4, accuracy: 98.7, highestSpeed: 230, racesPlayed: 48756,
          } } }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ));
      }
      return realFetch(url, options);
    };
    try {
      const row = shadow.querySelector('[data-field="calRow"]');
      row.click();
      row.click();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return {
        range: shadow.querySelector('[data-field="calWpm"]').textContent,
        acc: shadow.querySelector('[data-field="calAcc"]').textContent,
        account: shadow.querySelector('[data-field="calAccount"]').textContent,
        paceSource: shadow.querySelector('[data-field="paceSource"]').textContent,
        auto: w.__ntaDebug.calibrationAuto(),
        autoText: shadow.querySelector('[data-field="cal"]').textContent,
        stored: JSON.parse(w.localStorage.getItem('autoTyperCalibratedRange') || 'null'),
        storedAcc: JSON.parse(w.localStorage.getItem('autoTyperCalibratedAccuracy') || 'null'),
        logWpm: shadow.querySelector('[data-field="calLogWpm"]').textContent,
        logWhen: shadow.querySelector('[data-field="calLogWhen"]').textContent,
      };
    } finally {
      w.fetch = realFetch;
    }
  })()`, true);
  check('wpm calibration applies the account average',
    calibration.range === '106-118' && calibration.stored && calibration.stored.min === 106 && calibration.stored.max === 118,
    calibration);
  check('accuracy calibration applies the account average',
    calibration.acc === '98-99%' && calibration.storedAcc && calibration.storedAcc.min === 98 && calibration.storedAcc.max === 99,
    calibration);
  check('LOG shows the last calibration',
    calibration.logWpm === '106-118 WPM' && calibration.logWhen !== 'never', calibration);
  check('panel shows the account average',
    calibration.account === '112.4 WPM · 98.7%', calibration);
  check('auto pace cannot be switched off from the panel',
    calibration.auto === true && calibration.autoText === 'on', calibration);
  check('Live shows the auto pace and the account top WPM',
    calibration.paceSource === 'auto · 112 avg · 230 top', calibration.paceSource);

  // La media de una cuenta principiante tambien manda: 30 WPM no puede caer
  // en el 40+ del suelo viejo, y 43 WPM tiene que quedar centrado en 43.
  const paceMath = await cdp.evaluate(`(() => {
    const d = document.querySelector('iframe').contentWindow.__ntaDebug;
    return { low: d.paceRangeFor(30), mid: d.paceRangeFor(43), high: d.paceRangeFor(112) };
  })()`);
  check('the target range follows a beginner account average',
    paceMath.low && paceMath.low.min === 26 && paceMath.low.max === 34, paceMath.low);
  check('the target range follows the 43 WPM example',
    paceMath.mid && paceMath.mid.min === 37 && paceMath.mid.max === 49, paceMath.mid);
  check('the target range still wraps a 112 WPM account',
    paceMath.high && paceMath.high.min === 106 && paceMath.high.max === 118, paceMath.high);

  // Respaldo: si el API responde 200 sin medias (solo contadores), la media
  // sale de `persist:nt`, que es lo que el garaje pinta en el perfil. La fila
  // auto solo adelanta la lectura; no cambia el modo.
  const persisted = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const realFetch = w.fetch;
    w.fetch = (url, options) => {
      if (String(url).includes('/api/v2/stats/summary')) {
        return Promise.resolve(new w.Response(
          JSON.stringify({ success: true, data: {} }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ));
      }
      return realFetch(url, options);
    };
    w.localStorage.setItem('persist:nt', JSON.stringify({
      user: JSON.stringify({ avgSpeed: 108.2, avgAcc: 97.4 }),
    }));
    try {
      const row = shadow.querySelector('[data-field="calRow"]');
      row.click();
      row.click();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return {
        range: shadow.querySelector('[data-field="calWpm"]').textContent,
        acc: shadow.querySelector('[data-field="calAcc"]').textContent,
        stored: JSON.parse(w.localStorage.getItem('autoTyperCalibratedRange') || 'null'),
        storedAcc: JSON.parse(w.localStorage.getItem('autoTyperCalibratedAccuracy') || 'null'),
      };
    } finally {
      w.fetch = realFetch;
      w.localStorage.removeItem('persist:nt');
    }
  })()`, true);
  check('calibration falls back to persist:nt when the API has no averages',
    persisted.range === '102-114' && persisted.acc === '96-98%'
      && persisted.stored && persisted.stored.min === 102 && persisted.stored.max === 114
      && persisted.storedAcc && persisted.storedAcc.min === 96 && persisted.storedAcc.max === 98,
    persisted);

  const accuracy = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const series = JSON.parse(w.localStorage.getItem('dynamicAccuracies') || '[]');
    return series.length ? { min: Math.min(...series), max: Math.max(...series) } : { min: null, max: null };
  })()`);
  // La serie se muestrea dentro del rango: pedir que toque los dos extremos
  // exactos hacia fallar cuando la muestra caia toda en 96-97.
  check('accuracy series stays inside the calibrated range',
    accuracy.min >= 96 && accuracy.max <= 98, accuracy);

  // Progreso de challenges: se siembra persist:nt y NTGLOBALS como los deja el
  // juego y se espera a que expire la cache de 5 s.
  const challenges = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const soon = Math.floor(Date.now() / 1000) + 3600;
    w.NTGLOBALS = {
      CHALLENGES: [
        { challengeID: 1, type: 1, goal: 3, expiration: soon },
        { challengeID: 2, type: 2, goal: 100, expiration: soon },
        { challengeID: 3, type: 3, goal: 1, expiration: soon },
      ],
      CHALLENGE_TYPES: {
        1: ['Complete \${goal} \${field}', 'race'],
        2: ['Type \${goal} \${field}', 'word'],
        3: ['Use \${goal} \${field}', 'nitro'],
      },
    };
    w.localStorage.setItem('persist:nt', JSON.stringify({
      user: JSON.stringify({
        avgSpeed: 108.2,
        avgAcc: 97.4,
        challenges: [
          { challengeID: 1, progress: 3 },
          { challengeID: 2, progress: 40 },
          { challengeID: 3, progress: 1 },
        ],
      }),
    }));

    await new Promise((resolve) => setTimeout(resolve, 6000));
    return {
      count: shadow.querySelector('[data-field="chCount"]').textContent,
      rows: shadow.querySelector('[data-field="chList"]').children.length,
      text: shadow.querySelector('[data-field="chList"]').textContent,
    };
  })()`, true);
  check('LOG shows the daily challenge progress',
    challenges.count === '2/3' && challenges.rows === 3 && /40\/100/.test(challenges.text), challenges);

  // Un reto que cruza su meta deja un aviso en el LOG. La primera lectura solo
  // siembra: el aviso tiene que salir del salto 4/5 -> 5/5, no de la carga.
  const challengeNotice = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const soon = Math.floor(Date.now() / 1000) + 3600;
    w.NTGLOBALS = {
      CHALLENGES: [
        { challengeID: 21, type: 1, goal: 5, expiration: soon },
        { challengeID: 22, type: 2, goal: 100, expiration: soon },
      ],
      CHALLENGE_TYPES: {
        1: ['Finish \${goal} \${field}', 'race'],
        2: ['Reach \${goal}% accuracy', 'accuracy'],
      },
    };
    const seed = (races) => w.localStorage.setItem('persist:nt', JSON.stringify({
      user: JSON.stringify({ challenges: [
        { challengeID: 21, progress: races },
        { challengeID: 22, progress: 100 },
      ] }),
    }));
    seed(4);
    w.__ntaDebug.refreshChallenges();
    seed(5);
    w.__ntaDebug.refreshChallenges();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    let dayKeys = 0;
    for (let i = 0; i < w.localStorage.length; i++) {
      const key = w.localStorage.key(i);
      if (!key || !key.startsWith('ntQueue:todayPart:')) continue;
      try {
        const part = JSON.parse(w.localStorage.getItem(key));
        if (part && Array.isArray(part.chKeys) && part.chKeys.includes('21')) dayKeys += 1;
      } catch { /* parte ilegible */ }
    }
    return {
      text: shadow.querySelector('[data-field="noticeList"]').textContent,
      count: shadow.querySelector('[data-field="chCount"]').textContent,
      dayKeys,
    };
  })()`, true);
  check('a completed daily challenge lands in the notice log',
    /Daily Challenge complete/.test(challengeNotice.text)
      && /Finish 5 races/.test(challengeNotice.text)
      && challengeNotice.count === '2/2', challengeNotice);
  check('a completed challenge is counted for the day',
    challengeNotice.dayKeys > 0, challengeNotice);

  // Aviso de calibracion a mitad de sesion: se restaura una tanda de 14
  // carreras y se fuerza una calibracion que mueve el rango (120 -> 113-120).
  // El aviso tiene que quedar en el anillo de LOG, que es donde se ve.
  await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    w.localStorage.setItem('autoTyperSessionCounters', JSON.stringify({
      races: 14,
      sumRaces: 14,
      sumWpm: 1540,
      sumTarget: 1540,
      sumAcc: 1372,
      tandaStartedAt: Date.now() - 3600000,
      at: Date.now(),
    }));
  })()`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(panelReady, 15000, 'the panel after the counters reload');

  const midSession = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const realFetch = w.fetch;
    w.fetch = (url, options) => {
      if (String(url).includes('/api/v2/stats/summary')) {
        return Promise.resolve(new w.Response(
          JSON.stringify({ success: true, data: { stats: { wpm: 120, accuracy: 97 } } }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ));
      }
      return realFetch(url, options);
    };
    try {
      const row = shadow.querySelector('[data-field="calRow"]');
      row.click();
      row.click();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return {
        notices: shadow.querySelector('[data-field="noticeList"]').textContent,
        range: shadow.querySelector('[data-field="calWpm"]').textContent,
      };
    } finally {
      w.fetch = realFetch;
    }
  })()`, true);
  check('mid-session calibration move is announced in LOG',
    /mid-session \(race 14\)/.test(midSession.notices) && midSession.range === '113-120', midSession);

  // Dedupe de model Δ: la misma carrera emite varios `update` (cada llegada y
  // los premios). Se monta un `server` falso con el enganche de React que usa el
  // juego y se emite el mismo paquete de meta dos veces. La muestra crece una
  // vez; una carrera nueva, con otro completeStamp, suma otra.
  const dedupe = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const read = () => {
      try { return JSON.parse(w.localStorage.getItem('autoTyperAccDeltas') || '[]'); } catch { return []; }
    };
    const before = read();

    const host = w.document.createElement('div');
    host.id = 'raceContainer';
    w.document.body.appendChild(host);

    const listeners = [];
    const server = {
      on(name, fn) { if (name === 'update') listeners.push(fn); },
      off(name, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
      emit(event) { for (const fn of listeners.slice()) fn(event); },
    };
    host['__reactFiber$dedupe'] = {
      stateNode: { server, props: { user: { userID: 4242 } } },
      return: null,
    };

    w.__ntaDebug.seedRaceCounters({
      chars: 200, errors: 4, correct: 180, nitroChars: 0,
      startedAt: Date.now() - 30000,
    });
    w.__ntaDebug.watchRaceResults();   // engancha el server falso sin esperar al latido

    const racer = (stamp) => ({
      userID: 4242,
      username: 'harness',
      progress: { completeStamp: stamp, typed: 200, skipped: 0, errors: 4 },
    });
    const update = (stamp) => ({ racers: [racer(stamp)] });

    server.emit(update(1111));
    server.emit(update(1111));
    await new Promise((resolve) => setTimeout(resolve, 60));
    const afterSame = read();

    // Carrera nueva: otro startedAt y otro completeStamp. Debe sumar otra.
    w.__ntaDebug.seedRaceCounters({
      chars: 200, errors: 2, correct: 190, nitroChars: 0,
      startedAt: Date.now() - 20000,
    });
    server.emit(update(2222));
    await new Promise((resolve) => setTimeout(resolve, 60));
    const afterNew = read();

    host.remove();
    return {
      before: before.length,
      afterSame: afterSame.length,
      afterNew: afterNew.length,
      last: afterNew[afterNew.length - 1],
    };
  })()`, true);

  check('model Δ samples repeated updates of one race once',
    dedupe.afterSame === dedupe.before + 1, dedupe);
  check('model Δ samples the next race separately',
    dedupe.afterNew === dedupe.afterSame + 1, dedupe);

  // La media de la tanda tiene que seguir al WPM oficial aunque el paquete
  // llegue tras una recarga: entre carrera y carrera la cola cambia de pagina,
  // asi que una variable en memoria no basta para casar la correccion.
  const serverAvg = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    d.seedHistory([]);
    d.seedRaceCounters({
      chars: 350, errors: 3, correct: 347, nitroChars: 0, startedAt: Date.now() - 65000,
    });
    d.recordRace();
    const rows = JSON.parse(w.localStorage.getItem('autoTyperRaceHistory') || '[]');
    return {
      before: d.sessionTotals(),
      at: rows[rows.length - 1].at,
      model: rows[rows.length - 1].wpm,
    };
  })()`);
  check('recordRace keeps what each race contributes to the average',
    serverAvg.before.ledger.length === 1
      && serverAvg.before.ledger[0].at === serverAvg.at
      && serverAvg.before.ledger[0].wpm === serverAvg.model, serverAvg);

  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(panelReady, 15000, 'the panel after the average reload');

  const serverAvgAfter = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const applied = d.serverWpm(70, 'avg:1');
    const rows = JSON.parse(w.localStorage.getItem('autoTyperRaceHistory') || '[]');
    return {
      applied,
      totals: d.sessionTotals(),
      rowWpm: rows[rows.length - 1] && rows[rows.length - 1].wpm,
    };
  })()`);
  const avgDelta = serverAvgAfter.totals.sumWpm - serverAvg.before.sumWpm;
  check('the official WPM corrects the session average after a reload',
    serverAvgAfter.applied === true && serverAvgAfter.rowWpm === 70
      && Math.abs(avgDelta - (70 - serverAvg.model)) <= 0.05
      && serverAvgAfter.totals.ledger[0].wpm === 70,
    { serverAvg, serverAvgAfter, avgDelta });
  check('the reported average matches the corrected sum',
    Math.abs(serverAvgAfter.totals.avg
      - serverAvgAfter.totals.sumWpm / serverAvgAfter.totals.sumRaces) <= 0.02,
    serverAvgAfter.totals);

  // Una tanda nueva empieza con la media y su libro a cero: sumWpmLedger es
  // parte del mismo numero y no puede quedarse con aportaciones de la anterior.
  const freshLedger = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    d.seedHistory([]);
    d.seedRaceCounters({
      chars: 350, errors: 3, correct: 347, nitroChars: 0, startedAt: Date.now() - 65000,
    });
    d.recordRace();
    const before = d.sessionTotals();
    d.freshTanda('bench');
    const after = d.sessionTotals();
    d.seedHistory([]);
    return { before, after };
  })()`);
  check('a fresh session resets the average and its ledger together',
    freshLedger.before.ledger.length >= 1
      && freshLedger.after.ledger.length === 0
      && freshLedger.after.sumWpm === 0 && freshLedger.after.sumRaces === 0,
    freshLedger);

  // Un paquete repetido para una carrera que ya lleva el oficial no puede
  // quedar aparcado: al registrar la siguiente se estamparia en su fila.
  const staleServerWpm = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    d.seedHistory([]);
    d.seedRaceCounters({
      chars: 350, errors: 3, correct: 347, nitroChars: 0, startedAt: Date.now() - 65000,
    });
    d.recordRace();
    const first = d.serverWpm(70, 'dup:1');
    const second = d.serverWpm(65, 'dup:2');

    d.seedRaceCounters({
      chars: 350, errors: 3, correct: 347, nitroChars: 0, startedAt: Date.now() - 65000,
    });
    d.recordRace();
    const rows = JSON.parse(w.localStorage.getItem('autoTyperRaceHistory') || '[]');
    const row = rows[rows.length - 1] || {};
    d.seedHistory([]);
    return {
      first,
      second,
      wpm: row.wpm,
      serverWpm: row.serverWpm === undefined ? null : row.serverWpm,
    };
  })()`);
  check('a repeated packet does not leak into the next race',
    staleServerWpm.first === true && staleServerWpm.second === false
      && staleServerWpm.serverWpm === null
      && Math.abs(staleServerWpm.wpm - 64.6) <= 0.3,
    staleServerWpm);

  // La calibracion del ritmo se cierra con el WPM del modelo, pero el oficial
  // de esa misma carrera llega despues: debe rehacerla desde la base, no
  // apilar una segunda correccion sobre la primera.
  const trimCalibration = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    d.patchSession({ trim: 1 });
    d.seedHistory([]);
    d.seedRaceCounters({
      chars: 350, errors: 3, correct: 347, nitroChars: 0, startedAt: Date.now() - 65000,
    });
    d.recordRace();
    const model = d.clock().wpm;
    const before = d.trimState();
    const withModel = d.autocalibrate();
    const pending = JSON.parse(w.localStorage.getItem('autoTyperSessionCounters') || '{}');

    // La cola avanza la serie al cerrar, antes del paquete: hay que reproducir
    // ese cambio para que la re-derivacion no use el objetivo de la siguiente.
    let advanced = d.trimState().target;
    for (let i = 0; i < 7 && advanced === withModel.target; i++) {
      advanced = d.advanceSessions().target;
    }

    // Un oficial muy por encima del objetivo separa la correccion correcta de
    // la que usaria el objetivo nuevo.
    const official = Math.round(before.target * 1.25 * 10) / 10;
    const accepted = d.serverWpm(official, 'trim:1');
    const after = d.trimState();
    const saved = JSON.parse(w.localStorage.getItem('autoTyperSessionCounters') || '{}');
    d.seedHistory([]);
    d.patchSession({ trim: 1 });
    return { model, before, withModel, pending, advanced, official, accepted, after, saved };
  })()`);
  const trimExpectedModel = Math.min(1.1, Math.max(trimCalibration.before.min,
    trimCalibration.before.trim
      * Math.pow(trimCalibration.model / trimCalibration.before.target, 0.35)));
  const trimExpectedOfficial = Math.min(1.1, Math.max(trimCalibration.before.min,
    trimCalibration.before.trim
      * Math.pow(trimCalibration.official / trimCalibration.before.target, 0.35)));
  check('the trim correction starts from the model WPM and saves its base',
    Math.abs(trimCalibration.withModel.trim - trimExpectedModel) <= 0.002
      && Math.abs(trimCalibration.withModel.applied - trimCalibration.withModel.trim) <= 0.001
      && trimCalibration.pending.trimAt === trimCalibration.withModel.at
      && trimCalibration.pending.trimBase === trimCalibration.before.trim,
    trimCalibration);
  check('the official WPM replaces the model trim correction using its own target',
    trimCalibration.accepted === true
      && trimCalibration.advanced !== trimCalibration.before.target
      && trimCalibration.after.targetAt === trimCalibration.before.target
      && Math.abs(trimCalibration.after.trim - trimExpectedOfficial) <= 0.002
      && trimCalibration.after.at === 0
      && trimCalibration.saved.trimAt === 0,
    trimCalibration);

  // El cierre dice como va el dia solo cuando hay presupuesto: sin topes la
  // linea no debe crecer con un contador que no decide nada.
  const stopSummary = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    d.patchSession({ dailyRaceLimit: 100, dailyXpLimit: 50000 });
    d.setDailyCounts(80, 40000);
    d.seedHistory([]);
    d.seedRaceCounters({
      chars: 350, errors: 3, correct: 347, nitroChars: 0, startedAt: Date.now() - 65000,
    });
    d.recordRace();
    const withBudget = d.tandaSummary();
    d.patchSession({ dailyRaceLimit: 0, dailyXpLimit: 0 });
    const withoutBudget = d.tandaSummary();
    d.clearDailyCounts();
    d.seedHistory([]);
    return { withBudget, withoutBudget };
  })()`);
  check('the closing summary carries the daily budget when there is one',
    /avg /.test(stopSummary.withBudget)
      && stopSummary.withBudget.includes('today 80/100 races · 40,000/50,000 XP')
      && (stopSummary.withBudget.match(/today/g) || []).length === 1
      && !/today/.test(stopSummary.withoutBudget),
    stopSummary);

  // WPM oficial del paquete de meta: el servidor manda su propio reloj, asi
  // que el numero no depende del tick del HUD. La fila del historial debe
  // guardarlo junto al modelo y no duplicarlo con los update repetidos.
  const serverWpm = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const doc = w.document;

    doc.querySelectorAll('#raceContainer').forEach((node) => node.remove());
    const host = doc.createElement('div');
    host.id = 'raceContainer';
    doc.body.appendChild(host);

    const listeners = [];
    const server = {
      on(name, fn) { if (name === 'update') listeners.push(fn); },
      off(name, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
      emit(event) { for (const fn of listeners.slice()) fn(event); },
    };
    host['__reactFiber$wpm'] = {
      stateNode: { server, props: { user: { userID: 4242 } } },
      return: null,
    };

    const out = {};
    out.computed = d.progressWpm({ completeStamp: 9000000, startStamp: 8940000, typed: 350, skipped: 0 });
    out.missingClock = d.progressWpm({ completeStamp: 9000000, typed: 350, skipped: 0 });

    d.patchSession({ raceLimit: 0, timeLimit: 0, xpLimit: 0 });
    // Reloj del modelo 5 s largo a proposito: el paquete oficial (60 s) debe
    // pasar a ser el valor principal y el modelo quedar como referencia.
    d.seedRaceCounters({
      chars: 350, errors: 3, correct: 347, nitroChars: 0, startedAt: Date.now() - 65000,
    });
    d.recordRace();
    d.watchRaceResults();

    const racer = {
      userID: 4242,
      username: 'harness',
      progress: { completeStamp: 9000000, startStamp: 8940000, typed: 350, skipped: 0, errors: 3 },
    };
    server.emit({ racers: [racer] });
    await new Promise((resolve) => setTimeout(resolve, 80));
    server.emit({ racers: [racer] });
    await new Promise((resolve) => setTimeout(resolve, 80));

    const last = (() => {
      try {
        const list = JSON.parse(w.localStorage.getItem('autoTyperRaceHistory') || '[]');
        return list[list.length - 1] || null;
      } catch { return null; }
    })();

    out.serverWpm = last && last.serverWpm;
    out.wpm = last && last.wpm;
    out.modelWpm = last && last.modelWpm;
    out.progressKeys = Object.keys(d.lastProgress() || {}).sort().join(',');

    // La fila de la ultima carrera debe pintar el oficial junto al modelo, y
    // hacerlo al llegar el paquete (no en la carrera siguiente).
    const shadow = doc.getElementById('nt-autotyper-panel').shadowRoot;
    const row = shadow.querySelector('[data-field="history"] .hist-row');
    out.rowWpm = row && row.querySelector('.wpm') ? row.querySelector('.wpm').textContent.trim() : '';
    out.rowModel = row && row.querySelector('.model') ? row.querySelector('.model').textContent.trim() : null;
    out.rowTitle = row ? row.getAttribute('title') : '';

    host.remove();
    return out;
  })()`, true);

  check('server WPM comes from the packet clock',
    serverWpm.computed === 70, serverWpm);
  check('server WPM stays empty when the packet has no start clock',
    serverWpm.missingClock === null, serverWpm.missingClock);
  check('the official WPM becomes the race row value',
    serverWpm.wpm === 70 && serverWpm.serverWpm === 70
      && Math.abs(serverWpm.modelWpm - 64.6) <= 0.3, serverWpm);
  check('the completion packet keeps its fields for inspection',
    /(^|,)startStamp(,|$)/.test(serverWpm.progressKeys), serverWpm.progressKeys);
  check('the last-race card paints the official WPM with the model beside it',
    serverWpm.rowModel === 'model 64.6' && serverWpm.rowWpm.startsWith('70.0')
      && /server 70\.0 wpm \(packet clock\)/.test(serverWpm.rowTitle), serverWpm);

  // La mini-grafica vive en la tarjeta LIVE y se actualiza al mismo tiempo que
  // el promedio. Tras el dedupe hay al menos dos muestras: debe tener linea y
  // area cerrada, no quedarse en el estado vacio.
  const spark = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const svg = s.querySelector('[data-field="accSpark"]');
    const line = s.querySelector('[data-field="accSparkLine"]');
    const area = s.querySelector('[data-field="accSparkArea"]');
    return {
      empty: svg && svg.dataset.empty,
      points: line && line.getAttribute('points'),
      area: area && area.getAttribute('d'),
      aria: svg && svg.getAttribute('aria-label'),
    };
  })()`);
  check('model delta sparkline draws the samples',
    spark.empty === '0' && (spark.points || '').includes(',')
      && (spark.points || '').split(' ').length >= 2
      && (spark.area || '').startsWith('M0,24 L')
      && (spark.aria || '').includes('Accuracy model delta history'), spark);

  // Auditoria de los tres topes en sus bordes: por debajo, justo en el tope y
  // por encima. Se mueven los contadores de la tanda con el gancho del banco y
  // se lee lo que el propio script decide, no una copia de la regla.
  const caps = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const text = (field) => {
      const el = shadow.querySelector('[data-field="' + field + '"]');
      return el ? (el.textContent || '').trim() : '';
    };

    const out = {};

    d.patchSession({ raceLimit: 2, races: 1, timeLimit: 0, xpLimit: 0, xp: 0, tandaStartedAt: 0 });
    out.raceBelow = d.session();
    d.patchSession({ races: 2 });
    out.raceAt = d.session();
    d.patchSession({ races: 3 });
    out.raceOver = d.session();
    out.raceText = text('races');

    d.patchSession({ raceLimit: 0, xpLimit: 5000, xp: 4999 });
    out.xpBelow = d.session();
    d.patchSession({ xp: 5000 });
    out.xpAt = d.session();
    d.patchSession({ xp: 5120 });
    out.xpOver = d.session();
    out.xpTotalText = text('xpTotal');

    d.patchSession({ xp: 4000, races: 10 });
    out.xpEtaText = text('xpTotal');
    out.xpEtaTitle = shadow.querySelector('[data-field="xpRow"]').title;

    // Ritmo de la tanda: 11.000 XP en 30 minutos son 22.0k XP/h.
    d.patchSession({ xp: 11000, tandaStartedAt: Date.now() - 30 * 60000 });
    out.rateText = text('rate');
    out.rateTitle = shadow.querySelector('[data-field="rate"]').title;
    d.patchSession({ xp: 0, tandaStartedAt: 0 });

    // Nitro: la tanda lleva 3 carreras con nitro de 10 y 29 caracteres. La
    // fila resume la tanda; el tooltip conserva el detalle de la ultima.
    d.seedHistory([{
      wpm: 104, acc: 97.5, target: 104, at: Date.now(),
      nitroWords: 1, nitroChars: 11,
    }]);
    d.patchSession({ races: 10, nitroRaces: 3, nitroCharsTotal: 29 });
    out.nitroText = text('nitro');
    out.nitroTitle = shadow.querySelector('[data-field="nitro"]').title;
    out.nitroDeltaMissing = text('nitroDelta');

    // Dos carreras con nitro (104 y 103 de media 103.5) contra dos sin nitro
    // (104 y 106 de media 105): la diferencia es -1.5 WPM, que no es subida.
    d.seedHistory([
      { wpm: 104, acc: 97, target: 104, at: Date.now(), nitroWords: 1, nitroChars: 11 },
      { wpm: 103, acc: 97, target: 104, at: Date.now(), nitroWords: 1, nitroChars: 9 },
      { wpm: 104, acc: 97, target: 104, at: Date.now() },
      { wpm: 106, acc: 97, target: 104, at: Date.now() },
    ]);
    d.patchSession({ races: 10, nitroRaces: 3, nitroCharsTotal: 29 });
    out.nitroDeltaText = text('nitroDelta');
    out.nitroDeltaTitle = shadow.querySelector('[data-field="nitroDelta"]').title;
    out.nitroDeltaGood = shadow.querySelector('[data-field="nitroDelta"]').dataset.good;

    // El signo positivo tambien se mide y se marca en ambar, sin esconderlo.
    d.seedHistory([
      { wpm: 108, acc: 97, target: 104, at: Date.now(), nitroWords: 1, nitroChars: 11 },
      { wpm: 104, acc: 97, target: 104, at: Date.now() },
    ]);
    d.patchSession({ races: 10, nitroRaces: 3, nitroCharsTotal: 29 });
    out.nitroDeltaRiseText = text('nitroDelta');
    out.nitroDeltaRiseGood = shadow.querySelector('[data-field="nitroDelta"]').dataset.good;
    d.seedHistory([]);

    // Hueco entre carreras: 4 s, 5 s y 6 s. La mediana es 5.0 y el mejor 4.0.
    d.seedGaps([4000, 6000, 5000]);
    out.cycleText = text('cycle');
    out.cycleTitle = shadow.querySelector('[data-field="cycle"]').title;
    d.seedGaps([]);

    // XP de una carrera: 480 de puesto + 220 de velocidad (110 WPM) + 50 de
    // precision (98%) + 250 de sesion/otros = 1.000.
    d.seedHistory([{
      wpm: 110, acc: 98, target: 104, at: Date.now(), place: 1, xp: 1000,
    }]);
    d.patchSession({ races: 1 });
    out.xpBreakText = text('xpBreak');
    out.xpBreakTitle = shadow.querySelector('[data-field="xpBreak"]').title;
    d.seedHistory([]);

    // Presupuesto del dia: 80 de 100 carreras y 40k de 50k XP abren; justo en
    // el tope, cierran. Los contadores se inyectan para no mover el dia real.
    d.patchSession({ raceLimit: 0, xpLimit: 0, timeLimit: 0, dailyRaceLimit: 100, dailyXpLimit: 50000 });
    d.setDailyCounts(80, 40000);
    out.dailyBelow = d.daily();
    out.dailyRaceText = text('dailyRaces');
    out.dailyXpText = text('dailyXp');
    d.setDailyCounts(100, 50000);
    out.dailyAt = d.daily();
    out.dailyRaceTextAt = text('dailyRaces');
    out.dailyLeftText = text('dailyLeft');
    out.dailyReason = d.session().reason;
    out.dailyReached = d.session().reached;
    d.clearDailyCounts();
    d.patchSession({ dailyRaceLimit: 0, dailyXpLimit: 0 });

    d.patchSession({ xpLimit: 0, xp: 0, timeLimit: 15, tandaStartedAt: Date.now() - 14 * 60000 });
    out.timeBelow = d.session();
    d.patchSession({ tandaStartedAt: Date.now() - 15 * 60000 - 5000 });
    out.timeAt = d.session();
    out.timeLeftText = text('timeLeft');

    d.patchSession({ raceLimit: 0, timeLimit: 0, xpLimit: 0, tandaStartedAt: 0, xp: 0, races: 0, nitroRaces: 0, nitroCharsTotal: 0 });
    return out;
  })()`);

  check('race cap is open one race below the limit',
    caps.raceBelow.reached === false, caps.raceBelow);
  check('race cap trips exactly at the limit',
    caps.raceAt.reached === true && caps.raceAt.reason === 'limit 2 races', caps.raceAt);
  check('race cap stays tripped above the limit, with the real count',
    caps.raceOver.reached === true && caps.raceOver.races === 3, caps.raceOver);
  check('race row shows the overflow instead of hiding it',
    caps.raceText === '3 / 2', caps.raceText);

  check('xp cap is open one point below the limit',
    caps.xpBelow.reached === false, caps.xpBelow);
  check('xp cap trips exactly at the limit',
    caps.xpAt.reached === true && caps.xpAt.reason === 'xp limit 5,000', caps.xpAt);
  check('xp overflow is the last race, not a runaway',
    caps.xpOver.reached === true && caps.xpOver.xp === 5120, caps.xpOver);
  check('xp row shows the overflow honestly',
    caps.xpTotalText === '5,120 / 5,000', caps.xpTotalText);
  check('xp row estimates the time left at the measured pace',
    /^4,000 \/ 5,000 · ≈\d+m$/.test(caps.xpEtaText), caps.xpEtaText);
  check('xp tooltip explains the estimate',
    /1,000 XP left/.test(caps.xpEtaTitle) && /3 races at 400 XP per race/.test(caps.xpEtaTitle),
    caps.xpEtaTitle);
  check('rate row shows the session XP per hour',
    caps.rateText === '22.0k XP/h', caps.rateText);
  check('rate tooltip explains the pace and the window',
    /22,000 XP\/h/.test(caps.rateTitle) && /11,000 XP in 30m/.test(caps.rateTitle),
    caps.rateTitle);
  check('nitro row counts the session races and characters it skipped',
    /^3\/10 · 29 ch · [0-9]+\.[0-9]s$/.test(caps.nitroText), caps.nitroText);
  check('nitro tooltip says the saved time is at the target pace and keeps the last race',
    /3 of 10 races/.test(caps.nitroTitle) && /29 characters/.test(caps.nitroTitle)
      && /at the \d+ WPM target/.test(caps.nitroTitle)
      && /Last race: 1 word, 11 characters/.test(caps.nitroTitle), caps.nitroTitle);
  check('nitro WPM delta compares races with and without nitro',
    caps.nitroDeltaText === '-1.5 wpm' && caps.nitroDeltaGood === '1'
      && /2 with nitro averaged 103.5 WPM/.test(caps.nitroDeltaTitle)
      && /2 without averaged 105.0 WPM/.test(caps.nitroDeltaTitle)
      && /Difference -1.5 WPM/.test(caps.nitroDeltaTitle), caps.nitroDeltaTitle);
  check('nitro WPM delta is hidden until both kinds of race exist',
    caps.nitroDeltaMissing === '—', caps.nitroDeltaMissing);
  check('positive nitro WPM delta is shown as a warning',
    caps.nitroDeltaRiseText === '+4.0 wpm' && caps.nitroDeltaRiseGood === '0',
    { text: caps.nitroDeltaRiseText, good: caps.nitroDeltaRiseGood });
  check('cycle row shows the median gap and the best gap',
    caps.cycleText === '5.0s med · 4.0s best', caps.cycleText);
  check('cycle tooltip says how many gaps and what is excluded',
    /3 gaps/.test(caps.cycleTitle) && /90 s/.test(caps.cycleTitle), caps.cycleTitle);
  check('xp/race row splits the last reward into its four parts',
    caps.xpBreakText === '480+220+50+250', caps.xpBreakText);
  check('xp/race tooltip explains the tiers and the next one',
    /1,000 XP/.test(caps.xpBreakTitle) && /480 base/.test(caps.xpBreakTitle)
      && /99% would pay 75/.test(caps.xpBreakTitle), caps.xpBreakTitle);

  check('daily budget is open below both caps',
    caps.dailyBelow.raceHit === false && caps.dailyBelow.xpHit === false, caps.dailyBelow);
  check('daily rows show consumption against both caps',
    caps.dailyRaceText === '80 / 100' && caps.dailyXpText === '40k / 50k',
    { races: caps.dailyRaceText, xp: caps.dailyXpText });
  check('daily budget trips at either cap',
    caps.dailyAt.raceHit === true && caps.dailyAt.xpHit === true, caps.dailyAt);
  check('daily left row hits zero at the cap',
    caps.dailyLeftText === '0 races · 0 XP', caps.dailyLeftText);
  check('daily cap joins the stop reason and stops the session',
    /daily limit 100 races/.test(caps.dailyReason)
      && /daily XP limit 50,000/.test(caps.dailyReason)
      && caps.dailyReached === true,
    { reason: caps.dailyReason, reached: caps.dailyReached });

  check('time cap is open with a minute left',
    caps.timeBelow.reached === false, caps.timeBelow);
  check('time left is clamped to the window, never above it',
    caps.timeBelow.timeLeft > 55000 && caps.timeBelow.timeLeft <= 60000, caps.timeBelow.timeLeft);
  check('time cap trips once the clock passes, with 0 left',
    caps.timeAt.reached === true && caps.timeAt.timeLeft === 0
      && caps.timeAt.reason === 'time limit 15 min', caps.timeAt);
  check('time row shows 0s, never a negative clock',
    caps.timeLeftText === '0s', caps.timeLeftText);

  // El reloj del tope no puede perderse al pasar por bfcache: pagehide/pageshow
  // paran y reanudan el bot, pero no reinician la tanda ni regalan una ventana.
  const bfcacheCap = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    d.patchSession({ raceLimit: 0, xpLimit: 0, timeLimit: 15, tandaStartedAt: Date.now() - 14 * 60000 });
    const before = d.session();

    w.dispatchEvent(new w.Event('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 60));
    w.dispatchEvent(new w.PageTransitionEvent('pageshow', { persisted: true }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    const after = d.session();

    d.patchSession({ tandaStartedAt: Date.now() - 15 * 60000 - 1000 });
    const expired = d.session();
    d.patchSession({ timeLimit: 0, tandaStartedAt: 0 });
    return { before, after, expired };
  })()`, true);

  check('bfcache keeps the session clock instead of restarting it',
    bfcacheCap.after.timeLimit === 15
      && bfcacheCap.after.tandaStartedAt === bfcacheCap.before.tandaStartedAt,
    { before: bfcacheCap.before.tandaStartedAt, after: bfcacheCap.after.tandaStartedAt });
  check('bfcache consumes normal time, not a fresh window',
    Math.abs(bfcacheCap.after.timeLeft - bfcacheCap.before.timeLeft) < 3000
      && bfcacheCap.after.timeLeft < 60000,
    { before: bfcacheCap.before.timeLeft, after: bfcacheCap.after.timeLeft });
  check('time cap stays open after the bfcache round trip',
    bfcacheCap.after.reached === false, bfcacheCap.after);
  check('time cap still trips on the same clock after bfcache',
    bfcacheCap.expired.reached === true && bfcacheCap.expired.timeLeft === 0, bfcacheCap.expired);

  // Guardia de copias: entra una copia rival mas antigua, esta pasa a esperar y
  // deja de publicarse como tipadora; cuando la rival desaparece, retoma.
  const copies = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const guardText = () => {
      const el = shadow.querySelector('[data-field="guard"]');
      return el ? (el.textContent || '').trim() : '';
    };

    const before = d.role();

    const registry = (Array.isArray(w.__ntaInstances) ? w.__ntaInstances : [])
      .filter((item) => item && item.id !== 'peer-copy');
    registry.push({ id: 'peer-copy', at: Date.now(), since: Date.now() - 5000 });
    w.__ntaInstances = registry;

    // El panel publica su estado (y pinta el guardia) cada 500 ms: hay que
    // dejar pasar al menos un latido entero. Con 350 ms la prueba leia antes
    // de que el latido ocurriera y fallaba de forma intermitente.
    await new Promise((resolve) => setTimeout(resolve, 750));
    const standby = d.role();
    const row = guardText();
    const attr = shadow.querySelector('.panel').dataset.standby;
    const frame = (() => {
      try { return w.top.__ntaFrame || null; } catch { return null; }
    })();

    w.__ntaInstances = (w.__ntaInstances || []).filter((item) => item && item.id !== 'peer-copy');
    await new Promise((resolve) => setTimeout(resolve, 750));
    const back = d.role();

    return {
      before, standby, back, row, attr,
      frame: frame ? { standby: frame.standby, typing: frame.typing } : null,
    };
  })()`, true);

  check('duplicate guard: one copy starts as primary',
    copies.before.primary === true && copies.before.peers === 1 && copies.before.standby === false,
    copies.before);
  check('duplicate guard: the older copy wins and this one stands by',
    copies.standby.primary === false && copies.standby.standby === true && copies.standby.peers === 2,
    copies.standby);
  check('duplicate guard: the standby copy publishes no typing',
    copies.standby.typing === false
      && copies.frame && copies.frame.standby === true && copies.frame.typing === false,
    { typing: copies.standby.typing, frame: copies.frame });
  check('duplicate guard: the panel shows standby',
    copies.attr === '1' && /standby/i.test(copies.row), { attr: copies.attr, row: copies.row });
  check('duplicate guard: the copy takes over when the peer is gone',
    copies.back.primary === true && copies.back.standby === false && copies.back.peers === 1,
    copies.back);

  // Tope por XP de punta a punta: una carrera registrada por el camino normal y
  // el premio real del `update` (rewards.xpBonuses) cruzando el tope.
  const xpCross = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const doc = w.document;
    const shadow = doc.getElementById('nt-autotyper-panel').shadowRoot;
    const text = (field) => {
      const el = shadow.querySelector('[data-field="' + field + '"]');
      return el ? (el.textContent || '').trim() : '';
    };

    doc.querySelectorAll('#raceContainer').forEach((node) => node.remove());

    const host = doc.createElement('div');
    host.id = 'raceContainer';
    doc.body.appendChild(host);

    const listeners = [];
    const server = {
      on(name, fn) { if (name === 'update') listeners.push(fn); },
      off(name, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
      emit(event) { for (const fn of listeners.slice()) fn(event); },
    };
    host['__reactFiber$xp'] = {
      stateNode: { server, props: { user: { userID: 4242 } } },
      return: null,
    };

    // Si el banco cruza la medianoche local entre la siembra de 777 y esta
    // carrera, esa parte queda fechada ayer y el resumen solo contaria 320.
    // Re-fecharla aqui mantiene determinista la suma 777 + 320.
    try {
      const key = 'ntQueue:todayPart:harness';
      const part = JSON.parse(w.localStorage.getItem(key) || 'null');
      if (part) {
        const now = new Date();
        part.date = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        part.updatedAt = Date.now();
        w.localStorage.setItem(key, JSON.stringify(part));
      }
    } catch { /* sin parte sembrada */ }

    d.patchSession({ raceLimit: 0, timeLimit: 0, xpLimit: 5000, xp: 4800, races: 9 });
    d.seedRaceCounters({
      chars: 200, errors: 0, correct: 200, nitroChars: 0, startedAt: Date.now() - 20000,
    });
    const recorded = d.recordRace();
    d.watchRaceResults();

    const before = d.session();

    const racer = {
      userID: 4242,
      username: 'harness',
      progress: { completeStamp: 9001, typed: 200, skipped: 0, errors: 0 },
      rewards: { xpBonuses: { base: { experience: 200 }, speed: { experience: 120 } } },
    };
    server.emit({ racers: [racer] });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const after = d.session();

    // El mismo paquete otra vez: no puede sumar el premio dos veces.
    server.emit({ racers: [racer] });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const again = d.session();

    const last = (() => {
      try {
        const list = JSON.parse(w.localStorage.getItem('autoTyperRaceHistory') || '[]');
        return list[list.length - 1] || null;
      } catch { return null; }
    })();

    const out = {
      recorded,
      before,
      after,
      again,
      xpTotal: text('xpTotal'),
      dayXp: text('dayXp'),
      reward: last ? last.xp : null,
    };

    d.patchSession({ xpLimit: 0, xp: 0, races: 0, tandaStartedAt: 0 });
    host.remove();
    return out;
  })()`, true);

  check('xp cap: the real reward lands on the race row',
    xpCross.recorded === true && xpCross.reward === 320,
    { recorded: xpCross.recorded, reward: xpCross.reward });
  check('xp cap: the crossing race overshoots by exactly its reward',
    xpCross.before.xp === 4800 && xpCross.after.xp === 5120,
    { before: xpCross.before.xp, after: xpCross.after.xp });
  check('xp cap: the cap trips on that same crossing',
    xpCross.after.reached === true && xpCross.after.reason === 'xp limit 5,000', xpCross.after);
  check('xp cap: a repeated reward packet does not count twice',
    xpCross.again.xp === 5120, xpCross.again.xp);
  check('xp cap: the panel shows the one-race overflow',
    xpCross.xpTotal === '5,120 / 5,000', xpCross.xpTotal);
  check('xp cap: the same reward reaches the day summary',
    /1,097 XP/.test(xpCross.dayXp || ''), xpCross.dayXp);

  // Tope de carreras con carreras de verdad: cada vuelta pasa por countRace,
  // que es la misma funcion que usa finishRace al terminar una carrera.
  const raceCap = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const historyLen = () => {
      try { return JSON.parse(w.localStorage.getItem('autoTyperRaceHistory') || '[]').length; } catch { return 0; }
    };

    d.patchSession({ raceLimit: 3, races: 0, xpLimit: 0, timeLimit: 0, tandaStartedAt: 0 });

    const steps = [];
    for (let i = 0; i < 3; i++) {
      const beforeLen = historyLen();
      d.seedRaceCounters({
        chars: 200, errors: 0, correct: 200, nitroChars: 0, startedAt: Date.now() - 15000,
      });
      const recorded = d.countRace();
      const state = d.session();
      steps.push({
        recorded,
        races: state.races,
        reached: state.reached,
        reason: state.reason,
        grew: historyLen() > beforeLen,
      });
    }

    const text = shadow.querySelector('[data-field="races"]').textContent.trim();
    d.patchSession({ raceLimit: 0, races: 0, tandaStartedAt: 0 });
    return { steps, text };
  })()`, true);

  check('race cap: each real race counts once and persists',
    raceCap.steps.every((step, i) => step.recorded === true && step.races === i + 1 && step.grew === true),
    raceCap.steps);
  check('race cap: the cap stays open below the limit',
    raceCap.steps[0].reached === false && raceCap.steps[1].reached === false,
    raceCap.steps.map((step) => step.reached));
  check('race cap: the third real race trips it, exactly at the limit',
    raceCap.steps[2].reached === true && raceCap.steps[2].races === 3
      && raceCap.steps[2].reason === 'limit 3 races',
    raceCap.steps[2]);
  check('race cap: the panel shows 3 / 3, without overshoot',
    raceCap.text === '3 / 3', raceCap.text);

  // Dos copias REALES del script en el mismo marco: se inyecta el userscript
  // una segunda vez, como haria un segundo gestor, y la eleccion debe dejar una
  // sola primaria. Va al final: la copia extra se queda viva hasta cerrar Chrome.
  const dual = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const doc = w.document;
    const d = w.__ntaDebug;
    // Los ganchos se reemplazan al inyectar la copia nueva; se guardan los de
    // la primaria para poder pararla de verdad al final de la prueba.
    const firstStop = d.stop;
    const firstResume = d.resume;
    const firstRole = d.role;

    const before = d.role();

    const script = doc.createElement('script');
    script.src = '/nitro-wraith.user.js';
    doc.body.appendChild(script);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // El userscript de la copia nueva reemplaza los ganchos de __ntaDebug:
    // role() ya responde con la instancia recien inyectada, que es la que debe
    // quedarse en espera.
    const after = d.role();
    const secondStop = d.stop;
    const shadow = doc.getElementById('nt-autotyper-panel').shadowRoot;
    const guard = shadow.querySelector('[data-field="guard"]');
    const pen = guard ? (guard.textContent || '').trim() : '';
    const registry = (Array.isArray(w.__ntaInstances) ? w.__ntaInstances : [])
      .map((item) => item && item.id).filter(Boolean);

    // La primaria se para: su latido la borra del registro y la copia en espera
    // debe quedarse con el mando sin recargar la pagina.
    firstStop();
    // El latido que borra la copia parada no es instantaneo: se espera al
    // relevo real en vez de leer el registro en el mismo tick (era flaky).
    let released = firstRole();
    const releaseUntil = Date.now() + 2500;
    while (released.primary && Date.now() < releaseUntil) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      released = firstRole();
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    const takeover = d.role();
    await new Promise((resolve) => setTimeout(resolve, 900));
    const notices = (shadow.querySelector('[data-field="noticeList"]') || {}).textContent || '';

    // La primaria vuelve: debe entrar como la mas nueva y no quitarle el turno
    // a la copia que ya esta escribiendo.
    firstResume();
    await new Promise((resolve) => setTimeout(resolve, 350));
    const returned = d.role();
    const back = firstRole();

    // Y cuando la que escribe se para, la que volvio retoma el mando. El
    // relevo llega en el siguiente latido de la copia en espera, no en el acto:
    // se espera hasta 3 s a que lo tome en vez de leer a un plazo fijo.
    secondStop();
    d.role();
    let final = firstRole();
    const until = Date.now() + 3000;
    while (!final.primary && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      final = firstRole();
    }

    const out = {
      before,
      after,
      guard: guard ? (guard.textContent || '').trim() : '',
      pen,
      registry: registry.length,
      released,
      takeover,
      notices,
      returned,
      back,
      final,
    };

    script.remove();
    return out;
  })()`, true);

  check('two real copies: both register in the same frame',
    dual.registry === 2 && dual.after.peers === 2, dual);
  check('two real copies: the older copy keeps the pen, the new one stands by',
    dual.before.primary === true && dual.before.standby === false
      && dual.after.primary === false && dual.after.standby === true
      && dual.after.typing === false,
    { before: dual.before, after: dual.after });
  check('two real copies: the guard names the pen and its age',
    /(standby|writing) · pen (this|other) #[a-z0-9]{4} · \d/.test(dual.pen), dual.pen);
  check('two real copies: a stopped copy releases the pen',
    dual.released.primary === false && dual.released.standby === true, dual.released);
  check('two real copies: the standby takes over when the primary stops',
    dual.takeover.primary === true && dual.takeover.standby === false && dual.takeover.peers === 1,
    dual.takeover);
  check('two real copies: the log announces the pen handoff',
    /Pen: this copy #[a-z0-9]{4} takes the turn/.test(dual.notices), dual.notices);
  check('two real copies: a resumed copy does not take the pen back',
    dual.returned.primary === true && dual.returned.standby === false
      && dual.back.primary === false && dual.back.standby === true,
    { writing: dual.returned, resumed: dual.back });
  check('two real copies: the resumed copy takes over when the writer stops',
    dual.final.primary === true && dual.final.standby === false,
    dual.final);

  // Panel del garaje: el fixture no carga el userscript en la ventana de
  // arriba, asi que se inyecta aqui al final (ya no quedan comprobaciones que
  // puedan interferir) y se cambia el tema desde el iframe. Cubre el aviso de
  // storage y que la paleta se aplique sin panel grande en esa pagina.
  try {
    // El fixture del garaje es la misma pagina con iframe de carrera, pero en
    // `/garage/`: el panel pequeno solo se monta en esa ruta.
    await cdp.evaluate(`location.href = '/garage/'`);
    await waitFor(async () => (await cdp.evaluate(
      `location.pathname === '/garage/' && document.readyState === 'complete' && Boolean(document.querySelector('iframe'))`
    )), 10000, 'the garage page');
    // El panel del garaje se inyecta ahora: los topes diarios ya tienen que
    // estar en localStorage para que su sesion los lea al arrancar.
    await cdp.evaluate(`
      localStorage.setItem('autoTyperDailyRaceLimit', '100');
      localStorage.setItem('autoTyperDailyXpLimit', '50000');
      true;
    `);
    await cdp.evaluate(fs.readFileSync(SCRIPT, 'utf8'));
    await waitFor(async () => (await cdp.evaluate(`Boolean(document.getElementById('nt-queue-panel'))`)), 8000, 'the garage panel');

    // La fila `login` dice que camino usara el re-login y cuanto le queda al
    // recuerdo. Se pintan los dos casos que no dependen de una sesion real.
    const garageLogin = await cdp.evaluate(`(() => {
      const root = document.getElementById('nt-queue-panel').shadowRoot;
      const row = root.querySelector('[data-f="login"]');
      if (!row) return { hasRow: false };
      const prev = localStorage.getItem('ntQueue:lastLogin');
      const paint = () => window.__ntaDebug.garagePaint();
      const read = () => ({ text: (row.textContent || '').trim(), title: row.title });

      localStorage.setItem('ntQueue:lastLogin', JSON.stringify({ method: 'google', at: Date.now() }));
      paint();
      const google = read();

      localStorage.setItem('ntQueue:lastLogin', JSON.stringify({ method: 'manual', at: Date.now() }));
      paint();
      const manual = read();

      if (prev === null) localStorage.removeItem('ntQueue:lastLogin');
      else localStorage.setItem('ntQueue:lastLogin', prev);
      paint();
      return { hasRow: true, google, manual };
    })()`);
    check('the garage panel shows the remembered sign-in and its remaining days',
      garageLogin.hasRow && /^Google · \d+d$/.test(garageLogin.google.text)
        && /manual · no SSO/.test(garageLogin.manual.text)
        && /Google/.test(garageLogin.google.title),
      garageLogin);

    // Indicador AFK y cita real del reintento. Se arma una cita corta desde el
    // mismo gancho de la cola y se comprueba que el panel la pinta y la retira.
    const garageAfk = await cdp.evaluate(`(() => {
      const root = document.getElementById('nt-queue-panel').shadowRoot;
      const d = window.__ntaDebug;
      const afk = root.querySelector('[data-f="afk"]');
      const retryRow = root.querySelector('[data-f="retryRow"]');
      const retry = root.querySelector('[data-f="loginRetry"]');
      if (!afk || !retryRow || !retry || !d.loginRetryArm || !d.loginRetryCancel) return { hasRow: false };

      d.loginRetryCancel();
      d.garagePaint();
      const before = { text: (afk.textContent || '').trim(), retryHidden: retryRow.hidden };

      d.loginRetryArm(90000);
      d.garagePaint();
      const armed = {
        text: (afk.textContent || '').trim(),
        retryHidden: retryRow.hidden,
        retryText: (retry.textContent || '').trim(),
        title: retryRow.title,
      };

      d.loginRetryCancel();
      d.garagePaint();
      const cleared = {
        text: (afk.textContent || '').trim(),
        retryHidden: retryRow.hidden,
        stored: sessionStorage.getItem('ntQueue:loginRetryAt'),
      };
      return { hasRow: true, before, armed, cleared };
    })()`);
    check('the garage panel shows AFK and the real login-retry countdown',
      garageAfk.hasRow && garageAfk.armed.text === 'waiting'
        && garageAfk.armed.retryHidden === false
        && /\d+[ms]/.test(garageAfk.armed.retryText)
        && /sign-in retry/i.test(garageAfk.armed.title)
        && garageAfk.cleared.retryHidden === true
        && garageAfk.cleared.text === garageAfk.before.text
        && garageAfk.cleared.stored === null,
      garageAfk);

    // El boton aparece solo con una cita y la adelanta. Con una sesion viva no
    // navega: retira la cita, que es el caso seguro para probar el clic real.
    const garageRetryNow = await cdp.evaluate(`(() => {
      const root = document.getElementById('nt-queue-panel').shadowRoot;
      const row = root.querySelector('[data-f="retryRow"]');
      const btn = root.querySelector('[data-act="retry"]');
      const d = window.__ntaDebug;
      if (!row || !btn || !d || !d.loginRetryNow || !d.garagePaint) return { hasRow: false };

      const prev = localStorage.getItem('player_token');
      localStorage.setItem('player_token', 'retry-now-token');
      d.loginRetryCancel();
      d.loginRetryArm(90000);
      d.garagePaint();
      const before = {
        rowHidden: row.hidden,
        buttonHidden: btn.hidden,
        label: (btn.textContent || '').trim(),
        title: btn.title,
      };

      btn.click();
      const after = {
        rowHidden: row.hidden,
        buttonHidden: btn.hidden,
        pending: d.loginRetryPending(),
        stored: sessionStorage.getItem('ntQueue:loginRetryAt'),
      };

      if (prev === null) localStorage.removeItem('player_token');
      else localStorage.setItem('player_token', prev);
      d.loginRetryCancel();
      d.garagePaint();
      return { hasRow: true, before, after };
    })()`);
    check('the garage panel can advance a pending login retry',
      garageRetryNow.hasRow && garageRetryNow.before.rowHidden === false
        && garageRetryNow.before.buttonHidden === false
        && garageRetryNow.before.label === 'Retry login'
        && /skips the remaining wait/i.test(garageRetryNow.before.title)
        && garageRetryNow.after.rowHidden === true
        && garageRetryNow.after.buttonHidden === true
        && garageRetryNow.after.pending === false
        && garageRetryNow.after.stored === null,
      garageRetryNow);

    // El mismo aviso de temporada que la tarjeta, en la franja del garaje:
    // se siembra una temporada que acaba en dos dias y se pinta a mano.
    const garageSeason = await cdp.evaluate(`(() => {
      const host = document.getElementById('nt-queue-panel');
      const root = host.shadowRoot;
      const row = root.querySelector('[data-f="seasonRow"]');
      const text = root.querySelector('[data-f="seasonAlert"]');
      localStorage.setItem('autoTyperSeason', JSON.stringify({
        v: 2, at: Date.now(), auto: true, source: 'user', seasonID: 73,
        seasonName: 'Spirit Racers', tier: 6, nextTier: 7, progress: 82,
        xp: 86500, currentXp: 70000, nextXp: 90000,
        endsAt: Date.now() + 2 * 86400000, endsText: 'Nov 29',
      }));
      if (window.__ntaDebug && window.__ntaDebug.garagePaint) window.__ntaDebug.garagePaint();
      const out = { hidden: row.hidden, display: getComputedStyle(row).display, text: text.textContent };
      localStorage.removeItem('autoTyperSeason');
      return out;
    })()`);
    check('the garage footer carries the season alert too',
      garageSeason.hidden === false && garageSeason.display !== 'none'
        && /Season ends in 2d/.test(garageSeason.text)
        && /3,500 XP to next reward/.test(garageSeason.text), garageSeason);

    // Presupuesto diario en la barra del garaje: se siembra el dia real por
    // localStorage y se espera el latido que repinta el panel pequeno.
    const garageBudget = await cdp.evaluate(`(async () => {
      const d = new Date();
      const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const key = 'ntQueue:todayPart:harness';
      const baseKey = 'ntQueue:today';

      const saved = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ntQueue:todayPart:')) saved[k] = localStorage.getItem(k);
      }
      for (const k of Object.keys(saved)) localStorage.removeItem(k);
      const savedBase = localStorage.getItem(baseKey);

      // El dia base arrastra lo que dejaron las pruebas del tope por XP; se
      // aparca para que el presupuesto empiece en cero y se restaura al final.
      localStorage.setItem(baseKey, JSON.stringify({
        date, races: 0, sumWpm: 0, sumTarget: 0, boxes: 0, dq: 0, xp: 0,
        clean: 1, firstAt: 0, lastAt: 0, dqAt: 0, updatedAt: Date.now(),
      }));

      localStorage.setItem(key, JSON.stringify({
        date, races: 80, sumWpm: 8800, sumTarget: 8800, boxes: 0, dq: 0,
        xp: 40000, clean: 0, firstAt: Date.now() - 3600000, lastAt: Date.now(),
        dqAt: 0, updatedAt: Date.now(),
      }));
      await new Promise((resolve) => setTimeout(resolve, 700));
      // El cache del dia dura 500 ms; este evento, que ya escucha el panel
      // del garaje, fuerza el repintado en cuanto el cache esta fresco.
      window.dispatchEvent(new StorageEvent('storage', { key: 'autoTyperDailyRaceLimit', newValue: '100' }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      const shadow = document.getElementById('nt-queue-panel').shadowRoot;
      const row = shadow.querySelector('[data-f="budgetRow"]');
      const out = {
        hidden: row.hidden,
        text: shadow.querySelector('[data-f="dayBudget"]').textContent,
        title: row.title,
        warn: row.dataset.warn,
      };

      localStorage.setItem('autoTyperDailyRaceLimit', '0');
      localStorage.setItem('autoTyperDailyXpLimit', '0');
      window.dispatchEvent(new StorageEvent('storage', { key: 'autoTyperDailyRaceLimit', newValue: '0' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'autoTyperDailyXpLimit', newValue: '0' }));
      localStorage.removeItem(key);
      if (savedBase === null) localStorage.removeItem(baseKey);
      else localStorage.setItem(baseKey, savedBase);
      for (const [k, value] of Object.entries(saved)) localStorage.setItem(k, value);
      return out;
    })()`, true);

    check('garage bar shows the daily budget left',
      garageBudget.hidden === false && garageBudget.text === '20 races · 10k XP', garageBudget);
    check('garage budget warns when the day is close',
      garageBudget.warn === '1', garageBudget);

    const garageTheme = await cdp.evaluate(`(async () => {
      const host = document.getElementById('nt-queue-panel');
      const p = host.shadowRoot.querySelector('.p');
      const before = { theme: p.dataset.theme, acc: getComputedStyle(p).getPropertyValue('--acc').trim() };
      const w = document.querySelector('iframe').contentWindow;
      if (w.__ntaDebug && w.__ntaDebug.hydrateAllViews) w.__ntaDebug.hydrateAllViews();
      const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
      s.querySelector('[data-theme-btn="violet"]').click();
      await new Promise((r) => setTimeout(r, 450));
      const after = { theme: p.dataset.theme, acc: getComputedStyle(p).getPropertyValue('--acc').trim() };
      s.querySelector('[data-theme-btn="carbon"]').click();
      // Deja que el storage de vuelta llegue antes de que el siguiente caso
      // lea el tema; si no, el carbon pendiente pisa el ciclo del garaje.
      await new Promise((r) => setTimeout(r, 450));
      return { before, after };
    })()`, true);
    check('the garage panel follows the race panel theme without reloading',
      garageTheme.before.theme === 'carbon'
        && garageTheme.after.theme === 'violet' && garageTheme.after.acc === '#c08bff', garageTheme);

    // Y al reves: el garaje tambien puede cambiar la piel. El ciclo debe
    // guardarse y llegar al panel de la carrera por el evento storage.
    const garageControl = await cdp.evaluate(`(async () => {
      const host = document.getElementById('nt-queue-panel');
      const p = host.shadowRoot.querySelector('.p');
      const row = host.shadowRoot.querySelector('[data-f="theme"]');
      const order = ['carbon', 'aurora', 'sunset', 'ice', 'violet', 'rgb'];
      const before = p.dataset.theme;
      const expected = order[(order.indexOf(before) + 1) % order.length];
      row.click();
      await new Promise((r) => setTimeout(r, 550));
      const w = document.querySelector('iframe').contentWindow;
      const race = w.document.getElementById('nt-autotyper-panel').shadowRoot.querySelector('.panel');
      return {
        before,
        expected,
        after: p.dataset.theme,
        label: (row.textContent || '').trim(),
        race: race.dataset.theme,
        stored: localStorage.getItem('autoTyperPanelTheme'),
        tag: row.tagName,
        tab: row.tabIndex,
        aria: row.getAttribute('aria-label'),
      };
    })()`, true);
    check('the garage theme control cycles and syncs back to the race panel',
      garageControl.after === garageControl.expected
        && garageControl.race === garageControl.expected
        && garageControl.stored === garageControl.expected
        && garageControl.label.toLowerCase() === garageControl.expected
        && garageControl.tag === 'BUTTON' && garageControl.tab >= 0
        && new RegExp(garageControl.expected, 'i').test(garageControl.aria || ''), garageControl);

    // El Stop del garaje es la salida cuando el panel de carrera no esta a la
    // vista (resultados, DQ o garaje): debe ser un boton real, no una etiqueta.
    const garageStopAction = await cdp.evaluate(`(() => {
      const root = document.getElementById('nt-queue-panel').shadowRoot;
      const btn = root.querySelector('[data-act="stop"]');
      return {
        present: Boolean(btn),
        text: btn ? (btn.textContent || '').trim() : '',
        type: btn ? btn.type : '',
        danger: btn ? btn.classList.contains('danger') : false,
        title: btn ? btn.title : '',
      };
    })()`);
    check('the garage panel offers a real Stop action',
      garageStopAction.present && garageStopAction.text === 'Stop' && garageStopAction.type === 'button'
        && garageStopAction.danger && /stop/i.test(garageStopAction.title), garageStopAction);

    // Plegar el garaje: el boton de la cabecera deja solo la cabecera, guarda
    // el estado y Alt+G lo vuelve a abrir sin tocar el raton.
    const garageFold = await cdp.evaluate(`(async () => {
      const host = document.getElementById('nt-queue-panel');
      const root = host.shadowRoot;
      const panel = root.querySelector('.p');
      const fold = root.querySelector('[data-f="fold"]');
      const rows = root.querySelector('.rows');
      const read = () => ({
        fold: panel.dataset.fold,
        expanded: fold.getAttribute('aria-expanded'),
        rows: getComputedStyle(rows).display,
        label: (fold.textContent || '').trim(),
      });
      if (panel.dataset.fold === '1') {
        fold.click();
        await new Promise((r) => setTimeout(r, 120));
      }
      const before = read();
      fold.click();
      await new Promise((r) => setTimeout(r, 120));
      const folded = read();
      const stored = localStorage.getItem('autoTyperGarageFolded');
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'g', code: 'KeyG', altKey: true, bubbles: true,
      }));
      await new Promise((r) => setTimeout(r, 120));
      const opened = read();
      return { before, folded, opened, stored };
    })()`, true);
    check('the garage panel folds to its header and Alt+G reopens it',
      garageFold.before.fold === '0' && garageFold.before.rows !== 'none'
        && garageFold.folded.fold === '1' && garageFold.folded.rows === 'none'
        && garageFold.folded.expanded === 'false' && garageFold.folded.label === '+'
        && garageFold.stored === '1'
        && garageFold.opened.fold === '0' && garageFold.opened.rows !== 'none',
      garageFold);

    // Tarjeta de ultima parada: motivo, retencion y si se levanto a mano.
    const garageStop = await cdp.evaluate(`(() => {
      const host = document.getElementById('nt-queue-panel');
      const root = host.shadowRoot;
      const row = root.querySelector('[data-f="stopRow"]');
      const text = root.querySelector('[data-f="lastStop"]');
      const paint = () => window.__ntaDebug.garagePaint();
      localStorage.setItem('ntQueue:lastStop', JSON.stringify({
        at: Date.now() - 30 * 60000, reason: 'tanda limit', holdMs: 6 * 3600000,
        clearedAt: 0, clearedBy: '',
      }));
      paint();
      const active = { hidden: row.hidden, display: getComputedStyle(row).display, text: text.textContent, title: row.title };
      localStorage.setItem('ntQueue:lastStop', JSON.stringify({
        at: Date.now() - 5 * 60000, reason: 'tanda limit', holdMs: 3600000,
        clearedAt: Date.now() - 2 * 60000, clearedBy: 'manual',
      }));
      paint();
      const cleared = { hidden: row.hidden, text: text.textContent, title: row.title };
      localStorage.removeItem('ntQueue:lastStop');
      paint();
      return { active, cleared, afterHidden: row.hidden };
    })()`);
    check('the garage panel shows the last stop, its hold and a manual clear',
      garageStop.active.hidden === false && garageStop.active.display !== 'none'
        && /tanda limit/.test(garageStop.active.text) && /left/.test(garageStop.active.text)
        && /Last stop:/.test(garageStop.active.title) && /not cleared manually/.test(garageStop.active.title)
        && garageStop.cleared.hidden === false
        && /cleared manually/.test(garageStop.cleared.text)
        && /cleared manually at/.test(garageStop.cleared.title)
        && garageStop.afterHidden === true, garageStop);

    // El aviso de version vive una sola vez, en la cabecera del panel de carrera.
    // El garaje ya no crea un segundo boton que abria la misma descarga.
    const garageUpdate = await cdp.evaluate(`(() => {
      const root = document.getElementById('nt-queue-panel').shadowRoot;
      return { badges: root.querySelectorAll('[data-f="update"], .upd').length };
    })()`);
    check('the garage panel does not duplicate the header update control',
      garageUpdate.badges === 0, garageUpdate);

    // Los tres Daily Challenges en el garaje, con su reinicio. Se siembra el
    // mismo estado que deja el juego y se fuerza la cache de 5 s.
    const garageChallenges = await cdp.evaluate(`(() => {
      const raw = localStorage.getItem('persist:nt');
      const soon = Math.floor(Date.now() / 1000) + 3600;
      localStorage.setItem('persist:nt', JSON.stringify({ user: JSON.stringify({ challenges: [
        { challengeID: 11, progress: 5 },
        { challengeID: 12, progress: 40 },
        { challengeID: 13, progress: 3 },
      ] }) }));
      window.NTGLOBALS = window.NTGLOBALS || {};
      window.NTGLOBALS.CHALLENGES = [
        { challengeID: 11, type: 'race', goal: 5, expiration: soon },
        { challengeID: 12, type: 'accuracy', goal: 100, expiration: soon },
        { challengeID: 13, type: 'nitro', goal: 3, expiration: soon },
      ];
      window.NTGLOBALS.CHALLENGE_TYPES = {
        race: ['Finish \${goal} \${field}', 'race'],
        accuracy: ['Reach \${goal}% accuracy', 'accuracy'],
        nitro: ['Use \${goal} \${field}', 'nitro'],
      };
      if (window.__ntaDebug.refreshChallenges) window.__ntaDebug.refreshChallenges();
      if (window.__ntaDebug.garagePaint) window.__ntaDebug.garagePaint();
      const root = document.getElementById('nt-queue-panel').shadowRoot;
      const row = root.querySelector('[data-f="challengeRow"]');
      const value = root.querySelector('[data-f="challenges"]');
      const nextRow = root.querySelector('[data-f="nextRow"]');
      const nextValue = root.querySelector('[data-f="next"]');
      const out = {
        hidden: row.hidden, text: value.textContent, title: row.title,
        resetAt: window.__ntaDebug.challengeReset ? window.__ntaDebug.challengeReset() : 0,
        nextHidden: nextRow.hidden, nextText: nextValue.textContent, nextTitle: nextRow.title,
      };
      if (raw === null) localStorage.removeItem('persist:nt');
      else localStorage.setItem('persist:nt', raw);
      window.NTGLOBALS.CHALLENGES = [];
      window.NTGLOBALS.CHALLENGE_TYPES = {};
      if (window.__ntaDebug.refreshChallenges) window.__ntaDebug.refreshChallenges();
      if (window.__ntaDebug.garagePaint) window.__ntaDebug.garagePaint();
      return out;
    })()`);
    check('the garage shows daily challenge progress and its reset',
      garageChallenges.hidden === false && /^2\/3/.test(garageChallenges.text)
        && /left/.test(garageChallenges.text)
        && /5\/5/.test(garageChallenges.title)
        && /40\/100/.test(garageChallenges.title)
        && /3\/3/.test(garageChallenges.title)
        && garageChallenges.resetAt > Date.now(), garageChallenges);
    check('the garage points at the closest daily challenge',
      garageChallenges.nextHidden === false
        && /accuracy 40\/100/.test(garageChallenges.nextText)
        && /Closest Daily Challenge: Reach 100% accuracy/.test(garageChallenges.nextTitle),
      garageChallenges);

    // La tarjeta visible manda: un boxNextAt viejo no puede tapar el Claim Now!
    // y el formateador conserva los minutos en vez de redondear a horas.
    const garageBox = await cdp.evaluate(`(() => {
      const root = document.getElementById('nt-queue-panel').shadowRoot;
      const row = root.querySelector('[data-f="box"]');
      const save = (key) => localStorage.getItem(key);
      const oldNext = save('ntQueue:boxNextAt');
      const oldTry = save('ntQueue:boxTriedAt');
      const oldLast = save('ntQueue:boxLastAt');
      const oldFail = save('ntQueue:boxFailAt');
      const oldReady = save('ntQueue:boxReadyAt');
      localStorage.setItem('ntQueue:boxNextAt', String(Date.now() + 56 * 60000));
      localStorage.setItem('ntQueue:boxTriedAt', String(Date.now()));
      localStorage.setItem('ntQueue:boxLastAt', '0');
      localStorage.setItem('ntQueue:boxFailAt', '0');
      // Clase cambiada a proposito: el respaldo por texto debe encontrar la
      // tarjeta aunque ya no sea .mysteryBox.is-here.
      const card = document.createElement('div');
      card.className = 'reward-card is-here';
      card.style.cssText = 'position:fixed;left:8px;top:8px;width:180px;height:80px';
      card.innerHTML = '<span>Mystery Box is HERE!</span><button type="button">Claim Now!</button>';
      document.body.appendChild(card);
      window.__ntaDebug.garagePaint();
      const ready = row.textContent;
      card.remove();

      // Marcado exacto de produccion (ga.js): la tarjeta real usa
      // .mysteryBox.is-here > .mysteryBox-action > button.btn--gold.
      const real = document.createElement('div');
      real.className = 'mysteryBox is-here';
      real.style.cssText = 'position:fixed;left:8px;top:100px;width:200px;height:120px';
      real.innerHTML = '<div class="mysteryBox-content"><div class="mysteryBox-title">Mystery Box</div><div class="mysteryBox-arrival">is HERE!</div><div class="mysteryBox-action"><div class="focus-effect-container"><button class="btn btn--gold btn--thin btn--fw" type="button">Claim Now!</button></div></div></div>';
      document.body.appendChild(real);
      window.__ntaDebug.garagePaint();
      const realReady = row.textContent;
      const readySignal = Number(localStorage.getItem('ntQueue:boxReadyAt')) || 0;
      real.remove();
      const formatter = window.__ntaDebug.boxWaitText
        ? [window.__ntaDebug.boxWaitText(56 * 60000), window.__ntaDebug.boxWaitText(21 * 3600000 + 30 * 60000)]
        : null;
      const restore = (key, value) => {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      };
      restore('ntQueue:boxNextAt', oldNext);
      restore('ntQueue:boxTriedAt', oldTry);
      restore('ntQueue:boxLastAt', oldLast);
      restore('ntQueue:boxFailAt', oldFail);
      restore('ntQueue:boxReadyAt', oldReady);
      window.__ntaDebug.garagePaint();
      return { ready, realReady, readySignal, formatter };
    })()`);
    check('the garage box row says ready when the claim card is visible',
      /ready now/.test(garageBox.ready), garageBox);
    check('the garage box row finds the real production mysteryBox markup',
      /ready now/.test(garageBox.realReady), garageBox);
    check('the garage announces the claim card to the race panel',
      garageBox.readySignal > Date.now() - 5000, garageBox);
    check('the box countdown keeps hours and minutes',
      garageBox.formatter && garageBox.formatter[0] === '56 min'
        && garageBox.formatter[1] === '21h 30m', garageBox);

    // El panel de carrera comparte localStorage con el garaje: al ver la
    // tarjeta alli, no puede seguir pintando los 56 min locales.
    const raceBox = await cdp.evaluate(`(() => {
      const w = document.querySelector('iframe').contentWindow;
      const save = (key) => w.localStorage.getItem(key);
      const oldNext = save('ntQueue:boxNextAt');
      const oldLast = save('ntQueue:boxLastAt');
      const oldReady = save('ntQueue:boxReadyAt');
      w.localStorage.setItem('ntQueue:boxNextAt', String(Date.now() + 56 * 60000));
      w.localStorage.setItem('ntQueue:boxLastAt', '0');
      w.localStorage.setItem('ntQueue:boxReadyAt', String(Date.now()));
      if (w.__ntaDebug.paintPanel) w.__ntaDebug.paintPanel();
      const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
      const row = shadow.querySelector('.box-row');
      const value = shadow.querySelector('[data-field="box"]');
      const out = { text: value ? value.textContent : '', display: row ? row.style.display : '' };
      const restore = (key, value) => {
        if (value === null) w.localStorage.removeItem(key);
        else w.localStorage.setItem(key, value);
      };
      restore('ntQueue:boxNextAt', oldNext);
      restore('ntQueue:boxLastAt', oldLast);
      restore('ntQueue:boxReadyAt', oldReady);
      if (w.__ntaDebug.paintPanel) w.__ntaDebug.paintPanel();
      return out;
    })()`);
    check('the race panel says ready when the garage saw the claim card',
      /ready now/.test(raceBox.text) && raceBox.display !== 'none', raceBox);

    // Auditoria de panel estrecho: 320 px de ventana, sin desbordar a la
    // derecha y sin que los cuatro botones se salgan del panel.
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 320, height: 800, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(100);
    const narrowGarage = await cdp.evaluate(`(() => {
      const root = document.getElementById('nt-queue-panel').shadowRoot;
      const panel = root.querySelector('.p');
      const acts = root.querySelector('.acts');
      const rect = panel.getBoundingClientRect();
      return {
        inner: innerWidth, left: rect.left, right: rect.right, width: rect.width,
        actsOverflow: acts.scrollWidth > acts.clientWidth + 1,
        buttons: Array.from(acts.querySelectorAll('button')).map((b) => b.getBoundingClientRect().width),
      };
    })()`);

    // La fila nueva tambien tiene que caber en el panel de carrera a 320 px.
    // El iframe del banco mide 420 px por defecto; se estrecha solo aqui y se
    // restaura al terminar para no contaminar las comprobaciones siguientes.
    const narrowRace = await cdp.evaluate(`(() => {
      const frame = document.querySelector('iframe');
      const w = frame.contentWindow;
      const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
      const panel = shadow.querySelector('.panel');
      const tab = shadow.querySelector('[data-tab-btn="tune"]');
      const stats = shadow.querySelector('[data-tab-btn="stats"]');
      const row = shadow.querySelector('.nitro-target-row');
      const val = shadow.querySelector('[data-field="nitroPreview"]');
      const strategyRow = shadow.querySelector('.nitro-strategy-row');
      const strategy = shadow.querySelector('[data-field="nitroStrategy"]');
      const d = w.__ntaDebug;
      if (!panel || !tab || !row || !val || !strategyRow || !strategy || !d.shouldUseNitro) return { has: false };

      const oldWidth = frame.style.width;
      frame.style.width = '320px';
      const long = 'q'.repeat(30);
      const content = 'aaa ' + long + ' ' + 'x'.repeat(300);
      const target = d.nitroTarget(content);
      d.patchSession({ nitroDone: 0, nitroTries: 0 });
      d.shouldUseNitro(content, target);
      tab.click();

      const rect = panel.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const valRect = val.getBoundingClientRect();
      const strategyRect = strategyRow.getBoundingClientRect();
      const selectRect = strategy.getBoundingClientRect();
      const out = {
        has: true,
        inner: w.innerWidth,
        panelLeft: rect.left, panelRight: rect.right,
        rowLeft: rowRect.left, rowRight: rowRect.right,
        valRight: valRect.right, valWidth: valRect.width,
        rowOverflow: row.scrollWidth > row.clientWidth + 1,
        valOverflow: val.scrollWidth > val.clientWidth + 1,
        strategyLeft: strategyRect.left, strategyRight: strategyRect.right,
        strategyValRight: selectRect.right, strategyValWidth: selectRect.width,
        strategyOverflow: strategyRow.scrollWidth > strategyRow.clientWidth + 1,
        text: val.textContent.trim(),
      };

      d.patchSession({ nitroDone: 0, nitroTries: 0 });
      d.shouldUseNitro('', 0);
      if (stats) stats.click();
      frame.style.width = oldWidth;
      return out;
    })()`);
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await sleep(80);
    check('the garage panel fits a 320 px viewport without horizontal overflow',
      narrowGarage.inner === 320 && narrowGarage.left >= -1 && narrowGarage.right <= 321
        && narrowGarage.width <= 289 && !narrowGarage.actsOverflow, narrowGarage);
    check('the race panel nitro row fits a 320 px viewport',
      narrowRace.has && narrowRace.inner === 320
        && narrowRace.panelLeft >= -1 && narrowRace.panelRight <= 321
        && narrowRace.rowLeft >= narrowRace.panelLeft - 1
        && narrowRace.rowRight <= narrowRace.panelRight + 1
        && narrowRace.valRight <= narrowRace.panelRight + 1
        && !narrowRace.rowOverflow
        && narrowRace.strategyLeft >= narrowRace.panelLeft - 1
        && narrowRace.strategyRight <= narrowRace.panelRight + 1
        && narrowRace.strategyValRight <= narrowRace.panelRight + 1
        && narrowRace.strategyValWidth > 0
        && !narrowRace.strategyOverflow,
      narrowRace);

    // 320 px fisicos al 200 % son 160 CSS: el rail lateral no cabe y el panel
    // pasa a columna con el rail arriba. La cabecera tiene que seguir visible
    // dentro del viewport y los controles no pueden desbordar a la derecha.
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 160, height: 450, deviceScaleFactor: 2, mobile: false,
    });
    await sleep(100);
    const compactRace = await cdp.evaluate(`(() => {
      const frame = document.querySelector('iframe');
      const w = frame.contentWindow;
      const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
      const panel = shadow.querySelector('.panel');
      const head = shadow.querySelector('.head');
      const rail = shadow.querySelector('.rail');
      const actions = shadow.querySelector('.actions');
      const chips = shadow.querySelector('.chips-row');
      const foot = shadow.querySelector('.foot');
      const tune = shadow.querySelector('[data-tab-btn="tune"]');
      const stats = shadow.querySelector('[data-tab-btn="stats"]');
      const strategyRow = shadow.querySelector('.nitro-strategy-row');
      const strategy = shadow.querySelector('[data-field="nitroStrategy"]');
      if (!panel || !head || !rail || !actions || !chips || !foot || !tune || !strategyRow || !strategy) return { has: false };

      const oldWidth = frame.style.width;
      const oldHeight = frame.style.height;
      frame.style.width = '160px';
      frame.style.height = '450px';
      tune.click();
      const p = panel.getBoundingClientRect();
      const h = head.getBoundingClientRect();
      const a = actions.getBoundingClientRect();
      const c = chips.getBoundingClientRect();
      const sr = strategyRow.getBoundingClientRect();
      const ss = strategy.getBoundingClientRect();
      const out = {
        has: true,
        inner: w.innerWidth,
        panelLeft: p.left, panelRight: p.right, panelTop: p.top, panelBottom: p.bottom,
        headTop: h.top, headBottom: h.bottom,
        actionsOverflow: actions.scrollWidth > actions.clientWidth + 1,
        actionsRight: a.right,
        chipsOverflow: chips.scrollWidth > chips.clientWidth + 1,
        chipsRight: c.right,
        strategyRight: sr.right,
        strategyValRight: ss.right,
        strategyValWidth: ss.width,
        strategyOverflow: strategyRow.scrollWidth > strategyRow.clientWidth + 1,
        foot: w.getComputedStyle(foot).display,
        railDirection: w.getComputedStyle(rail).flexDirection,
        panelDirection: w.getComputedStyle(panel).flexDirection,
      };

      if (stats) stats.click();
      frame.style.width = oldWidth;
      frame.style.height = oldHeight;
      return out;
    })()`);
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await sleep(80);
    check('the race panel compacts cleanly at 320 px with 200% zoom',
      compactRace.has && compactRace.inner === 160
        && compactRace.panelLeft >= -1 && compactRace.panelRight <= 161
        && compactRace.panelTop >= -1 && compactRace.panelBottom <= 451
        && compactRace.headTop >= compactRace.panelTop - 1
        && compactRace.headBottom <= compactRace.panelBottom + 1
        && compactRace.railDirection === 'row'
        && compactRace.panelDirection === 'column'
        && compactRace.foot === 'none'
        && compactRace.actionsRight <= compactRace.panelRight + 1
        && compactRace.chipsRight <= compactRace.panelRight + 1
        && compactRace.strategyRight <= compactRace.panelRight + 1
        && compactRace.strategyValRight <= compactRace.panelRight + 1
        && compactRace.strategyValWidth > 0
        && !compactRace.actionsOverflow
        && !compactRace.chipsOverflow
        && !compactRace.strategyOverflow,
      compactRace);

    // Resume del garaje: con un tipador vivo solo reenvia Alt+A (la marca de
    // parada sigue en pie hasta que el marco acepte); sin tipador borra la
    // marca y arma la cola. Se hace en un solo bloque sincrono para que el
    // latido del iframe no republique entre las dos lecturas.
    const garageResume = await cdp.evaluate(`(() => {
      const host = document.getElementById('nt-queue-panel');
      const root = host.shadowRoot;
      const btn = root.querySelector('[data-act="resume"]');
      const frame = document.querySelector('iframe');
      const w = frame.contentWindow;
      const previousTop = window.__ntaFrame;
      const previousInner = w.__ntaFrame;
      const previousPost = w.postMessage;
      const posted = [];
      let spied = false;
      try {
        w.postMessage = (data) => { posted.push(data); };
        spied = w.postMessage !== previousPost;
      } catch { spied = false; }

      const saved = { at: Date.now(), reason: 'tanda limit', holdMs: 6 * 3600000 };
      localStorage.setItem('ntQueue:stoppedAt', JSON.stringify(saved));
      window.__ntaFrame = { at: Date.now(), stopped: true, typing: false, chars: 0 };
      if (window.__ntaDebug && window.__ntaDebug.garagePaint) window.__ntaDebug.garagePaint();
      btn.click();
      const live = {
        marker: JSON.parse(localStorage.getItem('ntQueue:stoppedAt') || 'null'),
        why: JSON.parse(sessionStorage.getItem('ntQueue:why') || 'null'),
        hotkey: posted.find((item) => item && item.__ntaHotkey) || null,
      };

      window.__ntaFrame = null;
      w.__ntaFrame = { at: 0 };
      localStorage.setItem('ntQueue:stoppedAt', JSON.stringify(saved));
      btn.click();
      const idle = {
        marker: localStorage.getItem('ntQueue:stoppedAt'),
        lastStop: JSON.parse(localStorage.getItem('ntQueue:lastStop') || 'null'),
        why: JSON.parse(sessionStorage.getItem('ntQueue:why') || 'null'),
      };

      if (spied) w.postMessage = previousPost;
      window.__ntaFrame = previousTop;
      w.__ntaFrame = previousInner;
      localStorage.removeItem('ntQueue:stoppedAt');
      return { hasButton: Boolean(btn), spied, live, idle };
    })()`, true);
    check('the garage Resume button forwards Alt+A while a typer is alive',
      garageResume.hasButton && garageResume.spied
        && garageResume.live.marker && garageResume.live.marker.reason === 'tanda limit'
        && garageResume.live.hotkey && garageResume.live.hotkey.code === 'KeyA'
        && /Alt\+A/.test((garageResume.live.why && garageResume.live.why.text) || ''),
      garageResume);
    check('the garage Resume button clears the stop and re-arms without a typer',
      garageResume.idle.marker === null
        && garageResume.idle.lastStop && garageResume.idle.lastStop.clearedBy === 'manual'
        && /armed/.test((garageResume.idle.why && garageResume.idle.why.text) || ''),
      garageResume);
  } catch (error) {
    check('the garage panel follows the race panel theme without reloading', false, String(error && error.message));
  }

  // Nitro: se prueban las piezas sin una carrera real. `dddd` es la unica
  // palabra de 4+ letras que cabe; las de 1-3 se descartan a proposito. La
  // primera palabra tampoco se elige: el bucle no dispara en index 0.
  const nitro = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const content = 'a bb ccc dddd ' + 'x'.repeat(200);
    const target = d.nitroTarget(content);
    const word = target >= 0 ? content.slice(target).split(' ')[0] : '';
    const behind = d.nitroTarget(content, target + 1);
    const firstOnly = d.nitroTarget('dddd ' + 'x'.repeat(200));
    d.patchSession({ nitroDone: 0, nitroTries: 0 });
    const armed = d.shouldUseNitro(content, target);
    const app = {
      typedIndex: 0,
      handleKeyPress(kind, event) { if (event) this.typedIndex = 42; },
    };
    const used = d.useNitro(app);
    const fallback = [];
    const onKey = (event) => { if (event.key === 'Enter') fallback.push(event.type); };
    w.document.addEventListener('keydown', onKey);
    w.document.addEventListener('keyup', onKey);
    d.pressNitroKey();
    w.document.removeEventListener('keydown', onKey);
    w.document.removeEventListener('keyup', onKey);
    return { target, word, behind, firstOnly, armed, used, typed: app.typedIndex, fallback };
  })()`);
  check('nitro picks the longest word with at least 4 letters',
    nitro.word === 'dddd' && nitro.target > 0
      && nitro.behind === -1 && nitro.firstOnly === -1,
    nitro);
  check('nitro is armed by default and the character event consumes it',
    nitro.armed === true && nitro.used === true && nitro.typed === 42, nitro);
  check('nitro fallback sends one real Enter keydown/keyup',
    nitro.fallback.join(',') === 'keydown,keyup', nitro);

  // La vista previa es una fila real de TUNE: antes del salto dice la palabra
  // y sus caracteres; despues del unico nitro dice `used` y no deja estado
  // viejo en el gancho de diagnostico.
  const nitroPreview = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    if (d.hydrateAllViews) d.hydrateAllViews();
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const row = shadow.querySelector('[data-field="nitroPreview"]');
    const tune = shadow.querySelector('[data-tab-btn="tune"]');
    const stats = shadow.querySelector('[data-tab-btn="stats"]');
    if (!row || !d.nitroPreview || !tune) return { has: false };
    const paint = () => tune.click();

    const content = 'a bb ccc dddd ' + 'x'.repeat(200);
    const target = d.nitroTarget(content);
    d.patchSession({ nitroDone: 0, nitroTries: 0 });
    const armed = d.shouldUseNitro(content, target);
    paint();
    const before = { text: row.textContent.trim(), state: d.nitroPreview() };

    const staleArmed = d.shouldUseNitro(content, target + 1);
    paint();
    const stale = { text: row.textContent.trim(), state: d.nitroPreview() };

    d.patchSession({ nitroDone: 0, nitroTries: 0 });
    const armedAgain = d.shouldUseNitro(content, target);
    paint();
    d.patchSession({ nitroDone: 1 });
    paint();
    const used = { text: row.textContent.trim(), state: d.nitroPreview() };

    d.patchSession({ nitroDone: 0, nitroTries: 3 });
    d.shouldUseNitro(content, target);
    paint();
    const blocked = { text: row.textContent.trim(), state: d.nitroPreview() };

    d.patchSession({ nitroDone: 0, nitroTries: 0 });
    d.shouldUseNitro('', 0);
    paint();
    if (stats) stats.click();
    return { has: true, armed, armedAgain, staleArmed, before, stale, used, blocked };
  })()`);
  check('nitro target is visible before the jump and clears after use',
    nitroPreview.has && nitroPreview.armed === true && nitroPreview.armedAgain === true
      && nitroPreview.before.state && nitroPreview.before.state.word === 'dddd'
      && nitroPreview.before.state.chars === 4
      && /^dddd · 4 ch$/i.test(nitroPreview.before.text)
      && nitroPreview.used.text === 'used'
      && nitroPreview.used.state === null,
    nitroPreview);
  check('nitro preview drops a target that was left behind',
    nitroPreview.staleArmed === false
      && nitroPreview.stale.state === null
      && nitroPreview.stale.text === '—',
    nitroPreview);
  check('nitro preview reports blocked after three tries',
    nitroPreview.blocked.state === null
      && nitroPreview.blocked.text === 'blocked',
    nitroPreview);

  // Auto nitro es un interruptor visible, no una preferencia escondida: apagarlo
  // debe desarmar el salto, guardarse y volver por import; export lo conserva.
  const autoNitro = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const btn = shadow.querySelector('[data-toggle="useNitro"]');
    const txt = shadow.querySelector('[data-sw-txt="useNitro"]');
    const box = shadow.querySelector('[data-field="cfgText"]');
    const apply = shadow.querySelector('[data-act="import"]');
    const copy = shadow.querySelector('[data-act="export"]');
    if (!btn || !txt || !box || !apply || !copy || !d.autoNitro) return { has: false };

    const content = 'a bb ccc dddd ' + 'x'.repeat(200);
    const target = d.nitroTarget(content);
    const prefs = () => {
      try { return JSON.parse(w.localStorage.getItem('autoTyperPrefs') || '{}'); }
      catch { return {}; }
    };
    const state = () => ({
      on: d.autoNitro(),
      checked: btn.getAttribute('aria-checked'),
      label: (txt.textContent || '').trim(),
      armed: d.shouldUseNitro(content, target),
      stored: prefs().useNitro,
    });

    d.patchSession({ nitroDone: 0, nitroTries: 0 });
    const before = state();
    btn.click();
    const off = state();

    box.value = '{"useNitro":true}';
    apply.click();
    const imported = state();

    copy.click();
    let exported = null;
    try { exported = JSON.parse(box.value).useNitro; } catch { exported = 'bad json'; }
    d.patchSession({ nitroDone: 0, nitroTries: 0 });
    return { has: true, before, off, imported, exported };
  })()`);
  check('Auto nitro is a visible, persisted switch and round-trips in config',
    autoNitro.has && autoNitro.before.on === true
      && autoNitro.before.checked === 'true' && autoNitro.before.label === 'on'
      && autoNitro.before.armed === true
      && autoNitro.off.on === false && autoNitro.off.checked === 'false'
      && autoNitro.off.label === 'off' && autoNitro.off.armed === false
      && autoNitro.off.stored === false
      && autoNitro.imported.on === true && autoNitro.imported.armed === true
      && autoNitro.imported.stored === true && autoNitro.exported === true,
    autoNitro);

  // La estrategia se prueba en la funcion pura y en el selector real: primero
  // elige la palabra mas corta valida, ultima la mas atrasada y la estrategia
  // desconocida cae en longest para no apagar el nitro de una config vieja.
  const nitroStrategy = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const shadow = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const select = shadow.querySelector('[data-field="nitroStrategy"]');
    const box = shadow.querySelector('[data-field="cfgText"]');
    const apply = shadow.querySelector('[data-act="import"]');
    const copy = shadow.querySelector('[data-act="export"]');
    if (!select || !box || !apply || !copy || !d.setNitroStrategy) return { has: false };

    const content = 'a bb ccc dddd eeeeee ffff ' + 'x'.repeat(200);
    const pick = (strategy) => {
      const target = d.nitroTarget(content, 0, strategy);
      return target >= 0 ? content.slice(target).split(' ')[0] : '';
    };
    const picks = {
      longest: pick('longest'),
      first: pick('first'),
      last: pick('last'),
      bogus: pick('bogus'),
    };
    const prefs = () => {
      try { return JSON.parse(w.localStorage.getItem('autoTyperPrefs') || '{}'); }
      catch { return {}; }
    };

    d.setAutoNitro(true);
    d.patchSession({ nitroDone: 0, nitroTries: 0 });
    d.setNitroStrategy('longest');
    const before = {
      current: d.nitroStrategy(),
      value: select.value,
      armed: d.shouldUseNitro(content, d.nitroTarget(content)),
      options: Array.from(select.options).map((option) => option.value),
    };

    select.value = 'first';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const selected = {
      current: d.nitroStrategy(),
      value: select.value,
      stored: prefs().nitroStrategy,
      armed: d.shouldUseNitro(content, d.nitroTarget(content)),
    };

    copy.click();
    let exported = null;
    try { exported = JSON.parse(box.value).nitroStrategy; } catch { exported = 'bad json'; }

    box.value = '{"nitroStrategy":"last"}';
    apply.click();
    const imported = {
      current: d.nitroStrategy(),
      value: select.value,
      stored: prefs().nitroStrategy,
    };

    d.setNitroStrategy('longest');
    d.patchSession({ nitroDone: 0, nitroTries: 0 });
    return {
      has: true,
      picks,
      before,
      selected,
      exported,
      imported,
      restored: d.nitroStrategy(),
    };
  })()`);
  check('nitro strategy picks longest, first or last and falls back to longest',
    nitroStrategy.has
      && nitroStrategy.picks.longest === 'eeeeee'
      && nitroStrategy.picks.first === 'dddd'
      && nitroStrategy.picks.last === 'ffff'
      && nitroStrategy.picks.bogus === 'eeeeee',
    nitroStrategy);
  check('nitro strategy selector persists, imports and exports',
    nitroStrategy.before.current === 'longest' && nitroStrategy.before.value === 'longest'
      && nitroStrategy.before.armed === true
      && nitroStrategy.before.options.join(',') === 'longest,first,last'
      && nitroStrategy.selected.current === 'first' && nitroStrategy.selected.value === 'first'
      && nitroStrategy.selected.stored === 'first' && nitroStrategy.selected.armed === true
      && nitroStrategy.exported === 'first'
      && nitroStrategy.imported.current === 'last' && nitroStrategy.imported.value === 'last'
      && nitroStrategy.imported.stored === 'last'
      && nitroStrategy.restored === 'longest',
    nitroStrategy);

  // recordRace suma la contabilidad del nitro a la tanda una sola vez, con lo
  // que dejo la carrera en sus contadores (no con el historial recortado).
  const nitroSession = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    d.patchSession({ races: 0, nitroRaces: 0, nitroCharsTotal: 0 });
    d.seedRaceCounters({
      chars: 200, errors: 0, correct: 200, nitroChars: 9, nitroWords: 1,
      startedAt: Date.now() - 20000,
    });
    const recorded = d.recordRace();
    const after = d.session();
    d.seedHistory([]);
    return { recorded, after };
  })()`);
  check('recordRace adds the nitro to the session totals',
    nitroSession.recorded === true && nitroSession.after.nitroRaces === 1
      && nitroSession.after.nitroCharsTotal === 9, nitroSession);

  // El hueco se mide del final de una carrera al arranque de la siguiente. Un
  // descanso de 10 minutos no es tiempo muerto: no entra en la muestra.
  const gapMeasure = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    d.seedGaps([]);
    const now = Date.now();
    d.patchSession({ lastEndAt: now - 4200 });
    d.noteRaceStart(now);
    const afterShort = d.gaps().slice();
    d.patchSession({ lastEndAt: now - 10 * 60000 });
    d.noteRaceStart(now + 1000);
    const afterLong = d.gaps().slice();
    d.seedGaps([]);
    return { afterShort, afterLong };
  })()`);
  check('noteRaceStart records the dead time between races',
    gapMeasure.afterShort.length === 1
      && Math.abs(gapMeasure.afterShort[0] - 4200) <= 5, gapMeasure);
  check('a break longer than the gap ceiling is not counted as dead time',
    gapMeasure.afterLong.length === 1, gapMeasure);

  // La caja no puede leer un error generico solo porque diga "error". Se
  // inyectan los dos modales a la vez y el detector tiene que elegir el bueno.
  const boxPick = await cdp.evaluate(`(() => {
    const build = (text, setup) => {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:10px;top:10px;width:320px;height:100px;background:#111;z-index:99999';
      el.textContent = text;
      setup(el);
      document.body.appendChild(el);
      return el;
    };
    const error = build('Error: the garage failed to load. Try again.', (el) => { el.className = 'modal'; });
    // Una caja que el sitio dejo oculta no debe leerse aunque sea un .modal.
    const hiddenBox = build('Mystery Box opened! You earned 500 cash. Claim', (el) => {
      el.className = 'modal';
      el.setAttribute('aria-hidden', 'true');
    });
    // El aviso de sesion y la caja comparten selector: un role=dialog sin
    // clase .modal tambien tiene que encontrarse.
    const box = build('Mystery Box opened! You earned 750 cash. Claim', (el) => {
      el.setAttribute('role', 'dialog');
    });
    const hasHook = Boolean(window.__ntaDebug && window.__ntaDebug.boxModal);
    const pick = hasHook ? window.__ntaDebug.boxModal() : null;
    const out = { hasHook, picked: pick === box, text: pick ? pick.textContent : '' };
    error.remove();
    hiddenBox.remove();
    box.remove();
    return out;
  })()`);
  check('boxModal picks a Mystery Box in an ARIA dialog and skips hidden ones',
    boxPick.hasHook && boxPick.picked, boxPick);

  // El aviso "Communications Error / Connection Closed" tapa la app y deja las
  // teclas sin efecto. Tiene que reconocerse y tomar la salida del juego
  // (garaje), sin contar esa carrera como medida.
  const connection = await cdp.evaluate(`(async () => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    if (!d || !d.connectionText || !d.connectionExit || !d.connectionError) return { hasHook: false };

    const top = w.top;
    top.__ntaGarageAsks = 0;
    // La cola del marco superior escucha este aviso y navega a /garage. En el
    // banco eso recarga la pagina y cierra el target de CDP a mitad de la
    // prueba, asi que se intercepta: se cuenta el aviso sin entregarlo.
    const originalPost = top.postMessage;
    top.postMessage = function (data, origin) {
      if (data && data.__ntaNeedGarage === true) {
        top.__ntaGarageAsks += 1;
        return;
      }
      return originalPost.call(this, data, origin);
    };

    const modal = w.document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = 'position:fixed;left:20px;top:20px;width:420px;height:180px;background:#300;color:#fff;z-index:999999';
    modal.innerHTML = '<h2>Communications Error</h2>'
      + '<p>There was an error communicating with the race server. Message: Connection Closed</p>'
      + '<button id="conn-garage">Go To Your Garage</button>'
      + '<button id="conn-retry">Try Again</button>';
    w.__connClicks = [];
    modal.querySelector('#conn-garage').addEventListener('click', () => { w.__connClicks.push('garage'); });
    modal.querySelector('#conn-retry').addEventListener('click', () => { w.__connClicks.push('retry'); });
    w.document.body.appendChild(modal);

    const detected = d.connectionText(modal.textContent);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const seen = d.connectionError().seen > 0;

    d.patchSession({ chars: 200, correct: 200, errors: 0, startedAt: Date.now() - 20000, endedAt: 0 });
    const exit = d.connectionExit();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const clicks = w.__connClicks.slice();
    const asks = top.__ntaGarageAsks;
    const ended = d.clock().endedAt;

    d.patchSession({ chars: 0, correct: 0, errors: 0, startedAt: 0, endedAt: 0 });
    modal.remove();
    top.postMessage = originalPost;
    return { hasHook: true, detected, seen, exit, clicks, asks, ended };
  })()`, true);
  check('the race-server connection modal exits through the garage',
    connection.hasHook && connection.detected === true && connection.seen
      && connection.clicks.includes('garage') && !connection.clicks.includes('retry')
      && connection.asks >= 1, connection);
  check('a lost race-server connection is not recorded as a race',
    connection.exit === false && connection.ended === 0, connection);

  // El aviso «Too Many Disqualifications» no se cierra ni se reintenta. Antes
  // el modal dejaba seguir pulsando botones y el garaje abria otra carrera.
  const dqBlock = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    if (!d.recoverDq || !d.siteBlock || !d.clearSiteBlock) return { hasHook: false };

    d.clearSiteBlock();
    const modal = w.document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = 'position:fixed;left:20px;top:20px;width:420px;height:180px;background:#300;color:#fff;z-index:999999';
    modal.innerHTML = '<h2>Too Many Disqualifications</h2>'
      + '<p>You have disqualified 5 times in a row. You will need to wait a few minutes before you can race again.</p>'
      + '<button id="dq-block-garage">Go To Your Garage</button>'
      + '<button id="dq-block-retry" disabled>Try Again</button>';
    w.__dqBlockClicks = [];
    modal.querySelector('#dq-block-garage').addEventListener('click', () => { w.__dqBlockClicks.push('garage'); });
    modal.querySelector('#dq-block-retry').addEventListener('click', () => { w.__dqBlockClicks.push('retry'); });
    w.document.body.appendChild(modal);

    const result = d.recoverDq();
    const until = d.siteBlock();
    const clicks = w.__dqBlockClicks.slice();
    const counted = Boolean(d.clock && d.clock().endedAt);

    // Pasada la espera, el aviso viejo se abandona por el garaje; nunca por
    // «Race Again», que abriria una carrera sin comprobar antes el castigo.
    modal.remove();
    d.clearSiteBlock();
    w.localStorage.setItem('ntQueue:dqBlockUntil', String(Date.now() - 1000));
    const expired = w.document.createElement('div');
    expired.className = 'modal';
    expired.style.cssText = modal.style.cssText;
    expired.innerHTML = '<h2>Too Many Disqualifications</h2>'
      + '<button id="dq-expired-garage">Go To Your Garage</button>'
      + '<button id="dq-expired-retry">Try Again</button>';
    w.__dqExpiredClicks = [];
    expired.querySelector('#dq-expired-garage').addEventListener('click', () => { w.__dqExpiredClicks.push('garage'); });
    expired.querySelector('#dq-expired-retry').addEventListener('click', () => { w.__dqExpiredClicks.push('retry'); });
    w.document.body.appendChild(expired);
    const expiredResult = d.recoverDq();
    const expiredClicks = w.__dqExpiredClicks.slice();
    expired.remove();
    d.clearSiteBlock();

    return { hasHook: true, result, until, clicks, counted, now: Date.now(), expiredResult, expiredClicks };
  })()`);
  check('the site block modal waits instead of clicking a race button',
    dqBlock.hasHook && dqBlock.result === true
      && dqBlock.until > dqBlock.now + 600000
      && dqBlock.clicks.length === 0
      && dqBlock.counted === false, dqBlock);
  check('after the block wait, the stale modal leaves through the garage',
    dqBlock.expiredResult === true
      && dqBlock.expiredClicks.includes('garage')
      && !dqBlock.expiredClicks.includes('retry'), dqBlock);

  // Con el bot parado, el modal de DQ no debe seguir pulsando Race Again: es
  // justo el bucle que el Stop del garaje tiene que cortar.
  const dqStopped = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    if (!d.recoverDq || !d.patchSession) return { hasHook: false };

    d.patchSession({ stopped: true });
    const modal = w.document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = 'position:fixed;left:20px;top:20px;width:420px;height:180px;background:#300;color:#fff;z-index:999999';
    modal.innerHTML = '<h2>Disqualified</h2>'
      + '<p>You have been disqualified from this race.</p>'
      + '<button id="dq-stop-again">Race Again</button>'
      + '<button id="dq-stop-garage">Go To Your Garage</button>';
    w.__dqStopClicks = [];
    modal.querySelector('#dq-stop-again').addEventListener('click', () => { w.__dqStopClicks.push('again'); });
    modal.querySelector('#dq-stop-garage').addEventListener('click', () => { w.__dqStopClicks.push('garage'); });
    w.document.body.appendChild(modal);

    let result = false;
    try {
      result = d.recoverDq();
    } finally {
      modal.remove();
      d.patchSession({ stopped: false });
    }
    return { hasHook: true, result, clicks: w.__dqStopClicks.slice() };
  })()`);
  check('a stopped bot leaves the DQ modal alone instead of pressing Race Again',
    dqStopped.hasHook && dqStopped.result === true && dqStopped.clicks.length === 0, dqStopped);

  // La firma de la serie tiene que llevar el perfil: antes setPaceProfile la
  // llamaba sin el y la firma quedaba en ':count:min:max', asi que la serie de
  // otro perfil con el mismo rango se reutilizaba.
  const paceSig = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    if (!d.setPaceProfile || !d.paceSignature || !d.paceProfile) return { hasHook: false };
    const before = d.paceProfile();
    const original = d.paceSignature();
    d.setPaceProfile('soft');
    const soft = d.paceSignature();
    d.setPaceProfile(before);
    const restored = d.paceSignature();
    return { hasHook: true, before, original, soft, restored };
  })()`);
  check('the pace profile is part of the series signature',
    paceSig.hasHook
      && paceSig.soft.startsWith('soft:')
      && paceSig.restored === paceSig.original
      && paceSig.restored.startsWith(`${paceSig.before}:`), paceSig);

  // El contador de sesión empieza en 1, pero 0 significa "sin ciclo": el
  // primer bump debe dar 1. Un valor corrupto tampoco puede devolver 1.
  const countRead = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const key = 'wpmCount';
    const saved = w.localStorage.getItem(key);
    w.localStorage.setItem(key, '0');
    const zero = d.readCount(key);
    w.localStorage.setItem(key, 'abc');
    const bad = d.readCount(key);
    w.localStorage.setItem(key, '3');
    const three = d.readCount(key);
    if (saved === null) w.localStorage.removeItem(key);
    else w.localStorage.setItem(key, saved);
    return { zero, bad, three, hook: typeof d.readCount === 'function' };
  })()`);
  check('readCount treats 0 and garbage as a fresh cycle',
    countRead.hook && countRead.zero === 0 && countRead.bad === 0
      && countRead.three === 3, countRead);

  // Tendencia de precision: se puede empezar de cero sin borrar carreras.
  const accReset = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    if (!d.seedRaceCounters || !d.noteAccuracyDelta || !d.resetAccuracy || !d.accuracyTrend) {
      return { hasHook: false };
    }
    // Primero de cero: la memoria puede traer muestras de pruebas anteriores.
    d.resetAccuracy();
    d.seedRaceCounters({ chars: 100, correct: 95, errors: 5 });
    d.noteAccuracyDelta(95, 'reset-test');
    const before = d.accuracyTrend();
    d.resetAccuracy();
    const after = d.accuracyTrend();
    // Se lee antes de sembrar la muestra del informe: el reset borra la clave.
    const stored = w.localStorage.getItem('autoTyperAccDeltas');
    d.noteAccuracyDelta(95, 'diag-test');
    const report = d.diagnostic ? d.diagnostic() : null;
    return {
      hasHook: true,
      before,
      after,
      stored,
      model: report && report.model ? report.model : null,
      capHoldMs: report && report.typing ? report.typing.capHoldMs : null,
      title: d.accuracyTitle ? d.accuracyTitle() : null,
    };
  })()`);
  check('the accuracy trend can be reset without touching race history',
    accReset.hasHook && accReset.before.n === 1 && accReset.after.n === 0
      && accReset.stored === null, accReset);
  check('the diagnostic report carries the accuracy trend and the cap hold',
    accReset.model && accReset.model.samples === 1
      && Array.isArray(accReset.model.last) && accReset.model.last.length === 1
      && Number.isFinite(accReset.model.average)
      && Number.isFinite(accReset.capHoldMs), accReset);
  check('the model delta tooltip spells the last samples and the reset key',
    typeof accReset.title === 'string'
      && /last /.test(accReset.title) && /Alt\+Shift\+C/.test(accReset.title), accReset.title);

  // CSV del panel: una pasada sin mean_pts no puede pintarse como +0.00 pts.
  const liveCsv = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    if (!d.parseLiveCsv) return { hasHook: false };
    const rows = d.parseLiveCsv('at,races,deltas,mean_pts,sd_pts\\n2026-01-01,5,1 2,,');
    const json = d.parseLiveJson
      ? d.parseLiveJson(JSON.stringify({ passes: [{ at: '2026-01-01T00:00:00Z', races: 5, mean: 1.2 }] }))
      : [];
    return {
      hasHook: true,
      meanNaN: Number.isNaN(rows[0].mean),
      sdNaN: Number.isNaN(rows[0].sd),
      jsonSdNaN: json.length === 1 && Number.isNaN(json[0].sd),
    };
  })()`);
  check('a live pass without mean or sd stays unscored, CSV and JSON alike',
    liveCsv.hasHook && liveCsv.meanNaN && liveCsv.sdNaN && liveCsv.jsonSdNaN, liveCsv);

  // Topes diarios: la foto de la tanda rellena el hueco si la clave suelta
  // falta; si la clave existe manda ella, aunque la foto traiga otro valor.
  await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    w.localStorage.setItem('autoTyperSessionCounters', JSON.stringify({
      at: Date.now(), dailyRaceLimit: 37, dailyXpLimit: 44000,
    }));
    w.localStorage.removeItem('autoTyperDailyRaceLimit');
    w.localStorage.removeItem('autoTyperDailyXpLimit');
  })()`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(panelReady, 15000, 'the panel after the daily snapshot');
  const dailyRestored = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    return w.__ntaDebug.session();
  })()`);
  check('daily limits resume from the session snapshot when the keys are gone',
    dailyRestored.dailyRaceLimit === 37 && dailyRestored.dailyXpLimit === 44000,
    { dailyRaceLimit: dailyRestored.dailyRaceLimit, dailyXpLimit: dailyRestored.dailyXpLimit });

  // Dos pestañas REALES del mismo perfil. El guardia local elige una copia por
  // ventana; el lease de localStorage elige una pestaña. Solo la que lo tiene
  // puede escribir, mandar stickers o abrir/reclamar; la otra espera y releva.
  // Se carga el mismo fixture que el resto del banco: el panel vive en el
  // iframe `/race/`, no en la pagina de arriba.
  let tabA = null;
  let tabB = null;
  let closedTab = '';
  try {
    // El banco principal ya termino. Su iframe sigue latiendo y renovaria el
    // lease de su pestaña, dejando a las dos nuevas en espera para siempre; se
    // saca de la pagina y se limpia el almacenamiento del origen. Las dos
    // pestañas de prueba empiezan asi con el mismo estado vacio.
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(300);
    await cdp.send('Storage.clearDataForOrigin', {
      origin: new URL(appUrl).origin,
      storageTypes: 'local_storage',
    });

    tabA = await openTab(devtoolsPort, appUrl);
    tabB = await openTab(devtoolsPort, appUrl);

    const roleRead = `(() => {
      const frame = document.querySelector('iframe');
      const w = frame && frame.contentWindow;
      if (!w || !w.document) return { panel: false, hook: false, role: null, registry: -1, lease: null };
      return {
        panel: Boolean(w.document.getElementById('nt-autotyper-panel')),
        hook: Boolean(w.__ntaDebug && w.__ntaDebug.role),
        role: w.__ntaDebug && w.__ntaDebug.role ? w.__ntaDebug.role() : null,
        registry: Array.isArray(w.__ntaInstances) ? w.__ntaInstances.length : -1,
        lease: w.__ntaDebug && w.__ntaDebug.tabLease ? w.__ntaDebug.tabLease() : null,
      };
    })()`;

    await waitFor(async () => {
      const one = await tabA.evaluate(roleRead);
      const two = await tabB.evaluate(roleRead);
      return one.panel && one.hook && two.panel && two.hook;
    }, 15000, 'two race tabs');

    // El primer latido puede pillar a las dos antes de que la segunda lea el
    // lease; se espera a que la eleccion se asiente en vez de leer el mismo tick.
    // Si no se asienta, el error lleva los dos roles y leases para no adivinar.
    let a0 = await tabA.evaluate(roleRead);
    let b0 = await tabB.evaluate(roleRead);
    const leaseUntil = Date.now() + 15000;
    while (Date.now() < leaseUntil) {
      a0 = await tabA.evaluate(roleRead);
      b0 = await tabB.evaluate(roleRead);
      if (a0.role && b0.role && a0.role.primary !== b0.role.primary) break;
      await sleep(250);
    }
    if (!a0.role || !b0.role || a0.role.primary === b0.role.primary) {
      throw new Error(`timed out waiting for one tab to own the lease: ${JSON.stringify({
        a: a0.role, aLease: a0.lease, b: b0.role, bLease: b0.lease,
      })}`);
    }
    check('two tabs: each tab mounts its own panel and guard',
      a0.panel && b0.panel && a0.hook && b0.hook
        && a0.registry === 1 && b0.registry === 1,
      { a: a0, b: b0 });
    check('two tabs: exactly one tab is primary and the other stands by',
      Boolean(a0.role && b0.role)
        && a0.role.primary !== b0.role.primary
        && (a0.role.primary ? a0.role.standby === false : a0.role.standby === true)
        && (b0.role.primary ? b0.role.standby === false : b0.role.standby === true),
      { a: a0.role, b: b0.role });
    check('two tabs: both see the same lease owner and it belongs to one of them',
      a0.lease && b0.lease
        && a0.lease.owner === b0.lease.owner
        && a0.lease.tab !== b0.lease.tab
        && a0.lease.mine !== b0.lease.mine,
      { a: a0.lease, b: b0.lease });

    const leader = a0.role.primary
      ? { tab: tabA, name: 'A' }
      : { tab: tabB, name: 'B' };
    const follower = leader.name === 'A' ? tabB : tabA;

    // Parar la pestaña que lleva el turno lo suelta de verdad: el guardia de
    // esa pestaña ya no lo renueva y la otra toma el lease en su siguiente
    // latido, sin recargar ni tocar la carrera de la primera.
    await leader.tab.evaluate(`(() => {
      const w = document.querySelector('iframe').contentWindow;
      if (w.__ntaDebug && w.__ntaDebug.stop) w.__ntaDebug.stop();
      return true;
    })()`);
    await waitFor(async () => {
      const next = await follower.evaluate(roleRead);
      return Boolean(next.role) && next.role.primary === true;
    }, 5000, 'the other tab to take the lease');
    // La pestaña que solto el turno puede tardar un latido en pintar su propio
    // rol: se espera a que se declare standby antes de comparar los dos estados.
    await waitFor(async () => {
      const next = await leader.tab.evaluate(roleRead);
      return Boolean(next.role) && next.role.primary === false && next.role.standby === true;
    }, 5000, 'the old owner to stand by');

    const afterStop = await follower.evaluate(roleRead);
    const stopped = await leader.tab.evaluate(roleRead);
    check('two tabs: stopping the owner hands the lease to the other tab',
      afterStop.role.primary === true && afterStop.role.standby === false
        && afterStop.lease && afterStop.lease.mine === true
        && stopped.role.primary === false && stopped.role.standby === true,
      { after: afterStop, stopped });

    // Cerrar la pestaña que ya solto el turno no puede dejar a la otra en
    // espera: el lease sigue siendo de la superviviente.
    try { await leader.tab.send('Page.close'); } catch { /* ya cerro */ }
    try { leader.tab.close(); } catch { /* ws cerrado */ }
    closedTab = leader.name;
    await sleep(700);
    const survivor = await follower.evaluate(roleRead);
    check('two tabs: closing the old owner leaves the survivor primary',
      survivor.role.primary === true && survivor.role.standby === false
        && survivor.lease && survivor.lease.mine === true,
      survivor);
  } catch (error) {
    check('two tabs: the harness can open and inspect two race tabs', false, String(error && error.message));
  } finally {
    for (const tab of [tabA, tabB]) {
      if (!tab) continue;
      if (closedTab === 'A' && tab === tabA) continue;
      if (closedTab === 'B' && tab === tabB) continue;
      try { await tab.send('Page.close'); } catch { /* el target ya cerro */ }
      try { tab.close(); } catch { /* el websocket ya cerro */ }
    }
  }

  // El lease pertenece a la PESTAÑA, no a la mitad que lo escribio: la cola de
  // arriba y el tipador del marco tienen INSTANCE_ID distinto. Se escribe un
  // lease con el tabId de esta pestaña y un id ajeno (la mitad hermana) y se
  // suelta por el camino normal, sin force: tiene que desaparecer. El de otra
  // pestaña no se toca.
  await cdp.send('Page.navigate', { url: appUrl });
  await waitFor(panelReady, 15000, 'the panel for the lease release test');
  const leaseRelease = await cdp.evaluate(`(() => {
    const frame = document.querySelector('iframe');
    const w = frame && frame.contentWindow;
    if (!w || !w.__ntaDebug || !w.__ntaDebug.releaseLease) return { ready: false };
    const info = w.__ntaDebug.tabLease();
    const KEY = 'nta:tabLease';
    const write = (value) => w.localStorage.setItem(KEY, JSON.stringify(value));
    write({ tab: info.tab, id: 'sibling-half', at: Date.now(), reason: 'harness' });
    const released = w.__ntaDebug.releaseLease();
    const afterSibling = w.localStorage.getItem(KEY);
    write({ tab: 'another-tab', id: 'other-half', at: Date.now(), reason: 'harness' });
    const kept = w.__ntaDebug.releaseLease();
    const afterOther = w.localStorage.getItem(KEY);
    w.localStorage.removeItem(KEY);
    return { ready: true, tab: info.tab, released, afterSibling, kept, afterOther };
  })()`);
  check('lease: a tab releases the lease written by its sibling half',
    leaseRelease.ready === true && leaseRelease.released === true && leaseRelease.afterSibling === null,
    leaseRelease);
  check('lease: releasing never drops another tab\'s lease',
    leaseRelease.ready === true && leaseRelease.kept === false && leaseRelease.afterOther !== null,
    leaseRelease);

  // El boton Stop del panel de carrera no se queda muerto: cuando el bot esta
  // parado pasa a Resume y hace lo mismo que Alt+A. Se prueba al final para
  // que el arranque de la tanda no interfiera con otras comprobaciones.
  await waitFor(panelReady, 15000, 'the panel for the resume button test');
  await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    d.patchSession({
      races: 0, xp: 0, raceLimit: 0, timeLimit: 0, xpLimit: 0,
      dailyRaceLimit: 0, dailyXpLimit: 0, activeOn: 0,
    });
    d.stop();
    return true;
  })()`);
  await sleep(120);
  const panelResume = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    d.paint();
    const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const stop = s.querySelector('.stop');
    const toggle = s.querySelector('.toggle');
    const before = {
      text: (stop.textContent || '').trim(),
      disabled: stop.disabled,
      toggleDisabled: toggle.disabled,
      title: stop.title,
    };
    stop.click();
    const after = {
      text: (stop.textContent || '').trim(),
      marker: w.localStorage.getItem('ntQueue:stoppedAt'),
    };
    return { before, after };
  })()`);
  check('the race panel Stop button becomes Resume when the bot is stopped',
    panelResume.before.text === 'Resume' && panelResume.before.disabled === false
      && panelResume.before.toggleDisabled === true
      && /Alt\+A/.test(panelResume.before.title), panelResume);
  check('the race panel Resume button clears the stop like Alt+A',
    panelResume.after.text === 'Stop' && panelResume.after.marker === null, panelResume);

  // La comparacion de versiones es numerica por segmento, no lexica: 8.100.0
  // tiene que ser mas nueva que 8.99.0.
  const versionCheck = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    return {
      newer: w.__ntaDebug.versionNewer('8.100.0', '8.99.0'),
      same: w.__ntaDebug.versionNewer('8.0.0', '8.0.0'),
      older: w.__ntaDebug.versionNewer('7.99.0', '8.0.0'),
    };
  })()`);
  check('version compare treats each numeric segment correctly',
    versionCheck.newer === true && versionCheck.same === false && versionCheck.older === false, versionCheck);

  const panelUpdate = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const badge = s.querySelector('.ghlink');
    w.localStorage.setItem('nta:update', JSON.stringify({ at: Date.now(), latest: '99.0.0' }));
    d.paint();
    const shown = { hidden: badge.hidden, display: getComputedStyle(badge).display, text: badge.textContent.trim(), title: badge.title, aria: badge.getAttribute('aria-label') };
    w.localStorage.removeItem('nta:update');
    d.paint();
    return { shown, hidden: badge.hidden };
  })()`);
  check('the race panel flags a newer Gist version',
    panelUpdate.shown.hidden === false && panelUpdate.shown.display !== 'none'
      && panelUpdate.shown.text === 'update' && /99\.0\.0/.test(panelUpdate.shown.title)
      && /download/i.test(panelUpdate.shown.title) && /download/i.test(panelUpdate.shown.aria)
      && panelUpdate.hidden === true, panelUpdate);

  const githubUpdate = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const link = s.querySelector('.ghlink');
    if (!link) return { has: false };
    w.localStorage.removeItem('nta:update');
    d.paint();
    const hidden = { hidden: link.hidden, display: getComputedStyle(link).display };
    w.localStorage.setItem('nta:update', JSON.stringify({ at: Date.now(), latest: '99.0.0' }));
    d.paint();
    const rect = link.getBoundingClientRect();
    const shown = {
      hidden: link.hidden,
      text: (link.textContent || '').trim(),
      href: link.href,
      target: link.target,
      rel: link.rel,
      width: rect.width,
      display: getComputedStyle(link).display,
      title: link.title,
      aria: link.getAttribute('aria-label'),
    };
    w.localStorage.removeItem('nta:update');
    d.paint();
    return { has: true, hidden, shown };
  })()`);
  check('the header update link only appears when a newer version is available',
    githubUpdate.has && githubUpdate.hidden.hidden === true && githubUpdate.hidden.display === 'none'
      && githubUpdate.shown.hidden === false && githubUpdate.shown.display !== 'none'
      && /^update$/i.test(githubUpdate.shown.text)
      && /^https:\/\/github\.com\/ezurinho\/nitro-wraith\/releases\/latest\/download\/nitro-wraith\.user\.js$/.test(githubUpdate.shown.href)
      && githubUpdate.shown.target === '_blank' && /noopener/.test(githubUpdate.shown.rel)
      && githubUpdate.shown.width > 0 && /99\.0\.0/.test(githubUpdate.shown.title)
      && /download/i.test(githubUpdate.shown.aria), githubUpdate);

  // Las dos puertas que no se saltan con Resume: tope diario y horas activas.
  // Se usa el override del banco para no depender de las carreras de hoy.
  const gateResume = await cdp.evaluate(`(() => {
    const w = document.querySelector('iframe').contentWindow;
    const d = w.__ntaDebug;
    const s = w.document.getElementById('nt-autotyper-panel').shadowRoot;
    const stop = s.querySelector('.stop');
    const marker = () => w.localStorage.getItem('ntQueue:stoppedAt');
    const read = () => ({ text: (stop.textContent || '').trim(), marker: marker() });

    d.patchSession({ races: 0, xp: 0, raceLimit: 0, timeLimit: 0, xpLimit: 0, dailyRaceLimit: 1, dailyXpLimit: 0, activeOn: 0 });
    d.setDailyCounts(3, 0);
    d.stop(); d.paint();
    stop.click();
    const cap = read();

    const hour = new Date().getHours();
    d.patchSession({ dailyRaceLimit: 0, activeOn: 1, activeStart: (hour + 1) % 24, activeEnd: (hour + 2) % 24 });
    d.setDailyCounts(0, 0);
    d.stop(); d.paint();
    stop.click();
    const hours = read();

    d.patchSession({ activeOn: 0 });
    d.clearDailyCounts();
    if (!marker()) d.stop();
    d.paint();
    stop.click();
    const cleared = read();
    return { cap, hours, cleared };
  })()`);
  check('the race Resume still respects the daily race cap',
    gateResume.cap.text === 'Resume' && gateResume.cap.marker !== null, gateResume);
  check('the race Resume still respects active hours',
    gateResume.hours.text === 'Resume' && gateResume.hours.marker !== null, gateResume);
  check('the race Resume clears the stop once both gates are open',
    gateResume.cleared.text === 'Stop' && gateResume.cleared.marker === null, gateResume);

  // Re-login con el metodo recordado: la ultima forma de entrar (SSO o el
  // formulario) manda sobre CONFIG mientras el recuerdo sea reciente. La cola
  // solo corre en una ventana de arriba, asi que esto va en su propia pestaña
  // /login con botones falsos, no en el iframe de la carrera.
  const loginTab = await openTab(devtoolsPort, new URL('/login', appUrl).href);
  let loginMemory = { hasHook: false };
  let loginAlways = { hasHook: false };
  try {
    await waitFor(async () => {
      try {
        return await loginTab.evaluate('Boolean(window.__ntaDebug && window.__ntaDebug.loginTarget && window.__ntaDebug.loginMethodFor && window.__ntaDebug.loginRecoveryClear && window.__ntaDebug.loginReloadPending && window.__ntaDebug.loginReason)');
      } catch {
        return false;
      }
    }, 15000, 'the login hooks');
    loginMemory = await loginTab.evaluate(`(() => {
    const w = window;
    const d = w.__ntaDebug;
    if (!d.loginTarget || !d.loginMethodFor || !d.loginReason) return { hasHook: false };

    const box = w.document.createElement('div');
    box.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:320px;background:#111;z-index:99999';
    box.innerHTML = '<button class="btn--google">Log In with Google</button>'
      + '<button class="btn--clever">Log In with Clever</button>'
      + '<a class="btn--classlink" href="#">Log In with ClassLink</a>'
      + '<input class="btn--facebook" type="button" value="Log In with Facebook">'
      + '<button class="btn--google" id="lm-signup">Sign up with Google</button>'
      + '<form><input type="text"><input type="password"><button type="submit" id="lm-submit">Log In</button>'
      + '<input type="submit" id="lm-input-submit" value="Log In"></form>';
    w.document.body.appendChild(box);

    const byText = (text) => [...box.querySelectorAll('button, a, input')]
      .find((el) => ((el.tagName === 'INPUT' ? el.value : el.textContent) || '').trim() === text);

    const seeded = (method, at) => {
      w.localStorage.setItem('ntQueue:lastLogin', JSON.stringify({ method, at }));
      const target = d.loginTarget();
      return { provider: target.provider, manual: target.manual, button: target.button };
    };

    const now = Date.now();
    const google = seeded('google', now);
    const clever = seeded('clever', now);
    const facebook = seeded('facebook', now);
    const manual = seeded('manual', now);
    const stale = seeded('google', now - 31 * 24 * 60 * 60 * 1000);
    const broken = seeded('myspace', now);
    const reason = {
      timeout: d.loginReason('#timeout-1800-1794025546-1794023746'),
      expired: d.loginReason('#expired-123'),
      empty: d.loginReason(''),
    };

    // Recordado google, pero su boton no esta en la pagina: NO se cambia a
    // classlink, aunque ese si este; pulsar otro SSO podria abrir otra cuenta.
    w.localStorage.setItem('ntQueue:lastLogin', JSON.stringify({ method: 'google', at: now }));
    const googleBtn = byText('Log In with Google');
    googleBtn.remove();
    const fallback = d.loginTarget();
    box.appendChild(googleBtn);

    const classify = {
      google: d.loginMethodFor(byText('Log In with Google')),
      clever: d.loginMethodFor(byText('Log In with Clever')),
      classlink: d.loginMethodFor(byText('Log In with ClassLink')),
      facebook: d.loginMethodFor(byText('Log In with Facebook')),
      signup: d.loginMethodFor(w.document.getElementById('lm-signup')),
      manual: d.loginMethodFor(w.document.getElementById('lm-submit')),
      inputManual: d.loginMethodFor(w.document.getElementById('lm-input-submit')),
      other: d.loginMethodFor(box),
    };

    box.remove();
    w.localStorage.removeItem('ntQueue:lastLogin');
    return { hasHook: true, google, clever, facebook, manual, stale, broken, fallback, classify, reason };
  })()`);
    loginAlways = await loginTab.evaluate(`(async () => {
      const d = window.__ntaDebug;
      if (!d.loginTick || !d.loginScheduled || !d.loginCancel || !d.loginReloadPlan || !d.loginReloadPending || !d.loginRetryPending) return { hasHook: false };

      // Aisla de lo que el latido de la pagina haya podido programar ya.
      d.loginCancel();
      sessionStorage.removeItem('ntQueue:reloginPending');
      sessionStorage.removeItem('ntQueue:reloginAttempts');
      sessionStorage.removeItem('ntQueue:loginReloads');
      localStorage.removeItem('ntQueue:lastLogin');

      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:240px;background:#111;z-index:99999';
      box.innerHTML = '<button class="btn--google">Log In with Google</button>'
        + '<form><input type="password"><button type="submit">Log In</button></form>';
      document.body.appendChild(box);
      const google = box.querySelector('button.btn--google');
      let clicks = 0;
      google.addEventListener('click', () => { clicks += 1; });

      const now = Date.now();

      // Ultimo login manual: no se pulsa SSO.
      localStorage.setItem('ntQueue:lastLogin', JSON.stringify({ method: 'manual', at: now }));
      d.loginTick();
      const manualScheduled = d.loginScheduled();

      // SSO recordado: se programa siempre, sin hash de caducidad y con el bot
      // desarmado. Esta pestaña esta en /login y no tiene sesion.
      localStorage.setItem('ntQueue:lastLogin', JSON.stringify({ method: 'google', at: now }));
      d.loginTick();
      const ssoScheduled = d.loginScheduled();
      const ssoClicks = clicks;
      d.loginCancel();

      // Una recarga reciente deja 2/3: el aviso debe decir el presupuesto real.
      sessionStorage.setItem('ntQueue:loginReloads', JSON.stringify([Date.now() - 1000]));

      // Una recarga reciente deja 2/3: el aviso debe decir el presupuesto real.
      sessionStorage.setItem('ntQueue:loginReloads', JSON.stringify([Date.now() - 1000]));

      // El hash #timeout-... deja la pantalla muerta: primero se recarga sin el
      // hash y, en el siguiente pase, se pulsa el SSO recordado.
      history.replaceState(null, '', location.pathname + location.search + '#timeout-1800-1794025546-1794023746');
      d.loginTick();
      const timeout = {
        pending: d.loginReloadPending(),
        scheduled: d.loginScheduled(),
        hash: location.hash,
        badge: Boolean(document.querySelector('[data-nta-login-refresh]')),
        badgeText: (document.querySelector('[data-nta-login-refresh]') || {}).textContent || '',
        buttons: [...document.querySelectorAll('[data-nta-login-refresh] button')].map((button) => button.textContent),
      };
      const cancelRefresh = document.querySelector('[data-nta-login-refresh] [data-nta-login-refresh-cancel]');
      timeout.hasCancel = Boolean(cancelRefresh);
      if (cancelRefresh) cancelRefresh.click();
      timeout.afterCancelBadge = Boolean(document.querySelector('[data-nta-login-refresh]'));
      timeout.afterCancelNotice = Boolean(document.querySelector('[data-nta-login-cancelled]'));
      timeout.afterCancelNoticeText = (document.querySelector('[data-nta-login-cancelled]') || {}).textContent || '';
      timeout.afterCancelPending = d.loginReloadPending();
      d.loginTick();
      timeout.afterCancelScheduled = d.loginScheduled();
      d.loginCancel();
      d.loginTick();
      timeout.afterScheduled = d.loginScheduled();
      timeout.afterHash = location.hash;
      timeout.afterBadge = Boolean(document.querySelector('[data-nta-login-refresh]'));
      d.loginCancel();

      // Presupuesto de recargas: tres recientes bloquean la cuarta; pasada la
      // ventana de 30 min vuelve a haber margen.
      sessionStorage.removeItem('ntQueue:loginReloads');
      const reloadFree = d.loginReloadPlan();
      sessionStorage.setItem('ntQueue:loginReloads',
        JSON.stringify([now - 1000, now - 2000, now - 3000]));
      const reloadCapped = d.loginReloadPlan();
      sessionStorage.setItem('ntQueue:loginReloads',
        JSON.stringify([now - 31 * 60000, now - 32 * 60000, now - 33 * 60000]));
      const reloadExpired = d.loginReloadPlan();

      // Presupuesto gastado: no se recarga en silencio; queda un aviso visible
      // que pide entrar a mano. Después se salda para el caso de recuperación.
      sessionStorage.setItem('ntQueue:loginReloads',
        JSON.stringify([now - 1000, now - 2000, now - 3000]));
      history.replaceState(null, '', location.pathname + location.search + '#timeout-1800-1794025546-1794023746');
      d.loginTick();
      const spentNotice = document.querySelector('[data-nta-login-status="budget"]');
      const spentStyle = spentNotice ? getComputedStyle(spentNotice) : null;
      const spentRect = spentNotice ? spentNotice.getBoundingClientRect() : null;
      const reloadSpent = {
        notice: Boolean(spentNotice),
        text: (spentNotice || {}).textContent || '',
        pending: d.loginReloadPending(),
        visual: spentNotice ? {
          role: spentNotice.getAttribute('role'),
          live: spentNotice.getAttribute('aria-live'),
          atomic: spentNotice.getAttribute('aria-atomic'),
          position: spentStyle.position,
          zIndex: Number(spentStyle.zIndex),
          pointerEvents: spentStyle.pointerEvents,
          fontSize: parseFloat(spentStyle.fontSize),
          width: Math.round(spentRect.width),
          height: Math.round(spentRect.height),
          withinViewport: spentRect.left >= 0 && spentRect.top >= 0
            && spentRect.right <= innerWidth && spentRect.bottom <= innerHeight,
          noClip: spentNotice.scrollWidth <= spentNotice.clientWidth + 1
            && spentNotice.scrollHeight <= spentNotice.clientHeight + 1,
        } : null,
      };

      // El presupuesto corto no es una rendicion: queda programado otro intento
      // desatendido con el mismo SSO recordado.
      const retryAfterSpent = {
        pending: d.loginRetryPending(),
        inMs: d.loginRetryIn(),
        stored: Number(sessionStorage.getItem('ntQueue:loginRetryAt')) || 0,
      };

      // La tarjeta se retira sola: no se deja un aviso permanente tapando el
      // login. Se espera al temporizador real, no se simula el reloj.
      await new Promise((resolve) => setTimeout(resolve, 9600));
      reloadSpent.dismissed = !document.querySelector('[data-nta-login-status="budget"]');
      const retryAfterWait = { pending: d.loginRetryPending(), inMs: d.loginRetryIn() };
      d.loginCancel();
      const retryAfterCancel = {
        pending: d.loginRetryPending(),
        stored: sessionStorage.getItem('ntQueue:loginRetryAt'),
      };

      // Un login bueno salda el presupuesto: intentos y recargas vuelven a cero.
      sessionStorage.setItem('ntQueue:loginReloads', JSON.stringify([now - 1000, now - 2000, now - 3000]));
      sessionStorage.setItem('ntQueue:reloginAttempts', '3');
      const recovery = d.loginRecoveryClear();

      // Un login manual puede llegar horas despues. La cola debe rearmarse si
      // el pendiente sigue dentro del margen de 24 h, y no si es de otro dia.
      d.armedReset();
      sessionStorage.setItem('ntQueue:reloginPending', JSON.stringify({ at: Date.now() - 20 * 3600000 }));
      const resumeFresh = d.reloginResume();
      d.armedReset();
      sessionStorage.setItem('ntQueue:reloginPending', JSON.stringify({ at: Date.now() - 25 * 3600000 }));
      const resumeStale = d.reloginResume();
      d.armedReset();

      d.loginCancel();
      box.remove();
      localStorage.removeItem('ntQueue:lastLogin');
      sessionStorage.removeItem('ntQueue:loginReloads');
      sessionStorage.removeItem('ntQueue:reloginPending');
      sessionStorage.removeItem('ntQueue:reloginAttempts');
      return { hasHook: true, manualScheduled, ssoScheduled, ssoClicks, timeout, clicks, reloadFree, reloadCapped, reloadExpired, reloadSpent,
        retry: { afterSpent: retryAfterSpent, afterWait: retryAfterWait, afterCancel: retryAfterCancel },
        resume: { fresh: resumeFresh, stale: resumeStale }, recovery };
    })()`, true);
  } finally {
    loginTab.close();
  }
  check('login memory: a recent SSO provider is the one the bot would press',
    loginMemory.hasHook && loginMemory.google.provider === 'google'
      && loginMemory.clever.provider === 'clever'
      && loginMemory.facebook.provider === 'facebook', loginMemory);
  check('login memory: a manual sign-in never triggers an SSO by itself',
    loginMemory.hasHook && loginMemory.manual.manual === true && loginMemory.manual.button === null,
    loginMemory.manual);
  check('login memory: a 30-day-old or unknown provider falls back to CONFIG',
    loginMemory.hasHook && loginMemory.stale.provider === 'classlink' && loginMemory.broken.provider === 'classlink',
    { stale: loginMemory.stale, broken: loginMemory.broken });
  check('login memory: a missing remembered button never switches to another SSO',
    loginMemory.hasHook && loginMemory.fallback.provider === 'google'
      && loginMemory.fallback.manual === false && loginMemory.fallback.button === null,
    loginMemory.fallback);
  check('login: the timeout hash is logged as timeout, not as its timestamps',
    loginMemory.hasHook && loginMemory.reason
      && loginMemory.reason.timeout === 'timeout'
      && loginMemory.reason.expired === 'expired'
      && loginMemory.reason.empty === '',
    loginMemory.reason);
  check('login buttons are classified by provider and the form by its password field',
    loginMemory.hasHook
      && loginMemory.classify.google === 'google' && loginMemory.classify.clever === 'clever'
      && loginMemory.classify.classlink === 'classlink' && loginMemory.classify.facebook === 'facebook'
      && loginMemory.classify.signup === null && loginMemory.classify.manual === 'manual'
      && loginMemory.classify.other === null,
    loginMemory.classify);
  check('login memory: an SSO drawn as an input is found and classified',
    loginMemory.hasHook && /facebook/.test(loginMemory.facebook.button || '')
      && loginMemory.classify.facebook === 'facebook',
    { target: loginMemory.facebook, classified: loginMemory.classify.facebook });
  check('login form: an input submit is still classified as manual',
    loginMemory.hasHook && loginMemory.classify.inputManual === 'manual',
    loginMemory.classify.inputManual);
  check('login always: a manual last sign-in still never presses an SSO',
    loginAlways.hasHook && loginAlways.manualScheduled === false, loginAlways);
  check('login always: a remembered SSO is scheduled without a timeout hash or an armed bot',
    loginAlways.hasHook && loginAlways.ssoScheduled === true && loginAlways.ssoClicks === 0, loginAlways);
  check('login: a timeout hash is refreshed before the remembered SSO is pressed',
    loginAlways.hasHook && loginAlways.timeout
      && loginAlways.timeout.pending === true
      && loginAlways.timeout.scheduled === false
      && loginAlways.timeout.hash === ''
      && loginAlways.timeout.afterHash === ''
      && loginAlways.timeout.afterScheduled === true,
    loginAlways.timeout);
  check('login: a timeout refresh shows a small status badge with the provider',
    loginAlways.hasHook && loginAlways.timeout.badge === true
      && /Session expired/.test(loginAlways.timeout.badgeText)
      && /Google/.test(loginAlways.timeout.badgeText),
    loginAlways.timeout);
  check('login: the refresh badge offers reload/cancel and a countdown',
    loginAlways.hasHook && loginAlways.timeout.badge === true
      && loginAlways.timeout.buttons.includes('Reload now')
      && loginAlways.timeout.buttons.includes('Cancel')
      && /in \d/.test(loginAlways.timeout.badgeText)
      && /2\/3 reloads left/.test(loginAlways.timeout.badgeText),
    loginAlways.timeout);
  check('login: cancel hands the screen back without scheduling a reload',
    loginAlways.hasHook && loginAlways.timeout.hasCancel === true
      && loginAlways.timeout.afterCancelBadge === false
      && loginAlways.timeout.afterCancelPending === false
      && loginAlways.timeout.afterCancelScheduled === false,
    loginAlways.timeout);
  check('login: cancel leaves a short confirmation instead of silence',
    loginAlways.hasHook && loginAlways.timeout.afterCancelNotice === true
      && /Auto-refresh off/.test(loginAlways.timeout.afterCancelNoticeText)
      && loginAlways.timeout.afterCancelBadge === false,
    loginAlways.timeout);
  check('login: the status badge is removed when the refresh is cancelled',
    loginAlways.hasHook && loginAlways.timeout.afterBadge === false,
    loginAlways.timeout);
  check('login reloads: three recent reloads cap the screen, old ones expire',
    loginAlways.hasHook && loginAlways.reloadFree.can === true
      && loginAlways.reloadCapped.can === false && loginAlways.reloadExpired.can === true,
    loginAlways);
  check('login: spending the reload budget shows a manual sign-in notice',
    loginAlways.hasHook && loginAlways.reloadSpent.notice === true
      && /3 reloads used/.test(loginAlways.reloadSpent.text)
      && /Sign in manually/.test(loginAlways.reloadSpent.text)
      && loginAlways.reloadSpent.pending === false,
    loginAlways.reloadSpent);
  check('login: the budget notice fits the viewport as an accessible status toast',
    loginAlways.hasHook && loginAlways.reloadSpent.visual
      && loginAlways.reloadSpent.visual.position === 'fixed'
      && loginAlways.reloadSpent.visual.zIndex >= 2147483000
      && loginAlways.reloadSpent.visual.pointerEvents === 'none'
      && loginAlways.reloadSpent.visual.fontSize >= 12
      && loginAlways.reloadSpent.visual.withinViewport === true
      && loginAlways.reloadSpent.visual.noClip === true
      && loginAlways.reloadSpent.visual.role === 'status'
      && loginAlways.reloadSpent.visual.live === 'polite'
      && loginAlways.reloadSpent.visual.atomic === 'true',
    loginAlways.reloadSpent.visual);
  check('login: the budget notice removes itself after nine seconds',
    loginAlways.hasHook && loginAlways.reloadSpent.dismissed === true,
    { dismissed: loginAlways.reloadSpent.dismissed });
  check('login: spending the reload budget schedules another unattended SSO try',
    loginAlways.hasHook && loginAlways.retry
      && loginAlways.retry.afterSpent.pending === true
      && loginAlways.retry.afterSpent.inMs > 29 * 60000
      && loginAlways.retry.afterWait.pending === true,
    loginAlways.retry);
  check('login: Cancel clears the unattended login retry too',
    loginAlways.hasHook && loginAlways.retry
      && loginAlways.retry.afterSpent.stored > Date.now()
      && loginAlways.retry.afterCancel.pending === false
      && loginAlways.retry.afterCancel.stored === null,
    loginAlways.retry);
  check('login: a late manual sign-in resumes races within a day, not after',
    loginAlways.hasHook && loginAlways.resume
      && loginAlways.resume.fresh.armed === true
      && loginAlways.resume.fresh.pending === false
      && loginAlways.resume.stale.armed === false,
    loginAlways.resume);
  check('login reloads: a confirmed session clears the reload budget and attempts',
    loginAlways.hasHook && loginAlways.recovery
      && loginAlways.recovery.used === 0 && loginAlways.recovery.attempts === 0
      && loginAlways.recovery.gaveUp === false,
    loginAlways.recovery);

  // Clic real, no element.click(): CDP manda el evento con isTrusted=true. La
  // pestaña es nueva para que el aviso no herede temporizadores del banco.
  let cancelTab = null;
  let cancelled = { trusted: null, badge: true, pending: true, scheduled: true, alive: false };
  try {
    cancelTab = await openTab(devtoolsPort, new URL('/login', appUrl).href);
    await waitForLoginHooks(cancelTab);
    await armRefreshBadge(cancelTab, 'cancel');
    await clickSelector(cancelTab, '[data-nta-login-refresh-cancel]');
    await sleep(150);
    cancelled = await cancelTab.evaluate(`(() => ({
      trusted: sessionStorage.getItem('nta:trusted-click'),
      badge: Boolean(document.querySelector('[data-nta-login-refresh]')),
      pending: window.__ntaDebug.loginReloadPending(),
      scheduled: window.__ntaDebug.loginScheduled(),
      alive: window.__ntaRefreshAlive === 'alive',
      notice: Boolean(document.querySelector('[data-nta-login-cancelled]')),
      noticeText: (document.querySelector('[data-nta-login-cancelled]') || {}).textContent || '',
    }))()`);
  } finally {
    if (cancelTab) {
      try { await cancelTab.evaluate('window.__ntaDebug && window.__ntaDebug.loginCancel(); true'); } catch { /* la pestaña ya no responde */ }
      try { await cancelTab.send('Page.close'); } catch { /* el target ya cerro */ }
      try { cancelTab.close(); } catch { /* el websocket ya cerro */ }
    }
  }
  check('login refresh input: a real Cancel click is trusted and stops the refresh',
    cancelled.trusted === 'true' && cancelled.badge === false
      && cancelled.pending === false && cancelled.scheduled === false
      && cancelled.alive === true && cancelled.notice === true
      && /Auto-refresh off/.test(cancelled.noticeText),
    cancelled);

  // Reload now tiene que recargar la MISMA pestaña: la marca de sessionStorage
  // sobrevive a la recarga y el tipo de navegacion pasa a 'reload'.
  let reloadTab = null;
  let reloadReached = false;
  let reloadState = { type: '', marker: null, trusted: null, path: '', hash: '' };
  try {
    reloadTab = await openTab(devtoolsPort, new URL('/login', appUrl).href);
    await waitForLoginHooks(reloadTab);
    await armRefreshBadge(reloadTab, 'reload');
    await clickSelector(reloadTab, '[data-nta-login-refresh-reload]');
    try {
      await waitFor(async () => {
        try {
          return await reloadTab.evaluate("Boolean(window.__ntaDebug && performance.getEntriesByType('navigation')[0] && performance.getEntriesByType('navigation')[0].type === 'reload')");
        } catch {
          return false;
        }
      }, 10000, 'the real login reload');
      reloadReached = true;
    } catch { /* se informa como check fallido, no como excepcion */ }
    if (reloadReached) {
      reloadState = await reloadTab.evaluate(`(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        return {
          type: nav ? nav.type : '',
          marker: sessionStorage.getItem('nta:refresh-probe'),
          trusted: sessionStorage.getItem('nta:trusted-click'),
          path: location.pathname,
          hash: location.hash,
        };
      })()`);
    }
  } finally {
    if (reloadTab) {
      try { await reloadTab.evaluate('window.__ntaDebug && window.__ntaDebug.loginCancel(); true'); } catch { /* la pestaña ya no responde */ }
      try { await reloadTab.send('Page.close'); } catch { /* el target ya cerro */ }
      try { reloadTab.close(); } catch { /* el websocket ya cerro */ }
    }
  }
  check('login refresh input: a real Reload now click reloads the same tab',
    reloadState.type === 'reload' && reloadState.marker === 'reload'
      && reloadState.trusted === 'true' && reloadState.path === '/login' && reloadState.hash === '',
    reloadState);
  try { await cdp.evaluate("localStorage.removeItem('ntQueue:lastLogin'); true"); } catch { /* sin sesion que limpiar */ }

  // Estado activo del indicador: una sesion viva, la cola armada y ninguna
  // puerta deben dar `on`. Se hace en una pestaña nueva de garaje, al final,
  // para no depender de la ruta del tab principal ni contaminar lo anterior.
  let afkTab = null;
  let garageActive = { hasRow: false };
  try {
    afkTab = await openTab(devtoolsPort, new URL('/garage/', appUrl).href);
    await waitFor(async () => {
      try {
        return await afkTab.evaluate("location.pathname === '/garage/' && document.readyState === 'complete'");
      } catch {
        return false;
      }
    }, 10000, 'the fresh garage page');
    await afkTab.evaluate(fs.readFileSync(SCRIPT, 'utf8'));
    await waitFor(async () => {
      try {
        return await afkTab.evaluate("Boolean(document.getElementById('nt-queue-panel'))");
      } catch {
        return false;
      }
    }, 8000, 'the fresh garage panel');

    garageActive = await afkTab.evaluate(`(() => {
      const host = document.getElementById('nt-queue-panel');
      const root = host && host.shadowRoot;
      const afkRow = root && root.querySelector('[data-f="afkRow"]');
      const afk = root && root.querySelector('[data-f="afk"]');
      const retryRow = root && root.querySelector('[data-f="retryRow"]');
      const d = window.__ntaDebug;
      if (!afkRow || !afk || !retryRow || !d || !d.garagePaint) return { hasRow: false };

      d.loginRetryCancel();
      localStorage.setItem('player_token', 'live-afk-token');
      localStorage.removeItem('ntQueue:stoppedAt');
      localStorage.removeItem('ntQueue:dqBlockUntil');
      localStorage.removeItem('autoTyperActiveOn');
      sessionStorage.setItem('ntQueue:armedAt', JSON.stringify(Date.now()));
      sessionStorage.removeItem('ntQueue:raceNowBounces');
      sessionStorage.removeItem('ntQueue:raceNowBounceAt');
      d.garagePaint();

      return {
        hasRow: true,
        text: (afk.textContent || '').trim(),
        title: afkRow.title,
        retryHidden: retryRow.hidden,
      };
    })()`);
  } finally {
    if (afkTab) {
      try { await afkTab.send('Page.close'); } catch { /* el target ya cerro */ }
      try { afkTab.close(); } catch { /* el websocket ya cerro */ }
    }
  }
  check('the AFK indicator reads on with a live session and no gate',
    garageActive.hasRow && garageActive.text === 'on'
      && /AFK cycle active/.test(garageActive.title)
      && garageActive.retryHidden === true,
    garageActive);

  // Panel social de solo lectura. Se abre una pestaña nueva y se inyecta el
  // userscript alli: montar el panel en /friends y /team no debe armar la cola.
  const socialRead = `(() => {
    const host = document.getElementById('nt-queue-panel');
    const root = host && host.shadowRoot;
    const q = (sel) => root && root.querySelector(sel);
    const txt = (sel) => { const el = q(sel); return el ? (el.textContent || '').trim() : ''; };
    return {
      panel: Boolean(host && root),
      social: q('.p') ? q('.p').dataset.social : null,
      sub: txt('[data-f="sub"]'),
      mode: txt('.mode'),
      friends: txt('[data-f="socialFriends"]'),
      online: txt('[data-f="socialOnline"]'),
      requests: txt('[data-f="socialRequests"]'),
      team: txt('[data-f="socialTeam"]'),
      updated: txt('[data-f="socialUpdated"]'),
      aria: q('[data-f="socialFriends"]') ? q('[data-f="socialFriends"]').getAttribute('aria-live') : null,
      modeLabel: q('.mode') ? q('.mode').getAttribute('aria-label') : null,
      friendsTitle: q('[data-f="socialFriendsRow"]') ? q('[data-f="socialFriendsRow"]').title : '',
      actions: q('.acts') ? getComputedStyle(q('.acts')).display : null,
      armed: sessionStorage.getItem('ntQueue:armedAt'),
    };
  })()`;
  let socialTab = null;
  try {
    socialTab = await openTab(devtoolsPort, new URL('/friends/', appUrl).href);
    await waitFor(async () => {
      try {
        return await socialTab.evaluate("location.pathname === '/friends/' && document.readyState === 'complete'");
      } catch {
        return false;
      }
    }, 10000, 'the Friends page');
    await socialTab.evaluate("localStorage.removeItem('persist:nt'); true");
    await socialTab.evaluate(fs.readFileSync(SCRIPT, 'utf8'));
    await waitFor(async () => {
      try {
        return await socialTab.evaluate("Boolean(document.getElementById('nt-queue-panel'))");
      } catch {
        return false;
      }
    }, 8000, 'the Friends social panel');
    await waitFor(async () => {
      try {
        return await socialTab.evaluate(`(() => {
          const root = document.getElementById('nt-queue-panel').shadowRoot;
          const row = root.querySelector('[data-f="socialFriends"]');
          return Boolean(row && row.textContent.trim() === '2');
        })()`);
      } catch {
        return false;
      }
    }, 8000, 'the Friends social counters');
    const friendsView = await socialTab.evaluate(socialRead);
    check('the read-only panel mounts on Friends with live counters',
      friendsView.panel && friendsView.social === '1'
        && friendsView.sub === 'friends · read-only' && friendsView.mode === 'READ'
        && friendsView.friends === '2' && friendsView.online === '1'
        && friendsView.requests === '1' && friendsView.team === 'none'
        && /ago|refreshing|failed/.test(friendsView.updated)
        && friendsView.aria === 'polite'
        && friendsView.modeLabel === 'Read-only social panel'
        && /Last checked|Refreshing/.test(friendsView.friendsTitle)
        && friendsView.actions === 'none' && friendsView.armed === null,
      friendsView);

    await socialTab.evaluate("location.href = '/team/'");
    await waitFor(async () => {
      try {
        return await socialTab.evaluate("location.pathname === '/team/' && document.readyState === 'complete'");
      } catch {
        return false;
      }
    }, 10000, 'the Team page');
    await socialTab.evaluate(`(() => {
      localStorage.setItem('persist:nt', JSON.stringify({
        user: JSON.stringify({
          username: 'fixture',
          userID: 1,
          friends: [{}, {}],
          tag: 'TAG',
          teamRole: 'captain',
        }),
      }));
      return true;
    })()`);
    await socialTab.evaluate(fs.readFileSync(SCRIPT, 'utf8'));
    await waitFor(async () => {
      try {
        return await socialTab.evaluate("Boolean(document.getElementById('nt-queue-panel'))");
      } catch {
        return false;
      }
    }, 8000, 'the Team social panel');
    const teamView = await socialTab.evaluate(socialRead);
    check('the read-only panel mounts on Team without arming the queue',
      teamView.panel && teamView.social === '1'
        && teamView.sub === 'team · read-only' && teamView.mode === 'READ'
        && teamView.team === '[TAG] · captain'
        && /ago|refreshing|failed/.test(teamView.updated)
        && teamView.aria === 'polite'
        && teamView.modeLabel === 'Read-only social panel'
        && teamView.actions === 'none' && teamView.armed === null,
      teamView);
  } finally {
    if (socialTab) {
      try { await socialTab.send('Page.close'); } catch { /* el target ya cerro */ }
      try { socialTab.close(); } catch { /* el websocket ya cerro */ }
    }
  }

  if (SHOT_DIR) await capturePanelThemes(cdp, appUrl);

  return results;
}

(async () => {
  let server = null;
  let chrome = null;
  let cdp = null;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nta-live-'));

  try {
    server = await serve();
    const appUrl = `http://127.0.0.1:${server.address().port}/index.html`;

    chrome = spawn(chromePath, [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=520,980',
      'about:blank',
    ], { stdio: 'ignore' });

    // Chrome escribe el puerto en DevToolsActivePort: no hay que adivinar.
    const devtoolsFile = path.join(profile, 'DevToolsActivePort');
    let devtoolsPort = 0;
    await waitFor(() => {
      if (!fs.existsSync(devtoolsFile)) return false;
      const port = Number(fs.readFileSync(devtoolsFile, 'utf8').split('\n')[0]);
      if (!Number.isFinite(port) || port <= 0) return false;
      devtoolsPort = port;
      return true;
    }, 20000, 'Chrome DevTools');

    let target = null;
    await waitFor(async () => {
      const targets = await httpJson(`http://127.0.0.1:${devtoolsPort}/json/list`);
      target = targets.find((item) => item.type === 'page');
      return Boolean(target);
    }, 15000, 'a page target');

    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: appUrl });

    console.log(`\nNITRO WRAITH — live harness (${path.basename(chromePath)})\n`);
    const results = await runChecks(cdp, devtoolsPort, appUrl);

    const failures = results.filter((item) => !item.ok);
    if (cdp.consoleLines.length) {
      console.log('\nconsole (last 14 lines):');
      for (const line of cdp.consoleLines.slice(-14)) console.log(`  ${line}`);
    }
    console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
    process.exitCode = failures.length ? 1 : 0;
  } catch (error) {
    console.error('\nharness error:', error.message || error);
    process.exitCode = 2;
  } finally {
    if (cdp) cdp.close();
    killTree(chrome);
    if (server) server.close();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome puede tener el perfil tomado */ }
  }
})();
