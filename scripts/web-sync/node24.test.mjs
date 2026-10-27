import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const hasMise = spawnSync('mise', ['--version']).status === 0;

test('a local Convex script reruns itself on Node 24 when started on another Node', {skip: !hasMise && 'mise is not installed'}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'node24-')), script = join(dir, 'probe.mjs');
  writeFileSync(script, `import ${JSON.stringify(resolve('scripts/web-sync/node24.mjs'))};\nconsole.log(process.versions.node.split('.')[0]);\n`);
  const major = execFileSync(process.execPath, [script], {encoding: 'utf8'}).trim();
  assert.ok(['20', '22', '24'].includes(major), major);
});

test('production deploy insists on Node 24, even on otherwise supported Node versions', {skip: !hasMise && 'mise is not installed'}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'node24-prod-')), script = join(dir, 'probe.mjs');
  writeFileSync(script, `import {requireNode24} from ${JSON.stringify(resolve('scripts/web-sync/node24.mjs'))};\nrequireNode24();\nconsole.log(process.versions.node.split('.')[0]);\n`);
  assert.equal(execFileSync(process.execPath, [script], {encoding: 'utf8'}).trim(), '24');
});
