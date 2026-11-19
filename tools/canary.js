#!/usr/bin/env node
'use strict';

/*
 * Canary channel helper.
 *
 * `prepare <build>` builds a throwaway canary copy of the userscript. It only
 * writes under dist/canary/ (or --out) and never edits the stable artifacts,
 * the Gist, the stable tags or `releases/latest`.
 *
 * `tag-plan` decides whether the workflow may push the immutable
 * `canary-<version>` tag. GitHub rejects a new ref whose tree changes
 * `.github/workflows` unless the token has the `workflows` permission, and the
 * Actions `GITHUB_TOKEN` cannot be granted it. A rollback to an old canary tag
 * always hits that check, so the plan reports `push: false` and the workflow
 * keeps the build identified by build.json instead of failing.
 *
 * The canary version is <stable>.<build>: four numeric parts, which Tampermonkey
 * compares in order. A canary build updates itself from the fixed `canary`
 * release alias; when the next stable release lands it is newer again, so the
 * normal channel takes over without touching the stable files.
 *
 * Usage:
 *   node tools/canary.js prepare 42 [--out dist/canary]
 *   node tools/canary.js tag-plan --tag canary-8.14.52.7 [--sha HEAD] [--base origin/main]
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(__dirname, 'build.js');
const SCRIPT = path.join(ROOT, 'nitro-wraith.user.js');
const META = path.join(ROOT, 'nitro-wraith.meta.js');
const REPO = 'https://github.com/ezurinho/nitro-wraith';
const CANARY_META = `${REPO}/releases/download/canary/nitro-wraith.meta.js`;
const CANARY_USER = `${REPO}/releases/download/canary/nitro-wraith.user.js`;
const CANARY_PAGE = `${REPO}/releases/tag/canary`;

function fail(message) {
  console.error(`canary: ${message}`);
  process.exit(1);
}

function gitAt(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function gitValue(args) {
  return gitAt(ROOT, args);
}

function gitExit(cwd, args) {
  const result = spawnSync('git', args, { cwd, stdio: 'ignore' });
  if (result.error) fail(`cannot run git: ${result.error.message}`);
  return result.status;
}

function replaceOnce(text, pattern, replacement, label) {
  if (!pattern.test(text)) fail(`missing ${label}`);
  return text.replace(pattern, replacement);
}

function prepare(build, outDir) {
  if (!/^[1-9]\d*$/.test(String(build || ''))) {
    fail('build must be a positive integer (for example: prepare 42)');
  }

  // El artefacto estable se regenera primero para no publicar una copia vieja.
  execFileSync(process.execPath, [BUILD], { cwd: ROOT, stdio: 'ignore' });

  const stable = (fs.readFileSync(SCRIPT, 'utf8').match(/^\/\/ @version\s+(\S+)/m) || [])[1] || '';
  if (!/^\d+\.\d+\.\d+$/.test(stable)) fail(`stable version is not X.Y.Z: ${stable || 'missing'}`);

  const version = `${stable}.${Number(build)}`;
  const versionTag = `canary-${version}`;
  let user = fs.readFileSync(SCRIPT, 'utf8');
  let meta = fs.readFileSync(META, 'utf8');

  user = replaceOnce(user, /^\/\/ @version\s+\S+/m, `// @version      ${version}`, 'header @version');
  user = replaceOnce(user, /^\/\/ @updateURL\s+\S+/m, `// @updateURL    ${CANARY_META}`, 'header @updateURL');
  user = replaceOnce(user, /^\/\/ @downloadURL\s+\S+/m, `// @downloadURL  ${CANARY_USER}`, 'header @downloadURL');
  user = replaceOnce(user, /const VERSION = '[^']+';/, `const VERSION = '${version}';`, 'VERSION constant');
  user = replaceOnce(user, /const CHANNEL = '[^']+';/, "const CHANNEL = 'canary';", 'CHANNEL constant');
  user = replaceOnce(user, /const UPDATE_META_URL = '[^']+';/, `const UPDATE_META_URL = '${CANARY_META}';`, 'UPDATE_META_URL');
  user = replaceOnce(user, /const UPDATE_GITHUB_META_URL = '[^']+';/, `const UPDATE_GITHUB_META_URL = '${CANARY_META}';`, 'UPDATE_GITHUB_META_URL');
  user = replaceOnce(user, /const UPDATE_DOWNLOAD_URL = '[^']+';/, `const UPDATE_DOWNLOAD_URL = '${CANARY_USER}';`, 'UPDATE_DOWNLOAD_URL');
  user = replaceOnce(user, /const UPDATE_GITHUB_URL = '[^']+';/, `const UPDATE_GITHUB_URL = '${CANARY_USER}';`, 'UPDATE_GITHUB_URL');
  user = replaceOnce(user, /const UPDATE_PAGE_URL = '[^']+';/, `const UPDATE_PAGE_URL = '${CANARY_PAGE}';`, 'UPDATE_PAGE_URL');

  meta = replaceOnce(meta, /^\/\/ @version\s+\S+/m, `// @version      ${version}`, 'meta @version');
  meta = replaceOnce(meta, /^\/\/ @updateURL\s+\S+/m, `// @updateURL    ${CANARY_META}`, 'meta @updateURL');
  meta = replaceOnce(meta, /^\/\/ @downloadURL\s+\S+/m, `// @downloadURL  ${CANARY_USER}`, 'meta @downloadURL');

  // El meta tiene que ser exactamente la cabecera del userscript canary.
  const headerEnd = user.indexOf('// ==/UserScript==');
  const header = headerEnd < 0 ? '' : user.slice(0, user.indexOf('\n', headerEnd) + 1);
  if (!header || header !== meta) fail('canary meta does not match the userscript header');

  const manifest = {
    channel: 'canary',
    version,
    sourceVersion: stable,
    tag: versionTag,
    // `GITHUB_SHA` es el SHA del evento, no el del checkout: en un rollback
    // (workflow_dispatch con ref=<tag>) apuntaria a la rama, no al tag. El HEAD
    // real del checkout es la unica fuente fiable.
    sourceRef: process.env.CANARY_SOURCE_REF || process.env.GITHUB_REF || '',
    commit: gitValue(['rev-parse', 'HEAD']) || process.env.GITHUB_SHA || '',
    eventSha: process.env.GITHUB_SHA || '',
    run: Number(process.env.GITHUB_RUN_NUMBER) || null,
    builtAt: new Date().toISOString(),
    installURL: CANARY_USER,
    metaURL: CANARY_META,
    stableURL: 'https://gist.githubusercontent.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58/raw/nitro-wraith.user.js',
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'nitro-wraith.user.js'), user);
  fs.writeFileSync(path.join(outDir, 'nitro-wraith.meta.js'), meta);
  fs.writeFileSync(path.join(outDir, 'build.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`canary ${version} (stable ${stable}) -> ${path.relative(ROOT, outDir) || outDir}`);
  console.log(`tag ${versionTag}`);
}

/*
 * Plan del tag inmutable. Se compara el arbol de .github/workflows del commit
 * construido con el de la rama por defecto: si difieren, GitHub rechazaria el
 * push del tag con "without workflows permission" (el GITHUB_TOKEN de Actions
 * no puede tener ese permiso). En ese caso el plan pide no empujarlo.
 */
