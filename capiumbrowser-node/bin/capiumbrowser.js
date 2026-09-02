#!/usr/bin/env node
/**
 * capiumbrowser CLI -- npx capiumbrowser <command>
 *
 *   info                environment check: license + binary + drivers (i.e. "what do I
 *                       still need installed?"). Exit 0 if ready, 1 if not.
 *   status              license entitlements from the server (plan, seats, live sessions)
 *   version             SDK version + the Chromium/Capium build it targets
 *   install             download the capium browser binary
 *   run [URL]           launch a stealth browser to URL (demo; Ctrl-C to exit)
 *
 *   info/status flags:  --json   --quick (skip the license-server call)
 *   run env:            SEED, PLATFORM (windows|macos|linux), HEADLESS=1, PROXY, GEOIP=1,
 *                       PROFILE=<dir> (persistent), HUMANIZE=1
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const config = require('../lib/config');
const download = require('../lib/download');
const license = require('../lib/license');
const { CapiumError } = require('../lib/errors');
const { SDK_VERSION, CAPIUM_BINARY_VERSION } = require('../lib/version');

// ---- diagnostics helpers -----------------------------------------------------

function driverVersion(name) {
  try {
    return require(`${name}/package.json`).version;
  } catch {
    return null;
  }
}

function binaryVersionOf(binPath) {
  // Ask the binary its version. `--version` prints and exits BEFORE the license gate,
  // so this works without a configured license. Returns null if it can't be read.
  try {
    const out = execFileSync(binPath, ['--version'],
      { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
    return out.trim() || null;
  } catch (e) {
    const out = ((e.stdout || '') + (e.stderr || '')).trim();
    return out || null;
  }
}

function licenseSource() {
  // Where the key is configured (env / file), with NO server call. null if unset.
  if (process.env.CAPIUM_LICENSE_KEY) return 'env CAPIUM_LICENSE_KEY';
  const { key } = license._fromFile(); // ~/.capium/license
  return key ? '~/.capium/license' : null;
}

async function gather(quick) {
  const info = { issues: [] };
  info.sdk = { version: SDK_VERSION, targets_chromium: CAPIUM_BINARY_VERSION };
  info.node = { version: process.version, os: process.platform, arch: os.arch() };

  const pwv = driverVersion('playwright-core') || driverVersion('playwright');
  const ppv = driverVersion('puppeteer-core') || driverVersion('puppeteer');
  info.drivers = {
    'playwright-core': pwv,
    'puppeteer-core': ppv,
  };
  if (!pwv && !ppv) {
    info.issues.push('No driver installed  ->  npm install playwright-core (or puppeteer-core)');
  }

  const binary = { found: false, path: null, version: null, installed_version: null,
    target_version: CAPIUM_BINARY_VERSION, up_to_date: null, platform_tag: null };
  try {
    binary.platform_tag = download.downloadTag();
  } catch (e) { // unsupported platform (macOS Intel, Windows ARM)
    binary.platform_error = e.message;
    info.issues.push(e.message);
  }
  try {
    const binPath = config.findBinary();
    const vstr = binaryVersionOf(binPath); // e.g. "Capium 152.0.7977.65"
    const m = /\d+\.\d+\.\d+\.\d+/.exec(vstr || '');
    const iv = m ? m[0] : download.installedVersion(binPath); // marker fallback
    binary.found = true;
    binary.path = binPath;
    binary.version = vstr;
    binary.installed_version = iv;
    binary.up_to_date = iv ? iv === CAPIUM_BINARY_VERSION : null;
    if (iv && iv !== CAPIUM_BINARY_VERSION) {
      info.issues.push(
        `Browser binary is ${iv} but the SDK targets ${CAPIUM_BINARY_VERSION}  ->  it ` +
          'auto-updates on the next launch (or run: npx capiumbrowser install)');
    }
  } catch {
    info.issues.push('Browser binary not installed  ->  npx capiumbrowser install');
  }
  info.binary = binary;

  const src = licenseSource();
  const lic = { configured: src !== null, source: src, server_checked: false,
    plan: null, sessions_cap: null, live_sessions: null, period_end: null };
  if (src === null) {
    info.issues.push('No license key  ->  set CAPIUM_LICENSE_KEY or ~/.capium/license (KEY=...)');
  } else if (!quick) {
    try {
      const st = await license.status();
      Object.assign(lic, { server_checked: true, plan: st.plan,
        sessions_cap: st.sessions_cap, live_sessions: st.live_sessions,
        period_end: st.period_end });
    } catch (e) {
      lic.server_error = e.message;
      info.issues.push(`License check failed  ->  ${e.message}`);
    }
  }
  info.license = lic;
  return info;
}

function printHuman(info) {
  const row = (label, val, status) => {
    const tag = status === undefined ? '' : `  [${status}]`;
    console.log(`  ${label.padEnd(13)} ${val}${tag}`);
  };

  console.log('\nCapium browser -- environment check\n');
  row('SDK', `capiumbrowser ${info.sdk.version}  (targets Chromium ${info.sdk.targets_chromium})`);
  row('Node', `${info.node.version} on ${info.node.os}/${info.node.arch}`);
  const d = info.drivers;
  row('Playwright', d['playwright-core'] || 'not installed',
    d['playwright-core'] ? 'OK' : 'missing');
  row('Puppeteer', d['puppeteer-core'] || 'not installed',
    d['puppeteer-core'] ? 'OK' : 'missing');

  const b = info.binary;
  console.log();
  if (b.platform_tag) row('Platform', `${b.platform_tag}  (${info.node.os}/${info.node.arch})`);
  else if (b.platform_error) {
    row('Platform', `unsupported: ${info.node.os}/${info.node.arch}`, 'UNSUPPORTED');
  }
  if (b.found) {
    const iv = b.installed_version;
    if (iv && b.up_to_date) row('Binary', `installed  v${iv}  (up to date)`, 'OK');
    else if (iv) {
      row('Binary',
        `installed  v${iv}  ->  SDK targets v${b.target_version} (auto-updates next launch)`,
        'UPDATE');
    } else row('Binary', 'installed', 'OK');
    row('', b.path);
  } else {
    row('Binary', 'NOT INSTALLED', 'MISSING');
    row('', `target v${b.target_version}  ->  npx capiumbrowser install`);
  }

  const lic = info.license;
  console.log();
  if (lic.configured) {
    row('License', `key from ${lic.source}`, 'OK');
    if (lic.server_checked) {
      row('', `plan=${lic.plan}  seats=${lic.sessions_cap} (${lic.live_sessions} live)  ` +
        `renews=${lic.period_end}`);
    } else if (lic.server_error) row('', `server check: ${lic.server_error}`, 'WARN');
  } else {
    row('License', 'not configured', 'MISSING');
  }

  console.log();
  if (info.issues.length) {
    console.log(`${info.issues.length} thing(s) to fix:`);
    for (const i of info.issues) console.log(`  - ${i}`);
  } else {
    console.log('Ready: everything needed is installed and configured.');
  }
  console.log();
}

// ---- subcommands -------------------------------------------------------------

async function cmdInfo(flags) {
  const info = await gather(flags.includes('--quick'));
  if (flags.includes('--json')) console.log(JSON.stringify(info, null, 2));
  else printHuman(info);
  return info.issues.length ? 1 : 0;
}

async function cmdStatus(flags) {
  let st;
  try {
    st = await license.status();
  } catch (e) {
    console.error(`capiumbrowser status: ${e.message}`);
    return 1;
  }
  if (flags.includes('--json')) console.log(JSON.stringify(st, null, 2));
  else for (const [k, v] of Object.entries(st)) console.log(`  ${k.padEnd(14)} ${v}`);
  return 0;
}

function cmdVersion() {
  console.log(`capiumbrowser ${SDK_VERSION} (targets Chromium ${CAPIUM_BINARY_VERSION})`);
  try {
    const binPath = config.findBinary();
    const vstr = binaryVersionOf(binPath) || '';
    const m = /\d+\.\d+\.\d+\.\d+/.exec(vstr);
    const iv = m ? m[0] : (download.installedVersion(binPath) || 'unknown');
    if (iv === CAPIUM_BINARY_VERSION) {
      console.log(`installed binary: v${iv} (up to date) at ${binPath}`);
    } else {
      console.log(
        `installed binary: v${iv} -> updates to v${CAPIUM_BINARY_VERSION} on next launch, ` +
          `at ${binPath}`);
    }
  } catch {
    console.log('installed binary: NOT INSTALLED -> npx capiumbrowser install');
  }
  return 0;
}

async function cmdInstall() {
  const { key } = license.effective();
  console.log('downloading the capium browser binary ...');
  console.log('installed:', await download.ensureBinary({ licenseKey: key }));
  return 0;
}

async function cmdRun(url) {
  const seed = process.env.SEED;
  const geoipEnv = process.env.GEOIP; // 1 = force on, 0 = force off, unset = auto (null)
  const opts = {
    seed: seed ? Number(seed) : null,
    platform: process.env.PLATFORM || 'windows',
    headless: process.env.HEADLESS === '1',
    proxy: process.env.PROXY || null,
    geoip: geoipEnv === '1' ? true : geoipEnv === '0' ? false : null,
  };
  const driver = require('../index').detectDriver();
  const target = url || 'https://fingerprint.com/demo/';
  let page;
  let closer;
  const profile = process.env.PROFILE;
  if (profile) {
    const ctx = await driver.launchPersistentContext(profile, opts);
    closer = ctx;
    const pages = typeof ctx.pages === 'function' ? await ctx.pages() : [];
    page = pages[0] || (await ctx.newPage());
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } else {
    const res = await driver.launchContext({
      url: target, humanize: process.env.HUMANIZE === '1', ...opts,
    });
    page = res.page;
    closer = res.browser;
  }
  console.log('== Capium ==');
  console.log('  platform :', await page.evaluate(() => navigator.platform));
  console.log('  userAgent:', await page.evaluate(() => navigator.userAgent));
  console.log('  url      :', target);
  console.log('Browser open. Ctrl-C to exit.');
  await new Promise((resolve) => {
    process.on('SIGINT', resolve);
    process.on('SIGTERM', resolve);
  });
  await closer.close();
  return 0;
}

async function main() {
  const [cmd, ...restArgs] = process.argv.slice(2);
  const flags = restArgs.filter((a) => a.startsWith('--'));
  const positional = restArgs.filter((a) => !a.startsWith('--'));
  try {
    switch (cmd) {
      case undefined:
      case 'info':
        // No subcommand -> the diagnostic, so a bare `npx capiumbrowser` is useful.
        return await cmdInfo(flags);
      case 'status':
        return await cmdStatus(flags);
      case 'version':
        return cmdVersion();
      case 'install':
        return await cmdInstall();
      case 'run':
        return await cmdRun(positional[0]);
      case '--help':
      case '-h':
      case 'help':
        console.log(fs.readFileSync(__filename, 'utf8')
          .split('\n').slice(1, 15).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
        return 0;
      default:
        console.error(`unknown command: ${cmd} (try: info, status, version, install, run)`);
        return 2;
    }
  } catch (e) {
    if (e instanceof CapiumError) {
      console.error(`capiumbrowser: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

main().then((code) => process.exit(code));
