import test from 'node:test';
import assert from 'node:assert/strict';
import {openHours, segments, positionAt, assignLanes} from './planner/day-geometry.mjs';
import {buildDay, dayBounds} from './day-model.mjs';
import {missedNudges, mealSlots, freeGap, fitUntimed, doNext, spanText, hourLabel} from './day-parts.mjs';
import {WATER_DEFAULTS} from './body-state.mjs';

const DAY = '2026-10-19';
const at = time => +new Date(`${DAY}T${time}`);
const water = (extra = {}) => ({status: {count: 5, goal: 8, nextAt: new Date(at('14:30')), reached: false},
  glasses: [], settings: WATER_DEFAULTS, busy: [], ...extra});
const routine = {id: 'm', name: 'Morning routine', start: '07:00', end: '07:30', state: 'partly', progress: {done: 3, total: 5, skipped: 1}};
const task = (id, time, minutes, extra = {}) => ({id, title: id, start: time ? at(time) : null, minutes, result: 'Physics lab', ...extra});
const day = (extra = {}) => buildDay({day: DAY, now: at('13:10'), water: water(), routines: [routine], ...extra});

test('an empty stretch of two hours or more folds; one empty hour stays open', () => {
  const open = openHours([{start: 9, end: 10}, {start: 15, end: 16}], {from: 8, to: 18, fallback: null});
  const layout = segments(open, {from: 8, to: 18, size: 96});
  assert.deepEqual(layout.list.map(s => [s.from, s.to, s.open]),
    [[8, 9, true], [9, 10, true], [10, 11, true], [11, 14, false], [14, 15, true], [15, 16, true], [16, 17, true], [17, 18, true]]);
  assert.equal(positionAt(layout, 9.5), 96 + 48);
  assert.equal(positionAt(layout, 12), 3 * 96, 'a time in a fold sits at its top');
  assert.equal(positionAt(layout, 6), 0, 'before the first hour clamps to the top');
});

test('a third overlapping item hides behind "+1 more"; two share lanes', () => {
  const rows = [[9, 10], [9.5, 10], [9.75, 10.5], [11, 12]].map(([start, end]) => ({start, visualEnd: end}));
  const {more} = assignLanes(rows, {maxLanes: 2});
  assert.deepEqual(rows.map(r => [r.lane, r.lanes, r.hidden]), [[0, 2, false], [1, 2, false], [2, 2, true], [0, 1, false]]);
  assert.equal(more.length, 1);
  assert.equal(more[0].count, 1);
});

test('the day runs from the first routine or 8 AM to the last item or the water window end', () => {
  const base = at('00:00');
  assert.deepEqual(dayBounds({base, routineStarts: [at('07:00')], items: [{start: at('21:00'), end: at('21:15')}], until: at('22:00')}), {from: 7, to: 22});
  assert.deepEqual(dayBounds({base, routineStarts: [at('09:00')], items: [{start: at('22:30'), end: at('23:10')}], until: at('22:00')}), {from: 8, to: 24});
});

test('Do next names the first undone task after now; a running one counts down', () => {
  assert.equal(doNext([{id: 'a', start: at('14:00'), end: at('14:45')}], at('13:10')).label, 'Do next · in 50 min');
  assert.equal(doNext([{id: 'a', start: at('13:00'), end: at('13:30')}], at('13:10')).label, 'Now · 20 min left');
  assert.equal(doNext([{id: 'a', start: at('13:00'), end: at('13:30'), done: true}], at('13:10')), null);
  const model = day({tasks: [task('Draft', '14:00', 45), task('Done early', '13:30', 15, {done: true})]});
  assert.equal(model.items.filter(i => i.flag).map(i => i.key).join(), 'task:Draft');
});

test('the free gap ends at the next fixed thing and takes as many untimed tasks as fit', () => {
  const gap = freeGap(at('13:10'), [{start: at('14:00'), end: at('14:45')}], at('22:00'));
  assert.deepEqual(gap, {start: at('13:10'), end: at('14:00')});
  assert.equal(freeGap(at('13:10'), [{start: at('13:00'), end: at('14:00')}], at('22:00')), null, 'something running: no gap');
  assert.equal(freeGap(at('13:10'), [{start: at('13:30'), end: at('14:00')}], at('22:00')), null, 'under 30 min: no gap');
  const {slots, rest} = fitUntimed([{id: 'a', minutes: 15}, {id: 'b', minutes: 60}, {id: 'c', minutes: 20}], gap);
  assert.deepEqual(slots.map(s => [s.task.id, s.start]), [['a', at('13:15')], ['c', at('13:30')]]);
  assert.deepEqual(rest.map(t => t.id), ['b']);
  const model = day({tasks: [task('Draft', '14:00', 45), task('Email', null, 15), task('Clean refs', null, 60)]});
  assert.equal(model.insert.header, 'Free until 2:00 PM · 1 task with no time');
  assert.equal(model.insert.words, 'Schedule at 1:15 PM');
  assert.deepEqual(model.anytime.map(t => t.id), ['Clean refs']);
  assert.ok(model.items.find(i => i.key === 'task:Draft').afterInsert, 'what comes after now sits below the gap block');
  assert.ok(!model.items.find(i => i.key === 'routine:m').afterInsert);
});

test('a task ticked in the gap stays there; the button schedules the rest', () => {
  const model = day({tasks: [task('Draft', '14:00', 45), task('Email', null, 15, {done: true}), task('Read', null, 20)]});
  assert.deepEqual(model.insert.rows.map(t => t.id), ['Email', 'Read']);
  assert.deepEqual(model.insert.slots.map(s => [s.task.id, s.start]), [['Read', at('13:15')]]);
  assert.equal(model.insert.header, 'Free until 2:00 PM · 1 task with no time');
  const allTicked = day({tasks: [task('Draft', '14:00', 45), task('Email', null, 15, {done: true})]});
  assert.equal(allTicked.insert, null, 'nothing left to plan: no gap block');
});

