const SLOP_DP = 8, COMMIT_X_DP = 90, COMMIT_Y_DP = 48, ISLAND_UP_DP = 24, FLICK_DP = 24, FLICK_DP_PER_MS = 0.5, LONG_MS = 500, FOLLOW = 0.35, MAX_FOLLOW_DP = 28;

const dirOf = (axis, d) => axis === 'x' ? (d > 0 ? 'right' : 'left') : (d > 0 ? 'down' : 'up');
const reduced = () => document.documentElement.dataset.reduceMotion === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Swipes and long-press on one element; handlers() returns {left, right, up, down, longPress} for its current state. */
export function swipeable(el, handlers) {
  let start = null, timer = 0, swallow = false;
  const reset = () => {
    clearTimeout(timer);
    start = null;
    delete el.dataset.dragging;
    el.style.translate = '';
  };
  el.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    const h = handlers();
    start = {x: event.clientX, y: event.clientY, t: event.timeStamp, id: event.pointerId, axis: null, h};
    swallow = false;
    if (h.longPress) timer = setTimeout(() => { swallow = true; reset(); h.longPress(); }, LONG_MS);
  });
  el.addEventListener('pointermove', event => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.axis) {
      if (Math.hypot(dx, dy) < SLOP_DP) return;
      clearTimeout(timer);
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      el.setPointerCapture(event.pointerId);
      el.dataset.dragging = '';
    }
    if (reduced()) return;
    const d = start.axis === 'x' ? dx : dy, give = start.h[dirOf(start.axis, d)] ? FOLLOW : FOLLOW / 3;
    const pull = Math.max(-MAX_FOLLOW_DP, Math.min(MAX_FOLLOW_DP, d * give));
    el.style.translate = start.axis === 'x' ? `${pull}px 0` : `0 ${pull}px`;
  });
  el.addEventListener('pointerup', event => {
    if (swallow) setTimeout(() => { swallow = false; });
    if (!start || event.pointerId !== start.id) return;
    const {axis, h, x, y, t} = start;
    reset();
    if (!axis) return;
    swallow = true;
    setTimeout(() => { swallow = false; });
    const d = axis === 'x' ? event.clientX - x : event.clientY - y, speed = Math.abs(d) / Math.max(1, event.timeStamp - t);
    const commit = axis === 'x' ? COMMIT_X_DP : d < 0 ? ISLAND_UP_DP : COMMIT_Y_DP;
    const far = Math.abs(d) >= commit || (Math.abs(d) >= FLICK_DP && speed >= FLICK_DP_PER_MS);
    const act = h[dirOf(axis, d)];
    if (far && act) {
      navigator.vibrate?.(10);
      act();
    }
  });
  el.addEventListener('pointercancel', reset);
  el.addEventListener('contextmenu', event => event.preventDefault());
  el.addEventListener('click', event => {
    if (!swallow) return;
    swallow = false;
    event.stopPropagation();
    event.preventDefault();
  }, true);
}
