#!/usr/bin/env node
'use strict';

/*
 * Build reproducible.
 *
 * Copia `src/` y `tools/build.js` a dos arboles temporales limpios, construye
 * cada uno con una zona horaria e idioma distintos y compara el SHA-256 del
 * artefacto con el archivo del repo. Si el build depende del entorno (fechas,
 * locale, orden del sistema de archivos), aqui se rompe.
 *
 * No escribe en el repo: los temporales viven en os.tmpdir() y se borran al
 * terminar.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'nitro-wraith.user.js');
const ENVIRONMENTS = [
  { TZ: 'UTC', LANG: 'C', LC_ALL: 'C' },
  { TZ: 'Pacific/Kiritimati', LANG: 'es_ES.UTF-8', LC_ALL: 'es_ES.UTF-8' },
];

function fail(message) {
  console.error(`repro: ${message}`);
  process.exit(1);
}

function digest(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

if (!fs.existsSync(SCRIPT)) fail('nitro-wraith.user.js is missing; run npm run build.');

const expected = digest(fs.readFileSync(SCRIPT));
const built = [];

for (const env of ENVIRONMENTS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nitro-wraith-repro-'));
  try {
    fs.cpSync(path.join(ROOT, 'src'), path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'tools', 'build.js'), path.join(dir, 'tools', 'build.js'));

    const result = spawnSync(process.execPath, [path.join('tools', 'build.js')], {
      cwd: dir,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      fail(`clean build failed in ${env.TZ}: ${(result.stderr || result.stdout || '').trim()}`);
    }

    const artifact = path.join(dir, 'nitro-wraith.user.js');
    if (!fs.existsSync(artifact)) fail(`clean build produced no artifact in ${env.TZ}`);
    const hash = digest(fs.readFileSync(artifact));
    built.push({ tz: env.TZ, hash });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const mismatch = built.find((entry) => entry.hash !== expected);
if (mismatch) {
  fail(`clean rebuild in ${mismatch.tz} is ${mismatch.hash}, repo artifact is ${expected}`);
}

console.log(`reproducible ${expected.slice(0, 12)} (${built.length} clean environments, ${fs.statSync(SCRIPT).size} bytes)`);
