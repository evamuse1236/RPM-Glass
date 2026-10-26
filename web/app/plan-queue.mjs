import {assertPlanOp, editPlan} from '../../android-companion/planner-state.mjs';
import {targets} from '../../android-companion/web-sync-targets.mjs';
import {withIds} from '../../android-companion/new-id.mjs';
import {SERVER_TASK_IDS} from '../../android-companion/task-ids.mjs';
import {validateCommand, validatePlanOp} from '../contract/validate.mjs';

const KEY = 'rpm.web.plan.v1';
const FAILED = new Set(['rejected', 'conflict']);
const ID_KEYS = new Set(['id', 'ids', 'blockId', 'projectId', 'goalId', 'areaId', 'taskIds', 'routineId']);
export const WAITING = 'This is still waiting for your phone. Try again once your phone has saved it.';
export const FALLBACK = 'Your phone did not save this change.';

/** The planner's store as the phone last saved it. */
export function storeFrom(snapshot) {
  return {version: snapshot.revision, entries: structuredClone(snapshot.entries).map(entry => ({revisions: [], ...entry})), planner: structuredClone(snapshot.planner), sync: {taskIdRange: SERVER_TASK_IDS}};
}

function idsOf(store) {
  const p = store.planner ?? {};
  return new Set([...store.entries.map(e => e.id), ...['projects', 'blocks', 'areas', 'goals'].flatMap(c => (p[c] ?? []).map(r => r.id)),
    ...(p.body?.routines ?? []).map(r => r.id), ...(p.body?.meals ?? []).map(m => m.id)]);
}

function named(value, key = null, out = []) {
  if (Array.isArray(value)) value.forEach(item => named(item, key, out));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => named(v, k, out));
  else if (ID_KEYS.has(key) && value != null) out.push(value);
  return out;
}

const targetIds = list => list.flatMap(t => t.id == null ? [] : [t.id]);
const overlaps = (a, b) => a.some(x => b.some(y => JSON.stringify(x) === JSON.stringify(y)));

/**
 * The browser's plan: the phone's latest snapshot with this browser's unsaved changes laid over it.
 * Every change becomes one `plan` command; the phone stays the only writer.
 */
