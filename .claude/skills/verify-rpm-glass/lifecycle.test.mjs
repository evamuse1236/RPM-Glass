import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {UserError, netsimToStart, gpuMode, emulatorEnv, staleOverlays} from './lib/device.mjs';
import * as ownership from './lib/ownership.mjs';

const source = fs.readFileSync(new URL('./lib/lifecycle.mjs', import.meta.url), 'utf8');

async function fixture(t, shared = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpmctl-lifecycle-test-'));
  const key = `rpmctl-${randomUUID()}`;
  t.after(() => { delete globalThis[key]; fs.rmSync(root, {recursive: true, force: true}); });
  const statePath = path.join(root, 'state.json'), apk = path.join(root, 'sample.apk');
  fs.writeFileSync(apk, 'fixture apk');
  const h = shared?.h ?? {events: [], live: false, starts: 0};
  Object.assign(h, {root, statePath, apk});
  const readState = () => fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null;
  const evidenceDir = () => { const dir = path.join(root, 'evidence'); fs.mkdirSync(dir, {recursive: true}); return dir; };
  const alive = pid => pid === process.pid || h.live && pid === 7777;
  const options = shared?.options ?? {root: path.join(root, 'leases'), alive};
  const unexpected = name => () => { throw new Error(`Unexpected fixture call: ${name}`); };
  const device = {
    PACKAGE: 'com.rpm.prototype', UserError,
    adb: (serial, args) => {
      h.events.push(['adb-fixture', serial, args]);
      if (args[0] === 'emu' && !h.keepAlive) h.live = false;
      if (h.failInstall && args[0] === 'install') throw new UserError('Fixture install failed', 'Retry launch.');
      if (args[0] === 'exec-out') return Buffer.from(h.deviceApk);
      if (args[0] === 'install') h.deviceApk = fs.readFileSync(args.at(-1), 'utf8');
      return 'Success';
    },
    shell: (serial, command) => {
      h.events.push(['shell-fixture', serial, command]);
      return command.includes('getprop') ? '1' : command.startsWith('pm path') ? (h.deviceApk == null ? '' : 'package:/data/app/fixture/base.apk') : '10-19 12:00:00.000';
    },
    devices: () => { h.events.push(['devices-fixture']); return h.live ? [{serial: `emulator-${h.port}`, state: 'device'}] : []; },
    startEmulator: args => { h.events.push(['start-fixture', args]); h.starts++; h.live = true; h.port = args.port; return {pid: 7777, args: ['-read-only']}; },
    startNetsim: () => null,
    adoptEmulator: serial => {
      h.events.push(['adopt-fixture', serial]);
      if (!h.live || serial !== `emulator-${h.port}`) throw new UserError('Cannot adopt fixture', 'Start runner.');
      return {pid: 7777, port: h.port, avd: 'fixture', started: '1234'};
    },
    spawnReaper: port => { h.events.push(['reaper-fixture', port]); h.reapers = (h.reapers ?? 0) + 1; return 4242; },
    processAlive: pid => { h.events.push(['processAlive-fixture']); return alive(pid); },
    processImage: pid => alive(pid) ? 'emulator' : null,
    ownsEmulator: state => h.live && state.pid === 7777 && state.serial === `emulator-${h.port}`,
    killTree: () => { if (!h.keepAlive) h.live = false; },
    sleep: async () => { await h.onSleep?.(); },
    waitFor: async (fn, args) => {
      if (h.pause && args.what.includes('come online')) await h.pause;
      if (h.failBoot && args.what.includes('finish booting')) throw new UserError('Fixture wait failed', 'Retry.');
      if (!await fn()) throw new UserError('Fixture wait failed', 'Retry.');
    },
    dismissAnr: () => false,
    appPid: unexpected('appPid'), foregroundActivity: unexpected('foregroundActivity'), displayInfo: unexpected('displayInfo'),
    nativeNodes: unexpected('nativeNodes'), sdkRoot: unexpected('sdkRoot'),
  };
  const runtime = {
    ROOT: root, WORK: root, STATE: statePath, EVIDENCE: path.join(root, 'evidence'), APK: apk,
    DEFAULTS: {port: 5580, cdpPort: 13000, avd: 'fixture', gpu: 'host'}, readState,
    writeState: state => fs.writeFileSync(statePath, JSON.stringify(state)), evidenceDir, apkCheckout: () => null,
    journal: (state, entry) => h.events.push(['journal', entry]), openLauncher: async () => {},
    devtoolsPort: unexpected('devtoolsPort'), viaShell: unexpected('viaShell'), errorLines: unexpected('errorLines'),
  };
  const leases = {
    portsFor: ownership.portsFor, requireOwner: (state, args) => ownership.requireOwner(state, args, {env: {}}),
    takeLease: state => ownership.takeLease(state, options),
    updateLease: (state, extra) => ownership.updateLease(state, {...options, ...extra}),
    assertLease: state => ownership.assertLease(state, options), releaseLease: state => ownership.releaseLease(state, options),
    readEmulator: port => ownership.readEmulator(port, options), saveEmulator: (port, record) => ownership.saveEmulator(port, record, options),
    dropEmulator: port => ownership.dropEmulator(port, options), IDLE_MS: ownership.IDLE_MS,
  };
  const sync = {builtAssetsSha: () => 'fixture-web', clearSynced: serial => h.events.push(['clear-synced', serial])};
  globalThis[key] = {device, runtime, leases, sync, page: {pageTargets: unexpected('pageTargets')}, apk: Object.fromEntries(['gradleVersion', 'newestSource', 'apkStale', 'signer', 'build'].map(name => [name, unexpected(name)]))};
  const moduleUrl = group => 'data:text/javascript,' + encodeURIComponent(Object.keys(globalThis[key][group])
    .map(name => `export const ${name} = globalThis[${JSON.stringify(key)}].${group}.${name};`).join('\n'));
  const rewritten = source.replace("'./device.mjs'", JSON.stringify(moduleUrl('device')))
    .replace("'./runtime.mjs'", JSON.stringify(moduleUrl('runtime')))
    .replace("'./ownership.mjs'", JSON.stringify(moduleUrl('leases')))
    .replace("'./page.mjs'", JSON.stringify(moduleUrl('page')))
    .replace("'./sync.mjs'", JSON.stringify(moduleUrl('sync')))
    .replace("'./apk-build.mjs'", JSON.stringify(moduleUrl('apk')));
  const {lifecycleCommands: commands} = await import('data:text/javascript,' + encodeURIComponent(rewritten));
  return {...h, h, commands, readState, options, launchArgs: {_: [], apk, port: 5582, cdpPort: 13002}};
}

