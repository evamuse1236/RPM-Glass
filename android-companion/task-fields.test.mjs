import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWhen, dayPresets, whenFields, whenOf, timePresets, repeatLabel, schedulePresets, blockMatches, hashToken}
  from './planner/task-fields.mjs';

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

test('Swipe-to-schedule offers whole dates and times, one tap each, keeping the task’s time where it says so', () => {
  const morning = new Date('2026-10-03T08:05');
  const p = schedulePresets({day: SAT, time: '16:00'}, morning);
  assert.deepEqual(p.map(x => x.key), ['today', 'tonight', 'tomorrow', 'morning', 'later', 'none']);
  assert.deepEqual(p.find(x => x.key === 'tomorrow').value, {day: '2026-10-04', time: '16:00'});
  assert.deepEqual(p.find(x => x.key === 'morning').value, {day: '2026-10-04', time: '09:00'});
  assert.deepEqual(p.find(x => x.key === 'later').value, {day: '2026-10-05', time: '16:00'}, 'Saturday offers next week');
  assert.equal(p.find(x => x.key === 'today').current, true);
  const evening = schedulePresets({day: '', time: ''}, new Date('2026-10-03T20:00'));
  assert.ok(!evening.some(x => x.key === 'tonight'), 'no Tonight after 7 PM');
  assert.ok(!evening.some(x => x.key === 'none'), 'No date only for a dated task');
  assert.deepEqual(evening.find(x => x.key === 'tomorrow').value, {day: '2026-10-04', time: ''});
  const repeating = schedulePresets({day: SAT, time: '19:30'}, morning, {repeating: true});
  assert.ok(repeating.every(x => x.value.day && x.value.time), 'a repeating task keeps a date and time');
});

test('A #word in Quick add matches Blocks by word start first, and is found just before the caret', () => {
  const blocks = [{id: 1, title: 'DAD Excel workbook submitted'}, {id: 2, title: 'Confident for RM Quiz I'}, {id: 3, title: 'Squid notes'}];
  assert.deepEqual(blockMatches(blocks, 'qui').map(b => b.id), [2, 3]);
  assert.deepEqual(blockMatches(blocks, '').map(b => b.id), [1, 2, 3]);
  assert.deepEqual(blockMatches(blocks, 'zzz'), []);
  assert.deepEqual(hashToken('Email the TA #qui'), {query: 'qui', start: 13, end: 17});
  assert.deepEqual(hashToken('Email #qui room', 10), {query: 'qui', start: 6, end: 10});
  assert.equal(hashToken('Email #qui room'), null, 'the caret has moved past the word');
  assert.equal(hashToken('Room#4'), null, 'a # inside a word is not a Block');
});

test('A #word naming exactly one Block chooses it; several matches, one letter or a mid-word hit do not', async () => {
  const {hashTag, withoutTag} = await import('./planner/task-fields.mjs');
  const blocks = [{id: 'q', title: 'Confident for RM Quiz I'}, {id: 'c', title: 'RM critical review drafted with my group'},
    {id: 'd', title: 'DAD Excel workbook submitted'}, {id: 'p', title: 'PMDL post work ready to submit'}];
  const text = 'Email the TA about the quiz room tomorrow #quiz';
  const tag = hashTag(text, blocks);
  assert.equal(tag.block.id, 'q');
  assert.equal(tag.match, '#quiz');
  assert.equal(withoutTag(text, tag), 'Email the TA about the quiz room tomorrow');
  assert.equal(withoutTag('#quiz revise flash cards', hashTag('#quiz revise flash cards', blocks)), 'revise flash cards');
  assert.equal(hashTag('Ask about #rm', blocks), null, 'two Blocks start with RM: chips, not a guess');
  assert.equal(hashTag('Plan #q', blocks), null, 'one letter is not enough');
  assert.equal(hashTag('Plan #ubmit', blocks), null, 'a hit inside a word is not strong');
  assert.equal(hashTag('Plan #sub', blocks), null, 'two Blocks say submit');
  assert.equal(hashTag('Draft #crit then #excel', blocks).block.id, 'd', 'the last strong #word wins');
  assert.equal(hashTag('No tags here', blocks), null);
});
