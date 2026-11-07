import fs from 'node:fs';
import path from 'node:path';
import {UserError} from './device.mjs';
import {ROOT} from './runtime.mjs';

export const FIXTURE_ORDER = ['time', 'two-tasks', 'change', 'question', 'ramble'];
export const SESSION_CLIPS = Object.freeze({two: ['time', 'two-tasks']});
export const APP_STAGES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T7', 'T8', 'T9', 'T10'];
const FIXTURE_DIR = path.join(ROOT, 'fixtures/voice');
export const RUN_DIR = path.join(ROOT, '.verify/voice-latency/runs');

/**
 * An emulator by its serial and its own properties. Anything else, an unknown device included, is a phone, where a
 * person's real plan lives.
 */
export function isEmulatorDevice({serial, props = {}}) {
  if (!/^emulator-\d+$/.test(String(serial ?? ''))) return false;
  return props['ro.kernel.qemu'] === '1' || props['ro.boot.qemu'] === '1' || /^(ranchu|goldfish)$/.test(props['ro.hardware'] ?? '');
}

/** On a phone voice-time only listens to a person: no fake mic, no plan replaced. */
function phoneGuard(argv) {
  if (argv.store !== undefined) throw new UserError('voice-time never replaces the plan on a phone, so --store runs only on an emulator.', 'Drop --store. On the phone voice-time saves what you say, like any capture.');
  if (argv.clip !== undefined) throw new UserError('--clip plays WAV files through the fake mic, which runs only on an emulator.', 'Drop --clip. On the phone voice-time uses the real mic and waits for you to talk.');
  if (argv.fixture !== undefined || argv.human === false || argv.human === 'false') throw new UserError('The fake mic runs only on an emulator.', 'Drop --fixture. On the phone voice-time uses the real mic and waits for you to talk.');
}

export function parseVoiceTimeArgs(argv, {fixtureIds = FIXTURE_ORDER, emulator = false} = {}) {
  if (!emulator) phoneGuard(argv);
  const human = !emulator || argv.human === true || argv.human === 'true';
  const clips = argv.clip === undefined ? null : clipPaths(argv.clip);
  if (clips && (human || argv.fixture !== undefined || argv.session !== undefined)) throw new UserError('--clip cannot be combined with --human, --fixture or --session.', 'Use --clip alone: rpmctl voice-time --clip a.wav,b.wav');
  const runs = argv.runs === undefined ? 1 : Number(argv.runs);
  if (!Number.isInteger(runs) || runs < 1) throw new UserError('`--runs` must be a positive integer.', 'Example: rpmctl voice-time --runs 10 --fixture all');
  const fixture = human || clips ? null : String(argv.fixture ?? 'all');
  if (!human && !clips && fixture !== 'all' && !fixtureIds.includes(fixture)) {
    throw new UserError(`Unknown voice fixture "${fixture}".`, `One of: ${fixtureIds.join(', ')}, all.`);
  }
  const warm = argv.warm === true || argv.warm === 'true';
  const store = !emulator ? null : argv.store === undefined || argv.store === true ? 'seed' : String(argv.store);
  const session = argv.session === undefined ? null : String(argv.session);
  if (session !== null && !SESSION_CLIPS[session]) throw new UserError(`Unknown voice session "${session}".`, `One of: ${Object.keys(SESSION_CLIPS).join(', ')}.`);
  return {runs, fixture, human, warm, store, session, emulator, percentiles: argv.runs !== undefined, ...(clips ? {clips} : {})};
}

/** `--clip a.wav,b.wav` as a list of paths; the flag needs at least one. */
export function clipPaths(value) {
  const paths = typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
  if (!paths.length) throw new UserError('`--clip` needs one or more WAV files.', 'Example: rpmctl voice-time --clip clips/one.wav,clips/two.wav');
  return paths;
}

