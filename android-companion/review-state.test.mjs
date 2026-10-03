import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan, migrateReviewData, planner, blockTasks, blockDue, REVIEW_VERSION} from './planner-state.mjs';
import {
  weekStart, reviewWeek, resultStatus, markAchieved, weekFocus, setWeekFocus, weekVerdict, reviewSummary,
  inboxTasks, activeInRange, leftoverTasks, decideLeftover, leftoverChoice, groupTask, setMust,
  focusCandidates, reviewProgress, saveReviewProgress, finishReview, taskDate, groupTasks, addInboxTask,
} from './review-state.mjs';

// Tests run in Asia/Kolkata (scripts/test-tz.mjs). Week of 28 Sep 2026 is the review week; 21 Sep is last week.
const WEEK = '2026-09-28';
const LAST = '2026-09-21';
const at = iso => new Date(iso);

const block = (d, fields) => editPlan(d, {type: 'saveEntity', collection: 'blocks', fields});
const task = (d, fields, now) => editPlan(d, {type: 'saveTask', fields}, now);
const entry = (d, id) => d.entries.find(e => e.id === id);

function seed() {
  const d = freshStore();
  const rest = block(d, {title: 'Make space for rest', purpose: 'So I can think clearly'});
  const home = block(d, {title: 'Have home ready for the week', purpose: 'Calm Mondays'});
  const meals = task(d, {title: 'Prepare a few meals', blockId: home, minutes: 60, must: true, plannedDate: '2026-09-23'});
  const kitchen = task(d, {title: 'Clear the kitchen', blockId: home, minutes: 30, planned: '2026-09-24T12:30:00.000Z'});
  const laundry = task(d, {title: 'Laundry', blockId: home, minutes: 45, plannedDate: '2026-09-30'});
  const walk = task(d, {title: 'Walk without phone', blockId: rest, minutes: 40});
  const inbox = task(d, {title: 'Call the bank'});
  return {d, rest, home, meals, kitchen, laundry, walk, inbox};
}

test('weekStart returns the Monday on or before a day, across months and years', () => {
  assert.equal(weekStart('2026-09-28'), '2026-09-28');
  assert.equal(weekStart('2026-10-04'), '2026-09-28');
  assert.equal(weekStart('2026-10-01'), '2026-09-28');
  assert.equal(weekStart('2027-01-01'), '2026-12-28');
  assert.equal(weekStart('2026-03-01'), '2026-02-23');
  assert.throws(() => weekStart('2026-9-1'));
  assert.throws(() => weekStart(null));
});

test('reviewWeek plans the coming week from Friday to Sunday, the current week otherwise', () => {
  assert.equal(reviewWeek('2026-09-28'), '2026-09-28');
  assert.equal(reviewWeek('2026-10-01'), '2026-09-28');
  assert.equal(reviewWeek('2026-10-02'), '2026-10-05');
  assert.equal(reviewWeek('2026-10-04'), '2026-10-05');
});

test('review migration is lossless and idempotent, including the Undo snapshot', () => {
  const d = freshStore();
  d.entries.push({id: 1, kind: 'plan', title: 'Old done task', done: true, state: 'done', revisions: []});
  d.planner = {schema: 1, projects: [], areas: [], goals: [], events: [], drafts: [], context: {vision: '', goals: '', approved: false},
    blocks: [{id: 'b1', title: 'Legacy Result', purpose: 'Why', notes: 'n', projectId: null, extra: 'kept'}],
    undo: {entries: [], planner: {schema: 1, projects: [], areas: [], goals: [], events: [], drafts: [], blocks: [{id: 'b0', title: 'Older'}]}}};
  const before = structuredClone(d);
  assert.equal(migrateReviewData(d), true);
  const once = JSON.stringify(d);
  assert.equal(migrateReviewData(d), false);
  assert.equal(JSON.stringify(d), once);
  const b = d.planner.blocks[0];
  assert.deepEqual({achieved: b.achieved, achievedAt: b.achievedAt, evidence: b.evidence}, {achieved: false, achievedAt: null, evidence: ''});
  assert.equal(b.extra, 'kept');
  assert.equal(d.planner.reviewVersion, REVIEW_VERSION);
  assert.deepEqual(d.planner.weeks, {});
  assert.deepEqual(d.planner.reviews, {});
  assert.equal(d.planner.undo.planner.blocks[0].achieved, false);
  for (const [k, v] of Object.entries(before.planner.blocks[0])) assert.deepEqual(b[k], v);
  assert.deepEqual(d.entries, before.entries, 'tasks are untouched; no completion time is invented');
  assert.equal(migrateReviewData(freshStore()), false, 'a store without a planner is left alone');
});

