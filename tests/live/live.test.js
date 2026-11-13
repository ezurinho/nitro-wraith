'use strict';

/*
 * Prueba automatica del modo live, sin cuenta y sin navegador.
 *
 * Arranca `tests/live/fake-cdp.js` en un puerto libre, apunta el propio CLI de
 * `npm run live` ahi y comprueba lo que el modo live ACEPTA y lo que RECHAZA:
 * una muestra por carrera, dos muestras, un update sin progreso, una pestaña
 * sin sesion, la falta de Race Now y un puerto donde no escucha nadie.
 *
 * Se ejecuta el CLI de verdad (no una copia de su logica), asi que cubre el
 * mismo camino que `npm run live`.
 *
 *   npm run live:test
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { startFakeCdp } = require('./fake-cdp');
const { HEADER, MAX_ROWS, trimHistory, parseHistory } = require('./history');
const { buildArgs } = require('./chrome');
const { parseDateArg } = require('./report');

const LIVE = path.join(__dirname, 'live.js');
const CHROME = path.join(__dirname, 'chrome.js');
const TABS = path.join(__dirname, 'tabs.js');
const REPORT = path.join(__dirname, 'report.js');
const EXPORT = path.join(__dirname, '..', '..', 'tools', 'export-downloads.js');
const SCRIPT_PATH = path.join(__dirname, '..', '..', 'nitro-wraith.user.js');
const SPAWN_TIMEOUT_MS = 25000;

function runNode(script, args = [], env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => resolve({ code, output }));
  });
}

function runLive(env, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [LIVE, ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });

    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ya salio */ }
    }, SPAWN_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

