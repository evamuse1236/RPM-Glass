import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../../chat-prototype/companion-state.mjs';
import {editPlan, inboxRows, byProject} from '../../android-companion/planner-state.mjs';

const NOW = new Date('2026-10-03T10:00:00+05:30');
const task = (d, fields) => editPlan(d, {type: 'saveTask', fields}, NOW);

test('wide Blocks keep one run per Project in first-seen order', () => {
  const blocks = [
    {id: 1, projectId: 'a'}, {id: 2, projectId: 'b'}, {id: 3, projectId: 'a'},
    {id: 4}, {id: 5, projectId: 'b'}, {id: 6, projectId: 'a'},
  ];
  assert.deepEqual(byProject(blocks).map(b => b.id), [1, 3, 6, 2, 5, 4]);
  assert.deepEqual(blocks.map(b => b.id), [1, 2, 3, 4, 5, 6]);
});

test('every Inbox count reads the rows the Inbox page lists, repeats included', () => {
  const d = freshStore();
  task(d, {title: 'Call the bank'});
  task(d, {title: 'Stretch', repeatAfterDays: 1, planned: '2026-10-03T04:30:00.000Z'});
  task(d, {title: 'Done thing', done: true});
  const rows = inboxRows(d).map(t => t.title);
  assert.ok(rows.includes('Call the bank'));
  assert.ok(rows.includes('Stretch'));
  assert.ok(!rows.includes('Done thing'));
});
