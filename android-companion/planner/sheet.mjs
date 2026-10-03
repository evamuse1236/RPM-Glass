/** Material 3 bottom sheets with drag handle, draft memory and a dirty-check on dismiss. */
import {MOTION, EASE, DURATION, reducedMotion} from '../surface-motion.mjs';
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

/* ---------- Motion ----------
 * One sheet and one scrim. The sheet rises from the bottom edge and leaves by sliding down; the scrim's opacity
 * follows it (fading evenly on the way out). Opening while a sheet is showing replaces its content in place: the
 * height morphs and the content moves on the shared X axis (forward, or back with `motion: 'back'`), with no second
 * entrance. Every move starts from the pose on screen, so taps redirect it. */
const sheetMotion = new WeakMap();

function scrimFor(app) {
  let scrim = document.getElementById('sheet-scrim');
  if (!scrim) {
    scrim = button('', () => dismissSheet(app), 'sheet-scrim');
    scrim.id = 'sheet-scrim';
    scrim.setAttribute('aria-label', 'Close sheet');
    scrim.hidden = true;
  }
  if (scrim.nextElementSibling !== app.dom.sheet) app.dom.sheet.before(scrim);
  return scrim;
}

function cancelSheetMotion(node) {
  const running = sheetMotion.get(node);
  if (!running) return;
  sheetMotion.delete(node);
  for (const animation of running) animation.cancel();
}

/** The sheet's and scrim's on-screen pose, read before any running motion is cancelled. */
function currentPose(node, scrim) {
  const transform = getComputedStyle(node).transform;
  return {transform: transform === 'none' ? 'translateY(0px)' : transform,
    opacity: scrim.hidden ? 0 : Number(getComputedStyle(scrim).opacity)};
}

const offscreen = node => `translateY(${Math.ceil(node.getBoundingClientRect().height) + 24}px)`;

/** Move sheet and scrim together from `from` to `to`. Resolves true when it reached `to`. */
function moveSheet(node, scrim, from, to, {duration, easing, scrimEasing = easing}) {
  cancelSheetMotion(node);
  node.style.removeProperty('transform');
  scrim.style.removeProperty('opacity');
  if (reducedMotion()) return Promise.resolve(true);
  const animations = [
    node.animate([{transform: from.transform}, {transform: to.transform}], {duration, easing, fill: 'forwards'}),
    scrim.animate([{opacity: from.opacity}, {opacity: to.opacity}], {duration, easing: scrimEasing, fill: 'forwards'}),
  ];
  sheetMotion.set(node, animations);
  return Promise.all(animations.map(a => a.finished)).then(() => {
    if (sheetMotion.get(node) !== animations) return false;
    return true;
  }, () => false);
}

function settleOpen(node) {
  cancelSheetMotion(node);
  node.style.removeProperty('transform');
  document.getElementById('sheet-scrim')?.style.removeProperty('opacity');
}

export function closeSheet(app) {
  const node = app.dom.sheet;
  if (node.hidden) return;
  const epoch = ++app.sheet.epoch;
  const scrim = scrimFor(app);
  const from = currentPose(node, scrim);
  node.inert = true;
  scrim.classList.add('leaving');
  app.dom.planner.inert = false;
  // The scrim fades evenly (linear) while the sheet accelerates away, so it never hangs dark and then drops.
  moveSheet(node, scrim, from, {transform: offscreen(node), opacity: 0},
    {duration: MOTION.exit, easing: EASE.emphasizedAccelerate, scrimEasing: 'linear'}).then(() => {
    if (epoch !== app.sheet.epoch) return;
    cancelSheetMotion(node);
    node.style.removeProperty('transform');
    scrim.hidden = true;
    scrim.classList.remove('leaving');
    node.hidden = true;
    node.replaceChildren();
    node.inert = false;
    node.classList.remove('expanded');
    app.sheet.returnFocus?.focus?.({preventScroll: true});
  });
  app.onSheetClose?.();
}

/** Ask before throwing away typed changes; otherwise close. Returns true when the sheet is closing. */
export function dismissSheet(app) {
  const node = app.dom.sheet;
  const dirty = app.sheet.draftKey && node.dataset.dirty === 'true' && node.querySelector('input,textarea,select');
  if (!dirty) {
    closeSheet(app);
    return true;
  }
  const footer = node.querySelector('.sheet-actions');
  if (footer.querySelector('.discard-controls')) return false;
  const previous = [...footer.childNodes];
  const confirm = el('div', 'discard-controls');
  confirm.append(
    el('p', '', 'Discard changes?'),
    button('Keep editing', () => footer.replaceChildren(...previous), 'text-btn'),
    button('Discard', () => { discardDraft(app); closeSheet(app); }, 'text-btn danger'),
  );
  footer.replaceChildren(confirm);
  return false;
}