// Escenarios que el Chrome falso puede representar. `has` son trozos ASCII del
// mensaje que debe imprimir live.js; `absent` lo que no debe salir.
const CASES = [
  {
    name: 'live accepts one race with one sample',
    fake: {},
    expect: { code: 0, has: ['PASS: una sola muestra'], absent: ['live error'] },
    after(fake) {
      const calls = fake.state.evaluations;
      return calls.some((text) => /race now/i.test(text))
        && calls.some((text) => text.includes('autoTyperAccDeltas'))
        && fake.state.emitted === 1;
    },
  },
  {
    name: 'live prefers the server WPM over the HUD reading',
    fake: {
      history: [{ wpm: 104.2, acc: 98, serverWpm: 104.9, gameWpm: 108, target: 110, at: 1 }],
    },
    expect: {
      code: 0,
      has: ['server 104.9 WPM', 'model 104.2 WPM', '(-0.7)',
        'WPM oficial: server 104.9 · model 104.2 (-0.7)'],
    },
    checkCsv(file) {
      const reportFile = path.join(path.dirname(file), 'live-history.json');
      let report;
      try { report = JSON.parse(fs.readFileSync(reportFile, 'utf8')); } catch { return 'bad JSON report'; }
      const wpm = report.server_wpm;
      if (!wpm || wpm.races !== 1) return 'missing server_wpm';
      if (wpm.rows[0].official !== 104.9 || wpm.rows[0].model !== 104.2) {
        return `row ${JSON.stringify(wpm.rows[0])}`;
      }
      if (wpm.mean_delta !== -0.7) return `delta ${wpm.mean_delta}`;
      return true;
    },
  },
  {
    name: 'live falls back to the HUD WPM when the packet has no clock',
    fake: {
      history: [{ wpm: 106.1, acc: 98, gameWpm: 105, target: 110, at: 1 }],
    },
    expect: {
      code: 0,
      has: ['hud 105 WPM', 'model 106.1 WPM', '(+1.1)',
        'WPM oficial: hud 105.0 · model 106.1 (+1.1)'],
    },
  },
  {
    name: 'live accepts a race when the 20-sample buffer is full',
    fake: { baseSamples: 20 },
    expect: { code: 0, has: ['PASS: una sola muestra', 'buffer full'] },
    after(fake) {
      return fake.state.emitted === 1;
    },
  },
  {
    name: 'live --inject registers the userscript for the race',
    fake: {},
    args: ['--inject'],
    expect: { code: 0, has: ['Userscript inyectado', 'PASS: una sola muestra'] },
    after(fake) {
      return fake.state.scripts.length === 1
        && fake.state.scripts[0].includes('NTAuto')
        && fake.state.emitted === 1;
    },
  },
  {
    name: 'live reports the panel numbers it finds',
    fake: {
      panel: {
        version: 'v7.24.0',
        races: '4 / 20',
        session: '108.4 · 98.1%',
        dayXp: '2,400 XP',
        result: '1st · +120 XP',
        delta: '+0.3 pts · n=5',
        seasonName: 'Spirit Racers',
        seasonTier: 'T6',
        seasonXp: '76,701 / 90,000 XP',
        seasonNext: '13,299 XP to go',
        seasonPace: '1.2k/day · on pace',
        seasonEnds: 'ends Nov 29 · 27d',
        seasonTag: 'T6 · 34%',
      },
    },
    expect: {
      code: 0,
      has: ['races 4 / 20', 'today 2,400 XP', 'model delta +0.3 pts · n=5',
        'season T6 · 34%', '1.2k/day · on pace', 'Temporada: Spirit Racers · T6'],
    },
    checkCsv(file) {
      const reportFile = path.join(path.dirname(file), 'live-history.json');
      let report;
      try { report = JSON.parse(fs.readFileSync(reportFile, 'utf8')); } catch { return 'bad JSON report'; }
      if (!report.season || report.season.tier !== 'T6') return 'missing season tier';
      if (report.season.xp !== '76,701 / 90,000 XP') return `season xp ${report.season.xp}`;
      if (report.season.pace !== '1.2k/day · on pace') return `season pace ${report.season.pace}`;
      return true;
    },
  },
  {
    name: 'live --dry-run validates the tab without racing',
    fake: {},
    args: ['--dry-run'],
    expect: { code: 0, has: ['dry-run OK', 'TestRacer', 'Race Now'] },
    after(fake) {
      return fake.state.emitted === 0
        && fake.state.evaluations.some((text) => /race now/i.test(text))
        && !fake.state.evaluations.some((text) => text.includes('autoTyperAccDeltas'));
    },
  },
  {
    name: 'live --dry-run refuses when Race Now is missing',
    fake: { raceNow: false },
    args: ['--dry-run'],
    expect: { code: 2, has: ['No encontr'] },
  },
  {
    name: 'live --dry-run shows the userscript version',
    fake: {},
    args: ['--dry-run'],
    expect: { code: 0, has: ['userscript v7.37.0', 'dry-run OK'] },
  },
  {
    name: 'live --dry-run refuses when the userscript is missing',
    fake: { scriptVersion: null },
    args: ['--dry-run'],
    expect: { code: 2, has: ['No encontré el userscript'] },
  },
  {
    name: 'live --dry-run --inject probes the project script',
    fake: {},
    args: ['--dry-run', '--inject'],
    expect: { code: 0, has: ['Userscript inyectado', 'userscript v7.37.0', 'dry-run OK'] },
    after(fake) {
      return fake.state.scripts.length === 2
        && fake.state.scripts.some((source) => source.includes('__ntaDryProbe'))
        && fake.state.scripts.some((source) => source.includes('NTAuto'))
        && fake.state.emitted === 0;
    },
  },
  {
    name: 'live repeats N races and reports the dispersion',
    fake: {},
    env: { LIVE_RACES: '3' },
    expect: { code: 0, has: ['3 carreras, una sola muestra por carrera', 'mean', 'sd', 'n=3'] },
    after(fake) {
      const clicks = fake.state.evaluations.filter((text) => /race now|race again/i.test(text)).length;
      return clicks === 3 && fake.state.emitted === 3;
    },
  },
  {
    name: 'live warns when a sample leaves the 2 pt band',
    fake: { deltas: [0.1, 2.4, -0.5] },
    env: { LIVE_RACES: '3' },
    expect: { code: 0, has: ['AVISO: 1/3 muestras fuera de ±2 pts', 'race 2: +2.4'] },
  },
  {
    name: 'live stays quiet when every sample is inside the band',
    fake: { deltas: [0.1, -0.2] },
    env: { LIVE_RACES: '2' },
    expect: { code: 0, has: ['todas dentro de ±2 pts'], absent: ['AVISO'] },
  },
  {
    name: 'live appends one row per pass to the CSV',
    fake: { deltas: [0.1, -0.3] },
    env: { LIVE_RACES: '2' },
    expect: { code: 0, has: ['Saved:', 'histórico de pasadas', '1 de 1 pasada', 'Tendencia: hace falta otra pasada', 'Report:'] },
    checkCsv(file) {
      const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
      if (lines.length !== 2) return `${lines.length} lines`;
      if (lines[0] !== HEADER) return `header ${lines[0]}`;
      const cells = lines[1].split(',');
      if (cells.length !== 12) return `${cells.length} columns`;
      if (cells[1] !== '2' || cells[2] !== '2') return `races/samples ${cells[1]}/${cells[2]}`;
      if (cells[7] !== '0') return `outside ${cells[7]}`;
      if (cells[9] !== 'TestRacer') return `user ${cells[9]}`;
      if (!/\+0\.1 -0\.3$/.test(lines[1])) return `deltas ${cells[11]}`;

      // El informe JSON se escribe junto al CSV, con la pasada recien medida.
      const reportFile = path.join(path.dirname(file), 'live-history.json');
      if (!fs.existsSync(reportFile)) return 'no JSON report';
      let report;
      try { report = JSON.parse(fs.readFileSync(reportFile, 'utf8')); } catch { return 'bad JSON report'; }
      if (report.total !== 1 || report.passes.length !== 1) return `JSON total ${report.total}`;
      if (report.trend !== null) return 'JSON trend should be null';
      if (report.passes[0].user !== 'TestRacer') return `JSON user ${report.passes[0].user}`;
      if (report.passes[0].mean !== -0.1) return `JSON mean ${report.passes[0].mean}`;
      return true;
    },
  },
  {
    name: 'live rejects two samples for the same race',
    fake: { samples: 2 },
    expect: { code: 2, has: ['se esperaba exactamente 1 muestra'] },
  },
  {
    name: 'live rejects an update without typed/skipped/errors',
    fake: { missingProgress: true },
    expect: { code: 2, has: ['typed/skipped/errors'] },
  },
  {
    name: 'live refuses a tab with no session',
    fake: { session: null },
    expect: { code: 2, has: ['no tiene una sesi'] },
  },
  {
    name: 'live refuses a guest session',
    fake: { session: { username: 'g0.10731081513806806', loggedIn: false } },
    expect: { code: 2, has: ['invitado'] },
  },
  {
    name: 'live refuses when Race Now is missing',
    fake: { raceNow: false },
    expect: { code: 2, has: ['No encontr'] },
  },
  {
    name: 'live refuses when nothing listens on the port',
    fake: null,
    env: { CDP_PORT: '1' },
    expect: { code: 2, has: ['no escucha'] },
  },
];

