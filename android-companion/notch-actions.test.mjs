import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan} from './planner-state.mjs';
import {FAULT_TEXT} from './user-message.mjs';

/** A phone that answers the page's bridge the way NotchRunner does, with CompanionStore.write's version check. */
function phone(store) {
  const p = {store, saves: 0, answers: new Map(), beforeSave: null, failLoad: null};
  p.RpmNotch = {
    ready() {},
    invoke(id, action, payload) {
      const body = JSON.parse(payload);
      queueMicrotask(() => {
        if (action === 'load') {
          if (p.failLoad) return window.rpmBridgeResult(id, null, p.failLoad);
          return window.rpmBridgeResult(id, {data: structuredClone(p.store)}, null);
        }
        p.beforeSave?.();
        p.beforeSave = null;
        if (body.expected !== p.store.version || body.data.version !== p.store.version + 1) {
          return window.rpmBridgeResult(id, null, 'Saved context changed. Reopen RPM before retrying.');
        }
        p.store = body.data;
        p.saves++;
        window.rpmBridgeResult(id, {}, null);
      });
    },
    finish(id, answer) { p.answers.get(id)(JSON.parse(answer)); },
  };
  p.run = request => new Promise(resolve => {
    const id = 'n' + (p.answers.size + 1);
    p.answers.set(id, resolve);
    window.rpmNotchRun(id, request);
  });
  return p;
}

const base = () => {
  const d = freshStore();
  d.version = 4;
  editPlan(d, {type: 'saveTask', fields: {title: 'Call the bank'}});
  return d;
};

globalThis.window = {};
const device = phone(base());
window.RpmNotch = device.RpmNotch;
await import('./notch-actions.mjs');

test('the page reads the store ahead of a tap, saves one change with the version it read, and answers with its Undo token', async () => {
  await window.rpmNotchPreload();
  const answer = await device.run({action: 'drink'});
  assert.equal(answer.ok, true);
  assert.equal(answer.count, 1);
  assert.equal(device.store.version, 5);
  assert.equal(answer.token, device.store.planner.events.at(-1).id);
  const undone = await device.run({action: 'undo', token: answer.token});
  assert.deepEqual(undone, {ok: true, kind: 'undo'});
  assert.equal(device.store.planner.body?.water.glasses.length ?? 0, 0);
});

test('a save the phone refuses because the planner saved first reads the store again once, keeping the planner change', async () => {
  device.beforeSave = () => {
    editPlan(device.store, {type: 'saveTask', id: 1, fields: {title: 'Call the bank today'}});
    device.store.version++;
  };
  const answer = await device.run({action: 'drink'});
  assert.equal(answer.ok, true);
  assert.equal(device.store.entries[0].title, 'Call the bank today');
  assert.equal(device.store.planner.body.water.glasses.length, 1);
});

test('a refusal reaches the notch in plain words, and a script fault only as the calm line', async () => {
  const refused = await device.run({action: 'done', id: 99});
  assert.deepEqual(refused, {ok: false, message: 'Already done or changed.'});
  device.failLoad = 'Context exceeds 16 MB; original preserved.';
  window.rpmNotchPreload();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(await device.run({action: 'drink'}), {ok: false, message: 'Context exceeds 16 MB; original preserved.'});
  device.failLoad = null;
  const savesBefore = device.saves;
  assert.deepEqual(await device.run(null), {ok: false, message: 'The notch asked for something this version cannot do.'});
  assert.equal(device.saves, savesBefore);
  assert.equal(FAULT_TEXT, 'Something went wrong on this screen. Your saved plans are safe.');
  assert.match(fs.readFileSync(new URL('./notch-actions.mjs', import.meta.url), 'utf8'), /message: userMessage\(error\)/);
});
