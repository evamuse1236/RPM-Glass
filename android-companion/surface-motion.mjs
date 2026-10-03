/** Interruptible, local motion on Material 3 tokens. Storage and navigation never wait on decoration.
 * Every animation starts from what is on screen now, so a tap during a transition redirects it. */
const running = new Map();
const layouts = new Map();

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
/** Pairings used by the planner: sheets enter in 350ms and leave in 200ms, screens move in 300ms. */
export const MOTION = Object.freeze({
  navigate: DURATION.medium2, enter: DURATION.medium3, exit: DURATION.short4, feedback: DURATION.short3,
  layout: DURATION.medium2, fadeOut: 90, fadeIn: 210, axis: 30, ease: EASE.standard,
});

export const reducedMotion = () => globalThis.document?.documentElement.dataset.reduceMotion === 'true'
  || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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

/** M3 shared axis X: outgoing and incoming slide together by 30dp, the old fades out first. `back` reverses. */
export function sharedAxis(outgoing, incoming, {back = false} = {}) {
  const shift = (back ? -1 : 1) * MOTION.axis;
  return screenTransition(outgoing, incoming, {
    out: layer => [
      layer.animate([{transform: 'none'}, {transform: `translateX(${-shift}px)`}],
        {duration: MOTION.navigate, easing: EASE.emphasized, fill: 'forwards'}),
      layer.animate([{opacity: 1}, {opacity: 0}],
        {duration: MOTION.fadeOut, easing: EASE.standardAccelerate, fill: 'forwards'}),
    ],
    in: node => [
      node.animate([{transform: `translateX(${shift}px)`}, {transform: 'none'}],
        {duration: MOTION.navigate, easing: EASE.emphasized}),
      node.animate([{opacity: 0}, {opacity: 1}],
        {duration: MOTION.fadeIn, delay: MOTION.fadeOut, easing: EASE.standardDecelerate, fill: 'backwards'}),
    ],
  });
}

/** M3 fade through for unrelated destinations (navigation bar tabs): out 90ms, then in 210ms from 92% scale. */
export function fadeThrough(outgoing, incoming, {scale = true} = {}) {
  return screenTransition(outgoing, incoming, {
    out: layer => [layer.animate([{opacity: 1}, {opacity: 0}],
      {duration: MOTION.fadeOut, easing: EASE.standardAccelerate, fill: 'forwards'})],
    in: node => [node.animate(scale
      ? [{opacity: 0, transform: 'scale(.92)'}, {opacity: 1, transform: 'none'}]
      : [{opacity: 0}, {opacity: 1}],
    {duration: MOTION.fadeIn, delay: MOTION.fadeOut, easing: EASE.standardDecelerate, fill: 'backwards'})],
  });
}

/* ---------- Re-render without jumps ----------
 * A commit rebuilds a screen. Keyed rows that survive slide from where they were; a removed row stays as a frozen copy
 * in its old place and collapses while the rows below follow; a new row opens from zero height. Only rows in or near
 * the viewport animate, and the reading position is held by the first row on screen. */
export const KEYED = '[data-key],[data-task-id],[data-block-id],[data-project-id],.today-row,.agenda-event,.agenda-free,'
  + '.list-item,.section-header,.result-group,.upcoming,.fact-row,.next-task,.project-run,.wheel-bar,.week-line,'
  + '.empty-state,.plan-list,.achieved-panel,.detail-head,.day-header,.chip-row';
const IDENTITY = 'h1,h2,h3,.task-title,.list-headline,.today-row-headline,.next-title,.card-title,.block-title';
const rerenders = new Map();

function identity(node) {
  if (node.dataset.key) return 'k' + node.dataset.key;
  if (node.dataset.taskId) return 't' + node.dataset.taskId;
  if (node.dataset.blockId) return 'b' + node.dataset.blockId;
  if (node.dataset.projectId) return 'p' + node.dataset.projectId;
  const cls = String(node.className).split(/\s+/)[0];
  const label = node.querySelector(IDENTITY)?.textContent ?? node.getAttribute('aria-label') ?? node.textContent;
  return cls + ':' + String(label).trim().slice(0, 48);
}

