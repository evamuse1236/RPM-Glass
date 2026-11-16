import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseNotchData, today} from './notch-day.mjs';

test('the playground notch passes every case in fixtures/repeat-cases.json, as the planner and Repeats.java do', () => {
  const cases = JSON.parse(readFileSync(new URL('../fixtures/repeat-cases.json', import.meta.url), 'utf8'));
  assert.ok(cases.length > 0);
  const previous = process.env.TZ;
  try {
    for (const c of cases) {
      process.env.TZ = c.timezone;
      const [y, m, d] = c.day.split('-').map(Number);
      const {tasks} = parseNotchData({entries: [{id: 1, title: c.id, kind: 'plan', ...structuredClone(c.task)}]});
      const keys = today(tasks, new Date(y, m - 1, d, 12).getTime()).map(s => new Date(s.start).toISOString());
      assert.deepEqual(keys, c.expected.keys, `${c.id} keys`);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});
