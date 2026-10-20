import test from 'node:test';
import assert from 'node:assert/strict';
import {staleApp} from './lib/freshness.mjs';

const apk = {mtime: 1000, sha: 'built'};
const fresh = {apk, installedSha: 'built', syncedAt: null, native: {mtime: 900, file: 'app/src/main/A.java'}, web: {mtime: 900, file: 'android-companion/a.mjs'}};

test('scenarios run only on the app this checkout built', () => {
  assert.equal(staleApp(fresh), null);
  assert.match(staleApp({...fresh, apk: null}).error, /no debug APK/);
  assert.match(staleApp({...fresh, installedSha: 'older'}).error, /different APK/);
});

test('a native edit after the build needs a rebuild; a web edit needs only a sync', () => {
  const native = staleApp({...fresh, native: {mtime: 1100, file: 'app/src/main/A.java'}});
  assert.match(native.error, /Native code changed.*A\.java/);
  assert.match(native.fix, /launch --build/);
  const web = staleApp({...fresh, web: {mtime: 1100, file: 'android-companion/a.mjs'}});
  assert.match(web.error, /Web code changed.*a\.mjs/);
  assert.match(web.fix, /rpmctl sync.*no APK build/);
  assert.equal(staleApp({...fresh, web: {mtime: 1100, file: 'android-companion/a.mjs'}, syncedAt: 1200}), null);
});
