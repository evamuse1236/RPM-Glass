import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fixture from '../web/fixtures/snapshot.json' with {type: 'json'};
import {validateSnapshot, validateCommand} from '../web/contract/validate.mjs';
import {buildSnapshot} from './web-sync-snapshot.mjs';
import {createWebSyncProcessor} from './web-sync-commands.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {createMemoryBackend, createRepository} from '../intent-v2/src/repository.mjs';
import {editPlan} from './planner-state.mjs';
import {seedStore} from '../scripts/gauntlet/seed.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {changePlanner} from './planner-tools.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {field, operation, turn} from '../intent-v2/test/helpers.mjs';

const now = new Date('2026-10-19T12:00:00+05:30');
const cmd = (type, args, baseRevision = 0) => ({id: randomUUID(), type, args, baseRevision, createdAt: now.toISOString()});
function setup(seed = null, backend = null, capture = undefined) {
  const data = seed ?? freshStore();
  if (!seed) editPlan(data, {type: 'saveTask', fields: {title: 'Call the bank', notes: 'Original notes'}}, now);
  const store = backend ?? createMemoryBackend(data);
  return {backend: store, processor: createWebSyncProcessor({backend: store, capture, clock: () => now})};
}
async function local(backend, reduce) { const repository = createRepository(backend); return repository.transact(randomUUID(), {}, reduce); }

test('snapshot projects the real synthetic rpmctl seed, with default body values and a stable saved time', () => {
  const seed = seedStore(now).data, snapshot = buildSnapshot(seed);
  assert.equal(validateSnapshot(snapshot), snapshot);
  assert.deepEqual(buildSnapshot(seed), snapshot);
  assert.equal(snapshot.savedAt, '1970-01-01T00:00:00.000Z');
  seed.syncSavedAt = now.toISOString(); assert.equal(buildSnapshot(seed).savedAt, seed.syncSavedAt);
  assert.deepEqual(snapshot.tasks, fixture.tasks);
  for (const collection of ['blocks', 'projects', 'areas', 'goals']) assert.deepEqual(snapshot[collection], fixture[collection]);
  const defaults = buildSnapshot(freshStore()).body;
  assert.equal(defaults.water.settings.goal, 8); assert.equal(defaults.water.settings.reminders, true);
  assert.deepEqual(defaults.mealPlan.slots.map(s => s.at), ['08:30', '13:00', '20:00']);
});

test('snapshot removes credentials, history, executable draft instructions and nested unknown fields', () => {
  const data = seedStore(now).data;
  data.apiKey = 'private-key'; data.history.push({text: 'private-history'}); data.planner.blocks[0].token = 'private-token';
  data.entries[0].revisions.push({secret: 'private-revision'});
  data.intentV2 = {drafts: {d: {id: 'd', status: 'draft', title: 'A draft', reply: 'Review me', operations: [{secret: 'private-operation'}], modelPayload: 'private-model'}}, captures: {}};
  for (let i = 0; i < 55; i++) data.intentV2.captures[`c${i}`] = {messageId: `c${i}`, raw: `  Exact words\n${i}  `, at: new Date(+now + i).toISOString(), status: 'captured', token: 'private-capture'};
  data.planner.body.water.settings.token = 'private-water';
  const snapshot = buildSnapshot(data), serialized = JSON.stringify(snapshot);
  assert.equal(snapshot.captures.length, 50); assert.equal(snapshot.captures[0].text, '  Exact words\n5  ');
  assert.deepEqual(snapshot.drafts[0], {id: 'd', status: 'draft', title: 'A draft', reply: 'Review me', receipt: [], taskIds: []});
  assert.doesNotMatch(serialized, /private-|modelPayload|operations|apiKey|revisions|history/);
  assert.equal(validateSnapshot(snapshot), snapshot);
});

test('validators reject malformed dates, extra keys, bad identifiers and invalid command variants', () => {
  assert.equal(validateSnapshot(fixture), fixture);
  const variants = [cmd('capture', {text: 'exact words'}), cmd('complete', {taskId: 1}), cmd('uncomplete', {taskId: 1, occurrence: now.toISOString()}),
    cmd('reschedule', {taskId: 1, time: null, day: '2026-10-20'}), cmd('edit', {taskId: 1, fields: {title: 'Renamed'}}), cmd('move-to-block', {taskId: 1, blockId: null}),
    cmd('archive', {taskId: 1}), cmd('restore', {taskId: 1}), cmd('log-water', {at: now.toISOString()}), cmd('log-meal', {name: 'Poha', slot: 'breakfast', at: now.toISOString()}), cmd('undo', {commandId: randomUUID()})];
  for (const value of variants) assert.equal(validateCommand(value), value);
  const invalid = [{...variants[0], key: 'secret'}, {...variants[1], id: 'bad'}, {...variants[1], args: {taskId: 1, key: 'secret'}}, {...variants[1], baseRevision: -1},
    {...variants[0], createdAt: '2026-02-30T01:00:00Z'}, {...variants[0], createdAt: '2026-10-19T25:00:00Z'}, cmd('edit', {taskId: 1, fields: {}}), cmd('edit', {taskId: 1, fields: {key: 'secret'}}),
    cmd('reschedule', {taskId: 1, time: now.toISOString(), day: '2026-10-20'}), cmd('reschedule', {taskId: 1, time: null, day: '2026-02-30'})];
  for (const value of invalid) assert.throws(() => validateCommand(value), /^Error: Invalid browser command$/);
  const bad = structuredClone(fixture); bad.body.water.settings.key = 'secret'; assert.throws(() => validateSnapshot(bad), /Invalid planner snapshot/);
});

