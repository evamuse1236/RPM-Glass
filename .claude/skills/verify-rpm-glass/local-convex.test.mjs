import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {refuseDeployment, localSiteUrl, startLocalConvex} from './lib/local-convex.mjs';

test('the sync scenario refuses the production deployment and any cloud deployment', () => {
  assert.throws(() => refuseDeployment('CONVEX_DEPLOYMENT=dev:neat-emu-821\n'), /neat-emu-821/);
  assert.throws(() => refuseDeployment('CONVEX_DEPLOYMENT=anonymous:x\nCONVEX_SITE_URL=https://neat-emu-821.convex.site\n'), /neat-emu-821/);
  assert.throws(() => refuseDeployment('CONVEX_DEPLOYMENT=prod:other-team-123\n'), /only runs against local Convex/);
  assert.equal(refuseDeployment('CONVEX_DEPLOYMENT=anonymous:anonymous-agent\n'), 'anonymous:anonymous-agent');
  assert.equal(refuseDeployment('CONVEX_DEPLOYMENT=local:mine\n'), 'local:mine');
  assert.equal(refuseDeployment(null), null);
});

test('the phone only gets a site URL on this computer', () => {
  assert.deepEqual(localSiteUrl('CONVEX_SITE_URL=http://127.0.0.1:3213\n'), {siteUrl: 'http://127.0.0.1:3213', port: 3213});
  assert.throws(() => localSiteUrl('CONVEX_SITE_URL=https://neat-emu-821.convex.site\n'), /not a local port/);
  assert.throws(() => localSiteUrl(''), /no CONVEX_SITE_URL/);
});

test('starting refuses before spawning or wiping anything when .env.local names production', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-convex-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q', root]);
  const data = path.join(root, '.convex', 'local', 'default');
  fs.mkdirSync(data, {recursive: true});
  fs.writeFileSync(path.join(data, 'convex_local_backend.sqlite3'), 'keep');
  fs.writeFileSync(path.join(root, '.env.local'), 'CONVEX_DEPLOYMENT=dev:neat-emu-821\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {startLocalConvex} from ${JSON.stringify(new URL('./lib/local-convex.mjs', import.meta.url).href)}; await startLocalConvex(process.cwd());`], {cwd: root, encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production is refused/);
  assert.equal(fs.readFileSync(path.join(data, 'convex_local_backend.sqlite3'), 'utf8'), 'keep');
  assert.equal(fs.existsSync(path.join(root, '.verify')), false);
});

test('a fake local backend uses worktree credentials, keeps data on a second start and never logs its key', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-fake-convex-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q', root]);
  const cli = path.join(root, 'node_modules/convex/bin/main.js');
  fs.mkdirSync(path.dirname(cli), {recursive: true});
  fs.writeFileSync(cli, `const fs=require('node:fs');
    if(process.argv.includes('dev')) {
      if(process.env.CONVEX_DEPLOY_KEY||process.env.CONVEX_DEPLOYMENT||!process.env.HOME.startsWith(process.cwd()))process.exit(2);
      fs.mkdirSync('.convex/local/default',{recursive:true});
      fs.writeFileSync('.env.local','CONVEX_DEPLOYMENT=anonymous:fixture\\nCONVEX_SITE_URL=http://127.0.0.1:12345\\n');
      fs.writeFileSync('.convex/local/default/config.json',JSON.stringify({adminKey:'fake-local-private-key'}));
      console.log('CONVEX_SELF_HOSTED_ADMIN_KEY=fake-local-private-key');
      console.log('Convex functions ready');
      process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000);
    } else { console.log(JSON.stringify({saved:true})); }
  `);
  const source = fs.readFileSync(new URL('./lib/local-convex.mjs', import.meta.url), 'utf8')
    .replace("export const NODE_24 = ['mise', 'exec', 'node@24.22.0', '--', 'node'];", `export const NODE_24 = [${JSON.stringify(process.execPath)}];`)
    .replace("'../../../../scripts/web-sync/worktree.mjs'", JSON.stringify(new URL('../../../scripts/web-sync/worktree.mjs', import.meta.url).href));
  const moduleUrl = 'data:text/javascript,' + encodeURIComponent(source);
  const probe = `import fs from 'node:fs';
    import {startLocalConvex} from ${JSON.stringify(moduleUrl)};
    let local = await startLocalConvex(process.cwd(), {timeout: 10000});
    try { if(!local.run('fixture:read').saved)throw new Error('fake read failed'); }
    finally { await local.stop(); }
    fs.writeFileSync('.convex/local/default/convex_local_backend.sqlite3','keep imported data');
    local = await startLocalConvex(process.cwd(), {timeout: 10000,reset:false});
    try { if(fs.readFileSync('.convex/local/default/convex_local_backend.sqlite3','utf8')!=='keep imported data')throw new Error('data lost'); }
    finally { await local.stop(); }
    if(fs.readFileSync('.verify/web-sync/convex-scenario.log','utf8').includes('fake-local-private-key'))throw new Error('key logged');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {cwd: root, encoding: 'utf8', timeout: 30000, env: {...process.env, CONVEX_DEPLOY_KEY: 'fake-inherited-key'}});
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /fake-local-private-key|fake-inherited-key/);
});