/** Keyed rows of `root` with their place relative to the viewport of `scroller`. */
export function captureRows(root, scroller) {
  const view = scroller.getBoundingClientRect();
  const rows = new Map();
  const seen = new Map();
  for (const node of root.querySelectorAll(KEYED)) {
    if (node.closest('.motion-ghost')) continue;
    const base = identity(node);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const rect = node.getBoundingClientRect();
    if (!rect.height && !rect.width) continue;
    const parent = node.parentElement?.closest(KEYED);
    rows.set(base + '#' + n, {node, rect, parent: parent && root.contains(parent) ? parent : null,
      visible: rect.bottom > view.top - 80 && rect.top < view.bottom + 80});
  }
  return {rows, view};
}

function keyOf(rows) {
  const byNode = new Map();
  for (const [key, row] of rows) byNode.set(row.node, key);
  return byNode;
}

function focusPath(root) {
  const active = document.activeElement;
  if (!active || active === document.body || !root.contains(active)) return null;
  const host = active.closest(KEYED);
  return {host, label: active.getAttribute('aria-label'), cls: String(active.className).split(/\s+/)[0], tag: active.tagName,
    caret: typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null};
}

function restoreFocus(path, oldKeys, newRows) {
  if (!path) return;
  const key = path.host ? oldKeys.get(path.host) : null;
  const scope = key ? newRows.get(key)?.node : null;
  if (path.host && !scope) return;
  const root = scope ?? document;
  const candidates = [...root.querySelectorAll(path.tag)];
  const match = candidates.find(n => path.label && n.getAttribute('aria-label') === path.label)
    ?? candidates.find(n => String(n.className).split(/\s+/)[0] === path.cls);
  if (!match) return;
  match.focus({preventScroll: true});
  if (path.caret && typeof match.setSelectionRange === 'function') {
    try { match.setSelectionRange(...path.caret); } catch {}
  }
}

/** Where to put a frozen copy of a removed row: after its nearest surviving earlier sibling, else before a later one. */
function placeGhost(oldNode, oldKeys, newRows) {
  for (let prev = oldNode.previousElementSibling; prev; prev = prev.previousElementSibling) {
    const target = newRows.get(oldKeys.get(prev))?.node;
    if (target?.parentElement) return () => target.after(oldNode);
  }
  for (let next = oldNode.nextElementSibling; next; next = next.nextElementSibling) {
    const target = newRows.get(oldKeys.get(next))?.node;
    if (target?.parentElement) return () => target.before(oldNode);
  }
  return null;
}

function boxFrames(node, open) {
  const style = getComputedStyle(node);
  const full = {height: node.getBoundingClientRect().height + 'px', minHeight: style.minHeight, opacity: 1,
    marginTop: style.marginTop, marginBottom: style.marginBottom, paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom};
  const none = {height: '0px', minHeight: '0px', opacity: 0, marginTop: '0px', marginBottom: '0px', paddingTop: '0px',
    paddingBottom: '0px'};
  return open ? [none, {...full, opacity: 0, offset: .35}, full] : [full, {...full, opacity: 0, offset: .4}, none];
}

/**
 * Rebuild `root` through `mutate` and animate the difference. `scroller` keeps its position.
 * Returns a promise that settles when the motion ends (immediately with reduced motion).
 */
