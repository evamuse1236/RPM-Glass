import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {STYLE_PARTS} from '../scripts/build-companion-assets.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const plannerCss = () => ['planner.css', ...STYLE_PARTS['planner.css']].map(read).join('\n');
const rule = (css, selector) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

test('the Capture button is a round 60dp button in the dock beside the tab bar, and the bar ends 12dp before it', () => {
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
  assert.match(shell, /host\.append\(habit, fab\)/, 'the round button and the habit circle live in the dock, not in the tab bar');
  assert.doesNotMatch(shell, /nav\.append\(fab\)/);
  assert.match(shell, /iconButton\('close_fullscreen', 'Back to Capture', \(\) => app\.capture\(\)/, 'a tap goes back to Capture (user, 2026-11-01)');
  assert.match(shell, /attachSwipe\(fab, \{hold: \(\) => holdToAdd\(app\)/, 'a 400ms hold adds');
  assert.match(shell, /iconButton\('search', 'Search'/, 'Search is a top-bar button');
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
  assert.match(css, /:root\[data-bar-glass=true\] \.habit-circle \{[^}]*backdrop-filter: blur\(var\(--glass-blur\)\)/, 'the same glass as the tab bar');
  assert.match(css, /#planner\[data-habit=true\] \.page \{ padding-bottom: calc\(var\(--nav-measured, var\(--nav\)\) \+ var\(--touch\) \+ var\(--s3\) \+ var\(--s6\)\); \}/);
  assert.match(css, /#planner:has\(> #dock:not\(\[hidden\]\) \.fab:not\(\[hidden\]\)\) ~ #sheet\[hidden\] ~ #snackbar \{ right: calc\(var\(--inset-page\) \+ var\(--fab\) \+ var\(--s3\)\); \}/);
});

test('with large text the tab bar takes the full width and the dock stands 12dp above it, clear of the page and snackbar', () => {
  const css = plannerCss();
  assert.match(css, /:root\[data-large-text=true\] #planner:has\(> #dock:not\(\[hidden\]\) \.fab:not\(\[hidden\]\)\) :is\(#nav-bar, #now-host\) \{ inset-inline-end: var\(--inset-page\); \}/);
  assert.match(css, /:root\[data-large-text=true\] #dock \{ inset-block-end: calc\(var\(--nav-measured, var\(--nav\)\) \+ var\(--s3\)\); \}/);
  assert.match(css, /:root\[data-large-text=true\] #planner\[data-habit=true\] \.page \{ padding-bottom: calc\(var\(--nav-measured, var\(--nav\)\) \+ var\(--fab\) \+ var\(--touch\) \+ 2 \* var\(--s3\) \+ var\(--s6\)\); \}/);
  assert.match(css, /#planner:has\(> #dock:not\(\[hidden\]\) \.fab:not\(\[hidden\]\)\) ~ #sheet\[hidden\] ~ #snackbar \{ right:/);
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
  const mask = rule(css, ':root:not([data-keyboard=open]) #planner:has(> #nav-bar:not([hidden])) #planner-scroll');
  assert.match(mask, /linear-gradient\(to top, transparent var\(--nav-gap\), #000 calc\(var\(--nav-gap\) \+ var\(--bar-fade, var\(--s8\)\)\)\)/,
    'the strip under the bar shows nothing; the page shows through the glass');
  assert.match(mask, /mask-size: [^;]*calc\(100% - var\(--inset-page\) - var\(--bar-end\) - 2 \* var\(--bar-r\)\) var\(--bar-top\)/,
    'below the bar\'s top the page shows only inside the bar, never in the gaps beside it');
  assert.match(mask, /linear-gradient\(to top, transparent max\(var\(--dock-top\), var\(--page-end\)\), #000 calc\(max\(var\(--dock-top\), var\(--page-end\)\) \+ var\(--s6\)\)\)/,
    'nothing shows behind Add or the habit circle');
  assert.match(mask, /linear-gradient\(to top, transparent var\(--page-end\), #000 calc\(var\(--page-end\) \+ var\(--s6\)\)\)/,
    'beside the bar the page ends at the bar\'s top, or at the Now pill\'s top while it shows');
  assert.match(css, /--page-end: calc\(var\(--bar-top\) \+ var\(--now-clear\)\);/);
  assert.match(css, /#planner\[data-now-off=true\]:not\(\[data-now-aside=true\], \[data-snackbar=true\]\):has\(> #now-host:not\(\[hidden\]\)\) \{ --now-clear: calc\(var\(--s4\) \+ 32px\); \}/,
    'the Now pill never sits on a row');
  assert.match(css, /#planner\[data-snackbar=true\] \{ --now-clear: calc\(var\(--s4\) \+ var\(--snackbar-h, 48px\)\); \}/,
    'while a snackbar shows the page ends at its top, so no row sits in the gap between the snackbar and the bar');
  assert.match(css, /:root\[data-bar-glass=true\] #nav-bar \{[^}]*background: linear-gradient\(to top, var\(--float-surface\) var\(--s2\), transparent var\(--s6\)\),/,
    'the glass turns solid below the labels, so no row\'s words show under them');
  assert.match(css, /#planner\[data-now-off=true\]:has\(> #now-host:not\(\[hidden\]\)\) \.page::after \{ content: ""; display: block; block-size: calc\(var\(--s4\) \+ 32px\); \}/,
    'the last row still scrolls clear of the Now pill');
  assert.match(mask, /mask-repeat: no-repeat;/);
  assert.match(mask, /mask-composite: add, add, add, add, intersect, add;/);
  assert.match(css, /#planner\[data-habit=true\]:has\(> #dock:not\(\[hidden\]\) \.fab:not\(\[hidden\]\)\) \{ --dock-top: calc\(var\(--nav-gap\) \+ 2px \+ var\(--fab\) \+ var\(--s3\) \+ var\(--touch\)\); \}/);
  assert.match(css, /:root\[data-bar-glass=true\] \{ --bar-fade: calc\(var\(--nav-measured, var\(--nav\)\) - var\(--nav-gap\)\); --bar-ends: 30%; \}/,
    'a glass bar shows the page fading in across its height, so colour shows through and no words can be read under its labels');
  assert.equal(mask.match(/radial-gradient\([^;]*?rgb\(0 0 0 \/ var\(--bar-ends, 100%\)\)/g)?.length, 2, 'the bar\'s round ends fade the page too');
  assert.match(css, /#planner\[data-snackbar=true\]:has\(> #nav-bar:not\(\[hidden\]\)\) #planner-scroll \{\n  scroll-padding-block-end: calc\(var\(--nav-measured, var\(--nav\)\) \+ var\(--s4\) \+ var\(--snackbar-h, 48px\) \+ var\(--s6\)\);/);
  assert.match(read('planner.mjs'), /setProperty\('--snackbar-h', snackbar\.offsetHeight \+ 'px'\)/,
    'the snackbar\'s full height, not its size part-way through the entry scale');
});
