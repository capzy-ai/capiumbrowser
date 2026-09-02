/**
 * puppeteer-cluster + Capium: a pool of stealth pages on ONE license seat.
 *
 * buildLaunchOptions() hands puppeteer-cluster the ready-made options for Capium's patched
 * binary. CONCURRENCY_CONTEXT runs many isolated crawl contexts inside a single browser --
 * which also means a single Capium license seat for the whole pool.
 *
 *     npm install capiumbrowser puppeteer-core puppeteer-cluster
 *     export CAPIUM_LICENSE_KEY=cap_...
 *     node puppeteer_cluster.js
 */
const { Cluster } = require('puppeteer-cluster');
const puppeteer = require('puppeteer-core');
const { buildLaunchOptions } = require('capiumbrowser/puppeteer');

const SEED = Number(process.env.CAPIUM_SEED || 54321);
const PLATFORM = process.env.CAPIUM_PLATFORM || 'windows';

async function main() {
  const cluster = await Cluster.launch({
    puppeteer, // puppeteer-core; Capium supplies the browser binary
    concurrency: Cluster.CONCURRENCY_CONTEXT, // one browser = one seat; contexts isolate jobs
    maxConcurrency: 4,
    puppeteerOptions: await buildLaunchOptions({
      seed: SEED,
      platform: PLATFORM,
      headless: true,
      proxy: process.env.CAPIUM_PROXY || null,
      geoip: Boolean(process.env.CAPIUM_PROXY),
    }),
  });

  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log(`${url} -> ${await page.title()}`);
  });

  for (const url of ['https://example.com', 'https://browserscan.net/', 'https://ipinfo.io/json']) {
    cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
