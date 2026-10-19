import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpTransport, hasHttpSettings, KEYS, LINK_ERROR} from './http.mjs';

function memoryStorage(values = {}) {
  const map = new Map(Object.entries(values));
  return {getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k)};
}
const reply = (status, body, headers = {}) => ({status, ok: status >= 200 && status < 300,
  headers: {get: name => headers[name] ?? null}, json: async () => body});
const noTimers = {setTimeout: () => 0, setInterval: () => 0, clearInterval: () => {}};

function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({url, ...init});
    const route = routes.shift();
    if (route instanceof Error) throw route;
    return route;
  };
  return {fetch, calls};
}

test('snapshot polling sends the token and the last ETag, and a 304 publishes nothing', async () => {
  const storage = memoryStorage({[KEYS.base]: 'https://x.convex.site/', [KEYS.token]: 'a'.repeat(64)});
  const {fetch, calls} = fakeFetch([reply(200, {revision: 42}, {ETag: '"rpm-42"'}), reply(304, null)]);
  const events = [];
  const http = createHttpTransport({storage, fetch, timers: noTimers});
  http.start(e => events.push(e));
  await http.pollSnapshot();
  await http.pollSnapshot();
  const snapshots = calls.filter(c => c.url.endsWith('/v1/web/snapshot'));
  assert.equal(snapshots[0].url, 'https://x.convex.site/v1/web/snapshot');
  assert.equal(snapshots[0].headers.Authorization, 'Bearer ' + 'a'.repeat(64));
  assert.equal(events.filter(e => e.type === 'snapshot').length, 1);
});

test('status polling follows hasMore pages and stores the cursor only after each page', async () => {
  const storage = memoryStorage({[KEYS.base]: 'https://x', [KEYS.token]: 't'});
  const {fetch, calls} = fakeFetch([
    reply(200, {commands: [{id: 'a', status: 'applied', message: 'Done', newRevision: 43}], cursor: 5, hasMore: true}),
    reply(200, {commands: [{id: 'b', status: 'rejected', message: 'No', newRevision: 43}], cursor: 9, hasMore: false}),
  ]);
  const events = [];
  const http = createHttpTransport({storage, fetch, timers: noTimers});
  http.start(e => events.push(e));
  await http.pollStatuses();
  assert.deepEqual(calls.map(c => c.url), ['https://x/v1/web/commands?since=0', 'https://x/v1/web/commands?since=5']);
  assert.deepEqual(events.filter(e => e.type === 'status').map(e => [e.id, e.status]), [['a', 'applied'], ['b', 'rejected']]);
  assert.equal(storage.getItem(KEYS.cursor), '9');
});

test('a command is posted as JSON and its pending acknowledgement returned', async () => {
  const storage = memoryStorage({[KEYS.base]: 'https://x', [KEYS.token]: 't'});
  const ack = {id: 'c', status: 'pending', message: 'Waiting for phone', newRevision: null, cursor: 3};
  const {fetch, calls} = fakeFetch([reply(202, ack)]);
  const http = createHttpTransport({storage, fetch, timers: noTimers});
  const command = {id: 'c', type: 'log-water', args: {at: '2026-10-19T05:00:00Z'}, baseRevision: 42, createdAt: '2026-10-19T05:00:00Z'};
  assert.deepEqual(await http.send(command), ack);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].body), command);
});

test('errors are never acknowledgements: 401 unlinks, a network failure says changes wait', async () => {
  const storage = memoryStorage({[KEYS.base]: 'https://x', [KEYS.token]: 't'});
  const {fetch} = fakeFetch([reply(401, {error: {code: 'unauthorized', message: 'Bad token'}}), new TypeError('Failed to fetch')]);
  const events = [];
  const http = createHttpTransport({storage, fetch, timers: noTimers});
  http.start(e => events.push(e));
  await http.pollSnapshot();
  assert.equal(events.at(-1).type, 'unlinked');
  assert.equal(storage.getItem(KEYS.token), null);
  await assert.rejects(http.send({id: 'x'}), /Your changes wait here/);
});

test('link stores the token once and a wrong code gets the link error words', async () => {
  const storage = memoryStorage({[KEYS.base]: 'https://x'});
  const {fetch, calls} = fakeFetch([reply(401, {error: {code: 'bad-code', message: 'no'}}), reply(200, {token: 'f'.repeat(64), sessionId: 's', accountId: 'a', protocol: 1})]);
  const http = createHttpTransport({storage, fetch, timers: noTimers});
  await assert.rejects(http.link('ABCDEFGH'), {message: LINK_ERROR});
  assert.equal(hasHttpSettings(storage), false);
  await http.link('ABCDEFGH');
  assert.deepEqual(JSON.parse(calls[1].body), {code: 'ABCDEFGH', label: 'Web browser'});
  assert.equal(hasHttpSettings(storage), true);
});
