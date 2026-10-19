/** Every change the browser makes: one command, laid over the screen at once, sent to the phone, with Undo. */
import {makeCommand} from './ids.mjs';
import {beforeOf} from './apply.mjs';
import {view, inFlight} from './store.mjs';

export function createController({store, transport, now = () => Date.now(), notify = () => {}}) {
  const posting = new Set();
  const find = id => store.get().commands.find(c => c.id === id);

  async function post(command) {
    if (posting.has(command.id) || !store.get().online) return;
    posting.add(command.id);
    try {
      const result = await transport.send(command);
      store.dispatch({type: 'sent', id: command.id, message: result?.message});
    } catch (error) {
      store.dispatch({type: 'failed', problem: error});
    } finally {
      posting.delete(command.id);
    }
  }

  function act(type, args, label = null) {
    const state = store.get();
    if (!state.snapshot) return null;
    const command = makeCommand(type, args, {baseRevision: state.snapshot.revision, now: now()});
    store.dispatch({type: 'queued', command, before: beforeOf(view(state), command, now())});
    post(command);
    if (label) notify({text: label, undo: command.id});
    return command;
  }

  function undo(id) {
    const entry = find(id);
    if (!entry) return;
    if ((entry.status === 'outbox' && !posting.has(id)) || (entry.status === 'pending' && transport.cancel(id))) {
      store.dispatch({type: 'cancelled', id});
      return notify({text: 'Cancelled before it reached your phone'});
    }
    if (entry.status === 'applied') return act('undo', {commandId: id}, 'Undo sent to your phone');
    if (inFlight(store.get(), entry)) {
      store.dispatch({type: 'undo-later', id});
      return notify({text: 'Undo goes to your phone once it applies this'});
    }
  }

  function retry(id) {
    const entry = find(id);
    if (!entry) return;
    store.dispatch({type: 'dismissed', id});
    act(entry.type, entry.args, entry.type === 'capture' ? null : 'Sent again');
  }

  const flush = () => {
    const state = store.get();
    for (const entry of state.commands) if (entry.status === 'outbox' && !posting.has(entry.id)) post(entry);
  };

  store.subscribe((state, event) => {
    if (event.type === 'status' && event.status === 'applied' && find(event.id)?.undoLater) act('undo', {commandId: event.id});
    if (event.type === 'online' && event.online) flush();
  });

  return {
    act,
    undo,
    retry,
    flush,
    keepPhone: id => store.dispatch({type: 'dismissed', id}),
    capture: text => act('capture', {text}),
    dismiss: id => store.dispatch({type: 'dismissed', id}),
  };
}
