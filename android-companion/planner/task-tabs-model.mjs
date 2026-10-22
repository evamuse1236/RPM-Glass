/** What the task sheet's four tabs show and save, apart from the DOM: their short values, choices and saved fields. */
import {localDay, shiftDay} from '../planner-state.mjs';
import {clock} from './format.mjs';
import {repeatDaysOf, repeatFieldsFor} from './task-values.mjs';

export const TABS = Object.freeze([['when', 'When'], ['alert', 'Alert'], ['repeat', 'Repeat'], ['block', 'Block']]);
/** The tab an arrow key moves to from `current`, wrapping at either end. */
export function stepTab(current, step) {
  const keys = TABS.map(([key]) => key);
  return keys[(keys.indexOf(current) + step + keys.length) % keys.length];
}
export const LENGTHS = Object.freeze([15, 30, 45, 60, 90, 120]);
export const REPEAT_PRESETS = Object.freeze([['once', 'Once'], ['weekdays', 'Weekdays'], ['daily', 'Every day'], ['after', 'After completion']]);
export const ALERT_KINDS = Object.freeze([['off', 'Off', 'notifications_off', 'No alert'], ['reminder', 'Remind', 'notifications', 'Reminder'],
  ['alarm', 'Alarm', 'alarm', 'Ringing alarm']]);

/** "4 PM", "4:30 PM": a clock without ":00". */
export const briefClock = (day, time) => clock(new Date(`${day || localDay()}T${time}`)).replace(':00', '');

const weekday = day => new Date(day + 'T12:00').toLocaleDateString([], {weekday: 'short'});

/** The When tab's value: "4 PM" today, "Wed 4 PM" another day, "Tomorrow" without a time, or "No date". */
export function whenShort({day, time}, today = localDay()) {
  if (!day) return 'No date';
  const name = day === today ? 'Today' : day === shiftDay(today, 1) ? 'Tomorrow' : weekday(day);
  if (!time) return name;
  return (day === today ? '' : (name === 'Tomorrow' ? weekday(day) : name) + ' ') + briefClock(day, time);
}

/** The Alert tab's value and icon: "Off", "On time" or "10 min". */
export function alertShort({alert, lead}) {
  if (!alert || alert === 'off') return {text: 'Off', symbol: 'notifications_off'};
  return {text: lead ? `${lead} min` : 'On time', symbol: alert === 'alarm' ? 'alarm' : 'notifications'};
}

/** The Block tab's value: the Block's first word, or Inbox. */
export const blockShort = title => (title ? title.trim().split(/\s+/)[0] : 'Inbox');

/** Length chips: the six usual ones plus the task's own length in its place. */
export function lengthChoices(minutes) {
  return minutes != null && !LENGTHS.includes(minutes) ? [...LENGTHS, minutes].sort((a, b) => a - b) : [...LENGTHS];
}

/** The Repeat preset that matches the task, or '' for chosen days. */
export function presetOf(task) {
  if (task?.repeatAfterDays) return 'after';
  const days = repeatDaysOf(task);
  if (!days.length) return 'once';
  if (days.length === 7) return 'daily';
  return task.recurrence === 'weekdays' ? 'weekdays' : '';
}

/** Fields after tapping a Repeat day circle: that weekday turns on or off, the others stay. */
export function toggleRepeatDay(task, weekdayNumber) {
  const days = task?.repeatAfterDays ? [] : repeatDaysOf(task);
  const next = days.includes(weekdayNumber) ? days.filter(d => d !== weekdayNumber) : [...days, weekdayNumber];
  return repeatFieldsFor(next, task?.planned);
}

/** Fields for a Repeat preset; After completion keeps `every` days. */
export function presetFields(preset, task, every = 1) {
  if (preset === 'after') return {recurrence: null, repeatDays: null, repeatAfterDays: every};
  const days = {once: [], weekdays: [1, 2, 3, 4, 5], daily: [0, 1, 2, 3, 4, 5, 6]}[preset];
  return repeatFieldsFor(days, task?.planned);
}

/**
 * The Block tab's rows: every open Block in the planner's order, each with its tasks done of total and its Purpose,
 * then the Inbox last. `statusOf(id)` returns {done, total}.
 */
export function blockChoices(blocks, statusOf, query = '') {
  const q = query.trim().toLowerCase();
  const rows = blocks.filter(b => !b.archived && (!q || b.title.toLowerCase().includes(q))).map(b => {
    const {done, total} = statusOf(b.id);
    const count = total ? `${done} of ${total} done` : 'No tasks yet';
    return {id: b.id, title: b.title, line: [b.purpose?.trim(), count].filter(Boolean).join(' · '), done, total};
  });
  if (!q || 'inbox'.includes(q) || 'no block'.includes(q)) rows.push({id: null, title: 'Inbox', line: 'No Block', done: 0, total: 0});
  return rows;
}
