import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_BIN = join(homedir(), '.t3/userdata/device/bin/agent-device');

export function resolveAgentDevice({ bin, config, session, serial, platform = 'android' }) {
  const agentBin = bin || process.env.PHONE_UX_AGENT_DEVICE || DEFAULT_BIN;
  const cfg = config || process.env.PHONE_UX_CONFIG || process.env.AGENT_DEVICE_CONFIG;
  const sess = session || process.env.PHONE_UX_SESSION || process.env.AGENT_DEVICE_SESSION;
  if (!cfg || !sess) {
    throw new Error(
      [
        'agent-device needs a live T3 device session.',
        'Agent: call t3-code device_open on the USB phone, then re-run with its --config and --session',
        '(or export PHONE_UX_CONFIG / PHONE_UX_SESSION).',
        'Human: open the phone in T3 Device panel first.',
      ].join(' '),
    );
  }
  if (!existsSync(agentBin)) throw new Error(`agent-device not found at ${agentBin}`);
  return {
    bin: agentBin,
    targetArgs: ['--platform', platform, '--serial', serial, '--config', cfg, '--session', sess],
  };
}

export function adRun(agent, args, { allowFail = false } = {}) {
  const started = Date.now();
  const r = spawnSync(agent.bin, [...args, ...agent.targetArgs], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
  });
  const timing = (agent.timings ??= {});
  const command = (timing[args[0]] ??= { calls: 0, ms: 0 });
  command.calls++;
  command.ms += Date.now() - started;
  if (r.error) throw r.error;
  const out = `${r.stdout || ''}${r.stderr || ''}`.trimEnd();
  if (r.status !== 0 && !allowFail) {
    throw new Error(out || `agent-device exit ${r.status}`);
  }
  return { ok: r.status === 0, status: r.status, out };
}

export function openApp(agent, packageId = 'com.rpm.prototype') {
  agent.lastSnapshot = null;
  return adRun(agent, ['open', packageId, '--foreground']);
}

export function snapshot(agent, { fresh = false } = {}) {
  if (!fresh && agent.lastSnapshot) return agent.lastSnapshot;
  agent.lastSnapshot = null;
  const result = adRun(agent, ['snapshot', '-i'], { allowFail: true });
  if (result.ok) agent.lastSnapshot = result;
  return result;
}

/** Parse `@e12 [button] "More"` lines into { ref, role, label }. */
export function parseSnapshot(out) {
  const nodes = [];
  for (const line of String(out || '').split('\n')) {
    const m = line.match(/^(@e\d+(?:~s\d+)?)\s+\[([^\]]+)\]\s+"([^"]*)"/);
    if (!m) continue;
    nodes.push({ ref: m[1], role: m[2], label: m[3], selected: line.includes('[selected]') });
  }
  return nodes;
}

export function findLabel(nodes, needle, { role } = {}) {
  const n = String(needle).toLowerCase();
  const pool = role ? nodes.filter((x) => x.role === role || x.role.startsWith(role)) : nodes;
  return (
    pool.find((x) => x.label.toLowerCase() === n) ||
    pool.find((x) => x.label.toLowerCase().startsWith(n)) ||
    pool.find((x) => x.label.toLowerCase().includes(n)) ||
    null
  );
}

export function clickRef(agent, ref) {
  agent.lastSnapshot = null;
  return adRun(agent, ['click', ref], { allowFail: false });
}

export function clickRefSoft(agent, ref) {
  agent.lastSnapshot = null;
  return adRun(agent, ['click', ref], { allowFail: true });
}

/** Snapshot, find label (substring ok), click its ref. */
export function clickLabel(agent, needle, { role, soft = true } = {}) {
  const snap = snapshot(agent);
  const nodes = parseSnapshot(snap.out);
  const hit = findLabel(nodes, needle, { role });
  if (!hit) {
    if (soft) return { ok: false, status: 1, out: `No label matching ${needle}`, nodes };
    throw new Error(`No label matching ${JSON.stringify(needle)}. Saw: ${nodes.slice(0, 12).map((n) => n.label).join(' | ')}`);
  }
  const r = soft ? clickRefSoft(agent, hit.ref) : clickRef(agent, hit.ref);
  return { ...r, hit };
}

