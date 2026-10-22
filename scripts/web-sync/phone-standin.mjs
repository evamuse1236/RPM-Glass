#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {createMemoryBackend} from '../../intent-v2/src/repository.mjs';
import {createWebSyncProcessor} from '../../android-companion/web-sync-commands.mjs';
import {createIntentService} from '../../android-companion/intent-service.mjs';
import {createCaptureAgent} from '../../android-companion/capture-agent.mjs';
import {createTraceStore} from '../../android-companion/capture-trace.mjs';
import {changePlanner} from '../../android-companion/planner-tools.mjs';
import {editPlan} from '../../android-companion/planner-state.mjs';
import {undo} from '../../chat-prototype/companion-tools.mjs';
import {seedStore} from '../gauntlet/seed.mjs';

const {values: opts} = parseArgs({options: {
  site: {type: 'string', default: 'http://127.0.0.1:3211'},
  state: {type: 'string', default: '.verify/web-sync/phone.json'},
  every: {type: 'string', default: '3'},
  'link-code': {type: 'boolean', default: false},
  once: {type: 'boolean', default: false},
  'delay-ms': {type: 'string', default: '0'},
}});
const statePath = resolve(opts.state);
const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);

async function call(path, token, body) {
  const response = await fetch(new URL(path, opts.site), {method: body === undefined ? 'GET' : 'POST',
    headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} answered ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function pair() {
  const out = execFileSync('npx', ['convex', 'run', 'admin:createPairingCode', JSON.stringify({label: 'Stand-in phone'})], {encoding: 'utf8'});
  const {code} = JSON.parse(out.slice(out.indexOf('{')));
  const {token} = await call('/v1/pair', null, {code, installationId: randomUUID()});
  return token;
}

function loadState() {
  if (existsSync(statePath)) return JSON.parse(readFileSync(statePath, 'utf8'));
  const data = seedStore(new Date()).data;
  data.syncSavedAt = new Date().toISOString();
  return {token: null, data};
}
const state = loadState();
const saveState = data => { mkdirSync(dirname(statePath), {recursive: true}); writeFileSync(statePath, JSON.stringify({...state, data}, null, 1)); };

const memoryBackend = createMemoryBackend(state.data);
const backend = {load: memoryBackend.load, save: (expected, next) => memoryBackend.save(expected, {...next, syncSavedAt: new Date().toISOString()})};
const model = async ({sourceUnits: units}) => {
  const title = units.map(u => u.text.trim()).join(' ');
  return {schemaVersion: 1, mode: 'capture', draftMode: 'new', reply: 'Saved your words as a task.',
    decisions: units.map(u => ({sourceId: u.id, disposition: 'action', note: null})),
    operations: [{opId: 'task1', sourceId: units[0].id, kind: 'create', entity: 'task', targetId: null, fields: [{name: 'title', value: title, evidence: units[0].text.trim(), origin: 'stated', op: 'set'}]}],
    question: null, clarification: null, memoryCandidates: [], card: null};
};
const service = createIntentService({backend, model, changePlanner, undo, editPlan, readCalendar: async () => ({status: 'not_selected', events: []})});
const memory = new Map();
const capture = createCaptureAgent({service, traces: createTraceStore({storage: {getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v)}})});
const logged = name => async (...args) => {
  try { return await capture[name](...args); } catch (error) { log(`capture ${name} failed:`, error.stack ?? error); throw error; }
};
const processor = createWebSyncProcessor({backend, capture: {...capture, capture: logged('capture'), apply: logged('apply')}});

if (!state.token) { state.token = await pair(); saveState(await backend.load()); log('Paired with', opts.site); }
if (opts['link-code']) {
  const {code, expiresAt} = await call('/v1/web/link-code', state.token, {});
  console.log(JSON.stringify({code, expiresAt: new Date(expiresAt).toISOString()}));
  process.exit(0);
}

let acks = [];
async function syncOnce() {
  for (let round = 0; round < 20; round++) {
    const reply = await call('/v1/planner/sync', state.token, {snapshot: await processor.snapshot(), acks});
    acks = [];
    const command = reply.commands[0];
    if (!command) return;
    if (+opts['delay-ms']) await new Promise(r => setTimeout(r, +opts['delay-ms']));
    const result = await processor.process(command, {snapshots: reply.snapshots, revoked: reply.revokedCommandIds.includes(command.id)});
    saveState(await backend.load());
    log(command.type, command.id.slice(0, 8), '->', result.status, result.message);
    acks = [result];
  }
}

do {
  try { await syncOnce(); } catch (error) { log('sync failed:', error.message); }
  if (!opts.once) await new Promise(r => setTimeout(r, +opts.every * 1000));
} while (!opts.once);
