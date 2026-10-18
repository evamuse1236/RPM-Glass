/** Re-render helpers: words fading through, the reading position, the page's tail, and landing rows after a sheet. */
import {MOTION, EASE, DURATION, ghost, reducedMotion} from './motion-core.mjs';
import {captureRows, boxFrames, KEYED} from './rerender-keys.mjs';

const rerenders = new Map();

/** Shallow copies of `parent` and its ancestors up to `root`, so a copy of a row placed elsewhere matches the same
 * styles; they draw no box of their own. Returns [outermost, innermost]. */
export function chainOf(parent, root) {
  let outer = null, inner = null;
  for (let n = parent; n; n = n.parentElement) {
    const copy = n.cloneNode(false);
    copy.removeAttribute('id');
    copy.style.display = 'contents';
    if (outer) copy.append(outer); else inner = copy;
    outer = copy;
    if (n === root) break;
  }
  return [outer, inner];
}

/**
 * Words that changed in place fade through: a copy of the old row, pinned where it was (and moving with the row),
 * fades out over 0–90ms; then the row's new content fades in over 90–240ms. The row's own surface stays, so only the
 * words change.
 */
export function fadeWords(fades, scroller, view, start, animations) {
  const layer = ghost([], view, scroller.parentElement, {cls: 'motion-fade-host'});
  const inner = layer.firstChild;
  for (const {copy, chain: [outer, parent], rect, node} of fades) {
    // Where the row's new layout puts it (read before its slide began).
    const now = start.get(node) ?? node.getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'motion-fade-box';
    box.style.cssText = `left:${rect.left - view.left}px;top:${rect.top - view.top}px;width:${rect.width}px;height:${rect.height}px`;
    const parts = [...node.children];
    const loose = [...node.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (parts.length && !loose) {
      // Only the words cross: the row's surface (fill, outline, shadow) stays put in the live row.
      copy.style.background = 'transparent';
      copy.style.boxShadow = 'none';
      copy.style.borderColor = 'transparent';
    }
    copy.style.margin = '0';
    copy.style.width = '100%';
    copy.style.translate = 'none';
    if (parent) { parent.append(copy); box.append(outer); } else box.append(copy);
    inner.append(box);
    const dy = now.top - rect.top, dx = now.left - rect.left;
    animations.push(box.animate([{opacity: 1}, {opacity: 0}],
      {duration: MOTION.fadeOut, easing: EASE.standardAccelerate, fill: 'forwards'}));
    if (Math.abs(dx) >= .5 || Math.abs(dy) >= .5) {
      animations.push(box.animate([{translate: '0px 0px'}, {translate: `${dx}px ${dy}px`}],
        {duration: MOTION.layout, easing: EASE.emphasized, fill: 'forwards'}));
    }
    for (const target of parts.length && !loose ? parts : [node]) {
      animations.push(target.animate([{opacity: 0}, {opacity: 1}],
        {duration: DURATION.short3, delay: MOTION.fadeInDelay, easing: EASE.standardDecelerate, fill: 'backwards'}));
    }
  }
  return layer;
}

/** The rows on screen, innermost first in reading order: the first one that survives a change holds the position.
 * A row cut off by the top edge comes after the rows wholly in view, so a change to that sliver (a row above growing)
 * happens above the reading position at once instead of pushing everything in view down. */
export function anchorRows(before) {
  const {view} = before;
  const onScreen = [...before.rows].filter(([, row]) => row.rect.bottom > view.top + 1 && row.rect.top < view.bottom);
  const leaves = onScreen.filter(([, row]) => !row.node.querySelector(KEYED));
  const whole = leaves.filter(([, row]) => row.rect.top >= view.top - 1);
  return [...whole, ...leaves.filter(entry => !whole.includes(entry)), ...onScreen.filter(entry => !leaves.includes(entry))];
}

/* Scrolled to the end, a page that gets shorter would pull everything down to fill the screen. Instead the page keeps
 * the length the screen needs (a min-height on `root`) and gives the spare space back as the user scrolls up. */
const tails = new WeakSet();
export function pinTail(root, scroller, scrollTop, ghosts) {
  if (root === scroller) return;
  root.style.removeProperty('min-height');
  ghosts.forEach(node => { node.style.display = 'none'; });
  const max = scroller.scrollHeight - scroller.clientHeight;
  const natural = root.getBoundingClientRect().height;
  ghosts.forEach(node => node.style.removeProperty('display'));
  if (scrollTop - max <= 1) return;
  root.style.minHeight = natural + scrollTop - max + 'px';
  root.__tail = {natural, max};
  watchTail(root, scroller);
}

/** Gives a pinned page's spare length back as the user scrolls up. */
function watchTail(root, scroller) {
  if (tails.has(scroller)) return;
  tails.add(scroller);
  scroller.addEventListener('scroll', () => {
    const tail = root.__tail;
    if (!tail || !root.style.minHeight) return;
    const spare = scroller.scrollTop - tail.max;
    if (spare <= 0) {
      root.style.removeProperty('min-height');
      root.__tail = null;
    } else if (tail.natural + spare < parseFloat(root.style.minHeight)) root.style.minHeight = tail.natural + spare + 'px';
  }, {passive: true});
}

/** A new screen starts at its own length. */
export function releaseTail(root) {
  root.style.removeProperty('min-height');
  root.__tail = null;
}

/** Register a group of re-render animations on `root`; the next re-render or settleRerender ends it at once. */
export function track(root, animations, cleanup) {
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

export function holdAnchor(scroller, anchors, rows, root = null) {
  for (const [key, old] of anchors) {
    const now = rows.get(key)?.node;
    if (!now?.isConnected || now.classList.contains('motion-ghost')) continue;
    const delta = now.getBoundingClientRect().top - old.rect.top;
    if (Math.abs(delta) < 1) return;
    // Scrolled to the end, the page may be too short to scroll that far (rows above grew while the end is pinned):
    // it keeps a little more length, given back as the user scrolls up, rather than pulling the screen down.
    const max = scroller.scrollHeight - scroller.clientHeight;
    const want = scroller.scrollTop + delta;
    if (root && root !== scroller && want > max + 0.5) {
      const tail = root.__tail ?? {natural: root.getBoundingClientRect().height, max};
      root.style.minHeight = root.getBoundingClientRect().height + (want - max) + 'px';
      root.__tail = tail;
      watchTail(root, scroller);
    }
    scroller.scrollTop = want;
    return;
  }
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
  settleRerender(root);
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

/** Ends every running re-render motion at once (reduced motion switched on). */
export function settleAllRerenders() {
  for (const end of [...rerenders.values()]) end();
}
