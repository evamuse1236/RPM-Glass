import test from 'node:test';
import assert from 'node:assert/strict';
import {soonText, buildSpine, cardHeight, gapHeight, anytimeLabel} from './spine-model.mjs';
import {mealSlots, spanText, gutterTime} from './day-parts.mjs';

const DAY = '2026-10-19';
const at = time => +new Date(`${DAY}T${time}`);
const task = (id, time, minutes, extra = {}) => ({id, title: id, start: time ? at(time) : null, minutes, result: 'Pass the DAD exam',
  tone: 'area-3', ...extra});
const event = (id, from, to) => ({id, title: id, start: at(from), end: at(to)});
const spine = (extra = {}) => buildSpine({day: DAY, now: at('14:45'), ...extra});
const kinds = model => model.rows.map(r => `${r.kind}@${gutterTime(r.start)}`);
const plain = text => text.replace(/\s/g, ' ');

test('pill heights follow length on the 4dp grid, from 40 to 160; free time grows from 28 to 56', () => {
  assert.deepEqual([0, 15, 30, 45, 60, 90, 120, 240].map(cardHeight), [40, 40, 40, 40, 44, 64, 88, 160]);
  assert.deepEqual([10, 45, 60, 90, 210, 600].map(gapHeight), [28, 32, 32, 36, 44, 56]);
});

test('the day reads in time order, with free time of 10 min or more between fixed things, cut at meals and now', () => {
  const model = spine({tasks: [task('Past paper', '16:00', 60), task('Review notes', '18:30', 45)],
    events: [event('Ward round', '14:00', '15:00')], meals: []});
  assert.deepEqual(kinds(model), ['gap@8 AM', 'meal@8:30 AM', 'gap@8:30 AM', 'meal@1 PM', 'gap@1 PM', 'event@2 PM', 'gap@3 PM',
    'task@4 PM', 'gap@5 PM', 'task@6:30 PM', 'gap@7:15 PM', 'meal@8 PM', 'gap@8 PM']);
  const free = model.rows.find(r => r.key === 'gap:to:' + at('16:00'));
  assert.equal(plain(free.label), '1 h free');
  assert.equal(free.plan, at('15:00'));
  assert.equal(free.height, 32);
  assert.equal(model.rows.find(r => r.key === 'gap:to:' + at('20:00')).plan, null, '45 min free offers no +');
});

test('each row says when above its title; the gutter adds the end from 45 min on', () => {
  const model = spine({now: at('12:00'), tasks: [task('Lab', '14:00', 60), task('Read', '15:30', 30), task('Done one', '09:00', 30, {done: true})]});
  const row = id => model.rows.find(r => r.key === 'task:' + id);
  assert.deepEqual(row('Lab').when, {kind: 'soon', text: 'in 2 h'});
  assert.deepEqual(row('Read').when, {kind: 'time', text: '3:30 PM to 4 PM'});
  assert.deepEqual([row('Lab').gutter.time, row('Lab').gutter.end], ['2 PM', '3 PM']);
  assert.equal(row('Read').gutter.end, null);
  assert.equal(row('Lab').symbol, 'school');
  assert.equal(row('Lab').tone, 'area-3');
});

test('now inside an item makes it the current row: its when line counts down, no separate line', () => {
  const model = spine({events: [event('Ward round', '14:00', '15:00')]});
  const hero = model.rows.find(r => r.kind === 'event');
  assert.equal(hero.current, true);
  assert.equal(plain(hero.when.text), 'Now · 15 min left');
  assert.equal(model.nowKey, hero.key);
  assert.equal(model.rows.some(r => r.kind === 'now'), false);
});

test('now between items is a line; the gap around it splits, only the future part offers +', () => {
  const model = spine({now: at('11:00'), tasks: [task('Study', '09:00', 60), task('Lab', '14:00', 60)]});
  const keys = model.rows.map(r => r.kind);
  const nowAt = keys.indexOf('now');
  assert.equal(model.nowKey, 'now');
  const before = model.rows[nowAt - 1], after = model.rows[nowAt + 1];
  assert.equal(before.kind, 'gap');
  assert.equal(plain(before.label), '1 h free');
  assert.equal(before.plan, null);
  assert.equal(after.kind, 'gap');
  assert.equal(plain(after.label), '2 h free');
  assert.equal(after.plan, at('11:00'));
  assert.equal(model.rows.find(r => r.key.startsWith('task:Lab')).next, true);
});

test('a task over an event says Clash in its line; a clash wins over Not done; the event stays plain', () => {
  const model = spine({now: at('12:00'), tasks: [task('Revise', '09:30', 30), task('Call bank', '10:30', 15), task('Read', '13:00', 30)],
    events: [event('Reading group', '09:00', '10:00')]});
  const line = id => model.rows.find(r => r.key === 'task:' + id).line;
  assert.deepEqual(line('Revise').text, 'Clash with Reading group');
  assert.equal(line('Call bank').kind, 'late');
  assert.deepEqual(line('Read'), {kind: 'result', text: 'Pass the DAD exam', tone: 'area-3'});
  assert.equal(model.rows.find(r => r.kind === 'event').line, null);
});

