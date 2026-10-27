import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {worktreePath} from './worktree.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-local-paths-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q', root]);
  return root;
}

test('credential paths refuse traversal and symlinks before reading another worktree', t => {
  const root = fixture(t), other = fixture(t);
  assert.throws(() => worktreePath(root, '../other/.env.local'), /inside this worktree/);
  for (const name of ['.env', '.env.local', '.convex']) {
    fs.symlinkSync(other, path.join(root, name), 'dir');
    assert.throws(() => worktreePath(root, name + (name === '.convex' ? '/local/default/config.json' : '')), /inside this worktree/);
    fs.unlinkSync(path.join(root, name));
  }
  fs.mkdirSync(path.join(root, '.convex/local/default'), {recursive: true});
  fs.symlinkSync(other, path.join(root, '.convex/local/default/config.json'), 'dir');
  const script = `import {localPaths} from ${JSON.stringify(new URL('./worktree.mjs', import.meta.url).href)}; localPaths(process.cwd());`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {cwd: root, encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /inside this worktree/);
});

test('local Convex isolates legacy home credentials and refuses a different repo root', t => {
  const root = fixture(t), other = fixture(t);
  const script = `import {localPaths,localEnv} from ${JSON.stringify(new URL('./worktree.mjs', import.meta.url).href)};
    try { localPaths(${JSON.stringify(other)}); process.exit(2); } catch {}
    console.log(JSON.stringify(localEnv(process.cwd())));`;
  const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {cwd: root, encoding: 'utf8', env: {...process.env, CONVEX_DEPLOY_KEY: 'fake-key', CONVEX_DEPLOYMENT: 'prod:fake', CONVEX_DEPLOYMENT_TOKEN: 'fake-token'}}));
  assert.equal(out.HOME, path.join(root, '.verify/convex-home'));
  assert.equal(out.USERPROFILE, out.HOME);
  assert.equal(out.CONVEX_DEPLOY_KEY, undefined);
  assert.equal(out.CONVEX_DEPLOYMENT, undefined);
  assert.equal(out.CONVEX_DEPLOYMENT_TOKEN, undefined);
});


test('local CLI refuses deploy keys hidden in either worktree env file', t => {
  const root = fixture(t);
  const script = `import {localEnv} from ${JSON.stringify(new URL('./worktree.mjs', import.meta.url).href)}; localEnv(process.cwd());`;
  for (const name of ['.env', '.env.local']) {
    fs.writeFileSync(path.join(root, name), 'CONVEX_DEPLOY_KEY=fake-private-key\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {cwd: root, encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not contain deploy keys/);
    assert.doesNotMatch(result.stderr, /fake-private-key/);
    fs.unlinkSync(path.join(root, name));
  }
});
