import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CAPTURE_PIPELINE_SOURCES} from '../agent/require-evidence.mjs';
import {captureEvalEvidence,captureSourceHash,recordCaptureRun} from '../agent/capture-eval.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-capture-eval-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: root, stdio: 'ignore'});
  const put = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), value);
  };
  git('init', '-qb', 'main');
  git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.com');
  put('.gitignore', '.verify/\n');
  put('intent-v2/src/model.mjs', 'before');
  put('scripts/capture-stress/corpus/real-2026-10-27.json', JSON.stringify([{id: 'real-one'}, {id: 'real-two'}]));
  git('add', '.'); git('commit', '-qm', 'base'); git('switch', '-qc', 'feature');
  const run = (overrides = {}, directory = path.join(root, '.verify/capture-stress/run')) => {
    fs.mkdirSync(directory, {recursive: true});
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({
      sourceHash: captureSourceHash(root), sourceStable: true, transport: 'api',
      results: [{id: 'real-one', pass: false}, {id: 'real-two', pass: true}], ...overrides,
    }));
    return directory;
  };
  return {root, put, run, git};
}

test('pipeline changes need a current API run covering every real case, regardless of score', t => {
  const {root, put, run, git} = fixture(t);
  assert.equal(captureEvalEvidence(root).gap, null);
  put('intent-v2/src/model.mjs', 'after');
  const missing = captureEvalEvidence(root).gap;
  assert.match(missing, /Capture pipeline changed: run the live eval \(secret run --env ANTHROPIC_API_KEY=anthropic -- npm run stress:capture -- --transport api --only real-one,real-two --repeat 3\)/);
  run({sourceHash: 'stale'});
  assert.equal(captureEvalEvidence(root).gap, missing);
  run({transport: 'cli'});
  assert.equal(captureEvalEvidence(root).gap, missing);
  run({results: [{id: 'real-one', pass: true}, {id: 'real-one', pass: true}]});
  assert.equal(captureEvalEvidence(root).gap, missing, 'repeats cannot replace missing cases');
  run({sourceStable: false});
  assert.equal(captureEvalEvidence(root).gap, missing);
  run();
  assert.equal(captureEvalEvidence(root).gap, null);
  assert.match(captureEvalEvidence(root).report, /1\/2 real-corpus case-runs passed/);
  git('add', 'intent-v2'); git('commit', '-qm', 'pipeline');
  assert.equal(captureEvalEvidence(root).gap, null, 'hash survives committing the evaluated code');
  put('intent-v2/src/model.mjs', 'new edit');
  assert.equal(captureEvalEvidence(root).gap, missing);
});

test('custom output is discovered through the runner index', t => {
  const {root, put, run} = fixture(t);
  put('cli/interpret.mjs', 'new');
  const directory = run({}, path.join(root, 'custom-output'));
  assert.ok(captureEvalEvidence(root).gap);
  recordCaptureRun(root, directory);
  recordCaptureRun(root, directory);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.verify/capture-stress-index.json'))).length, 1);
  assert.equal(captureEvalEvidence(root).gap, null);
});

test('non-pipeline changes do not require a live eval', t => {
  const {root, put} = fixture(t);
  const before = captureSourceHash(root);
  put('android-companion/planner.mjs', 'new'); put('README.md', 'new');
  assert.equal(captureSourceHash(root), before);
  assert.equal(captureEvalEvidence(root).gap, null);
});

test('a branch behind main is not blamed for pipeline changes that landed on main', t => {
  const {root, put, git} = fixture(t);
  git('switch', '-q', 'main');
  put('intent-v2/src/model.mjs', 'changed on main'); git('commit', '-qam', 'main capture change');
  git('switch', '-q', 'feature');
  put('web/app.mjs', 'website work'); git('add', '.'); git('commit', '-qm', 'website');
  assert.equal(captureEvalEvidence(root).gap, null);
  put('intent-v2/src/model.mjs', 'branch edit');
  assert.ok(captureEvalEvidence(root).gap, 'an edit on the branch still counts');
});

test('every declared pipeline surface changes the hash, including deletion and native models', t => {
  const {root, put} = fixture(t);
  for (const file of ['intent-v2/prompts/turn.txt', 'cli/interpret.mjs', 'android-companion/intent-service.mjs',
    'android-companion/capture-agent.mjs', 'android-companion/runtime.mjs', 'app/src/main/java/com/rpm/prototype/ModelGateway.java']) {
    assert.ok(CAPTURE_PIPELINE_SOURCES.some(pattern => pattern.test(file)), file);
    const before = captureSourceHash(root);
    put(file, 'new');
    assert.notEqual(captureSourceHash(root), before, file);
    assert.ok(captureEvalEvidence(root).gap, file);
    fs.rmSync(path.join(root, file));
    assert.equal(captureSourceHash(root), before);
  }
  fs.rmSync(path.join(root, 'intent-v2/src/model.mjs'));
  assert.ok(captureEvalEvidence(root).gap, 'tracked deletion');
});

test('CLI and Stop hook enforce live evaluation before device or cloud evidence', t => {
  const {root, put, run} = fixture(t);
  const scripts = fileURLToPath(new URL('../', import.meta.url));
  for (const dir of ['agent', 'web-site']) fs.cpSync(path.join(scripts, dir), path.join(root, 'scripts', dir), {recursive: true});
  put('intent-v2/src/model.mjs', 'after');
  for (const cloud of ['', 'test-cloud']) {
    const invoke = args => spawnSync(process.execPath, ['scripts/agent/require-evidence.mjs', ...args], {
      cwd: root, encoding: 'utf8', input: '{}', env: {...process.env, CLAUDE_CODE_REMOTE_SESSION_ID: cloud},
    });
    const cli = invoke([]);
    assert.equal(cli.status, 1, cli.stderr);
    assert.match(cli.stderr, /Capture pipeline changed/);
    const hook = invoke(['--hook']);
    assert.equal(hook.status, 0, hook.stderr);
    assert.equal(JSON.parse(hook.stdout).decision, 'block');
    assert.match(JSON.parse(hook.stdout).reason, /--only real-one,real-two/);
    run();
    const evaluated = invoke(['--hook']);
    assert.match(JSON.parse(evaluated.stdout).systemMessage, /1\/2 real-corpus case-runs passed/);
    fs.rmSync(path.join(root, '.verify/capture-stress'), {recursive: true});
  }
});
