import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan} from './planner-state.mjs';
import {dueSoon, atRisk} from './planner/today.mjs';
import {countdown, timeLeft} from './planner/format.mjs';
import {blockDue} from './planner-state.mjs';

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
  assert.equal(blockDue(d, review)?.value ?? null, '2026-10-04T21:00');
  assert.equal(blockDue(d, quiz)?.value ?? null, '2026-10-06', 'a repeating routine never sets the deadline');
  assert.equal(blockDue(d, loose)?.value ?? null, null);
});

test('Due soon lists open Results due by the end of the third day, soonest first, and drops achieved ones', () => {
  const {d, review, quiz} = seed();
  assert.deepEqual(dueSoon(d, NOW).map(row => row.block.id), [review, quiz]);
  editPlan(d, {type: 'markAchieved', id: review, achieved: true}, NOW);
  assert.deepEqual(dueSoon(d, NOW).map(row => row.block.id), [quiz]);
});

test('countdowns stay coarse, never round up, and say Overdue in words once passed', () => {
  assert.equal(countdown(new Date(+NOW + 40 * 60000), NOW), 'in 40 min');
  assert.equal(countdown(new Date(+NOW + 35 * 3600000), NOW), 'in 35 h');
  assert.equal(countdown(new Date(+NOW + 60 * 3600000), NOW), 'in 2 days');
  assert.equal(countdown(new Date(+NOW - 60000), NOW), 'Overdue');
  assert.equal(timeLeft(new Date(+NOW - 60000), NOW), null);
});

test('At risk: one line per clash cluster, mirrored events are not clashes, and idle Results due by tomorrow', () => {
  const {d, review} = seed();
  const pmdl = block(d, {title: 'PMDL post work', purpose: 'Show what changed'});
  const check = task(d, {title: 'Check the upload format', blockId: pmdl});
  task(d, {title: 'Upload the post work', blockId: pmdl, planned: '2026-10-04T18:29:00.000Z'});
  task(d, {title: 'Upload the workbook', minutes: 15, planned: '2026-10-05T05:00:00.000Z'});
  task(d, {title: 'Sit RM Quiz I', minutes: 60, planned: '2026-10-06T06:00:00.000Z'});
  const at = (iso, hours) => ({start: Date.parse(iso), end: Date.parse(iso) + hours * 3600000});
  const calendar = [
    {id: 'exam', title: 'DAD exam', busy: true, ...at('2026-10-05T03:30:00Z', 1)},
    {id: 'gwbc', title: 'GWBC session', busy: true, ...at('2026-10-05T03:30:00Z', 2)},
    {id: 'quiz', title: 'RM Quiz I in class', busy: true, ...at('2026-10-06T06:00:00Z', 2)},
    {id: 'free', title: 'Library open', busy: false, ...at('2026-10-05T03:30:00Z', 8)},
  ];
  const risks = atRisk(d, {calendar, now: NOW});
  assert.deepEqual(risks.map(r => r.kind), ['unplanned', 'clash']);
  assert.equal(risks[0].block.id, pmdl, 'the review has a task today, so only PMDL is idle');
  assert.equal(risks[0].task.id, check, '"Plan today" dates the first undated task, never the deadline task');
  assert.deepEqual(risks[1].items.map(item => item.title), ['DAD exam', 'GWBC session', 'Upload the workbook']);
  assert.ok(!risks.some(r => r.block?.id === review));
  assert.deepEqual(atRisk(d, {now: NOW}).map(r => r.kind), ['unplanned'], 'without calendar access only the data speaks');
});
