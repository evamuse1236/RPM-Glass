import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {apkCheckout, evidenceDir} from './lib/runtime.mjs';

test('a run that installs another checkout\'s APK saves its evidence in that checkout, where its evidence check looks', () => {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'other-checkout-'));
  fs.writeFileSync(path.join(other, '.git'), 'gitdir: elsewhere');
  const apk = path.join(other, 'app/build/outputs/apk/debug/app-debug.apk');
  assert.equal(apkCheckout(apk, '/home/me/this-checkout'), other);
  assert.equal(apkCheckout(apk, other), null, 'this checkout\'s own APK keeps the default folder');
  assert.equal(apkCheckout('/tmp/loose.apk', '/home/me/this-checkout'), null);
  assert.equal(evidenceDir({runId: 'run-1', appCheckout: other}), path.join(other, '.verify/evidence/run-1'));
  fs.rmSync(other, {recursive: true, force: true});
});
