import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan, planner} from './planner-state.mjs';
import {migratePlannerUX} from './planner-ux.mjs';
import {migrateReviewData} from './review-state.mjs';
import {bodyOf, defaultMealPlan, WATER_SETTINGS} from './body-store.mjs';
import {waterStatus} from './body-state.mjs';

const at = (time, day = '2026-10-18') => new Date(`${day}T${time}`);
const before = () => JSON.parse(fs.readFileSync(new URL('./fixtures/store-before-body.json', import.meta.url), 'utf8'));
const routine = {name: 'Morning routine', start: '07:00', end: '07:30', days: [1, 2, 3, 4, 5],
  steps: [{title: 'Glass of water'}, {title: 'Stretch'}, {title: 'Plan the day'}]};

test('a store saved before Routines, water and meals loads unchanged and keeps everything after body changes', () => {
  const old = before();
  const data = structuredClone(old);
  assert.equal(migratePlannerUX(data), false);
  assert.equal(migrateReviewData(data), false);
  assert.deepEqual(data, old);
  assert.deepEqual(bodyOf(data), {routines: [], runs: [], water: {settings: WATER_SETTINGS, glasses: [], snoozedUntil: null}, meals: [], mealGuesses: {}, mealPlan: defaultMealPlan()});

  const id = editPlan(data, {type: 'saveRoutine', routine}, at('06:00'));
  editPlan(data, {type: 'drinkWater', at: at('08:40').toISOString()}, at('08:40'));
  editPlan(data, {type: 'saveMeal', meal: {name: 'Poha', slot: 'breakfast', at: at('08:45').toISOString()}}, at('08:45'));
  assert.ok(id);
  const {planner: p, ...rest} = data;
  const {planner: oldPlanner, ...oldRest} = old;
  assert.deepEqual(rest, oldRest, 'tasks, capture history and every other top-level record are untouched');
  for (const key of Object.keys(oldPlanner).filter(k => !['events', 'undo'].includes(k))) assert.deepEqual(p[key], oldPlanner[key], key);
  assert.deepEqual(p.events.slice(0, oldPlanner.events.length), oldPlanner.events);
  assert.equal(bodyOf(data).water.glasses.length, 1);

  editPlan(data, {type: 'undo'});
  assert.equal(bodyOf(data).meals.length, 0, 'Undo takes back the last body change');
  assert.equal(bodyOf(data).water.glasses.length, 1);
});

test('routines save with step ids, archive on delete, and a run records ticks and skips', () => {
  const d = freshStore();
  const id = editPlan(d, {type: 'saveRoutine', routine}, at('06:00'));
  const saved = bodyOf(d).routines[0];
  assert.equal(saved.id, id);
  assert.equal(saved.steps.length, 3);
  assert.ok(saved.steps.every(step => typeof step.id === 'string' && step.id));
  const [a, b] = saved.steps;
  editPlan(d, {type: 'saveRoutineRun', run: {routineId: id, day: '2026-10-19', marks: {[a.id]: {state: 'done', at: at('07:02', '2026-10-19').toISOString()},
    [b.id]: {state: 'skipped', at: at('07:03', '2026-10-19').toISOString()}}}});
  assert.deepEqual(Object.keys(bodyOf(d).runs[0].marks), [a.id, b.id]);
  assert.throws(() => editPlan(d, {type: 'saveRoutineRun', run: {routineId: id, day: '2026-10-19', marks: {nope: {state: 'done', at: at('07:00').toISOString()}}}}),
    /step changed/);
  editPlan(d, {type: 'skipRoutineDay', routineId: id, day: '2026-10-20'});
  assert.equal(bodyOf(d).runs.find(r => r.day === '2026-10-20').skippedDay, true);
  editPlan(d, {type: 'undo'});
  assert.equal(bodyOf(d).runs.some(r => r.day === '2026-10-20'), false, 'Skip today has Undo');
  editPlan(d, {type: 'removeRoutine', id});
  assert.equal(bodyOf(d).routines[0].archived, true);
  assert.equal(bodyOf(d).runs.length, 1, 'past runs stay for History');
  assert.throws(() => editPlan(d, {type: 'saveRoutine', routine: {...routine, name: ' '}}), /name/);
  assert.throws(() => editPlan(d, {type: 'saveRoutine', routine: {...routine, end: '06:00'}}), /End time/);
});

