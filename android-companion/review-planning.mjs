import {planner, tasks, blockTasks, blockDue, editPlan, shiftDay, localDay} from './planner-state.mjs';
import {repeats} from './planner-recurrence.mjs';
import {checkDay, taskDate, dueAt} from './review-dates.mjs';

export const oneOff = rows => rows.filter(t => !repeats(t));

/* ---------- capacity: Must time against free time (read-only calendar) ---------- */
/** Waking hours assumed when counting free time: 8 AM to 10 PM. The review states this wherever it shows free time. */
export const WAKING = [8, 22];
const busyEvents = events => (events ?? []).filter(e => e.busy !== false && !e.allDay && +e.end > +e.start);
const dayStart = time => { const d = new Date(time); d.setHours(0, 0, 0, 0); return d; };

/** Free minutes in [from, to): waking hours minus busy calendar events, overlaps counted once. */
export function freeMinutes(events, from, to, waking = WAKING) {
  const busy = busyEvents(events).map(e => [+e.start, +e.end]).sort((a, b) => a[0] - b[0]);
  let total = 0;
  for (let day = dayStart(from); day < to; day.setDate(day.getDate() + 1)) {
    const open = new Date(day).setHours(waking[0]), close = new Date(day).setHours(waking[1]);
    const a = Math.max(+from, open), b = Math.min(+to, close);
    if (b <= a) continue;
    let free = b - a, edge = a;
    for (const [s, e] of busy) {
      const start = Math.max(s, edge), end = Math.min(e, b);
      if (end > start) { free -= end - start; edge = end; }
    }
    total += free;
  }
  return Math.round(total / 60000);
}

/** Busy calendar events that overlap each other within [from, to): {day, a, b}, earliest first. */
export function calendarClashes(events, from, to) {
  const rows = busyEvents(events).filter(e => +e.end > +from && +e.start < +to).sort((x, y) => x.start - y.start || x.end - y.end);
  const clashes = [];
  rows.forEach((a, i) => {
    for (const b of rows.slice(i + 1)) if (+b.start < +a.end) clashes.push({day: localDay(new Date(+b.start)), a, b});
  });
  return clashes;
}

/**
 * Whether each picked Result's Must work fits before its own deadline. One row per Result, in deadline order (no
 * deadline: the end of the week), with the same deadline and Must minutes its card shows. `need` adds the Must time
 * of Results due at or before it, since that work has to happen first; it is compared with the free time from now
 * until the deadline. `events` is null when the calendar isn't connected: Must time is still shown, free time isn't.
 * `placed` lists the dated open Musts ({day, minutes}); `days` runs from today to the week's Sunday with each day's
 * free time, Must time already on it, deadlines and clashes.
 */
export function weekCapacity(chosen, events, week, now = new Date(), placed = []) {
  const end = new Date(shiftDay(checkDay(week), 7) + 'T00:00');
  const rows = chosen.map(c => ({blockId: c.blockId, title: c.title, value: c.due ?? null, at: c.due ? dueAt(c.due) : end, must: c.mustMinutes}))
    .sort((a, b) => a.at - b.at);
  for (const row of rows) {
    row.need = rows.filter(r => r.at <= row.at).reduce((sum, r) => sum + r.must, 0);
    row.free = events ? (row.at > now ? freeMinutes(events, now, row.at) : 0) : null;
    row.overdue = !!row.value && row.at <= now;
    row.over = row.overdue || (row.free != null && row.need > row.free);
    row.tight = !row.over && row.free != null && row.need > row.free / 2;
  }
  const clashes = events ? calendarClashes(events, now, end) : [];
  const days = [];
  for (let day = localDay(now); day < shiftDay(week, 7); day = shiftDay(day, 1)) {
    const from = new Date(day + 'T00:00'), to = new Date(shiftDay(day, 1) + 'T00:00');
    const here = rows.filter(r => r.value && r.at >= from && r.at < to);
    days.push({
      day,
      free: events ? freeMinutes(events, new Date(Math.max(+now, +from)), to) : null,
      must: placed.filter(p => p.day === day).reduce((sum, p) => sum + (p.minutes ?? 0), 0),
      deadlines: here.length,
      over: here.some(r => r.over),
      clash: clashes.some(c => c.day === day),
    });
  }
  return {rows, days, clashes, must: rows.reduce((sum, r) => sum + r.must, 0)};
}

const openMusts = (data, blockId) => oneOff(blockTasks(data, blockId)).filter(t => t.must && !t.done);
/** The picked Results' open Musts that already have a day: where the week's Must time sits. */
export function placedMusts(data, blockIds) {
  return blockIds.flatMap(id => openMusts(data, id)).map(t => ({taskId: t.id, day: taskDate(t)?.slice(0, 10) ?? null, minutes: t.minutes ?? 0}))
    .filter(p => p.day);
}

/**
 * A proposal, not a change: each undated open Must of a picked Result that has a deadline, with the day before that
 * deadline (from today, at the latest the week's Sunday) that has the most free time left once the Musts already on
 * it are counted. Results without a deadline are left alone, since a dated task would become their deadline.
 */
