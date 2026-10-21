import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {UserError, netsimToStart, gpuMode, emulatorEnv} from './lib/device.mjs';
import * as ownership from './lib/ownership.mjs';

const source = fs.readFileSync(new URL('./lib/lifecycle.mjs', import.meta.url), 'utf8');

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpmctl-lifecycle-test-'));
  const key = `rpmctl-${randomUUID()}`;
  t.after(() => { delete globalThis[key]; fs.rmSync(root, {recursive: true, force: true}); });
  const statePath = path.join(root, 'state.json'), apk = path.join(root, 'sample.apk');
  fs.writeFileSync(apk, 'fixture apk');
  const h = {events: [], live: false, starts: 0, root, statePath, apk};
  const readState = () => fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null;
  const evidenceDir = () => { const dir = path.join(root, 'evidence'); fs.mkdirSync(dir, {recursive: true}); return dir; };
  const alive = pid => pid === process.pid || h.live && pid === 7777;
  const options = {root: path.join(root, 'leases'), alive};
  const unexpected = name => () => { throw new Error(`Unexpected fixture call: ${name}`); };
  const device = {
    PACKAGE: 'com.rpm.prototype', UserError,
    adb: (serial, args) => {
      h.events.push(['adb-fixture', serial, args]);
      if (args[0] === 'emu' && !h.keepAlive) h.live = false;
      if (h.failInstall && args[0] === 'install') throw new UserError('Fixture install failed', 'Retry launch.');
      return 'Success';
    },
    shell: (serial, command) => {
      h.events.push(['shell-fixture', serial, command]);
      return command.includes('getprop') ? '1' : command.startsWith('pm path') ? 'package:fixture.apk' : '10-19 12:00:00.000';
    },
    devices: () => { h.events.push(['devices-fixture']); return h.live ? [{serial: `emulator-${h.port}`, state: 'device'}] : []; },
    startEmulator: args => { h.events.push(['start-fixture', args]); h.starts++; h.live = true; h.port = args.port; return {pid: 7777, args: ['-read-only']}; },
    startNetsim: () => null,
    adoptEmulator: serial => {
      h.events.push(['adopt-fixture', serial]);
      if (!h.live || serial !== `emulator-${h.port}`) throw new UserError('Cannot adopt fixture', 'Start runner.');
      return {pid: 7777, port: h.port, avd: 'fixture', started: '1234'};
    },
    processAlive: pid => { h.events.push(['processAlive-fixture']); return alive(pid); },
    processImage: pid => alive(pid) ? 'emulator' : null,
    ownsEmulator: state => h.live && state.pid === 7777,
    killTree: () => { if (!h.keepAlive) h.live = false; },
    sleep: async () => {},
    waitFor: async (fn, args) => {
      if (h.pause && args.what.includes('come online')) await h.pause;
      if (!await fn()) throw new UserError('Fixture wait failed', 'Retry.');
    },
    dismissAnr: () => false,
    appPid: unexpected('appPid'), foregroundActivity: unexpected('foregroundActivity'), displayInfo: unexpected('displayInfo'),
    nativeNodes: unexpected('nativeNodes'), sdkRoot: unexpected('sdkRoot'),
  };
  const runtime = {
    ROOT: root, WORK: root, STATE: statePath, EVIDENCE: path.join(root, 'evidence'), APK: apk,
    DEFAULTS: {port: 5580, cdpPort: 13000, avd: 'fixture', gpu: 'host'}, readState,
    writeState: state => fs.writeFileSync(statePath, JSON.stringify(state)), evidenceDir,
    journal: (state, entry) => h.events.push(['journal', entry]), openLauncher: async () => {},
    devtoolsPort: unexpected('devtoolsPort'), viaShell: unexpected('viaShell'), errorLines: unexpected('errorLines'),
  };
  const leases = {
    portsFor: ownership.portsFor, requireOwner: (state, args) => ownership.requireOwner(state, args, {env: {}}),
    takeLease: state => ownership.takeLease(state, options),
    updateLease: (state, extra) => ownership.updateLease(state, {...options, ...extra}),
    assertLease: state => ownership.assertLease(state, options), releaseLease: state => ownership.releaseLease(state, options),
  };
  const sync = {builtAssetsSha: () => 'fixture-web', clearSynced: serial => h.events.push(['clear-synced', serial])};
  globalThis[key] = {device, runtime, leases, sync, page: {pageTargets: unexpected('pageTargets')}};
  const moduleUrl = group => 'data:text/javascript,' + encodeURIComponent(Object.keys(globalThis[key][group])
    .map(name => `export const ${name} = globalThis[${JSON.stringify(key)}].${group}.${name};`).join('\n'));
  const rewritten = source.replace("'./device.mjs'", JSON.stringify(moduleUrl('device')))
    .replace("'./runtime.mjs'", JSON.stringify(moduleUrl('runtime')))
    .replace("'./ownership.mjs'", JSON.stringify(moduleUrl('leases')))
    .replace("'./page.mjs'", JSON.stringify(moduleUrl('page')))
    .replace("'./sync.mjs'", JSON.stringify(moduleUrl('sync')));
  const {lifecycleCommands: commands} = await import('data:text/javascript,' + encodeURIComponent(rewritten));
  return {...h, h, commands, readState, options, launchArgs: {_: [], apk, port: 5582, cdpPort: 13002}};
}

