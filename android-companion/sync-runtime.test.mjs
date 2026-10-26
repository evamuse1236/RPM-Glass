import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';
import {bundleOptions} from '../scripts/build-companion-assets.mjs';
import {fakeServer, phone} from './test/replica-server.mjs';
import {projectRecords} from '../web/contract/records.mjs';

test('replica runtime calls native push/pull and CAS saves with sync origin on page load with eval blocked', async () => {
  const output = await build({...bundleOptions, entryPoints: ['android-companion/sync-runtime.mjs'], write: false});
  const p = phone(), server = fakeServer(), actions = [], completions = [];
  const window = {RpmSync: {
    complete: value => completions.push(JSON.parse(value)), failed: () => assert.fail('Sync runtime failed'),
    invoke: (id, action, payload) => queueMicrotask(async () => {
      const body = JSON.parse(payload); actions.push(action);
      let value;
      if (action === 'load') value = {data: await p.load()};
      else if (action === 'save') {await p.save(body.expected, body.data, {origin: body.origin}); value = {};}
      else if (action === 'push') value = await server.push(body);
      else if (action === 'pull') value = await server.pull(body);
      else assert.fail(`Unexpected native action ${action}`);
      window.rpmBridgeResult(id, value, null);
    }),
  }};
  const context = vm.createContext({window, crypto: webcrypto, structuredClone, TextEncoder, TextDecoder, setTimeout, clearTimeout, AbortSignal, AbortController, console}, {codeGeneration: {strings: false, wasm: false}});
  await vm.runInContext(`(async()=>{${output.outputFiles[0].text}\n})()`, context);
  assert.equal(window.rpmSyncRun, undefined);
  assert.equal(typeof window.rpmReplicaRun, 'function');

  assert.ok(actions.includes('push'));
  assert.ok(actions.includes('pull'));
  assert.equal(p.saves.length, 2);
  assert.deepEqual(projectRecords(p.data), server.project());
  assert.equal(completions.length, 1);
});