test('launch prints an owner reminder every time, remembers overrides and excludes concurrent launches before boot', async t => {
  const messages = [];
  t.mock.method(console, 'error', line => messages.push(line));
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
  assert.equal(messages.filter(line => line.includes('Owner token is stored in')).length, 2);
  assert.ok(messages.some(line => line.includes(f.statePath) && line.includes('RPMCTL_OWNER')));
  assert.ok(messages.every(line => !line.includes(first.owner)));
});

test('launch installs the build when the device holds another APK, even if state says it installed this one', async t => {
  const f = await fixture(t);
  const first = await f.commands.launch(f.launchArgs);
  assert.equal(first.install, 'installed');
  const again = await f.commands.launch({_: [], apk: f.apk, owner: first.owner});
  assert.equal(again.install, 'already-installed');
  f.h.deviceApk = 'an older apk someone installed by hand';
  assert.equal(f.readState().installedSha256, again.apk.sha256);
  const third = await f.commands.launch({_: [], apk: f.apk, owner: first.owner});
  assert.equal(third.install, 'installed');
  assert.equal(f.h.deviceApk, 'fixture apk');
});

test('launch and cleanup reject another owner before any device or process access', async t => {
  const f = await fixture(t);
  await f.commands.launch(f.launchArgs);
  f.h.events.length = 0;
  await assert.rejects(f.commands.launch({_: [], owner: 'other'}), /Owner token does not match/);
  await assert.rejects(f.commands.cleanup({_: [], owner: 'other'}), /Owner token does not match/);
  assert.deepEqual(f.h.events, []);
});

test('a launch that fails after boot releases the shared emulator warm, so the next worktree reuses it', async t => {
  const f = await fixture(t);
  f.h.failInstall = true;
  await assert.rejects(f.commands.launch(f.launchArgs), /Fixture install failed/);
  assert.equal(f.readState(), null);
  assert.deepEqual(fs.readdirSync(f.options.root), ['emulator-5582.json']);
  assert.ok(ownership.readEmulator(5582, f.options).releasedAt);
  assert.equal(f.h.reapers, 1, 'the idle watcher stops it if nobody comes');
  f.h.failInstall = false;
  const g = await fixture(t, {h: f.h, options: f.options});
  const next = await g.commands.launch({...g.launchArgs});
  assert.match(next.emulator, /reused the warm emulator/);
  assert.equal(f.h.starts, 1);
});

test('a launch builds before it takes the emulator, so a failed build holds nothing', async t => {
  const f = await fixture(t);
  await assert.rejects(f.commands.launch({_: [], build: true, port: 5582, cdpPort: 13002}), /Unexpected fixture call/);
  assert.equal(f.h.starts, 0);
  assert.deepEqual(fs.existsSync(f.options.root) ? fs.readdirSync(f.options.root) : [], []);
});

