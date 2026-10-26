import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlanner} from './planner-validation.mjs';
import {freshPlanner} from './planner-state.mjs';

test('validation refuses a task linked to an absent Block without repairing or changing the store', () => {
  const store = {entries: [{id: 1, kind: 'plan', blockId: 'missing'}], planner: freshPlanner()};
  const before = structuredClone(store);
  assert.throws(() => validatePlanner(store));
  assert.deepEqual(store, before);
  store.planner.blocks.push({id: 'missing', title: 'Result'});
  assert.equal(validatePlanner(store), store);
});

test('planning operations accept JSON data and refuse executable mutators', async () => {
  const {assertPlanOp} = await import('./planner-validation.mjs');
  assert.doesNotThrow(() => assertPlanOp({type: 'saveTask', fields: {title: 'Plan', minutes: null}}));
  assert.throws(() => assertPlanOp({type: 'saveTask', mutate: () => {}}), /JSON data ops/);
});
