/** Material 3 bottom sheets with drag handle, draft memory and a dirty-check on dismiss. */
import {enterSurface, exitSurface, playMotion, stopMotion, MOTION} from '../surface-motion.mjs';
import {el, button, iconButton} from './dom.mjs';

const DRAFT_PREFIX = 'rpm-planner-draft:';

function storeDraft(sheet) {
  if (!sheet.draftKey) return;
  try {
    localStorage.setItem(DRAFT_PREFIX + sheet.draftKey, JSON.stringify(sheet.draftValues));
  } catch {}
}

function loadDraft(key) {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_PREFIX + key) ?? '{}');
  } catch {
    return {};
  }
}

export function discardDraft(app) {
  const sheet = app.sheet;
  if (sheet.draftKey) {
    try { localStorage.removeItem(DRAFT_PREFIX + sheet.draftKey); } catch {}
  }
  sheet.draftKey = null;
  sheet.draftValues = {};
}

export function isSheetOpen(app) {
  return !app.dom.sheet.hidden && !app.dom.sheet.inert;
}

export function closeSheet(app) {
  const node = app.dom.sheet;
  if (node.hidden) return;
  const epoch = ++app.sheet.epoch;
  const scrim = document.getElementById('sheet-scrim');
  node.inert = true;
  playMotion(scrim, [{opacity: 1}, {opacity: 0}], {duration: MOTION.exit});
  exitSurface(node).then(() => {
    if (epoch !== app.sheet.epoch) return;
    scrim?.remove();
    node.hidden = true;
    node.replaceChildren();
    node.inert = false;
    app.dom.planner.inert = false;
    app.sheet.returnFocus?.focus?.({preventScroll: true});
  });
}

/** Ask before throwing away typed changes; otherwise close. */
export function dismissSheet(app) {
  const node = app.dom.sheet;
  const dirty = app.sheet.draftKey && node.dataset.dirty === 'true' && node.querySelector('input,textarea,select');
  if (!dirty) {
    closeSheet(app);
    return;
  }
  const footer = node.querySelector('.sheet-actions');
  if (footer.querySelector('.discard-controls')) return;
  const previous = [...footer.childNodes];
  const confirm = el('div', 'discard-controls');
  confirm.append(
    el('p', '', 'Discard changes?'),
    button('Keep editing', () => footer.replaceChildren(...previous), 'text-btn'),
    button('Discard', () => { discardDraft(app); closeSheet(app); }, 'text-btn danger'),
  );
  footer.replaceChildren(confirm);
}

function installHandle(app, handle) {
  let startY = null;
  handle.addEventListener('pointerdown', event => {
    startY = event.clientY;
    handle.setPointerCapture?.(event.pointerId);
  });
  handle.addEventListener('pointerup', event => {
    if (startY == null) return;
    const moved = event.clientY - startY;
    startY = null;
    if (moved > 70) dismissSheet(app);
    else if (moved < -40) app.dom.sheet.classList.add('expanded');
  });
  handle.addEventListener('pointercancel', () => { startY = null; });
}

/**
 * Open (or replace) the bottom sheet. `draftKey` makes every field remember its value
 * in localStorage until saved or discarded; `seed` pre-fills a draft from Capture.
 */
