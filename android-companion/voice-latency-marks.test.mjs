import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {startVoice, pcm16} from './voice-client.mjs';
import {createVoiceMode, voiceCard} from './capture-voice.mjs';
import {installFakeDom} from './fake-dom.mjs';
import {resetVoiceMarks, armReceiptMark} from './voice-marks.mjs';

installFakeDom();
const tick = () => new Promise(r => setTimeout(r, 0));
const names = () => performance.getEntriesByType('mark').map(entry => entry.name);
const clear = () => { resetVoiceMarks(); delete globalThis.__rpmVoiceTiming; delete globalThis.__rpmVoiceDelay; delete globalThis.__rpmVoiceDelaySleep; delete globalThis.__rpmFakeMic; delete globalThis.__rpmImport; };

function fakes({deny = false} = {}) {
  const log = {played: 0, gum: 0};
  class Socket {
    constructor() { this.readyState = 0; fakes.socket = this; setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
    send(text) { const message = JSON.parse(text); if (message.setup) setTimeout(() => this.serve({setupComplete: {}}), 0); }
    serve(message) { this.onmessage?.({data: JSON.stringify(message)}); }
    close() { this.readyState = 3; }
  }
  class Context {
    constructor() { this.currentTime = 0; this.destination = {}; this.audioWorklet = {addModule: async () => {}}; }
    createMediaStreamSource() { return {connect() {}}; }
    createBuffer(_channels, length) { return {duration: length / 24000, copyToChannel() {}}; }
    createBufferSource() { return {connect() {}, start() { log.played += 1; }}; }
    close() { return Promise.resolve(); }
  }
  class Node { constructor() { fakes.node = this; this.port = {}; } }
  const media = {getUserMedia: async () => { log.gum += 1; if (deny) throw Object.assign(new Error('denied'), {name: 'NotAllowedError'}); return {getTracks: () => [{stop() {}}]}; }};
  return {log, options: {media, AudioContextImpl: Context, AudioWorkletNodeImpl: Node, WebSocketImpl: Socket, workletUrl: 'voice-mic-worklet.js', limits: {connectMs: 1000, talkMs: 5000, answerMs: 30}}};
}

test('a stubbed ramble marks the first audio frame, listening, the tool call, the spoken reply and session done', async () => {
  clear();
  const {log, options} = fakes();
  const voice = startVoice({...options, data: freshStore(), timeZone: 'Asia/Kolkata', setup: {model: 'm'}, token: async () => ({token: 't', url: 'wss://live'})});
  await tick(); await tick(); await tick();
  fakes.node.port.onmessage({data: new Float32Array([0.25])});
  await tick(); await tick();
  assert.ok(names().includes('voice:T3'));
  assert.ok(names().includes('voice:T4'));
  fakes.socket.serve({toolCall: {functionCalls: [{id: '1', name: 'save_task', args: {title: 'Pay rent'}}]}});
  fakes.socket.serve({serverContent: {modelTurn: {parts: [{inlineData: {mimeType: 'audio/pcm;rate=24000', data: pcm16(new Float32Array(24))}}]}}});
  voice.stop();
  fakes.socket.serve({serverContent: {turnComplete: true}});
  fakes.socket.serve({serverContent: {turnComplete: true}});
  await voice.done;
  assert.equal(log.played, 1);
  for (const mark of ['voice:T3', 'voice:T4', 'voice:T7', 'voice:T9', 'voice:T10']) assert.ok(names().includes(mark), mark);
  clear();
});

test('a denied microphone still marks session done', async () => {
  clear();
  const {options} = fakes({deny: true});
  const result = await startVoice({...options, data: freshStore(), timeZone: 'UTC', setup: {}, token: async () => ({})}).done;
  assert.equal(result.code, 'no-mic');
  assert.ok(names().includes('voice:T10'));
  clear();
});

test('listening waits only when the stall names T4', async () => {
  clear();
  globalThis.__rpmVoiceTiming = true;
  globalThis.__rpmVoiceDelay = {stage: 'T4', ms: 300};
  const {options} = fakes();
  const started = Date.now();
  let listening = null;
  const voice = startVoice({...options, data: freshStore(), timeZone: 'UTC', setup: {}, token: async () => ({token: 't', url: 'wss://x'}), onChange: state => { if (state.phase === 'listening' && listening == null) listening = Date.now() - started; }});
  await tick(); await tick(); await tick();
  while (listening == null && Date.now() - started < 2000) await new Promise(r => setTimeout(r, 20));
  voice.stop();
  await voice.done;
  assert.ok(listening >= 280, `listening at ${listening}ms`);
  clear();
  globalThis.__rpmVoiceTiming = true;
  globalThis.__rpmVoiceDelay = {stage: 'T9', ms: 300};
  const again = fakes();
  const t0 = Date.now();
  let heard = null;
  const second = startVoice({...again.options, data: freshStore(), timeZone: 'UTC', setup: {}, token: async () => ({token: 't', url: 'wss://x'}), onChange: state => { if (state.phase === 'listening' && heard == null) heard = Date.now() - t0; }});
  await tick(); await tick(); await tick();
  while (heard == null && Date.now() - t0 < 1000) await new Promise(r => setTimeout(r, 10));
  second.stop();
  await second.done;
  assert.ok(heard < 250, `T9 stall leaked into listening at ${heard}ms`);
  clear();
});

test('the stall hook is called for the first audio frame and the first tool call', async () => {
  clear();
  const calls = [];
  globalThis.__rpmVoiceTiming = true;
  globalThis.__rpmVoiceDelay = {stage: 'T3', ms: 300};
  globalThis.__rpmVoiceDelaySleep = (ms, name) => calls.push([name, ms]);
  const {options} = fakes();
  const voice = startVoice({...options, data: freshStore(), timeZone: 'UTC', setup: {}, token: async () => ({token: 't', url: 'wss://x'})});
  await tick(); await tick(); await tick();
  fakes.node.port.onmessage({data: new Float32Array([0.1])});
  fakes.node.port.onmessage({data: new Float32Array([0.2])});
  await tick(); await tick();
  fakes.socket.serve({toolCall: {functionCalls: [{id: '1', name: 'save_task', args: {title: 'Pay rent'}}]}});
  voice.stop();
  fakes.socket.serve({serverContent: {turnComplete: true}});
  await voice.done;
  assert.deepEqual(calls, [['T3', 300]]);
  clear();
});

test('Getting ready, the first heard word and the receipt mark when they are drawn', async () => {
  clear();
  let captured;
  const start = opts => { captured = opts; return {stop() {}, done: new Promise(() => {})}; };
  const platform = {voiceData: () => freshStore(), voiceRows: () => [], action: async () => null, saveWith: async () => true};
  const doc = {visibilityState: 'visible', addEventListener() {}};
  const voice = createVoiceMode({platform, conversationId: () => 'c', onChange() {}, afterSave() {}, start, doc, win: {}, now: () => new Date('2026-10-27T12:00:00Z')});
  voice.begin();
  await tick();
  assert.equal(names().includes('voice:T2'), false);
  const live = voice.card();
  assert.match(live.textContent, /Getting ready/);
  assert.ok(names().includes('voice:T2'));
  captured.onChange({phase: 'listening', heard: 'Call Amma', said: '', changes: [], wordsReady: false});
  voice.card();
  await tick();
  assert.match(live.textContent, /Call/);
  assert.ok(names().includes('voice:T5'));
  clear();
  let receipt = null;
  const saving = opts => { saving.last = opts; return {stop() {}, done: new Promise(resolve => { saving.resolve = resolve; })}; };
  const store = {current: freshStore()};
  const phone = {
    voiceData: () => structuredClone(store.current),
    voiceRows: () => [],
    action: async () => null,
    saveWith: async mutate => { const next = structuredClone(store.current); const out = mutate(next); if (out === false) return false; store.current = next; return out; },
  };
  const mode = createVoiceMode({
    platform: phone, conversationId: () => 'c', onChange() {}, start: saving, doc, win: {}, now: () => new Date('2026-10-27T12:00:00Z'),
    afterSave(id) { receipt = voiceCard({messageId: id, reply: 'Saved.', voice: {undoEvent: null, undone: false}}, {rows: [], discard() {}, openPlanner() {}, openItem() {}}); },
    sound() {},
  });
  const pending = mode.begin();
  await tick();
  await saving.last.onRequest({heard: 'Call Amma', said: 'Saved.', changes: [], errors: [], batch: null, uuids: [], created: [], failed: null}, {index: 2});
  saving.resolve({requests: 1, missed: false, failed: null, code: null});
  await pending;
  assert.match(receipt.textContent, /Saved/);
  assert.ok(names().includes('voice:T8'));
  assert.ok(names().includes('voice:T8#2'), 'each request marks its own receipt');
  clear();
  const history = voiceCard({messageId: 'm2', reply: 'History.', voice: {undoEvent: null, undone: false}}, {rows: [], discard() {}, openPlanner() {}, openItem() {}});
  assert.match(history.textContent, /History/);
  assert.equal(names().includes('voice:T8'), false);
  armReceiptMark('m3', 'T8#1');
  voiceCard({messageId: 'm3', reply: 'Armed.', voice: {undoEvent: null, undone: false}}, {rows: [], discard() {}, openPlanner() {}, openItem() {}});
  assert.ok(names().includes('voice:T8'));
  clear();
});
