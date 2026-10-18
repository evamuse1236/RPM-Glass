/** Motion tokens and screen transitions (surface-motion.mjs re-exports them). Interruptible, local motion on Material 3 tokens. Storage and navigation never wait on decoration.
 * Every animation starts from what is on screen now, so a tap during a transition redirects it. */
const running = new Map();

/** M3 easing and duration tokens (androidx MotionTokens). theme.css carries the same values as --ease-* and --dur-*. */
export const EASE = Object.freeze({
  emphasized: 'cubic-bezier(.2,0,0,1)',
  emphasizedDecelerate: 'cubic-bezier(.05,.7,.1,1)',
  emphasizedAccelerate: 'cubic-bezier(.3,0,.8,.15)',
  standard: 'cubic-bezier(.2,0,0,1)',
  standardDecelerate: 'cubic-bezier(0,0,0,1)',
  standardAccelerate: 'cubic-bezier(.3,0,1,1)',
});
export const DURATION = Object.freeze({
  short1: 50, short2: 100, short3: 150, short4: 200,
  medium1: 250, medium2: 300, medium3: 350, medium4: 400,
});
/** Pairings used by the planner: sheets enter in 350ms and leave in 200ms, screens move in 300ms. Rows slide in
 * 300ms and open, collapse or resize in 250ms. A shared axis or fade through is sequenced as M3 specifies: the
 * outgoing layer fades out over 0–90ms and the incoming one fades in over 90–300ms, so the two are never seen on top
 * of each other; both move from the first frame. */
export const MOTION = Object.freeze({
  navigate: DURATION.medium2, enter: DURATION.medium3, exit: DURATION.short4, feedback: DURATION.short3,
  layout: DURATION.medium2, resize: DURATION.medium1, fadeOut: 90, fadeInDelay: 90, fadeIn: 210, axis: 30,
  ease: EASE.standard,
});

/** Scroll `body` by `delta` as one 250ms standard motion the animation clock can slow down: the scroll position
 * changes at once and the content slides from where it was (so it is never a one-frame jump). */
export function slideScroll(body, delta) {
  const before = body.scrollTop;
  body.scrollTop = before + delta;
  const moved = body.scrollTop - before;
  if (!moved || reducedMotion()) return;
  for (const child of body.children) {
    if (!child.getClientRects().length) continue;
    child.animate([{transform: `translateY(${moved}px)`}, {transform: 'none'}],
      {duration: DURATION.medium1, easing: EASE.standard, composite: 'add'});
  }
}

/** Resolves after `ms` on the animation clock (so it slows down with the animations it orders), at once with
 * reduced motion. */
export function waitMotion(ms) {
  // A detached timer node: nothing on the page is animated (it is not a crossfade of the page), only the clock runs.
  const timer = globalThis.document?.createElement?.('i');
  if (!timer?.animate || reducedMotion()) return Promise.resolve();
  return timer.animate([{}, {}], {duration: ms}).finished.then(() => {}, () => {});
}

export const reducedMotion = () => globalThis.document?.documentElement.dataset.reduceMotion === 'true'
  || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Nodes with a motion running (reduced motion stops them all). */
export const runningNodes = () => [...running.keys()];

export function stopMotion(node) {
  const previous = running.get(node);
  if (!previous) return;
  running.delete(node);
  for (const animation of previous) animation.cancel();
}

/** One owner per node: a new motion cancels the old one. Resolves true when it ran to the end. */
export function playMotion(node, frames, {duration = MOTION.feedback, easing = MOTION.ease, delay = 0, fill = 'none',
  keep = false} = {}) {
  if (!node) return Promise.resolve(true);
  if (!keep) stopMotion(node);
  if (reducedMotion() || !node.animate) return Promise.resolve(true);
  const animation = node.animate(frames, {duration, easing, delay, fill: delay && fill === 'none' ? 'backwards' : fill});
  const list = running.get(node) ?? [];
  list.push(animation);
  running.set(node, list);
  return animation.finished.then(() => {
    const now = running.get(node);
    if (!now?.includes(animation)) return false;
    now.splice(now.indexOf(animation), 1);
    if (!now.length) running.delete(node);
    return true;
  }, () => false);
}

/** In-screen elements (snackbar, banners): a short rise and fade. Screens use sharedAxis or fadeThrough. */
export function enterSurface(node, direction = 'fade') {
  const transform = {up: 'translateY(16px)', down: 'translateY(-16px)', right: `translateX(${MOTION.axis}px)`,
    left: `translateX(-${MOTION.axis}px)`, sheet: 'translateY(100%)', fade: 'translateY(8px)'}[direction] ?? 'translateY(8px)';
  return playMotion(node, [{opacity: direction === 'sheet' ? 1 : 0, transform}, {opacity: 1, transform: 'none'}],
    {duration: direction === 'sheet' ? MOTION.enter : DURATION.medium1, easing: EASE.emphasizedDecelerate});
}
export function exitSurface(node) {
  return playMotion(node, [{opacity: 1, transform: getComputedStyle(node).transform}, {opacity: 0, transform: 'translateY(16px)'}],
    {duration: DURATION.short3, easing: EASE.emphasizedAccelerate});
}

