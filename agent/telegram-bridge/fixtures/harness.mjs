import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { Bridge } from '../bridge.mjs';

export const ROOT = path.resolve(import.meta.dirname, '..');
const TEST_ROOT = path.resolve(process.env.BRIDGE_TEST_TMPDIR || ROOT);
export const FAKE = path.join(ROOT, 'fixtures', 'fake-pi.mjs');
export const TOKEN = '123:telegram-secret-marker';
export const KEY = 'anthropic-secret-marker';
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const update = (id, prompt, chat = 42) => ({ update_id: id, message: { chat: { id: chat }, text: prompt } });
export const job = (id, prompt, phase = 'queued', chunks = [], nextChunk = 0) => ({ id, prompt, phase, chunks, nextChunk });
export const state = jobs => ({ version: 1, offset: 0, jobs, scheduleKeys: [] });

export async function until(predicate, message = 'Condition did not become true', timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await sleep(10); }
  assert.fail(message);
}

export async function harness(t, overrides = {}) {
  const folder = await mkdtemp(path.join(TEST_ROOT, '.test-'));
  const stateFile = path.join(folder, 'state.json');
  const audit = path.join(folder, 'audit.jsonl');
  const requests = [], sent = [], logs = [], updates = [];
  const failures = { poll: 0, send: 0 };
  let beforePoll, beforeSend;
  const server = createServer(async (request, response) => {
    try {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      const method = request.url.split('/').at(-1);
      requests.push({ method, body });
      let result;
      if (method === 'getUpdates') {
        await beforePoll?.(body);
        if (failures.poll-- > 0) { response.writeHead(503).end(JSON.stringify({ ok: false, description: TOKEN })); return; }
        result = updates.filter(entry => entry.update_id >= body.offset);
        if (!result.length) await sleep(10);
      } else if (method === 'sendMessage') {
        await beforeSend?.(body);
        if (failures.send-- > 0) { response.writeHead(429).end(JSON.stringify({ ok: false, error_code: 429, description: KEY, parameters: { retry_after: 1 } })); return; }
        sent.push(body);
        result = { message_id: sent.length };
      } else throw new Error('Unexpected method');
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, result }));
    } catch { response.writeHead(500).end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = { token: TOKEN, allowedChatId: '42', stateFile, telegramBaseUrl: `http://127.0.0.1:${server.address().port}`, piCommand: process.execPath, piArgs: [FAKE], childEnv: { ...process.env, FAKE_PI_AUDIT: audit, ANTHROPIC_API_KEY: KEY }, cwd: folder, pollTimeoutSeconds: 0, httpTimeoutMs: 500, retryBaseMs: 10, retryMaxMs: 40, restartBaseMs: 10, restartMaxMs: 80, healthyUptimeMs: 10000, schedulerIntervalMs: 15, turnTimeoutMs: 2000, shutdownGraceMs: 50, log: event => logs.push(event), ...overrides };
  const bridges = [];
  const fixture = {
    folder, stateFile, audit, config, requests, sent, logs, updates, failures,
    set beforePoll(callback) { beforePoll = callback; },
    set beforeSend(callback) { beforeSend = callback; },
    async events() { try { return (await readFile(audit, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } },
    async persisted() { return JSON.parse(await readFile(stateFile, 'utf8')); },
    async start(extra = {}) { const bridge = new Bridge({ ...config, ...extra }); bridges.push(bridge); await bridge.start(); return bridge; },
  };
  t.after(async () => {
    await Promise.all(bridges.map(bridge => bridge.stop().catch(() => {})));
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(folder), TEST_ROOT);
    await rm(folder, { recursive: true, force: true });
  });
  return fixture;
}
