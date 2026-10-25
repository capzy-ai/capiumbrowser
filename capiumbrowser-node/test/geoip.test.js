// Unit tests for the geoip flag tri-state (lib/launch-common.proxyAndGeoArgs).
//
// Contract as of 1.3.1: null/undefined (the default) enables --geoip WHENEVER A PROXY IS SET
// and stays off otherwise. An uncorrected host timezone under a proxied identity (UTC on a
// server against a residential exit) is a far stronger detection signal than the lookup's
// one-off launch latency, which is why the 2026-09 "default always off" contract was reversed.
// Explicit false still opts out with --geoip=false (honored first by the binary).
// Mirrors the Python SDK's tests/test_geoip_flags.py.
'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { proxyAndGeoArgs } = require('../lib/launch-common');

const flags = (spec, geoip) => proxyAndGeoArgs(spec, geoip).args;

test('default null enables geoip with a proxy', () => {
  const out = flags('http://u:p@h:1', null);
  assert.ok(out.some((a) => a.startsWith('--proxy-server=')), 'proxy flag expected');
  assert.ok(out.includes('--geoip'),
    'a proxy must enable geoip by default (exit-coherent timezone/geo/WebRTC)');
  assert.ok(!out.some((a) => a.startsWith('--geoip=')));
});

test('true adds --geoip', () => {
  assert.ok(flags('http://u:p@h:1', true).includes('--geoip'));
  assert.ok(flags(null, true).includes('--geoip'));
});

test('false adds explicit opt-out', () => {
  const out = flags('http://u:p@h:1', false);
  assert.ok(out.includes('--geoip=false'));
  assert.ok(!out.includes('--geoip'));
});

test('no proxy, no geoip by default', () => {
  assert.deepEqual(flags(null, null), []);
});

test('undefined behaves like null (JS callers omit the option)', () => {
  assert.deepEqual(flags(null, undefined), []);
  assert.ok(flags('http://u:p@h:1', undefined).includes('--geoip'));
});
