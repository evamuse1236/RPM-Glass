import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ADB_TIMEOUT_MS, HANG_EXIT, HangError, UserError, adb} from './lib/device.mjs';

const skill = path.dirname(fileURLToPath(import.meta.url));
const skip = process.platform === 'win32' && 'the fake adb is a shell script';

function hungSdk() {
  const sdk = fs.mkdtempSync(path.join(os.tmpdir(), 'rpmctl-hung-adb-'));
  fs.mkdirSync(path.join(sdk, 'platform-tools'));
  fs.writeFileSync(path.join(sdk, 'platform-tools', 'adb'), '#!/bin/sh\nexec sleep 30\n', {mode: 0o755});
  return sdk;
}

test('adb calls default to a 60 s timeout', () => {
  assert.equal(ADB_TIMEOUT_MS, 60000);
  assert.notEqual(HANG_EXIT, 1);
});

test('a hung adb throws HangError even with allowFail, and retry loops cannot swallow it as a UserError', {skip}, () => {
  const before = process.env.ANDROID_HOME;
  process.env.ANDROID_HOME = hungSdk();
  try {
    assert.throws(() => adb('emulator-5554', ['logcat', '-d'], {allowFail: true, timeout: 300}), e => {
      assert.ok(e instanceof HangError);
      assert.ok(!(e instanceof UserError));
      assert.equal(e.exitCode, HANG_EXIT);
      assert.match(e.fix, /cleanup --stop/);
      return true;
    });
  } finally {
    fs.rmSync(process.env.ANDROID_HOME, {recursive: true, force: true});
    if (before === undefined) delete process.env.ANDROID_HOME; else process.env.ANDROID_HOME = before;
  }
});

test('rpmctl exits with the hang code and a JSON fix when adb stops answering', {skip}, () => {
  const sdk = hungSdk();
  try {
    const started = Date.now();
    const r = spawnSync(process.execPath, [path.join(skill, 'rpmctl.mjs'), 'doctor', '--serial', 'emulator-5554'],
      {encoding: 'utf8', env: {...process.env, ANDROID_HOME: sdk, RPMCTL_ADB_TIMEOUT_MS: '500'}});
    assert.ok(Date.now() - started < 15000);
    assert.equal(r.status, HANG_EXIT);
    const out = JSON.parse(r.stdout);
    assert.equal(out.ok, false);
    assert.match(out.error, /adb devices -l did not answer in 0\.5 s/);
    assert.match(out.fix, /cleanup --stop/);
  } finally {
    fs.rmSync(sdk, {recursive: true, force: true});
  }
});
