// Unit tests for binary discovery (lib/config.findBinary) in a sandboxed CAPIUM_HOME:
// explicit path > CAPIUM_BINARY > flat layout > extracted capium-*/ dirs; the chrome.exe
// marker guard; and the ENOENT contract the download layer keys on.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, beforeEach, afterEach } = require('node:test');

const config = require('../lib/config');

const wrapperName = process.platform === 'win32' ? 'capium.exe' : 'capium';

let home;
const saved = {};
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'capium-find-'));
  for (const k of ['CAPIUM_HOME', 'CAPIUM_BINARY']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.CAPIUM_HOME = home;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function put(rel, content = 'bin') {
  const p = path.join(home, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  if (process.platform !== 'win32') fs.chmodSync(p, 0o755);
  return p;
}

test('finds the wrapper in a flat CAPIUM_HOME layout', () => {
  const p = put(wrapperName);
  assert.equal(config.findBinary(), p);
});

test('finds the wrapper inside an extracted capium-*/ distro dir', () => {
  const p = put(path.join('capium-152-linux-x64', wrapperName));
  assert.equal(config.findBinary(), p);
});

test('newest distro dir wins', () => {
  put(path.join('capium-151-old', wrapperName));
  const newer = put(path.join('capium-152-new', wrapperName));
  assert.equal(config.findBinary(), newer);
});

test('explicit binary argument wins over discovery', () => {
  put(wrapperName);
  const explicit = put(path.join('elsewhere', wrapperName));
  assert.equal(config.findBinary(explicit), explicit);
});

test('CAPIUM_BINARY env wins over discovery', () => {
  put(wrapperName);
  const target = put(path.join('pinned', wrapperName));
  process.env.CAPIUM_BINARY = target;
  assert.equal(config.findBinary(), target);
});

test('bare chrome.exe is only accepted next to capium markers', (t) => {
  if (process.platform !== 'win32') return t.skip('chrome.exe discovery is Windows-only');
  put(path.join('capium-152-a', 'chrome.exe')); // no marker -> must be rejected
  assert.throws(() => config.findBinary(), (e) => e.code === 'ENOENT');
  const withMarker = put(path.join('capium-152-b', 'chrome.exe'));
  put(path.join('capium-152-b', 'BUILD_INFO.txt'), 'build');
  assert.equal(config.findBinary(), withMarker);
});

test('nothing found -> ENOENT (the trigger for the auto-download path)', () => {
  assert.throws(() => config.findBinary(), (e) => e.code === 'ENOENT');
});

test('POSIX: a stripped execute bit is self-healed, not skipped', (t) => {
  if (process.platform === 'win32') return t.skip('no +x concept on Windows');
  const p = put(wrapperName);
  fs.chmodSync(p, 0o644); // simulate a zip/COPY that dropped the bit
  assert.equal(config.findBinary(), p);
  assert.ok(fs.statSync(p).mode & 0o111, 'chmod +x applied');
});
