import test from 'node:test';
import assert from 'node:assert/strict';
import {pressStep, snapStart, snapLength, glassesFor, GLASS_PX, HOLD_LIFT} from './spine-drag.mjs';
import {nearEdge, EDGE} from './task-swipe.mjs';

const run = events => events.reduce((state, event) => pressStep(state, event), null);
const DAY = Date.parse('2026-10-20T00:00:00');
const at = (h, m = 0) => DAY + (h * 60 + m) * 60000;

test('a vertical drag before the 250ms lift scrolls and never moves a card', () => {
  assert.equal(HOLD_LIFT, 250);
  const scrolled = run([{type: 'down', t: 0, x: 200, y: 400}, {type: 'move', t: 120, x: 201, y: 430},
    {type: 'tick', t: 260}, {type: 'move', t: 300, x: 201, y: 500}]);
  assert.equal(scrolled.phase, 'scroll');
  assert.deepEqual(pressStep(scrolled, {type: 'up', t: 400}), {phase: 'idle'}, 'letting go drops nothing');
});

test('a sideways drag before the lift is the row swipe, not a move', () => {
  const swiped = run([{type: 'down', t: 0, x: 200, y: 400}, {type: 'move', t: 100, x: 240, y: 402}, {type: 'tick', t: 300}]);
  assert.equal(swiped.phase, 'swipe');
});

test('held still for 250ms the card lifts, then follows the finger and drops where it is let go', () => {
  const lifted = run([{type: 'down', t: 0, x: 200, y: 400}, {type: 'move', t: 100, x: 202, y: 403}, {type: 'tick', t: 250}]);
  assert.equal(lifted.phase, 'lifted');
  const dragging = run([{type: 'down', t: 0, x: 200, y: 400}, {type: 'tick', t: 250}, {type: 'move', t: 300, x: 260, y: 448}]);
  assert.equal(dragging.phase, 'dragging');
  assert.equal(dragging.dy, 48);
  assert.deepEqual(pressStep(dragging, {type: 'up', t: 400}), {phase: 'idle', drop: 48});
});

test('a lift let go without moving reports how long it was held (the quick menu past 400ms)', () => {
  const state = run([{type: 'down', t: 0, x: 200, y: 400}, {type: 'tick', t: 250}]);
  assert.deepEqual(pressStep(state, {type: 'up', t: 450}), {phase: 'idle', held: 450});
  assert.deepEqual(pressStep(run([{type: 'down', t: 0, x: 0, y: 0}]), {type: 'up', t: 100}), {phase: 'idle'}, 'a tap is a tap');
});

test('the start snaps to 15 minutes at 12dp per step and stays inside the day', () => {
  assert.equal(snapStart(at(10), 0, DAY), at(10));
  assert.equal(snapStart(at(10), 12, DAY), at(10, 15));
  assert.equal(snapStart(at(10), 17, DAY), at(10, 15), 'just past a step rounds to the nearer one');
  assert.equal(snapStart(at(10), -48, DAY), at(9));
  assert.equal(snapStart(at(10, 7), 0, DAY), at(10, 0), 'an off-grid start lands on the grid');
  assert.equal(snapStart(at(0, 30), -200, DAY), DAY);
  assert.equal(snapStart(at(23), 400, DAY), at(23, 45));
});

test('the knurl changes the length in 5-minute steps under 30 minutes and 15-minute steps above', () => {
  assert.equal(snapLength(15, 0), 15);
  assert.equal(snapLength(15, 4), 20);
  assert.equal(snapLength(15, -40), 5);
  assert.equal(snapLength(30, 12), 45);
  assert.equal(snapLength(60, 24), 90);
  assert.equal(snapLength(200, 200), 240);
});

test('no horizontal gesture starts within 24dp of a screen edge', () => {
  assert.equal(EDGE, 24);
  for (const x of [0, 23, 361, 384]) assert.equal(nearEdge(x, 384), true, String(x));
  for (const x of [24, 200, 360]) assert.equal(nearEdge(x, 384), false, String(x));
});

test('a drag across the Water row adds one glass per 24dp and never takes off a saved glass', () => {
  assert.equal(GLASS_PX, 24);
  assert.equal(glassesFor(0, 3), 3);
  assert.equal(glassesFor(23, 3), 3);
  assert.equal(glassesFor(24, 3), 4);
  assert.equal(glassesFor(120, 3), 8);
  assert.equal(glassesFor(-200, 3), 3, 'dragging back stops at what is already logged');
  assert.equal(glassesFor(2000, 3), 30);
});

test('a dragged card\'s label sits 12dp above the card, never over its title, or below it near the top', async () => {
  const {labelTop} = await import('./spine-drag.mjs');
  assert.equal(labelTop(400, 480, 112), 400 - 12 - 28);
  assert.equal(labelTop(150, 230, 112), 230 + 12, 'too close to the top: below the card');
});

test('a long length in the gutter keeps each number with its unit and breaks only between hours and minutes', async () => {
  const {gutterLength} = await import('./spine-model.mjs');
  assert.equal(gutterLength('3 h 55 min'), '3 h 55 min');
  assert.equal(gutterLength('3 h 55 min'), '3 h 55 min');
  assert.equal(gutterLength('45 min'), '45 min');
});

test('the length knurl shows only on timed cards that have not ended', async () => {
  const {hasKnurl} = await import('./spine-drag.mjs');
  assert.equal(hasKnurl({start: 1, past: false}), true, 'a future or running card');
  assert.equal(hasKnurl({start: 1, past: true}), false, 'a past card');
  assert.equal(hasKnurl({start: null, past: false}), false, 'an Anytime card');
  assert.equal(hasKnurl({start: 1, past: false, done: true}), false);
});

test('a meal row\'s reveal has the card\'s outer corners and shows "Log now" only once it fits whole', async () => {
  const {readFileSync} = await import('node:fs');
  const css = readFileSync(new URL('./gestures.css', import.meta.url), 'utf8');
  const reveal = css.match(/\.spine-small > \.swipe-reveal \{([^}]*)\}/)?.[1] ?? '';
  assert.match(reveal, /border-radius: var\(--r-group\) 0 0 var\(--r-group\)/);
  assert.match(reveal, /container-type: inline-size/);
  assert.match(reveal, /white-space: nowrap/);
  assert.match(css, /@container \(inline-size < 7em\) \{ \.spine-small > \.swipe-reveal \.swipe-word \{ visibility: hidden; \} \}/,
    'the word hides below 7em (icon + gap + "Log now"), and the threshold grows with the text');
});
