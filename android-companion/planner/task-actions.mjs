import {repeats, nextOccurrence} from '../planner-recurrence.mjs';
import {el, icon, button} from './dom.mjs';
import {reducedMotion, EASE, DURATION} from '../surface-motion.mjs';
import {openSheet, isSheetOpen} from './sheet.mjs';
import {closeMenu} from './menu.mjs';
import {whenOf, whenFields, whenLabel, schedulePresets, blockChooser, recentBlock, rememberBlock} from './task-fields.mjs';
import {findTask, suggestBlock} from './sheet-parts.mjs';
import {inboxShowing} from './task-lists.mjs';
import {openTask} from './task-sheet.mjs';

/** A copy of the task's words, Block, length and Must; the sheet closes and the snackbar offers Undo. */
export function duplicateTask(app, task) {
  const fields = {
    title: task.title, blockId: task.blockId ?? null, minutes: task.minutes, must: !!task.must,
    notes: task.notes ?? '', purpose: task.purpose ?? '', leverage: task.leverage ?? '',
  };
  app.commit({type: 'saveTask', fields}, {label: 'Task duplicated'}).catch(() => {});
}

/** A repeating task's latest completion taken back, with Undo. */
export function undoLastCompletion(app, task) {
  app.commit({type: 'reopenTask', id: task.id}, {label: 'Completion undone', keepSheet: true}).catch(() => {});
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
export function scheduleMenu(app, task, anchor, {occurrence = null, moveToBlock = false} = {}) {
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
  if (moveToBlock) {
    const move = button('', () => { closeSchedule({restoreFocus: false}); movePicker(app, t); }, 'menu-item schedule-item');
    move.setAttribute('role', 'menuitem');
    move.append(icon('drive_file_move'), el('span', 'schedule-label', 'Move to Block…'));
    menu.append(move);
  }
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

/**
 * Move to Block: a search, the recent and suggested Blocks first, then the rest. With `back` (the task sheet that
 * opened it), choosing saves and returns there, and Android Back or the arrow returns without a change.
 */
export function movePicker(app, task) {
  const {body} = openSheet(app, 'Move to Block');
  body.append(el('p', 'sheet-note', 'Moving keeps the task, its schedule and its details.'));
  const pick = (blockId, title) => {
    rememberBlock(blockId);
    const label = blockId ? 'Moved to ' + title : 'Moved to No block';
    app.commit({type: 'moveTask', id: task.id, blockId}, {label}).catch(() => {});
  };
  blockChooser(body, {blocks: () => app.activeBlocks(), get: () => findTask(app, task.id)?.blockId ?? null, pick,
    recent: recentBlock(), suggested: suggestBlock(app, task, task.blockId)?.id ?? null});
}
