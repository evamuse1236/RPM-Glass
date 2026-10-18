/** Keyed re-render: which rows are the same row, and how a fresh render is reconciled into the live one. */

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
/** Cards whose content changes as a whole (the lead card on Today becomes another task): the card is replaced in one
 * fade through while its height morphs, instead of its parts collapsing and opening one by one. */
export const SWAP = '.next-card';
/** Fields hold the user's words and their own save closures: always taken from the new render (unless `data-keep`). */
const EDITABLE = 'input,select,textarea,[contenteditable],[data-edit-key]';
/** Classes that only motion adds; two nodes that differ only by these are the same row. */
const CONTROLLED = /(^|\s)(?:just-done|motion-clip|motion-ghost)(?=\s|$)/g;

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
export function keyRows(root) {
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

export function keyOf(rows) {
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
  // An old node and the new node that took its place (a rebuilt twin), so removed rows keep their place beside it.
  const twin = new Map();
  for (const child of [...newParent.childNodes]) {
    if (child.nodeType !== 1) { result.push(child); continue; }
    const old = pool.get(matchKey(child))?.shift();
    // A field that must never blink (the Plan's add row: a fast typist keeps typing through the save) is kept as is
    // while its twin has the same `data-keep`: its handlers read only what the key names.
    if (old && old.dataset.keep && old.dataset.keep === child.dataset.keep) {
      result.push(old);
      used.add(old);
      continue;
    }
    if (old && reusable(old, child)) {
      result.push(old);
      used.add(old);
      continue;
    }
    if (old && old.matches(SWAP)) {
      used.add(old);
      twin.set(old, child);
      plan.swaps.push([old, child]);
      result.push(child);
      continue;
    }
    if (old && morphable(old, child)) {
      result.push(old);
      used.add(old);
      plan.morphs.push([old, child]);
      planChildren(old, child, plan);
      continue;
    }
    if (old) { used.add(old); twin.set(old, child); }
    else if (!child.matches(KEYED)) plan.fresh.push(child);
    result.push(child);
  }
  // A removed row that should collapse stays where it was: after its nearest kept earlier sibling.
  const olds = [...oldParent.children];
  olds.forEach((old, i) => {
    if (used.has(old) || !plan.isGhost(old)) return;
    let at = -1;
    const place = node => result.indexOf(twin.get(node) ?? node);
    for (let j = i - 1; j >= 0 && at < 0; j--) { const k = place(olds[j]); if (k >= 0) at = k + 1; }
    for (let j = i + 1; j < olds.length && at < 0; j++) { const k = place(olds[j]); if (k >= 0) at = k; }
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

/** The page's CSP (style-src 'self') blocks a written style attribute; styles cross through the CSSOM instead. */
export function syncAttributes(old, next) {
  for (const {name} of [...old.attributes]) if (!next.hasAttribute(name)) old.removeAttribute(name);
  for (const {name, value} of [...next.attributes]) {
    if (old.getAttribute(name) === value) continue;
    if (name === 'style') old.style.cssText = next.style.cssText;
    else old.setAttribute(name, value);
  }
}

/** Reconcile `stage` (a detached, freshly built copy) into `root`. */
export function reconcile(root, stage, isGhost) {
  const plan = {morphs: [], fresh: [], ghosts: [], lists: [], swaps: [], isGhost};
  planChildren(root, stage, plan);
  const heights = new Map(plan.morphs.map(([old]) => [old, old.getBoundingClientRect()]));
  for (const [old, next] of plan.morphs) syncAttributes(old, next);
  for (const [parent, result] of plan.lists) applyChildren(parent, result);
  if (stage.className) root.className = stage.className;
  return {...plan, heights};
}

export function focusPath(root) {
  const active = document.activeElement;
  if (!active || active === document.body || !root.contains(active)) return null;
  const host = active.closest(KEYED);
  return {node: active, host, label: active.getAttribute('aria-label'), cls: String(active.className).split(/\s+/)[0],
    tag: active.tagName, caret: typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null};
}

export function restoreFocus(path, oldKeys, newRows) {
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

export function boxFrames(node, open, from = null) {
  const style = getComputedStyle(node);
  const full = {height: node.getBoundingClientRect().height + 'px', minHeight: style.minHeight, opacity: 1,
    marginTop: style.marginTop, marginBottom: style.marginBottom, paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom};
  const none = {height: '0px', minHeight: '0px', opacity: 0, marginTop: '0px', marginBottom: '0px', paddingTop: '0px',
    paddingBottom: '0px'};
  if (from) return [{...full, ...from}, full];
  // Opening, the words wait until there is room for them; closing, they fade with the space (both leave together).
  return open ? [none, {...full, opacity: 0, offset: .35}, full] : [full, none];
}
