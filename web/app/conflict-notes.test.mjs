import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {conflictNotes} from './conflict-notes.mjs';

const snapshot = {tasks: [{id: 7, title: 'Call mum'}], blocks: [{id: 'b1', name: 'Health'}]};
const notes = (conflicts, dismissed = new Set()) => conflictNotes({conflicts, snapshot, dismissed});
const textOf = conflict => notes([conflict])[0].text;

test('a renamed task shows the kept and the other version, naming the device it came from', () => {
  const conflict = {id: 'c1', key: 'task:7', group: 'title', kept: {title: 'Call mum at 5'}, lost: {title: 'Call mum at 6'}, lostFrom: 'server', at: '2026-10-27T09:00:00Z'};
  assert.deepEqual(notes([conflict]), [{id: 'conflict:c1', icon: 'call_split', tone: 'waiting', lines: [], dismissible: true,
    text: 'Changed on two devices. Kept “Call mum at 5”. Other version from your website: “Call mum at 6”.'}]);
  assert.match(textOf({...conflict, lostFrom: 'phone'}), /Other version from your phone: “Call mum at 6”\.$/);
});

test('a text field other than the name says whose field changed, named from the snapshot', () => {
  assert.equal(textOf({id: 'c2', key: 'task:7', group: 'notes', kept: {notes: 'Ask about Sunday'}, lost: {notes: 'Ask about Monday'}, lostFrom: 'phone'}),
    '“Call mum” notes changed on two devices. Kept “Ask about Sunday”. Other version from your phone: “Ask about Monday”.');
});

test('a deleted record says it stays deleted', () => {
  assert.equal(textOf({id: 'c3', key: 'block:b1', group: 'record', kept: null, lost: {id: 'b1', name: 'Health'}, lostFrom: 'server'}),
    '“Health” was deleted on one device and changed on the other. It stays deleted.');
});

test('a non-text change is one short plain sentence', () => {
  assert.equal(textOf({id: 'c4', key: 'task:7', group: 'alertIntent', kept: {alertIntent: 'none'}, lost: {alertIntent: 'at'}}),
    '“Call mum” alert changed on two devices. Kept the newer change.');
  assert.equal(textOf({id: 'c5', key: 'task:99', group: 'schedule', kept: {date: '2026-10-28'}, lost: {date: '2026-10-29'}}),
    'A task schedule changed on two devices. Kept the newer change.');
  assert.equal(textOf({id: 'c6', key: 'week:2026-W44', group: 'outcomeIds', kept: {}, lost: {}}),
    'This week outcome ids changed on two devices. Kept the newer change.');
});

test('a dismissed conflict stays hidden, and a conflict without an id gets a stable one', () => {
  const plain = {key: 'task:7', group: 'minutes', kept: {minutes: 30}, lost: {minutes: 45}, at: '2026-10-27T09:00:00Z'};
  const [note] = notes([plain]);
  assert.equal(note.id, 'conflict:task:7|minutes|2026-10-27T09:00:00Z');
  assert.equal(note.text, '“Call mum” estimate changed on two devices. Kept the newer change.');
  assert.deepEqual(notes([plain], new Set([note.id])), []);
  assert.deepEqual(conflictNotes({conflicts: undefined, snapshot, dismissed: new Set()}), []);
});

test('the website asks for no phone wait: no waiting-for-phone words in its page or script', () => {
  const words = ['index.html', 'main.mjs', 'sync-marks.mjs', 'capture-notes.mjs', 'plan-queue.mjs']
    .map(file => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')).join('\n');
  for (const gone of [/waiting for (your )?phone/i, /Send to phone/, /Phone saved/, /Sent to your phone/, /sorts it the next time it syncs/, /phone stays in charge/i])
    assert.doesNotMatch(words, gone);
});
