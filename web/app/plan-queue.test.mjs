import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../fixtures/snapshot.json' with {type: 'json'};
import {validateCommand} from '../contract/validate.mjs';
import {editPlan} from '../../android-companion/planner-state.mjs';
import {withIds} from '../../android-companion/new-id.mjs';
import {completionOp} from '../../android-companion/notch-ops.mjs';
import {createPlanQueue, storeFrom, WAITING, CHANGED} from './plan-queue.mjs';
import {createRamble} from '../../android-companion/voice-turn.mjs';

const FINAL = new Set(['applied', 'rejected', 'conflict']);

function memory() {
  const map = new Map();
  return {getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v)};
}

function fakeClient(snapshot = structuredClone(fixture)) {
  const listeners = new Set();
  const state = {snapshot, outbox: []};
  const emit = () => listeners.forEach(fn => fn(state));
  return {
    state,
    emit,
    sent: () => state.outbox.map(e => e.command),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    settled: entry => FINAL.has(entry.status) && (entry.status !== 'applied' || state.snapshot.revision >= entry.newRevision),
    send(command) { state.outbox.push({command, status: 'pending', message: 'Sending', newRevision: null}); emit(); },
  };
}

function phone(client) {
  const store = storeFrom(client.state.snapshot);
  const applied = new Map();
  return {
    store,
    apply(index, {status = 'applied', message} = {}) {
      const entry = client.state.outbox[index];
      if (status !== 'applied') { Object.assign(entry, {status, message}); client.emit(); return; }
      const {command} = entry;
      const before = structuredClone({entries: store.entries, planner: store.planner});
      if (command.type === 'plan') { withIds(command.args.ids, () => editPlan(store, command.args.op)); applied.set(command.id, before); }
      else Object.assign(store, structuredClone(applied.get(command.args.commandId)));
      const revision = client.state.snapshot.revision + 1;
      Object.assign(entry, {status: 'applied', newRevision: revision});
      client.state.snapshot = {...client.state.snapshot, revision, entries: structuredClone(store.entries), planner: structuredClone(store.planner)};
      client.emit();
    },
  };
}

function setup() {
  const client = fakeClient();
  const queue = createPlanQueue({client, storage: memory(), now: () => new Date('2026-10-19T12:00:00+05:30')});
  queue.start();
  return {client, queue, device: phone(client)};
}

const task = (queue, id) => queue.data().entries.find(e => e.id === id);

test('a change shows at once, is sent as a plan command on the revision the user saw, and stays pending until the snapshot has it', () => {
  const {client, queue, device} = setup();
  queue.commit({type: 'saveTask', id: 3, fields: {done: true}});
  assert.equal(task(queue, 3).done, true);
  const [command] = client.sent();
  assert.deepEqual(validateCommand(command), command);
  assert.equal(command.type, 'plan');
  assert.equal(command.baseRevision, 42);
  assert.ok(queue.pendingIds().has(3));
  device.apply(0);
  assert.equal(queue.pendingIds().size, 0);
  assert.equal(task(queue, 3).done, true);
  assert.equal(queue.data().version, 42);
});

test('every planner action the website offers builds a command the contract accepts', () => {
  const {client, queue} = setup();
  const area = fixture.planner.areas[0];
  const block = fixture.planner.blocks[0];
  const ops = [
    {type: 'saveTask', fields: {title: 'Call the bank', plannedDate: '2026-10-19'}},
    {type: 'moveTask', id: 4, blockId: 'block-2'},
    {type: 'saveEntity', collection: 'blocks', id: block.id, fields: {title: block.title, purpose: 'Because it matters'}},
    {type: 'saveEntity', collection: 'projects', fields: {title: 'Garden'}},
    {type: 'rateAreas', ratings: [{id: area.id, rating: 7}]},
    {type: 'drinkWater', at: '2026-10-19T06:30:00.000Z'},
    {type: 'archiveTask', id: 7},
  ];
  for (const op of ops) queue.commit(op);
  assert.equal(client.sent().length + queue.pendingIds().size > 0, true);
  for (const command of client.sent()) {
    assert.deepEqual(validateCommand(command), command);
    assert.equal(command.baseRevision, 42);
  }
});

