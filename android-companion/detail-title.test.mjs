import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const body = (source, name) => {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} exists`);
  return source.slice(start, source.indexOf('\n}\n', start));
};

test('a detail page hands its large title to the bar as soon as the first line meets the bar, not once it has left', () => {
  const planner = read('planner.mjs');
  const sync = body(planner, 'syncTitleOut');
  assert.match(sync, /\.top \+ parseFloat\(getComputedStyle\(big\)\.paddingTop\)\s*< app\.dom\.scroll\.getBoundingClientRect\(\)\.top/);
  assert.doesNotMatch(sync, /\.bottom/, 'a page too short to scroll its title away would leave the bar empty over a cut title');
  assert.match(planner, /addEventListener\('scroll'[\s\S]*?syncTitleOut\(app\);[\s\S]*?\{passive: true\}/, 'every scroll re-checks it');
  assert.match(planner, /renderShell\(app, options\);\s*requestAnimationFrame\(\(\) => syncTitleOut\(app\)\);/,
    'every render re-checks it once the page is drawn, so a page opened at the top never inherits the last handover');
});

test('a short Block or Project page still scrolls its large title away, so no empty band sits under the collapsed bar', () => {
  const planner = read('planner.mjs');
  assert.match(planner, /requestAnimationFrame\(\(\) => syncTitleOut\(app\)\);\s*requestAnimationFrame\(\(\) => keepTitleRoom\(app\)\);/,
    'every render re-measures the room once the page is drawn');
  assert.match(planner, /const TITLE_ROOM_VIEWS = new Set\(\['blocks', 'projects'\]\);/);
  const room = body(planner, 'keepTitleRoom');
  assert.match(room, /next\.getBoundingClientRect\(\)\.top - big\.getBoundingClientRect\(\)\.top - TITLE_ROOM_GAP/,
    'the page can scroll until the content under the title sits 12dp below the bar');
  assert.match(room, /work\.style\.minBlockSize = Math\.ceil\(scroll\.clientHeight \+ Math\.max\(0, room\)\) \+ 'px'/);
  assert.match(room, /work\.style\.minBlockSize = '';\s*return;/, 'other pages keep their own height');
});

test('the handover shows the title once: the bar title fades in while the large title fades out', () => {
  const bar = read('planner.css');
  assert.match(bar, /\.detail-bar \.top-title \{ opacity: 0;/);
  assert.match(bar, /#planner\[data-title-out=true\] \.detail-bar \.top-title,[^{]*\{ opacity: 1; \}/);
  const pages = read('planner-pages.css');
  assert.match(pages, /#planner\[data-title-out=true\] \.detail-title-text:not\(:focus-within\) \{ opacity: 0; \}/,
    'no glyph of the large title shows cut under the bar; a title being edited stays');
  assert.match(pages, /\.detail-title-text \{ transition: opacity var\(--dur-short\) var\(--ease-standard\); \}/);
});

test('a collapsed detail bar wraps its title to two lines, never an ellipsis, and says nothing under it', () => {
  const shell = read('planner/shell.mjs');
  const detail = body(shell, 'detailBar');
  assert.match(detail, /el\('h1', 'top-title small'/);
  assert.match(detail, /classList\.add\('record-title'\)/);
  assert.doesNotMatch(shell, /blockSubtitle|top-subtitle/, 'the deadline is said once, on the page under the title');
  const css = read('planner.css');
  const small = css.match(/\.top-title\.small \{([^}]*)\}/)[1];
  assert.match(small, /-webkit-line-clamp: 2;/);
  assert.doesNotMatch(small, /nowrap|ellipsis/);
});

test('a detail bar is one row tall at rest and once its title shows: two title lines fit --top-bar', () => {
  const css = read('planner.css');
  const theme = read('theme.css');
  const token = name => Number(theme.match(new RegExp(`--${name}:\\s*(\\d+)px`))[1]);
  const lineHeight = name => Number(theme.match(new RegExp(`--${name}:\\s*\\d+ \\d+px/(\\d+)px`))[1]);
  const barHeight = Number(css.match(/--top-bar:\s*(\d+)px/)[1]);
  const bar = css.match(/\n\.top-bar \{([^}]*)\}/)[1];
  assert.match(bar, /min-height: var\(--top-bar\);/);
  const [top, , bottom] = bar.match(/padding: ([^;]+);/)[1].split(' ').map(v => token(v.match(/--(s\d)/)[1]));
  assert.match(css, /\.detail-bar \.top-title\.small\.record-title \{ font: var\(--title-medium\); \}/);
  assert.ok(top + 2 * lineHeight('title-medium') + bottom <= barHeight,
    'a wrapped record title never grows the bar, so the page title never starts under empty bar space');
  assert.ok(top + token('touch') + bottom <= barHeight, 'Back and More fit the row too');
});

test('a Block bar names its Area · Project beside Back at rest and gives that cell to the title once it scrolls out', () => {
  const shell = read('planner/shell.mjs');
  assert.match(body(shell, 'detailBar'), /app\.actions\.detailCrumb\?\.\(top\)[\s\S]*?el\('div', 'bar-heading'\)[\s\S]*?heading\.append\(title, crumb\)/);
  const bar = read('planner.css');
  assert.match(bar, /\.bar-heading > \* \{ grid-area: 1 \/ 1; \}/, 'the crumb and the title share one cell, so the bar keeps one height');
  assert.match(bar, /#planner\[data-title-out=true\] \.bar-heading > \.crumb \{ opacity: 0; visibility: hidden; \}/,
    'never both at once, and a hidden crumb takes no tap');
  const blocks = read('planner/blocks.mjs');
  assert.match(body(blocks, 'blockCrumb'), /crumb\.addEventListener\('click', \(\) => \{\s*const \{block: current, project: home\} = now\(\);/,
    'the bar keeps identical markup across saves, so its menu reads the Block when tapped, never a stale copy');
});

test('a Block page keeps Mark Result achieved on the page as its own button under the Plan, never in a menu', () => {
  const blocks = read('planner/blocks.mjs');
  assert.match(body(blocks, 'renderBlockDetail'),
    /page\.append\(list, blockAdd\(app, block\)\);\s*completedSection\([^;]*\);\s*if \(!status\.achieved\) page\.append\(achievedControl\(app, block, status\)\);/,
    'Completed follows the add field, so the Plan reads as one unit, and the verdict ends the page');
  assert.match(body(blocks, 'achievedControl'), /button\('', \(\) => achievedSheet\(app, block\), 'verdict-row'\)/);
  const css = read('planner-pages.css');
  assert.match(css, /#planner\[data-view=blocks\] \.verdict-row \{[^}]*font: var\(--body-large\); color: var\(--on-surface-variant\);/,
    'the verdict is quieter than Add: on-surface-variant words, no outline');
  assert.match(css, /#planner\[data-view=blocks\] \.verdict-row > \.ms \{[^}]*color: var\(--tertiary\);/,
    'only the trophy carries colour, the achieved green');
  assert.doesNotMatch(body(blocks, 'blockMenu'), /achiev/i);
});
