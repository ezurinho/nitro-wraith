#!/usr/bin/env node
'use strict';

/*
 * Regresion visual del panel.
 *
 * Las capturas las produce el banco de pruebas con el estado sembrado: los seis
 * temas de Live y Tune/Log/garaje en espera, en carrera y detenido. Este CLI
 * las compara contra las baselines guardadas en `tests/visual/baselines/` y
 * falla cuando mas de un umbral de pixeles cambia. No hay dependencias: PNG se
 * decodifica con `zlib`, que viene con Node.
 *
 *   npm run visual         # captura + compara
 *   npm run visual:accept  # captura + guarda las baselines nuevas
 *
 * El umbral vive en tests/visual/config.json. La tolerancia por canal perdona
 * el antialiasing; el ratio de pixeles distintos detecta un layout movido, una
 * fila nueva o un tema roto. Cada captura lleva una huella del navegador: una
 * baseline de otra plataforma se avisa en el informe (las fuentes no son las
 * mismas), y se regenera con `visual:accept` en esa maquina.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'tests', 'visual', 'config.json');
const CURRENT_DIR = path.join(ROOT, 'tests', 'visual', 'current');
const BASELINE_DIR = path.join(ROOT, 'tests', 'visual', 'baselines');
const REPORT_FILE = path.join(CURRENT_DIR, 'report.json');
const MANIFEST_FILE = path.join(BASELINE_DIR, 'manifest.json');

function fail(message) {
  console.error(`visual: ${message}`);
  process.exit(1);
}

// `--only <texto>` limita la orden a las capturas cuyo id, archivo o etiqueta
// contenga ese texto. Sin el, `accept` sobrescribe las quince baselines de una
// vez y un cambio de layout arrastra consigo las regresiones que vinieron con
// el: aceptar `log` no tiene por que aceptar `garage`.
function onlyFilter() {
  const at = process.argv.indexOf('--only');
  if (at < 0) return '';
  const value = String(process.argv[at + 1] || '').trim().toLowerCase();
  if (!value) fail('--only needs a value, for example --only log');
  return value;
}

function selectShots(shots) {
  const only = onlyFilter();
  if (!only) return shots;
  const matched = shots.filter((shot) => `${shot.id} ${shot.file} ${shot.label}`.toLowerCase().includes(only));
  if (!matched.length) fail(`--only ${only} matches no shot`);
  return matched;
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function config() {
  const value = readJson(CONFIG_FILE);
  if (!value) fail(`missing ${path.relative(ROOT, CONFIG_FILE)}`);
  const themes = Array.isArray(value.themes) ? value.themes.filter(Boolean) : [];
  if (!themes.length) fail('config.themes is empty');
  return {
    themes,
    maxDiffRatio: Number(value.maxDiffRatio) > 0 ? Number(value.maxDiffRatio) : 0.0025,
    channelTolerance: Number.isFinite(Number(value.channelTolerance))
      ? Math.max(0, Math.min(255, Number(value.channelTolerance)))
      : 12,
    viewport: value.viewport || null,
    views: Array.isArray(value.views)
      ? value.views.filter((view) => typeof view === 'string' && view.trim())
      : [],
    states: Array.isArray(value.states)
      ? value.states.filter((state) => typeof state === 'string' && state.trim())
      : [],
  };
}

// Una captura por tema de Live y una por vista/estado fuera de Live. El nombre
// del archivo es la identidad de la baseline: `theme-carbon.png` o
// `view-tune-idle.png`.
function shotList(cfg) {
  const shots = cfg.themes.map((theme) => ({
    id: `theme-${theme}`,
    file: `theme-${theme}.png`,
    label: theme,
    theme,
  }));
  for (const view of cfg.views) {
    for (const state of cfg.states) {
      const id = `view-${view}-${state}`;
      shots.push({ id, file: `${id}.png`, label: `${view} · ${state}`, view, state });
    }
  }
  return shots;
}

/* --------------------------------------------------------------------------
 * PNG: solo lo que produce `Page.captureScreenshot` (8 bits, sin paleta, sin
 * entrelazado). Cualquier otra cosa se rechaza con un mensaje claro en vez de
 * comparar bytes que no significan nada.
 * ------------------------------------------------------------------------ */

const PNG_SIGNATURE = 0x89504e47;

