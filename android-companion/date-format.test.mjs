import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {longDate, dateText} from './planner/format.mjs';

test('a shown date puts the day first, with no dot', () => {
  assert.equal(longDate('2026-11-07'), 'Saturday 7 November');
  assert.equal(dateText('2026-11-07T12:00'), 'Sat 7 Nov');
});

test('no page formats a day and month in the device locale, which can put the month first', () => {
  const roots = ['android-companion', 'web/app'];
  const files = roots.flatMap(root => fs.readdirSync(root, {recursive: true}).map(f => path.join(root, f)))
    .filter(f => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));
  const call = /toLocale(?:Date)?String\(\s*(?:\[\]|undefined)\s*,\s*\{([^}]*)\}/g;
  const offenders = files.flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(call)]
    .filter(m => /\bmonth\b/.test(m[1]) && /\bday\b/.test(m[1])).map(m => `${file}: ${m[0]}`));
  assert.deepEqual(offenders, [], 'use DATE_LOCALE from planner/format.mjs');
});
