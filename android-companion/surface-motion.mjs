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
/** Pairings used by the planner: sheets enter in 350ms and leave in 200ms, screens move in 300ms. Rows slide in
 * 300ms and open, collapse or resize in 250ms. In a shared axis or fade through the incoming layer starts fading in
 * at 50ms, while the outgoing one (90ms) is still visible, so no frame is blank. */
export const MOTION = Object.freeze({
  navigate: DURATION.medium2, enter: DURATION.medium3, exit: DURATION.short4, feedback: DURATION.short3,
  layout: DURATION.medium2, resize: DURATION.medium1, fadeOut: 90, fadeInDelay: 50, fadeIn: 210, axis: 30,
  ease: EASE.standard,
});

/** Resolves after `ms` on the animation clock (so it slows down with the animations it orders), at once with
 * reduced motion. */
export function waitMotion(ms) {
  const root = globalThis.document?.documentElement;
  if (!root?.animate || reducedMotion()) return Promise.resolve();
  return root.animate([{}, {}], {duration: ms}).finished.then(() => {}, () => {});
}

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

/** M3 shared axis: outgoing and incoming slide together by 30dp (X for siblings and push/pop, Y for a step down
 * in hierarchy such as the weekly review); the old fades out while the new fades in over it. `back` reverses. */
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

/** M3 fade through for unrelated destinations (navigation bar tabs): out 90ms, in 210ms from 92% scale from 50ms. */
export function fadeThrough(outgoing, incoming, {scale = true} = {}) {
  return screenTransition(outgoing, incoming, {
    out: layer => [layer.animate([{opacity: 1}, {opacity: 0}],
      {duration: MOTION.fadeOut, easing: EASE.standardAccelerate, fill: 'forwards'})],
    in: node => [node.animate(scale
      ? [{opacity: 0, transform: 'scale(.92)'}, {opacity: 1, transform: 'none'}]
      : [{opacity: 0}, {opacity: 1}],
    {duration: MOTION.fadeIn, delay: MOTION.fadeInDelay, easing: EASE.standardDecelerate, fill: 'backwards'})],
  });
}

/* ---------- Re-render without jumps ----------
 * A commit builds the new screen off-document; a keyed reconcile then moves it into the live screen, keeping every
 * node that did not change, so rows that stay are the same nodes (running animations, focus and caret survive, and
 * nothing is thrown away). Kept rows that moved slide from where they were, kept containers that changed height grow
 * or shrink smoothly while the rows below follow, a removed row stays where it was and collapses, a new row opens from
 * zero height and a small new element fades in. Only rows in or near the viewport animate, and the reading position is
 * held by the first row on screen. */
export const KEYED = '[data-key],[data-task-id],[data-block-id],[data-project-id],.today-row,.agenda-event,.agenda-free,'
  + '.list-item,.section-header,.result-group,.upcoming,.fact-row,.next-task,.project-run,.wheel-bar,.week-line,'
  + '.empty-state,.plan-list,.achieved-panel,.detail-head,.day-header,.chip-row';
const IDENTITY = 'h1,h2,h3,.task-title,.list-headline,.today-row-headline,.next-title,.card-title,.block-title';
/** Containers named by their place, not their words: a Plan that gains its first task is the same Plan. */
const CONTAINERS = '.plan-list,.chip-row,.day-header,.detail-head';
/** Fields hold the user's words and their own save closures: always taken from the new render. */
const EDITABLE = 'input,select,textarea,[contenteditable],[data-edit-key]';
/** Classes that only motion adds; two nodes that differ only by these are the same row. */
const CONTROLLED = /(^|\s)(?:just-done|motion-clip|motion-ghost)(?=\s|$)/g;
const rerenders = new Map();

/* An old node may stand in for its rebuilt twin only when its event handlers would do the same thing. Handlers are
 * closures over render-time data, so nodes with listeners are kept only under an element stamped with `__closure`
 * (the data its handlers use, e.g. a task row), and only when the stamps match. */
const listened = new WeakSet();
if (globalThis.Element && globalThis.EventTarget) {
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function addEventListener(...args) {
    if (this instanceof Element) listened.add(this);
    return add.apply(this, args);
  };
}

