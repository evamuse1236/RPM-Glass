import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCATE} from './lib/page.mjs';
import {settled} from './lib/drive.mjs';

const onPage = elements => {
  globalThis.window = {__rpmSnapshot: () => ({elements}), __rpmEls: {}};
  globalThis.innerWidth = 360;
  globalThis.innerHeight = 748;
  globalThis.document = {elementFromPoint: () => null};
};

test('an exact lookup never falls back to a name that only contains the word', () => {
  onPage([{ref: 0, role: 'button', name: 'More options', rect: [25, 396, 48, 48], inView: true}]);
  assert.match(LOCATE({role: 'button', name: 'More', exact: true}).error, /No button named "More"/);
  assert.equal(LOCATE({role: 'button', name: 'More'}).match.name, 'More options', 'a plain tap still matches substrings');
});

test('settled taps only once two reads agree, and gives up on an item that keeps moving', async () => {
  const ys = [1600, 1400, 1300, 1290, 1289];
  let i = 0;
  const found = await settled(async () => ({at: [827, ys[Math.min(i++, ys.length - 1)]]}), {wait: async () => {}});
  assert.deepEqual(found.at, [827, 1289]);
  assert.equal(i, 5);
  let y = 0;
  await assert.rejects(settled(async () => ({at: [0, y += 50]}), {wait: async () => {}, tries: 3}), /kept moving/);
});
