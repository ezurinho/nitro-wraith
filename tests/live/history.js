'use strict';

/*
 * Historico de las pasadas de `npm run live`.
 *
 * Una fila por pasada completada: fecha, carreras, muestras, media, desviacion,
 * rango, cuantas se salieron de la banda, la banda usada, usuario, version del
 * panel y los deltas en orden. Asi la comparacion entre sesiones no depende de
 * leer la consola de ayer.
 *
 * El destino se puede cambiar con `LIVE_CSV`; por defecto vive junto a este
 * archivo, fuera del userscript. `parseHistory()` es la lectura que usa
 * `npm run live:history` para resumir esas filas en la terminal.
 */

const fs = require('fs');
const path = require('path');

const HEADER = 'at,races,samples,mean_pts,sd_pts,min_pts,max_pts,outside,tolerance,user,version,deltas';
const MAX_ROWS = 200;

function signed(value) {
  return `${value >= 0 ? '+' : ''}${Number(value).toFixed(1)}`;
}

// Coma, comilla o salto de linea: se cita y se doblan las comillas. Un usuario
// con coma no puede romper la fila.
function cell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Conserva la cabecera y las ultimas MAX_ROWS pasadas. Devuelve null cuando el
// archivo ya cabe: no hay que reescribirlo.
function trimHistory(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (lines.length <= MAX_ROWS + 1) return null;
  return [lines[0], ...lines.slice(-MAX_ROWS)].join('\r\n') + '\r\n';
}

function appendHistory(entry, file) {
  const target = file || process.env.LIVE_CSV || path.join(__dirname, 'live-history.csv');
  const stats = entry.stats || null;

  const line = [
    entry.at || new Date().toISOString(),
    entry.races,
    entry.samples,
    stats ? stats.mean.toFixed(2) : '',
    stats ? stats.sd.toFixed(2) : '',
    stats ? stats.min.toFixed(1) : '',
    stats ? stats.max.toFixed(1) : '',
    entry.outside,
    entry.tolerance,
    entry.user || '',
    entry.version || '',
    (entry.deltas || []).map(signed).join(' '),
  ].map(cell).join(',');

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const fresh = !fs.existsSync(target) || fs.statSync(target).size === 0;
    fs.appendFileSync(target, `${fresh ? `${HEADER}\r\n` : ''}${line}\r\n`);

    // Poda perezosa: solo reescribe cuando de verdad sobran filas. El CSV es
    // pequeno y esta lectura no puede tumbar una pasada ya medida.
    try {
      const trimmed = trimHistory(fs.readFileSync(target, 'utf8'));
      if (trimmed) fs.writeFileSync(target, trimmed);
    } catch { /* se queda como estaba */ }

    return target;
  } catch {
    // No poder escribir el historico no puede tumbar una pasada que ya midio.
    return null;
  }
}

// Lector de CSV con comillas: un usuario con coma no puede descolocar la fila.
function parseLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { value += '"'; i++; }
        else quoted = false;
      } else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(value); value = ''; }
    else value += ch;
  }

  cells.push(value);
  return cells;
}

// Devuelve las pasadas legibles del historico. Una cabecera ajena o vacia se
// rechaza con `error` en vez de pintar ceros: el archivo tiene que ser el de
// appendHistory(). Las filas rotas se cuentan aparte y no tumban el informe.
function parseHistory(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { error: 'empty' };

  const header = parseLine(lines[0]).map((name) => name.trim());
  const fields = HEADER.split(',');
  const missing = fields.filter((name) => !header.includes(name));
  if (missing.length) return { error: 'header', missing };

  const column = (name) => header.indexOf(name);
  const cellAt = (cells, name) => (column(name) >= 0 ? cells[column(name)] || '' : '');
  const numberAt = (cells, name, fallback) => {
    const value = Number(cellAt(cells, name).trim());
    return Number.isFinite(value) ? value : fallback;
  };

  const rows = [];
  let bad = 0;

  for (const line of lines.slice(1)) {
    const cells = parseLine(line);
    const at = cellAt(cells, 'at').trim();
    const races = numberAt(cells, 'races', NaN);
    const mean = numberAt(cells, 'mean_pts', NaN);

    if (!at || !Number.isFinite(races) || !Number.isFinite(mean)) { bad++; continue; }

    const deltas = cellAt(cells, 'deltas').trim()
      .split(/\s+/)
      .map(Number)
      .filter((value) => Number.isFinite(value));

    rows.push({
      at,
      races,
      samples: numberAt(cells, 'samples', deltas.length),
      mean,
      sd: numberAt(cells, 'sd_pts', 0),
      min: numberAt(cells, 'min_pts', mean),
      max: numberAt(cells, 'max_pts', mean),
      outside: numberAt(cells, 'outside', 0),
      tolerance: numberAt(cells, 'tolerance', 2),
      user: cellAt(cells, 'user'),
      version: cellAt(cells, 'version'),
      deltas,
    });
  }

  return { header, rows, bad };
}

module.exports = { HEADER, MAX_ROWS, appendHistory, trimHistory, parseHistory, parseLine };
