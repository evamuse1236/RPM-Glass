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
  assert.match(css, /\.task-start \{\s+grid-area: start;/);
  assert.match(css, /\.chip-row\[aria-label=Length\] \{ flex-wrap: nowrap; gap: 0; \}/);
  assert.match(css, /\.ruler-track \{ mask-image:/);
  assert.match(css, /\.ruler-length \{ inset-block: calc\(var\(--s8\) \+ var\(--s1\)\)/);
});

test('the wide task pane puts its icons on one row above a full-width title of at most two lines, with no band above the tools', () => {
  const css = read('./task-pane.css');
  assert.match(css, /grid-template-areas: "pill \. must ring close" "title title title title title";/);
  assert.match(css, /grid-template-areas: "pill \. start must ring close" "title title title title title title";/);
  assert.match(css, /\.task-title-field \{\s+grid-area: title;\s+max-block-size: calc\(2lh \+ var\(--s4\)\);[^}]*font: var\(--title-large\);/);
  assert.match(css, /\.sheet-header:has\(> \.task-head\) > \.sheet-close \{ position: absolute;/);
  assert.doesNotMatch(css, /~ \.sheet-body \{ flex: 0 1 auto; \}/, 'the tools sit at the foot of the pane, not mid-pane above an empty strip');
});

test('on wide the task pane names its icons on hover, spells out the Block, and draws no line under an idle Other field', () => {
  const sheet = read('../../android-companion/planner/task-sheet.mjs');
  assert.match(sheet, /const wide = Boolean\(app\.api\.wide\?\.\(\)\);\n  const head = taskHead\(\{\n    task,\n    tips: wide,/);
  assert.match(sheet, /if \(wide\) close\.title = 'Close';/);
  assert.match(sheet, /if \(wide\) start\.title = 'Start now';/);
  const head = read('../../android-companion/planner/task-head.mjs');
  assert.match(head, /if \(tips\) must\.title = 'Must';/);
  assert.match(head, /if \(tips\) ring\.title = t\.done \? 'Mark incomplete' : 'Mark complete';/);
  assert.match(read('../../android-companion/planner/task-tabs.mjs'), /setTab\('block', wide \? blockTitle\?\.trim\(\) \|\| 'Inbox' : blockShort\(blockTitle\), 'stacks'\);/);
  const css = read('./task-pane.css');
  assert.match(css, /#sheet\[data-inline\] \.tab-row \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) minmax\(0, 2fr\); \}/);
  assert.match(css, /#sheet\[data-inline\] \.tab-value \{ overflow: clip; text-overflow: ellipsis; white-space: nowrap; \}/);
  assert.match(css, /#sheet\[data-inline\] \.number-chip input:not\(:focus-visible\) \{ border-block-end-color: transparent; \}/);
});

test('while the task pane is open, the task card or chip on Today is outlined, and only on wide', async () => {
  const {opensTask} = await import('./open-card.mjs');
  assert.equal(opensTask('task:12', 12), true);
  assert.equal(opensTask('task:302026-10-27T04:30:00.000Z', '30'), true);
  assert.equal(opensTask('task:302026-10-27T04:30:00.000Z', '3'), false);
  assert.equal(opensTask('task:Read', 'Read'), true);
  assert.equal(opensTask('task:123', 12), false);
  assert.equal(opensTask('task:12', null), false);
  assert.equal(opensTask('gap:12', 12), false);
  const css = read('./task-pane.css');
  const wide = css.slice(0, css.indexOf('\n}\n'));
  assert.match(wide, /#planner \.spine-card\[data-open\], #planner \.spine-chip\[data-open\] \{ outline: 2px solid var\(--primary\);/);
  assert.match(read('../../android-companion/planner/task-sheet.mjs'), /head\.row\.dataset\.task = String\(id\);/);
  assert.match(read('./main.mjs'), /markOpenCard\(\$\('workspace'\), \$\('sheet'\)\);/);
});
