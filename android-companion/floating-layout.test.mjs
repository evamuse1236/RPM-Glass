import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {STYLE_PARTS} from '../scripts/build-companion-assets.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const plannerCss = () => ['planner.css', ...STYLE_PARTS['planner.css']].map(read).join('\n');
const rule = (css, selector) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

test('nothing floats beside the tab bar: no FAB host, no FAB styles, Add lives inside the bar', () => {
  const html = read('planner.html');
  assert.doesNotMatch(html, /fab-host/);
  assert.match(html, /id="now-host"/);
  const css = plannerCss();
  assert.doesNotMatch(css, /#fab-host|\.fab\b|--fab-size/);
  const shell = read('planner/shell.mjs');
  assert.match(shell, /nav\.append\(add\)/, 'Add is a child of the tab bar');
  assert.match(shell, /attachSwipe\(add, \{hold: \(\) => app\.capture\(\)/, 'a 400ms hold on Add opens Capture');
  assert.match(shell, /iconButton\('search', 'Search'/, 'Search is a top-bar button');
});

test('the tab bar\'s Add is 48 × 48 with the bar\'s inner radius, and quiet in dark mode', () => {
  const add = rule(plannerCss(), '.nav-add');
  assert.match(add, /inline-size: var\(--touch\)/);
  assert.match(add, /block-size: var\(--touch\)/);
  assert.match(add, /border-radius: var\(--r-control\)/);
  assert.doesNotMatch(add, /shadow/);
  assert.match(plannerCss(), /\.nav-add \{ background: var\(--secondary-container\)/);
});

test('the Now pill sits on the tab bar\'s top edge and hides while a snackbar shows', () => {
  const css = read('day.css');
  assert.match(rule(css, '#now-host'), /inset-block-end: calc\(var\(--nav-measured, var\(--nav\)\) - 6px\)/);
  assert.match(css, /#planner\[data-snackbar=true\] \.now-pill/);
});
