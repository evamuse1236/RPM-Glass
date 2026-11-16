import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onceInFlight} from './planner/routine-editor.mjs';

test('a second tap on Save routine while the first save is in flight saves nothing more', async () => {
  let runs = 0;
  let finish;
  const save = onceInFlight(() => { runs += 1; return new Promise(resolve => { finish = resolve; }); });
  const first = save();
  await save();
  assert.equal(runs, 1);
  finish();
  await first;
  save();
  assert.equal(runs, 2, 'a tap after the save landed runs again');
});

test('after a failed save the next tap tries again', async () => {
  let runs = 0;
  const save = onceInFlight(async () => { runs += 1; if (runs === 1) throw new Error('offline'); });
  await assert.rejects(save());
  await save();
  assert.equal(runs, 2);
});

test('the Save routine button runs its handler once at a time', () => {
  const source = readFileSync(new URL('./planner/routine-editor.mjs', import.meta.url), 'utf8');
  assert.match(source, /button\('Save routine', onceInFlight\(/);
});
