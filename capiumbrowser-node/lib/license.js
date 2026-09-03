/**
 * License helpers for the SDK. Enforcement is in the browser binary -- this module
 * only (a) resolves the key/server so we can pass them to the binary and the
 * downloader, and (b) offers a dependency-free `status()` for the CLI.
 * The SDK never holds its own seat (that would double-count one launch as two
 * concurrent sessions). See https://docs.capiumbrowser.com for the full model.
 */
'use strict';

const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { CapiumConfigError, CapiumExpiredError, CapiumServerDownError } = require('./errors');
const { SDK_VERSION } = require('./version');

const DEFAULT_SERVER = 'https://license.capzy.ai';
const USER_AGENT = `capiumbrowser/${SDK_VERSION}`;

function licenseFile() {
  // CAPIUM_LICENSE_FILE is a test/deploy override; the contract path is ~/.capium/license.
  return process.env.CAPIUM_LICENSE_FILE || path.join(os.homedir(), '.capium', 'license');
}

function fromFile() {
  let key = null;
  let server = null;
  let text;
  try {
    text = fs.readFileSync(licenseFile(), 'utf8');
  } catch {
    return { key, server };
  }
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim().toUpperCase();
    const v = line.slice(i + 1).trim();
    if (k === 'KEY' && !key) key = v;
    else if (k === 'SERVER' && !server) server = v;
  }
  return { key, server };
}

/**
 * Resolve from explicit arg then env ONLY (no file). Used to inject into the browser's
 * environment -- if the key lives only in ~/.capium/license the binary reads that file
 * itself, so there's nothing to inject.
 */
function effective(key = null, server = null) {
  return {
    key: key || process.env.CAPIUM_LICENSE_KEY || null,
    server: server || process.env.CAPIUM_LICENSE_SERVER || null,
  };
}

/**
 * Full resolution: arg -> env -> ~/.capium/license, defaulting the server.
 * Throws CapiumConfigError if no key is found. Used by `capiumbrowser status`.
 */
function resolve(key = null, server = null) {
  ({ key, server } = effective(key, server));
  if (!key || !server) {
    const f = fromFile();
    key = key || f.key;
    server = server || f.server;
  }
  if (!key) {
    throw new CapiumConfigError(
      'no license configured — set CAPIUM_LICENSE_KEY, pass licenseKey: ..., ' +
        'or create ~/.capium/license with a KEY= line');
  }
  return { key, server: (server || DEFAULT_SERVER).replace(/\/+$/, '') };
}

/**
 * Signed headers for an authenticated GET (download / update). The key travels in a header
 * (over TLS), never in the URL; the request target is HMAC-signed -- same scheme as the
 * licensing calls. `pathAndQuery` is exactly "<path>?<query>".
 */
function getHeaders(key, pathAndQuery) {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', key).update(`${ts}.${pathAndQuery}`).digest('hex');
  return { 'X-Capzy-License': key, 'X-Capzy-Timestamp': ts, 'X-Capzy-Signature': sig };
}

/**
 * Full environment for the browser subprocess: the current env plus any explicitly-resolved
 * license vars (so a key passed to launch() reaches the self-licensing binary without ever
 * touching argv / `ps`).
 */
function childEnv(key = null, server = null) {
  const { key: k, server: s } = effective(key, server);
  const env = { ...process.env };
  if (k) env.CAPIUM_LICENSE_KEY = k;
  if (s) env.CAPIUM_LICENSE_SERVER = s;
  return env;
}

function machineId() {
  let raw = null;
  if (process.platform === 'linux') {
    for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      try {
        raw = fs.readFileSync(p, 'utf8').trim();
        if (raw) break;
      } catch {}
    }
  } else if (process.platform === 'darwin') {
    try {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const line of out.split('\n')) {
        if (line.includes('IOPlatformUUID')) {
          const parts = line.split('"');
          raw = parts[parts.length - 2];
          break;
        }
      }
    } catch {}
  } else if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', [
        'query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid',
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
      if (m) raw = m[1];
    } catch {}
  }
  return raw || os.hostname();
}

function osName() {
  return process.platform === 'win32' ? 'windows'
    : process.platform === 'darwin' ? 'macos' : 'linux';
}

/**
 * Read license entitlements (plan, sessions_cap, live_sessions, period_end).
 *
 * Signs a read-only `activate` with the license-key HMAC using a status-scoped device
 * fingerprint + a throwaway public key, so it never disturbs a running browser's real
 * device enrollment and never consumes a session slot.
 */
async function status(key = null, server = null) {
  ({ key, server } = resolve(key, server));
  const fp = crypto.createHash('sha256').update('capium-status:' + machineId()).digest('hex');
  const body = JSON.stringify({
    license_key: key,
    device_fp: fp,
    hostname: os.hostname().slice(0, 100),
    os: osName(),
    arch: 'x64',
    device_pubkey: crypto.randomBytes(32).toString('base64'),
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', key).update(`${ts}.${body}`).digest('hex');
  let res;
  try {
    res = await fetch(server + '/v1/activate', {
      method: 'POST',
      body,
      headers: {
        'X-Capzy-Timestamp': ts,
        'X-Capzy-Device-Fp': fp,
        'X-Capzy-Signature': sig,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    throw new CapiumServerDownError(`license server unreachable at ${server} (${e.message || e})`);
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new CapiumExpiredError(
        `license rejected (${res.status}) — expired, revoked, or invalid key`);
    }
    throw new CapiumServerDownError(`status failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  const out = {};
  for (const f of ['plan', 'sessions_cap', 'live_sessions', 'period_end', 'heartbeat_every']) {
    out[f] = data[f] !== undefined ? data[f] : null;
  }
  return out;
}

/**
 * Instant, OFFLINE no-key gate: resolve() throws CapiumConfigError if no key is set in
 * arg/env/~/.capium/license, so "you forgot the license" surfaces as a typed error BEFORE
 * a browser is spun up instead of an opaque driver "browser closed" crash.
 *
 * Deliberately does NOT hit the server. The browser binary is the SINGLE network verifier
 * (activate -> session -> heartbeat); duplicating that with an SDK-side check would double
 * the load on the licensing service. Expired / revoked / seat-limit / server-down all come
 * back from the binary's one check and are surfaced from its status file via
 * errors.readLaunchStatus -- no second round-trip.
 */
function preflight(key = null, server = null) {
  resolve(key, server); // -> CapiumConfigError when no key is configured
}

module.exports = {
  DEFAULT_SERVER,
  effective,
  resolve,
  getHeaders,
  childEnv,
  status,
  preflight,
  _fromFile: fromFile,
  _licenseFile: licenseFile,
  _machineId: machineId,
};
