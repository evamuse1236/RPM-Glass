import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Bridge, StateStore, loadConfig, configure, splitReply, validateSchedule, localMinute, defaultPiArgs } from './bridge.mjs';
import { INTERRUPTED, FAILED } from './pi.mjs';
import rpmExtension, { createTodayTool } from './extensions/rpm-tool.mjs';

import { ROOT, FAKE, TOKEN, KEY, sleep, update, job, state, until, harness } from './fixtures/harness.mjs';

test('allowed text is durably queued with ignored offsets before the next poll, and remains FIFO through delivery', async t => {
  const h = await harness(t);
  h.updates.push(update(4, 'ignored', 99), { update_id: 5, message: { chat: { id: 42 }, photo: [] } }, update(6, 'delayed'), update(7, 'second'), { update_id: 8, edited_message: { chat: { id: 42 }, text: 'edited' } });
  let observedAtomic = false;
  h.beforePoll = async body => {
    if (body.offset === 9 && !observedAtomic) {
      const persisted = await h.persisted();
      assert.equal(persisted.offset, 9);
      assert.deepEqual(persisted.jobs.map(entry => entry.prompt), ['delayed', 'second']);
      observedAtomic = true;
    }
  };
  await h.start();
  await until(() => h.sent.length === 2);
  assert.deepEqual(h.sent, [{ chat_id: '42', text: 'Reply to delayed' }, { chat_id: '42', text: 'Reply to second' }]);
  assert.equal(observedAtomic, true);
  assert.deepEqual((await h.events()).filter(event => event.type === 'prompt').map(event => [event.message, event.busy]), [['delayed', false], ['second', false]]);
  assert.ok((await h.events()).filter(event => event.type === 'lookup').every(event => !event.busy));
});

test('restarting after acknowledged updates does not execute them twice', async t => {
  const h = await harness(t);
  h.updates.push(update(12, 'once'));
  const first = await h.start();
  await until(async () => h.sent.length === 1 && (await h.persisted()).jobs.length === 0);
  await first.stop();
  const second = await h.start();
  await until(() => h.requests.filter(request => request.method === 'getUpdates' && request.body.offset === 13).length >= 3);
  await second.stop();
  assert.equal(h.sent.length, 1);
  assert.equal((await h.events()).filter(event => event.type === 'prompt').length, 1);
});

test('outbound chunks respect UTF-16 limits without splitting emoji', async t => {
  const h = await harness(t);
  h.updates.push(update(1, 'long'));
  await h.start();
  await until(() => h.sent.length === 3);
  assert.deepEqual(h.sent.map(message => message.text.length), [3999, 4000, 3]);
  assert.equal(h.sent.map(message => message.text).join(''), `${'x'.repeat(3999)}😀${'y'.repeat(4001)}`);
  for (const message of h.sent) assert.equal(message.text.isWellFormed(), true);
});

test('Pi crash interrupts only the active job and restarts before the later job', async t => {
  const h = await harness(t);
  h.updates.push(update(1, 'crash'), update(2, 'later'));
  await h.start();
  await until(() => h.sent.length === 2);
  assert.deepEqual(h.sent.map(message => message.text), [INTERRUPTED, 'Reply to later']);
  assert.equal((await h.events()).filter(event => event.type === 'start').length, 2);
});

test('startup turns interrupted persisted running work into a reply without reexecution', async t => {
  const h = await harness(t);
  await writeFile(h.stateFile, JSON.stringify(state([job('active', 'DO NOT REEXECUTE', 'running'), job('later', 'next')])));
  await h.start();
  await until(() => h.sent.length === 2);
  assert.deepEqual(h.sent.map(message => message.text), [INTERRUPTED, 'Reply to next']);
  assert.deepEqual((await h.events()).filter(event => event.type === 'prompt').map(event => event.message), ['next']);
});

test('restart resumes the durable chunk cursor before any later prompt', async t => {
  const h = await harness(t);
  await writeFile(h.stateFile, JSON.stringify(state([job('reply', 'prior', 'reply', ['already sent', 'remaining'], 1), job('later', 'next')])));
  h.beforeSend = async message => {
    if (message.text === 'remaining') assert.equal((await h.events()).filter(event => event.type === 'prompt').length, 0);
  };
  await h.start();
  await until(() => h.sent.length === 2);
  assert.deepEqual(h.sent.map(message => message.text), ['remaining', 'Reply to next']);
});

