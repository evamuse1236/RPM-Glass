// The playground's notch copy passes the same shared habit cases as the planner (habit-rules.test.mjs) and the phone (NotchHabitsTest.java).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseNotchData, waterStatus, unloggedMeal} from './notch-day.mjs';

const cases = JSON.parse(readFileSync(new URL('../fixtures/habit-cases.json', import.meta.url), 'utf8'));

if (process.env.RPM_HABIT_CASE_TZ) {
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone,
    Intl.DateTimeFormat('en', {timeZone: process.env.RPM_HABIT_CASE_TZ}).resolvedOptions().timeZone);
  for (const c of cases.filter(c => c.timezone === process.env.RPM_HABIT_CASE_TZ)) {
    test(c.id, () => {
      const events = c.busy.map(b => ({title: b.title, start: Date.parse(b.start), end: Date.parse(b.end)}));
      const data = parseNotchData({planner: {body: c.body}}, events), body = data.body, now = Date.parse(c.now);
      const water = waterStatus(body.glasses, body.water, data.busy, body.waterSnoozedUntil, now);
      assert.deepEqual({count: water.count, goal: water.goal, nextAt: water.nextAt ? new Date(water.nextAt).toISOString() : null, pending: water.pending},
        c.expected.water, 'water');
      assert.equal(unloggedMeal(body, now), c.expected.meal, 'meal');
    });
  }
} else {
  for (const timezone of new Set(cases.map(c => c.timezone))) {
    test(`the playground notch passes the shared habit cases in ${timezone}`, () => {
      const child = spawnSync(process.execPath, ['--test', fileURLToPath(import.meta.url)], {
        env: {...process.env, NODE_TEST_CONTEXT: undefined, TZ: timezone, RPM_HABIT_CASE_TZ: timezone}, encoding: 'utf8',
      });
      assert.ifError(child.error);
      assert.equal(child.status, 0, child.stdout + child.stderr);
    });
  }
}
