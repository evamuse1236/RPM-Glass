import crypto from 'node:crypto';
import {ROOT} from '../lib/runtime.mjs';
import {startLocalConvex} from '../lib/local-convex.mjs';
import {openBlock, sleep} from './lib.mjs';

export const id = 'web-sync-offline';
export const inAll = false;
export const rule = 'A title changed on an offline phone and later on the website keeps the website title and moves the phone title into the notes, and the website add and completion reach the phone once it is back online.';
export const enforces = 'Unit 7 of the standalone planner: two-way sync proven on the real app against a local Convex, not the Node stand-in.';

const T_TITLE = 'Draft my section of the critical review';
const OTHER_TITLE = 'Run the plagiarism report and attach it';
const ADDED = 'Added on the web';

async function until(what, check, {timeout = 90000, every = 2000} = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try { last = await check(); if (last?.done) return last; } catch (error) { last = {error: error.message}; }
    await sleep(every);
  }
  throw Object.assign(new Error(`Timed out after ${timeout / 1000}s waiting for ${what}`), {detail: last});
}

function web(convex, token) {
  const call = async (method, path, body) => {
    const res = await fetch(`${convex.siteUrl}${path}`, {method, headers: {Authorization: `Bearer ${token}`, ...(body ? {'Content-Type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined});
    const text = await res.text();
    return {status: res.status, json: text ? JSON.parse(text) : null};
  };
  return {
    snapshot: async () => { const out = await call('GET', '/v1/web/snapshot'); if (out.status !== 200) throw new Error(`snapshot ${out.status} ${JSON.stringify(out.json)}`); return out.json; },
    send: (snapshot, type, args) => call('POST', '/v1/web/commands', {id: crypto.randomUUID(), type, args, baseRevision: snapshot.revision, createdAt: new Date().toISOString()}),
  };
}

async function network(t, on) {
  t.shell(`svc wifi ${on ? 'enable' : 'disable'}`);
  t.shell(`svc data ${on ? 'enable' : 'disable'}`);
  const reaches = () => t.shell('ping -c1 -W2 10.0.2.2 >/dev/null 2>&1 && echo reach || echo none').trim() === 'reach';
  await until(on ? 'the network to come back' : 'the network to go down', () => ({done: reaches() === on}), {timeout: 30000, every: 1000});
}
const byTitle = (entries, title) => entries.find(e => e.title === title);

export async function run(t) {
  await t.do('display', 'phone');
  await t.do('seed');
  const seeded = (await t.store()).entries;
  const task = byTitle(seeded, T_TITLE), other = byTitle(seeded, OTHER_TITLE);
  t.expect(task?.blockId && !task.done && other && !other.done, 'The seed should hold both open tasks this scenario edits', {task, other});

  const convex = await startLocalConvex(ROOT);
  t.facts.convex = {siteUrl: convex.siteUrl, log: convex.logFile};
  try {
    const {code} = convex.run('admin:createPairingCode', {label: 'Emulator'});
    const paired = t.shell(`am broadcast -n com.rpm.prototype/.DebugPairReceiver --es url http://10.0.2.2:${convex.port} --es code ${code}`);
    t.expect(/result=1/.test(paired), 'The debug build should pair with the local Convex', paired.trim());
    await t.do('open', 'planner');

    const {token} = await until('the phone to seed the server', () => ({done: true, ...convex.run('admin:createWebSession', {label: 'Scenario browser'})}));
    const site = web(convex, token);
    const first = await until('the first snapshot', async () => {
      const snap = await site.snapshot();
      return {done: !!byTitle(snap.entries ?? [], T_TITLE), snap};
    });
    t.facts.snapshotKeys = Object.keys(first.snap);

    await network(t, false);
    t.facts.offline = t.shell('dumpsys connectivity | grep -m1 "Active default network"').trim();
    const frozen = await until('the phone to hold its first offline outbox', async () => {
      const store = await t.store();
      return {done: !!store.sync?.outbox, version: store.version};
    }, {timeout: 45000, every: 1000});
    await t.do('key', 'home');
    await t.do('open', 'planner');
    t.facts.offlineOutboxVersion = frozen.version;
    await openBlock(t);
    await t.do('tap', '--role', 'button', '--name', T_TITLE);
    await t.do('tap', '--role', 'textbox', '--name', 'Task title');
    await t.read(() => document.activeElement.select());
    await t.do('type', 'Phone title');
    await t.do('key', 'enter');
    await until('the phone to save its title', async () => ({done: byTitle((await t.store()).entries, 'Phone title')?.id === task.id}), {timeout: 15000, every: 500});
    if (t.keyboardShown()) await t.do('key', 'back');
    await t.do('key', 'back');
    await t.do('wait', '--role', 'button', '--name', 'Blocks');
    await sleep(5000);
    const whileOffline = await site.snapshot();
    t.facts.serverTitleWhileOffline = whileOffline.entries.find(e => e.id === task.id)?.title;
    t.expect(t.facts.serverTitleWhileOffline === T_TITLE, 'The phone reached the server while its network was off', t.facts);

    await sleep(2000);
    const sent = [
      await site.send(whileOffline, 'plan', {op: {type: 'saveTask', id: null, fields: {title: ADDED, blockId: task.blockId}}}),
      await site.send(whileOffline, 'complete', {taskId: other.id}),
      await site.send(whileOffline, 'edit', {taskId: task.id, fields: {title: 'Website title'}}),
    ];
    t.facts.sent = sent.map(r => r.status);
    t.expect(sent.every(r => r.status === 200 || r.status === 202), 'The website commands should be accepted', sent);

    await network(t, true);
    await t.do('key', 'home');
    await t.do('open', 'planner');

    const landed = await until('the website changes to reach the phone', async () => {
      const entries = (await t.store()).entries;
      const now = {added: byTitle(entries, ADDED), other: entries.find(e => e.id === other.id), task: entries.find(e => e.id === task.id)};
      return {done: !!now.added && now.other?.done === true && now.task?.title === 'Website title' && /Phone title/.test(now.task?.notes ?? ''), now};
    }, {timeout: 120000});
    t.facts.phone = {added: landed.now.added?.blockId, otherDone: landed.now.other?.done, title: landed.now.task?.title, notes: landed.now.task?.notes};

    const conflicts = await until('a conflict for the task', async () => {
      const list = (await site.snapshot()).conflicts ?? [];
      return {done: list.some(c => c.key === `task:${task.id}`), list};
    }, {timeout: 30000});
    t.facts.conflict = conflicts.list.filter(c => c.key === `task:${task.id}`).map(c => ({group: c.group, lostFrom: c.lostFrom, kept: c.kept, lost: c.lost}));

    await openBlock(t);
    await t.do('wait', '--role', 'button', '--name', ADDED);
    await t.shot('planner');
  } finally {
    try { await network(t, true); } finally { await convex.stop(); }
  }
}