test('all task command types execute the actual planner and preserve original words', async () => {
  const {backend, processor} = setup();
  const process = async (type, args) => {
    const command = cmd(type, args, (await backend.load()).version), result = await processor.process(command);
    assert.equal(result.status, 'applied', result.message); assert.equal(result.newRevision, (await backend.load()).version); return result;
  };
  await process('complete', {taskId: 1}); assert.equal((await backend.load()).entries[0].done, true);
  await process('uncomplete', {taskId: 1}); assert.equal((await backend.load()).entries[0].done, false);
  await process('reschedule', {taskId: 1, time: now.toISOString(), day: null});
  assert.equal((await backend.load()).entries[0].planned, now.toISOString());
  await process('reschedule', {taskId: 1, time: null, day: '2026-10-20'});
  await process('edit', {taskId: 1, fields: {title: 'Ring the bank', notes: 'New notes', minutes: 45, alert: 'reminder', time: now.toISOString()}});
  let data = await backend.load(); assert.equal(data.entries[0].raw, 'Call the bank'); assert.equal(data.entries[0].title, 'Ring the bank'); assert.equal(data.entries[0].notes, 'New notes'); assert.equal(data.entries[0].minutes, 45); assert.equal(data.entries[0].alertIntent.type, 'reminder');
  let block; await local(backend, current => { block = editPlan(current, {type: 'saveEntity', collection: 'blocks', fields: {title: 'Bank fee refunded'}}, now); });
  await process('move-to-block', {taskId: 1, blockId: block}); assert.equal((await backend.load()).entries[0].blockId, block);
  await process('move-to-block', {taskId: 1, blockId: null}); assert.equal((await backend.load()).entries[0].blockId, null);
  await process('archive', {taskId: 1}); data = await backend.load(); assert.equal(data.entries[0].archived, true); assert.equal(data.entries[0].archiveDisposition, 'trash');
  await process('restore', {taskId: 1}); assert.equal((await backend.load()).entries[0].archived, false);
  validateSnapshot(await processor.snapshot());
});

test('water and meal logs are additive and exact retries survive processor recreation', async () => {
  const {backend, processor} = setup();
  const water = cmd('log-water', {at: now.toISOString()}, 999);
  const first = await processor.process(water), second = await setup(null, backend).processor.process(water);
  assert.deepEqual(first, second); assert.equal((await backend.load()).planner.body.water.glasses.length, 1);
  const meal = cmd('log-meal', {name: 'Poha and tea', slot: 'breakfast', at: now.toISOString()}, 999);
  assert.equal((await processor.process(meal)).status, 'applied'); await processor.process(meal);
  assert.equal((await backend.load()).planner.body.meals.length, 1);
  await assert.rejects(processor.process({...water, args: {at: '2026-10-19T08:00:00Z'}}), {code: 'COMMAND_ID_REUSED'});
});

test('retained bases compare relevant fields, allow unrelated edits and reject missing or changed targets', async () => {
  const {backend, processor} = setup(), base = await processor.snapshot();
  await local(backend, data => editPlan(data, {type: 'saveTask', id: 1, fields: {notes: 'Changed locally'}}, now));
  const title = cmd('edit', {taskId: 1, fields: {title: 'Call today'}}, base.revision);
  assert.equal((await processor.process(title, {snapshots: [base]})).status, 'applied');
  const stale = cmd('edit', {taskId: 1, fields: {title: 'Overwrite title'}}, base.revision);
  assert.equal((await processor.process(stale, {snapshots: [base]})).status, 'conflict');
  assert.equal((await processor.process(cmd('complete', {taskId: 1}, 9823))).status, 'conflict');
  assert.equal((await processor.process(cmd('complete', {taskId: 999}, (await backend.load()).version))).status, 'conflict');
  assert.equal((await backend.load()).entries[0].title, 'Call today');
});

