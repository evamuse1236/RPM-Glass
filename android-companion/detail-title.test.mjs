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

test('the handover shows the title once: the bar title fades in while the large title fades out', () => {
  const bar = read('planner.css');
  assert.match(bar, /\.detail-bar \.top-title \{ opacity: 0;/);
  assert.match(bar, /#planner\[data-title-out=true\] \.detail-bar \.top-title,[^{]*\{ opacity: 1; \}/);
  const pages = read('planner-pages.css');
  assert.match(pages, /#planner\[data-title-out=true\] \.detail-title-text:not\(:focus-within\) \{ opacity: 0; \}/,
    'no glyph of the large title shows cut under the bar; a title being edited stays');
  assert.match(pages, /\.detail-title-text \{ transition: opacity var\(--dur-short\) var\(--ease-standard\); \}/);
});

test('a Block\'s collapsed bar keeps its title on one line with its deadline under it', () => {
  const shell = read('planner/shell.mjs');
  const detail = body(shell, 'detailBar');
  assert.match(detail, /el\('h1', 'top-title small'/);
  assert.match(detail, /blockSubtitle\(app, record\)/);
  const css = read('planner.css');
  assert.match(css, /\.top-title\.small \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/);
});