export function openSheet(app, title, {draftKey = null, seed = null, variant = 'detail', showTitle = true} = {}) {
  const node = app.dom.sheet;
  const replacing = !node.hidden && !node.inert;
  ++app.sheet.epoch;
  stopMotion(node);
  node.inert = false;
  document.querySelectorAll('.sheet-scrim').forEach(n => n.remove());
  app.sheet.version = app.data().version;
  app.sheet.draftKey = draftKey;
  app.sheet.draftValues = {...(seed ?? {})};
  if (draftKey) {
    app.sheet.draftValues = {...app.sheet.draftValues, ...loadDraft(draftKey)};
    if (seed) storeDraft(app.sheet);
  }
  if (!node.contains(document.activeElement)) app.sheet.returnFocus = document.activeElement;

  node.hidden = false;
  node.className = 'sheet sheet-' + variant;
  node.setAttribute('aria-label', title);
  node.dataset.dirty = 'false';
  node.addEventListener('input', () => { node.dataset.dirty = 'true'; }, {once: true});
  node.replaceChildren();
  app.dom.planner.inert = true;

  const scrim = button('', () => dismissSheet(app), 'sheet-scrim');
  scrim.id = 'sheet-scrim';
  scrim.setAttribute('aria-label', 'Close sheet');
  node.before(scrim);

  const handle = el('div', 'sheet-handle');
  handle.setAttribute('aria-hidden', 'true');
  installHandle(app, handle);

  const header = el('header', 'sheet-header');
  const close = iconButton('close', 'Close', () => dismissSheet(app), {cls: 'sheet-close'});
  const heading = el('h2', showTitle ? '' : 'visually-hidden', title);
  header.append(heading, close);

  const body = el('div', 'sheet-body');
  const actions = el('div', 'sheet-actions');
  node.append(handle, header, body, actions);
  if (draftKey && !seed && Object.keys(app.sheet.draftValues).length) {
    body.append(el('p', 'sheet-note', 'Draft restored. Review the details before saving.'));
  }
  close.focus({preventScroll: true});
  enterSurface(replacing ? body : node, replacing ? 'fade' : 'sheet');
  playMotion(scrim, [{opacity: 0}, {opacity: 1}], {duration: MOTION.enter});
  return {body, actions, header, sheet: node};
}

/** Remember a field's value in the current draft and restore a cached value. */
export function rememberField(app, key, node) {
  const sheet = app.sheet;
  if (!sheet.draftKey) return;
  const cached = sheet.draftValues[key];
  if (cached !== undefined) {
    if (node.type === 'checkbox') node.checked = !!cached;
    else if (node.tagName !== 'SELECT' || [...node.options].some(o => o.value === cached)) node.value = cached;
  }
  const record = () => {
    sheet.draftValues[key] = node.type === 'checkbox' ? node.checked : node.value;
    storeDraft(sheet);
  };
  node.addEventListener('input', record);
  node.addEventListener('change', record);
}

export function rememberValue(app, key, value) {
  if (!app.sheet.draftKey) return;
  app.sheet.draftValues[key] = value;
  storeDraft(app.sheet);
  app.dom.sheet.dataset.dirty = 'true';
}

/** M3 outlined text field. `key` names the draft slot (defaults to the label). */
export function field(app, host, label, value, type = 'text', {key = label, helper = ''} = {}) {
  const wrap = el('label', 'text-field');
  const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type;
  input.value = value ?? '';
  input.placeholder = ' ';
  rememberField(app, key, input);
  wrap.append(input, el('span', 'field-label', label));
  if (helper) wrap.append(el('small', 'field-helper', helper));
  host.append(wrap);
  return input;
}

export function select(app, host, label, value, options, {key = label} = {}) {
  const wrap = el('label', 'text-field select-field');
  const input = el('select');
  for (const [optionValue, text] of options) {
    const option = el('option', '', text);
    option.value = optionValue ?? '';
    input.append(option);
  }
  input.value = value ?? '';
  rememberField(app, key, input);
  wrap.append(input, el('span', 'field-label', label));
  host.append(wrap);
  return input;
}

export function checkbox(app, host, label, value) {
  const wrap = el('label', 'check-field');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = !!value;
  rememberField(app, label, input);
  wrap.append(input, el('span', '', label));
  host.append(wrap);
  return input;
}

/** Keep focus inside the sheet and let Escape behave like Back. */
export function installSheetKeys(app) {
  app.dom.sheet.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismissSheet(app);
      return;
    }
    if (event.key !== 'Tab') return;
    const nodes = [...app.dom.sheet.querySelectorAll('button,input,select,textarea,[tabindex="0"]')]
      .filter(n => !n.disabled && n.getClientRects().length);
    const first = nodes[0];
    const last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
}
