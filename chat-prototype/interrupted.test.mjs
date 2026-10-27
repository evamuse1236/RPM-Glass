import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore, markInterrupted} from './companion-state.mjs';
import {retryOnChange} from '../android-companion/save-retry.mjs';

const pending = () => {
  const data = freshStore(), conversation = data.conversations[0];
  conversation.messages.push({id: 'm1', role: 'user', text: 'Plan my week'});
  data.inFlight = {conversationId: conversation.id};
  return data;
};

test('an interrupted request is cleared and answered once in its conversation', () => {
  const data = pending();
  assert.equal(markInterrupted(data), true);
  assert.equal(data.inFlight, null);
  assert.deepEqual(data.conversations[0].messages.map(message => [message.role, message.error]), [['user', undefined], ['assistant', 'interrupted']]);
  assert.equal(markInterrupted(data), false);
  assert.equal(data.conversations[0].messages.length, 2);
});

test('interrupted recovery reloads after a conflicting save and does not answer twice', async () => {
  let stored = pending(), data = structuredClone(stored), saves = 0;
  const save = async () => {
    if (data.version !== stored.version) throw Object.assign(new Error('Version conflict'), {code: 'VERSION_CONFLICT'});
    saves++; stored = {...structuredClone(data), version: data.version + 1}; data = structuredClone(stored);
  };
  stored = {...stored, version: 1, memories: ['saved by Capture']};
  await retryOnChange(async () => { if (markInterrupted(data)) await save(); }, async () => { data = structuredClone(stored); });
  assert.equal(saves, 1);
  assert.deepEqual(stored.memories, ['saved by Capture']);
  assert.equal(stored.inFlight, null);
  assert.equal(stored.conversations[0].messages.filter(message => message.error === 'interrupted').length, 1);
});
