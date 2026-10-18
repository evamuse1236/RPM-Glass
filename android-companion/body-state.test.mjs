import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clockText, rangeText, timesText, daysText, routineOn, routineState, routineRowParts, joinParts, runSummary, missedLine,
  routineHistoryText, markStep, doneAll, skipRest, validateRoutine, waterStatus, waterRowParts, waterNotification,
  WATER_DEFAULTS, guessSlot, usualMeals, mealRowState, estimateText, historyDays,
} from './body-state.mjs';
import {waterNotification as fromWaterModule} from './planner/water.mjs';

const DAY = '2026-10-19'; // a Monday
const at = (time, day = DAY) => new Date(`${day}T${time}`);
const routine = {
  id: 'r1', name: 'Morning routine', start: '07:00', end: '07:30', days: [1, 2, 3, 4, 5],
  steps: ['Water', 'Stretch', 'Shower', 'Journal', 'Plan the day'].map((title, i) => ({id: 's' + i, title})),
};
const runWith = marks => ({routineId: 'r1', day: DAY, marks: Object.fromEntries(Object.entries(marks)
  .map(([id, state]) => [id, {state, at: at('07:05').toISOString()}]))});

test('times read as Calendar writes them', () => {
  assert.equal(clockText(at('12:40')), '12:40 PM');
  assert.equal(clockText(at('00:05')), '12:05 AM');
  assert.equal(rangeText('07:00', '07:30'), '7:00 – 7:30 AM');
  assert.equal(rangeText('11:30', '13:30'), '11:30 AM – 1:30 PM');
  assert.equal(timesText([at('13:20'), at('08:40'), at('10:15'), at('11:50')]), '8:40, 10:15, 11:50 AM, 1:20 PM');
  assert.equal(daysText([1, 2, 3, 4, 5]), 'Mon–Fri');
  assert.equal(daysText([0, 6]), 'Sat, Sun');
  assert.equal(daysText([0, 1, 2, 3, 4, 5, 6]), 'Every day');
  assert.equal(daysText([1, 3, 5]), 'Mon, Wed, Fri');
});

test('a routine runs only on its days', () => {
  assert.equal(routineOn(routine, DAY), true);
  assert.equal(routineOn(routine, '2026-10-18'), false);
});

test('routine row states use the exact words', () => {
  const line = (run, time) => joinParts(routineRowParts(routine, run, at(time)).parts);
  assert.equal(line(null, '06:30'), 'Starts 7:00 AM · 5 steps');
  assert.equal(line(runWith({s0: 'done', s1: 'done', s2: 'done'}), '07:10'), '7:00 – 7:30 AM · 3 of 5 done');
  assert.equal(line(runWith({s0: 'done', s1: 'done', s2: 'done', s3: 'done', s4: 'done'}), '07:20'), 'Done · 5 of 5');
  assert.equal(routineRowParts(routine, runWith({s0: 'done', s1: 'done', s2: 'done', s3: 'done', s4: 'done'}), at('07:20')).filled, true);
  assert.equal(line(runWith({s0: 'done', s1: 'done', s2: 'done', s3: 'skipped'}), '09:00'), 'Partly done · 3 of 5, 1 skipped');
  assert.equal(line(null, '09:00'), 'Missed · window ended 7:30 AM');
  assert.equal(routineRowParts(routine, null, at('09:00')).parts[1].yields, true);
  assert.equal(routineRowParts(routine, {...runWith({}), skippedDay: true}, at('07:10')), null);
});

test('touching a step before the window starts makes it running', () => {
  assert.equal(routineState(routine, runWith({s0: 'done'}), at('06:50')).state, 'running');
});

test('every step ticked or skipped finishes the run', () => {
  const run = runWith({s0: 'done', s1: 'done', s2: 'done', s3: 'done', s4: 'skipped'});
  assert.equal(routineState(routine, run, at('07:10')).state, 'partly');
  assert.equal(runSummary(routine, run), 'Done · 4 of 5, 1 skipped');
  assert.equal(runSummary(routine, runWith({s0: 'done', s1: 'done', s2: 'done'})), '3 of 5 done');
});

test('a step ticked after the window still counts until midnight', () => {
  assert.equal(missedLine(routine, null, at('08:00')), 'Missed · window ended 7:30 AM');
  const late = markStep(routine, null, 's0', 'done', at('20:00'));
  assert.equal(late.day, DAY);
  assert.equal(routineState(routine, late, at('20:00')).state, 'partly');
  assert.equal(missedLine(routine, late, at('20:00')), null);
  assert.equal(routineState(routine, doneAll(routine, late, at('23:59')), at('23:59')).state, 'done');
});

