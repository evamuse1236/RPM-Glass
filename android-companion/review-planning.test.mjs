import test from 'node:test';
import assert from 'node:assert/strict';
import {editPlan, blockDue} from './planner-state.mjs';
import {focusCandidates, freeMinutes, calendarClashes, weekCapacity, placedMusts, mustPlacements, placeMusts, rankResults, clashTitle, clashTask, decideClash, clashKey} from './review-state.mjs';
import {WEEK, block, task, entry, seed} from './review-fixtures.mjs';

test('free time is waking hours minus busy events; clashes are overlapping busy events', () => {
  const ev = (a, b, title, extra = {}) => ({start: +new Date(`2026-10-05T${a}:00`), end: +new Date(`2026-10-05T${b}:00`), title, ...extra});
  const events = [ev('09:00', '10:00', 'Exam'), ev('09:00', '11:00', 'Session'), ev('21:00', '23:30', 'Late'),
    ev('12:00', '13:00', 'Free lunch', {busy: false})];
  const from = new Date('2026-10-05T00:00:00'), to = new Date('2026-10-06T00:00:00');
  assert.equal(freeMinutes([], from, to), 14 * 60, '8 AM to 10 PM');
  assert.equal(freeMinutes(events, from, to), 14 * 60 - 120 - 60, 'overlaps counted once, past 10 PM ignored, free events ignored');
  assert.equal(freeMinutes(events, new Date('2026-10-05T10:30:00'), to), 14 * 60 - 150 - 30 - 60);
  const clashes = calendarClashes(events, from, to);
  assert.deepEqual(clashes.map(c => [c.day, c.a.title, c.b.title]), [['2026-10-05', 'Exam', 'Session']]);
});

test('weekCapacity checks each picked Result against its own deadline, with its own Must time, and degrades without a calendar', () => {
  const now = new Date('2026-10-03T20:00:00');
  const chosen = [
    {blockId: 'b', title: 'B', due: '2026-10-04T23:59', mustMinutes: 30}, {blockId: 'a', title: 'A', due: '2026-10-04T23:00', mustMinutes: 240},
    {blockId: 'c', title: 'C', due: '2026-10-05T10:30', mustMinutes: 600}, {blockId: 'd', title: 'D', due: null, mustMinutes: 60}];
  const busy = [{start: +new Date('2026-10-05T09:00:00'), end: +new Date('2026-10-05T11:00:00'), title: 'Exam'},
    {start: +new Date('2026-10-05T09:30:00'), end: +new Date('2026-10-05T10:00:00'), title: 'Session'}];
  const cap = weekCapacity(chosen, busy, '2026-10-05', now, [{day: '2026-10-04', minutes: 20}]);
  assert.deepEqual(cap.rows.map(r => [r.blockId, r.value, r.must, r.need, r.free, r.over, r.tight]), [
    ['a', '2026-10-04T23:00', 240, 240, 120 + 840, false, false], // its own 11 PM deadline, not the later one that evening
    ['b', '2026-10-04T23:59', 30, 270, 120 + 840, false, false],
    ['c', '2026-10-05T10:30', 600, 870, 120 + 840 + 60, false, true], // tight once Must needs over half the free time
    ['d', null, 60, 930, 120 + 840 + 720 + 6 * 840, false, false]]);
  assert.equal(cap.must, 930);
  assert.equal(weekCapacity([{due: '2026-10-04T10:00', mustMinutes: 300}], busy, '2026-10-05', now).rows[0].over, true);
  const late = weekCapacity([{due: '2026-10-03T10:00', mustMinutes: 30}], busy, '2026-10-05', now).rows[0];
  assert.deepEqual([late.overdue, late.over, late.free], [true, true, 0]);
  assert.equal(cap.days.length, 9, 'Saturday to the planned week\'s Sunday');
  assert.deepEqual(cap.days.slice(0, 3).map(x => [x.day, x.free, x.must, x.deadlines, x.clash]),
    [['2026-10-03', 120, 0, 0, false], ['2026-10-04', 840, 20, 2, false], ['2026-10-05', 720, 0, 1, true]]);
  const blind = weekCapacity(chosen, null, '2026-10-05', now);
  assert.deepEqual(blind.rows.map(r => [r.must, r.free, r.over]), [[240, null, false], [30, null, false], [600, null, false], [60, null, false]]);
  assert.deepEqual([blind.days[0].free, blind.clashes.length], [null, 0]);
});

