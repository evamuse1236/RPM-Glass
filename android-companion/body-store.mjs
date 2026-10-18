/**
 * Routines, water and the meal log in the planner store, under `planner.body` (shape: docs/body-data.md). Every
 * change is an editPlan op, so it is validated, saved through the phone, logged and undoable like a task edit.
 * A store without `planner.body` reads as empty with the default water settings; the first change creates it.
 */
import {randomUUID} from 'node:crypto';
import {WATER_DEFAULTS, SLOTS, validateRoutine, minutesOf} from './body-state.mjs';
import {text, title, integer, one} from './planner-fields.mjs';

export const BODY_SCHEMA = 1;
/** Reminders are on unless the user turns them off (ticket 08: every 90 minutes, 8 AM to 10 PM). */
export const WATER_SETTINGS = Object.freeze({...WATER_DEFAULTS, reminders: true});
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STATES = ['done', 'skipped'];

const instant = (value, what = 'time') => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`Choose a valid ${what}.`);
  return new Date(value).toISOString();
};
const clock = value => {
  if (Number.isNaN(minutesOf(value))) throw new Error('Choose a valid time.');
  return value.padStart(5, '0');
};

/** The body records as stored, with defaults for anything never saved. Read-only: never mutate the result. */
export function bodyOf(data) {
  const body = data?.planner?.body ?? {};
  const water = body.water ?? {};
  return {
    routines: body.routines ?? [],
    runs: body.runs ?? [],
    water: {settings: {...WATER_SETTINGS, ...water.settings}, glasses: water.glasses ?? [], snoozedUntil: water.snoozedUntil ?? null},
    meals: body.meals ?? [],
    mealGuesses: body.mealGuesses ?? {},
  };
}

/** The mutable body of a working copy, created on first use. */
function bodyFor(next) {
  const p = next.planner;
  p.body ??= {schema: BODY_SCHEMA};
  const body = p.body;
  body.routines ??= [];
  body.runs ??= [];
  body.water ??= {};
  body.water.settings = {...WATER_SETTINGS, ...body.water.settings};
  body.water.glasses ??= [];
  body.water.snoozedUntil ??= null;
  body.meals ??= [];
  body.mealGuesses ??= {};
  return body;
}

function saveRoutine(next, op, at) {
  const body = bodyFor(next), fields = op.routine ?? {};
  const errors = validateRoutine(fields);
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);
  const days = [...new Set(fields.days)].sort();
  if (days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Pick at least one day');
  const steps = fields.steps.filter(step => String(step.title ?? '').trim()).map(step => ({
    id: typeof step.id === 'string' && step.id ? step.id : randomUUID(), title: title(step.title)}));
  if (new Set(steps.map(s => s.id)).size !== steps.length) throw new Error('Each step needs its own place.');
  let routine = fields.id ? one(body.routines, fields.id) : null;
  if (!routine) {
    routine = {id: randomUUID(), created: at};
    body.routines.push(routine);
  }
  Object.assign(routine, {name: title(fields.name), start: clock(fields.start), end: clock(fields.end), days, steps, updated: at});
  delete routine.archived;
  return routine.id;
}

/** Deleting keeps the routine (marked archived) so its past runs stay in History. */
function removeRoutine(next, op, at) {
  const routine = one(bodyFor(next).routines, op.id);
  routine.archived = true;
  routine.updated = at;
  return routine.id;
}

function runSlot(body, routineId, day) {
  const routine = one(body.routines, routineId);
  if (typeof day !== 'string' || !DAY.test(day)) throw new Error('Choose a valid day.');
  const run = body.runs.find(r => r.routineId === routine.id && r.day === day);
  return {routine, run};
}

function saveRoutineRun(next, op) {
  const body = bodyFor(next), given = op.run ?? {};
  const {routine, run} = runSlot(body, given.routineId, given.day);
  const steps = new Set(routine.steps.map(s => s.id));
  const marks = {};
  for (const [stepId, mark] of Object.entries(given.marks ?? {})) {
    if (!steps.has(stepId) || !STATES.includes(mark?.state)) throw new Error('That step changed. Close and reopen the routine.');
    marks[stepId] = {state: mark.state, at: instant(mark.at)};
  }
  const saved = {routineId: routine.id, day: given.day, marks};
  if (run?.skippedDay && given.skippedDay !== false) saved.skippedDay = true;
  body.runs = [...body.runs.filter(r => r !== run), saved];
  return routine.id;
}

