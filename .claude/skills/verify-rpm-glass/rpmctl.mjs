#!/usr/bin/env node
// rpmctl: launch, health-check, drive and screenshot the RPM Android app on an emulator it owns. Run `rpmctl --help`.
import {parseArgs} from './lib/runtime.mjs';
import {HELP} from './lib/help.mjs';
import {lifecycleCommands} from './lib/lifecycle.mjs';
import {driveCommands} from './lib/drive.mjs';
import {evidenceCommands} from './lib/evidence.mjs';
import {scenarioCommands} from './lib/scenarios.mjs';

const commands = {
  launch: lifecycleCommands.launch,
  doctor: lifecycleCommands.doctor,
  ...driveCommands,
  shot: evidenceCommands.shot,
  eval: evidenceCommands.eval,
  state: evidenceCommands.state,
  logs: evidenceCommands.logs,
  scenario: args => scenarioCommands.scenario(args, commands),
  check: evidenceCommands.check,
  cleanup: lifecycleCommands.cleanup,
};

const argv = parseArgs(process.argv.slice(2));
const cmd = argv._.shift();
if (cmd === 'help') { console.log(HELP[argv._[0]] ?? HELP._); process.exit(0); }
if (!cmd || (argv.help && !commands[cmd])) { console.log(HELP._); process.exit(0); }
if (argv.help) { console.log(HELP[cmd]); process.exit(0); }
if (!commands[cmd]) { console.log(JSON.stringify({ok: false, error: `Unknown command "${cmd}".`, fix: 'Run `rpmctl --help` for the command list.'})); process.exit(1); }
try {
  const out = await commands[cmd](argv);
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok === false ? 1 : 0);
} catch (e) {
  console.log(JSON.stringify({ok: false, command: cmd, error: e.message, fix: e.fix ?? `Unexpected failure; rerun with the same arguments, then \`rpmctl doctor\`.`, ...(e.fix ? {} : {stack: e.stack?.split('\n').slice(0, 4)})}, null, 2));
  process.exit(1);
}
