import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fakeServer, seed} from './test/replica-server.mjs';
import {editPlan} from './planner-state.mjs';

const run = args => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/web-sync/phone-standin.mjs', ...args], {stdio: ['ignore', 'pipe', 'pipe']});
  let output = ''; child.stdout.on('data', bytes => output += bytes); child.stderr.on('data', bytes => output += bytes);
  child.on('error', reject); child.on('close', code => resolve({code, output}));
});

test('stand-in persists replica saves, stamps local edits, and retries a frozen outbox after restart', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rpm-standin-')), state = join(folder, 'phone.json');
  const data = seed(); editPlan(data, {type: 'saveTask', fields: {title: 'Seed task'}});
  const replica = fakeServer(), calls = [], failures = []; let losePull = false;
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.headers.authorization, 'Bearer synthetic-test-token');
      let text = ''; for await (const bytes of req) text += bytes;
      const body = JSON.parse(text); calls.push(req.url);
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/v1/planner/pull' && losePull) { losePull = false; res.writeHead(503); res.end('{}'); return; }
      const reply = req.url === '/v1/planner/push' ? await replica.push(body) : await replica.pull(body);
      res.end(JSON.stringify(reply));
    } catch (error) { failures.push(error); res.writeHead(500); res.end('{}'); }
  });
  try {
    await writeFile(state, JSON.stringify({token: 'synthetic-test-token', data}));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const args = ['--state', state, '--site', `http://127.0.0.1:${server.address().port}`];
    const sync = () => run([...args, '--sync']);
    assert.equal((await sync()).code, 0);
    assert.deepEqual(calls, ['/v1/planner/pull', '/v1/planner/push', '/v1/planner/pull']);
    let saved = JSON.parse(await readFile(state, 'utf8')).data;
    assert.equal(saved.syncSavedAt, data.syncSavedAt); assert.equal(saved.sync.outbox, null);
    assert.equal(saved.sync.seq, 1); assert.deepEqual(saved.sync.stamps, {});
    const unchanged = saved.syncSavedAt;
    assert.equal((await run([...args, '--edit', String(data.entries[0].id), 'title', 'Phone edit'])).code, 0);
    saved = JSON.parse(await readFile(state, 'utf8')).data;
    assert.equal(saved.entries[0].title, 'Phone edit'); assert.notEqual(saved.syncSavedAt, unchanged);
    assert.equal(saved.sync.stamps[`task:${data.entries[0].id}`].title, saved.syncSavedAt);
    assert.equal(saved.planner.undo.entries[0].title, 'Seed task');
    const editedAt = saved.syncSavedAt;
    losePull = true; assert.equal((await sync()).code, 1);
    saved = JSON.parse(await readFile(state, 'utf8')).data;
    assert.equal(saved.sync.outbox.seq, 2);
    assert.equal((await sync()).code, 0);
    saved = JSON.parse(await readFile(state, 'utf8')).data;
    assert.equal(saved.sync.outbox, null); assert.equal(saved.sync.seq, 2); assert.equal(saved.syncSavedAt, editedAt);
    assert.deepEqual(replica.pushes.at(-1), replica.pushes.at(-2));
    assert.equal(replica.rows.get(`task:${data.entries[0].id}`).value.title, 'Phone edit');
    const before = await readFile(state, 'utf8');
    assert.equal((await run([...args, '--edit', String(data.entries[0].id), 'minutes', 'invalid'])).code, 1);
    assert.equal(await readFile(state, 'utf8'), before); assert.deepEqual(failures, []);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(folder, {recursive: true, force: true}); }
});
