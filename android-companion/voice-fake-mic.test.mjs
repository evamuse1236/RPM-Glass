import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {build} from 'esbuild';
import {bundleOptions} from '../scripts/build-companion-assets.mjs';
import {encodeWav, parseWav, scheduleFrames, openFakeMic, FAKE_MIC_TOKEN} from './voice-fake-mic.mjs';
import {startVoice} from './voice-client.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {resetVoiceMarks} from './voice-marks.mjs';
import {FIXTURE_ORDER, loadVoiceFixtures} from '../.claude/skills/verify-rpm-glass/lib/voice-time.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('WAV bytes round-trip and frames leave at the audio clock', async () => {
  const samples = new Float32Array(256);
  samples[0] = 0.5;
  samples[128] = -0.25;
  const pcm = parseWav(encodeWav(samples, 16000));
  assert.equal(pcm.sampleRate, 16000);
  assert.ok(Math.abs(pcm.samples[0] - 0.5) < 1 / 32767);
  assert.ok(Math.abs(pcm.samples[128] + 0.25) < 1 / 32767);
  const posts = [];
  let now = 0;
  const result = await scheduleFrames({
    samples: pcm.samples,
    sampleRate: 16000,
    quantum: 128,
    post: frame => posts.push(frame),
    now: () => now,
    later: (fn, ms) => { now += ms; fn(); },
  });
  assert.equal(posts.length, 2);
  assert.equal(posts[0].length, 128);
  assert.equal(posts[1][0], pcm.samples[128]);
  assert.equal(result.durationMs, 16);
  assert.equal(now, 16);
});

test('the fake mic feeds the worklet port and does not open the real microphone', async () => {
  resetVoiceMarks();
  const samples = new Float32Array(128);
  samples[0] = 0.4;
  let gum = 0;
  let node;
  class Context {
    constructor() { this.currentTime = 0; this.destination = {}; this.audioWorklet = {addModule: async () => {}}; }
    createBuffer() { return {duration: 0, copyToChannel() {}}; }
    createBufferSource() { return {connect() {}, start() {}}; }
    createMediaStreamSource() { return {connect() {}}; }
    close() { return Promise.resolve(); }
  }
  class Node { constructor() { node = this; this.port = {}; } }
  class Socket {
    constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
    send() {}
    close() {}
  }
  globalThis.__rpmFakeMic = {bytes: encodeWav(samples, 16000)};
  globalThis.__rpmImport = async () => ({openFakeMic});
  try {
    const voice = startVoice({
      data: freshStore(), timeZone: 'UTC', setup: {}, workletUrl: 'voice-mic-worklet.js',
      token: async () => ({token: 't', url: 'wss://live'}),
      media: {getUserMedia: async () => { gum += 1; throw new Error('real mic'); }},
      AudioContextImpl: Context, AudioWorkletNodeImpl: Node, WebSocketImpl: Socket,
      limits: {connectMs: 1000, talkMs: 200, answerMs: 20},
    });
    await new Promise(r => setTimeout(r, 40));
    assert.equal(gum, 0);
    assert.ok(performance.getEntriesByType('mark').some(entry => entry.name === 'voice:T3'));
    assert.equal(typeof node.port.onmessage, 'function');
    voice.stop();
    await voice.done;
  } finally {
    delete globalThis.__rpmFakeMic;
    delete globalThis.__rpmImport;
    resetVoiceMarks();
  }
});

test('scripted frames keep the WAV sample that the worklet would post', async () => {
  const samples = new Float32Array(128);
  samples[0] = 0.4;
  const heard = [];
  const mic = await openFakeMic({bytes: encodeWav(samples, 16000)}, {AudioContextImpl: null, later: () => {}, now: () => 0});
  mic.feed({onmessage: event => heard.push(event.data[0])});
  assert.ok(Math.abs(heard[0] - 0.4) < 0.001);
});

test('one fake mic feeds clip 1, then silence, then clip 2 when asked, until it is stopped', async () => {
  const one = new Float32Array(256).fill(0.5), two = new Float32Array(128).fill(-0.5);
  const timers = [], frames = [], ended = [];
  const step = n => { for (let i = 0; i < n && timers.length; i++) timers.shift()(); };
  const mic = await openFakeMic({bytes: encodeWav(one, 16000)}, {AudioContextImpl: null, later: fn => timers.push(fn), now: () => 0});
  const marks = performance.getEntriesByType('mark').length;
  mic.feed({onmessage: event => frames.push(event.data)});
  step(5);
  const level = frame => Math.round(frame[0] * 10) / 10;
  assert.deepEqual(frames.map(level), [0.5, 0.5, 0, 0, 0, 0], 'clip 1, then silence frames keep the line open');
  assert.ok(frames.every(frame => frame.length === 128));
  mic.play({bytes: encodeWav(two, 16000)});
  step(3);
  assert.deepEqual(frames.slice(6).map(level), [-0.5, 0, 0], 'clip 2 in the same stream, then silence again');
  for (const entry of performance.getEntriesByType('mark').slice(marks)) ended.push(entry.name);
  assert.deepEqual(ended.filter(name => name.startsWith('voice:speechEnd')), ['voice:speechEnd#1', 'voice:speechEnd#2']);
  mic.getTracks()[0].stop();
  step(5);
  assert.equal(frames.length, 9, 'nothing more after stop');
  assert.equal(timers.length, 0);
});

