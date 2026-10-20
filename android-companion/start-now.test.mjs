import test from 'node:test';
import assert from 'node:assert/strict';
import {startNowValue, whenFields} from './planner/task-values.mjs';

const now = new Date(2026, 9, 20, 14, 7, 42);
const at = (h, m) => new Date(2026, 9, 20, h, m).toISOString();

test('Start now makes an open task begin at this minute today', () => {
  assert.deepEqual(startNowValue({title: 'Read', planned: at(17, 30), minutes: 30}, {now}), {day: '2026-10-20', time: '14:07'});
  assert.deepEqual(startNowValue({title: 'Inbox task'}, {now}), {day: '2026-10-20', time: '14:07'}, 'an undated task gets today');
  assert.equal(whenFields(startNowValue({title: 'Read'}, {now})).planned, new Date(2026, 9, 20, 14, 7).toISOString());
});

test('Start now is not offered while the task runs, once it is done, or on a repeating task', () => {
  assert.equal(startNowValue({planned: at(14, 0), minutes: 30}, {now}), null, 'running since 2 PM');
  assert.equal(startNowValue({planned: at(14, 7)}, {now}), null, 'started this minute');
  assert.notEqual(startNowValue({planned: at(13, 0), minutes: 30}, {now}), null, 'ended at 1:30 PM');
  assert.equal(startNowValue({planned: at(17, 0), done: true}, {now}), null);
  assert.equal(startNowValue({planned: at(17, 0)}, {now, repeating: true}), null);
});
