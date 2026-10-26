#!/usr/bin/env node
import './node24.mjs';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {openBrowser, sleep} from './cdp.mjs';
import {BANK, CARD, makeKit, q} from './drive-kit.mjs';
import {convex, logs, root, serveSite, startConvex, stopAll} from './local-stack.mjs';

const {values: opts} = parseArgs({options: {
  chrome: {type: 'string', default: '/usr/bin/chromium'},
  port: {type: 'string', default: '5189'},
  out: {type: 'string', default: `.verify/evidence/web-offline-${new Date().toISOString().replace(/[:.]/g, '-')}`},
}});
const out = resolve(root, opts.out);
mkdirSync(out, {recursive: true});
const state = resolve(logs, 'phone-offline.json');
const results = [];
const check = (ok, label) => { results.push({ok: ok === null ? null : !!ok, label}); console.log(ok === null ? 'UNVERIFIED' : ok ? 'PASS' : 'FAIL', label); };
const PLANNER = `!!document.querySelector('#nav-bar .nav-item') && !!document.querySelector('.spine-card')`;
const UNDO = `(() => { const n = document.querySelector('#snackbar .snackbar-action'); if (!n?.getClientRects().length) return false;
  const r = n.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return getComputedStyle(document.getElementById('snackbar')).opacity > 0.9 && r.bottom <= innerHeight && n.contains(top); })()`;
const SAVED = `(() => { const plan = JSON.parse(localStorage['rpm.web.plan.v1'] ?? '{}');
  return !(plan.records ?? []).length && !document.querySelector('[data-sync]') && !document.getElementById('notes').textContent.includes('not saved yet'); })()`;
const REVIEW = 'Finish my section of the critical review';
const WORDS = 'call the bank tomorrow at 5pm';
const tag = new Date().toISOString().slice(11, 19).replace(/:/g, '');
const ADDED = `Book the car service ${tag}`, WEB_TITLE = `Ask the bank to refund the fee ${tag}`, PHONE_TITLE = `Phone: ring the bank ${tag}`;
const PHONE_NOTE = `Phone note: pick a funny one ${tag}`, WEB_CARD = `Buy a card for Amma ${tag}`, PHONE_LATER = `Phone later note: she likes yellow ${tag}`;
const tomorrowIndia = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', {timeZone: 'Asia/Kolkata'});

