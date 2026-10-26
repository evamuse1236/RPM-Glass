import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWhen} from './planner/task-fields.mjs';

const MON = '2026-10-26';
const at = clock => new Date(`${MON}T${clock}`);
const read = (words, clock = '09:00') => parseWhen(words, MON, at(clock));
const when = (words, clock) => {
  const found = read(words, clock);
  return found && {day: found.day, time: found.time, match: found.match};
};

test('a time with no day means today, or tomorrow once that time has passed', () => {
  assert.deepEqual(when('call mom 8pm'), {day: MON, time: '20:00', match: '8pm'});
  assert.deepEqual(when('call mom at 8pm'), {day: MON, time: '20:00', match: 'at 8pm'});
  assert.deepEqual(when('call mom at 8pm', '21:15'), {day: '2026-10-27', time: '20:00', match: 'at 8pm'});
  assert.deepEqual(when('standup 9:30 am', '09:29'), {day: MON, time: '09:30', match: '9:30 am'});
  assert.deepEqual(when('standup 9:30 am', '09:31'), {day: '2026-10-27', time: '09:30', match: '9:30 am'});
});

test('a time may come before or after the day', () => {
  assert.deepEqual(when('call mom at 8 PM today'), {day: MON, time: '20:00', match: 'at 8 PM today'});
  assert.deepEqual(when('call mom at 8 PM today', '21:00'), {day: MON, time: '20:00', match: 'at 8 PM today'},
    'a day written out is kept even when the time has passed');
  assert.deepEqual(when('dentist tomorrow 9:30am'), {day: '2026-10-27', time: '09:30', match: 'tomorrow 9:30am'});
  assert.deepEqual(when('dentist 9:30am tomorrow'), {day: '2026-10-27', time: '09:30', match: '9:30am tomorrow'});
  assert.deepEqual(when('gym tonight'), {day: MON, time: '19:00', match: 'tonight'});
  assert.deepEqual(when('gym 8pm tonight'), {day: MON, time: '20:00', match: '8pm tonight'});
  assert.deepEqual(when('report 5pm friday'), {day: '2026-10-30', time: '17:00', match: '5pm friday'});
});

test('the span covers exactly the words read, so the sheet can highlight them', () => {
  const words = 'call mom at 8 PM today';
  const found = read(words);
  assert.equal(words.slice(found.start, found.end), 'at 8 PM today');
});

test('numbers that are not a clock are not read as one', () => {
  for (const words of ['buy 8 eggs', 'room 13pm', 'chapter 8', 'call at 8', 'reply to 3pmail', 'march on the capital']) {
    assert.equal(read(words), null, words);
  }
});
