// Usage: RPM_OPENROUTER_KEY_FILE=~/.config/rpm/openrouter.env node scripts/capture-smoke.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import {readApiKey} from '../cli/openrouter.mjs';
import {seedStore} from './gauntlet/seed.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {changePlanner} from '../android-companion/planner-tools.mjs';
import {editPlan} from '../android-companion/planner-state.mjs';
import {createIntentService,intentViewFromData} from '../android-companion/intent-service.mjs';
import {createCaptureAgent} from '../android-companion/capture-agent.mjs';
import {createTraceStore} from '../android-companion/capture-trace.mjs';
import {planSnapshot} from '../android-companion/capture-snapshot.mjs';

const out = path.resolve(process.argv[2] ?? '.verify/evidence/capture-agent-2026-10-18');
fs.mkdirSync(out, {recursive: true});
const RAMBLES = [
  'Push my 4 pm group call to 5:30, the others are running late',
  'Remind me to call Amma at 7 pm tonight about Sunday',
  'Actually make the Amma call 8 pm instead',
  'Remind me to take my vitamins at 9 tonight, set an alarm',
  'What’s my timetable today?',
];

let key = null;
try { key = readApiKey(process.env.RPM_OPENROUTER_KEY_FILE); } catch { key = null; }
if (!key) {
  fs.writeFileSync(path.join(out, 'smoke-UNVERIFIED.txt'), 'No OpenRouter key is configured (OPENROUTER_API_KEY or RPM_OPENROUTER_KEY_FILE). The live smoke test did not run.\n');
  console.log('UNVERIFIED: no OpenRouter key configured; nothing was sent.');
  process.exit(2);
}

const native = async (action, payload) => {
  if (action === 'calendarRead') return {status: 'not_selected', events: []};
  if (action !== 'model') return {};
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`}, body: JSON.stringify(payload.body),
    signal: AbortSignal.timeout(payload.timeoutMs ?? 40000)});
  return {status: response.status, body: await response.json()};
};
const memory = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v))}; };
const backend = createMemoryBackend(seedStore().data);
const service = createIntentService({backend, native, changePlanner, undo, editPlan, readCalendar: async () => ({status: 'not_selected', events: []}),
  snapshot: async ({data}) => planSnapshot(data, {now: new Date()})});
const traces = createTraceStore({storage: memory()});
const agent = createCaptureAgent({service, traces});
const conversationId = (await backend.load()).conversations[0].id;

const results = [];
for (const [i, text] of RAMBLES.entries()) {
  const messageId = `smoke-${Date.now()}-${i}`;
  let error = null;
  try { await agent.capture({messageId, conversationId, text}); } catch (e) { error = String(e?.message ?? e).replace(/sk-or-[\w-]+/g, '[key]'); }
  const view = intentViewFromData(await backend.load()).captures.find(c => c.messageId === messageId);
  const trace = traces.get(messageId);
  results.push({text, error, status: view?.status ?? null, reply: view?.reply ?? null, card: view?.card ?? null,
    draft: view?.draft ? {status: view.draft.status, mode: view.draft.mode, confirm: view.draft.confirm, lines: view.draft.lines, question: view.draft.question?.prompt ?? null} : null,
    models: trace?.models ?? [], latencyMs: trace?.latencyMs ?? null, applied: trace?.applied ?? null});
  console.log(`${i + 1}. ${text}\n   → ${results.at(-1).draft?.lines?.map(l => `${l.verb} ${l.title} ${l.was ? l.was + ' → ' : ''}${l.when ?? ''}`).join('; ') || results.at(-1).reply || error || results.at(-1).status}`);
}
const file = path.join(out, 'smoke-results.json');
fs.writeFileSync(file, JSON.stringify({at: new Date().toISOString(), results}, null, 1));
console.log('Saved', file);