function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || buffer.readUInt32BE(0) !== PNG_SIGNATURE) {
    throw new Error('not a PNG');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  for (let offset = 8; offset + 8 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buffer.length) throw new Error('truncated PNG chunk');

    if (type === 'IHDR') {
      width = buffer.readUInt32BE(start);
      height = buffer.readUInt32BE(start + 4);
      bitDepth = buffer[start + 8];
      colorType = buffer[start + 9];
      interlace = buffer[start + 12];
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(start, end));
    } else if (type === 'IEND') {
      break;
    }

    offset = end + 4;
  }

  if (!width || !height) throw new Error('PNG without a usable IHDR');
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error('interlaced PNG is not supported');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported PNG color type ${colorType}`);
  if (!idat.length) throw new Error('PNG without IDAT');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos];
    pos += 1;
    const row = raw.subarray(pos, pos + stride);
    pos += stride;
    if (row.length !== stride) throw new Error('truncated PNG scanline');
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let value = row[x];

      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) {
        throw new Error(`unsupported PNG filter ${filter}`);
      }

      out[x] = value & 0xff;
    }
  }

  return { width, height, channels, pixels };
}

function rgbaAt(image, x, y) {
  const index = (y * image.width + x) * image.channels;
  const p = image.pixels;
  if (image.channels === 1) return [p[index], p[index], p[index], 255];
  if (image.channels === 2) return [p[index], p[index], p[index], p[index + 1]];
  if (image.channels === 3) return [p[index], p[index + 1], p[index + 2], 255];
  return [p[index], p[index + 1], p[index + 2], p[index + 3]];
}

function crc32Table() {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
}
const CRC_TABLE = crc32Table();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/* --------------------------------------------------------------------------
 * Comparacion
 * ------------------------------------------------------------------------ */

function comparePair(baselineFile, currentFile, thresholds) {
  const baseline = decodePng(fs.readFileSync(baselineFile));
  const current = decodePng(fs.readFileSync(currentFile));

  if (baseline.width !== current.width || baseline.height !== current.height) {
    return {
      ok: false,
      reason: 'size',
      baseline: { width: baseline.width, height: baseline.height },
      current: { width: current.width, height: current.height },
      changed: null,
      pixels: null,
      ratio: 1,
    };
  }

  const total = baseline.width * baseline.height;
  const overlay = Buffer.alloc(total * 4);
  let changed = 0;
  let minX = baseline.width;
  let minY = baseline.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < baseline.height; y++) {
    for (let x = 0; x < baseline.width; x++) {
      const a = rgbaAt(baseline, x, y);
      const b = rgbaAt(current, x, y);
      const delta = Math.max(
        Math.abs(a[0] - b[0]),
        Math.abs(a[1] - b[1]),
        Math.abs(a[2] - b[2]),
        Math.abs(a[3] - b[3]),
      );
      const index = (y * baseline.width + x) * 4;

      if (delta > thresholds.channelTolerance) {
        changed += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        overlay[index] = 255;
        overlay[index + 1] = 47;
        overlay[index + 2] = 88;
        overlay[index + 3] = 255;
      } else {
        // El fondo se queda en gris muy tenue para que el rojo se vea.
        const gray = Math.round((a[0] + a[1] + a[2]) / 3 * 0.28);
        overlay[index] = gray;
        overlay[index + 1] = gray;
        overlay[index + 2] = gray;
        overlay[index + 3] = 255;
      }
    }
  }

  const ratio = changed / total;
  return {
    ok: ratio <= thresholds.maxDiffRatio,
    reason: ratio <= thresholds.maxDiffRatio ? null : 'pixels',
    width: baseline.width,
    height: baseline.height,
    pixels: total,
    changed,
    ratio,
    bbox: changed ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
    overlay,
  };
}

function capture() {
  fs.rmSync(CURRENT_DIR, { recursive: true, force: true });
  fs.mkdirSync(CURRENT_DIR, { recursive: true });
  console.log('visual: capturing Live themes plus Tune, Log and the garage with the harness...');
  const result = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'live', 'run.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      SHOT_DIR: CURRENT_DIR,
      VISUAL_CAPTURE: '1',
    },
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    return false;
  }
  return true;
}

function compare() {
  const cfg = config();
  const manifest = readJson(MANIFEST_FILE, {});
  const fingerprint = readJson(path.join(CURRENT_DIR, 'fingerprint.json'), {});
  const currentEngine = fingerprint.engine || null;
  const baselineEngine = manifest.engine || null;
  const engineMatches = Boolean(currentEngine && baselineEngine
    && currentEngine.product === baselineEngine.product
    && currentEngine.platform === baselineEngine.platform);

  if (currentEngine && baselineEngine && !engineMatches) {
    console.warn('visual: baseline was captured with a different browser/platform:');
    console.warn(`  baseline: ${baselineEngine.product || '?'} · ${baselineEngine.platform || '?'}`);
    console.warn(`  current:  ${currentEngine.product || '?'} · ${currentEngine.platform || '?'}`);
    console.warn('  fonts differ across platforms; regenerate with `npm run visual:accept` if the diff is text-only.');
  }

  const results = [];
  let failed = 0;
  const shots = selectShots(shotList(cfg));

  for (const shot of shots) {
    const baselineFile = path.join(BASELINE_DIR, shot.file);
    const currentFile = path.join(CURRENT_DIR, shot.file);
    const row = {
      shot: shot.id,
      label: shot.label,
      theme: shot.theme || null,
      view: shot.view || null,
      state: shot.state || null,
      name: shot.file,
      ok: false,
    };

    if (!fs.existsSync(baselineFile)) {
      row.error = 'missing baseline';
    } else if (!fs.existsSync(currentFile)) {
      row.error = 'missing capture';
    } else {
      try {
        const compared = comparePair(baselineFile, currentFile, cfg);
        Object.assign(row, {
          ok: compared.ok,
          reason: compared.reason,
          pixels: compared.pixels,
          changed: compared.changed,
          ratio: compared.ratio,
          bbox: compared.bbox,
          width: compared.width,
          height: compared.height,
        });
        if (compared.overlay) {
          const diffFile = path.join(CURRENT_DIR, `diff-${shot.id}.png`);
          fs.writeFileSync(diffFile, encodePng(compared.width, compared.height, compared.overlay));
          row.diff = path.relative(ROOT, diffFile);
        }
      } catch (error) {
        row.error = error.message;
      }
    }

    if (!row.ok) failed += 1;
    results.push(row);
  }

  const report = {
    at: new Date().toISOString(),
    config: cfg,
    engine: { baseline: baselineEngine, current: currentEngine, matches: engineMatches },
    results,
  };
  fs.mkdirSync(CURRENT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);

  for (const row of results) {
    if (row.error) {
      console.log(`visual: ${row.label.padEnd(18)} FAIL  ${row.error}`);
      continue;
    }
    const pct = `${(row.ratio * 100).toFixed(3)}%`;
    const state = row.ok ? 'ok  ' : 'FAIL';
    const extra = row.ok ? '' : `  bbox ${row.bbox ? `${row.bbox.width}x${row.bbox.height}@${row.bbox.x},${row.bbox.y}` : 'n/a'}`;
    console.log(`visual: ${row.label.padEnd(18)} ${state} ${pct.padStart(8)} of ${row.pixels} px (${row.changed} changed)${extra}`);
  }
  console.log(`visual: threshold ${(cfg.maxDiffRatio * 100).toFixed(2)}% · channel tolerance ${cfg.channelTolerance}/255`);
  console.log(`visual: report ${path.relative(ROOT, REPORT_FILE)}`);
  if (shots.length !== shotList(cfg).length) {
    console.log(`visual: compared ${shots.length} of ${shotList(cfg).length} shots (--only)`);
  }

  if (failed) {
    console.error(`visual: ${failed}/${results.length} shots outside the threshold. Diff images are in ${path.relative(ROOT, CURRENT_DIR)}.`);
    process.exitCode = 1;
    return false;
  }
  console.log(`visual: ${results.length}/${results.length} shots within the threshold.`);
  return true;
}

function accept() {
  const cfg = config();
  const fingerprint = readJson(path.join(CURRENT_DIR, 'fingerprint.json'), {});
  const only = onlyFilter();
  const shots = selectShots(shotList(cfg));
  const images = {};
  const expected = new Set(shotList(cfg).map((shot) => shot.file));

  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  // Una baseline retirada del config se borra para que nadie la confunda con
  // una captura viva; el resto del directorio no se toca. Con --only no se
  // poda nada: lo que no se acepto sigue siendo baseline valida.
  if (!only) {
    for (const file of fs.readdirSync(BASELINE_DIR)) {
      if (/^(theme|view)-.*\.png$/.test(file) && !expected.has(file)) {
        fs.rmSync(path.join(BASELINE_DIR, file), { force: true });
      }
    }
  }

  for (const shot of shots) {
    const from = path.join(CURRENT_DIR, shot.file);
    if (!fs.existsSync(from)) fail(`capture missing for ${shot.id}; run the capture first`);
    const buffer = fs.readFileSync(from);
    const decoded = decodePng(buffer);
    fs.writeFileSync(path.join(BASELINE_DIR, shot.file), buffer);
    images[shot.file] = {
      sha256: sha256(buffer),
      width: decoded.width,
      height: decoded.height,
    };
  }

  // Con --only el manifiesto se fusiona: las baselines que no se aceptaron
  // siguen siendo las mismas y no pueden desaparecer del indice.
  const previous = readJson(MANIFEST_FILE, {});
  const manifest = {
    version: 2,
    capturedAt: new Date().toISOString(),
    engine: fingerprint.engine || null,
    viewport: fingerprint.viewport || cfg.viewport,
    views: cfg.views,
    states: cfg.states,
    thresholds: {
      maxDiffRatio: cfg.maxDiffRatio,
      channelTolerance: cfg.channelTolerance,
    },
    images: only ? { ...(previous.images || {}), ...images } : images,
  };
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`visual: ${shots.length} baseline(s) saved in ${path.relative(ROOT, BASELINE_DIR)}${only ? ` (--only ${only})` : ''}`);
}

function main() {
  const command = process.argv[2] || 'run';
  if (command === 'capture') {
    capture();
    return;
  }
  if (command === 'compare') {
    compare();
    return;
  }
  if (command === 'accept') {
    // Aceptar sin capturas frescas seria guardar lo que hubiera en current.
    const first = selectShots(shotList(config()))[0];
    if (!first || !fs.existsSync(path.join(CURRENT_DIR, first.file))) {
      if (!capture()) return;
    }
    accept();
    return;
  }
  if (command === 'run') {
    if (capture()) compare();
    return;
  }
  console.error('usage: node tools/visual.js [run|capture|compare|accept] [--only <text>]');
  process.exit(2);
}

try {
  main();
} catch (error) {
  fail(error.message || String(error));
}
