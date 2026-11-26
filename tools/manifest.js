'use strict';

/*
 * Release manifest and checksum helpers.
 *
 * Every published build carries a `build.json` (version, channel, commit,
 * source ref and run) and a `SHA256SUMS` file. The stable and canary workflows
 * use them to verify what was uploaded, and `npm run release:verify` uses them
 * to check a public release without trusting the workspace.
 *
 * No dependencies: `crypto` is part of Node.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const APP = 'nitro-wraith';

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function digestFile(file) {
  const buffer = fs.readFileSync(file);
  return { sha256: sha256(buffer), bytes: buffer.length };
}

function parseChecksums(text) {
  const map = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/);
    if (!match) throw new Error(`invalid SHA256SUMS line: ${line}`);
    const name = match[2].trim();
    if (!name || name.includes('/') || name.includes('\\')) {
      throw new Error(`invalid asset name in SHA256SUMS: ${name}`);
    }
    if (map.has(name)) throw new Error(`duplicate checksum for ${name}`);
    map.set(name, match[1]);
  }
  return map;
}

function writeChecksums(dir, names) {
  const lines = names.map((name) => {
    const digest = digestFile(path.join(dir, name));
    return `${digest.sha256}  ${name}`;
  });
  fs.writeFileSync(path.join(dir, 'SHA256SUMS'), `${lines.join('\n')}\n`, 'utf8');
  return lines;
}

function assertWritableDir(outDir) {
  const resolved = path.resolve(outDir);
  const root = path.resolve(ROOT);
  const allowed = [path.join(root, 'dist'), path.join(root, '.tmp')];
  const inside = allowed.some((base) => resolved === base || resolved.startsWith(`${base}${path.sep}`));
  if (resolved === root || !inside) {
    throw new Error(`refusing to rebuild outside dist/ or .tmp/: ${resolved}`);
  }
}

/*
 * Copies `options.files` into `outDir` and writes `build.json` + `SHA256SUMS`.
 * The directory is rebuilt from scratch so a stale asset can never survive.
 */
function writeBundle(outDir, options = {}) {
  assertWritableDir(outDir);
  if (!options.version) throw new Error('writeBundle needs a version');
  if (!Array.isArray(options.files) || !options.files.length) {
    throw new Error('writeBundle needs at least one file');
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {
    app: APP,
    channel: options.channel || 'stable',
    version: String(options.version),
    sourceVersion: options.sourceVersion ? String(options.sourceVersion) : null,
    commit: options.commit || '',
    sourceRef: options.sourceRef || '',
    run: Number.isFinite(Number(options.run)) ? Number(options.run) : null,
    builtAt: new Date().toISOString(),
    ...(options.extra || {}),
    files: {},
  };

  for (const source of options.files) {
    const file = path.resolve(source);
    if (!fs.existsSync(file)) throw new Error(`missing release file: ${file}`);
    const name = path.basename(file);
    if (manifest.files[name]) throw new Error(`duplicate release file name: ${name}`);
    const target = path.join(outDir, name);
    fs.copyFileSync(file, target);
    manifest.files[name] = digestFile(target);
  }

  fs.writeFileSync(path.join(outDir, 'build.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeChecksums(outDir, Object.keys(manifest.files));
  return manifest;
}

/*
 * Verifies a directory produced by writeBundle. Returns every problem instead
 * of throwing so a workflow can print the whole list before failing.
 */
function verifyBundle(dir, expected = {}) {
  const outDir = path.resolve(dir);
  const errors = [];
  let manifest = null;

  const manifestFile = path.join(outDir, 'build.json');
  const sumsFile = path.join(outDir, 'SHA256SUMS');

  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch (error) {
    errors.push(`build.json: ${error.message}`);
  }
  if (!manifest) return { ok: false, errors, manifest: null };

  if (manifest.app !== APP) errors.push(`build.json app is ${manifest.app || 'missing'}, expected ${APP}`);
  if (!manifest.version) errors.push('build.json has no version');
  if (expected.version && manifest.version !== String(expected.version)) {
    errors.push(`build.json version is ${manifest.version}, expected ${expected.version}`);
  }
  if (expected.channel && manifest.channel !== String(expected.channel)) {
    errors.push(`build.json channel is ${manifest.channel}, expected ${expected.channel}`);
  }
  if (!manifest.files || typeof manifest.files !== 'object' || !Object.keys(manifest.files).length) {
    errors.push('build.json has no files');
  }

  let sums = new Map();
  try {
    sums = parseChecksums(fs.readFileSync(sumsFile, 'utf8'));
  } catch (error) {
    errors.push(`SHA256SUMS: ${error.message}`);
  }

  const names = Object.keys(manifest.files || {});
  for (const name of names) {
    const file = path.join(outDir, name);
    if (!fs.existsSync(file)) {
      errors.push(`missing asset: ${name}`);
      continue;
    }
    const digest = digestFile(file);
    const recorded = manifest.files[name] || {};
    if (Number(recorded.bytes) !== digest.bytes) {
      errors.push(`${name}: ${digest.bytes} bytes, build.json says ${recorded.bytes}`);
    }
    if (recorded.sha256 !== digest.sha256) {
      errors.push(`${name}: hash does not match build.json`);
    }
    if (sums.get(name) !== digest.sha256) {
      errors.push(`${name}: hash does not match SHA256SUMS`);
    }
    sums.delete(name);
  }
  for (const name of sums.keys()) errors.push(`SHA256SUMS lists an asset missing from build.json: ${name}`);

  if (expected.commit && manifest.commit !== String(expected.commit)) {
    errors.push(`build.json commit is ${manifest.commit}, expected ${expected.commit}`);
  }

  return { ok: errors.length === 0, errors, manifest };
}

module.exports = {
  APP,
  ROOT,
  sha256,
  digestFile,
  parseChecksums,
  writeChecksums,
  writeBundle,
  verifyBundle,
};