/** Try several label needles; first hit wins. Soft miss is ok:false unless optional. */
export function clickAnyLabel(agent, needles, { role, soft = true, optional = false } = {}) {
  const snap = snapshot(agent);
  const nodes = parseSnapshot(snap.out);
  for (const needle of needles || []) {
    const hit = findLabel(nodes, needle, { role });
    if (!hit) continue;
    const r = soft ? clickRefSoft(agent, hit.ref) : clickRef(agent, hit.ref);
    return { ...r, hit, matched: needle };
  }
  if (optional || soft) {
    return { ok: optional ? true : false, status: 1, out: `No label matching any of ${JSON.stringify(needles)}`, skipped: true, nodes };
  }
  throw new Error(`No label matching any of ${JSON.stringify(needles)}`);
}

export function longpressLabel(agent, needle, { role, soft = true, optional = false } = {}) {
  const snap = snapshot(agent);
  const nodes = parseSnapshot(snap.out);
  const hit = findLabel(nodes, needle, { role });
  if (!hit) {
    if (optional || soft) return { ok: optional ? true : false, status: 1, out: `No label matching ${needle}`, skipped: true, nodes };
    throw new Error(`No label matching ${JSON.stringify(needle)}`);
  }
  agent.lastSnapshot = null;
  const r = adRun(agent, ['longpress', hit.ref], { allowFail: soft || optional });
  return { ...r, hit, ok: optional ? true : r.ok };
}

export function pressHome(agent) {
  agent.lastSnapshot = null;
  return adRun(agent, ['key', 'home'], { allowFail: true });
}

export function surfaceLooksLikeLauncher(out) {
  const s = String(out || '');
  return /Google Search|Page \d+ of \d+|Open Easy Voice Recorder|Translucent recorder/i.test(s)
    && !/planner|Capture a thought|nav-bar|Wheel of Life|Weekly review/i.test(s);
}

export function surfaceHas(out, needle) {
  return String(out || '').toLowerCase().includes(String(needle).toLowerCase());
}

export function surfaceMatches(out, { expect, expects, selected }) {
  const textOk = expects?.length
    ? expects.some((needle) => surfaceHas(out, needle))
    : (!expect || surfaceHas(out, expect));
  return textOk && (!selected || parseSnapshot(out).some((n) => n.label === selected && n.selected));
}

export function ensureApp(agent) {
  const snap = snapshot(agent);
  if (surfaceLooksLikeLauncher(snap.out) || !surfaceHas(snap.out, 'com.rpm.prototype') && !surfaceHas(snap.out, 'Capture') && !surfaceHas(snap.out, 'planner') && !surfaceHas(snap.out, 'Today') && !surfaceHas(snap.out, 'Life')) {
    openApp(agent);
    return { recovered: true, snap: snapshot(agent) };
  }
  // Also recover if we only see Edge panels
  const nodes = parseSnapshot(snap.out);
  if (nodes.length > 0 && nodes.every((n) => /Edge panels|status/i.test(n.label) || !n.label)) {
    openApp(agent);
    return { recovered: true, snap: snapshot(agent) };
  }
  return { recovered: false, snap };
}

export function back(agent) {
  agent.lastSnapshot = null;
  return adRun(agent, ['back'], { allowFail: true });
}

export function screenshotFile(agent, path) {
  return adRun(agent, ['screenshot', path], { allowFail: true });
}

export function waitText(agent, text) {
  agent.lastSnapshot = null;
  return adRun(agent, ['wait', 'text', text], { allowFail: true });
}

/** Prefer exact text= for multi-word labels (`text="Weekly review"`). */
export function clickTextSoft(agent, text) {
  agent.lastSnapshot = null;
  return adRun(agent, ['click', `text=${JSON.stringify(text)}`], { allowFail: true });
}