/** The fixtures use 16 kHz mono 16-bit PCM; the fake mic feeds bytes as they are. Returns the clip length in ms. */
export function wavDurationMs(bytes, name = 'clip') {
  const bad = why => new UserError(`${name} is not a 16 kHz mono 16-bit PCM WAV (${why}).`, 'Convert it: ffmpeg -i in.wav -ar 16000 -ac 1 -c:a pcm_s16le out.wav');
  if (bytes.length < 12 || bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WAVE') throw bad('not a RIFF/WAVE file');
  let fmt = null;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = bytes.toString('latin1', at, at + 4), size = bytes.readUInt32LE(at + 4), body = at + 8;
    if (id === 'fmt ' && size >= 16) fmt = {tag: bytes.readUInt16LE(body), channels: bytes.readUInt16LE(body + 2), rate: bytes.readUInt32LE(body + 4), bits: bytes.readUInt16LE(body + 14)};
    if (id === 'data') {
      if (!fmt) throw bad('no fmt chunk before the audio');
      if (fmt.tag !== 1) throw bad('not PCM');
      if (fmt.channels !== 1) throw bad(`${fmt.channels} channels`);
      if (fmt.rate !== 16000) throw bad(`${fmt.rate} Hz`);
      if (fmt.bits !== 16) throw bad(`${fmt.bits}-bit`);
      return Math.round((Math.min(size, bytes.length - body) / 2 / 16000) * 1000);
    }
    at = body + size + (size % 2);
  }
  throw bad('no audio data');
}

/**
 * Fixtures for `--clip` files. A sibling .json (like fixtures/voice) gives the words and expected save; without one
 * the clip is unlabelled: nothing is compared, and either a receipt or a spoken answer ends its request.
 */
export function loadClipFixtures(paths, {root = ROOT} = {}) {
  return paths.map(item => {
    const wavPath = path.resolve(root, item);
    if (!fs.existsSync(wavPath)) throw new UserError(`Clip not found: ${item}`, 'Give a WAV path, absolute or relative to the repo.');
    const durationMs = wavDurationMs(fs.readFileSync(wavPath), item);
    const jsonPath = wavPath.replace(/\.wav$/i, '') + '.json';
    const raw = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : null;
    const id = path.basename(wavPath).replace(/\.wav$/i, '');
    const changes = !!(raw?.expected?.created?.length || raw?.expected?.changes?.length);
    return {...(raw ?? {}), id, durationMs, wavPath, expected: raw?.expected ?? null, waitFor: changes ? 'receipt' : 'any'};
  });
}

export function loadVoiceFixtures(dir = FIXTURE_DIR) {
  return FIXTURE_ORDER.map(id => {
    const file = path.join(dir, `${id}.json`);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const phrase = raw.phrase ?? fs.readFileSync(path.join(dir, raw.phraseFile), 'utf8').trim();
    return {...raw, phrase, wavPath: path.join(dir, `${id}.wav`)};
  });
}

export function alignMarks({entries, timeOrigin, pageNow, cliNow}) {
  const skew = pageNow - cliNow;
  const out = {};
  for (const entry of entries ?? []) {
    const name = String(entry.name ?? '');
    if (!name.startsWith('voice:')) continue;
    const id = name.slice('voice:'.length);
    if (out[id] != null) continue;
    out[id] = timeOrigin + entry.startTime - skew;
  }
  return out;
}

export function marksFromLog(text) {
  const out = {};
  for (const line of String(text ?? '').split('\n')) {
    const start = line.indexOf('{');
    if (start < 0) continue;
    let json;
    try { json = JSON.parse(line.slice(start)); } catch { continue; }
    const name = json?.kind === 'voice-mark' ? json.payload?.name : null;
    if (!name || out[name] != null || typeof json.occurredAt !== 'number') continue;
    out[name] = json.occurredAt;
  }
  return out;
}

export function alignLogMarks(logMarks, {pageNow, cliNow}) {
  const skew = pageNow - cliNow;
  const out = {};
  for (const [name, at] of Object.entries(logMarks ?? {})) out[name] = at - skew;
  return out;
}

const delta = (a, b) => a == null || b == null ? null : Math.round(a - b);

/** Times of every `voice:words` mark, moved to the CLI clock like the stage marks. */
export function wordTimes({entries, timeOrigin, pageNow, cliNow}) {
  const skew = pageNow - cliNow;
  return (entries ?? []).filter(entry => entry.name === 'voice:words').map(entry => timeOrigin + entry.startTime - skew).sort((a, b) => a - b);
}

