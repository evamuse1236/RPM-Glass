import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFakeDom} from './fake-dom.mjs';

installFakeDom();
const {alertPanel} = await import('./planner/task-tabs.mjs');
const {el} = await import('./planner/dom.mjs');
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const base = {day: '2026-10-27', time: '09:00', alert: 'off', lead: 0};

test('Remind or Alarm tapped before the task has a day and time opens When and saves nothing; no sentence explains it', () => {
  const saved = [];
  let opened = 0;
  const host = el('div');
  const panel = alertPanel(host, {alert: kind => saved.push(kind)}, false, () => { opened++; });
  const kind = value => host.children[0].children.find(node => node.dataset.value === value);
  panel.paint({...base, time: null});
  kind('reminder').click();
  kind('alarm').click();
  assert.equal(opened, 2);
  assert.deepEqual(saved, []);
  assert.ok(!host.textContent.includes('needs'), 'no explaining sentence');
  panel.paint(base);
  kind('alarm').click();
  assert.deepEqual(saved, ['alarm']);
  assert.equal(opened, 2);
});

test('each tab shows its name over its value; When offers No time and No date only once they are set, and no Pick a time', () => {
  const source = read('./planner/task-tabs.mjs');
  assert.match(source, /tab\.append\(el\('span', 'tab-name', name\), value\)/);
  assert.doesNotMatch(source, /Pick a time/, 'the ruler sets the time');
  assert.match(source, /noTime\.hidden = now\.repeating \|\| !now\.time;/);
  assert.match(source, /noDate\.hidden = !now\.day;/);
  assert.match(source, /alertPanel\(panels\.alert, pick, remote, \(\) => select\('when', \{moved: true\}\)\)/);
  const css = read('./task-tabs.css');
  assert.match(css, /\.tab-value \{[^}]*font: var\(--label-small\);/, 'the value is smaller than the name');
  assert.match(css, /\.block-choice:not\(\[aria-checked=true\]\) \.block-choice-mark \{ visibility: hidden; \}/, 'only the chosen Block shows a check');
  assert.doesNotMatch(css, /block-choice-mark \{[^}]*border:/, 'no empty choice circles');
});

test('the task sheet has no footer toolbar: Ask Capture is one tonal button; Duplicate, Archive and Delete sit in the header\'s More options menu', () => {
  const source = read('./planner/task-sheet.mjs');
  assert.doesNotMatch(source, /tool-btn|tool-label/);
  assert.match(source, /labelButton\('auto_awesome', 'Ask Capture', \(\) => app\.capture\(\), 'tonal-btn ask-capture'\)/);
  assert.match(source, /iconButton\('more_vert', 'More options'/);
  assert.match(source, /openMenu\(/);
  for (const word of ['Duplicate', 'Archive', 'Delete']) assert.match(source, new RegExp(`label: '${word}'`), word);
  assert.doesNotMatch(read('./task-sheet.css'), /tool-btn|\.sheet-task \.sheet-actions/);
});
