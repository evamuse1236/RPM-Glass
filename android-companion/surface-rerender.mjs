/** animateRerender: rebuild a screen and animate only what changed (surface-motion.mjs re-exports it). */
import {MOTION, EASE, DURATION, ghost, reducedMotion, fadeThrough} from './motion-core.mjs';
import {KEYED, SWAP, keyRows, keyOf, captureRows, reconcile, focusPath, restoreFocus, boxFrames} from './rerender-keys.mjs';
import {chainOf, fadeWords, anchorRows, pinTail, track, holdAnchor, settleRerender} from './rerender-support.mjs';

/** A new row the user just typed lands where its words were. */
let landing = null;
/**
 * The next re-render shows the new row matching `match(node)` where the user typed it: at full opacity at once, its
 * words where they were, while its box opens so only what follows (the now-empty field, `follow` selects it, which
 * fades in once it has moved) slides down. No fade, no blink. One-shot; it expires after `ms`.
 */
export function landInPlace(match, {follow = '', ms = 2000} = {}) {
  landing = {match, follow, until: performance.now() + ms};
}

/**
 * Rebuild `root` and animate the difference. `build()` returns a detached element holding the new content (its
 * className, if any, becomes root's). `scroller` keeps its position. With `enabled: false` the change is instant
 * (nodes are still kept). Returns a promise that settles when the motion ends.
 */
