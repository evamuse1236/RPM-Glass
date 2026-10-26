import test from 'node:test';
import assert from 'node:assert/strict';
import {syncReplica} from './replica-sync.mjs';
import {projectRecords} from '../web/contract/records.mjs';
import {editPlan} from './planner-state.mjs';
import {fakeServer, phone, day} from './test/replica-server.mjs';

const run = (p, server, options = {}) => syncReplica({load: p.load, save: p.save, push: server.push, pull: server.pull, now: () => new Date(day(5)), ...options});
const add = p => p.edit(data => editPlan(data, {type: 'saveTask', fields: {title: 'Plan'}}));

test('a crash after push resends the frozen seq and payload without duplicate effects', async () => {
  const p = phone(), server = fakeServer(); add(p);
  await assert.rejects(run(p, server, {push: async body => {await server.push(body); throw new Error('crash after push');}}), /crash/);
  const outbox = structuredClone(p.data.sync.outbox), revision = server.revision;
  p.edit(data => {data.entries[0].title = 'Later edit';}, day(4));
  await run(p, server);
  assert.deepEqual(server.pushes[0], server.pushes[1]);
  assert.equal(server.revision, revision);
  assert.equal(p.data.sync.seq, outbox.seq);
  assert.equal(p.data.entries[0].title, 'Later edit');
  assert.equal(p.data.sync.stamps['task:1'].title, day(4));
});

test('a crash between pull pages applies nothing and retains the old cursor and outbox', async () => {
  const p = phone(), server = fakeServer(); add(p); await run(p, server); add(p);
  const before = projectRecords(p.data), cursor = p.data.sync.cursor;
  for (let n = 0; n < 505; n++) server.write(`task:${1000000000 + n}`, {id: 1000000000 + n, title: `Remote ${n}`, kind: 'plan'});
  let pages = 0;
  await assert.rejects(run(p, server, {pull: async body => {if (++pages === 2) throw new Error('pull crashed'); return server.pull(body);}}), /pull crashed/);
  assert.equal(pages, 2);
  assert.deepEqual(projectRecords(p.data), before);
  assert.equal(p.data.sync.cursor, cursor);
  assert.ok(p.data.sync.outbox);
  await run(p, server);
  assert.deepEqual(projectRecords(p.data), server.project());
});

test('first-run partial pull persists no initialization or records', async () => {
  const p = phone(), initial = phone(); add(initial); const server = fakeServer(initial.data);
  const before = await p.load(); let pages = 0;
  await assert.rejects(run(p, server, {pull: async body => {if (++pages === 2) throw new Error('crash'); const page = await server.pull({...body, limit: 1}); return page;}}), /crash/);
  assert.deepEqual(await p.load(), before);
});

test('parts obey both count and UTF-8 byte limits and retry identical receipt parts', async () => {
  const p = phone(), server = fakeServer();
  p.edit(data => {
    for (let n = 1; n <= 205; n++) data.entries.push({id: n, kind: 'plan', title: `Task ${n}`, notes: '🙂'.repeat(2000)});
  });
  let crashed = false;
  await assert.rejects(run(p, server, {push: async body => {const receipt = await server.push(body); if (body.part === 1 && !crashed) {crashed = true; throw new Error('crash');} return receipt;}}), /crash/);
  const firstParts = structuredClone(server.pushes), rev = server.revision;
  await run(p, server);
  assert.deepEqual(server.pushes.slice(firstParts.length, firstParts.length + 2), firstParts);
  const parts = server.pushes.slice(firstParts.length);
  assert.ok(parts.length >= 3);
  assert.deepEqual(parts.map(body => body.part), parts.map((_, index) => index));
  assert.equal(parts.at(-1).final, true);
  assert.ok(parts.slice(0, -1).every(body => body.final === false));
  assert.ok(server.revision >= rev);
  assert.deepEqual(projectRecords(p.data), server.project());
});

test('an ambiguous final CAS save is reconciled on the next run', async () => {
  const p = phone(), server = fakeServer(); add(p); let lost = false;
  await assert.rejects(run(p, server, {save: async (expected, next, options) => {await p.save(expected, next, options); if (!next.sync.outbox && !lost) {lost = true; throw new Error('lost ack');}}}), /lost ack/);
  await run(p, server);
  assert.deepEqual(projectRecords(p.data), server.project());
});

test('small changes split at 200 even when the byte limit is not reached', async () => {
  const p = phone(), server = fakeServer();
  p.edit(data => {for (let id = 1; id <= 205; id++) data.entries.push({id, kind: 'plan', title: `Task ${id}`});});
  await run(p, server);
  assert.equal(server.pushes.length, 2);
  assert.equal(server.pushes[0].changes.length, 200);
  assert.ok(server.pushes[1].changes.length > 0);
  assert.deepEqual(projectRecords(p.data), server.project());
});
