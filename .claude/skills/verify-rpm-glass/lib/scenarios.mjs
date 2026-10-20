import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {UserError, shell, dismissAnr} from './device.mjs';
import {inPage} from './page.mjs';
import crypto from 'node:crypto';
import {SKILL, ROOT, APK, parseArgs, journal, target, errorLines} from './runtime.mjs';
import {newestFile, staleApp, NATIVE_SOURCES, WEB_SOURCES} from './freshness.mjs';
import {headCommit, uncommittedAppFiles} from '../../../../scripts/agent/require-evidence.mjs';

function appOnEmulator(state) {
  const apk = fs.existsSync(APK) ? {mtime: fs.statSync(APK).mtimeMs, sha: crypto.createHash('sha256').update(fs.readFileSync(APK)).digest('hex')} : null;
  return staleApp({apk, installedSha: state.installedSha256, syncedAt: state.syncedAt, native: newestFile(ROOT, NATIVE_SOURCES), web: newestFile(ROOT, WEB_SOURCES)});
}

export async function storeJson(read, {tries = 3, wait = ms => new Promise(r => setTimeout(r, ms))} = {}) {
  let out;
  for (let i = 0; i < tries; i++) {
    out = await read();
    if (out.json) return out.json;
    if (i < tries - 1) await wait(300);
  }
  throw new ScenarioFailure(`files/companion.json did not read as JSON after ${tries} tries`, {text: String(out.text ?? '').slice(0, 300)});
}

export const scenarioCommands = {
  async scenario(args, commands) {
    const dir = path.join(SKILL, 'scenarios');
    const mods = [];
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".mjs")).sort()) { const m = await import(pathToFileURL(path.join(dir, f)).href); if (m.id && m.run) mods.push(m); }
    if (args.list) return {ok: true, scenarios: mods.map(m => ({id: m.id, rule: m.rule, enforces: m.enforces, knownBug: m.knownBug ?? null}))};
    const wanted = args.all ? mods : mods.filter(m => args._.includes(m.id));
    if (!wanted.length) throw new UserError('No scenario selected.', `Pass --all or ids from \`rpmctl scenario --list\`: ${mods.map(m => m.id).join(', ')}`);
    const {serial, state} = target(args, {mutates: true});
    const stale = appOnEmulator(state);
    if (stale && !args.allowStale) throw new UserError(`Refusing to run scenarios on a stale app: ${stale.error}`, `${stale.fix} Then rerun the scenarios.`);
    const results = [];
    for (const m of wanted) {
      dismissAnr(serial);
      const t0 = Date.now(), since = shell(serial, "date '+%m-%d %H:%M:%S.000'").trim(), facts = {}, shots = [];
      const ctx = {
        facts,
        do: async (cmd, ...argv) => {
          const out = await commands[cmd]({...parseArgs(argv.map(String)), owner: args.owner ?? process.env.RPMCTL_OWNER});
          if (out.ok === false) throw new ScenarioFailure(`${cmd} ${argv.join(' ')} failed`, out);
          if (cmd === 'shot') shots.push(out.png);
          return out;
        },
        read: async (fn, arg) => { const page = await inPage(serial, Number(state.cdpPort)); try { return await page.evaluate(String(fn), arg ?? null); } finally { page.close(); } },
        store: () => storeJson(() => commands.state(parseArgs(['files/companion.json']))),
        keyboardShown: () => /mInputShown=true|isInputViewShown=true/.test(shell(serial, 'dumpsys input_method', {allowFail: true})),
        expect: (condition, message, detail) => { if (!condition) throw new ScenarioFailure(message, detail); },
        shot: label => ctx.do('shot', `${m.id}-${label}`),
      };
      let status = 'pass', failure = null;
      try {
        await m.run(ctx);
        const shown = await ctx.read(() => [...document.querySelectorAll('#snackbar, .sheet-error, .snackbar-text, [role=alert], .error, #status')].filter(n => !n.closest('[hidden]')).map(n => n.textContent).join(' | '));
        ctx.expect(!/Cannot read|TypeError|ReferenceError|is not a function|is not defined|\bundefined\b|\bnull\b/.test(shown), 'A raw script error is on screen', shown);
        const errors = errorLines(serial, since).filter(l => /Uncaught|FATAL EXCEPTION/.test(l));
        ctx.expect(!errors.length, 'The page logged an uncaught error or the app crashed', errors.slice(0, 5));
      } catch (e) {
        status = 'fail';
        failure = {message: e.message, detail: e.detail ?? e.fix ?? e.stack?.split('\n').slice(0, 3)};
        try { await ctx.shot('failure'); } catch {}
      }
      // A known bug only excuses the failure it describes; any other failure still fails the run.
      if (m.knownBug && status !== 'pass' && new Date(m.knownBug.expires) < new Date()) { status = 'fail'; failure = {message: `Known-bug exception expired on ${m.knownBug.expires}: fix the bug or get the exception renewed`, detail: failure}; }
      else if (m.knownBug) status = status === 'pass' ? 'known-bug-fixed' : m.knownBug.failsWith.test(failure.message) ? 'known-bug' : 'fail';
      results.push({id: m.id, status, ms: Date.now() - t0, facts, ...(failure ? {failure} : {}), ...(m.knownBug ? {knownBug: m.knownBug} : {}), shots});
    }
    const out = {ok: results.every(r => r.status === 'pass' || r.status === 'known-bug'), all: !!args.all, head: headCommit(ROOT),
      uncommittedApp: uncommittedAppFiles(ROOT), apkSha256: state.installedSha256, webSha256: state.webSha256, ...(stale ? {staleAllowed: stale.error} : {}), results};
    journal(state, {command: 'scenario', result: out});
    return out;
  },

};

class ScenarioFailure extends Error {
  constructor(message, detail) { super(message); this.detail = detail; }
}