export function animateRerender(root, scroller, build, {enabled = true, limit = 14} = {}) {
  settleRerender(root);
  const motion = enabled && !reducedMotion();
  const scrollTop = scroller.scrollTop;
  const before = captureRows(root, scroller);
  const oldKeys = keyOf(before.rows);
  const focus = focusPath(root);
  // The first row on screen (the innermost, even when its top is cut off) holds the reading position; if it goes, the
  // next one on screen that stays does. Everything on screen animates; what is above the screen changes at once.
  const anchors = anchorRows(before);
  const line = anchors[0]?.[1].rect.top ?? -Infinity;
  // Rows on screen whose words may change in place: a copy of how they look now, to fade out over the new words.
  const looks = new Map();
  if (motion) {
    for (const [key, row] of before.rows) {
      if (!row.visible || row.node.querySelector(KEYED) || row.node.closest(SWAP)) continue;
      looks.set(key, {text: row.node.textContent, copy: row.node.cloneNode(true), chain: chainOf(row.node.parentElement, root)});
    }
  }
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
    pinTail(root, scroller, scrollTop, []);
    scroller.scrollTop = scrollTop;
    const after = captureRows(root, scroller);
    restoreFocus(focus, oldKeys, after.rows);
    holdAnchor(scroller, anchors, after.rows, root);
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
  // Scrolled to the end and the page got shorter: the page keeps its length for now, so what is above stays still
  // and the rows below close the gap (the spare space at the end goes as the user scrolls back up).
  pinTail(root, scroller, scrollTop, plan.ghosts);
  scroller.scrollTop = scrollTop;
  const after = captureRows(root, scroller);
  restoreFocus(focus, oldKeys, after.rows);
  if (!motion) {
    holdAnchor(scroller, anchors, after.rows, root);
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
  // A swapped card is one unit: its parts neither open nor slide on their own.
  const swapped = new Set(plan.swaps.map(([, next]) => next));
  const inSwap = node => { for (let n = node.parentElement; n && n !== root; n = n.parentElement) if (swapped.has(n)) return true; return false; };
  // Above the reading position means before the row that holds it, in the new layout (rows above may have grown,
  // so the old line's coordinates no longer tell); without such a row, above the old line.
  const holder = anchors.map(([key]) => after.rows.get(key)?.node)
    .find(node => node?.isConnected && !node.classList.contains('motion-ghost'));
  const above = (node, rect) => (holder
    ? node !== holder && !node.contains(holder) && !holder.contains(node)
      && !!(node.compareDocumentPosition(holder) & Node.DOCUMENT_POSITION_FOLLOWING)
    : rect.bottom <= line + 1);
  for (const [key, row] of after.rows) {
    if (before.rows.has(key) || !row.visible || inSwap(row.node)) continue;
    if (row.parent && !keptNew.has(row.parent)) continue;
    if (above(row.node, row.rect)) continue;
    added.push(row);
  }
  const clip = node => { node.classList.add('motion-clip'); clipped.push(node); };
  const view = scroller.getBoundingClientRect();
  const visible = rect => rect.bottom > view.top - 80 && rect.top < view.bottom + 80;
  // A row whose words changed in the same slot changes size in place instead of collapsing and reopening, and its old
  // words fade out before the new ones fade in.
  const resize = new Map();
  const fades = [];
  for (const node of plan.ghosts) {
    const old = before.rows.get(oldKeys.get(node));
    const cls = String(node.className).split(/\s+/)[0];
    const twin = added.findIndex(row => String(row.node.className).split(/\s+/)[0] === cls
      && (Math.abs(row.rect.top - old.rect.top) < 2 || node.previousElementSibling === row.node
        || node.nextElementSibling === row.node));
    if (twin >= 0) {
      resize.set(added[twin].node, old.rect.height);
      node.classList.remove('motion-ghost');
      fades.push({copy: node, chain: chainOf(node.parentElement, root), rect: old.rect, node: added[twin].node});
      added.splice(twin, 1);
      node.remove();
    } else ghosts.push(node);
  }
  // A card replaced as a whole, and a row on screen whose words changed in place, fade through.
  for (const [old, next] of plan.swaps) {
    const was = before.rows.get(oldKeys.get(old));
    // Only a card actually on screen: a copy of one just off it would slide into view with its new place.
    const onScreen = was && was.rect.bottom > view.top && was.rect.top < view.bottom;
    if (onScreen && next.isConnected) fades.push({copy: old, chain: chainOf(next.parentElement, root), rect: was.rect, node: next});
  }
  for (const [key, look] of looks) {
    const next = after.rows.get(key)?.node;
    if (!next?.isConnected || next.textContent === look.text || inSwap(next) || next.contains(document.activeElement)) continue;
    // A row marked `data-fade="in"` keeps its node and only lets its new words settle in (no copy of the old ones is
    // made, so nothing is thrown away).
    if (next.dataset.fade === 'in') {
      animations.push(next.animate([{opacity: .4}, {opacity: 1}], {duration: DURATION.short4, easing: EASE.standardDecelerate}));
      continue;
    }
    fades.push({...look, rect: before.rows.get(key).rect, node: next});
  }
  for (const node of ghosts) {
    node.classList.add('motion-ghost');
    node.setAttribute('aria-hidden', 'true');
    node.inert = true;
    animated.add(node);
    animations.push(node.animate(boxFrames(node, false), {duration: MOTION.resize, easing: EASE.emphasized, fill: 'forwards'}));
  }
  let landed = null;
  if (landing && landing.until < performance.now()) landing = null;
  // Typed in place: the row sits at its final place at full opacity and its box opens from the top (200ms), so the
  // field below slides down by exactly the room it takes and the two never share space.
  const land = node => {
    if (!landing?.match(node)) return false;
    landed = {...landing, node};
    landing = null;
    animated.add(node);
    clip(node);
    const style = getComputedStyle(node);
    animations.push(node.animate([
      {height: '0px', minHeight: '0px', marginBottom: '0px'},
      {height: node.getBoundingClientRect().height + 'px', minHeight: '0px', marginBottom: style.marginBottom}],
    {duration: DURATION.short4, easing: EASE.standard}));
    return true;
  };
  for (const row of added) {
    if (land(row.node)) continue;
    clip(row.node);
    animated.add(row.node);
    animations.push(row.node.animate(boxFrames(row.node, true), {duration: MOTION.resize, easing: EASE.emphasized}));
  }
  // Small new elements in kept containers fade in; a tall one opens like a new row.
  for (const node of plan.fresh) {
    if (!node.isConnected || node.closest('.motion-clip')) continue;
    const rect = node.getBoundingClientRect();
    if (!rect.height || !visible(rect) || above(node, rect)) continue;
    if (land(node) || (landing && [...node.querySelectorAll(KEYED)].some(land))) continue;
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
  holdAnchor(scroller, anchors, after.rows, root);
  const start = new Map(kept.map(([, next]) => [next.node, next.node.getBoundingClientRect()]));
  const shift = new Map();
  for (const [old, next] of kept) {
    if ((!old.visible && !next.visible) || inSwap(next.node)) continue;
    const now = start.get(next.node);
    // Wholly off screen above the reading position, before and after: it changes at once (a card there that grew
    // would otherwise slide its new bottom down into view).
    const onScreen = r => r.bottom > view.top && r.top < view.bottom;
    if (!onScreen(old.rect) && !onScreen(now) && above(next.node, now)) { shift.set(next.node, [0, 0]); continue; }
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
  // A row on screen above the reading position (one cut off by the top edge included) whose slot another row took,
  // as when Coming up's first Result changes: it changes at once in the layout, but its words fade through in the
  // same beat as everything else, never a hard cut.
  const taken = new Set(fades.map(fade => fade.node));
  for (const [key, row] of before.rows) {
    if (stageKeys.has(key) || row.node.isConnected || row.node.querySelector(KEYED)) continue;
    if (row.rect.bottom <= view.top || row.rect.top >= view.bottom) continue;
    const cls = String(row.node.className).split(/\s+/)[0];
    for (const [newKey, next] of after.rows) {
      if (before.rows.has(newKey) || taken.has(next.node) || animated.has(next.node) || !next.node.isConnected) continue;
      if (String(next.node.className).split(/\s+/)[0] !== cls) continue;
      const now = start.get(next.node) ?? next.node.getBoundingClientRect();
      if (Math.abs(now.top - row.rect.top) > 2) continue;
      taken.add(next.node);
      fades.push({copy: row.node, chain: chainOf(next.node.parentElement, root), rect: row.rect, node: next.node});
      break;
    }
  }
  // A row typed in place is not a change of words: it never fades.
  if (landed) for (let i = fades.length - 1; i >= 0; i--) if (landed.node.contains(fades[i].node) || fades[i].node.contains(landed.node)) fades.splice(i, 1);
  const layer = fades.length ? fadeWords(fades, scroller, view, start, animations) : null;
  if (landed?.follow) {
    for (const node of root.querySelectorAll(landed.follow)) {
      animations.push(node.animate([{opacity: 0}, {opacity: 1}],
        {duration: DURATION.short3, delay: DURATION.short3, easing: EASE.standardDecelerate, fill: 'backwards'}));
    }
  }
  return track(root, animations, () => {
    ghosts.forEach(node => node.remove());
    layer?.remove();
    for (const node of clipped) node.classList.remove('motion-clip');
  });
}
