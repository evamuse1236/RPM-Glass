import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {evidenceGap} from '../agent/require-evidence.mjs';
import {builtWeb} from '../agent/web-assets.mjs';

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
  fs.writeFileSync(path.join(dir, name + '.png'), Buffer.alloc(2000));
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
    fs.rmSync(path.join(root, '.verify/evidence/run/03-today.json'));
    assert.match(evidenceGap(root), /No rpmctl screenshot/);
    shot(root, '04-ci', {launchedByRpmctl: false, adoptedByRpmctl: true, apkSha256: sha}, now + 120000);
    assert.equal(evidenceGap(root), null, 'explicitly adopted CI emulator evidence counts');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

function bundle(root, content, at) {
  const file = path.join(root, 'app/src/main/assets/companion/runtime.js');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  touch(file, at);
  return builtWeb(root).sha;
}

test('a web-only change proven by a synced screenshot needs no new APK; Java still does', () => {
  const root = repo();
  try {
    const now = Date.now();
    const apk = build(root, 'build', now - 60000);
    fs.writeFileSync(path.join(root, 'android-companion/planner/app.mjs'), 'export const a = 2;\n');
    touch(path.join(root, 'android-companion/planner/app.mjs'), now);
    assert.match(evidenceGap(root), /debug APK is older.*rpmctl sync/s, 'an unbundled web change asks for sync or a build');
    const old = bundle(root, 'old bundle', now + 30000);
    shot(root, '01-apk-only', {launchedByRpmctl: true, apkSha256: apk}, now + 60000);
    assert.match(evidenceGap(root), /No rpmctl screenshot/, 'a screenshot without the synced assets cannot show the web change');
    shot(root, '02-synced', {launchedByRpmctl: true, apkSha256: apk, webSha256: old}, now + 60000);
    assert.equal(evidenceGap(root), null);
    bundle(root, 'newer bundle', now + 90000);
    assert.match(evidenceGap(root), /No rpmctl screenshot/, 'a screenshot of an older sync does not count');
    fs.mkdirSync(path.join(root, 'app/src/main/java'), {recursive: true});
    fs.writeFileSync(path.join(root, 'app/src/main/java/A.java'), 'class A {}\n');
    touch(path.join(root, 'app/src/main/java/A.java'), now + 100000);
    assert.match(evidenceGap(root), /debug APK is older than changed app code \(app\/src\/main\/java\/A\.java\)/, 'sync never proves Java');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('a bundled web change with no APK built names the missing APK instead of crashing', () => {
  const root = repo();
  try {
    const now = Date.now();
    fs.writeFileSync(path.join(root, 'android-companion/planner/app.mjs'), 'export const a = 2;\n');
    touch(path.join(root, 'android-companion/planner/app.mjs'), now);
    bundle(root, 'bundle', now + 30000);
    assert.match(evidenceGap(root), /No debug APK is built.*UNVERIFIED/s);
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

test('a passing GitHub emulator run proves the app files of its commit, and only those', () => {
  const root = repo();
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
  git('checkout', '-q', '-b', 'feature');
  fs.writeFileSync(path.join(root, 'android-companion/planner/app.mjs'), 'export const a = 2;\n');
  git('commit', '-qam', 'change app');
  const ran = git('rev-parse', 'HEAD');
  const ci = (name, conclusion, sha) => {
    const dir = path.join(root, '.verify/evidence', name, 'rpm-emulator-evidence/run');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, '01-shot.png'), Buffer.alloc(2000));
    fs.writeFileSync(path.join(root, '.verify/evidence', name, 'run.json'), JSON.stringify({conclusion, sha, url: 'https://github.com/x/y/actions/runs/1'}));
  };
  assert.match(evidenceGap(root), /older than changed app code/);
  ci('ci-1', 'failure', ran);
  assert.match(evidenceGap(root), /older than changed app code/, 'a failed run proves nothing');
  ci('ci-2', 'success', ran);
  assert.equal(evidenceGap(root), null);
  fs.writeFileSync(path.join(root, 'notes.md'), 'docs\n');
  git('add', 'notes.md'); git('commit', '-qm', 'docs only');
  assert.equal(evidenceGap(root), null, 'later commits that leave app files alone keep the proof');
  fs.writeFileSync(path.join(root, 'android-companion/planner/app.mjs'), 'export const a = 3;\n');
  assert.match(evidenceGap(root), /older than changed app code/, 'an uncommitted app edit is not in the run');
  git('commit', '-qam', 'change again');
  assert.match(evidenceGap(root), /older than changed app code/, 'a later app commit is not in the run');
});
