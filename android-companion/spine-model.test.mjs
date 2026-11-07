import test from 'node:test';
import assert from 'node:assert/strict';
import {soonText, buildSpine, cardHeight, gapHeight, owedRows, owedLabel, doneLabel, doneSpoken, lateText, FREE_MINUTES} from './spine-model.mjs';
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
  assert.deepEqual(kinds(model), ['gap@8 AM', 'meal@8:30 AM', 'gap@8:30 AM', 'meal@1 PM', 'gap@1 PM', 'event@2 PM', 'now@2:45 PM', 'gap@3 PM',
    'task@4 PM', 'gap@5 PM', 'task@6:30 PM', 'gap@7:15 PM', 'meal@8 PM', 'gap@8 PM']);
  const free = model.rows.find(r => r.key === 'gap:to:' + at('16:00'));
  assert.equal(plain(free.label), '1 h free');
  assert.equal(free.plan, at('15:00'));
  assert.equal(free.height, 32);
  assert.equal(model.rows.find(r => r.key === 'gap:to:' + at('20:00')).plan, null, '45 min free offers no +');
});

test('on wide every future gap long enough to show offers a +', () => {
  const model = spine({tasks: [task('Past paper', '16:00', 60), task('Review notes', '18:30', 45)],
    events: [event('Ward round', '14:00', '15:00')], meals: [], planMinutes: FREE_MINUTES});
  assert.equal(model.rows.find(r => r.key === 'gap:to:' + at('20:00')).plan, at('19:15'));
  assert.equal(model.rows.find(r => r.key === 'gap:to:' + at('13:00')).plan, null, 'a past gap offers no +');
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

test('the gutter runs forward: an end time goes when a later row starts by then', () => {
  const model = spine({now: at('09:00'), meals: [], tasks: [task('Finish', '10:00', 90), task('Call', '12:00', 15)],
    events: [event('Session', '11:30', '13:30'), event('Lab', '15:00', '16:00')]});
  const end = key => model.rows.find(r => r.key === key).gutter.end;
  assert.equal(end('task:Finish'), null, 'Session starts at 11:30, the moment Finish ends');
  assert.equal(end('event:Session'), null, 'Call starts at 12 PM, inside Session');
  assert.equal(end('event:Lab'), '4 PM', 'nothing starts inside Lab');
  const times = model.rows.filter(r => r.gutter).flatMap(r => [r.start, ...(r.gutter.end ? [r.end] : [])]);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test('a row that starts inside an item follows it at once: the item\'s pill stops at that start', () => {
  const model = spine({now: at('09:00'), meals: [], tasks: [task('Call', '12:00', 15)],
    events: [event('Session', '11:30', '13:30'), event('Lab', '15:00', '16:00')]});
  const height = key => model.rows.find(r => r.key === key).height;
  assert.equal(height('event:Session'), cardHeight(30), 'Call starts 30 min in, so no empty rail sits under Session');
  assert.equal(height('event:Lab'), cardHeight(60), 'nothing starts inside Lab');
});

test('a deadline at the time an open task of its Result starts is said once, on the task', () => {
  const model = spine({now: at('09:00'), meals: [],
    tasks: [task('Submit', '23:00', 0, {resultId: 'r1', result: 'Review drafted'}), task('Upload', '20:00', 0, {resultId: 'r2', result: 'Post work'})],
    deadlines: [{id: 'r1', title: 'Review drafted', at: at('23:00')}, {id: 'r2', title: 'Post work', at: at('23:59')}]});
  const keys = model.rows.map(r => r.key);
  assert.ok(!keys.includes('due:r1'), 'the deadline at the task’s own time folds into it');
  assert.ok(keys.includes('due:r2'), 'a deadline at another time keeps its row');
  assert.deepEqual(model.rows.find(r => r.key === 'task:Submit').line, {kind: 'due', text: 'Review drafted', tone: 'area-3'});
});

test('now inside an item makes it the current row in the Now card; the Now line still splits the timeline', () => {
  const model = spine({events: [event('Ward round', '14:00', '15:00')]});
  const hero = model.rows.find(r => r.kind === 'event');
  assert.equal(hero.current, true);
  assert.equal(hero.focus, 1);
  assert.equal(plain(hero.when.text), 'Now · 15 min left');
  assert.equal(model.nowKey, 'now');
  assert.equal(model.rows.filter(r => r.kind === 'now').length, 1);
  assert.equal(hero.height, cardHeight(60), 'the Now line does not cut the item short');
});

test('the Now card holds one item: the one in progress, else the next; never a missed one', () => {
  const model = spine({now: at('11:40'), tasks: [task('Draft', '09:00', 30, {must: true}), task('Call bank', '10:30', 15),
    task('Stretch', '08:00', 15, {done: true}), task('Read', '13:00', 30)], events: [event('Session', '11:30', '12:30')]});
  assert.deepEqual(model.rows.filter(r => r.focus).map(r => r.key), ['event:Session']);
  const quiet = spine({now: at('11:40'), tasks: [task('Draft', '09:00', 30, {must: true}), task('Read', '13:00', 30)]});
  assert.deepEqual(quiet.rows.filter(r => r.focus).map(r => r.key), ['task:Read'], 'a missed Must is not now; the next item is');
  const calm = spine({now: at('11:40'), tasks: [task('Read', '13:00', 30), task('Lab', '15:00', 30)]});
  assert.deepEqual(calm.rows.filter(r => r.focus).map(r => r.key), ['task:Read'], 'with nothing on, only what is next');
  assert.equal(spine({live: false, now: at('09:00') - 864e5, tasks: [task('Lab', '14:00', 60)]}).rows.some(r => r.focus), false);
});

test('the past splits in two: open tasks past their end (Musts too) and overdue deadlines are owed, the rest folds behind Show done', () => {
  const model = spine({now: at('11:40'), tasks: [task('Draft', '09:00', 30, {must: true}), task('Call bank', '10:30', 15),
    task('Stretch', '08:00', 15, {done: true}), task('Read', '13:00', 30)], events: [event('Gym', '07:00', '07:30')],
    deadlines: [{id: 'r1', title: 'Submit form', at: at('10:00')}, {id: 'r2', title: 'Post work', at: at('23:00')}]});
  const row = key => model.rows.find(r => r.key === key);
  assert.equal(row('task:Stretch').fold, 'earlier');
  assert.equal(row('event:Gym').fold, 'earlier');
  assert.equal(row('task:Call bank').fold, 'missed');
  assert.equal(row('task:Draft').fold, 'missed', 'a missed Must is owed too, and leads the group');
  assert.equal(row('task:Draft').late, true);
  assert.equal(row('due:r1').fold, 'missed', 'an overdue deadline still needs a choice');
  assert.equal(row('due:r2').fold, false);
  assert.equal(row('task:Read').fold, false);
  assert.equal(row('now').fold, false);
  assert.deepEqual(row('task:Call bank').when, {kind: 'late', text: '1 h late'}, 'an owed row says how late it is, never "Missed"');
  assert.deepEqual(row('task:Draft').when, {kind: 'late', text: '2 h late'}, 'lateness counts from the start, in whole hours begun');
  assert.equal(row('task:Call bank').line, null, 'an owed row shows only its lateness');
  assert.equal(row('task:Call bank').gutter.end, null, 'its gutter keeps one time on one line');
  assert.equal(row('task:Call bank').height, cardHeight(0), 'out of time order, it has no length bar');
  assert.ok(model.rows.every(r => !/ago|Missed/.test(r.when?.text ?? '')));
  assert.equal(lateText(20 * 60e3), '20 min late');
  const owed = owedRows(model.rows);
  assert.deepEqual(owed.map(r => r.key), ['task:Draft', 'due:r1', 'task:Call bank'], 'Musts first, then by time');
  assert.equal(owedLabel(owed), 'Still to do · 3');
  const past = model.rows.filter(r => r.fold === 'earlier');
  assert.equal(doneLabel(past), 'Show 1 done', 'counts what was done (Stretch); Gym and Breakfast open with it');
  assert.equal(doneLabel(past, true), 'Hide 1 done');
  assert.equal(doneLabel(past.filter(r => !r.done)), 'Show 2 earlier', 'nothing done: it names the past instead');
  assert.equal(doneSpoken(past), 'Show earlier: 1 done, 2 more', 'TalkBack hears what is in it');
});

test('with nothing timed live or next there is no Now card: an Any-time task or a missed Must is not now', () => {
  const late = at('23:50');
  const loose = spine({now: late, tasks: [task('Loose', null, 0), task('Key', null, 0, {must: true})]});
  assert.equal(loose.rows.some(r => r.focus), false);
  assert.equal(loose.anytime.some(t => t.focus), false);
  const missed = spine({now: late, tasks: [task('Draft', '09:00', 30, {must: true})]});
  const draft = missed.rows.find(r => r.key === 'task:Draft');
  assert.equal(draft.focus, undefined);
  assert.equal(draft.fold, 'missed', 'the missed Must is owed, not now');
});

test('a clash names the event it clashes with, even when the Now card shows that event', () => {
  const model = spine({now: at('09:00'), tasks: [task('Call', '12:00', 15)], events: [event('Session', '11:30', '13:30')]});
  const call = model.rows.find(r => r.key === 'task:Call');
  assert.equal(call.line.text, 'Clash · Session');
  assert.equal(call.line.with.title, 'Session');
});

test('free time stays inside the waking day, however early or late the items are', () => {
  const model = spine({now: at('09:00') - 864e5, live: false, tasks: [task('Late call', '23:30', 15)],
    window: {from: '08:00', until: '22:00'}});
  const free = model.rows.filter(r => r.kind === 'gap');
  assert.ok(free.every(r => r.start >= at('08:00') && r.end <= at('22:00')), 'no free time before 8 AM or after 10 PM');
  assert.ok(free.reduce((sum, r) => sum + r.minutes, 0) <= 14 * 60);
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

test('a task over an event says Clash · the event while it can be fixed; a past one does not; the event stays plain', () => {
  const model = spine({now: at('12:00'), tasks: [task('Revise', '09:30', 30), task('Call bank', '10:30', 15), task('Read', '13:00', 30),
    task('Prep', '14:00', 30)], events: [event('Reading group', '09:00', '10:00'), event('RM Session 4', '14:15', '15:00')]});
  const line = id => model.rows.find(r => r.key === 'task:' + id).line;
  assert.equal(line('Prep').text, 'Clash · RM Session 4');
  assert.equal(line('Revise'), null, 'a clash in the past cannot be fixed, so it is not shown');
  assert.equal(line('Call bank'), null, 'a late task shows only its lateness; the error ring says it is late');
  const bank = model.rows.find(r => r.key === 'task:Call bank');
  assert.equal(bank.late, true);
  assert.equal(bank.when.kind, 'late');
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

test('tasks for the day without a time are the Any time rows, open ones first, never timed rows', () => {
  const model = spine({tasks: [task('Other', null, 30, {done: true}), task('Loose', null, 30), task('Read', '09:30', 30)]});
  assert.deepEqual(model.anytime.map(t => [t.title, t.done]), [['Loose', false], ['Other', true]]);
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
