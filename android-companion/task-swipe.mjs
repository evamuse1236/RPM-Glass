// Row gestures, pointer events only. Vertical movement belongs to scrolling: a drag locks to one axis once it has
// moved SWIPE_LOCK px, and only a horizontal lock moves the row. Short drags and cancels never change the plan.
import {reducedMotion} from './motion-core.mjs';

export const SWIPE_LOCK = 8;
export const SWIPE_COMMIT = 90;
export const LONG_PRESS = 400;
/** Horizontal must lead vertical by this factor, so a slightly slanted scroll stays a scroll. */
export const X_BIAS = 1.2;
const SETTLE = 200;
const CARRY = 150;

/** 'x' (the row's swipe), 'y' (the page's scroll), or null while the finger is still within SWIPE_LOCK. */
export function lockAxis(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_LOCK) return null;
  return Math.abs(dx) > Math.abs(dy) * X_BIAS ? 'x' : 'y';
}

/** A horizontal gesture never starts within 24dp of a screen edge: those belong to the system's Back. */
export const EDGE = 24;
export const nearEdge = (x, width) => x < EDGE || x > width - EDGE;

export const swipeSide = dx => (dx > 0 ? 'right' : dx < 0 ? 'left' : null);

/** The side whose action fires when a horizontal drag is let go at `dx`; null springs the row back. */
export function releaseSide(dx, sides) {
  const side = swipeSide(dx);
  return side && sides[side] && Math.abs(dx) >= SWIPE_COMMIT ? side : null;
}

/** With the finger toward a side that acts (up to 80% of the row's width); at rest toward one that does not. */
export function rowOffset(dx, sides, width) {
  const side = swipeSide(dx);
  if (!side || !sides[side]) return 0;
  const limit = (width || 200) * 0.8;
  return Math.max(-limit, Math.min(limit, dx));
}

export const REVEALS = {
  done: ['check', 'Done'],
  schedule: ['event_upcoming', 'Schedule'],
  remove: ['delete', 'Delete'],
  log: ['restaurant', 'Log now'],
  choose: ['check', 'Choose'],
};

/** The coloured layer under a dragged row: an icon and the word, so colour is never the only signal. */
function reveal(row, {kind, word: named, symbol: drawn}, side) {
  let layer = row.querySelector(':scope > .swipe-reveal');
  if (!layer) {
    layer = document.createElement('span');
    layer.className = 'swipe-reveal';
    layer.setAttribute('aria-hidden', 'true');
    const symbol = document.createElement('span');
    symbol.className = 'ms';
    const word = document.createElement('span');
    word.className = 'swipe-word';
    layer.append(symbol, word);
    row.prepend(layer);
    let surface = 'transparent';
    for (let node = row; node && surface === 'transparent'; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) surface = bg;
    }
    row.style.setProperty('--swipe-surface', surface === 'transparent' ? 'var(--surface)' : surface);
    row.style.setProperty('--swipe-edge', getComputedStyle(row).borderTopColor);
  }
  layer.dataset.kind = kind;
  layer.dataset.side = side;
  const [symbol, word] = REVEALS[kind];
  layer.firstChild.textContent = drawn ?? symbol;
  layer.lastChild.textContent = named ?? word;
  return layer;
}

export const vibrate = () => { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(10); };

/**
 * sides: right and left, each {kind, run(row), leave, word, symbol}; `word` and `symbol` replace the kind's own word
 * and icon in the reveal. `run` acts and may resolve false when nothing happened.
 * `leave` carries the row off its edge first (150ms) and it then collapses where it was; otherwise the row springs back
 * (200ms) as `run` opens its choices. Past SWIPE_COMMIT the reveal fills and its icon grows, with one haptic tick.
 * hold(row) runs when the row is held still for LONG_PRESS ms, on a right click, or on the keyboard's menu key.
 */
