import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {longDate, dateText} from './planner/format.mjs';
import {dayChips} from './planner/task-values.mjs';

test('a shown date puts the day first, with no dot', () => {
  assert.equal(longDate('2026-11-07'), 'Saturday 7 November');
  assert.equal(dateText('2026-11-07T12:00'), 'Sat 7 Nov');
});

test('the task sheet day chips name weekdays in DATE_LOCALE, like the chosen-day chip beside them', () => {
  assert.deepEqual(dayChips('2026-11-16', '2026-11-30').map(c => c.label),
    ['Today', 'Tomorrow', 'Mon 30 Nov', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
});

test('no page formats a weekday or month in the device locale, which can put the month first or add a dot', () => {
  const roots = ['android-companion', 'web/app'];
  const files = roots.flatMap(root => fs.readdirSync(root, {recursive: true}).map(f => path.join(root, f)))
    .filter(f => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));
  const call = /toLocale(?:Date)?String\(\s*(?:\[\]|undefined)\s*,\s*\{([^}]*)\}/g;
  const offenders = files.flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(call)]
    .filter(m => /\b(?:weekday|month)\b/.test(m[1])).map(m => `${file}: ${m[0]}`));
  assert.deepEqual(offenders, [], 'use DATE_LOCALE from planner/format.mjs');
});

test('no page shows a date with an argument-less toLocaleString, which puts the month first on en-US', () => {
  const roots = ['android-companion', 'web/app'];
  const files = roots.flatMap(root => fs.readdirSync(root, {recursive: true}).map(f => path.join(root, f)))
    .filter(f => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));
  const call = /toLocale(?:Date)?String\(\s*\)/g;
  const offenders = files.flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(call)].map(m => `${file}: ${m[0]}`));
  assert.deepEqual(offenders, [], 'use dateText and clock from planner/format.mjs');
});
