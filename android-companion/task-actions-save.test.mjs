import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom, FakeElement} from './fake-dom.mjs';
const doc = installFakeDom();
globalThis.localStorage ??= {getItem: () => null, setItem() {}, removeItem() {}};
const {deleteTask, archiveTask, duplicateTask, undoLastCompletion, scheduleMenu} = await import('./planner/task-actions.mjs');
const {editPlan} = await import('./planner-state.mjs');

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

test('a tick on a second task while the first tick saves waits and saves both; a double tap on one saves once', async () => {
  const {toggleDone} = await import('./planner/task-row.mjs');
  const app = fakeApp({savingFor: 60});
  Object.assign(app, {recentlyCompleted: new Map(), render() {}, api: {native: async () => {}},
    dom: {work: new FakeElement('div'), sheet: Object.assign(new FakeElement('div'), {hidden: true})}});
  const a = {id: 1, title: 'A', done: false};
  const b = {id: 2, title: 'B', done: false};
  const results = await Promise.all([toggleDone(app, a), toggleDone(app, b), toggleDone(app, a)]);
  assert.deepEqual(results, [true, true, false]);
  assert.deepEqual(app.ops.map(op => [op.type, op.id, op.fields.done]), [['saveTask', 1, true], ['saveTask', 2, true]]);
});

test('Delete on an Area tapped while another save runs deletes it, then goes Back once', async () => {
  const {removeEntity} = await import('./planner/entities.mjs');
  const areas = [{id: 'a1', title: 'Health'}];
  const app = fakeApp({savingFor: 60});
  const commit = app.commit;
  app.commit = async (op, options) => {
    const id = await commit(op, options);
    if (id !== undefined) areas.splice(areas.findIndex(a => a.id === op.id), 1);
    return id;
  };
  app.p = () => ({areas});
  let backs = 0;
  app.back = () => { backs++; };
  removeEntity(app, 'areas', 'a1');
  removeEntity(app, 'areas', 'a1');
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.deepEqual(app.ops, [{type: 'removeEntity', collection: 'areas', id: 'a1'}]);
  assert.equal(backs, 1);
  const unsaved = fakeApp();
  unsaved.commit = async () => undefined;
  unsaved.p = () => ({areas: [{id: 'a1', title: 'Health'}]});
  let unsavedBacks = 0;
  unsaved.back = () => { unsavedBacks++; };
  await removeEntity(unsaved, 'areas', 'a1');
  assert.equal(unsavedBacks, 0, 'nothing deleted, so the page stays');
});

test('Restore in Archive tapped while another save runs restores the Block and the task once each', async () => {
  const {showTrash} = await import('./planner/task-lists.mjs');
  const app = fakeApp({savingFor: 60});
  const blocks = [{id: 'b1', title: 'Old', archived: true}];
  const entries = [{id: 7, title: 'Pay rent', kind: 'plan', archived: true, archiveDisposition: 'archive'}];
  Object.assign(app, {p: () => ({blocks}), data: () => ({entries, version: 1}), sheet: {epoch: 0},
    api: {}, dom: {sheet: Object.assign(new FakeElement('div'), {hidden: true}), planner: new FakeElement('div')}});
  new FakeElement('div').append(app.dom.sheet);
  // Just enough of a sheet and its scrim for the real openSheet to open the Archive.
  Object.assign(app.dom.sheet, {before() {}, contains: () => false, toggleAttribute() {}});
  const scrim = Object.assign(new FakeElement('button'), {hidden: true, nextElementSibling: app.dom.sheet});
  for (const node of [app.dom.sheet, scrim]) node.style.removeProperty ??= () => {};
  const getElementById = doc.getElementById;
  doc.getElementById = id => id === 'sheet-scrim' ? scrim : getElementById?.call(doc, id) ?? null;
  showTrash(app, true);
  const all = node => [node, ...(node.children ?? []).flatMap(all)];
  const restores = all(app.dom.sheet).filter(n => n.tagName === 'button' && n.textContent.trim() === 'Restore');
  assert.equal(restores.length, 2);
  for (const restore of restores) { restore.click(); restore.click(); }
  await new Promise(resolve => setTimeout(resolve, 250));
  doc.getElementById = getElementById;
  assert.deepEqual(app.ops, [{type: 'archiveBlock', id: 'b1', archived: false}, {type: 'restoreTask', id: 7}]);
});

test('Undo last completion tapped twice while the first save runs takes back one completion, and Undo restores it', async () => {
  const data = {entries: [], version: 1};
  const occ = day => new Date(`2026-11-${day}T08:00:00`).toISOString();
  const id = editPlan(data, {type: 'saveTask', fields: {title: 'Walk', planned: occ(14), recurrence: 'daily'}}, new Date('2026-11-14T10:00:00'));
  editPlan(data, {type: 'saveTask', id, fields: {done: true}, occurrence: occ(14)}, new Date('2026-11-14T10:00:00'));
  editPlan(data, {type: 'saveTask', id, fields: {done: true}, occurrence: occ(15)}, new Date('2026-11-15T10:00:00'));
  const walk = () => data.entries.find(e => e.id === id);
  const app = {
    saving: false, notice() {},
    data: () => data,
    commit: async op => {
      if (app.saving) return undefined;
      app.saving = true;
      await new Promise(resolve => setTimeout(resolve, 20));
      try { return editPlan(data, JSON.parse(JSON.stringify(op)), new Date('2026-11-16T09:00:00')); } finally { app.saving = false; }
    },
  };
  undoLastCompletion(app, structuredClone(walk()));
  undoLastCompletion(app, structuredClone(walk()));
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.deepEqual(walk().completedOccurrences, [occ(14)], 'one tap takes back one completion');
  editPlan(data, {type: 'undo'}, new Date('2026-11-16T09:01:00'));
  assert.deepEqual(walk().completedOccurrences, [occ(14), occ(15)], 'Undo restores the completion taken back');
  undoLastCompletion(app, structuredClone(walk()));
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(walk().completedOccurrences, [occ(14)], 'a later tap still takes back the latest completion');
});