test('a function in an operation is refused before anything is sent', () => {
  const {client, queue} = setup();
  assert.throws(() => queue.commit({type: 'batch', ops: [{type: 'saveTask', id: 3, fields: {done: true}}], keepUndo: () => true}));
  assert.equal(client.sent().length, 0);
});

test('a record that exists only in this browser cannot be changed until the phone has saved it', () => {
  const {client, queue, device} = setup();
  queue.commit({type: 'saveTask', fields: {title: 'Call the bank'}});
  const created = queue.data().entries.find(e => e.title === 'Call the bank');
  assert.throws(() => queue.commit({type: 'saveTask', id: created.id, fields: {done: true}}), {message: WAITING});
  assert.equal(client.sent().length, 1);
  device.apply(0);
  queue.commit({type: 'saveTask', id: created.id, fields: {done: true}});
  assert.equal(client.sent().length, 2);
});

test('a second change to the same task waits for the first, then goes out on the newer revision', () => {
  const {client, queue, device} = setup();
  queue.commit({type: 'saveTask', id: 3, fields: {title: 'First'}});
  queue.commit({type: 'saveTask', id: 3, fields: {title: 'Second'}});
  assert.equal(client.sent().length, 1);
  assert.equal(task(queue, 3).title, 'Second');
  device.apply(0);
  assert.equal(client.sent().length, 2);
  assert.equal(client.sent()[1].baseRevision, 43);
  assert.equal(task(queue, 3).title, 'Second');
  device.apply(1);
  assert.equal(queue.pendingIds().size, 0);
  assert.equal(task(queue, 3).title, 'Second');
});

test('Undo of a change the phone has not received drops it; nothing more is sent', () => {
  const {client, queue} = setup();
  queue.commit({type: 'saveTask', id: 3, fields: {title: 'First'}});
  queue.commit({type: 'saveTask', id: 3, fields: {title: 'Second'}});
  queue.commit({type: 'undo'});
  assert.equal(task(queue, 3).title, 'First');
  assert.equal(client.sent().length, 1);
});

test('Undo of a sent change becomes an undo command for it once the phone has applied it', () => {
  const {client, queue, device} = setup();
  queue.commit({type: 'saveTask', id: 3, fields: {done: true}});
  const planId = client.sent()[0].id;
  queue.commit({type: 'undo'});
  assert.equal(task(queue, 3).done, false);
  assert.equal(client.sent().length, 1);
  assert.ok(queue.pendingIds().has(3));
  device.apply(0);
  const undo = client.sent()[1];
  assert.deepEqual(validateCommand(undo), undo);
  assert.deepEqual([undo.type, undo.args.commandId, undo.baseRevision], ['undo', planId, 43]);
  assert.equal(task(queue, 3).done, false);
  device.apply(1);
  assert.equal(queue.pendingIds().size, 0);
  assert.equal(task(queue, 3).done, false);
});

test('a refused change leaves the plan, shows the phone\'s words on that row, and counts as a foreign change', () => {
  const {queue, device} = setup();
  const seen = [];
  queue.subscribe(result => seen.push(result.foreign));
  queue.commit({type: 'saveTask', id: 3, fields: {title: 'Renamed'}});
  device.apply(0, {status: 'conflict', message: 'This task changed on your phone.'});
  assert.equal(task(queue, 3).title, fixture.entries.find(e => e.id === 3).title);
  assert.deepEqual(queue.problems(), [{ids: [3], message: 'This task changed on your phone.'}]);
  assert.equal(seen.at(-1), true);
  assert.equal(queue.data().version, 43);
  queue.dismissProblem(0);
  assert.equal(queue.problems().length, 0);
});

