import test from 'node:test';
import assert from 'node:assert/strict';
import {swipeChoice} from './capture-cards.mjs';
import {releaseSide, REVEALS, SWIPE_COMMIT} from './task-swipe.mjs';

const choose = choiceId => ({kind: 'choose', conversationId: 'c1', messageId: 'm1', questionId: 'q1', revision: 1, choiceId});
const open = {id: 'q1', prompt: 'Which one should I delete?', open: true, choices: [{id: 'a', label: 'Call Amma'}, {id: 'b', label: 'Call the bank'}],
  actions: [{label: 'Call Amma', action: choose('a')}, {label: 'Call the bank', action: choose('b')}]};

test('a right swipe on an open "Which one?" picks the first chip, the one marked with a check', () => {
  assert.equal(swipeChoice(open).label, 'Call Amma');
  assert.deepEqual(swipeChoice(open).action, choose('a'), 'the same action a tap on that chip sends');
});

test('an answered or expired question offers no swipe', () => {
  assert.equal(swipeChoice({...open, open: false, actions: []}), null);
  assert.equal(swipeChoice(null), null);
});

test('the swipe picks only past the commit distance, and its reveal says Choose with an icon', () => {
  const sides = {right: {kind: 'choose'}, left: null};
  assert.equal(releaseSide(SWIPE_COMMIT - 1, sides), null);
  assert.equal(releaseSide(SWIPE_COMMIT, sides), 'right');
  assert.equal(releaseSide(-200, sides), null, 'a left swipe does nothing');
  assert.deepEqual(REVEALS.choose, ['check', 'Choose']);
});