let syncUrl, b, keySet = false;
const phone = (...args) => execFileSync(process.execPath, ['scripts/web-sync/phone-standin.mjs', '--state', state, ...args], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
const sync = () => phone('--sync', '--site', syncUrl);
const snapshot = () => b.js(`JSON.parse(localStorage['rpm.web.v1'] ?? '{}').snapshot ?? null`);
const entry = (data, id) => data?.entries.find(e => e.id === id);

function setKey() {
  try {
    execFileSync('secret', ['run', '--env', 'ANTHROPIC_API_KEY=anthropic', '--', 'sh', '-c',
      'printf %s "$ANTHROPIC_API_KEY" | "$0" node_modules/convex/bin/main.js env set ANTHROPIC_API_KEY', process.execPath], {cwd: root, stdio: 'ignore', timeout: 60000});
    return true;
  } catch { return false; }
}

async function savedOnline(name, test, timeout = 20000) {
  let ok = false;
  for (const end = Date.now() + timeout; !ok && Date.now() < end; await sleep(300)) ok = await b.js(SAVED) && !!test(await snapshot());
  check(ok, `${name}: the website shows it saved while the phone is offline`);
  return ok;
}

async function openAnywhere(k, title) {
  try { await k.openTask(title); } catch {
    await k.closeAll(); await k.menu('Inbox'); await k.tapText('.sheet .task-row', title, '.task-title');
    if (!await k.shown('#task-tab-when')) throw new Error(`the task sheet for “${title}” did not open`);
  }
}

async function drive(k) {
  const start = k.readPhone();
  const bank = k.task(start, BANK), card = k.task(start, CARD), review = start.entries.find(e => e.title?.startsWith(REVIEW));
  phone('--edit', String(bank.id), 'title', PHONE_TITLE);
  phone('--edit', String(card.id), 'notes', PHONE_NOTE);
  await sleep(1100);

  await k.menu('Inbox'); await k.tapText('.sheet button', 'Add task'); await k.shown('textarea.quick-input');
  await b.type('textarea.quick-input', ADDED); await b.key('Enter');
  await savedOnline('add a task', snap => snap?.entries.some(e => e.title === ADDED));
  await k.closeAll();

  await openAnywhere(k, BANK);
  await k.fill('.sheet textarea.task-title-field', WEB_TITLE);
  await k.closeAll();
  await savedOnline('edit a title', snap => entry(snap, bank.id)?.title === WEB_TITLE);

  await k.tab('Today'); await k.swipe('article.spine-card', REVIEW, 160);
  await savedOnline('complete a task', snap => entry(snap, review.id)?.done === true);
  await k.closeAll();

  await k.tapShown('.top-bar [aria-label="Capture"]'); await k.shown('#capture-text');
  await b.type('#capture-text', WORDS); await b.key('Enter');
  const captured = snap => snap?.entries.find(e => e.raw === WORDS && e.planned);
  let capture = null;
  for (const end = Date.now() + 120000; !capture && Date.now() < end; await sleep(500)) {
    capture = captured(await snapshot());
    if (await b.js(`document.getElementById('notes').textContent.includes('Your words were kept')`)) break;
  }
  if (!keySet || !capture) check(null, `Capture with the real AI: ${keySet ? 'no task came back; the words were kept' : 'no model key from the vault'}`);
  else check(await b.until(SAVED, 10000) && await k.shownText('#notes li', 'Added'), 'Capture: the website shows the sorted task saved while the phone is offline');
  check(!k.readPhone().entries.some(e => e.title === ADDED), 'the phone has none of the website changes before it syncs');
  await k.shots('offline-saved');

  sync();
  const data = k.readPhone();
  check(k.task(data, ADDED), 'phone sync: the added task is on the phone');
  check(entry(data, review.id)?.done === true, 'phone sync: the completion is on the phone');
  if (capture) {
    const got = data.entries.find(e => e.raw === WORDS);
    check(got?.planned === `${tomorrowIndia}T11:30:00.000Z`, `phone sync: the captured task is planned 5 pm India tomorrow (${got?.planned})`);
    check(got?.title && got.raw === WORDS, `phone sync: the captured task “${got?.title}” keeps the words “${got?.raw}”`);
  } else check(null, 'phone sync: the captured task (Capture did not run)');
  const bankNow = entry(data, bank.id);
  check(bankNow?.title === WEB_TITLE, 'phone sync: the newer website title wins');
  check(bankNow?.notes?.includes(PHONE_TITLE), "phone sync: the phone's older title is kept in the notes");
  check(entry(data, card.id)?.notes?.includes(PHONE_NOTE), "phone sync: the phone's notes edit on another task is kept");
  await b.js(`document.dispatchEvent(new Event('visibilitychange')); true`);
  check(await b.until(`(JSON.parse(localStorage['rpm.web.v1']).snapshot.conflicts ?? []).length > 0`, 15000)
    && await k.shownText('#notes li', PHONE_TITLE, 10000), 'the website lists the title conflict in its notes');

  await openAnywhere(k, CARD);
  await k.fill('.sheet textarea.task-title-field', WEB_CARD);
  await k.closeAll();
  await savedOnline('rename a second task', snap => entry(snap, card.id)?.title === WEB_CARD);
  const renamed = Date.now();
  check(await b.until(UNDO, 1000), 'the rename shows Undo on screen');
  phone('--edit', String(card.id), 'notes', PHONE_LATER);
  sync();
  await b.js(`document.dispatchEvent(new Event('visibilitychange')); true`);
  check(await b.until(`(${q(PHONE_LATER)}) === JSON.parse(localStorage['rpm.web.v1']).snapshot.entries.find(e => e.id === ${card.id})?.notes`, 10000),
    "the website reads the phone's later notes edit");
  const offered = await b.until(UNDO, 500);
  check(offered, `Undo is still on screen after the phone sync (${((Date.now() - renamed) / 1000).toFixed(1)} s after the rename)`);
  if (offered) await b.tap('#snackbar .snackbar-action');
  else check(await b.js(`(n => (n?.click(), !!n))(document.querySelector('#snackbar:not([hidden]) > .snackbar-action'))`), 'the unseen Undo button is still in the page; the drive clicks it by script');
  await b.capture('undo-after-phone-sync');
  check(await b.until(`${SAVED} && (s => s.entries.find(e => e.id === ${card.id})?.title === ${q(CARD)})(JSON.parse(localStorage['rpm.web.v1']).snapshot)`, 20000),
    'website Undo restores the title and shows it saved');
  check(await b.until(`document.body.innerText.includes(${q(CARD)}) && !document.body.innerText.includes(${q(WEB_CARD)})`, 5000),
    'the page shows the restored title after Undo');
  sync();
  const after = k.readPhone();
  check(entry(after, card.id)?.title === CARD, 'phone sync after Undo: the website rename is taken back');
  check(entry(after, card.id)?.notes === PHONE_LATER, "phone sync after Undo: the phone's later notes edit survives");
  check(entry(after, bank.id)?.title === WEB_TITLE && k.task(after, ADDED), 'phone sync after Undo: earlier website changes stay');
  await b.viewport(412, 915); await sleep(800);
  await k.shots('end');
}

async function cleanup() {
  b?.close(); b = null;
  if (syncUrl) {
    try { convex('env', 'remove', 'ANTHROPIC_API_KEY'); } catch {}
    let names = null;
    try { names = convex('env', 'list').split('\n').map(line => line.split('=')[0].trim()); } catch {}
    check(names && !names.includes('ANTHROPIC_API_KEY'), 'the model key is gone from the local deployment');
  }
  stopAll();
  if (syncUrl) {
    let closed = false;
    for (let i = 0; i < 40 && !closed; i++) { await sleep(250); closed = await fetch(syncUrl, {signal: AbortSignal.timeout(1000)}).then(() => false, () => true); }
    check(closed, 'the local Convex is stopped');
  }
}

const hadEnv = existsSync(resolve(root, '.env.local')), hadLocal = existsSync(resolve(root, '.convex'));
process.on('SIGINT', async () => { await cleanup(); process.exit(1); });
try {
  syncUrl = await startConvex();
  keySet = setKey();
  rmSync(state, {force: true});
  sync();
  const site = await serveSite({syncUrl, port: +opts.port});
  b = await openBrowser({chrome: opts.chrome, out});
  await b.cdp('Emulation.setTimezoneOverride', {timezoneId: 'Asia/Kolkata'});
  await b.viewport(412, 915);
  await b.cdp('Page.navigate', {url: site});
  if (!await b.until(PLANNER, 30000)) throw new Error('the website planner did not open');
  await drive(makeKit({b, check, state, site}));
  check(b.errors.length === 0, `no script errors in the page${b.errors.length ? `: ${b.errors.join(' | ')}` : ''}`);
} catch (error) {
  check(false, `drive stopped: ${error.message}`);
  await b?.capture('stopped').catch(() => {});
} finally {
  await cleanup();
  if (!hadEnv) rmSync(resolve(root, '.env.local'), {force: true});
  if (!hadLocal) rmSync(resolve(root, '.convex'), {recursive: true, force: true});
}
writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 1));
const failed = results.filter(r => r.ok === false).length, unverified = results.filter(r => r.ok === null).length;
console.log(`${results.length - failed - unverified} of ${results.length} checks passed${unverified ? `, ${unverified} UNVERIFIED` : ''}. Evidence: ${out}`);
process.exit(failed ? 1 : 0);
