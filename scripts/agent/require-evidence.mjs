// "Done" needs proof from the real app, matched to the change (AGENTS.md "Before you say done"):
// - a web-only change needs an rpmctl screenshot taken after `rpmctl sync` loaded it; no APK build;
// - a native change (Java, notch, manifest, cli) needs a debug APK built after it and a screenshot with that APK installed;
// - merging app changes into main needs one passing `rpmctl scenario --all` on the merged commit (--merge).
// A passing GitHub emulator run (npm run ci:emulator) on a commit with the same app files as HEAD also counts.
// As a Claude Code Stop hook it blocks once per stop; by hand (npm run check:evidence, check:merge) it exits 1.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BUILT_WEB, builtWeb, isWebSource} from './web-assets.mjs';
import {isCloud} from './cloud.mjs';
import {sitePublicationGap} from '../web-site/publication.mjs';

const APP_SOURCES = /^(app\/src\/main\/|android-companion\/|chat-prototype\/|intent-v2\/(src|adapters|prompts)\/|cli\/)/;
export const isAppFile = f => APP_SOURCES.test(f) && !/\.test\.(mjs|ts)$/.test(f) && !f.includes('/experiments/') && !f.startsWith(BUILT_WEB);
const APK = 'app/build/outputs/apk/debug/app-debug.apk';

const git = (root, args) => { try { return execFileSync('git', ['-c', 'core.quotepath=off', ...args], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); } catch { return null; } };

// App files this branch or working tree changes (deletions included): uncommitted edits plus commits not yet on main.
export function changedAppFiles(root) {
  const base = ['origin/main', 'main'].map(ref => git(root, ['merge-base', 'HEAD', ref])?.trim()).find(Boolean);
  if (!base) return {base: null, files: []};
  const committed = (git(root, ['diff', '--name-only', '--no-renames', '-z', `${base}..HEAD`]) ?? '').split('\0');
  const status = (git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']) ?? '').split('\0');
  const working = [];
  for (let i = 0; i < status.length; i++) {
    const entry = status[i];
    if (!entry) continue;
    working.push(entry.slice(3));
    if (/^R|^C/.test(entry)) working.push(status[++i]);
  }
  return {base, files: [...new Set([...committed, ...working].filter(Boolean))].filter(isAppFile)};
}

// When a file was last changed; a deleted file counts from when its folder last changed.
function changedAt(root, file) {
  for (let p = path.join(root, file); p.startsWith(root); p = path.dirname(p)) if (fs.existsSync(p)) return fs.statSync(p).mtimeMs;
  return Date.now();
}

// The newest rpmctl screenshot taken while this exact APK, and these web assets when given, ran on the emulator rpmctl launched.
export function matchingEvidence(root, apkSha, {webSha = null, needWeb = false} = {}) {
  let newest = null;
  const walk = d => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, {withFileTypes: true}) : []) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith('.png')) continue;
    let meta = null;
    try { meta = JSON.parse(fs.readFileSync(p.replace(/\.png$/, '.json'), 'utf8')); } catch {}
    if (!(meta?.launchedByRpmctl || meta?.adoptedByRpmctl) || meta.apkSha256 !== apkSha || fs.statSync(p).size < 1000) continue;
    if (meta.webSha256 ? meta.webSha256 !== webSha : needWeb) continue;
    const m = fs.statSync(p).mtimeMs;
    if (!newest || m > newest.mtime) newest = {file: p, mtime: m};
  } };
  walk(path.join(root, '.verify', 'evidence'));
  return newest;
}

export function passingCiRun(root, changed) {
  if (git(root, ['status', '--porcelain', '--', ...changed])?.trim()) return null;
  const dir = path.join(root, '.verify', 'evidence');
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => /^ci-\d+$/.test(n)).sort().reverse() : []) {
    let run = null;
    try { run = JSON.parse(fs.readFileSync(path.join(dir, name, 'run.json'), 'utf8')); } catch {}
    if (run?.conclusion !== 'success' || !/^[0-9a-f]{40}$/.test(run.sha ?? '')) continue;
    const shots = fs.readdirSync(path.join(dir, name), {recursive: true}).filter(f => String(f).endsWith('.png') && fs.statSync(path.join(dir, name, String(f))).size >= 1000);
    if (shots.length && git(root, ['diff', '--quiet', run.sha, 'HEAD', '--', ...changed]) !== null) return {dir: path.join(dir, name), url: run.url};
  }
  return null;
}

