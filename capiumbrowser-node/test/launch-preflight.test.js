// Tests for the launch prologue shared by both driver front-ends: the offline license
// preflight must fail fast with a typed error BEFORE any driver/binary/network work, and
// the arg assembly must compose stealth + proxy + overrides in the documented way.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, beforeEach, afterEach } = require('node:test');

const { buildArgs, newStatusFile, clearStatusFile } = require('../lib/launch-common');
const { CapiumConfigError } = require('../lib/errors');
const pw = require('../playwright');
const pptr = require('../puppeteer');

const saved = {};
beforeEach(() => {
  for (const k of ['CAPIUM_LICENSE_KEY', 'CAPIUM_LICENSE_SERVER', 'CAPIUM_LICENSE_FILE']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.CAPIUM_LICENSE_FILE = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'capium-pf-')), 'license'); // absent file
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test('playwright launch: no key -> CapiumConfigError before any driver/binary work', async () => {
  // Works even with no driver and no binary installed: the preflight throws first.
  await assert.rejects(pw.launch({}), CapiumConfigError);
  await assert.rejects(pw.launchPersistentContext('/tmp/profile', {}), CapiumConfigError);
});

test('puppeteer launch: no key -> CapiumConfigError before any driver/binary work', async () => {
  await assert.rejects(pptr.launch({}), CapiumConfigError);
  await assert.rejects(pptr.launchPersistentContext('/tmp/profile', {}), CapiumConfigError);
});

test('licensePreflight: false skips the offline gate (dev builds)', async () => {
  // With the gate off (and a binary in hand) the failure moves past licensing -- to driver
  // resolution or the launch itself. Whatever it is, it must NOT be the config error.
  const fakeBin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'capium-bin-')), 'capium');
  fs.writeFileSync(fakeBin, '#!/bin/sh\nexit 1\n');
  if (process.platform !== 'win32') fs.chmodSync(fakeBin, 0o755);
  for (const mod of [pw, pptr]) {
    await assert.rejects(mod.launch({ licensePreflight: false, binary: fakeBin }),
      (e) => !(e instanceof CapiumConfigError));
  }
});

// ---- buildArgs composition ----------------------------------------------------------------

test('buildArgs: stealth + timezone + locale + extensions + extra, in order', () => {
  const args = buildArgs({
    seed: 7, platform: 'macos', stealthArgs: true, timezone: 'Europe/Berlin',
    locale: 'de-DE', extensionPaths: ['/a/ext1', '/b/ext2'], extra: ['--custom-flag'],
  });
  assert.ok(args.includes('--fingerprint=7'));
  assert.ok(args.includes('--fingerprint-platform=macos'));
  assert.ok(args.includes('--timezone=Europe/Berlin'));
  assert.ok(args.includes('--lang=de-DE'));
  assert.ok(args.includes('--accept-lang=de-DE'));
  assert.ok(args.includes('--disable-extensions-except=/a/ext1,/b/ext2'));
  assert.ok(args.includes('--load-extension=/a/ext1,/b/ext2'));
  assert.equal(args[args.length - 1], '--custom-flag'); // extras go last (can override)
});

test('buildArgs: stealthArgs false drops the fingerprint flags', () => {
  const args = buildArgs({ seed: 7, platform: 'windows', stealthArgs: false });
  assert.ok(!args.some((a) => a.startsWith('--fingerprint')));
});

test('buildArgs: a single extensionPaths string works like a one-element list', () => {
  const args = buildArgs({ stealthArgs: false, extensionPaths: '/only/ext' });
  assert.ok(args.includes('--load-extension=/only/ext'));
});

// ---- license status file ------------------------------------------------------------------

test('newStatusFile creates a unique empty file and wires the env var', () => {
  const env = {};
  const p1 = newStatusFile(env);
  const p2 = newStatusFile({});
  try {
    assert.equal(env.CAPIUM_LICENSE_STATUS_FILE, p1);
    assert.notEqual(p1, p2, 'unique per launch (fleet-safe)');
    assert.equal(fs.readFileSync(p1, 'utf8'), '');
  } finally {
    clearStatusFile(p1);
    clearStatusFile(p2);
  }
  assert.ok(!fs.existsSync(p1), 'clearStatusFile removes it');
});