/**
 * How far the words on screen trail the voice. The clip starts at the first mic frame (T3), so it ends at
 * T3 + its length; `wordsTrail` is how long after that the last of your words appears.
 */
export function wordsOf({marks, words, durationMs}) {
  if (!words?.length) return {firstWords: null, wordsTrail: null, wordUpdates: 0};
  const clipEnd = marks.T3 == null || durationMs == null ? null : marks.T3 + durationMs;
  return {firstWords: delta(words[0], marks.T0), wordsTrail: delta(words.at(-1), clipEnd), wordUpdates: words.length};
}

export function savedMatched(actual, expected) {
  if (actual == null || expected == null) return null;
  const same = key => JSON.stringify(actual[key] ?? null) === JSON.stringify(expected[key] ?? null);
  return same('created') && same('changes') && same('maxNew');
}

const clock12 = hhmm => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}`; };

/** Whether the receipt names every expected new task by its words and time. Null when there is nothing to compare. */
export function receiptMatched(receipt, fixture) {
  const created = fixture?.expected?.created;
  if (receipt == null || !created?.length) return null;
  const text = receipt.toLowerCase();
  const onlyAdds = !(fixture.expected.changes ?? []).length;
  if (onlyAdds && created.length === 1 && text.split('\n')[0].trim() !== 'added') return false;
  return created.every(item => item.words.every(word => text.includes(word.toLowerCase())) && (!item.time || text.includes(clock12(item.time))));
}

export function percentile(values, p) {
  const xs = values.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const rank = Math.min(xs.length - 1, Math.max(0, Math.ceil((p / 100) * xs.length) - 1));
  return xs[rank];
}

export function armExpression(fixture) {
  const payload = {id: fixture.id, base64: fixture.base64};
  return `window.__rpmVoiceTiming=true;window.__rpmVoiceHoldStart=false;window.__rpmFakeMic=${JSON.stringify(payload)};window.rpmStartVoice?.()`;
}

const sec = ms => ms == null ? '-' : `${(ms / 1000).toFixed(2)} s`;

/** Per request n: from the end of its clip to its first tool call, change on screen, receipt and spoken audio. */
export function requestGaps(marks, n) {
  const end = marks[`speechEnd#${n}`];
  return {
    toTool: delta(marks[`T7#${n}`], end),
    toRow: delta(marks[`Trow#${n}`], end),
    toReceipt: delta(marks[`T8#${n}`], end),
    toSpoken: delta(marks[`T9#${n}`], end),
  };
}

/** A person waits for RPM to finish talking, then pauses a moment. The phone sends no mic audio while RPM speaks. */
export const AFTER_SPEECH_PAUSE_MS = 600;
export const SPEAKING_POLL_MS = 250;
export const SPEAKING_WAIT_MS = 120000;

/**
 * Before the next clip: request n has its answer (the caller waited), its spoken audio had a short grace to start,
 * the page no longer says RPM is talking, and 600 ms of quiet passed. Speech that starts inside the pause restarts it.
 */
export async function waitUntilRpmQuiet({io, n}) {
  if (!io.isSpeaking) return;
  await io.waitForSpokenStart?.(n);
  const limit = io.now() + SPEAKING_WAIT_MS;
  for (;;) {
    while (await io.isSpeaking()) {
      if (io.now() > limit) throw new UserError(`RPM was still speaking ${SPEAKING_WAIT_MS / 1000} s after request ${n}.`, 'The next clip would be dropped; check the voice answer.');
      await io.sleep(SPEAKING_POLL_MS);
    }
    await io.sleep(AFTER_SPEECH_PAUSE_MS);
    if (!(await io.isSpeaking())) return;
  }
}

