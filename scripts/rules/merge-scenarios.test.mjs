import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {mergeGap, tierOf, evidenceGap} from '../agent/require-evidence.mjs';
import {configHooksWork, installMergeCheck} from '../agent/git-hooks.mjs';

function repo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-merge-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), text); };
  write('.gitignore', '.verify/\n');
  write('android-companion/a.mjs', 'export const a = 1;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  return {root, git, write};
}
const commit = (r, file, text, message) => { r.write(file, text); r.git('add', '.'); r.git('commit', '-q', '-m', message); return r.git('rev-parse', 'HEAD'); };
const journal = (r, result) => {
  const dir = path.join(r.root, '.verify/evidence/run');
  fs.mkdirSync(dir, {recursive: true});
  fs.appendFileSync(path.join(dir, 'journal.jsonl'), JSON.stringify({at: '2026-10-20T12:00:00Z', command: 'scenario', result}) + '\n');
};

test('the tier follows the change: web-only files need a sync, anything native needs an APK build', () => {
  assert.equal(tierOf(['android-companion/a.mjs', 'intent-v2/src/b.mjs']), 'web');
  assert.equal(tierOf(['android-companion/a.mjs', 'app/src/main/java/com/rpm/prototype/NotchFrame.java']), 'native');
  assert.equal(tierOf(['cli/interpret.mjs']), 'native');
});

test('the done message names the tier the change needs and defers scenario --all to the merge', t => {
  const r = repo(t);
  r.git('checkout', '-q', '-b', 'feat/web');
  commit(r, 'android-companion/a.mjs', 'export const a = 2;\n', 'web');
  const web = evidenceGap(r.root);
  assert.match(web, /Web-only change.*rpmctl sync.*no APK build/);
  assert.match(web, /scenario --all.*once before merging to main/);
  commit(r, 'app/src/main/java/A.java', 'class A {}\n', 'java');
  assert.match(evidenceGap(r.root), /Native change.*launch --build/);
});

test('a merge into main with app changes needs a passing scenario --all on that commit', t => {
  const r = repo(t);
  r.git('checkout', '-q', '-b', 'feat/x');
  const tip = commit(r, 'android-companion/a.mjs', 'export const a = 2;\n', 'change');
  r.git('checkout', '-q', 'main');
  assert.match(mergeGap(r.root, {heads: [tip], branch: 'main'}), /needs one passing `rpmctl scenario --all` on/);
  assert.equal(mergeGap(r.root, {heads: [tip], branch: 'feat/y'}), null, 'only merges into main are checked');
  journal(r, {ok: false, all: true, head: tip, uncommittedApp: []});
  journal(r, {ok: true, all: false, head: tip, uncommittedApp: []});
  journal(r, {ok: true, all: true, head: tip, uncommittedApp: ['android-companion/a.mjs']});
  assert.notEqual(mergeGap(r.root, {heads: [tip], branch: 'main'}), null, 'a failed, partial or dirty run does not count');
  journal(r, {ok: true, all: true, head: tip, uncommittedApp: []});
  assert.equal(mergeGap(r.root, {heads: [tip], branch: 'main'}), null);
});

test('a run stays valid through docs-only commits, but not through a later app change', t => {
  const r = repo(t);
  r.git('checkout', '-q', '-b', 'feat/x');
  const tested = commit(r, 'android-companion/a.mjs', 'export const a = 2;\n', 'change');
  journal(r, {ok: true, all: true, head: tested, uncommittedApp: []});
  const docs = commit(r, 'docs/notes.md', 'notes\n', 'docs');
  r.git('checkout', '-q', 'main');
  assert.equal(mergeGap(r.root, {heads: [docs], branch: 'main'}), null);
  r.git('checkout', '-q', 'feat/x');
  const again = commit(r, 'android-companion/a.mjs', 'export const a = 3;\n', 'more');
  r.git('checkout', '-q', 'main');
  assert.notEqual(mergeGap(r.root, {heads: [again], branch: 'main'}), null);
});

test('a merge with no app change needs no scenario run', t => {
  const r = repo(t);
  r.git('checkout', '-q', '-b', 'docs');
  const tip = commit(r, 'docs/notes.md', 'notes\n', 'docs');
  r.git('checkout', '-q', 'main');
  assert.equal(mergeGap(r.root, {heads: [tip], branch: 'main'}), null);
});

for (const mode of ['config', 'files']) {
  const supported = mode === 'files' || configHooksWork();
  test(`a real merge into main runs the ${mode} hook: it refuses without a scenario run and merges after one`, {skip: !supported && 'this git ignores hook.<name>.event'}, t => {
    const r = repo(t);
    r.write('scripts/web-site/publication.mjs', fs.readFileSync(path.resolve(import.meta.dirname, '../web-site/publication.mjs')));
    for (const file of ['require-evidence.mjs', 'capture-eval.mjs', 'cloud.mjs', 'web-assets.mjs']) r.write(`scripts/agent/${file}`, fs.readFileSync(path.resolve(import.meta.dirname, '../agent', file)));
    r.git('add', '.');
    r.git('commit', '-q', '-m', 'scripts');
    assert.equal(installMergeCheck(r.root, {configHooks: mode === 'config'}).mode, mode);
    r.git('checkout', '-q', '-b', 'feat/x');
    const tip = commit(r, 'android-companion/a.mjs', 'export const a = 2;\n', 'change');
    r.git('checkout', '-q', 'main');
    const merge = () => { try { r.git('merge', '--no-ff', '-q', '-m', 'merge', 'feat/x'); return true; } catch { return false; } };
    assert.equal(merge(), false, 'the hook refuses the merge');
    assert.throws(() => r.git('commit', '-q', '--no-edit'), 'git commit cannot finish the refused merge');
    try { r.git('merge', '--abort'); } catch {}
    assert.notEqual(r.git('rev-parse', 'HEAD^{tree}'), r.git('rev-parse', `${tip}^{tree}`), 'main is unchanged');
    journal(r, {ok: true, all: true, head: tip, uncommittedApp: []});
    assert.equal(merge(), true);
    assert.equal(r.git('rev-parse', 'HEAD^2'), tip);
    commit(r, 'android-companion/b.mjs', 'export const b = 1;\n', 'an ordinary commit on main still works');
  });
}

test('the hook-file installer leaves a hook it did not write alone', t => {
  const r = repo(t);
  const hooks = path.join(r.root, '.git/hooks');
  fs.mkdirSync(hooks, {recursive: true});
  fs.writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\necho mine\n');
  assert.deepEqual(installMergeCheck(r.root, {configHooks: false}).written, ['pre-merge-commit']);
  assert.equal(fs.readFileSync(path.join(hooks, 'pre-commit'), 'utf8'), '#!/bin/sh\necho mine\n');
  assert.deepEqual(installMergeCheck(r.root, {configHooks: false}).written, ['pre-merge-commit'], 'running it again rewrites only its own hook');
});
