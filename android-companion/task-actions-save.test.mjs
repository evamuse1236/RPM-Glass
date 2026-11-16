import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom, FakeElement} from './fake-dom.mjs';
const doc = installFakeDom();
globalThis.localStorage ??= {getItem: () => null, setItem() {}, removeItem() {}};
const {deleteTask, archiveTask, duplicateTask, scheduleMenu} = await import('./planner/task-actions.mjs');

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

test('a second tap on Duplicate while the first save runs makes one copy, so one Undo takes it back', async () => {
  const app = fakeApp({savingFor: 60});
  duplicateTask(app, {id: 5, title: 'Call the bank'});
  await new Promise(resolve => setTimeout(resolve, 20));
  duplicateTask(app, {id: 5, title: 'Call the bank'});
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.deepEqual(app.ops.map(op => op.type), ['saveTask']);
  duplicateTask(app, {id: 5, title: 'Call the bank'});
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(app.ops.length, 2, 'a later Duplicate still saves');
});

test('a Schedule menu choice tapped while another save runs saves it once that save ends', async () => {
  // Just enough layout for the menu to place itself; reduced motion so it closes at once.
  Object.assign(FakeElement.prototype, {getBoundingClientRect: () => ({top: 100, bottom: 160, left: 0, right: 384, width: 384}),
    offsetWidth: 200, offsetHeight: 300, isConnected: true});
  Object.defineProperty(FakeElement.prototype, 'style', {get() { return (this._style ??= {setProperty() {}}); }});
  doc.body = new FakeElement('body');
  Object.assign(globalThis, {innerWidth: 384, innerHeight: 800, matchMedia: () => ({matches: true})});
  const app = fakeApp({savingFor: 60});
  app.dom = {sheet: Object.assign(new FakeElement('div'), {hidden: true})};
  scheduleMenu(app, {id: 5, title: 'Call the bank'}, new FakeElement('div'));
  doc.body.querySelector('.schedule-item').click();
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(app.ops.length, 1);
  assert.equal(app.ops[0].type, 'saveTask');
  assert.equal(app.ops[0].id, 5);
});

test('Archive Block tapped while another save runs archives the Block, then goes Back once', async () => {
  const {blockMenu} = await import('./planner/blocks.mjs');
  const app = fakeApp({savingFor: 60});
  let backs = 0;
  app.back = () => { backs++; };
  app.actions = {purposeIdea() {}};
  const archive = blockMenu(app, {id: 7}).find(item => item.label === 'Archive Block');
  archive.onClick();
  archive.onClick();
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.deepEqual(app.ops.map(op => op.type), ['archiveBlock']);
  assert.equal(backs, 1);
  const unsaved = fakeApp();
  unsaved.commit = async () => undefined;
  let unsavedBacks = 0;
  unsaved.back = () => { unsavedBacks++; };
  blockMenu(unsaved, {id: 7}).find(item => item.label === 'Archive Block').onClick();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(unsavedBacks, 0, 'nothing archived, so the page stays');
});