function skipRoutineDay(next, op) {
  const body = bodyFor(next);
  const {routine, run} = runSlot(body, op.routineId, op.day);
  const saved = {...(run ?? {routineId: routine.id, day: op.day, marks: {}})};
  if (op.skipped === false) delete saved.skippedDay;
  else saved.skippedDay = true;
  body.runs = [...body.runs.filter(r => r !== run), saved];
  return routine.id;
}

function drinkWater(next, op) {
  const water = bodyFor(next).water;
  water.glasses.push(instant(op.at));
  water.snoozedUntil = null;
  return water.glasses.length;
}

function snoozeWater(next, op) {
  const water = bodyFor(next).water;
  water.snoozedUntil = op.until == null ? null : instant(op.until);
  return 'water';
}

const WATER_LIMITS = {goal: [1, 30], intervalMinutes: [15, 360], glassMl: [50, 1000], snoozeMinutes: [5, 120]};

function setWater(next, op) {
  const settings = bodyFor(next).water.settings;
  const fields = op.fields ?? {};
  for (const [key, value] of Object.entries(fields)) {
    if (WATER_LIMITS[key]) settings[key] = integer(value, ...WATER_LIMITS[key]);
    else if (key === 'from' || key === 'until') settings[key] = clock(value);
    else if (key === 'reminders') {
      if (typeof value !== 'boolean') throw new Error('Reminders must be on or off.');
      settings.reminders = value;
    } else throw new Error('Unknown water setting.');
  }
  if (minutesOf(settings.until) <= minutesOf(settings.from)) throw new Error('Reminders must end after they start.');
  return 'water';
}

function saveMeal(next, op, at) {
  const body = bodyFor(next), fields = op.meal ?? {};
  const name = text(fields.name ?? '', 200);
  if (!name) throw new Error('Type what you ate.');
  if (!SLOTS.includes(fields.slot)) throw new Error('Choose breakfast, lunch, snack or dinner.');
  let meal = fields.id ? one(body.meals, fields.id) : null;
  if (!meal) {
    meal = {id: randomUUID(), created: at};
    body.meals.push(meal);
  }
  if (meal.name !== undefined && meal.name !== name) delete body.mealGuesses[meal.id];
  Object.assign(meal, {name, slot: fields.slot, at: instant(fields.at ?? meal.at ?? at)});
  return meal.id;
}

function removeMeal(next, op) {
  const body = bodyFor(next);
  one(body.meals, op.id);
  body.meals = body.meals.filter(m => m.id !== op.id);
  delete body.mealGuesses[op.id];
  return op.id;
}

/** Jev's (or the agent's) nutrition guess, stored beside the meal, never in it. */
function setMealGuess(next, op, at) {
  const body = bodyFor(next);
  one(body.meals, op.id);
  const guess = op.guess ?? {};
  if (!['pending', 'ready', 'failed'].includes(guess.status)) throw new Error('Invalid meal guess.');
  const saved = {status: guess.status, by: text(guess.by ?? 'Jev', 60), at};
  if (guess.status === 'ready') Object.assign(saved, {kcal: integer(guess.kcal, 0, 10000), protein: integer(guess.protein, 0, 1000)});
  body.mealGuesses[op.id] = saved;
  return op.id;
}

export const BODY_OPS = {saveRoutine, removeRoutine, saveRoutineRun, skipRoutineDay, drinkWater, snoozeWater, setWater,
  saveMeal, removeMeal, setMealGuess};

/** Called by validatePlanner: an absent body is valid; a present one must keep its shape. */
export function validateBody(p) {
  const body = p.body;
  if (body == null) return;
  const lists = ['routines', 'runs', 'meals'];
  if (typeof body !== 'object' || lists.some(k => body[k] != null && !Array.isArray(body[k]))) throw new Error('Invalid routine or meal data.');
  const ids = new Set();
  for (const r of body.routines ?? []) {
    if (typeof r.id !== 'string' || ids.has(r.id) || !Array.isArray(r.steps) || !Array.isArray(r.days)) throw new Error('Invalid routine data.');
    ids.add(r.id);
  }
  for (const run of body.runs ?? []) if (!ids.has(run.routineId) || !DAY.test(run.day)) throw new Error('Invalid routine data.');
  const meals = new Set();
  for (const m of body.meals ?? []) {
    if (typeof m.id !== 'string' || meals.has(m.id) || !SLOTS.includes(m.slot) || !Number.isFinite(Date.parse(m.at))) throw new Error('Invalid meal data.');
    meals.add(m.id);
  }
  const water = body.water;
  if (water != null && (!Array.isArray(water.glasses ?? []) || (water.glasses ?? []).some(g => !Number.isFinite(Date.parse(g))))) {
    throw new Error('Invalid water data.');
  }
}
