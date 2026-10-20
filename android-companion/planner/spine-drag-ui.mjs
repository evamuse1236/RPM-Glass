import {pressStep, snapStart, snapLength, glassesFor, HOLD_LIFT} from '../spine-drag.mjs';
import {LONG_PRESS, lockAxis, nearEdge} from '../task-swipe.mjs';
import {cardHeight} from '../spine-model.mjs';
import {clockText} from '../body-state.mjs';
import {duration} from './format.mjs';
import {el} from './dom.mjs';
import {quickMenu} from './row-gestures.mjs';
import {paintWaterTrack} from './spine-view.mjs';

const EDGE_SCROLL = 64;
const LABEL_GAP = 12;
const LABEL_HEIGHT = 28;
const navRoom = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-measured')) || 0;
const typing = () => document.activeElement?.matches?.('input, textarea, [contenteditable=true]');

function floatingLabel() {
  const label = el('div', 'drag-label tnum');
  label.setAttribute('aria-hidden', 'true');
  document.body.append(label);
  return label;
}

function placeLabel(label, x, y, text) {
  if (label.textContent !== text) label.textContent = text;
  const half = label.offsetWidth / 2;
  const left = Math.min(innerWidth - 16 - half, Math.max(16 + half, x)) - half;
  label.style.translate = `${left}px ${Math.max(8, y - LABEL_GAP - LABEL_HEIGHT)}px`;
}

