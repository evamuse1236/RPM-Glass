/** Task rows in the style of Google Tasks: circle check, title, supporting time and duration, a star on Musts only. */
import {blockTasks, localDay} from '../planner-state.mjs';
import {repeats, nextOccurrence} from '../planner-recurrence.mjs';
import {reorderTask} from '../planner-ux.mjs';
import {attachTaskSwipe} from '../task-swipe.mjs';
import {el, icon, button, iconButton} from './dom.mjs';
import {clock, duration, dayName} from './format.mjs';
export {dayName};

const REPEAT_NAMES = {daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly'};

export function taskWhen(task) {
  if (task.start) return task.start;
  if (task.occurrence) return Date.parse(task.occurrence);
  if (task.planned) return Date.parse(repeats(task) ? nextOccurrence(task) : task.planned);
  return null;
}

export function isOverdue(task, when = taskWhen(task)) {
  if (task.done) return false;
  if (when) return when + (task.minutes ?? 30) * 60000 < Date.now();
  return !!task.plannedDate && task.plannedDate < localDay();
}

/** Supporting line: "Now · 30 min", "Sun 9:00 PM · 20 min", "Overdue · …". Times carry their day unless it is today.
 * Must is the star alone (with its accessible name), never the word as well. */
function supportingLine(task, options) {
  const when = taskWhen(task);
  const line = el('span', 'task-supporting tnum');
  const parts = [];
  const leads = [];
  if (options.current) leads.push(['now', 'Now']);
  else if (isOverdue(task, when)) leads.push(['overdue', 'Overdue']);
  else if (options.next) leads.push(['next', 'Next']);
  leads.forEach(([cls, text], i) => line.append(...(i ? [' · '] : []), el('b', 'lead-' + cls, text)));
  const lead = leads.length > 0;
  const day = when ? dayName(localDay(new Date(when)), {today: options.days})
    : task.plannedDate ? dayName(task.plannedDate, {today: options.days}) : '';
  if (when && !options.current) parts.push([day, clock(when)].filter(Boolean).join(' '));
  else if (day) parts.push(day);
  else if (!when && options.anytime) parts.push('Anytime');
  if (task.minutes != null) parts.push(duration(task.minutes));
  const rule = task.repeatAfterDays ? 'After completion' : REPEAT_NAMES[task.recurrence];
  if (rule) parts.push(rule);
  if (options.context) parts.push(options.context);
  const text = parts.join(' · ');
  if (lead && text) line.append(' · ');
  line.append(text);
  return line;
}

function checkButton(app, task) {
  const label = `Mark ${task.title} ${task.done ? 'incomplete' : 'complete'}`;
  const check = button('', () => toggleDone(app, task, task.occurrence), 'task-check');
  check.setAttribute('aria-label', label);
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', String(!!task.done));
  const ring = el('span', 'check-ring');
  if (task.done) ring.append(icon('check'));
  check.append(ring);
  return check;
}

/** The filled star marks a Must; other rows show nothing there. Must is set from the task sheet, never by a stray tap. */
function mustMark() {
  const star = icon('star', {fill: true, cls: 'must-mark'});
  star.removeAttribute('aria-hidden');
  star.setAttribute('role', 'img');
  star.setAttribute('aria-label', 'Must');
  return star;
}

/**
 * options: current, next, anytime, days (say "Today" too), context (text), plan (true in a Block's Plan),
 * reorder (Plan in reorder mode: drag handle), swipe (archive/delete gestures).
 */
export function taskRow(app, task, options = {}) {
  const row = el('div', 'task-row');
  row.classList.toggle('done', !!task.done);
  row.classList.toggle('current', !!options.current);
  row.dataset.taskId = task.id;
  row.append(checkButton(app, task));

  const main = button('', () => app.actions.openTask(task.id, task.occurrence), 'task-main');
  const title = el('span', 'task-title', task.title);
  const line = supportingLine(task, options);
  main.append(title, line);
  const blockTitle = app.context(task).block?.title ?? 'No block';
  main.setAttribute('aria-label', [task.title, line.textContent, 'part of ' + blockTitle,
    task.must ? 'Must' : '', task.done ? 'completed' : ''].filter(Boolean).join(', '));
  row.append(main);

  if (task.must) row.append(mustMark());
  if (options.plan && options.reorder && !task.done) {
    const handle = iconButton('drag_indicator', 'Reorder ' + task.title, () => app.actions.planOrder(task),
      {cls: 'drag-handle'});
    installOrder(app, handle, row, task);
    row.append(handle);
  }
  if (!options.plan && options.swipe !== false && !task.done) attachSwipe(app, row, task);
  return row;
}

function attachSwipe(app, row, task) {
  row.classList.add('swipe-task');
  attachTaskSwipe(row, {
    archive: () => app.actions.archiveTask(task),
    remove: () => app.actions.deleteTask(task),
  });
}

/** Drag the handle to reorder within the Plan; arrow keys move one step. */
function installOrder(app, handle, row, task) {
  let start = null;
  let target = null;
  let moved = false;
  const clear = () => row.parentElement?.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'));
  handle.addEventListener('pointerdown', event => {
    start = {y: event.clientY};
    target = null;
    moved = false;
    handle.setPointerCapture?.(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (!start || (Math.abs(event.clientY - start.y) < 8 && !moved)) return;
    moved = true;
    row.classList.add('dragging');
    row.style.setProperty('--drag-y', event.clientY - start.y + 'px');
    const hit = document.elementsFromPoint(event.clientX, event.clientY)
      .find(node => node !== row && node.classList?.contains('task-row'));
    if (hit && hit.parentElement === row.parentElement) {
      clear();
      target = Number(hit.dataset.taskId);
      hit.classList.add('drop-target');
    }
  });
  const finish = () => {
    if (!start) return;
    start = null;
    row.classList.remove('dragging');
    row.style.removeProperty('--drag-y');
    clear();
    if (moved && target != null && target !== task.id) {
      const ids = blockTasks(app.data(), task.blockId).map(t => t.id);
      app.commit({type: 'reorder', blockId: task.blockId, ids: reorderTask(ids, task.id, target)},
        {label: 'Plan order changed'}).catch(() => {});
    }
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', () => {
    start = null;
    row.classList.remove('dragging');
    row.style.removeProperty('--drag-y');
    clear();
  });
  handle.addEventListener('click', event => {
    if (!moved) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    moved = false;
  }, true);
  handle.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const ids = blockTasks(app.data(), task.blockId).map(t => t.id);
    const index = ids.indexOf(task.id) + (event.key === 'ArrowUp' ? -1 : 1);
    if (index < 0 || index >= ids.length) return;
    app.commit({type: 'reorder', blockId: task.blockId, ids: reorderTask(ids, task.id, ids[index])},
      {label: 'Plan order changed'}).catch(() => {});
  });
}

