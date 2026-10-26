import {applyRecord, projectRecords} from '../web/contract/records.mjs';
import {validatePlanner} from './planner-validation.mjs';
import {rebaseUndo} from './undo-rebase.mjs';
import {initializeTaskIds, PHONE_TASK_ID_CEILING} from './task-ids.mjs';
import {changedGroups, copyGroups, equal, knownRecord} from './replica-groups.mjs';
import {changedUnderneath} from './save-retry.mjs';

const dependency = key => ({area: 0, goal: 1, project: 2, block: 3}[key.split(':')[0]] ?? 4);
const ordered = keys => [...keys].sort((a, b) => dependency(a) - dependency(b) || a.localeCompare(b));
const valueOf = (records, key) => records.get(key) ?? null;

export function localChanges(store) {
  const records = projectRecords(store), sync = store.sync ?? {}, base = sync.base ?? {}, changes = [];
  for (const key of ordered(new Set([...records.keys(), ...Object.keys(base).filter(knownRecord)]))) {
    const before = base[key]?.value ?? null, value = valueOf(records, key);
    if (equal(before, value) || sync.restoredAt && value === null) continue;
    const groups = changedGroups(key, before, value);
    const stamps = Object.fromEntries(groups.map(group => [group, sync.stamps?.[key]?.[group] ?? store.syncSavedAt]));
    changes.push({key, baseRev: base[key]?.rev ?? null, base: structuredClone(before), value: structuredClone(value), stamps});
  }
  return changes;
}

async function pullAll(pull, after) {
  const rows = [];
  let page;
  do {
    page = await pull({after, limit: 500});
    rows.push(...page.rows);
    after = page.cursor;
  } while (page.hasMore);
  return {rows, cursor: after, seededAt: page.seededAt};
}

function partsOf(outbox) {
  const parts = [], bytes = new TextEncoder();
  let changes = [];
  const body = (items, final = false) => ({seq: outbox.seq, part: parts.length, final, changes: items});
  for (const change of outbox.changes) {
    const candidate = [...changes, change];
    if (candidate.length > 200 || bytes.encode(JSON.stringify(body(candidate))).length > 800000) {
      if (!changes.length) throw new Error('A planner record exceeds the 800 KB sync part limit.');
      parts.push(body(changes)); changes = [];
    }
    changes.push(change);
    if (bytes.encode(JSON.stringify(body(changes))).length > 800000) throw new Error('A planner record exceeds the 800 KB sync part limit.');
  }
  parts.push(body(changes, true));
  return parts;
}

function mergeLive(key, sent, server, live) {
  if (equal(live, sent)) return structuredClone(server);
  if (live === null || server === null) return structuredClone(live);
  const moved = new Set(changedGroups(key, sent, live));
  return copyGroups(key, live, server, changedGroups(key, live, server).filter(group => !moved.has(group)));
}

// A live edit made after the outbox froze never reached the server. Where the server moved the same group meanwhile,
// keep the frozen value as that record's base (rev 0 matches no server rev), so the server merges both by the newer-wins rule.
function frozenAncestor(key, sent, server, live) {
  if (equal(live, sent) || equal(server, sent) || equal(live, server)) return undefined;
  if (live === null || server === null || sent === null) return sent;
  const serverMoved = changedGroups(key, sent, server), differ = changedGroups(key, live, server);
  const contested = changedGroups(key, sent, live).filter(group => serverMoved.includes(group) && differ.includes(group));
  return contested.length ? copyGroups(key, server, sent, contested) : undefined;
}

function freeze(store, initial) {
  const next = structuredClone(store);
  const sync = next.sync = {cursor: 0, base: {}, stamps: {}, outbox: null, seq: 0, remoteActivity: {}, ...next.sync};
  const adopting = !store.sync?.base && initial;
  if (adopting) {
    sync.cursor = initial.cursor;
    sync.base = Object.fromEntries(initial.rows.map(({key, rev, value}) => [key, {rev, value: structuredClone(value)}]));
    const local = projectRecords(next), creates = [];
    for (const {key, value} of initial.rows) if (knownRecord(key) && value !== null && !local.has(key)) {
      applyRecord(next, key, value); creates.push({key, sent: null, server: value});
    }
    rebaseUndo(next, creates);
  }
  initializeTaskIds(next);
  const changes = localChanges(next);
  if (adopting && (initial.seededAt != null || initial.rows.length)) for (const change of changes) {
    // Re-pairing has no shared edit ancestor; a current rev would bypass timestamp merging.
    change.baseRev = null; change.base = null;
    for (const group of Object.keys(change.stamps)) change.stamps[group] = next.syncSavedAt;
  }
  const records = projectRecords(next);
  sync.outbox = {seq: sync.seq + 1,
    sent: Object.fromEntries([...new Set([...Object.keys(sync.base), ...records.keys()])].map(key => [key, valueOf(records, key)])), changes};
  sync.seq = sync.outbox.seq;
  return next;
}

