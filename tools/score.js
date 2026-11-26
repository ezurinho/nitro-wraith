#!/usr/bin/env node
'use strict';

// Nota de higiene estatica. No sustituye a la auditoria: mide solo lo que se
// puede comprobar sin ejecutar el bot (tamano, duplicados, patrones de riesgo,
// cobertura de checks y documentacion). La correccion real se valida con el
// harness y, cuando hay sesion, con una carrera autenticada.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const modules = fs.readdirSync(SRC)
  .filter((file) => file.endsWith('.js'))
  .sort()
  .map((file) => {
    const text = read(path.join('src', file));
    return { file, text, lines: text.split(/\r?\n/).length };
  });
const source = modules.map((module) => module.text).join('\n');
const totalLines = modules.reduce((sum, module) => sum + module.lines, 0);
const largest = modules.reduce((best, module) => (module.lines > best.lines ? module : best), modules[0]);

function count(pattern, text = source) {
  return (text.match(pattern) || []).length;
}

// Conteo por limites sin construir un RegExp con el nombre: los nombres de
// funcion pueden traer `$` y el escapado del shell no debe cambiar la nota.
function countWord(text, word) {
  let total = 0;
  let from = 0;
  while (from <= text.length) {
    const index = text.indexOf(word, from);
    if (index < 0) break;
    const before = index > 0 ? text[index - 1] : '';
    const after = text[index + word.length] || '';
    if (!/[A-Za-z0-9_$]/.test(before) && !/[A-Za-z0-9_$]/.test(after)) total++;
    from = index + word.length;
  }
  return total;
}

const definitions = new Map();
for (const module of modules) {
  for (const match of module.text.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    definitions.set(match[1], (definitions.get(match[1]) || 0) + 1);
  }
}
const duplicates = [...definitions.entries()].filter(([, times]) => times > 1);
const names = [...definitions.keys()];
const definitionOnly = names.filter((name) => countWord(source, name) <= 1);

const testSource = read('tests/live/run.js') + read('tests/live/live.test.js');
const docs = [
  'README.md', 'README.es.md', 'CHANGELOG.md', 'SECURITY.md',
  'docs/ARCHITECTURE.md', 'docs/COMPATIBILITY.md', 'docs/ROLLBACK.md',
  'docs/TROUBLESHOOTING.md', 'docs/NITROTYPE.md',
].filter((file) => {
  try { return fs.statSync(path.join(ROOT, file)).isFile(); } catch { return false; }
});

const artifactBytes = fs.statSync(path.join(ROOT, 'nitro-wraith.user.js')).size;
const gzipBytes = zlib.gzipSync(fs.readFileSync(path.join(ROOT, 'nitro-wraith.user.js'))).length;

const metrics = {
  modules: modules.length,
  lines: totalLines,
  largest: `${largest.file} (${Math.round((largest.lines / totalLines) * 100)}%)`,
  largestShare: largest.lines / totalLines,
  functions: names.length,
  duplicates: duplicates.length,
  definitionOnly: definitionOnly.length,
  todos: count(/\b(?:TODO|FIXME|XXX|HACK)\b/g),
  evalish: count(/\beval\s*\(|new\s+Function\s*\(/g),
  messageListeners: count(/addEventListener\(\s*['"]message['"]/g),
  originChecks: count(/event\.origin/g),
  innerHTML: count(/innerHTML/g),
  emptyCatch: count(/catch\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?\}/g),
  directStorage: count(/localStorage\./g),
  ariaLive: count(/aria-live/g),
  reducedMotion: count(/prefers-reduced-motion/g),
  focusVisible: count(/:focus-visible/g),
  testChecks: count(/\bcheck\(/g, testSource),
  visualBaselines: fs.readdirSync(path.join(ROOT, 'tests/visual/baselines'))
    .filter((file) => file.endsWith('.png')).length,
  docs: docs.length,
  artifactBytes,
  gzipBytes,
};

const parts = [
  ['no duplicate declarations', metrics.duplicates === 0 ? 15 : 0],
  ['no eval / new Function', metrics.evalish === 0 ? 10 : 0],
  ['no TODO / FIXME', metrics.todos === 0 ? 5 : 0],
  ['message listeners check origin',
    metrics.messageListeners ? (10 * metrics.originChecks) / metrics.messageListeners : 10],
  ['declared functions are used', 10 * (1 - metrics.definitionOnly / Math.max(1, metrics.functions))],
  ['test checks', Math.min(10, metrics.testChecks / 40)],
  ['docs present', Math.min(10, (metrics.docs * 10) / 9)],
  ['artifact under 1.15 MB', metrics.artifactBytes <= 1150000 ? 10 : 5],
  ['accessibility markers',
    (10 * [metrics.ariaLive > 0, metrics.reducedMotion > 0, metrics.focusVisible > 0]
      .filter(Boolean).length) / 3],
  ['largest module under 20%',
    Math.max(0, 10 - Math.max(0, metrics.largestShare - 0.20) * 50)],
];
const score = Math.round(parts.reduce((sum, [, points]) => sum + points, 0));
const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'D';

console.log('NITRO WRAITH — static hygiene score');
console.log(`  ${score}/100 (${grade})`);
for (const [label, points] of parts) {
  console.log(`  ${points.toFixed(1).padStart(5)}  ${label}`);
}
console.log('');
console.log(`  modules ${metrics.modules} · ${metrics.lines.toLocaleString('en-US')} lines · largest ${metrics.largest}`);
console.log(`  functions ${metrics.functions} · duplicates ${metrics.duplicates} · definition-only ${metrics.definitionOnly}`);
console.log(`  eval/Function ${metrics.evalish} · TODO ${metrics.todos} · message ${metrics.originChecks}/${metrics.messageListeners} with origin`);
console.log(`  innerHTML ${metrics.innerHTML} · empty catch ${metrics.emptyCatch} · direct localStorage ${metrics.directStorage}`);
console.log(`  tests ${metrics.testChecks} check calls · ${metrics.visualBaselines} visual baselines · docs ${metrics.docs}/${docs.length}`);
console.log(`  artifact ${(metrics.artifactBytes / 1024).toFixed(0)} KiB · gzip ${(metrics.gzipBytes / 1024).toFixed(0)} KiB`);
if (definitionOnly.length) {
  console.log(`  definition-only names: ${definitionOnly.slice(0, 12).join(', ')}${definitionOnly.length > 12 ? '…' : ''}`);
}
console.log('  note: static checks only; correctness and real-race behaviour are audited separately.');