export function createPlanQueue({client, storage = globalThis.localStorage, now = () => new Date(), uuid = () => globalThis.crypto.randomUUID()}) {
  const saved = JSON.parse(storage.getItem(KEY) ?? 'null') ?? {};
  let records = saved.records ?? [];
  let problems = saved.problems ?? [];
  let seen = saved.seen ?? null;
  let view = null;
  let version = 0;
  let lastUndo = null;
  const listeners = new Set();
  const persist = () => storage.setItem(KEY, JSON.stringify({records, problems, seen}));
  const entryOf = id => client.state.outbox.find(e => e.command.id === id);
  const snapshot = () => client.state.snapshot;

  function edit(store, rec, op) {
    const {result, ids} = withIds(rec.uuids ?? [], () => editPlan(store, op, new Date(rec.at)));
    rec.uuids ??= ids;
    return result;
  }

  function replay(store, rec) {
    if (rec.kind === 'undo') {
      const reviews = store.planner.reviews;
      Object.assign(store, structuredClone(rec.restore));
      store.planner.reviews = reviews;
      store.planner.undo = null;
      return;
    }
    edit(store, rec, rec.op);
  }

  function command(rec) {
    const base = {id: rec.id, createdAt: rec.at, baseRevision: rec.baseRevision};
    return validateCommand(rec.kind === 'undo' ? {...base, type: 'undo', args: {commandId: rec.targetId}} : {...base, type: 'plan', args: {op: rec.op, ids: rec.uuids ?? []}});
  }

  function settle() {
    const sends = [];
    const failed = [];
    let createdSaved = false;
    records = records.filter(rec => {
      if (rec.held || !rec.sent || rec.posting) return true;
      const entry = entryOf(rec.id);
      if (entry && !client.settled(entry)) return true;
      if (entry && FAILED.has(entry.status)) failed.push({ids: rec.ids, message: entry.message || FALLBACK});
      if (rec.created?.length) createdSaved = true;
      return false;
    });
    for (const rec of records) {
      if (rec.kind === 'undo' && !rec.sent) {
        const target = entryOf(rec.targetId);
        if (target && FAILED.has(target.status)) rec.dropped = true;
        else if (target?.status === 'applied' || !target && !records.some(r => r.id === rec.targetId)) sends.push(rec);
      } else if (rec.held && !records.some(r => r.id === rec.after)) sends.push(rec);
      else if (rec.posting) {
        if (entryOf(rec.id)) rec.posting = false;
        else sends.push(rec);
      }
    }
    records = records.filter(rec => !rec.dropped);
    for (const rec of sends) if (!rec.posting) Object.assign(rec, {held: false, sent: true, posting: true, baseRevision: snapshot().revision});
    return {sends, failed, createdSaved};
  }

  function mine() {
    return new Set(client.state.outbox.filter(e => e.status === 'applied' && ['plan', 'undo'].includes(e.command.type)).map(e => e.newRevision));
  }

  function rebuild() {
    const snap = snapshot();
    if (!snap) { view = null; return {foreign: false, sends: []}; }
    const {sends, failed, createdSaved} = settle();
    const own = mine();
    let foreign = failed.length > 0;
    if (seen !== null && snap.revision > seen) for (let r = seen + 1; r <= snap.revision; r++) if (!own.has(r)) foreign = true;
    if (seen === null || snap.revision !== seen || failed.length || !view) {
      const store = storeFrom(snap);
      for (const rec of records) { try { replay(store, rec); } catch {} }
      if (!view) version = snap.revision;
      else if (foreign) version += 1;
      view = {...store, version};
    }
    if (foreign) lastUndo = null;
    seen = snap.revision;
    problems = [...problems, ...failed].slice(-10);
    persist();
    return {foreign, createdSaved, sends};
  }

  function onClient() {
    const result = rebuild();
    listeners.forEach(fn => fn(result));
    for (const rec of result.sends) if (!entryOf(rec.id)) client.send(command(rec));
  }
  client.subscribe(onClient);

  function undo() {
    if (!lastUndo) throw new Error('No planning change to undo.');
    const {commandId, restore, ids, targets: list} = lastUndo;
    lastUndo = null;
    const target = records.find(r => r.id === commandId);
    const store = structuredClone(view);
    replay(store, {kind: 'undo', restore});
    view = {...store, version};
    if (target?.held) {
      records = records.filter(r => r !== target);
    } else {
      records.push({id: uuid(), kind: 'undo', targetId: commandId, restore, ids, targets: list, at: now().toISOString(), sent: false});
      persist();
      onClient();
      return null;
    }
    persist();
    listeners.forEach(fn => fn({foreign: false, createdSaved: false, sends: []}));
    return null;
  }

  return {
    data: () => view,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    pendingIds: () => new Set(records.flatMap(r => r.ids)),
    problems: () => problems,
    dismissProblem(index) { problems = problems.filter((_, i) => i !== index); persist(); listeners.forEach(fn => fn({foreign: false, createdSaved: false, sends: []})); },
    start() { onClient(); },
    commit(op) {
      if (op?.type === 'undo') return undo();
      assertPlanOp(op);
      validatePlanOp(op);
      const snap = snapshot();
      if (!snap || !view) throw new Error('Your plan has not arrived from your phone yet.');
      const baseIds = idsOf(snap);
      const before = idsOf(view);
      if (named(op).some(id => before.has(id) && !baseIds.has(id))) throw new Error(WAITING);
      const rec = {id: uuid(), kind: 'plan', op, at: now().toISOString(), baseRevision: snap.revision, sent: true, held: false};
      const store = structuredClone(view);
      const result = edit(store, rec, op);
      const created = [...idsOf(store)].filter(id => !before.has(id));
      const list = targets(op);
      const earlier = records.filter(r => overlaps(r.targets, list)).at(-1);
      Object.assign(rec, {targets: list, ids: [...targetIds(list), ...created], created, held: !!earlier, sent: !earlier, after: earlier?.id ?? null});
      records.push(rec);
      view = {...store, version};
      if (op.type !== 'reviewProgress' && !op.keepUndo) lastUndo = {commandId: rec.id, ids: rec.ids, targets: list, restore: {entries: store.planner.undo.entries, planner: store.planner.undo.planner}};
      persist();
      if (rec.held) listeners.forEach(fn => fn({foreign: false, createdSaved: false, sends: []}));
      else client.send(command(rec));
      return result;
    },
  };
}
