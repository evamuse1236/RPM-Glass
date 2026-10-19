import test from 'node:test';
import assert from 'node:assert/strict';
import {scenarioArgs, scenarioOutcome} from './scenarios.mjs';
import {selectRun, untilCompleted} from './emulator.mjs';
import {avdConfig} from './prepare-avd.mjs';

test('CI AVD uses the S24 FE physical display, including density after display phone resets overrides', () => {
  const configured = avdConfig('hw.lcd.width=1080\nhw.lcd.height=1920\nhw.lcd.density=420\nhw.lcd.density=480\nabi.type=x86_64\n');
  assert.match(configured, /^hw.lcd.width=1080$/m);
  assert.match(configured, /^hw.lcd.height=2340$/m);
  assert.match(configured, /^hw.lcd.density=450$/m);
  assert.equal(configured.match(/hw.lcd.density=/g).length, 1);
  assert.match(configured, /^abi.type=x86_64$/m);
  assert.equal(avdConfig(configured), configured);
});

test('scenario input is data, never a command or arbitrary rpmctl option', () => {
  assert.deepEqual(scenarioArgs(), ['--all']);
  assert.deepEqual(scenarioArgs('capture-keeps-words plan-add-in-place'), ['capture-keeps-words', 'plan-add-in-place']);
  for (const value of ['', '--owner stolen', '--all; echo hi', '$(touch x)', '--all --serial phone']) assert.throws(() => scenarioArgs(value));
});

test('CI accepts a fixed known bug with a warning but keeps unexpected failures red', () => {
  const report = (...statuses) => ({results: statuses.map((status, i) => ({id: `scenario-${i}`, status}))});
  assert.deepEqual(scenarioOutcome(report('pass', 'known-bug'), 0), {ok: true, warnings: []});
  const fixed = scenarioOutcome(report('pass', 'known-bug-fixed'), 1);
  assert.equal(fixed.ok, true);
  assert.equal(fixed.warnings.length, 1);
  for (const value of [report('fail'), report('known-bug-fixed', 'fail'), report('unknown'), {}, report()])
    assert.equal(scenarioOutcome(value, 1).ok, false);
  assert.equal(scenarioOutcome(report('pass'), null).ok, false);
  assert.equal(scenarioOutcome(report('pass'), 0, ['scenario-0', 'typo-id']).ok, false, 'a valid ID cannot hide an unknown requested scenario');
  assert.equal(scenarioOutcome(report('pass'), 0, ['scenario-0']).ok, true);
});

test('helper follows only its own dispatch at the current pushed branch and commit', () => {
  const expected = {branch: 'ci/emulator', sha: 'abc', request: 'unique'};
  const run = {headBranch: 'ci/emulator', headSha: 'abc', displayTitle: 'RPM emulator unique', event: 'workflow_dispatch'};
  const others = [{...run, headSha: 'old'}, {...run, headBranch: 'main'}, {...run, displayTitle: 'RPM emulator somebody-else'}, {...run, event: 'push'}];
  assert.equal(selectRun(others, expected), undefined);
  assert.equal(selectRun([...others, run], expected), run);
});

test('a run is finished only when GitHub says it completed: API errors and in-progress answers keep it waiting', async () => {
  const answers = [() => { throw new Error('HTTP 502'); }, () => ({status: 'in_progress'}), () => ({status: 'completed', conclusion: 'success'})];
  let waits = 0;
  const run = await untilCompleted(() => answers.shift()(), {wait: async () => { waits++; }});
  assert.deepEqual(run, {status: 'completed', conclusion: 'success'});
  assert.equal(waits, 2);
});

test('waiting for a run stops at its time limit', async () => {
  let t = 0;
  const run = await untilCompleted(() => ({status: 'in_progress'}), {wait: async ms => { t += ms; }, limitMs: 60000, now: () => t});
  assert.equal(run.status, 'in_progress');
});
