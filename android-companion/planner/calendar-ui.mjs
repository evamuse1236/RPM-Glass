/** Read-only calendar: the day's copy, the calendar chooser, event details and clash choices; plus the date picker. */
import {localDay, tasks, conflicts, blockDue} from '../planner-state.mjs';
import {repeats} from '../planner-recurrence.mjs';
import {calendarLabel, calendarRows} from '../planner-calendar.mjs';
import {el, icon, button, labelButton} from './dom.mjs';
import {clock, relativeDay, timeRange} from './format.mjs';
import {openSheet, field, checkbox} from './sheet.mjs';
import {selectDay, setDayLayout} from './today.mjs';

let serial = 0;

export async function refreshCalendar(app) {
  const {state} = app;
  if (state.tab !== 'today' || app.current()) return;
  const mine = ++serial;
  const day = state.day;
  const stillHere = () => mine === serial && day === state.day;
  const redraw = () => {
    if (app.dom.sheet.hidden && state.tab === 'today' && !app.current()) app.render();
  };
  try {
    const value = await app.api.native('calendarRead', {anchor: +new Date(day + 'T12:00')});
    if (!stillHere()) return;
    const next = calendarRows(value);
    const label = calendarLabel(value);
    const changed = JSON.stringify(state.calendar) !== JSON.stringify(next) || state.calendarState !== label;
    state.calendar = next;
    state.calendarState = label;
    if (changed) redraw();
  } catch {
    const changed = state.calendarState !== 'Unavailable';
    state.calendarState = 'Unavailable';
    if (changed) redraw();
  }
}

export function calendarDetails(app, event) {
  const {body} = openSheet(app, 'Calendar event');
  body.append(el('p', 'sheet-lead', event.title));
  const when = event.allDay ? 'All day' : `${clock(event.start)} – ${clock(event.end)}`;
  const row = el('div', 'detail-row static');
  row.append(icon('schedule'), el('span', 'detail-text tnum', when));
  const note = el('div', 'detail-row static');
  note.append(icon('lock'), el('span', 'detail-text', 'Read-only. Make changes in your calendar app.'));
  body.append(row, note);
}

/**
 * Resolve a clash: the overlapping items side by side, and a choice of which to change. A task can move to just
 * before the clash (when that time is free) or open to choose a time; both go through Undo. Calendar events are
 * read-only here, so for a clash of events only, the fix RPM offers is one task today to sort it out.
 */
export function resolveClash(app, items) {
  const {state} = app;
  const data = app.data();
  const start = Math.min(...items.map(item => item.start)), end = Math.max(...items.map(item => item.end));
  const day = relativeDay(localDay(start)).replace(/,.*$/, '');
  const {body, actions} = openSheet(app, 'Resolve clash');
  body.append(el('p', 'sheet-lead tnum', `${day} · ${timeRange(start, end)}`),
    el('p', 'sheet-note', 'These overlap. Choose what to change. Calendar events can only be changed in your calendar app.'));
  const list = el('div', 'clash-list');
  for (const item of items) {
    const task = item.source === 'rpm' ? tasks(data).find(t => t.id === item.id) : null;
    // The task that sets its Result's deadline is not moved with one tap: that would move the deadline too.
    const setsDeadline = task?.blockId != null && blockDue(data, task.blockId)?.task.id === task.id;
    const row = el('div', 'clash-item');
    const copy = el('span', 'list-copy');
    copy.append(el('span', 'list-headline', item.title), el('span', 'list-supporting tnum',
      `${timeRange(item.start, item.end)} · ${task ? (setsDeadline ? 'Task, sets its Result\'s deadline' : 'Task') : 'Calendar event'}`));
    row.append(icon(task ? 'task_alt' : 'event', {cls: 'leading'}), copy);
    list.append(row);
    if (!task) continue;
    const choices = el('div', 'clash-actions');
    const minutes = (item.end - item.start) / 60000;
    const before = Math.min(...items.filter(other => other !== item).map(other => other.start)) - minutes * 60000;
    if (!repeats(task) && !setsDeadline && before > Date.now() && !conflicts(data, before, minutes, state.calendar ?? [], task.id).length) {
      choices.append(button(`Move to ${clock(before)}`, () => app.commit({type: 'saveTask', id: task.id,
        fields: {planned: new Date(before).toISOString()}}, {label: `${task.title} moved to ${clock(before)}`}).catch(() => {}),
      'tonal-btn'));
    }
    choices.append(button('Change time', () => app.actions.openTask(task.id, item.occurrence), 'text-btn'));
    list.append(choices);
  }
  body.append(list);
  if (!items.some(item => item.source === 'rpm')) {
    const title = `Sort out the ${day} ${clock(start)} clash: ${items.map(item => item.title).join(' and ')}`;
    const added = data.entries.find(t => !t.archived && !t.done && t.title === title);
    actions.append(added ? button('Open task', () => app.actions.openTask(added.id), 'tonal-btn')
      : button('Add a task for today', () => app.commit({type: 'saveTask',
        fields: {title, plannedDate: localDay(), minutes: 15}}, {label: 'Added to Today'}).catch(() => {}), 'tonal-btn'));
  }
}

