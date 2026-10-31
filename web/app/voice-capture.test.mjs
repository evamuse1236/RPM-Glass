import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeElement, installFakeDom} from '../../android-companion/fake-dom.mjs';
import {VoiceError} from '../../android-companion/voice-client.mjs';
import {mountVoice, settleRamble, voiceToken} from './voice-capture.mjs';

const ids = () => { let n = 0; return () => `00000000-0000-4000-8000-00000000000${++n}`; };
const now = () => new Date('2026-10-28T06:30:00Z');
const batch = {type: 'batch', ops: [{type: 'saveTask', fields: {title: 'Buy milk'}}]};
const change = {kind: 'add', entity: 'task', id: 1000000001, title: 'Buy milk', fields: {title: 'Buy milk', day: '2026-10-29'}};

function fakeQueue({pending = 0, fail = null, data = {}} = {}) {
  const commits = [];
  let last = null;
  return {commits, data: () => data, pendingIds: () => new Set(Array.from({length: pending}, (_, i) => `p${i}`)), lastUndoId: () => last,
    commit(op, opts) { commits.push({op, opts}); if (fail) throw fail; if (op.type !== 'undo') last = opts.id; else last = null; }};
}
const fakeClient = () => { const sent = []; return {sent, state: {snapshot: {revision: 7}}, async send(c) { sent.push(c); }}; };

test('a ramble saves the heard words as a voice capture first, then commits its batch as one plan command on its own id', async () => {
  const client = fakeClient(), queue = fakeQueue();
  const out = await settleRamble({result: {heard: 'Buy milk tomorrow', said: 'Added Buy milk.', changes: [change], batch, uuids: ['u'], created: [1000000001]},
    client, queue, timeZone: 'Asia/Kolkata', uuid: ids(), now});
  assert.equal(client.sent.length, 1);
  assert.deepEqual(client.sent[0], {id: '00000000-0000-4000-8000-000000000002', type: 'capture', timezone: 'Asia/Kolkata', baseRevision: 7, createdAt: now().toISOString(),
    args: {text: 'Buy milk tomorrow', source: 'voice', planCommandId: '00000000-0000-4000-8000-000000000001'}});
  assert.deepEqual(queue.commits, [{op: batch, opts: {id: '00000000-0000-4000-8000-000000000001', uuids: ['u'], tasks: [1000000001]}}]);
  assert.deepEqual(out, {phase: 'done', heard: 'Buy milk tomorrow', saved: true, said: 'Added Buy milk.', changes: [change], commandId: '00000000-0000-4000-8000-000000000001'});
});

test('a failed ramble or a refused commit keeps the words and says so in plain words', async () => {
  const client = fakeClient(), queue = fakeQueue();
  const failed = await settleRamble({result: {heard: 'Buy milk', failed: 'The connection dropped.', batch, changes: []}, client, queue, timeZone: 'UTC', uuid: ids(), now});
  assert.equal(failed.phase, 'failed');
  assert.equal(failed.saved, true);
  assert.equal(client.sent[0].args.planCommandId, undefined);
  assert.deepEqual(queue.commits, []);
  const refused = await settleRamble({result: {heard: 'Buy milk', batch, changes: [change], uuids: [], created: []}, client: fakeClient(),
    queue: fakeQueue({fail: new Error('Your plan changed while you talked. Your words are saved.')}), timeZone: 'UTC', uuid: ids(), now});
  assert.equal(refused.phase, 'failed');
  assert.match(refused.error, /plan changed/);
});

test('no key on the server becomes voice_unavailable, which hides the mic', async () => {
  const error = Object.assign(new Error('x'), {code: 'voice_unavailable'});
  await assert.rejects(voiceToken({voiceToken: async () => { throw error; }}, 'UTC')(), e => e instanceof VoiceError && e.code === 'voice_unavailable');
});

function sheet() {
  installFakeDom();
  const nodes = {};
  for (const [id, tag] of Object.entries({'capture-form': 'form', 'voice-mic': 'button', 'voice-panel': 'section', 'voice-status': 'p', 'voice-heard': 'p',
    'voice-changes': 'ul', 'voice-said': 'p', 'voice-note': 'p', 'voice-stop': 'button', 'voice-undo': 'button', 'voice-retry': 'button'})) nodes[id] = new FakeElement(tag);
  nodes['voice-mic'].append(Object.assign(new FakeElement('span'), {className: 'ms'}));
  document.getElementById = id => nodes[id];
  return nodes;
}

