#!/usr/bin/env node
'use strict';

/*
 * The installable artifact is one userscript. The source is split into ordered
 * fragments so the 20k-line file can be worked on without shipping extra files
 * to Tampermonkey.
 *
 * This is intentionally a concatenator, not a module loader: every fragment
 * shares the same IIFE lexical scope, exactly like the old single file. Keep
 * the order in MODULES; dependencies are lexical and order-sensitive.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'nitro-wraith.user.js');
const META = path.join(ROOT, 'nitro-wraith.meta.js');

const MODULES = [
  '00-header.js',
  '10-config.js',
  '20-utils.js',
  '30-profile.js',
  '32-history.js',
  '40-dom.js',
  '50-state.js',
  '60-pacing.js',
  '70-session.js',
  '72-results.js',
  '80-panel.js',
  '90-queue.js',
  '95-stickers.js',
  '96-guard.js',
  '97-boot.js',
];

function normalize(text) {
  // Windows puede guardar los fragmentos o el checkout en CRLF. El artefacto se
  // publica con LF y la comprobacion compara contenido, no finales de linea.
  return text.replace(/\r\n?/g, '\n');
}

function readModule(name) {
  return normalize(fs.readFileSync(path.join(ROOT, 'src', name), 'utf8'));
}

function bundle() {
  return MODULES.map(readModule).join('');
}

function metaHeader(text) {
  const end = text.indexOf('// ==/UserScript==');
  if (end < 0) throw new Error('src/00-header.js has no UserScript header.');
  const lineEnd = text.indexOf('\n', end);
  if (lineEnd < 0) return text.slice(0, end + '// ==/UserScript=='.length) + '\n';
  return text.slice(0, lineEnd + 1);
}

function write() {
  const next = bundle();
  const meta = metaHeader(next);
  const raw = fs.existsSync(SCRIPT) ? fs.readFileSync(SCRIPT, 'utf8') : '';
  const rawMeta = fs.existsSync(META) ? fs.readFileSync(META, 'utf8') : '';
  const old = normalize(raw);
  const oldMeta = normalize(rawMeta);

  // Solo se reescribe cuando cambia el CONTENIDO. Los finales de linea son
  // cosa de .gitattributes (`*.js text eol=lf`), que ya deja el checkout en LF
  // en cualquier plataforma: reescribir por una diferencia de CRLF/LF movia el
  // archivo bajo los pies de quien lo estuviera leyendo, que es lo que hacia
  // fallar la comprobacion de artefactos estables del harness.
  if (next !== old) fs.writeFileSync(SCRIPT, next);
  if (meta !== oldMeta) fs.writeFileSync(META, meta);
  console.log(`built ${MODULES.length} modules -> ${path.basename(SCRIPT)} (${next.length} bytes)`);
}

function check() {
  const next = bundle();
  const meta = metaHeader(next);
  const old = fs.existsSync(SCRIPT) ? normalize(fs.readFileSync(SCRIPT, 'utf8')) : '';
  const oldMeta = fs.existsSync(META) ? normalize(fs.readFileSync(META, 'utf8')) : '';

  if (next !== old) {
    throw new Error('nitro-wraith.user.js is stale; run npm run build.');
  }
  if (meta !== oldMeta) {
    throw new Error('nitro-wraith.meta.js is stale; run npm run build.');
  }
  console.log(`build is in sync (${MODULES.length} modules, ${next.length} bytes)`);
}

try {
  if (process.argv[2] === '--check') check();
  else write();
} catch (error) {
  console.error(`build: ${error.message}`);
  process.exit(1);
}
