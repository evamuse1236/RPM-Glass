import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {STYLE_PARTS} from '../scripts/build-companion-assets.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const plannerCss = () => ['planner.css', ...STYLE_PARTS['planner.css']].map(read).join('\n');
const rule = (css, selector) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

test('Add is a round 60dp button in the dock beside the tab bar, and the bar ends 12dp before it', () => {
  const html = read('planner.html');
  assert.match(html, /<nav id="nav-bar"[^>]*><\/nav>\s*<div id="dock"><\/div>/);
  assert.match(html, /id="now-host"/);
  const css = plannerCss();
  const fab = rule(css, '.fab');
  assert.match(fab, /inline-size: var\(--fab\)/);
  assert.match(fab, /block-size: var\(--fab\)/);
  assert.match(fab, /border-radius: 50%/);
  assert.match(fab, /background: var\(--primary\)/);
  assert.match(read('theme.css'), /--fab:60px;/);
  assert.match(css, /#nav-bar \{ inset-inline-end: calc\(var\(--inset-page\) \+ var\(--fab\) \+ var\(--s3\)\); \}/);
  const shell = read('planner/shell.mjs');
  assert.match(shell, /host\.append\(habit, add\)/, 'Add and the habit circle live in the dock, not in the tab bar');
  assert.doesNotMatch(shell, /nav\.append\(add\)/);
  assert.match(shell, /attachSwipe\(add, \{hold: \(\) => app\.openSearch\(\)/, 'a 400ms hold on Add opens Search');
  assert.match(shell, /iconButton\('search', 'Search'/, 'Search is a top-bar button');
});

test('Today has no top bar: its date line holds More options; other tabs show Search and More options, never a mic', async () => {
  const shell = read('planner/shell.mjs');
  assert.doesNotMatch(shell, /'mic'/);
  assert.match(shell, /bar\.hidden = [^;]*\(!top && app\.state\.tab === 'today'\)/);
  const header = read('planner/today-header.mjs');
  assert.match(header, /iconButton\('more_vert', 'More options', \(\) => rootMenu\(app, more\), \{cls: 'date-more'\}\)/);
  const {dateWords} = await import('./planner/today-header.mjs');
  assert.equal(dateWords('2026-10-27', '2026-10-27'), '27 October ›');
  assert.equal(dateWords('2027-01-03', '2026-10-27'), '3 January 2027 ›');
  assert.match(read('dock.css'), /prefers-reduced-transparency: reduce\) \{[^@]*:root\[data-bar-glass=true\] \.fab \{ border: 0; background: var\(--primary\); color: var\(--on-primary\);/);
});

test('the habit circle is 48dp glass 12dp above Add; the page and the snackbar keep clear of it', () => {
  const css = plannerCss();
  const dock = rule(css, '#dock');
  assert.match(dock, /flex-direction: column/);
  assert.match(dock, /align-items: center/, 'the circle is centred above Add');
  assert.match(dock, /gap: var\(--s3\)/);
  const circle = rule(css, '.habit-circle');
  assert.match(circle, /inline-size: var\(--touch\)/);
  assert.match(circle, /border-radius: 50%/);
  assert.match(css, /:root\[data-bar-glass=true\] :is\(\.habit-circle, \.fab\) \{[^}]*backdrop-filter: blur\(var\(--glass-blur\)\)/, 'the same glass as the tab bar');
  assert.match(css, /#planner\[data-habit=true\] \.page \{ padding-bottom: calc\(var\(--nav-measured, var\(--nav\)\) \+ var\(--touch\) \+ var\(--s3\) \+ var\(--s4\)\); \}/);
  assert.match(css, /#planner\[data-habit=true\] ~ #sheet\[hidden\] ~ #snackbar \{ right: calc\(var\(--inset-page\) \+ var\(--fab\) \+ var\(--s3\)\); \}/);
});

test('with large text the tab bar takes the full width and the dock stands 12dp above it, clear of the page and snackbar', () => {
  const css = plannerCss();
  assert.match(css, /:root\[data-large-text=true\] #planner:has\(> #dock:not\(\[hidden\]\) \.fab:not\(\[hidden\]\)\) :is\(#nav-bar, #now-host\) \{ inset-inline-end: var\(--inset-page\); \}/);
  assert.match(css, /:root\[data-large-text=true\] #dock \{ inset-block-end: calc\(var\(--nav-measured, var\(--nav\)\) \+ var\(--s3\)\); \}/);
  assert.match(css, /:root\[data-large-text=true\] #planner\[data-habit=true\] \.page \{ padding-bottom: calc\(var\(--nav-measured, var\(--nav\)\) \+ var\(--fab\) \+ var\(--touch\) \+ 2 \* var\(--s3\) \+ var\(--s4\)\); \}/);
  assert.match(css, /:root\[data-large-text=true\] #planner:has\(> #dock:not\(\[hidden\]\) \.fab:not\(\[hidden\]\)\) ~ #sheet\[hidden\] ~ #snackbar \{ right:/);
});

test('the Now pill floats 16dp above the tab bar and hides while a snackbar shows', () => {
  const css = read('day.css');
  assert.match(rule(css, '#now-host'), /inset-block-end: calc\(var\(--nav-measured, var\(--nav\)\) \+ var\(--s4\)\)/);
  assert.match(css, /#planner\[data-snackbar=true\] \.now-pill/);
});

test('nothing shows in the strip under the tab bar, and a row scrolled into view clears a snackbar', () => {
  const css = read('planner.css');
  assert.match(css, /--nav-gap: max\(var\(--s4\), calc\(env\(safe-area-inset-bottom, 0px\) \+ var\(--s2\)\)\);/);
  assert.match(rule(css, '#nav-bar'), /inset-block-end: var\(--nav-gap\);/);
  const mask = css.match(/\n  mask-image: linear-gradient\(to top, transparent calc\(var\(--nav-gap\) \+ var\(--(s\d)\)\), #000 calc\(var\(--nav-gap\) \+ var\(--(s\d)\)\)\);/);
  assert.ok(mask, 'the page is masked out from the screen bottom to above the bar\'s bottom edge');
  const theme = read('theme.css');
  const px = name => Number(theme.match(new RegExp(`--${name}:(\\d+)px`))[1]);
  const [clear, back] = [px(mask[1]), px(mask[2])];
  const curl = (radius, up) => radius - Math.sqrt(radius ** 2 - (radius - Math.min(up, radius)) ** 2);
  assert.ok(curl(64 / 2, clear) < 2 && curl(px('fab') / 2, clear - 2) < 2,
    'no row shows beside the round ends of the bar or Add (E/03-today.png: a meal icon under the +)');
  assert.ok(back <= 64 / 2, 'the page is back by the bar\'s middle, so a glass bar shows it');
  assert.doesNotMatch(css, /--bar-fade/);
  assert.match(css, /#planner\[data-snackbar=true\]:has\(> #nav-bar:not\(\[hidden\]\)\) #planner-scroll \{\n  scroll-padding-block-end: calc\(var\(--nav-measured, var\(--nav\)\) \+ var\(--s4\) \+ var\(--snackbar-h, 48px\) \+ var\(--s4\)\);/);
  assert.match(read('planner.mjs'), /setProperty\('--snackbar-h', snackbar\.offsetHeight \+ 'px'\)/,
    'the snackbar\'s full height, not its size part-way through the entry scale');
});
