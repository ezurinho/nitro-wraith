'use strict';

/*
 * Informe del historico de pasadas (tests/live/live-history.csv).
 *
 *   npm run live:history
 *   npm run live:history -- --limit 5
 *   npm run live:history -- --json
 *   npm run live:history -- --since "11-02"
 *   npm run live:history -- --compare "11-02 11:00" "11-02 12:00"
 *   npm run live:history -- --compare last
 *   LIVE_CSV=C:\\otro\\live-history.csv npm run live:history
 *
 * Imprime las ultimas pasadas de la mas nueva a la mas vieja, con la media de
 * `model delta`, su desviacion, el rango y cuantas muestras se salieron de la
 * banda. Cada pasada con `outside > 0` lleva `WARN`.
 *
 * La fila `Tendencia` compara la ultima pasada con la media de las anteriores
 * y avisa cuando la deriva pasa de +-0.5 pts, el mismo umbral que la tarjeta
 * Live passes del panel. `formatHistory()` es lo que usa tambien `npm run live`
 * para imprimir el informe al terminar una pasada.
 *
 * Sale con 1 si no hay archivo, si la cabecera no es la del historico, si no
 * queda ninguna fila legible o si `--compare` no resuelve sus dos fechas.
 */

const fs = require('fs');
const path = require('path');
const { parseHistory } = require('./history');

const DEFAULT_CSV = path.join(__dirname, 'live-history.csv');
const DRIFT_PTS = 0.5;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 200;

function pad(text, width, align) {
  const value = String(text);
  return align === 'right' ? value.padStart(width) : value.padEnd(width);
}

function signed(value, digits) {
  return `${value >= 0 ? '+' : ''}${Number(value).toFixed(digits)}`;
}

function signedInt(value) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function two(value) {
  return String(value).padStart(2, '0');
}

