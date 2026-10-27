import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// Real archives and imports into a fake CLI, fake backend and fake HTTP snapshot.
// No service starts and no network request can leave this test.
test('rehearsal imports under old code, preserves the backend across HEAD, reads the Site and stops both runs', async t => {
  const previous = process.cwd(), source = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-rehearsal-'));
  t.after(() => { process.chdir(previous); delete globalThis.rpmRehearsal; fs.rmSync(source, {recursive: true, force: true}); });
  const git = (...args) => execFileSync('git', args, {cwd: source, encoding: 'utf8'}).trim();
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  fs.writeFileSync(path.join(source, 'code.txt'), 'old');
  fs.writeFileSync(path.join(source, 'retired.txt'), 'old only');
  git('add', '.'); git('commit', '-qm', 'Old deployed code');
  const old = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(source, 'code.txt'), 'new'); fs.rmSync(path.join(source, 'retired.txt'));
  git('add', '-A'); git('commit', '-qm', 'New code');
  const head = git('rev-parse', 'HEAD');
  const cli = path.join(source, 'node_modules/convex/bin/main.js');
  fs.mkdirSync(path.dirname(cli), {recursive: true});
  fs.writeFileSync(cli, `const fs=require('node:fs');
    if(process.argv.includes('import')) {
      if(fs.readFileSync('code.txt','utf8')!=='old'||!process.argv.includes('--replace-all')) process.exit(2);
      fs.writeFileSync('.convex/imported','yes');
    } else if(process.argv.includes('--inline-query')) console.log('1');
    else process.exit(3);`);
  const events = [];
  globalThis.rpmRehearsal = async (root, options) => {
    const phase = fs.readFileSync(path.join(root, 'code.txt'), 'utf8');
    events.push(['start', phase, options?.reset]);
    if (phase === 'new') {
      assert.equal(options.reset, false);
      assert.equal(fs.readFileSync(path.join(root, '.convex/imported'), 'utf8'), 'yes');
      assert.equal(fs.existsSync(path.join(root, 'retired.txt')), false);
    }
    fs.mkdirSync(path.join(root, '.convex'), {recursive: true});
    fs.writeFileSync(path.join(root, '.env.local'), 'CONVEX_DEPLOYMENT=anonymous:fixture\n');
    return {siteUrl: 'http://127.0.0.1:12345', run: () => ({token: 'fake-local-token'}), stop: async () => { events.push(['stop', phase]); }};
  };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:12345/v1/web/snapshot');
    assert.equal(options.headers.Authorization, 'Bearer fake-local-token');
    return {ok: true, status: 200, json: async () => ({entries: [{id: 1}], planner: {blocks: [{id: 2}]}})};
  });
  const module = fs.readFileSync(new URL('./deploy-rehearsal.mjs', import.meta.url), 'utf8').split('\nif (process.argv[1]')[0]
    .replace("import {startLocalConvex} from '../../.claude/skills/verify-rpm-glass/lib/local-convex.mjs';", 'const startLocalConvex = globalThis.rpmRehearsal;')
    .replace("'./worktree.mjs'", JSON.stringify(new URL('./worktree.mjs', import.meta.url).href))
    .replace("'./deploy-prod-guards.mjs'", JSON.stringify(new URL('./deploy-prod-guards.mjs', import.meta.url).href));
  const {rehearse} = await import('data:text/javascript,' + encodeURIComponent(module));
  process.chdir(source);
  const work = path.join(source, '.verify/rehearsal'); fs.mkdirSync(work, {recursive: true});
  const backup = path.join(source, 'backup.zip'); fs.writeFileSync(backup, 'fake archive');
  assert.equal(await rehearse(work, backup, old, head), 2);
  assert.deepEqual(events, [['start', 'old', undefined], ['stop', 'old'], ['start', 'new', false], ['stop', 'new']]);
  assert.equal(process.cwd(), source);
});
