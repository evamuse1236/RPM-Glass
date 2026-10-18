import {randomUUID} from 'node:crypto';
import {repeats} from './planner-recurrence.mjs';
import {text, title, one, link} from './planner-fields.mjs';
import {tasks, blockTasks, localDay} from './planner-state.mjs';

/* ---------- Weekly review data (reviewVersion 1) ----------
   Block:   achieved (boolean, only ever set by the user), achievedAt (ISO or null), evidence (the user's words).
   Task:    completedAt (ISO) stamped when a one-time task is completed from now on; never back-filled.
            reviewChoice {week, choice:'carry'|'defer'|'drop', at, cleared?} records a review decision.
   Planner: weeks[week] = {focus:[blockId…≤5], verdicts:{blockId:'achieved'|'partly'|'notyet'}}  (plan data, undoable)
            reviews[week] = {step, startedAt, updatedAt, finishedAt, focusDraft, inboxIds, keptIds, clashes}  (progress, kept on Undo) */
export const REVIEW_VERSION = 1;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const VERDICTS = ['achieved', 'partly', 'notyet'];
const CHOICES = ['carry', 'defer', 'drop'];

function upgradePlannerForReview(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.reviewVersion >= REVIEW_VERSION && p.weeks && p.reviews) return false;
  for (const block of p.blocks ?? []) {
    block.achieved = block.achieved === true;
    block.achievedAt ??= null;
    if (typeof block.evidence !== 'string') block.evidence = '';
  }
  p.weeks ??= {};
  p.reviews ??= {};
  p.reviewVersion = REVIEW_VERSION;
  return true;
}

/** Lossless and idempotent: adds review defaults to the store and to the Undo snapshot. Tasks are untouched. */
export function migrateReviewData(data) {
  if (!data?.planner) return false;
  const changed = upgradePlannerForReview(data.planner);
  const undoChanged = upgradePlannerForReview(data.planner.undo?.planner);
  return changed || undoChanged;
}

export function validateReviewData(p) {
  for (const b of p.blocks) {
    if (b.achieved != null && typeof b.achieved !== 'boolean') throw new Error('Invalid Result status.');
    if (b.achievedAt != null && !Number.isFinite(Date.parse(b.achievedAt))) throw new Error('Invalid Result status.');
    if (b.evidence != null) text(b.evidence, 2000);
  }
  for (const [week, record] of Object.entries(p.weeks ?? {})) {
    if (!DAY.test(week) || !record || typeof record !== 'object') throw new Error('Invalid week plan.');
    const focus = record.focus ?? [];
    if (!Array.isArray(focus) || focus.length > 5 || new Set(focus).size !== focus.length) throw new Error('Choose up to five Results for a week.');
    for (const verdict of Object.values(record.verdicts ?? {})) if (!VERDICTS.includes(verdict)) throw new Error('Invalid Result status.');
  }
}

export function forgetBlockInWeeks(p, blockId) {
  for (const record of Object.values(p.weeks ?? {})) {
    if (Array.isArray(record.focus)) record.focus = record.focus.filter(id => id !== blockId);
    if (record.verdicts) delete record.verdicts[blockId];
  }
}

/** Stamp completion time once, when a one-time task actually becomes done; editing a done task keeps its stamp. */
export function keepCompletionTime(e, old, at) {
  if (repeats(e) || !e.done) return;
  if (!old.done) {
    e.completedAt = at;
    return;
  }
  if ('completedAt' in old) e.completedAt = old.completedAt;
  else delete e.completedAt;
}

function weekRecord(p, week) {
  if (typeof week !== 'string' || !DAY.test(week)) throw new Error('Choose a valid week.');
  p.weeks[week] ??= {focus: [], verdicts: {}};
  p.weeks[week].focus ??= [];
  p.weeks[week].verdicts ??= {};
  return p.weeks[week];
}

