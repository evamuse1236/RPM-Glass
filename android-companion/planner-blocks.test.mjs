import test from 'node:test';
import assert from 'node:assert/strict';
import {deadline, byDeadline, planByTime} from './planner/blocks.mjs';
import {timeLeft, clock} from './planner/format.mjs';
import {blockDue} from './planner-state.mjs';
import {dropIndex} from './planner/task-row.mjs';
import {entityFields} from './planner/inline-edit.mjs';
import {newFields} from './planner/entities.mjs';

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
  assert.equal(due.text, 'Due tomorrow ' + clock(due.at) + ' · 33\u00a0h\u00a0left');
  assert.equal(due.tight, false);
  assert.equal(deadline(data, {id: 'd'}, status(300), now).tight, true);
  assert.equal(deadline(data, {id: 'a'}, {...status(140), achieved: true}, now), null);
  assert.equal(timeLeft(new Date('2026-10-08T12:00'), now), '5 days');
});

test('Blocks sort by urgency: due this week first, then this week’s Results, then the rest', () => {
  const blocks = ['c', 'a', 'b', 'd', 'e'].map(id => ({id}));
  assert.deepEqual(byDeadline(data, blocks, new Set(['e']), now).map(b => b.id), ['d', 'a', 'b', 'e', 'c']);
});

test('Sort by time puts the dated open tasks in time order and leaves undated and completed ones in place', () => {
  const at = hm => new Date(`2026-10-03T${hm}`).toISOString();
  const rows = [
    {id: 1, title: 'Draft'}, {id: 2, title: 'Old', done: true, planned: at('08:00')},
    {id: 3, title: 'Submit', planned: new Date('2026-10-04T23:00').toISOString()}, {id: 4, title: 'Notes'},
    {id: 5, title: 'Finish', planned: at('10:00')}, {id: 6, title: 'Call', planned: at('16:00')},
    {id: 7, title: 'Print', plannedDate: '2026-10-03'},
  ];
  assert.deepEqual(planByTime(rows), [1, 2, 5, 4, 6, 7, 3]);
});

test('a lifted Plan row takes a slot once its leading edge passes that row’s middle, tall or short', () => {
  const centers = [30, 90, 150, 210, 282];
  assert.equal(dropIndex(centers, 4, 300, 360), 4);
  assert.equal(dropIndex(centers, 4, 205, 289), 3);
  assert.equal(dropIndex(centers, 4, 24, 108), 0);
  assert.equal(dropIndex(centers, 0, 0, 60), 0);
  assert.equal(dropIndex(centers, 0, 40, 100), 1);
  assert.equal(dropIndex(centers, 0, 200, 260), 3);
  assert.equal(dropIndex(centers, 0, 240, 300), 4);
});

test('editing one field in place sends every field saveEntity needs, so nothing else is wiped', () => {
  const block = {id: 'b', title: 'Census ready', purpose: 'Real data', notes: 'Site list', projectId: 'p'};
  assert.deepEqual(entityFields('blocks', block, {purpose: 'We present 2021 data'}),
    {title: 'Census ready', purpose: 'We present 2021 data', notes: 'Site list', projectId: 'p'});
  const goal = {id: 'g', title: 'Run', year: 2026, horizon: 'quarterly', period: 4, areaId: 'a'};
  assert.deepEqual(entityFields('goals', goal, {horizon: 'yearly', period: 2}),
    {title: 'Run', purpose: '', notes: '', areaId: 'a', year: 2026, horizon: 'yearly', period: null});
  assert.deepEqual(entityFields('projects', {id: 'p', title: 'Term 1'}), {title: 'Term 1', purpose: '', notes: '', goalId: null});
});

test('a new record starts from where it was made: the Project page, the Blocks filter, the Life period', () => {
  const state = {blockFilter: 'f', horizon: 'quarterly', period: 11, year: 2026, lifeFilter: 'a'};
  assert.equal(newFields('blocks', {}, state, {kind: 'projects', id: 'p'}).projectId, 'p');
  assert.equal(newFields('blocks', {}, state, null).projectId, 'f');
  assert.equal(newFields('blocks', {projectId: 'x'}, state, null).projectId, 'x');
  assert.equal(newFields('blocks', {}, state, null).title, 'New Result');
  assert.deepEqual(newFields('goals', {}, state), {title: 'New Goal', purpose: '', notes: '', areaId: 'a', year: 2026,
    horizon: 'quarterly', period: 4});
  assert.equal(newFields('goals', {}, {...state, horizon: 'values'}).period, null);
});