function withMic(t) {
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {value: {getUserMedia() {}}, configurable: true});
  globalThis.AudioWorkletNode = function () {};
  t.after(() => { delete globalThis.navigator.mediaDevices; delete globalThis.AudioWorkletNode; });
}

test('the mic waits while changes are sending, and shows the receipt rows with one Undo after a ramble', async t => {
  const nodes = sheet();
  withMic(t);
  const queue = fakeQueue({pending: 1}), client = fakeClient();
  let resolve;
  const voice = mountVoice({client, queue, render() {}, onRetry() {},
    start: ({onChange}) => { onChange({phase: 'listening', heard: 'Buy milk', changes: []}); return {stop() {}, done: new Promise(r => { resolve = r; })}; }});
  voice.refresh();
  assert.equal(nodes['voice-mic'].hidden, false);
  assert.equal(nodes['voice-mic'].disabled, true);
  queue.pendingIds = () => new Set();
  voice.refresh();
  assert.equal(nodes['voice-mic'].disabled, false);
  nodes['voice-mic'].click();
  assert.equal(nodes['capture-form'].dataset.voice, 'listening');
  assert.equal(nodes['voice-heard'].textContent, 'Buy milk');
  assert.equal(nodes['voice-stop'].hidden, false);
  resolve({heard: 'Buy milk', said: 'Added Buy milk.', changes: [change], batch, uuids: [], created: [1000000001]});
  await new Promise(r => setTimeout(r, 0));
  assert.equal(nodes['capture-form'].dataset.voice, 'done');
  assert.equal(nodes['voice-status'].textContent, '1 change saved');
  assert.equal(nodes['voice-changes'].children.length, 1);
  assert.equal(nodes['voice-undo'].hidden, false);
  nodes['voice-undo'].click();
  assert.deepEqual(queue.commits.at(-1).op, {type: 'undo'});
  assert.equal(nodes['voice-status'].textContent, 'Changes undone');
  assert.equal(nodes['voice-undo'].hidden, true);
});

test('a server with no key hides the mic for the page', async t => {
  const nodes = sheet();
  withMic(t);
  const voice = mountVoice({client: fakeClient(), queue: fakeQueue(), render() {}, onRetry() {},
    start: () => ({stop() {}, done: Promise.resolve({heard: '', failed: 'Voice is not set up on this server.', code: 'voice_unavailable'})})});
  voice.refresh();
  nodes['voice-mic'].click();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(nodes['voice-mic'].hidden, true);
  assert.equal(nodes['voice-panel'].hidden, true);
});

test('while listening the browser recognizer shows the words at once; Gemini\'s words win, and Stop ends the recognizer', async t => {
  const nodes = sheet();
  withMic(t);
  let say, stopped = 0, onChange, resolve;
  const voice = mountVoice({client: fakeClient(), queue: fakeQueue(), render() {}, onRetry() {},
    liveWords: ({onWords}) => { say = onWords; return {stop() { stopped++; }}; },
    start: options => { onChange = options.onChange; onChange({phase: 'listening', heard: '', changes: []}); return {stop() {}, done: new Promise(r => { resolve = r; })}; }});
  voice.refresh();
  nodes['voice-mic'].click();
  assert.equal(nodes['voice-heard'].hidden, true, 'nothing heard yet');
  say('Call mom');
  assert.equal(nodes['voice-heard'].textContent, 'Call mom');
  assert.equal(nodes['voice-heard'].hidden, false);
  onChange({phase: 'listening', heard: 'Call Amma at eight', changes: []});
  say('Call mom at 8');
  assert.equal(nodes['voice-heard'].textContent, 'Call Amma at eight');
  onChange({phase: 'working', heard: 'Call Amma at eight', changes: []});
  assert.equal(stopped, 1);
  resolve({heard: 'Call Amma at eight', said: '', changes: [], batch: null, uuids: [], created: []});
  await new Promise(r => setTimeout(r, 0));
  assert.equal(stopped, 1, 'the recognizer stops once');
});