test('completing a one-time task stamps completedAt once; reopening clears it; nothing is back-filled', () => {
  const d = freshStore();
  const id = task(d, {title: 'Send the form'});
  editPlan(d, {type: 'saveTask', id, fields: {done: true}}, at('2026-09-22T05:00:00Z'));
  assert.equal(entry(d, id).completedAt, '2026-09-22T05:00:00.000Z');
  editPlan(d, {type: 'saveTask', id, fields: {title: 'Send the signed form', done: true}}, at('2026-09-25T05:00:00Z'));
  assert.equal(entry(d, id).completedAt, '2026-09-22T05:00:00.000Z', 'editing a done task keeps its stamp');
  editPlan(d, {type: 'reopenTask', id});
  assert.equal(entry(d, id).completedAt, null);
  editPlan(d, {type: 'undo'});
  assert.equal(entry(d, id).completedAt, '2026-09-22T05:00:00.000Z');

  d.entries.push({id: 99, kind: 'plan', title: 'Legacy', raw: 'Legacy', done: true, state: 'done', revisions: [], archived: false});
  editPlan(d, {type: 'saveTask', id: 99, fields: {title: 'Legacy renamed', done: true}});
  assert.equal('completedAt' in entry(d, 99), false, 'a legacy done task gets no invented time');

  const daily = task(d, {title: 'Stretch', planned: '2026-09-21T03:00:00.000Z', recurrence: 'daily'});
  editPlan(d, {type: 'saveTask', id: daily, fields: {done: true}, occurrence: '2026-09-21T03:00:00.000Z'}, at('2026-09-21T04:00:00Z'));
  assert.equal(entry(d, daily).completedAt, undefined, 'recurring tasks keep their completions list instead');
  assert.equal(entry(d, daily).completions.length, 1);
});

test('resultStatus counts activity separately from the user-set Result', () => {
  const {d, home, meals, rest} = seed();
  editPlan(d, {type: 'saveTask', id: meals, fields: {done: true}});
  task(d, {title: 'Water plants', blockId: home, planned: '2026-09-21T03:00:00.000Z', recurrence: 'weekly', minutes: 10});
  assert.deepEqual(resultStatus(d, home), {achieved: false, achievedAt: null, evidence: '', done: 1, total: 3, mustMinutes: 0, plannedMinutes: 85});
  assert.equal(resultStatus(d, rest).total, 1);
  assert.throws(() => resultStatus(d, 'missing'), /no longer exists/);
});

test('markAchieved records the verdict, evidence and time with one Undo step', () => {
  const {d, rest, home} = seed();
  const receipt = markAchieved(d, rest, {achieved: true, evidence: 'Two quiet evenings', week: LAST, now: at('2026-09-27T10:00:00Z')});
  assert.equal(receipt, 'Result achieved');
  assert.deepEqual(resultStatus(d, rest).achievedAt, '2026-09-27T10:00:00.000Z');
  assert.equal(resultStatus(d, rest).evidence, 'Two quiet evenings');
  assert.equal(weekVerdict(d, LAST, rest), 'achieved');
  markAchieved(d, rest, {achieved: true, now: at('2026-09-28T10:00:00Z')});
  assert.equal(resultStatus(d, rest).achievedAt, '2026-09-27T10:00:00.000Z', 're-marking keeps the first time');
  assert.equal(resultStatus(d, rest).evidence, 'Two quiet evenings', 'omitted evidence is kept');

  assert.equal(markAchieved(d, home, {achieved: false, week: LAST, verdict: 'partly'}), 'Marked partly achieved');
  assert.equal(weekVerdict(d, LAST, home), 'partly');
  editPlan(d, {type: 'undo'});
  assert.equal(weekVerdict(d, LAST, home), null);

  markAchieved(d, rest, {achieved: false});
  assert.equal(resultStatus(d, rest).achieved, false);
  assert.equal(resultStatus(d, rest).achievedAt, null);
  assert.equal(resultStatus(d, rest).evidence, 'Two quiet evenings', 'evidence is never discarded');
  editPlan(d, {type: 'undo'});
  assert.equal(resultStatus(d, rest).achieved, true);

  const before = JSON.stringify(d);
  assert.throws(() => markAchieved(d, rest, {achieved: 'yes'}));
  assert.throws(() => markAchieved(d, rest, {achieved: true, week: LAST, verdict: 'partly'}));
  assert.throws(() => markAchieved(d, rest, {achieved: true, evidence: 'x'.repeat(2001)}));
  assert.throws(() => markAchieved(d, 'missing', {achieved: true}));
  assert.equal(JSON.stringify(d), before, 'failed marks change nothing');
});