test('launch prints an owner, remembers overrides and excludes concurrent launches before boot', async t => {
  const f = await fixture(t);
  let resume;
  f.h.pause = new Promise(resolve => { resume = resolve; });
  const pending = f.commands.launch(f.launchArgs);
  const state = f.readState();
  assert.match(state.owner, /^[a-f0-9-]{36}$/);
  assert.equal(state.worktree, f.root);
  assert.equal(state.port, 5582);
  assert.equal(state.cdpPort, 13002);
  await assert.rejects(f.commands.launch({...f.launchArgs, owner: state.owner}), /lease is busy/);
  resume();
  const first = await pending;
  assert.equal(first.owner, state.owner);
  const again = await f.commands.launch({_: [], apk: f.apk, owner: first.owner});
  assert.equal(again.owner, first.owner);
  assert.equal(again.port, 5582);
  assert.equal(again.cdpPort, 13002);
  assert.equal(f.h.starts, 1);
});

test('launch and cleanup reject another owner before any device or process access', async t => {
  const f = await fixture(t);
  await f.commands.launch(f.launchArgs);
  f.h.events.length = 0;
  await assert.rejects(f.commands.launch({_: [], owner: 'other'}), /Owner token does not match/);
  await assert.rejects(f.commands.cleanup({_: [], owner: 'other'}), /Owner token does not match/);
  assert.deepEqual(f.h.events, []);
});

test('failed launch keeps the emulator lease for cleanup, and cleanup releases it after exit', async t => {
  const f = await fixture(t);
  f.h.failInstall = true;
  await assert.rejects(f.commands.launch(f.launchArgs), /Fixture install failed/);
  const state = f.readState();
  ownership.assertLease(state, f.options);
  assert.throws(() => ownership.takeLease({...state, owner: 'other'}, f.options), /lease is busy/);
  await f.commands.cleanup({_: [], owner: state.owner});
  assert.equal(f.readState(), null);
  assert.deepEqual(fs.readdirSync(f.options.root), []);
});

test('keep-emulator retains ownership; a failed stop keeps the state and lease too', async t => {
  const f = await fixture(t);
  const {owner} = await f.commands.launch(f.launchArgs);
  await f.commands.cleanup({_: [], owner, keepEmulator: true});
  ownership.assertLease(f.readState(), f.options);
  assert.equal(f.h.live, true);
  f.h.keepAlive = true;
  await assert.rejects(f.commands.cleanup({_: [], owner}), /still running/);
  ownership.assertLease(f.readState(), f.options);
  assert.equal(f.readState().owner, owner);
});

test('a fresh run after emulator death rotates the owner token', async t => {
  const f = await fixture(t);
  const first = await f.commands.launch(f.launchArgs);
  f.h.live = false;
  const second = await f.commands.launch({...f.launchArgs, owner: first.owner});
  assert.notEqual(second.owner, first.owner);
  assert.equal(f.h.starts, 2);
});

