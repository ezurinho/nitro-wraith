'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, summary } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');

test('release shell never interpolates remote Gist output directly', () => {
  assert.ok(!workflow.includes('${{ steps.gist.outputs.GIST_VERSION }}'),
    'the mutable Gist version must not be pasted into shell source');
  assert.ok(!workflow.includes('${{ steps.gist.outputs.GIST_VERSION'),
    'no Gist output may be interpolated into a run block');
});

test('release shell consumes only a validated Gist version from env', () => {
  assert.match(workflow, /SAFE_GIST_VERSION/);
  assert.match(workflow, /SAFE_GIST_VERSION:\s*\$\{\{ steps\.gist\.outputs\.SAFE_GIST_VERSION \}\}/);
  assert.match(workflow, /\[\[.*gist_version.*=~/);
  assert.match(workflow, /\[ "\$SAFE_GIST_VERSION" != "\$version" \]/);
});

summary('release workflow safety');
