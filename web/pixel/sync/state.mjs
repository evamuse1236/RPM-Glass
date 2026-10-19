/** The browser's view of the plan: the phone's last snapshot plus this browser's commands and their statuses. */
import {applyCommand, restoreTask, CommandProblem} from './apply.mjs';

const FINAL = new Set(['applied', 'rejected', 'conflict']);

export const initialState = (entries = []) => ({phase: 'loading', snapshot: null, entries, online: true, error: null});

const patch = (state, id, change) => ({...state, entries: state.entries.map(e => (e.command.id === id ? {...e, ...change} : e))});

export function reduce(state, action) {
  switch (action.type) {
    case 'snapshot': {
      const old = state.snapshot;
      if (old && action.snapshot.revision < old.revision) return state;
      return {...state, snapshot: action.snapshot, phase: 'ready', error: null};
    }
    case 'queue':
      return {...state, entries: [...state.entries, action.entry]};
    case 'ack':
    case 'status': {
      const entry = state.entries.find(e => e.command.id === action.id);
      if (!entry || FINAL.has(entry.status)) return state;
      const {status, message = null, newRevision = null} = action.ack ?? action;
      return patch(state, action.id, {status, message, newRevision});
    }
    case 'send-failed':
      return patch(state, action.id, {message: action.message});
    case 'undo-request': {
      const entry = state.entries.find(e => e.command.id === action.id);
      if (!entry) return state;
      if (entry.status === 'queued') return {...state, entries: state.entries.filter(e => e !== entry)};
      return patch(state, action.id, {undoRequested: true});
    }
    case 'dismiss':
      return patch(state, action.id, {dismissed: true});
    case 'online':
      return {...state, online: action.online};
    case 'phase':
      return {...state, phase: action.phase};
    case 'error':
      return {...state, error: action.message};
    default:
      return state;
  }
}

/** Applied, and the phone's newer snapshot has arrived, so the change can be reported as saved. */
export const settled = (entry, snapshot) => entry.status === 'applied' && !!snapshot && snapshot.revision >= (entry.newRevision ?? Infinity);
export const waiting = (entry, snapshot) => entry.status === 'queued' || entry.status === 'pending' || (entry.status === 'applied' && !settled(entry, snapshot));
export const undoneBy = (state, entry) => state.entries.find(e => e.undoOf === entry.command.id && e.status !== 'rejected' && e.status !== 'conflict') ?? null;

/** What to draw: the snapshot with every waiting command laid over it, and which plates are pending or in trouble. */
export function viewOf(state) {
  let snapshot = state.snapshot;
  const pending = new Map(), problems = new Map();
  if (!snapshot) return {snapshot, pending, problems};
  for (const entry of state.entries) {
    if (waiting(entry, state.snapshot)) {
      pending.set(entry.key, entry);
      if (entry.undoRequested || entry.command.type === 'capture') continue;
      if (entry.undoOf) {
        const target = state.entries.find(e => e.command.id === entry.undoOf);
        if (target?.before) snapshot = restoreTask(snapshot, target.before);
        continue;
      }
      snapshot = applyIfItFits(snapshot, entry.command);
    } else if ((entry.status === 'rejected' || entry.status === 'conflict') && !entry.dismissed) {
      problems.set(entry.key, entry);
    }
  }
  return {snapshot, pending, problems};
}

function applyIfItFits(snapshot, command) {
  try {
    return applyCommand(snapshot, command, {now: command.createdAt});
  } catch (problem) {
    if (problem instanceof CommandProblem) return snapshot;
    throw problem;
  }
}

const lowerFirst = text => (/^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text);

/** The words a plate shows for its command state. */
export function statusText(entry, online = true) {
  if (entry.undoRequested || entry.undoOf) return 'Undoing on the phone…';
  if (entry.status === 'queued') return online ? 'Sending to phone…' : 'Waiting for the connection…';
  if (entry.status === 'pending' || entry.status === 'applied') return 'Sending to phone…';
  if (entry.status === 'rejected') return `Phone said no: ${lowerFirst(entry.message ?? 'it could not do this.')} Nothing changed here.`;
  if (entry.status === 'conflict') return `${entry.message ?? 'The phone changed this.'} Keep the phone's version, or send yours again?`;
  return '';
}
