/**
 * Typed errors, chiefly for licensing.
 *
 * Enforcement lives in the browser binary; when it refuses to start it prints a
 * `[capium-license] ...` line to stderr and exits with a coded status. Playwright's /
 * Puppeteer's native launch surfaces that stderr inside its own launch error --
 * `translateLaunchError` turns it into a precise, actionable capium exception.
 */
'use strict';

const fs = require('fs');

/** Base class for capium SDK errors. */
class CapiumError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** The browser refused to start for a licensing reason. */
class CapiumLicenseError extends CapiumError {}

/** No license key configured. */
class CapiumConfigError extends CapiumLicenseError {}

/** Concurrent session limit reached across the owner's machines. */
class CapiumSeatLimitError extends CapiumLicenseError {}

/** License expired, revoked, or the key is invalid. */
class CapiumExpiredError extends CapiumLicenseError {}

/** License service unreachable and no valid offline grace. */
class CapiumServerDownError extends CapiumLicenseError {}

function clean(msg) {
  // Pull the '[capium-license] ...' line out of a noisy launch error, if present.
  for (const line of String(msg).split(/\r?\n/)) {
    if (line.includes('[capium-license]')) {
      return line.split('[capium-license]')[1].trim();
    }
  }
  return String(msg).trim();
}

/**
 * Map a driver launch failure to a typed license error when the browser's fail-closed
 * stderr is recognizable. Returns a new error to throw, or null if this isn't a
 * licensing failure (caller should re-throw the original).
 */
function translateLaunchError(err) {
  const low = String(err && err.message ? err.message : err).toLowerCase();
  if (!low.includes('capium-license') && !low.includes('no license configured')) return null;
  const hint = clean(err && err.message ? err.message : err);
  if (low.includes('no license configured')) {
    return new CapiumConfigError(
      `${hint}\nSet CAPIUM_LICENSE_KEY, pass licenseKey: ..., or create ` +
        '~/.capium/license (KEY=). Run `npx capiumbrowser status` to check.');
  }
  if (low.includes('session limit') || low.includes('concurrent session')) {
    return new CapiumSeatLimitError(`${hint} — close another Capium browser and retry.`);
  }
  if (low.includes('rejected') || low.includes('expired') || low.includes('revoked')) {
    return new CapiumExpiredError(hint);
  }
  if (low.includes('unreachable') || low.includes('offline grace')) {
    return new CapiumServerDownError(hint);
  }
  return new CapiumLicenseError(hint);
}

// Exit codes written by the binary's fail-closed path (capium_license_main_extra_parts.cc).
const STATUS_CODES = {
  2: CapiumConfigError, // kExitNoLicense
  3: CapiumSeatLimitError, // kExitSeatLimit
  4: CapiumExpiredError, // kExitExpired (expired / revoked / bad key)
  5: CapiumServerDownError, // kExitServerDown
};

/**
 * Turn the binary's fail-closed status file into a typed error, or null.
 *
 * On a licensing fail-closed the binary writes "<exit_code>\n<message>" to the path the SDK
 * handed it via CAPIUM_LICENSE_STATUS_FILE. Reading THAT is how we surface a precise error
 * from the binary's OWN single verification -- no second server call, and reliable where the
 * driver's stderr relay (translateLaunchError) isn't. Returns null when the file is
 * absent/empty (old binary that doesn't write it -> stderr fallback).
 */
function readLaunchStatus(statusPath) {
  let raw;
  try {
    raw = fs.readFileSync(statusPath, 'utf8');
  } catch {
    return null;
  }
  if (!raw.trim()) return null;
  const nl = raw.indexOf('\n');
  const code = (nl === -1 ? raw : raw.slice(0, nl)).trim();
  const msg = (nl === -1 ? '' : raw.slice(nl + 1)).trim() ||
    'the browser refused to start for a licensing reason';
  const Cls = STATUS_CODES[code] || CapiumLicenseError;
  return new Cls(msg);
}

module.exports = {
  CapiumError,
  CapiumLicenseError,
  CapiumConfigError,
  CapiumSeatLimitError,
  CapiumExpiredError,
  CapiumServerDownError,
  translateLaunchError,
  readLaunchStatus,
};