test('a recoverable archive does not hide notes edited since the browser base', async () => {
  const {backend, processor} = setup(), base = await processor.snapshot();
  await local(backend, data => editPlan(data, {type: 'saveTask', id: 1, fields: {notes: 'New phone notes'}}, now));
  assert.equal((await processor.process(cmd('archive', {taskId: 1}, base.revision), {snapshots: [base]})).status, 'conflict');
  assert.equal((await backend.load()).entries[0].archived, false);
});

test('Undo uses normal planner Undo only while its exact saved plan is still current', async () => {
  const {backend, processor} = setup(), change = cmd('edit', {taskId: 1, fields: {title: 'Renamed'}});
  await processor.process(change);
  assert.equal((await processor.process(cmd('undo', {commandId: change.id}, 1))).status, 'applied');
  assert.equal((await backend.load()).entries[0].title, 'Call the bank');
  const second = cmd('complete', {taskId: 1}, (await backend.load()).version); await processor.process(second);
  await local(backend, data => editPlan(data, {type: 'saveTask', fields: {title: 'Newer phone task'}}, now));
  const undo = await processor.process(cmd('undo', {commandId: second.id}, (await backend.load()).version));
  assert.equal(undo.status, 'conflict'); assert.equal((await backend.load()).entries.length, 2); assert.equal((await backend.load()).entries[0].done, true);
});

test('save acknowledgement loss reconciles the durable receipt and a failed save can retry safely', async () => {
  const storage = setup().backend; let after = true, before = false;
  const backend = {load: () => storage.load(), async save(expected, next) { if (before) { before = false; throw new Error('Transport timeout'); } await storage.save(expected, next); if (after) { after = false; throw new Error('Lost response'); } }};
  const processor = setup(null, backend).processor, water = cmd('log-water', {at: now.toISOString()});
  assert.equal((await processor.process(water)).status, 'applied'); await processor.process(water);
  assert.equal((await storage.load()).planner.body.water.glasses.length, 1);
  before = true; const meal = cmd('log-meal', {name: 'Lunch', slot: 'lunch', at: now.toISOString()});
  await assert.rejects(processor.process(meal), {code: 'SAVE_UNKNOWN'});
  assert.equal((await processor.process(meal)).status, 'applied'); assert.equal((await storage.load()).planner.body.meals.length, 1);
});

test('a phone save racing the command is reloaded before checking its base and committing', async () => {
  const storage = setup().backend, base = buildSnapshot(await storage.load()); let race = true;
  const backend = {load: () => storage.load(), async save(expected, next) {
    if (race) { race = false; const phone = await storage.load(); editPlan(phone, {type: 'saveTask', id: 1, fields: {notes: 'Saved concurrently'}}, now); phone.version++; await storage.save(expected, phone); }
    return storage.save(expected, next);
  }};
  const processor = setup(null, backend).processor;
  const result = await processor.process(cmd('edit', {taskId: 1, fields: {title: 'Changed from web'}}, base.revision), {snapshots: [base]});
  assert.equal(result.status, 'applied'); const task = (await storage.load()).entries[0];
  assert.equal(task.title, 'Changed from web'); assert.equal(task.notes, 'Saved concurrently');
});

test('recurring complete and uncomplete act on the requested occurrence', async () => {
  const seed = freshStore(); editPlan(seed, {type: 'saveTask', fields: {title: 'Walk', recurrence: 'daily', planned: now.toISOString()}}, now);
  const {backend, processor} = setup(seed), occurrence = now.toISOString();
  assert.equal((await processor.process(cmd('complete', {taskId: 1, occurrence}))).status, 'applied');
  assert.deepEqual((await backend.load()).entries[0].completedOccurrences, [occurrence]);
  assert.equal((await processor.process(cmd('uncomplete', {taskId: 1, occurrence}, (await backend.load()).version))).status, 'applied');
  assert.deepEqual((await backend.load()).entries[0].completedOccurrences, []);
});

