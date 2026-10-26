import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeChange} from './merge.mjs';
import {storeFromRecords} from './records.mjs';
import {validatePlanner} from '../../android-companion/planner-state.mjs';

const early = '2026-10-20T00:00:00.000Z', late = '2026-10-21T00:00:00.000Z', now = '2026-10-22T00:00:00.000Z';
const change = (base, value, stamps = {}, baseRev = 1, key = 'task:1') => ({key, baseRev, base, value, stamps});
const row = (value, stamps = {}, rev = 2) => ({value, stamps, rev});

test('rules 1 and 2 take a new value or a change based on the current revision without mutating inputs', () => {
  const c = change(null, {id: 1, title: 'Phone'}, {title: late}, null);
  const before = structuredClone(c);
  assert.deepEqual(mergeChange(null, c, now), {value: c.value, stamps: c.stamps, conflicts: []});
  const existing = row({id: 1, title: 'Old'}, {title: early});
  assert.deepEqual(mergeChange(existing, {...c, baseRev: 2}, now), {value: c.value, stamps: {title: late}, conflicts: []});
  assert.deepEqual(c, before);
  assert.deepEqual(existing, row({id: 1, title: 'Old'}, {title: early}));
});

test('rule 3 retains tombstones, records rejected resurrection, and accepts an observed tombstone Undo', () => {
  const tombstone = row(null, {record: late}), value = {id: 1, title: 'Restored'};
  assert.deepEqual(mergeChange(tombstone, change({id: 1}, value, {title: now}), now), {
    value: null, stamps: tombstone.stamps,
    conflicts: [{key: 'task:1', group: 'record', kept: null, lost: value, lostFrom: 'phone', at: now}],
  });
  assert.deepEqual(mergeChange(tombstone, change(null, value, {title: now}, 2), now), {value, stamps: {title: now}, conflicts: []});
  assert.deepEqual(mergeChange(tombstone, change({id: 1}, null), now), {value: null, stamps: tombstone.stamps, conflicts: []});
});

test('rule 4 makes a phone delete win over a newer server edit and preserves the edited record', () => {
  const value = {id: 1, title: 'New server work'};
  assert.deepEqual(mergeChange(row(value, {title: now}), change({id: 1, title: 'Old'}, null, {record: early}), now), {
    value: null, stamps: {title: now, record: early},
    conflicts: [{key: 'task:1', group: 'record', kept: null, lost: value, lostFrom: 'server', at: now}],
  });
});

test('rule 5 merges independent groups, keeps an unchanged phone group and removes optional fields', () => {
  const base = {id: 1, title: 'Task', must: false, leverage: 'Old', notes: ''};
  const server = {...base, must: true}, phone = {...base, title: 'Renamed'};
  delete phone.leverage;
  const merged = mergeChange(row(server, {must: late}), change(base, phone, {title: late, leverage: late}), now);
  assert.deepEqual(merged, {value: {id: 1, title: 'Renamed', must: true, notes: ''}, stamps: {must: late, title: late, leverage: late}, conflicts: []});
  const again = mergeChange(row(merged.value, merged.stamps, 3), change(base, phone, {title: late, leverage: late}), now);
  assert.deepEqual(again, merged);
});

test('conflicting text uses the newer clamped stamp, keeps ties on the server, and preserves both versions', () => {
  const base = {id: 1, title: 'Original', notes: 'Existing notes'}, server = {...base, title: 'Website'}, phone = {...base, title: 'Phone'};
  for (const [phoneStamp, serverStamp, kept, lost, from, expectedStamp] of [
    [early, late, 'Website', 'Phone', 'phone', late],
    [late, early, 'Phone', 'Website', 'server', late],
    [late, late, 'Website', 'Phone', 'phone', late],
    ['2099-01-01T00:00:00.000Z', now, 'Website', 'Phone', 'phone', now],
  ]) {
    const input = row(server, {title: serverStamp}), c = change(base, phone, {title: phoneStamp});
    const result = mergeChange(input, c, now);
    assert.equal(result.value.title, kept);
    assert.equal(result.value.notes, `Existing notes\nChanged on two devices. Kept title '${kept}'. Other version from your ${from === 'phone' ? 'phone' : 'website'}: '${lost}'.`);
    assert.deepEqual(result.conflicts, [{key: 'task:1', group: 'title', kept: {title: kept}, lost: {title: lost}, lostFrom: from, at: now}]);
    assert.equal(result.stamps.title, expectedStamp);
    const replay = mergeChange(row(result.value, result.stamps, 3), c, now);
    assert.equal(replay.value.notes, result.value.notes);
    assert.deepEqual(input, row(server, {title: serverStamp}));
  }
});

test('atomic goal period conflicts keep a valid horizon, year and period together', () => {
  const base = {id: 'g', title: 'Goal', areaId: null, year: 2026, horizon: 'monthly', period: 12};
  const server = {...base, horizon: 'quarterly', period: 4}, phone = {...base, year: 2027};
  const result = mergeChange(row(server, {period: late}), change(base, phone, {period: early}, 1, 'goal:g'), now);
  assert.equal(result.value.horizon, 'quarterly');
  assert.equal(result.value.period, 4);
  assert.equal(result.value.year, 2026);
  assert.equal(result.conflicts[0].group, 'period');
  assert.deepEqual(result.conflicts[0].lost, {year: 2027, horizon: 'monthly', period: 12});
  validatePlanner(storeFromRecords(new Map([['goal:g', result.value]])));
});