test('transient poll and send errors retry without advancing past unsent replies or logging secrets', async t => {
  const h = await harness(t);
  h.failures.poll = 1;
  h.failures.send = 2;
  h.updates.push(update(1, 'first'), update(2, 'second'));
  h.beforeSend = async message => {
    if (message.text === 'Reply to first') assert.deepEqual((await h.events()).filter(event => event.type === 'prompt').map(event => event.message), ['first']);
  };
  const bridge = await h.start();
  await until(() => h.sent.length === 2);
  await bridge.stop();
  assert.equal(h.logs.filter(log => log === 'telegram_poll_retry').length, 1);
  assert.equal(h.logs.filter(log => log === 'telegram_send_retry').length, 2);
  assert.equal(JSON.stringify(h.logs).includes(TOKEN), false);
  assert.equal(JSON.stringify(h.logs).includes(KEY), false);
  assert.deepEqual(h.sent.map(message => message.text), ['Reply to first', 'Reply to second']);
});

test('runtime timer schedules only the matching Kolkata minute and deduplicates across restart', async t => {
  let now = new Date('2026-10-18T02:29:00Z');
  const h = await harness(t, { schedule: [{ at: '08:00', prompt: 'morning' }], now: () => now });
  const first = await h.start();
  await until(() => h.requests.length >= 2);
  assert.equal(h.sent.length, 0);
  now = new Date('2026-10-18T02:30:00Z');
  await until(() => h.sent.length === 1);
  await until(async () => (await h.persisted()).jobs.length === 0);
  await first.stop();
  const second = await h.start();
  await sleep(80);
  assert.equal(h.sent.length, 1);
  now = new Date('2026-10-19T02:31:00Z');
  await sleep(50);
  assert.equal(h.sent.length, 1);
  now = new Date('2026-10-20T02:30:00Z');
  await until(() => h.sent.length === 2);
  await second.stop();
  assert.equal((await h.persisted()).scheduleKeys.length, 2);
});

test('Telegram retry_after exceeds the backoff cap and shutdown cancels the wait', async t => {
  const h = await harness(t);
  h.failures.send = 10;
  h.updates.push(update(1, 'rate limited'));
  const bridge = await h.start();
  await until(() => h.logs.includes('telegram_send_retry'));
  await sleep(100);
  assert.equal(h.requests.filter(request => request.method === 'sendMessage').length, 1);
  await bridge.stop();
  assert.equal(h.sent.length, 0);
  assert.equal((await h.persisted()).jobs[0].phase, 'reply');
});

test('stop during startup does not leave a scheduler or Pi child running', async t => {
  const h = await harness(t);
  const bridge = new Bridge(h.config);
  const starting = bridge.start();
  await bridge.stop();
  await starting;
  await bridge.stop();
  assert.equal(h.requests.length, 0);
  assert.deepEqual(await h.events(), []);
});

test('handled prompts do not fetch stale assistant text', async t => {
  const h = await harness(t);
  h.updates.push(update(1, 'handled'), update(2, 'after'));
  await h.start();
  await until(() => h.sent.length === 2);
  assert.match(h.sent[0].text, /handled/);
  assert.equal(h.sent[1].text, 'Reply to after');
  assert.equal((await h.events()).filter(event => event.type === 'lookup').length, 1);
});

test('assistant failures and turns with no assistant never send stale lookup text, and a later retry can recover', async t => {
  const h = await harness(t);
  h.updates.push(...['provider-error', 'provider-aborted', 'no-assistant', 'retry-success'].map((prompt, index) => update(index, prompt)));
  await h.start();
  await until(() => h.sent.length === 4);
  assert.deepEqual(h.sent.map(message => message.text), [FAILED, FAILED, FAILED, 'Reply to retry-success']);
  assert.equal((await h.events()).filter(event => event.type === 'lookup').length, 1);
});

test('LF framing preserves Unicode separators and IDs match responses', async t => {
  const h = await harness(t);
  h.updates.push(update(1, 'unicode'));
  await h.start();
  await until(() => h.sent.length === 1);
  assert.equal(h.sent[0].text, 'First\u2028second\u2029third 😀');
});

test('settled is armed before prompt and older acknowledgements without data remain compatible', async t => {
  const h = await harness(t);
  h.updates.push(update(1, 'immediate-settled'), update(2, 'old-ack'));
  await h.start();
  await until(() => h.sent.length === 2);
  assert.deepEqual(h.sent.map(message => message.text), ['Reply to immediate-settled', 'Reply to old-ack']);
});

