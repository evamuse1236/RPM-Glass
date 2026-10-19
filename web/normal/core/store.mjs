/**
 * The browser's state as data: the phone's last snapshot plus the commands sent from here. The screen shows the
 * snapshot with every unfinished command laid over it, and a command counts as saved only once the phone applied it
 * and a snapshot at least as new as its revision arrived.
 */
import {applyCommand, undoApplied, touchesTask} from './apply.mjs';

export const FINAL = new Set(['applied', 'rejected', 'conflict']);
export const STALE_MS = 15 * 60000;

export const initialState = () => ({phase: 'loading', snapshot: null, commands: [], online: true, syncing: false,
  checkedAt: null, problem: null});

const update = (state, id, patch) => ({...state, commands: state.commands.map(c => (c.id === id ? {...c, ...patch} : c))});
const find = (state, id) => state.commands.find(c => c.id === id);

export function reduce(state, event) {
  switch (event.type) {
    case 'loaded': {
      const keep = state.snapshot && state.snapshot.revision > event.snapshot.revision;
      return {...state, phase: 'ready', snapshot: keep ? state.snapshot : event.snapshot, checkedAt: event.at ?? state.checkedAt, problem: null};
    }
    case 'checked': return {...state, checkedAt: event.at, problem: null};
    case 'no-snapshot': return {...state, phase: state.snapshot ? state.phase : 'no-snapshot'};
    case 'unlinked': return {...state, phase: 'unlinked'};
    case 'linking': return {...state, phase: 'loading'};
    case 'failed': return {...state, problem: event.problem};
    case 'online': return {...state, online: event.online};
    case 'syncing': return {...state, syncing: event.syncing};
    case 'queued':
      return {...state, commands: [...state.commands, {...event.command, status: 'outbox', message: null, newRevision: null,
        before: event.before ?? null, dismissed: false}]};
    case 'sent': {
      const entry = find(state, event.id);
      return entry && entry.status === 'outbox' ? update(state, event.id, {status: 'pending', message: event.message ?? null}) : state;
    }
    case 'status': {
      const entry = find(state, event.id);
      if (!entry || FINAL.has(entry.status) || entry.status === 'cancelled') return state;
      return update(state, event.id, {status: event.status, message: event.message ?? null, newRevision: event.newRevision ?? null});
    }
    case 'cancelled': return update(state, event.id, {status: 'cancelled', dismissed: true});
    case 'undo-later': return update(state, event.id, {undoLater: true});
    case 'dismissed': return update(state, event.id, {dismissed: true});
    default: return state;
  }
}

/** Applied, and the snapshot on screen already includes it. */
export const settled = (state, entry) => entry.status === 'applied' && !!state.snapshot && entry.newRevision != null
  && state.snapshot.revision >= entry.newRevision;

/** Still on its way: in the outbox, queued for the phone, or applied by a snapshot that has not arrived yet. */
export const inFlight = (state, entry) => entry.status === 'outbox' || entry.status === 'pending'
  || (entry.status === 'applied' && !settled(state, entry));

export function view(state) {
  if (!state.snapshot) return null;
  let snapshot = state.snapshot;
  for (const entry of state.commands) {
    if (!inFlight(state, entry)) continue;
    try {
      if (entry.type === 'undo') {
        const original = find(state, entry.args.commandId);
        if (original && settled(state, original)) snapshot = undoApplied(snapshot, original, original.before);
      } else {
        snapshot = applyCommand(snapshot, entry, {now: Date.parse(entry.createdAt)});
      }
    } catch {
      continue;
    }
  }
  return snapshot;
}

const taskOf = (state, entry) => {
  if (touchesTask(entry)) return entry.args.taskId;
  if (entry.type === 'undo') {
    const original = find(state, entry.args.commandId);
    return original && touchesTask(original) ? original.args.taskId : null;
  }
  return null;
};

/** For each task, the newest command that still needs showing on its row: sending, refused, or in conflict. */
export function taskMarks(state) {
  const marks = new Map();
  for (const entry of state.commands) {
    if (entry.dismissed) continue;
    const id = taskOf(state, entry);
    if (id == null) continue;
    if (inFlight(state, entry) || entry.status === 'rejected' || entry.status === 'conflict') marks.set(id, entry);
    else marks.delete(id);
  }
  return marks;
}

export const waiting = state => state.commands.filter(entry => inFlight(state, entry) && entry.type !== 'capture').length;

const SNAPSHOT_KIND = {committed: 'done', applied: 'done', kept: 'done', skipped: 'done', undone: 'undone', failed: 'failed',
  'needs-answer': 'needs-answer', 'needs-time': 'needs-answer', 'needs-check': 'needs-answer', review: 'needs-answer',
  interpreted: 'needs-answer', draft: 'needs-answer', captured: 'sorting', 'words-kept': 'sorting', parked: 'sorting'};

/** Capture receipts, newest first: local captures in flight merged with the phone's capture journal. */
export function captureReceipts(state) {
  const journal = state.snapshot?.captures ?? [];
  const local = state.commands.filter(entry => entry.type === 'capture' && !entry.dismissed);
  const byId = new Map(journal.map(c => [c.id, c]));
  const undone = new Set(state.commands.filter(e => e.type === 'undo' && e.status !== 'rejected' && !e.dismissed).map(e => e.args.commandId));
  const rows = local.map(entry => {
    const saved = byId.get(entry.id);
    let kind;
    if (entry.status === 'outbox') kind = 'sending';
    else if (entry.status === 'pending') kind = 'saved';
    else if (entry.status === 'rejected' || entry.status === 'conflict') kind = 'failed';
    else if (saved) kind = SNAPSHOT_KIND[saved.status] ?? 'sorting';
    else kind = settled(state, entry) ? 'done' : 'sorting';
    if (kind === 'done' && undone.has(entry.id)) kind = 'undone';
    return {id: entry.id, text: entry.args.text, at: entry.createdAt, kind, status: saved?.status ?? null,
      lines: (saved?.receipt ?? []).map(line => line.text), entry};
  });
  const seen = new Set(local.map(e => e.id));
  for (const capture of journal) {
    if (seen.has(capture.id)) continue;
    const kind = SNAPSHOT_KIND[capture.status] ?? 'sorting';
    rows.push({id: capture.id, text: capture.text, at: capture.createdAt, kind: kind === 'done' && undone.has(capture.id) ? 'undone' : kind,
      status: capture.status, lines: capture.receipt.map(line => line.text), entry: null});
  }
  return rows.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
}

/** How the phone link looks right now: fresh, stale (no snapshot for 15 min), offline, or checking. */
export function phoneStatus(state, now = Date.now()) {
  const savedAt = state.snapshot ? Date.parse(state.snapshot.savedAt) : null;
  const age = savedAt == null ? null : Math.max(0, now - savedAt);
  if (!state.online) return {kind: 'offline', age, savedAt};
  if (state.syncing) return {kind: 'syncing', age, savedAt};
  return {kind: age != null && age > STALE_MS ? 'stale' : 'fresh', age, savedAt};
}

export function createStore(start = initialState()) {
  let state = start;
  const listeners = new Set();
  return {
    get: () => state,
    dispatch(event) {
      const next = reduce(state, event);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener(state, event);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