async function runCase(item) {
  let fake = null;
  let env = { ...item.env };

  if (item.fake) {
    fake = await startFakeCdp(item.fake);
    env = { ...env, CDP_PORT: String(fake.port) };
  }

  // Ninguna pasada de prueba escribe en el CSV del proyecto.
  const csvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nta-live-csv-'));
  const csvFile = path.join(csvDir, 'live-history.csv');
  env = { ...env, LIVE_CSV: csvFile };

  try {
    const result = await runLive(env, item.args || []);
    const problems = [];
    const expected = item.expect;

    if (result.code !== expected.code) {
      problems.push(`code ${result.code} (expected ${expected.code})`);
    }
    for (const text of expected.has || []) {
      if (!result.output.includes(text)) problems.push(`missing "${text}"`);
    }
    for (const text of expected.absent || []) {
      if (result.output.includes(text)) problems.push(`unexpected "${text}"`);
    }
    if (item.after && !item.after(fake)) {
      problems.push(`fake CDP saw unexpected traffic: ${JSON.stringify(fake.state)}`);
    }
    if (item.checkCsv) {
      let verdict = true;
      try {
        verdict = item.checkCsv(csvFile);
      } catch (error) {
        verdict = `no CSV: ${error.message}`;
      }
      if (verdict !== true) problems.push(`csv: ${verdict}`);
    }

    return { name: item.name, problems, output: result.output };
  } finally {
    if (fake) await fake.close();
    fs.rmSync(csvDir, { recursive: true, force: true });
  }
}

