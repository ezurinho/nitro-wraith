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
 *   node tools/panel-map.js 90-queue.js --nested --md   # lo que hay DENTRO
 *
 * No cuenta llaves ni entiende template literals: marca donde empieza cada
 * declaracion y deja que ocupe hasta la siguiente. Es lo que se necesita para
 * decidir un corte, y no puede equivocarse contando llaves dentro de un string.
 *
 * `--nested` es para el caso contrario: un archivo que ya es **una sola**
 * funcion de 5 k lineas (`90-queue.js`). Ahi no hay nada que partir por arriba;
 * lo que hay que saber es cuanto pesa cada trozo de dentro en "cierres": cada
 * nombre del cuerpo de `runQueue` que el trozo lee. Un trozo con cero cierres se
 * puede sacar del archivo tal cual, solo con sus parametros; uno con diez obliga
 * a decidir que estado viaja, y esa decision no la toma esta herramienta.
 *
 * Los cierres se cuentan buscando el nombre en el texto del trozo, sin quitar
 * comentarios ni strings: se cuenta de mas, nunca de menos. Un falso positivo
 * solo hace que un trozo parezca mas atado de lo que esta.
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

/* Cualquier declaracion con nombre, a cualquier profundidad. */
const ANY_DECL = /^(\s*)(?:(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|(const|let|var)\s+([A-Za-z_$][\w$]*))/;

function declarations(lines) {
  const out = [];
  lines.forEach((line, index) => {
    const match = ANY_DECL.exec(line);
    if (!match) return;
    out.push({
      line: index + 1,
      indent: match[1].length,
      fn: Boolean(match[2]),
      name: match[2] || match[4],
    });
  });
  return out;
}

/* Hasta la siguiente declaracion que no este mas adentro. Misma heuristica que
 * la tabla de arriba: no cuenta llaves, asi que no se equivoca dentro de un
 * string. */
function spanEnd(decls, target, limit) {
  const next = decls.find((decl) => decl.line > target.line && decl.indent <= target.indent);
  return next ? next.line : limit + 1;
}

function paramNames(lines, start) {
  let text = '';
  for (let i = start - 1; i < Math.min(start + 6, lines.length); i += 1) {
    text += `${lines[i]}\n`;
    if ((text.match(/\(/g) || []).length <= (text.match(/\)/g) || []).length) break;
  }
  const open = text.indexOf('(');
  if (open < 0) return [];
  let depth = 0;
  let end = open;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (!depth) { end = i; break; }
    }
  }
  return text
    .slice(open + 1, end)
    .split(',')
    .map((part) => part.split('=')[0].trim().replace(/^[.\s]*/, ''))
    .filter((part) => /^[A-Za-z_$][\w$]*$/.test(part));
}

function nested(file) {
  const name = path.basename(file);
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').split('\n');
  const decls = declarations(lines);
  const container = decls.find((decl) => decl.fn && decl.indent === 2);
  if (!container) return null;
  const containerEnd = spanEnd(decls, container, lines.length);
  const inside = decls.filter((decl) => decl.line > container.line && decl.line < containerEnd);
  const bindings = inside.filter((decl) => decl.indent === 4);
  const rows = inside
    .filter((decl) => decl.fn && decl.indent >= 4)
    .map((decl) => {
      const end = spanEnd(decls, decl, containerEnd);
      const body = lines.slice(decl.line - 1, end - 1).join('\n');
      const own = new Set(inside.filter((other) => other.line >= decl.line && other.line < end).map((other) => other.name));
      paramNames(lines, decl.line).forEach((param) => own.add(param));
      const closures = bindings
        .filter((binding) => !own.has(binding.name))
        .filter((binding) => new RegExp(`\\b${binding.name.replace(/\$/g, '\\$')}\\b`).test(body))
        .map((binding) => binding.name);
      return { line: decl.line, name: decl.name, size: end - decl.line, closures };
    });
  return { name, total: lines.length, container, bindings, rows };
}

function nestedTable(result, markdown) {
  const out = [];
  const free = result.rows.filter((row) => !row.closures.length).length;
  if (markdown) {
    out.push(`### \`${result.name}\` · \`${result.container.name}\` · ${result.total} lineas`, '');
    out.push(
      `${result.rows.length} funciones dentro · ${result.bindings.length} nombres en el cuerpo de`,
      `\`${result.container.name}\` · **${free}** sin cierres (salen tal cual, solo con sus parametros).`,
      '',
      '| Linea | Lineas | Funcion | Cierres | Cuales |',
      '| --- | --- | --- | --- | --- |',
    );
  } else {
    out.push(`${result.name} · ${result.container.name} · ${result.total} lineas · ${result.rows.length} funciones dentro · ${free} sin cierres`);
  }
  for (const row of result.rows) {
    const which = row.closures.join(', ');
    if (markdown) out.push(`| ${row.line} | ${row.size} | \`${row.name}\` | ${row.closures.length} | ${which} |`);
    else out.push(`  ${String(row.line).padStart(5)}  ${String(row.size).padStart(5)}  ${String(row.closures.length).padStart(2)}  ${row.name}${which ? `  <- ${which}` : ''}`);
  }
  return out.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const markdown = args.includes('--md');
  const nest = args.includes('--nested');
  const only = args.filter((arg) => !arg.startsWith('--'));
  const files = only.length
    ? only.map((name) => path.join(SRC, name))
    : fs.readdirSync(SRC).filter((name) => name.endsWith('.js')).sort().map((name) => path.join(SRC, name));

  if (nest) {
    const nestedResults = files.map(nested).filter(Boolean);
    console.log(nestedResults.map((result) => nestedTable(result, markdown)).join('\n\n'));
    const rows = nestedResults.reduce((sum, result) => sum + result.rows.length, 0);
    const free = nestedResults.reduce((sum, result) => sum + result.rows.filter((row) => !row.closures.length).length, 0);
    console.log(`\ntotal: ${nestedResults.length} modulos · ${rows} funciones dentro · ${free} sin cierres`);
    return;
  }

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
