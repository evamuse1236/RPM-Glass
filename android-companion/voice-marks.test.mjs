import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceMark, voiceDelayMs, beforeStage, holdStage, markCaptureDrawn, resetVoiceMarks, resetSessionMarks, voiceSaidMark} from './voice-marks.mjs';

function host() {
  const marks = [], lines = [];
  return {marks, lines, performance: {mark: name => marks.push(name)}, RpmNative: {diagnostic: body => lines.push(JSON.parse(body))}, crypto: {randomUUID: () => 'id-1'}};
}

test('a voice mark is a performance mark and stays silent unless timing is on', () => {
  const plain = host();
  voiceMark('T4', plain);
  voiceMark('T4', plain);
  assert.deepEqual(plain.marks, ['voice:T4']);
  assert.deepEqual(plain.lines, []);
  const timed = host();
  timed.__rpmVoiceTiming = true;
  voiceMark('T5', timed);
  assert.equal(timed.lines.length, 1);
  assert.equal(timed.lines[0].kind, 'voice-mark');
  assert.equal(timed.lines[0].operation, 'voice.mark');
  assert.deepEqual(timed.lines[0].payload, {name: 'T5', mark: 'voice:T5'});
});

test('the stage stall is 300ms for the named stage only, and off unless timing is on', () => {
  const off = {__rpmVoiceDelay: {stage: 'T4'}};
  assert.equal(voiceDelayMs('T4', off), 0);
  assert.equal(beforeStage('T4', off), null);
  const on = {__rpmVoiceTiming: true, __rpmVoiceDelay: {stage: 'T4'}};
  assert.equal(voiceDelayMs('T4', on), 300);
  assert.equal(voiceDelayMs('T5', on), 0);
  assert.equal(beforeStage('T5', on), null);
  const calls = [];
  on.__rpmVoiceDelaySleep = (ms, name) => calls.push([name, ms]);
  holdStage('T4', on);
  holdStage('T9', on);
  assert.deepEqual(calls, [['T4', 300]]);
});

test('Capture drawn marks T1 on the next frame, once', () => {
  const page = host();
  let frame = null;
  page.requestAnimationFrame = fn => { frame = fn; };
  markCaptureDrawn(page);
  assert.deepEqual(page.marks, []);
  frame();
  markCaptureDrawn(page);
  assert.deepEqual(page.marks, ['voice:T1']);
});

test.after(() => resetVoiceMarks());

function markHost() {
  const entries = [];
  return {entries, performance: {
    mark: name => entries.push({name}),
    getEntriesByType: () => entries.slice(),
    clearMarks: name => { for (let i = entries.length - 1; i >= 0; i--) if (entries[i].name === name) entries.splice(i, 1); },
  }};
}

test('a new voice session in the same page is timed again, and Capture drawn stays', () => {
  resetVoiceMarks();
  const env = markHost();
  voiceMark('T1', env);
  voiceMark('T4', env);
  voiceMark('T10', env);
  env.performance.mark('other');
  resetSessionMarks(env);
  assert.deepEqual(env.entries.map(entry => entry.name), ['voice:T1', 'other']);
  voiceMark('T4', env);
  voiceMark('T1', env);
  assert.deepEqual(env.entries.map(entry => entry.name), ['voice:T1', 'other', 'voice:T4']);
});

test('heard words mark their request only while timing is on', () => {
  const off = markHost();
  voiceSaidMark(2, off);
  assert.deepEqual(off.entries, []);
  const on = {...markHost(), __rpmVoiceTiming: true};
  voiceSaidMark(2, on);
  voiceSaidMark(2, on);
  assert.deepEqual(on.entries.map(entry => entry.name), ['voice:said#2', 'voice:said#2']);
});
