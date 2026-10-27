import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {deployOptions, prodDeployment, deployEnv, recentBackup, assertPending, assertSiteRecords, quietRun, runDeploy} from './deploy-prod-guards.mjs';
import {snapshotRecords} from './deploy-rehearsal.mjs';

const argv = ['--env-file', 'prod.env', '--old-ref', 'deployed'];
test('production arguments require an explicit env file and deployed revision, with no unknown flags', () => {
  for (const args of [[], ['prod.env'], ['--env-file', 'prod.env'], [...argv, '--prod'], [...argv, 'extra']])
    assert.throws(() => deployOptions(args));
  assert.equal(deployOptions([...argv, '--dry-run', '--allow-empty-site'])['dry-run'], true);
  assert.equal(prodDeployment('# target\nCONVEX_DEPLOYMENT=prod:fixture-prod-123\n'), 'fixture-prod-123');
  for (const text of ['', 'CONVEX_DEPLOYMENT=dev:fixture', 'CONVEX_DEPLOYMENT=local:fixture', 'CONVEX_DEPLOYMENT=prod:a\nCONVEX_DEPLOYMENT=prod:b', 'CONVEX_DEPLOYMENT=prod:a\nCONVEX_DEPLOY_KEY=fake', 'CONVEX_DEPLOYMENT=prod:a\nCONVEX_SELF_HOSTED_URL=http://other'])
    assert.throws(() => prodDeployment(text), /exactly one prod/);
  assert.deepEqual(deployEnv({PATH: 'bin', CONVEX_DEPLOY_KEY: 'fake', CONVEX_DEPLOYMENT: 'dev:fake', CONVEX_DEPLOYMENT_TOKEN: 'fake'}), {PATH: 'bin'});
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-deploy-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const envFile = path.join(root, 'prod.env'), backup = path.join(root, 'fixture-prod-123-export.zip');
  fs.writeFileSync(envFile, 'CONVEX_DEPLOYMENT=prod:fixture-prod-123\n');
  fs.writeFileSync(backup, 'PK fake zip');
  fs.utimesSync(backup, new Date(Date.now() - 1000), new Date(Date.now() - 1000));
  const calls = [], state = {pending: [0, 0], count: 2};
  const run = (cmd, args, options) => {
    calls.push({cmd, args, options});
    assert.equal(options.env?.CONVEX_DEPLOY_KEY, undefined);
    assert.equal(options.env?.CONVEX_DEPLOYMENT, undefined);
    if (cmd === 'git') {
      if (args[0] === 'status') return state.dirty ? ' M convex/schema.ts' : '';
      return args.includes('deployed^{commit}') ? 'a'.repeat(40) : 'b'.repeat(40);
    }
    if (cmd === 'unzip') { if (state.badZip) throw new Error('Invalid zip'); return ''; }
    if (args[0].endsWith('deploy-rehearsal.mjs')) return JSON.stringify(state.count);
    const target = args[args.indexOf('--env-file') + 1];
    assert.equal(fs.readFileSync(target, 'utf8'), 'CONVEX_DEPLOYMENT=prod:fixture-prod-123\n');
    if (args.includes('--inline-query')) { assert.match(args[args.indexOf('--inline-query') + 1], /webCommands.*pending/); return JSON.stringify(state.pending.shift()); }
    assert.ok(args.includes('deploy') && args.includes('-y'));
    return '';
  };
  return {root, envFile, backup, state, calls, run, options: deployOptions(['--env-file', envFile, '--old-ref', 'deployed'])};
}

test('backups must be regular zip files for this deployment and less than one hour old', t => {
  const f = fixture(t), now = Date.now();
  assert.equal(recentBackup(f.root, 'fixture-prod-123', now), f.backup);
  assert.throws(() => recentBackup(f.root, 'other-prod', now), /backup zip/);
  fs.utimesSync(f.backup, new Date(now - 3600001), new Date(now - 3600001));
  assert.throws(() => recentBackup(f.root, 'fixture-prod-123', now), /backup zip/);
  assert.throws(() => recentBackup(f.root, 'fixture-prod-123', now - 7200000), /backup zip/);
});

test('dry-run rehearses, checks its Site snapshot, and never deploys; normal deploy repeats pending guard', t => {
  for (const dryRun of [true, false]) {
    const f = fixture(t);
    const result = runDeploy({...f.options, 'dry-run': dryRun}, {root: f.root, backupDir: f.root, run: f.run});
    assert.equal(result.plannerRecords, 2);
    assert.equal(f.calls.filter(call => call.args.includes('deploy')).length, dryRun ? 0 : 1);
    assert.equal(f.calls.filter(call => call.args.includes('--inline-query')).length, dryRun ? 1 : 2);
    assert.equal(f.calls.filter(call => call.args[0].endsWith('deploy-rehearsal.mjs')).length, 1);
    assert.deepEqual(fs.readdirSync(path.join(f.root, '.verify')), []);
    assert.equal(f.calls.find(call => call.cmd === 'unzip').options.env.UNZIP_DISABLE_ZIPBOMB_DETECTION, 'TRUE', 'Convex exports trip the unzip zip-bomb check');
  }
});

test('pending commands, broken backups, dirty code and an empty Site each stop before deploy', t => {
  for (const change of [{pending: [1]}, {pending: ['0']}, {pending: [0, 1]}, {badZip: true}, {dirty: true}, {count: 0}, {count: null}]) {
    const f = fixture(t); Object.assign(f.state, change);
    assert.throws(() => runDeploy(f.options, {root: f.root, backupDir: f.root, run: f.run}));
    assert.equal(f.calls.some(call => call.args.includes('deploy')), false);
  }
  const f = fixture(t); f.state.count = 0;
  assert.equal(runDeploy({...f.options, 'allow-empty-site': true}, {root: f.root, backupDir: f.root, run: f.run}).deployed, true);
  for (const value of [undefined, null, -1, 1, '0']) assert.throws(() => assertPending(value));
  for (const value of [undefined, null, -1, '1']) assert.throws(() => assertSiteRecords(value, true));
});

test('snapshot guard counts visible records, and CLI failures suppress even secret-bearing output', () => {
  assert.equal(snapshotRecords({entries: [], planner: {areas: [], blocks: [], projects: []}}), 0);
  assert.equal(snapshotRecords({entries: [{id: 1}], planner: {blocks: [{id: 2}]}}), 2);
  assert.throws(() => snapshotRecords({}), /invalid/);
  assert.throws(() => quietRun(process.execPath, ['-e', 'console.error("fake-private-key");process.exit(1)']), error => !error.message.includes('fake-private-key') && error.message.includes('withheld'));
});
