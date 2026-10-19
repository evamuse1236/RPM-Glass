/** Runs commands through a transport and keeps the state that the screen draws from. */
import {userMessage} from '../../../android-companion/user-message.mjs';
import {makeCommand, targetKey} from './command.mjs';
import {beforeOf} from './apply.mjs';
import {initialState, reduce, viewOf, settled} from './state.mjs';

const ENTRIES_KEY = 'rpm.web.entries';

export function createStore({transport, now = () => new Date(), storage = null}) {
  const saved = storage ? JSON.parse(storage.getItem(ENTRIES_KEY) ?? '[]') : [];
  let state = initialState([...saved, ...(transport.seed?.() ?? [])]);
  let view = null;
  const listeners = new Set();

  function dispatch(action) {
    const next = reduce(state, action);
    if (next === state) return;
    state = next;
    view = null;
    storage?.setItem(ENTRIES_KEY, JSON.stringify(state.entries.filter(e => !e.dismissed && !settled(e, state.snapshot)).slice(-50)));
    for (const listener of listeners) listener(state);
  }

  const inFlight = new Set();
  function send(entry) {
    const {id} = entry.command;
    if (!state.online || inFlight.has(id)) return;
    inFlight.add(id);
    transport.send(entry.command)
      .then(ack => dispatch({type: 'ack', id, ack}))
      .catch(error => dispatch({type: 'send-failed', id, message: userMessage(error)}))
      .finally(() => inFlight.delete(id));
  }
  const flush = () => state.entries.filter(e => e.status === 'queued').forEach(send);

  function act(type, args, {label = '', undoOf = null, key = null} = {}) {
    const current = store.view().snapshot;
    const command = makeCommand(type, args, state.snapshot?.revision ?? 0, now());
    const entry = {command, status: 'queued', message: null, newRevision: null, label, at: +now(),
      key: key ?? targetKey(command), before: beforeOf(current, command), undoOf, undoRequested: false, dismissed: false};
    dispatch({type: 'queue', entry});
    send(entry);
    return entry;
  }

  function sendUndo(entry) {
    act('undo', {commandId: entry.command.id}, {label: `Undo: ${entry.label}`, undoOf: entry.command.id, key: entry.key});
  }

  function onEvent(event) {
    if (event.type === 'snapshot') {
      dispatch({type: 'snapshot', snapshot: event.snapshot});
      flush();
    }
    else if (event.type === 'status') {
      dispatch(event);
      const entry = state.entries.find(e => e.command.id === event.id);
      if (entry?.undoRequested && event.status === 'applied') sendUndo(entry);
    } else if (event.type === 'online') {
      dispatch(event);
      if (event.online) flush();
    } else if (event.type === 'unlinked') dispatch({type: 'phase', phase: 'unlinked'});
    else if (event.type === 'error') dispatch({type: 'error', message: userMessage(event.error)});
  }

  const store = {
    get state() { return state; },
    view() { return (view ??= viewOf(state)); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start() { transport.start(onEvent); },
    setOnline(online) { onEvent({type: 'online', online}); },
    act,
    undo(id) {
      const entry = state.entries.find(e => e.command.id === id);
      if (!entry) return;
      if (entry.status === 'applied' && !entry.undoRequested) sendUndo(entry);
      else dispatch({type: 'undo-request', id});
    },
    resend(id) {
      const entry = state.entries.find(e => e.command.id === id);
      if (!entry) return;
      dispatch({type: 'dismiss', id});
      act(entry.command.type, entry.command.args, {label: entry.label});
    },
    dismiss(id) { dispatch({type: 'dismiss', id}); },
    async link(code) {
      await transport.link(code);
      dispatch({type: 'phase', phase: 'loading'});
      transport.start(onEvent);
    },
  };
  return store;
}
