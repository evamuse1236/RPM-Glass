import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the wide page styles apply only on a wide window and load after the task pane', () => {
  const css = read('./wide-pages.css');
  assert.match(css, /^@media \(width >= 1080px\) \{/);
  assert.equal(css.split('\n@media').every(block => /\(width >= 1080px\)/.test(block)), true);
  const html = read('./index.html');
  assert.ok(html.indexOf('href="/wide-pages.css"') > html.indexOf('href="/task-pane.css"'));
  assert.match(read('../build.mjs'), /'\.\/app\/wide-pages\.css', 'wide-pages\.css'/);
});

test('on wide the Inbox pane drops its note and its repeated Capture and Add task, and the Life tab line sits under its word', () => {
  const css = read('./wide-pages.css');
  assert.match(css, /\[aria-label=Inbox\] :is\(\[data-key=inbox-note\], \.sheet-actions\) \{ display: none; \}/);
  assert.match(css, /\.sheet-header:has\(> h2:not\(\.visually-hidden\)\) \{ min-block-size: 64px; \}/);
  assert.match(css, /\.tab\[aria-selected=true\]::after \{ inset-inline: var\(--s4\); \}/);
  assert.match(read('../../android-companion/planner/task-lists.mjs'), /note\.dataset\.key = 'inbox-note'/);
});

test('on wide each Project card lists its Blocks and opens the Project; the phone keeps its toggle', () => {
  const source = read('../../android-companion/planner/projects.mjs');
  assert.match(source, /const wide = Boolean\(app\.api\.wide\?\.\(\)\);\n  const open = wide \|\| app\.state\.projectOpen === project\.id;/);
  assert.match(source, /if \(!wide\) toggle\.setAttribute\('aria-expanded'/);
  assert.match(source, /if \(!wide\) head\.append\(iconButton\('chevron_right'/);
  assert.match(source, /const next = blockTasks\(app\.data\(\), block\.id\)\.find\(task => !task\.done\);/);
  assert.match(source, /row\.append\(\.\.\.\(total \? \[segmentRing\(done, total\), copy, el\('span', 'project-block-count tnum'/,
    'a Block with no tasks shows no empty ring and no 0/0');
  assert.match(source, /nestRings\(wide \? \[stats\] : ordered\.map/, 'on wide the Project ring shows the Project, the chips the Blocks');
  const css = read('./wide-pages.css');
  assert.match(css, /\.page > \.project-card \{\n    grid-column: 1 \/ -1;\n    display: grid;\n    grid-template-columns: minmax\(0, 320px\) minmax\(0, 1fr\);/);
  assert.match(css, /\.project-blocks \{\n    grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 280px\), 1fr\)\);/);
  assert.match(css, /\.project-block:not\(:has\(\.seg-ring\)\) \{ padding-inline-start: calc\(var\(--s8\) \+ var\(--s5\)\); \}/,
    'a ringless chip lines its words up with the chips that have a ring');
  assert.match(css, /\.project-block-count \{ flex: none; inline-size: 40px; text-align: end; \}/);
  assert.match(css, /:is\(\.project-block-name, \.project-block-next\) \{ overflow: clip; text-overflow: ellipsis; white-space: nowrap; \}/);
});

test('on wide Life puts the wheel on the left and each Area with its rating and Goals on the right', () => {
  const source = read('../../android-companion/planner/life.mjs');
  assert.match(source, /if \(areas\.length && app\.api\.wide\?\.\(\)\) \{\n    page\.append\(areaGoals\(app, areas, loose\)\);/);
  assert.match(source, /`\$\{area\.rating\} \/ 10`/);
  const css = read('./wide-pages.css');
  assert.match(css, /\.page:has\(> \.life-areas\) \{\n    display: grid;\n    grid-template-columns: minmax\(0, 480px\) minmax\(0, 1fr\);/);
  assert.match(css, /\.page:has\(> \.life-areas\) \.wheel-areas \{ display: none; \}/);
  const start = source.indexOf('function areaGoals');
  const goals = source.slice(start, source.indexOf('\nfunction', start + 1));
  assert.match(goals, /ratingInput\(app, area, rating => \{ value\.textContent = rating; \}\)/);
  assert.doesNotMatch(goals, /Not rated/);
  assert.match(css, /\.life-area-row \{\n    display: grid;\n    grid-template-columns: minmax\(0, 280px\) minmax\(120px, 480px\) var\(--s6\);/, 'the slider sits beside its Area name at any width');
  assert.match(goals, /area\.rating == null \? '–' : `\$\{area\.rating\}`/, 'every slider shows its value');
  assert.match(css, /#planner \.wheel-copy p \{ display: none; \}/, 'no drag instruction on wide');
  assert.match(css, /\.life-area-row \.rating-slider \{ grid-area: auto; \}/);
  assert.match(read('../../android-companion/planner/life-wheel.mjs'), /const none = app\.api\.wide\?\.\(\) \? '' : '–';/);
  assert.match(css, /\.wheel-average:empty \{ display: none; \}/);
});

test('on wide the Inbox pane matches the page, Sort with Jev is a text button, a past meal icon is legible, and long pages fade at the foot', () => {
  const css = read('./wide-pages.css');
  assert.match(css, /#sheet\[data-inline\] \{ --sheet-surface: light-dark\(var\(--surface-container-low\), var\(--surface-container\)\); \}/);
  assert.match(css, /\.tonal-btn\[data-key=inbox-jev\] \{ background: transparent; color: var\(--primary\); \}/);
  assert.match(css, /:is\(\.spine-row\.done, \.spine-meal\.past\) \.spine-pill \{ color: var\(--on-surface-variant\); \}/);
  assert.match(css, /#planner-scroll \{\n    animation: page-fade linear both;\n    animation-timeline: scroll\(self block\);/);
  const web = read('./web.css');
  assert.match(web, /@property --page-fade \{ syntax: "<length>"; inherits: false; initial-value: 0px; \}/);
  assert.match(web, /\[data-view=projects\]\) \.page \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 360px\), 1fr\)\); align-items: start;/);
  assert.match(web, /\.capture-sheet::backdrop \{ background: light-dark\(var\(--scrim\), color-mix\(in oklch, var\(--scrim\), oklch\(0 0 none\) 35%\)\); \}/);
});

test('on wide every page title has one weight: the Today date uses the same headline as Blocks, Projects and Life', () => {
  const css = read('./wide-pages.css');
  assert.match(css, /#planner \.date-button \{ font: var\(--headline-medium\); letter-spacing: -\.01em; \}/);
  assert.match(read('../../android-companion/planner.css'), /\.top-title \{[^}]*font: var\(--headline-medium\);/);
});

test('on wide the sync note is a small chip at the foot of the sidebar, so it never pushes a page down', () => {
  const css = read('./wide-pages.css');
  const rule = css.match(/\.planner-view > #banner \{([^}]*)\}/)[1];
  for (const decl of ['grid-column: 1;', 'grid-row: 3;', 'align-self: end;', 'flex-wrap: nowrap;']) assert.ok(rule.includes(decl), decl);
  assert.match(css, /\.planner-view > #banner\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.planner-view > #banner::before \{ content: 'cloud_sync' \/ '';/);
});

test('the sidebar Add task is a solid button in light and dark', () => {
  const rule = read('./web.css').match(/\n\.side-add \{([^}]*)\}/)[1];
  assert.match(rule, /background: light-dark\(var\(--primary\), var\(--primary-container\)\);/);
  assert.match(rule, /color: light-dark\(var\(--on-primary\), var\(--on-primary-container\)\);/);
});
