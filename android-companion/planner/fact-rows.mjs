/**
 * The row grammar shared by the task sheet and the habit editors: an icon on the left, then chips that swipe sideways,
 * a stepper, a switch or a time. Every control hands its value straight back; the caller saves it with Undo.
 */
import {reducedMotion} from '../surface-motion.mjs';
import {el, icon, button} from './dom.mjs';

const SPRING = 'cubic-bezier(.34,1.56,.64,1)';

/** One fact: a 24dp icon in a 40dp column, then `content` (a node or a list of nodes). */
export function factRow(symbol, content, {cls = ''} = {}) {
  const row = el('div', ('edit-row ' + cls).trim());
  const body = el('div', 'edit-body');
  body.append(...[content].flat().filter(Boolean));
  row.append(icon(symbol, {cls: 'edit-icon'}), body);
  return row;
}

/** A borderless field on one line that grows with its words and saves when it loses focus. Returns the textarea. */
export function textRow(host, symbol, label, value, onSave) {
  const row = el('label', 'edit-row edit-field');
  const input = el('textarea');
  input.rows = 1;
  input.placeholder = label;
  input.value = value ?? '';
  input.setAttribute('aria-label', label);
  input.grow = () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  };
  input.addEventListener('input', input.grow);
  input.addEventListener('change', () => onSave(input.value));
  row.append(icon(symbol, {cls: 'edit-icon'}), input);
  host.append(row);
  return input;
}

/** A sideways-scrolling row of chips named for screen readers. */
export function chipRow(label) {
  const row = el('div', 'chip-row edit-chips');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', label);
  return row;
}

/** A filter chip with a value. A chip with no icon of its own shows a check once chosen, so colour is never alone. */
export function chip(text, value, onPick, {symbol = '', aria = '', cls = ''} = {}) {
  const node = button('', () => {
    if (node.getAttribute('aria-disabled') === 'true') return;
    onPick(value, node);
  }, ('chip ' + cls).trim());
  node.dataset.value = value;
  node.append(icon(symbol || 'check', {cls: symbol ? 'chip-icon' : 'chip-icon chip-check'}), el('span', 'chip-label', text));
  if (aria) node.setAttribute('aria-label', aria);
  node.setAttribute('aria-pressed', 'false');
  return node;
}

/** A chip that opens the phone's own date, time or number entry; `onValue` gets what was entered. */
export function pickerChip(type, symbol, text, aria, onValue) {
  const node = el('label', 'chip picker-chip');
  const input = el('input');
  input.type = type;
  input.setAttribute('aria-label', aria);
  if (type === 'number') {
    input.inputMode = 'numeric';
    input.placeholder = text;
    input.addEventListener('change', () => { if (input.value) onValue(input.value, input); });
    node.classList.add('number-chip');
    node.append(icon(symbol, {cls: 'chip-icon'}), input, el('span', 'chip-unit', 'min'));
    return {node, input};
  }
  input.addEventListener('change', () => { if (input.value) onValue(input.value, input); });
  input.addEventListener('click', event => { try { event.currentTarget.showPicker?.(); } catch {} });
  node.append(icon(symbol, {cls: 'chip-icon'}), el('span', 'chip-label', text), input);
  return {node, input};
}

/** Mark the chip holding `value` (all others off); returns it. */
export function markChips(row, value) {
  let chosen = null;
  for (const node of row.querySelectorAll('button.chip')) {
    const on = node.dataset.value === value;
    if (on) chosen = node;
    if (node.getAttribute('aria-pressed') !== String(on)) node.setAttribute('aria-pressed', String(on));
  }
  return chosen;
}

/** A chip just chosen: its icon springs from 60% (200ms), and the row slides it fully into view (250ms). */
export function settleChip(row, node) {
  if (!node) return;
  if (!reducedMotion()) node.querySelector('.chip-icon')?.animate([{scale: .6}, {scale: 1}], {duration: 200, easing: SPRING});
  revealChip(row, node, {smooth: true});
}

/**
 * Scroll `row` so `node` shows: `second` puts it second from the start (the chip before it peeking), otherwise it
 * moves only as far as needed. On open nothing animates.
 */
