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

test('on wide the Inbox pane drops its repeated Capture and Add task, and the Life tab line sits under its word', () => {
  const css = read('./wide-pages.css');
  assert.match(css, /\[aria-label=Inbox\] \.sheet-actions \{ display: none; \}/);
  assert.match(css, /\.sheet-header:has\(> h2:not\(\.visually-hidden\)\) \{ min-block-size: 64px; \}/);
  assert.match(css, /\.tab\[aria-selected=true\]::after \{ inset-inline: var\(--s4\); \}/);
  const inbox = read('../../android-companion/planner/task-lists.mjs');
  assert.doesNotMatch(inbox, /sheet-note/, 'the Inbox title says what it holds; no sentence sits above the tasks');
  assert.match(inbox, /labelButton\('auto_awesome', 'Sort with Jev', [^\n]*'assist-chip inbox-jev'\)/, 'Sort with Jev is a labelled header chip beside Close');
  assert.match(inbox, /count\.textContent = rows\.length \? String\(rows\.length\) : ''/, 'the title counts the tasks left to sort');
  assert.match(inbox, /header\.querySelector\('\.sheet-close'\)\.before\(jev\)/);
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
  assert.match(css, /\.project-blocks \{\n    grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 360px\), 1fr\)\);/);
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
  assert.match(css, /\.page:has\(> \.life-areas\) \{\n    display: grid;\n    grid-template-columns: minmax\(0, 560px\) minmax\(360px, 1fr\);/);
  assert.doesNotMatch(read('../../android-companion/planner/life-wheel.mjs'), /wheel-area\b/, 'the Areas list under the wheel is the one way to an Area, so the wheel card has no second row of Area chips');
  const start = source.indexOf('function areaGoals');
  const goals = source.slice(start, source.indexOf('\nfunction', start + 1));
  assert.doesNotMatch(goals, /ratingInput|ratingTicks/, 'on wide the list says each rating once and leaves dragging to the wheel');
  assert.match(goals, /el\('span', `life-meter\$\{area\.rating == null \? ' unrated' : ''\}`\)/, 'a slim bar of the rating, empty until rated');
  assert.match(goals, /group\.append\(row, \.\.\.goals\.map\(goal => goalRow\(app, goal, 'nested'\)\)\);/, 'each Goal sits inside its Area');
  assert.match(css, /\.life-area-group \{\n    display: grid;\n    grid-template-columns: minmax\(0, 240px\) minmax\(0, 1fr\) var\(--key-text\) var\(--s6\);/, 'name, bar, value, chevron');
  assert.match(goals, /end\.append\(value, icon\('chevron_right'/, 'on wide an Area row ends in its value and a chevron that open it, as the phone row does');
  assert.match(css, /\.life-areas \{[^}]*align-content: start;[^}]*align-self: stretch;/, 'the Areas card ends level with the wheel card and keeps its rows together at the top');
  assert.match(css, /\.page:has\(> \.life-areas\) \.wheel-card \{ align-self: stretch;/, 'the wheel card ends level with a longer Areas list');
  assert.match(css, /\.life-area-row \{\n    display: grid;\n    grid-template-columns: subgrid;/, 'every Area lines up its bar and value in one column');
  assert.match(goals, /area\.rating == null \? 'Not rated' : `\$\{area\.rating\}`/, 'an unrated Area says Not rated, as on the phone');
  assert.match(css, /#planner \.life-meter \{[^}]*var\(--tone\) calc\(var\(--value, 0\) \* 100%\)/, 'the bar fills to the rating in the Area\'s hue');
  assert.match(css, /#planner \.period-switch \{ justify-content: start;/, 'the year arrows hug the year');
  assert.doesNotMatch(css, /\.rating-slider:not\(\.unrated\)/, 'the wheel and its column keep one size whether or not an Area is rated, so the first rating never moves the layout');
  assert.match(css, /#planner \.wheel-plot \{ inline-size: min\(100% - 128px, 420px\); \}/);
  const wheel = read('../../android-companion/planner/life-wheel.mjs');
  assert.match(wheel, /copy\.append\(el\('h2', '', 'Wheel of Life'\), button\('Rate your Areas', \(\) => rateAreas\(app\), 'text-btn'\)\);/, 'the header always holds the Rate link, the keyboard route');
  assert.match(wheel, /areas\.length && areas\.every\(a => a\.rating == null\)\) card\.append\(el\('p', 'wheel-hint', /, 'the drag hint shows once, under the wheel, only while no Area is rated');
  assert.doesNotMatch(read('../../android-companion/life-wheel.css'), /\.text-btn:not\(:focus-visible\)|:has\(\.wheel-hint\)/, 'nothing hides the Rate link');
  assert.doesNotMatch(wheel, /'–'/, 'an unrated wheel shows no stand-in value in its centre');
  assert.equal(wheel.match(/averageOf\(areas\.map\([^;]*\?\? ''/g)?.length, 2, 'the centre shows the average of rated Areas or nothing');
  assert.match(read('../../android-companion/life-wheel.css'), /\.wheel-average:empty \{ display: none; \}/);
});

test('on wide the Inbox pane matches the page, and long pages fade at the foot', () => {
  const css = read('./wide-pages.css');
  assert.match(css, /#sheet\[data-inline\] \{ --sheet-surface: light-dark\(var\(--surface-container-low\), var\(--surface-container\)\); \}/);
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

test('on wide the Blocks page is one grid of cards: each card names its own Project, so no heading row splits the grid', () => {
  const source = read('../../android-companion/planner/blocks.mjs');
  assert.match(source, /if \(!wide && !state\.blockFilter && block\.projectId !== last\) \{/, 'no Project heading rows on wide');
  assert.match(source, /blockCard\(app, block, \{focus: focus\.has\(block\.id\), project: wide && !state\.blockFilter\}\)/);
  assert.match(read('./web.css'), /\[data-view=projects\]\) \.page \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 360px\), 1fr\)\);/);
});