test('Done all ticks only the untouched steps; skipped steps stay skipped', () => {
  const run = doneAll(routine, runWith({s1: 'skipped', s2: 'done'}), at('07:12'));
  assert.deepEqual(routine.steps.map(s => run.marks[s.id].state), ['done', 'skipped', 'done', 'done', 'done']);
  assert.equal(run.marks.s2.at, at('07:05').toISOString());
  assert.equal(runSummary(routine, run), 'Done · 4 of 5, 1 skipped');
});

test('Skip the rest skips only the untouched steps, and Put back clears a mark', () => {
  const run = skipRest(routine, runWith({s0: 'done'}), at('07:12'));
  assert.deepEqual(routine.steps.map(s => run.marks[s.id].state), ['done', 'skipped', 'skipped', 'skipped', 'skipped']);
  const back = markStep(routine, run, 's1', null, at('07:13'));
  assert.equal(back.marks.s1, undefined);
  assert.equal(run.marks.s1.state, 'skipped');
});

test('routine history words', () => {
  const after = at('23:00');
  assert.equal(routineHistoryText(routine, runWith({s0: 'done', s1: 'done', s2: 'done', s3: 'done', s4: 'done'}), after), 'Done');
  assert.equal(routineHistoryText(routine, runWith({s0: 'done', s1: 'done', s2: 'done', s3: 'skipped'}), after), 'Partly done · 3 of 5, 1 skipped');
  assert.equal(routineHistoryText(routine, runWith({}), after), 'Missed');
});

test('the editor names each missing field', () => {
  assert.deepEqual(validateRoutine({name: ' ', start: '07:30', end: '07:00', days: [], steps: [{title: '  '}]}), {
    name: 'Give the routine a name', window: 'End time must be after the start',
    days: 'Pick at least one day', steps: 'Add at least one step',
  });
  assert.deepEqual(validateRoutine({name: 'Wind down', start: '21:30', end: '22:00', days: [0], steps: [{title: 'Read'}]}), {});
  assert.equal(validateRoutine({name: 'x', start: '07:00', end: '07:00', days: [1], steps: [{title: 'a'}]}).window,
    'End time must be after the start');
});

test('water: the next nudge follows the last glass by the interval', () => {
  const glasses = ['08:40', '10:15', '11:00', '12:00', '13:00'].map(t => at(t));
  const status = waterStatus({glasses, now: at('13:10')});
  assert.equal(status.count, 5);
  assert.equal(+status.nextAt, +at('14:30'));
  assert.equal(status.pending, false);
  assert.equal(joinParts(waterRowParts(status).parts), '5 of 8 glasses · next nudge 2:30 PM');
  assert.equal(waterRowParts(status).parts[1].yields, true);
});

test('water: before 8 AM the first nudge is at 8:00 AM', () => {
  const status = waterStatus({glasses: [], now: at('07:10')});
  assert.equal(joinParts(waterRowParts(status).parts), 'No glasses yet · first nudge 8:00 AM');
  assert.equal(waterNotification(status).text, 'First of 8 today');
});

test('water: yesterday\'s glasses do not count today', () => {
  assert.equal(waterStatus({glasses: [at('21:00', '2026-10-18')], now: at('07:10')}).count, 0);
});

test('water: a busy calendar event pauses the nudge until it ends', () => {
  const busy = [{title: 'Dentist', start: at('12:30'), end: at('15:00')}];
  const status = waterStatus({glasses: [at('12:00')], now: at('13:10'), busy});
  assert.deepEqual(status.paused, {title: 'Dentist', until: at('15:00')});
  assert.equal(+status.nextAt, +at('15:00'));
  assert.equal(joinParts(waterRowParts(status).parts), 'Paused · in Dentist until 3:00 PM');
  assert.equal(waterNotification(status), null);
});

test('water: goal reached stops the nudges but still counts glasses past the goal', () => {
  const nine = Array.from({length: 9}, (_, i) => at(`${String(8 + i).padStart(2, '0')}:30`));
  const status = waterStatus({glasses: nine, now: at('17:00')});
  assert.equal(status.reached, true);
  assert.equal(status.nextAt, null);
  assert.equal(joinParts(waterRowParts(status).parts), '9 of 8 · goal reached');
  assert.equal(waterRowParts(status).filled, true);
  assert.equal(waterNotification(status), null);
});

test('water: a snooze waits 15 minutes, and a waiting nudge says so', () => {
  const waiting = waterStatus({glasses: [at('10:00')], now: at('11:40')});
  assert.equal(waiting.pending, true);
  assert.equal(joinParts(waterRowParts(waiting).parts), '1 of 8 glasses · nudge due now');
  const snoozed = waterStatus({glasses: [at('10:00')], now: at('11:40'), snoozedUntil: at('11:55')});
  assert.equal(snoozed.pending, false);
  assert.equal(+snoozed.nextAt, +at('11:55'));
});

test('water: no nudges after 10 PM', () => {
  const status = waterStatus({glasses: [at('21:00')], now: at('21:10')});
  assert.equal(status.nextAt, null);
  assert.equal(joinParts(waterRowParts(status).parts), '1 of 8 glasses');
});

