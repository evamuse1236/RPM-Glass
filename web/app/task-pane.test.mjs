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

test('one Clear replaces No time, No date and No length on every width', () => {
  const tabs = read('../../android-companion/planner/task-tabs.mjs');
  assert.match(tabs, /more\.append\(dayPicker\.node, timePicker\.node, clear\);/);
  assert.doesNotMatch(tabs, /'No time'|'No date'|'No length'/, 'the When tab offers no separate No chips');
  assert.match(tabs, /button\('', \(\) => pick\.clear\(\)/);
  const sheet = read('../../android-companion/planner/task-sheet.mjs');
  assert.match(sheet, /const wide = Boolean\(app\.api\.wide\?\.\(\)\);/);
  assert.match(sheet, /\{\.\.\.whenFields\(\{day: '', time: ''\}\), minutes: null\}/);
});

test('Start now sits on the title row on wide; Alert and Repeat chips join into segmented rows and the ruler keeps its lanes on every width', () => {
  const css = read('./task-pane.css');
  assert.match(css, /\.task-start \{\s+grid-area: start;/);
  assert.doesNotMatch(css, /\.ruler-(length|centre) \{/, 'the wide pane keeps the shared ruler lanes');
  const tabs = read('../../android-companion/task-tabs.css');
  assert.match(tabs, /\.task-tabs \.chip-row\.segmented \{ flex-wrap: nowrap; gap: 0; \}/);
  assert.match(tabs, /\.task-tabs \.chip-row\[aria-label='More choices'\] > \.chip \{ border-color: transparent; background: none;/, 'the pickers and Clear read as one quiet row');
  assert.match(tabs, /\.ruler-track \{[^}]*mask-image: linear-gradient\(to right, transparent,/, 'the ruler fades out at both ends on every width, so nothing reads as cut off');
  assert.match(tabs, /\.ruler-tick \{\s+position: absolute;\s+inset-block-end: 16px;/, 'ticks sit in their own lane under the hour labels, just above the length lane');
  assert.match(tabs, /\.ruler-length \{\s+position: absolute;\s+inset-block-end: 8px;[^}]*block-size: 8px;/, 'the length bar sits in a lane under the ticks');
  assert.match(tabs, /\.ruler-centre \{\s+position: absolute;\s+inset-block: 24px 8px;/, 'the playhead starts below the hour labels');
});

test('the wide task pane puts its icons on one row above a full-width title of at most two lines, with no band above the tools', () => {
  const css = read('./task-pane.css');
  assert.match(css, /grid-template-areas: "pill \. must ring close" "title title title title title";/);
  assert.match(css, /grid-template-areas: "pill \. start must ring close" "title title title title title title";/);
  assert.match(css, /\.task-title-field \{\s+grid-area: title;\s+max-block-size: calc\(2lh \+ var\(--s4\)\);[^}]*font: var\(--title-large\);/);
  assert.match(css, /\.sheet-header:has\(> \.task-head\) > \.sheet-close \{ position: absolute;/);
  assert.doesNotMatch(css, /~ \.sheet-body \{ flex: 0 1 auto; \}/, 'the tools sit at the foot of the pane, not mid-pane above an empty strip');
});

test('on wide the task pane names its icons on hover, keeps all four tabs on one row with the full Block name on hover, and draws no line under an idle length field', () => {
  const sheet = read('../../android-companion/planner/task-sheet.mjs');
  assert.match(sheet, /const wide = Boolean\(app\.api\.wide\?\.\(\)\);\n  const head = taskHead\(\{\n    task,\n    tips: wide,/);
  assert.match(sheet, /if \(wide\) close\.title = 'Close';/);
  assert.match(sheet, /if \(wide\) start\.title = 'Start now';/);
  const head = read('../../android-companion/planner/task-head.mjs');
  assert.match(head, /if \(tips\) must\.title = 'Must';/);
  assert.match(head, /if \(tips\) ring\.title = t\.done \? 'Mark incomplete' : 'Mark complete';/);
  const tabsJs = read('../../android-companion/planner/task-tabs.mjs');
  assert.match(tabsJs, /setTab\('block', blockShort\(blockTitle\), 'stacks'\);\n    if \(wide\) tabs\.block\.node\.title = blockTitle\?\.trim\(\) \|\| 'Inbox';/, 'on wide the Block tab names the whole Block on hover');
  const css = read('./task-pane.css');
  assert.doesNotMatch(css, /\.tab-row \{|#task-tab-block/, 'on wide the tabs keep the phone row of four, the Block tab never takes its own row');
  assert.doesNotMatch(css, /\.when-days \{ display: none; \}/, 'on wide the When tab keeps the phone day strip');
  const tabs = read('../../android-companion/task-tabs.css');
  assert.match(tabs, /\.tab-btn \{[^}]*grid-template-columns: minmax\(0, 1fr\);/, 'on the phone a long Block name ends in an ellipsis inside its tab');
  assert.match(tabs, /\.tab-value \{ max-inline-size: 100%; overflow: clip; font: var\(--label-medium\); text-overflow: ellipsis; white-space: nowrap; \}/);
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

test('opening a task in the pane scrolls its Today card fully into view once, clear of the page fade', async () => {
  const {markOpenCard} = await import('./open-card.mjs');
  const card = () => {
    const attrs = new Set(); const scrolls = [];
    return {scrolls, hasAttribute: name => attrs.has(name), toggleAttribute: (name, on) => on ? attrs.add(name) : attrs.delete(name),
      scrollIntoView: options => scrolls.push(options)};
  };
  const a = card(); const b = card();
  const row = (key, target) => ({dataset: {key}, classList: {contains: () => false}, querySelector: () => target});
  const work = {querySelectorAll: () => [row('task:1', a), row('task:2', b)]};
  let task = '2';
  const sheet = {hidden: false, inert: false, querySelector: () => ({dataset: {task}})};
  const saved = globalThis.MutationObserver;
  globalThis.MutationObserver = class { observe() {} };
  try {
    const run = markOpenCard(work, sheet);
    run();
    assert.deepEqual(b.scrolls, [{block: 'nearest'}], 'the open card scrolls once, not on every later change');
    assert.deepEqual(a.scrolls, []);
    task = '1'; run();
    assert.deepEqual(a.scrolls, [{block: 'nearest'}]);
    assert.equal(b.hasAttribute('data-open'), false);
  } finally { globalThis.MutationObserver = saved; }
  assert.match(read('./task-pane.css'), /\[data-open\] \{ outline: 2px solid var\(--primary\); outline-offset: -2px; scroll-margin-block: var\(--s8\); \}/,
    'the scroll margin matches the 32px page fade');
});

test('Alert and Repeat say Off and Once only on their tab; a second tap on the chosen choice turns it off', async () => {
  const {ALERT_KINDS, REPEAT_PRESETS} = await import('../../android-companion/planner/task-tabs-model.mjs');
  assert.deepEqual(ALERT_KINDS.map(([value]) => value), ['reminder', 'alarm']);
  assert.deepEqual(REPEAT_PRESETS.map(([value]) => value), ['weekdays', 'daily', 'after']);
  const tabs = read('../../android-companion/planner/task-tabs.mjs');
  assert.match(tabs, /const next = kind\.getAttribute\('aria-pressed'\) === 'true' \? 'off' : value;/);
  assert.match(tabs, /const next = chosen\.getAttribute\('aria-pressed'\) === 'true' \? 'once' : choice;/);
});

test('the Block list marks the chosen Block with one secondary-container row, a finished Block with a green ring and small green check, and wraps only the chosen name', () => {
  const tabs = read('../../android-companion/planner/task-tabs.mjs');
  assert.match(tabs, /if \(total && done === total\) \{\n    ring\.append\(attrs\(document\.createElementNS\(SVG, 'circle'\), \{class: 'ring-done'/, 'a finished Block fills its ring like a finished Project');
  assert.doesNotMatch(tabs, /mark\.append\(icon\('check'\)\)/, 'the radio carries a dot, never a check that reads as done');
  const css = read('../../android-companion/task-tabs.css');
  assert.match(css, /\.block-choice\[aria-checked=true\] \{ background: var\(--secondary-container\); color: var\(--on-secondary-container\); \}/, 'the chosen row is a selection, not a success tint');
  assert.match(css, /\.block-choice \.ring-done \{ fill: color-mix\(in oklch, var\(--success\) var\(--track-mix\), var\(--sheet-bg, var\(--sheet-surface\)\)\);/, 'the done disc is a quiet green that mixes with the sheet the row sits on');
  assert.match(css, /\.block-choice \.ring:has\(\.ring-done\) \.ring-value \{ stroke: var\(--success\); \}/, 'a finished ring is green, never the blue of the chosen row');
  assert.match(css, /\.block-choice \.ring-check \{ fill: none; stroke: var\(--success\);/, 'its small check is green too');
  assert.doesNotMatch(css, /block-choice-mark|block-choice-line/, 'one selection mark (the filled row) and no purpose line');
  assert.doesNotMatch(css, /\.block-choice \.ring-value \{/, 'the ring keeps the shared Area or primary progress colour');
  assert.match(css, /\.block-choice-title \{ overflow: clip; font: var\(--body-large\); text-overflow: ellipsis; white-space: nowrap; \}/, 'a long Block name ends in an ellipsis on its one line');
  assert.doesNotMatch(css, /\.ring-check \{[^}]*(--primary|--on-secondary-container)/, 'the finished check is green, never the chosen row\'s colour, so it never reads as the selection');
  assert.match(css, /\.block-choice\[aria-checked=true\] \.block-choice-title \{ display: -webkit-box;[^}]*white-space: normal;[^}]*-webkit-line-clamp: 2; \}/, 'the chosen Block name wraps whole to two lines');
  assert.match(read('../../android-companion/task-sheet.css'), /\.task-start \{ grid-column: 1 \/ -1; justify-self: start; margin: 0 0 var\(--s2\); \}/, 'Start now starts on the content edge');
});