export const tierOf = files => files.length && files.every(isWebSource) ? 'web' : 'native';
const HOW = {
  web: 'Web-only change: check it in a browser, then `rpmctl sync` on the running emulator (no APK build) and `rpmctl shot` the changed screen at phone size.',
  native: 'Native change (Java, notch, manifest or cli): `rpmctl launch --build`, then drive the changed feature and `rpmctl shot` it at phone size.',
};
const howFor = files => `${HOW[tierOf(files)]} Use the verify-rpm-glass skill (node .claude/skills/verify-rpm-glass/rpmctl.mjs) and put the evidence paths in the reply. `
  + 'Run the full `rpmctl scenario --all` once before merging to main, not after each change. '
  + 'If you could not drive it, mark the claim UNVERIFIED in the reply. If this turn changed no app behavior, say so and stop again.';

export function evidenceGap(root) {
  const {base, files: changed} = changedAppFiles(root);
  if (changed.length && passingCiRun(root, changed)) return null;
  const how = howFor(changed);
  if (!base) return `Cannot tell what this branch changed: no main or origin/main to compare with. ${how}`;
  if (!changed.length) return null;
  const list = files => files.slice(0, 5).join(', ') + (files.length > 5 ? ` and ${files.length - 5} more` : '');
  const apk = path.join(root, APK);
  const built = fs.existsSync(apk) ? fs.statSync(apk).mtimeMs : 0;
  const web = builtWeb(root);
  const unbuilt = changed.filter(f => changedAt(root, f) > (isWebSource(f) ? Math.max(built, web.at) : built));
  if (unbuilt.length) return `The debug APK is older than changed app code (${list(unbuilt)}), so no screenshot can show it yet. ${how}`;
  const needWeb = changed.some(f => isWebSource(f) && changedAt(root, f) > built);
  const evidence = matchingEvidence(root, crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex'), {webSha: web.sha, needWeb});
  if (!evidence) return `No rpmctl screenshot was taken with the current debug APK installed (app code changed: ${list(changed)}). ${how}`;
  const unshown = changed.filter(f => changedAt(root, f) > evidence.mtime);
  if (unshown.length) return `App code changed after the newest matching screenshot (${path.relative(root, evidence.file)}): ${list(unshown)}. ${how}`;
  return null;
}

export function browserEvidence(root) {
  const webSha = builtWeb(root).sha;
  let newest = null;
  const evidence = path.join(root, '.verify', 'evidence');
  for (const run of fs.existsSync(evidence) ? fs.readdirSync(evidence) : []) {
    const dir = path.join(evidence, run);
    for (const name of fs.statSync(dir).isDirectory() ? fs.readdirSync(dir).filter(n => n.endsWith('.png')) : []) {
      const file = path.join(dir, name);
      let meta = null;
      try { meta = JSON.parse(fs.readFileSync(file.replace(/\.png$/, '.json'), 'utf8')); } catch {}
      if (!meta?.browser || meta.pageErrors?.length || meta.webSha256 !== webSha || fs.statSync(file).size < 1000) continue;
      const mtime = fs.statSync(file).mtimeMs;
      if (!newest || mtime > newest.mtime) newest = {file, mtime};
    }
  }
  return newest;
}

export function cloudGap(root) {
  const {files} = changedAppFiles(root);
  const list = names => names.slice(0, 5).join(', ') + (names.length > 5 ? ` and ${names.length - 5} more` : '');
  const web = files.filter(isWebSource), native = files.filter(f => !isWebSource(f));
  const shot = web.length ? browserEvidence(root) : null;
  const unshown = web.filter(f => !shot || changedAt(root, f) > shot.mtime);
  return {
    block: unshown.length ? `Cloud session: no browser screenshot shows the web change (${list(unshown)}). Run \`node scripts/agent/browser-shot.mjs <label> [planner.html|index.html]\` on the changed screen and put the PNG path in the reply.` : null,
    unverified: native.length ? `UNVERIFIED: native change (${list(native)}) needs a PC emulator run; a cloud session has no emulator.` : null,
  };
}

export const headCommit = root => git(root, ['rev-parse', 'HEAD'])?.trim() ?? null;
export function uncommittedAppFiles(root) {
  const status = (git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']) ?? '').split('\0').filter(Boolean);
  return status.map(entry => entry.slice(3)).filter(isAppFile);
}

// Every passing `scenario --all` recorded in any worktree of this repo, with the commit it ran on.
export function scenarioRuns(root) {
  const trees = (git(root, ['worktree', 'list', '--porcelain']) ?? '').split('\n').filter(l => l.startsWith('worktree ')).map(l => l.slice(9));
  const runs = [];
  for (const tree of new Set([root, ...trees])) {
    const evidence = path.join(tree, '.verify', 'evidence');
    for (const run of fs.existsSync(evidence) ? fs.readdirSync(evidence) : []) {
      const file = path.join(evidence, run, 'journal.jsonl');
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        let entry = null;
        try { entry = JSON.parse(line); } catch {}
        const r = entry?.command === 'scenario' ? entry.result : null;
        if (r?.ok && r.all && r.head && !r.uncommittedApp?.length) runs.push({head: r.head, at: entry.at, file});
      }
    }
  }
  return runs;
}

// The commits a merge brings in. git writes MERGE_HEAD only after pre-merge-commit runs, so the hook reads the
// merged refs from GIT_REFLOG_ACTION ("merge feat/x", or "pull ..." for FETCH_HEAD).
export function mergeHeads(root, action = process.env.GIT_REFLOG_ACTION ?? '') {
  const commit = ref => git(root, ['rev-parse', '-q', '--verify', `${ref}^{commit}`])?.trim() || null;
  const head = commit('MERGE_HEAD');
  if (head) return [head];
  const [verb, ...refs] = action.trim().split(/\s+/);
  if (verb === 'pull') return [commit('FETCH_HEAD')].filter(Boolean);
  return verb === 'merge' ? refs.filter(ref => !ref.startsWith('-')).map(commit).filter(Boolean) : [];
}

// Before a merge commit on main: app changes coming in need a passing scenario --all on that commit,
// or on an earlier commit of the branch with no app change after it.
export function mergeGap(root, {heads = mergeHeads(root), branch = git(root, ['branch', '--show-current'])?.trim()} = {}) {
  if (branch !== 'main') return null;
  let runs = null;
  for (const mergeHead of heads) {
    const base = git(root, ['merge-base', 'HEAD', mergeHead])?.trim();
    const incoming = (git(root, ['diff', '--name-only', '--no-renames', '-z', `${base}..${mergeHead}`]) ?? '').split('\0').filter(isAppFile);
    if (!incoming.length) continue;
    const covers = run => run.head === mergeHead || git(root, ['merge-base', '--is-ancestor', run.head, mergeHead]) !== null
      && !(git(root, ['diff', '--name-only', '--no-renames', '-z', `${run.head}..${mergeHead}`]) ?? 'x').split('\0').some(isAppFile);
    if ((runs ??= scenarioRuns(root)).some(covers)) continue;
    return `Merging app changes into main (${incoming.slice(0, 5).join(', ')}${incoming.length > 5 ? ` and ${incoming.length - 5} more` : ''}) needs one passing \`rpmctl scenario --all\` on ${mergeHead.slice(0, 10)} with no uncommitted app edits. `
      + 'Run it in that branch\'s worktree, then merge again. Bypass only with the user\'s approval: git merge --no-verify.';
  }
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv.includes('--merge') ? process.cwd() : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  if (process.argv.includes('--merge')) {
    const gap = mergeGap(root);
    console.log(gap ? `✖ ${gap}` : '✔ No app change in this merge lacks a passing scenario --all.');
    process.exit(gap ? 1 : 0);
  }
  const hook = process.argv.includes('--hook');
  let input = {};
  if (hook) try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}
  const publicationGap = sitePublicationGap(root);
  if (publicationGap) {
    if (hook) {
      if (!input.stop_hook_active) console.log(JSON.stringify({decision: 'block', reason: publicationGap}));
      process.exit(0);
    }
    console.error(publicationGap);
    process.exit(1);
  }
  if (isCloud()) {
    const {block, unverified} = cloudGap(root);
    if (hook) {
      const out = {...block && !input.stop_hook_active ? {decision: 'block', reason: block} : {}, ...unverified ? {systemMessage: unverified} : {}};
      if (Object.keys(out).length) console.log(JSON.stringify(out));
      process.exit(0);
    }
    console.log([block ? `✖ ${block}` : '✔ Every web change has a browser screenshot (cloud session).', unverified].filter(Boolean).join('\n'));
    process.exit(block ? 1 : 0);
  }
  if (hook) {
    const gap = input.stop_hook_active ? null : evidenceGap(root);
    if (gap) console.log(JSON.stringify({decision: 'block', reason: gap}));
    process.exit(0);
  }
  const gap = evidenceGap(root);
  console.log(gap ? `✖ ${gap}` : '✔ Every app change is shown by an rpmctl screenshot of the current build or a passing GitHub emulator run (or no app code changed).');
  process.exit(gap ? 1 : 0);
}
