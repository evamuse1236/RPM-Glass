import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pickPhone, shell } from './adb.mjs';

const T3_ROOT = join(homedir(), '.t3/userdata/device');

/** Newest T3 agent-device session id (folder name), or null. */
export function latestSessionId() {
  const root = join(T3_ROOT, 'agent-device/sessions');
  if (!existsSync(root)) return null;
  const dirs = readdirSync(root)
    .filter((n) => n.startsWith('t3-'))
    .map((n) => {
      try {
        return { id: n, mtime: statSync(join(root, n)).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
  return dirs[0]?.id || null;
}

/** Newest host config json under hosts/. */
export function latestHostConfig() {
  const root = join(T3_ROOT, 'hosts');
  if (!existsSync(root)) return null;
  const files = readdirSync(root).filter((n) => n.endsWith('.json'));
  if (!files.length) return null;
  const ranked = files
    .map((n) => {
      try {
        return { path: join(root, n), mtime: statSync(join(root, n)).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
  return ranked[0]?.path || null;
}

export function defaultAgentBin() {
  return join(T3_ROOT, 'bin/agent-device');
}

/**
 * Fill missing serial/config/session from the live USB phone + newest T3 session.
 * Still requires that someone called device_open recently (session must exist).
 */
export function resolveSessionArgs(partial = {}) {
  const serial =
    partial.serial ||
    process.env.PHONE_UX_SERIAL ||
    pickPhone().serial;
  const config = partial.config || process.env.PHONE_UX_CONFIG || latestHostConfig();
  const session = partial.session || process.env.PHONE_UX_SESSION || latestSessionId();
  const agentDevice = partial.agentDevice || process.env.PHONE_UX_AGENT_DEVICE || defaultAgentBin();
  return { serial, config, session, agentDevice };
}

export function batteryLevel(serial) {
  try {
    const out = shell(serial, 'dumpsys battery', { allowFail: true });
    const m = String(out).match(/^\s*level:\s*(\d+)/m);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}
