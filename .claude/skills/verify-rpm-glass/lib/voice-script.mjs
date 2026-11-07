import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {UserError} from './device.mjs';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
export const HEARD = {
  add: 'Pay rent tomorrow at 10, buy milk, and call the bank at 6:30 tonight.',
  retime: 'Move the rent to 11:30.',
  remove: 'Take buy milk off the list.',
};

export function parseVoiceScriptArgs(argv) {
  const name = String(argv._?.[0] ?? 'voice-script').replace(/\.js$/, '');
  const file = path.join(FIXTURES, `${name}.js`);
  if (!/^[\w-]+$/.test(name) || !fs.existsSync(file)) {
    const known = fs.readdirSync(FIXTURES).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
    throw new UserError(`No voice script fixture "${name}".`, `Pass one of: ${known.join(', ')} (files in .claude/skills/verify-rpm-glass/fixtures/).`);
  }
  const kinds = String(argv.plan ?? 'add').split(',').map(k => k.trim()).filter(Boolean);
  const bad = kinds.filter(k => !(k in HEARD));
  if (bad.length || !kinds.length) throw new UserError(`Unknown --plan step: ${bad.join(', ') || '(empty)'}.`, `Use a comma list of ${Object.keys(HEARD).join(', ')}.`);
  if (kinds.some(k => k !== 'add') && kinds[0] !== 'add') throw new UserError('retime and remove change the tasks that add makes.', 'Start --plan with add, for example `--plan add,retime,remove`.');
  return {fixture: name, source: fs.readFileSync(file, 'utf8'), kinds};
}

export async function runVoiceScript(plan, io) {
  if (!(await io.isEmulator()))
    throw new UserError('voice-script runs on an emulator only; this device is a phone.', 'A scripted call saves made-up tasks to the plan on the device. Run `rpmctl launch` and drive the emulator.');
  const shots = [];
  let failure = null;
  try {
    await io.openCapture();
    await io.evaluate(plan.source);
    await io.evaluate('window.RPM_PLATFORM.hasGeminiKey=()=>true');
    await io.startCall();
    for (const kind of plan.kinds) {
      await io.evaluate('window.__v.ready()');
      await io.evaluate(`window.__v.hear(${JSON.stringify(HEARD[kind])})`);
      await io.evaluate(`window.__v.plan(${JSON.stringify(kind)})`);
      await io.evaluate('window.__v.talk()');
      shots.push(await io.shot(`scripted-voice-${kind}-proposed`));
      await io.evaluate('window.__v.save()');
      shots.push(await io.shot(`scripted-voice-${kind}-saved`));
    }
  } catch (e) { failure = e; }
  try { await io.reload(); } catch (e) { if (!failure) throw e; }
  if (failure) throw failure;
  return {ok: true, label: 'scripted voice', fixture: plan.fixture, steps: plan.kinds, shots, reloaded: true};
}
