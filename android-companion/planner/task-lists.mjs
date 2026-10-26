import {tasks, blockTasks, inboxRows} from '../planner-state.mjs';
import {el, icon, button, labelButton, emptyState} from './dom.mjs';
import {duration} from './format.mjs';
import {animateRerender, reducedMotion, EASE, DURATION} from '../surface-motion.mjs';
import {openSheet, isSheetOpen} from './sheet.mjs';
import {taskRow} from './task-row.mjs';
import {taskEditor} from './quick-add.mjs';

export function showTrash(app, archive = false) {
  const {body} = openSheet(app, archive ? 'Archive' : 'Trash');
  if (archive) {
    for (const block of app.p().blocks.filter(b => b.archived)) {
      const row = el('div', 'list-item');
      row.append(icon('stacks', {cls: 'leading'}), el('span', 'list-copy', block.title),
        button('Restore', () => app.commit({type: 'archiveBlock', id: block.id, archived: false},
          {label: 'Block restored'}).catch(() => {}), 'text-btn'));
      body.append(row);
    }
  }
  const rows = app.data().entries.filter(e => e.archived && (e.kind ?? 'plan') === 'plan'
    && (e.archiveDisposition === 'archive') === archive);
  if (!rows.length && !(archive && app.p().blocks.some(b => b.archived))) {
    body.append(emptyState({symbol: archive ? 'archive' : 'delete', title: archive ? 'Nothing archived' : 'Trash is empty'}));
  }
  for (const task of rows) {
    const row = el('div', 'list-item');
    row.append(icon('task_alt', {cls: 'leading'}), el('span', 'list-copy', task.title),
      button('Restore', () => app.commit({type: 'restoreTask', id: task.id}, {label: 'Task restored'})
        .catch(() => {}), 'text-btn'));
    body.append(row);
  }
}

/** True while the Inbox sheet is the one showing (not on its way out or being replaced). */
export function inboxShowing(app) {
  const body = app.sheet.inboxBody;
  return isSheetOpen(app) && !!body?.isConnected && !body.closest('.sheet-ghost');
}

/** Inbox: open tasks that are not in a Block yet. Rows swipe as everywhere; a save updates the rows in place. */
export function showInbox(app, {motion = 'forward'} = {}) {
  const {body, actions} = openSheet(app, 'Inbox', {motion});
  app.sheet.inboxBody = body;
  // Fills a host with the rows: the body itself at first, then a detached copy that animateRerender reconciles in by
  // key (it needs the new content returned as an element, so unchanged rows stay and the changed ones move).
  const draw = (host = el('div')) => {
    const rows = inboxRows(app.data());
    host.replaceChildren();
    if (!rows.length) {
      host.append(emptyState({symbol: 'inbox', title: 'Inbox is empty',
        body: 'New captures land here until you give them a Block.'}));
    } else {
      const note = el('p', 'sheet-note', 'Tasks not in a Block yet. Give each one a Result, or keep it here.');
      note.dataset.key = 'inbox-note';
      const jev = labelButton('auto_awesome', 'Sort with Jev', () => app.actions.jevSort(), 'tonal-btn');
      jev.dataset.key = 'inbox-jev';
      host.append(note, jev);
    }
    const back = app.sheet.returned;
    for (const task of rows) {
      const row = taskRow(app, task, {inbox: true});
      // A redraw while the returned highlight is still fading carries it on (from where it was).
      if (back?.id === task.id && host !== body) markReturned(row, back.elapsed());
      host.append(row);
    }
    return host;
  };
  draw(body);
  actions.append(labelButton('mic', 'Capture', () => app.capture(), 'text-btn'),
    labelButton('add', 'Add task', () => taskEditor(app, null), 'filled-btn'));
  app.sheet.live = () => body.isConnected && isSheetOpen(app);
  app.sheet.sync = () => {
    if (!inboxShowing(app) || app.sheet.inboxBody !== body) return false;
    app.sheet.version = app.data().version;
    animateRerender(body, body, () => draw());
    return true;
  };
  app.sheet.onBack = () => false;
}

export const RETURN_HOLD = DURATION.short3;
export const RETURN_FADE = DURATION.medium2;
/** The Inbox row a task was opened from, on the way back: a soft highlight that holds while the Inbox slides back in
 * (150ms), then fades out over 300ms (standard easing), never snapping off. `elapsed` continues it on a rebuilt row (a
 * save landing just after Back redraws the Inbox). */
export function markReturned(row, elapsed) {
  const total = RETURN_HOLD + RETURN_FADE;
  if (elapsed >= total) return;
  row.classList.add('returned');
  const clear = () => row.classList.remove('returned');
  if (reducedMotion()) {
    setTimeout(clear, total - elapsed);
    return;
  }
  const fade = row.animate([{opacity: 1}, {opacity: 0}],
    {duration: RETURN_FADE, delay: RETURN_HOLD, easing: EASE.standard, pseudoElement: '::after', fill: 'both'});
  fade.currentTime = elapsed;
  fade.finished.then(clear, clear);
}