test('missed water nudges are the ones no glass answered', () => {
  const glasses = ['08:40', '12:30'].map(t => new Date(at(t)));
  const missed = missedNudges({glasses, day: DAY, settings: WATER_DEFAULTS, now: new Date(at('13:10'))});
  assert.deepEqual(missed, [at('10:10')], 'the 11:40 nudge was answered by the 12:30 glass');
});

test('meals with nothing logged sit at 8:30 AM, 1:00 PM and 8:00 PM; a logged one at its time', () => {
  const slots = mealSlots([{slot: 'breakfast', name: 'Poha', at: new Date(at('09:05')).toISOString()}], DAY, at('13:10'));
  assert.deepEqual(slots.map(s => [s.slot, s.at, s.label, s.past]), [
    ['breakfast', at('09:05'), 'Breakfast · Poha', false],
    ['lunch', at('13:00'), 'Lunch · not logged', false],
    ['dinner', at('20:00'), 'Dinner · not logged', false],
  ]);
  assert.equal(mealSlots([], DAY, at('13:10'))[0].past, true, 'breakfast not logged by 10:30 is past');
});

test('a task over an event is a clash; a past undone task says Not done', () => {
  const model = day({tasks: [task('Revise', '09:30', 30), task('Call bank', '10:30', 15)],
    events: [{id: 'rg', title: 'Reading group', start: at('09:00'), end: at('10:00')}]});
  const revise = model.items.find(i => i.key === 'task:Revise');
  assert.equal(revise.clash, 'Reading group');
  assert.match(revise.label, /clash with Reading group/);
  const call = model.items.find(i => i.key === 'task:Call bank');
  assert.equal(call.overdue, true);
  assert.equal(call.meta, 'Not done · 10:30 AM · 15 min · Physics lab');
  assert.equal(model.items.find(i => i.key === 'event:rg').past, true);
});

test('a water nudge during a task waits below it instead of sharing its lane', () => {
  const model = day({tasks: [task('Draft', '14:00', 45)]});
  const [draft, pill] = ['task:Draft', 'water'].map(key => model.items.find(i => i.key === key));
  assert.equal(draft.lanes, 1);
  assert.equal(pill.lanes, 1);
  assert.ok(pill.y >= draft.y + draft.h, 'the pill sits under the task');
  assert.match(pill.label, /2:30 PM/, 'it keeps its own time in its words');
});

test('a marker with no free spot below a block keeps its time and shares lanes; it never squeezes Do next', () => {
  const model = day({tasks: [task('A', '08:30', 45), task('B', '09:15', 45), task('Outline', '13:00', 45)]});
  const [a, breakfast, outline, lunch] = ['task:A', 'meal:breakfast', 'task:Outline', 'meal:lunch'].map(key => model.items.find(i => i.key === key));
  assert.equal(breakfast.y, a.y, 'breakfast stays at 8:30 AM');
  assert.deepEqual([a.lanes, breakfast.lane], [2, 1]);
  assert.equal(outline.lanes, 1, 'the running task keeps its full width');
  assert.ok(lunch.y >= outline.y + outline.h);
});

test('"+1 more" sits below the second-lane card it would cover', () => {
  const model = day({tasks: [task('Revise', '09:15', 30)], events: [{id: 'rg', title: 'Reading group', start: at('09:00'), end: at('10:00')},
    {id: 'sem', title: 'Seminar', start: at('09:30'), end: at('10:30')}]});
  const revise = model.items.find(i => i.key === 'task:Revise');
  assert.equal(model.more.length, 1);
  assert.equal(model.more[0].label, '+1 more');
  assert.ok(model.more[0].y >= revise.y + revise.h);
  assert.equal(model.items.find(i => i.key === 'event:sem').hidden, true);
});

test('enlarged text keeps one lane and stacks overlapping items in time order', () => {
  const model = day({large: true, size: 160, tasks: [task('Revise', '09:30', 30)],
    events: [{id: 'rg', title: 'Reading group', start: at('09:00'), end: at('09:10')}]});
  const [event, revise] = ['event:rg', 'task:Revise'].map(key => model.items.find(i => i.key === key));
  assert.equal(event.lanes, 1);
  assert.equal(revise.lanes, 1);
  assert.ok(revise.y >= event.y + event.h, 'the later item starts below the earlier one');
  assert.ok(event.h >= 56);
});

test('items before the day fold into one row; empty and all-done days say so', () => {
  const early = day({tasks: [task('Run', '06:00', 30)]});
  assert.equal(early.early.label, 'Before 7 AM · 1 item');
  assert.equal(early.items.some(i => i.key === 'task:Run'), false);
  assert.equal(day({tasks: [task('Run', '06:00', 30)], early: true}).from, 6);
  const empty = day();
  assert.equal(empty.empty, true);
  assert.equal(empty.from, 7);
  assert.equal(empty.to, 22);
  assert.ok(empty.items.some(i => i.kind === 'meal') && empty.items.some(i => i.kind === 'water'));
  assert.ok(day({tasks: [task('A', '09:00', 30, {done: true})]}).allDone);
  assert.equal(day({tasks: [task('A', '09:00', 30)]}).allDone, null);
});

test('words read as Calendar writes them', () => {
  assert.equal(spanText(at('15:00'), at('16:30')), '3:00 – 4:30 PM');
  assert.equal(spanText(at('11:30'), at('13:30')), '11:30 AM – 1:30 PM');
  assert.deepEqual([0, 7, 12, 22, 24].map(hourLabel), ['12 AM', '7 AM', '12 PM', '10 PM', '12 AM']);
});
