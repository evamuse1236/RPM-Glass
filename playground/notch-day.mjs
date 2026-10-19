// Copy of NotchData, NotchBody, NotchDay, NotchWater and NotchHabits: the phone runs the Java, so change both together.
export const MIN = 60_000;

const time = v => { if (typeof v !== 'string' || !v) return 0; const t = Date.parse(v); return Number.isFinite(t) ? t : 0; };
const minutesOf = hhmm => {
  if (typeof hhmm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hhmm)) return -1;
  const [h, m] = hhmm.split(':').map(Number);
  return h > 23 || m > 59 ? -1 : h * 60 + m;
};
const pad = hhmm => hhmm.length === 4 ? '0' + hhmm : hhmm;
const dayStart = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d; };
const localDay = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const atMinutes = (day, minutes) => { const d = new Date(day); d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0); return d.getTime(); };
const epochDay = d => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);

const WATER_SETTINGS = () => ({goal: 8, intervalMinutes: 90, from: '08:00', until: '22:00', snoozeMinutes: 15, reminders: true});

function waterSettings(o) {
  const s = WATER_SETTINGS();
  if (!o) return s;
  s.goal = Math.max(1, Number.isInteger(o.goal) ? o.goal : s.goal);
  s.intervalMinutes = Math.max(1, Number.isInteger(o.intervalMinutes) ? o.intervalMinutes : s.intervalMinutes);
  if (minutesOf(o.from) >= 0) s.from = pad(o.from);
  if (minutesOf(o.until) >= 0) s.until = pad(o.until);
  s.snoozeMinutes = Math.max(1, Number.isInteger(o.snoozeMinutes) ? o.snoozeMinutes : s.snoozeMinutes);
  s.reminders = o.reminders !== false;
  return s;
}

function parseBody(data) {
  const body = data?.planner?.body;
  if (!body || typeof body !== 'object') return {present: false, glasses: [], water: WATER_SETTINGS(), waterSnoozedUntil: 0, routines: [], runs: new Map(), meals: []};
  const water = body.water ?? {};
  const routines = (body.routines ?? []).filter(r => r && !r.archived && minutesOf(r.start) >= 0 && minutesOf(r.end) >= 0)
    .map(r => ({id: String(r.id ?? ''), name: String(r.name ?? ''), start: minutesOf(r.start), end: minutesOf(r.end),
      days: new Set(r.days ?? []), steps: (r.steps ?? []).filter(Boolean).map(s => ({id: String(s.id ?? ''), title: String(s.title ?? '')}))}));
  const runs = new Map((body.runs ?? []).filter(Boolean).map(r => [`${r.routineId}|${r.day}`,
    {marks: new Map(Object.entries(r.marks ?? {}).filter(([, m]) => m && typeof m === 'object').map(([k, m]) => [k, m.state])), skippedDay: !!r.skippedDay}]));
  return {present: true, glasses: (water.glasses ?? []).map(time).filter(Boolean), water: waterSettings(water.settings),
    waterSnoozedUntil: time(water.snoozedUntil), routines, runs,
    meals: (body.meals ?? []).map(m => ({slot: String(m?.slot ?? ''), at: time(m?.at)})).filter(m => m.at)};
}

const ALERTS = ['alarm', 'reminder'];
const alertType = e => { const t = e.alertIntent?.type || e.alert?.type; return ALERTS.includes(t) ? t : null; };

function parseTask(e, blocks) {
  if (!e || e.archived || e.done || e.state === 'cancelled' || (e.kind ?? 'plan') !== 'plan') return null;
  const planned = time(e.planned);
  if (!planned) return null;
  return {id: Number(e.id) || 0, title: String(e.title ?? e.raw ?? ''), block: e.blockId == null ? null : blocks.get(String(e.blockId)) ?? null,
    planned, minutes: e.minutes == null || !Number.isFinite(Number(e.minutes)) ? 30 : Math.trunc(Number(e.minutes)), recurrence: e.recurrence ?? '',
    completed: new Set(e.completedOccurrences ?? []), fixed: false, alert: alertType(e)};
}

export function parseNotchData(data, events) {
  const blocks = new Map((data?.planner?.blocks ?? []).filter(Boolean).map(b => [String(b.id), String(b.title ?? '')]));
  const tasks = (data?.entries ?? []).map(e => parseTask(e, blocks)).filter(Boolean);
  const busy = [];
  for (const e of events ?? []) {
    if (!e || e.allDay || !(e.start > 0) || !(e.end > e.start)) continue;
    if (e.busy !== false) busy.push({start: e.start, end: e.end});
    tasks.push({id: 0, title: e.title ?? 'Calendar commitment', block: null, planned: e.start, minutes: Math.floor((e.end - e.start) / MIN),
      recurrence: '', completed: new Set(), fixed: true, alert: null});
  }
  return {tasks, busy, body: parseBody(data)};
}

