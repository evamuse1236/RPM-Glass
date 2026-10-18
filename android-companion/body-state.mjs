export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Chip order on the editor, Monday first. Values are Date#getDay numbers. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const pad = n => String(n).padStart(2, '0');
const plural = (count, one, many = one + 's') => `${count} ${count === 1 ? one : many}`;

export function localDay(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function minutesOf(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ''));
  if (!match) return NaN;
  const h = Number(match[1]), m = Number(match[2]);
  return h > 23 || m > 59 ? NaN : h * 60 + m;
}

/** The local moment `minutes` after midnight on `day` (YYYY-MM-DD). */
export function atMinutes(day, minutes) {
  return new Date(`${day}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
}

const period = date => (new Date(date).getHours() < 12 ? 'AM' : 'PM');
const bareClock = date => {
  const d = new Date(date);
  return `${d.getHours() % 12 || 12}:${pad(d.getMinutes())}`;
};

/** "7:00 AM", "12:40 PM". */
export function clockText(date) {
  return `${bareClock(date)} ${period(date)}`;
}

/** "7:00 – 7:30 AM", "11:30 AM – 1:30 PM", as Calendar writes a range (HH:MM inputs). */
export function rangeText(start, end, day = '2000-01-01') {
  const a = atMinutes(day, minutesOf(start)), b = atMinutes(day, minutesOf(end));
  return `${period(a) === period(b) ? bareClock(a) : clockText(a)} – ${clockText(b)}`;
}

/** "8:40, 10:15, 11:50 AM, 1:20 PM": a period is written once, after the last time that shares it. */
export function timesText(times) {
  const sorted = [...times].map(t => new Date(t)).sort((a, b) => a - b);
  return sorted.map((t, i) => (i === sorted.length - 1 || period(sorted[i + 1]) !== period(t) ? clockText(t) : bareClock(t))).join(', ');
}

/** "Mon–Fri", "Every day", "Sat–Sun", "Mon, Wed, Fri". */
export function daysText(days) {
  const on = WEEK_ORDER.filter(d => days.includes(d));
  if (on.length === 7) return 'Every day';
  if (!on.length) return 'No days';
  const at = on.map(d => WEEK_ORDER.indexOf(d));
  const contiguous = on.length > 2 && at.every((v, i) => !i || v === at[i - 1] + 1);
  return contiguous ? `${DAY_NAMES[on[0]]}–${DAY_NAMES[on.at(-1)]}` : on.map(d => DAY_NAMES[d]).join(', ');
}

/** Does the routine run on `day`? */
export const routineOn = (routine, day) => routine.days.includes(new Date(day + 'T12:00').getDay());

export function routineProgress(routine, run) {
  const marks = run?.marks ?? {};
  let done = 0, skipped = 0;
  for (const step of routine.steps) {
    if (marks[step.id]?.state === 'done') done++;
    else if (marks[step.id]?.state === 'skipped') skipped++;
  }
  const total = routine.steps.length;
  return {total, done, skipped, open: total - done - skipped};
}

/**
 * Where a run stands at `now`: empty (no steps), skipped (the user skipped the day), upcoming (before its window,
 * nothing touched), running, done (every step ticked), partly (finished with skips, or the window ended with some
 * steps touched) or missed (the window ended with nothing touched). A step ticked after the window still counts,
 * so a missed run becomes partly done (or done) until midnight.
 */
export function routineState(routine, run, now = new Date()) {
  const day = run?.day ?? localDay(now);
  const start = atMinutes(day, minutesOf(routine.start)), end = atMinutes(day, minutesOf(routine.end));
  const progress = routineProgress(routine, run);
  const base = {progress, start, end};
  if (run?.skippedDay) return {...base, state: 'skipped'};
  if (!progress.total) return {...base, state: 'empty'};
  if (!progress.open) return {...base, state: progress.skipped ? 'partly' : 'done'};
  const touched = progress.done + progress.skipped > 0;
  if (now >= end) return {...base, state: touched ? 'partly' : 'missed'};
  if (now < start && !touched) return {...base, state: 'upcoming'};
  return {...base, state: 'running'};
}

const countLine = ({done, total, skipped}) => `${done} of ${total}${skipped ? `, ${skipped} skipped` : ''}`;

/**
 * The Today row's supporting line as phrases; a phrase with `yields` gives way first with large text.
 * Returns null when the row should not show (skipped for today).
 */
export function routineRowParts(routine, run, now = new Date()) {
  const {state, progress, start, end} = routineState(routine, run, now);
  const range = rangeText(routine.start, routine.end);
  switch (state) {
    case 'skipped': return null;
    case 'empty': return {state, parts: [{text: range}, {text: 'No steps yet'}]};
    case 'upcoming': return {state, parts: [{text: `Starts ${clockText(start)}`}, {text: plural(progress.total, 'step')}]};
    case 'running': return {state, parts: [{text: range}, {text: `${progress.done} of ${progress.total} done`}]};
    case 'done': return {state, filled: true, parts: [{text: 'Done'}, {text: `${progress.done} of ${progress.total}`}]};
    case 'partly': return {state, parts: [{text: 'Partly done'}, {text: countLine(progress)}]};
    default: return {state, parts: [{text: 'Missed'}, {text: `window ended ${clockText(end)}`, yields: true}]};
  }
}

export const joinParts = parts => parts.filter(Boolean).map(p => p.text).join(' · ');

/** The run sheet's count line: "3 of 5 done", or once every step is ticked or skipped "Done · 4 of 5, 1 skipped". */
export function runSummary(routine, run) {
  const progress = routineProgress(routine, run);
  return progress.total && !progress.open ? `Done · ${countLine(progress)}` : `${progress.done} of ${progress.total} done`;
}

/** "Missed · window ended 7:30 AM" while the window has passed with nothing touched, otherwise null. */
export function missedLine(routine, run, now = new Date()) {
  const {state, end} = routineState(routine, run, now);
  return state === 'missed' ? `Missed · window ended ${clockText(end)}` : null;
}

/** History's words for a finished day: "Done", "Partly done · 3 of 5, 1 skipped", "Missed", "Skipped". */
export function routineHistoryText(routine, run, now = new Date()) {
  const {state, progress} = routineState(routine, run, now);
  if (state === 'done') return 'Done';
  if (state === 'partly') return `Partly done · ${countLine(progress)}`;
  if (state === 'skipped') return 'Skipped';
  if (state === 'missed') return 'Missed';
  return `${progress.done} of ${progress.total} done`;
}

const emptyRun = (routine, day) => ({routineId: routine.id, day, marks: {}});

/** Tick, skip or put back one step (`state` null clears it). Returns a new run. */
export function markStep(routine, run, stepId, state, at) {
  const base = run ?? emptyRun(routine, localDay(at));
  const marks = {...base.marks};
  if (state) marks[stepId] = {state, at: new Date(at).toISOString()};
  else delete marks[stepId];
  return {...base, marks};
}

const fillOpen = (routine, run, state, at) => {
  let next = run ?? emptyRun(routine, localDay(at));
  for (const step of routine.steps) if (!next.marks[step.id]) next = markStep(routine, next, step.id, state, at);
  return next;
};

/** "Done all": ticks the untouched steps; skipped steps stay skipped. */
export const doneAll = (routine, run, at) => fillOpen(routine, run, 'done', at);
/** "Skip the rest": skips the untouched steps; ticked steps stay ticked. */
export const skipRest = (routine, run, at) => fillOpen(routine, run, 'skipped', at);

/** The editor's checks, in field order. Each error names the field it sits under. */
export function validateRoutine({name, start, end, days, steps}) {
  const errors = {};
  if (!String(name ?? '').trim()) errors.name = 'Give the routine a name';
  const a = minutesOf(start), b = minutesOf(end);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) errors.window = 'End time must be after the start';
  if (!days?.length) errors.days = 'Pick at least one day';
  if (!steps?.some(step => String(step.title ?? '').trim())) errors.steps = 'Add at least one step';
  return errors;
}

export const WATER_DEFAULTS = Object.freeze({goal: 8, intervalMinutes: 90, from: '08:00', until: '22:00', glassMl: 250, snoozeMinutes: 15});

/**
 * Today's water: glasses so far, the next nudge and whether one is waiting. Nudges start at `from`, follow the last
 * glass by the interval (or a snooze), wait out a busy calendar event and stop at `until` or once the goal is met.
 * `busy` is [{title, start, end}].
 */
export function waterStatus({glasses = [], now = new Date(), settings = WATER_DEFAULTS, busy = [], snoozedUntil = null}) {
  const day = localDay(now);
  const today = glasses.map(g => new Date(g)).filter(g => localDay(g) === day).sort((a, b) => a - b);
  const count = today.length, goal = settings.goal;
  const lastAt = today.at(-1) ?? null;
  const start = atMinutes(day, minutesOf(settings.from)), end = atMinutes(day, minutesOf(settings.until));
  const events = busy.map(e => ({title: e.title, start: new Date(e.start), end: new Date(e.end)}));
  const during = events.find(e => e.start <= now && now < e.end) ?? null;
  const paused = during ? {title: during.title, until: during.end} : null;
  const reached = count >= goal;
  let nextAt = null;
  if (!reached) {
    let at = lastAt ? new Date(+lastAt + settings.intervalMinutes * 60000) : start;
    if (at < start) at = start;
    if (snoozedUntil && new Date(snoozedUntil) > at) at = new Date(snoozedUntil);
    for (let moved = true; moved;) {
      moved = false;
      for (const e of events) if (e.start <= at && at < e.end) { at = e.end; moved = true; }
    }
    nextAt = at < end ? at : null;
  }
  const pending = !!nextAt && nextAt <= now && !paused;
  return {count, goal, reached, lastAt, nextAt, pending, paused, beforeStart: now < start, times: today};
}

/** The Water row's supporting line as phrases ("next nudge" gives way first with large text). */
export function waterRowParts(status) {
  const {count, goal, reached, paused, nextAt, pending, beforeStart} = status;
  if (reached) return {filled: true, parts: [{text: `${count} of ${goal}`}, {text: 'goal reached'}]};
  if (paused) return {parts: [{text: 'Paused'}, {text: `in ${paused.title} until ${clockText(paused.until)}`}]};
  const lead = {text: count ? `${count} of ${goal} glasses` : 'No glasses yet'};
  if (!nextAt) return {parts: [lead]};
  if (pending) return {parts: [lead, {text: 'nudge due now', yields: true}]};
  const word = !count && beforeStart ? 'first nudge' : 'next nudge';
  return {parts: [lead, {text: `${word} ${clockText(nextAt)}`, yields: true}]};
}

/**
 * The reminder notification, or null when none should show (goal reached, or paused). "First of 8 today" before
 * any glass, otherwise "5 of 8 today · last at 12:40 PM".
 */
export function waterNotification(status, settings = WATER_DEFAULTS) {
  if (status.reached || status.paused) return null;
  return {
    title: 'Drink a glass of water',
    text: status.count ? `${status.count} of ${status.goal} today · last at ${clockText(status.lastAt)}` : `First of ${status.goal} today`,
    actions: ['Drank it', `Snooze ${settings.snoozeMinutes} min`],
  };
}

export const SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'];
export const SLOT_NAMES = Object.freeze({breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner'});
export const SLOT_PLURALS = Object.freeze({breakfast: 'breakfasts', lunch: 'lunches', snack: 'snacks', dinner: 'dinners'});

/** The slot a meal eaten at `date` most likely is: breakfast 4:00–10:59, lunch 11:00–15:29, snack 15:30–18:59, else dinner. */
export function guessSlot(date) {
  const d = new Date(date), m = d.getHours() * 60 + d.getMinutes();
  if (m >= 240 && m < 660) return 'breakfast';
  if (m >= 660 && m < 930) return 'lunch';
  if (m >= 930 && m < 1140) return 'snack';
  return 'dinner';
}

const mealKey = name => String(name).trim().replace(/\s+/g, ' ').toLowerCase();

/** The user's most frequent meals for a slot (most recent first among equals), in their latest spelling. */
export function usualMeals(meals, slot, limit = 6) {
  const groups = new Map();
  for (const meal of meals) {
    if (meal.slot !== slot || !String(meal.name ?? '').trim()) continue;
    const key = mealKey(meal.name), at = +new Date(meal.at);
    const group = groups.get(key) ?? {name: meal.name.trim(), count: 0, last: -Infinity};
    group.count++;
    if (at >= group.last) { group.last = at; group.name = meal.name.trim(); }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.last - a.last).slice(0, limit).map(g => g.name);
}

/** The Meal row: the slot for now, the meal logged for it today (or null), and whether the row hides. */
export function mealRowState(meals, now = new Date()) {
  const day = localDay(now), slot = guessSlot(now);
  const today = meals.filter(m => localDay(m.at) === day).sort((a, b) => new Date(a.at) - new Date(b.at));
  const evening = new Date(now).getHours() >= 15;
  if (slot === 'dinner' && evening && today.some(m => m.slot === 'dinner')) return {slot, meal: null, hidden: true};
  return {slot, meal: today.filter(m => m.slot === slot).at(-1) ?? null, hidden: false};
}

/** "Jev's guess · about 550 kcal · 18 g protein" (sheet) or "Guess: about 550 kcal, 18 g protein" (History). */
export function estimateText(estimate, {short = false} = {}) {
  if (estimate?.status !== 'ready') return '';
  const kcal = `${estimate.kcal} kcal`, protein = `${estimate.protein} g protein`;
  return short ? `Guess: about ${kcal}, ${protein}` : `Jev's guess · about ${kcal} · ${protein}`;
}

/**
 * Everything logged, grouped by day (newest first), each day's rows newest first. Today's routine run appears once it
 * has finished or its window has ended; later days never appear.
 * Rows: {kind: 'meal', meal} · {kind: 'water', count, goal, times} · {kind: 'routine', routine, run, text}.
 */
export function historyDays({meals = [], glasses = [], runs = [], routines = [], goal = WATER_DEFAULTS.goal}, now = new Date()) {
  const today = localDay(now);
  const days = new Map();
  const add = (day, row) => {
    if (day > today) return;
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(row);
  };
  for (const meal of meals) add(localDay(meal.at), {kind: 'meal', at: new Date(meal.at), meal});
  const water = new Map();
  for (const glass of glasses) {
    const day = localDay(glass);
    water.set(day, [...(water.get(day) ?? []), new Date(glass)]);
  }
  for (const [day, times] of water) {
    times.sort((a, b) => a - b);
    add(day, {kind: 'water', at: times.at(-1), count: times.length, goal, times});
  }
  for (const run of runs) {
    const routine = routines.find(r => r.id === run.routineId);
    if (!routine) continue;
    const {state, start} = routineState(routine, run, now);
    if (['upcoming', 'running', 'empty'].includes(state)) continue;
    add(run.day, {kind: 'routine', at: start, routine, run, text: routineHistoryText(routine, run, now)});
  }
  return [...days.entries()].sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, rows]) => ({day, rows: rows.sort((a, b) => b.at - a.at)}));
}
