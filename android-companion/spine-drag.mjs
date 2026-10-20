import {lockAxis} from './task-swipe.mjs';

export const HOLD_LIFT = 250;
/** The spine's own scale: a card grows 24dp per half hour, so 12dp is one 15-minute step. */
export const PX_PER_MIN = 0.8;
export const START_SNAP = 15;
export const MIN_LENGTH = 5;
export const MAX_LENGTH = 240;
const MIN = 60000;

/**
 * One press on a card, as a reducer over {type: 'down'|'move'|'tick'|'up'|'cancel', t, x, y}.
 * Phases: pressed (waiting), scroll or swipe (the press moved first and is not ours), lifted (held, not moved yet),
 * dragging (lifted and moving). 'up' returns {phase: 'idle', drop: dy} after a drag and {phase: 'idle', held: ms} after
 * a lift that never moved.
 */
export function pressStep(state, event) {
  const {type, t, x, y} = event;
  if (type === 'down') return {phase: 'pressed', x0: x, y0: y, t0: t, dy: 0};
  if (!state || state.phase === 'idle') return {phase: 'idle'};
  if (type === 'cancel') return {phase: 'idle'};
  if (type === 'tick') return state.phase === 'pressed' && t - state.t0 >= HOLD_LIFT ? {...state, phase: 'lifted'} : state;
  if (type === 'move') {
    const dx = x - state.x0, dy = y - state.y0;
    if (state.phase === 'pressed') {
      const axis = lockAxis(dx, dy);
      return axis === 'y' ? {...state, phase: 'scroll'} : axis === 'x' ? {...state, phase: 'swipe'} : state;
    }
    if (state.phase === 'lifted' || state.phase === 'dragging') {
      return dy === 0 && state.phase === 'lifted' ? state : {...state, phase: 'dragging', dy};
    }
    return state;
  }
  if (type === 'up') {
    if (state.phase === 'dragging') return {phase: 'idle', drop: state.dy};
    if (state.phase === 'lifted') return {phase: 'idle', held: t - state.t0};
    return {phase: 'idle'};
  }
  return state;
}

/** The start a card dragged by `dy` px lands on: snapped to 15 minutes and kept inside its day. */
export function snapStart(start, dy, dayStart) {
  const step = START_SNAP * MIN;
  const moved = start + Math.round(dy / PX_PER_MIN) * MIN;
  const snapped = Math.round(moved / step) * step;
  return Math.min(dayStart + 24 * 60 * MIN - step, Math.max(dayStart, snapped));
}

/** The length a card's knurl dragged by `dy` px gives: 5-minute steps under 30 minutes, 15-minute steps from there. */
export function snapLength(minutes, dy) {
  const raw = (minutes || 0) + dy / PX_PER_MIN;
  const step = raw < 30 ? 5 : 15;
  return Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.round(raw / step) * step));
}

/** One glass per 24dp dragged right across the Water row; dragging back takes the extra glasses off before letting go. */
export const GLASS_PX = 24;
export function glassesFor(dx, count, most = 30) {
  return Math.min(Math.max(most, count), Math.max(count, count + Math.trunc(dx / GLASS_PX)));
}

/** The live label's top while a card moves or resizes: 12dp above the card, or 12dp below it near the screen's top. */
export const LABEL_GAP = 12;
export const LABEL_HEIGHT = 28;
export function labelTop(cardTop, cardBottom, viewTop = 0) {
  const above = cardTop - LABEL_GAP - LABEL_HEIGHT;
  return above >= viewTop + 8 ? above : cardBottom + LABEL_GAP;
}

/** The length knurl shows on a timed, open card that has not ended: a past or untimed (Anytime) card has none. */
export const hasKnurl = row => row.start != null && !row.done && !row.past;
