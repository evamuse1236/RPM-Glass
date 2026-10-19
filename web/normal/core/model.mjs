/** What each screen shows, worked out from a snapshot with the phone's own rules (android-companion). */
import {localDay, shiftDay, blockDue, blockTasks} from '../../../android-companion/planner-state.mjs';
import {dayTasks} from '../../../android-companion/planner-ux.mjs';
import {upcoming} from '../../../android-companion/planner/today-model.mjs';
import {buildSpine} from '../../../android-companion/spine-model.mjs';
import {waterStatus, routineOn, routineState} from '../../../android-companion/body-state.mjs';
import {dueInfo, countdown, clock} from '../../../android-companion/planner/format.mjs';

const MIN = 60000;
const cache = new WeakMap();

/** The snapshot in the shape the phone's planner functions read. */
export function phoneData(snapshot) {
  if (cache.has(snapshot)) return cache.get(snapshot);
  const data = {
    entries: snapshot.tasks.map(t => ({...t, kind: 'plan', completions: t.completedOccurrences.map(occurrence => ({occurrence}))})),
    planner: {schema: 1, blocks: snapshot.blocks, projects: snapshot.projects, areas: snapshot.areas, goals: snapshot.goals,
      events: [], drafts: []},
  };
  cache.set(snapshot, data);
  return data;
}

const byId = (rows, id) => (id ? rows.find(r => r.id === id) ?? null : null);

/** A Block's Area: its own, else its Goal's, else its Project's (directly or through the Project's Goal). */
export function areaOf(snapshot, block) {
  if (!block) return null;
  const viaGoal = id => byId(snapshot.areas, byId(snapshot.goals, id)?.areaId);
  const project = byId(snapshot.projects, block.projectId);
  return byId(snapshot.areas, block.areaId) ?? viaGoal(block.goalId)
    ?? byId(snapshot.areas, project?.areaId) ?? viaGoal(project?.goalId) ?? null;
}

export function toneOf(snapshot, block) {
  const area = areaOf(snapshot, block);
  if (!area) return null;
  return `area-${(area.colorIndex ?? snapshot.areas.indexOf(area)) % 8}`;
}

export const blockOf = (snapshot, task) => byId(snapshot.blocks, task?.blockId);

/** Deadline, open tasks and progress for one Block (Result). */
export function blockFacts(snapshot, block, now = Date.now()) {
  const data = phoneData(snapshot), rows = blockTasks(data, block.id);
  const due = dueInfo(blockDue(data, block.id)?.value, new Date(now));
  const done = rows.filter(t => t.done).length;
  return {due, left: rows.length - done, done, total: rows.length, countdown: due && !due.overdue ? countdown(due.at, new Date(now)) : null};
}

export const dueDay = (snapshot, block) => blockDue(phoneData(snapshot), block.id)?.value?.slice(0, 10) ?? null;

function spineTask(snapshot, task, day, done) {
  const at = task.start ?? (task.planned ? Date.parse(task.occurrence ?? task.planned) : null);
  const block = blockOf(snapshot, task);
  return {id: task.id, title: task.title, start: at != null && localDay(at) === day ? at : null, minutes: task.minutes ?? 30, done,
    must: !!task.must, result: block?.title ?? null, tone: toneOf(snapshot, block) ?? 'neutral', occurrence: task.occurrence ?? null, ref: task};
}

function runMarks(run) {
  return run ? {...run, marks: Object.fromEntries(run.marks.map(m => [m.stepId, {state: m.state, at: m.at}]))} : null;
}

export function routinesOn(snapshot, day, now) {
  return snapshot.body.routines.filter(r => !r.archived && routineOn(r, day)).map(routine => {
    const run = runMarks(snapshot.body.runs.find(r => r.routineId === routine.id && r.day === day)) ?? {routineId: routine.id, day, marks: {}};
    const {state, progress} = routineState(routine, run, new Date(now));
    return {...routine, state, progress};
  }).filter(r => r.state !== 'skipped');
}

export function waterOf(snapshot, now) {
  const {settings, glasses, snoozedUntil} = snapshot.body.water;
  return {settings, glasses, snoozedUntil, status: waterStatus({glasses, settings, snoozedUntil, now: new Date(now)})};
}

export function dayItems(snapshot, day, now) {
  const listed = dayTasks(phoneData(snapshot), day, now);
  return [...listed.active.map(t => spineTask(snapshot, t, day, false)), ...listed.completed.map(t => spineTask(snapshot, t, day, true))];
}

