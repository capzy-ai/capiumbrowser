'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../lib/config');
const desktop = require('../lib/desktop');

test('explicit desktop brand keeps seeded hardware flags and default Chrome unchanged', () => {
  for (const platform of ['windows', 'macos', 'linux']) {
    const original = config.getDefaultStealthArgs(40100, platform);
    assert.deepEqual(config.getDefaultStealthArgs(40100, platform, null, null, 'CHROME'), original);
    for (const brand of ['edge', 'opera', 'vivaldi']) {
      assert.deepEqual(config.getDefaultStealthArgs(40100, platform, null, null, brand), [...original, `--fingerprint-brand=${brand}`]);
    }
  }
});

test('Android remains Chrome only, and desktop profiles allow release downloads', () => {
  const saved = process.env.CAPIUM_BINARY;
  delete process.env.CAPIUM_BINARY;
  try {
    for (const brand of ['edge', 'opera', 'vivaldi']) {
      assert.throws(() => config.getDefaultStealthArgs(2, 'android', null, null, brand), /desktop platform/);
      desktop.validateLaunch(brand, 'windows', null, [], true);
      assert.throws(() => desktop.validateLaunch(brand, 'linux', 'preview', [], false), /stealthArgs/);
      desktop.validateLaunch(brand, 'macos', 'preview', [], true);
    }
  } finally {
    if (saved === undefined) delete process.env.CAPIUM_BINARY; else process.env.CAPIUM_BINARY = saved;
  }
  assert.deepEqual(config.getDefaultStealthArgs(2, 'android', null, null, 'chrome'), config.getDefaultStealthArgs(2, 'android'));
});

test('unknown brands and conflicting extra args fail before launch', () => {
  for (const brand of ['firefox', '', ' opera ', 155, {}]) assert.throws(() => desktop.normalizeBrand(brand), /browserBrand/);
  for (const flag of ['--user-agent=X', '--fingerprint-brand=opera', '--fingerprint-brand-version=155', '--fingerprint-platform=android', '--fingerprint-brand']) {
    assert.throws(() => desktop.validateLaunch('edge', 'windows', 'preview', [flag], true), /conflicting identity/);
  }
});

test('vendor product versions are paired independently with Chromium versions', () => {
  assert.equal(desktop.profile('EDGE').product_version, '155.0.4283.45');
  assert.equal(desktop.profile('edge').chromium_version, '155.0.8059.40');
  assert.equal(desktop.profile('opera').product_version, '137.0.6036.39');
  assert.equal(desktop.profile('opera').chromium_version, '153.0.8010.55');
  assert.equal(desktop.profile('vivaldi').hint_brand, 'Google Chrome');
  assert.equal(desktop.profile('vivaldi').chromium_version, '152.0.7977.160');
  assert.equal(desktop.profile('vivaldi').ua_suffix, '');
});