test('water: Drank it logs a glass with Undo, settings validate, snooze clears on the next glass', () => {
  const d = freshStore();
  editPlan(d, {type: 'snoozeWater', until: at('09:15').toISOString()});
  editPlan(d, {type: 'drinkWater', at: at('09:00').toISOString()});
  assert.equal(bodyOf(d).water.snoozedUntil, null);
  editPlan(d, {type: 'setWater', fields: {goal: 10, intervalMinutes: 60, from: '07:30', until: '21:00', reminders: false}});
  assert.deepEqual(bodyOf(d).water.settings, {...WATER_SETTINGS, goal: 10, intervalMinutes: 60, from: '07:30', until: '21:00', reminders: false});
  assert.throws(() => editPlan(d, {type: 'setWater', fields: {from: '22:00', until: '08:00'}}), /end after/);
  assert.throws(() => editPlan(d, {type: 'setWater', fields: {goal: 0}}), /valid number/);
  assert.throws(() => editPlan(d, {type: 'setWater', fields: {colour: 'blue'}}), /Unknown/);
  const status = waterStatus({...bodyOf(d).water, now: at('09:30')});
  assert.equal(status.count, 1);
  assert.deepEqual(status.nextAt, at('10:00'));
  editPlan(d, {type: 'drinkWater', at: at('10:05').toISOString()});
  editPlan(d, {type: 'undo'});
  assert.equal(bodyOf(d).water.glasses.length, 1);
});

test('meals keep the user\'s words; guesses live apart and never outlive a rename', () => {
  const d = freshStore();
  const id = editPlan(d, {type: 'saveMeal', meal: {name: '  Dal rice ', slot: 'lunch', at: at('13:10').toISOString()}});
  assert.equal(bodyOf(d).meals[0].name, 'Dal rice');
  editPlan(d, {type: 'setMealGuess', id, guess: {status: 'ready', kcal: 550, protein: 18}});
  assert.deepEqual(Object.keys(bodyOf(d).meals[0]).sort(), ['at', 'created', 'id', 'name', 'slot']);
  assert.equal(bodyOf(d).mealGuesses[id].kcal, 550);
  editPlan(d, {type: 'saveMeal', meal: {id, name: 'Dal rice', slot: 'lunch'}});
  assert.ok(bodyOf(d).mealGuesses[id], 'same words keep the guess');
  editPlan(d, {type: 'saveMeal', meal: {id, name: 'Rajma chawal', slot: 'lunch'}});
  assert.equal(bodyOf(d).mealGuesses[id], undefined);
  assert.throws(() => editPlan(d, {type: 'saveMeal', meal: {name: '', slot: 'lunch'}}), /what you ate/);
  assert.throws(() => editPlan(d, {type: 'saveMeal', meal: {name: 'Tea', slot: 'brunch'}}), /breakfast/);
  editPlan(d, {type: 'removeMeal', id});
  assert.equal(bodyOf(d).meals.length, 0);
  editPlan(d, {type: 'undo'});
  assert.equal(bodyOf(d).meals[0].name, 'Rajma chawal');
  assert.equal(planner(d).body.schema, 1);
});

test('Capture answers about water and meals read what the planner logged', async () => {
  const {bodyToday} = await import('./capture-agenda.mjs');
  const data = before();
  assert.equal(bodyToday(data, {now: at('09:00')}), null, 'no body data yet: Capture says it is not tracked');
  editPlan(data, {type: 'drinkWater', at: at('08:40').toISOString()}, at('08:40'));
  editPlan(data, {type: 'drinkWater', at: at('08:50').toISOString()}, at('08:50'));
  editPlan(data, {type: 'saveMeal', meal: {name: 'Poha', slot: 'breakfast', at: at('08:45').toISOString()}}, at('08:45'));
  const today = bodyToday(data, {now: at('09:00')});
  assert.deepEqual(today.water, {glasses: 2, goal: 8});
  assert.deepEqual(today.meals, [{slot: 'Breakfast', text: 'Poha'}]);
});
