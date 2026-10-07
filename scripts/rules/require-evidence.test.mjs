import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {evidenceGap} from '../agent/require-evidence.mjs';

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-evidence-'));
  const git = (...args) => execFileSync('git', args, {cwd: root, stdio: 'ignore'});
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  fs.mkdirSync(path.join(root, 'android-companion/planner'), {recursive: true});
  fs.writeFileSync(path.join(root, 'android-companion/planner/app.mjs'), 'export const a = 1;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  return root;
}
const touch = (file, ms) => { const t = new Date(ms); fs.utimesSync(file, t, t); };

test('an app change with no newer screenshot blocks "done" and says how to prove it', () => {
  const root = repo();
  try {
    const file = path.join(root, 'android-companion/planner/app.mjs');
    fs.writeFileSync(file, 'export const a = 2;\n');
    assert.match(evidenceGap(root), /android-companion\/planner\/app\.mjs.*verify-rpm-glass.*UNVERIFIED/s);
    const apk = path.join(root, 'app/build/outputs/apk/debug/app-debug.apk');
    fs.mkdirSync(path.dirname(apk), {recursive: true});
    fs.writeFileSync(apk, '');
    touch(apk, Date.now() - 60000);
    assert.match(evidenceGap(root), /debug APK is older than changed app code/, 'a build from before the change cannot prove it');
    touch(apk, Date.now() + 30000);
    fs.mkdirSync(path.join(root, '.verify/evidence/run'), {recursive: true});
    const shot = path.join(root, '.verify/evidence/run/01-today.png');
    fs.writeFileSync(shot, '');
    touch(shot, Date.now() - 60000);
    assert.match(evidenceGap(root), /01-today\.png/, 'a screenshot older than the change does not count');
    touch(shot, Date.now() + 60000);
    assert.equal(evidenceGap(root), null);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('tests, docs and unchanged trees never block', () => {
  const root = repo();
  try {
    assert.equal(evidenceGap(root), null);
    fs.writeFileSync(path.join(root, 'android-companion/planner/app.test.mjs'), 'test\n');
    fs.writeFileSync(path.join(root, 'README.md'), 'docs\n');
    assert.equal(evidenceGap(root), null);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