test('on Windows rpmctl starts netsimd without a console unless one already runs', () => {
  assert.equal(netsimToStart({platform: 'win32', exe: 'netsimd.exe', running: false}), true);
  assert.equal(netsimToStart({platform: 'win32', exe: 'netsimd.exe', running: true}), false);
  assert.equal(netsimToStart({platform: 'win32', exe: null, running: false}), false);
  assert.equal(netsimToStart({platform: 'linux', exe: 'netsimd', running: false}), false);
});

test('launch refuses software GPU modes unless RPM_ALLOW_SOFTWARE_GPU=1', () => {
  assert.equal(gpuMode('host', {}), 'host');
  assert.equal(gpuMode(undefined, {}), 'host');
  for (const mode of ['swiftshader_indirect', 'swiftshader', 'guest', 'software'])
    assert.throws(() => gpuMode(mode, {}), UserError);
  assert.equal(gpuMode('swiftshader_indirect', {RPM_ALLOW_SOFTWARE_GPU: '1'}), 'swiftshader_indirect');
});

test('the emulator keeps its multi-GB disk files out of the RAM-backed /tmp', () => {
  assert.equal(emulatorEnv({}, '/home/u', 'linux').ANDROID_TMP, '/home/u/.cache/android-tmp');
  assert.equal(emulatorEnv({ANDROID_TMP: '/x'}, '/home/u', 'linux').ANDROID_TMP, '/x');
  assert.equal(emulatorEnv({}, 'C:/Users/u', 'win32').ANDROID_TMP, undefined);
});

test('explicit attach adopts once, keeps leases and owner checks, then detaches without stopping the runner', async t => {
  const f = await fixture(t);
  f.h.live = true; f.h.port = 5554;
  const args = {_: [], apk: f.apk, attach: 'emulator-5554'};
  const first = await f.commands.launch(args);
  assert.equal(first.port, 5554);
  assert.equal(f.readState().mode, 'attached');
  assert.equal(f.readState().processStarted, '1234');
  assert.equal(f.h.starts, 0);
  ownership.assertLease(f.readState(), f.options);
  assert.throws(() => ownership.takeLease({...f.readState(), owner: 'other'}, f.options), /lease is busy/);
  f.h.events.length = 0;
  await assert.rejects(f.commands.launch({...args, owner: 'other'}), /Owner token/);
  await assert.rejects(f.commands.cleanup({owner: 'other'}), /Owner token/);
  assert.deepEqual(f.h.events, []);
  assert.equal((await f.commands.launch({...args, owner: first.owner})).runId, first.runId);
  await f.commands.cleanup({owner: first.owner});
  assert.equal(f.h.live, true);
  assert.equal(f.readState(), null);
  assert.deepEqual(fs.readdirSync(f.options.root), []);
  assert.equal(f.h.events.some(e => e[0] === 'adb-fixture' && e[2][0] === 'emu'), false);
});

test('ordinary launch refuses an external emulator; failed attached install keeps ownership for detach', async t => {
  const f = await fixture(t);
  f.h.live = true; f.h.port = 5582;
  await assert.rejects(f.commands.launch(f.launchArgs), /was not started/);
  assert.equal(f.readState(), null);
  f.h.failInstall = true;
  await assert.rejects(f.commands.launch({...f.launchArgs, attach: 'emulator-5582'}), /Fixture install failed/);
  ownership.assertLease(f.readState(), f.options);
  await f.commands.cleanup({owner: f.readState().owner});
  assert.equal(f.h.live, true);
});

test('attach rejects conflicting ports and AVD before recording ownership', async t => {
  const f = await fixture(t);
  f.h.live = true; f.h.port = 5554;
  await assert.rejects(f.commands.launch({...f.launchArgs, attach: 'emulator-5554'}), /conflicts/);
  await assert.rejects(f.commands.launch({attach: 'emulator-5554', avd: 'wrong'}), /conflicts/);
  assert.equal(f.readState(), null);
});
