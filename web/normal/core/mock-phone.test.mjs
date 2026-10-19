import test from 'node:test';
import assert from 'node:assert/strict';
import {createMockPhone, rebase, splitCapture} from './mock-phone.mjs';
import {mockTransport} from './transport-mock.mjs';
import {makeCommand} from './ids.mjs';
import {fixture, NOW, fakeTimers} from './test-kit.mjs';

const phoneWith = (options = {}) => {
  const timers = fakeTimers(), events = [];
  const phone = createMockPhone(rebase(fixture(), NOW), {now: () => NOW, timers, random: () => 0, ...options});
  phone.listen(e => events.push(e));
  return {phone, timers, events};
};
const statusOf = (events, id) => events.find(e => e.type === 'status' && e.id === id);

test('rebase moves the fixture day to today and marks it saved 3 minutes ago', () => {
  const later = NOW + 3 * 864e5;
  const s = rebase(fixture(), later);
  assert.equal(s.tasks.find(t => t.id === 34).plannedDate, '2026-10-22');
  assert.equal(Date.parse(s.tasks.find(t => t.id === 30).planned), Date.parse('2026-10-22T10:00:00+05:30'));
  assert.equal(Date.parse(s.savedAt), later - 180000);
});

test('splitCapture keeps up to three plain tasks', () => {
  assert.deepEqual(splitCapture('call the bank and buy stamps, email Rao; water plants'), ['Call the bank', 'Buy stamps', 'Email Rao']);
  assert.deepEqual(splitCapture('ok'), ['Ok']);
});

test('the phone applies a command after a delay and publishes a new revision', () => {
  const {phone, timers, events} = phoneWith();
  const c = makeCommand('complete', {taskId: 33}, {baseRevision: 42, now: NOW});
  phone.receive(c);
  assert.equal(events.length, 0);
  timers.run();
  assert.equal(statusOf(events, c.id).status, 'applied');
  assert.equal(statusOf(events, c.id).newRevision, 43);
  assert.equal(phone.snapshot.tasks.find(t => t.id === 33).done, true);
});

test('a capture becomes Inbox tasks with a receipt, and undo puts them in Trash', () => {
  const {phone, events} = phoneWith();
  const c = makeCommand('capture', {text: 'Buy stamps and call Amma'}, {baseRevision: 42, now: NOW});
  phone.handle(c);
  const added = phone.snapshot.tasks.filter(t => t.raw === 'Buy stamps and call Amma');
  assert.deepEqual(added.map(t => t.title), ['Buy stamps', 'Call Amma']);
  assert.deepEqual(phone.snapshot.captures.at(-1).receipt.map(r => r.text), ['Added · Buy stamps · Inbox', 'Added · Call Amma · Inbox']);
  phone.handle(makeCommand('undo', {commandId: c.id}, {baseRevision: 43, now: NOW}));
  assert.ok(phone.snapshot.tasks.filter(t => t.raw === 'Buy stamps and call Amma').every(t => t.archived));
  assert.equal(phone.snapshot.captures.at(-1).status, 'undone');
  assert.equal(events.filter(e => e.type === 'status').every(e => e.status === 'applied'), true);
});

test('a change to fields the phone changed since the base revision is a conflict', () => {
  const {phone, events} = phoneWith();
  phone.editOnPhone(33, {planned: '2026-10-19T06:00:00.000Z'});
  const c = makeCommand('reschedule', {taskId: 33, time: '2026-10-19T09:30:00.000Z', day: null}, {baseRevision: 42, now: NOW});
  phone.handle(c);
  assert.equal(statusOf(events, c.id).status, 'conflict');
  const other = makeCommand('edit', {taskId: 33, fields: {notes: 'bring passbook'}}, {baseRevision: 42, now: NOW});
  phone.handle(other);
  assert.equal(statusOf(events, other.id).status, 'applied', 'unrelated fields still apply');
});

test('an invalid command is rejected with words for the person', () => {
  const {phone, events} = phoneWith();
  const c = makeCommand('complete', {taskId: 9999}, {baseRevision: 42, now: NOW});
  phone.handle(c);
  const status = statusOf(events, c.id);
  assert.equal(status.status, 'rejected');
  assert.equal(status.message.message, 'That task is no longer on your phone.');
});

test('a command the phone has not taken yet can be cancelled', () => {
  const {phone, timers, events} = phoneWith();
  const c = makeCommand('complete', {taskId: 33}, {baseRevision: 42, now: NOW});
  phone.receive(c);
  assert.equal(phone.cancel(c.id), true);
  timers.run();
  assert.equal(statusOf(events, c.id), undefined);
  assert.equal(phone.cancel(c.id), false);
});

test('scenarios: a closed phone leaves commands pending; unlinked says so', async () => {
  const timers = fakeTimers(), events = [];
  const stale = mockTransport(fixture(), {scenario: 'stale', now: () => NOW, timers});
  stale.start(e => events.push(e));
  timers.run();
  const loaded = events.find(e => e.type === 'loaded');
  assert.equal(Date.parse(loaded.snapshot.savedAt), NOW - 2 * 3600000);
  await stale.send(makeCommand('complete', {taskId: 33}, {baseRevision: 42, now: NOW}));
  timers.run();
  assert.equal(events.some(e => e.type === 'status'), false);

  const unlinkedEvents = [];
  mockTransport(fixture(), {scenario: 'unlinked', now: () => NOW, timers}).start(e => unlinkedEvents.push(e));
  assert.deepEqual(unlinkedEvents, [{type: 'unlinked'}]);
});

test('the conflict scenario opens with the phone version and a conflict to resolve', () => {
  const timers = fakeTimers(), events = [];
  mockTransport(fixture(), {scenario: 'conflict', now: () => NOW, timers}).start(e => events.push(e));
  timers.run();
  assert.equal(events.find(e => e.type === 'status')?.status, 'conflict');
  const latest = events.filter(e => e.type === 'loaded').at(-1).snapshot;
  assert.equal(latest.revision, 43);
});
