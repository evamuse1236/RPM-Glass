import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the task pane styles apply only on a wide window', () => {
  const css = read('./task-pane.css');
  assert.match(css, /^@media \(width >= 1080px\) \{/);
  assert.equal(css.split('\n@media').every(block => /\(width >= 1080px\)/.test(block)), true);
  assert.match(read('./index.html'), /href="\/task-pane\.css"/);
  assert.match(read('../build.mjs'), /'\.\/app\/task-pane\.css', 'task-pane\.css'/);
});

test('on a wide window one Clear replaces No time, No date and No length; the phone keeps all three', () => {
  const tabs = read('../../android-companion/planner/task-tabs.mjs');
  assert.match(tabs, /\.\.\.\(wide \? \[clear\] : \[noTime, noDate, noLength\]\)/);
  assert.match(tabs, /button\('', \(\) => pick\.clear\(\)/);
  const sheet = read('../../android-companion/planner/task-sheet.mjs');
  assert.match(sheet, /const wide = Boolean\(app\.api\.wide\?\.\(\)\);/);
  assert.match(sheet, /\{\.\.\.whenFields\(\{day: '', time: ''\}\), minutes: null\}/);
});

test('Start now sits on the title row and the Length chips join into one segmented row on wide', () => {
  const css = read('./task-pane.css');
  assert.match(css, /\.task-start \{\s+grid-column: 3;\s+grid-row: 1;/);
  assert.match(css, /\.chip-row\[aria-label=Length\] \{ flex-wrap: nowrap; gap: 0; \}/);
  assert.match(css, /\.ruler-track \{ mask-image:/);
  assert.match(css, /\.ruler-length \{ inset-block: calc\(var\(--s8\) \+ var\(--s1\)\)/);
});
