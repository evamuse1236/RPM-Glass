/** One snackbar at a time, with an optional Undo that reverts the last planner change. */
import {enterSurface} from '../surface-motion.mjs';
import {el, button} from './dom.mjs';

let timer = null;

export function hideSnackbar(app) {
  clearTimeout(timer);
  app.dom.snackbar.hidden = true;
  app.dom.planner.dataset.snackbar = 'false';
}

export function notice(app, message, {undo = false} = {}) {
  const node = app.dom.snackbar;
  clearTimeout(timer);
  node.replaceChildren(el('span', 'snackbar-text', message));
  if (undo) {
    node.append(button('Undo', async () => {
      try {
        await app.api.commit({type: 'undo'});
        app.recentlyCompleted.clear();
        hideSnackbar(app);
        app.render();
        app.mounted?.controller?.refresh?.();
        notice(app, 'Change undone');
      } catch (error) {
        notice(app, error.message);
      }
    }, 'snackbar-action'));
  }
  node.hidden = false;
  app.dom.planner.dataset.snackbar = 'true';
  enterSurface(node);
  timer = setTimeout(() => hideSnackbar(app), undo ? 6000 : 4000);
}
