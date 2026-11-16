import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {steadyTap} from './lib/steady-tap.mjs';

const pause = async () => {};

test('a control that is still moving is tapped only where it stops (the keyboard rising under "Open planner")', async () => {
  const seen = [[540, 2000], [540, 1500], [540, 1200], [540, 1200]], taps = [];
  let open = false;
  const out = await steadyTap({locate: async () => seen.shift() ?? [540, 1200], tap: async at => { taps.push(at); open = true; }, done: async () => open, pause});
  assert.deepEqual(taps, [[540, 1200]], 'one tap, at the place the control came to rest');
  assert.deepEqual(out, {done: true, taps: 1});
});

test('a tap that did not open the screen is tried again from a fresh look', async () => {
  const taps = [];
  let where = [540, 2000];
  const out = await steadyTap({
    locate: async () => where,
    tap: async at => { taps.push(at); where = [540, 1200]; },   // the first tap hit a key; the control then sits above the keyboard
    done: async () => taps.length === 2, pause,
  });
  assert.deepEqual(taps, [[540, 2000], [540, 1200]]);
  assert.deepEqual(out, {done: true, taps: 2});
});

test('it stops after three taps and says the screen did not open', async () => {
  let taps = 0;
  const out = await steadyTap({locate: async () => [1, 1], tap: async () => { taps++; }, done: async () => false, pause});
  assert.equal(taps, 3);
  assert.deepEqual(out, {done: false, taps: 3});
});

test('nothing is tapped when the screen is already open', async () => {
  const out = await steadyTap({locate: async () => assert.fail('no look is needed'), tap: async () => assert.fail('no tap is needed'), done: async () => true, pause});
  assert.deepEqual(out, {done: true, taps: 0});
});

test('rpmctl open planner taps "Open planner" through steadyTap', () => {
  const drive = fs.readFileSync(new URL('./lib/drive.mjs', import.meta.url), 'utf8');
  const planner = drive.slice(drive.indexOf("surface === 'planner'"), drive.indexOf("rendered('#nav-bar button')"));
  assert.match(planner, /steadyTap\(\{/);
  assert.doesNotMatch(planner, /^\s*touch\(serial, \(await tapElement/m, 'no single unchecked tap is left on this path');
});
