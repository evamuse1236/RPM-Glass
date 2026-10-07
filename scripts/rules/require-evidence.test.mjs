import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {evidenceGap} from '../agent/require-evidence.mjs';

function repo({branch = 'main'} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-evidence-'));
  const git = (...args) => execFileSync('git', args, {cwd: root, stdio: 'ignore'});
  git('init', '-q', '-b', branch);
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  fs.mkdirSync(path.join(root, 'android-companion/planner'), {recursive: true});
  fs.writeFileSync(path.join(root, 'android-companion/planner/app.mjs'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'android-companion/planner/old.mjs'), 'export const b = 1;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  return root;
}
const touch = (file, ms) => { const t = new Date(ms); fs.utimesSync(file, t, t); };
function build(root, content, at) {
  const apk = path.join(root, 'app/build/outputs/apk/debug/app-debug.apk');
  fs.mkdirSync(path.dirname(apk), {recursive: true});
  fs.writeFileSync(apk, content);
  touch(apk, at);
  return crypto.createHash('sha256').update(content).digest('hex');
}
function shot(root, name, meta, at) {
  const dir = path.join(root, '.verify/evidence/run');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, name + '.png'), '');
  fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(meta));
  touch(path.join(dir, name + '.png'), at);
}

test('an app change needs a newer build and a screenshot taken with that build installed', () => {
  const root = repo();
  try {
    fs.writeFileSync(path.join(root, 'android-companion/planner/app.mjs'), 'export const a = 2;\n');
    const now = Date.now();
    assert.match(evidenceGap(root), /debug APK is older than changed app code \(android-companion\/planner\/app\.mjs\).*UNVERIFIED/s);
    build(root, 'old build', now - 60000);
    assert.match(evidenceGap(root), /debug APK is older/, 'a build from before the change cannot prove it');
    const sha = build(root, 'new build', now + 60000);
    assert.match(evidenceGap(root), /No rpmctl screenshot was taken with the current debug APK/);
    shot(root, '01-old', {launchedByRpmctl: true, apkSha256: 'something-else'}, now + 120000);
    assert.match(evidenceGap(root), /No rpmctl screenshot/, 'a screenshot of a different build does not count');
    shot(root, '02-phone', {launchedByRpmctl: false, apkSha256: sha}, now + 120000);
    assert.match(evidenceGap(root), /No rpmctl screenshot/, 'a screenshot from a device rpmctl did not launch does not count');
    shot(root, '03-today', {launchedByRpmctl: true, apkSha256: sha}, now + 120000);
    assert.equal(evidenceGap(root), null);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('deleting app code also needs proof', () => {
  const root = repo();
  try {
    fs.rmSync(path.join(root, 'android-companion/planner/old.mjs'));
    assert.match(evidenceGap(root), /android-companion\/planner\/old\.mjs/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('tests, docs and unchanged trees never block; a repo with no main says so', () => {
  const root = repo();
  try {
    assert.equal(evidenceGap(root), null);
    fs.writeFileSync(path.join(root, 'android-companion/planner/app.test.mjs'), 'test\n');
    fs.writeFileSync(path.join(root, 'README.md'), 'docs\n');
    assert.equal(evidenceGap(root), null);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
  const orphan = repo({branch: 'work'});
  try { assert.match(evidenceGap(orphan), /no main or origin\/main/); } finally { fs.rmSync(orphan, {recursive: true, force: true}); }
});
