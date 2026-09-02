/**
 * capiumbrowser/playwright -- launch a stealth Capium browser through vanilla Playwright.
 *
 *     npm install capiumbrowser playwright-core
 *
 *     const { launch, launchContext } = require('capiumbrowser/playwright');
 *     const { browser, page } = await launchContext({ seed: 42, platform: 'windows' });
 *     await page.goto('https://fingerprint.com/demo/');
 *
 * We use Playwright's NATIVE launch()/launchPersistentContext() with executablePath pointed
 * at the capium bash wrapper (which adds GL/geoip/font/bluetooth/storage flags). No stealth
 * plugin: capium's in-binary patches (001 -> developer_tools=false, 009 ->
 * navigator.webdriver=false) provide the CDP hardening, so plain Playwright avoids the
 * common automation tells.
 *
 * Public API:
 *     launch(options)                            -> Browser
 *     launchContext(options)                     -> {browser, context, page}
 *     launchPersistentContext(userDataDir, opts) -> BrowserContext   (cookies/state persist)
 */
'use strict';

const config = require('./lib/config');
const download = require('./lib/download');
const human = require('./lib/human');
const license = require('./lib/license');
const { CapiumError, translateLaunchError, readLaunchStatus } = require('./lib/errors');
const { proxyAndGeoArgs, buildArgs, newStatusFile, clearStatusFile } =
  require('./lib/launch-common');

function requireDriver() {
  for (const name of ['playwright-core', 'playwright']) {
    try {
      return require(name);
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') throw e;
    }
  }
  throw new CapiumError(
    'playwright-core is not installed. Run: npm install capiumbrowser playwright-core');
}

/** Find the capium wrapper; if absent, try to download it (see lib/download). */
async function resolveBinary(binary, licenseKey) {
  try {
    return config.findBinary(binary);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    return download.ensureBinary({ licenseKey });
  }
}

/**
 * Common prologue for both launch flavors: preflight, binary, seed, args, env, status file.
 */
async function prepare(opts) {
  const {
    seed = null, platform = 'windows', proxy = null, geoip = null, args = null,
    stealthArgs = true, timezone = null, locale = null, extensionPaths = null,
    binary = null, licenseKey = null, licenseServer = null,
    licenseThroughProxy = false, licensePreflight = true,
  } = opts;
  if (licensePreflight) license.preflight(licenseKey, licenseServer);
  const { key } = license.effective(licenseKey, licenseServer);
  const binPath = await resolveBinary(binary, key);
  const finalSeed = seed === null || seed === undefined ? config.newSeed() : seed;
  const { launchOptions, args: proxyArgs } = proxyAndGeoArgs(proxy, geoip);
  const launchArgs = proxyArgs.concat(buildArgs({
    seed: finalSeed, platform, stealthArgs, timezone, locale, extensionPaths, extra: args,
  }));
  if (licenseThroughProxy) launchArgs.push('--license-through-proxy');
  const env = license.childEnv(licenseKey, licenseServer);
  const statusPath = newStatusFile(env);
  return { binPath, finalSeed, launchOptions, launchArgs, env, statusPath };
}

async function throwTranslated(e, statusPath) {
  const t = readLaunchStatus(statusPath) || translateLaunchError(e);
  clearStatusFile(statusPath);
  if (t) throw t;
  throw e;
}

/**
 * Escape hatch: the ready-made options object for Playwright's own chromium.launch /
 * launchPersistentContext -- for callers that need to hold the launch themselves
 * (framework integrations like Crawlee, custom pools). Same inputs as launch():
 *
 *     const { chromium } = require('playwright-core');
 *     const browser = await chromium.launch(await buildLaunchOptions({ seed: 42 }));
 *
 * Note: launch()'s extra safety net (the fail-closed status file -> typed license errors)
 * only reports through launch(); with a raw chromium.launch a license refusal surfaces as
 * Playwright's own launch error.
 */
async function buildLaunchOptions(opts = {}) {
  const {
    seed, platform, proxy, geoip, args, stealthArgs, timezone, locale, extensionPaths,
    binary, licenseKey, licenseServer, licenseThroughProxy, licensePreflight,
    headless = false, ...rest
  } = opts;
  const prep = await prepare({
    seed, platform, proxy, geoip, args, stealthArgs, timezone, locale, extensionPaths,
    binary, licenseKey, licenseServer, licenseThroughProxy, licensePreflight,
  });
  return {
    executablePath: prep.binPath, headless, args: prep.launchArgs, env: prep.env,
    ...prep.launchOptions, ...rest,
  };
}

/**
 * Default a launched Browser's newContext()/newPage() to viewport: null (no emulation)
 * unless the caller passes a viewport themselves. Playwright's fixed 1280x720 emulated
 * viewport leaves the page smaller than the window AND mismatching window.screen -- an
 * incoherent fingerprint (the exact tell launchContext/launchPersistentContext already
 * avoid; this closes the plain-launch() path too). An explicit viewport (including a
 * user-passed null) is always honored.
 */
function applyViewportDefaults(browser) {
  for (const method of ['newContext', 'newPage']) {
    const orig = browser[method];
    if (typeof orig !== 'function') continue;
    browser[method] = function (options = {}, ...more) {
      if (!('viewport' in options)) options = { ...options, viewport: null };
      return orig.call(this, options, ...more);
    };
  }
  return browser;
}