/** Eats the click that ends a drag or a lift, so letting go never also opens the task. */
function clickGuard(node) {
  let eat = false;
  node.addEventListener('click', event => {
    if (!eat) return;
    eat = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  return () => { eat = true; setTimeout(() => { eat = false; }, 400); };
}

/**
 * Hold a timed card still for 250ms and it lifts; drag it up or down and its start follows in 15-minute steps, read out
 * above the finger, and it saves where it is let go with Undo. Held past 400ms and let go without moving, it opens the
 * quick menu. The knurl at its foot drags the length.
 */
export function attachSpineDrag(app, card, row, {dayStart}) {
  const task = row.task.ref;
  const scroller = app.dom.scroll;
  const haptic = kind => app.api.native('haptic', {kind}).catch(() => {});
  const eatClick = clickGuard(card);
  let state = null, timer = 0, pointer = null, label = null, ghost = null, scroll0 = 0, finger = {x: 0, y: 0}, frame = 0, shown = null;

  const offset = () => finger.y - state.y0 + scroller.scrollTop - scroll0;
  const follow = () => {
    if (!state || !card.classList.contains('lifted')) return;
    const dy = offset();
    card.style.setProperty('--drag-y', dy + 'px');
    const start = snapStart(row.start, dy, dayStart);
    if (shown !== start) {
      if (shown != null) haptic('tick');
      shown = start;
    }
    placeLabel(label, finger.x, finger.y, clockText(new Date(start)));
  };
  const autoScroll = () => {
    frame = 0;
    if (!card.classList.contains('lifted')) return;
    const box = scroller.getBoundingClientRect();
    const speed = finger.y < box.top + EDGE_SCROLL ? -6 : finger.y > box.bottom - navRoom() - EDGE_SCROLL ? 6 : 0;
    if (speed) {
      scroller.scrollTop += speed;
      follow();
    }
    frame = requestAnimationFrame(autoScroll);
  };
  const lift = () => {
    card.classList.add('lifted');
    try { card.setPointerCapture(pointer); } catch {}
    ghost = el('span', 'drag-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    card.before(ghost);
    label = floatingLabel();
    scroll0 = scroller.scrollTop;
    shown = null;
    haptic('hold');
    follow();
    frame = requestAnimationFrame(autoScroll);
  };
  const drop = () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    label?.remove();
    label = null;
    if (!card.classList.contains('lifted')) return;
    card.classList.remove('lifted');
    card.classList.add('drag-settling');
    card.style.setProperty('--drag-y', '0px');
    const leaving = ghost;
    ghost = null;
    setTimeout(() => { card.classList.remove('drag-settling'); card.style.removeProperty('--drag-y'); leaving?.remove(); }, 200);
  };

  card.addEventListener('pointerdown', event => {
    if (event.isPrimary === false || event.button > 0 || typing() || event.target.closest('.spine-knurl')) return;
    pointer = event.pointerId;
    finger = {x: event.clientX, y: event.clientY};
    state = pressStep(null, {type: 'down', t: event.timeStamp, x: event.clientX, y: event.clientY});
    timer = setTimeout(() => {
      state = pressStep(state, {type: 'tick', t: performance.now()});
      if (state.phase === 'lifted') lift();
    }, HOLD_LIFT);
  });
  card.addEventListener('pointermove', event => {
    if (!state || event.pointerId !== pointer) return;
    finger = {x: event.clientX, y: event.clientY};
    state = pressStep(state, {type: 'move', t: event.timeStamp, x: event.clientX, y: event.clientY});
    if (state.phase === 'scroll' || state.phase === 'swipe') {
      clearTimeout(timer);
      state = null;
      return;
    }
    if (state.phase === 'dragging') follow();
  });
  card.addEventListener('touchmove', event => { if (card.classList.contains('lifted') && event.cancelable) event.preventDefault(); }, {passive: false});
  card.addEventListener('pointerup', event => {
    if (!state || event.pointerId !== pointer) return;
    const lifted = card.classList.contains('lifted');
    const dy = lifted ? offset() : 0;
    const result = pressStep(state, {type: 'up', t: event.timeStamp});
    state = null;
    drop();
    if (!lifted) return;
    eatClick();
    if (result.drop != null) {
      const start = snapStart(row.start, dy, dayStart);
      if (start === row.start) return;
      haptic('confirm');
      app.commit({type: 'saveTask', id: task.id, fields: {planned: new Date(start).toISOString()}},
        {label: `Moved to ${clockText(new Date(start))}`}).catch(() => {});
    } else if (result.held >= LONG_PRESS) quickMenu(app, task, card);
  });
  card.addEventListener('pointercancel', () => {
    state = null;
    drop();
  });
  card.addEventListener('contextmenu', event => {
    event.preventDefault();
    if (!card.classList.contains('lifted')) quickMenu(app, task, card);
  });

  card.append(knurl(app, card, row, haptic));
}

function knurl(app, card, row, haptic) {
  const task = row.task.ref;
  const minutes = task.minutes ?? row.minutes ?? 0;
  const node = el('button', 'spine-knurl');
  node.type = 'button';
  node.setAttribute('aria-label', `Length, ${minutes ? duration(minutes) : 'not set'}. Change the length`);
  const eatClick = clickGuard(node);
  let press = null, label = null;
  node.addEventListener('click', () => app.actions.openTask(task.id, row.task.occurrence, {focus: 'length'}));
  node.addEventListener('pointerdown', event => {
    if (event.isPrimary === false || event.button > 0 || typing()) return;
    event.stopPropagation();
    press = {y: event.clientY, id: event.pointerId, moved: false, value: minutes};
    try { node.setPointerCapture(event.pointerId); } catch {}
  });
  node.addEventListener('pointermove', event => {
    if (!press || event.pointerId !== press.id) return;
    const dy = event.clientY - press.y;
    if (!press.moved && Math.abs(dy) < 4) return;
    if (!press.moved) {
      press.moved = true;
      card.classList.add('resizing');
      label = floatingLabel();
    }
    const value = snapLength(minutes, dy);
    if (value !== press.value) haptic('tick');
    press.value = value;
    card.closest('.spine-row')?.style.setProperty('--h', cardHeight(value) + 'px');
    placeLabel(label, event.clientX, event.clientY, duration(value));
  });
  const end = commit => event => {
    if (!press || event.pointerId !== press.id) return;
    const {moved, value} = press;
    press = null;
    label?.remove();
    label = null;
    card.classList.remove('resizing');
    if (!moved) return;
    eatClick();
    if (!commit || value === minutes) {
      card.closest('.spine-row')?.style.setProperty('--h', cardHeight(minutes) + 'px');
      return;
    }
    haptic('confirm');
    app.commit({type: 'saveTask', id: task.id, fields: {minutes: value}}, {label: `Length ${duration(value)}`}).catch(() => {});
  };
  node.addEventListener('pointerup', end(true));
  node.addEventListener('pointercancel', end(false));
  return node;
}

/**
 * Drag across the Water row: one glass per 24dp, read out above the finger and filled into the track; let go, the new
 * glasses save as one change with one Undo. A vertical drag stays the page's scroll.
 */
export function attachWaterDrag(app, node, row, track, {log}) {
  const haptic = kind => app.api.native('haptic', {kind}).catch(() => {});
  let start = null, axis = null, label = null, count = row.count;
  const reset = () => {
    label?.remove();
    label = null;
    start = null;
    count = row.count;
    paintWaterTrack(track, row.count, row.goal);
  };
  node.addEventListener('pointerdown', event => {
    if (event.isPrimary === false || event.button > 0 || typing()) return;
    start = {x: event.clientX, y: event.clientY, id: event.pointerId, edge: nearEdge(event.clientX, innerWidth)};
    axis = null;
  });
  node.addEventListener('pointermove', event => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    if (!axis) {
      axis = lockAxis(dx, event.clientY - start.y);
      if (!axis) return;
      if (axis === 'y' || start.edge) { start = null; return; }
      try { node.setPointerCapture(event.pointerId); } catch {}
      label = floatingLabel();
    }
    const next = glassesFor(dx, row.count);
    if (next !== count) haptic('tick');
    count = next;
    paintWaterTrack(track, count, row.goal, row.count);
    placeLabel(label, event.clientX, event.clientY, `${count} of ${row.goal}`);
  });
  node.addEventListener('pointerup', event => {
    if (!start || event.pointerId !== start.id || axis !== 'x') { start = null; return; }
    const added = count - row.count;
    label?.remove();
    label = null;
    start = null;
    if (added > 0) {
      haptic('confirm');
      log(added);
    } else reset();
  });
  node.addEventListener('pointercancel', reset);
}
