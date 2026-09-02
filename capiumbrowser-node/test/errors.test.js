// Unit tests for lib/errors -- the binary's fail-closed status file and the stderr
// translation. These are the paths that turn an opaque driver "browser closed" crash into a
// precise, typed license error.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const errors = require('../lib/errors');

function statusFile(content) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'capium-test-')), 'status.err');
  fs.writeFileSync(p, content);
  return p;
}

test('readLaunchStatus maps the binary exit codes to typed errors', () => {
  const cases = [
    ['2', errors.CapiumConfigError], // kExitNoLicense
    ['3', errors.CapiumSeatLimitError], // kExitSeatLimit
    ['4', errors.CapiumExpiredError], // kExitExpired
    ['5', errors.CapiumServerDownError], // kExitServerDown
  ];
  for (const [code, Cls] of cases) {
    const e = errors.readLaunchStatus(statusFile(`${code}\nsomething went wrong`));
    assert.ok(e instanceof Cls, `${code} -> ${Cls.name}`);
    assert.equal(e.message, 'something went wrong');
  }
});

test('readLaunchStatus: unknown code falls back to CapiumLicenseError', () => {
  const e = errors.readLaunchStatus(statusFile('99\nweird'));
  assert.ok(e instanceof errors.CapiumLicenseError);
  assert.ok(!(e instanceof errors.CapiumConfigError));
});

test('readLaunchStatus: code without message gets a default message', () => {
  const e = errors.readLaunchStatus(statusFile('3\n'));
  assert.ok(e instanceof errors.CapiumSeatLimitError);
  assert.ok(e.message.includes('refused to start'));
});

test('readLaunchStatus: empty or missing file -> null (stderr fallback)', () => {
  assert.equal(errors.readLaunchStatus(statusFile('')), null);
  assert.equal(errors.readLaunchStatus(statusFile('   \n ')), null);
  assert.equal(errors.readLaunchStatus(path.join(os.tmpdir(), 'capium-no-such-file')), null);
});

test('translateLaunchError: non-license failures return null', () => {
  assert.equal(errors.translateLaunchError(new Error('net::ERR_CONNECTION_REFUSED')), null);
});

test('translateLaunchError: recognizes the [capium-license] stderr line', () => {
  const mk = (line) => new Error(`Browser closed.\nstderr:\n[capium-license] ${line}\n`);
  assert.ok(errors.translateLaunchError(mk('concurrent session limit reached'))
    instanceof errors.CapiumSeatLimitError);
  assert.ok(errors.translateLaunchError(mk('license expired'))
    instanceof errors.CapiumExpiredError);
  assert.ok(errors.translateLaunchError(mk('license server unreachable, no offline grace'))
    instanceof errors.CapiumServerDownError);
  const generic = errors.translateLaunchError(mk('some other refusal'));
  assert.ok(generic instanceof errors.CapiumLicenseError);
});

test('translateLaunchError: no-license message pulls the clean hint', () => {
  const e = errors.translateLaunchError(
    new Error('launch failed\n[capium-license] no license configured\n'));
  assert.ok(e instanceof errors.CapiumConfigError);
  assert.ok(e.message.startsWith('no license configured'));
  assert.ok(e.message.includes('CAPIUM_LICENSE_KEY'));
});

test('error class hierarchy', () => {
  for (const Cls of [errors.CapiumConfigError, errors.CapiumSeatLimitError,
    errors.CapiumExpiredError, errors.CapiumServerDownError]) {
    const e = new Cls('x');
    assert.ok(e instanceof errors.CapiumLicenseError);
    assert.ok(e instanceof errors.CapiumError);
    assert.ok(e instanceof Error);
    assert.equal(e.name, Cls.name);
  }
});
