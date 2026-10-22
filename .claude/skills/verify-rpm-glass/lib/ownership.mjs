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

/** One place per user, whatever TMPDIR a shell sets, so every agent on the machine sees the same leases. */
export function leaseRoot({env = process.env, platform = process.platform, home = os.homedir(), tmp = os.tmpdir()} = {}) {
  if (env.RPMCTL_LEASE_ROOT) return env.RPMCTL_LEASE_ROOT;
  return platform === 'win32' ? path.join(tmp, 'rpmctl-leases') : path.join(home, '.cache', 'rpmctl-leases');
}
export const LEASE_ROOT = leaseRoot();

/** Every worktree drives the same warm emulator on this console port; only the DevTools port is per worktree. */
export const SHARED_PORT = 5580;
export const IDLE_MS = Number(process.env.RPMCTL_IDLE_MINUTES ?? 20) * 60000;

export function defaultPorts(worktree) {
  const digest = hash(worktreeKey(worktree));
  return {port: SHARED_PORT, cdpPort: 10000 + parseInt(digest.slice(8, 16), 16) % 10000};
}

export function portsFor(args, defaults) {
  const port = Number(args.port ?? defaults.port), cdpPort = Number(args.cdpPort ?? defaults.cdpPort);
  if (!Number.isInteger(port) || port < 1024 || port > 65534 || port % 2)
    throw new UserError('The emulator console port must be an even TCP port between 1024 and 65534.', `Use --port ${SHARED_PORT}, or omit --port for the shared emulator.`);
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

const readJson = file => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
};
const writeJson = (file, record) => {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(record));
  fs.renameSync(temporary, file);
};
const readRecord = dir => readJson(path.join(dir, 'lease.json'));
const writeRecord = (dir, record) => writeJson(path.join(dir, 'lease.json'), record);
const sameRun = (a, b) => a?.owner === b.owner && worktreeKey(a.worktree) === worktreeKey(b.worktree);
const lastActive = record => record.lastActive ?? (Date.parse(record.startedAt) || 0);
export const idle = (record, now = Date.now()) => now - lastActive(record) > IDLE_MS;
const live = (record, alive, now) => record && (record.launching && alive(record.pid) || alive(record.emulatorPid) && !idle(record, now));

export function busyError(dir, record, now = Date.now()) {
  const minutes = record ? Math.max(0, Math.round((now - lastActive(record)) / 60000)) : null;
  const who = record?.worktree ? `${record.worktree} has driven it since ${record.startedAt}, last command ${minutes} min ago` : `lease ${dir} is held`;
  return new UserError(`The emulator is busy: ${who}. rpmctl lease is busy at ${dir}.`,
    `Retry after that run's \`rpmctl cleanup\`, or queue with \`rpmctl launch --wait 900\`. A run idle for ${IDLE_MS / 60000} min can be taken over.`);
}

function guarded(dir, fn) {
  const guard = `${dir}.guard`;
  try { fs.mkdirSync(guard); }
  catch (e) { if (e.code === 'EEXIST') throw busyError(guard, null); throw e; }
  try { return fn(); }
  finally { fs.rmdirSync(guard); }
}

export function takeLease(state, {root = LEASE_ROOT, alive = processAlive, now = Date.now()} = {}) {
  fs.mkdirSync(root, {recursive: true});
  const claimed = [];
  try {
    for (const dir of resources(state, root)) guarded(dir, () => {
      const previous = readRecord(dir);
      if (fs.existsSync(dir) && !previous) throw busyError(dir, null, now);
      if (live(previous, alive, now) && (!sameRun(previous, state) || previous.launching && alive(previous.pid))) throw busyError(dir, previous, now);
      if (fs.existsSync(dir) && !sameRun(previous, state)) fs.rmSync(dir, {recursive: true});
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      const record = {pid: process.pid, emulatorPid: state.pid ?? null, worktree: state.worktree,
        startedAt: state.startedAt, owner: state.owner, port: state.port, cdpPort: state.cdpPort, launching: true, lastActive: now};
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
    if (!sameRun(record, state)) throw busyError(dir, record);
    writeRecord(dir, {...record, pid: process.pid, emulatorPid: state.pid ?? null, launching, lastActive: Date.now()});
  });
}

export function assertLease(state, {root = LEASE_ROOT} = {}) {
  if (!state.owner) return;
  for (const dir of resources(state, root)) {
    const record = readRecord(dir);
    if (!sameRun(record, state) || record.emulatorPid !== state.pid) throw busyError(dir, record);
  }
}

/** Marks the run active, so its lease is not taken over as idle while the agent is still driving. */
export function touchLease(state, {root = LEASE_ROOT, now = Date.now()} = {}) {
  if (!state.owner) return;
  assertLease(state, {root});
  for (const dir of resources(state, root)) guarded(dir, () => {
    const record = readRecord(dir);
    if (sameRun(record, state)) writeRecord(dir, {...record, lastActive: now});
  });
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

/** True while some run holds the console port's lease, so the shared emulator must stay up. */
export function portInUse(port, {root = LEASE_ROOT, alive = processAlive, now = Date.now()} = {}) {
  return live(readRecord(path.join(root, `tcp-${port}`)), alive, now) ?? false;
}

const emulatorFile = (port, root) => path.join(root, `emulator-${port}.json`);
/** The warm emulator rpmctl booted on this port: pid, serial, AVD, launch flags, and which APK it has installed. */
export const readEmulator = (port, {root = LEASE_ROOT} = {}) => readJson(emulatorFile(port, root));
export function saveEmulator(port, record, {root = LEASE_ROOT} = {}) {
  fs.mkdirSync(root, {recursive: true});
  writeJson(emulatorFile(port, root), record);
}
export const dropEmulator = (port, {root = LEASE_ROOT} = {}) => fs.rmSync(emulatorFile(port, root), {force: true});
