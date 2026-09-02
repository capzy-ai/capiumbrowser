/**
 * config -- default stealth arguments and binary discovery.
 *
 * The capium binary is driven through its `capium` bash wrapper (executablePath), which
 * adds the GL/Metal backend, geoip, font, bluetooth/share and storage-quota flags per platform.
 * This module only builds the *fingerprint-level* Chrome flags and locates that wrapper.
 *
 * Design note (why no stealth plugin): capium's own source patches make a vanilla driver
 * stealthy --
 *   001 (disable Runtime.enable console-reporting)  -> FingerprintJS developer_tools = false
 *   009 (webdriver)                                 -> navigator.webdriver = false
 * so we launch with plain Playwright / Puppeteer and let the binary do the CDP hardening.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Return the default per-launch fingerprint flags.
 *
 * seed:     int identity seed (a stable, coherent device per seed). Random if null.
 * platform: "windows" | "macos" | "linux" -- the spoofed OS persona.
 * screen:   [width, height] for the spoofed screen AND the browser window, kept
 *           equal so screen == window == viewport. Pass null to skip (rely on the
 *           seed's device screen + fitWindow; only coherent on a real display).
 */
function getDefaultStealthArgs(seed = null, platform = 'windows', screen = [1440, 900]) {
  const args = [];
  if (seed !== null && seed !== undefined) {
    const s = Math.trunc(Number(seed));
    args.push(`--fingerprint=${s}`);
    if (platform) args.push(`--fingerprint-platform=${platform}`);
    // Storage quota: navigator.storage.estimate().quota otherwise reports the real
    // host disk -- a VM/fingerprint tell (e.g. a 10 GB container), and on Windows it
    // is UNSPOOFED because no bash wrapper runs there (chrome.exe is launched direct).
    // Emit the SAME per-seed 128-576 GB SSD-like value the POSIX `capium` wrapper
    // derives, so the quota is spoofed coherently on EVERY platform. On Linux/macOS the
    // wrapper sees this flag (HAVE_QUOTA=1) and defers to it rather than adding its own.
    args.push(`--fingerprint-storage-quota=${128 + (s % 8) * 64}`);
  }
  args.push(
    // Allow third-party cookies (reCAPTCHA/login flows need them). capium blocks 3p cookies
    // by DEFAULT (fpc sets CookieControlsMode=kBlockThirdParty); --fingerprint-allow-3p-cookies
    // is the WIRED switch that sets CookieControlsMode=kOff (verified in cookie_settings.cc).
    // We keep --disable-features=TrackingProtection3pcd too (belt-and-suspenders / other path).
    '--fingerprint-allow-3p-cookies',
    '--disable-features=TrackingProtection3pcd',
    // present a desktop mouse (fine pointer + hover), not a touch device
    '--blink-settings=primaryHoverType=2,availableHoverTypes=2,' +
      'primaryPointerType=4,availablePointerTypes=4',
    '--no-first-run',
    '--no-default-browser-check',
  );
  // Patch 001 makes developer_tools always false, which unmasks FingerprintJS's
  // tampering ML: per-seed canvas/audio NOISE would then read as tampering, so
  // default it OFF (measured clean: tampering=false, ml~0.05, anti_detect=false).
  // Trade-off: personas on the same host share its real canvas (no per-seed canvas
  // uniqueness) -- pass --fingerprint-noise=true to restore it (accepts tampering).
  args.push('--fingerprint-noise=false');
  // A Windows persona's font metrics must match real Windows (needs Windows fonts
  // present on the host); harmless elsewhere, so gate it to the windows persona.
  if (platform === 'windows') args.push('--fingerprint-windows-font-metrics');
  // Screen/viewport coherence: in a headless container the persona's seed-derived
  // screen (e.g. 2560x1080) mismatches the actual small browser viewport (e.g.
  // 945x939) -- browserscan flags "screen dimensions don't match viewport" as a
  // virtual machine. Pin the spoofed screen to a window we also size, so
  // screen == window == viewport in every environment (headless/container too),
  // since the --window-size flag applies at launch without a window manager.
  if (screen) {
    const sw = Math.trunc(Number(screen[0]));
    const sh = Math.trunc(Number(screen[1]));
    args.push(`--window-size=${sw},${sh}`);
    args.push(`--fingerprint-screen-width=${sw}`);
    args.push(`--fingerprint-screen-height=${sh}`);
  }
  return args;
}

