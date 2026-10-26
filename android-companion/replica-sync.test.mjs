import test from 'node:test';
import assert from 'node:assert/strict';
import {syncReplica, localChanges} from './replica-sync.mjs';
import {projectRecords} from '../web/contract/records.mjs';
import {editPlan} from './planner-state.mjs';
import {fakeServer, phone, seed, day} from './test/replica-server.mjs';

const run = (p, server, options = {}) => syncReplica({load: p.load, save: p.save, push: server.push, pull: server.pull, now: () => new Date(day(5)), ...options});
const add = (p, title, at = day(1)) => p.edit(data => editPlan(data, {type: 'saveTask', fields: {title}}, new Date(at)), at);
const task = (p, id) => p.data.entries.find(e => e.id === id);

test('first sync pulls before seeding, then three offline days converge with server edits', async () => {
  const p = phone(), server = fakeServer(); let pulled = false;
  add(p, 'Original');
  await run(p, server, {pull: async body => {pulled = true; return server.pull(body); }, push: body => {assert.equal(pulled, true); return server.push(body); }});
  assert.equal(server.pushes[0].changes.every(c => c.baseRev === null), true);
  p.edit(data => editPlan(data, {type: 'saveTask', id: 1, fields: {title: 'Phone title'}}, new Date(day(1))), day(1));
  server.write('task:1', {...server.rows.get('task:1').value, notes: 'Website notes'}, day(2));
  add(p, 'Second offline day', day(2));
  p.edit(data => editPlan(data, {type: 'saveTask', id: 1, fields: {minutes: 45}}, new Date(day(3))), day(3));
  server.write('task:1000000001', {...server.rows.get('task:1').value, id: 1000000001, title: 'Website create'}, day(3));
  await run(p, server);
  assert.deepEqual(projectRecords(p.data), server.project());
  assert.equal(task(p, 1).title, 'Phone title');
  assert.equal(task(p, 1).notes, 'Website notes');
  assert.equal(task(p, 1).minutes, 45);
  assert.deepEqual(localChanges(p.data), []);
});

test('an edit during the network trip and a CAS retry survive with their own stamp', async () => {
  const p = phone(), server = fakeServer(); add(p, 'Original'); await run(p, server);
  p.edit(data => {data.entries[0].title = 'Sent';}, day(1));
  let edited = false, conflicted = false;
  await run(p, server, {
    push: async body => {const receipt = await server.push(body); if (!edited) {edited = true; p.edit(data => {data.entries[0].title = 'During trip';}, day(4));} return receipt;},
    save: async (expected, next, options) => {
      if (next.sync.outbox === null && !conflicted) {conflicted = true; p.edit(data => {data.entries[0].notes = 'CAS edit';}, day(4));}
      return p.save(expected, next, options);
    },
  });
  assert.equal(task(p, 1).title, 'During trip');
  assert.equal(task(p, 1).notes, 'CAS edit');
  assert.equal(p.data.sync.stamps['task:1'].title, day(4));
  assert.equal(p.data.sync.stamps['task:1'].notes, day(4));
  await run(p, server);
  assert.deepEqual(projectRecords(p.data), server.project());
});

test('restore suppresses deletes and pulls newer server-only records', async () => {
  const p = phone(), server = fakeServer(); add(p, 'Original'); await run(p, server);
  server.write('task:1000000001', {...server.rows.get('task:1').value, id: 1000000001, title: 'New server task'}, day(3));
  await run(p, server);
  p.edit(data => {data.entries = []; data.sync.restoredAt = day(4);}, day(0));
  assert.equal(localChanges(p.data).some(c => c.value === null), false);
  await run(p, server);
  assert.equal(server.rows.get('task:1000000001').value.title, 'New server task');
  assert.equal(task(p, 1000000001).title, 'New server task');
  assert.equal(p.data.sync.restoredAt, undefined);
  assert.deepEqual(projectRecords(p.data), server.project());
});

test('reinstall adopts server base without deletes and stale phone values lose to newer stamps', async () => {
  const original = phone(), server = fakeServer(); add(original, 'Old phone'); await run(original, server);
  const backup = structuredClone(original.data); delete backup.sync; backup.syncSavedAt = day(0);
  server.write('task:1', {...server.rows.get('task:1').value, title: 'New website title'}, day(3));
  server.write('task:1000000001', {...server.rows.get('task:1').value, id: 1000000001}, day(3));
  const reinstalled = phone(backup), count = server.pushes.length;
  await run(reinstalled, server);
  const changes = server.pushes.slice(count).flatMap(body => body.changes);
  assert.deepEqual(changes.map(c => c.key), ['task:1']);
  assert.equal(changes[0].stamps.title, day(0));
  assert.equal(changes[0].value.title, 'Old phone');
  assert.equal(task(reinstalled, 1).title, 'New website title');
  assert.deepEqual(projectRecords(reinstalled.data), server.project());
});

