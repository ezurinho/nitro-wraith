#!/usr/bin/env node
'use strict';

/*
 * Presupuesto del artefacto instalable.
 *
 * Este userscript se evalua en cada carga de nitrotype.com: el tamano no es
 * solo una cifra de repo. Los limites se comprueban en `npm run check` para
 * que una funcion nueva no engorde el archivo sin que nadie lo vea.
 *
 * Los numeros se miden sobre el artefacto generado (LF), no sobre src/, y el
 * gzip usa el mismo nivel que un CDN. Si un limite se queda corto por una
 * razon deliberada, se sube aqui en el mismo commit que lo justifica.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'nitro-wraith.user.js');
const LIMITS = {
  bytes: 1_150_000,
  gzip: 335_000,
  lines: 23_500,
  fragment: 370_000,
};

function fail(message) {
  console.error(`budget: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(SCRIPT)) fail('nitro-wraith.user.js is missing; run npm run build.');

const raw = fs.readFileSync(SCRIPT);
const text = raw.toString('utf8');
const bytes = raw.length;
const gzip = zlib.gzipSync(raw, { level: 9 }).length;
const lines = text.split('\n').length;

const fragments = fs.readdirSync(path.join(ROOT, 'src'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => {
    const size = fs.statSync(path.join(ROOT, 'src', name)).size;
    return { name, size };
  })
  .sort((a, b) => b.size - a.size);

const over = [];
if (bytes > LIMITS.bytes) over.push(`${bytes} bytes > ${LIMITS.bytes}`);
if (gzip > LIMITS.gzip) over.push(`${gzip} gzip bytes > ${LIMITS.gzip}`);
if (lines > LIMITS.lines) over.push(`${lines} lines > ${LIMITS.lines}`);
for (const fragment of fragments) {
  if (fragment.size > LIMITS.fragment) {
    over.push(`src/${fragment.name} is ${fragment.size} bytes > ${LIMITS.fragment}`);
  }
}

const pct = (value, limit) => Math.round((value / limit) * 100);
console.log(
  `artifact ${bytes} bytes (${pct(bytes, LIMITS.bytes)}%), `
  + `${gzip} gzip (${pct(gzip, LIMITS.gzip)}%), ${lines} lines (${pct(lines, LIMITS.lines)}%)`,
);
console.log(`largest fragments: ${fragments.slice(0, 4).map((f) => `${f.name} ${f.size}`).join(', ')}`);

if (over.length) fail(`over budget: ${over.join('; ')}`);
