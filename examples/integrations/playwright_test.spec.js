/**
 * @playwright/test + Capium: run your existing test suite through the stealth browser.
 *
 * A fixture override swaps the built-in `browser` for a Capium launch, so every test
 * (and your whole existing suite) runs behind source-level fingerprint patches with
 * zero changes to the tests themselves.
 *
 *     npm install capiumbrowser @playwright/test
 *     export CAPIUM_LICENSE_KEY=cap_...
 *     npx playwright test playwright_test.spec.js
 */
const base = require('@playwright/test');
const { launch } = require('capiumbrowser/playwright');

const SEED = Number(process.env.CAPIUM_SEED || 54321);
const PLATFORM = process.env.CAPIUM_PLATFORM || 'windows';

const test = base.test.extend({
  // Replace the worker-scoped browser with a Capium one. newContext()/newPage() on it
  // default to viewport: null so the page tracks the real window (coherent dimensions).
  browser: [async ({}, use) => {
    const browser = await launch({ seed: SEED, platform: PLATFORM, headless: true });
    await use(browser);
    await browser.close();
  }, { scope: 'worker' }],
});

test('persona reads coherently', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('https://example.com');
  base.expect(await page.evaluate(() => navigator.webdriver)).toBeFalsy();
  base.expect(await page.evaluate(() => navigator.userAgent)).toContain('Chrome');
});
