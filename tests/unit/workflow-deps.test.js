'use strict';

/*
 * Un workflow que llama a `npm` sin instalar antes el lockfile muere en el
 * runner aunque el arbol local este limpio: es lo que dejo 8.14.84 en rojo
 * (ESLint no existe en la imagen de GitHub). Esta prueba lee los YAML y
 * comprueba el orden dentro de cada job, sin agregar dependencias.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, summary } = require('./harness');

const WORKFLOWS = path.join(__dirname, '..', '..', '.github', 'workflows');

// Los workflows del repo usan dos espacios por nivel: una clave a dos espacios
// dentro de `jobs:` es un id de job, y `run:` siempre cuelga de un step. No
// hace falta un parser YAML para comprobar el orden.
function jobsOf(file) {
  const source = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8').replace(/\r\n?/g, '\n');
  const found = new Map();
  let inJobs = false;
  let current = null;

  source.split('\n').forEach((line, index) => {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      return;
    }
    if (!inJobs) return;
    if (/^\S/.test(line) && line.trim() !== '') {
      inJobs = false;
      current = null;
      return;
    }
    const job = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (job) {
      current = job[1];
      found.set(current, []);
      return;
    }
    const run = line.match(/^\s+run:\s*(.+)$/);
    if (current && run && !line.trim().startsWith('#')) {
      found.get(current).push({ line: index + 1, command: run[1].trim() });
    }
  });

  return found;
}

const files = fs.readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml')).sort();

test('workflow jobs install dependencies before running npm', () => {
  files.forEach((file) => {
    jobsOf(file).forEach((runs, job) => {
      let installed = false;
      runs.forEach(({ line, command }) => {
        if (/^npm (ci|install)\b/.test(command)) {
          installed = true;
          return;
        }
        if (/^npm (run|test|exec)\b/.test(command)) {
          assert.ok(installed,
            `${file}:${line} job "${job}" runs "${command}" before npm ci`);
        }
      });
    });
  });
});

test('every workflow that runs npm installs from the lockfile', () => {
  files.forEach((file) => {
    const runs = [...jobsOf(file).values()].flat();
    if (!runs.some(({ command }) => /^npm (run|test|exec)\b/.test(command))) return;
    assert.ok(runs.some(({ command }) => /^npm ci\b/.test(command)),
      `${file} runs npm without a reproducible "npm ci" step`);
  });
});

summary('workflow dependencies');
