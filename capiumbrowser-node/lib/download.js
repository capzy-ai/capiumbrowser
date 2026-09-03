/**
 * download -- fetch/extract the per-platform Capium binary if it isn't already present.
 *
 * The Node SDK and the browser binary are decoupled: update playwright-core/puppeteer-core with
 * npm, and fetch the matching Capium build separately. If the launch target isn't found locally,
 * ensureBinary() downloads the per-platform tarball and extracts it under ~/.capium (CAPIUM_HOME
 * overrides).
 *
 * Download scheme (signed, path-based):
 *     GET {server}/download/distro/chromium-v{version}/capiumbrowser-{os}-{arch}.tar.gz
 *
 * The license key travels in the X-Capzy-License header (over TLS), NEVER in the URL; the
 * request PATH is HMAC-signed (X-Capzy-Timestamp + X-Capzy-Signature =
 * HMAC-SHA256(key, "<ts>.<path>")) -- the same scheme as the licensing calls. The response's
 * X-Capzy-SHA256 is verified against the downloaded bytes before anything is extracted.
 *
 * The archive FILENAME is version-independent -- `capiumbrowser-<os>-<arch>.tar.gz` is always
 * the same; only the `chromium-v<version>/` folder changes.
 *
 * Source resolution (first that works):
 *     CAPIUM_BINARY            -> use this exact launch target, no download
 *     CAPIUM_DOWNLOAD_URL      -> a direct .tar.gz URL (may contain {platform}/{version}); unsigned escape hatch
 *     license server           -> the signed GET above
 *
 * Supported platforms (the four capium publishes):
 *     linux-x64   linux-arm64   windows-x64   macos-arm64
 * Anything else (macOS Intel, Windows ARM, ...) throws a clear CapiumError.
 */
'use strict';

const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable, Transform } = require('stream');

const tar = require('tar');

const config = require('./config');
const license = require('./license');
const { CapiumError, CapiumExpiredError, CapiumServerDownError } = require('./errors');
const { SDK_VERSION, binaryVersionFor, isPublished } = require('./version');

const NET_TIMEOUT_MS = 300000;
const USER_AGENT = `capiumbrowser/${SDK_VERSION}`;

// (normalized os, normalized arch) -> distro tag used in the filename/URL.
const SUPPORTED = {
  'linux/x64': 'linux-x64',
  'linux/arm64': 'linux-arm64',
  'windows/x64': 'windows-x64',
  'macos/arm64': 'macos-arm64',
};

function normOs(sysname) {
  const s = String(sysname).toLowerCase();
  if (s === 'darwin') return 'macos';
  if (s === 'windows' || s === 'win32') return 'windows';
  return 'linux';
}

function normArch(mach) {
  const m = String(mach).toLowerCase();
  if (['x86_64', 'amd64', 'x64'].includes(m)) return 'x64';
  if (['arm64', 'aarch64'].includes(m)) return 'arm64';
  return m;
}

/**
 * The distro tag for THIS host -- one of linux-x64, linux-arm64, windows-x64, macos-arm64.
 *
 * Throws CapiumError for a platform capium doesn't publish (e.g. macOS Intel, Windows ARM).
 */
function downloadTag(system = null, machine = null) {
  const os_ = normOs(system || process.platform);
  const arch = normArch(machine || os.arch());
  const tag = SUPPORTED[`${os_}/${arch}`];
  if (!tag) {
    throw new CapiumError(
      `capium has no build for this platform: ${os_}/${arch} ` +
        `(${system || process.platform} ${machine || os.arch()}). ` +
        `Supported: ${Object.values(SUPPORTED).sort().join(', ')}.`);
  }
  return tag;
}

/**
 * The signed request path for a build: version in the folder, tag in the filename
 * (`/download/distro/chromium-v<version>/capiumbrowser-<tag>.tar.gz`). Per-OS versions work
 * because each tag lives under its own chromium-v<version>/ folder (win/mac .65 while linux
 * is .64). Key travels in the X-Capzy-License header, the path is HMAC-signed, and the bytes
 * are verified against the response's X-Capzy-SHA256.
 */
function distroPath(version, tag) {
  return `/download/distro/chromium-v${version}/capiumbrowser-${tag}.tar.gz`;
}

// ---- extraction ------------------------------------------------------------------------------

/** Where extracted distros live: CAPIUM_HOME, else ~/.capium (survives an npm reinstall). */
function destRoot() {
  return process.env.CAPIUM_HOME || path.join(os.homedir(), '.capium');
}

/**
 * Extract a distro archive, sniffing gzip/zip/tar so the server can ship any of them.
 *
 * Extracts into a scratch dir first, then normalizes: a single-top archive (the tar layout,
 * e.g. `capium-152-linux-x64/...`) lands as `root/<thatdir>`; a FLAT archive (a Windows tar
 * whose `chrome.exe` / `locales/` sit at the root) is wrapped into `root/<subdir>` so it
 * stays discoverable. Returns the extracted distro directory.
 */
