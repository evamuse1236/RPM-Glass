import test from 'node:test';
import assert from 'node:assert/strict';
import {navDrag} from './nav-drag.mjs';
import {lockAxis, nearEdge} from './task-swipe.mjs';

const slots = [0, 1, 2, 3].map(i => ({left: 7 + i * 84.5, width: 84.5}));

test('dragging along the tab bar picks the tab under the finger', () => {
  assert.equal(navDrag(20, slots, 64).index, 0);
  assert.equal(navDrag(100, slots, 64).index, 1);
  assert.equal(navDrag(200, slots, 64).index, 2);
  assert.equal(navDrag(340, slots, 64).index, 3);
  assert.equal(navDrag(500, slots, 64).index, 3, 'past the end is the last tab');
});

test('the pill follows the finger but stays between the first and last tab', () => {
  assert.equal(navDrag(150, slots, 64).pillX, 118);
  assert.equal(navDrag(0, slots, 64).pillX, 7 + (84.5 - 64) / 2);
  assert.equal(navDrag(400, slots, 64).pillX, 7 + 3 * 84.5 + (84.5 - 64) / 2);
});

test('only a horizontal drag that starts 24dp or more from the screen edge slides the pill; a tap stays a tap', () => {
  assert.equal(lockAxis(4, 0), null);
  assert.equal(lockAxis(12, 2), 'x');
  assert.equal(nearEdge(20, 384), true);
  assert.equal(nearEdge(40, 384), false);
});
