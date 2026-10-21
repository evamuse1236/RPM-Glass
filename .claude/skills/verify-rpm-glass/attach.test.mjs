import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {adoptEmulator, attachedProcess} from './lib/device.mjs';

test('adoption binds the online serial to exactly one read-only process, port, AVD and start identity', t => {
  const proc = fs.mkdtempSync(path.join(os.tmpdir(), 'rpmctl-proc-'));
  t.after(() => fs.rmSync(proc, {recursive: true, force: true}));
  const put = (pid, args, start = '12345') => {
    const dir = path.join(proc, String(pid));
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'cmdline'), args.join('\0') + '\0');
    fs.writeFileSync(path.join(dir, 'stat'), `${pid} (qemu system) ${['S', ...Array(18).fill('0'), start].join(' ')}`);
  };
  const args = ['/sdk/qemu-system-x86_64', '-avd', 'rpm-ci', '-port', '5554', '-read-only'];
  put(42, args);
  const options = {proc, platform: 'linux', list: () => [{serial: 'emulator-5554', state: 'device'}], name: () => 'rpm-ci'};
  assert.deepEqual(adoptEmulator('emulator-5554', options), {pid: 42, port: 5554, avd: 'rpm-ci', started: '12345'});
  put(42, args, '999');
  assert.equal(attachedProcess(42, {proc}).started, '999');
  assert.throws(() => adoptEmulator('phone-123', options), /Linux emulator serial/);
  assert.throws(() => adoptEmulator('emulator-5554', {...options, platform: 'win32'}), /Linux emulator serial/);
  assert.throws(() => adoptEmulator('emulator-5554', {...options, list: () => []}), /not online/);
  assert.throws(() => adoptEmulator('emulator-5554', {...options, name: () => 'other'}), /Cannot identify/);
  put(43, args);
  assert.throws(() => adoptEmulator('emulator-5554', options), /Cannot identify/);
  put(43, args.filter(a => a !== '-read-only'));
  assert.equal(attachedProcess(43, {proc}), null);
  put(42, args.map(a => a === '5554' ? '5556' : a));
  assert.throws(() => adoptEmulator('emulator-5554', options), /Cannot identify/);
});
