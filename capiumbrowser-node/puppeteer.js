/**
 * capiumbrowser/puppeteer -- launch a stealth Capium browser through vanilla Puppeteer.
 *
 *     npm install capiumbrowser puppeteer-core
 *
 *     const { launch, launchContext } = require('capiumbrowser/puppeteer');
 *     const { browser, page } = await launchContext({ seed: 42, platform: 'windows' });
 *     await page.goto('https://fingerprint.com/demo/');
 *
 * Same contract as the Playwright front-end: Puppeteer's NATIVE launch() with executablePath
 * pointed at the capium wrapper; the binary's own patches (001/009) do the CDP hardening.
 * Puppeteer-specific defaults applied here:
 *   * headless: false            (Puppeteer defaults to headless; a windowed browser is the
 *                                 coherent persona default, matching the Playwright path)
 *   * defaultViewport: null      (Puppeteer's fixed 800x600 emulated viewport would leave the
 *                                 page smaller than the window and mismatch window.screen)
 *   * '--enable-automation' is stripped from Puppeteer's default args (an automation banner +
 *     webdriver tell the Playwright native path never adds)
 *
 * Public API:
 *     launch(options)                            -> Browser
 *     launchContext(options)                     -> {browser, page}
 *     launchPersistentContext(userDataDir, opts) -> Browser   (profile persists in userDataDir)
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
  for (const name of ['puppeteer-core', 'puppeteer']) {
    try {
      return require(name);
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') throw e;
    }
  }
  throw new CapiumError(
    'puppeteer-core is not installed. Run: npm install capiumbrowser puppeteer-core');
}

async function resolveBinary(binary, licenseKey) {
  try {
    return config.findBinary(binary);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    return download.ensureBinary({ licenseKey });
  }
}

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

/**
 * Wire the CDP-auth escape-hatch credentials (CAPIUM_INLINE_PROXY_AUTH=0) into every page.
 * Puppeteer has no launch-level proxy credential option; page.authenticate answers the 407.
 */
function wireProxyAuth(browser, proxyOption) {
  if (!proxyOption || !proxyOption.username) return;
  const creds = { username: proxyOption.username, password: proxyOption.password || '' };
  browser.on('targetcreated', async (target) => {
    try {
      const page = await target.page();
      if (page) await page.authenticate(creds);
    } catch {}
  });
}

async function throwTranslated(e, statusPath) {
  const t = readLaunchStatus(statusPath) || translateLaunchError(e);
  clearStatusFile(statusPath);
  if (t) throw t;
  throw e;
}

/**
 * Escape hatch: the ready-made options object for puppeteer.launch itself -- for callers
 * that need to hold the launch (framework integrations, custom pools). Same inputs as
 * launch():
 *
 *     const puppeteer = require('puppeteer-core');
 *     const browser = await puppeteer.launch(await buildLaunchOptions({ seed: 42 }));
 *
 * Note: launch()'s extra safety nets (fail-closed status file -> typed license errors, and
 * the CDP proxy-auth wiring) only apply through launch().
 */
async function buildLaunchOptions(opts = {}) {
  const {
    seed, platform, proxy, geoip, args, stealthArgs, timezone, locale, extensionPaths,
    binary, licenseKey, licenseServer, licenseThroughProxy, licensePreflight,
    headless = false, ignoreDefaultArgs, ...rest
  } = opts;
  const prep = await prepare({
    seed, platform, proxy, geoip, args, stealthArgs, timezone, locale, extensionPaths,
    binary, licenseKey, licenseServer, licenseThroughProxy, licensePreflight,
  });
  const proxyOption = prep.launchOptions.proxy || null;
  const launchArgs = [...prep.launchArgs];
  if (proxyOption) {
    launchArgs.push(`--proxy-server=${proxyOption.server}`);
    if (proxyOption.bypass) launchArgs.push(`--proxy-bypass-list=${proxyOption.bypass}`);
  }
  return {
    executablePath: prep.binPath,
    headless,
    args: launchArgs,
    env: prep.env,
    defaultViewport: 'defaultViewport' in rest ? rest.defaultViewport : null,
    ignoreDefaultArgs: ignoreDefaultArgs === undefined ? ['--enable-automation'] : ignoreDefaultArgs,
    ...rest,
  };
}

