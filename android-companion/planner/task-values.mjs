import {localDay, shiftDay} from '../planner-state.mjs';
import {clock, relativeDay, timeValue} from './format.mjs';

export const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
export const TIMES = ['09:00', '14:00', '19:00'];
const hhmm = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 ? '30' : '00'}`;
/** The task sheet's Time row: every half hour from 6:00 AM to 11:00 PM. */
export const TIME_GRID = Object.freeze(Array.from({length: 35}, (_, i) => hhmm(360 + i * 30)));
export const REPEATS = [['', "Doesn't repeat"], ['daily', 'Daily'], ['weekdays', 'Every weekday'], ['weekly', 'Weekly'],
  ['after', 'After completion']];
export const ALERTS = [['off', 'No alert'], ['reminder', 'Reminder'], ['alarm', 'Ringing alarm']];

/* ---------- values ---------- */

/** {day, time} of a task (or of one occurrence `when`); '' when unset. */
export function whenOf(task, when = task?.planned) {
  if (when) return {day: localDay(new Date(when)), time: timeValue(when)};
  return {day: task?.plannedDate ?? '', time: ''};
}

/** The saved fields for a {day, time}: a time needs a day, a day alone is a plannedDate. */
export function whenFields({day, time}) {
  if (day && time) return {planned: new Date(`${day}T${time}`).toISOString(), plannedDate: null};
  return {planned: null, plannedDate: day || null};
}

/** "Today, 4:00 PM", "Tomorrow", "Mon, Oct 5, 9:00 AM", or "No date". */
export function whenLabel({day, time}) {
  if (!day) return 'No date';
  return relativeDay(day) + (time ? ', ' + clockOf(day, time) : '');
}

export const clockOf = (day, time) => clock(new Date(`${day || localDay()}T${time}`));

/**
 * One-tap days: Today, Tomorrow, then the weekend (Mon–Thu), next Monday (Fri, Sat) or next Saturday (Sun), never
 * repeating Tomorrow.
 * Returns [[label, day, accessible name]].
 */
export function dayPresets(today = localDay()) {
  const weekday = new Date(today + 'T12:00').getDay();
  const presets = [['Today', today], ['Tomorrow', shiftDay(today, 1)]];
  if (weekday >= 1 && weekday <= 4) presets.push(['This weekend', shiftDay(today, 6 - weekday)]);
  else if (weekday === 0) presets.push(['Next weekend', shiftDay(today, 6)]);
  else presets.push(['Next week', shiftDay(today, 8 - weekday)]);
  return presets.map(([label, day]) => [label, day, `${label}, ${longDay(day)}`]);
}

/**
 * One-tap reschedules for a swiped row (Things' When, Todoist's Schedule): each is a whole date and time, so one tap
 * saves. Today and Tomorrow keep the task's time; Tonight (until 7 PM), Tomorrow morning at 9; the weekend or next
 * week; No date for a dated task. A repeating task keeps a date and a time, so it gets no date-only choice.
 * Returns [{key, label, hint, icon, value: {day, time}, current}].
 */
export function schedulePresets({day = '', time = ''} = {}, now = new Date(), {repeating = false} = {}) {
  const today = localDay(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const tomorrow = shiftDay(today, 1);
  const weekday = d => new Date(d + 'T12:00').toLocaleDateString([], {weekday: 'short'});
  const at = (d, t) => (t ? clockOf(d, t) : '');
  const out = [];
  const add = (key, label, symbol, value, hint) => {
    if (repeating && !(value.day && value.time)) return;
    out.push({key, label, icon: symbol, value, hint, current: value.day === day && value.time === time});
  };
  add('today', 'Today', 'today', {day: today, time}, at(today, time));
  if (minutes < 19 * 60 && time !== '19:00') add('tonight', 'Tonight', 'bedtime', {day: today, time: '19:00'}, at(today, '19:00'));
  add('tomorrow', 'Tomorrow', 'event', {day: tomorrow, time}, at(tomorrow, time) || weekday(tomorrow));
  if (time !== '09:00') add('morning', 'Tomorrow morning', 'wb_sunny', {day: tomorrow, time: '09:00'}, at(tomorrow, '09:00'));
  const [label, later] = dayPresets(today)[2];
  add('later', label, 'date_range', {day: later, time}, [weekday(later), at(later, time)].filter(Boolean).join(' '));
  if (day) add('none', 'No date', 'event_busy', {day: '', time: ''}, '');
  return out;
}

/**
 * Blocks for a `#word` typed in Quick add: titles with a word starting with it first, then titles containing it.
 * Returns up to `limit` Blocks; a bare "#" offers the first ones (the caller puts the recent Block first).
 */