(async () => {
  const results = [];

  const unit = (name, ok, detail) => {
    results.push(Boolean(ok));
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail || ''}`}`);
  };

  // El lanzador se prueba por su comando, sin abrir un navegador de verdad.
  const args = buildArgs({ port: 9333, profile: 'C:\\profile test' });
  unit('chrome launcher passes the debugging port',
    args.includes('--remote-debugging-port=9333'), args.join(' '));
  unit('chrome launcher uses the dedicated profile',
    args.includes('--user-data-dir=C:\\profile test'), args.join(' '));
  unit('chrome launcher opens the login page',
    args[args.length - 1] === 'https://www.nitrotype.com/login', args[args.length - 1]);
  unit('chrome launcher keeps background timers running',
    ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
      .every((flag) => args.includes(flag)), args.join(' '));
  unit('chrome launcher silences the dedicated window',
    args.includes('--mute-audio'), args.join(' '));

  // Listado de pestañas contra el mismo CDP falso.
  const tabsFake = await startFakeCdp({});
  try {
    const tabsRun = await runNode(TABS, [], { CDP_PORT: String(tabsFake.port) });
    unit('live:tabs lists the tab with its session',
      tabsRun.code === 0
        && tabsRun.output.includes('[session] TestRacer')
        && tabsRun.output.includes('https://www.nitrotype.com/garage'),
      tabsRun.output.trim().split('\n').slice(-2).join(' | '));
  } finally {
    await tabsFake.close();
  }

  const guestFake = await startFakeCdp({ session: { username: 'g0.123', loggedIn: false } });
  try {
    const guestRun = await runNode(TABS, [], { CDP_PORT: String(guestFake.port) });
    unit('live:tabs marks a guest tab',
      guestRun.code === 0 && guestRun.output.includes('[guest] g0.123'),
      guestRun.output.trim().split('\n').slice(-2).join(' | '));
  } finally {
    await guestFake.close();
  }

  // De punta a punta: el comando real, sin abrir Chrome.
  const dryChrome = await runNode(CHROME, ['--dry-run'], { CDP_PORT: '', LIVE_PROFILE: '' });
  unit('live:chrome --dry-run prints the dedicated command',
    dryChrome.code === 0
      && dryChrome.output.includes('--remote-debugging-port=9222')
      && dryChrome.output.includes('--user-data-dir=')
      && dryChrome.output.includes('.live-profile')
      && dryChrome.output.includes('https://www.nitrotype.com/login')
      && !/Chrome abierto/.test(dryChrome.output),
    dryChrome.output.trim().split('\n').pop());

  // Historico: la cabecera se queda y las pasadas viejas se van.
  const longCsv = [HEADER, ...Array.from({ length: MAX_ROWS + 3 }, (_, i) => `row,${i + 1}`)]
    .join('\r\n') + '\r\n';
  const kept = String(trimHistory(longCsv) || '').split(/\r?\n/).filter(Boolean);
  unit('live history keeps only the last 200 passes',
    kept.length === MAX_ROWS + 1 && kept[0] === HEADER
      && kept[1] === 'row,4' && kept[kept.length - 1] === `row,${MAX_ROWS + 3}`,
    `${kept.length} lines · ${kept[1]}..${kept[kept.length - 1]}`);
  unit('live history leaves a short file alone',
    trimHistory(`${HEADER}\r\nrow,1\r\n`) === null, 'trimmed a short file');

  // Lectura del historico: comillas, CRLF y cabecera ajena.
  const quoted = parseHistory(`${HEADER}\r\n"2026-11-02T10:00:00.000Z",1,1,+0.20,0.00,0.2,0.2,0,2,"Racer, Jr",v7.39.0,+0.2\r\n`);
  unit('live history parses a quoted user cell',
    quoted.rows && quoted.rows.length === 1 && quoted.rows[0].user === 'Racer, Jr'
      && quoted.rows[0].deltas.length === 1 && quoted.rows[0].deltas[0] === 0.2,
    JSON.stringify(quoted));
  unit('live history rejects a foreign header',
    parseHistory('foo,bar\r\n1,2\r\n').error === 'header', 'accepted a foreign header');
  unit('live history counts broken rows instead of hiding them',
    parseHistory(`${HEADER}\r\nnot,a,pass\r\n2026-11-02T10:00:00.000Z,2,2,+0.30,0.10,0.2,0.4,0,2,idkgng,v7.39.0,+0.2 +0.4\r\n`).bad === 1,
    'did not count the broken row');

  // `--since` comparte formatos con `--compare`; el dia suelto es medianoche local.
  const midnight = parseDateArg('2026-11-02');
  unit('live:history parses --since as local midnight',
    Boolean(midnight) && midnight.getFullYear() === 2026 && midnight.getMonth() === 10
      && midnight.getDate() === 2 && midnight.getHours() === 0 && midnight.getMinutes() === 0,
    midnight ? midnight.toISOString() : 'null');
  const shortSince = parseDateArg('11-02 17:04');
  unit('live:history parses a short --since with time',
    Boolean(shortSince) && shortSince.getMonth() === 10 && shortSince.getDate() === 2
      && shortSince.getHours() === 17 && shortSince.getMinutes() === 4,
    shortSince ? shortSince.toISOString() : 'null');
  const weekWindow = parseDateArg('7d');
  const weekDays = weekWindow ? (Date.now() - weekWindow.getTime()) / 86400000 : NaN;
  unit('live:history parses a relative --since window',
    Number.isFinite(weekDays) && weekDays > 6.99 && weekDays < 7.01,
    weekWindow ? weekWindow.toISOString() : 'null');
  const hourWindow = parseDateArg('12h');
  const windowHours = hourWindow ? (Date.now() - hourWindow.getTime()) / 3600000 : NaN;
  unit('live:history parses an hour --since window',
    Number.isFinite(windowHours) && windowHours > 11.99 && windowHours < 12.01,
    hourWindow ? hourWindow.toISOString() : 'null');
  unit('live:history rejects an unreadable date argument',
    parseDateArg('ayer') === null && parseDateArg('') === null && parseDateArg('7x') === null,
    'accepted an unreadable date');

  // Informe del historico: se ejecuta el CLI de verdad sobre archivos temporales.
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nta-report-'));
  try {
    const reportCsv = path.join(reportDir, 'live-history.csv');
    fs.writeFileSync(reportCsv, [
      HEADER,
      '2026-11-01T10:00:00.000Z,3,3,+0.10,0.20,0.00,0.30,0,2,idkgng,v7.38.1,+0.1 +0.2 +0.0',
      '2026-11-02T11:00:00.000Z,2,2,+1.10,0.80,0.60,1.60,1,2,idkgng,v7.39.0,+0.6 +1.6',
      '2026-11-02T12:00:00.000Z,1,1,+1.80,0.00,1.80,1.80,0,2,idkgng,v7.39.0,+1.8',
    ].join('\r\n') + '\r\n');

    const report = await runNode(REPORT, ['--limit', '2'], { LIVE_CSV: reportCsv });
    unit('live:history prints the latest passes, newest first',
      report.code === 0
        && report.output.includes('2 de 3 pasadas')
        && report.output.includes('WARN')
        && report.output.includes('AVISO')
        && report.output.includes('Racha: 2 seguidas')
        && report.output.indexOf('+1.80') < report.output.indexOf('+1.10'),
      report.output.trim().split('\n').slice(-3).join(' | '));

    const machine = await runNode(REPORT, ['--json', '--limit', '2'], { LIVE_CSV: reportCsv });
    let payload = null;
    try { payload = JSON.parse(machine.output); } catch { payload = null; }
    unit('live:history --json is machine readable',
      machine.code === 0 && payload
        && payload.total === 3 && payload.shown === 2 && payload.outside === 1
        && payload.passes.length === 2 && payload.passes[0].mean === 1.8
        && payload.passes[0].warn === false && payload.passes[1].warn === true
        && payload.trend && payload.trend.warn === true
        && payload.streak && payload.streak.count === 2 && payload.streak.drifts.length === 2
        && payload.accounts.length === 1 && payload.accounts[0] === 'idkgng'
        && payload.drift_threshold === 0.5 && payload.unreadable === 0,
      String(machine.output).slice(0, 180));

    const compared = await runNode(REPORT, ['--compare', '2026-11-02T11:00', '2026-11-02T12:00'], { LIVE_CSV: reportCsv });
    unit('live:history compares two passes by date',
      compared.code === 0
        && compared.output.includes('Δ media')
        && compared.output.includes('+0.70')
        && compared.output.includes('(B - A)'),
      compared.output.trim().split('\n').slice(-6).join(' | '));

    const comparedJson = await runNode(REPORT, ['--json', '--compare', '2026-11-01T10:00', '2026-11-02T12:00'], { LIVE_CSV: reportCsv });
    let diff = null;
    try { diff = JSON.parse(comparedJson.output); } catch { diff = null; }
    unit('live:history --json includes the comparison diff',
      comparedJson.code === 0 && diff && diff.diff
        && Math.abs(diff.diff.mean - 1.7) < 1e-9 && diff.diff.races === -2
        && diff.diff.outside === 0 && diff.same === false,
      String(comparedJson.output).slice(0, 180));

    const ambiguous = await runNode(REPORT, ['--compare', '11-02', '2026-11-01T10:00'], { LIVE_CSV: reportCsv });
    unit('live:history rejects an ambiguous date',
      ambiguous.code === 1 && ambiguous.output.includes('coincide con 2 pasadas'),
      ambiguous.output.trim().split('\n').pop());

    const noMatch = await runNode(REPORT, ['--compare', '2020-01-01', '2026-11-02T12:00'], { LIVE_CSV: reportCsv });
    unit('live:history explains a date with no pass',
      noMatch.code === 1 && noMatch.output.includes('no encontré ninguna pasada'),
      noMatch.output.trim().split('\n').pop());

    const halfCompare = await runNode(REPORT, ['--compare', '2026-11-02T12:00'], { LIVE_CSV: reportCsv });
    unit('live:history asks for both dates to compare',
      halfCompare.code === 1 && halfCompare.output.includes('necesita dos fechas'),
      halfCompare.output.trim().split('\n').pop());

    const vsAverage = await runNode(REPORT, ['--compare', 'last'], { LIVE_CSV: reportCsv });
    unit('live:history --compare last compares with the average',
      vsAverage.code === 0
        && vsAverage.output.includes('Comparación con la media')
        && vsAverage.output.includes('2 anteriores')
        && vsAverage.output.includes('+1.20')
        && vsAverage.output.includes('(última - media)'),
      vsAverage.output.trim().split('\n').slice(-6).join(' | '));

    const vsAverageJson = await runNode(REPORT, ['--json', '--compare', 'last'], { LIVE_CSV: reportCsv });
    let average = null;
    try { average = JSON.parse(vsAverageJson.output); } catch { average = null; }
    unit('live:history --compare last is machine readable',
      vsAverageJson.code === 0 && average
        && average.mode === 'average' && average.count === 2
        && average.last.mean === 1.8 && average.average.mean === 0.6
        && average.diff.mean === 1.2 && average.warn === true
        && average.accounts.length === 1 && average.accounts[0] === 'idkgng',
      String(vsAverageJson.output).slice(0, 180));

    const singleCsv = path.join(reportDir, 'single.csv');
    fs.writeFileSync(singleCsv, `${HEADER}\r\n2026-11-02T12:00:00.000Z,1,1,+0.10,0.00,0.1,0.1,0,2,Ana,v7.41.0,+0.1\r\n`);
    const single = await runNode(REPORT, ['--compare', 'last'], { LIVE_CSV: singleCsv });
    unit('live:history --compare last needs two passes',
      single.code === 1 && single.output.includes('más de una pasada'),
      single.output.trim().split('\n').pop());

    const window = await runNode(REPORT, ['--json', '--since', '2026-11-02T00:00:00.000Z'], { LIVE_CSV: reportCsv });
    let within = null;
    try { within = JSON.parse(window.output); } catch { within = null; }
    unit('live:history --since filters the window',
      window.code === 0 && within
        && within.total === 2 && within.file_total === 3 && within.since
        && within.since.at === '2026-11-02T00:00:00.000Z'
        && within.passes.length === 2
        && within.trend && within.trend.previous === 1.1
        && within.streak === null,
      String(window.output).slice(0, 180));

    const windowTable = await runNode(REPORT, ['--since', '2026-11-02T00:00:00.000Z'], { LIVE_CSV: reportCsv });
    unit('live:history --since prints the window it used',
      windowTable.code === 0 && windowTable.output.includes('Desde')
        && windowTable.output.includes('2 de 3 pasadas')
        && windowTable.output.includes('2 de 2 pasadas'),
      windowTable.output.trim().split('\n').slice(0, 4).join(' | '));

    const emptyWindow = await runNode(REPORT, ['--since', '2027-01-01'], { LIVE_CSV: reportCsv });
    unit('live:history explains an empty --since window',
      emptyWindow.code === 1 && emptyWindow.output.includes('no hay ninguna pasada desde'),
      emptyWindow.output.trim().split('\n').pop());

    // Ventana relativa: se arman las pasadas respecto a ahora, sin depender del huso.
    const recentCsv = path.join(reportDir, 'recent.csv');
    const ago = (ms) => new Date(Date.now() - ms).toISOString();
    fs.writeFileSync(recentCsv, [
      HEADER,
      `${ago(10 * 86400000)},1,1,+0.10,0.00,0.10,0.10,0,2,Ana,v7.41.0,+0.1`,
      `${ago(2 * 86400000)},1,1,+0.20,0.00,0.20,0.20,0,2,Ana,v7.41.0,+0.2`,
      `${ago(3600000)},1,1,+0.30,0.00,0.30,0.30,0,2,Ana,v7.41.0,+0.3`,
    ].join('\r\n') + '\r\n');

    const week = await runNode(REPORT, ['--json', '--since', '7d'], { LIVE_CSV: recentCsv });
    let weekJson = null;
    try { weekJson = JSON.parse(week.output); } catch { weekJson = null; }
    unit('live:history --since 7d keeps the last week',
      week.code === 0 && weekJson
        && weekJson.total === 2 && weekJson.file_total === 3
        && weekJson.since && weekJson.since.input === '7d'
        && weekJson.passes.length === 2,
      String(week.output).slice(0, 180));

    const weekTable = await runNode(REPORT, ['--since', '7d'], { LIVE_CSV: recentCsv });
    unit('live:history --since 7d prints the resolved window',
      weekTable.code === 0 && weekTable.output.includes('Desde')
        && weekTable.output.includes('2 de 3 pasadas'),
      weekTable.output.trim().split('\n').slice(0, 4).join(' | '));

    const badSince = await runNode(REPORT, ['--since', 'ayer'], { LIVE_CSV: reportCsv });
    unit('live:history rejects an unreadable --since date',
      badSince.code === 1 && badSince.output.includes('no entiendo la fecha'),
      badSince.output.trim().split('\n').pop());

    const missingSince = await runNode(REPORT, ['--since'], { LIVE_CSV: reportCsv });
    unit('live:history asks for the --since date',
      missingSince.code === 1 && missingSince.output.includes('--since necesita una fecha'),
      missingSince.output.trim().split('\n').pop());

    const missing = await runNode(REPORT, [], { LIVE_CSV: path.join(reportDir, 'nope.csv') });
    unit('live:history explains a missing CSV',
      missing.code === 1 && missing.output.includes('npm run live'),
      missing.output.trim().split('\n').pop());

    const foreign = path.join(reportDir, 'foreign.csv');
    fs.writeFileSync(foreign, 'foo,bar\r\n1,2\r\n');
    const rejected = await runNode(REPORT, [], { LIVE_CSV: foreign });
    unit('live:history rejects a foreign CSV',
      rejected.code === 1 && rejected.output.includes('cabecera'),
      rejected.output.trim().split('\n').pop());

    const empty = path.join(reportDir, 'empty.csv');
    fs.writeFileSync(empty, `${HEADER}\r\n`);
    const noRows = await runNode(REPORT, [], { LIVE_CSV: empty });
    unit('live:history says when there are no passes yet',
      noRows.code === 1 && noRows.output.includes('ninguna pasada legible'),
      noRows.output.trim().split('\n').pop());

    // Filtro por cuenta, solo y combinado con la ventana de fecha.
    const usersCsv = path.join(reportDir, 'users.csv');
    fs.writeFileSync(usersCsv, [
      HEADER,
      '2026-11-02T09:00:00.000Z,1,1,+0.10,0.00,0.10,0.10,0,2,Ana,v7.41.0,+0.1',
      '2026-11-02T10:00:00.000Z,1,1,+0.40,0.00,0.40,0.40,0,2,Bob,v7.41.0,+0.4',
      '2026-11-02T11:00:00.000Z,1,1,+0.70,0.00,0.70,0.70,0,2,Ana,v7.41.0,+0.7',
    ].join('\r\n') + '\r\n');

    const userJson = await runNode(REPORT, ['--json', '--user', 'ana'], { LIVE_CSV: usersCsv });
    let filteredUser = null;
    try { filteredUser = JSON.parse(userJson.output); } catch { filteredUser = null; }
    unit('live:history --user filters by account, case-insensitive',
      userJson.code === 0 && filteredUser
        && filteredUser.total === 2 && filteredUser.file_total === 3
        && filteredUser.user === 'ana'
        && filteredUser.passes.every((pass) => pass.user === 'Ana')
        && filteredUser.accounts.length === 2
        && filteredUser.accounts[0] === 'Ana' && filteredUser.accounts[1] === 'Bob'
        && filteredUser.trend && filteredUser.trend.previous === 0.1,
      String(userJson.output).slice(0, 180));

    const userTable = await runNode(REPORT, ['--user', 'Ana'], { LIVE_CSV: usersCsv });
    unit('live:history --user prints the account it used',
      userTable.code === 0 && userTable.output.includes('Usuario Ana')
        && userTable.output.includes('2 de 3 pasadas'),
      userTable.output.trim().split('\n').slice(0, 4).join(' | '));

    const userSince = await runNode(REPORT, ['--json', '--user', 'Ana', '--since', '2026-11-02T10:30:00.000Z'], { LIVE_CSV: usersCsv });
    let narrowed = null;
    try { narrowed = JSON.parse(userSince.output); } catch { narrowed = null; }
    unit('live:history --user combines with --since',
      userSince.code === 0 && narrowed && narrowed.total === 1
        && narrowed.passes[0].mean === 0.7
        && narrowed.since && narrowed.since.at === '2026-11-02T10:30:00.000Z',
      String(userSince.output).slice(0, 180));

    const lastFiltered = await runNode(REPORT, [
      '--json', '--compare', 'last', '--user', 'Ana', '--since', '2026-11-02T08:00:00.000Z',
    ], { LIVE_CSV: usersCsv });
    let lastWindow = null;
    try { lastWindow = JSON.parse(lastFiltered.output); } catch { lastWindow = null; }
    unit('live:history --compare last combines --user and --since',
      lastFiltered.code === 0 && lastWindow
        && lastWindow.mode === 'average' && lastWindow.count === 1
        && lastWindow.user === 'Ana' && lastWindow.since
        && lastWindow.since.at === '2026-11-02T08:00:00.000Z'
        && lastWindow.last.mean === 0.7 && lastWindow.average.mean === 0.1
        && lastWindow.diff.mean === 0.6
        && lastWindow.accounts.length === 2,
      String(lastFiltered.output).slice(0, 180));

    const userMissing = await runNode(REPORT, ['--user', 'nadie'], { LIVE_CSV: usersCsv });
    unit('live:history explains an account with no passes',
      userMissing.code === 1 && userMissing.output.includes('no hay ninguna pasada de "nadie"'),
      userMissing.output.trim().split('\n').pop());

    const userEmpty = await runNode(REPORT, ['--user'], { LIVE_CSV: usersCsv });
    unit('live:history asks for the --user name',
      userEmpty.code === 1 && userEmpty.output.includes('--user necesita un nombre'),
      userEmpty.output.trim().split('\n').pop());
  } finally {
    fs.rmSync(reportDir, { recursive: true, force: true });
  }

  // Exportacion: se ejecuta el CLI real contra dos directorios temporales,
  // nunca contra el Downloads ni la carpeta del chat de la persona.
  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nta-export-'));
  const localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nta-export-chat-'));
  const exportEnv = { EXPORT_DIR: exportDir, EXPORT_LOCAL_DIR: localDir };
  try {
    const scriptText = fs.readFileSync(SCRIPT_PATH, 'utf8');
    const scriptVersion = (scriptText.match(/@version\s+(\S+)/) || [])[1];
    const downloadFile = 'NITRO WRAITH.txt';
    const chatFile = 'Nitro Type userscript.txt';
    const downloaded = path.join(exportDir, downloadFile);
    const local = path.join(localDir, chatFile);

    const exported = await runNode(EXPORT, [], exportEnv);
    unit('export writes Downloads and chat under their own stable names',
      exported.code === 0 && exported.output.includes(`@version ${scriptVersion}`)
        && fs.existsSync(downloaded) && fs.readFileSync(downloaded, 'utf8') === scriptText
        && fs.existsSync(local) && fs.readFileSync(local, 'utf8') === scriptText,
      exported.output.trim().split('\n').slice(-3).join(' | '));

    // La segunda pasada sobrescribe cada fichero, borra las copias con version
    // de su propio nombre y, en el chat, retira la copia vieja con el nombre
    // largo de Downloads. Los archivos ajenos se quedan.
    const oldDownload = 'NITRO WRAITH-0.0.1.txt';
    const notesDownload = 'NITRO WRAITH-notas.txt';
    const oldChat = 'Nitro Type userscript-0.0.1.txt';
    const notesChat = 'Nitro Type userscript-notas.txt';
    const legacyChatLong = 'NITRO WRAITH.txt';
    const unrelated = 'keep.txt';

    fs.writeFileSync(path.join(exportDir, oldDownload), 'old');
    fs.writeFileSync(path.join(exportDir, notesDownload), 'notes');
    fs.writeFileSync(path.join(exportDir, unrelated), 'keep');
    fs.writeFileSync(path.join(exportDir, downloadFile), 'stale');

    fs.writeFileSync(path.join(localDir, oldChat), 'old');
    fs.writeFileSync(path.join(localDir, notesChat), 'notes');
    fs.writeFileSync(path.join(localDir, legacyChatLong), 'stale long');
    fs.writeFileSync(path.join(localDir, unrelated), 'keep');
    fs.writeFileSync(path.join(localDir, chatFile), 'stale');

    const again = await runNode(EXPORT, [], exportEnv);
    const producedDownload = fs.readdirSync(exportDir)
      .filter((name) => name.startsWith('NITRO WRAITH-'))
      .sort();
    const producedChat = fs.readdirSync(localDir)
      .filter((name) => name.startsWith('Nitro Type userscript-'))
      .sort();
    unit('export overwrites both files and drops versioned plus old chat copies',
      again.code === 0
        && !fs.existsSync(path.join(exportDir, oldDownload))
        && !fs.existsSync(path.join(localDir, oldChat))
        && !fs.existsSync(path.join(localDir, legacyChatLong))
        && fs.readFileSync(downloaded, 'utf8') === scriptText
        && fs.readFileSync(local, 'utf8') === scriptText
        && producedDownload.length === 1 && producedDownload[0] === notesDownload
        && producedChat.length === 1 && producedChat[0] === notesChat
        && fs.existsSync(path.join(exportDir, unrelated))
        && fs.existsSync(path.join(localDir, unrelated)),
      again.output.trim().split('\n').slice(-6).join(' | '));
  } finally {
    fs.rmSync(exportDir, { recursive: true, force: true });
    fs.rmSync(localDir, { recursive: true, force: true });
  }

  // Tema del panel: las seis paletas viven en el CSS, la rejilla de TUNE las
  // lista todas, la eleccion se guarda con su propia clave y el panel pequeno
  // del garaje recibe la misma piel.
  const themeScript = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const themeCss = themeScript.slice(themeScript.indexOf('      <style>'), themeScript.indexOf('      </style>'));
  const themeNames = ['carbon', 'aurora', 'sunset', 'ice', 'violet', 'rgb'];
  unit('every panel theme has a palette, a tile and a saved key',
    themeNames.every((name) => themeCss.includes(`.panel[data-theme="${name}"]`)
      && themeScript.includes(`data-theme-btn="${name}"`))
      && /function registerThemeProperties\(\)/.test(themeScript)
      && themeScript.includes('CSS.registerProperty')
      && themeScript.includes("name: '--nt-hue'")
      && themeScript.includes("name: '--nt-angle'")
      && (themeScript.match(/@keyframes nt-rgb-hue/g) || []).length >= 2
      && themeScript.includes('.p[data-theme="violet"]')
      && /panelTheme: 'autoTyperPanelTheme'/.test(themeScript)
      && themeScript.includes('data-theme="${panelTheme}"'),
    themeNames.filter((name) => !themeCss.includes(`.panel[data-theme="${name}"]`)).join(', '));

  unit('the panel skin no longer hardcodes the old green',
    !/rgba\(53, 234, 134/.test(themeCss) && !/rgba\(130, 255, 190/.test(themeCss)
      && /color-mix\(in srgb, var\(--acc\)/.test(themeCss),
    (themeCss.match(/rgba\(53, 234, 134[^)]*\)/g) || []).slice(0, 3).join(' '));

  // Contraste de las seis pieles: los textos pequenos (--dim y --dim-2) tienen
  // que llegar a 4.5:1 sobre el fondo mas claro del panel. Se leen las paletas
  // del propio CSS, no una copia en el test, para que un cambio de color sin
  // revisar la legibilidad falle aqui.
  const themePalettes = (() => {
    const read = (block) => {
      const value = (name) => {
        const hit = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
        return hit ? hit[1].trim() : '';
      };
      return { dim: value('dim'), dim2: value('dim-2'), bg: value('bg-hi') };
    };

    const base = themeCss.slice(themeCss.indexOf('.panel {'), themeCss.indexOf('/* ---------- temas'));
    const out = { carbon: read(base) };
    for (const name of themeNames.slice(1)) {
      const start = themeCss.indexOf(`.panel[data-theme="${name}"]`);
      out[name] = read(themeCss.slice(start, themeCss.indexOf('}', start) + 1));
    }
    return out;
  })();

  const channel = (value) => (value <= 0.03928
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = ([r, g, b]) => 0.2126 * channel(r / 255)
    + 0.7152 * channel(g / 255) + 0.0722 * channel(b / 255);
  const color = (text) => {
    const raw = String(text || '').trim();
    if (raw.startsWith('#')) return raw.slice(1).match(/../g).map((part) => parseInt(part, 16));
    const rgba = raw.match(/rgba?\(([^)]+)\)/);
    if (!rgba) return null;
    const [r, g, b, a = 1] = rgba[1].split(',').map((part) => Number(part.trim()));
    return [r * a, g * a, b * a];   // el panel se apoya en negro
  };
  const contrastRatio = (fg, bg) => {
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const contrast = Object.entries(themePalettes).map(([name, palette]) => {
    const bg = color(palette.bg);
    const fg = color(palette.dim);
    const fg2 = color(palette.dim2);
    return {
      name,
      dim: bg && fg ? contrastRatio(fg, bg) : 0,
      dim2: bg && fg2 ? contrastRatio(fg2, bg) : 0,
    };
  });
  unit('every panel theme keeps small text at 4.5:1',
    contrast.length === themeNames.length
      && contrast.every((item) => item.dim >= 4.5 && item.dim2 >= 4.5),
    contrast.map((item) => `${item.name} ${item.dim.toFixed(2)}/${item.dim2.toFixed(2)}`).join(' · '));

  for (const item of CASES) {
    const result = await runCase(item);
    const ok = result.problems.length === 0;
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${result.name}${ok ? '' : `  ${result.problems.join(' · ')}`}`);
    if (!ok) {
      for (const line of result.output.trim().split('\n').slice(-6)) console.log(`      ${line}`);
    }
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} live checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
})().catch((error) => {
  console.error(`\nlive test error: ${error.stack || error}`);
  process.exitCode = 1;
});
