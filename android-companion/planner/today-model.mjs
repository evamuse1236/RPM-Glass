/** Today's rules as data: what is due soon, what clashes, what is at risk, and the free time for the lead card. */
import {localDay, shiftDay, planner, blockTasks, blockDue, conflicts} from '../planner-state.mjs';
import {repeats} from '../planner-recurrence.mjs';
import {dayTasks} from '../planner-ux.mjs';
import {dueInfo} from './format.mjs';

const DUE_DAYS = 3, RISK_DAYS = 2, GAP_MINUTES = 30;
/** Midnight after the `days`-th day from today: 0 is tonight, 1 the end of tomorrow. */
const dayEnd = (now, days) => new Date(shiftDay(localDay(now), days + 1) + 'T00:00');
export const openResults = data => planner(data).blocks.filter(block => !block.archived && block.achieved !== true);

/** Open Results whose deadline falls before the end of the third day from today (or has passed), soonest first. */
export function dueSoon(data, now = new Date()) {
  const until = dayEnd(now, DUE_DAYS);
  return openResults(data)
    .map(block => ({block, due: dueInfo(blockDue(data, block.id)?.value, now)}))
    .filter(({due}) => due && due.at < until)
    .sort((a, b) => a.due.at - b.due.at);
}

/** A task that starts with an event and shares a distinctive word ("Sit RM Quiz I", "RM Quiz I in class") is that event. */
const words = text => new Set(text.toLowerCase().match(/[a-z]{4,}/g) ?? []);
const mirrors = (task, event) => task.source === 'rpm' && task.start === event.start
  && [...words(task.title)].some(word => words(event.title).has(word));

/** Busy commitments overlapping between `from` and `until`, joined so a crowded morning is one clash: [{items}] by start. */
export function clashes(data, calendar, from, until) {
  const found = [], id = item => `${item.source ?? 'calendar'}:${item.id}:${item.occurrence ?? ''}`;
  for (const event of calendar) {
    if (event.allDay || event.busy === false || event.end <= +from || event.start >= +until) continue;
    for (const other of conflicts(data, event.start, (event.end - event.start) / 60000, calendar)) {
      if (other.allDay || id(other) === id(event) || mirrors(other, event)) continue;
      const joined = found.filter(c => c.ids.has(id(event)) || c.ids.has(id(other)));
      const clash = joined[0] ?? {ids: new Set(), items: []};
      if (!joined.length) found.push(clash);
      for (const extra of joined.slice(1)) {
        extra.items.forEach(item => clash.items.push(item));
        extra.ids.forEach(key => clash.ids.add(key));
        found.splice(found.indexOf(extra), 1);
      }
      for (const item of [event, other]) if (!clash.ids.has(id(item))) { clash.ids.add(id(item)); clash.items.push(item); }
    }
  }
  return found.map(({items}) => ({items: items.sort((a, b) => a.start - b.start || a.end - b.end)}));
}

/** The day a dated task is planned for; a repeating task always counts as planned. */
const plannedDay = task => (repeats(task) ? '9999-12-31' : task.planned ? localDay(task.planned) : task.plannedDate);
/** A Result's open tasks with no day yet, in Plan order. */
const undatedTasks = (data, blockId) => blockTasks(data, blockId)
  .filter(task => !task.done && !task.planned && !task.plannedDate && !repeats(task));

/**
 * What could go wrong soon, from the data only (never guessed), soonest first:
 * - clash: busy calendar events, or timed tasks and events, overlapping in the next three days (`items`, by start);
 * - unplanned: a Result due by the end of the day after tomorrow with open tasks and nothing planned from today until
 *   its deadline other than the task that sets it (`undated` lists its undated open tasks in Plan order; `task` is
 *   the first, the one "Add to today" dates);
 * - overdue: a Result whose deadline passed with tasks still open.
 */
export function atRisk(data, {calendar = [], now = new Date()} = {}) {
  const risks = clashes(data, calendar, now, dayEnd(now, DUE_DAYS))
    .map(({items}) => ({kind: 'clash', items, at: new Date(items[1].start)}));
  const day = localDay(now), until = dayEnd(now, RISK_DAYS);
  const today = new Set(dayTasks(data, day, +now).active.map(task => task.blockId));
  for (const block of openResults(data)) {
    const deadline = blockDue(data, block.id), due = dueInfo(deadline?.value, now);
    if (!due || due.at >= until) continue;
    const open = blockTasks(data, block.id).filter(task => !task.done);
    if (!open.length) continue;
    if (due.overdue) { risks.push({kind: 'overdue', at: due.at, block, due, left: open.length}); continue; }
    const ahead = open.some(task => task.id !== deadline.task.id && plannedDay(task) >= day);
    const undated = undatedTasks(data, block.id);
    if (today.has(block.id) || ahead || !undated.length) continue;
    risks.push({kind: 'unplanned', at: due.at, block, due, left: open.length, undated, task: undated[0]});
  }
  return risks.sort((a, b) => a.at - b.at);
}

/**
 * The next three days in one list, soonest first: every risk, then every other Result due in that window
 * (`kind: 'due'`), so each deadline appears once and the list is complete.
 */
export function upcoming(data, {calendar = [], now = new Date()} = {}) {
  const risks = atRisk(data, {calendar, now});
  const flagged = new Set(risks.map(risk => risk.block?.id));
  const due = dueSoon(data, now).filter(row => !flagged.has(row.block.id))
    .map(({block, due}) => ({kind: 'due', at: due.at, block, due}));
  return [...risks, ...due].sort((a, b) => a.at - b.at);
}

/**
 * Today's free time from now until the next fixed thing (a timed task or a busy event), starting on the next quarter
 * hour and ending at 10 PM when nothing else is fixed (the weekly review's free-time assumption). Null while something
 * is on now or when less than half an hour is left.
 */
export function freeGap(data, {calendar = [], now = new Date()} = {}) {
  // Same waking window as the weekly review's free time (8 AM-10 PM).
  const day = localDay(now), open = +new Date(day + 'T08:00'), close = +new Date(day + 'T22:00');
  const fixed = [...dayTasks(data, day, +now).active.filter(task => task.start),
    ...calendar.filter(event => !event.allDay && event.busy !== false && event.end > open && event.start < close)];
  if (fixed.some(item => item.start <= +now && item.end > +now)) return null;
  const start = Math.max(open, Math.ceil(+now / 9e5) * 9e5);
  const end = Math.min(close, ...fixed.filter(item => item.start > +now).map(item => item.start));
  return end - start >= GAP_MINUTES * 60000 ? {start: new Date(start), end: new Date(end)} : null;
}

/** The undated tasks (`{undated}`) that fit the gap back to back, in Plan order: [{task, start, end}]. */
export function fillGap({undated}, gap) {
  const slots = [];
  let at = +gap.start;
  for (const task of undated) {
    const end = at + (task.minutes ?? 30) * 60000;
    if (end > +gap.end) break;
    slots.push({task, start: new Date(at), end: new Date(end)});
    at = end;
  }
  return slots;
}

/**
 * Who gets the free time: the nearest deadline (overdue first, then due by the end of the day after tomorrow) whose
 * unscheduled tasks fit the gap, whether or not other work for it is planned. {block, due, slots} or null.
 */
export function gapResult(data, gap, now = new Date()) {
  const until = dayEnd(now, RISK_DAYS);
  for (const {block, due} of dueSoon(data, now)) {
    if (due.at >= until) break;
    const slots = fillGap({undated: undatedTasks(data, block.id)}, gap);
    if (slots.length) return {block, due, slots};
  }
  return null;
}