export async function oneSessionRun({plan, clips, io, index}) {
  const t0 = await io.openVoice({human: false, fixture: clips[0]});
  await io.armAndStart(clips[0]);
  const problems = [];
  for (let n = 1; n <= clips.length; n++) {
    if (n > 1) { await waitUntilRpmQuiet({io, n: n - 1}); await io.playClip(clips[n - 1]); }
    try { await (clips[n - 1].waitFor === 'any' && io.waitForAny ? io.waitForAny([`T8#${n}`, `T9#${n}`]) : io.waitForStage(`T8#${n}`)); } catch (error) { if (!(error instanceof UserError)) throw error; problems.push(clips[n - 1].waitFor === 'any' ? `request ${n} drew no receipt or spoken answer` : `request ${n} drew no receipt`); break; }
  }
  await io.hangUp();
  await io.waitForStage('T10');
  const cliNow = io.now();
  const clock = await io.readClock();
  const marks = {...alignMarks({entries: await io.readMarks(), ...clock, cliNow}), T0: t0};
  const receipts = await io.readReceipts();
  const requests = clips.map((fixture, i) => ({n: i + 1, fixture: fixture.id, ...requestGaps(marks, i + 1), receipt: receipts[i] ?? null, receiptRight: receiptMatched(receipts[i] ?? null, fixture)}));
  const device = await io.describeDevice();
  const run = {
    runId: io.runId?.(clips[0], index) ?? `voice-session-${clips.map(c => c.id).join('+')}-${index}-${t0}`,
    session: plan.session ?? 'one', warm: !!plan.warm, fixtures: clips.map(c => c.id),
    buildHash: device.buildHash ?? null, device: device.device ?? null,
    marks, listening: delta(marks.T4, marks.T0), requests, receipts, problems,
    logErrors: await io.countLogErrors(),
  };
  const answered = n => clips[n - 1].waitFor === 'any' ? marks[`T8#${n}`] ?? marks[`T9#${n}`] : marks[`T8#${n}`];
  const missing = [marks.T4, ...requests.flatMap(r => [marks[`speechEnd#${r.n}`], ...(clips[r.n - 1].waitFor === 'any' ? [] : [marks[`T7#${r.n}`]]), answered(r.n)])].filter(v => v == null).length;
  run.errors = run.logErrors + problems.length + missing + requests.filter(r => r.receiptRight === false).length;
  run.workDone = requests.filter(r => answered(r.n) != null).length;
  await io.writeRun(run);
  return run;
}

const SESSION_ROWS = [['speech end to tool call', 'toTool'], ['speech end to change on screen', 'toRow'], ['speech end to receipt', 'toReceipt'], ['speech end to first spoken audio', 'toSpoken']];

export function formatSessionTable(runs, {percentiles = false, human = false} = {}) {
  const width = 38, col = text => String(text).padStart(10);
  const count = Math.max(...runs.map(run => run.requests.length));
  const lines = [['Moment'.padEnd(width), ...runs.map((_, i) => col(`run ${i + 1}`)), ...(percentiles ? [col('median'), col('p90')] : [])].join('')];
  const row = (label, values) => {
    const cells = [label.padEnd(width), ...values.map(v => col(sec(v)))];
    if (percentiles) cells.push(col(sec(percentile(values, 50))), col(sec(percentile(values, 90))));
    lines.push(cells.join(''));
  };
  row('Tap to Gemini listening', runs.map(run => run.listening));
  for (let n = 1; n <= count; n++) for (const [label, key] of SESSION_ROWS) row(`R${n} ${label}`, runs.map(run => run.requests[n - 1]?.[key] ?? null));
  lines.push(['Receipt right'.padEnd(width), ...runs.map(run => col(run.requests.map(r => r.receiptRight ?? '-').join('/')))].join(''));
  lines.push(['Saved (receipts)'.padEnd(width), ...runs.map(run => col(run.workDone))].join(''));
  lines.push(['Errors'.padEnd(width), ...runs.map(run => col(run.errors))].join(''));
  lines.push(human
    ? 'Speech end is the last words Gemini heard before its tool call (they can trail your voice); all times use the app clock except the tap.'
    : 'Speech end is when the fake mic finished each clip; all times use the app clock except the tap.');
  return lines.join('\n');
}

/** A person may talk for minutes; the app itself hangs up after 20 s of quiet. */
export const HUMAN_WAIT_MS = 15 * 60 * 1000;

/**
 * For a person there is no clip end: request n's speech end is the last `voice:said#n` mark at or before its first
 * tool call (or the last one, when it made no call).
 */
