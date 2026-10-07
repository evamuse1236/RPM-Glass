// "Done" needs proof from the real app: when app code changed, there must be a debug APK built after the change and
// an rpmctl screenshot taken while exactly that APK was installed. As a Claude Code Stop hook (.claude/settings.json)
// it blocks once per stop with the reason; run by hand (npm run check:evidence) it exits 1 with the same reason.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const APP_SOURCES = /^(app\/src\/main\/|android-companion\/|chat-prototype\/|intent-v2\/(src|adapters|prompts)\/|cli\/)/;
const isAppFile = f => APP_SOURCES.test(f) && !/\.test\.(mjs|ts)$/.test(f) && !f.includes('/experiments/');
const APK = 'app/build/outputs/apk/debug/app-debug.apk';

const git = (root, args) => { try { return execFileSync('git', ['-c', 'core.quotepath=off', ...args], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); } catch { return null; } };

// App files this branch or working tree changes (deletions included): uncommitted edits plus commits not yet on main.
export function changedAppFiles(root) {
  const base = ['origin/main', 'main'].map(ref => git(root, ['merge-base', 'HEAD', ref])?.trim()).find(Boolean);
  if (!base) return {base: null, files: []};
  const committed = (git(root, ['diff', '--name-only', '-z', `${base}..HEAD`]) ?? '').split('\0');
  const status = (git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']) ?? '').split('\0');
  const working = [];
  for (let i = 0; i < status.length; i++) {
    const entry = status[i];
    if (!entry) continue;
    working.push(entry.slice(3));
    if (/^R|^C/.test(entry)) i++;
  }
  return {base, files: [...new Set([...committed, ...working].filter(Boolean))].filter(isAppFile)};
}

// When a file was last changed; a deleted file counts from when its folder last changed.
function changedAt(root, file) {
  for (let p = path.join(root, file); p.startsWith(root); p = path.dirname(p)) if (fs.existsSync(p)) return fs.statSync(p).mtimeMs;
  return Date.now();
}

// The newest rpmctl screenshot taken while this exact APK was installed on the emulator rpmctl launched.
export function matchingEvidence(root, apkSha) {
  let newest = null;
  const walk = d => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, {withFileTypes: true}) : []) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith('.png')) continue;
    let meta = null;
    try { meta = JSON.parse(fs.readFileSync(p.replace(/\.png$/, '.json'), 'utf8')); } catch {}
    if (!meta?.launchedByRpmctl || meta.apkSha256 !== apkSha) continue;
    const m = fs.statSync(p).mtimeMs;
    if (!newest || m > newest.mtime) newest = {file: p, mtime: m};
  } };
  walk(path.join(root, '.verify', 'evidence'));
  return newest;
}

export function evidenceGap(root) {
  const {base, files: changed} = changedAppFiles(root);
  const how = 'Before saying done, drive the changed screen with the verify-rpm-glass skill (node .claude/skills/verify-rpm-glass/rpmctl.mjs launch, then open/tap/shot at phone and large-text), run `rpmctl check`, and put the evidence paths in the reply. '
    + 'If you could not drive it, mark the claim UNVERIFIED in the reply. If this turn changed no app behavior, say so and stop again.';
  if (!base) return `Cannot tell what this branch changed: no main or origin/main to compare with. ${how}`;
  if (!changed.length) return null;
  const list = files => files.slice(0, 5).join(', ') + (files.length > 5 ? ` and ${files.length - 5} more` : '');
  const apk = path.join(root, APK);
  const built = fs.existsSync(apk) ? fs.statSync(apk).mtimeMs : 0;
  const unbuilt = changed.filter(f => changedAt(root, f) > built);
  if (unbuilt.length) return `The debug APK is older than changed app code (${list(unbuilt)}), so no screenshot can show it yet. ${how}`;
  const evidence = matchingEvidence(root, crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex'));
  if (!evidence) return `No rpmctl screenshot was taken with the current debug APK installed (app code changed: ${list(changed)}). ${how}`;
  return null;
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
  console.log(gap ? `✖ ${gap}` : '✔ The current debug build includes every app change and has an rpmctl screenshot (or no app code changed).');
  process.exit(gap ? 1 : 0);
}