test('sets merge membership by element, retaining independent additions and removals inside schedule', () => {
  const base = {id: 1, planned: null, completedOccurrences: ['a', 'b'], reviewActivityDays: ['2026-10-19']};
  const server = {...base, completedOccurrences: ['a', 'c'], reviewActivityDays: ['2026-10-19', '2026-10-20']};
  const phone = {...base, completedOccurrences: ['b', 'd'], reviewActivityDays: ['2026-10-19', '2026-10-21']};
  const result = mergeChange(row(server, {schedule: late, reviewActivityDays: late}), change(base, phone, {schedule: early, reviewActivityDays: early}), now);
  assert.deepEqual(result.value.completedOccurrences, ['c', 'd']);
  assert.deepEqual(result.value.reviewActivityDays, ['2026-10-19', '2026-10-20', '2026-10-21']);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(mergeChange(row(result.value, result.stamps, 3), change(base, phone, {schedule: early, reviewActivityDays: early}), now), result);
});

test('completion lists merge by occurrence, preserving independent completions and one winner per occurrence', () => {
  const a = {occurrence: early, completed: early}, b = {occurrence: late, completed: late};
  const base = {id: 1, done: false, state: 'active', completions: []};
  const server = {...base, completions: [a]}, phone = {...base, completions: [b]};
  const result = mergeChange(row(server, {completion: late}), change(base, phone, {completion: early}), now);
  assert.deepEqual(result.value.completions, [a, b]);
  assert.deepEqual(result.conflicts, []);
  const phoneEdit = {...base, completions: [{...a, completed: now}, b]};
  const both = mergeChange(row({...base, completions: [{...a, completed: late}]}, {completion: late}), change({...base, completions: [a]}, phoneEdit, {completion: now}), now);
  assert.deepEqual(both.value.completions, [{...a, completed: now}, b]);
  assert.equal(both.conflicts.length, 1);
  assert.equal(both.conflicts[0].group, 'completion');
});

test('run marks merge by step, including removals and conflicting edits', () => {
  const done = {state: 'done', at: early}, skipped = {state: 'skipped', at: late};
  const base = {routineId: 'r', day: '2026-10-20', marks: {a: done, b: done}, skippedDay: false};
  const server = {...base, marks: {a: skipped, b: done, c: done}}, phone = {...base, marks: {a: {...done, at: now}, d: done}};
  const result = mergeChange(row(server, {marks: late}), change(base, phone, {marks: now}, 1, 'run:r|2026-10-20'), now);
  assert.deepEqual(result.value.marks, {a: {...done, at: now}, c: done, d: done});
  assert.deepEqual(result.conflicts, [{key: 'run:r|2026-10-20', group: 'marks', kept: {marks: {a: {...done, at: now}}}, lost: {marks: {a: skipped}}, lostFrom: 'server', at: now}]);
});

test('natural-key creates three-way from null and order conflicts never produce a conflict note', () => {
  const base = {id: 1, blockId: 'original', priority: 1, planned: null, plannedDate: null, recurrence: null, repeatDays: null, repeatAfterDays: null, completedOccurrences: []};
  const server = {...base, blockId: 'server', priority: 4, plannedDate: '2026-10-21'}, phone = {...base, blockId: 'phone', priority: 2, recurrence: 'daily'};
  const result = mergeChange(row(server, {order: late, schedule: late}), change(base, phone, {order: early, schedule: early}), now);
  assert.deepEqual([result.value.blockId, result.value.priority], ['server', 4]);
  assert.equal(result.value.plannedDate, '2026-10-21');
  assert.equal(result.value.recurrence, null);
  assert.deepEqual(result.conflicts.map(c => c.group), ['schedule']);
  assert.equal(result.value.notes, undefined);
  const create = change({vision: 'Ignored base'}, {vision: 'Phone', goals: 'Independent'}, {vision: early, goals: early}, null, 'context:main');
  const merged = mergeChange(row({vision: 'Server', coreValues: 'Values'}, {vision: late}), create, now);
  assert.deepEqual(merged.value, {vision: 'Server', coreValues: 'Values', goals: 'Independent'});
  assert.deepEqual(merged.conflicts.map(c => c.group), ['vision']);
});

test('all fast paths clamp future stamps and equal instants tie despite timezone spelling', () => {
  const future = '2099-01-01T00:00:00.000Z';
  const c = change(null, '2026-10-20T12:00:00Z', {value: future}, null, 'waterSnooze:main');
  assert.equal(mergeChange(null, c, now).stamps.value, now);
  assert.equal(mergeChange(row(null, {}, 1), {...c, baseRev: 1}, now).stamps.value, now);
  const server = row('server', {value: late});
  const result = mergeChange(server, change('base', 'phone', {value: '2026-10-21T05:30:00+05:30'}, 1, c.key), now);
  assert.equal(result.value, 'server');
  assert.equal(result.conflicts[0].lost, 'phone');
});

test('replaying a losing notes edit keeps values and stamps stable without nesting conflict notes', () => {
  const c = change({id: 1, notes: 'Original'}, {id: 1, notes: 'Phone notes'}, {notes: early});
  const first = mergeChange(row({id: 1, notes: 'Website notes'}, {notes: late}), c, now);
  const replay = mergeChange(row(first.value, first.stamps, 3), c, now);
  assert.deepEqual(replay.value, first.value);
  assert.deepEqual(replay.stamps, first.stamps);
});
