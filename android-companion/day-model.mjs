/**
 * Today's "Day" layout as data: the whole day to scale, from the first routine (or 8 AM) to the last item (or the end
 * of the water window), with every item placed, the free gap at now and the one item to do next.
 */
import {clockText, atMinutes, minutesOf} from './body-state.mjs';
import {HOUR, openHours, segments, positionAt, assignLanes} from './planner/day-geometry.mjs';
import {
  MIN, hourLabel, spanText, routineMeta, freeGap, fitUntimed, doNext, missedNudges, mealSlots, taskWords,
} from './day-parts.mjs';

/** Shortest drawn height per kind, in px; enlarged text needs taller rows. */
const MIN_PX = {task: 44, flagged: 64, event: 44, routine: 64, water: 32, meal: 40, deadline: 40, chip: 32};
const MIN_PX_LARGE = {task: 56, flagged: 96, event: 56, routine: 96, water: 104, meal: 104, deadline: 96, chip: 48};
const plural = (count, one) => `${count} ${count === 1 ? one : one + 's'}`;

/** The day's hours: from the first routine or 8 AM, to the last item's end or the water window's end. */
export function dayBounds({base, routineStarts = [], items = [], until, early = false}) {
  const hours = time => (time - base) / HOUR;
  const starts = [...routineStarts, ...(early ? items.map(item => item.start) : [])];
  const from = Math.max(0, Math.min(8, ...starts.map(t => Math.floor(hours(t)))));
  const to = Math.min(24, Math.max(Math.ceil(hours(until)), ...items.map(item => Math.ceil(hours(item.end)))));
  return {from, to};
}

