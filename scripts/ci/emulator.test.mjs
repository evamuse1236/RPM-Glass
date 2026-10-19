import test from 'node:test';
import assert from 'node:assert/strict';
import {scenarioArgs, scenarioOutcome} from './scenarios.mjs';
import {selectRun} from './emulator.mjs';

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
});

test('helper follows only its own dispatch at the current pushed branch and commit', () => {
  const expected = {branch: 'ci/emulator', sha: 'abc', request: 'unique'};
  const run = {headBranch: 'ci/emulator', headSha: 'abc', displayTitle: 'RPM emulator unique', event: 'workflow_dispatch'};
  const others = [{...run, headSha: 'old'}, {...run, headBranch: 'main'}, {...run, displayTitle: 'RPM emulator somebody-else'}, {...run, event: 'push'}];
  assert.equal(selectRun(others, expected), undefined);
  assert.equal(selectRun([...others, run], expected), run);
});
