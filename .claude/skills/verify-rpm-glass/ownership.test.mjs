import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {defaultPorts, portsFor, requireOwner, takeLease, updateLease, assertLease, releaseLease} from './lib/ownership.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpmctl-lease-test-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const state = {pid: 12345, worktree: path.join(root, 'tree'), port: 5580, cdpPort: 12000,
    owner: 'agent-one', startedAt: '2026-10-19T00:00:00Z'};
  return {root, state, alive: () => true};
}

test('worktree ports are deterministic, console ports are even and bounded, and overrides survive', () => {
  const ports = Array.from({length: 100}, (_, i) => defaultPorts(path.resolve(`tree-${i}`)));
  assert.deepEqual(defaultPorts('.'), defaultPorts(path.resolve('.')));
  assert.ok(new Set(ports.map(p => p.port)).size > 30);
  assert.ok(new Set(ports.map(p => p.cdpPort)).size > 90);
  for (const p of ports) {
    assert.equal(p.port % 2, 0);
    assert.ok(p.port >= 5580 && p.port <= 5680);
    assert.ok(p.cdpPort >= 10000 && p.cdpPort < 20000);
  }
  assert.deepEqual(portsFor({port: '5582', cdpPort: '9334'}, ports[0]), {port: 5582, cdpPort: 9334});
  for (const port of [true, 5581, 0, 5682, 'bad']) assert.throws(() => portsFor({port}, ports[0]), /must be even/);
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
