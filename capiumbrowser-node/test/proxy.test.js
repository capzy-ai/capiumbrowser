// Unit tests for lib/proxy -- --proxy-server construction + auth-channel selection. Pure
// logic, no browser. Guards the inline-credential encoding (the Apify
// "groups-X,country-Y,session-Z" comma-username bug) and the inline-vs-CDP routing.
// Mirrors the Python SDK's tests/test_proxy.py.
'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const proxy = require('../lib/proxy');

// ---- buildProxyArg: no-proxy sentinels --------------------------------------------------
test('no-proxy sentinels', () => {
  for (const spec of [null, undefined, '', 'none', '0', false]) {
    assert.equal(proxy.buildProxyArg(spec), null, String(spec));
  }
});

// ---- buildProxyArg: string URLs ---------------------------------------------------------
test('http url with creds', () => {
  const arg = proxy.buildProxyArg('http://user:pass@host.example:8080');
  assert.equal(arg, '--proxy-server=http://user:pass@host.example:8080');
});

test('socks5 no-auth passthrough', () => {
  assert.equal(proxy.buildProxyArg('socks5://gw.example:1080'),
    '--proxy-server=socks5://gw.example:1080');
});

test('bare host:port defaults to http', () => {
  assert.equal(proxy.buildProxyArg('host.example:3128'),
    '--proxy-server=http://host.example:3128');
});

// ---- credential encoding: the comma-username failure mode -------------------------------
test('comma username is percent-encoded', () => {
  // ',' / '=' in the userinfo would otherwise split Chromium's --proxy-server grammar.
  const arg = proxy.buildProxyArg('http://groups-1,country-us,session-9:pw@h:1');
  assert.ok(arg.includes('groups-1%2Ccountry-us%2Csession-9'), arg);
  assert.ok(!arg.includes(',country-us'), 'no raw comma leaked into the flag');
});

test('encoding is idempotent', () => {
  // An already-encoded credential (e.g. from a dict whose value was pre-escaped) must not
  // double-encode: %2C -> %2C, never %252C (the binary decodes exactly once).
  const spec = { server: 'http://h:1', username: 'a%2Cb', password: 'p' };
  const arg = proxy.buildProxyArg(spec);
  assert.ok(arg.includes('a%2Cb'), arg);
  assert.ok(!arg.includes('%252C'), arg);
});

test('encodeCred percent-encodes everything outside the unreserved set', () => {
  assert.equal(proxy._encodeCred('a,b;c=d+e:f@g'), 'a%2Cb%3Bc%3Dd%2Be%3Af%40g');
  assert.equal(proxy._encodeCred('safe-._~09AZ'), 'safe-._~09AZ');
});

// ---- object specs -----------------------------------------------------------------------
test('object spec with creds', () => {
  const arg = proxy.buildProxyArg({ server: 'http://h:8080', username: 'u', password: 'p' });
  assert.equal(arg, '--proxy-server=http://u:p@h:8080');
});

test('object spec without creds', () => {
  assert.equal(proxy.buildProxyArg({ server: 'socks5://h:1080' }),
    '--proxy-server=socks5://h:1080');
});

// ---- resolveProxyConfig: inline (default) vs CDP escape hatch ---------------------------
test('resolve inline default', () => {
  const { launchOptions, args } = proxy.resolveProxyConfig('http://u:p@h:1', true);
  assert.deepEqual(launchOptions, {});
  assert.deepEqual(args, ['--proxy-server=http://u:p@h:1']);
});

test('resolve socks always inline even with cdp flag', () => {
  // SOCKS can never go via the driver proxy option -- Chrome must receive it inline.
  const { launchOptions, args } = proxy.resolveProxyConfig('socks5://u:p@h:1080', false);
  assert.deepEqual(launchOptions, {});
  assert.ok(args.length && args[0].startsWith('--proxy-server=socks5://'), args[0]);
});

test('resolve cdp escape hatch for credentialed http', () => {
  const { launchOptions, args } = proxy.resolveProxyConfig('http://u:p@h:1', false);
  assert.deepEqual(args, []);
  assert.equal(launchOptions.proxy.server, 'http://h:1');
  assert.equal(launchOptions.proxy.username, 'u');
  assert.equal(launchOptions.proxy.password, 'p');
});

test('resolve bypass list on inline', () => {
  const { args } = proxy.resolveProxyConfig(
    { server: 'http://h:8080', bypass: 'localhost,*.internal' }, true);
  assert.ok(args.includes('--proxy-bypass-list=localhost,*.internal'), args.join(' '));
});

test('resolve no proxy', () => {
  assert.deepEqual(proxy.resolveProxyConfig(null), { launchOptions: {}, args: [] });
});

test('CAPIUM_INLINE_PROXY_AUTH env controls the default channel', () => {
  const saved = process.env.CAPIUM_INLINE_PROXY_AUTH;
  try {
    process.env.CAPIUM_INLINE_PROXY_AUTH = '0';
    assert.equal(proxy.binarySupportsInlineProxyAuth(), false);
    const { launchOptions } = proxy.resolveProxyConfig('http://u:p@h:1');
    assert.ok(launchOptions.proxy, 'CDP path expected when inline auth is disabled');
    process.env.CAPIUM_INLINE_PROXY_AUTH = 'true';
    assert.equal(proxy.binarySupportsInlineProxyAuth(), true);
  } finally {
    if (saved === undefined) delete process.env.CAPIUM_INLINE_PROXY_AUTH;
    else process.env.CAPIUM_INLINE_PROXY_AUTH = saved;
  }
});