/** A fresh random identity seed. */
function newSeed() {
  return 1 + Math.floor(Math.random() * (2 ** 31 - 2));
}

// ---- binary / wrapper discovery -------------------------------------------------------------
// The launch target (handed to the driver as executablePath) differs by OS:
//   * POSIX (Linux/macOS): the `capium` bash wrapper -- it adds the GL/geoip/font flags and
//     execs the real `chrome` engine beside it.
//   * Windows: no wrapper ships; `chrome.exe` is launched directly (the persona flags the SDK
//     passes are enough, and WebGL uses the host GPU).
// Distros extract as a `capium-<version>-<platform>/` directory (tar) or, on Windows, flat --
// the downloader normalizes both into a `capium-*` directory, and discovery GLOBS for those
// rather than pinning version numbers, so a new Chromium version needs no code change here.
//
// npm note: node_modules is volatile (a reinstall wipes it), so unlike the pip SDK the default
// install root is ~/.capium (CAPIUM_HOME overrides). The package dirs are still searched so a
// vendored distro next to the package keeps working.

// The engine binaries the wrapper spawns; they need +x alongside the wrapper itself.
const EXEC_SIBLINGS = ['chrome', 'chrome_crashpad_handler', 'chrome_sandbox', 'chrome-sandbox'];

function wrapperNames() {
  // Launch-target filenames to look for, in priority order, for this OS.
  if (process.platform === 'win32') return ['capium.exe', 'capium.bat', 'capium', 'chrome.exe'];
  return ['capium'];
}

/**
 * True if `d` holds a capium distro (marker files present), so a generic `chrome.exe`
 * found there is ours and not an unrelated system Chrome install.
 */
function isCapiumDir(d) {
  const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
  const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  // .capium-build is the downloader's own version stamp: the Windows distro tar is FLAT
  // (chrome.exe at the root, no capium_fonts/BUILD_INFO inside), so the download layer marks
  // the directory it extracted and discovery trusts that mark.
  return isDir(path.join(d, 'capium_fonts')) || isFile(path.join(d, 'BUILD_INFO.txt')) ||
    isFile(path.join(d, '.capium-build'));
}

/**
 * Best-effort `chmod +x` on the wrapper and the engine binaries it spawns (POSIX only).
 *
 * Vendoring the distro through git-on-Windows, a .zip, an npm package, or a Docker COPY
 * routinely strips the Unix execute bit -- which makes the driver fail to launch with the
 * opaque `spawn <path> EACCES`. Self-heal it so a dropped permission bit isn't a hard stop.
 * Returns true if `binPath` is executable afterwards. No-op on Windows (no +x concept).
 */
