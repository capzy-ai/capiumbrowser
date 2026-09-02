/**
 * launch-common -- driver-agnostic pieces of a Capium launch, shared by the Playwright and
 * Puppeteer front-ends: flag assembly, geoip tri-state, and the license status file.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('./config');
const proxy = require('./proxy');

/**
 * Build [--proxy-server, --geoip] flags for geo coherence.
 *
 * The binary's CapiumGeoipResolver runs at PreBrowserStart ONLY when --geoip is present. A
 * proxy on its own does NOT trigger it: the lookup is a synchronous, blocking round-trip that
 * would otherwise add up to 2.5s to every proxied launch. When it does run it resolves the
 * egress IP (proxy exit, else the host's real public IP) and pins WebRTC / timezone /
 * geolocation / language -- so the SDK adds no probe of its own. geoipOn is tri-state:
 *   * null  -> default: add no flag, so NO geo lookup runs (no launch latency) even with a
 *              proxy. Pass geoip: true to opt into proxy-exit coherence.
 *   * true  -> ON with --geoip (resolves the egress -- proxy exit, or the host IP if proxyless).
 *   * false -> OFF with --geoip=false, which the binary honors FIRST (explicit opt-out).
 * Returns {launchOptions, args}.
 */
function proxyAndGeoArgs(spec, geoipOn) {
  const { launchOptions, args } = proxy.resolveProxyConfig(spec);
  const out = [...args];
  if (geoipOn === null || geoipOn === undefined) {
    // default: no flag, no lookup
  } else if (geoipOn) {
    out.push('--geoip');
  } else {
    out.push('--geoip=false');
  }
  return { launchOptions, args: out };
}

function buildArgs({ seed, platform, stealthArgs, timezone, locale, extensionPaths, extra }) {
  let args = [];
  if (stealthArgs) args = args.concat(config.getDefaultStealthArgs(seed, platform));
  if (timezone) args.push(`--timezone=${timezone}`); // capium in-binary tz spoof
  if (locale) {
    args.push(`--lang=${locale}`);
    args.push(`--accept-lang=${locale}`);
  }
  if (extensionPaths) {
    const paths = Array.isArray(extensionPaths) ? extensionPaths : [extensionPaths];
    const joined = paths.join(',');
    args.push(`--disable-extensions-except=${joined}`);
    args.push(`--load-extension=${joined}`);
  }
  if (extra) args = args.concat(extra);
  return args;
}

/**
 * Create a unique empty file and point the browser at it via CAPIUM_LICENSE_STATUS_FILE.
 * On a license fail-closed the binary writes "<code>\n<message>" here, so the SDK throws a
 * precise error from the binary's OWN single verification -- no second server call. A unique
 * file per launch keeps concurrent launches (a fleet) from clobbering each other; an old
 * binary that doesn't write it just leaves it empty -> readLaunchStatus null -> stderr
 * fallback.
 */
function newStatusFile(env) {
  const p = path.join(os.tmpdir(),
    `capium-lic-${crypto.randomBytes(6).toString('hex')}.err`);
  fs.writeFileSync(p, '');
  env.CAPIUM_LICENSE_STATUS_FILE = p;
  return p;
}

function clearStatusFile(p) {
  try {
    fs.rmSync(p, { force: true });
  } catch {}
}

module.exports = { proxyAndGeoArgs, buildArgs, newStatusFile, clearStatusFile };
