import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './fake-dom.mjs';
installFakeDom();
globalThis.localStorage ??= {getItem: () => null, setItem() {}, removeItem() {}};
const {entityEditor} = await import('./planner/entities.mjs');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Like the real app.commit: it returns undefined while a save runs, and a save takes 40 ms. */
function fakeApp({fail = 0} = {}) {
  const ops = [], opened = [];
  let next = 100;
  const app = {
    saving: false, ops, opened, state: {tab: 'blocks', year: 2026, horizon: 'yearly', period: 1},
    current: () => null, p: () => ({blocks: [], projects: [], goals: [], areas: []}),
    data: () => ({version: 1}), notice() {},
    openBlock: id => opened.push(id), push: (collection, id) => opened.push(id),
    commit: async op => {
      if (app.saving) return undefined;
      app.saving = true;
      await wait(40);
      app.saving = false;
      if (fail > 0) { fail -= 1; throw new Error('offline'); }
      ops.push(op);
      return next++;
    },
  };
  return app;
}

test('two fast taps on New Block make one Block and open it once', async () => {
  const app = fakeApp();
  const first = entityEditor(app, 'blocks');
  await wait(10);
  const second = entityEditor(app, 'blocks');
  await Promise.all([first, second]);
  assert.equal(app.ops.filter(op => op.type === 'saveEntity' && op.id === null).length, 1);
  assert.deepEqual(app.opened, [100]);
});

test('a New Project tap during a New Block save is ignored too', async () => {
  const app = fakeApp();
  const first = entityEditor(app, 'blocks');
  await wait(10);
  const second = entityEditor(app, 'projects');
  await Promise.all([first, second]);
  assert.equal(app.ops.length, 1);
  assert.equal(app.ops[0].collection, 'blocks');
});

test('after a failed create a later tap still creates', async () => {
  const app = fakeApp({fail: 1});
  assert.equal(await entityEditor(app, 'blocks'), undefined);
  assert.equal(app.ops.length, 0);
  await entityEditor(app, 'goals');
  assert.equal(app.ops.length, 1);
  assert.deepEqual(app.opened, [100]);
});
