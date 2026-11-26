'use strict';

/*
 * Las dos pieles viven en fragmentos distintos: el panel grande declara sus
 * temas en `src/79-panel-css.js` y el garaje los repite en
 * `src/89-queue-garage-html.js`
 * porque cada uno tiene su propio shadow root. Copiar a mano invita a que un
 * tema quede a medias entre paneles, asi que esta prueba compara las dos
 * declaraciones token a token sin abrir Chrome.
 *
 * Caso carbon: el garaje no declara `[data-theme="carbon"]`; ese tema vive en
 * su bloque base `.p`, con dos diferencias deliberadas que esta prueba fija:
 * `--dim` sube para leerse sobre la pagina de carrera y los tokens que el
 * garaje no dibuja (medallas, tarjeta, tinta sobre acento) no se repiten.
 *
 *   npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, summary } = require('./harness');

const SRC = path.join(__dirname, '..', '..', 'src');

const THEMED = ['aurora', 'sunset', 'ice', 'violet', 'rgb'];

const PANEL_ONLY = ['--card', '--ink-on-acc', '--ink-warn-hi', '--medal-1', '--medal-2', '--medal-3'];

function read(name) {
  return fs.readFileSync(path.join(SRC, name), 'utf8').replace(/\r\n?/g, '\n');
}

function tokens(body) {
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
  const map = new Map();
  for (const m of clean.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}

function themeBlocks(text, selector) {
  const blocks = new Map();
  const re = new RegExp(selector + '\\[data-theme="([a-z]+)"\\]\\s*\\{([^}]*)\\}', 'g');
  for (const m of text.matchAll(re)) blocks.set(m[1], tokens(m[2]));
  return blocks;
}

function baseBlock(text, selector) {
  const match = new RegExp('\\n[ \\t]*' + selector + ' \\{').exec(text);
  assert.ok(match, `missing ${selector}`);
  const open = text.indexOf('{', match.index);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}' && --depth === 0) return tokens(text.slice(open + 1, i));
  }
  throw new Error(`unbalanced ${selector}`);
}

const panel = read('79-panel-css.js');
const garage = read('89-queue-garage-html.js');

test('the garage repeats every themed palette token for token', () => {
  const panelThemes = themeBlocks(panel, '\\.panel');
  const garageThemes = themeBlocks(garage, '\\.p');
  for (const theme of THEMED) {
    const fromPanel = panelThemes.get(theme) || new Map();
    const fromGarage = garageThemes.get(theme) || new Map();
    assert.ok(fromPanel.size > 0, `the panel does not theme ${theme}`);
    assert.ok(fromGarage.size > 0, `the garage does not theme ${theme}`);
    const diffs = [];
    for (const [name, value] of fromPanel) {
      if (fromGarage.get(name) !== value) diffs.push(`${name}: panel ${value} vs garage ${fromGarage.get(name) || 'missing'}`);
    }
    for (const name of fromGarage.keys()) if (!fromPanel.has(name)) diffs.push(`${name}: only in the garage`);
    assert.deepEqual(diffs, [], `${theme} drifted between the sheets`);
  }
});

test('the carbon base agrees apart from the garage\'s lifted dim', () => {
  const fromPanel = baseBlock(panel, '\\.panel');
  const fromGarage = baseBlock(garage, '\\.p');
  const drift = [...fromPanel.keys()].filter((name) => name !== '--dim'
    && fromGarage.has(name) && fromGarage.get(name) !== fromPanel.get(name));
  assert.deepEqual(drift, [], 'carbon drifted between the sheets');
  const missing = [...fromPanel.keys()].filter((name) => !fromGarage.has(name)).sort();
  assert.deepEqual(missing, [...PANEL_ONLY].sort(), 'the garage stops repeating a base token');
  assert.deepEqual([...fromGarage.keys()].filter((name) => !fromPanel.has(name)), [],
    'the garage declares a base token the panel does not');
});

summary('palette parity');
