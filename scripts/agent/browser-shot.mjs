// Browser proof for a web-only change where no emulator runs (a cloud session): bundles the assets, serves them with
// the gauntlet stand-in for the Android bridge and screenshots one page at S24 FE size (384 x 832 dp, 1080 px wide).
// Usage: node scripts/agent/browser-shot.mjs <label> [planner.html|index.html] [--width 384] [--eval '<js run on the page before the shot>']
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {builtWeb} from './web-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const width = Number(flag('--width') ?? 384);
const setup = flag('--eval');
const [label = 'browser', page = 'planner.html'] = args;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = (error, fix) => { console.log(JSON.stringify({ok: false, error, fix}, null, 2)); process.exit(1); };

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const pw = '/opt/pw-browsers';
  for (const dir of fs.existsSync(pw) ? fs.readdirSync(pw).filter(d => d.startsWith('chromium')).sort().reverse() : []) {
    for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) if (fs.existsSync(path.join(pw, dir, sub))) return path.join(pw, dir, sub);
  }
  return ['chromium', 'google-chrome-stable', 'google-chrome', 'chromium-browser'].find(name => spawnSync('which', [name]).status === 0) ?? null;
}

const chrome = chromePath();
if (!chrome) fail('No Chromium found.', 'Set CHROME to a Chromium binary, or install one (cloud sessions have it in /opt/pw-browsers).');
const build = spawnSync(process.execPath, [path.join(root, 'scripts/build-companion-assets.mjs')], {cwd: root, encoding: 'utf8'});
if (build.status !== 0) fail(`Bundling the web assets failed: ${(build.stderr || build.stdout).trim().slice(-600)}`, 'Fix the build error, then run this again.');

const port = 4400 + Math.floor(Math.random() * 500), cdp = port + 1000;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-browser-shot-'));
const server = spawn(process.execPath, [path.join(root, 'scripts/gauntlet/serve.mjs'), String(port)], {cwd: root, stdio: 'ignore'});
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--disable-gpu', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, 'about:blank'], {stdio: 'ignore'});
const stop = () => { for (const child of [browser, server]) try { child.kill('SIGKILL'); } catch {} try { fs.rmSync(profile, {recursive: true, force: true, maxRetries: 5}); } catch {} };
process.on('exit', stop);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1));
setTimeout(() => fail('Timed out after 90 s.', 'Check that the page loads with `node scripts/gauntlet/serve.mjs`.'), 90_000).unref();

let target = null;
for (let i = 0; i < 100 && !target; i++) {
  await sleep(200);
  try { await fetch(`http://127.0.0.1:${port}/${page}`); target = (await (await fetch(`http://127.0.0.1:${cdp}/json`)).json()).find(t => t.type === 'page'); } catch {}
}
if (!target) fail('The page server or Chromium did not start.', 'Run `node scripts/gauntlet/serve.mjs` by hand to see its error.');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let seq = 0;
const pending = new Map(), pageErrors = [];
ws.addEventListener('message', event => {
  const m = JSON.parse(event.data);
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') pageErrors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  pending.get(m.id)?.(m.result);
  pending.delete(m.id);
});
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({id, method, params})); });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {width, height: Math.round(width * 2340 / 1080), deviceScaleFactor: 1080 / width, mobile: true});
await send('Page.navigate', {url: `http://127.0.0.1:${port}/${page}`});
await sleep(2500);
if (setup) {
  const {exceptionDetails} = await send('Runtime.evaluate', {expression: setup, awaitPromise: true});
  if (exceptionDetails) pageErrors.push(`--eval: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
  await sleep(600);
}
const {data} = await send('Page.captureScreenshot', {format: 'png'});

const runDir = path.join(root, '.verify', 'evidence', `browser-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(runDir, {recursive: true});
const file = path.join(runDir, `01-${label.replace(/[^\w-]+/g, '-')}.png`);
fs.writeFileSync(file, Buffer.from(data, 'base64'));
fs.writeFileSync(file.replace(/\.png$/, '.json'), JSON.stringify({browser: true, page, widthDp: width, setup, webSha256: builtWeb(root).sha, pageErrors, at: new Date().toISOString()}, null, 2));
console.log(JSON.stringify({ok: !pageErrors.length, file: path.relative(root, file), pageErrors}, null, 2));
process.exit(pageErrors.length ? 1 : 0);
