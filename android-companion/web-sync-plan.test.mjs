import test from 'node:test';
import assert from 'node:assert/strict';
import {seedStore} from '../scripts/gauntlet/seed.mjs';
import {editPlan} from './planner-state.mjs';
import {buildSnapshot} from './web-sync-snapshot.mjs';
import {validateSnapshot} from '../web/contract/validate.mjs';
import {dayTasks} from './planner-ux.mjs';
import {reviewSummary, reviewWeek} from './review-state.mjs';
import {bodyOf} from './body-store.mjs';

const now = new Date('2026-10-19T12:00:00+05:30');

test('snapshot v2 runs the phone queries directly, with recurrence, review, routines, skipped meals and safe activity summaries', () => {
  const data = seedStore(now).data;
  editPlan(data, {type: 'saveTask', fields: {title: 'Chosen days', recurrence: 'days', repeatDays: [1, 3], planned: now.toISOString(), alert: 'reminder', alertLead: 15}}, now);
  editPlan(data, {type: 'saveTask', id: data.entries.at(-1).id, fields: {done: true}}, now);
  editPlan(data, {type: 'saveMeal', meal: {slot: 'lunch', name: 'Lunch skipped', state: 'skipped', at: now.toISOString()}}, now);
  editPlan(data, {type: 'reviewProgress', week: '2026-10-19', patch: {step: 3, clashes: {'2026-10-19|Trace lecture|Rotate token': 'a'}}}, now);
  const snapshot = buildSnapshot(data), store = {entries: snapshot.entries, planner: snapshot.planner};
  assert.equal(snapshot.schemaVersion, 2);
  const ids = value => ({active: value.active.map(t => t.id), completed: value.completed.map(t => t.id), focus: value.focus?.id});
  assert.deepEqual(ids(dayTasks(store, '2026-10-19', +now)), ids(dayTasks(data, '2026-10-19', +now)));
  assert.deepEqual(reviewSummary(store, reviewWeek('2026-10-19'), now), reviewSummary(data, reviewWeek('2026-10-19'), now));
  assert.deepEqual(bodyOf(store).runs, bodyOf(data).runs.map(r => ({...r, skippedDay: !!r.skippedDay})));
  assert.equal(store.planner.body.meals.at(-1).state, 'skipped');
  assert.equal(store.entries.at(-1).alertIntent.lead, 15);
  assert.deepEqual(store.entries.at(-1).repeatDays, [1, 3]);
  assert.ok(!Object.hasOwn(store.planner, 'undo'));
});


test('v2 rejects forbidden and unknown fields at all fixed and identifier-map boundaries', () => {
  const snapshot = buildSnapshot(seedStore(now).data);
  snapshot.planner.weeks['2026-10-19'] = {focus: [], verdicts: {}};
  snapshot.planner.reviews['2026-10-19'] = {step: 1, startedAt: now.toISOString(), updatedAt: now.toISOString(), clashes: {}};
  const paths = [[], ['entries', 0], ['entries', 0, 'alertIntent'], ['planner'], ['planner', 'context'], ['planner', 'body', 'water', 'settings'], ['planner', 'weeks', '2026-10-19'], ['planner', 'reviews', '2026-10-19'], ['planner', 'body', 'routines', 0, 'steps', 0]];
  for (const path of paths) for (const key of ['token', 'traces', 'modelPayload', 'undo', 'history', 'conversations', 'memories', 'unknown']) {
    const copy = structuredClone(snapshot), target = path.reduce((value, k) => value[k], copy);
    target[key] = 'private';
    assert.throws(() => validateSnapshot(copy), /Invalid planner snapshot/, `${path.join('.')}.${key}`);
  }
  const map = structuredClone(snapshot); map.planner.body.mealGuesses.m = {status: 'pending', by: 'Jev', at: now.toISOString(), token: 'leak'};
  assert.throws(() => validateSnapshot(map), /Invalid planner snapshot/);
  assert.throws(() => validateSnapshot({...snapshot, schemaVersion: 1}), /Invalid planner snapshot/);
});
