import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan, planner} from './planner-state.mjs';
import {WHEEL, ratingAt, wedgeAt, radiusFor, wedgePath, averageOf, saveRating} from './planner/life-wheel.mjs';

test('a drag maps distance from the centre to a whole rating: the hub is 0, the rim 10', () => {
  assert.equal(ratingAt(WHEEL.inner), 0);
  assert.equal(ratingAt(WHEEL.outer), 10);
  assert.equal(ratingAt((WHEEL.inner + WHEEL.outer) / 2), 5);
  assert.equal(ratingAt(radiusFor(7) + 3), 7, 'a finger a little past a ring still reads that ring');
  assert.equal(ratingAt(radiusFor(7) + 6), 8);
  assert.equal(ratingAt(0), 0);
  assert.equal(ratingAt(WHEEL.outer + 40), 10);
  for (let r = 0; r <= 10; r++) assert.equal(ratingAt(radiusFor(r)), r);
});

test('the wedge under the finger is counted clockwise from twelve o\'clock', () => {
  assert.equal(wedgeAt(0, -50, 4), 0);
  assert.equal(wedgeAt(50, 0, 4), 1);
  assert.equal(wedgeAt(0, 50, 4), 2);
  assert.equal(wedgeAt(-50, 0, 4), 3);
  assert.equal(wedgeAt(-1, -50, 5), 4);
  assert.equal(wedgeAt(30, 30, 1), 0);
});

test('a wedge fills from the hub to its rating; unrated draws nothing; one Area is a ring', () => {
  assert.equal(wedgePath(0, 4, radiusFor(null)), '');
  assert.equal(wedgePath(0, 4, radiusFor(0)), '');
  assert.match(wedgePath(1, 4, radiusFor(7)), new RegExp(`A${radiusFor(7)} ${radiusFor(7)} `));
  assert.equal((wedgePath(0, 1, radiusFor(10)).match(/A/g) ?? []).length, 4);
  assert.equal(averageOf([7, null, 4]), '5.5');
  assert.equal(averageOf([null]), null);
});

test('the rating saves on release as one rateAreas change with its receipt, and Undo puts it back', async () => {
  const d = freshStore();
  const id = editPlan(d, {type: 'saveEntity', collection: 'areas', fields: {title: 'Health'}});
  const area = () => planner(d).areas.find(a => a.id === id);
  editPlan(d, {type: 'rateAreas', ratings: [{id, rating: 5}]});
  const commits = [];
  const app = {saving: false, commit: async (op, options) => { commits.push([op, options]); editPlan(d, op); }};
  assert.equal(await saveRating(app, area(), 5), false, 'letting go on the same rating saves nothing');
  assert.equal(commits.length, 0);
  await saveRating(app, area(), 7);
  assert.deepEqual(commits, [[{type: 'rateAreas', ratings: [{id, rating: 7}]}, {label: 'Health rated 7'}]]);
  assert.equal(area().rating, 7);
  editPlan(d, {type: 'undo'});
  assert.equal(area().rating, 5);
});
