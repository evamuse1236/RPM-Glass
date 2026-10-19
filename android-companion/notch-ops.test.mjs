import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan} from './planner-state.mjs';
import {runNotchRequest, notchCompletion, completionOp} from './notch-ops.mjs';

const at = local => new Date(`2026-10-19T${local}:00`);
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

function store() {
  const d = freshStore();
  const once = editPlan(d, {type: 'saveTask', fields: {title: 'Call the bank', planned: at('16:00').toISOString(), minutes: 15, alert: 'reminder'}}, at('09:00'));
  const weekly = editPlan(d, {type: 'saveTask', fields: {title: 'Weekly review', planned: at('15:30').toISOString(), minutes: 45, recurrence: 'weekly'}}, at('09:00'));
  return {d, once, weekly};
}

const entry = (d, id) => d.entries.find(e => e.id === id);

test('Glass from the notch logs one glass with the planner op, says the saved count, and its Undo takes it back', () => {
  const {d} = store();
  const result = runNotchRequest(d, {action: 'drink'}, at('10:00'));
  assert.deepEqual([result.kind, result.count, result.goal], ['water', 1, 8]);
  assert.equal(d.planner.body.water.glasses.length, 1);
  assert.equal(result.token, d.planner.events.at(-1).id);
  assert.deepEqual(runNotchRequest(d, {action: 'undo', token: result.token}, at('10:00')), {kind: 'undo'});
  assert.equal(d.planner.body?.water.glasses.length ?? 0, 0);
});

test('Undo from the notch refuses once anything else changed the plan, so it never takes back the wrong change', () => {
  const {d, once} = store();
  const {token} = runNotchRequest(d, {action: 'drink'}, at('10:00'));
  editPlan(d, {type: 'saveTask', id: once, fields: {title: 'Call the bank today'}}, at('10:01'));
  assert.throws(() => runNotchRequest(d, {action: 'undo', token}, at('10:02')), /changed again in the plan/);
  assert.equal(d.planner.body.water.glasses.length, 1);
  assert.throws(() => runNotchRequest(d, {action: 'undo'}, at('10:02')), /changed again/);
});

test('Done from the notch ticks a one-off task, and a repeating task only at the occurrence the island showed', () => {
  const {d, once, weekly} = store();
  const result = runNotchRequest(d, {action: 'done', id: once, start: +at('16:00')}, at('16:05'));
  assert.deepEqual([result.kind, result.title, result.repeats], ['done', 'Call the bank', false]);
  assert.equal(entry(d, once).done, true);
  assert.throws(() => runNotchRequest(d, {action: 'done', id: once, start: +at('16:00')}, at('16:06')), /Already done or changed/);

  runNotchRequest(d, {action: 'done', id: weekly, start: +at('15:30')}, at('15:40'));
  const w = entry(d, weekly);
  assert.equal(w.done, false);
  assert.deepEqual(w.completedOccurrences, [at('15:30').toISOString()]);
  assert.throws(() => runNotchRequest(d, {action: 'done', id: weekly, start: +at('15:31')}, at('15:41')), /Already done or changed/);
  runNotchRequest(d, {action: 'undo', token: d.planner.events.at(-1).id}, at('15:42'));
  assert.deepEqual(entry(d, weekly).completedOccurrences, []);
});

test('Done on an alert that fired late after a snooze still ticks the occurrence it was for', () => {
  const {d, weekly} = store();
  const late = +at('15:40');
  assert.equal(notchCompletion(d, {id: weekly, start: late}), null);
  assert.equal(notchCompletion(d, {id: weekly, start: late, near: true}).occurrence, at('15:30').toISOString());
  runNotchRequest(d, {action: 'done', id: weekly, start: late, near: true}, at('15:41'));
  assert.deepEqual(entry(d, weekly).completedOccurrences, [at('15:30').toISOString()]);
});

test('an alert changes from the notch with the planner op; Undo restores the type it had', () => {
  const {d, once} = store();
  const result = runNotchRequest(d, {action: 'alert', id: once, type: 'alarm'}, at('10:00'));
  assert.deepEqual([result.kind, result.type, result.title], ['alert', 'alarm', 'Call the bank']);
  assert.equal(entry(d, once).alertIntent.type, 'alarm');
  runNotchRequest(d, {action: 'alert', id: once, type: 'off'}, at('10:01'));
  assert.equal(entry(d, once).alertIntent.type, 'off');
  runNotchRequest(d, {action: 'undo', token: d.planner.events.at(-1).id}, at('10:02'));
  assert.equal(entry(d, once).alertIntent.type, 'alarm');
  assert.throws(() => runNotchRequest(d, {action: 'alert', id: once, type: 'loud'}, at('10:03')), /Choose Reminder/);
  assert.throws(() => runNotchRequest(d, {action: 'open'}, at('10:03')), /cannot do/);
});

test('the planner and the notch build completions from one place: Done in a list reopens a done task', () => {
  const {d, once} = store();
  assert.deepEqual(completionOp(entry(d, once)), {type: 'saveTask', id: once, fields: {done: true}, occurrence: at('16:00').toISOString()});
  assert.deepEqual(completionOp({...entry(d, once), done: true}, 'x'), {type: 'reopenTask', id: once, occurrence: 'x'});
  assert.match(read('planner/task-row.mjs'), /const op = completionOp\(task, when\);/);
  assert.doesNotMatch(read('planner/deep-links.mjs'), /complete|drink/, 'the notch no longer opens the planner to tick or drink');
  assert.match(read('planner/body-api.mjs'), /drink: \(\) => save\(drinkOp\(\)\)/);
});

const java = name => fs.readFileSync(new URL(`../app/src/main/java/com/rpm/prototype/${name}.java`, import.meta.url), 'utf8');

/** Each method in the source that calls into the planner, by the name of the method it sits in. */
function plannerCallers(source) {
  const callers = [];
  let method = '';
  for (const line of source.split('\n')) {
    const head = line.match(/^\s+(?:@Override\s+)?(?:public |private |static |final )*(?:void|boolean|[A-Z]\w*) (\w+)\(.*\{\s*$/);
    if (head) method = head[1];
    if (/NotchActions\.(openTask|logMeal)\(|startActivity\(/.test(line)) callers.push(method);
  }
  return callers;
}

test('only Log meal, Open, Open plan and the long press open the planner; Glass, Done, alert changes and Undo save in place', () => {
  assert.deepEqual(plannerCallers(java('NotchController')).sort(), ['logMeal', 'openHero', 'openManaged', 'openPlan']);
  assert.deepEqual(plannerCallers(java('NotchAlerting')), ['openTask']);
  assert.deepEqual(plannerCallers(java('NotchChanges')), []);
  assert.deepEqual(plannerCallers(java('NotchRunner')), []);
  const planner = java('NotchActions').match(/static void (\w+)\(Context c[^)]*\) \{[^]*?\n {4}\}/g).filter(m => /planner\(c,/.test(m));
  assert.deepEqual(planner.map(m => m.match(/static void (\w+)/)[1]), ['logMeal', 'openTask']);
});