export function revealChip(row, node, {smooth = false, second = false} = {}) {
  if (!row || !node || !row.isConnected) return;
  const box = row.getBoundingClientRect(), at = node.getBoundingClientRect();
  const start = parseFloat(getComputedStyle(row).paddingInlineStart) || 0;
  const end = parseFloat(getComputedStyle(row).paddingInlineEnd) || 0;
  let left = row.scrollLeft;
  if (second) {
    const before = node.previousElementSibling?.getBoundingClientRect() ?? at;
    left += before.left - box.left - start;
  } else if (at.left < box.left + start) left += at.left - box.left - start;
  else if (at.right > box.right - end) left += at.right - box.right + end;
  else return;
  row.scrollTo({left: Math.max(0, left), behavior: smooth && !reducedMotion() ? 'smooth' : 'instant'});
}

/** Chips (and picker chips) on or off together; off is 38% and not tappable. */
export function setDisabled(row, off) {
  row.classList.toggle('is-off', off);
  for (const node of row.querySelectorAll('.chip')) {
    node.setAttribute('aria-disabled', String(off));
    const input = node.querySelector('input');
    if (input) input.disabled = off;
  }
}

/** M3 switch: the whole button toggles it. */
export function switchButton(label, onToggle, {cls = ''} = {}) {
  const node = button('', () => onToggle(node.getAttribute('aria-checked') !== 'true'), ('switch-btn ' + cls).trim());
  node.setAttribute('role', 'switch');
  node.setAttribute('aria-label', label);
  const track = el('span', 'switch');
  track.append(el('span', 'switch-thumb'));
  node.append(el('span', 'switch-label', label), track);
  node.set = on => node.setAttribute('aria-checked', String(!!on));
  return node;
}

/**
 * A number with − and + (48dp round buttons). Holding a button repeats every 150ms. `format(value)` writes the value;
 * `next(value, delta)` gives the value one press away; `onChange(value)` runs on every step, so the caller decides
 * when to save.
 */
export function stepper({label, less, more, min, max, next, format = String, onChange}) {
  const node = el('div', 'stepper');
  node.setAttribute('role', 'group');
  node.setAttribute('aria-label', label);
  const value = el('output', 'stepper-value tnum');
  value.setAttribute('aria-live', 'polite');
  let current = min;
  const paint = () => {
    value.textContent = format(current);
    down.disabled = current <= min;
    up.disabled = current >= max;
  };
  const step = delta => {
    const moved = next(current, delta);
    if (moved === current) return false;
    current = moved;
    paint();
    onChange(current);
    return true;
  };
  const press = (delta, aria, symbol) => {
    const b = button('', null, 'stepper-btn');
    b.setAttribute('aria-label', aria);
    b.append(icon(symbol));
    let timer = 0, held = false;
    const stop = () => { clearTimeout(timer); timer = 0; };
    b.addEventListener('pointerdown', event => {
      if (event.button > 0) return;
      held = false;
      const repeat = () => { held = true; if (step(delta)) timer = setTimeout(repeat, 150); };
      timer = setTimeout(repeat, 400);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(type, stop);
    b.addEventListener('click', () => { if (!held) step(delta); held = false; });
    return b;
  };
  const down = press(-1, less, 'remove');
  const up = press(1, more, 'add');
  node.append(down, value, up);
  node.set = v => { current = v; paint(); };
  return node;
}

/** A time that opens the phone's time picker: "From 8:00 AM ›". */
export function timeButton(label, onValue, {cls = ''} = {}) {
  const node = el('label', ('time-button ' + cls).trim());
  const input = el('input');
  input.type = 'time';
  input.setAttribute('aria-label', label);
  input.addEventListener('change', () => { if (input.value) onValue(input.value); });
  input.addEventListener('click', event => { try { event.currentTarget.showPicker?.(); } catch {} });
  const text = el('span', 'time-value tnum');
  node.append(el('span', 'time-label', label), text, icon('chevron_right', {cls: 'time-chevron'}), input);
  node.set = (value, words) => {
    input.value = value;
    text.textContent = words;
    input.setAttribute('aria-label', `${label}, ${words}`);
  };
  return node;
}

