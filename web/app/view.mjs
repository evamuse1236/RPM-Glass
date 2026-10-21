import {occurrences, repeats} from '../../android-companion/planner-recurrence.mjs';

const DAY = 86400000;
export const localDay = date => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const shiftDay = (day, n) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return localDay(d); };
const startOf = day => +new Date(`${day}T00:00:00`);

const clock = at => new Date(at).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
const weekday = day => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', {weekday: 'short'});
export function dayName(day, today) {
  if (day === today) return 'Today';
  if (day === shiftDay(today, 1)) return 'Tomorrow';
  if (day === shiftDay(today, -1)) return 'Yesterday';
  const diff = (startOf(day) - startOf(today)) / DAY;
  if (diff > 0 && diff < 7) return weekday(day);
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-US', {weekday: 'short', day: 'numeric', month: 'short'});
}
export const duration = minutes => {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ');
};
export function savedLabel(savedAt, now) {
  const at = Date.parse(savedAt);
  if (!Number.isFinite(at) || at <= 0) return 'Not saved from the phone yet';
  const minutes = Math.round((+now - at) / 60000);
  if (minutes < 1) return 'Phone saved just now';
  if (minutes < 60) return `Phone saved ${minutes} min ago`;
  const day = localDay(at), today = localDay(now);
  return `Phone saved ${day === today ? '' : `${dayName(day, today)} `}${clock(at)}`;
}

/** When a task happens: its next occurrence for repeats, else its planned time or day. */
function when(task, today) {
  if (task.planned) {
    const from = startOf(shiftDay(today, -60));
    const next = repeats(task) ? occurrences(task, from, startOf(shiftDay(today, 400))).find(o => o.end > startOf(today)) : null;
    const at = next ? next.occurrence : task.planned;
    return {at, day: localDay(at), occurrence: next ? next.occurrence : undefined};
  }
  if (task.plannedDate) return {at: null, day: task.plannedDate};
  return null;
}

function row(task, ctx) {
  const block = ctx.blocks.get(task.blockId), slot = when(task, ctx.today);
  const timing = slot && (slot.at ? `${slot.day === ctx.today ? '' : `${dayName(slot.day, ctx.today)} `}${clock(slot.at)}` : dayName(slot.day, ctx.today));
  const overdue = !task.done && !!slot && !repeats(task) && slot.day < ctx.today;
  return {id: task.id, title: task.title || task.raw, raw: task.raw, must: task.must, done: task.done, repeats: repeats(task),
    occurrence: slot?.occurrence, day: slot?.day ?? null, at: slot?.at ?? null, overdue,
    meta: [overdue ? 'Overdue' : timing, duration(task.minutes)].filter(Boolean).join(' · '),
    result: block ? {id: block.id, title: block.title, purpose: block.purpose} : null, blockId: task.blockId};
}

const byTime = (a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity) || a.id - b.id;

export function plannerView(snapshot, now = new Date()) {
  const today = localDay(now);
  const blocks = new Map(snapshot.blocks.filter(b => !b.archived).map(b => [b.id, b]));
  const projects = new Map(snapshot.projects.map(p => [p.id, p]));
  const ctx = {today, now, blocks};
  const live = snapshot.tasks.filter(t => !t.archived);
  const rows = live.map(t => row(t, ctx));
  const open = rows.filter(r => !r.done);
  const doneToday = live.filter(t => t.done && t.completedAt && localDay(t.completedAt) === today).map(t => row(t, ctx));

  const agenda = open.filter(r => r.day === today || r.overdue).sort((a, b) => b.overdue - a.overdue || byTime(a, b));
  const upcoming = open.filter(r => r.day && r.day > today && r.day <= shiftDay(today, 6)).sort(byTime);
  const inbox = open.filter(r => !r.blockId && !r.day).sort((a, b) => a.id - b.id);

  const resultCards = [...blocks.values()].map(block => {
    const tasks = rows.filter(r => r.blockId === block.id);
    const priority = new Map(live.filter(t => t.blockId === block.id).map(t => [t.id, t.priority ?? Infinity]));
    const plan = tasks.filter(r => !r.done).sort((a, b) => priority.get(a.id) - priority.get(b.id) || a.id - b.id);
    const project = projects.get(block.projectId);
    return {id: block.id, title: block.title, purpose: block.purpose, project: project?.title ?? null,
      done: tasks.length - plan.length, total: tasks.length, mustsLeft: plan.filter(r => r.must).length, plan};
  }).sort((a, b) => (a.plan.length === 0) - (b.plan.length === 0));

  const water = snapshot.body.water;
  const glasses = water.glasses.filter(at => localDay(at) === today).length;
  const meals = snapshot.body.meals.filter(m => localDay(m.at) === today);

  return {today, dateLabel: now.toLocaleDateString('en-US', {weekday: 'long', day: 'numeric', month: 'long'}),
    agenda, upcoming, inbox, doneToday, results: resultCards,
    water: {glasses, goal: water.settings.goal}, meals,
    resultChoices: [...blocks.values()].map(b => ({id: b.id, title: b.title})),
    captures: snapshot.captures.slice(0, 5)};
}

/** The command a quick action sends, built against the snapshot the user is looking at. */
export function commandFor(action, task, snapshot, now = new Date(), id = crypto.randomUUID()) {
  const base = {id, baseRevision: snapshot.revision, createdAt: new Date(now).toISOString()};
  const today = localDay(now);
  const day = n => {
    const target = shiftDay(today, n);
    if (!task.at || task.repeats) return {taskId: task.id, time: null, day: target};
    const at = new Date(task.at), moved = new Date(`${target}T00:00:00`);
    moved.setHours(at.getHours(), at.getMinutes(), 0, 0);
    return {taskId: task.id, time: moved.toISOString(), day: null};
  };
  const args = {
    complete: () => ({taskId: task.id, ...(task.occurrence ? {occurrence: task.occurrence} : {})}),
    uncomplete: () => ({taskId: task.id, ...(task.occurrence ? {occurrence: task.occurrence} : {})}),
    today: () => day(0), tomorrow: () => day(1), unschedule: () => ({taskId: task.id, time: null, day: null}),
    archive: () => ({taskId: task.id}), restore: () => ({taskId: task.id}),
  };
  const type = {today: 'reschedule', tomorrow: 'reschedule', unschedule: 'reschedule'}[action] ?? action;
  return {...base, type, args: args[action]()};
}
