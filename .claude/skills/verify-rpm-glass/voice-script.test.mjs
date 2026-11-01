import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {UserError} from './lib/device.mjs';
import {FIXTURES, parseVoiceScriptArgs, runVoiceScript} from './lib/voice-script.mjs';

const skill = path.dirname(fileURLToPath(import.meta.url));

function fakeIo({emulator = true, failOn} = {}) {
  const calls = [];
  const step = (name, value) => async arg => {
    const call = arg === undefined ? name : `${name}:${arg}`;
    calls.push(call);
    if (failOn && call.includes(failOn)) throw new UserError(`${call} failed`, 'fix');
    return value;
  };
  return {calls, io: {
    isEmulator: async () => { calls.push('isEmulator'); return emulator; },
    openCapture: step('openCapture'),
    evaluate: step('evaluate'),
    startCall: step('startCall'),
    shot: async label => { calls.push(`shot:${label}`); return `/evidence/${label}.png`; },
    reload: step('reload'),
  }};
}

test('the default fixture is the repo voice script and the default plan is add', () => {
  const plan = parseVoiceScriptArgs({_: []});
  assert.equal(plan.fixture, 'voice-script');
  assert.equal(plan.source, fs.readFileSync(path.join(FIXTURES, 'voice-script.js'), 'utf8'));
  assert.deepEqual(plan.kinds, ['add']);
});

test('bad fixtures and plans are refused', () => {
  assert.throws(() => parseVoiceScriptArgs({_: ['missing']}), e => e instanceof UserError && /voice-script/.test(e.fix));
  assert.throws(() => parseVoiceScriptArgs({_: ['../voice-script']}), UserError);
  assert.throws(() => parseVoiceScriptArgs({_: [], plan: 'add,delete'}), /Unknown --plan step: delete/);
  assert.throws(() => parseVoiceScriptArgs({_: [], plan: 'retime'}), e => /Start --plan with add/.test(e.fix));
});

test('a phone is refused before the page changes', async () => {
  const {calls, io} = fakeIo({emulator: false});
  await assert.rejects(runVoiceScript(parseVoiceScriptArgs({_: []}), io), e => e instanceof UserError && /emulator only/.test(e.message));
  assert.deepEqual(calls, ['isEmulator']);
});

test('it loads the fixture, takes the Gemini path, runs each step and reloads last', async () => {
  const plan = parseVoiceScriptArgs({_: ['voice-script'], plan: 'add,retime'});
  const {calls, io} = fakeIo();
  const out = await runVoiceScript(plan, io);
  assert.equal(calls[0], 'isEmulator');
  assert.equal(calls[1], 'openCapture');
  assert.equal(calls[2], `evaluate:${plan.source}`);
  assert.equal(calls[3], 'evaluate:window.RPM_PLATFORM.hasGeminiKey=()=>true');
  assert.equal(calls[4], 'startCall');
  assert.equal(calls.at(-1), 'reload');
  const steps = calls.filter(c => /__v\.|shot:/.test(c)).map(c => c.replace(/^evaluate:window\.__v\./, ''));
  assert.deepEqual(steps.map(s => s.replace(/\(.*\)$/, '')), [
    'ready', 'hear', 'plan', 'talk', 'shot:scripted-voice-add-proposed', 'save', 'shot:scripted-voice-add-saved',
    'ready', 'hear', 'plan', 'talk', 'shot:scripted-voice-retime-proposed', 'save', 'shot:scripted-voice-retime-saved',
  ]);
  assert.ok(calls.includes('evaluate:window.__v.plan("retime")'));
  assert.equal(out.label, 'scripted voice');
  assert.equal(out.reloaded, true);
  assert.deepEqual(out.shots, ['add-proposed', 'add-saved', 'retime-proposed', 'retime-saved'].map(s => `/evidence/scripted-voice-${s}.png`));
});

test('a failed step still reloads the page and reports the step error', async () => {
  const {calls, io} = fakeIo({failOn: '__v.talk'});
  await assert.rejects(runVoiceScript(parseVoiceScriptArgs({_: []}), io), /talk\(\) failed/);
  assert.equal(calls.at(-1), 'reload');
  assert.ok(!calls.some(c => c.includes('__v.save')));
});

test('rpmctl help lists voice-script', () => {
  const r = spawnSync(process.execPath, [path.join(skill, 'rpmctl.mjs'), 'help', 'voice-script'], {encoding: 'utf8'});
  assert.equal(r.status, 0);
  assert.match(r.stdout, /voice-script \[fixture\] \[--plan add,retime,remove\]/);
  assert.match(r.stdout, /Emulator only/);
});