function springBack(app) {
  const node = app.dom.sheet;
  const scrim = scrimFor(app);
  moveSheet(node, scrim, currentPose(node, scrim), {transform: 'translateY(0px)', opacity: 1},
    {duration: DURATION.medium1, easing: EASE.standardDecelerate}).then(done => { if (done) settleOpen(node); });
}

/** The handle (and the header's empty space) drags the sheet: it follows the finger, then dismisses or springs back. */
function installDrag(app, zone) {
  let drag = null;
  zone.addEventListener('pointerdown', event => {
    if (event.button > 0 || event.target.closest('button,input,textarea,select,a')) return;
    const node = app.dom.sheet;
    if (!isSheetOpen(app)) return;
    const scrim = scrimFor(app);
    const pose = new DOMMatrixReadOnly(getComputedStyle(node).transform === 'none' ? undefined : getComputedStyle(node).transform);
    cancelSheetMotion(node);
    drag = {id: event.pointerId, y: event.clientY, base: pose.m42, height: node.getBoundingClientRect().height,
      samples: [[event.timeStamp, event.clientY]], moved: false, scrim};
    zone.setPointerCapture?.(event.pointerId);
  });
  zone.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const node = app.dom.sheet;
    const raw = drag.base + event.clientY - drag.y;
    if (Math.abs(event.clientY - drag.y) > 4) drag.moved = true;
    if (!drag.moved) return;
    // Down follows the finger; up resists (the sheet is already as tall as its content allows).
    const y = raw >= 0 ? raw : raw * 0.2;
    node.style.transform = `translateY(${y}px)`;
    drag.scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - y / drag.height)));
    drag.samples.push([event.timeStamp, event.clientY]);
    if (drag.samples.length > 6) drag.samples.shift();
  });
  const release = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const {moved, samples, height, y: startY, base} = drag;
    drag = null;
    if (!moved) {
      if (base) springBack(app);
      return;
    }
    const travel = base + event.clientY - startY;
    const [t0, y0] = samples[0];
    const velocity = (event.clientY - y0) / Math.max(1, event.timeStamp - t0);
    if (travel < -40) app.dom.sheet.classList.add('expanded');
    if ((travel > height * 0.3 || velocity > 0.6) && dismissSheet(app)) return;
    springBack(app);
  };
  zone.addEventListener('pointerup', release);
  zone.addEventListener('pointercancel', event => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    springBack(app);
  });
}

/** Content swap inside an open sheet, on the shared X axis: the old content slides out and fades while the new slides
 * in and fades in over it (both visible, so the sheet is never empty), and the height morphs. */
function replaceContent(node, oldHeight, oldChildren, back) {
  if (reducedMotion() || !oldChildren.length) return;
  const shift = (back ? -1 : 1) * MOTION.axis;
  const ghostLayer = el('div', 'sheet-ghost');
  ghostLayer.setAttribute('aria-hidden', 'true');
  ghostLayer.inert = true;
  ghostLayer.style.setProperty('--ghost-height', oldHeight + 'px');
  // The handle stays where it is: only the content moves.
  ghostLayer.append(el('div', 'sheet-handle'), ...oldChildren.filter(n => !n.classList.contains('sheet-handle')));
  ghostLayer.firstChild.classList.add('sheet-ghost-spacer');
  node.append(ghostLayer);
  const newHeight = node.getBoundingClientRect().height;
  const done = [];
  done.push(ghostLayer.animate([{transform: 'none'}, {transform: `translateX(${-shift}px)`}],
    {duration: MOTION.navigate, easing: EASE.emphasized, fill: 'forwards'}));
  done.push(ghostLayer.animate([{opacity: 1}, {opacity: 0}],
    {duration: MOTION.fadeOut, easing: EASE.standardAccelerate, fill: 'forwards'}));
  for (const part of node.children) {
    if (part === ghostLayer || part.classList.contains('sheet-handle')) continue;
    done.push(part.animate([{transform: `translateX(${shift}px)`}, {transform: 'none'}],
      {duration: MOTION.navigate, easing: EASE.emphasized}));
    done.push(part.animate([{opacity: 0}, {opacity: 1}],
      {duration: MOTION.fadeIn, delay: MOTION.fadeInDelay, easing: EASE.standardDecelerate, fill: 'backwards'}));
  }
  if (Math.abs(newHeight - oldHeight) > 1) {
    node.classList.add('morphing');
    done.push(node.animate([{height: oldHeight + 'px'}, {height: newHeight + 'px'}],
      {duration: MOTION.navigate, easing: EASE.emphasized}));
  }
  Promise.all(done.map(a => a.finished.catch(() => {}))).then(() => {
    ghostLayer.remove();
    if (!node.querySelector('.sheet-ghost')) node.classList.remove('morphing');
  });
}

