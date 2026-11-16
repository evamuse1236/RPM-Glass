import test from 'node:test';
import assert from 'node:assert/strict';
import {editPlan, inboxRows, localDay} from './planner-state.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {dayTasks} from './planner-ux.mjs';
import {inboxGroups} from './planner/task-lists.mjs';

const DAY = 864e5;
const at = (offsetDays, clock) => new Date(Date.parse(localDay() + 'T' + clock) + offsetDays * DAY).toISOString();
const ids = list => list.map(task => task.title);

test('the Inbox files a repeating task that falls today under On Today, as the Today page lists it', () => {
  const data = freshStore();
  const now = new Date();
  const add = fields => editPlan(data, {type: 'saveTask', fields}, now);
  add({title: 'Stretch', planned: at(-6, '21:00:00'), recurrence: 'daily'});
  add({title: 'Dentist', planned: at(1, '10:00:00')});
  add({title: 'Pay rent', plannedDate: localDay()});
  // A weekly series that started yesterday next falls in six days, not today.
  add({title: 'Review', planned: at(-1, '21:00:00'), recurrence: 'weekly'});
  add({title: 'Someday'});
  const groups = inboxGroups(inboxRows(data));
  assert.ok(JSON.stringify(dayTasks(data, localDay())).includes('Stretch'), 'Today lists the series');
  assert.deepEqual(ids(groups.today).sort(), ['Pay rent', 'Stretch']);
  assert.deepEqual(ids(groups.later), ['Dentist', 'Review']);
  assert.deepEqual(ids(groups.open), ['Someday']);
});
