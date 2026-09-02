/**
 * CDP attach (Node): Capium owns the browser + fingerprints, ANY tool owns the automation.
 *
 * Launch Capium with a DevTools port, then point any CDP-speaking framework at it --
 * Puppeteer, Playwright, chrome-remote-interface, an AI agent, anything. All stealth flags
 * are already set by the launch; the attaching tool inherits them for free.
 *
 *     npm install capiumbrowser playwright-core puppeteer-core
 *     export CAPIUM_LICENSE_KEY=cap_...
 *     node cdp_connect.js
 */
const { launch } = require('capiumbrowser/playwright');

const SEED = Number(process.env.CAPIUM_SEED || 54321);
const PORT = 9242;

async function main() {
  // 1) Capium launches with a DevTools endpoint (one license seat for everything attached).
  const browser = await launch({
    seed: SEED,
    platform: process.env.CAPIUM_PLATFORM || 'windows',
    headless: true,
    args: [`--remote-debugging-port=${PORT}`],
  });

  // 2a) Puppeteer attaches to the SAME browser over CDP.
  const puppeteer = require('puppeteer-core');
  const viaPuppeteer = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: null, // page tracks the real window -- coherent dimensions
  });
  const page = await viaPuppeteer.newPage();
  await page.goto('https://example.com');
  console.log('puppeteer sees:', await page.evaluate(() => navigator.userAgent));
  await viaPuppeteer.disconnect(); // detach only; Capium keeps running

  // 2b) ...or Playwright attaches the same way.
  const { chromium } = require('playwright-core');
  const viaPlaywright = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const ctx = viaPlaywright.contexts()[0];
  const pwPage = ctx.pages()[0] || (await ctx.newPage());
  await pwPage.goto('https://browserscan.net/');
  console.log('playwright sees:', await pwPage.evaluate(() => navigator.platform));
  await viaPlaywright.close(); // detach

  await browser.close(); // the launch owns the process (and the seat)
}

main().catch((e) => { console.error(e); process.exit(1); });
