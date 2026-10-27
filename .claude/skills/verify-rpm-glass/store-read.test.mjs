import test from 'node:test';
import assert from 'node:assert/strict';
import {storeJson} from './lib/scenarios.mjs';

const noWait = {wait: async () => {}};

test('a scenario store read retries a read that is not JSON yet', async () => {
  const reads = [{text: 'run-as: busy'}, {json: {entries: [{title: 'A'}]}}];
  assert.deepEqual(await storeJson(async () => reads.shift(), noWait), {entries: [{title: 'A'}]});
});

test('a store read that never parses fails with the text it got, not a TypeError later', async () => {
  let reads = 0;
  await assert.rejects(storeJson(async () => { reads++; return {text: '{"entries": ['}; }, noWait), err => {
    assert.match(err.message, /did not read as JSON after 3 tries/);
    assert.equal(err.detail.text, '{"entries": [');
    return true;
  });
  assert.equal(reads, 3);
});

// Replace only device/runtime boundaries, just like lifecycle.test.mjs: no emulator.
import fs from 'node:fs';
import {HELP} from './lib/help.mjs';

test('store reads the saved planner through state and prints whole, dotted, null and scalar values', async t => {
  const key = 'rpm-store-fixture';
  t.after(() => { delete globalThis[key]; });
  const store = {entries: [{title: 'Saved title'}], sync: {outbox: [], enabled: false, cursor: 0, error: null}};
  const calls = [];
  globalThis[key] = {text: JSON.stringify(store), calls};
  const fixture = `data:text/javascript,${encodeURIComponent(`
    export const PACKAGE='com.rpm.prototype';
    export class UserError extends Error {}
    export const adb=(serial,args)=>{globalThis['${key}'].calls.push([serial,args]);return globalThis['${key}'].text;};
    export const target=()=>({serial:'fake-device'});
    export const appPid=()=>null,foregroundActivity=()=>null,displayInfo=()=>null,nativeNodes=()=>[],inPage=()=>null;
    export const ROOT='', readState=()=>null,evidenceDir=()=>'',journal=()=>{},viaShell=()=>[],errorLines=()=>[];
  `)}`;
  const source = fs.readFileSync(new URL('./lib/evidence.mjs', import.meta.url), 'utf8')
    .replaceAll("'./device.mjs'", JSON.stringify(fixture)).replaceAll("'./runtime.mjs'", JSON.stringify(fixture)).replaceAll("'./page.mjs'", JSON.stringify(fixture));
  const {evidenceCommands: commands} = await import('data:text/javascript,' + encodeURIComponent(source));
  assert.deepEqual(await commands.store({_: []}), store);
  for (const [field, value] of [['sync.outbox', []], ['entries.0.title', 'Saved title'], ['sync.enabled', false], ['sync.cursor', 0], ['sync.error', null]])
    assert.deepEqual(await commands.store({_: [field]}), value);
  assert.ok(calls.every(([serial, args]) => serial === 'fake-device' && args.at(-1) === 'files/companion.json'));
  await assert.rejects(commands.store({_: ['sync.missing']}), /does not exist/);
  await assert.rejects(commands.store({_: ['sync..outbox']}), /dotted store path/);
  globalThis[key].text = 'run-as: busy';
  await assert.rejects(commands.store({_: []}), /not valid JSON/);
  assert.match(HELP.store, /sync.outbox/);
  assert.match(fs.readFileSync(new URL('./rpmctl.mjs', import.meta.url), 'utf8'), /store: evidenceCommands.store/);
});
