/**
 * Today's spine as data: every item of the day in time order, hung off one line. Tasks, calendar events and Routines
 * are cards whose height follows their length (tamed); water, meals and deadlines are small rows; free time of 45 min
 * or more is its own row; now is either the item in progress (the hero) or a line between rows.
 */
import {clockText, atMinutes, minutesOf, WATER_DEFAULTS} from './body-state.mjs';
import {duration} from './planner/format.mjs';
import {MIN, gutterTime, routineMeta, mealSlots} from './day-parts.mjs';

export const FREE_MINUTES = 45;
/** Card heights in dp: 56 up to 30 min, then 24 more for each full extra half hour, never above 160. */
export const cardHeight = minutes => Math.min(160, 56 + 24 * Math.max(0, Math.floor((minutes - 30) / 30)));
/** Free-time heights in dp: 32, then 8 more for each full half hour, never above 96. */
export const gapHeight = minutes => Math.min(96, 32 + 8 * Math.floor(minutes / 30));
/** At one start time: now first, then fixed things, then yours, then the small rows, then free time. */
const RANK = {now: 0, event: 1, routine: 2, task: 3, deadline: 4, meal: 5, water: 6, gap: 7};
const BLOCKS = new Set(['task', 'event', 'routine']);
const plural = (count, one) => `${count} ${count === 1 ? one : one + 's'}`;
const minutesBetween = (a, b) => Math.round((b - a) / MIN);

/** How soon the next card starts, short enough for the gutter: "in 40 min", then whole hours ("in 4 h"). */
export function soonText(ms) {
  const minutes = Math.max(1, Math.ceil(ms / MIN));
  return minutes < 60 ? `in ${minutes} min` : `in ${Math.round(minutes / 60)} h`;
}

function card(kind, key, start, end, extra) {
  const minutes = Math.max(0, minutesBetween(start, end));
  return {kind, key, start, end, minutes, height: cardHeight(minutes),
    gutter: {time: gutterTime(start), length: minutes ? duration(minutes) : null}, ...extra};
}

function taskCards(tasks) {
  return tasks.filter(t => t.start != null).map(task => card('task', 'task:' + task.id + (task.occurrence ?? ''),
    task.start, task.start + (task.minutes ?? 0) * MIN, {title: task.title, task, done: !!task.done, must: !!task.must}));
}

function routineCards(day, routines) {
  return routines.map(routine => {
    const start = +atMinutes(day, minutesOf(routine.start)), end = +atMinutes(day, minutesOf(routine.end));
    const finished = routine.progress.total > 0 && routine.progress.open === 0;
    return card('routine', 'routine:' + routine.id, start, end, {title: routine.name, routine, done: finished,
      progress: routine.progress, count: routineMeta(routine.state, routine.progress), missed: routine.state === 'missed'});
  });
}

function waterRow(water, now) {
  const {status} = water, settings = {...WATER_DEFAULTS, ...water.settings};
  const quiet = settings.reminders === false || status.reached || !status.nextAt;
  const at = quiet ? +(status.lastAt ?? now) : Math.max(+status.nextAt, now);
  const due = !quiet && +status.nextAt <= now;
  return {kind: 'water', key: 'water', start: at, end: at, time: gutterTime(at), count: status.count, goal: status.goal,
    due, reached: status.reached, label: `Water · ${status.count} of ${status.goal}`};
}

function markRows({day, now, live, water, meals, mealPlan, deadlines}) {
  const rows = [];
  if (live && water?.status) rows.push(waterRow(water, now));
  for (const slot of mealSlots(meals, day, now, {placeholders: live, plan: mealPlan})) {
    rows.push({kind: 'meal', key: 'meal:' + slot.slot, start: slot.at, end: slot.at, time: gutterTime(slot.at), ...slot});
  }
  for (const due of deadlines) {
    const overdue = due.at < now;
    rows.push({kind: 'deadline', key: 'due:' + due.id, start: due.at, end: due.at, time: gutterTime(due.at), overdue,
      label: `${overdue ? 'Overdue' : 'Due'} · ${due.title}`});
  }
  return rows;
}

/** The one supporting line: a clash wins, then Not done, then Now, then the Area dot and Result. */
function lineFor(row, events, now, live) {
  if (row.kind === 'task' && !row.done) {
    const clash = row.end > row.start && events.find(e => e.end > e.start && e.start < row.end && row.start < e.end);
    if (clash) return {kind: 'clash', text: `Clash with ${clash.title}`, with: clash};
    if (row.end <= now) return {kind: 'late', text: 'Not done'};
  }
  const current = live && row.start <= now && now < row.end;
  if (row.kind === 'routine') return {kind: current ? 'now' : 'count', text: current ? `Now · ${row.count}` : row.count};
  if (current) return {kind: 'now', text: `Now · until ${clockText(row.end)}`};
  if (row.kind === 'task') return {kind: 'result', text: row.task.result ?? 'No block', tone: row.task.tone ?? 'neutral'};
  return null;
}

function hoursInside(start, end) {
  const hour = new Date(start);
  hour.setMinutes(0, 0, 0);
  const found = [];
  for (hour.setHours(hour.getHours() + 1); +hour < end; hour.setHours(hour.getHours() + 1)) found.push(+hour);
  return found;
}

