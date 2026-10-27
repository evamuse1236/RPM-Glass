import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path => fileURLToPath(new URL(path, import.meta.url));
const files = dir => readdirSync(dir).flatMap(name => statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]);
const build = (extra = {}) => {
  const env = {...process.env, ...extra};
  delete env.RPM_SYNC_SERVER;
  execFileSync(process.execPath, [here('./build.mjs')], {env, stdio: 'pipe'});
};

test('the built website and Site carry no Google API key, even when the build runs with one set', () => {
  build({GEMINI_API_KEY: 'AIzaBuildTimeKeyMustNotShip000'});
  const leaked = [here('./dist/'), here('./dist-site/')].flatMap(files).filter(file => /AIza/.test(readFileSync(file).toString('latin1')));
  assert.deepEqual(leaked, []);
});

test('the build serves the mic worklet and the Site worker carries it as a script', () => {
  build();
  assert.equal(readFileSync(here('./dist/voice-mic-worklet.js'), 'utf8'), readFileSync(here('../android-companion/voice-mic-worklet.js'), 'utf8'));
  assert.match(readFileSync(here('./dist/app.js'), 'utf8'), /\/v1\/web\/voice-token/);
  assert.match(readFileSync(here('./dist-site/server/index.js'), 'utf8'), /"\/voice-mic-worklet\.js":\{type:"text\/javascript"/);
});
