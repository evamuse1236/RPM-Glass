import test from 'node:test';
import assert from 'node:assert/strict';
import {httpTransport, readConfig} from './transport-http.mjs';
import {makeCommand} from './ids.mjs';
import {fixture, NOW, fakeTimers} from './test-kit.mjs';

function memoryStorage() {
  const map = new Map();
  return {getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), map};
}

/** A fetch that answers from a list of routes and records each request. */
function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({url, init});
    const path = url.replace('https://rpm.example.convex.site', '');
    const route = routes.find(r => (r.method ?? 'GET') === (init.method ?? 'GET') && (typeof r.path === 'string' ? r.path === path : r.path.test(path)));
    if (!route) throw new TypeError('Failed to fetch');
    const answer = typeof route.reply === 'function' ? route.reply(init, calls) : route.reply;
    const headers = new Map(Object.entries(answer.headers ?? {}));
    return {status: answer.status, ok: answer.status >= 200 && answer.status < 300,
      headers: {get: k => headers.get(k) ?? null}, json: async () => structuredClone(answer.body)};
  };
  return {fetch, calls};
}

const BASE = 'https://rpm.example.convex.site/';
const snapshot = fixture();

test('snapshot polling sends the bearer token, then If-None-Match, and treats 304 as unchanged', async () => {
  const {fetch, calls} = fakeFetch([
    {path: '/v1/web/snapshot', reply: init => (init.headers['If-None-Match'] === '"rpm-42"' ? {status: 304} : {status: 200, body: snapshot, headers: {ETag: '"rpm-42"'}})},
    {path: /^\/v1\/web\/commands\?since=/, reply: {status: 200, body: {commands: [], cursor: 0, hasMore: false}}},
  ]);
  const events = [];
  const t = httpTransport({base: BASE, token: 'a'.repeat(64), fetch, timers: fakeTimers(), now: () => NOW});
  t.start(e => events.push(e));
  await new Promise(r => setTimeout(r, 10));
  await t.poll();
  assert.equal(calls[0].init.headers.Authorization, 'Bearer ' + 'a'.repeat(64));
  assert.equal(events.filter(e => e.type === 'loaded').length >= 1, true);
  assert.equal(events.some(e => e.type === 'checked'), true);
  assert.equal(calls.filter(c => c.url.endsWith('/snapshot')).at(-1).init.headers['If-None-Match'], '"rpm-42"');
});

test('posting a command reports pending; status pages are read until hasMore is false and the cursor is kept', async () => {
  const storage = memoryStorage(), timers = fakeTimers();
  const command = makeCommand('complete', {taskId: 33}, {baseRevision: 42, now: NOW});
  const {fetch, calls} = fakeFetch([
    {method: 'POST', path: '/v1/web/commands', reply: {status: 202, body: {id: command.id, status: 'pending', message: 'Waiting for phone', newRevision: null, cursor: 1}}},
    {path: '/v1/web/commands?since=0', reply: {status: 200, body: {commands: [{id: command.id, status: 'pending'}], cursor: 1, hasMore: true}}},
    {path: '/v1/web/commands?since=1', reply: {status: 200, body: {commands: [{id: command.id, status: 'applied', message: 'Done', newRevision: 43}], cursor: 2, hasMore: false}}},
    {path: '/v1/web/snapshot', reply: {status: 304}},
  ]);
  const events = [];
  const t = httpTransport({base: BASE, token: 't', fetch, storage, timers, now: () => NOW});
  t.start(e => events.push(e));
  const result = await t.send(command);
  assert.equal(result.status, 'pending');
  assert.deepEqual(JSON.parse(calls.find(c => c.init.method === 'POST').init.body), command);
  timers.run();
  await new Promise(r => setTimeout(r, 10));
  const status = events.find(e => e.type === 'status');
  assert.deepEqual(status, {type: 'status', id: command.id, status: 'applied', message: 'Done', newRevision: 43});
  assert.equal(storage.getItem('rpm.web.cursor'), '2');
});

test('401 means the browser is unlinked; a network failure becomes calm words', async () => {
  const events = [];
  const {fetch} = fakeFetch([{path: '/v1/web/snapshot', reply: {status: 401, body: {error: {code: 'auth', message: 'revoked'}}}}]);
  const t = httpTransport({base: BASE, token: 't', fetch, timers: fakeTimers(), now: () => NOW});
  t.start(e => events.push(e));
  await t.poll();
  assert.equal(events.some(e => e.type === 'unlinked'), true);

  const offline = httpTransport({base: BASE, token: 't', fetch: fakeFetch([]).fetch, timers: fakeTimers(), now: () => NOW});
  offline.start(() => {});
  await assert.rejects(offline.send(makeCommand('complete', {taskId: 1}, {baseRevision: 1, now: NOW})), /Can't reach the sync service/);
});

test('linking stores the token and base; a wrong code says how to get a new one', async () => {
  const storage = memoryStorage();
  const {fetch} = fakeFetch([
    {method: 'POST', path: '/v1/web/link', reply: init => (JSON.parse(init.body).code === 'ABCDEFGH'
      ? {status: 200, body: {token: 'f'.repeat(64), sessionId: 's1', accountId: 'a1', protocol: 1}} : {status: 401, body: {error: {code: 'bad', message: 'bad'}}})},
    {path: '/v1/web/snapshot', reply: {status: 200, body: snapshot, headers: {ETag: '"rpm-42"'}}},
    {path: /commands/, reply: {status: 200, body: {commands: [], cursor: 0, hasMore: false}}},
  ]);
  const t = httpTransport({base: BASE, token: '', fetch, storage, timers: fakeTimers(), now: () => NOW});
  t.start(() => {});
  await assert.rejects(t.link('WRONGONE'), /That code didn't match/);
  await t.link('ABCDEFGH');
  assert.deepEqual(readConfig(storage), {base: 'https://rpm.example.convex.site', token: 'f'.repeat(64)});
  await t.unlink().catch(() => {});
  assert.equal(readConfig(storage).token, '');
});
