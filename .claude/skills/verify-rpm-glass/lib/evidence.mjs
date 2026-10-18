import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {PACKAGE, UserError, adb, appPid, foregroundActivity, displayInfo, nativeNodes} from './device.mjs';
import {inPage} from './page.mjs';
import {ROOT, readState, evidenceDir, journal, target, viaShell, errorLines} from './runtime.mjs';

export const evidenceCommands = {
  async shot(args) {
    const {serial, state, cdpPort} = target(args, {mutates: false});
    const label = (args._[0] ?? 'screen').replace(/[^\w.-]+/g, '-');
    const dir = evidenceDir(state);
    const n = String(fs.readdirSync(dir).filter(f => /^\d+-.*\.png$/.test(f)).length + 1).padStart(2, '0');
    const png = path.join(dir, `${n}-${label}.png`), json = path.join(dir, `${n}-${label}.json`);
    fs.writeFileSync(png, adb(serial, ['exec-out', 'screencap', '-p'], {binary: true}));
    let page = null;
    try { const p = await inPage(serial, cdpPort); try { page = await p.evaluate(`(all) => window.__rpmSnapshot(all)`, false); } finally { p.close(); } }
    catch (e) { page = {unavailable: e.message}; }
    const meta = {label, at: new Date().toISOString(), serial, launchedByRpmctl: !!state, apkSha256: state?.installedSha256 ?? null, webSha256: state?.webSha256 ?? null, activity: foregroundActivity(serial), display: displayInfo(serial), page,
      native: page?.unavailable ? nativeNodes(serial) : undefined};
    fs.writeFileSync(json, JSON.stringify(meta, null, 2));
    journal(state, {command: 'shot', png, json});
    return {ok: true, png, json, activity: meta.activity, url: page?.url, view: page?.view};
  },

  async eval(args) {
    const {serial, cdpPort} = target(args, {mutates: true});
    const page = await inPage(serial, cdpPort);
    try { return {ok: true, value: await page.evaluate(args._.join(' '))}; }
    finally { page.close(); }
  },

  async state(args) {
    const {serial} = target(args, {mutates: false});
    const rel = args._[0];
    if (rel && (!/^(files|shared_prefs|databases)\/[\w.-]+(\/[\w.-]+)*$/.test(rel) || rel.split('/').includes('..'))) throw new UserError('Path must be a file under files/, shared_prefs/ or databases/ (letters, digits, . _ - and / only).', 'e.g. rpmctl state files/companion.json');
    if (!rel) return {ok: true, files: adb(serial, ['exec-out', 'run-as', PACKAGE, 'ls', '-laR', 'files', 'shared_prefs', 'databases'], {allowFail: true}).trim().split('\n')};
    const text = adb(serial, ['exec-out', 'run-as', PACKAGE, 'cat', rel]);
    try { return {ok: true, path: rel, json: JSON.parse(text)}; } catch { return {ok: true, path: rel, text: text.slice(0, 200000)}; }
  },

  async logs(args) {
    const {serial, state} = target(args, {mutates: false});
    if (args.errors) return {ok: true, errors: errorLines(serial, state?.appLogSince)};
    const pid = appPid(serial);
    const lines = adb(serial, ['logcat', '-d', '-t', String(Number(args.lines ?? 200)), ...(pid ? ['--pid', pid] : [])], {allowFail: true}).trim().split('\n');
    return {ok: true, pid, lines};
  },

  async check(args) {
    const state = readState();
    const dir = evidenceDir(state);
    const steps = {js: 'test:js', cloud: 'test:cloud', typecheck: 'typecheck:cloud', java: 'test:java', rules: 'check:rules'};
    const wanted = args.only ? String(args.only).split(',') : Object.keys(steps);
    const results = [];
    for (const name of wanted) {
      if (!steps[name]) throw new UserError(`Unknown check "${name}".`, `One of ${Object.keys(steps).join(', ')}.`);
      const t0 = Date.now();
      const r = spawnSync(...viaShell('npm', ['run', '--silent', steps[name]]), {cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024});
      const log = path.join(dir, `check-${name}.log`);
      fs.writeFileSync(log, `$ npm run ${steps[name]}\nexit ${r.status}\n\n${r.stdout}\n${r.stderr}`);
      const summary = (r.stdout + r.stderr).split('\n').filter(l => /^ℹ (tests|pass|fail)|Tests? +\d|PASS:|FAIL|✖|error TS|rule /.test(l)).slice(0, 12);
      results.push({check: name, ok: r.status === 0, seconds: Math.round((Date.now() - t0) / 1000), log, summary});
    }
    const out = {ok: results.every(r => r.ok), results};
    journal(state, {command: 'check', result: out});
    return out;
  },

};
