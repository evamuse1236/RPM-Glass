import test from 'node:test';
import assert from 'node:assert/strict';
import snapshot from '../fixtures/snapshot.json' with {type: 'json'};
import {projectRecords, applyRecord, storeFromRecords} from './records.mjs';
import {editPlan, validatePlanner} from '../../android-companion/planner-state.mjs';

const seed = () => structuredClone({entries: snapshot.entries, planner: snapshot.planner});

test('public records round trip without losing phone revisions, private fields or checkins', () => {
  const store = seed(), checkin = {id: 900, kind: 'checkin', raw: 'Private checkin'};
  store.entries.push(checkin);
  store.entries[0].revisions = [{at: '2026-10-20T00:00:00.000Z', snapshot: {done: true}}];
  store.entries[0].private = 'kept locally';
  const records = projectRecords(store);
  assert.equal(records.has('task:900'), false);
  assert.equal(records.get('task:1').private, undefined);
  for (const [key, value] of records) applyRecord(store, key, value);
  assert.equal(store.entries[0].revisions.length, 1);
  assert.equal(store.entries[0].private, 'kept locally');
  assert.deepEqual(store.entries.at(-1), checkin);
  assert.deepEqual(projectRecords(store), records);
  const fresh = storeFromRecords(records);
  validatePlanner(fresh);
  assert.deepEqual(fresh.entries[0].revisions, []);
  editPlan(fresh, {type: 'saveTask', fields: {title: 'Server task'}});
  assert.equal(fresh.entries.at(-1).title, 'Server task');
});

test('applying a record deletes absent declared optional fields and keeps nested private fields', () => {
  const store = seed();
  store.entries[0].reviewChoice = {week: '2026-10-19', choice: 'carry', at: snapshot.savedAt};
  store.entries[0].alertIntent.private = 'local alert detail';
  const value = projectRecords(store).get('task:1');
  delete value.reviewChoice;
  applyRecord(store, 'task:1', value);
  assert.equal(Object.hasOwn(store.entries[0], 'reviewChoice'), false);
  assert.equal(store.entries[0].alertIntent.private, 'local alert detail');
  applyRecord(store, 'task:1', null);
  assert.equal(projectRecords(store).has('task:1'), false);
});

test('entity creation order converges independently of delivery order', () => {
  const values = [
    ['area:z', {id: 'z', title: 'Last', created: '2026-10-21T00:00:00.000Z'}],
    ['area:b', {id: 'b', title: 'Second', created: '2026-10-20T00:00:00.000Z'}],
    ['area:a', {id: 'a', title: 'First', created: '2026-10-20T00:00:00.000Z'}],
  ];
  const first = storeFromRecords(new Map(values)), second = storeFromRecords(new Map(values.toReversed()));
  assert.deepEqual(first.planner.areas.map(r => r.id), ['a', 'b', 'z']);
  assert.deepEqual(first, second);
});

test('review activity projects local revision days and pulled days without inventing revisions', () => {
  const store = seed();
  store.entries[0].revisions = [{at: '2026-10-20T22:00:00.000Z', snapshot: {done: true}}];
  store.sync = {remoteActivity: {'1': ['2026-10-19', '2026-10-21']}};
  assert.deepEqual(projectRecords(store).get('task:1').reviewActivityDays, ['2026-10-19', '2026-10-21']);
  const value = projectRecords(store).get('task:1');
  value.reviewActivityDays.push('2026-10-22');
  applyRecord(store, 'task:1', value);
  assert.deepEqual(projectRecords(store).get('task:1').reviewActivityDays, ['2026-10-19', '2026-10-21', '2026-10-22']);
  assert.equal(store.entries[0].revisions.length, 1);
});

