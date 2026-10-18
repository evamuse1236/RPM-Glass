import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan, migrateReviewData, planner, REVIEW_VERSION} from './planner-state.mjs';
import {weekStart, reviewWeek, resultStatus, markAchieved, weekFocus, setWeekFocus, weekVerdict, reviewSummary, inboxTasks, activeInRange, decideLeftover, groupTask, reviewProgress, saveReviewProgress, finishReview} from './review-state.mjs';
import {WEEK, LAST, at, block, task, entry, seed} from './review-fixtures.mjs';

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

test('review progress resumes, survives Undo, never consumes the Undo slot, and restarts once finished', () => {
  const {d, home, rest} = seed();
  assert.deepEqual(reviewProgress(d, WEEK), {step: 1, startedAt: null, updatedAt: null, finishedAt: null, focusDraft: null, inboxIds: [], keptIds: [], clashes: {}});
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

test('a Result whose deadline is still ahead is running, not judged; a verdict or a passed deadline closes it', () => {
  const {d, home} = seed();
  setWeekFocus(d, LAST, [home]);
  const now = at('2026-09-27T12:00:00+05:30');
  let [r] = reviewSummary(d, WEEK, now).results;
  assert.deepEqual([r.due, r.running, r.mustMinutes], ['2026-09-30', true, 60]);
  assert.equal(reviewSummary(d, WEEK, at('2026-10-01T09:00:00+05:30')).results[0].running, false, 'deadline passed');
  markAchieved(d, home, {achieved: false, week: LAST, verdict: 'partly'});
  [r] = reviewSummary(d, WEEK, now).results;
  assert.equal(r.running, false, 'a verdict already given stays a verdict');
});