/**
 * Launch a Capium Browser (non-persistent; Playwright manages a temp profile).
 *
 * seed/platform : identity. stealthArgs: false drops the default fingerprint flags.
 * proxy         : "http://user:pass@host:port" | "socks5://host:port" | {server, username, ...}.
 * geoip         : geo coherence, resolved inside the binary. null (default) = OFF: no lookup
 *                 runs, even with a proxy. true = ON: pins timezone/geo/WebRTC/language to the
 *                 egress (proxy exit, or the host IP if proxyless). false = explicit opt-out.
 * timezone/locale: explicit override (IANA tz + BCP-47 locale; in-binary spoof).
 * licenseKey/licenseServer: pass the license programmatically (else read from
 *                 CAPIUM_LICENSE_KEY / ~/.capium/license). The binary self-licenses; the key
 *                 is handed to it via the environment, never on argv.
 * licensePreflight: fail fast with a typed CapiumConfigError when no license key is set
 *                 (default true; instant + offline). Set false for a dev build that runs
 *                 without enforcement.
 * Remaining options are forwarded to Playwright's chromium.launch (e.g. slowMo: ...).
 */
async function launch(opts = {}) {
  const {
    seed, platform, proxy, geoip, args, stealthArgs, timezone, locale, extensionPaths,
    binary, licenseKey, licenseServer, licenseThroughProxy, licensePreflight,
    headless = false, ...rest
  } = opts;
  const prep = await prepare({
    seed, platform, proxy, geoip, args, stealthArgs, timezone, locale, extensionPaths,
    binary, licenseKey, licenseServer, licenseThroughProxy, licensePreflight,
  });
  const pw = requireDriver();
  let browser;
  try {
    browser = await pw.chromium.launch({
      executablePath: prep.binPath, headless, args: prep.launchArgs, env: prep.env,
      ...prep.launchOptions, ...rest,
    });
  } catch (e) {
    await throwTranslated(e, prep.statusPath);
  }
  clearStatusFile(prep.statusPath);
  browser._capiumSeed = prep.finalSeed;
  return applyViewportDefaults(browser);
}

/**
 * Launch a persistent context (cookies/localStorage/state persist in userDataDir).
 *
 * Same options as launch(); returns a BrowserContext.
 */
async function launchPersistentContext(userDataDir, opts = {}) {
  const {
    seed, platform, proxy, geoip, args, stealthArgs, timezone, locale, extensionPaths,
    binary, licenseKey, licenseServer, licenseThroughProxy, licensePreflight,
    headless = false, ...rest
  } = opts;
  const prep = await prepare({
    seed, platform, proxy, geoip, args, stealthArgs, timezone, locale, extensionPaths,
    binary, licenseKey, licenseServer, licenseThroughProxy, licensePreflight,
  });
  // Default to the page filling the window (see launchContext) unless the caller pinned a
  // viewport themselves. viewport: null is Playwright-JS for "no fixed viewport".
  if (!('viewport' in rest)) rest.viewport = null;
  const pw = requireDriver();
  let ctx;
  try {
    ctx = await pw.chromium.launchPersistentContext(userDataDir, {
      executablePath: prep.binPath, headless, args: prep.launchArgs, env: prep.env,
      ...prep.launchOptions, ...rest,
    });
  } catch (e) {
    await throwTranslated(e, prep.statusPath);
  }
  clearStatusFile(prep.statusPath);
  ctx._capiumSeed = prep.finalSeed;
  return ctx;
}

/**
 * Size a modest windowed browser that fits within the seed's spoofed screen.
 *
 * A real window is never larger than its display and is usually NOT maximized. Caps the
 * window to <= the available screen with a slight offset. No-op on failure/headless.
 */
async function fitWindow(browser, context, page) {
  try {
    const scr = await page.evaluate(() => ({ w: screen.availWidth, h: screen.availHeight }));
    if (!scr || !scr.w || !scr.h) return;
    const aw = Math.trunc(scr.w);
    const ah = Math.trunc(scr.h);
    const w = Math.min(aw, 1440);
    const h = Math.min(ah, 900);
    const left = Math.max(0, Math.floor((aw - w) / 5));
    const top = Math.max(0, Math.floor((ah - h) / 6));
    const pcdp = await context.newCDPSession(page);
    const { targetInfo } = await pcdp.send('Target.getTargetInfo');
    const bcdp = await browser.newBrowserCDPSession();
    const { windowId } = await bcdp.send('Browser.getWindowForTarget',
      { targetId: targetInfo.targetId });
    await bcdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { left, top, width: w, height: h, windowState: 'normal' },
    });
  } catch {}
}

/**
 * Convenience: launch() + first context + a page (optionally navigated to `url`).
 *
 * humanize: true attaches page.humanMove/humanClick/humanType/humanScroll (see lib/human).
 * Returns {browser, context, page}. page.goto(url) is done here so tampering stays clean
 * (driven navigation), matching our launcher behavior.
 */
async function launchContext(opts = {}) {
  const { url = null, humanize = false, humanPreset = 'default',
    headless = false, ...rest } = opts;
  const browser = await launch({ headless, ...rest });
  // viewport: null -- let the page fill the real window (fitWindow sizes the window to the
  // persona's screen). A fixed 1280x720 emulated viewport would leave the page smaller than
  // the window AND mismatch window.screen -- an incoherent fingerprint.
  const context = browser.contexts()[0] || (await browser.newContext({ viewport: null }));
  if (humanize) human.humanize(context, humanPreset);
  const page = context.pages()[0] || (await context.newPage());
  if (!headless) await fitWindow(browser, context, page); // modest window <= spoofed screen
  if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { browser, context, page };
}

module.exports = {
  launch, launchContext, launchPersistentContext, fitWindow, buildLaunchOptions,
  _applyViewportDefaults: applyViewportDefaults,
};
