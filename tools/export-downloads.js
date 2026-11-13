'use strict';

/*
 * Copia el userscript como .txt en dos sitios: la carpeta de Downloads y la
 * carpeta del proyecto (la del chat).
 *
 *   npm run export
 *   EXPORT_DIR=... EXPORT_LOCAL_DIR=... npm run export
 *
 * Downloads conserva el nombre de siempre:
 *   NITRO WRAITH.txt
 *
 * El chat usa el nombre corto con el que se reconoce el archivo:
 *   Nitro Type userscript.txt
 *
 * El contenido es el userscript byte a byte, en UTF-8, y cada exportacion
 * sobrescribe el archivo en vez de dejar una copia por version. Las copias
 * antiguas con la version en el nombre (`...-7.41.0.txt`) se borran solas en
 * ambos destinos. En el chat tambien se retira la copia vieja con el nombre
 * largo de Downloads, para que no queden dos .txt del mismo script.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'nitro-wraith.user.js');
const DOWNLOAD_NAME = 'NITRO WRAITH';
const CHAT_NAME = 'Nitro Type userscript';

// Solo `...-<numeros>.txt`: una nota llamada `...-notas.txt` se queda.
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const legacyFor = (name) => new RegExp(`^${escape(name)}-\\d+(?:\\.\\d+)*\\.txt$`);

const source = fs.readFileSync(SCRIPT, 'utf8');
const version = (source.match(/@version\s+(\S+)/) || [])[1];

if (!version) {
  console.error('export: no pude leer @version del userscript.');
  process.exit(1);
}

const seen = new Set();
const targets = [
  {
    label: 'Downloads',
    dir: process.env.EXPORT_DIR || path.join(os.homedir(), 'Downloads'),
    name: DOWNLOAD_NAME,
    drop: [],
  },
  {
    label: 'chat',
    dir: process.env.EXPORT_LOCAL_DIR || ROOT,
    name: CHAT_NAME,
    drop: [`${DOWNLOAD_NAME}.txt`],
  },
];

let failures = 0;

for (const item of targets) {
  const dir = path.resolve(item.dir);
  if (seen.has(dir)) continue;
  seen.add(dir);

  const file = `${item.name}.txt`;

  try {
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, file);
    fs.writeFileSync(target, source, 'utf8');
    console.log(`${item.label}: ${target}`);
    console.log(`  ${Buffer.byteLength(source, 'utf8')} bytes · @version ${version}`);

    const removed = [];
    const legacy = legacyFor(item.name);
    for (const name of fs.readdirSync(dir)) {
      if (!legacy.test(name)) continue;
      fs.rmSync(path.join(dir, name), { force: true });
      removed.push(name);
    }
    for (const name of item.drop) {
      if (name === file) continue;
      const old = path.join(dir, name);
      if (!fs.existsSync(old)) continue;
      fs.rmSync(old, { force: true });
      removed.push(name);
    }
    if (removed.length) {
      console.log(`  copias antiguas borradas: ${removed.join(' · ')}`);
    }
  } catch (error) {
    failures++;
    console.error(`${item.label}: ${error.message}`);
  }
}

if (failures) {
  console.error(`export: ${failures} destino(s) fallaron.`);
  process.exitCode = 1;
}
