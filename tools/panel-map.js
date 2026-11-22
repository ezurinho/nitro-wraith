#!/usr/bin/env node
'use strict';

/*
 * Inventario de un modulo del userscript.
 *
 * `src/80-panel.js` no se puede partir por sus titulos de seccion: los hay que
 * no describen lo que tienen debajo (el tema arrastraba filtros de TUNE, salud y
 * configuracion; la temporada arrastra el bucle de refresco del panel y el pace
 * vivo; "Daily Challenges" son 2100 lineas que no son solo retos). Partir por
 * ahi mueve codigo que no era del bloque y el commit dice otra cosa.
 *
 * Esto lista las declaraciones de primer nivel del archivo con su linea, su
 * tipo y el hueco que ocupan hasta la siguiente declaracion. Con eso se elige
 * un cluster por nombre y se mueve lo que de verdad es suyo.
 *
 *   node tools/panel-map.js                    # resumen de src/*.js
 *   node tools/panel-map.js 80-panel.js        # una tabla por archivo
 *   node tools/panel-map.js 80-panel.js --md   # la tabla en markdown
 *
 * No cuenta llaves ni entiende template literals: marca donde empieza cada
 * declaracion y deja que ocupe hasta la siguiente. Es lo que se necesita para
 * decidir un corte, y no puede equivocarse contando llaves dentro de un string.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const DECL = /^  (function|const|let|var)\s+([A-Za-z_$][\w$]*)/;
const TOP = /^  [^ ]/;

function scan(file) {
  const name = path.basename(file);
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').split('\n');
  const entries = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!TOP.test(line)) continue;
    // Cierres sueltos de funcion y comentarios de seccion no son declaraciones.
    if (/^  \}/.test(line) || /^  \/\*/.test(line) || /^  \*/.test(line) || /^  \/\//.test(line)) continue;
    const decl = DECL.exec(line);
    entries.push({
      line: i + 1,
      kind: decl ? (decl[1] === 'function' ? 'fn' : 'state') : 'top',
      name: decl ? decl[2] : line.trim().slice(0, 40),
    });
  }
  entries.forEach((entry, index) => {
    const next = entries[index + 1];
    entry.size = (next ? next.line : lines.length + 1) - entry.line;
  });
  return { name, total: lines.length, entries };
}

function table(result, markdown) {
  const out = [];
  if (markdown) {
    out.push(`### \`${result.name}\` · ${result.total} lineas`, '');
    out.push('| Linea | Tipo | Nombre | Lineas hasta la siguiente |');
    out.push('| --- | --- | --- | --- |');
  } else {
    out.push(`${result.name} · ${result.total} lineas · ${result.entries.length} declaraciones`);
  }
  for (const entry of result.entries) {
    if (markdown) out.push(`| ${entry.line} | ${entry.kind} | \`${entry.name}\` | ${entry.size} |`);
    else out.push(`  ${String(entry.line).padStart(5)}  ${entry.kind.padEnd(5)}  ${String(entry.size).padStart(5)}  ${entry.name}`);
  }
  return out.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const markdown = args.includes('--md');
  const only = args.filter((arg) => !arg.startsWith('--'));
  const files = only.length
    ? only.map((name) => path.join(SRC, name))
    : fs.readdirSync(SRC).filter((name) => name.endsWith('.js')).sort().map((name) => path.join(SRC, name));

  const results = files.map(scan);
  const blocks = results.map((result) => table(result, markdown));
  console.log(blocks.join(markdown ? '\n\n' : '\n\n'));

  if (!only.length) {
    const fns = results.reduce((sum, r) => sum + r.entries.filter((e) => e.kind === 'fn').length, 0);
    const state = results.reduce((sum, r) => sum + r.entries.filter((e) => e.kind === 'state').length, 0);
    const lines = results.reduce((sum, r) => sum + r.total, 0);
    console.log(`\ntotal: ${results.length} modulos · ${lines} lineas · ${fns} funciones · ${state} declaraciones de estado`);
  }
}

try {
  main();
} catch (error) {
  console.error(`panel-map: ${error.message || error}`);
  process.exit(1);
}
