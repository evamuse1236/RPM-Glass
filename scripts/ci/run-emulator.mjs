import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {scenarioArgs, scenarioOutcome, expectedScenarios} from './scenarios.mjs';
import {adbPath} from '../../.claude/skills/verify-rpm-glass/lib/device.mjs';

const evidence = '.verify/evidence';
fs.mkdirSync(evidence, {recursive: true});
const ctl = '.claude/skills/verify-rpm-glass/rpmctl.mjs';
const serial = `emulator-${process.env.EMULATOR_PORT ?? '5554'}`;
const args = scenarioArgs(process.env.SCENARIOS || '--all');
const run = (name, argv) => {
  const result = spawnSync(process.execPath, [ctl, ...argv], {encoding: 'utf8', env: process.env, maxBuffer: 32 * 1024 * 1024});
  fs.writeFileSync(path.join(evidence, `${name}.json`), result.stdout ?? '');
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  const report = JSON.parse(result.stdout);
  console.log(JSON.stringify(report, null, 2));
  return {report, status: result.status};
};
const log = fs.openSync(path.join(evidence, 'logcat.txt'), 'a');
const logcat = spawn(adbPath(), ['-s', serial, 'logcat', '-v', 'threadtime'], {stdio: ['ignore', log, log]});
logcat.on('error', error => { console.error(error); process.exitCode = 1; });
let passed = false;
try {
  const launched = run('launch', ['launch', '--attach', serial, '--no-build']);
  if (launched.status !== 0 || !launched.report.ok) throw new Error('rpmctl launch failed.');
  process.env.RPMCTL_OWNER = launched.report.owner;
  const display = run('display-phone', ['display', 'phone']);
  if (display.status !== 0 || display.report.after?.size !== '1080x2340' || display.report.after?.density !== 450)
    throw new Error('CI display must be 1080x2340 at 450 dpi after resetting overrides. Check prepare-avd.mjs.');
  const available = run('scenario-list', ['scenario', '--list']);
  if (available.status !== 0 || !available.report.ok) throw new Error('Could not list scenarios.');
  const ids = available.report.scenarios.map(s => s.id);
  const expected = expectedScenarios(available.report.scenarios, args);
  const unknown = expected.filter(id => !ids.includes(id));
  if (unknown.length) throw new Error(`Unknown scenarios: ${unknown.join(', ')}. See rpmctl scenario --list.`);
  const scenarios = run('scenarios', ['scenario', ...args]);
  const outcome = scenarioOutcome(scenarios.report, scenarios.status, expected);
  for (const warning of outcome.warnings) console.log(`::warning::${warning}`);
  passed = outcome.ok;
} catch (error) {
  console.error(error);
} finally {
  try {
    if (fs.existsSync('.verify/state.json')) {
      process.env.RPMCTL_OWNER = JSON.parse(fs.readFileSync('.verify/state.json', 'utf8')).owner;
      const cleanup = run('cleanup', ['cleanup']);
      if (cleanup.status !== 0 || !cleanup.report.ok) passed = false;
    }
  } catch (error) { console.error(error); passed = false; }
  logcat.kill();
  fs.closeSync(log);
}
process.exitCode = passed && !process.exitCode ? 0 : 1;
