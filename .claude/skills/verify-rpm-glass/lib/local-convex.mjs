import {execFileSync, spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const NODE_24 = ['mise', 'exec', 'node@24.22.0', '--', 'node'];
const PRODUCTION = 'neat-emu-821';

export function refuseDeployment(envText) {
  if (envText == null) return null;
  if (envText.includes(PRODUCTION)) throw new Error(`.env.local names ${PRODUCTION}; this scenario only runs against local Convex`);
  const name = envText.match(/^CONVEX_DEPLOYMENT=(.*)$/m)?.[1]?.trim() ?? '';
  if (name && !/^(anonymous|local):/.test(name)) throw new Error(`.env.local names deployment ${name}; this scenario only runs against local Convex`);
  return name || null;
}

export function localSiteUrl(envText) {
  const raw = envText?.match(/^CONVEX_SITE_URL=(.*)$/m)?.[1]?.trim();
  if (!raw) throw new Error('Convex wrote no CONVEX_SITE_URL to .env.local');
  const url = new URL(raw);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port) throw new Error(`Convex site ${raw} is not a local port`);
  return {siteUrl: raw.replace(/\/+$/, ''), port: Number(url.port)};
}

const childEnv = () => {
  const {CONVEX_DEPLOY_KEY: _key, CONVEX_DEPLOYMENT: _name, ...env} = process.env;
  return {...env, CONVEX_AGENT_MODE: 'anonymous'};
};

export async function startLocalConvex(root, {logDir = path.join(root, '.verify', 'web-sync'), timeout = 240000} = {}) {
  const envFile = path.join(root, '.env.local');
  const readEnv = () => fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : null;
  refuseDeployment(readEnv());
  const data = path.join(root, '.convex', 'local', 'default');
  if (fs.existsSync(data)) for (const name of fs.readdirSync(data)) if (/^convex_local_(backend\.sqlite3|storage)/.test(name)) fs.rmSync(path.join(data, name), {recursive: true, force: true});

  fs.mkdirSync(logDir, {recursive: true});
  const logFile = path.join(logDir, 'convex-scenario.log');
  const log = fs.createWriteStream(logFile);
  const [cmd, ...pre] = NODE_24;
  const child = spawn(cmd, [...pre, '--require', path.join(root, 'scripts/web-sync/convex-json-imports.cjs'), 'node_modules/convex/bin/main.js', 'dev', '--typecheck', 'disable', '--codegen', 'disable'], {cwd: root, env: childEnv(), detached: true, stdio: ['ignore', 'pipe', 'pipe']});
  let text = '', exited = null;
  const exit = new Promise(done => child.on('exit', code => { exited = code; done(); }));
  const read = chunk => { log.write(chunk); text += chunk; };
  child.stdout.on('data', read);
  child.stderr.on('data', read);

  const stop = async () => {
    if (exited === null) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
      await Promise.race([exit, new Promise(done => setTimeout(done, 10000))]);
      if (exited === null) try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }
    log.end();
  };

  try {
    const deadline = Date.now() + timeout;
    while (!/Convex functions ready/.test(text)) {
      if (exited !== null) throw new Error(`Local Convex stopped (exit ${exited}); see ${logFile}`);
      if (Date.now() > deadline) throw new Error(`Local Convex was not ready in ${timeout / 1000}s; see ${logFile}`);
      await new Promise(done => setTimeout(done, 250));
    }
    const env = readEnv();
    if (!/^(anonymous|local):/.test(refuseDeployment(env) ?? '')) throw new Error('npx convex dev did not choose a local deployment');
    const {siteUrl, port} = localSiteUrl(env);
    const run = (fn, args = {}) => {
      const out = execFileSync(NODE_24[0], [...NODE_24.slice(1), 'node_modules/convex/bin/main.js', 'run', fn, JSON.stringify(args)], {cwd: root, env: childEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
      return JSON.parse(out.slice(out.indexOf('{')));
    };
    return {siteUrl, port, logFile, pid: child.pid, run, stop};
  } catch (error) {
    await stop();
    throw error;
  }
}
