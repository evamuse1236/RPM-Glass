import {h, key} from './dom.mjs';
import {statusText, settled} from '../sync/state.mjs';
import {userMessage} from '../../../android-companion/user-message.mjs';

export const UNDO_MS = 6000;

/** The last change at the bottom of the screen with its Undo key, for six seconds. */
export function createToast(ctx) {
  const zone = h('div.toast-zone', {'aria-live': 'polite'});
  let current = null, timer = null;

  function words(entry) {
    const live = ctx.state.entries.find(e => e.command.id === entry.command.id);
    if (!live) return 'Cancelled before it was sent.';
    if (settled(live, ctx.state.snapshot)) return 'Saved on the phone.';
    return userMessage(statusText(live, ctx.state.online));
  }

  function render() {
    if (!current) return zone.replaceChildren();
    const live = ctx.state.entries.find(e => e.command.id === current.command.id);
    const canUndo = live && !live.undoRequested && live.status !== 'rejected' && live.status !== 'conflict';
    zone.replaceChildren(h('div.toast', {role: 'status'},
      h('p.toast-text', {}, h('b', {}, current.label), ' · ', words(current)),
      canUndo ? key('Undo', () => ctx.undoLast(), {cls: 'small on-ink', hint: 'Z'}) : null));
  }

  return {
    zone,
    render,
    show(entry) {
      current = entry;
      clearTimeout(timer);
      timer = setTimeout(() => { current = null; render(); }, UNDO_MS);
      render();
    },
    get entry() { return current; },
  };
}
