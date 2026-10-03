// Weekly review: pure queries and Undo-recorded mutations over the companion store.
// Every mutation goes through editPlan, so validation, the single Undo snapshot and the event log
// behave exactly like any other planner edit. Review progress (where the user is in the flow) is
// the only thing saved without Undo, because rewinding it would not restore anything the user made.
import {planner, tasks, blockTasks, blockDue, totals, editPlan, shiftDay, localDay, migrateReviewData} from './planner-state.mjs';
export {migrateReviewData};
import {repeats} from './planner-recurrence.mjs';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const REVIEW_STEPS = 4;

function checkDay(day) {
  if (typeof day !== 'string' || !DAY.test(day) || !Number.isFinite(Date.parse(day + 'T12:00:00'))) {
    throw new Error('Choose a valid day.');
  }
  return day;
}

/** Monday on or before `day` (local 'YYYY-MM-DD'). */
export function weekStart(day) {
  const date = new Date(checkDay(day) + 'T12:00:00');
  const sinceMonday = (date.getDay() + 6) % 7;
  return shiftDay(day, -sinceMonday);
}

/** The week a review held on `day` plans: Friday to Sunday reviews plan the coming week (RPM's Friday or Sunday session). */
export function reviewWeek(day) {
  return weekStart(shiftDay(checkDay(day), 3));
}

const weeks = data => planner(data).weeks ?? {};
const blockById = (data, id) => planner(data).blocks.find(b => b.id === id) ?? null;
const oneOff = rows => rows.filter(t => !repeats(t));

