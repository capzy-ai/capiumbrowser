// Opt-in end-to-end smoke test: actually launches the Capium browser through whichever
// driver is installed and reads back the spoofed persona. Needs a real binary + license on
// the host, so it is OFF by default -- enable with:
//
//     CAPIUM_SMOKE=1 npm test            # (plus playwright-core and/or puppeteer-core)
'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const enabled = process.env.CAPIUM_SMOKE === '1';
const has = (n) => { try { require.resolve(n); return true; } catch { return false; } };

test('playwright: launch -> spoofed persona -> close',
  { skip: !enabled || !(has('playwright-core') || has('playwright')) }, async () => {
    const { launchContext } = require('../playwright');
    const { browser, page } = await launchContext({
      seed: 424242, platform: 'windows', headless: true,
    });
    try {
      // 009 keeps webdriver un-flagged: false, or absent under --enable-automation.
      assert.ok(!(await page.evaluate(() => navigator.webdriver)));
      const plat = await page.evaluate(() => navigator.platform);
      assert.equal(plat, 'Win32');
      assert.equal(browser._capiumSeed, 424242);
    } finally {
      await browser.close();
    }
  });

test('puppeteer: launch -> spoofed persona -> close',
  { skip: !enabled || !(has('puppeteer-core') || has('puppeteer')) }, async () => {
    const { launchContext } = require('../puppeteer');
    const { browser, page } = await launchContext({
      seed: 424242, platform: 'windows', headless: true,
    });
    try {
      assert.ok(!(await page.evaluate(() => navigator.webdriver)));
      assert.equal(await page.evaluate(() => navigator.platform), 'Win32');
      assert.equal(browser._capiumSeed, 424242);
    } finally {
      await browser.close();
    }
  });
