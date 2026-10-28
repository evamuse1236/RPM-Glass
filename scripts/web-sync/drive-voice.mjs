#!/usr/bin/env node
import './node24.mjs';
import {execFileSync} from 'node:child_process';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {openBrowser, sleep} from './cdp.mjs';
import {q} from './drive-kit.mjs';
import {convex, logs, root, serveSite, startConvex, stopAll} from './local-stack.mjs';
import {seedStore} from '../gauntlet/seed.mjs';

const {values: opts} = parseArgs({options: {
  chrome: {type: 'string', default: '/usr/bin/chromium'},
  port: {type: 'string', default: '5191'},
  audio: {type: 'string', default: `${process.env.HOME}/.cache/rpm-voice/ramble-5-changes.wav`},
  talk: {type: 'string', default: '21000'},
  out: {type: 'string', default: `.verify/evidence/web-voice-${new Date().toISOString().replace(/[:.]/g, '-')}`},
}});
const out = resolve(root, opts.out);
mkdirSync(out, {recursive: true});
const state = resolve(logs, 'phone-voice.json');
const results = [];
const check = (ok, label) => { results.push({ok: ok === null ? null : !!ok, label}); console.log(ok === null ? 'UNVERIFIED' : ok ? 'PASS' : 'FAIL', label); };
const SEEDED = {26: 'Call Raj', 27: 'Buy groceries', 28: 'Gym evening'};
const PLANNER = `!!document.querySelector('#nav-bar .nav-item') && !!document.querySelector('.spine-card')`;
const PHASE = `(document.getElementById('capture-form')?.dataset.voice ?? '')`;