test('weekFocus and setWeekFocus hold 0 to 5 existing Blocks per week with Undo', () => {
  const {d, rest, home} = seed();
  assert.deepEqual(weekFocus(d, WEEK), []);
  assert.equal(setWeekFocus(d, WEEK, [home, rest]), '2 Results for this week');
  assert.deepEqual(weekFocus(d, WEEK), [home, rest]);
  assert.deepEqual(weekFocus(d, LAST), []);
  assert.equal(setWeekFocus(d, WEEK, [rest]), '1 Result for this week');
  editPlan(d, {type: 'undo'});
  assert.deepEqual(weekFocus(d, WEEK), [home, rest]);
  assert.equal(setWeekFocus(d, WEEK, []), "Cleared this week's Results");

  const extra = Array.from({length: 4}, (_, i) => block(d, {title: 'R' + i}));
  const before = JSON.stringify(d);
  assert.throws(() => setWeekFocus(d, WEEK, [home, rest, ...extra]), /five/);
  assert.throws(() => setWeekFocus(d, WEEK, [home, home]), /five/);
  assert.throws(() => setWeekFocus(d, WEEK, ['missing']));
  assert.throws(() => setWeekFocus(d, 'next week', [home]));
  assert.equal(JSON.stringify(d), before);

  setWeekFocus(d, WEEK, [home, rest, ...extra.slice(0, 3)]);
  editPlan(d, {type: 'removeEntity', collection: 'blocks', id: home});
  assert.deepEqual(weekFocus(d, WEEK), [rest, ...extra.slice(0, 3)], 'a removed Block leaves the focus list');
  editPlan(d, {type: 'undo'});
  assert.deepEqual(weekFocus(d, WEEK)[0], home);
});

test('reviewSummary uses last week\'s chosen Results, or Blocks with real activity last week', () => {
  const {d, rest, home, meals, inbox} = seed();
  editPlan(d, {type: 'saveTask', id: meals, fields: {done: true}}, at('2026-09-23T08:00:00Z'));
  let summary = reviewSummary(d, WEEK);
  assert.equal(summary.week, WEEK);
  assert.equal(summary.lastWeek, LAST);
  assert.deepEqual(summary.results.map(r => r.blockId), [home], 'only Blocks with activity last week');
  const [r] = summary.results;
  assert.equal(r.title, 'Have home ready for the week');
  assert.equal(r.purpose, 'Calm Mondays');
  assert.deepEqual([r.done, r.total, r.achieved, r.verdict], [1, 3, false, null]);
  assert.equal(r.leftovers.length, 2);
  assert.equal(summary.inboxCount, 1);

  setWeekFocus(d, LAST, [rest, home]);
  summary = reviewSummary(d, WEEK);
  assert.deepEqual(summary.results.map(x => x.blockId), [rest, home], 'chosen Results win, in chosen order');
  groupTask(d, inbox, home);
  assert.equal(reviewSummary(d, WEEK).inboxCount, 0);
  assert.throws(() => reviewSummary(d, 'soon'));
});

test('activeInRange only trusts recorded facts', () => {
  const from = LAST;
  const to = WEEK;
  assert.equal(activeInRange({completedAt: '2026-09-22T05:00:00Z'}, from, to), true);
  assert.equal(activeInRange({completedAt: '2026-09-28T05:00:00Z'}, from, to), false);
  assert.equal(activeInRange({completions: [{occurrence: '2026-09-10T03:00:00Z', completed: '2026-09-21T03:00:00Z'}]}, from, to), true);
  assert.equal(activeInRange({revisions: [{at: '2026-09-24T03:00:00Z', snapshot: {done: true}}]}, from, to), true);
  assert.equal(activeInRange({revisions: [{at: '2026-09-24T03:00:00Z', snapshot: {done: false}}]}, from, to), false);
  assert.equal(activeInRange({plannedDate: '2026-09-27'}, from, to), true);
  assert.equal(activeInRange({planned: '2026-09-27T20:00:00Z'}, from, to), false, 'local Monday in Kolkata');
  assert.equal(activeInRange({}, from, to), false);
});

