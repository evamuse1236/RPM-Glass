import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryBackend, createRepository} from '../intent-v2/src/repository.mjs';
import {seedStore} from '../scripts/gauntlet/seed.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan} from './planner-state.mjs';
import {buildSnapshot} from './web-sync-snapshot.mjs';
import {createWebSyncProcessor, targets} from './web-sync-commands.mjs';
import {validateCommand, validateSnapshot} from '../web/contract/validate.mjs';
import {dayTasks} from './planner-ux.mjs';
import {reviewSummary, reviewWeek} from './review-state.mjs';
import {bodyOf} from './body-store.mjs';

const now = new Date('2026-10-19T12:00:00+05:30');
const command = (op, baseRevision = 0) => ({id: randomUUID(), type: 'plan', args: {op}, baseRevision, createdAt: now.toISOString()});
function setup(data = seedStore(now).data, backend = createMemoryBackend(data)) {
  return {backend, processor: createWebSyncProcessor({backend, clock: () => now})};
}
const local = (backend, op) => createRepository(backend).transact(randomUUID(), {}, data => editPlan(data, op, now));

// UUIDs and event IDs vary; compare the public state and the actual Undo records without event IDs.
function publicPlan(data) { const s = buildSnapshot(data); return {entries: s.entries, planner: s.planner}; }

test('snapshot v2 runs the phone queries directly, with recurrence, review, routines, skipped meals and safe activity summaries', () => {
  const data = seedStore(now).data;
  editPlan(data, {type: 'saveTask', fields: {title: 'Chosen days', recurrence: 'days', repeatDays: [1, 3], planned: now.toISOString(), alert: 'reminder', alertLead: 15}}, now);
  editPlan(data, {type: 'saveTask', id: data.entries.at(-1).id, fields: {done: true}}, now);
  editPlan(data, {type: 'saveMeal', meal: {slot: 'lunch', name: 'Lunch skipped', state: 'skipped', at: now.toISOString()}}, now);
  editPlan(data, {type: 'reviewProgress', week: '2026-10-19', patch: {step: 3, clashes: {'2026-10-19|Trace lecture|Rotate token': 'a'}}}, now);
  const snapshot = buildSnapshot(data), store = {entries: snapshot.entries, planner: snapshot.planner};
  assert.equal(snapshot.schemaVersion, 2);
  const ids = value => ({active: value.active.map(t => t.id), completed: value.completed.map(t => t.id), focus: value.focus?.id});
  assert.deepEqual(ids(dayTasks(store, '2026-10-19', +now)), ids(dayTasks(data, '2026-10-19', +now)));
  assert.deepEqual(reviewSummary(store, reviewWeek('2026-10-19'), now), reviewSummary(data, reviewWeek('2026-10-19'), now));
  assert.deepEqual(bodyOf(store).runs, bodyOf(data).runs.map(r => ({...r, skippedDay: !!r.skippedDay})));
  assert.equal(store.planner.body.meals.at(-1).state, 'skipped');
  assert.equal(store.entries.at(-1).alertIntent.lead, 15);
  assert.deepEqual(store.entries.at(-1).repeatDays, [1, 3]);
  assert.ok(!Object.hasOwn(store.planner, 'undo'));
});

test('plan op matches the phone tap operation, durable retries apply once, and Undo restores it', async () => {
  const data = seedStore(now).data, expected = structuredClone(data);
  const op = {type: 'batch', ops: [{type: 'saveTask', id: 1, fields: {planned: now.toISOString(), plannedDate: null, notes: 'Exact new notes', recurrence: 'days', repeatDays: [1, 3]}}, {type: 'drinkWater', at: now.toISOString()}]};
  editPlan(expected, op, now);
  const {backend, processor} = setup(data), cmd = command(op, data.version);
  const result = await processor.process(cmd);
  assert.equal(result.status, 'applied', result.message);
  assert.deepEqual(publicPlan(await backend.load()), publicPlan(expected));
  assert.deepEqual(await setup(null, backend).processor.process(cmd), result);
  assert.deepEqual(publicPlan(await backend.load()), publicPlan(expected));
  const undo = {...command({}, result.newRevision), type: 'undo', args: {commandId: cmd.id}};
  assert.equal((await processor.process(undo)).status, 'applied');
  assert.deepEqual(publicPlan(await backend.load()), publicPlan(data));
});