test('localChanges uses dependency order, per-group stamps and syncSavedAt fallback', () => {
  const data = seed();
  data.entries = [{id: 1, kind: 'plan', title: 'Task'}];
  for (const [collection, id] of [['areas', 'a'], ['goals', 'g'], ['projects', 'p'], ['blocks', 'b']]) data.planner[collection].push({id, title: id});
  data.sync = {base: {}, stamps: {'task:1': {title: day(2)}}};
  const changes = localChanges(data);
  assert.deepEqual(changes.slice(0, 4).map(c => c.key), ['area:a', 'goal:g', 'project:p', 'block:b']);
  assert.equal(changes.find(c => c.key === 'task:1').stamps.title, day(2));
  assert.equal(changes.find(c => c.key === 'task:1').stamps.id, day(0));
  assert.equal(changes.find(c => c.key === 'task:1').baseRev, null);
});

test('local-only revisions, checkins and review activity survive every apply', async () => {
  const p = phone(), server = fakeServer(); add(p, 'Plan');
  p.edit(data => {data.entries[0].revisions = [{at: day(1), snapshot: {done: true}, secret: 'local'}]; data.entries.push({id: 77, kind: 'checkin', raw: 'Private mood'});});
  const revisions = structuredClone(task(p, 1).revisions), checkin = structuredClone(task(p, 77));
  await run(p, server);
  for (let n = 2; n <= 4; n++) {
    server.write('task:1', {...server.rows.get('task:1').value, notes: `Remote ${n}`, reviewActivityDays: ['2026-10-21', '2026-10-22']}, day(n));
    await run(p, server);
    assert.deepEqual(task(p, 1).revisions, revisions);
    assert.deepEqual(task(p, 77), checkin);
    assert.deepEqual(projectRecords(p.data), server.project());
  }
});

test('Undo of a phone edit after sync retains the unrelated server edit', async () => {
  const p = phone(), server = fakeServer(); add(p, 'Before'); await run(p, server);
  p.edit(data => editPlan(data, {type: 'saveTask', id: 1, fields: {title: 'Phone edit'}}, new Date(day(2))), day(2));
  server.write('task:1', {...server.rows.get('task:1').value, notes: 'Server edit'}, day(3));
  await run(p, server);
  p.edit(data => editPlan(data, {type: 'undo'}), day(4));
  assert.equal(task(p, 1).title, 'Before');
  assert.equal(task(p, 1).notes, 'Server edit');
  await run(p, server);
  assert.deepEqual(projectRecords(p.data), server.project());
});

test('sync drops Block creation Undo when a server task now depends on that Block', async () => {
  const p = phone(), server = fakeServer(); add(p, 'Task'); await run(p, server);
  let block;
  p.edit(data => {block = editPlan(data, {type: 'saveEntity', collection: 'blocks', fields: {title: 'Result'}}, new Date(day(2)));}, day(2));
  await run(p, server, {push: async body => {
    const result = await server.push(body);
    server.write('task:1', {...server.rows.get('task:1').value, blockId: block}, day(3));
    return result;
  }});
  assert.equal(p.data.planner.undo, null);
  assert.throws(() => editPlan(p.data, {type: 'undo'}), /This changed on another device\./);
  assert.deepEqual(projectRecords(p.data), server.project());
});

test('adopting old phone-range IDs advances the counter before the next local create', async () => {
  const initial = seed(); initial.entries = [{id: 50, title: 'Earlier phone task', kind: 'plan'}];
  const p = phone(), server = fakeServer(initial);
  await run(p, server);
  add(p, 'New local task');
  assert.equal(p.data.entries.at(-1).id, 51);
});

test('a restore during the network trip cannot turn omitted server records into pending deletes', async () => {
  const p = phone(), server = fakeServer(); add(p, 'Newer task'); await run(p, server);
  await run(p, server, {push: async body => {
    const result = await server.push(body);
    p.edit(data => {data.entries = []; data.sync.restoredAt = day(4);}, day(0));
    return result;
  }});
  assert.deepEqual(localChanges(p.data), []);
  assert.deepEqual(projectRecords(p.data), server.project());
});

test('server tombstones and conflict rows converge without projecting local-only entries', async () => {
  const p = phone(), server = fakeServer(); add(p, 'First'); add(p, 'Second'); await run(p, server);
  p.edit(data => {data.entries[0].title = 'Offline title';}, day(1));
  server.write('task:1', {...server.rows.get('task:1').value, title: 'Newer website title'}, day(3));
  server.write('task:2', null, day(3));
  await run(p, server);
  assert.equal(task(p, 1).title, 'Newer website title');
  assert.equal(task(p, 2), undefined);
  assert.ok([...server.rows.keys()].some(key => key.startsWith('conflict:')));
  assert.deepEqual(projectRecords(p.data), server.project());
  assert.deepEqual(localChanges(p.data), []);
});
