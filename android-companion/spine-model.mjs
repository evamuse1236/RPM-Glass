/**
 * Today's timeline as data: every timed item of the day in time order, hung off one rail. Tasks, calendar events,
 * Routines, meals and deadlines are rows with a coloured pill whose height follows their length; free time of 10 min or
 * more is its own row; now is either the item in progress or a line between rows. Tasks without a time are returned
 * apart, as the chips above the timeline.
 */
import {clockText, atMinutes, minutesOf, WATER_DEFAULTS} from './body-state.mjs';
import {duration} from './planner/format.mjs';
import {MIN, gutterTime, routineMeta, mealSlots} from './day-parts.mjs';
import {taskSymbol, routineSymbol} from './task-symbol.mjs';

export const FREE_MINUTES = 10;
/** Free time this long offers + to plan something in it. */
export const PLAN_MINUTES = 60;
/** The gutter shows the end time too once an item lasts this long. */
export const END_MINUTES = 45;
const snap4 = px => Math.round(px / 4) * 4;
/** Pill heights in dp: 0.72 dp a minute on the 4dp grid, at least 40 and at most 160. */
export const cardHeight = minutes => Math.min(160, Math.max(40, snap4((minutes ?? 0) * 0.72)));
/** Free-time heights in dp: 28, plus 0.08 dp a minute on the 4dp grid, never above 56. */
export const gapHeight = minutes => Math.min(56, snap4(28 + minutes * 0.08));
/** At one start time: now first, then fixed things, then yours, then the small rows, then free time. */
const RANK = {now: 0, event: 1, routine: 2, task: 3, deadline: 4, meal: 5, gap: 7};
const plural = (count, one) => `${count} ${count === 1 ? one : one + 's'}`;
const minutesBetween = (a, b) => Math.round((b - a) / MIN);
/** "7 AM to 7:30 AM", or one time for a moment. */
export const spanWords = (start, end) => (end > start ? `${gutterTime(start)} to ${gutterTime(end)}` : gutterTime(start));

/** How soon the next item starts: "in 40 min", then whole hours ("in 4 h"). */
export function soonText(ms) {
  const minutes = Math.max(1, Math.ceil(ms / MIN));
  return minutes < 60 ? `in ${minutes} min` : `in ${Math.round(minutes / 60)} h`;
}

function item(kind, key, start, end, extra) {
  const minutes = Math.max(0, minutesBetween(start, end));
  return {kind, key, start, end, minutes, height: cardHeight(minutes),
    gutter: {time: gutterTime(start), end: minutes >= END_MINUTES ? gutterTime(end) : null, length: minutes ? duration(minutes) : null},
    ...extra};
}

function taskRows(tasks) {
  return tasks.filter(t => t.start != null).map(task => item('task', 'task:' + task.id + (task.occurrence ?? ''),
    task.start, task.start + (task.minutes ?? 0) * MIN,
    {title: task.title, task, done: !!task.done, must: !!task.must, symbol: taskSymbol(task.title), tone: task.tone ?? 'neutral'}));
}

function routineRows(day, routines) {
  return routines.map(routine => {
    const start = +atMinutes(day, minutesOf(routine.start)), end = +atMinutes(day, minutesOf(routine.end));
    const finished = routine.progress.total > 0 && routine.progress.open === 0;
    return item('routine', 'routine:' + routine.id, start, end, {title: routine.name, routine, done: finished, symbol: routineSymbol(routine.name),
      progress: routine.progress, count: routineMeta(routine.state, routine.progress), missed: routine.state === 'missed'});
  });
}

function markRows({day, now, live, meals, mealPlan, deadlines}) {
  const rows = [];
  for (const slot of mealSlots(meals, day, now, {placeholders: live, plan: mealPlan})) {
    rows.push({...item('meal', 'meal:' + slot.slot, slot.at, slot.at, {symbol: 'restaurant', title: slot.name}), ...slot,
      done: !!slot.meal, line: {kind: slot.meal ? 'meal' : 'unlogged', text: slot.label.split(' · ').slice(1).join(' · ')}});
  }
  for (const due of deadlines) {
    const overdue = due.at < now;
    rows.push(item('deadline', 'due:' + due.id, due.at, due.at, {symbol: 'hourglass_bottom', title: due.title, overdue,
      when: {kind: overdue ? 'late' : 'time', text: `${overdue ? 'Overdue' : 'Due'} ${gutterTime(due.at)}`},
      label: `${overdue ? 'Overdue' : 'Due'} · ${due.title}`}));
  }
  return rows;
}

/** The one line under the title: a clash wins, then Not done, then the Result (or a Routine's count). */
function lineFor(row, events, now) {
  if (row.kind === 'task' && !row.done) {
    const clash = row.end > row.start && events.find(e => e.end > e.start && e.start < row.end && row.start < e.end);
    if (clash) return {kind: 'clash', text: `Clash with ${clash.title}`, with: clash};
    if (row.end <= now) return {kind: 'late', text: 'Not done'};
  }
  if (row.kind === 'routine') return {kind: row.missed ? 'late' : 'count', text: row.count};
  if (row.kind === 'task') return row.task.result ? {kind: 'result', text: row.task.result, tone: row.task.tone ?? 'neutral'} : null;
  return null;
}