test('inboxTasks lists open unplaced one-time tasks only', () => {
  const {d, inbox} = seed();
  const done = task(d, {title: 'Done thing'});
  editPlan(d, {type: 'saveTask', id: done, fields: {done: true}});
  task(d, {title: 'Daily', planned: '2026-09-21T03:00:00.000Z', recurrence: 'daily'});
  assert.deepEqual(inboxTasks(d).map(t => t.id), [inbox]);
});

test('carry, defer and drop are deliberate, reversible and undoable', () => {
  const {d, home, meals, kitchen, laundry} = seed();
  assert.equal(decideLeftover(d, meals, 'carry', WEEK), 'Carried into this week');
  assert.equal(leftoverChoice(entry(d, meals), WEEK), 'carry');
  assert.equal(entry(d, meals).plannedDate, '2026-09-23', 'carry keeps the task as it is');

  assert.equal(decideLeftover(d, meals, 'defer', WEEK), 'Deferred');
  assert.equal(entry(d, meals).plannedDate, null, 'a past day is cleared so it stops showing as overdue');
  decideLeftover(d, meals, 'carry', WEEK);
  assert.equal(entry(d, meals).plannedDate, '2026-09-23', 'changing your mind restores the cleared day');

  decideLeftover(d, laundry, 'defer', WEEK);
  assert.equal(entry(d, laundry).plannedDate, '2026-09-30', 'a future day is kept');
  decideLeftover(d, kitchen, 'defer', WEEK);
  assert.equal(entry(d, kitchen).planned, null);

  assert.equal(decideLeftover(d, kitchen, 'drop', WEEK), 'Dropped. It stays in Archive');
  assert.equal(entry(d, kitchen).archived, true);
  assert.equal(entry(d, kitchen).archiveDisposition, 'archive');
  assert.ok(leftoverTasks(d, home, WEEK).some(t => t.id === kitchen), 'a dropped task stays visible in the review');
  assert.ok(!blockTasks(d, home).some(t => t.id === kitchen));
  editPlan(d, {type: 'undo'});
  assert.equal(entry(d, kitchen).archived, false);
  assert.equal(leftoverChoice(entry(d, kitchen), WEEK), 'defer');
  decideLeftover(d, kitchen, 'drop', WEEK);
  decideLeftover(d, kitchen, 'carry', WEEK);
  assert.equal(entry(d, kitchen).archived, false, 'carry restores a dropped task');
  assert.equal(entry(d, kitchen).planned, '2026-09-24T12:30:00.000Z', 'and restores the time defer cleared');
  assert.ok(entry(d, kitchen).revisions.some(r => r.reason === 'Weekly review: drop'));

  assert.equal(leftoverChoice(entry(d, kitchen), '2026-10-05'), null, 'choices belong to one review week');
  const before = JSON.stringify(d);
  assert.throws(() => decideLeftover(d, kitchen, 'later', WEEK));
  editPlan(d, {type: 'saveTask', id: meals, fields: {done: true}});
  const done = JSON.stringify(d);
  assert.throws(() => decideLeftover(d, meals, 'drop', WEEK), /open task/);
  assert.equal(JSON.stringify(d), done);
  assert.notEqual(before, done);
});

