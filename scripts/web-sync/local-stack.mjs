import {execFileSync, spawn} from 'node:child_process';
import {createWriteStream, existsSync, mkdirSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {repoRoot, localPaths, localEnv} from './worktree.mjs';

export const root = repoRoot();
export const logs = resolve(root, '.verify/web-sync');
const children = [];

const deployment = () => {
  const {envFile: file} = localPaths(root);
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').match(/^CONVEX_DEPLOYMENT=(.*)$/m)?.[1]?.trim() ?? '';
};
export const refuseRemote = () => {
  const name = deployment();
  if (name !== null && !/^(anonymous|local):/.test(name)) throw new Error('.env.local names a remote deployment; this run only uses local Convex');
};

export function start(name, command, args, env = {}) {
  mkdirSync(logs, {recursive: true});
  const log = createWriteStream(resolve(logs, `${name}.log`));
  const child = spawn(command, args, {cwd: root, env: {...localEnv(root), ...env}, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
  const lines = [];
  const waiters = new Set();
  const read = chunk => {
    if (name !== 'convex') log.write(chunk);
    else if (/Convex functions ready/.test(String(chunk))) log.write('Convex functions ready\n');
    lines.push(String(chunk));
    for (const waiter of waiters) waiter();
  };
  child.stdout.on('data', read);
  child.stderr.on('data', read);
  child.on('exit', code => { lines.push(`\n[exited ${code}]`); for (const waiter of waiters) waiter(); });
  children.push(child);
  const waitFor = (pattern, timeout) => new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`${name} did not say ${pattern} in ${timeout / 1000}s; see .verify/web-sync/${name}.log`)), timeout);
    const check = () => {
      const text = lines.join('');
      if (pattern.test(text)) { clearTimeout(timer); waiters.delete(check); done(); }
      else if (/\[exited /.test(text)) { clearTimeout(timer); fail(new Error(`${name} stopped; see .verify/web-sync/${name}.log`)); }
    };
    waiters.add(check);
    check();
  });
  return {waitFor};
}

export const stopAll = () => { for (const child of children.splice(0)) try { process.kill(-child.pid, 'SIGTERM'); } catch {} };

export const convex = (...args) => execFileSync(process.execPath, ['node_modules/convex/bin/main.js', ...args], {cwd: root, env: localEnv(root), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});

export async function startConvex() {
  refuseRemote();
  execFileSync('npm', ['run', 'typecheck:cloud'], {cwd: root, stdio: 'inherit'});
  const server = start('convex', process.execPath, ['node_modules/convex/bin/main.js', 'dev', '--typecheck', 'disable', '--codegen', 'disable'], {CONVEX_AGENT_MODE: 'anonymous'});
  await server.waitFor(/Convex functions ready/, 240000);
  refuseRemote();
  if (!/^(anonymous|local):/.test(deployment() ?? '')) throw new Error('npx convex dev did not choose a local deployment');
  const syncUrl = readFileSync(localPaths(root).envFile, 'utf8').match(/^CONVEX_SITE_URL=(.*)$/m)?.[1]?.trim();
  if (!syncUrl || !['127.0.0.1', 'localhost'].includes(new URL(syncUrl).hostname)) throw new Error('Convex did not provide a local HTTP URL');
  return syncUrl;
}

export async function serveSite({syncUrl, port}) {
  refuseRemote();
  const out = convex('run', 'admin:createWebSession', JSON.stringify({label: 'ChatGPT Site'}));
  const {token} = JSON.parse(out.slice(out.indexOf('{')));
  const {RPM_SYNC_SERVER: _, ...buildEnv} = process.env;
  execFileSync('npm', ['run', 'web:build'], {cwd: root, stdio: 'inherit', env: buildEnv});
  const site = start('site', process.execPath, ['scripts/web-sync/site-local.mjs'], {RPM_SYNC_SERVER: syncUrl, RPM_WEB_TOKEN: token, PORT: String(port)});
  await site.waitFor(/Site Worker on/, 15000);
  return `http://127.0.0.1:${port}/`;
}