export function attachSwipe(row, {right = null, left = null, hold = null, haptic = vibrate} = {}) {
  const sides = {right, left};
  let start = null, axis = null, armed = false, swallow = false, timer = 0;
  row.classList.add('swipe-task');
  const offset = px => row.style.setProperty('--swipe-offset', px + 'px');
  const after = (ms, fn) => (reducedMotion() ? fn() : setTimeout(fn, ms));
  const clear = () => {
    row.querySelector(':scope > .swipe-reveal')?.remove();
    for (const name of ['--swipe-offset', '--swipe-surface', '--swipe-edge']) row.style.removeProperty(name);
    delete row.dataset.swipe;
    delete row.dataset.armed;
  };
  const settle = () => {
    if (!row.dataset.swipe) return clear();
    row.classList.add('swipe-settling');
    offset(0);
    after(SETTLE, () => { row.classList.remove('swipe-settling'); clear(); });
  };
  /** The click that ends this press never reaches what is under the finger; any later click does. */
  const eatClick = () => {
    swallow = true;
    document.addEventListener('pointerup', () => setTimeout(() => { swallow = false; }), {once: true, capture: true});
  };
  const held = pressed => {
    clearTimeout(timer);
    start = null;
    if (pressed) eatClick();
    haptic();
    hold(row);
  };
  row.addEventListener('pointerdown', event => {
    swallow = false;
    if (event.isPrimary === false || event.button > 0 || event.target.closest('input,select,textarea')
      || row.classList.contains('swipe-leaving')) return;
    start = {x: event.clientX, y: event.clientY, id: event.pointerId, edge: nearEdge(event.clientX, innerWidth)};
    axis = null;
    armed = false;
    row.classList.remove('swipe-settling');
    if (hold) timer = setTimeout(() => { if (start && !axis) held(true); }, LONG_PRESS);
  });
  row.addEventListener('pointermove', event => {
    if (!start || event.pointerId !== start.id) return;
    if (row.classList.contains('lifted')) { start = null; clearTimeout(timer); return; }
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!axis) {
      axis = lockAxis(dx, dy);
      if (!axis) return;
      clearTimeout(timer);
      if (axis === 'y' || start.edge) { start = null; return; }
      try { row.setPointerCapture(event.pointerId); } catch {}
    }
    const side = swipeSide(dx);
    const spec = side && sides[side];
    offset(rowOffset(dx, sides, row.offsetWidth));
    if (!spec) { delete row.dataset.armed; return; }
    reveal(row, spec, side);
    row.dataset.swipe = side;
    const now = Math.abs(dx) >= SWIPE_COMMIT;
    if (now && !armed) haptic();
    armed = now;
    row.dataset.armed = String(now);
  });
  row.addEventListener('pointerup', event => {
    clearTimeout(timer);
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dragged = axis === 'x';
    start = null;
    if (!dragged) return;
    swallow = true;
    setTimeout(() => { swallow = false; });
    const side = releaseSide(dx, sides);
    if (!side) return settle();
    const spec = sides[side];
    if (!spec.leave) {
      settle();
      spec.run(row);
      return;
    }
    row.classList.add('swipe-settling', 'swipe-leaving');
    offset((side === 'right' ? 1 : -1) * (row.offsetWidth + 24));
    const back = () => { if (!row.isConnected) return; row.classList.remove('swipe-leaving'); settle(); };
    after(CARRY, () => {
      row.classList.remove('swipe-settling');
      Promise.resolve(spec.run(row)).then(ok => { if (ok === false) back(); }, back);
    });
  });
  row.addEventListener('pointercancel', () => {
    clearTimeout(timer);
    if (axis === 'x') settle();
    start = null;
  });
  row.addEventListener('contextmenu', event => {
    if (!hold) return;
    event.preventDefault();
    if (!swallow) held(false);
  });
  row.addEventListener('click', event => {
    if (!swallow) return;
    swallow = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

/** The weekly review's Inbox list keeps its own pair: right schedules, left deletes (with Undo). */
export function attachTaskSwipe(row, {schedule = null, remove = null}) {
  attachSwipe(row, {right: schedule && {kind: 'schedule', run: schedule}, left: remove && {kind: 'remove', run: remove, leave: true}});
}
