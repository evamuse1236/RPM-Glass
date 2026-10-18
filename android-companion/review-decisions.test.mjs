import test from 'node:test';
import assert from 'node:assert/strict';
import {editPlan, planner, blockTasks, blockDue} from './planner-state.mjs';
import {markAchieved, inboxTasks, leftoverTasks, decideLeftover, leftoverChoice, groupTask, setMust, focusCandidates, taskDate, groupTasks, addInboxTask} from './review-state.mjs';
import {WEEK, at, block, task, entry, seed} from './review-fixtures.mjs';

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
  assert.equal(groupTask(d, inbox, {title: 'Sort out banking', purpose: 'So bills stop surprising me'}), 'New Result created');
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

test('focusCandidates puts deadlines first, then chosen, carried and active Blocks, and skips achieved ones', () => {
  const {d, rest, home, meals} = seed();
  const idle = block(d, {title: 'Someday Result'});
  const won = block(d, {title: 'Already won'});
  markAchieved(d, won, {achieved: true});
  decideLeftover(d, meals, 'carry', WEEK);
  let ids = focusCandidates(d, WEEK).map(c => c.blockId);
  assert.deepEqual(ids, [home, rest, idle]);
  assert.equal(focusCandidates(d, WEEK)[0].carried, true);
  ids = focusCandidates(d, WEEK, [idle, won]).map(c => c.blockId);
  assert.equal(ids[0], home, 'a deadline leads, picked or not');
  assert.deepEqual(ids.slice(1, 3).sort(), [idle, won].sort(), 'then chosen ones, even when achieved');
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
  assert.deepEqual(focusCandidates(d, WEEK, [rest]).map(c => c.blockId), [exam, home, rest], 'a pick never jumps a deadline');
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
