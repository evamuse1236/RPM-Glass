import test from 'node:test';
import assert from 'node:assert/strict';
import {siteWorker} from './site-worker.mjs';

const KEY = 'k'.repeat(64);
const env = {RPM_SYNC_SERVER: 'https://sync.test', RPM_WEB_TOKEN: KEY};
const assets = {'/index.html': {body: '<p>planner</p>', type: 'text/html'}};
function upstream() {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({url: String(url), auth: init.headers.get('Authorization'), match: init.headers.get('If-None-Match')}); return new Response('{"revision":42}', {status: 200, headers: {ETag: '"rpm-42"', 'Content-Type': 'application/json', 'Set-Cookie': 'x=1'}}); };
  return {seen, fetchImpl};
}
const get = (path, headers = {}, method = 'GET') => new Request(`https://rpm-planner.example${path}`, {method, headers});

test('a keyed Site says so, and in site mode the Site adds its own key upstream', async () => {
  const {seen, fetchImpl} = upstream(), worker = siteWorker(assets, fetchImpl);
  assert.deepEqual(await (await worker.fetch(get('/v1/site'), env)).json(), {site: true});
  const reply = await worker.fetch(get('/v1/web/snapshot', {Authorization: 'Bearer site', 'If-None-Match': '"rpm-41"'}), env);
  assert.equal(reply.status, 200); assert.equal(reply.headers.get('ETag'), '"rpm-42"'); assert.equal(reply.headers.get('Set-Cookie'), null);
  assert.deepEqual(seen, [{url: 'https://sync.test/v1/web/snapshot', auth: `Bearer ${KEY}`, match: '"rpm-41"'}]);
});

test('the key never reaches the page, and the page cannot revoke it', async () => {
  const worker = siteWorker(assets, upstream().fetchImpl);
  const page = await (await worker.fetch(get('/'), env)).text();
  assert.equal(page.includes(KEY), false);
  assert.equal((await worker.fetch(get('/v1/web/session', {Authorization: 'Bearer site'}, 'DELETE'), env)).status, 403);
});

test('without a key the page falls back to a link code, passed through as its own token', async () => {
  const {seen, fetchImpl} = upstream(), worker = siteWorker(assets, fetchImpl), bare = {RPM_SYNC_SERVER: 'https://sync.test'};
  assert.deepEqual(await (await worker.fetch(get('/v1/site'), bare)).json(), {site: false});
  assert.equal((await worker.fetch(get('/v1/web/snapshot', {Authorization: 'Bearer site'}), bare)).status, 401);
  await worker.fetch(get('/v1/web/snapshot', {Authorization: 'Bearer abc'}), bare);
  assert.equal(seen[0].auth, 'Bearer abc');
});
