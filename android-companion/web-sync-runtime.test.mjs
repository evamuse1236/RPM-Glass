import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';
import {bundleOptions} from '../scripts/build-companion-assets.mjs';
import {fakeServer, phone} from './test/replica-server.mjs';

test('headless replica keeps its outbox on network failure and retries it after a CAS conflict', async () => {
  const output = await build({...bundleOptions, entryPoints: ['android-companion/sync-runtime.mjs'], write: false});
  const p = phone(), server = fakeServer(), pushes = [];
  let fail = true, cas = true, failed = 0, completed = 0;
  const window = {RpmSync: {
    complete: () => completed++, failed: () => failed++,
    invoke: (id, action, payload) => queueMicrotask(async () => {
      const body = JSON.parse(payload); let value, error = null;
      try {
        if (action === 'load') value = {data: await p.load()};
        else if (action === 'save') {
          if (cas) { cas = false; throw new Error('Saved context changed. Reopen RPM before retrying.'); }
          await p.save(body.expected, body.data, {origin: body.origin}); value = {};
        } else if (action === 'pull') value = await server.pull(body);
        else if (action === 'push') {
          pushes.push(body);
          value = await server.push(body);
          if (fail) { fail = false; throw new Error('Lost response'); }
        } else assert.fail(`Unexpected native action ${action}`);
      } catch (failure) { error = failure.message; }
      window.rpmBridgeResult(id, value, error);
    }),
  }};
  const context = vm.createContext({window, crypto: webcrypto, structuredClone, TextEncoder, TextDecoder, setTimeout, clearTimeout, AbortSignal, AbortController, console}, {codeGeneration: {strings: false, wasm: false}});
  await vm.runInContext(`(async()=>{${output.outputFiles[0].text}\n})()`, context);
  assert.equal(failed, 1); assert.equal(completed, 0); assert.equal(p.data.sync.outbox.seq, 1);
  await window.rpmReplicaRun();
  assert.equal(failed, 1); assert.equal(completed, 1); assert.equal(p.data.sync.outbox, null);
  assert.equal(p.data.sync.seq, 1); assert.deepEqual(pushes[0], pushes[1]);
});
