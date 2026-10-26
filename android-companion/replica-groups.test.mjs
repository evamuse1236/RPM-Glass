import test from 'node:test';
import assert from 'node:assert/strict';
import {changedGroups, copyGroups, equal} from './replica-groups.mjs';

test('atomic groups include removed fields and compare object values independent of key order', () => {
  const before = {id: 1, planned: 'time', recurrence: 'daily', notes: 'old'};
  const after = {notes: 'old', id: 1, planned: null};
  assert.deepEqual(changedGroups('task:1', before, after), ['schedule']);
  const target = copyGroups('task:1', {...before, private: true}, after, ['schedule']);
  assert.deepEqual(target, {id: 1, planned: null, notes: 'old', private: true});
  assert.equal(equal({a: 1, b: [2]}, {b: [2], a: 1}), true);
});

test('scalar records have one group, while unknown server kinds have no planner groups', () => {
  assert.deepEqual(changedGroups('glass:time#0', 'old', 'new'), ['value']);
  assert.equal(copyGroups('glass:time#0', 'old', 'new', ['value']), 'new');
  assert.deepEqual(changedGroups('conflict:c', null, {key: 'task:1'}), []);
});