export function mustPlacements(data, blockIds, events, week, now = new Date()) {
  const today = localDay(now), last = shiftDay(checkDay(week), 6);
  const load = new Map();
  for (const p of placedMusts(data, blockIds)) load.set(p.day, (load.get(p.day) ?? 0) + p.minutes);
  const left = day => freeMinutes(events ?? [], new Date(Math.max(+now, +new Date(day + 'T00:00'))), new Date(shiftDay(day, 1) + 'T00:00')) - (load.get(day) ?? 0);
  const due = blockIds.map(id => ({id, value: blockDue(data, id)?.value})).filter(b => b.value).sort((a, b) => dueAt(a.value) - dueAt(b.value));
  const out = [];
  for (const {id, value} of due) {
    const stop = [shiftDay(value.slice(0, 10), -1), last].sort()[0];
    for (const task of openMusts(data, id).filter(t => !taskDate(t))) {
      let best = null;
      for (let day = today; day <= stop; day = shiftDay(day, 1)) if (!best || left(day) > left(best)) best = day;
      if (!best) continue;
      load.set(best, (load.get(best) ?? 0) + (task.minutes ?? 0));
      out.push({taskId: task.id, title: task.title ?? task.raw, blockId: id, day: best, minutes: task.minutes ?? null});
    }
  }
  return out;
}

/** Gives each proposed Must its day, as one change with one Undo. */
export function placeMusts(data, placements) {
  if (!placements.length) throw new Error('Nothing to place.');
  let undo = null;
  for (const p of placements) {
    editPlan(data, {type: 'saveTask', id: p.taskId, fields: {plannedDate: checkDay(p.day)}});
    undo ??= planner(data).undo;
  }
  data.planner.undo = undo;
  return placements.length === 1 ? 'Must given a day' : `${placements.length} Musts given a day`;
}

/* ---------- step 3: which Result an Inbox task most likely serves ---------- */
const STOP = new Set(('a an the and or but for with from that this into onto about again your our my me we us you it its is be am are was '
  + 'on in at to of by as up so do get got new make made ready done all any some one two out off how what which who when why there then than '
  + 'just more most each per vs via also before after over under can will need not no').split(' '));
export const words = text => new Set((String(text ?? '').toLowerCase().match(/[a-z][a-z0-9]+/g) ?? []).filter(w => !STOP.has(w)));

/**
 * Results ranked by how likely `task` serves them: shared words with the Result (counted three times), its Purpose
 * and its tasks, rarer words weighing more. `suggested` is the top one only when it shares a word with the Result
 * itself and clearly leads; no guess otherwise.
 */
export function rankResults(data, task, candidates) {
  const fields = candidates.map(c => [
    [words(c.title), 3], [words(c.purpose), 1], [words(blockTasks(data, c.blockId).filter(t => t.id !== task.id).map(t => t.title).join(' ')), 1]]);
  const df = new Map();
  for (const f of fields) for (const w of new Set(f.flatMap(([set]) => [...set]))) df.set(w, (df.get(w) ?? 0) + 1);
  const mine = words(task.title ?? task.raw);
  const ranked = candidates.map((c, i) => {
    let score = 0, named = false;
    for (const w of mine) {
      const weight = Math.max(0, ...fields[i].filter(([set]) => set.has(w)).map(([, n]) => n));
      if (weight) score += weight * Math.log(1 + candidates.length / df.get(w));
      named ||= weight === 3;
    }
    return {...c, score, named};
  });
  const order = [...ranked].sort((a, b) => b.score - a.score); // stable: ties keep the deadline order
  const [top, next] = order;
  return {ranked: order, suggested: top?.named && top.score >= 4 && top.score >= 1.5 * (next?.score ?? 0) ? top : null};
}

/* ---------- calendar clash: the review can't move events, so the decision becomes a task on Today ---------- */
const clashDay = day => new Date(day + 'T12:00').toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'});
/** A stable key for a clash, for remembering the decision in review progress. */
export const clashKey = ({day, a, b}) => `${day}|${a.title}|${b.title}`;
const sides = (clash, keep) => (keep === 'b' ? [clash.b, clash.a] : [clash.a, clash.b]);
/** "Keep DAD exam; move or skip GWBC session": what the decision leaves to do. */
export const clashDecision = (clash, keep) => { const [stays, other] = sides(clash, keep); return `keep ${stays.title}, move or skip ${other.title}`; };
export const clashTitle = (clash, keep = 'a') => `${clashDay(clash.day)} clash: ${clashDecision(clash, keep)}`;
const DECIDED = 'Decided in the weekly review: ';
/** An open task that already deals with the clash: one the review wrote, or one naming "clash" and both events. */
export function clashTask(data, clash) {
  const first = title => String(title).toLowerCase().split(/\s+/)[0];
  return tasks(data).find(t => !t.done && (t.title === clashTitle(clash, 'a') || t.title === clashTitle(clash, 'b')
    || (/clash/i.test(t.title ?? '') && [clash.a.title, clash.b.title].every(x => (t.title ?? '').toLowerCase().includes(first(x)))))) ?? null;
}
/**
 * Records which event stays (`keep` 'a' or 'b') as a task on Today, since calendars are read-only: the user's own
 * task that names the clash keeps its words and gains the decision in its notes; otherwise a new 15-minute task says it.
 */
export function decideClash(data, clash, keep, now = new Date()) {
  const existing = clashTask(data, clash);
  const note = DECIDED + clashDecision(clash, keep) + '.';
  const notes = [...String(existing?.notes ?? '').split('\n\n').filter(p => p && !p.startsWith(DECIDED)), note].join('\n\n');
  const fields = {notes};
  if (!existing || !taskDate(existing)) fields.plannedDate = localDay(now);
  if (!existing) Object.assign(fields, {title: clashTitle(clash, keep), minutes: 15});
  else if (existing.title === clashTitle(clash, keep === 'b' ? 'a' : 'b')) fields.title = clashTitle(clash, keep);
  editPlan(data, existing ? {type: 'saveTask', id: existing.id, fields} : {type: 'saveTask', fields}, now);
  return 'Decision added to Today';
}
