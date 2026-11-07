import {tasks, blockTasks, inboxRows, localDay} from '../planner-state.mjs';
import {el, icon, button, labelButton, sectionHeader, emptyState} from './dom.mjs';
import {repeats} from '../planner-recurrence.mjs';
import {duration} from './format.mjs';
import {animateRerender, reducedMotion, EASE, DURATION} from '../surface-motion.mjs';
import {openSheet, isSheetOpen} from './sheet.mjs';
import {taskRow} from './task-row.mjs';
import {taskEditor} from './quick-add.mjs';
import {INBOX_LEFT} from './row-gestures.mjs';
import {peekSwipe} from '../task-swipe.mjs';

const PEEKED = 'rpm.inbox.peeked';
const peeked = () => { try { return localStorage.getItem(PEEKED) === '1'; } catch { return true; } };
const notePeeked = () => { try { localStorage.setItem(PEEKED, '1'); } catch {} };

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
  const {body, actions, header, sheet} = openSheet(app, 'Inbox', {motion});
  sheet.classList.add('sheet-inbox');
  app.sheet.inboxBody = body;
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
    // Today's are said once, in their header, so their rows drop the word.
    const scheduled = task => !!(task.planned || task.plannedDate || repeats(task));
    const dueToday = task => (task.planned ? localDay(new Date(task.planned)) : task.plannedDate) === localDay();
    const open = rows.filter(task => !scheduled(task));
    const when = task => (task.planned ? new Date(task.planned).getTime()
      : task.plannedDate ? new Date(task.plannedDate + 'T23:59:59').getTime() : Infinity);
    const byWhen = (a, b) => when(a) - when(b);
    const today = rows.filter(task => scheduled(task) && dueToday(task)).sort(byWhen);
    const later = rows.filter(task => scheduled(task) && !dueToday(task)).sort(byWhen);
    const add = (task, days) => {
      const row = taskRow(app, task, {inbox: true, days});
      // A redraw while the returned highlight is still fading carries it on (from where it was).
      if (back?.id === task.id && host !== body) markReturned(row, back.elapsed());
      host.append(row);
    };
    const section = (title, key, list, days) => {
      if (!list.length) return;
      const head = sectionHeader(title);
      head.classList.add('inbox-scheduled');
      head.dataset.key = key;
      host.append(head);
      list.forEach(task => add(task, days));
    };
    open.forEach(task => add(task, false));
    section('Scheduled today', 'inbox-scheduled-today', today, false);
    section(today.length ? 'Scheduled later' : 'Scheduled', 'inbox-scheduled', later, true);
    return host;
  };
  draw(body);
  // Filing is the left swipe; the first row shows it once, then never again.
  const first = body.querySelector('.task-row');
  if (first && !peeked()) {
    notePeeked();
    requestAnimationFrame(() => { if (first.isConnected) peekSwipe(first, INBOX_LEFT, 'left', 168, 900); });
  }
  actions.append(labelButton('mic', 'Capture', () => app.capture(), 'text-btn'), el('span', 'spacer'),
    labelButton('add', 'Add task', () => taskEditor(app, null), 'text-btn'));
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
