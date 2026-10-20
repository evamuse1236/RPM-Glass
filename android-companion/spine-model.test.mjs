import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSpine, cardHeight, gapHeight} from './spine-model.mjs';
import {mealSlots, spanText, gutterTime} from './day-parts.mjs';
import {WATER_DEFAULTS} from './body-state.mjs';

const DAY = '2026-10-19';
const at = time => +new Date(`${DAY}T${time}`);
const water = (extra = {}) => ({settings: WATER_DEFAULTS, glasses: [],
  status: {count: 5, goal: 8, nextAt: new Date(at('17:15')), reached: false, lastAt: new Date(at('15:45'))}, ...extra});
const task = (id, time, minutes, extra = {}) => ({id, title: id, start: time ? at(time) : null, minutes, result: 'Pass the DAD exam',
  tone: 'area-3', ...extra});
const event = (id, from, to) => ({id, title: id, start: at(from), end: at(to)});
const spine = (extra = {}) => buildSpine({day: DAY, now: at('14:45'), water: water(), ...extra});
const kinds = model => model.rows.map(r => `${r.kind}@${gutterTime(r.start)}`);

test('heights follow length, tamed: 15 and 30 min match, an hour is bigger, nothing passes 160', () => {
  assert.deepEqual([15, 30, 45, 60, 90, 120, 240].map(cardHeight), [56, 56, 56, 80, 104, 128, 160]);
  assert.deepEqual([45, 60, 90, 600].map(gapHeight), [40, 48, 56, 96]);
});

test('the day reads in time order, with free time of 45 min or more between fixed things, cut at meals and now', () => {
  const model = spine({tasks: [task('Past paper', '16:00', 60), task('Review notes', '18:30', 45)],
    events: [event('Ward round', '14:00', '15:00')], meals: []});
  assert.deepEqual(kinds(model), ['meal@8:30 AM', 'gap@8:30 AM', 'meal@1 PM', 'gap@1 PM', 'event@2 PM', 'gap@3 PM', 'task@4 PM',
    'water@5:15 PM', 'gap@5:15 PM', 'task@6:30 PM', 'gap@7:15 PM', 'meal@8 PM', 'gap@8 PM']);
  assert.equal(model.rows[1].ticks.length, 4, 'a morning free from 8:30 to 1 has ticks at 9, 10, 11 and 12');
  const free = model.rows.find(r => r.key === 'gap:to:' + at('16:00'));
  assert.equal(free.label, '1 h free');
  assert.equal(free.plan, at('15:00'));
  assert.deepEqual(free.ticks, []);
});

test('now inside an item makes it the hero: tint, elapsed bar, no separate line', () => {
  const model = spine({events: [event('Ward round', '14:00', '15:00')]});
  const hero = model.rows.find(r => r.kind === 'event');
  assert.equal(hero.current, true);
  assert.equal(hero.line.text, 'Now · until 3:00 PM');
  assert.deepEqual(hero.elapsed, {fraction: 0.75, in: '45 min in', left: '15 min left'});
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
  assert.equal(before.label, '1 h free');
  assert.equal(before.plan, null);
  assert.equal(after.kind, 'gap');
  assert.equal(after.label, '2 h free');
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
test('a durationless task is a visible moment without a clash, duration label or occupied free time',()=>{
 const moment=task('Reminder','09:30',null),events=[event('Meeting','09:00','10:00')];
 const model=spine({now:at('08:00'),water:null,tasks:[moment],events});
 const row=model.rows.find(r=>r.key==='task:Reminder');
 assert.equal(row.start,row.end);assert.equal(row.minutes,0);assert.equal(row.gutter.length,null);assert.equal(row.line.kind,'result');
 const free=m=>m.rows.filter(r=>r.kind==='gap').map(r=>[r.start,r.end]);
 assert.deepEqual(free(model),free(spine({now:at('08:00'),water:null,events})));
 const span=spine({now:at('08:00'),water:null,tasks:[task('Read','09:30',30)],events});
 assert.equal(span.rows.find(r=>r.key==='task:Read').line.kind,'clash');
});

test('routines show their count and bar; water and meals are small rows', () => {
  const model = spine({routines: [{id: 'm', name: 'Morning routine', start: '07:00', end: '07:30', state: 'partly',
    progress: {done: 3, total: 5, skipped: 1}}], tasks: [task('Loose', null, 30), task('Other', null, 30, {done: true})],
  meals: [{slot: 'lunch', name: 'Dal rice', at: new Date(at('13:10')).toISOString()}]});
  const routine = model.rows.find(r => r.kind === 'routine');
  assert.equal(routine.line.text, '3 of 5 · 1 skipped');
  assert.equal(routine.gutter.time, '7 AM');
  assert.equal(routine.gutter.length, '30 min');
  assert.equal(model.rows.find(r => r.kind === 'water').label, 'Water · 5 of 8');
  assert.equal(model.rows.find(r => r.key === 'meal:lunch').label, 'Lunch · Dal rice');
  assert.equal(model.rows.find(r => r.key === 'meal:dinner').label, 'Dinner · Not logged');
});

test('tasks for the day without a time are one Anytime group right after now, done ones included', () => {
  const model = spine({tasks: [task('Loose', null, 30), task('Other', null, 30, {done: true}), task('Read', '09:30', 30)]});
  const nowAt = model.rows.findIndex(r => r.key === model.nowKey);
  const anytime = model.rows[nowAt + 1];
  assert.equal(anytime.kind, 'anytime');
  assert.equal(anytime.time, 'Anytime');
  assert.equal(anytime.label, '1 task for today, no time set');
  assert.deepEqual(anytime.tasks.map(t => [t.title, t.done, t.gutter.length.replace(/\s/g, ' ')]), [['Loose', false, '30 min'], ['Other', true, '30 min']]);
  assert.equal(anytime.tasks[0].line.text, 'Pass the DAD exam');
  assert.equal(model.rows.filter(r => r.kind === 'task').length, 1, 'the timed task keeps its own card');
});

test('another day puts its Anytime group first; a day with none has no group', () => {
  const other = spine({live: false, now: at('09:00') - 864e5, tasks: [task('Lab', '14:00', 60), task('Loose', null, null)]});
  assert.equal(other.rows[0].kind, 'anytime');
  assert.equal(other.rows[0].label, '1 task for this day, no time set');
  assert.equal(spine({tasks: [task('Read', '09:30', 30)]}).rows.some(r => r.kind === 'anytime'), false);
});

test('another day has no now, no water and no meal placeholders', () => {
  const model = spine({live: false, now: at('09:00') - 864e5, tasks: [task('Lab', '14:00', 60)]});
  assert.equal(model.nowKey, null);
  assert.deepEqual(model.rows.filter(r => r.kind !== 'gap').map(r => r.kind), ['task']);
  assert.ok(model.rows.filter(r => r.kind === 'gap').every(r => r.plan != null));
});

test('words read as Calendar writes them', () => {
  assert.equal(spanText(at('15:00'), at('16:30')), '3:00 – 4:30 PM');
  assert.equal(gutterTime(at('12:45')), '12:45 PM');
  assert.equal(gutterTime(at('14:00')), '2 PM');
  const slots = mealSlots([{slot: 'breakfast', name: 'Poha', at: new Date(at('09:05')).toISOString()}], DAY, at('13:10'));
  assert.deepEqual(slots.map(s => [s.slot, s.label]), [['breakfast', 'Breakfast · Poha'], ['lunch', 'Lunch · Not logged'],
    ['dinner', 'Dinner · Not logged']]);
});