function ensureExecutable(binPath) {
  if (process.platform === 'win32') return true;
  const d = path.dirname(binPath);
  for (const t of [binPath, ...EXEC_SIBLINGS.map((s) => path.join(d, s))]) {
    try {
      const st = fs.statSync(t);
      if (st.isFile()) fs.chmodSync(t, st.mode | 0o111); // +x for user/group/other
    } catch {}
  }
  try {
    fs.accessSync(binPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function isExecutable(p) {
  if (process.platform === 'win32') return true;
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Directories under which distros are searched / installed (in priority order). */
function searchBases() {
  const bases = [];
  if (process.env.CAPIUM_HOME) bases.push(process.env.CAPIUM_HOME);
  bases.push(path.join(os.homedir(), '.capium')); // default install root (survives npm i)
  const here = __dirname; // <pkg>/lib
  bases.push(path.dirname(path.dirname(here))); // node_modules (package parent)
  bases.push(path.dirname(here)); // the package dir itself
  bases.push(process.cwd());
  return bases;
}

function capiumDirsUnder(base) {
  // Extracted distro dirs `capium-*/` under base, newest name first (mirrors the glob sort).
  try {
    return fs
      .readdirSync(base)
      .filter((n) => n.startsWith('capium-'))
      .sort()
      .reverse()
      .map((n) => path.join(base, n))
      .filter((d) => {
        try {
          return fs.statSync(d).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

function which(name) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.BAT;.CMD').split(';').concat([''])
    : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const p = path.join(dir, name + ext.toLowerCase());
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch {}
      const p2 = path.join(dir, name);
      try {
        if (fs.statSync(p2).isFile()) return p2;
      } catch {}
    }
  }
  return null;
}

/**
 * Locate the capium launch target (handed to the driver as executablePath).
 *
 * Search order: the explicit `binary` arg, then `CAPIUM_BINARY`, then -- under `CAPIUM_HOME`,
 * `~/.capium`, the package's parent, the package dir, and the CWD -- a flat layout
 * (`<base>/<name>`) or any extracted `capium-*` distro directory (newest first), then PATH.
 * On Windows the target is `chrome.exe`, accepted only next to capium marker files so a
 * system Chrome isn't picked up.
 *
 * A candidate that exists but isn't executable is repaired in place (chmod +x) rather than
 * skipped -- a vendored distro losing its execute bit is a deployment slip, not a missing file.
 *
 * Throws (Error.code === 'ENOENT') when nothing is found -- the download layer catches that.
 */
function findBinary(binary = null) {
  const names = wrapperNames();
  // [candidatePath, containingDir] so a bare chrome.exe can be checked for capium markers.
  const cands = [];
  for (const explicit of [binary, process.env.CAPIUM_BINARY]) {
    if (explicit) cands.push([explicit, path.dirname(path.resolve(explicit))]);
  }
  for (const base of searchBases()) {
    for (const nm of names) cands.push([path.join(base, nm), base]); // flat: <base>/<name>
    for (const d of capiumDirsUnder(base)) {
      for (const nm of names) cands.push([path.join(d, nm), d]); // extracted distro dir
    }
  }
  for (const nm of names) {
    // PATH -- wrapper only, never a system chrome.exe
    if (nm.toLowerCase() === 'chrome.exe') continue;
    const onPath = which(nm);
    if (onPath) cands.push([onPath, path.dirname(onPath)]);
  }

  const foundButUnusable = [];
  const seen = new Set();
  for (const [p, baseDir] of cands) {
    if (!p) continue;
    const ap = path.resolve(p);
    if (seen.has(ap)) continue;
    seen.add(ap);
    try {
      if (!fs.statSync(ap).isFile()) continue;
    } catch {
      continue;
    }
    // Guard a bare chrome.exe: only ours if its dir carries capium markers.
    if (path.basename(ap).toLowerCase() === 'chrome.exe' && !isCapiumDir(baseDir)) continue;
    if (ensureExecutable(ap) || isExecutable(ap)) return ap;
    foundButUnusable.push(ap);
  }
  if (foundButUnusable.length) {
    const f = foundButUnusable[0];
    const err = new Error(
      `found the capium binary at ${f} but it is not executable and \`chmod +x\` did not ` +
        `stick. Run \`chmod +x ${f}\` (and the chrome/chrome_crashpad_handler beside it). If it ` +
        'sits on a noexec mount (common in containers), relocate it to an exec-enabled path.');
    err.code = 'EACCES';
    throw err;
  }
  const err = new Error(
    'capium binary not found. Set CAPIUM_BINARY=/path/to/<capium|chrome.exe>, put the distro ' +
      'under CAPIUM_HOME (default ~/.capium) or next to the package, or add it to PATH.');
  err.code = 'ENOENT';
  throw err;
}

module.exports = {
  getDefaultStealthArgs,
  newSeed,
  findBinary,
  searchBases,
  _ensureExecutable: ensureExecutable,
  _isCapiumDir: isCapiumDir,
  _wrapperNames: wrapperNames,
};
