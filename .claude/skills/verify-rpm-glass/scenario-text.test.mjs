import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForReading} from './scenarios/lib.mjs';
import * as shortReminder from './scenarios/capture-short-reminder.mjs';
import {foregroundNote} from './lib/page.mjs';

const RECEIPT = 'check_circle Added add_task Reminder event Today schedule 4:20 PM notifications Reminder repeat Add repeat inbox Inbox Name it Closing in 6s Undo';
const WORDS = 'set a reminder in 5';

function fakeRun(readings, store) {
  let reads = 0;
  return {
    facts: {},
    do: async () => {},
    shot: async () => {},
    store: async () => store,
    read: async () => readings[Math.min(reads++, readings.length - 1)],
    expect: (condition, message, detail) => { if (!condition) throw Object.assign(new Error(message), {detail}); },
  };
}

test('waitForReading matches the whole reading, not a cut copy', async () => {
  assert.ok(RECEIPT.indexOf('Name it') > 115);
  const t = fakeRun(['', 'Sending', RECEIPT]);
  const found = await waitForReading(t, () => '', /Name it/, {every: 1, timeout: 2000});
  assert.notEqual(found.ms, undefined);
  assert.deepEqual(found.timeline.map(s => s.text), ['', 'Sending', RECEIPT]);
});

test('waitForReading fills the caller timeline even when the read fails', async () => {
  const timeline = [];
  const t = {read: async () => { if (timeline.length) throw new Error('DevTools did not answer'); return 'Sending'; }};
  await assert.rejects(waitForReading(t, () => '', /Name it/, {every: 1, timeout: 2000, timeline}));
  assert.deepEqual(timeline.map(s => s.text), ['Sending']);
});

test('capture-short-reminder passes on the real receipt text', async () => {
  const created = new Date('2026-10-21T16:15:00Z');
  const store = {
    entries: [{raw: WORDS, title: 'Reminder', alertIntent: {type: 'reminder'}, created: created.toISOString(), planned: new Date(+created + 5 * 60000).toISOString()}],
    intentV2: {captures: {c1: {raw: WORDS, localInterpretation: 'short-reminder', modelRuns: []}}},
  };
  const t = fakeRun(['Sending', RECEIPT], store);
  await shortReminder.run(t);
  assert.equal(t.facts.timeline.at(-1).text, RECEIPT);
});

test('a failed page read names the app in front', () => {
  assert.match(foregroundNote('com.sec.android.app.launcher/.Launcher'), /RPM is not in front .*freezes background apps/);
  assert.match(foregroundNote('com.rpm.prototype/.CaptureActivity'), /RPM is in front/);
  assert.equal(foregroundNote(null), '');
});