test('stuck turns time out, terminate their child, and preserve later jobs', async t => {
  const h = await harness(t, { turnTimeoutMs: 150 });
  h.updates.push(update(1, 'hang'), update(2, 'after timeout'));
  await h.start();
  await until(() => h.sent.length === 2);
  assert.deepEqual(h.sent.map(message => message.text), [INTERRUPTED, 'Reply to after timeout']);
  const starts = (await h.events()).filter(event => event.type === 'start');
  assert.equal(starts.length, 2);
  assert.throws(() => process.kill(starts[0].pid, 0));
});

test('startup spawns Pi while idle and shutdown closes stdin then kills an uncooperative child', async t => {
  const h = await harness(t);
  const bridge = await h.start();
  await until(async () => (await h.events()).some(event => event.type === 'start'));
  h.updates.push(update(1, 'shutdown-hang'));
  await until(async () => (await h.events()).some(event => event.type === 'prompt'));
  await bridge.stop();
  const events = await h.events();
  assert.ok(events.some(event => event.type === 'stdin-end'));
  assert.throws(() => process.kill(events.find(event => event.type === 'start').pid, 0));
  assert.equal((await h.persisted()).jobs[0].phase, 'running');
});

test('spawn errors back off with a cap and shutdown cancels backoff promptly', async t => {
  const h = await harness(t, { piCommand: path.join(ROOT, 'no-such-executable'), restartBaseMs: 40, restartMaxMs: 100 });
  const bridge = await h.start();
  await until(() => h.logs.filter(log => log === 'pi_restart').length === 3);
  assert.ok(h.logs.length < 6);
  const start = Date.now();
  await bridge.stop();
  assert.ok(Date.now() - start < 500);
});

test('invalid state fails closed before polling or launching Pi', async t => {
  const h = await harness(t);
  for (const invalid of ['{bad', JSON.stringify({ offset: 42 }), JSON.stringify(state([job('bad', 'x', 'reply', [], 0)])), JSON.stringify({ ...state([]), offset: -1 })]) {
    await writeFile(h.stateFile, invalid);
    await assert.rejects(h.start(), /state/i);
    assert.equal(await readFile(h.stateFile, 'utf8'), invalid);
  }
  assert.equal(h.requests.length, 0);
  assert.deepEqual(await h.events(), []);
});

test('state transactions serialize concurrent scheduler and update writers without losing data', async t => {
  const h = await harness(t);
  const store = new StateStore(h.stateFile);
  await store.load();
  await Promise.all(Array.from({ length: 12 }, (_, index) => store.transaction(next => { next.offset++; next.jobs.push(job(`job:${index}`, `prompt ${index}`)); })));
  const saved = await h.persisted();
  assert.equal(saved.offset, 12);
  assert.equal(new Set(saved.jobs.map(entry => entry.id)).size, 12);
  assert.equal((await readdir(h.folder)).filter(file => file.endsWith('.tmp')).length, 0);
});

test('secrets load only from configured files, child gets the Anthropic key and RPM file path, restricted Pi flags are selected', async t => {
  const h = await harness(t);
  const telegramFile = path.join(h.folder, 'telegram-token');
  const keyFile = path.join(h.folder, 'anthropic-key');
  const scheduleFile = path.join(h.folder, 'schedule.json');
  await writeFile(telegramFile, `${TOKEN}\n`);
  await writeFile(keyFile, `${KEY}\n`);
  await writeFile(scheduleFile, '[]');
  const env = { ...process.env, TELEGRAM_TOKEN_FILE: telegramFile, ANTHROPIC_KEY_FILE: keyFile, ALLOWED_CHAT_ID: '42', RPM_TOKEN_FILE: '/secret/rpm', SCHEDULE_FILE: scheduleFile, FAKE_PI_AUDIT: h.audit, BRIDGE_STATE_FILE: h.stateFile };
  const loaded = await loadConfig(env);
  assert.equal(loaded.childEnv.ANTHROPIC_API_KEY, KEY);
  assert.equal(loaded.childEnv.RPM_TOKEN_FILE, '/secret/rpm');
  assert.equal(process.env.ANTHROPIC_API_KEY, env.ANTHROPIC_API_KEY);
  const args = defaultPiArgs();
  for (const flag of ['--continue', '--no-builtin-tools', '--no-extensions', '--no-mcp', '--no-skills', '--no-context-files', '--no-prompt-templates']) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf('--model') + 1], 'claude-haiku-5-5');
  assert.equal(args.includes(KEY), false);
  const bridge = await h.start({ ...loaded, telegramBaseUrl: h.config.telegramBaseUrl, piCommand: process.execPath, piArgs: [FAKE] });
  await until(async () => (await h.events()).length > 0);
  await bridge.stop();
  assert.equal((await h.events())[0].hasKey, true);
  assert.equal((await h.events())[0].rpmTokenFile, '/secret/rpm');
  await assert.rejects(loadConfig({ ...env, ANTHROPIC_KEY_FILE: '' }), /secret/i);
});

