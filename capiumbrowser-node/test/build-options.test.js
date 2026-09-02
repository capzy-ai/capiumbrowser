// Tests for the buildLaunchOptions escape hatch (both drivers) and the viewport
// defaulting applied to plain launch()'d Browsers -- the two integration surfaces
// adopted from the cloakbrowser wrapper comparison.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, beforeEach, afterEach } = require('node:test');

const pw = require('../playwright');
const pptr = require('../puppeteer');

let fakeBin;
const saved = {};
beforeEach(() => {
  for (const k of ['CAPIUM_LICENSE_KEY', 'CAPIUM_LICENSE_SERVER', 'CAPIUM_LICENSE_FILE',
    'CAPIUM_INLINE_PROXY_AUTH']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capium-blo-'));
  process.env.CAPIUM_LICENSE_FILE = path.join(dir, 'license'); // absent -> use explicit key
  fakeBin = path.join(dir, 'capium');
  fs.writeFileSync(fakeBin, '#!/bin/sh\n');
  if (process.platform !== 'win32') fs.chmodSync(fakeBin, 0o755);
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test('playwright buildLaunchOptions: complete, driver-ready options object', async () => {
  const o = await pw.buildLaunchOptions({
    seed: 12345, platform: 'windows', binary: fakeBin, licenseKey: 'cap_k',
    proxy: 'http://u:p@h:1', slowMo: 50,
  });
  assert.equal(o.executablePath, fakeBin);
  assert.equal(o.headless, false); // capium default: windowed persona
  assert.ok(o.args.includes('--fingerprint=12345'));
  assert.ok(o.args.includes('--proxy-server=http://u:p@h:1'));
  assert.equal(o.env.CAPIUM_LICENSE_KEY, 'cap_k'); // key via env, never argv
  assert.ok(o.env.CAPIUM_LICENSE_STATUS_FILE);
  assert.equal(o.slowMo, 50); // driver options pass through
  assert.ok(!('seed' in o) && !('licenseKey' in o), 'capium options not leaked to the driver');
});

test('puppeteer buildLaunchOptions: puppeteer-shaped defaults', async () => {
  const o = await pptr.buildLaunchOptions({
    seed: 7, binary: fakeBin, licenseKey: 'cap_k',
  });
  assert.equal(o.executablePath, fakeBin);
  assert.equal(o.defaultViewport, null); // page tracks the real window
  assert.deepEqual(o.ignoreDefaultArgs, ['--enable-automation']);
  assert.ok(o.args.includes('--fingerprint=7'));
});

test('puppeteer buildLaunchOptions: CDP-escape-hatch proxy becomes a plain server flag', async () => {
  process.env.CAPIUM_INLINE_PROXY_AUTH = '0';
  const o = await pptr.buildLaunchOptions({
    binary: fakeBin, licenseKey: 'cap_k',
    proxy: { server: 'http://h:8080', username: 'u', password: 'p', bypass: 'localhost' },
  });
  assert.ok(o.args.includes('--proxy-server=http://h:8080'), o.args.join(' '));
  assert.ok(o.args.includes('--proxy-bypass-list=localhost'));
  assert.ok(!('proxy' in o), 'puppeteer.launch has no proxy option');
});

test('buildLaunchOptions still runs the offline license preflight', async () => {
  const { CapiumConfigError } = require('../lib/errors');
  await assert.rejects(pw.buildLaunchOptions({ binary: fakeBin }), CapiumConfigError);
});

test('applyViewportDefaults: newContext/newPage default to viewport null, explicit wins', async () => {
  const calls = [];
  const stub = {
    newContext(options) { calls.push(options); return Promise.resolve(options); },
    newPage(options) { calls.push(options); return Promise.resolve(options); },
  };
  pw._applyViewportDefaults(stub);
  await stub.newContext();
  await stub.newContext({ locale: 'de-DE' });
  await stub.newContext({ viewport: { width: 800, height: 600 } });
  await stub.newContext({ viewport: null });
  await stub.newPage();
  assert.deepEqual(calls, [
    { viewport: null },
    { locale: 'de-DE', viewport: null },
    { viewport: { width: 800, height: 600 } }, // explicit viewport honored
    { viewport: null }, // explicit null honored (not re-defaulted)
    { viewport: null },
  ]);
});
