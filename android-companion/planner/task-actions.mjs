import {blockTasks} from '../planner-state.mjs';
import {repeats, nextOccurrence} from '../planner-recurrence.mjs';
import {el, icon, button, labelButton} from './dom.mjs';
import {duration} from './format.mjs';
import {reducedMotion, EASE, DURATION} from '../surface-motion.mjs';
import {openSheet, isSheetOpen} from './sheet.mjs';
import {closeMenu} from './menu.mjs';
import {whenOf, whenFields, whenLabel, schedulePresets} from './task-fields.mjs';
import {findTask} from './sheet-parts.mjs';
import {inboxShowing} from './task-lists.mjs';
import {openTask} from './task-sheet.mjs';

export function taskMenu(app, task, inline = {}) {
  const items = [
    {label: 'Schedule', icon: 'event_upcoming', onClick: () => (inline.schedule ? inline.schedule() : scheduleMenu(app, task, null))},
    {label: 'Ask Capture', icon: 'mic', onClick: () => app.capture()},
    {label: 'Move to Block', icon: 'drive_file_move', onClick: () => (inline.move ? inline.move() : movePicker(app, task))},
  ];
  if (inline.helper && !task.leverage) items.push({label: 'Add who could help', icon: 'group', onClick: inline.helper});
  if (task.blockId != null || blockTasks(app.data(), null).length > 1) {
    items.push({label: 'Change Plan order', icon: 'swap_vert', onClick: () => planOrder(app, task)});
  }
  items.push({label: 'Duplicate', icon: 'content_copy', onClick: () => duplicate(app, task)});
  if (task.completions?.length && repeats(task)) {
    items.push({label: 'Undo last completion', icon: 'undo', onClick: () =>
      app.commit({type: 'reopenTask', id: task.id}, {label: 'Completion undone'}).catch(() => {})});
  }
  const after = ok => { if (ok && inline.afterRemove) inline.afterRemove(); };
  items.push({label: 'Archive', icon: 'archive', onClick: () => archiveTask(app, task).then(after)});
  items.push({divider: true}, {label: 'Delete', icon: 'delete', danger: true,
    onClick: () => deleteTask(app, task, {keepSheet: false}).then(after)});
  return items;
}

function duplicate(app, task) {
  const fields = {
    title: task.title, blockId: task.blockId ?? null, minutes: task.minutes, must: !!task.must,
    notes: task.notes ?? '', purpose: task.purpose ?? '', leverage: task.leverage ?? '',
  };
  app.commit({type: 'saveTask', fields}, {label: 'Task duplicated'}).catch(() => {});
}

/** Resolves true once archived. */
export function archiveTask(app, task) {
  return app.commit({type: 'archiveTask', id: task.id, disposition: 'archive'},
    {label: 'Archived. Restore it from Archive.'}).then(() => true, () => false);
}

/**
 * Delete at once, with Undo (and Trash keeps it): no confirmation for something that can be undone. A row swiped in
 * the Inbox leaves the Inbox open. Resolves true once deleted.
 */
export function deleteTask(app, task, {keepSheet = inboxShowing(app)} = {}) {
  return app.commit({type: 'archiveTask', id: task.id}, {label: 'Moved to Trash', keepSheet}).then(() => true, () => false);
}

/* ---------- Schedule: the swipe-right choices ---------- */

let scheduling = null;

/** Closes the schedule choices; true when they were open (Android Back closes them first). */
export function closeSchedule({restoreFocus = true} = {}) {
  if (!scheduling) return false;
  const {menu, scrim, returnTo} = scheduling;
  scheduling = null;
  scrim.remove();
  menu.inert = true;
  const gone = () => menu.remove();
  if (reducedMotion()) gone();
  // Opaque until it goes: it folds a little toward its anchor and its fade lasts only the last 50ms.
  else menu.animate([{opacity: 1, transform: 'none'}, {opacity: 1, offset: .5}, {opacity: 0, transform: 'scale(.96, .9)'}],
    {duration: DURATION.short2, easing: EASE.standardAccelerate, fill: 'forwards'}).finished.then(gone, gone);
  if (restoreFocus && returnTo?.isConnected) returnTo.focus({preventScroll: true});
  return true;
}

/**
 * One-tap reschedules anchored to the swiped row (or the task sheet's More button): each choice is a whole date and
 * time and saves at once with Undo. "Pick a date…" opens the task sheet with its date choices unfolded.
 */
