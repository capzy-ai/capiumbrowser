/**
 * Launching personas and persistent profiles (Node.js).
 *
 * A capium identity is one integer SEED -> a complete, coherent device (OS, GPU, cores,
 * memory, screen, fonts, UA). The persona OS is chosen with platform. Same seed + same
 * platform => the same machine every run, on any host.
 *
 * Two independent ideas, often combined:
 *   * PERSONA   = platform + seed   (WHAT the device looks like)
 *   * PROFILE   = userDataDir       (WHERE its cookies/logins/state persist between runs)
 *
 * Persistence lives ONLY in launchPersistentContext — launch()/launchContext() always use a
 * throwaway temp profile.
 *
 *     npm install capiumbrowser playwright-core    # or puppeteer-core
 *     export CAPIUM_LICENSE_KEY=cap_...            # the binary is license-gated
 *     node profiles.js
 *
 * The root import auto-detects the installed driver (Playwright preferred); pick one
 * explicitly with require('capiumbrowser/playwright') / require('capiumbrowser/puppeteer').
 */
const { launch, launchContext, launchPersistentContext } = require('capiumbrowser');

// 1) The three OS personas. Pick platform + any stable integer seed.
async function eachPlatform() {
  for (const [platform, seed] of [['windows', 200111], ['macos', 200222], ['linux', 200333]]) {
    const { browser, page } = await launchContext({
      seed, platform, headless: true, url: 'https://browserscan.net/',
    });
    console.log(`${platform.padEnd(8)} seed=${seed}  UA=${await page.evaluate(() => navigator.userAgent)}`);
    await browser.close(); // non-persistent: close the browser
  }
}

// 2) A PERSISTENT profile — one directory per identity keeps it logged in across runs
//    (and clears the FingerprintJS "incognito" tell a fresh temp profile raises).
//    Playwright: returns a CONTEXT (close the context). Puppeteer: launch() + userDataDir.
async function persistentAccount(profileDir = 'capium-profiles/acct-a', seed = 210001) {
  const ctx = await launchPersistentContext(profileDir, { seed, platform: 'windows' });
  const page = (typeof ctx.pages === 'function' && ctx.pages()[0]) || (await ctx.newPage());
  await page.goto('https://example.com');
  // ... log in / do work; cookies + localStorage persist in profileDir for next time ...
  await ctx.close();
}

// 3) A FLEET: many accounts, each its own coherent device AND its own profile dir.
async function accountFleet() {
  const accounts = { 'acct-a': 210001, 'acct-b': 210002, 'acct-c': 210003 };
  for (const [name, seed] of Object.entries(accounts)) {
    const ctx = await launchPersistentContext(`capium-profiles/${name}`, { seed, platform: 'macos' });
    const page = (typeof ctx.pages === 'function' && ctx.pages()[0]) || (await ctx.newPage());
    await page.goto('https://example.com');
    console.log(`${name} ready (seed=${seed})`);
    await ctx.close();
  }
}

// 4) Persona + proxy + geo coherence + a persistent profile, all together.
async function proxiedPersistent(profileDir = 'capium-profiles/proxied', seed = 200999) {
  const ctx = await launchPersistentContext(profileDir, {
    seed,
    platform: 'windows',
    proxy: 'http://user:pass@host:port', // inline creds (HTTP/HTTPS/SOCKS5); commas ok
    geoip: true, // opt in: pin tz/geo/WebRTC/lang to the proxy exit
  });
  const page = (typeof ctx.pages === 'function' && ctx.pages()[0]) || (await ctx.newPage());
  await page.goto('https://browserscan.net/');
  await ctx.close();
}

// 5) Full control: launch() -> Browser, build your own contexts/pages.
//    (newContext()/newPage() default to viewport: null so the page tracks the real window.)
async function fullControl(seed = 200123, platform = 'linux') {
  const browser = await launch({ seed, platform, headless: true });
  const page = await browser.newPage();
  await page.goto('https://example.com');
  await browser.close();
}

// 6) Humanized input: launchContext({humanize: true}) attaches page.humanMove /
//    humanClick / humanType / humanScroll — curved cursor, per-key jitter, eased scroll.
async function humanized() {
  const { browser, page } = await launchContext({
    seed: 200123, humanize: true, url: 'https://example.com',
  });
  await page.humanScroll(800);
  await browser.close();
}

if (require.main === module) {
  eachPlatform().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { eachPlatform, persistentAccount, accountFleet, proxiedPersistent, fullControl, humanized };
