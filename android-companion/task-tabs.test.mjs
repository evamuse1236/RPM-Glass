import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan, tasks} from './planner-state.mjs';
import {occurrences, repeats} from './planner-recurrence.mjs';
import {TIME_GRID, whenFields, repeatDaysOf, repeatFieldsFor, repeatLabel, repeatShort} from './planner/task-values.mjs';
import {TABS, stepTab, whenShort, alertShort, blockShort, lengthChoices, presetOf, presetFields, toggleRepeatDay, blockChoices}
  from './planner/task-tabs-model.mjs';
import fs from 'node:fs';
import {HALF_HOUR_PX, rulerScale, offsetOf, stopAt, busySpans} from './planner/time-ruler.mjs';

const DAY = '2026-10-20';
const at = (day, time) => new Date(`${day}T${time}`).toISOString();
const store = () => {
  const d = freshStore();
  const block = editPlan(d, {type: 'saveEntity', collection: 'blocks', fields: {title: 'RM critical review drafted', purpose: 'A calm Sunday'}});
  const id = editPlan(d, {type: 'saveTask', fields: {title: 'Group call: merge sections', planned: at(DAY, '16:00'), minutes: 45, blockId: block}});
  return {d, id, block, task: () => tasks(d).find(t => t.id === id)};
};
const saveThenUndo = (fields, read) => {
  const {d, id, task} = store();
  const before = read(task());
  editPlan(d, {type: 'saveTask', id, fields});
  const after = read(task());
  editPlan(d, {type: 'undo'});
  return {before, after, undone: read(task())};
};

test('the four tabs are When, Alert, Repeat and Block, When first; arrows wrap round them', () => {
  assert.deepEqual(TABS.map(([key]) => key), ['when', 'alert', 'repeat', 'block']);
  assert.equal(stepTab('when', 1), 'alert');
  assert.equal(stepTab('block', 1), 'when');
  assert.equal(stepTab('when', -1), 'block');
});

test('each tab shows its value in a few words', () => {
  assert.equal(whenShort({day: DAY, time: '16:00'}, DAY), '4 PM');
  assert.equal(whenShort({day: '2026-10-22', time: '09:30'}, DAY), 'Thu 9:30 AM');
  assert.equal(whenShort({day: '2026-10-21', time: ''}, DAY), 'Tomorrow');
  assert.equal(whenShort({day: '', time: ''}, DAY), 'No date');
  assert.deepEqual(alertShort({alert: 'off', lead: 10}), {text: 'Off', symbol: 'notifications_off'});
  assert.deepEqual(alertShort({alert: 'reminder', lead: 10}), {text: '10 min', symbol: 'notifications'});
  assert.equal(alertShort({alert: 'alarm', lead: 0}).text, 'On time');
  assert.equal(repeatShort({recurrence: null}), 'Once');
  assert.equal(repeatShort({recurrence: 'daily'}), 'Every day');
  assert.equal(repeatShort({recurrence: 'days', repeatDays: [5, 1, 3]}), 'Mo We Fr');
  assert.equal(repeatShort({repeatAfterDays: 3}), 'After 3 days');
  assert.equal(blockShort('RM critical review drafted'), 'RM');
  assert.equal(blockShort(null), 'Inbox');
});

test('the ruler snaps every half hour from 6:00 AM to 11:00 PM and keeps an off-grid time as its own stop', () => {
  const grid = rulerScale('16:00');
  assert.deepEqual(grid.stops, TIME_GRID);
  assert.equal(offsetOf(grid, '06:30') - offsetOf(grid, '06:00'), HALF_HOUR_PX);
  assert.equal(stopAt(grid, offsetOf(grid, '14:30') + 7), '14:30', 'a let-go just past a stop settles on it');
  assert.equal(stopAt(grid, offsetOf(grid, '14:30') + HALF_HOUR_PX * 0.6), '15:00');
  const own = rulerScale('10:17');
  assert.equal(own.stops.length, TIME_GRID.length + 1);
  assert.equal(own.stops[own.stops.indexOf('10:00') + 1], '10:17');
  assert.equal(stopAt(own, offsetOf(own, '10:17')), '10:17');
  assert.equal(stopAt(own, offsetOf(own, '10:30')), '10:30');
  const early = rulerScale('05:15');
  assert.equal(early.stops[0], '05:15');
  assert.equal(stopAt(early, 0), '05:15', 'the ruler reaches back to a time before 6:00 AM');
  assert.equal(rulerScale('23:40').stops.at(-1), '23:40');
  assert.equal(rulerScale('', new Date(`${DAY}T13:10`)).centre, '13:30', 'with no time the ruler opens on the next half hour');
});

test('busy marks are the day\'s other tasks and events, merged and cut to the day', () => {
  const spans = busySpans([{start: Date.parse(at(DAY, '10:00')), end: Date.parse(at(DAY, '11:00'))},
    {start: Date.parse(at(DAY, '10:30')), end: Date.parse(at(DAY, '11:30'))},
    {start: Date.parse(at('2026-10-19', '23:00')), end: Date.parse(at(DAY, '01:00'))}], DAY);
  assert.deepEqual(spans, [[0, 60], [600, 690]]);
});

