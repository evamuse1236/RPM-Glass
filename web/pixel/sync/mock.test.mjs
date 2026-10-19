import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMockPhone} from './mock.mjs';
import {createStore} from './store.mjs';
import {splitCapture, readDay} from './mock-capture.mjs';
import {settled} from './state.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../../fixtures/snapshot.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-10-19T10:05:00+05:30');

function fakeTimers() {
  let queue = [];
  return {
    setTimeout(fn, ms) { queue.push({fn, ms}); },
    async drain() {
      for (let round = 0; round < 20 && queue.length; round++) {
        const batch = queue;
        queue = [];
        for (const {fn} of batch) fn();
        await new Promise(resolve => setImmediate(resolve));
      }
    },
  };
}

function demo(scenario = null) {
  const timers = fakeTimers();
  const phone = createMockPhone({fixture, scenario, now: () => NOW, delay: () => 1500, timers});
  const store = createStore({transport: phone, now: () => NOW});
  store.start();
  return {store, timers};
}
const task = (store, id) => store.view().snapshot.tasks.find(t => t.id === id);

test('the demo phone applies a command after a delay and publishes a newer snapshot', async () => {
  const {store, timers} = demo();
  await timers.drain();
  assert.equal(store.state.phase, 'ready');
  assert.match(store.state.snapshot.savedAt, /^2026-10-19T04:32/);
  const entry = store.act('complete', {taskId: 30}, {label: 'Done'});
  assert.equal(task(store, 30).done, true);
  assert.ok(store.view().pending.has('task:30'));
  await timers.drain();
  const final = store.state.entries.find(e => e.command.id === entry.command.id);
  assert.equal(final.status, 'applied');
  assert.equal(store.state.snapshot.revision, 43);
  assert.ok(settled(final, store.state.snapshot));
  assert.equal(store.view().pending.size, 0);

  store.undo(entry.command.id);
  await timers.drain();
  assert.equal(store.state.snapshot.tasks.find(t => t.id === 30).done, false);
});

test('a capture becomes Inbox tasks with a receipt, and Undo sends them to Trash', async () => {
  const {store, timers} = demo();
  await timers.drain();
  const entry = store.act('capture', {text: 'Call Amma tomorrow and buy ink'}, {label: 'Capture'});
  await timers.drain();
  const snapshot = store.state.snapshot;
  const capture = snapshot.captures.find(c => c.id === entry.command.id);
  assert.deepEqual(capture.receipt.map(r => r.text), ['Added · Call Amma · Tue 20 Oct', 'Added · Buy ink · Inbox']);
  assert.equal(snapshot.tasks.at(-2).plannedDate, '2026-10-20');
  store.undo(entry.command.id);
  await timers.drain();
  assert.ok(store.state.snapshot.tasks.slice(-2).every(t => t.archived));
});

test('the phone rejects a change to a task it no longer has', async () => {
  const {store, timers} = demo();
  await timers.drain();
  const entry = store.act('complete', {taskId: 999});
  await timers.drain();
  const final = store.state.entries.find(e => e.command.id === entry.command.id);
  assert.equal(final.status, 'rejected');
  assert.equal(final.message, 'This task was deleted there.');
});

test('scenarios: a quiet phone leaves commands pending; offline keeps them queued until online', async () => {
  const stale = demo('stale');
  await stale.timers.drain();
  stale.store.act('log-water', {at: NOW.toISOString()});
  await stale.timers.drain();
  assert.equal(stale.store.state.entries.at(-1).status, 'pending');

  const offline = demo('offline');
  await offline.timers.drain();
  offline.store.act('complete', {taskId: 30});
  await offline.timers.drain();
  assert.equal(offline.store.state.entries.at(-1).status, 'queued');
  offline.store.setOnline(true);
  await offline.timers.drain();
  assert.equal(offline.store.state.entries.at(-1).status, 'pending');
});

test('seeded scenarios show rejected, conflict and pending plates on load', async () => {
  for (const [scenario, status] of [['reject', 'rejected'], ['conflict', 'conflict'], ['pending', 'pending']]) {
    const {store, timers} = demo(scenario);
    await timers.drain();
    assert.equal(store.state.entries[0].status, status, scenario);
  }
});

test('link accepts an eight-character code from the phone alphabet only', async () => {
  const timers = fakeTimers();
  const phone = createMockPhone({fixture, scenario: 'unlinked', now: () => NOW, timers});
  const events = [];
  phone.start(e => events.push(e));
  assert.equal(events[0].type, 'unlinked');
  const bad = assert.rejects(phone.link('ABCD1234'), /didn't match/);
  await timers.drain();
  await bad;
  const good = phone.link('ABCD2345');
  await timers.drain();
  await good;
});

test('capture words split on "and" and commas, and day words become a date', () => {
  assert.deepEqual(splitCapture('call amma, buy ink and post the form, then sleep'), ['call amma', 'buy ink', 'post the form']);
  assert.deepEqual(readDay('buy ink on Friday', '2026-10-19'), {title: 'buy ink', day: '2026-10-23'});
  assert.deepEqual(readDay('buy ink', '2026-10-19'), {title: 'buy ink', day: null});
});
