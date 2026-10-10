'use strict';
const catalog = require('./browser-brands.json');
const profiles = new Map(catalog.profiles.map(p => [p.brand, p]));

function normalizeBrand(brand) {
  if (brand === null || brand === undefined) return 'chrome';
  if (typeof brand !== 'string' || !['chrome', ...profiles.keys()].includes(brand.toLowerCase())) {
    throw new Error('browserBrand must be chrome, edge, opera, or vivaldi');
  }
  return brand.toLowerCase();
}

function brandArgs(brand, platform) {
  brand = normalizeBrand(brand);
  if (brand === 'chrome') return [];
  if (!['windows', 'macos', 'linux'].includes(platform)) throw new Error('browserBrand requires a desktop platform');
  return [`--fingerprint-brand=${brand}`];
}

function validateLaunch(brand, platform, binary, extra, stealthArgs) {
  if (!brandArgs(brand, platform).length) return;
  if (!stealthArgs) throw new Error('browserBrand requires stealthArgs: true');
  const conflicts = ['--user-agent', '--fingerprint-brand', '--fingerprint-brand-version', '--fingerprint-platform'];
  if ((extra || []).some(arg => typeof arg === 'string' && conflicts.some(key => arg === key || arg.startsWith(key + '=')))) {
    throw new Error('browserBrand uses the verified catalog; conflicting identity overrides are not supported');
  }
}

async function engineProbe(expected) {
  const h = await navigator.userAgentData?.getHighEntropyValues(['fullVersionList', 'uaFullVersion']);
  if (!h) return false;
  const chromium = expected.chromium_version;
  const product = expected.hint_brand === 'Google Chrome' ? chromium : expected.product_version;
  const expectedBrands = { Chromium: chromium, [expected.hint_brand]: product };
  const full = Object.fromEntries(h.fullVersionList.map(b => [b.brand, b.version]));
  const low = Object.fromEntries(h.brands.map(b => [b.brand, b.version]));
  return h.uaFullVersion === product && h.mobile === false &&
    Object.entries(expectedBrands).every(([brand, version]) => full[brand] === version && low[brand] === version.split('.')[0]) &&
    ['Google Chrome', 'Microsoft Edge', 'Opera', 'Vivaldi', 'Chromium'].every(brand => !(brand in full) || brand in expectedBrands) &&
    navigator.userAgent.includes('Chrome/' + chromium.split('.')[0] + '.0.0.0') &&
    (!expected.ua_suffix || navigator.userAgent.endsWith(expected.ua_suffix + expected.ua_version)) &&
    (expected.brand !== 'vivaldi' || !navigator.userAgent.includes('Vivaldi/'));
}

function profile(brand) { return { ...profiles.get(normalizeBrand(brand)) }; }

async function requireEngine(context, brand) {
  if (normalizeBrand(brand) === 'chrome') return;
  const page = await context.newPage();
  try {
    await page.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }));
    await page.goto('https://capium-desktop-preview.invalid/', { waitUntil: 'domcontentloaded' });
    if (!await page.evaluate(engineProbe, profile(brand))) throw new Error('This binary does not support the verified desktop browser-brand mappings; use Capium 1.2.1 revision 2 or later');
  } finally { await page.close(); }
}

async function requirePuppeteerEngine(browser, brand) {
  if (normalizeBrand(brand) === 'chrome') return;
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', request => request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html>' }));
    await page.goto('https://capium-desktop-preview.invalid/', { waitUntil: 'domcontentloaded' });
    if (!await page.evaluate(engineProbe, profile(brand))) throw new Error('This binary does not support the verified desktop browser-brand mappings; use Capium 1.2.1 revision 2 or later');
  } finally { await page.close(); }
}

module.exports = { normalizeBrand, brandArgs, validateLaunch, profile, engineProbe, requireEngine, requirePuppeteerEngine };