export function deadlinesOn(snapshot, day, now) {
  return snapshot.blocks.filter(b => !b.archived && dueDay(snapshot, b) === day)
    .map(block => ({id: block.id, title: block.title, at: +blockFacts(snapshot, block, now).due.at}));
}

function nextCard(snapshot, spine, now) {
  const row = spine.rows.find(r => r.kind === 'task' && r.current && !r.done) ?? spine.rows.find(r => r.kind === 'task' && r.next);
  if (!row) return null;
  const task = snapshot.tasks.find(t => t.id === row.task.id), block = blockOf(snapshot, task);
  return {task, row, block, tone: toneOf(snapshot, block),
    label: row.current ? `Now · until ${clock(row.end)}` : `Do next · ${countdown(new Date(row.start), new Date(now))}`,
    facts: block ? blockFacts(snapshot, block, now) : null};
}

export function todayModel(snapshot, now = Date.now()) {
  const day = localDay(now), data = phoneData(snapshot);
  const spine = buildSpine({day, now, live: true, tasks: dayItems(snapshot, day, now), routines: routinesOn(snapshot, day, now),
    water: waterOf(snapshot, now), meals: snapshot.body.meals.filter(m => localDay(m.at) === day), mealPlan: snapshot.body.mealPlan,
    deadlines: deadlinesOn(snapshot, day, now), window: snapshot.body.water.settings});
  return {day, spine, next: nextCard(snapshot, spine, now), upcoming: upcoming(data, {now: new Date(now)}),
    water: waterOf(snapshot, now), routines: routinesOn(snapshot, day, now),
    meals: snapshot.body.meals.filter(m => localDay(m.at) === day), inbox: inboxTasks(snapshot).length};
}

export const weekStart = day => shiftDay(day, -((new Date(day + 'T12:00').getDay() + 6) % 7));

/** Minutes from 8 AM to 10 PM not covered by a timed task. */
export function freeMinutes(items, day, window = {from: '08:00', until: '22:00'}) {
  const open = Date.parse(`${day}T${window.from}`), close = Date.parse(`${day}T${window.until}`);
  const spans = items.filter(i => i.start != null && !i.done).map(i => [Math.max(open, i.start), Math.min(close, i.start + i.minutes * MIN)])
    .filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let busy = 0, cursor = open;
  for (const [a, b] of spans) {
    if (b <= cursor) continue;
    busy += b - Math.max(a, cursor);
    cursor = b;
  }
  return Math.round((close - open - busy) / MIN);
}

export function weekModel(snapshot, now = Date.now(), start = weekStart(localDay(now))) {
  const today = localDay(now);
  return Array.from({length: 7}, (_, i) => {
    const day = shiftDay(start, i), items = dayItems(snapshot, day, now);
    items.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity) || a.id - b.id);
    return {day, today: day === today, past: day < today, items, deadlines: deadlinesOn(snapshot, day, now),
      free: freeMinutes(items, day, snapshot.body.water.settings)};
  });
}

/** Tasks with no Block and no day: what still needs sorting. */
export const inboxTasks = snapshot => snapshot.tasks.filter(t => !t.archived && !t.done && !t.blockId && !t.planned && !t.plannedDate)
  .sort((a, b) => a.id - b.id);

export function blockList(snapshot, now = Date.now(), filter = null) {
  return snapshot.blocks.filter(b => !b.archived)
    .filter(b => !filter || b.projectId === filter || areaOf(snapshot, b)?.id === filter || (filter === 'none' && !b.projectId))
    .map(block => ({block, tone: toneOf(snapshot, block), facts: blockFacts(snapshot, block, now), project: byId(snapshot.projects, block.projectId)}))
    .sort((a, b) => (a.facts.due?.at ?? Infinity) - (b.facts.due?.at ?? Infinity));
}

export function blockPlan(snapshot, blockId) {
  const rows = blockTasks(phoneData(snapshot), blockId);
  return {open: rows.filter(t => !t.done), done: rows.filter(t => t.done)};
}

/** Word-start search, as the phone's Block add field finds Inbox tasks. */
export function findTasks(tasks, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return tasks.filter(t => {
    const starts = t.title.toLowerCase().split(/[^\p{L}\p{N}]+/u);
    return words.every(w => starts.some(s => s.startsWith(w)));
  });
}