export function heardEnds({entries, timeOrigin, pageNow, cliNow}, marks) {
  const skew = pageNow - cliNow, out = {};
  for (const entry of entries ?? []) {
    const n = /^voice:said#(\d+)$/.exec(String(entry.name ?? ''))?.[1];
    if (!n) continue;
    const at = timeOrigin + entry.startTime - skew, tool = marks[`T7#${n}`];
    if (tool != null && at > tool) continue;
    if (out[`speechEnd#${n}`] == null || at > out[`speechEnd#${n}`]) out[`speechEnd#${n}`] = at;
  }
  return out;
}

export function requestCount(marks) {
  return Math.max(0, ...Object.keys(marks).map(name => Number(/^(?:T7|T8|T9|Trow|speechEnd)#(\d+)$/.exec(name)?.[1] ?? 0)));
}

/** A person talks on the real mic until they tap Hang up or go quiet for 20 s; nothing is played, armed or reset. */
export async function humanSessionRun({plan, io, index}) {
  const expected = plan.session ? SESSION_CLIPS[plan.session].length : null;
  const t0 = await io.openVoice({human: true, fixture: null});
  await io.waitForStage('T10', {timeout: HUMAN_WAIT_MS});
  const cliNow = io.now();
  const clock = await io.readClock();
  const entries = await io.readMarks();
  const aligned = {...alignMarks({entries, ...clock, cliNow}), T0: t0};
  const marks = {...heardEnds({entries, ...clock, cliNow}, aligned), ...aligned};
  const count = requestCount(marks);
  const receipts = await io.readReceipts();
  const requests = Array.from({length: count}, (_, i) => ({n: i + 1, fixture: null, ...requestGaps(marks, i + 1), receipt: receipts[i] ?? null, receiptRight: null}));
  const problems = expected != null && count < expected ? [`heard ${count} of ${expected} requests`] : [];
  const device = await io.describeDevice();
  const run = {
    runId: io.runId?.(null, index) ?? `voice-human-${plan.session ?? 'open'}-${index}-${t0}`,
    session: plan.session ?? 'open', human: true, warm: !!plan.warm, fixtures: [],
    buildHash: device.buildHash ?? null, device: device.device ?? null,
    marks, listening: delta(marks.T4, marks.T0), requests, receipts, problems,
    logErrors: await io.countLogErrors(),
  };
  const missing = [marks.T4, ...requests.flatMap(r => [marks[`T7#${r.n}`], marks[`T8#${r.n}`]])].filter(v => v == null).length;
  run.errors = run.logErrors + problems.length + missing;
  run.workDone = requests.filter(r => marks[`T8#${r.n}`] != null).length;
  await io.writeRun(run);
  return run;
}

export function clipSessions(plan, fixtures) {
  if (plan.clipFixtures) return [plan.clipFixtures];
  const byId = id => fixtures.find(item => item.id === id);
  const sessions = plan.session ? [SESSION_CLIPS[plan.session].map(byId)] : (plan.fixture === 'all' ? fixtures : fixtures.filter(item => item.id === plan.fixture)).map(fixture => [fixture]);
  if (!sessions.length || sessions.some(clips => clips.some(clip => !clip))) throw new UserError(`Unknown voice fixture "${plan.fixture}".`, `One of: ${FIXTURE_ORDER.join(', ')}, all.`);
  return sessions;
}

export async function runVoiceTimes(plan, io) {
  const runs = [];
  if (plan.human) for (let index = 0; index < plan.runs; index++) runs.push(await humanSessionRun({plan, io, index}));
  else {
    const sessions = clipSessions(plan, io.fixtures);
    for (let index = 0; index < plan.runs; index++) for (const clips of sessions) runs.push(await oneSessionRun({plan, clips, io, index}));
  }
  const errors = runs.reduce((n, run) => n + run.errors, 0);
  return {
    ok: errors === 0, errors, workDone: runs.reduce((n, run) => n + run.workDone, 0),
    table: formatSessionTable(runs, {percentiles: plan.percentiles, human: plan.human}),
    runs: runs.map(run => ({runId: run.runId, file: run.file ?? null, fixtures: run.fixtures, session: run.session, human: !!run.human, warm: run.warm, listening: run.listening, requests: run.requests, errors: run.errors, workDone: run.workDone, problems: run.problems, buildHash: run.buildHash, device: run.device})),
  };
}
