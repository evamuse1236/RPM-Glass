import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {defaultPorts, portsFor, requireOwner, takeLease, updateLease, assertLease, releaseLease, touchLease, leaseRoot, portInUse, SHARED_PORT, IDLE_MS} from './lib/ownership.mjs';
import {reaperStep} from './lib/reaper.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpmctl-lease-test-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const state = {pid: 12345, worktree: path.join(root, 'tree'), port: 5580, cdpPort: 12000,
    owner: 'agent-one', startedAt: '2026-10-19T00:00:00Z'};
  return {root, state, alive: () => true};
}

test('every worktree defaults to the one shared emulator port; DevTools ports stay per worktree; overrides survive', () => {
  const ports = Array.from({length: 100}, (_, i) => defaultPorts(path.resolve(`tree-${i}`)));
  assert.deepEqual(defaultPorts('.'), defaultPorts(path.resolve('.')));
  assert.deepEqual([...new Set(ports.map(p => p.port))], [SHARED_PORT]);
  assert.ok(new Set(ports.map(p => p.cdpPort)).size > 90);
  for (const p of ports) assert.ok(p.cdpPort >= 10000 && p.cdpPort < 20000);
  assert.deepEqual(portsFor({port: '5582', cdpPort: '9334'}, ports[0]), {port: 5582, cdpPort: 9334});
  assert.equal(portsFor({port: '5682'}, ports[0]).port, 5682);
  for (const port of [true, 5581, 0, 65536, 'bad']) assert.throws(() => portsFor({port}, ports[0]), /must be an even/);
  for (const cdpPort of [true, 0, 65536, 5580, 5581, 'bad']) assert.throws(() => portsFor({port: 5580, cdpPort}, ports[0]), /CDP port/);
});

test('owner accepts flag or environment, rejects mismatches, and warns for the compatibility release', () => {
  const state = {owner: 'mine'}, warnings = [];
  const options = {env: {}, warn: text => warnings.push(text)};
  requireOwner(state, {owner: 'mine'}, options);
  requireOwner(state, {}, {...options, env: {RPMCTL_OWNER: 'mine'}});
  requireOwner(state, {owner: 'mine'}, {...options, env: {RPMCTL_OWNER: 'other'}});
  assert.equal(warnings.length, 0);
  for (const owner of ['other', '', true]) assert.throws(() => requireOwner(state, {owner}, options), error =>
    /Owner token does not match/.test(error.message) && /--owner.*RPMCTL_OWNER/.test(error.fix));
  assert.throws(() => requireOwner(state, {}, {...options, env: {RPMCTL_OWNER: 'other'}}), /Owner token/);
  requireOwner(state, {}, options);
  assert.match(warnings[0], /WARNING.*Missing.*one compatibility release/);
  requireOwner(null, {}, options);
  assert.equal(warnings.length, 1);
});

