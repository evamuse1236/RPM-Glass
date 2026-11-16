import test from 'node:test';
import assert from 'node:assert/strict';
import {retryOnChange, changedUnderneath} from './save-retry.mjs';
import {commit} from './planner/app.mjs';
import {persist} from './planner/inline-edit.mjs';

test('a save that meets a newer version reloads and runs again', async () => {
  let runs = 0, reloads = 0;
  const result = await retryOnChange(async () => {
    if (++runs === 1) throw new Error('Saved context changed. Reopen RPM before retrying.');
    return 'saved';
  }, async () => { reloads++; });
  assert.equal(result, 'saved');
  assert.deepEqual([runs, reloads], [2, 1]);
});

test('other failures and a third conflict reach the caller', async () => {
  await assert.rejects(retryOnChange(async () => { throw new Error('Context exceeds 16 MB'); }, async () => {}), /16 MB/);
  let runs = 0;
  await assert.rejects(retryOnChange(async () => { runs++; throw Object.assign(new Error('x'), {code: 'VERSION_CONFLICT'}); }, async () => {}));
  assert.equal(runs, 3);
  assert.equal(changedUnderneath(new Error('Saved data changed while editing.')), true);
});

// A planner add met by another save in flight: block-add clears the field and shows a pending row, then persist().
const plannerApp = () => {
  const app = {saving: true, pending: [], notices: [], saved: [], sheet: {version: 1, epoch: 0},
    dom: {sheet: {hidden: true}}, data: () => ({version: 1}),
    api: {commit: async op => { app.saved.push(op); return 7; }}, notice: text => app.notices.push(text)};
  app.commit = (op, options) => commit(app, op, options);
  return app;
};
const addOp = {type: 'saveTask', fields: {title: 'Call the bank before 5', blockId: 3}};

test('a planner add waits out an earlier save longer than a second, then saves once and drops its pending row', async () => {
  const app = plannerApp();
  const pending = {op: addOp};
  app.pending.push(pending);
  setTimeout(() => { app.saving = false; }, 1200);
  const id = await persist(app, addOp, {label: '', keepSheet: true, pending, render: false});
  assert.equal(id, 7);
  assert.deepEqual(app.saved, [addOp]);
  assert.deepEqual(app.pending, []);
});

test('a planner add that can never start rejects with a message, never resolving as if saved', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const app = plannerApp();
  let outcome = null;
  persist(app, addOp, {label: '', keepSheet: true, render: false})
    .then(id => { outcome = {id}; }, error => { outcome = {error}; });
  for (let i = 0; i < 2000 && !outcome; i++) {
    t.mock.timers.tick(50);
    await new Promise(done => setImmediate(done));
  }
  assert.ok(outcome?.error, `persist resolved ${JSON.stringify(outcome)} without saving`);
  assert.equal(app.saved.length, 0);
  assert.deepEqual(app.notices, [outcome.error.message]);
});
