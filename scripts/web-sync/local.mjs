#!/usr/bin/env node
import {execFileSync, spawn} from 'node:child_process';
import {createWriteStream, existsSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname);
const logs = resolve(root, '.verify/web-sync');
const phoneState = resolve(logs, 'phone.json');
let syncUrl;
const PORT = +(process.env.PORT ?? 5179);
const children = [];

const deployment = () => {
  const file = resolve(root, '.env.local');
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').match(/^CONVEX_DEPLOYMENT=(.*)$/m)?.[1]?.trim() ?? '';
};
const refuseRemote = () => {
  const name = deployment();
  if (name !== null && !/^(anonymous|local):/.test(name)) throw new Error(`.env.local names deployment ${name}; this run only uses local Convex`);
};

function start(name, command, args, env = {}) {
  mkdirSync(logs, {recursive: true});
  const log = createWriteStream(resolve(logs, `${name}.log`));
  const child = spawn(command, args, {cwd: root, env: {...process.env, ...env}, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
  const lines = [];
  const waiters = new Set();
  const read = chunk => {
    log.write(chunk);
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

const stopAll = () => { for (const child of children) try { process.kill(-child.pid, 'SIGTERM'); } catch {} };
process.on('SIGINT', () => { stopAll(); process.exit(0); });
process.on('SIGTERM', () => { stopAll(); process.exit(0); });

try {
  refuseRemote();
  execFileSync('npm', ['run', 'typecheck:cloud'], {cwd: root, stdio: 'inherit'});
  const convex = start('convex', process.execPath, ['--require', resolve(root, 'scripts/web-sync/convex-json-imports.cjs'), 'node_modules/convex/bin/main.js', 'dev', '--typecheck', 'disable', '--codegen', 'disable'], {CONVEX_AGENT_MODE: 'anonymous'});
  await convex.waitFor(/Convex functions ready/, 240000);
  refuseRemote();
  if (!/^(anonymous|local):/.test(deployment() ?? '')) throw new Error('npx convex dev did not choose a local deployment');
  syncUrl = readFileSync(resolve(root, '.env.local'), 'utf8').match(/^CONVEX_SITE_URL=(.*)$/m)?.[1]?.trim();
  if (!syncUrl || !['127.0.0.1', 'localhost'].includes(new URL(syncUrl).hostname)) throw new Error('Convex did not provide a local HTTP URL');

  rmSync(phoneState, {force: true});
  const phone = start('phone', 'node', ['scripts/web-sync/phone-standin.mjs', '--watch', '--site', syncUrl, '--state', phoneState]);
  await phone.waitFor(/Paired with/, 60000);
  await phone.waitFor(/Synced/, 30000);

  const out = execFileSync('npx', ['convex', 'run', 'admin:createWebSession', JSON.stringify({label: 'ChatGPT Site'})], {cwd: root, encoding: 'utf8'});
  const {token} = JSON.parse(out.slice(out.indexOf('{')));

  const {RPM_SYNC_SERVER: _, ...buildEnv} = process.env;
  execFileSync('npm', ['run', 'web:build'], {cwd: root, stdio: 'inherit', env: buildEnv});
  const site = start('site', 'node', ['scripts/web-sync/site-local.mjs'], {RPM_SYNC_SERVER: syncUrl, RPM_WEB_TOKEN: token, PORT: String(PORT)});
  await site.waitFor(/Site Worker on/, 15000);
  console.log(`Ready: http://127.0.0.1:${PORT}/ reads the stand-in phone. Logs in .verify/web-sync/. Ctrl+C stops everything.`);
} catch (error) {
  console.error(error.message);
  stopAll();
  process.exit(1);
}