function identity(node) {
  if (node.dataset.key) return 'k' + node.dataset.key;
  if (node.dataset.taskId) return 't' + node.dataset.taskId;
  if (node.dataset.blockId) return 'b' + node.dataset.blockId;
  if (node.dataset.projectId) return 'p' + node.dataset.projectId;
  const cls = String(node.className).split(/\s+/)[0];
  if (node.matches(CONTAINERS)) return cls;
  const label = node.querySelector(IDENTITY)?.textContent ?? node.getAttribute('aria-label') ?? node.textContent;
  return cls + ':' + String(label).trim().slice(0, 48);
}

/** Keyed rows of `root` in document order: [key, node, parent keyed row or null]. */
function keyRows(root) {
  const seen = new Map();
  const out = [];
  for (const node of root.querySelectorAll(KEYED)) {
    if (node.closest('.motion-ghost')) continue;
    const base = identity(node);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const parent = node.parentElement?.closest(KEYED);
    out.push([base + '#' + n, node, parent && root.contains(parent) ? parent : null]);
  }
  return out;
}

/** Keyed rows of `root` with their place relative to the viewport of `scroller`. */
export function captureRows(root, scroller) {
  const view = scroller.getBoundingClientRect();
  const rows = new Map();
  for (const [key, node, parent] of keyRows(root)) {
    const rect = node.getBoundingClientRect();
    if (!rect.height && !rect.width) continue;
    rows.set(key, {node, rect, parent, visible: rect.bottom > view.top - 80 && rect.top < view.bottom + 80});
  }
  return {rows, view};
}

function keyOf(rows) {
  const byNode = new Map();
  for (const [key, row] of rows) byNode.set(row.node, key);
  return byNode;
}

const classOf = node => (node.getAttribute('class') ?? '').replace(CONTROLLED, ' ').trim().replace(/\s+/g, ' ');
const signature = node => node.outerHTML.replace(/ class="([^"]*)"/g, (_, value) => {
  const cls = value.replace(CONTROLLED, ' ').trim().replace(/\s+/g, ' ');
  return cls ? ` class="${cls}"` : '';
});
const matchKey = node => (node.matches(KEYED) ? 'K' + node.tagName + identity(node) : node.tagName + '.' + classOf(node));

function stamped(node, top) {
  for (let n = node; n; n = n.parentElement) {
    if (n.__closure !== undefined) return true;
    if (n === top) return false;
  }
  return false;
}

/** The old node can stay in place of the new one: same markup, no fields, and handlers that would act the same. */
function reusable(old, next) {
  if (old.tagName !== next.tagName || old.matches(EDITABLE) || old.querySelector(EDITABLE)) return false;
  if (signature(old) !== signature(next)) return false;
  const olds = [old, ...old.querySelectorAll('*')];
  const nexts = [next, ...next.querySelectorAll('*')];
  if (olds.length !== nexts.length) return false;
  for (let i = 0; i < olds.length; i++) {
    if ((olds[i].__closure !== undefined || nexts[i].__closure !== undefined) && olds[i].__closure !== nexts[i].__closure) return false;
  }
  return olds.every(node => !listened.has(node) || stamped(node, old));
}

/** A plain container (no handlers, no field) is kept and its children reconciled one by one. */
function morphable(old, next) {
  return old.tagName === next.tagName && classOf(old) === classOf(next) && old.id === next.id
    && !listened.has(old) && !listened.has(next) && old.__closure === undefined && next.__closure === undefined
    && !old.matches(EDITABLE) && !next.matches(EDITABLE);
}

function planChildren(oldParent, newParent, plan) {
  const pool = new Map();
  for (const child of oldParent.children) {
    if (child.classList.contains('motion-ghost')) continue;
    const key = matchKey(child);
    if (!pool.has(key)) pool.set(key, []);
    pool.get(key).push(child);
  }
  const result = [];
  const used = new Set();
  for (const child of [...newParent.childNodes]) {
    if (child.nodeType !== 1) { result.push(child); continue; }
    const old = pool.get(matchKey(child))?.shift();
    if (old && reusable(old, child)) {
      result.push(old);
      used.add(old);
      continue;
    }
    if (old && morphable(old, child)) {
      result.push(old);
      used.add(old);
      plan.morphs.push([old, child]);
      planChildren(old, child, plan);
      continue;
    }
    if (old) used.add(old);
    else if (!child.matches(KEYED)) plan.fresh.push(child);
    result.push(child);
  }
  // A removed row that should collapse stays where it was: after its nearest kept earlier sibling.
  const olds = [...oldParent.children];
  olds.forEach((old, i) => {
    if (used.has(old) || !plan.isGhost(old)) return;
    let at = -1;
    for (let j = i - 1; j >= 0 && at < 0; j--) { const k = result.indexOf(olds[j]); if (k >= 0) at = k + 1; }
    for (let j = i + 1; j < olds.length && at < 0; j++) { const k = result.indexOf(olds[j]); if (k >= 0) at = k; }
    result.splice(at < 0 ? Math.min(i, result.length) : at, 0, old);
    plan.ghosts.push(old);
  });
  plan.lists.push([oldParent, result]);
}