/** The line over the title: how soon the next item starts, how long is left of the one in progress, else its times. */
function whenFor(row, now) {
  if (row.current) return {kind: 'now', text: `Now · ${duration(Math.max(1, Math.ceil((row.end - now) / MIN)))} left`};
  if (row.next) return {kind: 'soon', text: row.soon};
  return {kind: 'time', text: spanWords(row.start, row.end)};
}

const keyByFixedEdge = (start, end, now) => (end === now ? 'gap:from:' + start : 'gap:to:' + end);

/** Free time between the fixed rows, cut where a small row or now falls, kept where it lasts 10 min or more. */
function freeRows(blocks, marks, {from, to, now, live}) {
  const free = [];
  let cursor = from;
  for (const block of blocks.filter(row => row.end > row.start).sort((a, b) => a.start - b.start)) {
    if (block.start > cursor) free.push([cursor, block.start]);
    cursor = Math.max(cursor, block.end);
  }
  if (to > cursor) free.push([cursor, to]);
  const rows = [];
  for (const [a, b] of free) {
    const cuts = [...marks.map(m => m.start), ...(live ? [now] : [])].filter(t => t > a && t < b);
    const points = [a, ...new Set(cuts.sort((x, y) => x - y)), b];
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1], end = points[i], minutes = minutesBetween(start, end);
      if (minutes < FREE_MINUTES) continue;
      const past = end <= now;
      rows.push({kind: 'gap', key: keyByFixedEdge(start, end, now), start, end, minutes, height: gapHeight(minutes), past,
        time: gutterTime(start), label: `${duration(minutes)} free`,
        plan: past || minutes < PLAN_MINUTES ? null : Math.max(start, Math.ceil(now / (15 * MIN)) * 15 * MIN)});
    }
  }
  return rows;
}

/**
 * `tasks` carry `start` (ms or null), `minutes`, `done`, `must`, `result` and `tone`; `events` are timed calendar
 * events; `routines` carry their day's `state` and `progress`; `mealPlan` is `planner.body.mealPlan`; `window` is the
 * water window, which also bounds the day's free time. `live` is true on today.
 */
export function buildSpine({day, now, live = true, tasks = [], events = [], routines = [], meals = [], mealPlan = null,
  deadlines = [], window = WATER_DEFAULTS}) {
  const eventRows = events.map(event => item('event', 'event:' + (event.id ?? event.title + event.start), event.start, event.end,
    {title: event.title, event, symbol: 'event'}));
  const blocks = [...eventRows, ...routineRows(day, routines), ...taskRows(tasks)];
  const marks = markRows({day, now, live, meals, mealPlan, deadlines});
  const starts = [...blocks, ...marks].map(r => r.start), ends = [...blocks, ...marks].map(r => r.end);
  const from = Math.min(+atMinutes(day, minutesOf(window.from ?? '08:00')), ...starts);
  const to = Math.max(+atMinutes(day, minutesOf(window.until ?? '22:00')), ...ends);

  for (const row of blocks) {
    row.past = row.end <= now;
    row.current = live && row.start <= now && now < row.end;
    row.line = lineFor(row, events, now);
  }
  for (const row of marks) row.past = row.kind === 'meal' ? row.past || (!!row.meal && row.end < now) : row.end < now;
  const current = blocks.filter(r => r.current);
  const next = live ? blocks.filter(r => r.start > now && !r.done).sort((a, b) => a.start - b.start)[0] : null;
  if (next) Object.assign(next, {next: true, soon: soonText(next.start - now)});
  for (const row of blocks) row.when = whenFor(row, now);
  for (const row of marks) row.when ??= {kind: 'time', text: gutterTime(row.start)};

  const rows = [...blocks, ...marks, ...freeRows(blocks, marks, {from, to, now, live})];
  if (live && !current.length) rows.push({kind: 'now', key: 'now', start: now, end: now, time: gutterTime(now), label: clockText(now)});
  rows.sort((a, b) => a.start - b.start || RANK[a.kind] - RANK[b.kind] || a.end - b.end);
  const shown = row => row.gutter?.time ?? row.time;
  rows.forEach((row, i) => { row.sameTime = i > 0 && shown(rows[i - 1]) === shown(row); });

  const anytime = anytimeTasks(tasks.filter(t => t.start == null));
  return {
    rows,
    anytime,
    nowKey: live ? (current[0]?.key ?? 'now') : null,
    empty: !tasks.length && !events.length,
    shape: [...rows.map(r => `${r.key}:${r.past ? 1 : 0}${r.current ? 1 : 0}${r.next ? 1 : 0}${r.line?.kind ?? ''}`),
      ...anytime.map(t => `${t.key}:${t.done ? 1 : 0}`)].join('|'),
  };
}

/** Tasks dated for the day without a time, open ones first: the chips above the timeline. */
function anytimeTasks(untimed) {
  return untimed.map(task => ({kind: 'task', key: 'task:' + task.id + (task.occurrence ?? ''), title: task.title, task,
    done: !!task.done, must: !!task.must, symbol: taskSymbol(task.title), tone: task.tone ?? 'neutral'}))
    .sort((a, b) => a.done - b.done);
}

/** "2 tasks anytime today": the chip strip's accessible name. */
export const anytimeLabel = (anytime, live) => {
  const open = anytime.filter(t => !t.done).length;
  return open ? `${plural(open, 'task')} anytime ${live ? 'today' : 'this day'}` : `${plural(anytime.length, 'task')} done, no time set`;
};
