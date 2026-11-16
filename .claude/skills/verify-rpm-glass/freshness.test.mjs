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

test('a web/contract edit after the last sync makes the app stale, as the evidence and merge gates count it', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const {newestFile, WEB_SOURCES} = await import('./lib/freshness.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-fresh-'));
  try {
    const put = (rel, sec) => {
      const p = path.join(root, rel);
      fs.mkdirSync(path.dirname(p), {recursive: true});
      fs.writeFileSync(p, '');
      fs.utimesSync(p, sec, sec);
    };
    put('android-companion/a.mjs', 1000);
    put('web/contract/validate.mjs', 1000 + 1800);
    const web = newestFile(root, WEB_SOURCES);
    assert.equal(web.file, path.join('web', 'contract', 'validate.mjs'));
    const stale = staleApp({...fresh, apk: {mtime: 1060 * 1000, sha: 'built'}, syncedAt: 1120 * 1000, native: {mtime: 1000 * 1000, file: 'app/src/main/A.java'}, web});
    assert.match(stale.error, /Web code changed.*validate\.mjs/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('every companion input app/build.gradle bundles is watched by the stale-app guard and the APK-staleness check', async () => {
  const fs = await import('node:fs');
  const {WEB_SOURCES, NATIVE_SOURCES} = await import('./lib/freshness.mjs');
  const root = new URL('../../../', import.meta.url);
  const gradle = fs.readFileSync(new URL('app/build.gradle', root), 'utf8');
  const line = gradle.split('\n').find(l => l.includes('inputs.files(') && l.includes('android-companion'));
  const inputs = [...line.matchAll(/fileTree\('\.\.\/([^']+)'\)/g)].map(m => m[1]);
  assert.ok(inputs.includes('web/contract'));
  const apkBuild = fs.readFileSync(new URL('.claude/skills/verify-rpm-glass/lib/apk-build.mjs', root), 'utf8');
  const apkSources = JSON.parse(apkBuild.match(/const SOURCES = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  for (const input of inputs) {
    assert.ok([...WEB_SOURCES, ...NATIVE_SOURCES].includes(input), `freshness.mjs does not watch ${input}`);
    assert.ok(apkSources.includes(input), `apk-build.mjs SOURCES does not watch ${input}`);
  }
});
