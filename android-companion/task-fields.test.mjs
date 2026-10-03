import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWhen, dayPresets, whenFields, whenOf, timePresets, repeatLabel} from './planner/task-fields.mjs';

const SAT = '2026-10-03';

test('Quick add reads a day (and time) written in the title, never a stray short word', () => {
  assert.deepEqual(parseWhen('Call mum tomorrow', SAT), {day: '2026-10-04', time: '', match: 'tomorrow'});
  assert.deepEqual(parseWhen('mon 9am standup', SAT), {day: '2026-10-05', time: '09:00', match: 'mon 9am'});
  assert.deepEqual(parseWhen('Email TA tomorrow at 3:30pm', SAT), {day: '2026-10-04', time: '15:30', match: 'tomorrow at 3:30pm'});
  assert.equal(parseWhen('Pay rent friday', SAT).day, '2026-10-09');
  assert.equal(parseWhen('Dinner tonight', SAT).time, '19:00');
  assert.equal(parseWhen('Weekly review saturday', SAT).day, '2026-10-10', 'the same weekday means next week');
  for (const words of ['I sat the exam', 'sun cream', 'monitor the build', 'Email the TA about the quiz room']) {
    assert.equal(parseWhen(words, SAT), null, words);
  }
});

test('Day presets offer Today, Tomorrow and the weekend or next week without repeating Tomorrow', () => {
  assert.deepEqual(dayPresets(SAT).map(([label, day]) => [label, day]),
    [['Today', SAT], ['Tomorrow', '2026-10-04'], ['Next week', '2026-10-05']]);
  assert.deepEqual(dayPresets('2026-10-06').map(([label, day]) => [label, day])[2], ['This weekend', '2026-10-10']);
  assert.deepEqual(dayPresets('2026-10-04').map(([label, day]) => [label, day])[2], ['Next weekend', '2026-10-10']);
});

test('A day alone is a plannedDate; a day and time is planned; nothing clears both', () => {
  assert.deepEqual(whenFields({day: SAT, time: ''}), {planned: null, plannedDate: SAT});
  assert.deepEqual(whenFields({day: '', time: ''}), {planned: null, plannedDate: null});
  const timed = whenFields({day: SAT, time: '09:00'});
  assert.equal(timed.plannedDate, null);
  assert.deepEqual(whenOf({planned: timed.planned}), {day: SAT, time: '09:00'});
  assert.deepEqual(whenOf({plannedDate: SAT}), {day: SAT, time: ''});
});

test('Time presets fold in the task’s own time; repeat labels read in words', () => {
  assert.deepEqual(timePresets('16:00'), ['09:00', '14:00', '16:00', '19:00']);
  assert.deepEqual(timePresets('09:00'), ['09:00', '14:00', '19:00']);
  assert.equal(repeatLabel({repeatAfterDays: 3}), '3 days after completion');
  assert.equal(repeatLabel({recurrence: 'weekdays'}), 'Every weekday');
  assert.equal(repeatLabel({}), "Doesn't repeat");
});
