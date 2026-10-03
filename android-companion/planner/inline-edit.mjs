/**
 * Edit in place on the detail pages (Block, Project, Goal, Area): text that looks like text until it is tapped,
 * saved on blur or Enter through app.commit (so with Undo), reverted by Escape or Android Back.
 * Every editable node carries `data-edit-key`, so when a save re-renders the page the field the user moved to
 * keeps its focus, its words and its caret.
 */
import {el} from './dom.mjs';

/** A blank icon slot, so a menu's unchecked choices line up with the checked one. */
export const NO_ICON = '\u00a0';

let active = null;
let installed = false;

function install() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('focusin', event => {
    if (event.target?.dataset?.editKey) active = event.target;
  });
  document.addEventListener('focusout', event => {
    const node = event.target;
    // A field removed by a re-render keeps its claim, so the rebuilt page can hand focus to its twin.
    queueMicrotask(() => { if (active === node && node.isConnected && document.activeElement !== node) active = null; });
  });
}

const textOf = node => (node.isContentEditable || node.getAttribute?.('contenteditable') ? node.textContent : node.value) ?? '';
const setText = (node, value) => {
  if ('value' in node && !node.getAttribute('contenteditable')) node.value = value;
  else node.textContent = value;
};

function caretToEnd(node) {
  if (!node.getAttribute('contenteditable')) {
    const end = node.value?.length ?? 0;
    node.setSelectionRange?.(end, end);
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Select all of a field's words, so typing replaces them (a new Block's placeholder title). */
export function selectAll(node) {
  if (!node) return;
  node.focus({preventScroll: true});
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

export function focusField(node) {
  if (!node) return;
  node.focus({preventScroll: true});
  caretToEnd(node);
}

/** After a re-render: give focus (and any unsaved words) back to the rebuilt twin of the field that had it. */
export function carryFocus(page) {
  install();
  if (!active || active.isConnected) return;
  const old = active;
  const twin = page.querySelector(`[data-edit-key="${CSS.escape(old.dataset.editKey)}"]`);
  if (!twin) return;
  const typed = textOf(old);
  const saved = old.__inline?.saved;
  // Words typed but not yet saved (or typed into the add row while a save ran) survive the rebuild.
  if (saved == null ? typed !== '' : typed !== saved) setText(twin, typed);
  focusField(twin);
}

/** Retry a commit that met another save in flight (app.commit returns undefined while one runs). */
export async function persist(app, op, options) {
  for (let i = 0; i < 20; i++) {
    if (!app.saving) return app.commit(op, options);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return app.commit(op, options);
}

/**
 * A text that edits where it is. options: key (unique per page), value, label (accessible name), placeholder,
 * multiline (Enter makes a new line; otherwise Enter saves), required (empty words are not saved), maxLength,
 * cls, onSave(text) -> Promise, onEmpty(), onRevert().
 */
export function inlineText(app, {key, value = '', label, placeholder = '', multiline = false, required = false,
  maxLength = 200, cls = '', onSave, onEmpty = null, emptyNotice = ''}) {
  install();
  const node = el('span', ['inline-edit', cls].filter(Boolean).join(' '));
  try { node.contentEditable = 'plaintext-only'; } catch { node.contentEditable = 'true'; }
  if (node.contentEditable !== 'plaintext-only') node.contentEditable = 'true';
  node.textContent = value ?? '';
  node.dataset.editKey = key;
  node.dataset.placeholder = placeholder;
  node.setAttribute('role', 'textbox');
  node.setAttribute('aria-label', label);
  node.setAttribute('aria-multiline', String(multiline));
  node.setAttribute('enterkeyhint', multiline ? 'enter' : 'done');
  node.spellcheck = true;
  node.__inline = {saved: value ?? '', reverting: false};
  // Selecting words by dragging is not a page swipe (Project detail steps between Projects on a swipe).
  node.addEventListener('pointerdown', event => event.stopPropagation());
  const clean = text => (multiline ? text.replace(/\r/g, '') : text.replace(/\s*\n\s*/g, ' '));
  node.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      revert(node);
      return;
    }
    if (event.key === 'Enter' && !multiline && !event.isComposing) {
      event.preventDefault();
      // A new record's title hands on to its Purpose, as a keyboard's Next would.
      const next = node.dataset.nextKey && document.querySelector(`[data-edit-key="${CSS.escape(node.dataset.nextKey)}"]`);
      node.blur();
      if (next) focusField(next);
    }
  });
  node.addEventListener('input', () => {
    const text = clean(node.textContent);
    if (text.length > maxLength || text !== node.textContent) {
      node.textContent = text.slice(0, maxLength);
      caretToEnd(node);
    }
    node.classList.toggle('is-empty', !node.textContent);
  });
  node.classList.toggle('is-empty', !node.textContent);
  node.addEventListener('blur', () => {
    const state = node.__inline;
    if (state.reverting) {
      state.reverting = false;
      return;
    }
    const text = clean(node.textContent).trim();
    if (text === (state.saved ?? '').trim()) {
      if (node.textContent !== state.saved) node.textContent = state.saved;
      node.classList.toggle('is-empty', !node.textContent);
      return;
    }
    if (required && !text) {
      node.textContent = state.saved;
      node.classList.toggle('is-empty', !node.textContent);
      if (emptyNotice) app.notice(emptyNotice);
      return;
    }
    if (!text && onEmpty) onEmpty();
    const before = state.saved;
    state.saved = text;
    Promise.resolve(onSave(text)).catch(() => {
      state.saved = before;
      if (node.isConnected && document.activeElement !== node) node.textContent = before;
    });
  });
  return node;
}

/** Escape / Back while editing: put the saved words back and leave the field. Returns whether it did. */
export function revert(node = active) {
  if (!node?.isConnected || document.activeElement !== node || !node.__inline) return false;
  node.__inline.reverting = true;
  node.textContent = node.__inline.saved;
  node.classList.toggle('is-empty', !node.textContent);
  node.blur();
  return true;
}

/** Android Back: an open inline edit is the topmost layer, so Back reverts it before leaving the page. */
export function backHandler(app) {
  const controller = {handleBack: () => revert(), destroy() {}};
  // A distinct key, so ordinary re-renders still rebuild the page; a route change unmounts it.
  app.mounted = {key: 'inline-edit', controller};
}

/** The full set of fields saveEntity needs, with `patch` applied (it replaces every text field it is given). */
export function entityFields(collection, record, patch = {}) {
  const fields = {title: record.title, purpose: record.purpose ?? '', notes: record.notes ?? ''};
  if (collection === 'blocks') fields.projectId = record.projectId ?? null;
  if (collection === 'projects') fields.goalId = record.goalId ?? null;
  if (collection === 'goals') {
    Object.assign(fields, {areaId: record.areaId ?? null, year: record.year, horizon: record.horizon ?? 'yearly',
      period: record.period ?? null});
  }
  Object.assign(fields, patch);
  if (collection === 'goals' && fields.horizon === 'yearly') fields.period = null;
  return fields;
}

export function saveEntity(app, collection, record, patch, label) {
  return persist(app, {type: 'saveEntity', collection, id: record.id, fields: entityFields(collection, record, patch)},
    {label});
}
