import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {bodyOf} from './body-store.mjs';
import {localDay, waterStatus} from './body-state.mjs';
import {mealPlanSlots, dueMeal} from './day-parts.mjs';

const cases = JSON.parse(readFileSync(new URL('../fixtures/habit-cases.json', import.meta.url), 'utf8'));

if (process.env.RPM_HABIT_CASE_TZ) {
  const timezone = Intl.DateTimeFormat('en', {timeZone: process.env.RPM_HABIT_CASE_TZ}).resolvedOptions().timeZone;
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, timezone);
  for (const c of cases.filter(c => c.timezone === process.env.RPM_HABIT_CASE_TZ)) {
    test(c.id, () => {
      const body = bodyOf({planner: {body: c.body}}), now = new Date(c.now), day = localDay(now);
      const water = waterStatus({...body.water, now, busy: c.busy});
      assert.deepEqual({count: water.count, goal: water.goal, nextAt: water.nextAt?.toISOString() ?? null, pending: water.pending}, c.expected.water);
      const meals = body.meals.filter(m => localDay(m.at) === day);
      assert.equal(dueMeal(meals, day, now, body.mealPlan)?.slot ?? null, c.expected.meal);
      if (c.expected.mealPlan) assert.deepEqual(mealPlanSlots(body.mealPlan), c.expected.mealPlan);
    });
  }
} else {
  for (const timezone of new Set(cases.map(c => c.timezone))) {
    test(`shared habit cases in ${timezone}`, () => {
      const child = spawnSync(process.execPath, ['--test', fileURLToPath(import.meta.url)], {
        env: {...process.env, TZ: timezone, RPM_HABIT_CASE_TZ: timezone}, encoding: 'utf8',
      });
      assert.ifError(child.error);
      assert.equal(child.status, 0, child.stdout + child.stderr);
    });
  }
}
