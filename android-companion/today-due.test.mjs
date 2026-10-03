import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan} from './planner-state.mjs';
import {resultDue, dueSoon, countdown, timeLeft} from './planner/today.mjs';

// Tests run in Asia/Kolkata (scripts/test-tz.mjs). "Now" is Saturday 3 Oct 2026, 10:00.
const NOW = new Date('2026-10-03T10:00:00+05:30');
const block = (d, fields) => editPlan(d, {type: 'saveEntity', collection: 'blocks', fields});
const task = (d, fields) => editPlan(d, {type: 'saveTask', fields}, NOW);

function seed() {
  const d = freshStore();
  const review = block(d, {title: 'Critical review submitted', purpose: 'A calm Sunday'});
  const quiz = block(d, {title: 'Ready for the quiz', purpose: 'Walk in confident'});
  const later = block(d, {title: 'Term paper', purpose: 'Proud of it'});
  const loose = block(d, {title: 'No dates yet', purpose: 'Someday'});
  task(d, {title: 'Draft', blockId: review, planned: '2026-10-03T04:30:00.000Z'});
  task(d, {title: 'Submit', blockId: review, planned: '2026-10-04T15:30:00.000Z'});
  task(d, {title: 'Daily flash cards', blockId: quiz, planned: '2026-10-07T03:30:00.000Z', recurrence: 'daily'});
  task(d, {title: 'Revise', blockId: quiz, plannedDate: '2026-10-06'});
  task(d, {title: 'Final draft', blockId: later, plannedDate: '2026-10-20'});
  task(d, {title: 'Think', blockId: loose});
  return {d, review, quiz, later, loose};
}

test("a Result's deadline is its latest open, dated, one-time task", () => {
  const {d, review, quiz, loose} = seed();
  assert.equal(resultDue(d, review), '2026-10-04T21:00');
  assert.equal(resultDue(d, quiz), '2026-10-06', 'a repeating routine never sets the deadline');
  assert.equal(resultDue(d, loose), null);
});

test('Due soon lists open Results due by the end of the third day, soonest first, and drops achieved ones', () => {
  const {d, review, quiz} = seed();
  assert.deepEqual(dueSoon(d, NOW).map(row => row.block.id), [review, quiz]);
  editPlan(d, {type: 'markAchieved', id: review, achieved: true}, NOW);
  assert.deepEqual(dueSoon(d, NOW).map(row => row.block.id), [quiz]);
});

test('countdowns stay coarse and say Overdue in words once passed', () => {
  assert.equal(countdown(new Date(+NOW + 40 * 60000), NOW), 'in 40 min');
  assert.equal(countdown(new Date(+NOW + 35 * 3600000), NOW), 'in 35 h');
  assert.equal(countdown(new Date(+NOW + 60 * 3600000), NOW), 'in 3 days');
  assert.equal(countdown(new Date(+NOW - 60000), NOW), 'Overdue');
  assert.equal(timeLeft(new Date(+NOW - 60000), NOW), null);
});
