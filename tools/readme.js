#!/usr/bin/env node
'use strict';

/*
 * Keeps the generated release block in README.md in sync with the changelog.
 * The hand-written parts of the README are left alone.
 *
 * `sync`  rewrites the release block and version links.
 * `check` fails when the block or version links are stale.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const README = path.join(ROOT, 'README.md');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const SCRIPT = path.join(ROOT, 'nitro-wraith.user.js');
const PACKAGE = path.join(ROOT, 'package.json');
const REPO = 'https://github.com/ezurinho/nitro-wraith';
const START = '<!-- release:start -->';
const END = '<!-- release:end -->';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function currentVersion() {
  const script = read(SCRIPT).match(/^\/\/ @version\s+(\S+)/m);
  const pkg = JSON.parse(read(PACKAGE)).version;
  if (!script) throw new Error('nitro-wraith.user.js has no @version.');
  if (!pkg) throw new Error('package.json has no version.');
  if (script[1] !== pkg) {
    throw new Error(`Version mismatch: userscript=${script[1]}, package=${pkg}.`);
  }
  return script[1];
}

function latestEntry() {
  const text = read(CHANGELOG);
  const heading = text.match(/^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})\s*$/m);
  if (!heading) throw new Error('CHANGELOG.md has no dated release heading.');

  const body = text.slice(heading.index + heading[0].length);
  const next = body.search(/\r?\n## /);
  const section = next === -1 ? body : body.slice(0, next);
  const bullets = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '));

  if (!bullets.length) {
    throw new Error(`CHANGELOG.md ${heading[1]} has no bullets.`);
  }

  return { version: heading[1], date: heading[2], bullets };
}

function render(entry, eol) {
  return [
    START,
    '## Current release',
    '',
    `**[${entry.version}](${REPO}/releases/tag/v${entry.version})** · ${entry.date}`,
    '',
    ...entry.bullets,
    '',
    '[Full changelog](CHANGELOG.md)',
    END,
  ].join(eol);
}

function sync() {
  const version = currentVersion();
  const entry = latestEntry();
  if (entry.version !== version) {
    throw new Error(
      `README release would be ${entry.version}, but the userscript is ${version}.`,
    );
  }

  const old = read(README);
  const eol = old.includes('\r\n') ? '\r\n' : '\n';
  const block = render(entry, eol);
  const start = old.indexOf(START);
  const end = old.indexOf(END, start + START.length);
  if (start === -1 || end === -1) {
    throw new Error('README.md needs release:start and release:end markers.');
  }

  let next = old.slice(0, start) + block + old.slice(end + END.length);
  next = next.replace(/version-\d+\.\d+\.\d+-/g, `version-${version}-`);
  next = next.replace(/releases\/tag\/v\d+\.\d+\.\d+/g, `releases/tag/v${version}`);

  if (next !== old) {
    fs.writeFileSync(README, next);
    console.log(`README.md updated for ${version}.`);
  } else {
    console.log(`README.md already in sync for ${version}.`);
  }
}

function check() {
  const version = currentVersion();
  const entry = latestEntry();
  if (entry.version !== version) {
    throw new Error(
      `CHANGELOG.md is at ${entry.version}, but the userscript is ${version}.`,
    );
  }

  const text = read(README);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const block = render(entry, eol);
  if (!text.includes(block)) {
    throw new Error('README.md release block is stale; run npm run readme:sync.');
  }
  if (!text.includes(`version-${version}-`)) {
    throw new Error(`README.md version badge is not ${version}.`);
  }
  if (!text.includes(`releases/tag/v${version}`)) {
    throw new Error(`README.md release link is not v${version}.`);
  }
  console.log(`README.md is in sync for ${version}.`);
}

try {
  const command = process.argv[2] || 'check';
  if (command === 'sync') sync();
  else if (command === 'check') check();
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(`readme: ${error.message}`);
  process.exit(1);
}
