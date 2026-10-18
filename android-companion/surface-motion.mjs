/** Interruptible, local motion on Material 3 tokens. Storage and navigation never wait on decoration.
 * Every animation starts from what is on screen now, so a tap during a transition redirects it. */
export * from './motion-core.mjs';
export {KEYED, captureRows} from './rerender-keys.mjs';
export {releaseTail, settleRerender, snapshotRows, landRows} from './rerender-support.mjs';
export {landInPlace, animateRerender} from './surface-rerender.mjs';
import {MOTION, EASE, reducedMotion, stopMotion, settleTransitions, runningNodes} from './motion-core.mjs';
import {boxFrames} from './rerender-keys.mjs';
import {settleAllRerenders} from './rerender-support.mjs';

const layouts = new Map();

/** Collapse `node` where it is (250ms emphasized): its words fade with its space, so both leave together, and the
 * rows below follow it up in the layout. Resolves true when it ran to the end (the node is then 0 high). */
export function collapseRow(node) {
  if (!node?.isConnected || reducedMotion()) return Promise.resolve(true);
  node.classList.add('motion-clip');
  const animation = node.animate(boxFrames(node, false), {duration: MOTION.resize, easing: EASE.emphasized, fill: 'forwards'});
  return animation.finished.then(() => true, () => false).then(done => {
    node.classList.remove('motion-clip');
    return done ? animation : (animation.cancel(), false);
  });
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
  for (const node of runningNodes()) stopMotion(node);
  for (const group of layouts.values()) group.cancel();
  settleTransitions();
  settleAllRerenders();
};
globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', cancelReduced);
globalThis.window?.addEventListener('rpm-phone-status', cancelReduced);