test('groupTask moves an Inbox task to a Block, a new Block, or back, each as one Undo step', () => {
  const {d, home, inbox, meals} = seed();
  assert.equal(groupTask(d, inbox, home), 'Added to Have home ready for the week');
  assert.deepEqual(blockTasks(d, home).map(t => t.id).at(-1), inbox);
  assert.deepEqual(blockTasks(d, home).map(t => t.priority), [1, 2, 3, 4]);
  assert.equal(groupTask(d, inbox, null), 'Moved to Inbox');
  assert.equal(entry(d, inbox).blockId, null);

  const blocksBefore = planner(d).blocks.length;
  assert.equal(groupTask(d, inbox, {title: 'Sort out banking', purpose: 'So bills stop surprising me'}), 'New Block created');
  const created = planner(d).blocks.at(-1);
  assert.equal(planner(d).blocks.length, blocksBefore + 1);
  assert.deepEqual([created.title, created.purpose, created.achieved, created.evidence], ['Sort out banking', 'So bills stop surprising me', false, '']);
  assert.equal(entry(d, inbox).blockId, created.id);
  editPlan(d, {type: 'undo'});
  assert.equal(planner(d).blocks.length, blocksBefore, 'one Undo removes the new Block');
  assert.equal(entry(d, inbox).blockId, null, 'and returns the task to the Inbox');

  const before = JSON.stringify(d);
  assert.throws(() => groupTask(d, inbox, {title: '  '}), /title/);
  assert.throws(() => groupTask(d, inbox, 'missing'));
  assert.equal(JSON.stringify(d), before);
  groupTask(d, meals, null);
  assert.deepEqual(blockTasks(d, home).map(t => t.priority), [1, 2], 'the old Block is renumbered');
});

test('setMust marks a task with Undo', () => {
  const {d, kitchen} = seed();
  assert.equal(setMust(d, kitchen, true), 'Marked Must');
  assert.equal(entry(d, kitchen).must, true);
  editPlan(d, {type: 'undo'});
  assert.ok(!entry(d, kitchen).must);
  assert.equal(setMust(d, kitchen, false), 'No longer a Must');
});

test('focusCandidates puts chosen, then carried, then active Blocks first and skips achieved ones', () => {
  const {d, rest, home, meals} = seed();
  const idle = block(d, {title: 'Someday Result'});
  const won = block(d, {title: 'Already won'});
  markAchieved(d, won, {achieved: true});
  decideLeftover(d, meals, 'carry', WEEK);
  let ids = focusCandidates(d, WEEK).map(c => c.blockId);
  assert.deepEqual(ids, [home, rest, idle]);
  assert.equal(focusCandidates(d, WEEK)[0].carried, true);
  ids = focusCandidates(d, WEEK, [idle, won]).map(c => c.blockId);
  assert.deepEqual(ids.slice(0, 2).sort(), [idle, won].sort(), 'chosen ones lead, even when achieved');
  const first = focusCandidates(d, WEEK)[0];
  assert.deepEqual([first.mustMinutes, first.plannedMinutes, first.purpose], [60, 135, 'Calm Mondays']);
});

test("a Result's deadline is its latest open, dated, one-time task, and step 4 puts the nearest first", () => {
  const {d, rest, home, laundry, kitchen} = seed();
  assert.deepEqual(blockDue(d, home), {value: '2026-09-30', task: entry(d, laundry)});
  assert.equal(blockDue(d, rest), null, 'no dated task, no deadline: nothing is invented');
  task(d, {title: 'Weekly reset', blockId: home, planned: '2026-10-09T04:00:00.000Z', recurrence: 'weekly'});
  editPlan(d, {type: 'saveTask', id: laundry, fields: {done: true}});
  assert.equal(blockDue(d, home).value, '2026-09-24T18:00', 'a timed task in local time; routines and done tasks never count');
  assert.equal(taskDate(entry(d, kitchen)), '2026-09-24T18:00');

  const exam = block(d, {title: 'Ready for the exam'});
  task(d, {title: 'Sit the exam', blockId: exam, planned: '2026-09-23T04:00:00.000Z'});
  const ids = focusCandidates(d, WEEK).map(c => c.blockId);
  assert.deepEqual(ids, [exam, home, rest]);
  assert.equal(focusCandidates(d, WEEK)[0].due, '2026-09-23T09:30');
  assert.deepEqual(focusCandidates(d, WEEK, [rest]).map(c => c.blockId), [rest, exam, home], 'the choice at step entry still leads');
});

test('groupTasks moves several tasks, or starts a new Result from them, as one Undo step', () => {
  const {d, home, inbox} = seed();
  const other = task(d, {title: 'Ask for a new card'});
  const blocksBefore = planner(d).blocks.length;
  assert.equal(groupTasks(d, [inbox, other], {title: 'Sort out banking', purpose: 'So bills stop surprising me'}), 'New Result: Sort out banking');
  const created = planner(d).blocks.at(-1);
  assert.deepEqual(blockTasks(d, created.id).map(t => t.id), [inbox, other]);
  editPlan(d, {type: 'undo'});
  assert.equal(planner(d).blocks.length, blocksBefore, 'one Undo removes the new Block');
  assert.deepEqual([entry(d, inbox).blockId ?? null, entry(d, other).blockId ?? null], [null, null], 'and returns both tasks to the Inbox');
  assert.equal(groupTasks(d, [inbox, other], home), '2 tasks added to Have home ready for the week');
  editPlan(d, {type: 'undo'});
  assert.deepEqual([entry(d, inbox).blockId ?? null, entry(d, other).blockId ?? null], [null, null]);
  assert.throws(() => groupTasks(d, [], home), /Choose a task/);
});

