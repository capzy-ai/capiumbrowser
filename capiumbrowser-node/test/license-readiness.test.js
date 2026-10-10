'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readiness = require('../lib/license-readiness');
const {readLaunchStatus, CapiumExpiredError, CapiumServerDownError} = require('../lib/errors');

function removeOwnedTemp(root) {
  const actual = fs.realpathSync(root);
  const relative = path.relative(fs.realpathSync(os.tmpdir()),actual);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  fs.rmSync(actual,{recursive:true,force:true});
}

for (const decision of ['0\nCAPIUM_LICENSE_READY','4\nlicense rejected']) {
  test('driver connection waits for native decision '+decision[0], async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(),'capium-ready-test-'));
    t.after(()=>removeOwnedTemp(root));
    fs.writeFileSync(path.join(root,'CAPIUM_BUILD_INFO'),'license_status_protocol : 1\n');
    const status = path.join(root,'status');
    fs.writeFileSync(status,'');
    const timer = setTimeout(()=>fs.writeFileSync(status,decision),40);
    try {
      const wait = readiness.wait(path.join(root,'chrome'),status,500);
      if(decision[0]==='4') await assert.rejects(wait,CapiumExpiredError);
      else {await wait;assert.equal(readLaunchStatus(status),null);}
    } finally {clearTimeout(timer);}
  });
}

test('packaged binary without a decision times out',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'capium-ready-timeout-'));
  t.after(()=>removeOwnedTemp(root));
  fs.writeFileSync(path.join(root,'CAPIUM_BUILD_INFO'),'license_status_protocol : 1\n');
  await assert.rejects(readiness.wait(path.join(root,'chrome'),path.join(root,'missing'),30),CapiumServerDownError);
});

test('legacy binary retains its launch protocol',async()=>{
  await readiness.wait(path.join(os.tmpdir(),'capium-no-metadata/chrome'),'missing',1);
});


test('native rejection rejects even when driver startup stays pending',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'capium-pending-driver-'));
  t.after(()=>removeOwnedTemp(root));
  fs.writeFileSync(path.join(root,'CAPIUM_BUILD_INFO'),'license_status_protocol : 1\n');
  const status=path.join(root,'status');
  const timer=setTimeout(()=>fs.writeFileSync(status,'4\nlicense rejected'),30);
  t.after(()=>clearTimeout(timer));
  await assert.rejects(readiness.withLaunch(new Promise(()=>{}),path.join(root,'chrome'),status,500),CapiumExpiredError);
});

test('licensed startup still waits for the driver handle',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'capium-pending-ready-'));
  t.after(()=>removeOwnedTemp(root));
  fs.writeFileSync(path.join(root,'CAPIUM_BUILD_INFO'),'license_status_protocol : 1\n');
  const status=path.join(root,'status');
  fs.writeFileSync(status,'0\nCAPIUM_LICENSE_READY');
  const handle={licensed:true};
  const pending=new Promise(resolve=>setTimeout(()=>resolve(handle),40));
  assert.equal(await readiness.withLaunch(pending,path.join(root,'chrome'),status,500),handle);
});
