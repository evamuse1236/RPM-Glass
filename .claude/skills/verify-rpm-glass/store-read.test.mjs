import test from 'node:test';
import assert from 'node:assert/strict';
import {storeJson} from './lib/scenarios.mjs';

const noWait = {wait: async () => {}};

test('a scenario store read retries a read that is not JSON yet', async () => {
  const reads = [{text: 'run-as: busy'}, {json: {entries: [{title: 'A'}]}}];
  assert.deepEqual(await storeJson(async () => reads.shift(), noWait), {entries: [{title: 'A'}]});
});

test('a store read that never parses fails with the text it got, not a TypeError later', async () => {
  let reads = 0;
  await assert.rejects(storeJson(async () => { reads++; return {text: '{"entries": ['}; }, noWait), err => {
    assert.match(err.message, /did not read as JSON after 3 tries/);
    assert.equal(err.detail.text, '{"entries": [');
    return true;
  });
  assert.equal(reads, 3);
});
