import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initialState, reduce, viewOf, statusText, settled} from './state.mjs';
import {makeCommand, targetKey} from './command.mjs';
import {beforeOf} from './apply.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../../fixtures/snapshot.json', import.meta.url), 'utf8'));
const task = (snapshot, id) => snapshot.tasks.find(t => t.id === id);

function entryFor(snapshot, type, args, extra = {}) {
  const command = makeCommand(type, args, snapshot.revision);
  return {command, status: 'queued', message: null, newRevision: null, label: type, at: 0, key: targetKey(command),
    before: beforeOf(snapshot, command), undoOf: null, undoRequested: false, dismissed: false, ...extra};
}
const ready = () => reduce(initialState(), {type: 'snapshot', snapshot: fixture});

test('a queued command shows at once over the snapshot and marks its plate pending', () => {
  const entry = entryFor(fixture, 'complete', {taskId: 30});
  const state = reduce(ready(), {type: 'queue', entry});
  const view = viewOf(state);
  assert.equal(task(view.snapshot, 30).done, true);
  assert.equal(task(state.snapshot, 30).done, false, 'the phone copy is untouched');
  assert.equal(view.pending.get('task:30'), entry);
  assert.equal(statusText(entry), 'Sending to phone…');
});

test('applied stays pending until the snapshot with its revision arrives', () => {
  const entry = entryFor(fixture, 'complete', {taskId: 30});
  let state = reduce(ready(), {type: 'queue', entry});
  state = reduce(state, {type: 'ack', id: entry.command.id, ack: {status: 'pending', message: 'Waiting for phone', newRevision: null}});
  state = reduce(state, {type: 'status', id: entry.command.id, status: 'applied', message: 'Done', newRevision: 43});
  assert.equal(settled(state.entries[0], state.snapshot), false);
  assert.ok(viewOf(state).pending.has('task:30'));
  const phone = structuredClone(fixture);
  phone.revision = 43;
  task(phone, 30).done = true;
  state = reduce(state, {type: 'snapshot', snapshot: phone});
  assert.equal(settled(state.entries[0], state.snapshot), true);
  assert.equal(viewOf(state).pending.size, 0);
  assert.equal(task(viewOf(state).snapshot, 30).done, true);
});

test('a rejected command leaves the old content and shows the phone\'s reason', () => {
  const entry = entryFor(fixture, 'complete', {taskId: 33});
  let state = reduce(ready(), {type: 'queue', entry});
  state = reduce(state, {type: 'status', id: entry.command.id, status: 'rejected', message: 'This task was deleted there.', newRevision: 42});
  const view = viewOf(state);
  assert.equal(task(view.snapshot, 33).done, false);
  assert.equal(statusText(view.problems.get('task:33')), 'Phone said no: this task was deleted there. Nothing changed here.');
  state = reduce(state, {type: 'dismiss', id: entry.command.id});
  assert.equal(viewOf(state).problems.size, 0);
});

test('a conflict asks to keep the phone version or send again, and final statuses never change', () => {
  const entry = entryFor(fixture, 'reschedule', {taskId: 31, time: '2026-10-19T11:30:00.000Z', day: null});
  let state = reduce(ready(), {type: 'queue', entry});
  state = reduce(state, {type: 'status', id: entry.command.id, status: 'conflict', message: 'The phone changed this at 10:14.', newRevision: 44});
  assert.equal(task(viewOf(state).snapshot, 31).planned, '2026-10-19T10:30:00.000Z');
  assert.equal(statusText(state.entries[0]), "The phone changed this at 10:14. Keep the phone's version, or send yours again?");
  const after = reduce(state, {type: 'status', id: entry.command.id, status: 'applied', newRevision: 45});
  assert.equal(after, state);
});

test('undo of a command not yet sent removes it; undo of a pending one hides its effect until the phone answers', () => {
  const queued = entryFor(fixture, 'complete', {taskId: 30});
  let state = reduce(ready(), {type: 'queue', entry: queued});
  state = reduce(state, {type: 'undo-request', id: queued.command.id});
  assert.equal(state.entries.length, 0);

  const pending = entryFor(fixture, 'complete', {taskId: 30}, {status: 'pending'});
  state = reduce(ready(), {type: 'queue', entry: pending});
  state = reduce(state, {type: 'undo-request', id: pending.command.id});
  const view = viewOf(state);
  assert.equal(task(view.snapshot, 30).done, false);
  assert.equal(statusText(view.pending.get('task:30')), 'Undoing on the phone…');
});

test('undo of an applied command restores what the task looked like before, while the undo waits', () => {
  const phone = structuredClone(fixture);
  phone.revision = 43;
  task(phone, 30).done = true;
  const done = entryFor(fixture, 'complete', {taskId: 30}, {status: 'applied', newRevision: 43});
  let state = reduce(reduce(initialState([done]), {type: 'snapshot', snapshot: phone}), {type: 'queue',
    entry: {...entryFor(phone, 'undo', {commandId: done.command.id}), key: 'task:30', undoOf: done.command.id}});
  assert.equal(task(viewOf(state).snapshot, 30).done, false);
});

test('an older snapshot never replaces a newer one', () => {
  const newer = {...fixture, revision: 50};
  const state = reduce(reduce(initialState(), {type: 'snapshot', snapshot: newer}), {type: 'snapshot', snapshot: fixture});
  assert.equal(state.snapshot.revision, 50);
});
