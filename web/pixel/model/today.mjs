/** Today as one ordered agenda: the lead task, then tasks, routines, meals and water by time, with the free gaps. */
import {atMinutes, minutesOf, routineOn, routineRowParts, waterStatus, waterRowParts, joinParts} from '../../../android-companion/body-state.mjs';
import {mealSlots} from '../../../android-companion/day-parts.mjs';
import {clock, countdown, longDate} from '../../../android-companion/planner/format.mjs';
import {localDay, dayOf, blockOf, resultFacts, inboxTasks} from './plan.mjs';

const GAP_MINUTES = 30;
const MIN = 60000;

export function waterToday(snapshot, now) {
  const {settings, glasses, snoozedUntil} = snapshot.body.water;
  const status = waterStatus({glasses, now, settings, snoozedUntil});
  return {...status, line: joinParts(waterRowParts(status).parts)};
}

export function mealsToday(snapshot, now) {
  const day = localDay(now);
  const todays = snapshot.body.meals.filter(m => localDay(m.at) === day);
  return mealSlots(todays, day, now, {plan: snapshot.body.mealPlan}).filter(m => m.slot !== 'snack' || m.meal);
}

function routinesToday(snapshot, now) {
  const day = localDay(now);
  return snapshot.body.routines.filter(r => !r.archived && routineOn(r, day)).flatMap(routine => {
    const stored = snapshot.body.runs.find(r => r.routineId === routine.id && r.day === day);
    const run = stored && {...stored, marks: Object.fromEntries(stored.marks.map(m => [m.stepId, m]))};
    const row = routineRowParts(routine, run, now);
    if (!row) return [];
    return [{kind: 'routine', routine, at: +atMinutes(day, minutesOf(routine.start)), end: +atMinutes(day, minutesOf(routine.end)),
      state: row.state, line: joinParts(row.parts)}];
  });
}

/** Free time between fixed things, from now on, at least half an hour. */
export function freeGaps(spans, now, dayEnd) {
  const gaps = [];
  let cursor = +now;
  for (const span of [...spans].sort((a, b) => a.at - b.at)) {
    if (span.at - cursor >= GAP_MINUTES * MIN) gaps.push({kind: 'free', at: cursor, end: span.at, minutes: Math.round((span.at - cursor) / MIN)});
    cursor = Math.max(cursor, span.end);
  }
  if (dayEnd - cursor >= GAP_MINUTES * MIN) gaps.push({kind: 'free', at: cursor, end: dayEnd, minutes: Math.round((dayEnd - cursor) / MIN)});
  return gaps;
}

function lead(snapshot, focus, now) {
  if (!focus) return null;
  const current = focus.start <= +now;
  const block = blockOf(snapshot, focus.blockId);
  return {task: focus, current, block, facts: block ? resultFacts(snapshot, block, now) : null,
    label: current ? 'Now' : 'Do next', when: current ? `until ${clock(focus.end)}` : countdown(new Date(focus.start), now)};
}

export function today(snapshot, now) {
  const day = localDay(now);
  const {active, completed, focus} = dayOf(snapshot, day, now);
  const tasks = [
    ...active.filter(t => t.start && t !== focus).map(task => ({kind: 'task', task, at: task.start, end: task.end})),
    ...completed.filter(t => t.planned).map(task => ({kind: 'task', task, done: true, at: +new Date(task.occurrence ?? task.planned)})),
  ];
  const routines = routinesToday(snapshot, now);
  const water = waterToday(snapshot, now);
  const meals = mealsToday(snapshot, now);
  const timed = [
    ...tasks, ...routines,
    {kind: 'water', water, at: +atMinutes(day, minutesOf(snapshot.body.water.settings.from))},
    ...meals.map(meal => ({kind: 'meal', meal, at: meal.at})),
  ];
  const spans = [...active.filter(t => t.start), ...routines.map(r => ({start: r.at, end: r.end}))]
    .map(s => ({at: s.start, end: s.end}));
  const dayEnd = +atMinutes(day, minutesOf(snapshot.body.water.settings.until));
  const agenda = [...timed, ...freeGaps(spans, now, dayEnd)].sort((a, b) => a.at - b.at || (a.kind === 'free') - (b.kind === 'free'));
  return {
    day, date: longDate(day), lead: lead(snapshot, focus, now), agenda,
    anytime: active.filter(t => !t.start), water, meals, inbox: inboxTasks(snapshot).length,
  };
}