const keyByFixedEdge = (start, end, now) => (end === now ? 'gap:from:' + start : 'gap:to:' + end);

/** Free time between the fixed rows, cut where a small row or now falls, kept where it lasts 45 min or more. */
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
      const ticks = hoursInside(start, end).map(t => (t - start) / (end - start));
      rows.push({kind: 'gap', key: keyByFixedEdge(start, end, now), start, end, minutes, height: gapHeight(minutes), past, ticks,
        time: gutterTime(start), label: `${duration(minutes)} free`,
        plan: past ? null : Math.max(start, Math.ceil(now / (15 * MIN)) * 15 * MIN)});
    }
  }
  return rows;
}

function elapsed(row, now) {
  const done = Math.max(0, Math.floor((now - row.start) / MIN)), left = Math.max(1, Math.ceil((row.end - now) / MIN));
  return {fraction: Math.min(1, (now - row.start) / (row.end - row.start)),
    in: done ? `${duration(done)} in` : 'Just started', left: `${duration(left)} left`};
}

/**
 * `tasks` carry `start` (ms or null), `minutes`, `done`, `must`, `result` and `tone`; `events` are timed calendar
 * events; `routines` carry their day's `state` and `progress`; `mealPlan` is `planner.body.mealPlan`. `live` is true on
 * today.
 */
export function buildSpine({day, now, live = true, tasks = [], events = [], routines = [], water = null, meals = [], mealPlan = null,
  deadlines = [], window = WATER_DEFAULTS}) {
  const eventCards = events.map(event => card('event', 'event:' + (event.id ?? event.title + event.start), event.start, event.end,
    {title: event.title, event}));
  const blocks = [...eventCards, ...routineCards(day, routines), ...taskCards(tasks)];
  const marks = markRows({day, now, live, water, meals, mealPlan, deadlines});
  const starts = [...blocks, ...marks].map(r => r.start), ends = [...blocks, ...marks].map(r => r.end);
  const from = Math.min(+atMinutes(day, minutesOf(window.from ?? '08:00')), ...starts);
  const to = Math.max(+atMinutes(day, minutesOf(window.until ?? '22:00')), ...ends);

  for (const row of blocks) {
    row.past = row.end <= now;
    row.current = live && row.start <= now && now < row.end;
    row.line = lineFor(row, events, now, live);
    if (row.current && row.kind !== 'routine') row.elapsed = elapsed(row, now);
  }
  for (const row of marks) row.past = row.kind === 'meal' ? row.past || (!!row.meal && row.end < now) : row.kind !== 'water' && row.end < now;
  const current = blocks.filter(r => r.current);
  const next = live ? blocks.filter(r => r.start > now && !r.done).sort((a, b) => a.start - b.start)[0] : null;
  if (next) Object.assign(next, {next: true, soon: soonText(next.start - now)});

  const rows = [...blocks, ...marks, ...freeRows(blocks, marks, {from, to, now, live})];
  if (live && !current.length) rows.push({kind: 'now', key: 'now', start: now, end: now, time: gutterTime(now), label: clockText(now)});
  rows.sort((a, b) => a.start - b.start || RANK[a.kind] - RANK[b.kind] || a.end - b.end);
  const shown = row => row.gutter?.time ?? row.time;
  rows.forEach((row, i) => { row.sameTime = i > 0 && shown(rows[i - 1]) === shown(row); });

  const nowKey = live ? (current[0]?.key ?? 'now') : null;
  const anytime = anytimeRow(tasks.filter(t => t.start == null), live);
  if (anytime) rows.splice(nowKey ? rows.findIndex(r => r.key === nowKey) + 1 : 0, 0, anytime);
  return {
    rows,
    nowKey,
    empty: !tasks.length && !events.length,
    shape: rows.map(r => `${r.key}:${r.past ? 1 : 0}${r.current ? 1 : 0}${r.next ? 1 : 0}${r.line?.kind ?? ''}${r.tasks?.length ?? ''}`).join('|'),
  };
}

/**
 * Tasks dated for the day without a time: one group of cards under "Anytime", right after now (where Today opens) or
 * first on another day, so a task planned for today is never only behind a chip or in the Inbox count.
 */
function anytimeRow(untimed, live) {
  if (!untimed.length) return null;
  const open = untimed.filter(t => !t.done).length;
  return {kind: 'anytime', key: 'anytime', time: 'Anytime', past: false,
    label: open ? `${plural(open, 'task')} ${live ? 'for today' : 'for this day'}, no time set` : `${plural(untimed.length, 'task')} done, no time set`,
    tasks: untimed.map(task => ({kind: 'task', key: 'task:' + task.id + (task.occurrence ?? ''), title: task.title, task,
      done: !!task.done, must: !!task.must, gutter: {time: 'Anytime', length: task.minutes ? duration(task.minutes) : null},
      line: {kind: 'result', text: task.result ?? 'No block', tone: task.tone ?? 'neutral'}}))};
}

export const isBlock = row => BLOCKS.has(row.kind);
