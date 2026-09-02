/**
 * Crawlee (Node) + Capium: stealth crawling with PlaywrightCrawler.
 *
 * buildLaunchOptions() hands Crawlee the ready-made launch options for Capium's patched
 * binary, so the whole crawl runs behind source-level fingerprint patches. Capium handles
 * fingerprints in the engine, so Crawlee's own fingerprint/header spoofing is disabled
 * (JS-level spoofing on top of the engine's would read as tampering).
 *
 *     npm install capiumbrowser crawlee playwright-core
 *     export CAPIUM_LICENSE_KEY=cap_...
 *     node crawlee.js
 */
const { PlaywrightCrawler } = require('crawlee');
const { chromium } = require('playwright-core');
const { buildLaunchOptions } = require('capiumbrowser/playwright');

const SEED = Number(process.env.CAPIUM_SEED || 54321);
const PLATFORM = process.env.CAPIUM_PLATFORM || 'windows';

async function main() {
  // Downloads the license-gated build if it isn't present, then returns the full
  // {executablePath, args, env, ...} object for Playwright's own launcher.
  const launchOptions = await buildLaunchOptions({
    seed: SEED,
    platform: PLATFORM,
    headless: true,
    proxy: process.env.CAPIUM_PROXY || null, // inline creds; the binary self-auths
    geoip: Boolean(process.env.CAPIUM_PROXY), // pin tz/geo/WebRTC/lang to the proxy exit
  });

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 10,
    launchContext: {
      launcher: chromium,
      launchOptions,
    },
    browserPoolOptions: {
      // Capium sets fingerprints at the binary level -- no JS fingerprint injection.
      useFingerprints: false,
    },
    async requestHandler({ page, request, enqueueLinks, log }) {
      log.info(`${request.url} -> ${await page.title()}`);
      await enqueueLinks();
    },
  });

  await crawler.run(['https://crawlee.dev']);
}

main().catch((e) => { console.error(e); process.exit(1); });
