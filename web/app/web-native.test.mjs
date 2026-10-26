import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ON_PHONE, PHONE, PHONE_SETTINGS, createWebNative} from './web-native.mjs';

const jev = readFileSync(new URL('../../android-companion/planner/jev.mjs', import.meta.url), 'utf8');

test('the website tells the planner it is remote and has no key of its own', () => {
  assert.equal(PHONE.remote, true);
  assert.equal(PHONE.hasKey, false);
  assert.ok(Object.isFrozen(PHONE));
});

test('phone-only settings answer with a calm notice, and other phone features say where they run', async () => {
  let opened = 0;
  const native = createWebNative({openCapture: () => { opened++; }});
  assert.deepEqual(await native('appSettings'), {phoneOnly: PHONE_SETTINGS});
  assert.deepEqual(await native('settingsAction', {action: 'sounds'}), {phoneOnly: PHONE_SETTINGS});
  await native('capture');
  assert.equal(opened, 1);
  for (const name of ['model', 'decision', 'calendarPermission', 'widgetPin']) await assert.rejects(native(name), {message: ON_PHONE});
});

test('suggestions on the website say they run on the phone before asking for a key or a model', () => {
  const remote = jev.indexOf("if (app.api.getPhone().remote) {\n    status.textContent = 'Suggestions run in RPM on your phone.';\n    return;");
  assert.ok(remote > 0);
  assert.ok(remote < jev.indexOf('if (!app.api.getPhone().hasKey)'));
  assert.ok(remote < jev.indexOf("app.api.native('model'"));
});
