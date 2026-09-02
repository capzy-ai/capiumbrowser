// Integration-ish tests for the extraction/install layer (lib/download): single-top vs FLAT
// archive normalization, version stamping, stale-install removal, and the sha256 integrity
// check -- all against real files in a temp CAPIUM_HOME, no network.
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const tar = require('tar');

const download = require('../lib/download');
const { CapiumError, CapiumServerDownError } = require('../lib/errors');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'capium-xtest-'));
}

async function makeTarGz(entries) {
  // entries: {relativePath: content}. Returns the archive path.
  const stage = tmpdir();
  for (const [rel, content] of Object.entries(entries)) {
    const p = path.join(stage, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  const file = path.join(tmpdir(), 'archive.tar.gz');
  await tar.c({ gzip: true, file, cwd: stage }, fs.readdirSync(stage));
  return file;
}

test('extract: single-top archive lands as root/<topdir>', async () => {
  const archive = await makeTarGz({
    'capium-152-linux-x64/capium': '#!/bin/sh\necho capium\n',
    'capium-152-linux-x64/chrome': 'engine',
    'capium-152-linux-x64/BUILD_INFO.txt': 'build',
  });
  const root = tmpdir();
  await download._extract(archive, root, 'capium-152-wrapped');
  assert.ok(fs.existsSync(path.join(root, 'capium-152-linux-x64', 'capium')));
  assert.ok(!fs.existsSync(path.join(root, 'capium-152-wrapped')), 'no wrapper for single-top');
  // scratch dir cleaned up
  assert.ok(!fs.readdirSync(root).some((n) => n.startsWith('.capium-extract-')));
});

test('extract: FLAT archive (the Windows tar layout) is wrapped into root/<subdir>', async () => {
  const archive = await makeTarGz({
    'chrome.exe': 'engine',
    'BUILD_INFO.txt': 'build',
    'locales/en-US.pak': 'pak',
  });
  const root = tmpdir();
  await download._extract(archive, root, 'capium-152-windows-x64');
  assert.ok(fs.existsSync(path.join(root, 'capium-152-windows-x64', 'chrome.exe')));
  assert.ok(fs.existsSync(path.join(root, 'capium-152-windows-x64', 'locales', 'en-US.pak')));
  assert.ok(!fs.readdirSync(root).some((n) => n.startsWith('.capium-extract-')));
});

test('version stamp roundtrip and marker fallback', () => {
  const dir = tmpdir();
  const bin = path.join(dir, 'capium');
  fs.writeFileSync(bin, 'x');
  assert.equal(download._readInstalledVersion(bin), null); // pre-stamp install -> unknown
  download._stampVersion(bin, '152.0.7977.64');
  assert.equal(download._readInstalledVersion(bin), '152.0.7977.64');
});

test('removeInstalls drops only capium-* dirs under root', () => {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, 'capium-152-linux-x64'));
  fs.mkdirSync(path.join(root, 'unrelated'));
  fs.writeFileSync(path.join(root, 'capium-notadir'), 'file, not a dir');
  download._removeInstalls(root);
  assert.ok(!fs.existsSync(path.join(root, 'capium-152-linux-x64')));
  assert.ok(fs.existsSync(path.join(root, 'unrelated')));
  assert.ok(fs.existsSync(path.join(root, 'capium-notadir')));
});

function serve(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

test('download verifies X-Capzy-SHA256 and fails closed on mismatch', async () => {
  const body = Buffer.from('not really a tarball');
  const goodSha = crypto.createHash('sha256').update(body).digest('hex');
  const srv = await serve((req, res) => {
    const sha = req.url === '/good' ? goodSha : 'deadbeef'.repeat(8);
    res.writeHead(200, { 'X-Capzy-SHA256': sha });
    res.end(body);
  });
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const dest1 = path.join(tmpdir(), 'a.tar.gz');
    const got = await download._download(`${base}/good`, null, dest1, 'v', 'tag');
    assert.equal(got, goodSha);
    assert.deepEqual(fs.readFileSync(dest1), body);

    const dest2 = path.join(tmpdir(), 'b.tar.gz');
    await assert.rejects(
      download._download(`${base}/bad`, null, dest2, 'v', 'tag'),
      (e) => e instanceof CapiumError && /integrity check/.test(e.message));
  } finally {
    srv.close();
  }
});

test('download maps HTTP statuses to typed errors', async () => {
  const srv = await serve((req, res) => {
    const code = Number(req.url.slice(1));
    res.writeHead(code);
    res.end();
  });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const dest = () => path.join(tmpdir(), 'x.tar.gz');
  try {
    await assert.rejects(download._download(`${base}/404`, null, dest(), 'v', 'tag'),
      (e) => e instanceof CapiumError && /404/.test(e.message));
    await assert.rejects(download._download(`${base}/403`, null, dest(), 'v', 'tag'),
      (e) => /license rejected/.test(e.message));
    await assert.rejects(download._download(`${base}/500`, null, dest(), 'v', 'tag'),
      (e) => e instanceof CapiumServerDownError);
  } finally {
    srv.close();
  }
});

test('ensureBinary end-to-end against a local server (CAPIUM_HOME sandbox)', async () => {
  // Full flow: CAPIUM_DOWNLOAD_URL -> download -> extract -> discover -> stamp. The archive
  // is FLAT with NO marker files -- the real Windows distro layout -- so this also guards
  // the downloader's own .capium-build stamp making the bare chrome.exe discoverable.
  const wrapperName = process.platform === 'win32' ? 'chrome.exe' : 'capium';
  const archive = await makeTarGz({
    [wrapperName]: '#!/bin/sh\necho capium\n',
    'locales/en-US.pak': 'pak',
  });
  const bytes = fs.readFileSync(archive);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const srv = await serve((req, res) => {
    res.writeHead(200, { 'X-Capzy-SHA256': sha });
    res.end(bytes);
  });
  const home = tmpdir();
  const savedEnv = { ...process.env };
  try {
    process.env.CAPIUM_HOME = home;
    process.env.CAPIUM_DOWNLOAD_URL =
      `http://127.0.0.1:${srv.address().port}/{platform}-{version}.tar.gz`;
    delete process.env.CAPIUM_BINARY;
    delete process.env.CAPIUM_VERSION;
    const binPath = await download.ensureBinary({});
    assert.ok(binPath.startsWith(home), `${binPath} not under CAPIUM_HOME`);
    assert.ok(fs.existsSync(binPath));
    // stamped with the target version -> a second call reuses it without re-downloading
    const stamped = download._readInstalledVersion(binPath);
    assert.ok(stamped, 'version marker written');
    srv.close(); // server gone; a reuse hit must not need it
    assert.equal(await download.ensureBinary({}), binPath);
  } finally {
    process.env = savedEnv;
    try {
      srv.close();
    } catch {}
  }
});