/** One tap completes; recurring tasks complete one occurrence. Undo is always offered. */
export async function toggleDone(app, task, when) {
  if (app.saving) return;
  const completing = !task.done;
  const occurrence = when ?? task.occurrence ?? (repeats(task) ? nextOccurrence(task) : task.planned);
  const op = task.done
    ? {type: 'reopenTask', id: task.id, occurrence: when ?? task.occurrence}
    : {type: 'saveTask', id: task.id, fields: {done: true}, occurrence};
  try {
    await app.commit(op, {label: completing ? 'Task completed' : 'Task marked incomplete', keepSheet: false});
    if (completing && !repeats(task)) {
      app.recentlyCompleted.set(task.id, true);
      app.render();
      setTimeout(() => {
        if (app.recentlyCompleted.delete(task.id) && app.dom.sheet.hidden) app.render();
      }, 1500);
    }
    app.api.native('haptic').catch(() => {});
  } catch {}
}

/** "Completed (n)" disclosure; tasks completed a moment ago stay in place first. */
export function completedSection(app, host, rows, options = {}) {
  if (!rows.length) return;
  const rest = rows.filter(task => !app.recentlyCompleted.has(task.id));
  for (const task of rows.filter(t => app.recentlyCompleted.has(t.id))) host.append(taskRow(app, task, options));
  if (!rest.length) return;
  const group = el('section', 'completed-group');
  const open = app.state.completedOpen;
  const toggle = button('', () => {
    app.state.completedOpen = !app.state.completedOpen;
    app.render();
  }, 'completed-toggle');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.append(el('span', '', `Completed (${rest.length})`), icon(open ? 'expand_less' : 'expand_more'));
  group.append(toggle);
  if (open) for (const task of rest) group.append(taskRow(app, task, options));
  host.append(group);
}
