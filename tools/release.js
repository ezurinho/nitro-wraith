#!/usr/bin/env node
'use strict';

/*
 * Release helper for NITRO WRAITH.
 *
 * `check`        verifies that every public version marker agrees.
 * `prepare`      decides what the next green main run should publish and, when
 *                needed, bumps the patch version and writes the release notes.
 * `bundle`       copies the installable files into dist/release and writes
 *                build.json + SHA256SUMS from the current HEAD.
 * `verify`       verifies dist/release, or a published GitHub release plus the
 *                stable Gist, against its manifest and checksums.
 * `hotfix-plan`  prints the safe recovery plan after a bad stable release.
 * `hotfix-build` rebuilds an older tag with a higher version into dist/hotfix.
 *
 * The hotfix path never publishes: a stable rollback is a new, higher version
 * built from the last good commit, because Tampermonkey will not downgrade.
 *
 * No dependencies: GitHub Actions runs it with Node 22.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { writeBundle, verifyBundle } = require('./manifest');

const ROOT = path.resolve(__dirname, '..');
const GIST_ID = '88f8b25546f8bb0ea588291bab8ffa58';
const GIST_INSTALL = `https://gist.githubusercontent.com/ezurinho/${GIST_ID}/raw/nitro-wraith.user.js`;
const GIST_META = `https://gist.githubusercontent.com/ezurinho/${GIST_ID}/raw/nitro-wraith.meta.js`;
const GIST_USER = `https://gist.githubusercontent.com/ezurinho/${GIST_ID}/raw/nitro-wraith.user.js`;
const REPO_RELEASES = 'https://github.com/ezurinho/nitro-wraith/releases/download';
const NOTES_FILE = path.join(ROOT, '.release-notes.md');
const DIST_DIR = path.join(ROOT, 'dist');
const RELEASE_DIR = path.join(DIST_DIR, 'release');

const FILES = {
  script: 'nitro-wraith.user.js',
  meta: 'nitro-wraith.meta.js',
  pkg: 'package.json',
  readme: 'README.md',
  changelog: 'CHANGELOG.md',
  headerSource: 'src/00-header.js',
  configSource: 'src/10-config.js',
  buildTool: 'tools/build.js',
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
  const headerSource = read(FILES.headerSource);
  const configSource = read(FILES.configSource);
  const pkg = JSON.parse(read(FILES.pkg));
  const readme = read(FILES.readme);

  return {
    script: firstMatch(script, /^\/\/ @version\s+(\S+)/m, 'script @version'),
    constant: firstMatch(script, /const VERSION = '([^']+)';/, 'VERSION constant'),
    meta: firstMatch(meta, /^\/\/ @version\s+(\S+)/m, 'meta @version'),
    sourceHeader: firstMatch(headerSource, /^\/\/ @version\s+(\S+)/m, 'source header @version'),
    sourceConfig: firstMatch(configSource, /const VERSION = '([^']+)';/, 'source VERSION constant'),
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
  // The generated userscript is not the source of truth any more: bump the
  // header and the VERSION constant in src/, then rebuild one installable file.
  const header = read(FILES.headerSource)
    .replace(/^\/\/ @version\s+\S+/m, `// @version      ${next}`);
  const config = read(FILES.configSource)
    .replace(/const VERSION = '[^']+';/, `const VERSION = '${next}';`);
  const pkg = read(FILES.pkg).replace(/("version":\s*")[^"]+(")/, `$1${next}$2`);
  const readme = read(FILES.readme)
    .replace(/version-\d+\.\d+\.\d+-/, `version-${next}-`)
    .replace(/releases\/tag\/v\d+\.\d+\.\d+/, `releases/tag/v${next}`);

  write(FILES.headerSource, header);
  write(FILES.configSource, config);
  write(FILES.pkg, pkg);
  write(FILES.readme, readme);
  // No escribir el resumen del build en stdout: el workflow lo vuelca entero
  // en GITHUB_OUTPUT junto a MODE/VERSION/TAG y una linea extra lo invalida.
  execFileSync(process.execPath, [path.join(ROOT, FILES.buildTool)], {
    cwd: ROOT,
    stdio: 'ignore',
  });
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

function appendIntegrity(manifest) {
  const existing = fs.existsSync(NOTES_FILE)
    ? fs.readFileSync(NOTES_FILE, 'utf8')
    : `# NITRO WRAITH ${manifest.version}\n`;
  const marker = '\n## Integrity';
  const at = existing.indexOf(marker);
  const base = (at >= 0 ? existing.slice(0, at) : existing).trimEnd();

  const lines = [
    '',
    '## Integrity',
    '',
    `- Commit: \`${manifest.commit || 'unknown'}\``,
    `- Built: \`${manifest.builtAt}\``,
    ...Object.entries(manifest.files).map(([name, info]) => (
      `- \`${name}\`: SHA-256 \`${info.sha256}\` (${info.bytes} bytes)`
    )),
    '',
    `Verify with \`npm run release:verify -- ${manifest.version}\`.`,
    '',
  ];
  fs.writeFileSync(NOTES_FILE, `${base}\n${lines.join('\n')}`, 'utf8');
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

function bundle() {
  const version = check();
  const manifest = writeBundle(RELEASE_DIR, {
    channel: 'stable',
    version,
    sourceVersion: process.env.RELEASE_SOURCE_VERSION || version,
    commit: git(['rev-parse', 'HEAD']),
    sourceRef: process.env.GITHUB_REF || 'refs/heads/main',
    run: Number(process.env.GITHUB_RUN_NUMBER) || null,
    files: [
      path.join(ROOT, FILES.script),
      path.join(ROOT, FILES.meta),
    ],
  });
  appendIntegrity(manifest);
  console.log(`bundle ${version} -> ${path.relative(ROOT, RELEASE_DIR)}`);
  return manifest;
}

function verifyLocal(dir = RELEASE_DIR) {
  const result = verifyBundle(dir);
  if (!result.ok) {
    throw new Error(`release bundle is not valid:\n- ${result.errors.join('\n- ')}`);
  }
  const names = Object.keys(result.manifest.files).join(', ');
  console.log(`release: ${result.manifest.version} (${result.manifest.channel}) ok: ${names}`);
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBuffer(url, timeoutMs = 15000) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'nitro-wraith-release-verify' },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function tagVersion(tag) {
  return String(tag || '').replace(/^v/, '').replace(/^canary-/, '');
}

function normalizeTag(tag) {
  const text = String(tag || '').trim();
  if (!text) return '';
  if (text.startsWith('v') || text.startsWith('canary-')) return text;
  return `v${text}`;
}

async function verifyPublished(tag, { wait = false } = {}) {
  tag = normalizeTag(tag);
  if (!tag) throw new Error('verify needs a tag (for example v8.14.53 or canary-8.14.53.12)');
  const expectedVersion = tagVersion(tag);
  const base = `${REPO_RELEASES}/${tag}`;
  const attempts = wait ? 12 : 1;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const manifestBuffer = await fetchBuffer(`${base}/build.json`);
      const manifest = JSON.parse(manifestBuffer.toString('utf8'));
      const sumsBuffer = await fetchBuffer(`${base}/SHA256SUMS`);
      const sums = require('./manifest').parseChecksums(sumsBuffer.toString('utf8'));

      if (manifest.app !== 'nitro-wraith') throw new Error(`build.json app is ${manifest.app}`);
      if (manifest.version !== expectedVersion) {
        throw new Error(`build.json version is ${manifest.version}, expected ${expectedVersion}`);
      }

      const assets = {};
      for (const name of Object.keys(manifest.files || {})) {
        const buffer = await fetchBuffer(`${base}/${name}`);
        const { sha256 } = require('./manifest');
        const digest = sha256(buffer);
        if (digest !== manifest.files[name].sha256) {
          throw new Error(`${name}: published hash does not match build.json`);
        }
        if (sums.get(name) !== digest) {
          throw new Error(`${name}: published hash does not match SHA256SUMS`);
        }
        if (Number(manifest.files[name].bytes) !== buffer.length) {
          throw new Error(`${name}: published size does not match build.json`);
        }
        assets[name] = digest;
      }

      const gistMeta = (await fetchBuffer(GIST_META)).toString('utf8');
      const gistVersion = firstMatch(gistMeta, /^\/\/ @version\s+(\S+)/m, 'Gist @version');
      if (gistVersion !== manifest.version) {
        throw new Error(`Gist version is ${gistVersion}, expected ${manifest.version}`);
      }

      const gistUser = await fetchBuffer(GIST_USER);
      const { sha256 } = require('./manifest');
      const gistHash = sha256(gistUser);
      const assetHash = assets['nitro-wraith.user.js'];
      if (gistHash !== assetHash) {
        throw new Error('Gist userscript does not match the published release asset');
      }

      if (manifest.commit) {
        const known = spawnSync('git', ['cat-file', '-e', `${manifest.commit}^{commit}`], {
          cwd: ROOT,
          stdio: 'ignore',
        }).status === 0;
        if (!known) console.warn(`release: warning: commit ${manifest.commit} is not in this clone`);
      }

      console.log(`release: ${tag} verified (${manifest.channel}, ${manifest.files['nitro-wraith.user.js'].sha256.slice(0, 12)}…)`);
      return { manifest, assets };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.log(`release: ${tag} not ready (${error.message}); retrying in 5 s (${attempt}/${attempts}).`);
        await sleep(5000);
      }
    }
  }

  throw lastError || new Error(`could not verify ${tag}`);
}

async function verify(argv) {
  const args = argv.slice(1);
  const localAt = args.indexOf('--local');
  if (localAt >= 0) {
    const dir = args[localAt + 1] || RELEASE_DIR;
    verifyLocal(dir);
    return;
  }

  const wait = args.includes('--wait');
  const tag = args.find((arg) => !arg.startsWith('--'));
  await verifyPublished(tag, { wait });
}

function hotfixPlan(argv, { quiet = false } = {}) {
  const fromAt = argv.indexOf('--from');
  const from = fromAt >= 0 ? argv[fromAt + 1] : '';
  if (!from) throw new Error('hotfix needs --from <tag|commit>');
  const versionAt = argv.indexOf('--version');
  const requested = versionAt >= 0 ? argv[versionAt + 1] : '';

  const commit = git(['rev-parse', '--verify', `${from}^{commit}`]);
  const sourcePackage = JSON.parse(git(['show', `${commit}:package.json`]));
  const sourceVersion = String(sourcePackage.version || '');
  const currentVersion = check();
  const nextVersion = requested || bumpPatch(currentVersion);
  if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) throw new Error(`hotfix version is not X.Y.Z: ${nextVersion}`);
  if (nextVersion <= currentVersion) {
    throw new Error(`hotfix version ${nextVersion} must be higher than the bad release ${currentVersion}`);
  }

  const plan = {
    from,
    commit,
    sourceVersion,
    currentVersion,
    nextVersion,
    tag: `v${nextVersion}`,
    steps: [
      'Create a branch from the bad release commit and restore the source tree from the source commit.',
      `Set the version to ${nextVersion} in src/00-header.js, src/10-config.js, package.json and README.md.`,
      'Build, run npm run check, and publish through the normal release path.',
      'Never republish a lower version: Tampermonkey will not downgrade an installed copy.',
    ],
  };

  if (!quiet) console.log(JSON.stringify(plan, null, 2));
  return plan;
}

function setVersionAt(dir, next) {
  const readAt = (relative) => fs.readFileSync(path.join(dir, relative), 'utf8');
  const writeAt = (relative, text) => fs.writeFileSync(path.join(dir, relative), text);

  const header = readAt('src/00-header.js')
    .replace(/^\/\/ @version\s+\S+/m, `// @version      ${next}`);
  const config = readAt('src/10-config.js')
    .replace(/const VERSION = '[^']+';/, `const VERSION = '${next}';`);
  const pkg = readAt('package.json').replace(/("version":\s*")[^"]+(")/, `$1${next}$2`);
  const readme = readAt('README.md')
    .replace(/version-\d+\.\d+\.\d+-/, `version-${next}-`)
    .replace(/releases\/tag\/v\d+\.\d+\.\d+/, `releases/tag/v${next}`);

  writeAt('src/00-header.js', header);
  writeAt('src/10-config.js', config);
  writeAt('package.json', pkg);
  writeAt('README.md', readme);

  execFileSync(process.execPath, [path.join(dir, 'tools', 'build.js')], {
    cwd: dir,
    stdio: 'ignore',
  });
}

function hotfixBuild(argv) {
  const outAt = argv.indexOf('--out');
  const outDir = outAt >= 0 && argv[outAt + 1]
    ? path.resolve(argv[outAt + 1])
    : path.join(DIST_DIR, 'hotfix');
  const plan = hotfixPlan(argv, { quiet: true });
  const worktree = path.join(ROOT, '.tmp', `hotfix-${plan.commit.slice(0, 10)}`);

  fs.rmSync(worktree, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(worktree), { recursive: true });

  try {
    git(['worktree', 'add', '--detach', worktree, plan.commit]);
    setVersionAt(worktree, plan.nextVersion);

    const manifest = writeBundle(outDir, {
      channel: 'stable-hotfix',
      version: plan.nextVersion,
      sourceVersion: plan.sourceVersion,
      commit: plan.commit,
      sourceRef: `hotfix:${plan.from}`,
      run: null,
      files: [
        path.join(worktree, FILES.script),
        path.join(worktree, FILES.meta),
      ],
      extra: { currentVersion: plan.currentVersion, from: plan.from },
    });

    fs.writeFileSync(path.join(outDir, 'HOTFIX.md'), `${[
      `# NITRO WRAITH ${plan.nextVersion} — stable hotfix`,
      '',
      `Built from \`${plan.from}\` (${plan.commit}), the last known good source.`,
      `The bad stable was \`${plan.currentVersion}\`; this version is higher so Tampermonkey updates it.`,
      '',
      'Do not publish this directory by hand. Follow `docs/ROLLBACK.md`: restore the',
      'source tree on a branch, commit the version bump, run the normal release',
      'workflow, and run `npm run release:verify -- ' + plan.nextVersion + '` afterwards.',
      '',
    ].join('\n')}\n`, 'utf8');

    console.log(JSON.stringify({ ...plan, outDir: path.relative(ROOT, outDir), manifest: path.relative(ROOT, path.join(outDir, 'build.json')) }, null, 2));
    return { plan, outDir, manifest };
  } finally {
    try {
      git(['worktree', 'remove', '--force', worktree]);
    } catch {
      fs.rmSync(worktree, { recursive: true, force: true });
      try { git(['worktree', 'prune']); } catch { /* sin worktrees */ }
    }
  }
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || 'check';

  if (command === 'check') {
    const version = check();
    console.log(`version ${version} is consistent`);
  } else if (command === 'prepare') {
    prepare();
  } else if (command === 'bundle') {
    bundle();
  } else if (command === 'verify') {
    verify(argv).catch((error) => {
      console.error(`release: ${error.message}`);
      process.exitCode = 1;
    });
  } else if (command === 'hotfix-plan') {
    hotfixPlan(argv.slice(1));
  } else if (command === 'hotfix-build') {
    hotfixBuild(argv.slice(1));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`release: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  check,
  prepare,
  bundle,
  verifyLocal,
  verifyPublished,
  hotfixPlan,
  hotfixBuild,
  normalizeTag,
  versions,
  bumpPatch,
  RELEASE_DIR,
  NOTES_FILE,
};
