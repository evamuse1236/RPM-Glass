import test from 'node:test';
import assert from 'node:assert/strict';
import {lockAxis, swipeSide, releaseSide, rowOffset, SWIPE_LOCK, SWIPE_COMMIT, REVEALS} from './task-swipe.mjs';
import {draggedAway} from './planner/sheet.mjs';
import {stripStart} from './planner/today-header.mjs';

const rowSides = {right: {kind: 'done'}, left: {kind: 'schedule'}};

test('nothing locks until the finger has moved 8px', () => {
  assert.equal(SWIPE_LOCK, 8);
  for (const [dx, dy] of [[0, 0], [7, 0], [-7, 7], [0, -7]]) assert.equal(lockAxis(dx, dy), null);
});

test('a mostly horizontal drag is the row swipe; anything else stays the page scroll', () => {
  assert.equal(lockAxis(9, 0), 'x');
  assert.equal(lockAxis(-12, 4), 'x');
  assert.equal(lockAxis(0, 9), 'y');
  assert.equal(lockAxis(10, 10), 'y');
  assert.equal(lockAxis(11, 10), 'y', 'a slanted drag needs a clear horizontal lead');
  assert.equal(lockAxis(13, -10), 'x');
});

test('swipe right completes and swipe left schedules, only past the commit distance', () => {
  assert.equal(SWIPE_COMMIT, 90);
  assert.equal(releaseSide(90, rowSides), 'right');
  assert.equal(rowSides[releaseSide(90, rowSides)].kind, 'done');
  assert.equal(rowSides[releaseSide(-140, rowSides)].kind, 'schedule');
  for (const dx of [0, 89, -89, 30]) assert.equal(releaseSide(dx, rowSides), null);
});

test('a side without an action never fires and the row stays at rest toward it', () => {
  const rightOnly = {right: {kind: 'done'}, left: null};
  assert.equal(releaseSide(-200, rightOnly), null);
  assert.equal(rowOffset(-60, rightOnly, 360), 0);
  assert.equal(rowOffset(60, rightOnly, 360), 60);
});

test('the row follows the finger 1:1, up to 80% of its width', () => {
  assert.equal(rowOffset(40, rowSides, 360), 40);
  assert.equal(rowOffset(-120, rowSides, 360), -120);
  assert.equal(rowOffset(500, rowSides, 360), 288);
  assert.equal(rowOffset(-500, rowSides, 360), -288);
  assert.equal(swipeSide(0), null);
});

test('a dragged sheet leaves past 30% of its height or faster than 0.8 px/ms, otherwise it settles back', () => {
  assert.equal(draggedAway(91, 300, 0.1), true);
  assert.equal(draggedAway(89, 300, 0.79), false);
  assert.equal(draggedAway(20, 300, 0.81), true);
});

test('a day change keeps the head still only inside the shown week', () => {
  const today = '2026-10-18';
  assert.equal(stripStart('2026-10-24', today), today);
  assert.equal(stripStart('2026-10-25', today), '2026-10-25');
  assert.equal(stripStart('2026-10-17', today), '2026-10-11');
});

test('every reveal names its action in words as well as an icon', () => {
  for (const [kind, [symbol, word]] of Object.entries(REVEALS)) {
    assert.ok(symbol && word, kind);
  }
  assert.deepEqual(REVEALS.done, ['check', 'Done']);
  assert.deepEqual(REVEALS.schedule, ['event_upcoming', 'Schedule']);
});

test('an Inbox row swiped left offers Today and Tomorrow 9:00 AM before Move to Block', async () => {
  const {schedulePresets} = await import('./planner/task-values.mjs');
  const presets = schedulePresets({day: '', time: ''}, new Date(2026, 9, 20, 10, 0));
  assert.equal(presets[0].key, 'today');
  assert.deepEqual(presets[0].value, {day: '2026-10-20', time: ''});
  assert.deepEqual(presets.find(p => p.key === 'morning').value, {day: '2026-10-21', time: '09:00'});
  assert.equal(presets.some(p => p.key === 'none'), false, 'an undated task is not offered No date');
});
