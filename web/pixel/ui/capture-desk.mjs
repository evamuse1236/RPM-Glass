import {h, key} from './dom.mjs';
import {icon} from './icons.mjs';
import {problemStrip, emptyPlate} from './plate.mjs';
import {waiting, undoneBy} from '../sync/state.mjs';
import {plural} from '../../../android-companion/planner/format.mjs';

const MAX = 12000;
const UNDO_WINDOW_MS = 6000;

/** The desk itself is built once so typing, focus and the words survive every redraw. */
export function buildDesk(ctx) {
  const area = h('textarea.desk-text', {id: 'capture-text', maxlength: MAX, rows: 4, spellcheck: true,
    placeholder: 'Say it all. Your words are saved first.', 'aria-describedby': 'capture-trust',
    onkeydown: event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); send(); }
    }});
  function send() {
    const words = area.value;
    if (!words.trim()) return area.focus();
    ctx.act('capture', {text: words}, 'Capture', {toast: false});
    area.value = '';
    area.placeholder = 'Say it all. Your words are saved first.';
  }
  const receipts = h('div.receipts', {'aria-live': 'polite'});
  const asks = h('div.asks');
  const desk = h('div.desk', {},
    h('label.visually-hidden', {for: 'capture-text'}, 'Capture'),
    h('div.desk-field', {}, area),
    h('div.desk-actions', {},
      h('p.trust', {id: 'capture-trust'}, 'Your words are saved first, then sorted.'),
      ctx.demo ? h('span.demo-label', {title: 'This page runs a demo phone with sample data'}, 'Demo data') : null,
      key('Send to phone', send, {cls: 'filled', hint: '⌃↵', aria: 'Send to phone (Control or Command plus Enter)'})),
    h('span.ladder', {'aria-hidden': 'true'}, icon('ladder')));
  return {desk, area, receipts, asks, focus: () => area.focus()};
}

const lineParts = text => {
  const parts = text.split(' · ');
  return parts.length >= 3 ? h('li', {}, icon('check'), h('span', {}, h('b', {}, parts[1]), ` → ${parts.slice(2).join(' · ')}`)) : h('li', {}, icon('check'), h('span', {}, text));
};

function receiptPlate(ctx, capture, entry) {
  const added = capture.receipt.filter(r => r.text.startsWith('Added')).length;
  const undone = capture.status === 'undone' || (entry && undoneBy(ctx.state, entry));
  const canUndo = entry && entry.status === 'applied' && !undone;
  const fresh = entry && ctx.now() - entry.at < UNDO_WINDOW_MS;
  return h('article.receipt', {dataset: {undone: undone ? '' : null}},
    h('header.receipt-head', {},
      h('span.receipt-title', {}, undone ? 'Undone · moved to Trash' : added ? `✓ ${plural(added, 'task')} added` : '✓ Saved'),
      canUndo ? key('Undo', () => ctx.store.undo(entry.command.id), {cls: `small${fresh ? ' filled' : ''}`, hint: fresh ? 'Z' : null, aria: 'Undo this capture'}) : null),
    h('blockquote.said', {}, capture.text),
    capture.receipt.length ? h('ul.receipt-lines', {}, capture.receipt.map(r => lineParts(r.text))) : null);
}

function sentPlate(ctx, entry) {
  return h('article.receipt', {dataset: {state: 'pending'}},
    h('header.receipt-head', {},
      h('span.receipt-title', {}, icon('hourglass'), entry.undoRequested ? 'Undoing on the phone…' : 'Sent. The phone sorts it when it opens.'),
      entry.undoRequested ? null : key('Undo', () => ctx.store.undo(entry.command.id), {cls: 'small', aria: 'Undo this capture'})),
    h('blockquote.said', {}, entry.command.args.text));
}

function askBox(ctx, draft) {
  const choose = (label, run) => h('li', {}, h('button.choice', {type: 'button', onclick: run}, h('span.cursor', {}, icon('cursor')), label));
  return h('section.dialogue', {'aria-label': 'RPM asks'},
    h('p.who', {}, 'RPM asks'),
    h('p.ask', {}, draft.reply || draft.title),
    h('ol.choices', {},
      choose('Answer here', () => ctx.answerDraft(draft)),
      choose('Answer on the phone later', () => { ctx.cache.hiddenAsks.add(draft.id); ctx.render(); })));
}

export function renderReceipts(ctx, parts) {
  if (ctx.state.phase !== 'ready') return parts.receipts.replaceChildren(), parts.asks.replaceChildren();
  const local = ctx.state.entries.filter(e => e.command.type === 'capture' && !e.dismissed);
  const byId = new Map(local.map(e => [e.command.id, e]));
  const captures = ctx.view.snapshot.captures;
  const shown = new Set(captures.map(c => c.id));
  const items = [
    ...local.filter(e => !shown.has(e.command.id) && (waiting(e, ctx.state.snapshot) || e.status !== 'applied'))
      .map(e => ({at: e.at, node: e.status === 'rejected' || e.status === 'conflict'
        ? h('div.plate-wrap', {}, problemStrip(ctx, e), h('blockquote.said', {}, e.command.args.text))
        : sentPlate(ctx, e)})),
    ...captures.map(c => ({at: Date.parse(c.createdAt ?? 0), node: receiptPlate(ctx, c, byId.get(c.id))})),
  ].sort((a, b) => b.at - a.at).slice(0, 3);
  parts.receipts.replaceChildren(...(items.length ? items.map(i => i.node)
    : [emptyPlate('Receipts show here: what the phone made of your words, with Undo.')]));
  parts.asks.replaceChildren(...ctx.view.snapshot.drafts.filter(d => d.status === 'question' && !ctx.cache.hiddenAsks.has(d.id)).map(d => askBox(ctx, d)));
}