export function scheduleMenu(app, task, anchor, {occurrence = null} = {}) {
  closeMenu();
  closeSchedule({restoreFocus: false});
  const t = findTask(app, task.id) ?? task;
  const at = repeats(t) ? (occurrence ?? nextOccurrence(t)) : t.planned;
  const presets = schedulePresets(whenOf(t, at), new Date(), {repeating: repeats(t)});
  const scrim = button('', () => closeSchedule(), 'menu-scrim');
  scrim.setAttribute('aria-label', 'Close');
  const menu = el('div', 'menu schedule-menu');
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Schedule ' + t.title);
  const heading = el('p', 'schedule-title');
  heading.append(icon('event_upcoming'), el('span', '', t.title));
  menu.append(heading);
  const pick = value => {
    closeSchedule();
    const label = value.day ? 'Moved to ' + whenLabel(value) : 'Date removed';
    app.commit({type: 'saveTask', id: t.id, fields: whenFields(value)}, {label, keepSheet: isSheetOpen(app)}).catch(() => {});
  };
  for (const preset of presets) {
    const row = button('', () => pick(preset.value), 'menu-item schedule-item');
    row.setAttribute('role', 'menuitemradio');
    row.setAttribute('aria-checked', String(preset.current));
    row.setAttribute('aria-label', [preset.label, preset.hint, preset.current ? 'current' : ''].filter(Boolean).join(', '));
    row.append(icon(preset.icon), el('span', 'schedule-label', preset.label));
    if (preset.current) row.append(icon('check', {cls: 'schedule-check'}));
    else if (preset.hint) row.append(el('span', 'schedule-hint tnum', preset.hint));
    menu.append(row);
  }
  menu.append(el('hr', 'menu-divider'));
  const other = button('', () => { closeSchedule({restoreFocus: false}); openTask(app, t.id, occurrence, {focus: 'date'}); },
    'menu-item schedule-item');
  other.setAttribute('role', 'menuitem');
  other.append(icon('calendar_month'), el('span', 'schedule-label', 'Pick a date…'));
  menu.append(other);
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeSchedule();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = [...menu.querySelectorAll('.menu-item')];
      const next = items.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1);
      items[(next + items.length) % items.length]?.focus();
    }
  });
  document.body.append(scrim, menu);
  // Anchored to the row: under it when it fits, otherwise above it; a narrow anchor (a button) aligns its right edge.
  const box = (anchor?.isConnected ? anchor : app.dom.sheet).getBoundingClientRect();
  const width = menu.offsetWidth, height = menu.offsetHeight;
  const narrow = box.width < 160;
  const left = Math.max(8, Math.min(innerWidth - width - 8, narrow ? box.right - width : box.left + 16));
  const above = box.bottom + 4 + height > innerHeight - 8 && box.top - height - 4 >= 8;
  const top = above ? box.top - height - 4 : Math.max(8, Math.min(innerHeight - height - 8, box.bottom + 4));
  menu.style.setProperty('--menu-left', left + 'px');
  menu.style.setProperty('--menu-top', top + 'px');
  menu.style.transformOrigin = `${narrow ? 'right' : 'left'} ${above ? 'bottom' : 'top'}`;
  scheduling = {menu, scrim, returnTo: anchor?.querySelector?.('.task-main') ?? anchor};
  menu.querySelector('.schedule-item')?.focus({preventScroll: true});
}

export function movePicker(app, task) {
  const {body} = openSheet(app, 'Move to Block');
  body.append(el('p', 'sheet-note', 'Moving keeps the task, its schedule and its details.'));
  const choices = [...app.activeBlocks(), {id: null, title: 'No block'}];
  for (const block of choices) {
    const row = button('', () => app.commit({type: 'moveTask', id: task.id, blockId: block.id},
      {label: block.id ? 'Moved to ' + block.title : 'Moved to No block'}).catch(() => {}), 'choice-row');
    const selected = (task.blockId ?? null) === block.id;
    row.setAttribute('aria-pressed', String(selected));
    row.append(icon(block.id ? 'stacks' : 'inbox'), el('span', '', block.title));
    if (selected) row.append(icon('check', {cls: 'trailing'}));
    body.append(row);
  }
}

/** Accessible alternative to dragging: move one step in the Plan. */
export function planOrder(app, task) {
  const rows = blockTasks(app.data(), task.blockId);
  const index = rows.findIndex(row => row.id === task.id);
  const {body, actions} = openSheet(app, 'Plan order');
  body.append(el('p', 'sheet-lead', task.title),
    el('p', 'sheet-note', 'Plan order is the task’s priority. It does not change the scheduled time.'));
  const move = delta => {
    const ids = rows.map(row => row.id);
    const next = index + delta;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    app.commit({type: 'reorder', blockId: task.blockId, ids}, {label: 'Plan order changed'}).catch(() => {});
  };
  const up = labelButton('arrow_upward', 'Move up', () => move(-1), 'outlined-btn');
  const down = labelButton('arrow_downward', 'Move down', () => move(1), 'outlined-btn');
  up.disabled = index === 0;
  down.disabled = index === rows.length - 1;
  actions.append(up, down);
}
