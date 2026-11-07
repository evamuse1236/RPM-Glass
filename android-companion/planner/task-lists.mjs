import {tasks, blockTasks, inboxRows} from '../planner-state.mjs';
import {el, icon, button, iconButton, labelButton, sectionHeader, emptyState} from './dom.mjs';
import {repeats} from '../planner-recurrence.mjs';
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
  const {body, actions, header} = openSheet(app, 'Inbox', {motion});
  app.sheet.inboxBody = body;
  // The title counts what is left to sort; Sort with Jev is a quiet text button beside Close.
  const count = el('span', 'sheet-count');
  header.querySelector('h2').append(count);
  const jev = labelButton('auto_awesome', 'Sort with Jev', () => app.actions.jevSort(), 'text-btn inbox-jev');
  header.querySelector('.sheet-close').before(jev);
  // Fills a host with the rows: the body itself at first, then a detached copy that animateRerender reconciles in by
  // key (it needs the new content returned as an element, so unchanged rows stay and the changed ones move).
  const draw = (host = el('div')) => {
    const rows = inboxRows(app.data());
    host.replaceChildren();
    jev.hidden = !rows.length;
    count.textContent = rows.length ? String(rows.length) : '';
    if (!rows.length) {
      host.append(emptyState({symbol: 'inbox', title: 'Inbox is empty',
        body: 'New captures land here until you give them a Block.'}));
    }
    const back = app.sheet.returned;
    // What still needs a decision comes first; tasks that already have a day, time or repeat wait under Scheduled.
    const scheduled = task => !!(task.planned || task.plannedDate || repeats(task));
    const open = rows.filter(task => !scheduled(task));
    const later = rows.filter(scheduled);
    const add = task => {
      const row = taskRow(app, task, {inbox: true, days: scheduled(task)});
      // Each row files itself: the trailing button opens the same Block list as the left swipe.
      row.append(iconButton('drive_file_move', `Move ${task.title} to a Block`,
        () => app.actions.movePicker(task), {cls: 'inbox-move'}));
      // A redraw while the returned highlight is still fading carries it on (from where it was).
      if (back?.id === task.id && host !== body) markReturned(row, back.elapsed());
      host.append(row);
    };
    open.forEach(add);
    if (later.length) {
      const head = sectionHeader('Scheduled');
      head.classList.add('inbox-scheduled');
      head.dataset.key = 'inbox-scheduled';
      host.append(head);
      later.forEach(add);
    }
    return host;
  };
  draw(body);
  // The same footer as quick add: Capture on the leading edge, the one add action on the trailing edge.
  actions.append(labelButton('mic', 'Capture', () => app.capture(), 'text-btn'), el('span', 'spacer'),
    labelButton('add', 'Add task', () => taskEditor(app, null), 'tonal-btn'));
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