async function extract(archivePath, root, subdir) {
  const magic = Buffer.alloc(4);
  const fd = fs.openSync(archivePath, 'r');
  try {
    fs.readSync(fd, magic, 0, 4, 0);
  } finally {
    fs.closeSync(fd);
  }
  const scratch = fs.mkdtempSync(path.join(root, '.capium-extract-'));
  try {
    if (magic[0] === 0x50 && magic[1] === 0x4b && magic[2] === 0x03 && magic[3] === 0x04) {
      // zip: no zip support in the `tar` package -- use the system bsdtar (ships with
      // Windows 10+/macOS; on Linux the server contract is tar.gz so this path is rare).
      try {
        execFileSync('tar', ['-xf', archivePath, '-C', scratch], { stdio: 'ignore' });
      } catch (e) {
        throw new CapiumError(
          `the server sent a zip archive but this host's \`tar\` could not extract it (${e.message}). ` +
            'Install bsdtar/unzip or set CAPIUM_DOWNLOAD_URL to a .tar.gz build.');
      }
    } else {
      // gzip / plain tar -- the tar package sniffs compression itself.
      await tar.x({ file: archivePath, cwd: scratch });
    }
    const entries = fs.readdirSync(scratch);
    if (entries.length === 1 &&
        fs.statSync(path.join(scratch, entries[0])).isDirectory()) {
      // single top-level dir: the archive carries its own capium-*/ folder
      const target = path.join(root, entries[0]);
      fs.rmSync(target, { recursive: true, force: true });
      fs.renameSync(path.join(scratch, entries[0]), target);
      return target;
    }
    // flat archive: wrap it so discovery (capium-*/ glob) still finds it
    const target = path.join(root, subdir);
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(scratch, target);
    return target;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

const MARKER = '.capium-build';

/**
 * Read the build version stamped next to an installed binary, or null (an old install
 * from before version-stamping, which we treat as 'unknown' -> upgrade it).
 */
function readInstalledVersion(binPath) {
  try {
    return fs.readFileSync(path.join(path.dirname(binPath), MARKER), 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * Public: the stamped build version of the installed capium binary, or null if it isn't
 * installed / wasn't version-stamped. `binPath` defaults to the discovered binary.
 */
function installedVersion(binPath = null) {
  if (binPath === null) {
    try {
      binPath = config.findBinary();
    } catch {
      return null;
    }
  }
  return readInstalledVersion(binPath);
}

function stampVersion(binPath, version) {
  try {
    fs.writeFileSync(path.join(path.dirname(binPath), MARKER), String(version));
  } catch {}
}

/**
 * Delete previously-extracted capium distros under `root`. A host only ever holds its own
 * platform's build, so on a version change we drop the stale one before installing the new
 * one ('old removed, new downloaded'). Never touches CAPIUM_BINARY / PATH targets outside
 * `root`.
 */
function removeInstalls(root) {
  let names;
  try {
    names = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const n of names) {
    if (!n.startsWith('capium-')) continue;
    const d = path.join(root, n);
    try {
      if (fs.statSync(d).isDirectory()) fs.rmSync(d, { recursive: true, force: true });
    } catch {}
  }
}

// ---- download --------------------------------------------------------------------------------

/**
 * Stream `url` to `dest`, mapping transport failures to typed errors and verifying the
 * server's X-Capzy-SHA256 against the bytes. Returns the hex sha256.
 */
async function download(url, headers, dest, version, tag) {
  let res;
  // Identify the SDK on every request. undici otherwise sends a default UA that Cloudflare's
  // Browser Integrity Check rejects as a bot (403) before the request reaches the origin. A
  // stable product UA is both correct hygiene and what the edge allows.
  const h = Object.assign({ 'User-Agent': USER_AGENT }, headers || {});
  try {
    res = await fetch(url, { headers: h, signal: AbortSignal.timeout(NET_TIMEOUT_MS) });
  } catch (e) {
    throw new CapiumServerDownError(
      `could not reach the download server ${url}: ${e.cause?.message || e.message || e}`);
  }
  if (!res.ok) {
    if (res.status === 404) {
      throw new CapiumError(
        `no capium build published for version ${version} on ${tag} (HTTP 404). Check ` +
          'CAPIUM_VERSION, or that this platform/version is published.');
    }
    if (res.status === 401 || res.status === 403) {
      throw new CapiumExpiredError(
        `license rejected while downloading (HTTP ${res.status}) -- expired, revoked, or ` +
          'invalid key. Run `npx capiumbrowser status` to check.');
    }
    throw new CapiumServerDownError(`download failed: HTTP ${res.status} from ${url}`);
  }
  const expected = res.headers.get('x-capzy-sha256');
  const hash = crypto.createHash('sha256');
  const hasher = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), hasher, fs.createWriteStream(dest));
  const got = hash.digest('hex').toLowerCase();
  if (expected && got !== expected.toLowerCase()) {
    throw new CapiumError(
      'capium download failed its integrity check (sha256 mismatch): expected ' +
        `${expected.toLowerCase()}, got ${got} (corrupted or tampered download).`);
  }
  return got;
}

/**
 * Return the path to the capium launch target, downloading + extracting the per-platform
 * build if it isn't already present.
 *
 * Throws:
 *     CapiumError          -- unsupported platform, version/platform not published (404), or a
 *                             sha256 integrity failure.
 *     CapiumConfigError    -- no license key configured and no other source (from resolve()).
 *     CapiumExpiredError   -- the license was rejected (401/403).
 *     CapiumServerDownError-- the download server was unreachable / 5xx.
 */
async function ensureBinary({ version = null, licenseKey = null, server = null } = {}) {
  // An explicit CAPIUM_BINARY path always wins -- it's the caller's choice, no version check.
  if (process.env.CAPIUM_BINARY) return config.findBinary();

  // Resolve the host's distro tag first: the default binary version is per-OS (each OS reaches
  // a stable build independently), so we can't pick a default until we know which tag we're on.
  const tag = downloadTag();

  // If the manifest declares this OS but hasn't marked it published, say so plainly instead of
  // letting the download 404. An explicit CAPIUM_VERSION means the caller knows a build exists,
  // so we don't gate that path.
  if (!version && !process.env.CAPIUM_VERSION && !isPublished(tag)) {
    throw new CapiumError(
      `capium has no stable build published for ${tag} yet (declared but not yet released). ` +
        'Set CAPIUM_VERSION to pin a specific build if one exists.');
  }

  version = version || process.env.CAPIUM_VERSION || binaryVersionFor(tag);

  // Reuse the cached binary ONLY if it's already the target version. A different (older)
  // version -- e.g. after `npm install capiumbrowser@latest` bumps this OS's pinned build --
  // falls through to fetch the new build and drop the old one.
  try {
    const existing = config.findBinary();
    if (readInstalledVersion(existing) === version) return existing;
  } catch {}

  let url;
  let headers = null;
  const direct = process.env.CAPIUM_DOWNLOAD_URL;
  if (direct) {
    url = direct.replaceAll('{platform}', tag).replaceAll('{version}', version);
  } else {
    // Signed path-based download: key in a header, PATH HMAC-signed, sha256-verified.
    const { key, server: srv } = license.resolve(licenseKey, server); // -> CapiumConfigError if no key
    const p = distroPath(version, tag);
    url = srv + p;
    headers = license.getHeaders(key, p);
  }

  const root = destRoot();
  fs.mkdirSync(root, { recursive: true });
  const subdir = `capium-${String(version).split('.')[0]}-${tag}`; // FLAT-archive wrapper name
  const tmp = path.join(os.tmpdir(),
    `capium-dl-${crypto.randomBytes(6).toString('hex')}.tar.gz`);
  try {
    await download(url, headers, tmp, version, tag);
    // Only drop the stale install once the new bytes are in hand (a failed download must
    // never leave the host with no binary), then extract the new version.
    removeInstalls(root);
    const distroDir = await extract(tmp, root, subdir);
    // Stamp the version marker BEFORE discovery: the FLAT Windows tar carries no capium
    // marker files, and findBinary only accepts a bare chrome.exe next to one -- the
    // downloader vouches for the directory it just extracted.
    try {
      fs.writeFileSync(path.join(distroDir, MARKER), String(version));
    } catch {}
  } finally {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {}
  }

  let binPath;
  try {
    binPath = config.findBinary();
  } catch {
    throw new CapiumError(
      `downloaded and extracted the ${tag} build but no launch target was found afterwards ` +
        `(unexpected archive layout under ${root}).`);
  }
  stampVersion(binPath, version); // so a later version bump knows to re-download
  // Re-apply exec bits the wrapper + engine binaries need (zip drops unix perms).
  if (process.platform !== 'win32') {
    for (const p of [binPath, path.join(path.dirname(binPath), 'chrome')]) {
      try {
        fs.chmodSync(p, 0o755);
      } catch {}
    }
  }
  return binPath;
}

module.exports = {
  downloadTag,
  distroPath,
  destRoot,
  ensureBinary,
  installedVersion,
  _SUPPORTED: SUPPORTED,
  _normOs: normOs,
  _normArch: normArch,
  _extract: extract,
  _removeInstalls: removeInstalls,
  _readInstalledVersion: readInstalledVersion,
  _stampVersion: stampVersion,
  _download: download,
};
