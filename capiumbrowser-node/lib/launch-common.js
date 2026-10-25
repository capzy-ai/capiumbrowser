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
 * The binary's CapiumGeoipResolver runs at PreBrowserStart ONLY when --geoip is present.
 * When it runs it resolves the egress IP (proxy exit, else the host's real public IP) and
 * pins WebRTC / timezone / geolocation / language -- so the SDK adds no probe of its own.
 * geoipOn is tri-state:
 *   * null  -> default: ON whenever a proxy is set, OFF otherwise. An uncorrected host
 *              timezone under a proxied identity (UTC on a server, or the operator's home
 *              zone against a foreign exit) is a far stronger detection signal than the
 *              lookup's one-off launch latency. Pass geoip: false to opt out.
 *   * true  -> ON with --geoip (resolves the egress -- proxy exit, or the host IP if proxyless).
 *   * false -> OFF with --geoip=false, which the binary honors FIRST (explicit opt-out).
 * Returns {launchOptions, args}.
 */
function proxyAndGeoArgs(spec, geoipOn) {
  const { launchOptions, args } = proxy.resolveProxyConfig(spec);
  const out = [...args];
  const explicitOff = geoipOn === false;
  if (geoipOn === null || geoipOn === undefined) geoipOn = Boolean(spec);
  if (geoipOn) {
    out.push('--geoip');
  } else if (explicitOff) {
    out.push('--geoip=false');
  }
  return { launchOptions, args: out };
}

function buildArgs({ seed, platform, stealthArgs, timezone, locale, extensionPaths, extra,
  headless = false, mobileDevice = null, browserBrand = null }) {
  let args = [];
  if (stealthArgs) {
    args = args.concat(config.getDefaultStealthArgs(seed, platform, null, mobileDevice, browserBrand));
    // Keep the engine's seeded screen. Use initial window bounds only when
    // the caller has not provided screen/window flags.
    if (headless && !['android', 'ios'].includes(platform) && !config.hasScreenOverride(extra)) {
      args = args.concat(config.getHeadlessDefaultArgs());
    }
  }
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

/**
 * Deterministic per-seed window geometry inside the seed's available screen area.
 *
 * Every profile previously got the identical maximized-like window (exactly availWidth x
 * availHeight at 0,0), so all profiles sharing a pool screen were geometry-identical -- a
 * clusterable signature. Real users are a mix: most keep the browser maximized, a minority
 * run a windowed browser at an arbitrary size/position. Mirror that mix deterministically
 * per seed (the geometry is part of the profile's stable identity, like its screen).
 * Matches python browser._window_bounds_for_seed.
 */
function windowBoundsForSeed(seed, aw, ah) {
  const d = crypto.createHash('sha256')
    .update(`capium-window:${Math.trunc(seed) || 0}`).digest();
  if (d[0] % 10 < 6) return { left: 0, top: 0, width: aw, height: ah };
  const w = Math.max(800, Math.trunc(aw * (0.78 + (d[1] / 255) * 0.16)));
  const h = Math.max(600, Math.trunc(ah * (0.80 + (d[2] / 255) * 0.15)));
  const left = Math.trunc(((aw - w) * d[3]) / 255);
  const top = Math.trunc(((ah - h) * d[4]) / 255);
  return { left, top, width: w, height: h };
}

module.exports = { proxyAndGeoArgs, buildArgs, newStatusFile, clearStatusFile, windowBoundsForSeed };
