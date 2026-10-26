import test from 'node:test';
import assert from 'node:assert/strict';
import {rebaseUndo, undoImages} from './undo-rebase.mjs';
import {editPlan, freshPlanner} from './planner-state.mjs';
import {projectRecords, applyRecord} from '../web/contract/records.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';

const seed = () => ({entries: [], planner: freshPlanner()});
const image = store => structuredClone({entries: store.entries, planner: {...store.planner, undo: null}});

test('rebases all Undo images and every previous link, preserving phone-only groups', () => {
  const store = seed(), id = editPlan(store, {type: 'saveTask', fields: {title: 'Before', notes: 'Old'}});
  const before = image(store);
  editPlan(store, {type: 'saveTask', id, fields: {title: 'Phone'}});
  store.undo = {id: 'new', before: structuredClone(before), previous: {id: 'old', before: structuredClone(before)}};
  const sent = projectRecords(store).get(`task:${id}`), server = {...sent, notes: 'Website'};
  rebaseUndo(store, [{key: `task:${id}`, sent, server}]);
  assert.equal([...undoImages(store)].length, 3);
  for (const {image} of undoImages(store)) {
    assert.equal(image.entries[0].title, 'Before');
    assert.equal(image.entries[0].notes, 'Website');
    assert.equal(image.sync, undefined);
  }
  applyRecord(store, `task:${id}`, server);
  editPlan(store, {type: 'undo'});
  assert.equal(store.entries[0].title, 'Before');
  assert.equal(store.entries[0].notes, 'Website');
});

test('remote creates and deletes reach every image, including images without a planner', () => {
  const store = seed();
  store.planner.undo = image(store);
  store.undo = {id: 'capture', before: {entries: [{id: 9, kind: 'plan'}], history: [], conversations: []}};
  const task = {id: 7, kind: 'plan', title: 'Remote', revisions: []};
  rebaseUndo(store, [{key: 'task:7', sent: null, server: task}, {key: 'task:9', sent: {id: 9}, server: null}]);
  for (const {image} of undoImages(store)) assert.deepEqual(image.entries.map(e => e.id), [7]);
});

test('drops an invalid Block creation Undo with the specified message', () => {
  const store = seed(), id = editPlan(store, {type: 'saveTask', fields: {title: 'Task'}});
  const block = editPlan(store, {type: 'saveEntity', collection: 'blocks', fields: {title: 'Result'}});
  const sent = projectRecords(store).get(`task:${id}`), server = {...sent, blockId: block};
  rebaseUndo(store, [{key: `task:${id}`, sent, server}]);
  assert.equal(store.planner.undo, null);
  assert.throws(() => editPlan(store, {type: 'undo'}), /This changed on another device\./);
  editPlan(store, {type: 'saveTask', fields: {title: 'New edit'}});
  assert.equal(store.undoMessage, undefined);
});

test('an invalid capture image is removed without losing a valid older Undo', () => {
  const store = seed(), id = editPlan(store, {type: 'saveTask', fields: {title: 'Task'}});
  const block = editPlan(store, {type: 'saveEntity', collection: 'blocks', fields: {title: 'Result'}});
  const invalid = image(store); invalid.planner.blocks = [];
  store.undo = {id: 'bad', before: invalid, previous: {id: 'good', before: image(store)}};
  const sent = projectRecords(store).get(`task:${id}`);
  rebaseUndo(store, [{key: `task:${id}`, sent, server: {...sent, blockId: block}}]);
  assert.equal(store.undo.id, 'good');
  assert.throws(() => undo(store, 'bad'), /This changed on another device\./);
});
