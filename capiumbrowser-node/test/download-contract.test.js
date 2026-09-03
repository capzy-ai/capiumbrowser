// Unit tests for the SDK download contract (lib/download): host -> distro tag, and the
// versioned artifact path. Guards the os/arch normalization and the 'filename is
// version-independent, folder carries the version' URL shape. Mirrors the Python SDK's
// tests/test_download_contract.py, plus the signed-header (HMAC) shape.
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');

const download = require('../lib/download');
const license = require('../lib/license');
const { CapiumError } = require('../lib/errors');

test('supported tags', () => {
  assert.equal(download.downloadTag('Linux', 'x86_64'), 'linux-x64');
  assert.equal(download.downloadTag('Linux', 'aarch64'), 'linux-arm64');
  assert.equal(download.downloadTag('Windows', 'AMD64'), 'windows-x64');
  assert.equal(download.downloadTag('Darwin', 'arm64'), 'macos-arm64');
  // Node-flavored inputs (process.platform / os.arch values) normalize identically.
  assert.equal(download.downloadTag('win32', 'x64'), 'windows-x64');
  assert.equal(download.downloadTag('darwin', 'arm64'), 'macos-arm64');
});

test('os/arch normalization', () => {
  assert.equal(download._normOs('Darwin'), 'macos');
  assert.equal(download._normOs('Windows'), 'windows');
  assert.equal(download._normOs('win32'), 'windows');
  assert.equal(download._normOs('Linux'), 'linux');
  assert.equal(download._normArch('amd64'), 'x64');
  assert.equal(download._normArch('x86_64'), 'x64');
  assert.equal(download._normArch('aarch64'), 'arm64');
});

test('unsupported platforms throw', () => {
  assert.throws(() => download.downloadTag('Darwin', 'x86_64'), CapiumError); // macOS Intel
  assert.throws(() => download.downloadTag('Windows', 'arm64'), CapiumError); // Windows ARM
});

test('distro path shape', () => {
  const p = download.distroPath('152.0.7977.65', 'windows-x64');
  assert.equal(p,
    '/download/distro/chromium-v152.0.7977.65/capiumbrowser-windows-x64.tar.gz');
  assert.ok(p.includes('capiumbrowser-windows-x64.tar.gz'));
  assert.ok(p.includes('chromium-v152.0.7977.65/'));
});

test('signed download headers: key in header, path HMAC-signed', () => {
  const key = 'cap_testkey';
  const p = download.distroPath('152.0.7977.65', 'linux-x64');
  const h = license.getHeaders(key, p);
  assert.equal(h['X-Capzy-License'], key); // key travels in a header, never the URL
  assert.match(h['X-Capzy-Timestamp'], /^\d+$/);
  const expect = crypto.createHmac('sha256', key)
    .update(`${h['X-Capzy-Timestamp']}.${p}`).digest('hex');
  assert.equal(h['X-Capzy-Signature'], expect);
});
