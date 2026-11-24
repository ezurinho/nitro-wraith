#!/usr/bin/env node
/*
 * Cross-engine smoke test: Firefox and WebKit.
 *
 * The Chrome harness in tests/live/run.js drives CDP and owns the deep
 * behaviour checks. This suite answers a narrower question on the two engines
 * Chrome cannot stand in for: does the userscript boot, mount the race and
 * garage panels, paint its theme, and honour the global shortcuts without an
 * uncaught exception? It loads the real built userscript from the repo and the
 * same fixtures, so a syntax or API regression that only shows up outside
 * Chromium fails here before a release.
 *
 * Needs the Playwright browsers once:
 *   npx playwright install firefox webkit
 * Then:
 *   npm run test:browsers
 */

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { firefox, webkit } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(ROOT, 'tests', 'live', 'fixtures');
const SCRIPT = path.join(ROOT, 'nitro-wraith.user.js');

const THEMES = ['carbon', 'aurora', 'sunset', 'ice', 'violet', 'rgb'];
const ENGINES = {
  firefox: { label: 'firefox', type: firefox },
  webkit: { label: 'webkit', type: webkit },
};

function bail(message) {
  console.error(`smoke: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(SCRIPT)) bail(`userscript not found: ${SCRIPT}`);
const scriptText = fs.readFileSync(SCRIPT, 'utf8');
const scriptVersion = (scriptText.match(/@version\s+(\S+)/) || [])[1] || '';

function serve() {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    const pathname = requestUrl.pathname;
    let file = null;

    if (pathname === '/nitro-wraith.user.js') file = SCRIPT;
    else if (pathname === '/' || pathname === '/index.html') file = path.join(FIXTURES, 'index.html');
    else if (pathname === '/race' || pathname === '/race/') file = path.join(FIXTURES, 'race', 'index.html');
    else if (pathname === '/garage' || pathname === '/garage/') file = path.join(FIXTURES, 'index.html');
    else if (pathname === '/api/v2/friends') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'success', results: { fields: [], values: [] } }));
      return;
    } else if (pathname === '/api/v2/friend-requests') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'success', results: { requests: [], totalRecords: 0 } }));
      return;
    } else if (pathname === '/api/v2/stats/data/bymonth') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'success', results: { fields: [], values: [] } }));
      return;
    }

    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    const type = path.extname(file) === '.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function waitFor(fn, timeout, label) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const value = await fn();
        if (value) return resolve(value);
      } catch { /* page still navigating */ }
      if (Date.now() - startedAt > timeout) return reject(new Error(`timeout waiting for ${label}`));
      setTimeout(tick, 100);
    };
    tick();
  });
}

async function runEngine(name, baseUrl) {
  const engine = ENGINES[name];
  if (!engine) bail(`unknown engine ${name}`);
  const results = [];
  const check = (label, ok, detail) => {
    results.push({ label, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${label}${ok || detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
  };

  const browser = await engine.type.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  if (process.env.SMOKE_DEBUG) page.on('console', (message) => console.log(`   ${name} log: ${message.text().slice(0, 140)}`));

  // The update check asks GitHub for the latest meta. Answer locally so the
  // run never depends on the network and the answer is same-shape on every
  // engine (WebKit reports a blocked cross-origin fetch as a page error).
  const meta = `// ==UserScript==\n// @version ${scriptVersion}\n// ==/UserScript==\n`;
  await page.route(/^https:\/\/(github\.com|gist\.githubusercontent\.com)\//, (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    headers: { 'access-control-allow-origin': '*' },
    body: meta,
  }));

  try {
    // ---- race frame: the fixture loads the script itself ----
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
    const raceFrame = page.frames().find((frame) => frame !== page.mainFrame() && frame.url().startsWith(`${baseUrl}/race`));
    check('the race fixture embeds its frame', Boolean(raceFrame));
    if (!raceFrame) return;

    await raceFrame.waitForFunction(() => {
      const host = document.getElementById('nt-autotyper-panel');
      return Boolean(host && host.shadowRoot && host.shadowRoot.querySelector('.panel'));
    }, null, { timeout: 15000 }).catch(() => null);

    const boot = await raceFrame.evaluate((themes) => {
      const host = document.getElementById('nt-autotyper-panel');
      const root = host && host.shadowRoot;
      const panel = root && root.querySelector('.panel');
      if (!panel) return { mounted: false };
      const style = getComputedStyle(panel);
      return {
        mounted: true,
        theme: panel.dataset.theme || '',
        knownTheme: themes.includes(panel.dataset.theme || ''),
        motion: panel.dataset.motion || '',
        foot: panel.dataset.foot || '',
        painted: style.backgroundImage !== 'none' || (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent'),
        live: Boolean(root.querySelector('.live-card') && root.querySelector('[data-field="live"]') && root.querySelector('[data-field="acc"]')),
        styles: Boolean(root.querySelector('style, link[rel="stylesheet"]')),
      };
    }, THEMES);
    check('the race panel mounts with a shadow root', boot.mounted);
    check('the panel paints a known theme with the default motion level',
      boot.knownTheme && boot.motion === 'full' && boot.painted && boot.styles, boot);
    check('the Live card is present', boot.live);

    // ---- top window at /garage/: inject the script as Tampermonkey would ----
    await page.goto(`${baseUrl}/garage/`, { waitUntil: 'load' });
    await page.evaluate(() => {
      localStorage.setItem('autoTyperDailyRaceLimit', '100');
      localStorage.setItem('autoTyperDailyXpLimit', '50000');
    });
    await page.evaluate((source) => { (0, eval)(source); }, scriptText);
    const garage = await waitFor(async () => page.evaluate(() => {
      const host = document.getElementById('nt-queue-panel');
      const root = host && host.shadowRoot;
      const panel = root && (root.querySelector('.panel') || root.querySelector('.p'));
      if (!panel) return null;
      return {
        mounted: true,
        context: Boolean(root.querySelector('.garage-context')),
        primary: Boolean(root.querySelector('.acts .act')),
        theme: panel.dataset.theme || '',
        fold: panel.dataset.fold || '',
      };
    }), 15000, 'the garage panel').catch(() => null);
    check('the garage panel mounts with a contextual summary and actions',
      garage && garage.mounted && garage.context && garage.primary, garage);

    // ---- shared shortcuts: Alt+T cycles the theme across both panels ----
    const beforeTheme = garage ? garage.theme : '';
    await page.keyboard.press('Alt+t');
    const themed = await waitFor(async () => {
      const garageTheme = await page.evaluate(() => {
        const host = document.getElementById('nt-queue-panel');
        const root = host && host.shadowRoot;
        const panel = root && (root.querySelector('.panel') || root.querySelector('.p'));
        return panel ? panel.dataset.theme || '' : '';
      });
      if (!garageTheme || garageTheme === beforeTheme) return null;
      const frame = page.frames().find((item) => item !== page.mainFrame() && item.url().startsWith(`${baseUrl}/race`));
      const raceTheme = frame ? await frame.evaluate(() => {
        const host = document.getElementById('nt-autotyper-panel');
        const root = host && host.shadowRoot;
        const panel = root && (root.querySelector('.panel') || root.querySelector('.p'));
        return panel ? panel.dataset.theme || '' : '';
      }) : '';
      return { garageTheme, raceTheme };
    }, 5000, 'Alt+T to reach both panels').catch(() => null);
    check('Alt+T cycles the theme and the race frame follows it',
      themed && themed.garageTheme !== beforeTheme && themed.raceTheme === themed.garageTheme, themed);

    // ---- Alt+G folds the garage sheet, Alt+M reaches the race HUD ----
    await page.keyboard.press('Alt+g');
    const folded = await waitFor(async () => page.evaluate(() => {
      const host = document.getElementById('nt-queue-panel');
      const root = host && host.shadowRoot;
      const panel = root && (root.querySelector('.panel') || root.querySelector('.p'));
      return panel && panel.dataset.fold === '1' ? '1' : null;
    }), 5000, 'the garage fold').catch(() => null);
    check('Alt+G folds the garage sheet', folded === '1', folded);

    const raceFrame2 = page.frames().find((frame) => frame !== page.mainFrame() && frame.url().startsWith(`${baseUrl}/race`));
    await page.keyboard.press('Alt+m');
    const foot = raceFrame2 ? await waitFor(async () => {
      const mode = await raceFrame2.evaluate(() => {
        const host = document.getElementById('nt-autotyper-panel');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel ? panel.dataset.foot || '' : '';
      });
      return mode && mode !== 'full' ? mode : null;
    }, 5000, 'the footer HUD mode').catch(() => null) : null;
    check('Alt+M cycles the race footer HUD', foot === 'compact' || foot === 'hidden', foot);
  } finally {
    await finish(browser, results, pageErrors);
  }
}

