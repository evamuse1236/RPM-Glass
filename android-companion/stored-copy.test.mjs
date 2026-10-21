import test from 'node:test';
import assert from 'node:assert/strict';
import {storedCopy} from './stored-copy.mjs';

function phone(initial) {
  let stored = structuredClone(initial), transfers = 0;
  const calls = [];
  const native = async (action, payload = {}) => {
    calls.push({action, payload});
    if (action === 'load') {
      if (payload.known === stored.version) return {unchanged: true, phone: {ok: true}};
      transfers++;
      return {data: structuredClone(stored), phone: {ok: true}};
    }
    throw new Error(action);
  };
  return {native, calls, transfers: () => transfers, write: next => { stored = structuredClone(next); }};
}

test('a second load sends the known version and gets the same data without a transfer', async () => {
  const p = phone({version: 3, tasks: [{id: 1}]});
  const copy = storedCopy(p.native);
  const first = await copy.load(), second = await copy.load();
  assert.deepEqual(second.data, first.data);
  assert.equal(p.transfers(), 1);
  assert.deepEqual(p.calls.map(c => c.payload), [{}, {known: 3}]);
});

test('another writer\'s save is picked up: a new version is transferred', async () => {
  const p = phone({version: 3, tasks: []});
  const copy = storedCopy(p.native);
  await copy.load();
  p.write({version: 4, tasks: [{id: 9}]});
  assert.deepEqual((await copy.load()).data, {version: 4, tasks: [{id: 9}]});
  assert.equal(p.transfers(), 2);
});

test('after this page saves, the saved data is the copy and needs no transfer', async () => {
  const p = phone({version: 3, tasks: []});
  const copy = storedCopy(p.native);
  await copy.load();
  const next = {version: 4, tasks: [{id: 2}]};
  p.write(next);
  copy.remember(next);
  assert.deepEqual((await copy.load()).data, next);
  assert.equal(p.transfers(), 1);
});

test('changes to loaded data that were never saved do not leak into the next load', async () => {
  const p = phone({version: 3, tasks: []});
  const copy = storedCopy(p.native);
  const working = (await copy.load()).data;
  working.tasks.push({id: 'unsaved'});
  const remembered = {version: 3, tasks: []};
  copy.remember(remembered);
  remembered.tasks.push({id: 'mutated later'});
  assert.deepEqual((await copy.load()).data, {version: 3, tasks: []});
});