test('target conflicts cover changed tasks, cascaded priority rows, entities, weeks, routine runs and settings', async () => {
  const cases = [
    [{type: 'saveTask', id: 1, fields: {title: 'Browser'}}, {type: 'saveTask', id: 1, fields: {notes: 'Phone notes'}}],
    [{type: 'moveTask', id: 1, blockId: 'block-2'}, {type: 'saveTask', id: 2, fields: {notes: 'Another target row'}}],
    [{type: 'removeEntity', collection: 'blocks', id: 'block-1'}, {type: 'saveTask', id: 1, fields: {notes: 'New notes'}}],
    [{type: 'saveEntity', collection: 'blocks', id: 'block-1', fields: {title: 'Browser'}}, {type: 'markAchieved', id: 'block-1', achieved: true}],
    [{type: 'setWeekFocus', week: '2026-10-19', ids: []}, {type: 'setWeekFocus', week: '2026-10-19', ids: ['block-1']}],
    [{type: 'setWater', fields: {goal: 9}}, {type: 'setWater', fields: {intervalMinutes: 60}}],
  ];
  for (const [op, phoneOp] of cases) {
    const {backend, processor} = setup(), base = await processor.snapshot();
    await local(backend, phoneOp);
    const current = publicPlan(await backend.load());
    const result = await processor.process(command(op, base.revision), {snapshots: [base]});
    assert.equal(result.status, 'conflict', `${op.type}: ${result.message}`);
    assert.deepEqual(publicPlan(await backend.load()), current);
  }
  const {backend, processor} = setup(), base = await processor.snapshot(), routine = base.planner.body.routines[0];
  const op = {type: 'saveRoutineRun', run: {routineId: routine.id, day: '2026-10-19', marks: {}}};
  await local(backend, {type: 'skipRoutineDay', routineId: routine.id, day: '2026-10-19'});
  assert.equal((await processor.process(command(op, base.revision), {snapshots: [base]})).status, 'conflict');
});

test('new records, water and meal logs are additive without retained bases; unrelated edits do not conflict', async () => {
  const {backend, processor} = setup();
  const ops = [{type: 'saveTask', fields: {title: 'New task'}}, {type: 'saveEntity', collection: 'areas', fields: {title: 'New Area'}},
    {type: 'saveRoutine', routine: {name: 'New routine', start: '08:00', end: '08:30', days: [1], steps: [{title: 'Stretch'}]}},
    {type: 'drinkWater', at: now.toISOString()}, {type: 'saveMeal', meal: {name: 'Lunch', slot: 'lunch', at: now.toISOString()}}];
  for (const op of ops) {
    assert.deepEqual(targets(op), []);
    const result = await processor.process(command(op, 999999));
    assert.equal(result.status, 'applied', result.message);
  }
  const base = await processor.snapshot();
  await local(backend, {type: 'saveTask', id: 2, fields: {notes: 'Unrelated notes'}});
  assert.equal((await processor.process(command({type: 'saveTask', id: 1, fields: {notes: 'Browser notes'}}, base.revision), {snapshots: [base]})).status, 'applied');
});

test('disallowed ops and extra nested keys fail before effects, including inside a batch', async () => {
  const {backend, processor} = setup(), before = await backend.load();
  for (const type of ['aiDraft', 'acceptDraft', 'dismissDraft', 'undo', 'unknown']) {
    for (const op of [{type}, {type: 'batch', ops: [{type}]}]) await assert.rejects(processor.process(command(op)), /Invalid browser command/);
  }
  for (const op of [{type: 'saveTask', id: 1, fields: {token: 'private'}}, {type: 'saveRoutineRun', run: {routineId: 'r', day: '2026-10-19', marks: {s: {state: 'done', at: now.toISOString(), trace: {}}}}}]) {
    assert.throws(() => validateCommand(command(op)), /Invalid browser command/);
  }
  assert.deepEqual(await backend.load(), before);
});