test('addInboxTask saves the exact words as a new Inbox task with Undo', () => {
  const {d} = seed();
  const id = addInboxTask(d, 'Book the GWBC room', at('2026-09-27T10:00:00Z'));
  assert.deepEqual([entry(d, id).raw, entry(d, id).title, entry(d, id).blockId ?? null], ['Book the GWBC room', 'Book the GWBC room', null]);
  assert.ok(inboxTasks(d).some(t => t.id === id));
  editPlan(d, {type: 'undo'});
  assert.equal(entry(d, id), undefined);
  assert.throws(() => addInboxTask(d, '   '), /title/);
});

test('review progress resumes, survives Undo, never consumes the Undo slot, and restarts once finished', () => {
  const {d, home, rest} = seed();
  assert.deepEqual(reviewProgress(d, WEEK), {step: 1, startedAt: null, updatedAt: null, finishedAt: null, focusDraft: null, inboxIds: []});
  markAchieved(d, rest, {achieved: true});
  const undoBefore = JSON.stringify(planner(d).undo);
  saveReviewProgress(d, WEEK, {step: 3, focusDraft: [home], inboxIds: [7]}, at('2026-09-27T10:00:00Z'));
  assert.equal(JSON.stringify(planner(d).undo), undoBefore, 'the last plan change stays undoable');
  const progress = reviewProgress(d, WEEK);
  assert.equal(progress.step, 3);
  assert.deepEqual(progress.focusDraft, [home]);
  assert.deepEqual(progress.inboxIds, [7]);
  assert.equal(progress.startedAt, '2026-09-27T10:00:00.000Z');

  editPlan(d, {type: 'undo'});
  assert.equal(resultStatus(d, rest).achieved, false, 'Undo reverted the plan change');
  assert.equal(reviewProgress(d, WEEK).step, 3, 'but kept the review position');

  assert.throws(() => saveReviewProgress(d, WEEK, {step: 5}));
  assert.throws(() => saveReviewProgress(d, WEEK, {focusDraft: [1, 2, 3, 4, 5, 6]}));

  assert.equal(finishReview(d, WEEK, [home, rest], at('2026-09-27T11:00:00Z')), '2 Results for this week');
  assert.deepEqual(weekFocus(d, WEEK), [home, rest]);
  assert.equal(reviewProgress(d, WEEK).finishedAt, '2026-09-27T11:00:00.000Z');
  assert.equal(reviewProgress(d, WEEK).step, 1, 'reopening a finished review starts at the top');
  editPlan(d, {type: 'undo'});
  assert.deepEqual(weekFocus(d, WEEK), [], 'finishing is undoable like any focus change');

  for (let i = 0; i < 14; i++) saveReviewProgress(d, `2027-01-${String(i + 1).padStart(2, '0')}`, {step: 2});
  assert.equal(Object.keys(planner(d).reviews).length, 12, 'only recent reviews are kept');
});

test('review data survives JSON round trips and validation', () => {
  const {d, home, rest, meals} = seed();
  setWeekFocus(d, WEEK, [home, rest]);
  markAchieved(d, rest, {achieved: true, evidence: 'Slept 8h', week: LAST});
  decideLeftover(d, meals, 'defer', WEEK);
  saveReviewProgress(d, WEEK, {step: 2});
  const copy = JSON.parse(JSON.stringify(d));
  assert.deepEqual(weekFocus(copy, WEEK), [home, rest]);
  editPlan(copy, {type: 'saveEntity', collection: 'areas', fields: {title: 'Health'}});
  assert.equal(resultStatus(copy, rest).evidence, 'Slept 8h');
  copy.planner.weeks[WEEK].verdicts[home] = 'maybe';
  assert.throws(() => editPlan(copy, {type: 'saveEntity', collection: 'areas', fields: {title: 'Work'}}), /Result status/);
});
