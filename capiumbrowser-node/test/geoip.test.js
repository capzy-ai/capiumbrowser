// Unit tests for the geoip flag tri-state (lib/launch-common.proxyAndGeoArgs).
//
// Regression for the 2026-09 contract change: a proxy ALONE must NOT enable geoip (that added
// a blocking egress round-trip to every proxied launch). --geoip is the sole trigger now.
// Mirrors the Python SDK's tests/test_geoip_flags.py.
'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { proxyAndGeoArgs } = require('../lib/launch-common');

const flags = (spec, geoip) => proxyAndGeoArgs(spec, geoip).args;

test('default null adds no geoip even with proxy', () => {
  const out = flags('http://u:p@h:1', null);
  assert.ok(out.some((a) => a.startsWith('--proxy-server=')), 'proxy flag expected');
  assert.ok(!out.some((a) => a === '--geoip' || a.startsWith('--geoip=')),
    'a proxy alone must NOT enable geoip (default is OFF)');
});

test('true adds --geoip', () => {
  assert.ok(flags('http://u:p@h:1', true).includes('--geoip'));
});

test('false adds explicit opt-out', () => {
  assert.ok(flags('http://u:p@h:1', false).includes('--geoip=false'));
});

test('no proxy, no geoip by default', () => {
  assert.deepEqual(flags(null, null), []);
});

test('undefined behaves like null (JS callers omit the option)', () => {
  assert.deepEqual(flags(null, undefined), []);
  assert.ok(!flags('http://u:p@h:1', undefined).some((a) => a.startsWith('--geoip')));
});
