import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const repoRoot = (cwd = process.cwd()) => fs.realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim());

// Check each existing component before reading it, including dangling symlinks.
export function worktreePath(root, relative) {
  const file = path.resolve(root, relative);
  const inside = candidate => candidate === root || candidate.startsWith(root + path.sep);
  if (!inside(file)) throw new Error('Convex path must stay inside this worktree.');
  let current = root;
  for (const part of path.relative(root, file).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) { if (error.code === 'ENOENT') break; throw error; }
    if (stat.isSymbolicLink() && !inside(fs.realpathSync(current))) throw new Error('Convex path must stay inside this worktree.');
  }
  return file;
}

function checkTree(root, relative) {
  const file = worktreePath(root, relative);
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('Convex credential directories must not contain symlinks.');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory())
    for (const name of fs.readdirSync(file)) checkTree(root, path.join(relative, name));
  return file;
}

export function localPaths(root = repoRoot()) {
  if (fs.realpathSync(root) !== repoRoot()) throw new Error('Local Convex must use the current worktree root.');
  const envFile = worktreePath(root, '.env.local');
  // Convex also loads .env by default, so guard that path before starting its CLI.
  worktreePath(root, '.env');
  for (const file of [envFile, worktreePath(root, '.env')]) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/^\s*(?:export\s+)?CONVEX_(?:DEPLOY_KEY|DEPLOYMENT_TOKEN|SELF_HOSTED_|OVERRIDE_)/m.test(text))
      throw new Error('Local Convex env files must not contain deploy keys or remote credential overrides.');
    for (const match of text.matchAll(/^\s*(?:export\s+)?CONVEX_DEPLOYMENT\s*=\s*['\"]?([^'\"\s#]+)/gm))
      if (!/^(anonymous|local):/.test(match[1])) throw new Error('Local Convex env files must name local deployments; production is refused.');
  }
  checkTree(root, '.convex');
  const home = checkTree(root, '.verify/convex-home');
  return {root, envFile, home, data: worktreePath(root, '.convex/local/default')};
}

export function localEnv(root) {
  const {home} = localPaths(root);
  fs.mkdirSync(home, {recursive: true});
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('CONVEX_')));
  // Convex otherwise falls back to ~/.convex legacy deployment/admin credentials.
  return {...env, HOME: home, USERPROFILE: home, CONVEX_AGENT_MODE: 'anonymous'};
}
