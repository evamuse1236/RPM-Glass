import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './fake-dom.mjs';
installFakeDom();
globalThis.localStorage ??= {getItem: () => null, setItem() {}, removeItem() {}};
const {deleteTask, archiveTask} = await import('./planner/task-actions.mjs');

/** A planner whose commit, like app.commit, does nothing and returns undefined while another save runs. */
function fakeApp({savingFor = 0} = {}) {
  const entries = [{id: 5, title: 'Call the bank', kind: 'plan'}];
  const ops = [];
  const app = {
    saving: savingFor > 0, ops,
    data: () => ({entries}),
    commit: async op => {
      if (app.saving) return undefined;
      app.saving = true;
      await new Promise(resolve => setTimeout(resolve, 5));
      ops.push(op);
      const entry = entries.find(e => e.id === op.id);
      if (entry && op.type === 'archiveTask') entry.archived = true;
      app.saving = false;
      return op.id;
    },
  };
  if (savingFor) setTimeout(() => { app.saving = false; }, savingFor);
  return app;
}

test('Delete or Archive tapped while another save runs waits for it and then saves', async () => {
  const app = fakeApp({savingFor: 60});
  assert.equal(await deleteTask(app, {id: 5}, {keepSheet: false}), true);
  assert.deepEqual(app.ops.map(op => op.type), ['archiveTask']);
  const second = fakeApp({savingFor: 60});
  assert.equal(await archiveTask(second, {id: 5}), true);
  assert.deepEqual(second.ops.map(op => op.disposition), ['archive']);
});

test('Delete reports false when nothing was saved', async () => {
  const app = fakeApp();
  app.commit = async () => undefined;
  assert.equal(await deleteTask(app, {id: 5}, {keepSheet: false}), false);
  assert.equal(await archiveTask(app, {id: 5}), false);
});

test('a second tap on Delete while the first waits sends one archive, so one Undo', async () => {
  const app = fakeApp({savingFor: 60});
  const results = await Promise.all([deleteTask(app, {id: 5}, {keepSheet: false}), deleteTask(app, {id: 5}, {keepSheet: false})]);
  assert.deepEqual(results.toSorted(), [false, true]);
  assert.equal(app.ops.length, 1);
});