test('a boot clears overlays a crashed emulator left, but never while any emulator runs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlays-'));
  for (const f of ['emulator-l9oSKn.qcow2', 'emulator-d44Uu6', 'notes.qcow2']) fs.writeFileSync(path.join(dir, f), '');
  assert.deepEqual(staleOverlays(dir, {emulatorRunning: false}), [path.join(dir, 'emulator-l9oSKn.qcow2')]);
  assert.deepEqual(staleOverlays(dir, {emulatorRunning: true}), []);
  assert.deepEqual(staleOverlays(path.join(dir, 'missing'), {emulatorRunning: false}), []);
  fs.rmSync(dir, {recursive: true, force: true});
});

test('a launch whose boot fails keeps the emulator lease for cleanup, and cleanup --stop releases it after exit', async t => {
  const f = await fixture(t);
  f.h.failBoot = true;
  await assert.rejects(f.commands.launch(f.launchArgs), /Fixture wait failed/);
  const state = f.readState();
  ownership.assertLease(state, f.options);
  assert.throws(() => ownership.takeLease({...state, owner: 'other'}, f.options), /lease is busy/);
  await f.commands.cleanup({_: [], owner: state.owner, stop: true});
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
  await assert.rejects(f.commands.cleanup({_: [], owner, stop: true}), /still running/);
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

test('a second worktree reuses the warm emulator: one boot, its own APK install and wiped app data', async t => {
  const a = await fixture(t);
  const first = await a.commands.launch(a.launchArgs);
  assert.equal(first.emulator, 'booted');
  const kept = await a.commands.cleanup({_: [], owner: first.owner});
  assert.match(kept.emulator, /kept warm/);
  assert.equal(a.h.live, true);
  assert.equal(a.h.reapers, 1);
  assert.equal(a.readState(), null);
  const b = await fixture(t, a);
  b.h.events.length = 0;
  const second = await b.commands.launch({...b.launchArgs, cdpPort: 13004});
  assert.equal(b.h.starts, 1);
  assert.match(second.emulator, /reused the warm emulator/);
  assert.notEqual(second.owner, first.owner);
  assert.notEqual(second.runId, first.runId);
  const shells = b.h.events.filter(e => e[0] === 'adb-fixture').map(e => e[2].join(' '));
  assert.ok(shells.some(c => /run-as com\.rpm\.prototype sh -c 'rm -rf files/.test(c)), 'app data is wiped for the new run');
  assert.ok(b.h.events.some(e => e[0] === 'clear-synced'), 'synced web assets from the last run are cleared');
  assert.equal(ownership.readEmulator(5582, b.options).owner, second.owner);
});

test('while one worktree drives the shared emulator, another gets a busy message naming it, or waits in the queue', async t => {
  const a = await fixture(t);
  const first = await a.commands.launch(a.launchArgs);
  const b = await fixture(t, a);
  await assert.rejects(b.commands.launch({...b.launchArgs, cdpPort: 13004}), error =>
    /emulator is busy/.test(error.message) && error.message.includes(a.root) && /--wait/.test(error.fix));
  assert.equal(a.h.starts, 1);
  let waited = 0;
  a.h.onSleep = async () => { if (++waited === 2) { a.h.onSleep = null; await a.commands.cleanup({_: [], owner: first.owner}); } };
  const second = await b.commands.launch({...b.launchArgs, cdpPort: 13004, wait: 60});
  assert.equal(waited, 2);
  assert.match(second.emulator, /reused/);
  assert.equal(a.h.starts, 1);
});

test('cleanup --stop shuts the shared emulator down and forgets it, so the next launch boots', async t => {
  const a = await fixture(t);
  const first = await a.commands.launch(a.launchArgs);
  await a.commands.cleanup({_: [], owner: first.owner, stop: true});
  assert.equal(a.h.live, false);
  assert.equal(ownership.readEmulator(5582, a.options), null);
  const again = await a.commands.launch(a.launchArgs);
  assert.equal(again.emulator, 'booted');
  assert.equal(a.h.starts, 2);
});

test('a worktree whose old state outlived another run on the shared emulator gets fresh data, not the other run', async t => {
  const a = await fixture(t);
  const first = await a.commands.launch(a.launchArgs);
  const stale = a.readState();
  await a.commands.cleanup({_: [], owner: first.owner});
  const b = await fixture(t, a);
  const second = await b.commands.launch({...b.launchArgs, cdpPort: 13004});
  await b.commands.cleanup({_: [], owner: second.owner});
  fs.writeFileSync(a.statePath, JSON.stringify(stale));
  a.h.events.length = 0;
  const third = await a.commands.launch({...a.launchArgs, owner: first.owner});
  assert.match(third.emulator, /reused the warm emulator/);
  assert.ok(a.h.events.some(e => e[0] === 'clear-synced'));
});
