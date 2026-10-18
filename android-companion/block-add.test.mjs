import test from 'node:test';
import assert from 'node:assert/strict';
import {inboxMatches} from './planner/block-add.mjs';

const task = (id, title, extra = {}) => ({id, title, blockId: null, done: false, ...extra});
const inbox = [task(1, 'Buy oat milk'), task(2, 'Email Prof about extension'), task(3, 'Make 20 flash cards'),
  task(4, 'Print flash set'), task(5, 'Flashcards for ch. 3'), task(6, 'Old flash notes', {done: true}),
  task(7, 'Flash drive', {blockId: 9}), task(8, 'Flash sale', {archived: true}), task(9, 'Flash mob')];

test('typing finds Inbox tasks whose words start with every typed word, case-blind, at most four', () => {
  assert.deepEqual(inboxMatches(inbox, 'FLASH').map(t => t.id), [3, 4, 5, 9]);
  assert.deepEqual(inboxMatches(inbox, 'fla car').map(t => t.id), [3]);
  assert.deepEqual(inboxMatches(inbox, 'lash').map(t => t.id), []);
});

test('tasks in a Block, done or archived are never offered', () => {
  const ids = inboxMatches(inbox, 'flash', {limit: 10}).map(t => t.id);
  for (const id of [6, 7, 8]) assert.ok(!ids.includes(id), `task ${id}`);
});

test('an empty field offers the three newest Inbox tasks', () => {
  assert.deepEqual(inboxMatches(inbox, '  ').map(t => t.id), [9, 5, 4]);
});