const pad = n => String(n).padStart(2, '0');
/** When a task is dated, as local 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM'; null when it has no date. */
export function taskDate(task) {
  if (task.planned && Number.isFinite(Date.parse(task.planned))) {
    const d = new Date(task.planned);
    return `${localDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return DAY.test(task.plannedDate ?? '') ? task.plannedDate : null;
}
const dateKey = value => (value.length > 10 ? value : value + 'T23:59');
/** A deadline value as a Date: an untimed day ends at 11:59 PM, as in dueInfo. */
const dueAt = value => new Date(dateKey(value));

/** Achievement is the user's call; task counts are activity only. */
export function resultStatus(data, blockId) {
  const block = blockById(data, blockId);
  if (!block) throw new Error('This Block no longer exists.');
  const rows = blockTasks(data, blockId);
  const counted = oneOff(rows);
  const sums = totals(rows);
  return {
    achieved: block.achieved === true,
    achievedAt: block.achieved === true ? block.achievedAt ?? null : null,
    evidence: typeof block.evidence === 'string' ? block.evidence : '',
    done: counted.filter(t => t.done).length,
    total: counted.length,
    mustMinutes: sums.must,
    plannedMinutes: sums.all,
  };
}

/** Records the user's verdict. `verdict` ('achieved'|'partly'|'notyet') and `week` are optional review extras. */
export function markAchieved(data, blockId, {achieved, evidence, week = null, verdict, now = new Date()} = {}) {
  const op = {type: 'markAchieved', id: blockId, achieved, week};
  if (evidence != null) op.evidence = evidence;
  if (week != null) op.verdict = verdict ?? (achieved ? 'achieved' : 'notyet');
  editPlan(data, op, now);
  if (achieved) return 'Result achieved';
  return verdict === 'partly' ? 'Marked partly achieved' : 'Marked not achieved yet';
}

export function weekFocus(data, week) {
  const focus = weeks(data)[checkDay(week)]?.focus ?? [];
  return focus.filter(id => blockById(data, id));
}

export function setWeekFocus(data, week, blockIds) {
  editPlan(data, {type: 'setWeekFocus', week: checkDay(week), ids: blockIds});
  const n = blockIds.length;
  if (!n) return "Cleared this week's Results";
  return n === 1 ? '1 Result for this week' : `${n} Results for this week`;
}

/** The verdict given for `blockId` in the review of `week` (the week reviewed), or null. */
export function weekVerdict(data, week, blockId) {
  return weeks(data)[week]?.verdicts?.[blockId] ?? null;
}

/** Open tasks with no Block: what the review means by Inbox. Repeating routines are not Inbox items. */
export function inboxTasks(data) {
  return tasks(data)
    .filter(t => (t.blockId ?? null) === null && !t.done && !repeats(t))
    .sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || a.id - b.id);
}

function dayOf(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return DAY.test(value) ? value : localDay(value);
}

/** Real evidence of activity in [from, to): completion stamps, recurring completions, a revision that recorded done, or a planned day. */
export function activeInRange(task, from, to) {
  const inside = value => {
    const day = dayOf(value);
    return !!day && day >= from && day < to;
  };
  if (inside(task.completedAt)) return true;
  if ((task.completions ?? []).some(c => inside(c.completed))) return true;
  if ((task.revisions ?? []).some(r => r.snapshot?.done === true && inside(r.at))) return true;
  return inside(task.planned) || inside(task.plannedDate);
}

function lastWeekBlocks(data, lastWeek, week) {
  const chosen = weekFocus(data, lastWeek);
  if (chosen.length) return chosen;
  const ids = new Set();
  for (const t of tasks(data)) {
    if (t.blockId && activeInRange(t, lastWeek, week)) ids.add(t.blockId);
  }
  return planner(data).blocks.filter(b => ids.has(b.id) && !b.archived).map(b => b.id);
}

/** Open one-time tasks of the Block, plus tasks this review dropped (so the choice can still be changed). */
export function leftoverTasks(data, blockId, week) {
  const dropped = data.entries.filter(t => t.archived && t.blockId === blockId && t.reviewChoice?.week === week && t.reviewChoice.choice === 'drop');
  const open = oneOff(blockTasks(data, blockId)).filter(t => !t.done);
  return [...open, ...dropped];
}

/**
 * Last week's Results. A Result whose deadline is still ahead (and has no verdict yet) is `running`:
 * its window hasn't closed, so the review offers to carry it rather than asking whether it happened.
 */
export function reviewSummary(data, week, now = new Date()) {
  checkDay(week);
  const lastWeek = shiftDay(week, -7);
  const results = lastWeekBlocks(data, lastWeek, week).map(blockId => {
    const block = blockById(data, blockId);
    const status = resultStatus(data, blockId);
    const due = blockDue(data, blockId)?.value ?? null;
    const verdict = weekVerdict(data, lastWeek, blockId) ?? (status.achieved ? 'achieved' : null);
    return {
      blockId,
      title: block.title,
      purpose: block.purpose ?? '',
      done: status.done,
      total: status.total,
      achieved: status.achieved,
      due,
      running: !verdict && !!due && dueAt(due) > now,
      mustMinutes: status.mustMinutes,
      verdict,
      evidence: status.evidence,
      leftovers: leftoverTasks(data, blockId, week).map(t => t.id),
    };
  });
  return {week, lastWeek, results, inboxCount: inboxTasks(data).length};
}

/** Carry keeps the task as it is; Defer clears a schedule that is already in the past; Drop archives (recoverable). */
export function decideLeftover(data, taskId, choice, week) {
  editPlan(data, {type: 'reviewTask', id: taskId, choice, week: checkDay(week)});
  if (choice === 'drop') return 'Dropped. It stays in Archive';
  return choice === 'defer' ? 'Deferred' : 'Carried into this week';
}

export function leftoverChoice(task, week) {
  return task.reviewChoice?.week === week ? task.reviewChoice.choice : null;
}

/** Put a task under an existing Block (`target` is its id), a new Block ({title, purpose}), or back in the Inbox (null). */
export function groupTask(data, taskId, target) {
  const op = {type: 'groupTask', id: taskId};
  if (target && typeof target === 'object') op.newBlock = target;
  else op.blockId = target ?? null;
  const blockId = editPlan(data, op);
  if (!blockId) return 'Moved to Inbox';
  return op.newBlock ? 'New Block created' : 'Added to ' + blockById(data, blockId).title;
}

/** Moves several tasks in one change with one Undo: into a Block (id), a new Block ({title, purpose}) or the Inbox (null). */
export function groupTasks(data, taskIds, target) {
  if (!taskIds.length) throw new Error('Choose a task first.');
  let undo = null, blockId = target ?? null;
  for (const id of taskIds) {
    groupTask(data, id, blockId);
    undo ??= planner(data).undo;
    if (blockId && typeof blockId === 'object') blockId = data.entries.find(t => t.id === id).blockId;
  }
  data.planner.undo = undo;
  const n = taskIds.length === 1 ? 'Task' : `${taskIds.length} tasks`;
  if (!blockId) return `${n} moved to Inbox`;
  const name = blockById(data, blockId).title;
  return target && typeof target === 'object' ? 'New Result: ' + name : `${n} added to ${name}`;
}

/** Quick add from the review: a new Inbox task saved in the user's own words, through the planner's saveTask. */
export function addInboxTask(data, title, now = new Date()) {
  return editPlan(data, {type: 'saveTask', fields: {title}}, now);
}

export function setMust(data, taskId, must) {
  editPlan(data, {type: 'saveTask', id: taskId, fields: {must}});
  return must ? 'Marked Must' : 'No longer a Must';
}

/**
 * Blocks worth choosing for `week`: active, not yet achieved (unless already chosen). Chosen ones lead,
 * then Results by deadline (soonest first), then carried ones, then ones with open tasks.
 * Pass the choice as it stood when the step opened, so cards don't jump while the user picks.
 */
export function focusCandidates(data, week, chosen = weekFocus(data, week)) {
  const picked = new Set(chosen);
  const carried = new Set(data.entries.filter(t => leftoverChoice(t, week) === 'carry' && !t.archived).map(t => t.blockId));
  const rank = b => (picked.has(b.id) ? 0 : carried.has(b.id) ? 1 : blockTasks(data, b.id).some(t => !t.done) ? 2 : 3);
  const key = c => (c.due ? dateKey(c.due) : '~'); // '~' sorts after every date
  const byDue = (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  return planner(data).blocks
    .filter(b => !b.archived && (picked.has(b.id) || b.achieved !== true))
    .map((b, index) => ({block: b, index, rank: rank(b), due: blockDue(data, b.id)?.value ?? null}))
    .sort((a, b) => Number(a.rank > 0) - Number(b.rank > 0) || byDue(a, b) || a.rank - b.rank || b.index - a.index)
    .map(({block, due}) => ({
      blockId: block.id,
      title: block.title,
      purpose: block.purpose ?? '',
      carried: carried.has(block.id),
      due,
      ...resultStatus(data, block.id),
    }));
}

/** Where the user is in this week's review. A finished review starts again from step 1, with its decisions kept. */
export function reviewProgress(data, week) {
  const saved = planner(data).reviews?.[checkDay(week)] ?? null;
  return {
    step: saved && !saved.finishedAt ? Math.min(REVIEW_STEPS, Math.max(1, saved.step ?? 1)) : 1,
    startedAt: saved?.startedAt ?? null,
    updatedAt: saved?.updatedAt ?? null,
    finishedAt: saved?.finishedAt ?? null,
    focusDraft: Array.isArray(saved?.focusDraft) ? saved.focusDraft.filter(id => blockById(data, id)) : null,
    inboxIds: Array.isArray(saved?.inboxIds) ? saved.inboxIds : [],
  };
}

const PROGRESS_KEYS = ['step', 'finishedAt', 'focusDraft', 'inboxIds'];

/** Saves progress without touching Undo: the last plan change stays undoable. Keeps the 12 most recent reviews. */
export function saveReviewProgress(data, week, patch, now = new Date()) {
  checkDay(week);
  data.planner ??= structuredClone(planner(data));
  migrateReviewData(data);
  const reviews = data.planner.reviews;
  const at = now.toISOString();
  const record = reviews[week] ?? {step: 1, startedAt: at};
  for (const key of PROGRESS_KEYS) if (key in patch) record[key] = patch[key];
  if (record.step != null && (!Number.isInteger(record.step) || record.step < 1 || record.step > REVIEW_STEPS)) {
    throw new Error('Invalid review step.');
  }
  if (record.focusDraft != null && (!Array.isArray(record.focusDraft) || record.focusDraft.length > 5)) {
    throw new Error('Choose up to five Results for a week.');
  }
  record.updatedAt = at;
  reviews[week] = record;
  for (const old of Object.keys(reviews).sort().slice(0, -12)) delete reviews[old];
  return null;
}

export function finishReview(data, week, focusIds, now = new Date()) {
  const receipt = setWeekFocus(data, week, focusIds);
  saveReviewProgress(data, week, {step: REVIEW_STEPS, finishedAt: now.toISOString(), focusDraft: null}, now);
  return receipt;
}

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
 * Whether the picked Results' Must work fits. Each checkpoint is a deadline (deadlines within 6 hours share one),
 * or the end of the week for Results without one this week, and compares the Must time due by then with the free
 * time from now until then. `events` is null when the calendar isn't connected: Must time is still shown, free time isn't.
 * `days` runs from today to the week's Sunday, with each day's free time, deadlines and clashes.
 */
export function weekCapacity(chosen, events, week, now = new Date()) {
  const end = new Date(shiftDay(checkDay(week), 7) + 'T00:00');
  const points = chosen.map(c => {
    const at = c.due ? dueAt(c.due) : null;
    return at && at < end ? {at, value: c.due, must: c.mustMinutes} : {at: end, value: null, must: c.mustMinutes};
  }).sort((a, b) => a.at - b.at);
  const checkpoints = [];
  let must = 0;
  points.forEach((p, i) => {
    must += p.must;
    const next = points[i + 1];
    if (next && next.at - p.at < 6 * 36e5 && (next.value || !p.value)) return;
    const free = events ? (p.at > now ? freeMinutes(events, now, p.at) : 0) : null;
    checkpoints.push({at: p.at, value: p.value, must, free, over: free != null && must > free, tight: free != null && must > free / 2});
  });
  const clashes = events ? calendarClashes(events, now, end) : [];
  const days = [];
  for (let day = localDay(now); day < shiftDay(week, 7); day = shiftDay(day, 1)) {
    const from = new Date(day + 'T00:00'), to = new Date(shiftDay(day, 1) + 'T00:00');
    const here = checkpoints.filter(c => c.value && c.at >= from && c.at < to);
    days.push({
      day,
      free: events ? freeMinutes(events, new Date(Math.max(+now, +from)), to) : null,
      deadlines: here.length,
      over: here.some(c => c.over),
      clash: clashes.some(c => c.day === day),
    });
  }
  return {checkpoints, days, clashes};
}
