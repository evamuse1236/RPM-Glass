#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {setTimeout} from 'node:timers/promises';
import {syncReplica} from '../../android-companion/replica-sync.mjs';
import {editPlan} from '../../android-companion/planner-state.mjs';
import {seedStore} from '../gauntlet/seed.mjs';
import {filePhone} from './phone-store.mjs';

const {values: opts, positionals} = parseArgs({allowPositionals: true, options: {
  site: {type: 'string'},
  state: {type: 'string', default: '.verify/web-sync/phone.json'},
  pair: {type: 'boolean'}, sync: {type: 'boolean'}, watch: {type: 'boolean'}, edit: {type: 'string'},
  'link-code': {type: 'boolean'}, once: {type: 'boolean'},
}});
opts.site ??= existsSync('.env.local') ? readFileSync('.env.local', 'utf8').match(/^CONVEX_SITE_URL=(.*)$/m)?.[1]?.trim() : undefined;
opts.site ??= 'http://127.0.0.1:3211';
const statePath = resolve(opts.state);
const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);

async function call(path, token, body) {
  const response = await fetch(new URL(path, opts.site), {method: 'POST', signal: AbortSignal.timeout(15000),
    headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})}, body: JSON.stringify(body)});
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.json();
}

async function pair() {
  const deployment = readFileSync('.env.local', 'utf8').match(/^CONVEX_DEPLOYMENT=(.*)$/m)?.[1]?.trim();
  if (!/^(anonymous|local):/.test(deployment ?? '') || !['127.0.0.1', 'localhost'].includes(new URL(opts.site).hostname))
    throw new Error('The stand-in pairs only with local Convex.');
  const out = execFileSync('npx', ['convex', 'run', 'admin:createPairingCode', JSON.stringify({label: 'Stand-in phone'})], {encoding: 'utf8'});
  const {code} = JSON.parse(out.slice(out.indexOf('{')));
  const {token} = await call('/v1/pair', null, {code, installationId: randomUUID()});
  return token;
}

async function main() {
  if (!existsSync(statePath)) {
    const data = seedStore(new Date()).data;
    data.syncSavedAt = new Date().toISOString();
    mkdirSync(dirname(statePath), {recursive: true});
    writeFileSync(statePath, JSON.stringify({token: null, data}, null, 1), {mode: 0o600});
  }
  const phone = filePhone(statePath);
  if (opts.edit) {
    if (positionals.length !== 2) throw new Error('Use --edit <taskId> <field> <value>');
    const [field, raw] = positionals; let value = raw;
    if (!['title', 'notes', 'purpose', 'leverage', 'planned', 'plannedDate', 'blockId', 'recurrence', 'alert', 'minutes', 'priority', 'must', 'done', 'alertLead', 'repeatDays', 'repeatAfterDays'].includes(field)) throw new Error('Choose a saveTask field.');
    if (!['title', 'notes', 'purpose', 'leverage', 'planned', 'plannedDate', 'blockId', 'recurrence', 'alert'].includes(field)) value = JSON.parse(raw);
    else if (raw === 'null') value = null;
    const data = await phone.load(), expected = data.version;
    editPlan(data, {type: 'saveTask', id: Number(opts.edit), fields: {[field]: value}}, new Date());
    data.version = expected + 1; await phone.save(expected, data);
    log('Edited', opts.edit, field); return;
  }
  if (!phone.token() || opts.pair) {
    if (phone.token()) throw new Error('This store is already paired; use a new state file to pair again.');
    await phone.setToken(await pair()); log('Paired with', opts.site);
  }
  if (opts['link-code']) {
    const {code, expiresAt} = await call('/v1/web/link-code', phone.token(), {});
    console.log(JSON.stringify({code, expiresAt: new Date(expiresAt).toISOString()})); return;
  }
  if (opts.pair && !opts.sync && !opts.watch) return;
  const sync = async () => {
    await syncReplica({...phone, push: body => call('/v1/planner/push', phone.token(), body), pull: body => call('/v1/planner/pull', phone.token(), body)});
    log('Synced with', opts.site);
  };
  if (!opts.watch) { await sync(); return; }
  for (;;) {
    try { await sync(); } catch (error) { log('sync failed:', error.message); }
    await setTimeout(2000);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
