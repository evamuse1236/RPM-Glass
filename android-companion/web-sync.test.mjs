import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fixture from '../web/fixtures/snapshot.json' with {type: 'json'};
import {validateSnapshot, validateCommand} from '../web/contract/validate.mjs';
import {buildSnapshot} from './web-sync-snapshot.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {seedStore} from '../scripts/gauntlet/seed.mjs';

const now = new Date('2026-10-19T12:00:00+05:30');
const cmd = (type, args, baseRevision = 0) => ({id: randomUUID(), type, args, baseRevision, createdAt: now.toISOString()});

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
