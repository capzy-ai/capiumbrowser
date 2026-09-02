/**
 * capiumbrowser -- a drop-in stealth browser SDK on top of Playwright or Puppeteer.
 *
 *     # With Playwright
 *     npm install capiumbrowser playwright-core
 *
 *     # With Puppeteer
 *     npm install capiumbrowser puppeteer-core
 *
 *     const { launchContext } = require('capiumbrowser');           // auto-detects the driver
 *     const { launch } = require('capiumbrowser/playwright');       // or pick one explicitly
 *     const { launch } = require('capiumbrowser/puppeteer');
 *
 * The driver (playwright-core / puppeteer-core) is a normal peer dependency, so you update
 * the engine independently: `npm install -U playwright-core`.
 *
 * The browser itself is the Capium stealth Chromium (driven via its `capium` wrapper). No
 * stealth plugin needed -- the binary's own 001/009 patches keep developer_tools/webdriver
 * clean.
 *
 * Docs: https://docs.capiumbrowser.com  ·  Site: https://capiumbrowser.com
 */
'use strict';

const config = require('./lib/config');
const download = require('./lib/download');
const errors = require('./lib/errors');
const human = require('./lib/human');
const license = require('./lib/license');
const proxy = require('./lib/proxy');
const version = require('./lib/version');

function hasModule(name) {
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pick the installed driver front-end: Playwright if playwright-core/playwright is present,
 * else Puppeteer if puppeteer-core/puppeteer is. Throws a clear error when neither is.
 */
function detectDriver() {
  if (hasModule('playwright-core') || hasModule('playwright')) {
    return require('./playwright');
  }
  if (hasModule('puppeteer-core') || hasModule('puppeteer')) {
    return require('./puppeteer');
  }
  throw new errors.CapiumError(
    'no driver installed. Run one of:\n' +
      '  npm install capiumbrowser playwright-core\n' +
      '  npm install capiumbrowser puppeteer-core');
}

// Root-level launchers delegate to whichever driver is installed (Playwright preferred when
// both are). Use require('capiumbrowser/playwright') / require('capiumbrowser/puppeteer')
// to pick one explicitly.
const launch = (opts) => detectDriver().launch(opts);
const launchContext = (opts) => detectDriver().launchContext(opts);
const launchPersistentContext = (userDataDir, opts) =>
  detectDriver().launchPersistentContext(userDataDir, opts);

module.exports = {
  VERSION: version.SDK_VERSION,
  CAPIUM_BINARY_VERSION: version.CAPIUM_BINARY_VERSION,
  CAPIUM_BINARY_VERSIONS: version.CAPIUM_BINARY_VERSIONS,

  launch,
  launchContext,
  launchPersistentContext,
  detectDriver,

  config,
  proxy,
  human,
  download,
  license,
  status: license.status,

  CapiumError: errors.CapiumError,
  CapiumLicenseError: errors.CapiumLicenseError,
  CapiumConfigError: errors.CapiumConfigError,
  CapiumSeatLimitError: errors.CapiumSeatLimitError,
  CapiumExpiredError: errors.CapiumExpiredError,
  CapiumServerDownError: errors.CapiumServerDownError,
};
