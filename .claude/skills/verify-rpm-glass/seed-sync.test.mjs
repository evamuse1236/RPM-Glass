import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {SYNC_DIR, wipeAppDataKeepingSync} from './lib/sync.mjs';

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
