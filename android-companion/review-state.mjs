// Weekly review: pure queries and Undo-recorded mutations over the companion store.
// Every mutation goes through editPlan, so validation, the single Undo snapshot and the event log
// behave exactly like any other planner edit. Review progress (where the user is in the flow) is
// the only thing saved without Undo, because rewinding it would not restore anything the user made.
import {planner, tasks, blockTasks, blockDue, totals, editPlan, shiftDay, localDay, migrateReviewData} from './planner-state.mjs';
import {repeats} from './planner-recurrence.mjs';
import {DAY, checkDay, dateKey, dueAt} from './review-dates.mjs';
import {oneOff} from './review-planning.mjs';
export {migrateReviewData};
export {weekStart, reviewWeek, taskDate} from './review-dates.mjs';
export {WAKING, freeMinutes, calendarClashes, weekCapacity, placedMusts, mustPlacements, placeMusts, rankResults, clashKey, clashDecision, clashTitle, clashTask, decideClash, clashOp} from './review-planning.mjs';

export const REVIEW_STEPS = 4;

const weeks = data => planner(data).weeks ?? {};
const blockById = (data, id) => planner(data).blocks.find(b => b.id === id) ?? null;

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
  if ((task.reviewActivityDays ?? []).some(inside)) return true;
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
  return op.newBlock ? 'New Result created' : 'Added to ' + blockById(data, blockId).title;
}

/** Moves several tasks in one change with one Undo: into a Block (id), a new Block ({title, purpose}) or the Inbox (null). */
export function groupTasks(data, taskIds, target) {
  if (!taskIds.length) throw new Error('Choose a task first.');
  const blockId = editPlan(data, {type: 'groupTasks', ids: taskIds, ...(target && typeof target === 'object' ? {newBlock: target} : {blockId: target ?? null})});
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
 * Blocks worth choosing for `week`: active, not yet achieved (unless already chosen). Results with a deadline come
 * first, soonest first, picked or not, so an unpicked one due this week sits where it is due. Then, without a
 * deadline: chosen, carried, ones with open tasks, the rest. Pass the choice as it stood when the step opened,
 * so cards don't jump while the user picks.
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
    .sort((a, b) => byDue(a, b) || a.rank - b.rank || b.index - a.index)
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
    // Step 3: Inbox tasks the user chose to leave there (errands). Step 4: clashes decided ('a'|'b') or left 'later'.
    keptIds: Array.isArray(saved?.keptIds) ? saved.keptIds : [],
    clashes: saved?.clashes && typeof saved.clashes === 'object' ? saved.clashes : {},
  };
}

/** Saves navigation progress while preserving the last plan Undo. */
export function saveReviewProgress(data, week, patch, now = new Date()) {
  return editPlan(data, {type: 'reviewProgress', week: checkDay(week), patch}, now);
}

export function finishReview(data, week, focusIds, now = new Date()) {
  editPlan(data, {type: 'finishReview', week: checkDay(week), ids: focusIds}, now);
  return focusIds.length === 1 ? '1 Result for this week' : focusIds.length ? `${focusIds.length} Results for this week` : "Cleared this week's Results";
}
