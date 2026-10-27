import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {git, sitePublicationGap, publicationMessage, recordPublication, writeReceipt} from '../web-site/publication.mjs';

const scripts = fileURLToPath(new URL('../web-site/', import.meta.url));
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-site-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const makeRepo = name => {
    const root = path.join(dir, name);
    fs.mkdirSync(root);
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'test');
    fs.writeFileSync(path.join(root, '.gitignore'), '.verify/\nweb/dist-site/\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'Initial');
    return root;
  };
  const root = makeRepo('rpm'), site = makeRepo('site');
  const put = (file, text = 'changed') => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), text);
  };
  const commit = () => { git(root, 'add', '.'); git(root, 'commit', '-qm', 'Website update'); return git(root, 'rev-parse', 'HEAD'); };
  const run = (script, ...args) => spawnSync(process.execPath, [path.join(scripts, script + '.mjs'), ...args], {
    cwd: root, encoding: 'utf8', env: {...process.env, RPM_SITE_DIR: site, RPM_SYNC_SERVER: 'must-be-cleared'},
  });
  return {root, site, put, commit, run};
}

test('stage refuses unstaged, staged and untracked website or companion changes before touching the Site repo', t => {
  const {root, site, put, run} = fixture(t);
  const before = git(site, 'rev-parse', 'HEAD');
  assert.equal(sitePublicationGap(root), publicationMessage, 'missing marker requires publication on main');
  git(root, 'switch', '-qc', 'feature');
  assert.equal(sitePublicationGap(root), null, 'feature branches need no marker');
  git(root, 'switch', 'main');
  for (const file of ['web/app.mjs', 'android-companion/planner.mjs']) {
    put(file);
    for (const staged of [false, true]) {
      if (staged) git(root, 'add', file);
      const result = run('stage');
      assert.equal(result.status, 1);
      assert.match(result.stderr, /uncommitted changes under web\/ or android-companion\//);
      assert.equal(git(site, 'rev-parse', 'HEAD'), before);
    }
    git(root, 'commit', '-qm', 'Source');
    put(file, 'unstaged edit');
    assert.equal(run('stage').status, 1);
    git(root, 'restore', file);
  }
});

test('stage builds same-origin source, commits only the worker and published records the staged revision', t => {
  const {root, site, put, commit, run} = fixture(t);
  put('web/build.mjs', `import fs from 'node:fs';
if (process.env.RPM_SYNC_SERVER) throw new Error('wrong build target');
fs.mkdirSync('web/dist-site/server', {recursive:true});
fs.writeFileSync('web/dist-site/server/index.js', 'export default {};');`);
  const sha = commit();
  let result = run('stage');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /deploy through the Sites plugin with the prebuilt archive/);
  assert.match(result.stdout, /push this Site commit to the Sites source repository/);
  const archive = path.join(root, '.verify', `site-archive-${git(root, 'rev-parse', '--short', 'HEAD')}.tar`);
  assert.match(spawnSync('tar', ['-tf', archive], {encoding: 'utf8'}).stdout, /^dist\/server\/index\.js$/m, 'stage packs the deploy archive the Sites plugin needs');
  const siteCommit = git(site, 'rev-parse', 'HEAD');
  assert.match(git(site, 'log', '-1', '--format=%s'), new RegExp(`^Update Site source: .* \\(RPM-Glass ${git(root, 'rev-parse', '--short', 'HEAD')}\\)$`));
  assert.equal(git(site, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'), 'dist/server/index.js');
  assert.equal(sitePublicationGap(root), publicationMessage);
  assert.equal(run('published').status, 1);
  result = run('published', 'deployment-123');
  assert.equal(result.status, 0, result.stderr);
  const marker = JSON.parse(fs.readFileSync(path.join(root, '.verify/site-published.json')));
  assert.deepEqual({...marker, at: null}, {rpmGlassSha: sha, siteCommit, deploymentId: 'deployment-123', at: null});
  assert.ok(Number.isFinite(Date.parse(marker.at)));
  assert.equal(sitePublicationGap(root), null);
  assert.equal(git(root, 'status', '--porcelain'), '');
  put('web/new.mjs'); commit();
  assert.equal(run('published', 'wrong-revision').status, 1);
  assert.equal(sitePublicationGap(root), publicationMessage);
});

test('publication guard detects web and companion changes on main, including deletions, but ignores other files and branches', t => {
  const {root, put, commit} = fixture(t);
  put('web/app.mjs'); put('android-companion/theme.css');
  const base = commit();
  const mark = () => writeReceipt(root, 'site-published.json', {rpmGlassSha: git(root, 'rev-parse', 'HEAD'), siteCommit: 'site', deploymentId: 'deployment', at: new Date().toISOString()});
  mark();
  put('README.md'); commit();
  assert.equal(sitePublicationGap(root), null);
  for (const file of ['web/app.mjs', 'android-companion/theme.css']) {
    put(file, 'updated'); commit();
    assert.equal(sitePublicationGap(root), publicationMessage);
    git(root, 'switch', '-qc', 'feature');
    assert.equal(sitePublicationGap(root), null);
    git(root, 'switch', 'main'); git(root, 'branch', '-D', 'feature');
    mark();
    assert.equal(sitePublicationGap(root), null);
  }
  fs.rmSync(path.join(root, 'web/app.mjs')); commit();
  assert.equal(sitePublicationGap(root), publicationMessage);
  writeReceipt(root, 'site-published.json', {rpmGlassSha: base});
  assert.equal(sitePublicationGap(root), publicationMessage, 'incomplete markers fail closed');
  fs.writeFileSync(path.join(root, '.verify/site-published.json'), 'invalid');
  assert.equal(sitePublicationGap(root), publicationMessage);
});

test('a publish recorded in another worktree counts on main once main reaches that commit', t => {
  const {root, put} = fixture(t);
  const other = path.join(path.dirname(root), 'other');
  git(root, 'worktree', 'add', '-q', '-b', 'feature', other);
  fs.mkdirSync(path.join(other, 'web'));
  fs.writeFileSync(path.join(other, 'web/app.mjs'), 'standalone');
  git(other, 'add', '.'); git(other, 'commit', '-qm', 'Website on a branch');
  const sha = git(other, 'rev-parse', 'HEAD');
  recordPublication(other, {rpmGlassSha: sha, siteCommit: 'site', deploymentId: 'from-other-worktree', at: new Date().toISOString()});
  assert.equal(sitePublicationGap(root), publicationMessage, 'main has not reached the published commit yet');
  git(root, 'merge', '-q', '--ff-only', 'feature');
  assert.equal(sitePublicationGap(root), null);
  assert.equal(fs.existsSync(path.join(root, '.verify/site-published.json')), false, 'nothing was copied into this checkout');
  put('web/later.mjs'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'Later website change');
  assert.equal(sitePublicationGap(root), publicationMessage);
});

test('Stop hook and check:evidence enforce publication before other evidence paths', t => {
  const {root, put, commit} = fixture(t);
  const agent = fileURLToPath(new URL('../agent/', import.meta.url));
  fs.cpSync(agent, path.join(root, 'scripts/agent'), {recursive: true});
  fs.cpSync(scripts, path.join(root, 'scripts/web-site'), {recursive: true});
  put('web/app.mjs'); commit();
  const run = args => spawnSync(process.execPath, ['scripts/agent/require-evidence.mjs', ...args], {cwd: root, encoding: 'utf8', input: '{}'});
  const cli = run([]);
  assert.equal(cli.status, 1, cli.stderr);
  assert.ok(cli.stderr.includes(publicationMessage));
  const hook = run(['--hook']);
  assert.equal(hook.status, 0, hook.stderr);
  assert.deepEqual(JSON.parse(hook.stdout), {decision: 'block', reason: publicationMessage});
});
