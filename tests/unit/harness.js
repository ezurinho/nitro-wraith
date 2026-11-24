'use strict';

/*
 * Banco de pruebas unitarias del userscript, sin navegador.
 *
 * Los fragmentos de `src/` no son modulos: son trozos de un mismo IIFE que el
 * build concatena. Cargarlos en Node con `require` no funciona, asi que cada
 * prueba ejecuta el texto real del fragmento dentro de un contexto `vm` con
 * los globals que ese fragmento use (CONFIG, clamp...) y recibe de vuelta los
 * nombres pedidos. Lo que se prueba es el codigo que se publica, no una copia.
 *
 * Regla: solo entran aqui fragmentos sin estado de DOM en la evaluacion de
 * primer nivel. Si un fragmento toca `document` al cargarse, no es candidato.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', '..', 'src');

function read(name) {
  return fs.readFileSync(path.join(SRC, name), 'utf8').replace(/\r\n?/g, '\n');
}

// Ejecuta el fragmento y devuelve `{ nombre: valor }` para las funciones
// pedidas. `sandbox` se comparte con el contexto tal cual: lo que el fragmento
// declare de primer nivel no se filtra fuera.
function loadFragment(name, names, sandbox = {}) {
  const source = read(name);
  const epilogue = `\n;({${names.join(', ')}});`;
  return vm.runInNewContext(source + epilogue, { ...sandbox }, { filename: name });
}

let total = 0;
const failures = [];

function test(name, fn) {
  total += 1;
  try {
    fn();
  } catch (error) {
    failures.push({ name, error });
    const detail = String((error && error.message) || error).split('\n').slice(0, 6).join('\n     ');
    console.error(`FAIL ${name}`);
    console.error(`     ${detail}`);
  }
}

function summary(label = 'unit') {
  if (failures.length) {
    console.error(`${label}: ${total - failures.length}/${total} checks passed`);
    process.exitCode = 1;
    return false;
  }
  console.log(`${label}: ${total}/${total} checks passed`);
  return true;
}

module.exports = { loadFragment, test, summary };
