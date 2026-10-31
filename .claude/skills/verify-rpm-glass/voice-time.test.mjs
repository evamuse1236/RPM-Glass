import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {UserError} from './lib/device.mjs';
import {
  parseVoiceTimeArgs, alignMarks, requestGaps, marksFromLog, alignLogMarks, savedMatched,
  runVoiceTimes, armExpression, percentile, FIXTURE_ORDER,
} from './lib/voice-time.mjs';

const skill = path.dirname(fileURLToPath(import.meta.url));

test('voice-time help names the flags and the Hang up orb', () => {
  const help = spawnSync(process.execPath, [path.join(skill, 'rpmctl.mjs'), 'help', 'voice-time'], {encoding: 'utf8'});
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--runs/);
  assert.match(help.stdout, /--fixture/);
  assert.match(help.stdout, /--human/);
  assert.match(help.stdout, /--session two/);
  assert.match(help.stdout, /Hang up orb/);
  assert.match(help.stdout, /workDone/);
  const list = spawnSync(process.execPath, [path.join(skill, 'rpmctl.mjs'), 'help'], {encoding: 'utf8'});
  assert.match(list.stdout, /voice-time/);
});

test('voice-time rejects a bad run count and an unknown fixture', () => {
  assert.throws(() => parseVoiceTimeArgs({runs: '0'}), UserError);
  assert.throws(() => parseVoiceTimeArgs({fixture: 'live'}), UserError);
  assert.deepEqual(parseVoiceTimeArgs({}), {runs: 1, fixture: 'all', human: false, warm: false, store: 'seed', session: null, percentiles: false});
  assert.equal(parseVoiceTimeArgs({session: 'two'}).session, 'two');
  assert.throws(() => parseVoiceTimeArgs({session: 'three'}), UserError);
  assert.equal(parseVoiceTimeArgs({runs: '4', human: true}).human, true);
  assert.equal(parseVoiceTimeArgs({runs: '4', human: true}).fixture, null);
  assert.deepEqual(FIXTURE_ORDER, ['time', 'two-tasks', 'change', 'question', 'ramble']);
});

test('stage math lines up page marks with the CLI clock', () => {
  assert.deepEqual(requestGaps({'speechEnd#2': 1000, 'T7#2': 1400, 'Trow#2': 1450, 'T8#2': 1900, 'T9#2': 2100}, 2), {toTool: 400, toRow: 450, toReceipt: 900, toSpoken: 1100});
  const marks = alignMarks({entries: [{name: 'voice:T4', startTime: 50}, {name: 'voice:T4', startTime: 80}, {name: 'other', startTime: 1}], timeOrigin: 1000, pageNow: 5000, cliNow: 4900});
  assert.equal(marks.T4, 950);
  const logged = alignLogMarks(marksFromLog('noise {"kind":"voice-mark","occurredAt":6000,"payload":{"name":"T5"}}'), {pageNow: 5000, cliNow: 4900});
  assert.equal(logged.T5, 5900);
  assert.equal(savedMatched(null, {created: []}), null);
  assert.equal(savedMatched({created: [{words: ['milk']}], changes: [], maxNew: 1}, {created: [{words: ['milk']}], changes: [], maxNew: 1}), true);
  assert.equal(savedMatched({created: [], changes: [], maxNew: 0}, {created: [{words: ['milk']}], changes: [], maxNew: 1}), false);
  assert.equal(percentile([10, 20, 30], 50), 20);
});

test('arming a fixture starts voice with WAV bytes and does not call Live', () => {
  const expression = armExpression({id: 'time', base64: 'QQ=='});
  assert.match(expression, /rpmStartVoice/);
  assert.doesNotMatch(expression, /generativelanguage|wss:/);
  const payload = JSON.parse(expression.match(/window\.__rpmFakeMic=(\{.*?\});/)[1]);
  assert.deepEqual(payload, {id: 'time', base64: 'QQ=='});
});

function sessionIo(fixtures, {missing = [], receipts = null} = {}) {
  let t = 5000;
  const events = [], written = [];
  const present = {T1: 5100, T3: 5300, T4: 5400};
  fixtures.forEach((_, i) => {
    const n = i + 1, base = 6000 + i * 5000;
    Object.assign(present, {[`speechEnd#${n}`]: base, [`T7#${n}`]: base + 400, [`Trow#${n}`]: base + 450, [`T8#${n}`]: base + 900, [`T9#${n}`]: base + 1100});
  });
  present.T10 = 20000;
  for (const stage of missing) delete present[stage];
  return {
    events, written, fixtures,
    now: () => t,
    sleep: async ms => { events.push(['sleep', ms]); t += ms; },
    openVoice: async () => { events.push('open'); return t; },
    armAndStart: async fixture => { events.push(['start', fixture.id]); },
    playClip: async fixture => { events.push(['play', fixture.id]); },
    hangUp: async () => { events.push('hang up'); },
    waitForStage: async name => { events.push(['wait', name]); if (!(name.replace('voice:', '') in present)) throw new UserError(`no ${name}`); },
    readMarks: async () => Object.entries(present).map(([name, startTime]) => ({name: `voice:${name}`, startTime})),
    readClock: async () => ({timeOrigin: 0, pageNow: t}),
    readLog: async () => '',
    readReceipts: async () => receipts ?? fixtures.map(() => 'Added\nCall Amma\nSun 1 Nov, 6:00 PM'),
    describeDevice: async () => ({buildHash: 'abc', device: 'emulator-5554', networkType: null}),
    countLogErrors: async () => 0,
    writeRun: async run => { run.file = `runs/${run.runId}.json`; written.push(run); },
  };
}

