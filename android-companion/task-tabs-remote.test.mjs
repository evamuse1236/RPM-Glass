import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFakeDom} from './fake-dom.mjs';

installFakeDom();
const {alertPanel} = await import('./planner/task-tabs.mjs');
const {el} = await import('./planner/dom.mjs');
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const RINGS = 'Alert rings on your phone';

const pick = new Proxy({}, {get: () => () => {}});
const base = {day: '2026-10-27', time: '09:00', alert: 'notify', lead: 0};

function rings(remote, now) {
  const host = el('div');
  alertPanel(host, pick, remote).paint(now);
  return host.children.filter(node => node.textContent === RINGS);
}

test('on the website the Alert tab says the alert rings on the phone, only while an alert is set', () => {
  assert.equal(rings(true, base)[0]?.hidden, false);
  assert.equal(rings(true, {...base, alert: 'off'})[0]?.hidden, true);
  assert.equal(rings(true, {...base, time: null})[0]?.hidden, true);
});

test('on the phone the Alert tab has no rings note, and the sheet passes the phone\'s remote flag', () => {
  assert.deepEqual(rings(false, base), []);
  assert.match(read('./planner/task-tabs.mjs'), /alertPanel\(panels\.alert, pick, remote\)/);
  assert.match(read('./planner/task-sheet.mjs'), /remote: !!app\.api\.getPhone\(\)\.remote/);
});