/** A frozen copy of what was on screen, pinned over `rect`, that cannot be focused or tapped. */
export function ghost(nodes, rect, host, {cls = '', scrollTop = 0} = {}) {
  const layer = document.createElement('div');
  layer.className = 'motion-ghost-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  const hostRect = host.getBoundingClientRect();
  layer.style.setProperty('--ghost-top', rect.top - hostRect.top + 'px');
  layer.style.setProperty('--ghost-left', rect.left - hostRect.left + 'px');
  layer.style.setProperty('--ghost-width', rect.width + 'px');
  layer.style.setProperty('--ghost-height', rect.height + 'px');
  const inner = document.createElement('div');
  inner.className = cls;
  if (scrollTop) inner.style.setProperty('--ghost-scroll', -scrollTop + 'px');
  inner.classList.add('motion-ghost-inner');
  inner.append(...nodes);
  layer.append(inner);
  host.append(layer);
  return layer;
}

const transitions = new Set();
/** Ends any screen transition at once (its ghosts go, the live screen settles). */
export function settleTransitions() {
  for (const end of [...transitions]) end();
}

function screenTransition(outgoing, incoming, plan) {
  settleTransitions();
  if (reducedMotion()) {
    outgoing.forEach(layer => layer.remove());
    return Promise.resolve(true);
  }
  const animations = [];
  for (const layer of outgoing) animations.push(...plan.out(layer));
  for (const node of incoming) if (node) animations.push(...plan.in(node));
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    transitions.delete(end);
    outgoing.forEach(layer => layer.remove());
    for (const animation of animations) animation.cancel();
  };
  transitions.add(end);
  return Promise.all(animations.map(a => a.finished.then(() => true, () => false))).then(results => {
    end();
    return results.every(Boolean);
  });
}

/** M3 shared axis: outgoing and incoming slide together by 30dp from the first frame (X for siblings and push/pop, Y
 * for a step down in hierarchy such as the weekly review); the old fades out by 90ms, then the new fades in (90–300ms).
 * `back` reverses. */
export function sharedAxis(outgoing, incoming, {back = false, axis = 'x'} = {}) {
  const shift = (back ? -1 : 1) * MOTION.axis;
  const move = px => (axis === 'y' ? `translateY(${px}px)` : `translateX(${px}px)`);
  return screenTransition(outgoing, incoming, {
    out: layer => [
      layer.animate([{transform: 'none'}, {transform: move(-shift)}],
        {duration: MOTION.navigate, easing: EASE.emphasized, fill: 'forwards'}),
      layer.animate([{opacity: 1}, {opacity: 0}],
        {duration: MOTION.fadeOut, easing: EASE.standardAccelerate, fill: 'forwards'}),
    ],
    in: node => [
      node.animate([{transform: move(shift)}, {transform: 'none'}],
        {duration: MOTION.navigate, easing: EASE.emphasized}),
      node.animate([{opacity: 0}, {opacity: 1}],
        {duration: MOTION.fadeIn, delay: MOTION.fadeInDelay, easing: EASE.standardDecelerate, fill: 'backwards'}),
    ],
  });
}

/** A page taller than its scroller grows from the middle of what is on screen, not the middle of the whole page. */
function originOf(node) {
  const host = node.parentElement;
  if (!host || host.scrollHeight <= host.clientHeight + 1) return '50% 50%';
  const top = node.getBoundingClientRect().top - host.getBoundingClientRect().top;
  return `50% ${Math.round(host.clientHeight / 2 - top)}px`;
}

/** M3 fade through for unrelated destinations (navigation bar tabs): the old fades out by 90ms, then the new fades in
 * (90–300ms) while it grows from 92% (the scale runs from the first frame, so the tap answers at once). */
export function fadeThrough(outgoing, incoming, {scale = true} = {}) {
  return screenTransition(outgoing, incoming, {
    out: layer => [layer.animate([{opacity: 1}, {opacity: 0}],
      {duration: MOTION.fadeOut, easing: EASE.standardAccelerate, fill: 'forwards'})],
    in: node => [
      node.animate([{opacity: 0}, {opacity: 1}],
        {duration: MOTION.fadeIn, delay: MOTION.fadeInDelay, easing: EASE.standardDecelerate, fill: 'backwards'}),
      ...(scale ? [node.animate([{transform: 'scale(.92)', transformOrigin: originOf(node)},
        {transform: 'none', transformOrigin: originOf(node)}], {duration: MOTION.navigate, easing: EASE.emphasizedDecelerate})] : []),
    ],
  });
}
