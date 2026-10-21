import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../fixtures/snapshot.json' with {type: 'json'};
import {validateCommand} from '../contract/validate.mjs';
import {plannerView, commandFor, savedLabel} from './view.mjs';

const now = new Date('2026-10-19T12:00:00+05:30');
const ids = rows => rows.map(r => r.id);

test('Today lists the day in time order, untimed last; the Inbox holds undated tasks with no Block', () => {
  const view = plannerView(fixture, now);
  assert.deepEqual(ids(view.agenda), [30, 33, 31, 35, 32, 34]);
  assert.deepEqual(ids(view.inbox), [24, 25, 26, 27, 28, 29]);
  assert.equal(view.agenda.find(r => r.id === 30).meta, '10:00 AM · 1 h 30 min');
  assert.equal(view.agenda.find(r => r.id === 34).meta, 'Today · 15 min');
  assert.deepEqual(view.agenda.find(r => r.id === 30).result, {id: 'block-1', title: 'RM critical review drafted with my group', purpose: 'So Sunday\'s submission is calm, not a 10 PM scramble'});
});

test('the weekly review repeats: Today shows this week\'s occurrence and completing it names that occurrence', () => {
  const review = plannerView(fixture, now).agenda.find(r => r.id === 32);
  assert.equal(review.occurrence, '2026-10-19T14:00:00.000Z');
  assert.deepEqual(commandFor('complete', review, fixture, now, crypto.randomUUID()).args, {taskId: 32, occurrence: '2026-10-19T14:00:00.000Z'});
});

test('a past dated task is overdue on Today and says so', () => {
  const later = new Date('2026-10-23T09:00:00+05:30');
  const row = plannerView(fixture, later).agenda.find(r => r.id === 21);
  assert.equal(row.overdue, true);
  assert.match(row.meta, /^Overdue/);
});

test('Result cards keep the Purpose, count done tasks, and list the open Plan by priority', () => {
  const card = plannerView(fixture, now).results.find(r => r.id === 'block-1');
  assert.equal(card.purpose, 'So Sunday\'s submission is calm, not a 10 PM scramble');
  assert.equal(card.project, 'Term 1 coursework');
  assert.deepEqual([card.done, card.total], [2, 7]);
  assert.deepEqual(ids(card.plan), [3, 30, 31, 4, 22]);
});

test('water counts only today\'s glasses against the goal', () => {
  assert.deepEqual(plannerView(fixture, now).water, {glasses: 3, goal: 8});
});

test('every quick action builds a command the contract accepts, on the snapshot revision the user saw', () => {
  const view = plannerView(fixture, now), timed = view.agenda.find(r => r.id === 33), inbox = view.inbox[0];
  for (const action of ['complete', 'uncomplete', 'today', 'tomorrow', 'unschedule', 'archive', 'restore']) {
    const command = commandFor(action, timed, fixture, now, crypto.randomUUID());
    assert.equal(validateCommand(command), command);
    assert.equal(command.baseRevision, fixture.revision);
  }
  assert.deepEqual(commandFor('tomorrow', timed, fixture, now).args, {taskId: 33, time: '2026-10-20T06:30:00.000Z', day: null});
  assert.deepEqual(commandFor('tomorrow', inbox, fixture, now).args, {taskId: 24, time: null, day: '2026-10-20'});
});

test('the saved line is honest when the phone has never saved', () => {
  assert.equal(savedLabel('1970-01-01T00:00:00.000Z', now), 'Not saved from the phone yet');
  assert.equal(savedLabel('2026-10-19T11:55:00+05:30', now), 'Phone saved 5 min ago');
  assert.equal(savedLabel('2026-10-18T19:00:00+05:30', now), 'Phone saved Yesterday 7:00 PM');
});
