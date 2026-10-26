import assert from 'node:assert/strict';
import {mergeChange} from '../../web/contract/merge.mjs';
import {projectRecords, applyRecord, storeFromRecords, repairLinks} from '../../web/contract/records.mjs';
import {changedGroups, equal} from '../replica-groups.mjs';
import {validatePlanner, freshPlanner} from '../planner-state.mjs';

export const day = n => `2026-10-${String(20 + n).padStart(2, '0')}T12:00:00.000Z`;
export const seed = () => ({schema: 2, version: 0, entries: [], planner: freshPlanner(), syncSavedAt: day(0)});
const rowValue = row => ({key: row.key, rev: row.rev, value: structuredClone(row.value)});

export function fakeServer(initial, now = () => day(5)) {
  let rev = 0, seededAt = initial ? day(0) : null, lastSeq = 0;
  const rows = new Map(), receipts = new Map(), pushes = [];
  function write(key, value, at = now(), stamps) {
    const before = rows.get(key);
    const changed = changedGroups(key, before?.value ?? null, value);
    rows.set(key, {key, value: structuredClone(value), rev: ++rev,
      stamps: stamps ?? {...before?.stamps, ...Object.fromEntries(changed.map(group => [group, at]))}});
  }
  for (const [key, value] of initial ? projectRecords(initial) : []) write(key, value, day(0));
  return {
    rows, pushes,
    get revision() { return rev; },
    write,
    project() { return projectRecords(storeFromRecords(new Map([...rows].filter(([key, row]) => !key.startsWith('conflict:') && row.value !== null).map(([key, row]) => [key, row.value])))); },
    async push(body) {
      assert.deepEqual(Object.keys(body).sort(), ['changes', 'final', 'part', 'seq']);
      assert.ok(body.changes.length <= 200);
      assert.ok(Buffer.byteLength(JSON.stringify(body)) <= 800 * 1024);
      pushes.push(structuredClone(body));
      if (body.seq < lastSeq || body.seq === lastSeq && receipts.has(body.part)) {
        if (!receipts.has(body.part) || body.seq !== lastSeq) throw new Error('seq_conflict');
        return structuredClone(receipts.get(body.part));
      }
      if (body.seq > lastSeq) { lastSeq = body.seq; receipts.clear(); }
      const previous = new Map([...rows].map(([key, row]) => [key, structuredClone(row)]));
      for (const change of body.changes) {
        const merged = mergeChange(rows.get(change.key), change, now());
        if (!rows.has(change.key) || !equal(rows.get(change.key).value, merged.value)) write(change.key, merged.value, now(), merged.stamps);
        for (const conflict of merged.conflicts) write(`conflict:${rev}`, conflict);
      }
      const store = storeFromRecords(new Map([...rows].filter(([key, row]) => !key.startsWith('conflict:') && row.value !== null).map(([key, row]) => [key, row.value])));
      repairLinks(store, key => rows.get(key)?.value === null);
      let valid = true;
      try { validatePlanner(store); }
      catch {
        valid = false;
        for (const change of body.changes) {
          const old = previous.get(change.key);
          write(change.key, old?.value ?? null, now(), old?.stamps);
          write(`conflict:${rev}`, {key: change.key, group: 'record', kept: old?.value ?? null, lost: change.value, lostFrom: 'phone', at: now()});
        }
      }
      if (valid) for (const [key, value] of projectRecords(store)) if (rows.has(key) && !equal(rows.get(key).value, value)) write(key, value);
      if (body.final) seededAt ??= now();
      const receipt = {seq: body.seq, part: body.part, results: body.changes.map(change => rowValue(rows.get(change.key)))};
      receipts.set(body.part, receipt);
      return structuredClone(receipt);
    },
    async pull({after, limit}) {
      assert.ok(limit <= 500);
      const pending = [...rows.values()].filter(row => row.rev > after).sort((a, b) => a.rev - b.rev);
      const page = pending.slice(0, limit);
      return {rows: page.map(rowValue), cursor: page.at(-1)?.rev ?? after, hasMore: page.length < pending.length, seededAt};
    },
  };
}

export function phone(initial = seed()) {
  let data = structuredClone(initial);
  const saves = [];
  return {
    saves,
    get data() { return data; },
    async load() { return structuredClone(data); },
    async save(expected, next, options) {
      assert.deepEqual(options, {origin: 'sync'});
      if (expected !== data.version) throw Object.assign(new Error('Version conflict'), {code: 'VERSION_CONFLICT'});
      assert.equal(next.version, expected + 1);
      data = structuredClone(next); saves.push(structuredClone(next));
    },
    edit(reduce, at = day(1)) {
      const before = projectRecords(data);
      reduce(data); data.version++; data.syncSavedAt = at;
      if (data.sync?.base) for (const [key, value] of new Map([...before, ...projectRecords(data)])) {
        const groups = changedGroups(key, before.get(key) ?? null, projectRecords(data).get(key) ?? null);
        if (groups.length) (data.sync.stamps ??= {})[key] = {...data.sync.stamps[key], ...Object.fromEntries(groups.map(group => [group, at]))};
      }
    },
  };
}
