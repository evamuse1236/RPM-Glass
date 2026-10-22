#!/usr/bin/env node
import {spawn, execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';

const {values: opts} = parseArgs({options: {
  site: {type: 'string', default: 'http://127.0.0.1:5178/'},
  chrome: {type: 'string', default: '/usr/bin/chromium'},
  'no-code': {type: 'boolean', default: false},
  out: {type: 'string', default: `.verify/evidence/web-${new Date().toISOString().replace(/[:.]/g, '-')}`},
}});
mkdirSync(opts.out, {recursive: true});
const results = [];
const check = (ok, label) => { results.push({ok: !!ok, label}); console.log(ok ? 'PASS' : 'FAIL', label); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(opts.chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rpm-web-'))}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], {stdio: 'ignore'});
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  target = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()).then(list => list.find(t => t.type === 'page')).catch(() => null);
}
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => socket.addEventListener('open', r, {once: true}));
let seq = 0;
const waiting = new Map();
socket.addEventListener('message', ({data}) => { const msg = JSON.parse(data); waiting.get(msg.id)?.(msg); waiting.delete(msg.id); });
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; waiting.set(id, msg => msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result));
  socket.send(JSON.stringify({id, method, params}));
});
const js = async expression => (await cdp('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true})).result.value;
const until = async (expression, timeout = 30000) => {
  for (const end = Date.now() + timeout; Date.now() < end; await sleep(250)) if (await js(expression)) return true;
  return false;
};
let shot = 0;
const capture = async name => {
  const {data} = await cdp('Page.captureScreenshot', {format: 'png'});
  const path = join(opts.out, `${String(++shot).padStart(2, '0')}-${name}.png`);
  writeFileSync(path, Buffer.from(data, 'base64'));
  console.log('  shot', path);
};
const viewport = (width, height, scheme) => Promise.all([
  cdp('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: width < 600}),
  cdp('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: scheme}]}),
]);
const click = selector => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.click(); return !!el; })()`);
const taskTitle = id => js(`document.querySelector('[data-task="${id}"] .task-title')?.textContent ?? null`);

await cdp('Page.enable'); await cdp('Runtime.enable');
const errors = [];
socket.addEventListener('message', ({data}) => { const msg = JSON.parse(data); if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text); });

await viewport(412, 915, 'light');
await cdp('Page.navigate', {url: opts.site});
if (opts['no-code']) {
  check(await until(`document.querySelectorAll('#today-lists [data-task]').length > 0`), 'the Site opens straight to the phone planner, with no code');
  check(await js(`document.getElementById('link-view').hidden && document.querySelector('[data-menu=unlink]').hidden`), 'the link screen and Unlink stay hidden');
} else {
await until(`!document.getElementById('link-view').hidden`);
await capture('phone-link');

await js(`document.getElementById('link-code').value = 'WRONG222'; document.getElementById('link-form').requestSubmit(); true`);
check(await until(`!document.getElementById('link-problem').hidden`), 'a wrong code shows a reason on the link screen');
await capture('phone-link-wrong-code');

const {code} = JSON.parse(execFileSync('node', ['scripts/web-sync/phone-standin.mjs', '--link-code'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}));
await js(`document.getElementById('link-code').value = ${JSON.stringify(code.toLowerCase())}; document.getElementById('link-form').requestSubmit(); true`);
check(await until(`document.querySelectorAll('#today-lists [data-task]').length > 0`), 'linking with a phone code shows the phone planner');
}
await sleep(400);
await capture('phone-today');

const first = await js(`+document.querySelector('#today-lists .tasks [data-task]:not(.done)').dataset.task`);
const title = await taskTitle(first);
await click(`#today-lists [data-task="${first}"] .check`);
check(await until(`document.querySelector('[data-task="${first}"]')?.classList.contains('pending')`, 3000), `completing "${title}" shows it waiting for the phone`);
await capture('phone-complete-waiting');
check(await until(`!document.querySelector('#today-lists .tasks [data-task="${first}"]:not(.done)') && !document.getElementById('snackbar').hidden`), 'the phone applies it; the row leaves Today and a snackbar confirms');
await capture('phone-complete-saved');
const undoShown = await js(`!document.getElementById('snackbar-action').hidden`);
check(undoShown, 'the confirmation offers Undo');
await click('#snackbar-action');
check(await until(`!!document.querySelector('#today-lists .tasks [data-task="${first}"]:not(.done)')`), 'Undo puts the task back on Today after the phone applies it');

const words = `Pick up the printed review  from the library ${Date.now() % 1000}`;
await js(`document.getElementById('capture-text').value = ${JSON.stringify(words)}; document.getElementById('capture-form').requestSubmit(); true`);
check(await until(`document.getElementById('captures').textContent.includes('waiting for phone') || document.getElementById('captures').textContent.includes('sending')`, 3000), 'a capture shows the exact words waiting for the phone');
await capture('phone-capture-waiting');
check(await until(`[...document.querySelectorAll('#today-lists .task-title')].some(t => t.textContent === ${JSON.stringify(words.trim())})`), 'the phone files the captured words; they appear in the Inbox');
await sleep(300);
await capture('phone-capture-in-inbox');

const glasses = await js(`document.querySelector('.habit .tnum').textContent`);
await click('[data-act=water]');
check(await until(`document.querySelector('.habit .tnum').textContent !== ${JSON.stringify(glasses)} && !document.querySelector('.habit .tnum').textContent.includes('waiting')`), `logging a glass of water updates the count (was "${glasses}")`);

await click('.nav-item[data-tab=results]');
await sleep(300);
check(await js(`getComputedStyle(document.getElementById('pane-results')).display !== 'none' && getComputedStyle(document.getElementById('pane-today')).display === 'none'`), 'the Blocks tab shows Results and hides Today on a phone');
await capture('phone-blocks');

await click('.nav-item[data-tab=today]');
const inboxTask = await js(`+[...document.querySelectorAll('#today-lists .tasks [data-task]:not(.done)')].at(-1).dataset.task`);
await click(`[data-task="${inboxTask}"] .task-open`);
await until(`document.getElementById('task-sheet').open`);
await sleep(400);
await capture('phone-task-sheet');
await js(`document.querySelector('#task-sheet button[value=tomorrow]').click(); true`);
check(await until(`[...document.querySelectorAll('#today-lists [data-task="${inboxTask}"] .task-meta')].some(m => m.textContent.startsWith('Tomorrow'))`), 'choosing Tomorrow in the sheet moves the task to Next 7 days, as Tomorrow');

await viewport(1280, 800, 'light');
await sleep(500);
check(await js(`getComputedStyle(document.querySelector('.nav-bar')).display === 'none' && getComputedStyle(document.getElementById('pane-results')).display !== 'none'`), 'at laptop width both columns show and the tab bar hides');
await capture('laptop-light');
await viewport(1280, 800, 'dark');
await sleep(300);
await capture('laptop-dark');
await click(`[data-task="${first}"] .task-open`);
await until(`document.getElementById('task-sheet').open`);
await sleep(400);
await capture('laptop-task-sheet');
await js(`document.getElementById('task-sheet').close(); true`);

check(errors.length === 0, `no script errors in the page${errors.length ? `: ${errors.join(' | ')}` : ''}`);
writeFileSync(join(opts.out, 'results.json'), JSON.stringify(results, null, 1));
socket.close(); chrome.kill();
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed} of ${results.length} checks passed. Evidence: ${opts.out}`);
process.exit(failed ? 1 : 0);