test('two glasses at the same instant retain distinct occurrence keys across reconstruction and deletion', () => {
  const store = seed(), at = '2026-10-21T00:00:00.000Z';
  store.planner.body.water.glasses = [at, at];
  const records = projectRecords(store);
  assert.deepEqual([...records.keys()].filter(k => k.startsWith('glass:')), [`glass:${at}#0`, `glass:${at}#1`]);
  const fresh = storeFromRecords(new Map([...records].toReversed()));
  assert.deepEqual(fresh.planner.body.water.glasses, [at, at]);
  applyRecord(fresh, `glass:${at}#0`, null);
  assert.deepEqual(fresh.planner.body.water.glasses, [at]);
});

test('repairLinks repairs tombstoned links only, with the original group in each receipt', async () => {
  const {repairLinks} = await import('./records.mjs');
  const store = storeFromRecords(new Map([
    ['task:1', {id: 1, blockId: 'gone', priority: 3}], ['task:2', {id: 2, blockId: 'missing'}],
    ['block:b', {id: 'b', projectId: 'gone'}], ['project:p', {id: 'p', goalId: 'gone'}],
    ['goal:g', {id: 'g', areaId: 'gone'}],
    ['week:2026-10-19', {focus: ['gone', 'missing'], verdicts: {gone: 'achieved', missing: 'notyet'}}],
    ['run:r|2026-10-19', {routineId: 'r', day: '2026-10-19', marks: {}, skippedDay: false}],
    ['run:missing|2026-10-19', {routineId: 'missing', day: '2026-10-19', marks: {}, skippedDay: false}],
  ]));
  assert.deepEqual(repairLinks(store, () => false), []);
  const repairs = repairLinks(store, key => new Set(['block:gone', 'project:gone', 'goal:gone', 'area:gone', 'routine:r']).has(key));
  assert.deepEqual(repairs.map(r => [r.key, r.group]), [
    ['task:1', 'order'], ['block:b', 'projectId'], ['project:p', 'goalId'], ['goal:g', 'areaId'],
    ['week:2026-10-19', 'focus'], ['week:2026-10-19', 'verdicts'], ['run:r|2026-10-19', 'record'],
  ]);
  assert.deepEqual(repairs[0].before, {blockId: 'gone', priority: 3});
  assert.equal(store.entries[0].blockId, null);
  assert.equal(store.entries[1].blockId, 'missing');
  assert.deepEqual(store.planner.weeks['2026-10-19'], {focus: ['missing'], verdicts: {missing: 'notyet'}});
  assert.equal(store.planner.body.runs.length, 1);
  assert.equal(store.planner.body.runs[0].routineId, 'missing');
  assert.deepEqual(repairLinks(store, key => key.endsWith(':gone') || key === 'routine:r'), []);
});

test('all capture and draft summaries round trip without copying their private model state', () => {
  const store = seed();
  store.intentV2 = {captures: {}, drafts: {d: {id: 'd', status: 'draft', title: 'Review', operations: [{private: true}], reply: 'Ready'}}};
  for (let n = 0; n < 55; n++) store.intentV2.captures[`c${n}`] = {messageId: `c${n}`, raw: `  Exact words ${n}\n`, status: 'captured', at: snapshot.savedAt, token: 'secret'};
  const records = projectRecords(store);
  assert.equal([...records.keys()].filter(k => k.startsWith('capture:')).length, 55);
  assert.equal(records.get('capture:c0').text, '  Exact words 0\n');
  assert.equal(records.get('capture:c0').token, undefined);
  assert.equal(records.get('draft:d').operations, undefined);
  const fresh = storeFromRecords(records);
  assert.deepEqual(projectRecords(fresh), records);
  applyRecord(store, 'capture:c0', {...records.get('capture:c0'), status: 'interpreted'});
  assert.equal(store.intentV2.captures.c0.token, 'secret');
  assert.equal(projectRecords(store).get('capture:c0').status, 'interpreted');
  applyRecord(store, 'draft:d', {...records.get('draft:d'), reply: 'Changed remotely'});
  assert.equal(projectRecords(store).get('draft:d').reply, 'Changed remotely');
  assert.deepEqual(store.intentV2.drafts.d.operations, [{private: true}]);
});

