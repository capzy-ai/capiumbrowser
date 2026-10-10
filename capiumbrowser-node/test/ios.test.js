'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mobile = require('../lib/mobile');
const { buildArgs } = require('../lib/launch-common');
const { _applyViewportDefaults } = require('../playwright');

test('iPhone profile stays separate from Android and desktop defaults', () => {
  for (const seed of [0, 2, 0xffffffff]) {
    const p = mobile.mobileProfile(seed, null, 'ios');
    assert.deepEqual([p.id, p.width, p.height, p.dpr], ['iphone-16',393,852,3]);
    const args = buildArgs({ seed, platform:'ios', stealthArgs:true, headless:true });
    assert.ok(args.includes('--fingerprint-platform=ios'));
    assert.ok(args.includes('--user-agent=' + p.user_agent));
    assert.ok(args.includes('--capium-preserve-user-agent'));
    assert.deepEqual(args.filter(a => a.startsWith('--window-size=')), ['--window-size=393,852']);
    assert.ok(!args.some(a => a.startsWith('--fingerprint-storage-quota=')));
    assert.deepEqual(mobile.puppeteerViewport(seed, null, 'ios'), {
      width:393,height:852,deviceScaleFactor:3,isMobile:true,hasTouch:true,
    });
  }
});

test('iPhone layout reaches both Playwright context creation paths', async () => {
  const browser = _applyViewportDefaults({newContext:async o=>o,newPage:async o=>o},3,'iphone-16','ios');
  for (const method of ['newContext','newPage']) {
    assert.deepEqual(await browser[method](), mobile.contextOptions(3,{},'iphone-16','ios'));
    assert.throws(() => browser[method]({userAgent:'desktop',viewport:null}), /catalog UA/);
  }
});

test('phone selectors cannot cross categories and release downloads are allowed', () => {
  mobile.validateLaunch('ios',null,[],true,'iphone-16');
  assert.throws(() => mobile.validateLaunch('ios',null,[],true,'pixel-7'), /catalog ID/);
  assert.throws(() => mobile.validateLaunch('android',null,[],true,'iphone-16'), /catalog ID/);
  assert.throws(() => mobile.validateLaunch('macos',null,[],true,'iphone-16'), /requires platform/);
  assert.throws(() => mobile.validateLaunch('ios',null,['--user-agent=desktop']), /identity overrides/);
});
