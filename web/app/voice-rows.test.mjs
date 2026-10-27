import {test} from 'node:test';
import assert from 'node:assert/strict';
import {voiceCount, voiceRow} from './voice-rows.mjs';

const tz = 'Asia/Kolkata';

test('a new task with a time and a reminder reads as one row with its local time', () => {
  assert.deepEqual(voiceRow({kind: 'add', entity: 'task', id: 1, title: 'Call mom', fields: {title: 'Call mom', start: '2026-10-29T20:00:00+05:30', alert: 'reminder', alertLead: 10}}, tz),
    {icon: 'add_circle', verb: 'Added', title: 'Call mom', detail: 'Thu 29 Oct, 8:00 PM · Reminder 10 min before'});
});

test('complete, remove, move and Block changes name what happened', () => {
  assert.equal(voiceRow({kind: 'complete', entity: 'task', id: 2, title: 'Call Raj', fields: {id: 2, done: true}}, tz).verb, 'Done');
  assert.deepEqual(voiceRow({kind: 'remove', entity: 'task', id: 3, title: 'Buy groceries'}, tz), {icon: 'delete', verb: 'Moved to Trash', title: 'Buy groceries', detail: ''});
  assert.equal(voiceRow({kind: 'move', entity: 'task', id: 4, title: 'Gym', to: 'Health'}, tz).detail, 'to Health');
  assert.equal(voiceRow({kind: 'add', entity: 'block', id: 'b', title: 'Ship'}, tz).verb, 'Added Block');
});

test('a day with no time reads as the day, whatever the time zone', () => {
  assert.equal(voiceRow({kind: 'add', entity: 'task', title: 'Buy milk', fields: {day: '2026-10-29'}}, 'America/Los_Angeles').detail, 'Thu 29 Oct');
  assert.equal(voiceRow({kind: 'change', entity: 'task', title: 'X', fields: {start: null}}, tz).detail, 'Time not set');
});

test('the count line is honest about nothing', () => {
  assert.equal(voiceCount([]), 'Nothing changed');
  assert.equal(voiceCount([{}]), '1 change saved');
  assert.equal(voiceCount([{}, {}]), '2 changes saved');
});
