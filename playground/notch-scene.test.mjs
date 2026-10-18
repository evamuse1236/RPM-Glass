import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNotchData} from './notch-day.mjs';
import {notchScene, WATER_SNOOZE, routineSnooze, PillPriority} from './notch-scene.mjs';

const at = local => new Date(local + ':00+05:30').getTime();
const iso = local => new Date(at(local)).toISOString();
const task = (id, title, local, minutes) => ({id, title, raw: title, kind: 'plan', planned: iso(local), minutes, blockId: 'b1'});

function day(body, events = null) {
  const planner = {blocks: [{id: 'b1', title: 'Study'}]};
  if (body) planner.body = {
    water: {settings: {goal: 8}, glasses: [iso('2026-10-18T08:30'), iso('2026-10-18T10:30')]},
    routines: [{id: 'r1', name: 'Evening routine', start: '16:00', end: '17:00', days: [0],
      steps: [{id: 's1', title: 'Tidy desk'}, {id: 's2', title: 'Walk'}]}],
    meals: [],
  };
  const entries = [task(1, 'Write RM essay', '2026-10-18T15:30', 45), task(2, 'Call Prof. Rao', '2026-10-18T16:30', 30),
    task(3, 'Gym', '2026-10-18T19:00', 60)];
  return parseNotchData({version: 1, entries, planner}, events);
}
const scene = (data, local, snoozes = {}) => notchScene(data, at(local), snoozes, false);

test('a running task shows time left everywhere', () => {
  const s = scene(day(true), '2026-10-18T15:50');
  assert.equal(s.pillValue, '25m');
  assert.equal(s.heroTitle, 'Write RM essay');
  assert.equal(s.heroSubtitle, 'Study · 25 min left');
  assert.equal(s.barStart, '20m');
  assert.equal(s.barEnd, '-25m');
  assert.ok(Math.abs(s.progress - 20 / 45) < 0.001);
  assert.equal(s.spoken, 'Write RM essay, 25 min left');
  assert.ok(s.canDone);
});

test('between items the pill shows when the next starts', () => {
  const s = scene(day(false), '2026-10-18T16:20');
  assert.equal(s.pillValue, '4:30 PM');
  assert.equal(s.heroSubtitle, 'Study · 4:30 PM, in 10 min');
  assert.equal(s.barEnd, '30m');
  assert.equal(s.progress, 0);
});

test('rows are the next item, then nudges, then the meal, at most three', () => {
  const s = scene(day(true), '2026-10-18T16:05');
  assert.deepEqual(s.rows.map(r => [r.look, r.title, r.value]),
    [['TASK', 'Call Prof. Rao', '4:30 PM'], ['HABIT', 'Evening routine', '0 of 2'], ['WATER', 'Water', '2 of 8 · due']]);
  assert.ok(s.waterDue);
});

test('without Body data only the day shows', () => {
  const s = scene(day(false), '2026-10-18T15:50');
  assert.equal(s.water, null);
  assert.equal(s.habit, null);
  assert.equal(s.meal, null);
  assert.equal(s.canLogMeal, false);
  assert.equal(s.canSnooze, false);
  assert.equal(s.rows.length, 2);
});

test('a snooze holds water and the routine', () => {
  const snoozes = {[WATER_SNOOZE]: at('2026-10-18T16:20'), [routineSnooze('r1')]: at('2026-10-18T16:20')};
  const held = scene(day(true), '2026-10-18T16:05', snoozes);
  assert.equal(held.waterDue, false);
  assert.equal(held.habit, null);
  assert.ok(scene(day(true), '2026-10-18T16:25', snoozes).waterDue);
});

test('a calendar event is fixed and a running task beats it', () => {
  const events = [{start: at('2026-10-18T15:00'), end: at('2026-10-18T18:00'), title: 'Seminar', allDay: false, busy: false}];
  assert.equal(scene(day(false, events), '2026-10-18T15:50').heroTitle, 'Write RM essay');
  const later = scene(day(false, events), '2026-10-18T17:30');
  assert.equal(later.heroTitle, 'Seminar');
  assert.equal(later.heroLook, 'EVENT');
  assert.equal(later.pillValue, '30m');
  assert.equal(later.canDone, false);
});

test('with no task left and water due, water is the hero', () => {
  const s = scene(day(true), '2026-10-18T21:00');
  assert.equal(s.hero, null);
  assert.equal(s.heroLook, 'WATER');
  assert.equal(s.heroSubtitle, '2 of 8 glasses today · due now');
  assert.deepEqual([s.rows.at(-1).title, s.rows.at(-1).value], ['Dinner', 'Not logged']);
});

test('a new nudge leads for eight seconds, then the task returns and the nudge splits off', () => {
  const p = new PillPriority();
  p.update(scene(day(true), '2026-10-18T16:05'), 0);
  assert.equal(p.primary(1000).kind, 'HABIT');
  assert.equal(p.primary(9000).kind, 'TASK');
  assert.equal(p.secondary(9000).kind, 'HABIT');
});