test('a phone-side change is foreign and bumps the version; this browser\'s own saves do not', () => {
  const {client, queue, device} = setup();
  queue.commit({type: 'saveTask', id: 3, fields: {done: true}});
  device.apply(0);
  assert.equal(queue.data().version, 42);
  const entries = structuredClone(client.state.snapshot.entries);
  entries.find(e => e.id === 4).title = 'Edited on the phone';
  client.state.snapshot = {...client.state.snapshot, revision: 44, entries};
  client.emit();
  assert.equal(queue.data().version, 43);
  assert.equal(task(queue, 4).title, 'Edited on the phone');
});

function phoneEdit(client, id, fields) {
  const entries = structuredClone(client.state.snapshot.entries);
  Object.assign(entries.find(e => e.id === id), fields);
  client.state.snapshot = {...client.state.snapshot, revision: client.state.snapshot.revision + 1, entries};
  client.emit();
}

test('Undo after a phone-side change still takes back this browser\'s change, and leaves the phone\'s edit for the server to keep', () => {
  const {client, queue, device} = setup();
  queue.commit({type: 'saveTask', id: 3, fields: {done: true}});
  const planId = client.sent()[0].id;
  device.apply(0);
  phoneEdit(client, 4, {title: 'Edited on the phone'});
  queue.commit({type: 'undo'});
  assert.equal(task(queue, 4).title, 'Edited on the phone');
  const undo = client.sent()[1];
  assert.deepEqual(validateCommand(undo), undo);
  assert.deepEqual([undo.type, undo.args.commandId, undo.baseRevision], ['undo', planId, 44]);
  const entries = structuredClone(client.state.snapshot.entries);
  entries.find(e => e.id === 3).done = false;
  Object.assign(client.state.outbox[1], {status: 'applied', newRevision: 45});
  client.state.snapshot = {...client.state.snapshot, revision: 45, entries};
  const told = [];
  queue.subscribe(result => told.push(result));
  client.emit();
  assert.deepEqual(told.map(r => [r.foreign, r.redraw]), [[false, true]]);
  assert.equal(task(queue, 3).done, false);
  assert.equal(task(queue, 4).title, 'Edited on the phone');
  assert.equal(queue.pendingIds().size, 0);
  assert.throws(() => queue.commit({type: 'undo'}), {message: 'No planning change to undo.'});
});

test('Undo of an unsent change after a phone-side change drops it and keeps the phone\'s edit', () => {
  const {client, queue} = setup();
  queue.commit({type: 'saveTask', id: 3, fields: {title: 'First'}});
  queue.commit({type: 'saveTask', id: 3, fields: {title: 'Second'}});
  phoneEdit(client, 4, {title: 'Edited on the phone'});
  queue.commit({type: 'undo'});
  assert.equal(task(queue, 3).title, 'First');
  assert.equal(task(queue, 4).title, 'Edited on the phone');
  assert.equal(client.sent().length, 1);
});

test('a change the phone refused offers no Undo', () => {
  const {queue, device} = setup();
  queue.commit({type: 'saveTask', id: 3, fields: {done: true}});
  device.apply(0, {status: 'conflict', message: 'This task changed on your phone.'});
  assert.throws(() => queue.commit({type: 'undo'}), {message: 'No planning change to undo.'});
});

test('pending changes survive a reload and are laid over the snapshot again', () => {
  const client = fakeClient();
  const storage = memory();
  const first = createPlanQueue({client, storage});
  first.start();
  first.commit({type: 'saveTask', id: 3, fields: {title: 'Kept'}});
  const again = createPlanQueue({client: {...client, subscribe() {}}, storage});
  again.start();
  assert.equal(again.data().entries.find(e => e.id === 3).title, 'Kept');
  assert.ok(again.pendingIds().has(3));
});

