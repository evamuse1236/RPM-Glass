import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {SYNC_DIR, SEED_FILE, seedShell, wipeAppDataKeepingSync} from './lib/sync.mjs';

test('seed wipes the app data but keeps the synced web assets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-seed-'));
  const make = (file, text = 'x') => { fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true}); fs.writeFileSync(path.join(dir, file), text); };
  make('files/companion.json');
  make('files/alarm.audio');
  make(`${SYNC_DIR}/planner.css`, 'synced');
  make('shared_prefs/notch.xml');
  make('databases/diagnostics.db');
  const run = spawnSync('sh', ['-c', wipeAppDataKeepingSync()], {cwd: dir, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.readFileSync(path.join(dir, SYNC_DIR, 'planner.css'), 'utf8'), 'synced');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'files')), [path.basename(SYNC_DIR)]);
  assert.ok(!fs.existsSync(path.join(dir, 'shared_prefs')));
  assert.ok(!fs.existsSync(path.join(dir, 'databases')));
  fs.rmSync(dir, {recursive: true, force: true});
});

function appDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-seed-'));
  const make = (file, text = 'x') => { fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true}); fs.writeFileSync(path.join(dir, file), text); };
  make('files/companion.json', 'old');
  make(`${SYNC_DIR}/planner.css`, 'synced');
  make('shared_prefs/notch.xml');
  return dir;
}

test('rpmctl seed runs the shell lines that keep synced web assets, with a seed file and with --empty', () => {
  const dir = appDir();
  const pushed = path.join(dir, 'pushed.json');
  fs.writeFileSync(pushed, '{"seeded":true}');
  let run = spawnSync('sh', ['-c', seedShell({withFile: true, from: pushed})], {cwd: dir, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.readFileSync(path.join(dir, SYNC_DIR, 'planner.css'), 'utf8'), 'synced');
  assert.equal(fs.readFileSync(path.join(dir, 'files/companion.json'), 'utf8'), '{"seeded":true}');
  assert.ok(!fs.existsSync(path.join(dir, 'shared_prefs')));
  fs.rmSync(dir, {recursive: true, force: true});

  const empty = appDir();
  run = spawnSync('sh', ['-c', seedShell({withFile: false})], {cwd: empty, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.readFileSync(path.join(empty, SYNC_DIR, 'planner.css'), 'utf8'), 'synced');
  assert.deepEqual(fs.readdirSync(path.join(empty, 'files')), [path.basename(SYNC_DIR)]);
  fs.rmSync(empty, {recursive: true, force: true});

  assert.ok(!seedShell({withFile: true}).includes("'"), 'the line runs inside run-as sh -c \'...\'');
  assert.ok(seedShell({withFile: true}).includes(SEED_FILE));

  const drive = fs.readFileSync(new URL('./lib/drive.mjs', import.meta.url), 'utf8');
  const body = drive.slice(drive.indexOf('async seed('), drive.indexOf('await openLauncher', drive.indexOf('async seed(')));
  const runAs = body.split('\n').filter((line) => line.includes("'run-as'"));
  assert.equal(runAs.length, 2, 'seed has one run-as line for a seed file and one for --empty');
  for (const line of runAs) {
    assert.match(line, /\$\{seedShell\(\{withFile: (true|false)\}\)\}/, `seed's run-as line must use seedShell: ${line.trim()}`);
    assert.doesNotMatch(line, /rm -rf|cp /, `seed's run-as line must not build its own wipe: ${line.trim()}`);
  }
});
