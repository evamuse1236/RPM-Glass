import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom, FakeElement} from './fake-dom.mjs';

installFakeDom();
Object.assign(document, {getElementById: () => null, addEventListener() {}, removeEventListener() {}});
globalThis.matchMedia ??= () => ({matches: true});
globalThis.getComputedStyle ??= () => ({opacity: '1', transform: 'none', getPropertyValue: () => ''});
// The few element calls the sheet makes that the fake DOM leaves out; the sheet shows inline, so it never animates.
Object.defineProperty(FakeElement.prototype, 'style', {get() { return this._style ??= {setProperty() {}, removeProperty() {}}; }});
Object.assign(FakeElement.prototype, {
  before() {}, contains() { return false; }, getBoundingClientRect: () => ({height: 0}), getAnimations: () => [],
  hasAttribute(name) { return this.getAttribute(name) != null; },
  toggleAttribute(name, on = !this.hasAttribute(name)) { on ? this.setAttribute(name, '') : this.removeAttribute(name); return on; },
});
const {editPlan} = await import('./planner-state.mjs');
const {bodyApi} = await import('./planner/body-api.mjs');
const {openRunSheet} = await import('./planner/routines.mjs');
const {toggleRoutine, logMealNow} = await import('./planner/today-day.mjs');
const {doneAll} = await import('./body-state.mjs');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const rowsOf = node => (node.classList?.contains('step-row') ? [node] : [...(node.children ?? [])].flatMap(rowsOf));

/** A planner whose commit, like app.commit, changes the data only once the phone's save lands; each save is held. */
function heldApp() {
  const data = {version: 1, entries: []};
  editPlan(data, {type: 'saveRoutine', routine: {name: 'Morning', start: '06:00', end: '07:00', days: [0, 1, 2, 3, 4, 5, 6],
    steps: [{title: 'A'}, {title: 'B'}, {title: 'C'}]}});
  const pending = [];
  const div = () => document.createElement('div');
  const planner = div(), sheet = div(), snackbar = div();
  sheet.hidden = true;
  snackbar.hidden = true;
  planner.append(sheet, snackbar);
  const app = {
    saving: false, data: () => data, state: {}, render() {}, sheetRefresh: null, sheet: {epoch: 0},
    dom: {planner, sheet, snackbar}, api: {native: async () => {}, wide: () => true},
    commit(op) {
      app.saving = true;
      return new Promise(resolve => pending.push(() => { editPlan(data, op); app.saving = false; resolve(); }));
    },
  };
  return {app, pending};
}

test('a step ticked while an earlier tick is saving stays ticked, on screen and in the store', async () => {
  const {app, pending} = heldApp();
  const body = bodyApi(app);
  const routine = body.routines()[0];
  openRunSheet(app, body, routine.id);
  const rows = rowsOf(app.dom.sheet);
  const checked = () => rows.map(row => row.querySelector('.task-check').getAttribute('aria-checked'));
  const tick = i => rows[i].querySelector('.task-check').click();
  tick(0);
  await wait(5);
  tick(1);
  await wait(5);
  pending.shift()();
  await wait(10);
  assert.deepEqual(checked(), ['true', 'true', 'false'], 'B stays ticked once A has saved');
  tick(2);
  await wait(60);
  while (pending.length) { pending.shift()(); await wait(60); }
  const run = body.runFor(routine.id);
  const marks = Object.fromEntries(routine.steps.map(step => [step.title, run.marks[step.id]?.state ?? null]));
  assert.deepEqual(marks, {A: 'done', B: 'done', C: 'done'});
  assert.deepEqual(checked(), ['true', 'true', 'true']);
});

test('a tick whose save fails while a later tick is queued keeps both ticks, since the queued save carries them', async () => {
  const {app, pending} = heldApp();
  let fail = true;
  const commit = app.commit;
  app.commit = op => (fail ? (fail = false, Promise.reject(new Error('offline'))) : commit(op));
  const body = bodyApi(app);
  const routine = body.routines()[0];
  openRunSheet(app, body, routine.id);
  const rows = rowsOf(app.dom.sheet);
  rows[0].querySelector('.task-check').click();
  rows[1].querySelector('.task-check').click();
  await wait(20);
  while (pending.length) { pending.shift()(); await wait(30); }
  const run = body.runFor(routine.id);
  assert.deepEqual(routine.steps.map(step => run.marks[step.id]?.state ?? null), ['done', 'done', null],
    'the queued save carries both ticks');
  assert.deepEqual(rows.map(row => row.querySelector('.task-check').getAttribute('aria-checked')), ['true', 'true', 'false']);
});

test('a Routine ring on Today tapped twice before the save lands keeps one change, and Undo brings the run back', async () => {
  for (const startDone of [true, false]) {
    const {app, pending} = heldApp();
    const body = bodyApi(app);
    const routine = body.routines()[0];
    const day = '2026-10-19';
    app.state.day = day;
    if (startDone) editPlan(app.data(), {type: 'saveRoutineRun', run: {...doneAll(routine, null, new Date()), day}});
    const before = structuredClone(body.runFor(routine.id, day)?.marks ?? {});
    const row = {routine: {id: routine.id}, done: startDone};
    const first = toggleRoutine(app, body, row);
    await wait(5);
    const second = toggleRoutine(app, body, row);
    await wait(60);
    while (pending.length) { pending.shift()(); await wait(60); }
    await Promise.all([first, second]);
    assert.notDeepEqual(body.runFor(routine.id, day)?.marks ?? {}, before, 'the tap changed the run');
    editPlan(app.data(), {type: 'undo'});
    assert.deepEqual(body.runFor(routine.id, day)?.marks ?? {}, before, `Undo restores the run (started ${startDone ? 'done' : 'open'})`);
  }
});

/** Earlier Poha at breakfast and Dal rice at lunch, so each meal row on Today has a usual food to log on a swipe. */
function heldMealApp() {
  const held = heldApp();
  editPlan(held.app.data(), {type: 'saveMeal', meal: {name: 'Poha', slot: 'breakfast', at: '2026-10-18T08:30:00'}});
  editPlan(held.app.data(), {type: 'saveMeal', meal: {name: 'Dal rice', slot: 'lunch', at: '2026-10-18T13:00:00'}});
  return held;
}
const mealRow = slot => ({slot, label: slot === 'breakfast' ? 'Breakfast' : 'Lunch'});
const loggedNow = body => body.meals().filter(m => m.at >= '2026-10-19').map(m => `${m.slot}:${m.name}`);

test('a meal row on Today swiped twice before the save lands logs the meal once', async () => {
  const {app, pending} = heldMealApp();
  const body = bodyApi(app);
  const first = logMealNow(app, body, mealRow('breakfast'));
  await wait(5);
  const second = logMealNow(app, body, mealRow('breakfast'));
  await wait(60);
  while (pending.length) { pending.shift()(); await wait(60); }
  assert.deepEqual(await Promise.all([first, second]), [true, undefined]);
  assert.deepEqual(loggedNow(body), ['breakfast:Poha']);
});

test('a second meal row on Today swiped while the first meal is saving is logged too', async () => {
  const {app, pending} = heldMealApp();
  const body = bodyApi(app);
  const breakfast = logMealNow(app, body, mealRow('breakfast'));
  await wait(20);
  const lunch = logMealNow(app, body, mealRow('lunch'));
  await wait(60);
  while (pending.length) { pending.shift()(); await wait(60); }
  assert.deepEqual(await Promise.all([breakfast, lunch]), [true, true]);
  assert.deepEqual(loggedNow(body).sort(), ['breakfast:Poha', 'lunch:Dal rice']);
});
