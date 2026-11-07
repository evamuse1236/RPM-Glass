import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installFakeDom} from './fake-dom.mjs';

installFakeDom();
const {dayMark} = await import('./planner/today-header.mjs');

test('a week-strip day carries at most one mark, the loudest that applies', () => {
  assert.equal(dayMark({clash: true, due: 2, tasks: 3}), 'clash');
  assert.equal(dayMark({clash: false, due: 1, tasks: 3}), 'due');
  assert.equal(dayMark({clash: false, due: 0, tasks: 1}), 'tasks');
  assert.equal(dayMark({clash: false, due: 0, tasks: 0}), null);
});

test('each mark has its own quiet look: error for a clash, a short primary bar for a Result due', () => {
  const css = readFileSync(new URL('./planner-today.css', import.meta.url), 'utf8');
  assert.match(css, /\.day-dot\[data-mark=clash\] \{[^}]*var\(--error\)/);
  assert.match(css, /\.day-dot\[data-mark=due\] \{[^}]*inline-size: 12px[^}]*var\(--primary\)/);
});
