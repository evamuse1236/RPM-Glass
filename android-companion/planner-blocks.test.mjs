import test from 'node:test';
import assert from 'node:assert/strict';
import {deadline, byDeadline, timeLeft} from './planner/blocks.mjs';
import {blockDue} from './planner-state.mjs';

const now = new Date('2026-10-03T12:00');
const data = {entries: [
  {id: 1, blockId: 'a', title: 'Draft', minutes: 120, must: true},
  {id: 2, blockId: 'a', title: 'Submit', minutes: 20, must: true, planned: new Date('2026-10-04T21:00').toISOString()},
  {id: 3, blockId: 'a', title: 'Old', done: true, planned: new Date('2026-10-09T09:00').toISOString()},
  {id: 4, blockId: 'b', title: 'Upload', plannedDate: '2026-10-04'},
  {id: 5, blockId: 'c', title: 'Run', planned: new Date('2026-10-05T07:00').toISOString(), recurrence: 'daily'},
  {id: 6, blockId: 'd', title: 'Hand in', minutes: 300, must: true, planned: new Date('2026-10-03T18:00').toISOString()},
]};
const status = must => ({achieved: false, mustMinutes: must});

test('a Result is due when its latest open, dated, one-time task is', () => {
  assert.equal(blockDue(data, 'a').task.title, 'Submit');
  assert.equal(blockDue(data, 'b').value, '2026-10-04');
  assert.equal(blockDue(data, 'c'), null);
});

test('the deadline counts down and turns tight when the Musts need a quarter of the time left', () => {
  const due = deadline(data, {id: 'a'}, status(140), now);
  assert.equal(due.text, 'Due tomorrow ' + due.at.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) + ' · 33 h left');
  assert.equal(due.tight, false);
  assert.equal(deadline(data, {id: 'd'}, status(300), now).tight, true);
  assert.equal(deadline(data, {id: 'a'}, {...status(140), achieved: true}, now), null);
  assert.equal(timeLeft(new Date('2026-10-08T12:00'), now), '5 days left');
});

test('Blocks sort by urgency: due this week first, then this week’s Results, then the rest', () => {
  const blocks = ['c', 'a', 'b', 'd', 'e'].map(id => ({id}));
  assert.deepEqual(byDeadline(data, blocks, new Set(['e']), now).map(b => b.id), ['d', 'a', 'b', 'e', 'c']);
});
