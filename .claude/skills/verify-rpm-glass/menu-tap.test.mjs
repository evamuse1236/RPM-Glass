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

test('a tap scrolls a control that is only partly on screen, and refuses one whose centre stays off the page', () => {
  const scrolled = [];
  const peek = {ref: 0, role: 'combobox', name: 'Add a task to the Plan', rect: [20, 730, 309, 48], inView: true};
  onPage([peek]);
  window.__rpmEls = {0: {scrollIntoView: () => scrolled.push('add')}};
  const found = LOCATE({role: 'combobox', name: 'Add a task to the Plan', scroll: true});
  assert.deepEqual(scrolled, ['add'], 'a control cut by the bottom edge is scrolled into view before the tap');
  assert.equal(found.match.offScreen, true, 'a centre at y 754 on a 748 page is off screen, so the tap would land outside the WebView');
  assert.equal(found.match.coveredBy, null);
  onPage([{...peek, rect: [20, 500, 309, 48]}]);
  window.__rpmEls = {0: {scrollIntoView: () => scrolled.push('again')}};
  assert.equal(LOCATE({role: 'combobox', name: 'Add a task to the Plan', scroll: true}).match.offScreen, false);
  assert.deepEqual(scrolled, ['add'], 'a control wholly on screen is tapped where it is');
});
