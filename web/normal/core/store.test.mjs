import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore, initialState, view, taskMarks, waiting, captureReceipts, phoneStatus, settled} from './store.mjs';
import {createController} from './controller.mjs';
import {makeCommand} from './ids.mjs';
import {beforeOf} from './apply.mjs';
import {rebase} from './mock-phone.mjs';
import {fixture, NOW, settle} from './test-kit.mjs';

const loaded = () => {
  const store = createStore(initialState());
  store.dispatch({type: 'loaded', snapshot: rebase(fixture(), NOW), at: NOW});
  return store;
};
const task = (snapshot, id) => snapshot.tasks.find(t => t.id === id);
const queue = (store, type, args) => {
  const command = makeCommand(type, args, {baseRevision: store.get().snapshot.revision, now: NOW});
  store.dispatch({type: 'queued', command, before: beforeOf(store.get().snapshot, command, NOW)});
  return command;
};

test('a queued command shows at once and keeps showing until a snapshot with its revision arrives', () => {
  const store = loaded();
  const c = queue(store, 'complete', {taskId: 33});
  assert.equal(task(view(store.get()), 33).done, true);
  assert.equal(task(store.get().snapshot, 33).done, false);
  assert.equal(taskMarks(store.get()).get(33).status, 'outbox');
  store.dispatch({type: 'sent', id: c.id});
  store.dispatch({type: 'status', id: c.id, status: 'applied', message: 'ok', newRevision: 43});
  const entry = store.get().commands[0];
  assert.equal(settled(store.get(), entry), false);
  assert.equal(task(view(store.get()), 33).done, true, 'applied but the new snapshot is not here yet');
  assert.ok(taskMarks(store.get()).has(33));
  const next = {...store.get().snapshot, revision: 43, tasks: store.get().snapshot.tasks.map(t => (t.id === 33 ? {...t, done: true} : t))};
  store.dispatch({type: 'loaded', snapshot: next, at: NOW});
  assert.equal(taskMarks(store.get()).has(33), false, 'the mark goes once the phone published it');
  assert.equal(waiting(store.get()), 0);
});

test('a rejected command reverts the row and stays marked until dismissed', () => {
  const store = loaded();
  const c = queue(store, 'reschedule', {taskId: 33, time: null, day: '2026-10-20'});
  assert.equal(task(view(store.get()), 33).plannedDate, '2026-10-20');
  store.dispatch({type: 'status', id: c.id, status: 'rejected', message: 'No.'});
  assert.equal(task(view(store.get()), 33).plannedDate, null);
  assert.equal(taskMarks(store.get()).get(33).status, 'rejected');
  store.dispatch({type: 'status', id: c.id, status: 'applied', newRevision: 50});
  assert.equal(store.get().commands[0].status, 'rejected', 'final status is immutable');
  store.dispatch({type: 'dismissed', id: c.id});
  assert.equal(taskMarks(store.get()).has(33), false);
});

test('a conflict shows the phone version with the conflict mark', () => {
  const store = loaded();
  const c = queue(store, 'edit', {taskId: 33, fields: {title: 'Mine'}});
  store.dispatch({type: 'status', id: c.id, status: 'conflict', message: 'Your phone changed this first.', newRevision: 43});
  assert.equal(task(view(store.get()), 33).title, 'Call the bank about the fee refund');
  assert.equal(taskMarks(store.get()).get(33).status, 'conflict');
});

test('an older snapshot never replaces a newer one', () => {
  const store = loaded();
  const old = store.get().snapshot;
  store.dispatch({type: 'loaded', snapshot: {...old, revision: 50}, at: NOW});
  store.dispatch({type: 'loaded', snapshot: old, at: NOW});
  assert.equal(store.get().snapshot.revision, 50);
});

function fakeTransport({cancellable = true} = {}) {
  const sent = [];
  return {sent, send: async command => { sent.push(command); return {status: 'pending', message: 'Waiting for phone'}; },
    cancel: () => cancellable};
}

