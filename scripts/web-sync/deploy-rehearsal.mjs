// Import a backup on the deployed code, then push HEAD and read the actual Site snapshot.
// Runs only in the disposable repo inside the invoking worktree's .verify directory.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startLocalConvex} from '../../.claude/skills/verify-rpm-glass/lib/local-convex.mjs';
import {localEnv} from './worktree.mjs';
import {quietRun} from './deploy-prod-guards.mjs';

export function snapshotRecords(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.entries) || !snapshot.planner) throw new Error('Local website snapshot is invalid.');
  return snapshot.entries.length + ['areas', 'projects', 'blocks', 'goals', 'events', 'drafts'].reduce((n, key) => n + (snapshot.planner[key]?.length ?? 0), 0);
}

export async function rehearse(work, backup, oldRef, head) {
  const source = process.cwd(), root = path.join(work, 'local');
  fs.mkdirSync(root);
  const archive = revision => {
    const tar = path.join(work, 'source.tar');
    execFileSync('git', ['archive', '--format=tar', '--output', tar, revision], {cwd: source, stdio: ['ignore', 'pipe', 'pipe']});
    quietRun('tar', ['-xf', tar, '-C', root], {cwd: source});
    fs.rmSync(tar);
  };
  archive(oldRef);
  quietRun('git', ['init', '-q'], {cwd: root});
  fs.symlinkSync(path.join(source, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  process.chdir(root);
  let local;
  try {
    local = await startLocalConvex(root);
    quietRun(process.execPath, ['node_modules/convex/bin/main.js', 'import', backup, '--replace-all', '-y', '--env-file', path.join(root, '.env.local')], {cwd: root, env: localEnv(root)});
    await local.stop(); local = null;
    // Remove old tracked code, preserving only this rehearsal's backend and credentials.
    const files = quietRun('git', ['-C', source, 'ls-tree', '-r', '--name-only', oldRef], {cwd: root}).trim().split('\n');
    for (const file of files) if (file) fs.rmSync(path.join(root, file), {force: true});
    archive(head);
    local = await startLocalConvex(root, {reset: false});
    const accounts = quietRun(process.execPath, ['node_modules/convex/bin/main.js', 'run', '--inline-query', '(await ctx.db.query("accounts").collect()).length', '--env-file', path.join(root, '.env.local')], {cwd: root, env: localEnv(root)});
    if (JSON.parse(accounts) === 0) return 0;
    const {token} = local.run('admin:createWebSession', {label: 'Local release rehearsal'});
    const response = await fetch(`${local.siteUrl}/v1/web/snapshot`, {headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(15000)});
    if (response.status === 404) return 0;
    if (!response.ok) throw new Error('Local website snapshot request failed.');
    return snapshotRecords(await response.json());
  } finally { await local?.stop(); process.chdir(source); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await rehearse(...process.argv.slice(2)))); }
  catch { console.error('Local migration rehearsal failed; output withheld to protect credentials.'); process.exitCode = 1; }
}