test('record-related IDs use the runtime crypto allocator while retaining explicit entity IDs', async t => {
  const {newId, withIds} = await import('../../android-companion/new-id.mjs');
  t.mock.method(globalThis.crypto, 'randomUUID', () => '00000000-0000-4000-8000-000000000001');
  assert.equal(newId(), '00000000-0000-4000-8000-000000000001');
  assert.deepEqual(withIds(['chosen'], () => [newId(), newId()]), {
    result: ['chosen', '00000000-0000-4000-8000-000000000001'],
    ids: ['chosen', '00000000-0000-4000-8000-000000000001'],
  });
});

test('golden keys and groups describe the fixed public seed and every declared record field', async () => {
  const {readFile} = await import('node:fs/promises');
  const {recordKey, groupsOf} = await import('./records.mjs');
  const kinds = JSON.parse(await readFile(new URL('./records.json', import.meta.url)));
  const golden = JSON.parse(await readFile(new URL('../../fixtures/record-keys.json', import.meta.url)));
  assert.deepEqual([...projectRecords(seed()).keys()].sort(), golden.keys);
  assert.deepEqual(Object.fromEntries(Object.keys(kinds).map(kind => [kind, groupsOf(kind)])), golden.groups);
  assert.deepEqual(groupsOf('task').schedule, ['planned', 'plannedDate', 'recurrence', 'repeatDays', 'repeatAfterDays', 'completedOccurrences']);
  assert.deepEqual(groupsOf('task').completion, ['done', 'state', 'completedAt', 'completions']);
  assert.deepEqual(groupsOf('task').archive, ['archived', 'archiveDisposition']);
  assert.deepEqual(groupsOf('task').order, ['blockId', 'priority']);
  assert.deepEqual(groupsOf('goal').period, ['year', 'horizon', 'period']);
  assert.equal(recordKey('run', {routineId: 'r', day: '2026-10-19'}), 'run:r|2026-10-19');
  assert.equal(recordKey('glass', {instant: snapshot.savedAt, n: 1}), `glass:${snapshot.savedAt}#1`);
  const schema = JSON.parse(await readFile(new URL('./snapshot.schema.json', import.meta.url)));
  for (const [kind, spec] of Object.entries(kinds)) {
    const shape = spec.schema.reduce((part, field) => part[field], schema), fields = Object.values(groupsOf(kind)).flat();
    assert.deepEqual([...fields].sort(), Object.keys(shape.properties ?? {}).sort());
    assert.equal(new Set(fields).size, fields.length);
  }
});

test('applying draft summaries preserves the phone receipt and deletion removes both summary sources', () => {
  const store = seed(), receipt = {entryIds: [1], changes: [], privateUndo: {kept: true}};
  store.planner.drafts.push({id: 'd', status: 'stale', title: 'Old'});
  store.intentV2 = {drafts: {d: {id: 'd', status: 'committed', title: 'Saved', receipt, operations: []}}};
  const projected = projectRecords(store).get('draft:d');
  applyRecord(store, 'draft:d', projected);
  assert.deepEqual(store.intentV2.drafts.d.receipt, receipt);
  applyRecord(store, 'draft:d', null);
  assert.equal(projectRecords(store).has('draft:d'), false);
});

test('map record identifiers are own properties even when they name JavaScript prototype properties', () => {
  const store = seed(), value = {status: 'ready', by: 'Jev', at: snapshot.savedAt, kcal: 500};
  applyRecord(store, 'mealGuess:__proto__', value);
  assert.equal(Object.hasOwn(store.planner.body.mealGuesses, '__proto__'), true);
  assert.deepEqual(projectRecords(store).get('mealGuess:__proto__'), value);
  assert.equal(Object.getPrototypeOf(store.planner.body.mealGuesses), Object.prototype);
});
