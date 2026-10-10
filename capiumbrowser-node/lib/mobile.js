'use strict';

// Shared with the native engine. These are emulation presets, not physical
// GPU/font/CPU/memory certifications. Desktop defaults never read this catalog.
const catalog = require('./android-phones.json');
const profiles = new Map(catalog.profiles.map(p => [p.id, p]));
const iosProfiles = new Map(require('./ios-phones.json').profiles.map(p => [p.id, p]));

function androidProfile(seed, device = null) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Android seed must be an integer from 0 to 4294967295');
  }
  if (device === null || device === undefined) {
    device = catalog.default_profile_ids[seed % catalog.default_profile_ids.length];
  }
  if (typeof device !== 'string' || !profiles.has(device)) {
    throw new RangeError('Unknown Android mobileDevice; choose a catalog ID: ' + [...profiles.keys()].join(', '));
  }
  return { ...profiles.get(device) };
}

function mobileProfile(seed, device = null, platform = 'android') {
  if (platform === 'android') return androidProfile(seed, device);
  if (platform !== 'ios') throw new Error("Mobile profiles require platform: 'android' or 'ios'");
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('iPhone seed must be an integer from 0 to 4294967295');
  }
  device = device === null || device === undefined ? 'iphone-16' : device;
  if (typeof device !== 'string' || !iosProfiles.has(device)) {
    throw new RangeError('Unknown iPhone mobileDevice; choose a catalog ID: ' + [...iosProfiles.keys()].join(', '));
  }
  return { ...iosProfiles.get(device) };
}

function contextOptions(seed, options = {}, device = null, platform = 'android') {
  if (options.userAgent !== undefined && options.userAgent !== null) {
    throw new Error((platform === 'ios' ? 'iPhone uses its catalog UA; ' :
      'Android Chrome uses the native engine UA and matching Client Hints; ') +
      'context userAgent overrides are not supported');
  }
  if ('viewport' in options && options.viewport === null) return { ...options };
  const p = mobileProfile(seed, device, platform);
  return {
    viewport: { width: p.width, height: p.height },
    screen: { width: p.width, height: p.height },
    deviceScaleFactor: p.dpr, isMobile: true, hasTouch: true,
    ...options,
  };
}

function puppeteerViewport(seed, device = null, platform = 'android') {
  const p = mobileProfile(seed, device, platform);
  return { width: p.width, height: p.height, deviceScaleFactor: p.dpr,
    isMobile: true, hasTouch: true };
}

function validateLaunch(platform, binary, extra, stealthArgs = true, mobileDevice = null) {
  if (typeof platform === 'string' && ['android', 'ios'].includes(platform.toLowerCase()) && platform !== platform.toLowerCase()) {
    throw new Error(`Use platform: '${platform.toLowerCase()}' for the mobile profile`);
  }
  if (!['android', 'ios'].includes(platform)) {
    if (mobileDevice !== null && mobileDevice !== undefined) throw new Error("mobileDevice requires platform: 'android' or 'ios'");
    return;
  }
  if (mobileDevice !== null && mobileDevice !== undefined) mobileProfile(0, mobileDevice, platform);
  if (!stealthArgs) throw new Error('Mobile profiles require stealthArgs: true to enable their native identity');
  const conflicts = ['--user-agent=', '--fingerprint-brand=', '--fingerprint-brand-version=',
    '--fingerprint-platform-version=', '--fingerprint-platform=', '--fingerprint=', '--fingerprint-mobile-device='];
  if ((extra || []).some(arg => typeof arg === 'string' &&
    conflicts.some(key => arg.startsWith(key) || arg === key.slice(0, -1)))) {
    throw new Error('Android preview uses the catalog model/OS and current Chrome; ' +
      'conflicting identity overrides are not supported');
  }
}

// Runs on a fulfilled empty .invalid page for every mobile launch; no network is sent.
async function engineProbe(expected) {
  if (expected?.user_agent) {
    if (navigator.platform !== 'iPhone' || navigator.userAgent !== expected.user_agent ||
      'userAgentData' in navigator || 'NavigatorUAData' in globalThis || navigator.maxTouchPoints < 1) return false;
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return !!ext && gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) === 'Apple Inc.' &&
      gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) === 'Apple GPU';
  }
  const match = navigator.userAgent.match(/Chrome\/(\d+)\.0\.0\.0 Mobile Safari\//);
  if (!expected || navigator.platform !== 'Linux armv81' || !match ||
    !navigator.userAgent.includes('(Linux; Android 10; K)') ||
    navigator.userAgent.includes('Version/4.0') || !navigator.userAgentData) return false;
  const ch = await navigator.userAgentData.getHighEntropyValues([
    'model', 'platformVersion', 'uaFullVersion', 'fullVersionList', 'formFactors',
    'architecture', 'bitness', 'wow64']);
  const full = ch.uaFullVersion;
  const versionsMatch = typeof full === 'string' && full.split('.')[0] === match[1] &&
    ['Chromium', 'Google Chrome'].every(brand =>
      ch.brands?.some(item => item.brand === brand && item.version === match[1]) &&
      ch.fullVersionList?.some(item => item.brand === brand && item.version === full));
  return versionsMatch && ch.platform === 'Android' && ch.mobile === true &&
    ch.model === expected.model && ch.platformVersion === expected.platform_version &&
    ch.architecture === '' && ch.bitness === '' && ch.wow64 === false &&
    ch.formFactors?.length === 1 && ch.formFactors[0] === 'Mobile';
}

module.exports = { androidProfile, mobileProfile, contextOptions, puppeteerViewport, validateLaunch, engineProbe };