export function animateRerender(root, scroller, mutate, {enabled = true, limit = 14} = {}) {
  rerenders.get(root)?.();
  const scrollTop = scroller.scrollTop;
  const before = captureRows(root, scroller);
  const oldKeys = keyOf(before.rows);
  const focus = focusPath(root);
  const oldChildren = [...root.childNodes];
  const oldClass = root.className;
  // The first fully visible row holds the reading position.
  const anchorEntry = [...before.rows].find(([, row]) => !row.parent && row.rect.top >= before.view.top
    && row.rect.top < before.view.bottom);
  mutate();
  scroller.scrollTop = scrollTop;
  const after = captureRows(root, scroller);
  restoreFocus(focus, oldKeys, after.rows);
  if (!enabled || reducedMotion()) {
    holdAnchor(scroller, anchorEntry, after.rows);
    return Promise.resolve(true);
  }

  const kept = [], removed = [], added = [];
  for (const [key, row] of before.rows) {
    const next = after.rows.get(key);
    if (next) kept.push([row, next]);
    else if (row.visible && (!row.parent || after.rows.has(oldKeys.get(row.parent)))) removed.push(row);
  }
  const keptNew = new Set(kept.map(([, next]) => next.node));
  const newKeys = keyOf(after.rows);
  for (const [key, row] of after.rows) {
    if (before.rows.has(key) || !row.visible) continue;
    if (row.parent && !keptNew.has(row.parent)) continue;
    added.push(row);
  }
  // A row replaced in the same slot (its text changed) swaps in place.
  for (let i = removed.length - 1; i >= 0; i--) {
    const old = removed[i];
    const cls = String(old.node.className).split(/\s+/)[0];
    const twin = added.findIndex(row => String(row.node.className).split(/\s+/)[0] === cls
      && Math.abs(row.rect.top - old.rect.top) < 2 && Math.abs(row.rect.height - old.rect.height) < 2);
    if (twin < 0) continue;
    added.splice(twin, 1);
    removed.splice(i, 1);
  }
  // Changes above the reading position happen at once; the anchor below them holds still (like scroll anchoring).
  if (anchorEntry) {
    const line = anchorEntry[1].rect.top;
    const anchorNew = after.rows.get(anchorEntry[0])?.node.getBoundingClientRect().top ?? line;
    for (let i = removed.length - 1; i >= 0; i--) if (removed[i].rect.bottom <= line + 1) removed.splice(i, 1);
    for (let i = added.length - 1; i >= 0; i--) if (added[i].rect.bottom <= anchorNew + 1) added.splice(i, 1);
  }
  if (removed.length + added.length > limit) {
    // Too much changed to follow row by row: the old content fades out over the new one.
    const layer = ghost(oldChildren, before.view, scroller.parentElement, {cls: oldClass, scrollTop});
    holdAnchor(scroller, anchorEntry, after.rows);
    return fadeThrough([layer], [root], {scale: false});
  }

  const animations = [];
  const ghosts = [];
  for (const row of removed) {
    const place = placeGhost(row.node, oldKeys, after.rows);
    if (!place) continue;
    row.node.classList.add('motion-ghost');
    row.node.setAttribute('aria-hidden', 'true');
    row.node.inert = true;
    place();
    ghosts.push(row.node);
  }
  for (const node of ghosts) animations.push(node.animate(boxFrames(node, false),
    {duration: MOTION.layout, easing: EASE.emphasized, fill: 'forwards'}));
  for (const row of added) {
    row.node.classList.add('motion-clip');
    animations.push(row.node.animate(boxFrames(row.node, true), {duration: MOTION.layout, easing: EASE.emphasized}));
  }
  // Layout at the first frame (ghosts full, new rows closed): rows that still differ from before really moved.
  holdAnchor(scroller, anchorEntry, after.rows);
  const view = scroller.getBoundingClientRect();
  const start = new Map(kept.map(([, next]) => [next.node, next.node.getBoundingClientRect()]));
  const shift = new Map();
  for (const [old, next] of kept) {
    if (!old.visible && !next.visible) continue;
    const now = start.get(next.node);
    let dx = old.rect.left - now.left;
    let dy = old.rect.top - now.top;
    const parent = next.parent && shift.has(next.parent) ? shift.get(next.parent) : null;
    if (parent) { dx -= parent[0]; dy -= parent[1]; }
    shift.set(next.node, [dx + (parent?.[0] ?? 0), dy + (parent?.[1] ?? 0)]);
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) continue;
    if (Math.abs(dy) > view.height) {
      animations.push(next.node.animate([{opacity: 0}, {opacity: 1}], {duration: MOTION.fadeIn, easing: EASE.standardDecelerate}));
      continue;
    }
    animations.push(next.node.animate([{translate: `${dx}px ${dy}px`}, {translate: '0px 0px'}],
      {duration: MOTION.layout, easing: EASE.emphasized}));
  }
  if (!animations.length) {
    ghosts.forEach(node => node.remove());
    return Promise.resolve(true);
  }
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    if (rerenders.get(root) === end) rerenders.delete(root);
    ghosts.forEach(node => node.remove());
    for (const row of added) row.node.classList.remove('motion-clip');
    for (const animation of animations) animation.cancel();
  };
  rerenders.set(root, end);
  return Promise.all(animations.map(a => a.finished.then(() => true, () => false))).then(results => {
    end();
    return results.every(Boolean);
  });
}