const time = {id: 'time', durationMs: 1000, expected: {created: [{words: ['call', 'amma'], time: '18:00'}], changes: [], maxNew: 1}};
const twoTasks = {id: 'two-tasks', durationMs: 1000, expected: {created: [{words: ['milk']}], changes: [], maxNew: 2}};

test('--session two plays clip 1, waits for its receipt, plays clip 2 in the same session, then hangs up', async () => {
  const io = sessionIo([time, twoTasks], {receipts: ['Added\nCall Amma\nSun 1 Nov, 6:00 PM', 'Added\nBuy milk']});
  const report = await runVoiceTimes(parseVoiceTimeArgs({session: 'two'}), io);
  assert.deepEqual(io.events, ['open', ['start', 'time'], ['wait', 'T8#1'], ['play', 'two-tasks'], ['wait', 'T8#2'], 'hang up', ['wait', 'T10']]);
  assert.equal(report.ok, true);
  assert.equal(report.workDone, 2);
  assert.equal(report.runs[0].listening, 400);
  assert.deepEqual(report.runs[0].requests.map(r => [r.toTool, r.toRow, r.toReceipt, r.toSpoken]), [[400, 450, 900, 1100], [400, 450, 900, 1100]]);
  assert.deepEqual(report.runs[0].requests.map(r => r.receiptRight), [true, true]);
  for (const row of ['Tap to Gemini listening', 'R1 speech end to tool call', 'R2 speech end to change on screen', 'R2 speech end to receipt', 'R2 speech end to first spoken audio']) assert.match(report.table, new RegExp(row));
  assert.match(report.table, /Receipt right +true\/true/);
  assert.match(report.table, /Saved \(receipts\) +2/);
  assert.equal(io.written.length, 1);
});

test('a request with no receipt is an error, the session still hangs up, and runs print a median', async () => {
  const io = sessionIo([time, twoTasks], {missing: ['T8#2', 'T7#2']});
  const failed = await runVoiceTimes(parseVoiceTimeArgs({session: 'two'}), io);
  assert.equal(failed.ok, false);
  assert.equal(failed.workDone, 1);
  assert.ok(io.events.includes('hang up'));
  assert.deepEqual(failed.runs[0].problems, ['request 2 drew no receipt']);
  const single = await runVoiceTimes(parseVoiceTimeArgs({fixture: 'time', runs: '2'}), sessionIo([time]));
  assert.equal(single.runs.length, 2);
  assert.match(single.table, /median/);
  assert.match(single.table, /R1 speech end to receipt +0\.90 s +0\.90 s +0\.90 s/);
  const humanIo = sessionIo([time]);
  const human = await runVoiceTimes(parseVoiceTimeArgs({human: true, runs: '2'}), humanIo);
  assert.deepEqual(humanIo.events.filter(event => Array.isArray(event) && event[0] === 'start'), []);
  assert.equal(human.runs.length, 2);
});

test('voice-time reports how far the words trail the clip and checks the receipt', async () => {
  const {wordTimes, wordsOf, receiptMatched} = await import('./lib/voice-time.mjs');
  const words = wordTimes({entries: [{name: 'voice:words', startTime: 900}, {name: 'voice:T4', startTime: 1}, {name: 'voice:words', startTime: 400}], timeOrigin: 1000, pageNow: 50, cliNow: 0});
  assert.deepEqual(words, [1350, 1850]);
  assert.deepEqual(wordsOf({marks: {T0: 1000, T3: 1100}, words, durationMs: 500}), {firstWords: 350, wordsTrail: 250, wordUpdates: 2});
  const fixture = {expected: {created: [{words: ['call', 'amma'], time: '18:00'}]}};
  assert.equal(receiptMatched('Added\nCall Amma\nSun 1 Nov, 6:00 PM', fixture), true);
  assert.equal(receiptMatched('2 changes\nCall Amma\nMoved to Trash\nCall Amma\nSun 1 Nov, 6:00 PM', fixture), false);
  assert.equal(receiptMatched('Added\nCall Amma\nSun 1 Nov, 7:00 PM', fixture), false);
  assert.equal(receiptMatched(null, fixture), null);
});
