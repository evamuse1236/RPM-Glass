/** One snackbar at a time, with an optional Undo that reverts the last planner change.
 * It rises from the bottom and always leaves downward (150ms). A new message while one shows keeps the bar opaque
 * and cross-fades only its words (old out and new in over the same 150ms). A message raised while a sheet is leaving
 * waits until the sheet is gone. It stays 6s with Undo (4s without), and never times out while the user is typing:
 * the timer pauses while a text field has focus and resumes when it is left. */
import {playMotion, stopMotion, reducedMotion, EASE, DURATION} from '../surface-motion.mjs';
import {el, button} from './dom.mjs';

let timer = null;
let leaving = 0;
/** The running countdown: ms left and when it was last (re)started; null when none is set. */
let countdown = null;
let watching = false;

const editing = () => {
  const active = document.activeElement;
  return !!active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))
    && !['button', 'checkbox', 'radio', 'range', 'submit'].includes(active.type);
};

function pause() {
  if (!countdown || countdown.paused) return;
  clearTimeout(timer);
  countdown.left -= Date.now() - countdown.since;
  countdown.paused = true;
}

function resume(app) {
  if (!countdown || !countdown.paused || editing()) return;
  countdown.paused = false;
  countdown.since = Date.now();
  // After typing, leave enough time to read the message and reach Undo.
  countdown.left = Math.max(countdown.left, 2000);
  timer = setTimeout(() => hideSnackbar(app), countdown.left);
}

function watchFocus(app) {
  if (watching) return;
  watching = true;
  document.addEventListener('focusin', () => { if (editing()) pause(); });
  document.addEventListener('focusout', () => setTimeout(() => resume(app), 0));
}

function arm(app, ms) {
  clearTimeout(timer);
  countdown = {left: ms, since: Date.now(), paused: true};
  watchFocus(app);
  if (editing()) return;
  resume(app);
}

export function hideSnackbar(app, {instant = false} = {}) {
  clearTimeout(timer);
  countdown = null;
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
    node.replaceChildren();
  });
}

/** The old words, stacked on the new ones in the same opaque bar, fade out while the new ones fade in (150ms each,
 * together), so the bar never dips to empty. */
function swapWords(node, oldParts, content) {
  node.querySelectorAll(':scope > .snackbar-ghost').forEach(n => n.remove());
  if (reducedMotion() || !oldParts.length) return;
  const cover = el('div', 'snackbar-ghost');
  cover.setAttribute('aria-hidden', 'true');
  cover.inert = true;
  cover.append(...oldParts);
  node.append(cover);
  playMotion(cover, [{opacity: 1}, {opacity: 0}], {duration: DURATION.short3, easing: EASE.standard, fill: 'forwards'})
    .then(() => cover.remove());
  for (const part of content) {
    playMotion(part, [{opacity: 0}, {opacity: 1}], {duration: DURATION.short3, easing: EASE.standard});
  }
}

/** The latest message waiting for a leaving sheet. */
let queued = null;

export function notice(app, message, options = {}) {
  const sheet = app.dom.sheet;
  if (!sheet.hidden && sheet.inert && app.sheet.gone && !reducedMotion()) {
    const ticket = queued = {};
    app.sheet.gone.then(() => { if (queued === ticket) { queued = null; notice(app, message, options); } });
    return;
  }
  queued = null;
  const {undo = false} = options;
  const node = app.dom.snackbar;
  const showing = !node.hidden;
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
  const oldParts = showing ? [...node.children].filter(n => !n.classList.contains('snackbar-ghost')) : [];
  node.replaceChildren(...content);
  node.hidden = false;
  app.dom.planner.dataset.snackbar = 'true';
  if (showing) {
    // Same bar, new words. If it was on its way out, it comes back from where it is.
    const from = getComputedStyle(node);
    if (node.getAnimations().length && (Number(from.opacity) < 1 || from.transform !== 'none')) {
      playMotion(node, [{opacity: from.opacity, transform: from.transform}, {opacity: 1, transform: 'none'}],
        {duration: DURATION.short4, easing: EASE.emphasizedDecelerate});
    } else stopMotion(node);
    swapWords(node, oldParts, content);
  } else {
    playMotion(node, [{opacity: 0, transform: 'translateY(24px)'}, {opacity: 1, transform: 'none'}],
      {duration: DURATION.medium1, easing: EASE.emphasizedDecelerate});
  }
  arm(app, undo ? 6000 : 4000);
}