export function blockMatches(blocks, query, limit = 4) {
  const q = String(query ?? '').toLowerCase();
  if (!q) return blocks.slice(0, limit);
  const words = b => b.title.toLowerCase().split(/[^a-z0-9]+/i);
  const starts = blocks.filter(b => words(b).some(w => w.startsWith(q)));
  const contains = blocks.filter(b => !starts.includes(b) && b.title.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** The `#word` being typed just before the caret: {query, start, end} or null. */
export function hashToken(text, caret = String(text ?? '').length) {
  const before = String(text ?? '').slice(0, caret);
  const found = before.match(/(?:^|\s)#([^\s#]*)$/);
  if (!found) return null;
  const start = caret - found[1].length - 1;
  return {query: found[1], start, end: caret};
}

/**
 * A `#word` in the title that names exactly one Block strongly enough to choose it without a tap: at least two
 * letters, starting a word of that Block's title, and matching no other Block at all. The last such word wins.
 * Returns {block, query, start, end, match} or null; with several matches the sheet offers chips instead.
 */
export function hashTag(text, blocks) {
  const value = String(text ?? '');
  const found = [...value.matchAll(/(^|\s)#([^\s#]+)/g)];
  for (const m of found.reverse()) {
    const query = m[2].toLowerCase();
    if (query.length < 2) continue;
    const matches = blockMatches(blocks, query, 2);
    if (matches.length !== 1) continue;
    if (!matches[0].title.toLowerCase().split(/[^a-z0-9]+/i).some(w => w.startsWith(query))) continue;
    const start = m.index + m[1].length;
    return {block: matches[0], query, start, end: start + m[2].length + 1, match: '#' + m[2]};
  }
  return null;
}

/** The title without a `#word` (at start..end), spaces tidied. */
export function withoutTag(text, {start, end}) {
  return (text.slice(0, start) + text.slice(end)).replace(/\s{2,}/g, ' ').trim();
}

const longDay = day => new Date(day + 'T12:00').toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'});

/** The Time row's chips: the half-hour grid, with the task's own time inserted in clock order when it is off the grid. */
export function timeChips(current = '') {
  return current && !TIME_GRID.includes(current) ? [...TIME_GRID, current].sort() : [...TIME_GRID];
}

/** The half hour the Time row opens on when no time is set: the next one from now, kept on the grid. */
export function nextHalfHour(now = new Date()) {
  const minutes = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
  return hhmm(Math.min(23 * 60, Math.max(6 * 60, minutes)));
}

/**
 * The Day row: Today, Tomorrow, then the next five days by short weekday name. A `current` day outside them gets its
 * own chip: before Today when it has passed, otherwise right after Tomorrow, so a picked date shows without a swipe.
 * Returns [{label, day, aria}]; `aria` is empty where the label says it all.
 */
export function dayChips(today = localDay(), current = '') {
  const date = day => new Date(day + 'T12:00');
  const spoken = day => date(day).toLocaleDateString([], {weekday: 'long', month: 'short', day: 'numeric'});
  const chips = [{label: 'Today', day: today, aria: ''}, {label: 'Tomorrow', day: shiftDay(today, 1), aria: ''}];
  for (let i = 2; i < 7; i++) {
    const day = shiftDay(today, i);
    chips.push({label: date(day).toLocaleDateString([], {weekday: 'short'}), day, aria: spoken(day)});
  }
  if (current && !chips.some(c => c.day === current)) {
    const label = date(current).toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'});
    chips.splice(current < today ? 0 : 2, 0, {label, day: current, aria: spoken(current)});
  }
  return chips;
}

/** Time presets with the task's own time folded in, in clock order. */
export function timePresets(current = '') {
  return [...new Set([...TIMES, ...(current ? [current] : [])])].sort();
}

export const repeatValue = task => (task?.repeatAfterDays ? 'after' : task?.recurrence ?? '');
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function repeatLabel(task) {
  if (task?.repeatAfterDays) return `${task.repeatAfterDays} ${task.repeatAfterDays === 1 ? 'day' : 'days'} after completion`;
  if (task?.recurrence === 'days') return 'Every ' + weekOrder(task.repeatDays ?? []).map(d => DAY_NAMES[d]).join(', ');
  return REPEATS.find(([value]) => value === (task?.recurrence ?? ''))?.[1] ?? "Doesn't repeat";
}

/** The Repeat tab's circles, Monday first: [weekday 0–6, letter, name]. */
export const REPEAT_DAYS = [1, 2, 3, 4, 5, 6, 0].map(d => [d, DAY_NAMES[d][0], new Date(2026, 9, 18 + d, 12).toLocaleDateString([], {weekday: 'long'})]);
const weekOrder = days => [...new Set(days)].sort((a, b) => (a + 6) % 7 - (b + 6) % 7);
const weekdayOf = planned => (planned ? new Date(planned).getDay() : null);

/** The weekdays a task repeats on (0 Sunday to 6 Saturday); a weekly task repeats on its own day. */
export function repeatDaysOf(task) {
  switch (task?.repeatAfterDays ? 'after' : task?.recurrence) {
    case 'daily': return [0, 1, 2, 3, 4, 5, 6];
    case 'weekdays': return [1, 2, 3, 4, 5];
    case 'weekly': return weekdayOf(task.planned) == null ? [] : [weekdayOf(task.planned)];
    case 'days': return weekOrder(task.repeatDays ?? []);
    default: return [];
  }
}

/** The saved fields for a set of weekdays, in the plainest pattern that says it: none, daily, weekdays, weekly or chosen days. */
export function repeatFieldsFor(days, planned) {
  const set = weekOrder(days);
  const off = {recurrence: null, repeatDays: null, repeatAfterDays: null};
  if (!set.length) return off;
  if (set.length === 7) return {...off, recurrence: 'daily'};
  if (set.join() === '1,2,3,4,5') return {...off, recurrence: 'weekdays'};
  if (set.length === 1 && set[0] === weekdayOf(planned)) return {...off, recurrence: 'weekly'};
  return {...off, recurrence: 'days', repeatDays: [...set].sort((a, b) => a - b)};
}

/** The Repeat tab's short value: "Once", "Every day", "Weekdays", "Mo We Fr" or "After 3 days". */
export function repeatShort(task) {
  if (task?.repeatAfterDays) return `After ${task.repeatAfterDays} ${task.repeatAfterDays === 1 ? 'day' : 'days'}`;
  const days = repeatDaysOf(task);
  if (!days.length) return 'Once';
  if (days.length === 7) return 'Every day';
  if (task.recurrence === 'weekdays') return 'Weekdays';
  return days.map(d => DAY_NAMES[d].slice(0, 2)).join(' ');
}

/** Lead times for an alert, in minutes before the task. */
export const ALERT_LEADS = [0, 5, 10, 30, 60];
export const leadLabel = minutes => (minutes ? `${minutes} min before` : 'On time');

const WORDS = {today: 0, tonight: 0, tomorrow: 1, tmr: 1, tmrw: 1};
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const CLOCK = String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b`;
const DAY = String.raw`today|tonight|tomorrow|tmrw?|(?:next\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)`;
const SHORT_DAY = String.raw`(?:next\s+)?(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?=\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*[ap]m\b)`;
const DAY_FIRST = new RegExp(String.raw`\b(${DAY}|${SHORT_DAY})\b(?:\s+(?:at\s+)?${CLOCK})?`, 'i');
const CLOCK_FIRST = new RegExp(String.raw`(?:\bat\s+)?\b${CLOCK}(?:\s+(${DAY})\b)?`, 'i');
const pad2 = n => String(n).padStart(2, '0');

const dayOf = (word, today) => {
  word = word.toLowerCase().replace(/\s+/g, ' ');
  if (word in WORDS) return shiftDay(today, WORDS[word]);
  const target = WEEKDAYS.indexOf(word.replace('next ', '').slice(0, 3));
  return shiftDay(today, (target - new Date(today + 'T12:00').getDay() + 7) % 7 || 7); // "next monday" is the coming Monday, as Todoist reads it
};
const clockOfWords = (hours, minutes = '0', half = '') => {
  if (Number(hours) < 1 || Number(hours) > 12 || Number(minutes) > 59) return '';
  return pad2(Number(hours) % 12 + (half.toLowerCase() === 'pm' ? 12 : 0)) + ':' + pad2(Number(minutes));
};

/**
 * A date (and time) written in the title, as Quick add offers it: "tomorrow", "friday", "mon 9am", "tonight",
 * "at 8 PM today", "8pm". A time with no day is today, or tomorrow once that time has passed.
 * Returns {day, time, match, start, end} or null. The words stay in the title; the sheet marks the date it read on its
 * chip and highlights the words it came from.
 */
export function parseWhen(text, today = localDay(), now = new Date()) {
  text = String(text ?? '');
  const dayFirst = text.match(DAY_FIRST), clockFirst = text.match(CLOCK_FIRST);
  const clock = clockFirst && clockOfWords(clockFirst[1], clockFirst[2], clockFirst[3]);
  let day, time, found;
  if (clock && (!dayFirst || clockFirst.index < dayFirst.index)) {
    found = clockFirst;
    time = clock;
    const passed = today === localDay(now) && time < `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    day = found[4] ? dayOf(found[4], today) : shiftDay(today, passed ? 1 : 0);
  } else if (dayFirst) {
    found = dayFirst;
    day = dayOf(found[1], today);
    time = (found[4] && clockOfWords(found[2], found[3], found[4])) || (found[1].toLowerCase() === 'tonight' ? '19:00' : '');
  } else return null;
  const match = found[0].trim();
  return {day, time, match, start: found.index, end: found.index + match.length};
}

/**
 * "Start now" in the task sheet: the {day, time} that makes an open one-time task begin at this minute today, or null
 * while it is done, repeats (Start now would move the whole series) or is already running.
 */
export function startNowValue(task, {repeating = false, now = new Date()} = {}) {
  if (!task || task.done || repeating) return null;
  const start = task.planned ? Date.parse(task.planned) : NaN;
  const minute = new Date(now);
  minute.setSeconds(0, 0);
  if (start <= minute.getTime() && minute.getTime() < start + Math.max(task.minutes ?? 0, 1) * 60000) return null;
  const pad = n => String(n).padStart(2, '0');
  return {day: localDay(now), time: `${pad(now.getHours())}:${pad(now.getMinutes())}`};
}