function candidates(task, now) {
  const r = task.recurrence, base = new Date(task.planned);
  if (!['daily', 'weekly', 'weekdays'].includes(r)) return [task.planned];
  const out = [], today = dayStart(now);
  for (let back = 1; back >= 0; back--) {
    const d = new Date(today); d.setDate(d.getDate() - back);
    const days = epochDay(d) - epochDay(base);
    if (days < 0 || (r === 'weekly' && days % 7 !== 0)) continue;
    if (r === 'weekdays' && (d.getDay() === 0 || d.getDay() === 6)) continue;
    const at = new Date(base); at.setDate(at.getDate() + days);
    out.push(at.getTime());
  }
  return out;
}

export function today(tasks, now) {
  const from = dayStart(now).getTime(), to = (() => { const d = dayStart(now); d.setDate(d.getDate() + 1); return d.getTime(); })();
  const slots = [];
  for (const task of tasks) for (const start of candidates(task, now)) {
    const slot = {task, start, end: start + task.minutes * MIN};
    if (slot.start < to && slot.end > from && !task.completed.has(new Date(start).toISOString())) slots.push(slot);
  }
  return slots.sort((a, b) => a.start - b.start || a.task.id - b.task.id);
}

export const running = (slot, now) => slot.start <= now && now < slot.end;

export function hero(slots, now) {
  return slots.find(s => running(s, now) && !s.task.fixed) ?? slots.find(s => s.end > now) ?? null;
}

export function after(slots, heroSlot, n) {
  if (!heroSlot) return [];
  const out = [];
  let past = false;
  for (const s of slots) {
    if (s === heroSlot) past = true;
    else if (past && s.start >= heroSlot.start && out.length < n) out.push(s);
  }
  return out;
}

export function minutes(ms) {
  const m = Math.max(1, Math.floor(ms / MIN));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 === 0 ? '' : ` ${m % 60}m`}`;
}

export function spoken(ms) {
  const m = Math.max(1, Math.floor(ms / MIN));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 === 0 ? '' : ` ${m % 60} min`}`;
}

export function clock(at, h24) {
  const d = new Date(at), mm = String(d.getMinutes()).padStart(2, '0');
  if (h24) return `${d.getHours()}:${mm}`;
  return `${d.getHours() % 12 || 12}:${mm} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

/** "4:30 PM" without its " PM"; a 24-hour clock is left alone. */
export const dropAmPm = text => text.replace(/ [AP]M$/, '');

/** The pill's clock: "4:30" within 12 hours of now, "4:30 PM" further away. */
export const shortClock = (at, now, h24) => Math.abs(at - now) <= 12 * 60 * MIN ? dropAmPm(clock(at, h24)) : clock(at, h24);

export function waterStatus(glasses, s, busy, snoozedUntil, now) {
  const day = localDay(now);
  const todays = glasses.filter(g => localDay(g) === day);
  const last = Math.max(0, ...todays);
  const start = atMinutes(dayStart(now), minutesOf(s.from)), end = atMinutes(dayStart(now), minutesOf(s.until));
  const paused = busy.some(b => b.start <= now && now < b.end);
  if (todays.length >= s.goal || !s.reminders) return {count: todays.length, goal: s.goal, nextAt: 0, pending: false};
  let next = last ? last + s.intervalMinutes * MIN : start;
  if (next < start) next = start;
  if (snoozedUntil > next) next = snoozedUntil;
  for (let moved = true; moved;) {
    moved = false;
    for (const b of busy) if (b.start <= next && next < b.end) { next = b.end; moved = true; }
  }
  if (next >= end) next = 0;
  return {count: todays.length, goal: s.goal, nextAt: next, pending: next !== 0 && next <= now && !paused};
}

export function routines(body, now) {
  const day = dayStart(now), weekday = day.getDay(), key = localDay(now), out = [];
  for (const r of body.routines) {
    if (!r.days.has(weekday) || !r.steps.length) continue;
    const run = body.runs.get(`${r.id}|${key}`);
    if (run?.skippedDay) continue;
    let done = 0, skipped = 0, next = null;
    for (const step of r.steps) {
      const mark = run?.marks.get(step.id);
      if (mark === 'done') done++;
      else if (mark === 'skipped') skipped++;
      else if (next == null) next = step.title;
    }
    const open = r.steps.length - done - skipped, start = atMinutes(day, r.start), end = atMinutes(day, r.end), touched = done + skipped > 0;
    const state = open === 0 ? (skipped > 0 ? 'partly' : 'done') : now >= end ? (touched ? 'partly' : 'missed')
      : now < start && !touched ? 'upcoming' : 'running';
    out.push({routine: r, total: r.steps.length, done, open, start, end, state, nextStep: next});
  }
  return out.sort((a, b) => a.start - b.start);
}

export const routineDue = (status, now) => status.state === 'running' && status.open > 0 && status.start <= now;

export function mealSlot(at) {
  const d = new Date(at), m = d.getHours() * 60 + d.getMinutes();
  return m >= 240 && m < 660 ? 'breakfast' : m >= 660 && m < 930 ? 'lunch' : m >= 930 && m < 1140 ? 'snack' : 'dinner';
}

export function unloggedMeal(meals, now) {
  const day = localDay(now), slot = mealSlot(now);
  return meals.some(m => localDay(m.at) === day && m.slot === slot) ? null : slot;
}

export const slotName = slot => slot ? slot[0].toUpperCase() + slot.slice(1) : slot;