test('undo of a pending command cancels it locally when the phone has not taken it', async () => {
  const store = loaded(), notes = [];
  const control = createController({store, transport: fakeTransport(), now: () => NOW, notify: n => notes.push(n.text)});
  const c = control.act('complete', {taskId: 33}, 'Task completed');
  await settle();
  control.undo(c.id);
  assert.equal(store.get().commands[0].status, 'cancelled');
  assert.equal(task(view(store.get()), 33).done, false);
  assert.deepEqual(notes, ['Task completed', 'Cancelled before it reached your phone']);
});

test('undo of a command the phone already holds waits for it to apply, then sends undo', async () => {
  const store = loaded(), transport = fakeTransport({cancellable: false});
  const control = createController({store, transport, now: () => NOW});
  const c = control.act('complete', {taskId: 33});
  await settle();
  control.undo(c.id);
  assert.equal(transport.sent.length, 1);
  store.dispatch({type: 'status', id: c.id, status: 'applied', newRevision: 43});
  await settle();
  assert.equal(transport.sent.at(-1).type, 'undo');
  assert.equal(transport.sent.at(-1).args.commandId, c.id);
});

test('undo of an applied command sends an undo command and lays the old values back', async () => {
  const store = loaded(), transport = fakeTransport();
  const control = createController({store, transport, now: () => NOW});
  const c = control.act('move-to-block', {taskId: 24, blockId: 'block-7'});
  await settle();
  store.dispatch({type: 'status', id: c.id, status: 'applied', newRevision: 43});
  const next = {...store.get().snapshot, revision: 43, tasks: store.get().snapshot.tasks.map(t => (t.id === 24 ? {...t, blockId: 'block-7'} : t))};
  store.dispatch({type: 'loaded', snapshot: next, at: NOW});
  control.undo(c.id);
  await settle();
  assert.equal(transport.sent.at(-1).type, 'undo');
  assert.equal(task(view(store.get()), 24).blockId, null);
  assert.equal(taskMarks(store.get()).get(24).type, 'undo');
});

test('offline commands wait in the outbox and send when the browser is back', async () => {
  const store = loaded(), transport = fakeTransport();
  store.dispatch({type: 'online', online: false});
  const control = createController({store, transport, now: () => NOW});
  control.act('log-water', {at: new Date(NOW).toISOString()});
  await settle();
  assert.equal(transport.sent.length, 0);
  assert.equal(view(store.get()).body.water.glasses.length, 4);
  store.dispatch({type: 'online', online: true});
  await settle();
  assert.equal(transport.sent.length, 1);
  assert.equal(store.get().commands[0].status, 'pending');
});

test('capture receipts follow the command, then the phone journal', () => {
  const store = loaded();
  const c = queue(store, 'capture', {text: 'Buy stamps'});
  assert.equal(captureReceipts(store.get())[0].kind, 'sending');
  store.dispatch({type: 'sent', id: c.id});
  assert.equal(captureReceipts(store.get())[0].kind, 'saved');
  store.dispatch({type: 'status', id: c.id, status: 'applied', newRevision: 43});
  assert.equal(captureReceipts(store.get())[0].kind, 'sorting');
  const s = store.get().snapshot;
  store.dispatch({type: 'loaded', at: NOW, snapshot: {...s, revision: 43,
    captures: [{id: c.id, text: 'Buy stamps', status: 'committed', createdAt: c.createdAt, receipt: [{text: 'Added · Buy stamps · Inbox'}]}]}});
  const [row] = captureReceipts(store.get());
  assert.equal(row.kind, 'done');
  assert.deepEqual(row.lines, ['Added · Buy stamps · Inbox']);
});

test('phone status: fresh, stale after 15 minutes, offline', () => {
  const store = loaded();
  assert.equal(phoneStatus(store.get(), NOW).kind, 'fresh');
  assert.equal(phoneStatus(store.get(), NOW + 20 * 60000).kind, 'stale');
  store.dispatch({type: 'online', online: false});
  assert.equal(phoneStatus(store.get(), NOW).kind, 'offline');
});
