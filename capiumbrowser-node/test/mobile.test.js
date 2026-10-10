'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mobile = require('../lib/mobile');
const config = require('../lib/config');
const { buildArgs } = require('../lib/launch-common');
const { _applyViewportDefaults } = require('../playwright');

test('whole phone presets are 2022 or newer, stable across desktop seed ranges', () => {
  const rows = [ ['Pixel 7', '13', 412, 915, 2.625], ['Pixel 8', '14', 412, 915, 2.625],
    ['Pixel 8 Pro', '14', 448, 997, 3], ['Pixel 8a', '14', 412, 915, 2.625],
    ['Pixel 9', '14', 412, 924, 2.625] ];
  rows.forEach((row, seed) => {
    const p = mobile.androidProfile(seed);
    assert.ok(p.release_year >= 2022);
    assert.deepEqual([p.model, p.platform_version, p.width, p.height, p.dpr], row);
    assert.deepEqual(mobile.androidProfile(seed + 200000), p);
  });
  assert.deepEqual(mobile.androidProfile(0xffffffff), mobile.androidProfile(0));
  const p = mobile.androidProfile(0); p.model = 'mutated';
  assert.equal(mobile.androidProfile(0).model, 'Pixel 7');
  for (const seed of [null, undefined, true, -1, 1.5, '1', 0x100000000]) {
    assert.throws(() => mobile.androidProfile(seed), RangeError);
  }
});

test('mobile launch has one phone window and no desktop mouse/quota/font defaults', () => {
  for (const headless of [true, false]) {
    const args = buildArgs({ seed: 2, platform: 'android', stealthArgs: true, headless });
    assert.deepEqual(args.filter(a => a.startsWith('--window-size=')), ['--window-size=448,997']);
    assert.ok(args.includes('--touch-events=enabled'));
    assert.ok(!args.some(a => a.startsWith('--fingerprint-storage-quota=')));
    assert.ok(!args.includes('--fingerprint-windows-font-metrics'));
    assert.ok(!args.join(' ').includes('primaryPointerType=4'));
  }
  assert.deepEqual(config.getDefaultStealthArgs(2, 'android', [400, 900]).slice(-2),
    ['--fingerprint-screen-width=400', '--fingerprint-screen-height=900']);
});

test('Playwright plain launch paths get mobile defaults, explicit context options win', async () => {
  const browser = _applyViewportDefaults({
    newContext: async options => options, newPage: async options => options,
  }, 2);
  for (const method of ['newContext', 'newPage']) {
    assert.deepEqual(await browser[method](), mobile.contextOptions(2));
    assert.deepEqual(await browser[method]({ viewport: null }), { viewport: null });
  }
  const given = { viewport: { width: 400, height: 800 }, hasTouch: false };
  const result = mobile.contextOptions(2, given);
  assert.equal(result.hasTouch, false);
  assert.deepEqual(result.viewport, given.viewport);
  assert.ok(!('deviceScaleFactor' in given));
  assert.deepEqual(mobile.puppeteerViewport(2), {
    width: 448, height: 997, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
});

test('Android context UA overrides fail before driver context creation, including viewport null', () => {
  const calls = [];
  const browser = _applyViewportDefaults({
    newContext: async options => { calls.push(options); },
    newPage: async options => { calls.push(options); },
  }, 0);
  for (const method of ['newContext', 'newPage']) {
    for (const userAgent of ['', 'Mozilla/5.0 ROBLOX Android App 2.741.1062',
      'Mozilla/5.0 (Linux; Android 9; Pixel 7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36']) {
      assert.throws(() => browser[method]({ userAgent, viewport: null }), /matching Client Hints/);
    }
  }
  assert.deepEqual(calls, []);
});

test('mobile rejects conflicting identity overrides without affecting desktop launches', () => {
  mobile.validateLaunch('android', 'development-chrome');
  assert.throws(() => mobile.validateLaunch('android', 'development-chrome', ['--user-agent=desktop']),
    /identity overrides/);
  assert.throws(() => mobile.validateLaunch('android', 'development-chrome', ['--fingerprint-platform', 'windows']),
    /identity overrides/);
  assert.throws(() => mobile.validateLaunch('android', 'development-chrome', [], false), /stealthArgs/);
  assert.throws(() => mobile.validateLaunch('Android', 'development-chrome'), /platform: 'android'/);
  mobile.validateLaunch('windows', null, ['--user-agent=custom']);
});

test('explicit devices keep model/OS/screen/DPR together without altering seed defaults', () => {
  for (const [device, model, width, height, dpr] of [
    ['samsung-galaxy-a55', 'SM-A556B', 360, 800, 2.25],
    ['pixel-9-pro', 'Pixel 9 Pro', 427, 952, 3],
    ['pixel-9-pro-xl', 'Pixel 9 Pro XL', 448, 997, 3],
  ]) {
    for (const seed of [0, 2, 0xffffffff]) {
      const p = mobile.androidProfile(seed, device);
      assert.equal(p.model, model); assert.equal(p.platform_version, '14');
      assert.equal(p.id, device);
      const args = buildArgs({ seed, platform: 'android', mobileDevice: device, stealthArgs: true, headless: true });
      assert.ok(args.includes('--fingerprint-mobile-device=' + device));
      assert.deepEqual(args.filter(a => a.startsWith('--window-size=')), [`--window-size=${width},${height}`]);
      assert.deepEqual(mobile.contextOptions(seed, {}, device).viewport, { width, height });
      assert.deepEqual(mobile.puppeteerViewport(seed, device), {
        width, height, deviceScaleFactor: dpr, isMobile: true, hasTouch: true,
      });
    }
  }
});

test('unknown selectors fail before launch, and devices require Android', () => {
  for (const device of ['', 'Samsung', 'SM-A556B', '__proto__', 0, true, {}, []]) {
    assert.throws(() => mobile.validateLaunch('android', 'development-chrome', [], true, device), /catalog ID/);
  }
  assert.throws(() => mobile.validateLaunch('windows', 'development-chrome', [], true, 'samsung-galaxy-a55'), /requires platform/);
  assert.throws(() => mobile.validateLaunch('android', 'development-chrome', ['--fingerprint-mobile-device=pixel-7']), /identity overrides/);
});

test('explicit device reaches both Playwright context creation paths', async () => {
  const browser = _applyViewportDefaults({ newContext: async o => o, newPage: async o => o }, 2, 'samsung-galaxy-a55');
  for (const method of ['newContext', 'newPage']) {
    assert.deepEqual(await browser[method](), mobile.contextOptions(2, {}, 'samsung-galaxy-a55'));
  }
});