let syncUrl, b, keySet = false;
const phone = (...args) => execFileSync(process.execPath, ['scripts/web-sync/phone-standin.mjs', '--state', state, ...args], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
const sync = () => phone('--sync', '--site', syncUrl);
const readPhone = () => JSON.parse(execFileSync('cat', [state], {encoding: 'utf8'})).data;

function seed() {
  const data = seedStore(new Date()).data;
  const today = new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Kolkata'});
  for (const entry of data.entries) {
    const title = SEEDED[entry.id];
    if (!title) continue;
    Object.assign(entry, {title, raw: title, done: false, state: 'active', revisions: []});
    if (title === 'Gym evening') Object.assign(entry, {planned: new Date(`${today}T18:00:00+05:30`).toISOString(), plannedDate: today, minutes: 60});
  }
  data.syncSavedAt = new Date().toISOString();
  mkdirSync(logs, {recursive: true});
  writeFileSync(state, JSON.stringify({token: null, data}, null, 1), {mode: 0o600});
}

function setKey() {
  try {
    execFileSync('secret', ['run', '--env', 'GEMINI_API_KEY=gemini-api', '--', 'sh', '-c',
      'printf %s "$GEMINI_API_KEY" | "$0" node_modules/convex/bin/main.js env set GEMINI_API_KEY', process.execPath], {cwd: root, stdio: 'ignore', timeout: 60000});
    return true;
  } catch { return false; }
}

const widths = [[1280, 860], [390, 844]];
async function both(name) {
  for (const [w, h] of widths) { await b.viewport(w, h); await sleep(250); await b.capture(`${name}-${w}`); }
  await b.viewport(...widths[0]);
}

async function openCapture() {
  const found = await b.js(`(() => { document.querySelectorAll('[data-drive]').forEach(n => n.removeAttribute('data-drive'));
    const hit = n => { const r = n.getBoundingClientRect(); return r.width && n.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); };
    const node = [...document.querySelectorAll('button, a, [role=button]')].find(n => /Capture/.test((n.getAttribute('aria-label') ?? '') + n.textContent) && hit(n));
    node?.setAttribute('data-drive', ''); return !!node; })()`);
  if (!found) throw new Error('no Capture control is on screen');
  await b.tap('[data-drive]');
}

async function drive(site) {
  await b.cdp('Page.navigate', {url: site});
  if (!await b.until(PLANNER, 30000)) throw new Error('the website planner did not open');
  await both('planner-before');
  await openCapture();
  check(await b.until(`(m => m && !m.hidden && !m.disabled && m.getClientRects().length)(document.getElementById('voice-mic'))`, 15000), 'the Capture sheet shows the mic');
  await b.tap('#voice-mic');
  check(await b.until(`${PHASE} === 'listening'`, 20000), 'the mic connects and listens');
  await sleep(6000);
  const live = await b.js(`(h => h.hidden ? '' : h.textContent)(document.getElementById('voice-heard'))`);
  check(live ? true : null, `the browser's recognizer shows words while listening: "${live}"`);
  await both('listening');
  await sleep(+opts.talk - 6000);
  await b.tap('#voice-stop');
  const stoppedAt = Date.now();
  if (await b.until(`['working', 'speaking'].includes(${PHASE})`, 3000)) await both('working');
  else check(null, 'the working state passed before a screenshot');
  const ended = await b.until(`${PHASE} === 'done' || ${PHASE} === 'failed'`, 120000);
  const answerSeconds = Math.round((Date.now() - stoppedAt) / 1000);
  check(ended && await b.js(`${PHASE} === 'done'`),
    `the ramble ends with a receipt ${answerSeconds} s after Stop (${await b.js(PHASE)}: ${await b.js(`document.getElementById('voice-panel').innerText.replace(/\\s+/g, ' ')`)})`);
  await both('receipt');
  const rows = await b.js(`[...document.querySelectorAll('#voice-changes li')].map(n => n.innerText.replace(/\\s+/g, ' '))`);
  console.log('  receipt rows:', JSON.stringify(rows));
  check(rows.length >= 4, `the receipt lists the changes (${rows.length} rows)`);
  check(await b.until(`!JSON.parse(localStorage['rpm.web.plan.v1'] ?? '{}').records?.length`, 20000), 'the plan command is sent');
  check(await b.until(`!document.body.innerText.includes('Sorting your words')`, 15000), 'the planner never says the voice words are still sorting');

  const peek = async name => {
    await b.js(`document.getElementById('capture-sheet').close(); true`); await sleep(600);
    await both(name);
    await b.js(`document.getElementById('capture-sheet').showModal(); true`); await sleep(300);
  };
  await peek('planner-with-changes');
  const changed = server('after-ramble');
  const mom = changed.find('call mom')[0], raj = changed.find('call raj')[0], gym = changed.find('gym evening')[0], milk = changed.find('milk')[0], groceries = changed.find('groceries')[0];
  check(mom && !mom.done, `server: Call mom added (${mom?.planned}, ${q(mom?.alertIntent)})`);
  check(raj?.done === true, 'server: Call Raj is done');
  check(gym?.planned && hour(gym.planned) === '20:00', `server: Gym evening moved to 8 pm (${gym?.planned})`);
  check(changed.find('call mom').length === 1 && changed.find('milk').length === 1, `server: each new task is added once (Call mom ${changed.find('call mom').length}, Buy milk ${changed.find('milk').length})`);
  check(milk && !milk.done, `server: Buy milk added (${milk?.plannedDate ?? milk?.planned})`);
  check(!groceries || groceries.archived || !['active', 'pending'].includes(groceries.state), `server: Buy groceries removed (archived: ${groceries?.archived})`);

  check(await b.js(`(n => !n.hidden && !!n.getClientRects().length)(document.getElementById('voice-undo'))`), 'the receipt offers one Undo');
  await b.tap('#voice-undo');
  check(await b.until(`document.getElementById('voice-status').textContent === 'Changes undone'`, 5000), 'the receipt says the changes are undone');
  check(await b.until(`!JSON.parse(localStorage['rpm.web.plan.v1'] ?? '{}').records?.length`, 20000), 'the Undo is sent');
  await both('undone');
  await peek('planner-after-undo');
  const undone = server('after-undo');
  check(!undone.find('call mom').length && !undone.find('milk').length, 'server after Undo: Call mom and Buy milk are gone');
  check(undone.find('call raj')[0]?.done === false, 'server after Undo: Call Raj is open again');
  check(hour(undone.find('gym evening')[0]?.planned) === '18:00', 'server after Undo: Gym evening is back at 6 pm');
  const back = undone.find('groceries')[0];
  check(back && !back.archived && back.state === 'active', 'server after Undo: Buy groceries is back');
  const journal = convex('data', 'captures', '--limit', '5');
  writeFileSync(resolve(out, 'server-captures.txt'), journal);
  check(/voice|Call mom|call mom/i.test(journal), 'server: the heard words are in the captures journal');
}

const hour = iso => iso ? new Date(iso).toLocaleTimeString('en-GB', {timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit'}) : null;
function server(name) {
  sync();
  const data = readPhone();
  const find = title => data.entries.filter(e => (e.title ?? '').toLowerCase().includes(title));
  const pick = e => ({id: e.id, title: e.title, done: e.done, planned: e.planned, plannedDate: e.plannedDate, archived: e.archived, state: e.state, alertIntent: e.alertIntent});
  writeFileSync(resolve(out, `server-${name}.json`), JSON.stringify(Object.fromEntries(['call mom', 'call raj', 'gym', 'milk', 'groceries'].map(t => [t, find(t).map(pick)])), null, 1));
  return {find};
}

async function cleanup() {
  b?.close(); b = null;
  if (syncUrl) {
    try { convex('env', 'remove', 'GEMINI_API_KEY'); } catch {}
    let names = null;
    try { names = convex('env', 'list').split('\n').map(line => line.split('=')[0].trim()); } catch {}
    check(names && !names.includes('GEMINI_API_KEY'), 'the Gemini key is gone from the local deployment');
  }
  stopAll();
}

process.on('SIGINT', async () => { await cleanup(); process.exit(1); });
try {
  syncUrl = await startConvex();
  keySet = setKey();
  check(keySet || null, 'the Gemini key from the vault is set on the local deployment');
  rmSync(state, {force: true});
  seed();
  sync();
  const site = await serveSite({syncUrl, port: +opts.port});
  b = await openBrowser({chrome: opts.chrome, out, env: {...process.env, TZ: 'Asia/Kolkata'},
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${opts.audio}%noloop`, '--autoplay-policy=no-user-gesture-required']});
  await b.cdp('Emulation.setTimezoneOverride', {timezoneId: 'Asia/Kolkata'});
  await b.viewport(...widths[0]);
  await drive(site);
  check(b.errors.length === 0, `no script errors in the page${b.errors.length ? `: ${b.errors.join(' | ')}` : ''}`);
} catch (error) {
  check(false, `drive stopped: ${error.message}`);
  await b?.capture('stopped').catch(() => {});
} finally {
  await cleanup();
  writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 1));
  console.log(`Evidence in ${out}`);
  process.exit(results.some(r => r.ok === false) ? 1 : 0);
}
