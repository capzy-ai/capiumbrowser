// Unit tests for lib/license -- key/server resolution order, the child-process environment
// injection (key never on argv), and the signed-header scheme. No server calls.
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, beforeEach, afterEach } = require('node:test');

const license = require('../lib/license');
const { CapiumConfigError } = require('../lib/errors');

const saved = {};
beforeEach(() => {
  for (const k of ['CAPIUM_LICENSE_KEY', 'CAPIUM_LICENSE_SERVER', 'CAPIUM_LICENSE_FILE']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Point the file source at a temp path so a real ~/.capium/license can't leak in.
  process.env.CAPIUM_LICENSE_FILE = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'capium-lic-test-')), 'license');
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test('effective: arg beats env, env beats nothing; file is NOT consulted', () => {
  fs.writeFileSync(process.env.CAPIUM_LICENSE_FILE, 'KEY=cap_fromfile\n');
  assert.deepEqual(license.effective(), { key: null, server: null }); // no file fallback
  process.env.CAPIUM_LICENSE_KEY = 'cap_env';
  assert.equal(license.effective().key, 'cap_env');
  assert.equal(license.effective('cap_arg').key, 'cap_arg');
});

test('resolve: falls back to the license file and defaults the server', () => {
  fs.writeFileSync(process.env.CAPIUM_LICENSE_FILE,
    '# comment\nKEY=cap_fromfile\nSERVER=https://custom.example/\n');
  const { key, server } = license.resolve();
  assert.equal(key, 'cap_fromfile');
  assert.equal(server, 'https://custom.example'); // trailing slash stripped
});

test('resolve: default server when the file has only a key', () => {
  fs.writeFileSync(process.env.CAPIUM_LICENSE_FILE, 'KEY=cap_x\n');
  assert.equal(license.resolve().server, license.DEFAULT_SERVER);
});

test('resolve: no key anywhere -> CapiumConfigError (the offline preflight gate)', () => {
  assert.throws(() => license.resolve(), CapiumConfigError);
  assert.throws(() => license.preflight(), CapiumConfigError);
});

test('preflight passes with an explicit key (no server call)', () => {
  license.preflight('cap_explicit'); // must not throw
});

test('childEnv injects explicitly-resolved vars, never invents them', () => {
  const before = license.childEnv();
  assert.equal(before.CAPIUM_LICENSE_KEY, undefined);
  const env = license.childEnv('cap_k', 'https://srv.example');
  assert.equal(env.CAPIUM_LICENSE_KEY, 'cap_k');
  assert.equal(env.CAPIUM_LICENSE_SERVER, 'https://srv.example');
  // the rest of the environment is preserved (sentinel: PATH's casing differs on Windows)
  process.env.CAPIUM_TEST_SENTINEL = 'kept';
  try {
    assert.equal(license.childEnv('cap_k').CAPIUM_TEST_SENTINEL, 'kept');
  } finally {
    delete process.env.CAPIUM_TEST_SENTINEL;
  }
});

test('getHeaders: HMAC over "<ts>.<path>" with the key', () => {
  const h = license.getHeaders('cap_secret', '/download/x?y=1');
  const expect = crypto.createHmac('sha256', 'cap_secret')
    .update(`${h['X-Capzy-Timestamp']}./download/x?y=1`).digest('hex');
  assert.equal(h['X-Capzy-Signature'], expect);
  assert.equal(h['X-Capzy-License'], 'cap_secret');
});

test('machineId returns something stable and non-empty', () => {
  const a = license._machineId();
  const b = license._machineId();
  assert.ok(a && typeof a === 'string');
  assert.equal(a, b);
});