test('water notification text and actions', () => {
  const status = waterStatus({glasses: ['08:40', '10:15', '11:00', '12:00', '12:40'].map(t => at(t)), now: at('14:10')});
  assert.deepEqual(waterNotification(status), {
    title: 'Drink a glass of water', text: '5 of 8 today · last at 12:40 PM', actions: ['Drank it', 'Snooze 15 min'],
  });
  assert.equal(fromWaterModule, waterNotification);
  assert.equal(WATER_DEFAULTS.glassMl, 250);
});

test('meal slot is guessed from the time', () => {
  assert.equal(guessSlot(at('03:59')), 'dinner');
  assert.equal(guessSlot(at('04:00')), 'breakfast');
  assert.equal(guessSlot(at('10:59')), 'breakfast');
  assert.equal(guessSlot(at('11:00')), 'lunch');
  assert.equal(guessSlot(at('13:10')), 'lunch');
  assert.equal(guessSlot(at('15:30')), 'snack');
  assert.equal(guessSlot(at('19:00')), 'dinner');
});

test('usual meals: the six most frequent for the slot, in the latest spelling', () => {
  const meal = (name, slot, day) => ({name, slot, at: at('13:00', day)});
  const meals = [
    meal('dal rice', 'lunch', '2026-10-10'), meal('Dal rice', 'lunch', '2026-10-12'), meal('Dal  Rice ', 'lunch', '2026-10-11'),
    meal('Rajma chawal', 'lunch', '2026-10-13'), meal('Rajma chawal', 'lunch', '2026-10-09'),
    meal('Paneer wrap', 'lunch', '2026-10-14'), meal('Curd rice', 'lunch', '2026-10-08'), meal('Thali', 'lunch', '2026-10-07'),
    meal('Salad', 'lunch', '2026-10-06'), meal('Khichdi', 'lunch', '2026-10-05'), meal('Poha', 'breakfast', '2026-10-14'),
  ];
  assert.deepEqual(usualMeals(meals, 'lunch'), ['Dal rice', 'Rajma chawal', 'Paneer wrap', 'Curd rice', 'Thali', 'Salad']);
  assert.deepEqual(usualMeals(meals, 'snack'), []);
});

test('the meal row shows the slot for now, and hides in the evening once dinner is logged', () => {
  const lunch = {name: 'Dal rice', slot: 'lunch', at: at('13:10')};
  assert.deepEqual(mealRowState([], at('13:20')), {slot: 'lunch', meal: null, hidden: false});
  assert.equal(mealRowState([lunch], at('13:20')).meal, lunch);
  const dinner = {name: 'Roti sabzi', slot: 'dinner', at: at('20:10')};
  assert.equal(mealRowState([lunch, dinner], at('21:30')).hidden, true);
  assert.equal(mealRowState([lunch], at('21:30')).hidden, false);
});

test('estimate words', () => {
  const ready = {status: 'ready', kcal: 550, protein: 18};
  const spaced = text => text.replace(/ /g, ' ');
  assert.equal(spaced(estimateText(ready)), "Jev's guess · about 550 kcal · 18 g protein");
  assert.equal(spaced(estimateText(ready, {short: true})), 'Guess: about 550 kcal, 18 g protein');
  assert.match(estimateText(ready), /18 g protein/);
  assert.equal(estimateText({status: 'pending'}), '');
});

test('history groups by day, newest first, and leaves out a routine still running', () => {
  const runs = [
    runWith({s0: 'done', s1: 'done', s2: 'done', s3: 'skipped'}),
    {routineId: 'r1', day: '2026-10-16', marks: {}},
    {routineId: 'r1', day: '2026-10-20', marks: {}},
  ];
  const days = historyDays({
    meals: [{name: 'Dal rice', slot: 'lunch', at: at('13:10')}, {name: 'Poha', slot: 'breakfast', at: at('08:00', '2026-10-16')}],
    glasses: [at('09:00'), at('08:30'), at('12:00', '2026-10-16')],
    runs, routines: [routine],
  }, at('14:00'));
  assert.deepEqual(days.map(d => d.day), [DAY, '2026-10-16']);
  assert.deepEqual(days[0].rows.map(r => r.kind), ['meal', 'water', 'routine']);
  assert.equal(days[0].rows[1].count, 2);
  assert.equal(days[0].rows[2].text, 'Partly done · 3 of 5, 1 skipped');
  assert.deepEqual(days[1].rows.map(r => r.kind), ['water', 'meal', 'routine']);
  assert.equal(days[1].rows[2].text, 'Missed');
  const running = historyDays({runs: [runWith({s0: 'done'})], routines: [routine]}, at('07:10'));
  assert.deepEqual(running, []);
  assert.deepEqual(historyDays({}, at('07:10')), []);
});
