import test from 'node:test';
import assert from 'node:assert/strict';
import {captureReply} from '../src/model-policy.mjs';
import {intentSystemPrompt} from '../prompts/intent-system.mjs';

// A reply sits beside a draft nobody has saved yet. Only the person's Save writes the plan, so a reply that says
// "added" or "scheduled" lies about what happened. Words that claim a finished write:
const CLAIMS = /\b(saved|added|scheduled|set up|created|remembered|sent|booked|put (?:it|this) (?:in|into)|(?:i|i'?ve|i have|i'll|i will) (?:got|put|add|save|schedule|set|create|remember))\b/i;

const op = (...fields) => ({kind: 'create', entity: 'task', fields: fields.map(([name, value, origin = 'stated']) => ({name, op: 'set', value, origin}))});
const CASES = [
  ['a plain capture', {mode: 'capture', operations: [op(['title', 'Walk'])]}, null],
  ['a timed capture', {mode: 'capture', operations: [op(['title', 'Walk'], ['time', 'tomorrow 7 am'])]}, {items: [{title: 'Walk', status: 'ok', label: 'Sun, Oct 11, 7:00 – 7:20 AM'}]}],
  ['a time that needs review', {mode: 'capture', operations: [op(['title', 'Walk'])]}, {items: [{title: 'Walk', status: 'review', reason: 'That time has passed today.'}]}],
  ['a capture with a question', {mode: 'capture', operations: [op(['title', 'Call Priya'])], question: {prompt: 'Which Priya?'}}, null],
];

for (const [name, parsed, schedulePreview] of CASES) test(`the app's own reply for ${name} describes a draft and never claims a write`, () => {
  const reply = captureReply({parsed: {...parsed, reply: 'model text replaced by the app'}, schedulePreview});
  assert.match(reply, /^Draft /);
  assert.doesNotMatch(reply, CLAIMS);
});

test('the model is told it cannot write and must never claim it saved, changed, scheduled, sent or remembered something', () => {
  assert.match(intentSystemPrompt, /You have no write capability\./);
  assert.match(intentSystemPrompt, /Never claim you saved, changed, scheduled, sent or remembered something\./);
  assert.match(intentSystemPrompt, /Never say "set up", "added", "scheduled"/);
});
