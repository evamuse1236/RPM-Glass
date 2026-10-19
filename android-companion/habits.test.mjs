import test from 'node:test';
import assert from 'node:assert/strict';
import {mealPlanSlots, mealSlots} from './day-parts.mjs';
import {bodyOf, defaultMealPlan} from './body-store.mjs';
import {editPlan} from './planner-state.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {WATER_STEPS, GLASS_SIZES, stepWater, everyText} from './body-state.mjs';
import {TIME_GRID, timeChips, nextHalfHour, dayChips, REPEAT_CHIPS, repeatLabel} from './planner/task-values.mjs';

const DAY = '2026-10-19';
const at = time => new Date(`${DAY}T${time}`);

test('with no meal plan saved, breakfast, lunch and dinner sit at 8:30, 13:00 and 20:00, all shown', () => {
  assert.deepEqual(mealPlanSlots(undefined), [
    {slot: 'breakfast', at: '08:30', on: true, name: 'Breakfast'},
    {slot: 'lunch', at: '13:00', on: true, name: 'Lunch'},
    {slot: 'dinner', at: '20:00', on: true, name: 'Dinner'},
  ]);
  assert.deepEqual(mealPlanSlots(defaultMealPlan()), mealPlanSlots(null));
  assert.deepEqual(bodyOf({}).mealPlan, defaultMealPlan());
});

test('a stored plan reads in clock order, a snack keeps its own name, and only on:false is off', () => {
  const plan = {slots: [{slot: 'dinner', at: '19:30', on: true}, {slot: 'snack', at: '16:00', on: true, name: 'Chai'},
    {slot: 'breakfast', at: '07:45', on: false}]};
  assert.deepEqual(mealPlanSlots(plan).map(s => [s.slot, s.at, s.on, s.name]),
    [['breakfast', '07:45', false, 'Breakfast'], ['snack', '16:00', true, 'Chai'], ['dinner', '19:30', true, 'Dinner']]);
});

test('a meal turned off leaves no placeholder on Today, but a meal logged for it still shows', () => {
  const plan = {slots: [{slot: 'breakfast', at: '08:30', on: true}, {slot: 'lunch', at: '13:00', on: false},
    {slot: 'dinner', at: '20:00', on: true}]};
  assert.deepEqual(mealSlots([], DAY, at('07:00'), {plan}).map(s => s.slot), ['breakfast', 'dinner']);
  const lunch = {id: 'm1', name: 'Dal rice', slot: 'lunch', at: at('13:10').toISOString()};
  assert.deepEqual(mealSlots([lunch], DAY, at('14:00'), {plan}).map(s => s.slot), ['breakfast', 'lunch', 'dinner']);
  const snack = {slots: [...plan.slots, {slot: 'snack', at: '16:30', on: true, name: 'Fruit'}]};
  const row = mealSlots([], DAY, at('07:00'), {plan: snack}).find(s => s.slot === 'snack');
  assert.equal(row.label, 'Fruit · Not logged');
  assert.equal(row.at, +at('16:30'));
});

test('setMealSlot saves time, visibility and a snack name; removeMealSlot takes only the snack away', () => {
  const data = freshStore();
  editPlan(data, {type: 'setMealSlot', slot: 'lunch', fields: {at: '12:30', on: false}}, at('09:00'));
  editPlan(data, {type: 'setMealSlot', slot: 'snack', fields: {on: true, name: 'Chai'}}, at('09:00'));
  assert.deepEqual(mealPlanSlots(bodyOf(data).mealPlan).map(s => [s.slot, s.at, s.on, s.name]), [
    ['breakfast', '08:30', true, 'Breakfast'], ['lunch', '12:30', false, 'Lunch'], ['snack', '16:00', true, 'Chai'],
    ['dinner', '20:00', true, 'Dinner']]);
  assert.throws(() => editPlan(data, {type: 'setMealSlot', slot: 'lunch', fields: {at: 'noon'}}, at('09:00')), /valid time/);
  assert.throws(() => editPlan(data, {type: 'removeMealSlot', slot: 'dinner'}, at('09:00')), /off instead/);
  editPlan(data, {type: 'removeMealSlot', slot: 'snack'}, at('09:00'));
  assert.ok(!bodyOf(data).mealPlan.slots.some(s => s.slot === 'snack'));
});

test('water steppers stay on their grid: 1 to 20 glasses, 15 to 240 minutes in 15-minute steps', () => {
  assert.deepEqual(WATER_STEPS.goal, {min: 1, max: 20, step: 1});
  assert.deepEqual(WATER_STEPS.intervalMinutes, {min: 15, max: 240, step: 15});
  assert.equal(stepWater('goal', 8, 1), 9);
  assert.equal(stepWater('goal', 1, -1), 1);
  assert.equal(stepWater('goal', 20, 1), 20);
  assert.equal(stepWater('intervalMinutes', 90, 1), 105);
  assert.equal(stepWater('intervalMinutes', 15, -1), 15);
  assert.equal(stepWater('intervalMinutes', 240, 1), 240);
  assert.equal(stepWater('intervalMinutes', 100, 0), 105, 'an off-grid value snaps to the nearest step');
  assert.deepEqual(GLASS_SIZES, [200, 250, 300, 330, 500]);
  assert.equal(everyText(90), '90 min');
  assert.equal(everyText(120), '2 h');
});

test('the Time row is every half hour from 6:00 AM to 11:00 PM, with an off-grid time put in its place', () => {
  assert.equal(TIME_GRID.length, 35);
  assert.equal(TIME_GRID[0], '06:00');
  assert.equal(TIME_GRID[1], '06:30');
  assert.equal(TIME_GRID.at(-1), '23:00');
  assert.deepEqual(timeChips('09:00'), TIME_GRID);
  const chips = timeChips('14:20');
  assert.equal(chips.length, 36);
  assert.deepEqual(chips.slice(chips.indexOf('14:00'), chips.indexOf('14:00') + 3), ['14:00', '14:20', '14:30']);
  assert.equal(timeChips('05:15')[0], '05:15');
  assert.equal(timeChips('23:40').at(-1), '23:40');
});

test('the Time row opens on the next half hour, kept between 6:00 AM and 11:00 PM', () => {
  assert.equal(nextHalfHour(at('14:10')), '14:30');
  assert.equal(nextHalfHour(at('14:30')), '14:30');
  assert.equal(nextHalfHour(at('02:00')), '06:00');
  assert.equal(nextHalfHour(at('23:20')), '23:00');
});

test('the Day row is Today, Tomorrow and five weekdays; a picked date outside them gets its own chip in order', () => {
  const chips = dayChips(DAY);
  assert.deepEqual(chips.map(c => c.label), ['Today', 'Tomorrow', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.equal(chips[3].day, '2026-10-22');
  assert.match(chips[3].aria, /Thursday/);
  assert.equal(chips[0].aria, '');
  const later = dayChips(DAY, '2026-11-03');
  assert.equal(later[2].day, '2026-11-03');
  assert.equal(later.length, 8);
  assert.equal(dayChips(DAY, '2026-10-10')[0].day, '2026-10-10');
  assert.equal(dayChips(DAY, '2026-10-21').length, 7);
});

test('the Repeat chip says Weekdays while the task row still says Every weekday', () => {
  assert.equal(REPEAT_CHIPS.find(([value]) => value === 'weekdays')[1], 'Weekdays');
  assert.equal(repeatLabel({recurrence: 'weekdays'}), 'Every weekday');
});