export async function calendarEditor(app) {
  const {body, actions} = openSheet(app, 'Calendars');
  body.append(el('p', 'sheet-note', 'Read-only calendars already synced on this phone. RPM keeps a limited local copy '
    + '(3 days back, 22 ahead). It never adds or edits Google events. Sync freshness depends on Android and your account.'));
  try {
    const result = await app.api.native('calendarList');
    if (!body.isConnected) return;
    if (!result.permitted) {
      body.append(el('p', '', 'Allow read access to choose calendars. Capture and RPM reminders work without it.'));
      actions.append(button('Refresh', () => calendarEditor(app), 'text-btn'), button('Allow access', async () => {
        try { await app.api.native('calendarPermission'); } catch (error) { app.notice(error.message); }
      }, 'filled-btn'));
      return;
    }
    if (!result.calendars.length) {
      body.append(el('p', 'quiet', 'No synced calendars found. Add your Google account in Android Settings and turn on '
        + 'Calendar sync, then come back here.'));
    }
    const rows = result.calendars.map(c => ({id: c.id,
      input: checkbox(app, body, c.title + (c.google ? ' · Google' : ''), result.selected.includes(c.id))}));
    actions.append(button('Save', async () => {
      try {
        await app.api.native('calendarSelect', {ids: rows.filter(r => r.input.checked).map(r => r.id)});
        app.closeSheet();
        await refreshCalendar(app);
        app.notice('Calendar selection saved');
      } catch (error) {
        app.notice(error.message);
      }
    }, 'filled-btn'));
  } catch (error) {
    body.append(el('p', 'sheet-error', error.message));
    actions.append(button('Retry', () => calendarEditor(app), 'text-btn'));
  }
}

export function datePicker(app) {
  const {state} = app;
  const {body, actions} = openSheet(app, 'Go to date');
  const date = field(app, body, 'Date', state.day, 'date');
  body.append(labelButton('calendar_month', `Calendars · ${state.calendarState}`, () => calendarEditor(app), 'list-btn'));
  if (!app.largeText()) {
    const timeline = state.dayLayout === 'timeline';
    body.append(labelButton(timeline ? 'view_agenda' : 'schedule', timeline ? 'Show agenda' : 'Show timeline', () => {
      app.closeSheet();
      setDayLayout(app, timeline ? 'agenda' : 'timeline');
    }, 'list-btn'));
  }
  actions.append(button('Today', () => { app.closeSheet(); selectDay(app, localDay()); }, 'text-btn'),
    button('Go', () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) return;
      app.closeSheet();
      selectDay(app, date.value);
    }, 'filled-btn'));
}
