import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureNotes, captureOutcome, dismissedNotes, DISMISSED_MAX, RECENT} from './capture-notes.mjs';

const main = readFileSync(new URL('./main.mjs', import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-27T10:00:00Z');
const at = ago => new Date(NOW - ago).toISOString();

function entry(id, status, {text = 'call mum tomorrow at 5', message, ago = 60000} = {}) {
  return {command: {id, type: 'capture', args: {text}, createdAt: at(ago)}, status, message, newRevision: 4};
}

const run = (outbox, {captures = [], dismissed = new Set()} = {}) => captureNotes({outbox, captures, dismissed, now: NOW});
const said = '“call mum tomorrow at 5”';

test('a Capture not yet confirmed by the server says Saving', () => {
  assert.deepEqual(run([entry('a', 'sending')]), [{id: 'a', icon: 'schedule', tone: 'waiting', text: said, lines: ['Saving']}]);
});

test('a saved or sorting Capture says the server is sorting the words', () => {
  for (const status of ['saved', 'sorting']) {
    const [note] = run([entry('a', 'pending', {message: 'Words saved. Waiting for Capture.'})], {captures: [{id: 'a', text: 'call mum tomorrow at 5', status, receipt: []}]});
    assert.deepEqual(note.lines, ['Sorting your words']);
    assert.equal(note.dismissible, undefined);
  }
  const [early] = run([entry('a', 'applied')]);
  assert.deepEqual(early.lines, ['Sorting your words']);
});

test('an applied Capture shows its receipt under the words', () => {
  const captures = [{id: 'a', text: 'call mum tomorrow at 5', status: 'applied', receipt: [{text: 'Added “Call mum” to Today at 5 pm'}, {text: 'Kept in Inbox: nothing else'}]}];
  assert.deepEqual(run([entry('a', 'applied')], {captures}),
    [{id: 'a', icon: 'check_circle', tone: 'done', text: said, lines: ['Added “Call mum” to Today at 5 pm', 'Kept in Inbox: nothing else'], dismissible: true}]);
  assert.deepEqual(run([entry('a', 'applied')], {captures: [{id: 'a', status: 'applied', receipt: []}]})[0].lines, ['Saved']);
});

test('a Capture that needs an answer shows the question', () => {
  for (const question of ['Which day is the call?', {text: 'Which day is the call?'}]) {
    const [note] = run([entry('a', 'pending')], {captures: [{id: 'a', status: 'needs-answer', question, receipt: []}]});
    assert.deepEqual([note.icon, note.lines, note.dismissible], ['help', ['Which day is the call?'], true]);
  }
});

test('a Capture whose words were kept says to send again', () => {
  const [note] = run([entry('a', 'pending')], {captures: [{id: 'a', status: 'words-kept', receipt: []}]});
  assert.deepEqual([note.tone, note.text, note.lines], ['problem', said, ['Your words were kept. Send again to retry.']]);
});

test('no Capture note or outcome mentions the phone', () => {
  const statuses = ['saved', 'sorting', 'applied', 'needs-answer', 'words-kept'];
  const notes = run([entry('s', 'sending'), entry('r', 'rejected'), ...statuses.map(status => entry(status, 'pending'))],
    {captures: statuses.map(status => ({id: status, status, question: 'When?', receipt: []}))});
  assert.equal(notes.length, 7);
  for (const note of notes) assert.doesNotMatch([note.text, ...note.lines].join(' '), /phone/i);
  for (const status of statuses) assert.doesNotMatch(captureOutcome({status, receipt: []}).join(' '), /phone/i);
});

test('a refused Capture is a problem note; dismissed, old and non-Capture entries show nothing', () => {
  const [note] = run([entry('a', 'rejected', {message: 'The sync server did not accept this change.'})]);
  assert.equal(note.tone, 'problem');
  assert.equal(note.text, 'The sync server did not accept this change.');
  assert.equal(note.dismissible, true);
  assert.equal(run([entry('a', 'conflict')])[0].text, 'This capture was not saved.');
  const plan = {command: {id: 'p', type: 'plan', args: {}, createdAt: at(0)}, status: 'applied'};
  const old = [{id: 'b', status: 'applied', receipt: [{text: 'Added'}]}];
  assert.deepEqual(run([entry('a', 'applied'), entry('b', 'applied', {ago: RECENT + 1}), entry('c', 'applied', {ago: RECENT + 1}), plan], {captures: old, dismissed: new Set(['a'])}), []);
});

function memoryStorage() {
  const data = new Map();
  return {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), data};
}

test('a dismissed Capture note stays hidden after the page reloads', () => {
  const storage = memoryStorage();
  dismissedNotes(storage).add('a');
  const reloaded = dismissedNotes(storage);
  assert.deepEqual(run([entry('a', 'applied'), entry('b', 'rejected')], {dismissed: reloaded}).map(note => note.id), ['b']);
});

test('the browser keeps only the newest dismissed notes, and unreadable saved data starts empty', () => {
  const storage = memoryStorage();
  const dismissed = dismissedNotes(storage);
  for (let i = 0; i <= DISMISSED_MAX; i++) dismissed.add(`n${i}`);
  const reloaded = dismissedNotes(storage);
  assert.equal(reloaded.has('n0'), false);
  assert.equal(reloaded.has('n1'), true);
  assert.equal(reloaded.has(`n${DISMISSED_MAX}`), true);
  const [[key, saved]] = [...storage.data];
  assert.equal(JSON.parse(saved).length, DISMISSED_MAX);
  for (const junk of ['{', '{"a":1}', '[1,null]']) {
    const broken = memoryStorage();
    broken.setItem(key, junk);
    assert.equal(dismissedNotes(broken).has('a'), false, junk);
  }
  const full = {getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }};
  const kept = dismissedNotes(full);
  kept.add('z');
  assert.equal(kept.has('z'), true);
});

test('the website builds its notes from captureNotes and conflictNotes and lets a done note be dismissed', () => {
  assert.match(main, /const dismissed = dismissedNotes\(localStorage\);/);
  assert.match(main, /captureNotes\(\{outbox, captures: snapshot\?\.captures, dismissed\}\), \.\.\.conflictNotes\(\{conflicts: snapshot\?\.conflicts, snapshot, dismissed\}\)/);
  assert.match(main, /onDismiss: note\.dismissible \? \(\) => \{ dismissed\.add\(note\.id\); render\(\); \} : null/);
  assert.match(main, /note\.tone === 'problem' \? userMessage\(note\.text\)/);
  assert.match(main, /const changes = unconfirmed\(\)\.filter\(entry => entry\.command\.type !== 'capture'\);/);
});
