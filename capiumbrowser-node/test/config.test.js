// Unit tests for config.getDefaultStealthArgs -- the per-launch fingerprint flags. Guards the
// storage-quota formula, per-persona font-metrics gating, and screen coherence. Mirrors the
// Python SDK's tests/test_config_args.py so the two SDKs can't drift apart silently.
'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const config = require('../lib/config');

const has = (args, prefix) =>
  args.some((a) => a === prefix || a.startsWith(prefix + '=') || a.startsWith(prefix));

test('seed and platform flags', () => {
  const args = config.getDefaultStealthArgs(12345, 'windows', null);
  assert.ok(args.includes('--fingerprint=12345'));
  assert.ok(args.includes('--fingerprint-platform=windows'));
});

test('storage quota formula', () => {
  // 128 + (seed % 8) * 64 GB. seed 12345 % 8 == 1 -> 192; seed 1000 % 8 == 0 -> 128.
  const a1 = config.getDefaultStealthArgs(12345, 'linux', null);
  assert.ok(a1.includes('--fingerprint-storage-quota=192'));
  const a2 = config.getDefaultStealthArgs(1000, 'linux', null);
  assert.ok(a2.includes('--fingerprint-storage-quota=128'));
});

test('windows gets font metrics, others do not', () => {
  const win = config.getDefaultStealthArgs(1, 'windows', null);
  assert.ok(win.includes('--fingerprint-windows-font-metrics'));
  for (const plat of ['macos', 'linux']) {
    const a = config.getDefaultStealthArgs(1, plat, null);
    assert.ok(!a.includes('--fingerprint-windows-font-metrics'), plat);
  }
});

test('noise off by default', () => {
  const args = config.getDefaultStealthArgs(1, 'linux', null);
  assert.ok(args.includes('--fingerprint-noise=false'));
});

test('screen coherence flags', () => {
  const args = config.getDefaultStealthArgs(1, 'linux', [1440, 900]);
  assert.ok(args.includes('--window-size=1440,900'));
  assert.ok(args.includes('--fingerprint-screen-width=1440'));
  assert.ok(args.includes('--fingerprint-screen-height=900'));
});

test('default screen argument applies when omitted', () => {
  const args = config.getDefaultStealthArgs(1, 'linux');
  assert.ok(args.includes('--window-size=1440,900'));
});

test('no seed omits identity flags', () => {
  const args = config.getDefaultStealthArgs(null, 'windows', null);
  assert.ok(!has(args, '--fingerprint='));
  assert.ok(!has(args, '--fingerprint-platform'));
  assert.ok(!has(args, '--fingerprint-storage-quota'));
  // non-identity defaults still present
  assert.ok(args.includes('--no-first-run'));
});

test('third-party cookies allowed', () => {
  const args = config.getDefaultStealthArgs(1, 'linux', null);
  assert.ok(args.includes('--fingerprint-allow-3p-cookies'));
});

test('newSeed is a positive 31-bit int', () => {
  for (let i = 0; i < 100; i++) {
    const s = config.newSeed();
    assert.ok(Number.isInteger(s) && s >= 1 && s < 2 ** 31, String(s));
  }
});