/** Predictive back on an open sheet: it shrinks toward the bottom edge as the gesture progresses (M3 bottom sheet). */
export function sheetBackProgress(app, progress) {
  const node = app.dom.sheet;
  if (!isSheetOpen(app) || reducedMotion()) return false;
  cancelSheetMotion(node);
  const p = Math.max(0, Math.min(1, progress));
  const rect = node.getBoundingClientRect();
  const sx = 1 - (48 / Math.max(1, rect.width)) * p;
  const sy = 1 - (24 / Math.max(1, rect.height)) * p;
  node.style.transform = `scale(${sx}, ${sy})`;
  return true;
}

export function sheetBackCancel(app) {
  if (!isSheetOpen(app)) return;
  springBack(app);
}

/**
 * Open (or replace) the bottom sheet. `draftKey` makes every field remember its value
 * in localStorage until saved or discarded; `seed` pre-fills a draft from Capture.
 */
export function openSheet(app, title, {draftKey = null, seed = null, variant = 'detail', showTitle = true,
  motion = 'forward'} = {}) {
  const node = app.dom.sheet;
  const scrim = scrimFor(app);
  // Showing (open, or still on its way out): keep sheet and scrim, swap the content.
  const showing = !node.hidden;
  const pose = showing ? currentPose(node, scrim) : null;
  const oldHeight = showing ? node.getBoundingClientRect().height : 0;
  const oldChildren = showing ? [...node.children].filter(n => !n.classList.contains('sheet-ghost')) : [];
  node.querySelectorAll('.sheet-ghost').forEach(n => n.remove());
  ++app.sheet.epoch;
  node.inert = false;
  scrim.classList.remove('leaving');
  app.sheet.version = app.data().version;
  app.sheet.draftKey = draftKey;
  app.sheet.draftValues = {...(seed ?? {})};
  if (draftKey) {
    app.sheet.draftValues = {...app.sheet.draftValues, ...loadDraft(draftKey)};
    if (seed) storeDraft(app.sheet);
  }
  if (!node.contains(document.activeElement)) app.sheet.returnFocus = document.activeElement;

  node.hidden = false;
  scrim.hidden = false;
  const expanded = showing && node.classList.contains('expanded');
  node.className = 'sheet sheet-' + variant + (expanded ? ' expanded' : '');
  node.setAttribute('aria-label', title);
  node.dataset.dirty = 'false';
  node.addEventListener('input', () => { node.dataset.dirty = 'true'; }, {once: true});
  node.replaceChildren();
  app.dom.planner.inert = true;

  const handle = el('div', 'sheet-handle');
  handle.setAttribute('aria-hidden', 'true');
  installDrag(app, handle);

  const header = el('header', 'sheet-header');
  installDrag(app, header);
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

  // Callers fill body and actions right after this returns, so measure the new content on the next frame's start.
  const epoch = app.sheet.epoch;
  const settled = done => { if (done && epoch === app.sheet.epoch) settleOpen(node); };
  const begin = () => {
    if (epoch !== app.sheet.epoch) return;
    if (showing) {
      replaceContent(node, oldHeight, oldChildren, motion === 'back');
      if (pose.transform !== 'translateY(0px)' || pose.opacity < 1) {
        moveSheet(node, scrim, pose, {transform: 'translateY(0px)', opacity: 1},
          {duration: MOTION.navigate, easing: EASE.emphasizedDecelerate}).then(settled);
      } else settleOpen(node);
    } else {
      moveSheet(node, scrim, {transform: offscreen(node), opacity: 0}, {transform: 'translateY(0px)', opacity: 1},
        {duration: MOTION.enter, easing: EASE.emphasizedDecelerate}).then(settled);
    }
  };
  if (showing) {
    // Hold the old pose until the new content is in (the callers fill it before this microtask runs). The height is
    // not held: the new content measures (and may pin) its own height, and replaceContent morphs to it.
    if (!reducedMotion()) {
      cancelSheetMotion(node);
      node.style.transform = pose.transform;
      scrim.style.opacity = String(pose.opacity);
      if (oldChildren.length) node.classList.add('morphing');
    }
    queueMicrotask(begin);
  } else {
    if (!reducedMotion()) {
      node.style.transform = 'translateY(100vh)';
      scrim.style.opacity = '0';
    }
    queueMicrotask(begin);
  }
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

/** Keep focus inside the sheet and let Escape behave like Back. Native predictive back can drive the open sheet
 * through window.rpmBackProgress(progress 0..1) and window.rpmBackCancel(); committing calls rpmHandleBack as before. */
export function installSheetKeys(app) {
  window.rpmBackProgress = progress => sheetBackProgress(app, progress);
  window.rpmBackCancel = () => sheetBackCancel(app);
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
