/**
 * Version of the capium Node SDK (independent of the browser binary version).
 *
 * The SDK version and the Capium/Chromium binary version move on separate cadences: you update
 * the SDK with `npm install -U capiumbrowser`, and the SDK fetches the *default* binary build to
 * match. Crucially that default is **per platform** -- each OS/arch reaches a stable Capium build
 * independently (Windows can sit on 150 while macOS is on 151).
 *
 * The stable build for each OS is not hardcoded here; it comes from `channels.json`, which ships
 * inside the package and is the single source of truth (the release pipeline edits that file to
 * promote an OS to a new stable, and the same file is published to the download server). This
 * module just loads it; FALLBACK_VERSIONS is used only if the bundled manifest is missing or
 * corrupt in an install.
 *
 * Override order at download time: CAPIUM_VERSION env > per-OS stable from channels.json.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SDK_VERSION = require('../package.json').version;

// Used only if channels.json can't be read (corrupt/removed install). ensureBinary() raises a
// clear error long before the "unsupported platform" case matters; this keeps lookups total.
const FALLBACK_VERSIONS = {
  'windows-x64': '153.0.8010.52', // real Chrome 152 stable per OS (win/mac .65, linux .64)
  'macos-arm64': '153.0.8010.52',
  'linux-x64': '153.0.8010.52',
  'linux-arm64': '153.0.8010.52', // declared; not yet published (see channels.json)
};
const DEFAULT_BINARY_VERSION = '153.0.8010.52';

function loadStable() {
  // The `channels.stable` map from the bundled manifest, or null if unreadable.
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'channels.json'), 'utf8');
    const stable = JSON.parse(raw).channels.stable;
    return stable && typeof stable === 'object' ? stable : null;
  } catch {
    return null;
  }
}

const STABLE = loadStable();

function versionsFromManifest() {
  if (!STABLE) return { ...FALLBACK_VERSIONS };
  const out = {};
  for (const [tag, entry] of Object.entries(STABLE)) {
    if (entry && typeof entry === 'object' && entry.version) out[tag] = entry.version;
  }
  return Object.keys(out).length ? out : { ...FALLBACK_VERSIONS };
}

// Default stable Capium binary build per distro tag, resolved from channels.json.
const CAPIUM_BINARY_VERSIONS = versionsFromManifest();

/** The current stable Capium binary version for a distro tag (e.g. 'windows-x64'). */
function binaryVersionFor(tag) {
  return CAPIUM_BINARY_VERSIONS[tag] || DEFAULT_BINARY_VERSION;
}

function revisionsFromManifest() {
  if (!STABLE) return {};
  const out = {};
  for (const [tag, entry] of Object.entries(STABLE)) {
    if (entry && typeof entry === 'object' && Number.isInteger(entry.revision)) out[tag] = entry.revision;
  }
  return out;
}

// Re-spin variant per tag (>=1). Same Chromium version can be rebuilt (a stealth/fingerprint
// change with no engine bump); each re-spin increments this. 1 = the base build.
const CAPIUM_BINARY_REVISIONS = revisionsFromManifest();

/**
 * The packaging revision (>=1) for a distro tag. 1 = the first build (chromium-v<version>.1/);
 * 2,3,... are re-spins of the SAME Chromium version served from chromium-v<version>.<N>/ (so a
 * re-spin never overwrites the artifact older SDKs still fetch). A version bump resets this to 1.
 */
function binaryRevisionFor(tag) {
  return CAPIUM_BINARY_REVISIONS[tag] || 1;
}

/**
 * Stable identity of one specific build = the R2 folder discriminator AND the install-cache key.
 * The packaging revision is ALWAYS a dotted suffix starting at 1: chromium-v<version>.<N>/
 * (revision 1 -> <version>.1, the first build; 2,3,... -> <version>.2 etc., a same-engine
 * re-spin). Each revision is its own immutable folder, so a re-spin never overwrites the
 * artifact an older SDK still fetches, and a revision bump re-downloads. NOTE: the customer's
 * reported Chrome version is unchanged -- this suffix only names our distro/upload/download
 * artifact, not the browser version.
 */
function buildId(version, revision) {
  const n = parseInt(revision, 10);
  return `${version}.${!n || n < 1 ? 1 : n}`;
}

/**
 * False only when the manifest declares the tag but marks it not-yet-published. Unknown
 * tags / missing manifest return true so the download layer's own error/404 speaks instead.
 */
function isPublished(tag) {
  if (!STABLE) return true;
  const entry = STABLE[tag];
  if (!entry || typeof entry !== 'object') return true;
  return entry.published !== false;
}

/**
 * Best-effort distro tag for the current host, mirroring download.js's mapping. Kept
 * dependency-free (no require of download.js) so version.js stays loadable in isolation.
 */
function hostTag() {
  const p = process.platform;
  const osName = p === 'darwin' ? 'macos' : p === 'win32' ? 'windows' : 'linux';
  const m = os.arch();
  const arch = m === 'x64' || m === 'ia32' ? 'x64' : m === 'arm64' ? 'arm64' : m;
  return `${osName}-${arch}`;
}

// The stable build this SDK targets for THIS host (CLI display, examples). Code that fetches a
// build should prefer binaryVersionFor(tag) with the tag it already resolved.
const CAPIUM_BINARY_VERSION = binaryVersionFor(hostTag());

module.exports = {
  SDK_VERSION,
  CAPIUM_BINARY_VERSION,
  CAPIUM_BINARY_VERSIONS,
  CAPIUM_BINARY_REVISIONS,
  binaryVersionFor,
  binaryRevisionFor,
  buildId,
  isPublished,
  hostTag,
  _FALLBACK_VERSIONS: FALLBACK_VERSIONS,
};
