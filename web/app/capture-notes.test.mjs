import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureNotes, RECENT} from './capture-notes.mjs';

const main = readFileSync(new URL('./main.mjs', import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-27T10:00:00Z');
const at = ago => new Date(NOW - ago).toISOString();

function entry(id, status, {text = 'call mum tomorrow at 5', message, ago = 60000} = {}) {
  return {command: {id, type: 'capture', args: {text}, createdAt: at(ago)}, status, message, newRevision: 4};
}

const run = (outbox, {captures = [], dismissed = new Set(), settled = e => e.status !== 'sending'} = {}) =>
  captureNotes({outbox, captures, settled, dismissed, now: NOW});

test('a sent Capture waits for the phone, then shows the phone\'s receipt under the words', () => {
  assert.deepEqual(run([entry('a', 'sending')]), [{id: 'a', icon: 'schedule', tone: 'waiting', text: 'Capture “call mum tomorrow at 5” is waiting for your phone.', lines: []}]);
  const captures = [{id: 'a', text: 'call mum tomorrow at 5', receipt: [{text: 'Added “Call mum” to Today at 5 pm'}, {text: 'Kept in Inbox: nothing else'}]}];
  assert.deepEqual(run([entry('a', 'applied', {message: 'Capture saved on the phone.'})], {captures}),
    [{id: 'a', icon: 'check_circle', tone: 'done', text: '“call mum tomorrow at 5”', lines: ['Added “Call mum” to Today at 5 pm', 'Kept in Inbox: nothing else'], dismissible: true}]);
});

test('without a receipt yet, the phone\'s own result line shows', () => {
  const [note] = run([entry('a', 'applied', {message: 'Words saved. Open Capture on the phone to review the draft.'})], {captures: [{id: 'other', receipt: [{text: 'no'}]}]});
  assert.deepEqual(note.lines, ['Words saved. Open Capture on the phone to review the draft.']);
});

test('a refused Capture is a problem note; dismissed, old and non-Capture entries show nothing', () => {
  const [note] = run([entry('a', 'rejected', {message: 'Your words were kept on the phone. Open Capture to retry.'})]);
  assert.equal(note.tone, 'problem');
  assert.equal(note.text, 'Your words were kept on the phone. Open Capture to retry.');
  assert.equal(note.dismissible, true);
  const plan = {command: {id: 'p', type: 'plan', args: {}, createdAt: at(0)}, status: 'applied'};
  assert.deepEqual(run([entry('a', 'applied'), entry('b', 'applied', {ago: RECENT + 1}), plan], {dismissed: new Set(['a'])}), []);
});

test('the website builds its notes from captureNotes and lets a done note be dismissed', () => {
  assert.match(main, /captureNotes\(\{outbox, captures: snapshot\?\.captures, settled: client\.settled, dismissed\}\)/);
  assert.match(main, /onDismiss: note\.dismissible \? \(\) => \{ dismissed\.add\(note\.id\); render\(\); \} : null/);
  assert.match(main, /note\.tone === 'problem' \? userMessage\(note\.text\)/);
  assert.match(main, /const changes = waiting\.filter\(entry => entry\.command\.type !== 'capture'\);/);
});