test('v2 rejects forbidden and unknown fields at all fixed and identifier-map boundaries', () => {
  const snapshot = buildSnapshot(seedStore(now).data);
  snapshot.planner.weeks['2026-10-19'] = {focus: [], verdicts: {}};
  snapshot.planner.reviews['2026-10-19'] = {step: 1, startedAt: now.toISOString(), updatedAt: now.toISOString(), clashes: {}};
  const paths = [[], ['entries', 0], ['entries', 0, 'alertIntent'], ['planner'], ['planner', 'context'], ['planner', 'body', 'water', 'settings'], ['planner', 'weeks', '2026-10-19'], ['planner', 'reviews', '2026-10-19'], ['planner', 'body', 'routines', 0, 'steps', 0]];
  for (const path of paths) for (const key of ['token', 'traces', 'modelPayload', 'undo', 'history', 'conversations', 'memories', 'unknown']) {
    const copy = structuredClone(snapshot), target = path.reduce((value, k) => value[k], copy);
    target[key] = 'private';
    assert.throws(() => validateSnapshot(copy), /Invalid planner snapshot/, `${path.join('.')}.${key}`);
  }
  const map = structuredClone(snapshot); map.planner.body.mealGuesses.m = {status: 'pending', by: 'Jev', at: now.toISOString(), token: 'leak'};
  assert.throws(() => validateSnapshot(map), /Invalid planner snapshot/);
  assert.throws(() => validateSnapshot({...snapshot, schemaVersion: 1}), /Invalid planner snapshot/);
});

test('quiet or keepUndo plan commands never undo an earlier command on their own receipt', async () => {
  const {backend, processor} = setup(freshStore());
  const op = command({type: 'saveTask', fields: {title: 'First'}});
  await processor.process(op);
  const quiet = command({type: 'reviewProgress', week: '2026-10-19', patch: {step: 2}}, (await backend.load()).version);
  await processor.process(quiet);
  assert.ok(!Object.hasOwn((await backend.load()).webSync.commands[quiet.id], 'undoGuard'));
  assert.equal((await processor.process({...command({}, 2), type: 'undo', args: {commandId: quiet.id}})).status, 'conflict');
});

test('revocation rejects an unstarted plan, while an applied plan keeps its true receipt', async () => {
  const {backend, processor} = setup(freshStore());
  const denied = command({type: 'saveTask', fields: {title: 'Revoked action'}});
  assert.equal((await processor.process(denied, {revoked: true})).status, 'rejected');
  assert.equal((await backend.load()).entries.length, 0);
  const allowed = command({type: 'saveTask', fields: {title: 'Saved before revocation'}});
  const first = await processor.process(allowed);
  assert.equal(first.status, 'applied');
  assert.deepEqual(await setup(null, backend).processor.process(allowed, {revoked: true}), first);
  assert.equal((await backend.load()).entries.length, 1);
});

test('a Project made in the browser keeps its id when the phone applies it; a taken or bad id falls back to a fresh one', async () => {
  const data = seedStore(now).data, {backend, processor} = setup(data);
  const op = {type: 'saveEntity', collection: 'projects', fields: {title: 'Browser project'}};
  const ids = [randomUUID(), randomUUID()];
  const made = {...command(op, data.version), args: {op, ids}};
  assert.deepEqual(validateCommand(made), made);
  assert.equal((await processor.process(made)).status, 'applied');
  const saved = await backend.load();
  assert.equal(saved.planner.projects.find(p => p.title === 'Browser project').id, ids[0]);
  const again = {...command(op, saved.version), args: {op: {...op, fields: {title: 'Second'}}, ids}};
  assert.equal((await processor.process(again)).status, 'applied');
  const second = (await backend.load()).planner.projects.find(p => p.title === 'Second').id;
  assert.notEqual(second, ids[0]);
  assert.match(second, /^[0-9a-f-]{36}$/);
  assert.throws(() => validateCommand({...made, args: {op, ids: ['not-an-id']}}));
});