test('the lease excludes a second launch, including one with the same owner', t => {
  const f = fixture(t);
  takeLease(f.state, f);
  assert.throws(() => takeLease(f.state, f), /lease is busy/);
  assert.throws(() => takeLease({...f.state, owner: 'other'}, f), /lease is busy/);
  updateLease(f.state, f);
  assertLease(f.state, f);
  takeLease(f.state, f);
  updateLease(f.state, f);
  releaseLease(f.state, f);
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test('different pairs cannot share a console port, CDP port, or worktree', t => {
  const f = fixture(t);
  takeLease(f.state, f);
  updateLease(f.state, f);
  const other = {...f.state, owner: 'other', worktree: path.join(f.root, 'other')};
  for (const state of [{...other, cdpPort: 12002}, {...other, port: 5582},
    {...other, port: 5582, cdpPort: 12002, worktree: f.state.worktree}])
    assert.throws(() => takeLease(state, f), /lease is busy/);
  assert.equal(fs.readdirSync(f.root).length, 4);
  takeLease({...other, port: 5582, cdpPort: 12002}, f);
});

test('dead emulator leases can be reclaimed, and old cleanup cannot release the new run', t => {
  const f = fixture(t);
  takeLease(f.state, f);
  updateLease(f.state, f);
  const next = {...f.state, owner: 'agent-two', pid: 54321};
  takeLease(next, {...f, alive: pid => pid === next.pid});
  updateLease(next, f);
  assert.throws(() => assertLease(f.state, f), /lease is busy/);
  releaseLease(f.state, f);
  assertLease(next, f);
  releaseLease(next, f);
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test('a live launcher reserves ports before the emulator has a pid', t => {
  const f = fixture(t);
  takeLease({...f.state, pid: undefined}, f);
  assert.throws(() => takeLease({...f.state, owner: 'other'}, f), /lease is busy/);
  takeLease({...f.state, owner: 'other'}, {...f, alive: () => false});
});

test('failed acquisition rolls back new reservations without releasing another run', t => {
  const f = fixture(t);
  takeLease(f.state, f);
  updateLease(f.state, f);
  const blocked = {...f.state, worktree: path.join(f.root, 'other'), port: 5578, owner: 'other'};
  assert.throws(() => takeLease(blocked, f), /lease is busy/);
  assert.equal(fs.readdirSync(f.root).length, 4);
  assertLease(f.state, f);
});

test('the lease is machine-wide across independent Node processes', t => {
  const f = fixture(t);
  takeLease({...f.state, pid: process.pid}, f);
  updateLease({...f.state, pid: process.pid}, f);
  const source = `import {takeLease} from ${JSON.stringify(new URL('./lib/ownership.mjs', import.meta.url).href)};
    try { takeLease(${JSON.stringify({...f.state, owner: 'second-process'})}, {root: ${JSON.stringify(f.root)}}); process.exit(2); }
    catch (e) { console.log(e.message); process.exit(e.fix ? 0 : 3); }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {encoding: 'utf8', windowsHide: true});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /lease is busy/);
});

test('the lease folder is the same whatever TMPDIR a shell sets, so agents with different TMPDIRs still exclude each other', () => {
  const at = tmp => leaseRoot({env: {TMPDIR: tmp}, platform: 'linux', home: '/home/u', tmp});
  assert.equal(at('/tmp'), at('/home/u/.cache/android-tmp'));
  assert.equal(at('/tmp'), '/home/u/.cache/rpmctl-leases');
  assert.equal(leaseRoot({env: {RPMCTL_LEASE_ROOT: '/x'}, platform: 'linux', home: '/home/u', tmp: '/tmp'}), '/x');
});

test('a busy lease names the run holding it and how to queue', t => {
  const f = fixture(t);
  takeLease(f.state, f);
  updateLease(f.state, f);
  assert.throws(() => takeLease({...f.state, owner: 'other', worktree: path.join(f.root, 'other'), cdpPort: 12002}, f), error =>
    /emulator is busy/.test(error.message) && error.message.includes(f.state.worktree) && /--wait/.test(error.fix));
});

test('a run idle past the limit can be taken over; any command it runs keeps it active', t => {
  const f = fixture(t);
  takeLease(f.state, f);
  updateLease(f.state, f);
  const other = {...f.state, owner: 'other', worktree: path.join(f.root, 'other'), cdpPort: 12002};
  assert.throws(() => takeLease(other, {...f, now: Date.now() + IDLE_MS - 60000}), /lease is busy/);
  touchLease(f.state, f);
  assert.throws(() => takeLease(other, {...f, now: Date.now() + IDLE_MS - 1000}), /lease is busy/);
  takeLease(other, {...f, now: Date.now() + IDLE_MS + 60000});
  assert.throws(() => touchLease(f.state, f), /lease is busy/);
});

test('the port counts as in use only while a live, active run holds it', t => {
  const f = fixture(t);
  assert.equal(portInUse(5580, f), false);
  takeLease(f.state, f);
  updateLease(f.state, f);
  assert.equal(portInUse(5580, f), true);
  assert.equal(portInUse(5580, {...f, alive: () => false}), false);
  assert.equal(portInUse(5580, {...f, now: Date.now() + IDLE_MS + 60000}), false);
  releaseLease(f.state, f);
  assert.equal(portInUse(5580, f), false);
});

test('the reaper stops the warm emulator only after the idle time with no run, and never one that is not its own', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const record = {pid: 7, reaperPid: 99, releasedAt: '2026-10-20T11:30:00Z', bootedAt: '2026-10-20T10:00:00Z'};
  const base = {self: 99, inUse: false, isEmulator: () => true, now, idleMs: 20 * 60000};
  assert.equal(reaperStep(record, base), 'stop');
  assert.equal(reaperStep(record, {...base, inUse: true}), 'wait');
  assert.equal(reaperStep({...record, releasedAt: '2026-10-20T11:50:00Z'}, base), 'wait');
  assert.equal(reaperStep(record, {...base, self: 100}), 'exit');
  assert.equal(reaperStep(null, base), 'exit');
  assert.equal(reaperStep(record, {...base, isEmulator: () => false}), 'forget');
});
