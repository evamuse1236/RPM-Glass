import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('capture-app.mjs');
const activity = read('../app/src/main/java/com/rpm/prototype/CompanionActivity.java');
const hook = app.match(/window\.rpmCaptureShown=\(\)=>\{([^}]*)\};/)?.[1] ?? '';

test('Capture shown again opens on the composer, not the page left from last time', () => {
  assert.match(hook, /setView\('chat'\)/, 'the hook returns to the composer');
  assert.match(hook, /sheet\.close\(\)/, 'the More menu closes');
  assert.doesNotMatch(hook, /message\.value|rpm-native-draft/, 'the unsent words stay in the field');
  const shown = activity.match(/private void shown\(\)\{([^\n]*)\}/)?.[1] ?? '';
  assert.match(shown, /!planning\(\)/, 'only the Capture window resets');
  assert.match(shown, /rpmCaptureShown/);
  assert.match(activity, /onRestart\(\)\{super\.onRestart\(\);shown\(\);\}/, 'coming back from recents resets');
  assert.match(activity, /private void arrive\(\)\{if\(web==null\)return;shown\(\);/, 'a new launch intent resets');
});
