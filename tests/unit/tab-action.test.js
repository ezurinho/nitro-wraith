'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, summary } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const queue = fs.readFileSync(path.join(ROOT, 'src', '90-queue.js'), 'utf8');
const guard = fs.readFileSync(path.join(ROOT, 'src', '96-guard.js'), 'utf8');

test('queue side effects use the atomic tab-action lock', () => {
  assert.ok(!queue.includes('claimTabLease('), 'queue actions must not claim the advisory lease directly');
  const callsites = (queue.match(/runTabAction\(/g) || []).length;
  assert.ok(callsites >= 10, `expected all queue action paths to use runTabAction, found ${callsites}`);
});

test('the tab-action lock is short-lived and fails closed', () => {
  assert.match(guard, /const TAB_ACTION_LOCK = 'nta:tab-action'/);
  assert.match(guard, /navigator\.locks\.request\(TAB_ACTION_LOCK, \{ ifAvailable: true \}/);
  assert.match(guard, /if \(!lock\) return false/);
  assert.match(guard, /if \(!claimTabLease\(String\(reason \|\| ''\), false\)\) return false/);
});

summary('tab action lock');