function collect({day, now, tasks, events, routines, water, meals, deadlines}) {
  const items = [];
  for (const task of tasks.filter(t => t.start != null)) {
    items.push({kind: 'task', key: 'task:' + task.id, start: task.start, end: task.start + (task.minutes ?? 30) * MIN, task});
  }
  for (const event of events) items.push({kind: 'event', key: 'event:' + event.id, start: event.start, end: event.end, event, time: spanText(event.start, event.end)});
  for (const routine of routines) {
    const start = +atMinutes(day, minutesOf(routine.start)), end = +atMinutes(day, minutesOf(routine.end));
    items.push({kind: 'routine', key: 'routine:' + routine.id, start, end, routine, time: spanText(start, end),
      meta: routineMeta(routine.state, routine.progress)});
  }
  const status = water.status;
  if (status.nextAt && !status.reached) {
    const due = +status.nextAt <= now, at = Math.max(+status.nextAt, now);
    items.push({kind: 'water', key: 'water', start: at, end: at,
      label: `Water · ${status.count} of ${status.goal} · ${due ? 'due now' : clockText(at)}`});
  }
  for (const slot of mealSlots(meals, day, now)) items.push({kind: 'meal', key: 'meal:' + slot.slot, start: slot.at, end: slot.at, ...slot});
  for (const due of deadlines) {
    const overdue = due.at < now && !due.achieved;
    items.push({kind: 'deadline', key: 'due:' + due.id, start: due.at, end: due.at, overdue,
      label: `${overdue ? 'Overdue' : 'Due'} · ${due.title} · ${clockText(due.at)}`});
  }
  return items.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** Flags that need the whole day: past, not done, clash and the one Do next. */
function markStates(items, now, next) {
  const events = items.filter(item => item.kind === 'event');
  for (const item of items) {
    item.past = item.kind === 'meal' ? item.past || (!!item.meal && item.end < now) : item.end <= now && item.kind !== 'water';
    if (item.kind === 'routine') item.missed = item.routine.state === 'missed';
    if (item.kind !== 'task') continue;
    const {task} = item;
    item.done = !!task.done;
    item.overdue = item.past && !task.done;
    item.clash = task.done ? null : events.find(e => e.start < item.end && item.start < e.end)?.event.title ?? null;
    item.flag = next?.id === task.id ? next.label : null;
    Object.assign(item, taskWords({...task, minutes: task.minutes ?? 30}, item));
  }
}

const BLOCKS = new Set(['task', 'event', 'routine']);

/**
 * Water, meals and deadlines are not commitments, so they don't squeeze a task into half its width. One that meets
 * the Do next or a clash goes below it; one that meets another block waits below it when that spot is free and within
 * the hour. Otherwise it shares the block's lanes.
 */
function placeMarkers(markers, blocks, y, minimum, size) {
  const collide = (top, h) => blocks.find(b => top < b.y + b.h && b.y < top + h);
  const stuck = [];
  let previous = -Infinity;
  for (const marker of markers) {
    const h = marker.h = minimum(marker.kind);
    let top = Math.max(y(marker.start), previous + 4);
    let hit = collide(top, h);
    while (hit?.flag || hit?.clash) {
      top = hit.y + hit.h + 4;
      hit = collide(top, h);
    }
    const below = hit ? hit.y + hit.h + 4 : top;
    if (hit && !collide(below, h) && below - top <= size) {
      top = below;
      hit = null;
    }
    marker.y = top;
    previous = top + h;
    if (hit) stuck.push(marker);
  }
  return stuck;
}

/** Place items: their y and height in px, then two lanes for boxes that overlap (one, stacked, with enlarged text). */
function place(items, layout, {base, size, large}) {
  const y = time => positionAt(layout, (time - base) / HOUR);
  const minimum = kind => (large ? MIN_PX_LARGE : MIN_PX)[kind];
  const least = item => (item.flag || item.clash ? minimum('flagged') : minimum(item.kind));
  for (const item of items) Object.assign(item, {lane: 0, lanes: 1, hidden: false});
  const blocks = large ? items : items.filter(item => BLOCKS.has(item.kind));
  let bottom = -Infinity;
  for (const item of blocks) {
    item.y = y(item.start);
    item.h = Math.max(least(item), y(item.end) - item.y - 2);
    if (large) item.y = Math.max(item.y, bottom + 4);
    bottom = Math.max(bottom, item.y + item.h);
  }
  if (large) return [];
  const stuck = placeMarkers(items.filter(item => !BLOCKS.has(item.kind)), blocks, y, minimum, size);
  const rows = [...blocks, ...stuck].map(item => ({item, start: item.y, visualEnd: item.y + item.h})).sort((a, b) => a.start - b.start);
  const {more} = assignLanes(rows, {maxLanes: 2});
  for (const {item, lane, lanes, hidden} of rows) Object.assign(item, {lane, lanes, hidden});
  return more.map(group => {
    const members = group.rows.map(row => row.item), first = members.find(item => item.hidden);
    let top = first.y;
    for (const item of members.filter(i => i.lane === 1).sort((a, b) => a.y - b.y)) {
      if (item.y < top + minimum('chip') && top < item.y + item.h) top = item.y + item.h + 4;
    }
    return {start: first.start, count: group.count, y: top, keys: members.map(item => item.key), label: `+${group.count} more`};
  });
}

export function buildDay(input) {
  const {day, now, tasks = [], events = [], routines = [], water, size = 96, large = false, early = false} = input;
  const base = +atMinutes(day, 0);
  const hours = time => (time - base) / HOUR;
  const next = doNext(tasks.map(t => ({...t, end: t.start == null ? null : t.start + (t.minutes ?? 30) * MIN})), now);
  const all = collect({...input, tasks, events, routines, meals: input.meals ?? [], deadlines: input.deadlines ?? []});
  const until = +atMinutes(day, minutesOf(water.settings.until));
  const {from, to} = dayBounds({base, routineStarts: all.filter(i => i.kind === 'routine').map(i => i.start), items: all, until, early});
  const inside = item => hours(item.start) >= from && hours(item.start) < to;
  const items = all.filter(inside);
  const outside = all.length - items.length;
  markStates(items, now, next);

  const spans = items.map(item => ({start: hours(item.start), end: hours(item.end)}));
  const layout = segments(openHours(spans, {from, to, now: hours(now), fallback: null}), {from, to, size});
  const more = place(items, layout, {base, size, large});
  const y = time => positionAt(layout, hours(time));
  const nowY = Math.min(layout.height, y(now));

  const blocking = items.filter(i => i.kind === 'event' || i.kind === 'routine' || (i.kind === 'task' && !i.done));
  const untimed = tasks.filter(t => t.start == null);
  const gap = untimed.some(t => !t.done) ? freeGap(now, blocking, base + to * HOUR) : null;
  const fit = gap ? fitUntimed(untimed, gap) : {slots: [], rest: untimed};
  let insert = null;
  if (fit.slots.length) {
    const plan = fitUntimed(fit.slots.map(slot => slot.task).filter(t => !t.done), gap).slots, n = plan.length;
    insert = {start: gap.start, end: gap.end, rows: fit.slots.map(slot => slot.task), slots: plan,
      header: `Free until ${clockText(gap.end)}${n ? ` · ${plural(n, 'task')} with no time` : ''}`,
      words: n ? `Schedule ${n > 1 ? 'from' : 'at'} ${clockText(plan[0].start)}` : null,
      y: Math.max(nowY, ...items.filter(i => i.start < now).map(i => i.y + i.h + 4))};
  }
  const after = top => !!insert && top >= insert.y;
  for (const item of items) item.afterInsert = !!insert && item.start >= now;
  for (const group of more) group.afterInsert = !!insert && group.start >= now;

  const lines = [], folds = [];
  for (const s of layout.list) {
    if (s.open) lines.push({y: s.y, label: hourLabel(s.from), hidden: Math.abs(s.from - hours(now)) < 0.2, afterInsert: after(s.y)});
    else folds.push({y: s.y, label: `${hourLabel(s.from)} – ${hourLabel(s.to)} · ${plural(s.to - s.from, 'free hour')}`, afterInsert: after(s.y)});
  }
  const dots = [...water.glasses.map(at => ({at: +at, kind: 'drunk'})),
    ...missedNudges({glasses: water.glasses, day, settings: water.settings, now, busy: water.busy}).map(at => ({at, kind: 'missed'}))]
    .filter(dot => hours(dot.at) >= from && hours(dot.at) < to).map(dot => ({...dot, y: y(dot.at)}));

  const last = items.reduce((low, item) => (item.y + item.h > (low?.y ?? 0) + (low?.h ?? 0) ? item : low), null);
  const height = Math.max(layout.height, last ? last.y + last.h + 8 : 0);
  const allDone = tasks.length > 0 && tasks.every(t => t.done);
  return {
    day, from, to, layout, height, items, more, insert, lines, folds, dots,
    now: {y: nowY, label: clockText(now), time: clockText(now).replace(/ [AP]M$/, '')},
    early: outside && !early ? {label: `Before ${hourLabel(from)} · ${plural(outside, 'item')}`} : null,
    anytime: fit.rest, empty: !tasks.length && !events.length, doNext: next,
    allDone: allDone ? {y: height, afterInsert: !!last?.afterInsert} : null,
  };
}