/**
 * Launch a Capium Browser via Puppeteer. Same options as the Playwright front-end
 * (seed, platform, proxy, geoip, timezone, locale, licenseKey, ...); remaining options are
 * forwarded to puppeteer.launch (e.g. slowMo, userDataDir, ...).
 */
async function launch(opts = {}) {
  const {
    seed, platform, proxy, geoip, args, stealthArgs, timezone, locale, extensionPaths,
    binary, licenseKey, licenseServer, licenseThroughProxy, licensePreflight,
    headless = false, ignoreDefaultArgs, ...rest
  } = opts;
  const prep = await prepare({
    seed, platform, proxy, geoip, args, stealthArgs, timezone, locale, extensionPaths,
    binary, licenseKey, licenseServer, licenseThroughProxy, licensePreflight,
  });
  const puppeteer = requireDriver();
  // The CDP escape hatch puts {proxy: {server, username?, ...}} in launchOptions; Puppeteer
  // takes the server as a plain flag and the credentials via page.authenticate.
  const proxyOption = prep.launchOptions.proxy || null;
  const launchArgs = [...prep.launchArgs];
  if (proxyOption) {
    launchArgs.push(`--proxy-server=${proxyOption.server}`);
    if (proxyOption.bypass) launchArgs.push(`--proxy-bypass-list=${proxyOption.bypass}`);
  }
  // Strip Puppeteer's --enable-automation unless the caller took over ignoreDefaultArgs.
  const ida = ignoreDefaultArgs === undefined ? ['--enable-automation'] : ignoreDefaultArgs;
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: prep.binPath,
      headless,
      args: launchArgs,
      env: prep.env,
      defaultViewport: 'defaultViewport' in rest ? rest.defaultViewport : null,
      ignoreDefaultArgs: ida,
      ...rest,
    });
  } catch (e) {
    await throwTranslated(e, prep.statusPath);
  }
  clearStatusFile(prep.statusPath);
  wireProxyAuth(browser, proxyOption);
  browser._capiumSeed = prep.finalSeed;
  return browser;
}

/**
 * Launch with a persistent profile (cookies/localStorage/state persist in userDataDir).
 * Puppeteer has no separate persistent-context API -- it's launch() + userDataDir.
 * Returns the Browser.
 */
async function launchPersistentContext(userDataDir, opts = {}) {
  return launch({ ...opts, userDataDir });
}

/** Size a modest windowed browser that fits within the seed's spoofed screen. */
async function fitWindow(browser, page) {
  try {
    const scr = await page.evaluate(() => ({ w: screen.availWidth, h: screen.availHeight }));
    if (!scr || !scr.w || !scr.h) return;
    const aw = Math.trunc(scr.w);
    const ah = Math.trunc(scr.h);
    const w = Math.min(aw, 1440);
    const h = Math.min(ah, 900);
    const left = Math.max(0, Math.floor((aw - w) / 5));
    const top = Math.max(0, Math.floor((ah - h) / 6));
    const cdp = await page.createCDPSession();
    const { targetInfo } = await cdp.send('Target.getTargetInfo');
    const { windowId } = await cdp.send('Browser.getWindowForTarget',
      { targetId: targetInfo.targetId });
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { left, top, width: w, height: h, windowState: 'normal' },
    });
    await cdp.detach();
  } catch {}
}

/**
 * Convenience: launch() + first page (optionally navigated to `url`).
 *
 * humanize: true attaches page.humanMove/humanClick/humanType/humanScroll (see lib/human).
 * Returns {browser, page}.
 */
async function launchContext(opts = {}) {
  const { url = null, humanize = false, humanPreset = 'default',
    headless = false, ...rest } = opts;
  const browser = await launch({ headless, ...rest });
  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());
  if (humanize) human.humanize(page, humanPreset);
  if (!headless) await fitWindow(browser, page);
  if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { browser, page };
}

module.exports = { launch, launchContext, launchPersistentContext, fitWindow, buildLaunchOptions };