function parseAt(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Fecha local corta; una fecha ilegible se deja tal cual en vez de inventarse.
function shortStamp(iso) {
  const date = parseAt(iso);
  if (!date) return String(iso).slice(0, 16);
  return `${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

function longStamp(iso) {
  const date = parseAt(iso);
  if (!date) return String(iso).slice(0, 16);
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

// Claves con las que `--compare` reconoce una pasada: ISO completo, fecha y
// hora local, y solo el dia. Se comparan por prefijo.
function matchKeys(iso) {
  const long = longStamp(iso);
  const keys = [
    String(iso).toLowerCase(),
    shortStamp(iso).toLowerCase(),
    long.toLowerCase(),
    long.replace(' ', 'T').toLowerCase(),
  ];
  const date = parseAt(iso);
  if (date) keys.push(`${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`);
  return keys;
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

// Fecha del argumento -> instante local. Acepta ISO completo, `YYYY-MM-DD`,
// `YYYY-MM-DD HH:mm`, `MM-DD HH:mm` (ano actual) y ventanas relativas como
// `7d`, `12h` o `30m`, contadas desde ahora. Una fecha sin formato conocido se
// deja a Date; si tampoco la entiende, devuelve null.
function parseDateArg(text) {
  const value = String(text || '').trim();
  if (!value) return null;

  const relative = value.match(/^(\d+)\s*([dhm])$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const step = unit === 'd' ? 86400000 : unit === 'h' ? 3600000 : 60000;
    return new Date(Date.now() - amount * step);
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (match) {
    const [, year, month, day, hours = '0', minutes = '0'] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));
  }

  match = value.match(/^(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (match) {
    const [, month, day, hours = '0', minutes = '0'] = match;
    return new Date(new Date().getFullYear(), Number(month) - 1, Number(day), Number(hours), Number(minutes));
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

// Ventana de `--since`: se queda con las pasadas en o despues del corte.
function filterSince(rows, since) {
  if (!since) return rows;
  const cutoff = new Date(since.at).getTime();
  return rows.filter((row) => {
    const at = new Date(row.at).getTime();
    return !Number.isNaN(at) && at >= cutoff;
  });
}

// `--user`: la cuenta del CSV, sin distinguir mayusculas.
function filterUser(rows, user) {
  if (!user) return rows;
  const needle = String(user).toLowerCase();
  return rows.filter((row) => String(row.user || '').toLowerCase() === needle);
}

function applyFilters(rows, { since = null, user = null } = {}) {
  return filterUser(filterSince(rows, since), user);
}

function noWindowError({ since = null, user = null } = {}) {
  const bits = [];
  if (user) bits.push(`de "${user}"`);
  if (since) bits.push(`desde ${since.label}`);
  return `no hay ninguna pasada ${bits.join(' ')}`.trim();
}

// Cuentas distintas del archivo, ordenadas. No depende de `--user`: el filtro
// recorta las pasadas, no la lista de cuentas que trae el historico.
function accountsOf(rows) {
  return [...new Set(rows.map((row) => String(row.user || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

// Cabecera de la ventana: usuario y fecha, con cuantas pasadas quedan del archivo.
function filterLine(parsed, rows, since, user) {
  const bits = [];
  if (user) bits.push(`Usuario ${user}`);
  if (since) bits.push(`Desde ${since.label}`);
  if (!bits.length) return null;
  return `${bits.join(' · ')} · ${rows.length} de ${plural(parsed.rows.length, 'pasada', 'pasadas')}`;
}

function passJson(row) {
  return {
    at: row.at,
    races: row.races,
    samples: row.samples,
    mean: round(row.mean),
    sd: round(row.sd),
    min: round(row.min),
    max: round(row.max),
    outside: row.outside,
    tolerance: row.tolerance,
    user: row.user,
    version: row.version,
    deltas: row.deltas,
    warn: row.outside > 0,
  };
}

function trendOf(rows) {
  if (rows.length < 2) return null;

  const last = rows[rows.length - 1];
  const previous = rows.slice(0, -1);
  const average = previous.reduce((sum, row) => sum + row.mean, 0) / previous.length;
  const delta = last.mean - average;

  return {
    mean: round(last.mean),
    previous: round(average),
    delta: round(delta),
    warn: Math.abs(delta) > DRIFT_PTS,
  };
}

// Racha final: pasadas seguidas cuya media se separa de la media de las que
// la preceden. Es la misma cuenta que el panel, pero sobre toda la ventana
// del informe; dos seguidas ya no son una pasada rara.
function streakOf(rows) {
  if (rows.length < 2) return null;

  const drifts = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    let sum = 0;
    for (let j = 0; j < i; j++) sum += rows[j].mean;
    const drift = rows[i].mean - sum / i;
    if (Math.abs(drift) <= DRIFT_PTS) break;
    drifts.unshift({ at: rows[i].at, drift: round(drift) });
  }

  return drifts.length >= 2 ? { count: drifts.length, drifts } : null;
}

// WPM oficial del paquete de meta frente al modelo. Solo lo manda `npm run
// live`, que es quien acaba de leer el historial del userscript; el informe
// del CSV (`live:history`) lo deja en null en vez de inventarlo.
function serverWpmSummary(rows) {
  if (!Array.isArray(rows)) return null;

  const usable = rows.filter((row) => row
    && Number.isFinite(Number(row.official))
    && Number.isFinite(Number(row.model)));
  if (!usable.length) return null;

  const list = usable.map((row) => ({
    race: Number(row.race) || 0,
    source: String(row.source || 'server'),
    official: round(row.official, 1),
    model: round(row.model, 1),
    delta: round(Number(row.model) - Number(row.official)),
  }));
  const mean = (values) => values.reduce((sum, n) => sum + n, 0) / values.length;

  return {
    races: list.length,
    mean_official: round(mean(list.map((row) => row.official)), 1),
    mean_model: round(mean(list.map((row) => row.model)), 1),
    mean_delta: round(mean(list.map((row) => row.delta))),
    sources: [...new Set(list.map((row) => row.source))],
    rows: list,
  };
}

function listing(parsed, { file, limit, since = null, user = null, season = null, wpm = null }) {
  const rows = applyFilters(parsed.rows, { since, user });
  if (!rows.length) {
    return { error: noWindowError({ since, user }) };
  }

  const shown = rows.slice(-limit).reverse();
  const outside = rows.filter((row) => row.outside > 0).length;
  const last = rows[rows.length - 1];
  const trend = trendOf(rows);

  const data = {
    file,
    total: rows.length,
    file_total: parsed.rows.length,
    shown: shown.length,
    outside,
    unreadable: parsed.bad || 0,
    since: since ? { input: since.input, at: since.at } : null,
    user: user || null,
    accounts: accountsOf(parsed.rows),
    last: last.at,
    drift_threshold: DRIFT_PTS,
    trend,
    streak: streakOf(rows),
    season: season || null,
    server_wpm: serverWpmSummary(wpm),
    passes: shown.map(passJson),
  };

  const lines = [`Nitro Type · histórico de pasadas (${file})`];
  const filter = filterLine(parsed, rows, since, user);
  if (filter) lines.push(filter);
  if (season) {
    const bits = [season.name, season.tier, season.xp, season.next, season.pace, season.ends].filter(Boolean);
    lines.push(`Temporada: ${bits.join(' · ')}`);
  }
  lines.push('');

  lines.push([
    pad('#', 3),
    pad('fecha', 12),
    pad('carreras', 9, 'right'),
    pad('muestras', 9, 'right'),
    pad('media', 9, 'right'),
    pad('sd', 6, 'right'),
    pad('rango', 16, 'right'),
    pad('fuera', 7, 'right'),
    '',
  ].join(' ').trimEnd());

  for (let index = 0; index < shown.length; index++) {
    const row = shown[index];
    lines.push([
      pad(`${shown.length - index}.`, 3),
      pad(shortStamp(row.at), 12),
      pad(row.races, 9, 'right'),
      pad(row.samples, 9, 'right'),
      pad(signed(row.mean, 2), 9, 'right'),
      pad(row.sd.toFixed(2), 6, 'right'),
      pad(`${signed(row.min, 1)}..${signed(row.max, 1)}`, 16, 'right'),
      pad(`${row.outside}/${row.samples}`, 7, 'right'),
      row.outside > 0 ? 'WARN' : 'ok',
    ].join(' ').trimEnd());
  }

  const unreadable = parsed.bad ? ` · ${parsed.bad} fila(s) ilegible(s)` : '';
  lines.push('');
  lines.push(`${shown.length} de ${plural(rows.length, 'pasada', 'pasadas')} · última ${shortStamp(last.at)}`
    + ` · ${outside} con muestras fuera de banda${unreadable}`);

  // Antes del retorno de "una sola pasada": el WPM oficial de esa carrera
  // también tiene que salir en el primer informe.
  const official = data.server_wpm;
  if (official) {
    const label = official.sources.length === 1 ? official.sources[0] : 'media';
    lines.push(`WPM oficial: ${label} ${official.mean_official.toFixed(1)}`
      + ` · model ${official.mean_model.toFixed(1)} (${signed(official.mean_delta, 1)})`
      + ` · ${plural(official.races, 'carrera', 'carreras')}`
      + (official.sources.length > 1 ? ` · ${official.sources.join('/')}` : ''));
  }

  if (!trend) {
    lines.push('Tendencia: hace falta otra pasada para comparar.');
    return { data, lines };
  }

  lines.push(`Tendencia: ${signed(trend.mean, 2)} vs ${signed(trend.previous, 2)} de las ${rows.length - 1} anteriores`
    + ` (${signed(trend.delta, 2)}) · ${trend.warn ? 'AVISO' : 'ok'}`);
  if (trend.warn) {
    lines.push(`El modelo se separó ${Math.abs(trend.delta).toFixed(2)} pts de la media: revisa el histórico antes de fiarte de una sola pasada.`);
  }

  const streak = data.streak;
  if (streak) {
    lines.push(`Racha: ${streak.count} seguidas fuera de ±${DRIFT_PTS} pts `
      + `(${streak.drifts.map((item) => signed(item.drift, 2)).join(', ')}) · AVISO`);
  } else {
    lines.push('Racha: ninguna de dos seguidas fuera de la banda.');
  }

  return { data, lines };
}

function findPasses(rows, selector) {
  const needle = String(selector || '').trim().toLowerCase();
  if (!needle) return [];
  return rows.filter((row) => matchKeys(row.at).some((key) => key.startsWith(needle)));
}

function matchError(selector, matches, rows) {
  if (!matches.length) {
    return `no encontré ninguna pasada para "${selector}". `
      + `Disponibles: ${rows.map((row) => shortStamp(row.at)).join(' · ')}.`;
  }

  return `"${selector}" coincide con ${matches.length} pasadas `
    + `(${matches.map((row) => shortStamp(row.at)).join(' · ')}); afina la fecha.`;
}

function comparison(parsed, first, second, { file, since = null, user = null }) {
  const rows = applyFilters(parsed.rows, { since, user });
  const aMatches = findPasses(rows, first);
  if (aMatches.length !== 1) return { error: matchError(first, aMatches, rows) };

  const bMatches = findPasses(rows, second);
  if (bMatches.length !== 1) return { error: matchError(second, bMatches, rows) };

  const a = aMatches[0];
  const b = bMatches[0];
  const diff = {
    mean: round(b.mean - a.mean),
    sd: round(b.sd - a.sd),
    races: b.races - a.races,
    samples: b.samples - a.samples,
    outside: b.outside - a.outside,
  };

  const data = {
    file,
    file_total: parsed.rows.length,
    since: since ? { input: since.input, at: since.at } : null,
    user: user || null,
    accounts: accountsOf(parsed.rows),
    a: passJson(a),
    b: passJson(b),
    diff,
    same: a.at === b.at,
  };

  const describe = (label, row) => `  ${label}  ${shortStamp(row.at)} · ${plural(row.races, 'carrera', 'carreras')}`
    + ` · media ${signed(row.mean, 2)} · sd ${row.sd.toFixed(2)}`
    + ` · ${signed(row.min, 1)}..${signed(row.max, 1)} · ${row.outside}/${row.samples} fuera`;

  const lines = [`Comparación de pasadas (${file})`];
  const filter = filterLine(parsed, rows, since, user);
  if (filter) lines.push(filter);
  lines.push('', describe('A', a), describe('B', b), '');
  const row = (label, value, suffix = '') => `  ${pad(label, 10)} ${pad(value, 7, 'right')}${suffix}`;

  lines.push(row('Δ media', signed(diff.mean, 2), ' pts  (B - A)'));
  lines.push(row('Δ sd', signed(diff.sd, 2)));
  lines.push(row('Δ carreras', signedInt(diff.races)));
  lines.push(row('Δ muestras', signedInt(diff.samples)));
  lines.push(row('Δ fuera', signedInt(diff.outside)));
  if (data.same) lines.push('', '  (la misma pasada)');

  return { data, lines };
}

function isLastSelector(value) {
  return /^(last|latest|ultima|última)$/i.test(String(value || '').trim());
}

// `--compare last`: la ultima pasada contra la media de las anteriores, con
// la misma banda de deriva que la fila Tendencia.
function averageComparison(parsed, { file, since = null, user = null }) {
  const rows = applyFilters(parsed.rows, { since, user });
  if (rows.length < 2) {
    return { error: 'hace falta más de una pasada para comparar con la media' };
  }

  const last = rows[rows.length - 1];
  const previous = rows.slice(0, -1);
  const avg = (pick) => previous.reduce((sum, row) => sum + pick(row), 0) / previous.length;
  const mean = avg((row) => row.mean);
  const sd = avg((row) => row.sd);
  const outside = previous.reduce((sum, row) => sum + row.outside, 0);
  const min = Math.min(...previous.map((row) => row.min));
  const max = Math.max(...previous.map((row) => row.max));

  const data = {
    file,
    file_total: parsed.rows.length,
    since: since ? { input: since.input, at: since.at } : null,
    user: user || null,
    accounts: accountsOf(parsed.rows),
    mode: 'average',
    count: previous.length,
    last: passJson(last),
    average: {
      mean: round(mean),
      sd: round(sd),
      min: round(min),
      max: round(max),
      races: round(avg((row) => row.races), 1),
      samples: round(avg((row) => row.samples), 1),
      outside,
    },
    diff: {
      mean: round(last.mean - mean),
      sd: round(last.sd - sd),
      outside: last.outside - outside,
    },
    warn: Math.abs(last.mean - mean) > DRIFT_PTS,
  };

  const lines = [`Comparación con la media (${file})`];
  const filter = filterLine(parsed, rows, since, user);
  if (filter) lines.push(filter);
  lines.push('');
  lines.push(`  última  ${shortStamp(last.at)} · ${plural(last.races, 'carrera', 'carreras')}`
    + ` · media ${signed(last.mean, 2)} · sd ${last.sd.toFixed(2)}`
    + ` · ${signed(last.min, 1)}..${signed(last.max, 1)} · ${last.outside}/${last.samples} fuera`);
  lines.push(`  media   ${previous.length} anteriores · media ${signed(mean, 2)} · sd ${sd.toFixed(2)}`
    + ` · ${signed(min, 1)}..${signed(max, 1)} · ${outside} fuera`);
  lines.push('');

  const row = (label, value, suffix = '') => `  ${pad(label, 10)} ${pad(value, 7, 'right')}${suffix}`;
  lines.push(row('Δ media', signed(data.diff.mean, 2), ' pts  (última - media)'));
  lines.push(row('Δ sd', signed(data.diff.sd, 2)));
  lines.push(row('Δ fuera', signedInt(data.diff.outside)));
  if (data.warn) {
    lines.push('', `AVISO: la última pasada está a ${Math.abs(data.diff.mean).toFixed(2)} pts de la media`
      + ` (banda ±${DRIFT_PTS}).`);
  }

  return { data, lines };
}

// Texto del CSV -> informe listo para imprimir. No imprime ni sale: el CLI y
// `npm run live` comparten esta lectura.
function formatHistory(text, {
  file = DEFAULT_CSV, limit = DEFAULT_LIMIT, since = null, user = null, season = null, wpm = null,
} = {}) {
  const parsed = parseHistory(text);

  if (parsed.error === 'empty') return { error: `${file} está vacío` };
  if (parsed.error === 'header') {
    return { error: `${file} no trae la cabecera del histórico (faltan: ${parsed.missing.join(', ')})` };
  }
  if (!parsed.rows.length) return { error: `${file} no tiene ninguna pasada legible` };

  return listing(parsed, { file, limit, since, user, season, wpm });
}

function fail(message) {
  console.error(`\nlive:history: ${message}\n`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const flag = argv.indexOf('--limit');
  const rawLimit = flag >= 0 ? Number(argv[flag + 1]) : NaN;
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(rawLimit)))
    : DEFAULT_LIMIT;

  const compareAt = argv.indexOf('--compare');
  let compare = null;
  if (compareAt >= 0) {
    // Un valor que empieza por `--` es la siguiente bandera, no una fecha:
    // `--compare last --user Ana` tiene una sola fecha y va contra la media.
    const first = argv[compareAt + 1];
    const second = argv[compareAt + 2];
    compare = {
      first: first && !first.startsWith('--') ? first : '',
      second: second && !second.startsWith('--') ? second : '',
    };
  }

  const sinceAt = argv.indexOf('--since');
  let since = null;
  if (sinceAt >= 0) {
    const value = argv[sinceAt + 1];
    since = { value: value && !value.startsWith('--') ? value : '' };
  }

  const userAt = argv.indexOf('--user');
  let user = null;
  if (userAt >= 0) {
    const value = argv[userAt + 1];
    user = { value: value && !value.startsWith('--') ? value : '' };
  }

  return { limit, compare, since, user, json: argv.includes('--json') };
}

function main() {
  const { limit, compare, json, since: sinceArg, user: userArg } = parseArgs(process.argv.slice(2));
  const file = process.env.LIVE_CSV || DEFAULT_CSV;

  if (!fs.existsSync(file)) {
    fail(`no existe ${file}\nEjecuta \`npm run live\` para añadir la primera pasada, o apunta LIVE_CSV al histórico.`);
    return;
  }

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    fail(`no se pudo leer ${file}: ${error.message}`);
    return;
  }

  if (compare && !compare.first) {
    fail('--compare necesita dos fechas: npm run live:history -- --compare "11-02 11:00" "11-02 12:00"');
    return;
  }
  if (compare && !compare.second && !isLastSelector(compare.first)) {
    fail('--compare necesita dos fechas o `--compare last`: npm run live:history -- --compare last');
    return;
  }

  let since = null;
  if (sinceArg) {
    if (!sinceArg.value) {
      return fail('--since necesita una fecha: npm run live:history -- --since "11-02"');
    }

    const cutoff = parseDateArg(sinceArg.value);
    if (!cutoff) {
      return fail(`no entiendo la fecha "${sinceArg.value}". Usa 2026-11-02, "11-02 17:04", un ISO completo o una ventana como "7d".`);
    }

    since = {
      input: sinceArg.value,
      at: cutoff.toISOString(),
      label: longStamp(cutoff.toISOString()),
    };
  }

  let user = null;
  if (userArg) {
    if (!userArg.value) {
      return fail('--user necesita un nombre: npm run live:history -- --user idkgng');
    }
    user = userArg.value.trim();
  }

  const parsed = parseHistory(text);
  if (parsed.error === 'empty') {
    return fail(`${file} está vacío\nEjecuta \`npm run live\` para añadir la primera pasada.`);
  }
  if (parsed.error === 'header') {
    return fail(`${file} no trae la cabecera del histórico (faltan: ${parsed.missing.join(', ')})\nEjecuta \`npm run live\` para añadir la primera pasada.`);
  }
  if (!parsed.rows.length) {
    return fail(`${file} no tiene ninguna pasada legible\nEjecuta \`npm run live\` para añadir la primera pasada.`);
  }
  if ((since || user) && !applyFilters(parsed.rows, { since, user }).length) {
    const latest = parsed.rows[parsed.rows.length - 1];
    return fail(`${noWindowError({ since, user })}.\nLa más reciente es ${shortStamp(latest.at)}.`);
  }

  let report;
  if (!compare) {
    report = listing(parsed, { file, limit, since, user });
  } else if (!compare.second) {
    report = averageComparison(parsed, { file, since, user });
  } else {
    report = comparison(parsed, compare.first, compare.second, { file, since, user });
  }

  if (report.error) return fail(report.error);

  if (json) {
    console.log(JSON.stringify(report.data, null, 2));
    return;
  }

  for (const line of report.lines) console.log(line);
}

if (require.main === module) main();

module.exports = { DRIFT_PTS, DEFAULT_LIMIT, formatHistory, listing, comparison, shortStamp, parseDateArg };
