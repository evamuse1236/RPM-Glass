import test from 'node:test';
import assert from 'node:assert/strict';
import {bodyOf} from './body-store.mjs';
import {HABITS, topHabit, habitMeters} from './habit-priority.mjs';

const DAY = '2026-10-20';
const at = time => new Date(`${DAY}T${time}`);
const body = ({glasses = [], meals = []} = {}) => bodyOf({planner: {body: {
  water: {glasses: glasses.map(time => at(time).toISOString())},
  meals: meals.map(([slot, time, extra = {}]) => ({id: slot, slot, name: 'Dal rice', at: at(time).toISOString(), ...extra})),
}}});
const eight = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];

test('the priority order is data: water, then meals', () => {
  assert.deepEqual(HABITS.map(h => h.kind), ['water', 'meal']);
});

test('water due wins over a due meal', () => {
  assert.deepEqual(topHabit(body({glasses: ['10:00']}), at('13:30')), {kind: 'water', count: 1, goal: 8});
});

test('water not pending shows the due meal', () => {
  const top = topHabit(body({glasses: ['13:00']}), at('13:30'));
  assert.deepEqual([top.kind, top.slot, top.name, top.at], ['meal', 'lunch', 'Lunch', +at('13:00')]);
});

test('water goal reached and no meal due shows nothing', () => {
  assert.equal(topHabit(body({glasses: eight, meals: [['lunch', '13:05']]}), at('13:30')), null);
});

test('a skipped meal is not due', () => {
  assert.equal(topHabit(body({glasses: eight, meals: [['lunch', '13:05', {state: 'skipped', name: ''}]]}), at('13:30')), null);
});

test('the meters count glasses against the goal and the meal slots that are on, logged ones by name', () => {
  const meters = habitMeters(body({glasses: ['10:00', '12:00'], meals: [['breakfast', '08:40'], ['lunch', '13:05', {state: 'skipped', name: ''}]]}), at('13:30'));
  assert.deepEqual(meters, {water: {count: 2, goal: 8}, meals: {slots: ['breakfast', 'lunch', 'dinner'], logged: ['breakfast']}});
});
