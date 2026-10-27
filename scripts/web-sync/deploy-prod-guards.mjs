import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {repoRoot} from './worktree.mjs';

export function deployOptions(argv) {
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {
    'env-file': {type: 'string'}, 'old-ref': {type: 'string'},
    'dry-run': {type: 'boolean'}, 'allow-empty-site': {type: 'boolean'},
  }});
  if (positionals.length || !values['env-file'] || !values['old-ref'])
    throw new Error('Usage: npm run web:deploy-prod -- --env-file <file> --old-ref <deployed-git-ref> [--dry-run] [--allow-empty-site]. Requires <deployment>-*.zip in ~/.cache/rpm-backups/ less than one hour old; always rehearses locally before deploying.');
  return values;
}

export function prodDeployment(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  const names = lines.filter(line => /^CONVEX_DEPLOYMENT\s*=/.test(line));
  if (names.length !== 1 || !/^CONVEX_DEPLOYMENT=prod:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(names[0])
    || lines.some(line => /^(?:export\s+)?CONVEX_(?!DEPLOYMENT=)/.test(line)))
    throw new Error('Explicit env file must name exactly one prod: deployment and no other Convex target or key.');
  return names[0].split('prod:')[1];
}

export const deployEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('CONVEX_')));

export function recentBackup(dir, deployment, now = Date.now()) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const candidates = files.filter(name => name.startsWith(deployment + '-') && name.endsWith('.zip'))
    .map(name => ({file: path.join(dir, name), stat: fs.lstatSync(path.join(dir, name))}))
    .filter(({stat}) => stat.isFile() && stat.size > 0 && now - stat.mtimeMs >= 0 && now - stat.mtimeMs < 3600000)
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  if (!candidates.length) throw new Error(`A backup zip less than one hour old is required in ~/.cache/rpm-backups/ for ${deployment}. Export one first.`);
  return candidates[0].file;
}

export function assertPending(value) {
  if (value !== 0) throw new Error('Production webCommands must have exactly 0 pending commands.');
}

export function assertSiteRecords(count, allowEmpty) {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Local website snapshot record count is invalid.');
  if (count === 0 && !allowEmpty) throw new Error('Local website snapshot has zero planner records. Refusing; review the migration or explicitly pass --allow-empty-site.');
}

// Capture CLI output: even an error from Convex must never echo a key.
export function quietRun(command, args, options) {
  try { return execFileSync(command, args, {...options, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024}); }
  catch { throw new Error(`${path.basename(command)} failed during the guarded deploy; output withheld to protect credentials.`); }
}

export function runDeploy(options, {root = repoRoot(), backupDir = path.join(os.homedir(), '.cache/rpm-backups'), run = quietRun, now = Date.now()} = {}) {
  const deployment = prodDeployment(fs.readFileSync(path.resolve(options['env-file']), 'utf8'));
  const backup = recentBackup(backupDir, deployment, now);
  const env = deployEnv();
  const git = (...args) => run('git', args, {cwd: root, env}).trim();
  if (git('status', '--porcelain', '--untracked-files=all')) throw new Error('Commit source changes before rehearsing and deploying.');
  const oldRef = git('rev-parse', '--verify', options['old-ref'] + '^{commit}');
  const head = git('rev-parse', 'HEAD');
  run('unzip', ['-tq', backup], {cwd: root, env});
  fs.mkdirSync(path.join(root, '.verify'), {recursive: true});
  const work = fs.mkdtempSync(path.join(root, '.verify', 'deploy-prod-'));
  try {
    // Only the validated selection reaches Convex; no implicit .env.local or deploy key.
    const envFile = path.join(work, 'prod.env');
    fs.writeFileSync(envFile, `CONVEX_DEPLOYMENT=prod:${deployment}\n`, {mode: 0o600});
    const cli = (...args) => run(process.execPath, ['node_modules/convex/bin/main.js', ...args, '--env-file', envFile], {cwd: root, env});
    const pending = () => assertPending(JSON.parse(cli('run', '--inline-query', '(await ctx.db.query("webCommands").filter(q => q.eq(q.field("status"), "pending")).collect()).length')));
    pending();
    const count = JSON.parse(run(process.execPath, [fileURLToPath(new URL('./deploy-rehearsal.mjs', import.meta.url)), work, backup, oldRef, head], {cwd: root, env}));
    assertSiteRecords(count, options['allow-empty-site']);
    if (options['dry-run']) return {deployment, backup, plannerRecords: count, dryRun: true};
    // Recheck after the rehearsal, just before deployment.
    recentBackup(backupDir, deployment);
    pending();
    if (git('rev-parse', 'HEAD') !== head || git('status', '--porcelain', '--untracked-files=all')) throw new Error('Checkout changed during rehearsal.');
    cli('deploy', '-y');
    return {deployment, backup, plannerRecords: count, deployed: true};
  } finally { fs.rmSync(work, {recursive: true, force: true}); }
}
