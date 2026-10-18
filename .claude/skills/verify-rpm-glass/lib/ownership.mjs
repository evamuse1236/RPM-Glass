import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {UserError, processAlive} from './device.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const worktreeKey = value => {
  const resolved = path.resolve(value).replace(/\\/g, '/');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};
export const LEASE_ROOT = path.join(os.tmpdir(), 'rpmctl-leases');

export function defaultPorts(worktree) {
  const digest = hash(worktreeKey(worktree));
  return {port: 5580 + (parseInt(digest.slice(0, 8), 16) % 51) * 2,
    cdpPort: 10000 + parseInt(digest.slice(8, 16), 16) % 10000};
}

export function portsFor(args, defaults) {
  const port = Number(args.port ?? defaults.port), cdpPort = Number(args.cdpPort ?? defaults.cdpPort);
  if (!Number.isInteger(port) || port < 5554 || port > 5680 || port % 2)
    throw new UserError('The emulator console port must be even and between 5554 and 5680.', 'Use --port 5580, or omit --port for the worktree default.');
  if (!Number.isInteger(cdpPort) || cdpPort < 1024 || cdpPort > 65535 || [port, port + 1].includes(cdpPort))
    throw new UserError('The CDP port must be between 1024 and 65535 and separate from both emulator ports.', 'Choose another --cdp-port, or omit it for the worktree default.');
  return {port, cdpPort};
}

export function requireOwner(state, args, {env = process.env, warn = message => console.error(message)} = {}) {
  if (!state) return;
  const token = args.owner ?? env.RPMCTL_OWNER;
  const fix = 'Use --owner <owner from launch> or export RPMCTL_OWNER=<owner from launch>. Only the launching agent should drive this run.';
  if (token !== undefined && (typeof token !== 'string' || !token || token !== state.owner))
    throw new UserError('Owner token does not match this rpmctl run; refusing to change it.', fix);
  if (token === undefined) warn(`WARNING: Missing rpmctl owner token. Allowed for one compatibility release; a future release will refuse. ${fix}`);
}

function resources(state, root) {
  return [`worktree-${hash(worktreeKey(state.worktree)).slice(0, 24)}`,
    ...[state.port, state.port + 1, state.cdpPort].sort((a, b) => a - b).map(port => `tcp-${port}`)]
    .map(name => path.join(root, name));
}

const readRecord = dir => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'lease.json'), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
};
const writeRecord = (dir, record) => fs.writeFileSync(path.join(dir, 'lease.json'), JSON.stringify(record));
const sameRun = (a, b) => a?.owner === b.owner && worktreeKey(a.worktree) === worktreeKey(b.worktree);
const live = (record, alive) => record && (record.launching && alive(record.pid) || alive(record.emulatorPid));
const busy = dir => new UserError(`rpmctl lease is busy at ${dir}.`, 'Another agent owns or is launching this run. Wait for its cleanup, or choose another worktree and free --port / --cdp-port.');

function guarded(dir, fn) {
  const guard = `${dir}.guard`;
  try { fs.mkdirSync(guard); }
  catch (e) { if (e.code === 'EEXIST') throw busy(guard); throw e; }
  try { return fn(); }
  finally { fs.rmdirSync(guard); }
}

export function takeLease(state, {root = LEASE_ROOT, alive = processAlive} = {}) {
  fs.mkdirSync(root, {recursive: true});
  const claimed = [];
  try {
    for (const dir of resources(state, root)) guarded(dir, () => {
      const previous = readRecord(dir);
      if (fs.existsSync(dir) && !previous) throw busy(dir);
      if (live(previous, alive) && (!sameRun(previous, state) || previous.launching && alive(previous.pid))) throw busy(dir);
      if (fs.existsSync(dir) && !sameRun(previous, state)) fs.rmSync(dir, {recursive: true});
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      const record = {pid: process.pid, emulatorPid: state.pid ?? null, worktree: state.worktree,
        startedAt: state.startedAt, owner: state.owner, port: state.port, cdpPort: state.cdpPort, launching: true};
      writeRecord(dir, record);
      claimed.push({dir, previous});
    });
  } catch (error) {
    for (const {dir, previous} of claimed.reverse()) guarded(dir, () => {
      if (!sameRun(readRecord(dir), state)) return;
      if (previous) writeRecord(dir, previous); else fs.rmSync(dir, {recursive: true});
    });
    throw error;
  }
}

export function updateLease(state, {launching = false, root = LEASE_ROOT} = {}) {
  for (const dir of resources(state, root)) guarded(dir, () => {
    const record = readRecord(dir);
    if (!sameRun(record, state)) throw busy(dir);
    writeRecord(dir, {...record, pid: process.pid, emulatorPid: state.pid ?? null, launching});
  });
}

export function assertLease(state, {root = LEASE_ROOT} = {}) {
  if (!state.owner) return;
  for (const dir of resources(state, root)) {
    const record = readRecord(dir);
    if (!sameRun(record, state) || record.emulatorPid !== state.pid) throw busy(dir);
  }
}

export function releaseLease(state, {root = LEASE_ROOT} = {}) {
  if (!state.owner) return;
  for (const dir of resources(state, root)) {
    if (!fs.existsSync(dir)) continue;
    guarded(dir, () => {
      if (sameRun(readRecord(dir), state)) fs.rmSync(dir, {recursive: true});
    });
  }
}
