import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {createMemoryBackend, createRepository} from '../intent-v2/src/repository.mjs';
import {stable} from '../intent-v2/src/context.mjs';
import {editPlan} from './planner-state.mjs';
import {createWebSyncProcessor} from './web-sync-commands.mjs';

const now = new Date('2026-10-19T06:30:00Z');
const command = (type, args) => ({id: randomUUID(), type, args, baseRevision: 0, createdAt: now.toISOString()});

test('a command from a revoked browser is durably rejected before planner or model effects', async () => {
  const seed = freshStore(); editPlan(seed, {type: 'saveTask', fields: {title: 'Call the bank'}}, now);
  const backend = createMemoryBackend(seed); let modelCalls = 0;
  const capture = {capture: async () => { modelCalls++; throw new Error('Revoked Capture must not run'); }};
  const processor = createWebSyncProcessor({backend, capture, clock: () => now});
  for (const input of [command('complete', {taskId: 1}), command('capture', {text: 'Add another task'})]) {
    const result = await processor.process(input, {revoked: true});
    assert.equal(result.status, 'rejected'); assert.match(result.message, /revoked/);
    assert.deepEqual(await processor.process(input), result);
    const saved = await backend.load(); assert.equal(saved.webSync.commands[input.id].state, 'final');
    assert.equal(saved.entries[0].done, false); assert.equal(saved.entries.length, 1);
  }
  assert.equal(modelCalls, 0); assert.equal((await backend.load()).intentV2.captures instanceof Object, true);
  assert.equal(Object.keys((await backend.load()).intentV2.captures).length, 0);
});

test('revocation after a lost cloud acknowledgement returns the original applied receipt', async () => {
  const backend = createMemoryBackend(freshStore()), input = command('log-water', {at: now.toISOString()});
  const processor = createWebSyncProcessor({backend, clock: () => now}), applied = await processor.process(input);
  const before = await backend.load();
  const restarted = createWebSyncProcessor({backend, clock: () => now});
  assert.deepEqual(await restarted.process(input, {revoked: true}), applied);
  assert.equal((await backend.load()).version, before.version); assert.equal((await backend.load()).planner.body.water.glasses.length, 1);
  await assert.rejects(restarted.process({...input, args: {at: '2026-10-20T06:30:00Z'}}, {revoked: true}), {code: 'COMMAND_ID_REUSED'});
});

test('a durable Capture processing marker resumes after browser revocation', async () => {
  const seed = freshStore(), input = command('capture', {text: 'Words already being processed'});
  seed.webSync = {commands: {[input.id]: {signature: stable(input), state: 'processing', messageId: input.id, conversationId: seed.conversations[0].id}}};
  const backend = createMemoryBackend(seed), repository = createRepository(backend); let calls = 0;
  const capture = {capture: async ({messageId, conversationId, text}) => {
    calls++;
    await repository.transact(`capture:${messageId}`, {}, data => {
      data.intentV2.captures[messageId] = {messageId, conversationId, raw: text, at: now.toISOString(), status: 'interpreted'};
      return {status: 'interpreted'};
    });
  }};
  const processor = createWebSyncProcessor({backend, capture, clock: () => now});
  assert.equal((await processor.process(input, {revoked: true})).status, 'applied'); assert.equal(calls, 1);
  assert.equal((await processor.snapshot()).captures[0].text, input.args.text);
});
