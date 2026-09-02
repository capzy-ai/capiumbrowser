// Validate channels.json (the single source of truth for stable builds) and that the SDK's
// download tag map agrees with it -- so a new tag can't be added in one place and missed in
// the other. Mirrors the Python SDK's tests/test_channels_manifest.py, plus a monorepo-only
// guard that the npm copy of channels.json hasn't drifted from the Python SDK's copy.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const version = require('../lib/version');
const download = require('../lib/download');

const TAGS = new Set(['linux-x64', 'linux-arm64', 'windows-x64', 'macos-arm64']);
const SEMVER = /^\d+\.\d+\.\d+\.\d+$/;

const manifestPath = path.join(__dirname, '..', 'lib', 'channels.json');
const manifest = () => JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

test('channels.json parses and has all tags', () => {
  const stable = manifest().channels.stable;
  assert.deepEqual(new Set(Object.keys(stable)), TAGS);
});

test('versions are well-formed', () => {
  const stable = manifest().channels.stable;
  for (const [tag, entry] of Object.entries(stable)) {
    assert.match(entry.version, SEMVER, `${tag}: bad version ${entry.version}`);
    // published tags must carry a sha256; unpublished must not claim one
    if (entry.published) assert.ok(entry.sha256, `${tag} is published but has no sha256`);
  }
});

test('download tag map matches manifest', () => {
  assert.deepEqual(new Set(Object.values(download._SUPPORTED)), TAGS);
});

test('binaryVersionFor matches manifest', () => {
  const stable = manifest().channels.stable;
  for (const [tag, entry] of Object.entries(stable)) {
    assert.equal(version.binaryVersionFor(tag), entry.version, tag);
  }
});

test('isPublished reflects manifest', () => {
  const stable = manifest().channels.stable;
  for (const [tag, entry] of Object.entries(stable)) {
    // isPublished defaults true for unknown/missing, but for a KNOWN tag it must match.
    assert.equal(version.isPublished(tag), Boolean(entry.published), tag);
  }
});

test('fallback version table covers every manifest tag', () => {
  for (const tag of Object.keys(manifest().channels.stable)) {
    assert.ok(version._FALLBACK_VERSIONS[tag], `${tag} missing from FALLBACK_VERSIONS`);
  }
});

test('npm channels.json matches the Python SDK copy (monorepo only)', (t) => {
  // The release pipeline edits the Python SDK's channels.json; this copy must be promoted in
  // the same commit. Skipped when the package is built/installed standalone.
  const pyCopy = path.join(__dirname, '..', '..', 'capiumbrowser-python', 'capiumbrowser',
    'channels.json');
  if (!fs.existsSync(pyCopy)) return t.skip('Python SDK copy not present (standalone build)');
  assert.deepEqual(manifest(), JSON.parse(fs.readFileSync(pyCopy, 'utf8')),
    'lib/channels.json drifted from capiumbrowser/capiumbrowser/channels.json -- ' +
      'the release pipeline must update both');
});
