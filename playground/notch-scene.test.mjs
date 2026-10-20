import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseNotchData} from './notch-day.mjs';
import {notchScene, alertScene, WATER_SNOOZE, routineSnooze, PillPriority, controls, visibleRows, progress, heroValue} from './notch-scene.mjs';
import {anchor, G, innerRadius, faceTop, bandAt, pillRing, fits} from './notch-geometry.mjs';
import {S24} from './device.mjs';

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
  assert.ok(Math.abs(s.progress - 20 / 45) < 0.001);
  assert.equal(s.spoken, 'Write RM essay, 25 min left');
  assert.ok(s.canDone);
});

test('between items the pill shows when the next starts', () => {
  const s = scene(day(false), '2026-10-18T16:20');
  assert.equal(s.pillValue, '4:30');
  assert.equal(s.heroSubtitle, 'Study · 4:30 PM, in 10 min');
  assert.equal(s.progress, 0);
});

test('rows are the next item, then due water, then the other nudges and the meal, at most three', () => {
  const s = scene(day(true), '2026-10-18T16:05');
  assert.deepEqual(s.rows.map(r => [r.look, r.title, r.value]),
    [['TASK', 'Call Prof. Rao', '4:30 PM'], ['WATER', 'Water', '2 of 8 · due'], ['HABIT', 'Evening routine', '0 of 2']]);
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

test('the pill fits the measured status bar: 4dp above the hole, ending with the bar', () => {
  const a = anchor();
  assert.equal(a.top, 24 - Math.round(4 * S24.density));
  assert.equal(a.top + a.pill, S24.statusBarPx);
  assert.equal(a.centerX, S24.hole.centerX);
  assert.ok(Math.abs(S24.statusBarDp - 32.71) < 0.01);
});

function alertDay() {
  const entries = [task(1, 'Write RM essay', '2026-10-18T15:30', 45), {...task(2, 'Call the bank', '2026-10-18T16:30', 30), alertIntent: {type: 'reminder'}},
    {...task(3, 'Sit RM Quiz I', '2026-10-18T19:00', 60), alertIntent: {type: 'alarm'}}, {...task(4, 'Old reminder', '2026-10-18T09:00', 30), alertIntent: {type: 'reminder'}}];
  return parseNotchData({version: 1, entries, planner: {blocks: [{id: 'b1', title: 'Study'}]}}, null);
}

test('an alert shows the next task today that asked for it, else the hero', () => {
  const reminder = alertScene(alertDay(), at('2026-10-18T15:50'), 'reminder');
  assert.deepEqual([reminder.taskId, reminder.title, reminder.at, reminder.line], [2, 'Call the bank', '4:30 PM', 'Reminder · 4:30 PM']);
  const alarm = alertScene(alertDay(), at('2026-10-18T15:50'), 'alarm');
  assert.deepEqual([alarm.taskId, alarm.line], [3, 'Ringing · 7:00 PM']);
  assert.equal(alertScene(alertDay(), at('2026-10-18T19:30'), 'reminder').taskId, 3);
  assert.equal(alertScene(day(false), at('2026-10-18T15:50'), 'alarm').title, 'Write RM essay');
  assert.equal(alertScene(day(false), at('2026-10-18T23:00'), 'alarm'), null);
});

test('a reminder never says alarm', () => {
  for (const local of ['2026-10-18T15:50', '2026-10-18T19:30']) for (const data of [alertDay(), day(true)]) {
    const words = Object.values(alertScene(data, at(local), 'reminder')).join(' ');
    assert.doesNotMatch(words, /alarm|ringing/i);
  }
});

function alertRowsDay(callAlert) {
  const data = day(true);
  data.tasks.find(t => t.id === 2).alert = callAlert;
  data.tasks.find(t => t.id === 3).alert = 'alarm';
  return data;
}

test('the next alert leads the rows when nothing else shows it, and due water stays second', () => {
  const s = scene(alertRowsDay(''), '2026-10-18T16:05');
  assert.deepEqual([s.rows[0].look, s.rows[0].title, s.rows[0].value, s.rows[0].alert], ['ALARM', 'Gym', '7:00 PM', 'alarm']);
  assert.equal(s.rows[1].look, 'WATER');
  assert.ok(s.rows.length <= 3);
  assert.equal(s.rows[0].slot, s.nextAlert);
});

test('a task row whose alert is still to come carries its chip instead of a second row, and the hero shows its chip until it starts', () => {
  const s = scene(alertRowsDay('reminder'), '2026-10-18T16:05');
  assert.deepEqual([s.rows[0].look, s.rows[0].title, s.rows[0].alert], ['TASK', 'Call Prof. Rao', 'reminder']);
  assert.ok(s.rows.every(r => r.look !== 'REMINDER'));
  const before = scene(alertRowsDay('reminder'), '2026-10-18T16:20');
  assert.deepEqual([before.heroTitle, before.heroAlert, before.heroAt], ['Call Prof. Rao', 'reminder', '4:30 PM']);
  const during = scene(alertRowsDay('reminder'), '2026-10-18T16:40');
  assert.equal(during.heroAlert, '');
  assert.equal(during.nextAlert.task.id, 3);
});

test("the hero's own alert row leads the island's rows and never pushes due water out", () => {
  const s = scene(alertRowsDay('reminder'), '2026-10-18T16:20');
  assert.ok(s.waterDue);
  const own = visibleRows(s, 3)[0];
  assert.deepEqual([own.heros, own.title, own.value, own.alert], [true, 'Reminder', '4:30 PM', 'reminder']);
  for (let n = 1; n <= 3; n++) {
    const rows = visibleRows(s, n);
    assert.ok(rows.length <= n);
    assert.ok(controls(s).includes('GLASS') || rows.some(r => r.look === 'WATER'), `${n} rows`);
  }
});

test('the pill drops AM/PM within 12 hours', () => {
  assert.equal(scene(day(false), '2026-10-18T16:20').pillValue, '4:30');
  assert.equal(scene(day(false), '2026-10-18T03:00').pillValue, '3:30 PM');
  assert.equal(scene(day(false), '2026-10-18T03:31').pillValue, '3:30');
  assert.equal(notchScene(day(false), at('2026-10-18T16:20'), {}, true).pillValue, '16:30');
});

test('the ring fills per kind: time used, empty when upcoming, glasses, steps', () => {
  const running = scene(day(true), '2026-10-18T15:50');
  assert.ok(Math.abs(progress('TASK', running) - 20 / 45) < 0.001);
  const upcoming = scene(day(true), '2026-10-18T16:20');
  assert.equal(progress('TASK', upcoming), 0);
  assert.equal(progress('WATER', upcoming), 2 / 8);
  assert.equal(progress('HABIT', scene(day(true), '2026-10-18T16:05')), 0);
  assert.equal(heroValue(running), '25m');
  assert.equal(heroValue(scene(day(true), '2026-10-18T21:00')), '2/8');
});

test('the hero has one primary control, never greyed; Later only sits beside Glass', () => {
  assert.deepEqual(controls(scene(day(true), '2026-10-18T15:50')), ['DONE']);
  const events = [{start: at('2026-10-18T15:00'), end: at('2026-10-18T18:00'), title: 'Seminar', allDay: false, busy: false}];
  assert.deepEqual(controls(scene(day(false, events), '2026-10-18T17:30')), []);
  assert.deepEqual(controls(scene(day(true), '2026-10-18T21:00')), ['GLASS', 'LATER']);
});

test('the island always offers Glass, as the primary or as a row that stays when rows drop', () => {
  for (const local of ['2026-10-18T15:50', '2026-10-18T16:05', '2026-10-18T16:20', '2026-10-18T21:00']) {
    const s = scene(day(true), local);
    for (let n = 1; n <= 3; n++) {
      const rows = visibleRows(s, n);
      assert.ok(rows.length <= n);
      assert.ok(controls(s).includes('GLASS') || rows.some(r => r.look === 'WATER'), `${local} with ${n} rows`);
    }
  }
});

test('margins are 16dp on all four sides and every inner corner is 36 less its inset', () => {
  assert.equal(G.RADIUS_DP, 36);
  assert.equal(G.PAD_DP, 16);
  assert.equal(innerRadius(G.PAD_DP), 20);
  assert.equal(innerRadius(G.PAD_DP), G.CIRCLE_DP / 2);
  assert.equal(innerRadius(G.PAD_DP), G.CONTROL_DP / 2);
  const island = {x: 12, w: 360};
  const band = bandAt('open', island, 4);
  assert.equal(band.cx - band.d / 2 - island.x, 16);
  assert.equal(band.cy - band.d / 2 - 4, 16);
  assert.equal(island.x + island.w - band.valueRight, 16);
  assert.equal(faceTop(), 16 + 40 + 12);
  const css = readFileSync(new URL('./notch.css', import.meta.url), 'utf8');
  assert.match(css, /--radius: 36px;/);
  assert.match(css, /--pad: 16px;/);
  assert.match(css, /--inner: calc\(var\(--radius\) - var\(--pad\)\);/);
  assert.match(css, /padding: calc\(var\(--pad\) \+ var\(--circle\) \+ 12px\) var\(--pad\) var\(--pad\);/);
  const pill = {x: 100, w: 140, h: 36};
  const ring = bandAt('pill', pill, 0);
  assert.equal(ring.d, 28);
  assert.equal(pill.h / 2 - (ring.cx - ring.d / 2 - pill.x), ring.d / 2, 'the ring is concentric with the pill: 18 - 4 = 14');
  assert.equal(pillRing(28), 20);
});

test('a face too tall for the screen drops rows, then shortens its title, and is never cut', () => {
  assert.deepEqual(fits(true), [{rows: 3, shortTitle: false}, {rows: 2, shortTitle: false}, {rows: 1, shortTitle: false}, {rows: 1, shortTitle: true}]);
  assert.deepEqual(fits(false), [{rows: 3, shortTitle: false}, {rows: 3, shortTitle: true}]);
  const view = readFileSync(new URL('./notch-view.mjs', import.meta.url), 'utf8');
  assert.match(view, /for \(const fit of fits\(mode === 'open'\)\)/);
  assert.match(view, /h: Math\.max\(next\.offsetHeight, h\)/, 'the island is as tall as its face');
});

test('the copy uses the phone\'s sizes: NotchGeometry.java and notch-geometry.mjs match', () => {
  const java = readFileSync(new URL('../app/src/main/java/com/rpm/prototype/NotchGeometry.java', import.meta.url), 'utf8');
  const constants = Object.fromEntries([...java.matchAll(/static final (?:int|float) (\w+) = ([\d.]+)f?;/g)].map(([, k, v]) => [k, Number(v)]));
  for (const [k, v] of Object.entries(G)) assert.equal(constants[k], v, k);
  assert.ok(Object.keys(G).length >= 20);
});