function holdAnchor(scroller, anchorEntry, rows) {
  if (!anchorEntry) return;
  const [key, old] = anchorEntry;
  const now = rows.get(key)?.node;
  if (!now?.isConnected) return;
  const delta = now.getBoundingClientRect().top - old.rect.top;
  if (Math.abs(delta) >= 1) scroller.scrollTop += delta;
}

/** Ends a running re-render motion at once (used before a screen transition takes over). */
export function settleRerender(root) {
  rerenders.get(root)?.();
}

// Read the old and final geometry once. Only the decorative surface scales;
// text and controls translate at their original resolution. Layout never runs
// in an animation frame loop. A new change starts from the current visual pose.
export function animateLayout(owner, regions, mutate, {duration = 180, enabled = true} = {}) {
  const specs = regions.filter(r => r.node?.isConnected && r.node.getClientRects().length);
  const before = specs.map(({node, clip}) => {
    const rect = node.getBoundingClientRect();
    const inset = clip ? getComputedStyle(node).clipPath.match(/^inset\(([-.\d]+)px(?: ([-.\d]+)px)?(?: ([-.\d]+)px)?/) : null;
    return {rect, visibleHeight: rect.height - (Number(inset?.[1]) || 0) - (Number(inset?.[3] ?? inset?.[1]) || 0)};
  });
  layouts.get(owner)?.cancel();
  mutate();
  if (!enabled || reducedMotion()) return Promise.resolve(true);
  const after = specs.map(({node}) => node.getBoundingClientRect());
  const animations = [];
  for (let i = 0; i < specs.length; i++) {
    const {node, scale, clip} = specs[i];
    const old = before[i];
    const next = after[i];
    if (!node.animate || !next.width || !next.height) continue;
    const dx = old.rect.left - next.left;
    const dy = old.rect.top - next.top;
    const sx = scale ? old.rect.width / next.width : 1;
    const sy = scale ? old.rect.height / next.height : 1;
    const cut = clip ? Math.max(0, next.height - old.visibleHeight) : 0;
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5 && Math.abs(sx - 1) < .001 && Math.abs(sy - 1) < .001 && cut < .5) continue;
    const first = {translate: `${dx}px ${dy}px`};
    const last = {translate: '0px 0px'};
    if (scale) {
      Object.assign(first, {scale: `${sx} ${sy}`, transformOrigin: '0 0'});
      Object.assign(last, {scale: '1 1', transformOrigin: '0 0'});
    }
    if (clip) {
      first.clipPath = `inset(0px 0px ${cut}px 0px)`;
      last.clipPath = 'inset(0px 0px 0px 0px)';
    }
    animations.push(node.animate([first, last], {duration, easing: EASE.emphasizedDecelerate}));
  }
  if (!animations.length) return Promise.resolve(true);
  const root = owner.ownerDocument.documentElement;
  const cleanup = () => {
    if (layouts.get(owner) !== group) return;
    layouts.delete(owner);
    delete owner.dataset.layoutAnimating;
    if (!layouts.size) delete root.dataset.layoutAnimating;
  };
  const group = {cancel() { for (const a of animations) a.cancel(); cleanup(); }};
  layouts.set(owner, group);
  owner.dataset.layoutAnimating = 'true';
  root.dataset.layoutAnimating = 'true';
  return Promise.all(animations.map(a => a.finished.then(() => true, () => false))).then(results => {
    cleanup();
    return results.every(Boolean);
  });
}

const cancelReduced = () => {
  if (!reducedMotion()) return;
  for (const node of [...running.keys()]) stopMotion(node);
  for (const group of layouts.values()) group.cancel();
  settleTransitions();
  for (const end of [...rerenders.values()]) end();
};
globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', cancelReduced);
globalThis.window?.addEventListener('rpm-phone-status', cancelReduced);
