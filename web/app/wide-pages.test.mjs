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
