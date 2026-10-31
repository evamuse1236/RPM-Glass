import fs from 'node:fs';
import path from 'node:path';
import {UserError} from './device.mjs';
import {ROOT} from './runtime.mjs';

export const FIXTURE_ORDER = ['time', 'two-tasks', 'change', 'question', 'ramble'];
export const SESSION_CLIPS = Object.freeze({two: ['time', 'two-tasks']});
export const APP_STAGES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T7', 'T8', 'T9', 'T10'];
const FIXTURE_DIR = path.join(ROOT, 'fixtures/voice');
export const RUN_DIR = path.join(ROOT, '.verify/voice-latency/runs');

export function parseVoiceTimeArgs(argv, {fixtureIds = FIXTURE_ORDER} = {}) {
  const human = argv.human === true || argv.human === 'true';
  const runs = argv.runs === undefined ? 1 : Number(argv.runs);
  if (!Number.isInteger(runs) || runs < 1) throw new UserError('`--runs` must be a positive integer.', 'Example: rpmctl voice-time --runs 10 --fixture all');
  const fixture = human ? null : String(argv.fixture ?? 'all');
  if (!human && fixture !== 'all' && !fixtureIds.includes(fixture)) {
    throw new UserError(`Unknown voice fixture "${fixture}".`, `One of: ${fixtureIds.join(', ')}, all.`);
  }
  const warm = argv.warm === true || argv.warm === 'true';
  const store = argv.store === undefined || argv.store === true ? 'seed' : String(argv.store);
  const session = argv.session === undefined || human ? null : String(argv.session);
  if (session !== null && !SESSION_CLIPS[session]) throw new UserError(`Unknown voice session "${session}".`, `One of: ${Object.keys(SESSION_CLIPS).join(', ')}.`);
  return {runs, fixture, human, warm, store, session, percentiles: argv.runs !== undefined};
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

export function gapsOf({marks, speechAt}) {
  return {
    t0ToT4: delta(marks.T4, marks.T0),
    speechToT5: delta(marks.T5, speechAt ?? marks.T3),
    t6ToT8: delta(marks.T8, marks.T6),
    t6ToT9: delta(marks.T9, marks.T6),
    t6ToT7: delta(marks.T7, marks.T6),
    t6ToRow: delta(marks.Trow, marks.T6),
  };
}

export function fromT0(marks) {
  const out = {};
  for (const stage of ['T0', ...APP_STAGES, 'T6']) out[stage] = delta(marks[stage], marks.T0);
  out.T0 = marks.T0 == null ? null : 0;
  return out;
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

function stageList(human) {
  return human ? ['T0', ...APP_STAGES] : ['T0', 'T6', ...APP_STAGES];
}

export function scoreRun(run) {
  let errors = run.logErrors ?? 0;
  for (const stage of stageList(run.human)) if (run.marks[stage] == null) errors += 1;
  if (run.savedMatched === false) errors += 1;
  const workDone = run.marks.T8 != null && run.marks.T10 != null && run.savedMatched !== false ? 1 : 0;
  return {errors, workDone};
}

export function armExpression(fixture) {
  const payload = {id: fixture.id, base64: fixture.base64};
  return `window.__rpmVoiceTiming=true;window.__rpmVoiceHoldStart=false;window.__rpmFakeMic=${JSON.stringify(payload)};window.rpmStartVoice?.()`;
}

function blankMarks() {
  return Object.fromEntries(['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'].map(id => [id, null]));
}

export async function oneVoiceRun({plan, fixture, io, index}) {
  const t0 = await io.openVoice({human: plan.human, fixture});
  const speechAt = null;
  const t6 = null;
  await io.waitForStage('T10');
  const cliNow = io.now();
  const clock = await io.readClock();
  const entries = await io.readMarks();
  const marks = {...blankMarks(), ...alignMarks({entries, ...clock, cliNow})};
  const words = wordTimes({entries, ...clock, cliNow});
  const logged = alignLogMarks(marksFromLog(await io.readLog()), clock);
  for (const stage of APP_STAGES) if (marks[stage] == null && logged[stage] != null) marks[stage] = logged[stage];
  marks.T0 = t0;
  if (t6 != null) marks.T6 = t6;
  const device = await io.describeDevice();
  const receipt = await io.readReceipt?.() ?? null;
  const compared = plan.human ? null : receiptMatched(receipt, fixture);
  const run = {
    runId: io.runId?.(fixture, index) ?? `voice-${fixture?.id ?? 'human'}-${index}-${t0}`,
    fixture: fixture?.id ?? null,
    human: plan.human,
    buildHash: device.buildHash ?? null,
    device: device.device ?? null,
    networkType: device.networkType ?? null,
    savedMatched: compared,
    speechAt,
    marks,
    fromT0: fromT0(marks),
    gaps: {...gapsOf({marks, speechAt}), ...wordsOf({marks, words, durationMs: fixture?.durationMs})},
    receipt,
    logErrors: await io.countLogErrors(),
  };
  const score = scoreRun(run);
  run.errors = score.errors;
  run.workDone = score.workDone;
  await io.writeRun(run);
  return run;
}

export function aggregateVoiceRuns(runs) {
  const stages = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'];
  const gaps = ['t0ToT4', 'speechToT5', 't6ToT7', 't6ToRow', 't6ToT8', 't6ToT9', 'firstWords', 'wordsTrail'];
  const stat = values => {
    const xs = values.filter(v => v != null);
    return {p50: percentile(xs, 50), p90: percentile(xs, 90), spread: xs.length ? Math.max(...xs) - Math.min(...xs) : null};
  };
  const fromT0Stats = {}, gapStats = {};
  for (const stage of stages) fromT0Stats[stage] = stat(runs.map(run => run.fromT0[stage]));
  for (const gap of gaps) gapStats[gap] = stat(runs.map(run => run.gaps[gap]));
  return {fromT0: fromT0Stats, gaps: gapStats, errors: runs.reduce((n, run) => n + run.errors, 0), workDone: runs.reduce((n, run) => n + run.workDone, 0)};
}

function cell(value) {
  return value == null ? '-' : String(value);
}

export const TABLE_ROWS = [
  ['Capture drawn', run => run.fromT0.T1, 'T1'],
  ['Mic on', run => run.fromT0.T3, 'T3'],
  ['Gemini listening', run => run.fromT0.T4, 'T4'],
  ['First words on screen', run => run.gaps.firstWords, 'firstWords'],
  ['Words trail the voice by', run => run.gaps.wordsTrail, 'wordsTrail'],
  ['Stop tapped', run => run.fromT0.T6, 'T6'],
  ['Stop to tool call', run => run.gaps.t6ToT7, 't6ToT7'],
  ['Stop to change on screen', run => run.gaps.t6ToRow, 't6ToRow'],
  ['Stop to receipt with Undo', run => run.gaps.t6ToT8, 't6ToT8'],
  ['Stop to first spoken audio', run => run.gaps.t6ToT9, 't6ToT9'],
];

const sec = ms => ms == null ? '-' : `${(ms / 1000).toFixed(2)} s`;

export function formatVoiceTable(runs, aggregate, {percentiles = false} = {}) {
  const lines = [];
  const width = 28;
  const header = ['Moment'.padEnd(width), ...runs.map((run, i) => `run ${i + 1}`.padStart(9))];
  if (percentiles) header.push('median'.padStart(9), 'p90'.padStart(9));
  lines.push(header.join(''));
  for (const [label, pick, key] of TABLE_ROWS) {
    const row = [label.padEnd(width), ...runs.map(run => sec(pick(run)).padStart(9))];
    if (percentiles) {
      const stat = aggregate.fromT0[key] ?? aggregate.gaps[key];
      row.push(sec(stat?.p50).padStart(9), sec(stat?.p90).padStart(9));
    }
    lines.push(row.join(''));
  }
  lines.push(['Receipt right'.padEnd(width), ...runs.map(run => String(run.savedMatched ?? '-').padStart(9))].join(''));
  lines.push(['Saved'.padEnd(width), ...runs.map(run => String(run.workDone).padStart(9))].join(''));
  lines.push(['Errors'.padEnd(width), ...runs.map(run => String(run.errors).padStart(9))].join(''));
  lines.push('Times down to Stop tapped are from the tap. Tap and Stop use the computer clock; the rest use the app clock.');
  return lines.join('\n');
}

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

export async function oneSessionRun({plan, clips, io, index}) {
  const t0 = await io.openVoice({human: false, fixture: clips[0]});
  await io.armAndStart(clips[0]);
  const problems = [];
  for (let n = 1; n <= clips.length; n++) {
    if (n > 1) await io.playClip(clips[n - 1]);
    try { await io.waitForStage(`T8#${n}`); } catch (error) { if (!(error instanceof UserError)) throw error; problems.push(`request ${n} drew no receipt`); break; }
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
  const missing = [marks.T4, ...requests.flatMap(r => [marks[`speechEnd#${r.n}`], marks[`T7#${r.n}`], marks[`T8#${r.n}`]])].filter(v => v == null).length;
  run.errors = run.logErrors + problems.length + missing + requests.filter(r => r.receiptRight === false).length;
  run.workDone = requests.filter(r => r.toReceipt != null).length;
  await io.writeRun(run);
  return run;
}

const SESSION_ROWS = [['speech end to tool call', 'toTool'], ['speech end to change on screen', 'toRow'], ['speech end to receipt', 'toReceipt'], ['speech end to first spoken audio', 'toSpoken']];

export function formatSessionTable(runs, {percentiles = false} = {}) {
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
  lines.push('Speech end is when the fake mic finished each clip; all times use the app clock except the tap.');
  return lines.join('\n');
}

export async function runVoiceTimes(plan, io) {
  if (!plan.human) {
    const byId = id => io.fixtures.find(item => item.id === id);
    const sessions = plan.session ? [SESSION_CLIPS[plan.session].map(byId)] : (plan.fixture === 'all' ? io.fixtures : io.fixtures.filter(item => item.id === plan.fixture)).map(fixture => [fixture]);
    if (!sessions.length || sessions.some(clips => clips.some(clip => !clip))) throw new UserError(`Unknown voice fixture "${plan.fixture}".`, `One of: ${FIXTURE_ORDER.join(', ')}, all.`);
    const runs = [];
    for (let index = 0; index < plan.runs; index++) for (const clips of sessions) runs.push(await oneSessionRun({plan, clips, io, index}));
    const errors = runs.reduce((n, run) => n + run.errors, 0);
    return {
      ok: errors === 0, errors, workDone: runs.reduce((n, run) => n + run.workDone, 0),
      table: formatSessionTable(runs, {percentiles: plan.percentiles}),
      runs: runs.map(run => ({runId: run.runId, file: run.file ?? null, fixtures: run.fixtures, session: run.session, warm: run.warm, listening: run.listening, requests: run.requests, errors: run.errors, workDone: run.workDone, problems: run.problems, buildHash: run.buildHash, device: run.device})),
    };
  }
  const selected = [null];
  const runs = [];
  for (let index = 0; index < plan.runs; index++) {
    for (const fixture of selected) runs.push(await oneVoiceRun({plan, fixture, io, index}));
  }
  const aggregate = aggregateVoiceRuns(runs);
  const table = formatVoiceTable(runs, aggregate, {percentiles: plan.percentiles});
  return {
    ok: aggregate.errors === 0,
    table,
    errors: aggregate.errors,
    workDone: aggregate.workDone,
    ...(plan.percentiles ? {aggregate} : {}),
    runs: runs.map(run => ({runId: run.runId, file: run.file ?? null, fixture: run.fixture, human: run.human, fromT0: run.fromT0, gaps: run.gaps, errors: run.errors, workDone: run.workDone, savedMatched: run.savedMatched, buildHash: run.buildHash, device: run.device, networkType: run.networkType})),
  };
}