function tagPlan(argv) {
  const option = (name) => {
    const at = argv.indexOf(name);
    return at >= 0 ? (argv[at + 1] || '') : '';
  };

  const repo = path.resolve(option('--repo') || ROOT);
  const tag = option('--tag');
  const sha = option('--sha') || 'HEAD';
  const base = option('--base')
    || (gitAt(repo, ['rev-parse', '--verify', '--quiet', 'origin/main']) ? 'origin/main' : 'main');

  const commit = gitAt(repo, ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`]);
  if (!commit) fail(`cannot resolve ${sha} in ${repo}`);

  const baseCommit = gitAt(repo, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  if (!baseCommit) fail(`cannot resolve the base ref ${base} in ${repo}`);

  const diff = gitExit(repo, ['diff', '--quiet', baseCommit, commit, '--', '.github/workflows']);
  if (diff !== 0 && diff !== 1) fail('git diff failed while comparing .github/workflows');

  const tagSha = tag
    ? gitAt(repo, ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`])
    : '';

  let push = false;
  let reason = '';
  if (tagSha && tagSha !== commit) {
    reason = 'tag-conflict';
  } else if (tagSha === commit) {
    reason = 'tag-exists';
  } else if (diff === 0) {
    push = true;
    reason = 'workflows-match';
  } else {
    reason = 'workflows-differ';
  }

  console.log(JSON.stringify({
    tag,
    commit,
    baseRef: base,
    baseCommit,
    workflowsMatch: diff === 0,
    tagSha,
    push,
    reason,
  }, null, 2));
}

try {
  const argv = process.argv.slice(2);
  const command = argv[0] || '';

  if (command === 'prepare') {
    const outAt = argv.indexOf('--out');
    const outDir = outAt >= 0 && argv[outAt + 1]
      ? path.resolve(argv[outAt + 1])
      : path.join(ROOT, 'dist', 'canary');
    prepare(argv[1], outDir);
  } else if (command === 'tag-plan') {
    tagPlan(argv.slice(1));
  } else {
    throw new Error(`Unknown command: ${command || '(none)'}. Use: prepare <build> [--out <dir>] | tag-plan [--tag <tag>] [--sha <rev>] [--base <ref>] [--repo <dir>]`);
  }
} catch (error) {
  fail(error.message || String(error));
}
