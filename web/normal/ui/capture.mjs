/** The Capture column: words go in, and receipts stack up of what the phone did with them. */
import {h, icon, iconButton, ago, swap} from './dom.mjs';
import {userMessage} from '../../../android-companion/user-message.mjs';
import {plural} from '../../../android-companion/planner/format.mjs';
import {inFlight} from '../core/store.mjs';

const GLYPH = {Added: 'add', Moved: 'schedule', Done: 'check', Renamed: 'edit', Changed: 'edit', Restored: 'restore', 'Moved to Trash': 'delete', Reopened: 'undo'};
const SHOWN = 5;

export function parseLine(text) {
  const [verb, title = '', ...facts] = text.split(' · ');
  return {verb, title, facts};
}

function lines(rows) {
  return h('ul.lines', rows.map(text => {
    const {verb, title, facts} = parseLine(text);
    return h('li.line', h('span.line-glyph', {title: verb}, icon(GLYPH[verb] ?? 'edit_note')),
      h('div.line-body', h('span.line-title', title || verb), facts.length ? h('div.facts', facts.map(f => h('span.fact', f))) : null));
  }));
}

function kicker(symbol, text, at, cls = '', now = Date.now()) {
  return h(`div.kicker${cls ? '.' + cls : ''}`, symbol === 'spinner' ? h('span.spinner', {'aria-hidden': 'true'}) : icon(symbol), h('span', text),
    at ? h('time', {dateTime: at, title: new Date(at).toLocaleString()}, ago(now - Date.parse(at))) : null);
}

function receipt(ctx, row) {
  const {entry} = row, closed = ctx.phone.kind === 'stale' || ctx.phone.kind === 'offline';
  const undo = entry && (inFlight(ctx.state, entry) || entry.status === 'applied') && row.kind !== 'undone'
    ? h('button.text-btn', {type: 'button', onclick: () => ctx.control.undo(entry.id)}, 'Undo') : null;
  const words = h('p.words', row.text);
  const body = [];
  switch (row.kind) {
    case 'sending':
      body.push(kicker('spinner', 'Saving your words…', row.at, '', ctx.now), words);
      break;
    case 'saved':
    case 'sorting':
      body.push(kicker(closed ? 'check_circle' : 'spinner', 'Your words are saved', row.at, 'done', ctx.now), words,
        h('p.receipt-note', closed ? 'Your phone is closed. Captures will sort when it opens.' : 'Sorting on the phone…'));
      break;
    case 'done': {
      const added = row.lines.filter(l => l.startsWith('Added')).length;
      body.push(kicker('check_circle', added ? `${plural(added, 'task')} added` : row.lines.length ? `${plural(row.lines.length, 'change')} made` : 'Sorted on your phone', row.at, 'done', ctx.now),
        row.lines.length ? lines(row.lines) : null, words);
      break;
    }
    case 'needs-answer':
      body.push(kicker('help', 'Your phone needs an answer', row.at, 'ask', ctx.now), words, h('p.receipt-note', 'Open RPM on your phone to answer it.'));
      break;
    case 'failed':
      body.push(kicker('error_outline', 'Not applied', row.at, 'error', ctx.now), words,
        h('p.receipt-error', `Your phone didn't apply this: ${String(userMessage(entry?.message)).replace(/[.!]+$/, '')}.`));
      break;
    case 'undone':
      body.push(kicker('undo', 'Undone', row.at, '', ctx.now), words);
      break;
  }
  const actions = row.kind === 'failed' && entry
    ? [h('button.text-btn', {type: 'button', onclick: () => ctx.control.dismiss(entry.id)}, 'Dismiss'),
      h('button.tonal-btn', {type: 'button', onclick: () => ctx.control.retry(entry.id)}, 'Retry')]
    : [undo];
  return h(`li.receipt.${row.kind}${ctx.fresh.has(row.id) ? '.new' : ''}`, {'data-capture': row.id}, body,
    actions.some(Boolean) ? h('div.receipt-actions', actions) : null);
}

export function createCapture({onSend, onClose}) {
  const textarea = h('textarea', {placeholder: 'Capture a thought', 'aria-label': 'Capture a thought', rows: 3, maxLength: 12000});
  const send = h('button.filled-btn', {type: 'button', disabled: true}, icon('send'), 'Send');
  const Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
  let listening = null;
  const mic = Recognition ? iconButton('mic', 'Speak a thought', () => {
    if (listening) return listening.stop();
    listening = new Recognition();
    listening.interimResults = false;
    listening.onresult = e => {
      const said = [...e.results].map(r => r[0].transcript).join(' ');
      textarea.value = [textarea.value.trim(), said].filter(Boolean).join(' ');
      sync();
    };
    listening.onend = () => { listening = null; mic.setAttribute('aria-pressed', 'false'); };
    mic.setAttribute('aria-pressed', 'true');
    listening.start();
  }, 'icon-btn.mic') : null;
  const sync = () => { send.disabled = !textarea.value.trim(); };
  const submit = () => {
    const text = textarea.value;
    if (!text.trim()) return;
    onSend(text);
    textarea.value = '';
    sync();
    textarea.focus();
  };
  textarea.addEventListener('input', sync);
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
  });
  send.addEventListener('click', submit);
  const list = h('div.receipts', {'aria-live': 'polite'});
  const node = h('aside.capture', {id: 'capture', 'aria-label': 'Capture'},
    h('div.capture-head', h('h2', 'Capture'), iconButton('close', 'Close Capture', onClose, 'icon-btn.capture-close')),
    h('div.composer', h('div.composer-field', textarea), h('div.composer-actions', mic, send),
      h('p.trust', 'Your words are saved first. Ctrl+Enter sends.')),
    list);
  return {
    node,
    textarea,
    focus: () => textarea.focus(),
    render(ctx) {
      const rows = ctx.receipts;
      const shown = ctx.ui.history ? rows : rows.slice(0, SHOWN);
      swap(list,
        rows.length ? h('div.receipts-head', h('h3', 'Receipts'), h('small.quiet', plural(rows.length, 'capture'))) : h('p.capture-empty', 'What you capture here shows up with what your phone did with it.'),
        h('ul', {style: {display: 'grid', gap: 'var(--s2)'}}, shown.map(row => receipt(ctx, row))),
        rows.length > SHOWN ? h('button.text-btn.history-toggle', {type: 'button', onclick: () => ctx.toggleHistory()},
          ctx.ui.history ? 'Show fewer' : 'History', icon(ctx.ui.history ? 'expand_less' : 'chevron_right')) : null);
    },
  };
}
