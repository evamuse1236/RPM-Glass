import {DESTINATIONS} from '../../android-companion/planner/shell.mjs';
import {el} from '../../android-companion/planner/dom.mjs';
import {actionRow, rowOpener} from './pointer.mjs';

const OPENERS = '.task-main, .spine-open';
const LAYERS = 'dialog[open], .menu';
const TYPING = 'input, textarea, select, [contenteditable=""], [contenteditable=true], [contenteditable=plaintext-only]';

const visible = node => node.checkVisibility?.() !== false;
const openers = ctx => [...ctx.work.querySelectorAll(OPENERS)].filter(visible);
const focusedRow = ctx => actionRow(ctx.root.activeElement);

function step(ctx, by) {
  const rows = openers(ctx);
  if (!rows.length) return;
  const row = focusedRow(ctx);
  const at = row ? rows.indexOf(rowOpener(row)) : -1;
  const next = rows[at < 0 ? (by > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + by))];
  ctx.root.documentElement.dataset.keyboardNav = 'true';
  next.focus();
  next.scrollIntoView?.({block: 'nearest'});
}

export const KEYS = [
  {key: 'n', label: 'New task', run: ctx => ctx.ui.add()},
  {key: '/', label: 'Search', run: ctx => ctx.ui.openSearch()},
  {key: 'c', label: 'Capture', run: ctx => ctx.ui.capture()},
  ...DESTINATIONS.map(([tab, , label], i) => ({key: String(i + 1), label, run: ctx => ctx.ui.goTab(tab)})),
  {key: 'j', label: 'Next task', run: ctx => step(ctx, 1)},
  {key: 'k', label: 'Previous task', run: ctx => step(ctx, -1)},
  {key: 'x', label: 'Complete', run: ctx => focusedRow(ctx)?.rowActions.find(action => action.id === 'done')?.run()},
  {key: 'e', label: 'Open', run: ctx => { const row = focusedRow(ctx); if (row) rowOpener(row).click(); }},
  {key: 'z', label: 'Undo', run: ctx => ctx.root.querySelector('[id=snackbar] > .snackbar-action')?.click()},
  {key: '?', label: 'Shortcuts', run: ctx => ctx.help()},
  {key: 'Escape', label: 'Back', run: ctx => ctx.back()},
];

export function handleKey(event, ctx) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.keyCode === 229) return false;
  if (event.target?.closest?.(TYPING) || ctx.root.querySelector(LAYERS)) return false;
  const key = event.key?.length === 1 ? event.key.toLowerCase() : event.key;
  const entry = KEYS.find(item => item.key === key);
  if (!entry || (entry.key === 'Escape' && !ctx.sheet.hidden)) return false;
  if (entry.run(ctx) === false) return false;
  event.preventDefault();
  return true;
}

export function mountShortcuts(root, ui, {work, sheet, dialog}) {
  const list = dialog.querySelector('.keys-list');
  list.replaceChildren(...KEYS.flatMap(({key, label}) => {
    const term = el('dt');
    term.append(el('kbd', '', key === 'Escape' ? 'Esc' : key));
    return [term, el('dd', '', label)];
  }));
  dialog.querySelector('.keys-close').addEventListener('click', () => dialog.close());
  const ctx = {ui, root, work, sheet, help: () => dialog.showModal(), back: () => globalThis.rpmHandleBack?.() ?? false};
  root.addEventListener('keydown', event => handleKey(event, ctx));
}