function realCapture(backend, model) {
  const service = createIntentService({backend, model, changePlanner, undo, editPlan, readCalendar: async () => ({status: 'not_selected', events: []}), clock: () => now, timezone: 'Asia/Kolkata'});
  const memory = new Map(), traces = createTraceStore({storage: {getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v)}, clock: () => now});
  return createCaptureAgent({service, traces, clock: () => now});
}
test('Capture enters the real agent, keeps exact words before the model, and retries without duplicate effects', async () => {
  const backend = createMemoryBackend(freshStore()); let calls = 0; const raw = '  Call the bank at 10:30 am  ';
  const capture = realCapture(backend, async () => {
    calls++; const data = await backend.load(); assert.equal(data.webSync.commands[command.id].state, 'processing'); assert.equal(data.intentV2.captures[command.id].raw, raw);
    return turn(raw, [operation([field('title', 'Call the bank', 'Call the bank'), field('time', '10:30 am', '10:30 am')])]);
  });
  const processor = setup(null, backend, capture).processor, command = cmd('capture', {text: raw});
  const applied = await processor.process(command); assert.equal(applied.status, 'applied');
  assert.deepEqual(await setup(null, backend, capture).processor.process(command), applied);
  assert.equal(calls, 1); assert.equal((await backend.load()).entries.length, 1);
  const snapshot = await processor.snapshot(); assert.equal(snapshot.captures[0].text, raw); assert.match(snapshot.captures[0].receipt[0].text, /Call the bank/); assert.equal(validateSnapshot(snapshot), snapshot);
});

test('Capture resumes a saved interpreted draft after a crash without asking the model again', async () => {
  const backend = createMemoryBackend(freshStore()), command = cmd('capture', {text: 'Call the bank at 10:30 am'}); let calls = 0, failFinish = true;
  const wrapped = {load: () => backend.load(), async save(expected, next) {
    if (failFinish && next.webSync?.commands[command.id]?.state === 'final') { failFinish = false; throw new Error('Transport interrupted before receipt'); }
    return backend.save(expected, next);
  }};
  const capture = realCapture(wrapped, async () => { calls++; return turn(command.args.text, [operation([field('title', 'Call the bank', 'Call the bank'), field('time', '10:30 am', '10:30 am')])]); });
  await assert.rejects(setup(null, wrapped, capture).processor.process(command), {code: 'SAVE_UNKNOWN'});
  assert.equal((await setup(null, wrapped, capture).processor.process(command)).status, 'applied');
  assert.equal(calls, 1); assert.equal((await backend.load()).entries.length, 1);
});

test('Capture Undo uses its normal agent and recovers after losing its final receipt', async () => {
  const backend = createMemoryBackend(freshStore()), command = cmd('capture', {text: 'Call the bank at 10:30 am'});
  const undoCommand = cmd('undo', {commandId: command.id}); let failFinish = true, calls = 0;
  const wrapped = {load: () => backend.load(), async save(expected, next) {
    if (failFinish && next.webSync?.commands[undoCommand.id]?.state === 'final') { failFinish = false; throw new Error('Lost undo receipt'); }
    return backend.save(expected, next);
  }};
  const capture = realCapture(wrapped, async () => { calls++; return turn(command.args.text, [operation([field('title', 'Call the bank', 'Call the bank'), field('time', '10:30 am', '10:30 am')])]); });
  const processor = setup(null, wrapped, capture).processor;
  assert.equal((await processor.process(command)).status, 'applied');
  assert.equal((await backend.load()).webSync.commands[command.id].undoGuard.length, 64);
  await assert.rejects(processor.process(undoCommand), {code: 'SAVE_UNKNOWN'});
  assert.equal((await backend.load()).entries.length, 0);
  const resumed = setup(null, wrapped, capture).processor, result = await resumed.process(undoCommand);
  assert.equal(result.status, 'applied'); assert.deepEqual(await resumed.process(undoCommand), result); assert.equal(calls, 1);
  assert.equal(Object.values((await backend.load()).intentV2.drafts)[0].status, 'undone');
});

test('a newer phone edit prevents Capture Undo from restoring its older planner', async () => {
  const backend = createMemoryBackend(freshStore()), command = cmd('capture', {text: 'Call the bank at 10:30 am'});
  const capture = realCapture(backend, async () => turn(command.args.text, [operation([field('title', 'Call the bank', 'Call the bank'), field('time', '10:30 am', '10:30 am')])]));
  const processor = setup(null, backend, capture).processor; await processor.process(command);
  await local(backend, data => editPlan(data, {type: 'saveTask', fields: {title: 'New phone task'}}, now));
  assert.equal((await processor.process(cmd('undo', {commandId: command.id}))).status, 'conflict');
  assert.equal((await backend.load()).entries.length, 2);
});

test('a model failure leaves one exact saved capture and a durable rejected result', async () => {
  const backend = createMemoryBackend(freshStore()); let calls = 0;
  const capture = realCapture(backend, async () => { calls++; throw new Error('No model credential'); });
  const processor = setup(null, backend, capture).processor, command = cmd('capture', {text: '  Keep my exact words\nplease  '});
  const result = await processor.process(command); assert.equal(result.status, 'rejected'); assert.match(result.message, /words were kept/);
  assert.deepEqual(await processor.process(command), result); assert.equal(Object.keys((await backend.load()).intentV2.captures).length, 1);
  assert.equal((await processor.snapshot()).captures[0].text, command.args.text); assert.ok(calls >= 1);
});