test('undated Musts are proposed on the freest day before their deadline, and placed only on request, with Undo', () => {
  const {d} = seed();
  const exam = block(d, {title: 'Ready for the exam'});
  task(d, {title: 'Sit the exam', blockId: exam, minutes: 60, planned: '2026-10-07T04:00:00.000Z'});
  const one = task(d, {title: 'Revise chapter 1', blockId: exam, minutes: 120, must: true});
  const two = task(d, {title: 'Revise chapter 2', blockId: exam, minutes: 60, must: true});
  const loose = block(d, {title: 'No deadline yet'});
  task(d, {title: 'Someday Must', blockId: loose, minutes: 30, must: true});
  task(d, {title: 'Dated Must', blockId: exam, minutes: 15, must: true, plannedDate: '2026-10-05'});
  const now = new Date('2026-10-03T20:00:00');
  const sunday = [{start: +new Date('2026-10-04T08:00:00'), end: +new Date('2026-10-04T22:00:00'), title: 'Away'}];
  assert.deepEqual(placedMusts(d, [exam, loose]).map(p => [p.day, p.minutes]), [['2026-10-05', 15]]);
  const plan = mustPlacements(d, [exam, loose], sunday, '2026-10-05', now);
  assert.deepEqual(plan.map(p => [p.taskId, p.day]), [[one, '2026-10-06'], [two, '2026-10-05']],
    'Mon already holds 15 min, so chapter 1 goes to Tue; then Mon is freest; never on or after Wednesday\'s deadline');
  assert.equal(placeMusts(d, plan), '2 Musts given a day');
  assert.deepEqual([entry(d, one).plannedDate, entry(d, two).plannedDate], ['2026-10-06', '2026-10-05']);
  assert.equal(blockDue(d, exam).value, '2026-10-07T09:30', 'the deadline stays the deadline');
  editPlan(d, {type: 'undo'});
  assert.deepEqual([entry(d, one).plannedDate ?? null, entry(d, two).plannedDate ?? null], [null, null], 'one Undo puts both back');
});

test('rankResults suggests a Result only when the words clearly point to one', () => {
  const {d, inbox} = seed();
  const exam = block(d, {title: 'Ready for the exam', purpose: 'Walk in calm'});
  const candidates = focusCandidates(d, WEEK, []);
  const room = task(d, {title: 'Book the exam room'});
  assert.equal(rankResults(d, entry(d, room), candidates).suggested?.blockId, exam);
  assert.equal(rankResults(d, entry(d, inbox), candidates).suggested, null, 'no shared words, no guess');
  const calm = rankResults(d, entry(d, task(d, {title: 'Walk somewhere calm'})), candidates);
  assert.equal(calm.suggested, null, 'words shared only with a Purpose or tasks are not enough');
  const towels = rankResults(d, entry(d, task(d, {title: 'Buy kitchen towels'})), candidates);
  assert.equal(towels.suggested, null, 'one word shared with a task is not enough to suggest');
  assert.equal(towels.ranked[0].title, 'Have home ready for the week', 'but the chooser still lists the likeliest first');
});

test('a calendar clash is decided as a task on Today, reusing one that already names it', () => {
  const now = new Date('2026-10-03T09:00:00');
  const clash = {day: '2026-10-05', a: {title: 'DAD exam'}, b: {title: 'GWBC session'}};
  let {d} = seed();
  assert.equal(clashTask(d, clash), null);
  assert.equal(decideClash(d, clash, 'a', now), 'Decision added to Today');
  const added = clashTask(d, clash);
  assert.deepEqual([added.title, added.plannedDate, added.minutes], [clashTitle(clash, 'a'), '2026-10-03', 15]);
  assert.match(added.title, /keep DAD exam, move or skip GWBC session$/);
  decideClash(d, clash, 'b', now);
  assert.equal(clashTask(d, clash).id, added.id, 'changing the decision rewrites the same task');
  assert.match(clashTask(d, clash).title, /keep GWBC session, move or skip DAD exam$/);
  assert.equal(clashTask(d, clash).notes, 'Decided in the weekly review: keep GWBC session, move or skip DAD exam.');
  ({d} = seed());
  const mine = task(d, {title: 'Clear 5 Oct morning clash: DAD exam vs GWBC', notes: 'Ask Ms Rao first'});
  assert.equal(clashTask(d, clash).id, mine);
  decideClash(d, clash, 'a', now);
  assert.deepEqual([entry(d, mine).title, entry(d, mine).plannedDate], ['Clear 5 Oct morning clash: DAD exam vs GWBC', '2026-10-03'],
    'the user\'s own words stay');
  assert.equal(entry(d, mine).notes, 'Ask Ms Rao first\n\nDecided in the weekly review: keep DAD exam, move or skip GWBC session.');
  assert.equal(d.entries.filter(t => /clash/i.test(t.title ?? '')).length, 1, 'no second task');
  editPlan(d, {type: 'undo'});
  assert.deepEqual([entry(d, mine).plannedDate ?? null, entry(d, mine).notes], [null, 'Ask Ms Rao first']);
  assert.equal(clashKey(clash), '2026-10-05|DAD exam|GWBC session');
});
