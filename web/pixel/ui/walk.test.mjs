import test from 'node:test';
import assert from 'node:assert/strict';
import {neighbour, isCorridor, corridorStep, ROOMS} from './walk.mjs';

const box = (left, top, width, height) => ({left, top, width, height});
const wide = {
  week: box(0, 0, 400, 300), inbox: box(0, 340, 400, 500), today: box(440, 0, 560, 840),
  quests: box(1040, 0, 400, 840), capture: box(0, 880, 1440, 300),
};

test('on the wide map arrows walk to the room level with you in that direction', () => {
  assert.equal(neighbour(wide, 'today', 'left'), 'week');
  assert.equal(neighbour(wide, 'today', 'right'), 'quests');
  assert.equal(neighbour(wide, 'week', 'down'), 'inbox');
  assert.equal(neighbour(wide, 'inbox', 'down'), 'capture');
  assert.equal(neighbour(wide, 'capture', 'up'), 'inbox');
  assert.equal(neighbour(wide, 'quests', 'right'), null);
});

test('one column of rooms is a corridor walked in order', () => {
  const column = Object.fromEntries(ROOMS.map((r, i) => [r.id, box(24, i * 600, 340, 560)]));
  assert.equal(isCorridor(column), true);
  assert.equal(isCorridor(wide), false);
  const order = ROOMS.map(r => r.id);
  assert.equal(corridorStep(order, 'today', 1), 'capture');
  assert.equal(corridorStep(order, 'today', -1), 'today');
  assert.equal(corridorStep(order, 'quests', 1), 'quests');
});
