#!/usr/bin/env node
'use strict';

/*
 * Release helper for NITRO WRAITH.
 *
 * `check`   verifies that every public version marker agrees.
 * `prepare` decides what the next green main run should publish and, when
 *           needed, bumps the patch version and writes the release notes.
 *
 * It intentionally has no dependencies: GitHub Actions runs it with Node 22.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const GIST_ID = '88f8b25546f8bb0ea588291bab8ffa58';
const GIST_INSTALL = `https://gist.githubusercontent.com/ezurinho/${GIST_ID}/raw/nitro-wraith.user.js`;
const NOTES_FILE = path.join(ROOT, '.release-notes.md');

const FILES = {
  script: 'nitro-wraith.user.js',
  meta: 'nitro-wraith.meta.js',
  pkg: 'package.json',
  readme: 'README.md',
  changelog: 'CHANGELOG.md',
};

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function write(relative, text) {
  fs.writeFileSync(path.join(ROOT, relative), text);
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function tagExists(tag) {
  return spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {
    cwd: ROOT,
    stdio: 'ignore',
  }).status === 0;
}

function firstMatch(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) throw new Error(`No ${label} found.`);
  return match[1];
}

function versions() {
  const script = read(FILES.script);
  const meta = read(FILES.meta);
  const pkg = JSON.parse(read(FILES.pkg));
  const readme = read(FILES.readme);

  return {
    script: firstMatch(script, /^\/\/ @version\s+(\S+)/m, 'script @version'),
    constant: firstMatch(script, /const VERSION = '([^']+)';/, 'VERSION constant'),
    meta: firstMatch(meta, /^\/\/ @version\s+(\S+)/m, 'meta @version'),
    package: String(pkg.version || ''),
    readmeBadge: firstMatch(readme, /version-(\d+\.\d+\.\d+)-/, 'README version badge'),
    readmeRelease: firstMatch(readme, /releases\/tag\/v(\d+\.\d+\.\d+)/, 'README release link'),
  };
}

function check() {
  const found = versions();
  const expected = found.script;
  const bad = Object.entries(found).filter(([, value]) => value !== expected);
  if (bad.length) {
    throw new Error(`Version mismatch: ${bad.map(([key, value]) => `${key}=${value}`).join(', ')} (expected ${expected}).`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(expected)) {
    throw new Error(`Version is not a plain semver: ${expected}`);
  }
  return expected;
}

function tags() {
  const output = git(['tag', '--sort=-v:refname']);
  if (!output) return [];
  return output.split('\n').filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
}

function latestTag() {
  return tags()[0] || '';
}

function bumpPatch(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Cannot bump non-semver version: ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const args = ['log', '--no-merges', '--pretty=format:%s'];
  if (!tag) args.push('--max-count=20');
  args.push(range);
  const output = git(args);
  if (!output) return [];
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function releaseBullets(tag) {
  const subjects = commitsSince(tag)
    .filter((subject) => !/^release(?:\(|:)/i.test(subject))
    .filter((subject) => !/\[skip ci\]/i.test(subject))
    .filter((subject) => !/^(ci|docs|chore)(?:\(|:)/i.test(subject));
  const unique = [...new Set(subjects)];
  return unique.length ? unique.map((subject) => `- ${subject}`) : ['- Maintenance release.'];
}

function setVersion(next) {
  const script = read(FILES.script)
    .replace(/^\/\/ @version\s+\S+/m, `// @version      ${next}`)
    .replace(/const VERSION = '[^']+';/, `const VERSION = '${next}';`);
  const meta = read(FILES.meta).replace(/^\/\/ @version\s+\S+/m, `// @version      ${next}`);
  const pkg = read(FILES.pkg).replace(/("version":\s*")[^"]+(")/, `$1${next}$2`);
  const readme = read(FILES.readme)
    .replace(/version-\d+\.\d+\.\d+-/, `version-${next}-`)
    .replace(/releases\/tag\/v\d+\.\d+\.\d+/, `releases/tag/v${next}`);

  write(FILES.script, script);
  write(FILES.meta, meta);
  write(FILES.pkg, pkg);
  write(FILES.readme, readme);
}

function addChangelog(version, bullets) {
  const old = read(FILES.changelog);
  if (old.includes(`## ${version} `)) return;
  const eol = old.includes('\r\n') ? '\r\n' : '\n';
  const date = new Date().toISOString().slice(0, 10);
  const entry = [`## ${version} — ${date}`, '', ...bullets, '', ''].join(eol);
  const updated = old.replace(/(^# Changelog\r?\n\r?\n)/, `$1${entry}`);
  if (updated === old) throw new Error('CHANGELOG.md has no "# Changelog" header.');
  write(FILES.changelog, updated);
}

function writeNotes(version, bullets) {
  const lines = [
    `# NITRO WRAITH ${version}`,
    '',
    'Published automatically after the `check` workflow passed on `main`.',
    '',
    '## Changes',
    '',
    ...bullets,
    '',
    '## Verification',
    '',
    'GitHub Actions: the full CLI and browser check suites passed with zero failures.',
    '',
    '## Install or update',
    '',
    GIST_INSTALL,
    '',
  ];
  fs.writeFileSync(NOTES_FILE, lines.join('\n'), 'utf8');
}

function prepare() {
  const current = check();
  const currentTag = `v${current}`;
  const tagged = tagExists(currentTag);

  let mode = 'publish';
  let previous = latestTag();

  if (tagged) {
    previous = currentTag;
    const changed = git(['diff', '--name-only', `${currentTag}..HEAD`, '--', FILES.script]);
    mode = changed ? 'bump' : 'skip';
  }

  const next = mode === 'bump' ? bumpPatch(current) : current;
  const bullets = releaseBullets(previous);

  if (mode === 'bump') {
    setVersion(next);
    addChangelog(next, bullets);
  }

  writeNotes(next, bullets);

  console.log(`MODE=${mode}`);
  console.log(`VERSION=${next}`);
  console.log(`TAG=v${next}`);
  console.log(`PREV_TAG=${previous || ''}`);
}

try {
  const command = process.argv[2] || 'check';
  if (command === 'check') {
    const version = check();
    console.log(`version ${version} is consistent`);
  } else if (command === 'prepare') {
    prepare();
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(`release: ${error.message}`);
  process.exit(1);
}
