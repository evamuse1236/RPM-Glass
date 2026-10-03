/** One snackbar at a time, with an optional Undo that reverts the last planner change.
 * It rises from the bottom and leaves downward; a new message while one shows swaps its text in place. */
import {playMotion, stopMotion, reducedMotion, EASE, DURATION} from '../surface-motion.mjs';
import {el, button} from './dom.mjs';

let timer = null;
let leaving = 0;

export function hideSnackbar(app, {instant = false} = {}) {
  clearTimeout(timer);
  const node = app.dom.snackbar;
  app.dom.planner.dataset.snackbar = 'false';
  if (node.hidden) return;
  const ticket = ++leaving;
  if (instant || reducedMotion()) {
    stopMotion(node);
    node.hidden = true;
    return;
  }
  const from = getComputedStyle(node);
  playMotion(node, [{opacity: from.opacity, transform: from.transform === 'none' ? 'none' : from.transform},
    {opacity: 0, transform: 'translateY(24px)'}],
  {duration: DURATION.short3, easing: EASE.emphasizedAccelerate, fill: 'forwards'}).then(done => {
    if (!done || ticket !== leaving) return;
    stopMotion(node);
    node.hidden = true;
  });
}

export function notice(app, message, {undo = false} = {}) {
  const node = app.dom.snackbar;
  clearTimeout(timer);
  const showing = !node.hidden && app.dom.planner.dataset.snackbar === 'true';
  ++leaving;
  const content = [el('span', 'snackbar-text', message)];
  if (undo) {
    content.push(button('Undo', async () => {
      try {
        await app.api.commit({type: 'undo'});
        app.recentlyCompleted.clear();
        app.render();
        app.mounted?.controller?.refresh?.();
        notice(app, 'Change undone');
      } catch (error) {
        notice(app, error.message);
      }
    }, 'snackbar-action'));
  }
  node.replaceChildren(...content);
  node.hidden = false;
  app.dom.planner.dataset.snackbar = 'true';
  if (showing) {
    // Same bar, new words: only the content cross-fades.
    stopMotion(node);
    for (const part of content) playMotion(part, [{opacity: 0}, {opacity: 1}], {duration: DURATION.short3, easing: EASE.standard});
  } else {
    const from = getComputedStyle(node);
    const start = node.getAnimations().length ? {opacity: from.opacity, transform: from.transform}
      : {opacity: 0, transform: 'translateY(24px)'};
    playMotion(node, [start, {opacity: 1, transform: 'none'}],
      {duration: DURATION.medium1, easing: EASE.emphasizedDecelerate});
  }
  timer = setTimeout(() => hideSnackbar(app), undo ? 6000 : 4000);
}