/** Make `parent`'s children exactly `result`, moving as few kept nodes as possible (a moved node restarts). */
function applyChildren(parent, result) {
  const keep = new Set(result);
  for (const child of [...parent.childNodes]) if (!keep.has(child)) child.remove();
  let cursor = parent.firstChild;
  for (const node of result) {
    if (node === cursor) { cursor = cursor.nextSibling; continue; }
    parent.insertBefore(node, cursor);
  }
}

function syncAttributes(old, next) {
  for (const {name} of [...old.attributes]) if (!next.hasAttribute(name)) old.removeAttribute(name);
  for (const {name, value} of [...next.attributes]) if (old.getAttribute(name) !== value) old.setAttribute(name, value);
}

/** Reconcile `stage` (a detached, freshly built copy) into `root`. */
function reconcile(root, stage, isGhost) {
  const plan = {morphs: [], fresh: [], ghosts: [], lists: [], isGhost};
  planChildren(root, stage, plan);
  const heights = new Map(plan.morphs.map(([old]) => [old, old.getBoundingClientRect()]));
  for (const [old, next] of plan.morphs) syncAttributes(old, next);
  for (const [parent, result] of plan.lists) applyChildren(parent, result);
  if (stage.className) root.className = stage.className;
  return {...plan, heights};
}

function focusPath(root) {
  const active = document.activeElement;
  if (!active || active === document.body || !root.contains(active)) return null;
  const host = active.closest(KEYED);
  return {node: active, host, label: active.getAttribute('aria-label'), cls: String(active.className).split(/\s+/)[0],
    tag: active.tagName, caret: typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null};
}

