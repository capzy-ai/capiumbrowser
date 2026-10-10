'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { readLaunchStatus, CapiumServerDownError } = require('./errors');

function required(binary) {
  let directory = path.dirname(path.resolve(binary));
  for (let i = 0; i < 8; i++) {
    try {
      const info = fs.readFileSync(path.join(directory, 'CAPIUM_BUILD_INFO'), 'utf8');
      return /^license_status_protocol\s*:\s*1\s*$/m.test(info);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  return false;
}

async function wait(binary, statusPath, timeoutMs = 30000, signal = null) {
  if (!required(binary)) return;
  const deadline = Date.now() + (timeoutMs || 30000);
  for (;;) {
    if (signal?.aborted) return;
    const error = readLaunchStatus(statusPath);
    if (error) throw error;
    try {
      if (fs.readFileSync(statusPath, 'utf8').trim() === '0\nCAPIUM_LICENSE_READY') return;
    } catch (error) {
      // The native writer briefly locks this owned file on Windows. Keep
      // waiting for a real decision; unreadable status is never readiness.
      if (!['ENOENT', 'EBUSY'].includes(error.code) &&
          !(process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code))) throw error;
    }
    if (Date.now() >= deadline) {
      throw new CapiumServerDownError('Timed out waiting for the browser license startup decision');
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
// Drivers may leave startup pending after the native process refuses the license.
// Observe the native decision while the driver connects, so rejection cannot hang.
async function withLaunch(pending, binary, statusPath, timeoutMs) {
  const controller = new AbortController();
  try {
    const [handle] = await Promise.all([
      pending, wait(binary, statusPath, timeoutMs, controller.signal),
    ]);
    return handle;
  } finally {
    // A driver can reject before the native decision is written. Do not keep
    // polling a removed status file, or keep Node alive until the deadline.
    controller.abort();
  }
}
module.exports = { required, wait, withLaunch };