test('a browser audio graph plays the WAV into a media stream', async () => {
  const samples = new Float32Array([0.2, -0.2]);
  let copied = null, started = 0, connected = 0;
  class Context {
    createBuffer(_c, length) { return {length, copyToChannel(data) { copied = data; }}; }
    createBufferSource() { return {connect() { connected += 1; }, start() { started += 1; }}; }
    createMediaStreamDestination() { return {stream: {getTracks: () => [{stop() {}}]}}; }
  }
  const stream = await openFakeMic({bytes: encodeWav(samples, 16000)}, {AudioContextImpl: Context});
  assert.equal(started, 1);
  assert.equal(connected, 1);
  assert.equal(copied.length, 2);
  assert.equal(typeof stream.getTracks, 'function');
  assert.equal(globalThis.__rpmFakeMicPlay, stream.play, 'the timing CLI can speak a second clip');
  assert.equal(stream.play({bytes: encodeWav(samples, 16000)}), 2);
  assert.equal(started, 2);
  stream.__rpmStop();
  assert.equal(globalThis.__rpmFakeMicPlay, undefined);
});

function walk(dir, visit) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

test('release packaging does not include the fake mic', async () => {
  const source = fs.readFileSync(path.join(root, 'android-companion/voice-fake-mic.mjs'), 'utf8');
  const debug = fs.readFileSync(path.join(root, 'app/src/debug/assets/companion/voice-fake-mic.js'), 'utf8');
  assert.equal(debug, source);
  assert.match(debug, new RegExp(FAKE_MIC_TOKEN));
  const surface = fs.readFileSync(path.join(root, 'app/src/main/java/com/rpm/prototype/CompanionSurface.java'), 'utf8');
  const listed = [...surface.match(/ASSETS=Set\.of\(([^)]*)\)/)[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.equal(listed.includes('voice-fake-mic.js'), false);
  assert.match(surface, /BuildConfig\.DEBUG&&"voice-fake-mic\.js"/);
  const outfile = path.join(os.tmpdir(), `rpm-voice-bundle-${process.pid}.js`);
  await build({...bundleOptions, outfile});
  const bundled = fs.readFileSync(outfile, 'utf8');
  fs.unlinkSync(outfile);
  assert.equal(bundled.includes(FAKE_MIC_TOKEN), false);
  assert.equal(bundled.includes('scheduleFrames'), false);
  for (const folder of ['app/src/main', 'app/src/release']) {
    walk(path.join(root, folder), file => {
      assert.equal(path.basename(file) === 'voice-fake-mic.js', false, file);
      if (file.endsWith('.js') || file.endsWith('.mjs')) assert.equal(fs.readFileSync(file, 'utf8').includes(FAKE_MIC_TOKEN), false, file);
    });
  }
});

test('the five voice fixtures match their WAV duration and name a save', () => {
  const fixtures = loadVoiceFixtures(path.join(root, 'fixtures/voice'));
  assert.deepEqual(fixtures.map(item => item.id), FIXTURE_ORDER);
  assert.equal(fixtures.find(item => item.id === 'time').phrase, 'call Amma tomorrow at 6 pm');
  assert.match(fixtures.find(item => item.id === 'two-tasks').phrase, /buy milk/);
  assert.match(fixtures.find(item => item.id === 'change').phrase, /Call Amma/);
  assert.match(fixtures.find(item => item.id === 'question').phrase, /buy milk/);
  const ramble = fixtures.find(item => item.id === 'ramble');
  assert.ok(ramble.phrase.split(/\s+/).length >= 60);
  assert.ok(fs.readFileSync(path.join(root, 'fixtures/voice/ramble.txt'), 'utf8').trim().length > 400);
  for (const fixture of fixtures) {
    const pcm = parseWav(fs.readFileSync(fixture.wavPath));
    const duration = Math.round(pcm.samples.length / pcm.sampleRate * 1000);
    assert.equal(duration, fixture.durationMs, fixture.id);
    assert.ok(fixture.durationMs >= 1000, fixture.id);
    assert.equal(fixture.speech, 'edge-tts');
    assert.ok(fixture.expected);
    assert.ok(Array.isArray(fixture.expected.created));
    assert.ok(Array.isArray(fixture.expected.changes));
  }
});