function restoreFocus(path, oldKeys, newRows) {
  if (!path || path.node.isConnected) return;
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

function boxFrames(node, open, from = null) {
  const style = getComputedStyle(node);
  const full = {height: node.getBoundingClientRect().height + 'px', minHeight: style.minHeight, opacity: 1,
    marginTop: style.marginTop, marginBottom: style.marginBottom, paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom};
  const none = {height: '0px', minHeight: '0px', opacity: 0, marginTop: '0px', marginBottom: '0px', paddingTop: '0px',
    paddingBottom: '0px'};
  if (from) return [{...full, ...from}, full];
  return open ? [none, {...full, opacity: 0, offset: .35}, full] : [full, {...full, opacity: 0, offset: .4}, none];
}

/**
 * Rebuild `root` and animate the difference. `build()` returns a detached element holding the new content (its
 * className, if any, becomes root's). `scroller` keeps its position. With `enabled: false` the change is instant
 * (nodes are still kept). Returns a promise that settles when the motion ends.
 */
export function animateRerender(root, scroller, build, {enabled = true, limit = 14} = {}) {
  rerenders.get(root)?.();
  const motion = enabled && !reducedMotion();
  const scrollTop = scroller.scrollTop;
  const before = captureRows(root, scroller);
  const oldKeys = keyOf(before.rows);
  const focus = focusPath(root);
  // The first fully visible row holds the reading position.
  const anchorEntry = [...before.rows].find(([, row]) => !row.parent && row.rect.top >= before.view.top
    && row.rect.top < before.view.bottom);
  const line = anchorEntry?.[1].rect.top ?? -Infinity;
  const stage = build();
  const stageRows = keyRows(stage);
  const stageKeys = new Set(stageRows.map(([key]) => key));

  // Too much changed to follow row by row: the old content fades out over the new one.
  const gone = [...before.rows.values()].filter(row => row.visible && !row.parent && !stageKeys.has(oldKeys.get(row.node)));
  const fresh = stageRows.filter(([key, , parent]) => !before.rows.has(key) && !parent).length;
  if (motion && gone.length + Math.min(fresh, limit + 1) > limit) {
    const oldClass = root.className;
    const layer = ghost([...root.childNodes], before.view, scroller.parentElement, {cls: oldClass, scrollTop});
    root.replaceChildren(...stage.childNodes);
    if (stage.className) root.className = stage.className;
    scroller.scrollTop = scrollTop;
    const after = captureRows(root, scroller);
    restoreFocus(focus, oldKeys, after.rows);
    holdAnchor(scroller, anchorEntry, after.rows);
    return fadeThrough([layer], [root], {scale: false});
  }

  const isGhost = node => {
    if (!motion) return false;
    const key = oldKeys.get(node);
    const row = key && before.rows.get(key);
    return !!row && row.visible && !stageKeys.has(key) && row.rect.bottom > line + 1;
  };
  const plan = reconcile(root, stage, isGhost);
  // Collapsing copies are not part of the new layout.
  for (const node of plan.ghosts) node.classList.add('motion-ghost');
  scroller.scrollTop = scrollTop;
  const after = captureRows(root, scroller);
  restoreFocus(focus, oldKeys, after.rows);
  if (!motion) {
    holdAnchor(scroller, anchorEntry, after.rows);
    return Promise.resolve(true);
  }

  const animations = [];
  const animated = new Set();
  const clipped = [];
  const ghosts = [];
  const kept = [], added = [];
  for (const [key, row] of before.rows) {
    const next = after.rows.get(key);
    if (next) kept.push([row, next]);
  }
  const keptNew = new Set(kept.map(([, next]) => next.node));
  for (const [key, row] of after.rows) {
    if (before.rows.has(key) || !row.visible) continue;
    if (row.parent && !keptNew.has(row.parent)) continue;
    if (row.rect.bottom <= line + 1) continue;
    added.push(row);
  }
  const clip = node => { node.classList.add('motion-clip'); clipped.push(node); };
  const view = scroller.getBoundingClientRect();
  const visible = rect => rect.bottom > view.top - 80 && rect.top < view.bottom + 80;
  // A row whose words changed in the same slot changes size in place instead of collapsing and reopening.
  const resize = new Map();
  for (const node of plan.ghosts) {
    const old = before.rows.get(oldKeys.get(node));
    const cls = String(node.className).split(/\s+/)[0];
    const twin = added.findIndex(row => String(row.node.className).split(/\s+/)[0] === cls
      && (Math.abs(row.rect.top - old.rect.top) < 2 || node.previousElementSibling === row.node
        || node.nextElementSibling === row.node));
    if (twin >= 0) {
      resize.set(added[twin].node, old.rect.height);
      added.splice(twin, 1);
      node.remove();
    } else ghosts.push(node);
  }
  for (const node of ghosts) {
    node.classList.add('motion-ghost');
    node.setAttribute('aria-hidden', 'true');
    node.inert = true;
    animated.add(node);
    animations.push(node.animate(boxFrames(node, false), {duration: MOTION.resize, easing: EASE.emphasized, fill: 'forwards'}));
  }
  for (const row of added) {
    clip(row.node);
    animated.add(row.node);
    animations.push(row.node.animate(boxFrames(row.node, true), {duration: MOTION.resize, easing: EASE.emphasized}));
  }
  // Small new elements in kept containers fade in; a tall one opens like a new row.
  for (const node of plan.fresh) {
    if (!node.isConnected || node.closest('.motion-clip')) continue;
    const rect = node.getBoundingClientRect();
    if (!rect.height || !visible(rect) || rect.bottom <= line + 1) continue;
    if (rect.height > 48) {
      clip(node);
      animated.add(node);
      animations.push(node.animate(boxFrames(node, true), {duration: MOTION.resize, easing: EASE.emphasized}));
    } else {
      animations.push(node.animate([{opacity: 0}, {opacity: 1}], {duration: DURATION.short3, easing: EASE.standard}));
    }
  }
  // Kept containers that changed height grow or shrink to it (the innermost one that changed), so rows below slide.
  for (const [old, next] of kept) {
    if (old.node === next.node || resize.has(next.node) || old.rect.top < line - 1) continue;
    resize.set(next.node, old.rect.height);
  }
  // Only below the reading position: a container that starts above it changes at once, like the rows there.
  for (const [node, rect] of plan.heights) if (visible(rect) && rect.top >= line - 1) resize.set(node, rect.height);
  for (const [old, next] of kept) if (old.node === next.node && visible(old.rect) && old.rect.top >= line - 1) resize.set(next.node, old.rect.height);
  const sizes = [...resize].filter(([node]) => node.isConnected && !animated.has(node))
    .map(([node, from]) => [node, from, node.getBoundingClientRect().height])
    .filter(([, from, to]) => Math.abs(from - to) > 1);
  const depth = node => { let d = 0; for (let n = node; n; n = n.parentElement) d++; return d; };
  sizes.sort((a, b) => depth(b[0]) - depth(a[0]));
  for (const [node, from, to] of sizes) {
    if ([...animated].some(other => node.contains(other))) continue;
    clip(node);
    animated.add(node);
    animations.push(node.animate([{height: from + 'px', minHeight: '0px'}, {height: to + 'px', minHeight: '0px'}],
      {duration: MOTION.resize, easing: EASE.emphasized}));
  }
  // Layout at the first frame (ghosts full, new rows closed, resized rows at their old size): rows that still differ
  // from before really moved, and slide.
  holdAnchor(scroller, anchorEntry, after.rows);
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
  return track(root, animations, () => {
    ghosts.forEach(node => node.remove());
    for (const node of clipped) node.classList.remove('motion-clip');
  });
}

/** Register a group of re-render animations on `root`; the next re-render or settleRerender ends it at once. */
function track(root, animations, cleanup) {
  if (!animations.length) {
    cleanup();
    return Promise.resolve(true);
  }
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    if (rerenders.get(root) === end) rerenders.delete(root);
    cleanup();
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

/** Where the keyed rows of `root` are now, in the scroller's content coordinates (see landRows). */
export function snapshotRows(root, scroller) {
  const {rows} = captureRows(root, scroller);
  const top = scroller.scrollTop;
  return new Map([...rows].map(([key, row]) => [key, {top: row.rect.top + top, left: row.rect.left, height: row.rect.height}]));
}

/**
 * The screen changed while something covered it (an open sheet re-renders the page behind its scrim at once):
 * rows slide from where the user last saw them to their new places, and new rows open, so the change lands in view.
 */
export function landRows(root, scroller, snapshot, {delay = 0} = {}) {
  rerenders.get(root)?.();
  if (!snapshot?.size || reducedMotion()) return Promise.resolve(true);
  const {rows, view} = captureRows(root, scroller);
  const top = scroller.scrollTop;
  const animations = [];
  const clipped = [];
  const timing = {delay, fill: 'backwards', easing: EASE.emphasized};
  const keptNodes = new Set([...rows].filter(([key]) => snapshot.has(key)).map(([, row]) => row.node));
  for (const [key, row] of rows) {
    if (snapshot.has(key) || !row.visible || (row.parent && !keptNodes.has(row.parent))) continue;
    row.node.classList.add('motion-clip');
    clipped.push(row.node);
    animations.push(row.node.animate(boxFrames(row.node, true), {...timing, duration: MOTION.resize}));
  }
  const shift = new Map();
  for (const [key, row] of rows) {
    const old = snapshot.get(key);
    if (!old) continue;
    const now = row.node.getBoundingClientRect();
    if (!row.visible && !(old.top - top < view.bottom && old.top - top + old.height > view.top)) continue;
    let dy = old.top - (now.top + top);
    let dx = old.left - now.left;
    const parent = row.parent && shift.has(row.parent) ? shift.get(row.parent) : null;
    if (parent) { dx -= parent[0]; dy -= parent[1]; }
    shift.set(row.node, [dx + (parent?.[0] ?? 0), dy + (parent?.[1] ?? 0)]);
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) continue;
    animations.push(row.node.animate([{translate: `${dx}px ${dy}px`}, {translate: '0px 0px'}], {...timing, duration: MOTION.layout}));
  }
  return track(root, animations, () => { for (const node of clipped) node.classList.remove('motion-clip'); });
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