test('a durationless task is a visible moment without a clash, duration label or occupied free time', () => {
  const moment = task('Reminder', '09:30', null), events = [event('Meeting', '09:00', '10:00')];
  const model = spine({now: at('08:00'), tasks: [moment], events});
  const row = model.rows.find(r => r.key === 'task:Reminder');
  assert.equal(row.start, row.end);
  assert.equal(row.minutes, 0);
  assert.equal(row.gutter.length, null);
  assert.equal(row.line.kind, 'result');
  const free = m => m.rows.filter(r => r.kind === 'gap').map(r => [r.start, r.end]);
  assert.deepEqual(free(model), free(spine({now: at('08:00'), events})));
  const span = spine({now: at('08:00'), tasks: [task('Read', '09:30', 30)], events});
  assert.equal(span.rows.find(r => r.key === 'task:Read').line.kind, 'clash');
});

test('routines show their count; meals say what was eaten or Not logged; water is not on the timeline', () => {
  const model = spine({routines: [{id: 'm', name: 'Morning routine', start: '07:00', end: '07:30', state: 'partly',
    progress: {done: 3, total: 5, skipped: 1}}], tasks: [task('Loose', null, 30)],
  meals: [{slot: 'lunch', name: 'Dal rice', at: new Date(at('13:10')).toISOString()}]});
  const routine = model.rows.find(r => r.kind === 'routine');
  assert.equal(routine.line.text, '3 of 5 · 1 skipped');
  assert.equal(routine.gutter.time, '7 AM');
  assert.equal(plain(routine.gutter.length), '30 min');
  assert.equal(routine.symbol, 'wb_sunny');
  assert.equal(model.rows.some(r => r.kind === 'water'), false);
  const lunch = model.rows.find(r => r.key === 'meal:lunch'), dinner = model.rows.find(r => r.key === 'meal:dinner');
  assert.deepEqual([lunch.title, lunch.line.text, lunch.done], ['Lunch', 'Dal rice', true]);
  assert.deepEqual([dinner.title, dinner.line.kind, dinner.line.text, dinner.done], ['Dinner', 'unlogged', 'Not logged', false]);
});

test('tasks for the day without a time are the anytime chips, open ones first, never timeline rows', () => {
  const model = spine({tasks: [task('Other', null, 30, {done: true}), task('Loose', null, 30), task('Read', '09:30', 30)]});
  assert.deepEqual(model.anytime.map(t => [t.title, t.done]), [['Loose', false], ['Other', true]]);
  assert.equal(anytimeLabel(model.anytime, true), '1 task anytime today');
  assert.equal(model.rows.filter(r => r.kind === 'task').length, 1, 'the timed task keeps its own row');
  assert.deepEqual(spine({tasks: [task('Read', '09:30', 30)]}).anytime, []);
});

test('another day has no now and no meal placeholders', () => {
  const model = spine({live: false, now: at('09:00') - 864e5, tasks: [task('Lab', '14:00', 60)]});
  assert.equal(model.nowKey, null);
  assert.deepEqual(model.rows.filter(r => r.kind !== 'gap').map(r => r.kind), ['task']);
  assert.ok(model.rows.filter(r => r.kind === 'gap' && r.minutes >= 60).every(r => r.plan != null));
});

test('words read as Calendar writes them', () => {
  assert.equal(spanText(at('15:00'), at('16:30')), '3:00 – 4:30 PM');
  assert.equal(gutterTime(at('12:45')), '12:45 PM');
  assert.equal(gutterTime(at('14:00')), '2 PM');
  const slots = mealSlots([{slot: 'breakfast', name: 'Poha', at: new Date(at('09:05')).toISOString()}], DAY, at('13:10'));
  assert.deepEqual(slots.map(s => [s.slot, s.label]), [['breakfast', 'Breakfast · Poha'], ['lunch', 'Lunch · Not logged'],
    ['dinner', 'Dinner · Not logged']]);
});

test('only the next item says how soon it starts', () => {
  const model = spine({tasks: [task('Read', '15:25', 30), task('Write', '17:00', 30)]});
  const soon = model.rows.filter(r => r.soon).map(r => [r.key, plain(r.soon)]);
  assert.deepEqual(soon, [['task:Read', 'in 40 min']]);
  assert.deepEqual([1, 59, 60, 89, 91, 235].map(m => soonText(m * 60000)), ['in 1 min', 'in 59 min', 'in 1 h', 'in 1 h', 'in 2 h', 'in 4 h']);
});
