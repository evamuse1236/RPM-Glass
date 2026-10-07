// "Done" needs proof from the real app: when app code changed after the newest rpmctl screenshot, stop and drive it.
// As a Claude Code Stop hook (.claude/settings.json) it blocks once per stop with the reason; run by hand
// (npm run check:evidence) it exits 1 with the same reason.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const APP_SOURCES = /^(app\/src\/main\/|android-companion\/|chat-prototype\/|intent-v2\/(src|adapters|prompts)\/|cli\/(?!.*\.test\.mjs$))/;
const isAppFile = f => APP_SOURCES.test(f) && !/\.test\.(mjs|ts)$/.test(f) && !f.includes('/experiments/');

const git = (root, args) => { try { return execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); } catch { return ''; } };

// App files this branch or working tree changes: uncommitted edits plus commits not yet on main.
export function changedAppFiles(root) {
  const base = ['origin/main', 'main'].map(ref => git(root, ['merge-base', 'HEAD', ref]).trim()).find(Boolean);
  const committed = base ? git(root, ['diff', '--name-only', `${base}..HEAD`]).split('\n') : [];
  const working = git(root, ['status', '--porcelain', '--untracked-files=all']).split('\n').map(l => l.slice(3).replace(/^.* -> /, ''));
  return [...new Set([...committed, ...working].map(f => f.trim().replace(/^"|"$/g, '')).filter(Boolean))]
    .filter(isAppFile).filter(f => fs.existsSync(path.join(root, f)));
}

export function newestEvidence(root) {
  const dir = path.join(root, '.verify', 'evidence');
  let newest = null;
  const walk = d => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, {withFileTypes: true}) : []) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.png')) { const m = fs.statSync(p).mtimeMs; if (!newest || m > newest.mtime) newest = {file: p, mtime: m}; }
  } };
  walk(dir);
  return newest;
}

export function evidenceGap(root) {
  const changed = changedAppFiles(root);
  if (!changed.length) return null;
  const evidence = newestEvidence(root);
  const apk = path.join(root, 'app/build/outputs/apk/debug/app-debug.apk');
  const built = fs.existsSync(apk) ? fs.statSync(apk).mtimeMs : 0;
  const changedAt = f => fs.statSync(path.join(root, f)).mtimeMs;
  const unbuilt = changed.filter(f => changedAt(f) > built);
  const unshown = changed.filter(f => !evidence || changedAt(f) > evidence.mtime);
  if (!unbuilt.length && !unshown.length) return null;
  const list = files => files.slice(0, 5).join(', ') + (files.length > 5 ? ` and ${files.length - 5} more` : '');
  return (unbuilt.length ? `The debug APK is older than changed app code (${list(unbuilt)}), so no screenshot can show it yet. ` : '')
    + (unshown.length ? `App code changed after the newest screenshot from the real app (${evidence ? path.relative(root, evidence.file) : 'none in .verify/evidence'}): ${list(unshown)}. ` : '')
    + 'Before saying done, drive the changed screen with the verify-rpm-glass skill (node .claude/skills/verify-rpm-glass/rpmctl.mjs launch, then open/tap/shot at phone and large-text), run `rpmctl check`, and put the evidence paths in the reply. '
    + 'If you could not drive it, mark the claim UNVERIFIED in the reply. If this turn changed no app behavior, say so and stop again.';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  if (process.argv.includes('--hook')) {
    let input = {};
    try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}
    const gap = input.stop_hook_active ? null : evidenceGap(root);
    if (gap) console.log(JSON.stringify({decision: 'block', reason: gap}));
    process.exit(0);
  }
  const gap = evidenceGap(root);
  console.log(gap ? `✖ ${gap}` : '✔ Every changed app file has newer evidence from the real app (or none changed).');
  process.exit(gap ? 1 : 0);
}
