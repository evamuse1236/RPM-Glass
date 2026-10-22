import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../fixtures/snapshot.json' with {type: 'json'};
import {createClient} from './client.mjs';

function memoryStorage() { const map = new Map(); return {getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v)}; }
const json = (status, body, headers = {}) => new Response(body === null ? null : JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', ...headers}});

/** A fake sync server with the documented browser API and a phone that applies on demand. */
function fakeServer() {
  const server = {snapshot: structuredClone(fixture), commands: new Map(), posts: [], cursor: 0, down: false, token: 'a'.repeat(64)};
  server.fetch = async (url, init) => {
    if (server.down) throw new TypeError('fetch failed');
    const {pathname, searchParams} = new URL(url);
    const auth = init.headers.Authorization;
    if (pathname === '/v1/web/link') return JSON.parse(init.body).code === 'GOODCODE' ? json(200, {token: server.token, sessionId: 's', accountId: 'a', protocol: 1}) : json(401, {error: {code: 'unauthorized', message: 'no'}});
    if (auth !== `Bearer ${server.token}`) return json(401, {error: {code: 'unauthorized', message: 'no'}});
    if (pathname === '/v1/web/snapshot') {
      const etag = `"rpm-${server.snapshot.revision}"`;
      return init.headers['If-None-Match'] === etag ? new Response(null, {status: 304}) : json(200, server.snapshot, {ETag: etag});
    }
    if (pathname === '/v1/web/commands' && init.method === 'POST') {
      const command = JSON.parse(init.body); server.posts.push(command);
      const known = server.commands.get(command.id) ?? {id: command.id, status: 'pending', message: 'Waiting for phone', newRevision: null, cursor: ++server.cursor};
      server.commands.set(command.id, known);
      return json(202, known);
    }
    if (pathname === '/v1/web/commands') {
      const since = +searchParams.get('since');
      return json(200, {commands: [...server.commands.values()].filter(c => c.cursor > since), cursor: server.cursor, hasMore: false});
    }
    return json(404, {error: {code: 'not_found', message: 'no'}});
  };
  server.apply = id => {
    server.snapshot = {...server.snapshot, revision: server.snapshot.revision + 1};
    Object.assign(server.commands.get(id), {status: 'applied', message: 'Saved on the phone.', newRevision: server.snapshot.revision, cursor: ++server.cursor});
  };
  return server;
}
const command = () => ({id: crypto.randomUUID(), type: 'log-water', args: {at: new Date().toISOString()}, baseRevision: 42, createdAt: new Date().toISOString()});

test('upgrading a v1 browser cache refetches the same revision and preserves queued changes', async () => {
  const server=fakeServer(),storage=memoryStorage(),queued=command();
  storage.setItem('rpm.web.v1',JSON.stringify({server:'http://sync.test',token:server.token,cursor:0,
    snapshot:{...fixture,schemaVersion:1},etag:'"rpm-42"',outbox:[{command:queued,status:'sending',newRevision:null}]}));
  const client=createClient({server:'http://sync.test',storage,fetchImpl:server.fetch});
  assert.equal(client.state.snapshot,null);assert.equal(client.state.etag,null);
  assert.equal(client.state.token,server.token);
  await client.tick();
  assert.deepEqual(server.posts,[queued]);
  assert.deepEqual(client.state.snapshot,fixture);
  assert.equal(client.state.outbox[0].command.id,queued.id);
});

test('linking stores the token and loads the phone snapshot; a wrong code throws and stays unlinked', async () => {
  const server = fakeServer(), client = createClient({server: 'http://sync.test', storage: memoryStorage(), fetchImpl: server.fetch});
  await assert.rejects(client.link('WRONG222'));
  assert.equal(client.state.token, null);
  await client.link('goodcode');
  assert.equal(client.state.snapshot.revision, 42);
});

test('a change stays waiting until the phone applies it and the newer snapshot arrives', async () => {
  const server = fakeServer(), client = createClient({server: 'http://sync.test', storage: memoryStorage(), fetchImpl: server.fetch});
  await client.link('GOODCODE');
  const entry = await client.send(command());
  assert.equal(entry.status, 'pending'); assert.equal(client.settled(entry), false);
  await client.tick(); assert.equal(client.settled(entry), false);
  server.apply(entry.command.id);
  await client.tick();
  assert.equal(entry.status, 'applied'); assert.equal(client.state.snapshot.revision, 43); assert.equal(client.settled(entry), true);
});

test('a change made while the server is unreachable is kept and resent later with the same ID and body', async () => {
  const server = fakeServer(), storage = memoryStorage();
  let client = createClient({server: 'http://sync.test', storage, fetchImpl: server.fetch});
  await client.link('GOODCODE');
  server.down = true;
  const sent = command(), entry = await client.send(sent);
  assert.equal(entry.status, 'sending'); assert.match(client.state.offline, /Can't reach/);
  server.down = false;
  client = createClient({server: 'http://sync.test', storage, fetchImpl: server.fetch});
  await client.tick();
  assert.deepEqual(server.posts, [sent]);
  assert.equal(client.state.outbox[0].status, 'pending'); assert.equal(client.state.offline, null);
});

test('an unchanged snapshot answers 304 and keeps the planner on screen', async () => {
  const server = fakeServer(), client = createClient({server: 'http://sync.test', storage: memoryStorage(), fetchImpl: server.fetch});
  await client.link('GOODCODE');
  await client.refresh();
  assert.equal(client.state.snapshot.revision, 42); assert.equal(client.state.etag, '"rpm-42"');
});

test('a revoked browser shows as unlinked', async () => {
  const server = fakeServer(), client = createClient({server: 'http://sync.test', storage: memoryStorage(), fetchImpl: server.fetch});
  await client.link('GOODCODE');
  server.token = 'b'.repeat(64);
  await client.refresh();
  assert.equal(client.state.unlinked, true);
});

test('on a Site that holds the phone key the planner opens without a code', async () => {
  const server = fakeServer(), base = server.fetch;
  server.fetch = async (url, init) => new URL(url).pathname === '/v1/site' ? json(200, {site: true})
    : base(url, {...init, headers: {...init.headers, ...(init.headers.Authorization === 'Bearer site' ? {Authorization: `Bearer ${server.token}`} : {})}});
  const client = createClient({server: 'http://sync.test', storage: memoryStorage(), fetchImpl: server.fetch});
  await client.connect();
  assert.equal(client.state.token, 'site'); assert.equal(client.state.snapshot.revision, 42);
});

test('on a plain host with no Site key the link screen stays', async () => {
  const server = fakeServer(), client = createClient({server: 'http://sync.test', storage: memoryStorage(), fetchImpl: server.fetch});
  await client.connect();
  assert.equal(client.state.token, null);
});