test('a day, a slid time and a length each save and Undo puts them back', () => {
  const day = saveThenUndo(whenFields({day: '2026-10-21', time: '16:00'}), t => t.planned);
  assert.equal(day.after, at('2026-10-21', '16:00'));
  assert.equal(day.undone, day.before);
  const time = saveThenUndo(whenFields({day: DAY, time: stopAt(rulerScale('16:00'), offsetOf(rulerScale('16:00'), '09:00') + 3)}), t => t.planned);
  assert.equal(time.after, at(DAY, '09:00'));
  assert.equal(time.undone, time.before);
  const length = saveThenUndo({minutes: 90}, t => t.minutes);
  assert.deepEqual([length.before, length.after, length.undone], [45, 90, 45]);
  assert.deepEqual(lengthChoices(50), [15, 30, 45, 50, 60, 90, 120]);
});

test('an alert and its lead save, Undo puts back the one before, and a new type keeps the lead', () => {
  const {d, id, task} = store();
  editPlan(d, {type: 'saveTask', id, fields: {alert: 'reminder'}});
  editPlan(d, {type: 'saveTask', id, fields: {alertLead: 10}});
  assert.deepEqual(task().alertIntent, {type: 'reminder', lead: 10});
  editPlan(d, {type: 'saveTask', id, fields: {alert: 'alarm'}});
  assert.deepEqual(task().alertIntent, {type: 'alarm', lead: 10});
  editPlan(d, {type: 'undo'});
  assert.deepEqual(task().alertIntent, {type: 'reminder', lead: 10});
  assert.throws(() => editPlan(d, {type: 'saveTask', id, fields: {alertLead: -5}}), /valid number/);
});

test('repeat circles save chosen days in the plainest pattern, with Undo', () => {
  const {d, id, task} = store();
  editPlan(d, {type: 'saveTask', id, fields: toggleRepeatDay(task(), 2)});
  assert.equal(task().recurrence, 'weekly', 'the task\'s own weekday alone is weekly');
  editPlan(d, {type: 'saveTask', id, fields: toggleRepeatDay(task(), 4)});
  assert.deepEqual([task().recurrence, task().repeatDays], ['days', [2, 4]]);
  assert.equal(repeatLabel(task()), 'Every Tue, Thu');
  editPlan(d, {type: 'undo'});
  assert.equal(task().recurrence, 'weekly');
  assert.equal('repeatDays' in task(), false);
  for (const weekday of [1, 3, 4, 5]) editPlan(d, {type: 'saveTask', id, fields: toggleRepeatDay(task(), weekday)});
  assert.equal(task().recurrence, 'weekdays');
  assert.equal(presetOf(task()), 'weekdays');
  editPlan(d, {type: 'saveTask', id, fields: presetFields('once', task())});
  assert.equal(repeats(task()), false);
  editPlan(d, {type: 'saveTask', id, fields: presetFields('after', task(), 3)});
  assert.deepEqual([task().recurrence, task().repeatAfterDays, presetOf(task())], [null, 3, 'after']);
  assert.deepEqual(repeatFieldsFor([0, 1, 2, 3, 4, 5, 6], null).recurrence, 'daily');
  assert.deepEqual(repeatDaysOf({recurrence: 'weekly', planned: at(DAY, '16:00')}), [2]);
});

test('a chosen-days repeat lands only on those days, and needs at least one', () => {
  const {d, id, task} = store();
  editPlan(d, {type: 'saveTask', id, fields: {recurrence: 'days', repeatDays: [5, 1]}});
  assert.deepEqual(task().repeatDays, [1, 5]);
  const week = occurrences(task(), Date.parse(at(DAY, '00:00')), Date.parse(at('2026-10-27', '23:00')));
  assert.deepEqual(week.map(o => new Date(o.start).getDay()), [5, 1]);
  assert.throws(() => editPlan(d, {type: 'saveTask', id, fields: {repeatDays: []}}), /days it repeats on/);
  assert.throws(() => editPlan(d, {type: 'saveTask', id, fields: {repeatDays: [7]}}), /valid days/);
});

test('the Block list keeps the planner\'s order with done of total and Purpose, the Inbox last, and moving undoes', () => {
  const blocks = [{id: 'b2', title: 'Kalsubai trek', purpose: 'Summit before sunrise'}, {id: 'b1', title: 'Group project'},
    {id: 'b3', title: 'Old', archived: true}];
  const status = {b1: {done: 1, total: 4}, b2: {done: 0, total: 0}};
  const rows = blockChoices(blocks, id => status[id]);
  assert.deepEqual(rows.map(r => r.id), ['b2', 'b1', null]);
  assert.deepEqual(rows.map(r => r.line), ['Summit before sunrise · No tasks yet', '1 of 4 done', 'No Block']);
  assert.deepEqual(blockChoices(blocks, id => status[id], 'group').map(r => r.id), ['b1']);
  const {d, id, block, task} = store();
  editPlan(d, {type: 'moveTask', id, blockId: null});
  assert.equal(task().blockId, null);
  editPlan(d, {type: 'undo'});
  assert.equal(task().blockId, block);
});

test('every chip row in the task tabs wraps, so no chip hides past the right edge', () => {
  const source = fs.readFileSync(new URL('./planner/task-tabs.mjs', import.meta.url), 'utf8');
  const calls = [...source.matchAll(/\b(chipRow|wrapRow)\(/g)].map(m => m[1]);
  assert.deepEqual(calls.filter(name => name === 'chipRow'), ['chipRow'], 'only wrapRow itself calls chipRow');
  assert.ok(calls.filter(name => name === 'wrapRow').length >= 4);
});
