/** STUB for the planner branch. The review branch's version replaces this file at merge.
 * Pure functions over the companion store `data`, following the shared contract. */
import {randomUUID} from 'node:crypto';
import {planner, tasks, blockTasks, shiftDay} from './planner-state.mjs';

/** Load-time migration hook; the review branch's version upgrades stored review data. */
export function migrateReviewData() {
  return false;
}

export function weekStart(day) {
  const date = new Date(day + 'T12:00:00');
  return shiftDay(day, -((date.getDay() + 6) % 7));
}

function reviewStore(data) {
  data.planner.review ??= {weeks: {}};
  data.planner.review.weeks ??= {};
  return data.planner.review;
}

/** Record Undo exactly as editPlan does: a full planner snapshot plus an event. */
function recordUndo(data, type, target) {
  const before = {
    entries: structuredClone(data.entries),
    planner: structuredClone({...planner(data), undo: null}),
  };
  const at = new Date().toISOString();
  data.planner.events ??= [];
  data.planner.events.push({id: randomUUID(), at, type, target, fields: []});
  data.planner.events = data.planner.events.slice(-300);
  data.planner.undo = before;
  data.undo = null;
  return at;
}

export function resultStatus(data, blockId) {
  const block = planner(data).blocks.find(b => b.id === blockId);
  const rows = blockTasks(data, blockId);
  const open = rows.filter(task => !task.done);
  const minutes = list => list.reduce((sum, task) => sum + (task.minutes ?? 0), 0);
  return {
    achieved: !!block?.achieved,
    achievedAt: block?.achievedAt ?? null,
    evidence: block?.evidence ?? '',
    done: rows.length - open.length,
    total: rows.length,
    mustMinutes: minutes(open.filter(task => task.must)),
    plannedMinutes: minutes(open),
  };
}

export function markAchieved(data, blockId, {achieved, evidence = ''}) {
  const block = planner(data).blocks.find(b => b.id === blockId);
  if (!block) throw new Error('This Block no longer exists.');
  const at = recordUndo(data, 'markAchieved', blockId);
  block.achieved = !!achieved;
  block.achievedAt = achieved ? at : null;
  block.evidence = achieved ? String(evidence).trim().slice(0, 500) : (block.evidence ?? '');
  return achieved ? 'Result marked achieved' : 'Result marked not achieved';
}

export function weekFocus(data, week) {
  const ids = planner(data).review?.weeks?.[week]?.focus ?? [];
  const live = new Set(planner(data).blocks.filter(b => !b.archived).map(b => b.id));
  return ids.filter(id => live.has(id));
}

export function setWeekFocus(data, week, blockIds) {
  if (!Array.isArray(blockIds) || blockIds.length > 5) throw new Error('Choose up to 5 Results for the week.');
  recordUndo(data, 'setWeekFocus', week);
  const store = reviewStore(data);
  store.weeks[week] = {...store.weeks[week], focus: [...new Set(blockIds)]};
  return blockIds.length ? `${blockIds.length} Results chosen for this week` : 'Weekly Results cleared';
}

function completedIn(task, start, end) {
  const times = (task.completions ?? []).map(c => Date.parse(c.completed));
  const done = (task.revisions ?? []).filter(r => r.snapshot?.done).map(r => Date.parse(r.at));
  return [...times, ...done].some(t => t >= start && t < end);
}

export function reviewSummary(data, week) {
  const lastWeek = shiftDay(week, -7);
  const start = Date.parse(lastWeek + 'T00:00:00');
  const end = Date.parse(week + 'T00:00:00');
  let ids = weekFocus(data, lastWeek);
  if (!ids.length) {
    const active = tasks(data).filter(task => task.blockId && completedIn(task, start, end));
    ids = [...new Set(active.map(task => task.blockId))];
  }
  const blocks = planner(data).blocks;
  const results = ids.map(id => blocks.find(b => b.id === id)).filter(Boolean).map(block => {
    const status = resultStatus(data, block.id);
    const leftovers = blockTasks(data, block.id).filter(task => !task.done).map(task => task.id);
    return {blockId: block.id, title: block.title, purpose: block.purpose ?? '', done: status.done,
      total: status.total, achieved: status.achieved, leftovers};
  });
  const inboxCount = tasks(data).filter(task => !task.done && !task.blockId).length;
  return {week, lastWeek, results, inboxCount};
}
