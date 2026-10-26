import test from 'node:test';
import assert from 'node:assert/strict';
import {retryOnChange, changedUnderneath} from './save-retry.mjs';

test('a save that meets a newer version reloads and runs again', async () => {
  let runs = 0, reloads = 0;
  const result = await retryOnChange(async () => {
    if (++runs === 1) throw new Error('Saved context changed. Reopen RPM before retrying.');
    return 'saved';
  }, async () => { reloads++; });
  assert.equal(result, 'saved');
  assert.deepEqual([runs, reloads], [2, 1]);
});

test('other failures and a third conflict reach the caller', async () => {
  await assert.rejects(retryOnChange(async () => { throw new Error('Context exceeds 16 MB'); }, async () => {}), /16 MB/);
  let runs = 0;
  await assert.rejects(retryOnChange(async () => { runs++; throw Object.assign(new Error('x'), {code: 'VERSION_CONFLICT'}); }, async () => {}));
  assert.equal(runs, 3);
  assert.equal(changedUnderneath(new Error('Saved data changed while editing.')), true);
});
