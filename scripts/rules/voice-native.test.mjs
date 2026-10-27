import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {bundleOptions} from '../build-companion-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const java = name => read(`app/src/main/java/com/rpm/prototype/${name}.java`);

test('the page may open a socket only to Gemini Live', () => {
  const csp = java('CompanionSurface').match(/Content-Security-Policy",\s*"([^"]+)"/)?.[1]
    ?? java('CompanionSurface').match(/"(default-src[^"]+)"/)?.[1];
  assert.equal(csp, "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src wss://generativelanguage.googleapis.com; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
});

test('the Gemini key lives apart from the OpenRouter key and is redacted', () => {
  for (const name of ['CompanionKey', 'ModelGateway', 'ModelLimits']) assert.doesNotMatch(java(name), /Gemini|GeminiKey/, `${name} must not touch the Gemini key`);
  const key = java('GeminiKey');
  assert.doesNotMatch(key.replace(/\/\*[\s\S]*?\*\//g, ''), /CompanionKey/, 'GeminiKey keeps its own store');
  assert.match(key, /"rpm-gemini-voice"/);
  assert.match(java('Diagnostics'), /GeminiKey\.get\(/, 'diagnostics redacts the stored Gemini key');
  assert.match(java('DiagnosticRedaction'), /AIza/);
  assert.match(java('DiagnosticRedaction'), /AQ\\\\\./, 'diagnostics redacts keys in the newer AQ. format');
  assert.doesNotMatch(read('android-companion/settings.mjs'), /GeminiKey\.get|geminiKey\b(?!\w)/, 'the page sees only hasGeminiKey');
});

test('the voice token is minted only in Java, with checks before the key', () => {
  const token = java('VoiceToken');
  assert.match(token, /x-goog-api-key/);
  assert.doesNotMatch(token, /\?key=|Log\./, 'the key goes in a header and nothing is logged');
  const mint = token.slice(token.indexOf('static JSONObject mint('));
  assert.ok(mint.indexOf('check(rawSetup)') < mint.indexOf('keys.call()'), 'the setup is checked before the key is read');
  assert.match(java('CompanionVoice'), /case "voiceToken":return VoiceToken\.mint\(\(\)->GeminiKey\.get\(/);
  assert.match(java('CompanionActivity'), /case "voiceToken":case "micAccess":case "micSettings":result=voice\.invoke\(action,p\)/);
});

test('the WebView mic is granted only through MicGrant', () => {
  const voice = java('CompanionVoice');
  assert.match(read('app/src/main/AndroidManifest.xml'), /android\.permission\.RECORD_AUDIO/);
  assert.match(read('app/src/main/AndroidManifest.xml'), /android\.permission\.MODIFY_AUDIO_SETTINGS/,
    'the WebView opens no audio source without it: getUserMedia fails with NotReadableError');
  const grants = voice.match(/\.grant\(/g) ?? [];
  assert.equal(grants.length, 2, 'one grant after the check, one after Android says yes');
  assert.match(java('CompanionActivity'), /onPermissionRequest\(PermissionRequest request\)\{voice\.micRequest\(request\);\}/);
  assert.match(voice, /if\(!MicGrant\.allowed\(String\.valueOf\(request\.getOrigin\(\)\),request\.getResources\(\)\)\)\{request\.deny\(\);return;\}/);
  for (const name of fs.readdirSync(path.join(root, 'app/src/main/java/com/rpm/prototype'))) {
    if (name === 'CompanionVoice.java') continue;
    assert.doesNotMatch(java(name.replace(/\.java$/, '')), /PermissionRequest[\s\S]*\.grant\(/, `${name} must not grant WebView permissions`);
  }
});

test('the mic worklet ships as its own allowlisted asset', () => {
  assert.match(java('CompanionSurface'), /"voice-mic-worklet\.js"/);
  assert.match(read('scripts/build-companion-assets.mjs'), /voice-mic-worklet\.js/);
});

test('no shipped companion asset carries a Google API key', async () => {
  const bundle = await build({...bundleOptions, write: false, logLevel: 'silent'});
  const texts = bundle.outputFiles.map(file => [file.path, file.text]);
  const shipped = path.join(root, 'android-companion');
  for (const name of fs.readdirSync(shipped)) if (/\.(html|css|js)$/.test(name)) texts.push([name, fs.readFileSync(path.join(shipped, name), 'utf8')]);
  const built = path.join(root, 'app/src/main/assets/companion');
  if (fs.existsSync(built)) for (const name of fs.readdirSync(built, {recursive: true})) {
    const file = path.join(built, name);
    if (fs.statSync(file).isFile()) texts.push([file, fs.readFileSync(file, 'latin1')]);
  }
  for (const [name, text] of texts) assert.doesNotMatch(text, /AIza[0-9A-Za-z_-]{20,}|\bAQ\.[0-9A-Za-z_-]{20,}/, `${name} contains a Google API key`);
});

test('the mic permission prompt does not stop the ramble that asked for it', () => {
  const pause = java('CompanionActivity').match(/protected void onPause\(\)\{([^\n]*)/)?.[1] ?? '';
  assert.match(pause, /!voice\.asking\(\)[^;]*rpmVoiceBackground/, 'onPause skips the background stop while Android asks for the mic');
  assert.match(java('CompanionVoice'), /boolean asking\(\)\{return pendingMic!=null;\}/);
});
