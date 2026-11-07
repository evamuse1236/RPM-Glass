import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installFakeDom} from './fake-dom.mjs';

installFakeDom();
const {dayMark, dateLine} = await import('./planner/today-header.mjs');

test('a week-strip day carries one mark of one meaning: another day still holds an open Must or a deadline', () => {
  assert.equal(dayMark({due: 2, musts: 0, key: '2026-11-09', day: '2026-11-08'}), 'key');
  assert.equal(dayMark({due: 0, musts: 1, key: '2026-11-09', day: '2026-11-08'}), 'key');
  assert.equal(dayMark({due: 1, musts: 3, key: '2026-11-09', day: '2026-11-08'}), 'key');
  assert.equal(dayMark({due: 0, musts: 0, key: '2026-11-09', day: '2026-11-08'}), null);
  assert.equal(dayMark({due: 1, musts: 2, key: '2026-11-08', day: '2026-11-08'}), null, 'the chosen day shows its work below, so no dot');
  assert.equal(dayMark({due: 0, musts: 1, key: '2026-11-07', day: '2026-11-08'}), 'key', 'today keeps its dot while another day is open');
});

test('the mark is one small neutral dot, with no colour variants', () => {
  const css = readFileSync(new URL('./planner-today.css', import.meta.url), 'utf8');
  assert.match(css, /\.day-dot \{[^}]*inline-size: 4px[^}]*var\(--on-surface-variant\)/);
  assert.doesNotMatch(css, /\.day-dot\[data-mark/);
  assert.doesNotMatch(css, /\.day-dot[^{]*\{[^}]*var\(--(error|primary)\)/);
});

test('on another day the Today chip is the word alone, so the longest date still clears Search', () => {
  const line = dateLine({state: {day: '2099-09-30'}, actions: {datePicker() {}}});
  const chip = line.querySelector('.tonal-btn');
  assert.equal(chip.textContent, 'Today');
  assert.equal(chip.querySelector('.ms'), null);
});
