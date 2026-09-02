// Package-surface tests: the public entry points load, the exports map matches the files on
// disk, the CLI parses, and the version constants are coherent. Catches "works from the repo
// but breaks when packed" mistakes (missing files entry, broken exports path, bin syntax).
'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');

test('root export exposes the full API surface', () => {
  const api = require('../index');
  for (const name of ['launch', 'launchContext', 'launchPersistentContext', 'detectDriver',
    'config', 'proxy', 'human', 'download', 'license', 'status',
    'CapiumError', 'CapiumLicenseError', 'CapiumConfigError', 'CapiumSeatLimitError',
    'CapiumExpiredError', 'CapiumServerDownError']) {
    assert.ok(api[name], `missing export: ${name}`);
  }
  assert.equal(api.VERSION, pkg.version);
});

test('driver subpaths load and expose the launch trio', () => {
  for (const sub of ['../playwright', '../puppeteer']) {
    const mod = require(sub);
    for (const fn of ['launch', 'launchContext', 'launchPersistentContext', 'fitWindow']) {
      assert.equal(typeof mod[fn], 'function', `${sub}.${fn}`);
    }
  }
});

test('exports map entries exist on disk', () => {
  for (const target of Object.values(pkg.exports)) {
    assert.ok(fs.existsSync(path.join(ROOT, target)), target);
  }
});

test('files field ships everything the exports/bin need', () => {
  for (const needed of ['index.js', 'playwright.js', 'puppeteer.js', 'bin/', 'lib/']) {
    assert.ok(pkg.files.includes(needed), `package.json files missing ${needed}`);
  }
});

test('channels.json ships inside lib/ (the wheel-equivalent data file)', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'lib', 'channels.json')));
});

test('peer deps are optional so either driver alone installs cleanly', () => {
  for (const dep of ['playwright-core', 'puppeteer-core']) {
    assert.ok(pkg.peerDependencies[dep], dep);
    assert.equal(pkg.peerDependenciesMeta[dep].optional, true, `${dep} must be optional`);
  }
});

test('CAPIUM_BINARY_VERSION constants are coherent', () => {
  const { CAPIUM_BINARY_VERSION, CAPIUM_BINARY_VERSIONS, hostTag } = require('../lib/version');
  assert.match(CAPIUM_BINARY_VERSION, /^\d+\.\d+\.\d+\.\d+$/);
  assert.equal(CAPIUM_BINARY_VERSION,
    CAPIUM_BINARY_VERSIONS[hostTag()] || CAPIUM_BINARY_VERSION);
});

test('CLI: version subcommand runs and prints the SDK + target build', () => {
  const out = execFileSync(process.execPath,
    [path.join(ROOT, 'bin', 'capiumbrowser.js'), 'version'],
    { encoding: 'utf8', timeout: 30000 });
  assert.ok(out.includes(`capiumbrowser ${pkg.version}`), out);
  assert.ok(/targets Chromium \d+\./.test(out), out);
});

test('CLI: unknown command exits 2', () => {
  assert.throws(() => execFileSync(process.execPath,
    [path.join(ROOT, 'bin', 'capiumbrowser.js'), 'bogus'],
    { encoding: 'utf8', timeout: 30000 }),
  (e) => e.status === 2);
});

test('detectDriver throws a clear typed error when no driver is installed, or returns one', () => {
  const api = require('../index');
  const has = (n) => { try { require.resolve(n); return true; } catch { return false; } };
  const anyDriver = ['playwright-core', 'playwright', 'puppeteer-core', 'puppeteer'].some(has);
  if (anyDriver) {
    assert.equal(typeof api.detectDriver().launch, 'function');
  } else {
    assert.throws(() => api.detectDriver(),
      (e) => e instanceof api.CapiumError && /npm install capiumbrowser/.test(e.message));
  }
});