test('configuration and schedule boundaries reject ambiguous or invalid values', () => {
  const valid = { token: TOKEN, allowedChatId: '42', stateFile: '/state' };
  for (const change of [{ allowedChatId: '' }, { allowedChatId: '1e3' }, { token: '../bad' }, { retryBaseMs: 0 }, { schedulerIntervalMs: NaN }, { telegramBaseUrl: 'file:///tmp' }, { piArgs: [1] }]) assert.throws(() => configure({ ...valid, ...change }));
  for (const schedule of [{}, [{ at: '8:00', prompt: 'x' }], [{ at: '24:00', prompt: 'x' }], [{ at: '08:00', prompt: '' }], [{ at: '08:00', prompt: 'x', extra: true }], [{ at: '08:00', prompt: 'x' }, { at: '08:00', prompt: 'x' }]]) assert.throws(() => validateSchedule(schedule));
  assert.deepEqual(localMinute(new Date('2026-10-18T18:30:00Z')), { day: '2026-10-19', at: '00:00' });
  assert.equal(splitReply('😀'.repeat(2001)).map(chunk => chunk.length).join(','), '4000,2');
});

test('RPM extension registers one zero-argument tool and missing URL returns the explicit setup result', async () => {
  let registered;
  rpmExtension({ registerTool(tool) { registered = tool; } });
  assert.equal(registered.name, 'rpm_today');
  assert.deepEqual(registered.parameters, { type: 'object', properties: {}, additionalProperties: false });
  const tool = createTodayTool({}, () => assert.fail('No request should be made'));
  assert.equal((await tool.execute('call', {}, new AbortController().signal)).content[0].text, 'RPM API not configured');
});

test('RPM tool fetches today JSON with bearer authentication and sanitizes errors and cancellation', async t => {
  const h = await harness(t);
  const filename = path.join(h.folder, 'rpm-token');
  await writeFile(filename, 'rpm-secret-marker\n');
  const env = { RPM_API_URL: 'https://rpm.example/base/', RPM_TOKEN_FILE: filename };
  const tool = createTodayTool(env, async (url, options) => {
    assert.equal(url, 'https://rpm.example/base/v1/today');
    assert.equal(options.headers.authorization, 'Bearer rpm-secret-marker');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => ({ today: ['one'] }) };
  });
  assert.equal((await tool.execute('id', {}, undefined)).content[0].text, '{"today":["one"]}');
  const broken = createTodayTool(env, async () => { throw new Error(`provider failure ${KEY} rpm-secret-marker`); });
  assert.equal((await broken.execute('id', {})).content[0].text, 'RPM API request failed');
  const controller = new AbortController();
  controller.abort();
  assert.equal((await broken.execute('id', {}, controller.signal)).content[0].text, 'RPM API request cancelled');
});

test('RPM tool runs against local HTTP, rejects bad responses, and times out a stalled request', async t => {
  const h = await harness(t);
  const tokenFile = path.join(h.folder, 'rpm-http-token');
  await writeFile(tokenFile, 'rpm-http-secret');
  const received = [];
  let mode = 'ok';
  const server = createServer((request, response) => {
    received.push({ url: request.url, authorization: request.headers.authorization });
    if (mode === 'stall') return;
    if (mode === 'deny') { response.writeHead(401).end(KEY); return; }
    response.writeHead(200, { 'content-type': 'application/json' }).end(mode === 'invalid' ? KEY : '{"today":"plan"}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const tool = createTodayTool({ RPM_API_URL: `http://127.0.0.1:${server.address().port}`, RPM_TOKEN_FILE: tokenFile }, fetch, 100);
  assert.equal((await tool.execute('call', {})).content[0].text, '{"today":"plan"}');
  assert.deepEqual(received[0], { url: '/v1/today', authorization: 'Bearer rpm-http-secret' });
  for (const next of ['deny', 'invalid', 'stall']) {
    mode = next;
    assert.equal((await tool.execute('call', {})).content[0].text, 'RPM API request failed');
  }
});