test('a record made in the browser is sent with the ids it was given, so the phone saves it under the same id, on every resend', () => {
  const client = fakeClient(), storage = memory();
  const first = createPlanQueue({client, storage});
  first.start();
  first.commit({type: 'saveEntity', collection: 'projects', fields: {title: 'Made here'}});
  const made = first.data().planner.projects.find(p => p.title === 'Made here');
  const [command] = client.sent();
  assert.deepEqual(validateCommand(command), command);
  assert.equal(command.args.ids[0], made.id);
  const again = createPlanQueue({client: {...client, subscribe() {}}, storage});
  again.start();
  assert.equal(again.data().planner.projects.find(p => p.title === 'Made here').id, made.id);
  const device = phone(client);
  device.apply(0);
  assert.equal(device.store.planner.projects.find(p => p.title === 'Made here').id, made.id);
});

test('a one-time task ticked and then unticked in the browser reaches the phone both times', () => {
  const {client, queue, device} = setup();
  queue.commit(completionOp(task(queue, 3)));
  device.apply(0);
  assert.equal(task(queue, 3).done, true);
  queue.commit(completionOp(task(queue, 3)));
  assert.equal(task(queue, 3).done, false);
  assert.equal(client.sent().length, 2);
  assert.equal(client.sent()[1].args.op.type, 'reopenTask');
  device.apply(1);
  assert.equal(task(queue, 3).done, false);
  assert.equal(queue.pendingIds().size, 0);
});

function ramble(data) {
  let n = 0;
  const r = createRamble({data: structuredClone(data), timeZone: 'Asia/Kolkata', now: () => new Date('2026-10-19T12:00:00+05:30')});
  const call = (name, args = {}) => r.receive({toolCall: {functionCalls: [{id: `c${++n}`, name, args}]}})[0].toolResponse.functionResponses[0].response.result;
  const block = call('save_block', {title: 'Ship the app', purpose: 'Users wait'}).saved;
  const notes = call('save_task', {title: 'Write release notes', blockId: block}).saved;
  const mom = call('save_task', {title: 'Call mom'}).saved;
  call('save_task', {id: mom, title: 'Call mom tonight', start: '2026-10-20T20:00:00+05:30'});
  return {result: r.result(), block, notes, mom};
}

test('a voice ramble is one plan command on the ramble\'s own ids, and one Undo takes all of it back', () => {
  const {client, queue, device} = setup();
  const before = structuredClone(queue.data().entries);
  const {result, block, notes, mom} = ramble(queue.data());
  assert.deepEqual(result.created.sort(), [notes, mom].sort());
  queue.commit(result.batch, {uuids: result.uuids, tasks: result.created});
  assert.equal(client.sent().length, 1);
  const [sent] = client.sent();
  assert.equal(sent.type, 'plan');
  assert.equal(sent.args.exactTaskIds, true);
  assert.deepEqual(sent.args.ids, [...result.uuids, ...queue.data().entries.filter(e => !before.some(b => b.id === e.id)).map(e => e.id)]);
  assert.equal(task(queue, notes).blockId, block);
  assert.equal(task(queue, mom).title, 'Call mom tonight');
  device.apply(0);
  const server = client.state.snapshot.entries;
  assert.equal(server.find(e => e.id === notes)?.blockId, block, 'the server has the task in the new Block');
  assert.equal(server.find(e => e.id === mom)?.title, 'Call mom tonight', 'the server edited the same new task');
  queue.commit({type: 'undo'});
  assert.equal(client.sent().length, 2);
  assert.equal(client.sent()[1].type, 'undo');
  device.apply(1);
  assert.deepEqual(client.state.snapshot.entries, before);
  assert.deepEqual(queue.data().entries, before);
});

test('a ramble worked out on a plan that has since changed is refused before sending, so its words stay the only record', () => {
  const {client, queue} = setup();
  const {result} = ramble(queue.data());
  queue.commit({type: 'saveTask', fields: {title: 'Typed meanwhile'}});
  assert.throws(() => queue.commit(result.batch, {uuids: result.uuids, tasks: result.created}), {message: CHANGED});
  assert.equal(client.sent().length, 1, 'only the typed change was sent');
  assert.equal(queue.data().entries.some(e => e.title === 'Call mom tonight'), false);
});