async function finish(browser, results, pageErrors) {
  checkNoErrors(results, pageErrors);
  await browser.close();
  return results;
}

function checkNoErrors(results, pageErrors) {
  const failures = results.filter((item) => !item.ok).length;
  const errorsOk = pageErrors.length === 0;
  console.log(`${errorsOk ? 'PASS' : 'FAIL'}  uncaught page errors: ${pageErrors.length}${errorsOk ? '' : ` ${JSON.stringify(pageErrors.slice(0, 3))}`}`);
  results.push({ label: 'uncaught page errors', ok: errorsOk });
  const total = results.length;
  const passed = results.filter((item) => item.ok).length;
  console.log(`smoke: ${passed}/${total} checks passed${failures === 0 && errorsOk ? '' : ' — see FAIL lines above'}`);
  if (!errorsOk || failures > 0) process.exitCode = 1;
}

(async () => {
  const requested = (process.env.BROWSERS || 'firefox,webkit').split(',').map((name) => name.trim()).filter(Boolean);
  const server = await serve();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`smoke: serving ${baseUrl} · engines: ${requested.join(', ')}`);
  try {
    for (const name of requested) {
      await runEngine(name, baseUrl);
    }
  } finally {
    server.close();
  }
  if (process.exitCode) bail('cross-engine smoke failed');
  console.log('smoke: all engines passed.');
})().catch((error) => {
  bail(error && error.stack ? error.stack : String(error));
});