function markAchievedOp(next, op, at) {
  const p = next.planner;
  const block = one(p.blocks, op.id);
  if (typeof op.achieved !== 'boolean') throw new Error('Choose whether the Result was achieved.');
  if (op.evidence != null) block.evidence = text(op.evidence, 2000);
  if (op.achieved && !block.achieved) block.achievedAt = at;
  if (!op.achieved) block.achievedAt = null;
  block.achieved = op.achieved;
  if (op.week != null) {
    const verdict = op.verdict ?? (op.achieved ? 'achieved' : 'notyet');
    if (!VERDICTS.includes(verdict) || (verdict === 'achieved') !== op.achieved) throw new Error('Invalid Result status.');
    weekRecord(p, op.week).verdicts[block.id] = verdict;
  }
  return block.id;
}

function setWeekFocusOp(next, op) {
  const p = next.planner;
  if (!Array.isArray(op.ids) || op.ids.length > 5 || new Set(op.ids).size !== op.ids.length) throw new Error('Choose up to five Results for a week.');
  for (const id of op.ids) one(p.blocks, id);
  weekRecord(p, op.week).focus = [...op.ids];
  return op.week;
}

function isBefore(task, week) {
  const day = task.planned ? localDay(task.planned) : task.plannedDate;
  return !!day && day < week;
}

function reviewTaskOp(next, op, at) {
  const p = next.planner;
  if (!CHOICES.includes(op.choice)) throw new Error('Choose carry, defer or drop.');
  const e = one(next.entries, op.id);
  if ((e.kind ?? 'plan') !== 'plan' || e.done) throw new Error('Choose an open task.');
  const previous = e.reviewChoice?.week === op.week ? e.reviewChoice : null;
  const before = {archived: !!e.archived, planned: e.planned ?? null, plannedDate: e.plannedDate ?? null, choice: previous?.choice ?? null};
  weekRecord(p, op.week);
  if (e.archived && op.choice !== 'drop') {
    e.archived = false;
    e.archiveDisposition = null;
    if (e.blockId && !p.blocks.some(b => b.id === e.blockId)) e.blockId = null;
  }
  if (previous?.cleared && op.choice !== 'defer') Object.assign(e, previous.cleared);
  const choice = {week: op.week, choice: op.choice, at};
  if (op.choice === 'defer' && !repeats(e) && isBefore(e, op.week)) {
    choice.cleared = {planned: e.planned ?? null, plannedDate: e.plannedDate ?? null};
    e.planned = null;
    e.plannedDate = null;
  }
  if (op.choice === 'drop') {
    e.archived = true;
    e.archiveDisposition = 'archive';
  }
  e.reviewChoice = choice;
  e.revisions ??= [];
  e.revisions.push({at, reason: 'Weekly review: ' + op.choice, before});
  e.revisions = e.revisions.slice(-100);
  return e.id;
}

function groupTaskOp(next, op, at) {
  const p = next.planner;
  const e = one(tasks(next), op.id);
  let target = op.blockId ?? null;
  if (op.newBlock) {
    const block = {id: randomUUID(), created: at, title: title(op.newBlock.title), purpose: text(op.newBlock.purpose ?? ''), notes: '', projectId: link(p.projects, op.newBlock.projectId), achieved: false, achievedAt: null, evidence: ''};
    p.blocks.push(block);
    target = block.id;
  } else target = link(p.blocks, target);
  const oldBlock = e.blockId ?? null;
  if (oldBlock === target) return target;
  e.blockId = target;
  const rows = blockTasks(next, target).filter(t => t.id !== e.id);
  rows.push(e);
  rows.forEach((t, i) => { t.priority = i + 1; });
  blockTasks(next, oldBlock).forEach((t, i) => { t.priority = i + 1; });
  return target;
}

export const REVIEW_OPS = {markAchieved: markAchievedOp, setWeekFocus: setWeekFocusOp, reviewTask: reviewTaskOp, groupTask: groupTaskOp};
