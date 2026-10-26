import test from 'node:test';
import assert from 'node:assert/strict';
import {nextTaskId} from './task-ids.mjs';
import {editPlan, freshPlanner} from './planner-state.mjs';
import {importLegacyEntries} from './legacy-import.mjs';
import {undo, propose} from '../chat-prototype/companion-tools.mjs';

const seed = () => ({entries: [], planner: freshPlanner()});

test('initializes once from entries and every Undo image, excluding the server ID range', () => {
  const data = seed();
  data.entries = [{id: 7}, {id: 1000000007}];
  data.planner.undo = {entries: [{id: 40}]};
  data.undo = {before: {entries: [{id: 20}]}, previous: {before: {entries: [{id: 80}]}}};
  assert.equal(nextTaskId(data), 81);
  data.entries = []; data.undo = null; data.planner.undo = null;
  assert.equal(nextTaskId(data), 82);
  assert.equal(data.sync.nextTaskId, 83);
});

test('planner Undo cannot reuse an allocated ID and never snapshots sync state', () => {
  const data = seed(), first = editPlan(data, {type: 'saveTask', fields: {title: 'First'}});
  assert.equal(data.planner.undo.sync, undefined);
  editPlan(data, {type: 'undo'});
  assert.equal(editPlan(data, {type: 'saveTask', fields: {title: 'Second'}}), first + 1);
});

test('the counter fails clearly when the phone ID range is exhausted', () => {
  const data = {entries: [], sync: {nextTaskId: 999999999}};
  assert.equal(nextTaskId(data), 999999999);
  assert.throws(() => nextTaskId(data), /task ID.*exhausted/i);
});

test('legacy import uses the same durable counter for plans and checkins', () => {
  const data = seed(); data.sync = {nextTaskId: 50};
  importLegacyEntries(data, {entries: [{_id: 1, raw: 'Old plan'}, {_id: 2, raw: 'Old checkin', kind: 'checkin'}]});
  assert.deepEqual(data.entries.map(e => e.id), [50, 51]);
  assert.equal(nextTaskId(data), 52);
});

test('Capture saves its allocated counter and Undo leaves it in place', () => {
  const data = {...seed(), memories: [], history: [], conversations: [], pending: null};
  const args = {operations: [{type: 'create', collection: 'entries', id: null, fields: {title: 'Call Jo'}, evidence: ['Call Jo']}], continuation: false, question: null, choices: []};
  const first = propose(data, args, {raw: 'Call Jo'});
  undo(data, first.undoId);
  assert.equal(propose(data, args, {raw: 'Call Jo'}).entryIds[0], first.entryIds[0] + 1);
});

test('a store with the server range takes IDs from 1,000,000,000 up and never from the phone range', async () => {
  const {nextTaskId, SERVER_TASK_IDS} = await import('./task-ids.mjs');
  const data = {entries: [{id: 5}, {id: 1000000003}], sync: {taskIdRange: SERVER_TASK_IDS}};
  assert.equal(nextTaskId(data), 1000000004);
  const fresh = {entries: [{id: 7}], sync: {taskIdRange: SERVER_TASK_IDS}};
  assert.equal(nextTaskId(fresh), 1000000000);
});

test('a phone store ignores server-range IDs and stays below 1,000,000,000', async () => {
  const {nextTaskId} = await import('./task-ids.mjs');
  assert.equal(nextTaskId({entries: [{id: 5}, {id: 1000000003}]}), 6);
  assert.throws(() => nextTaskId({entries: [], sync: {nextTaskId: 1000000000}}), /exhausted/);
});