function apply(store, outbox, rows, cursor) {
  const next = structuredClone(store), sync = next.sync, records = projectRecords(store);
  const server = new Map(Object.entries(sync.base).map(([key, row]) => [key, {key, ...row}]));
  for (const row of rows) if (!server.has(row.key) || server.get(row.key).rev <= row.rev) server.set(row.key, row);
  const applied = [], ancestors = new Map();
  for (const key of ordered(server.keys())) {
    const row = server.get(key);
    if (!knownRecord(key)) continue;
    const sent = outbox.sent[key] ?? null, live = valueOf(records, key);
    const restoring = sync.restoredAt && live === null, value = restoring ? row.value : mergeLive(key, sent, row.value, live);
    const ancestor = restoring ? undefined : frozenAncestor(key, sent, row.value, live);
    if (ancestor !== undefined) ancestors.set(key, {rev: 0, value: structuredClone(ancestor)});
    applyRecord(next, key, value);
    if (key.startsWith('task:') && row.value?.id < PHONE_TASK_ID_CEILING)
      sync.nextTaskId = Math.max(sync.nextTaskId, row.value.id + 1);
    applied.push({key, sent, server: row.value});
  }
  rebaseUndo(next, applied);
  validatePlanner(next);
  sync.base = Object.fromEntries([...server].map(([key, {rev, value}]) => [key, ancestors.get(key) ?? {rev, value: structuredClone(value)}]));
  sync.cursor = cursor; sync.outbox = null;
  // Retain edit times only where live groups still differ from the new server base.
  const remaining = localChanges(next), stamps = {};
  for (const change of remaining) stamps[change.key] = change.stamps;
  sync.stamps = stamps;
  delete sync.restoredAt;
  return next;
}

export async function syncReplica({load, save, push, pull, now = () => new Date()}) {
  // Sync writes preserve syncSavedAt: it dates the user's edits, not network traffic.
  const saveNext = async (store, next) => {
    next.version = store.version + 1;
    await save(store.version, next, {origin: 'sync'});
  };
  let store = await load(), initial;
  if (!store.sync?.base) initial = await pullAll(pull, 0);
  else if (!store.sync.outbox && !store.sync.restoredAt && !localChanges(store).length) {
    // Idle syncs write nothing, so they cannot make a planner save meet a changed version.
    const news = await pullAll(pull, store.sync.cursor);
    if (!news.rows.length && news.seededAt != null) return store;
  }
  for (;;) {
    if (store.sync?.outbox) break;
    const next = freeze(store, initial);
    // Older stores may predate syncSavedAt; use the injected clock only for that migration.
    if (!next.syncSavedAt) {
      next.syncSavedAt = new Date(now()).toISOString();
      for (const change of next.sync.outbox.changes) for (const group of Object.keys(change.stamps)) change.stamps[group] ??= next.syncSavedAt;
    }
    try { await saveNext(store, next); store = next; break; }
    catch (error) { if (!changedUnderneath(error)) throw error; store = await load(); }
  }
  const outbox = structuredClone(store.sync.outbox), received = [];
  for (const body of partsOf(outbox)) {
    const receipt = await push(body);
    received.push(...receipt.results);
  }
  const pulled = await pullAll(pull, store.sync.cursor);
  received.push(...pulled.rows);
  for (;;) {
    store = await load();
    if (store.sync.outbox?.seq !== outbox.seq) return store;
    const next = apply(store, outbox, received, pulled.cursor);
    try { await saveNext(store, next); return next; }
    catch (error) { if (!changedUnderneath(error)) throw error; }
  }
}
