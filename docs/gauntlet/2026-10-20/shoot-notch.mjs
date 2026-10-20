// Usage: node docs/gauntlet/2026-10-20/shoot-notch.mjs <outDir> [port], with `npm run playground` on that port and /usr/bin/chromium.
import fs from 'node:fs';
import {spawn} from 'node:child_process';

const [out = 'notch-shots', port = '4180'] = process.argv.slice(2);
const base = `http://127.0.0.1:${port}/`;
const debugPort = 9300 + Math.floor(Math.random() * 400);
fs.mkdirSync(out, {recursive: true});
const profile = fs.mkdtempSync('/tmp/notch-shots-');
const chrome = spawn('/usr/bin/chromium', ['--headless=new', '--no-sandbox', '--hide-scrollbars', `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`, 'about:blank'], {stdio: 'ignore'});
const wait = ms => new Promise(r => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await wait(200);
  try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, {once: true}));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({id, method, params})); });
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
  return r.result?.result?.value;
};
await send('Runtime.enable');
await send('Animation.enable');
await send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 900, deviceScaleFactor: 2, mobile: false});

const STORE = String.raw`(spec => {
  const iso = hm => { const [h, m] = hm.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const entries = (spec.tasks ?? []).map((t, i) => ({id: i + 1, title: t.title, raw: t.title, kind: 'plan', planned: iso(t.at), minutes: t.minutes ?? 30,
    blockId: 'b1', ...(t.alert ? {alertIntent: {type: t.alert}} : {})}));
  const planner = {blocks: [{id: 'b1', title: 'Study'}]};
  if (spec.body) planner.body = {water: {settings: {goal: spec.body.goal ?? 8}, glasses: (spec.body.glasses ?? []).map(iso)},
    routines: spec.body.routine ? [{id: 'r1', name: 'Evening routine', start: '15:00', end: '23:00', days: [0, 1, 2, 3, 4, 5, 6],
      steps: [{id: 's1', title: 'Tidy desk'}, {id: 's2', title: 'Walk'}]}] : [], meals: []};
  return {schema: 2, version: 1, entries, memories: [], history: [], conversations: [], planner};
})`;

async function scene(name, {spec, time, expand = false, dark = false, text = 1, then = null, settle = 900, motion = false, midway = 0}) {
  await send('Page.navigate', {url: base});
  await wait(600);
  await evaluate(`(() => { localStorage.clear();
    localStorage.setItem('rpm-playground:companion', JSON.stringify(${STORE}(${JSON.stringify(spec)})));
    localStorage.setItem('rpm-playground:device', JSON.stringify({dark: ${dark}, textScale: ${text}}));
    localStorage.setItem('rpm-playground:shell', JSON.stringify({view: 'notch', expandNotch: ${expand}, notchTime: '${time}'}));
    document.documentElement.dataset.reduceMotion = '${!motion}'; })()`);
  await send('Page.reload');
  await wait(1200);
  await evaluate(`document.documentElement.dataset.reduceMotion = '${!motion}'`);
  await send('Animation.setPlaybackRate', {playbackRate: midway ? 0.1 : 1});
  if (then) { await evaluate(then); await wait(midway || settle); }
  if (!midway) await wait(400);
  const box = await evaluate(`(() => { const r = document.getElementById('screen').getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width}; })()`);
  const shot = await send('Page.captureScreenshot', {format: 'png', clip: {x: box.x, y: box.y, width: box.w, height: 520, scale: 1}});
  fs.writeFileSync(`${out}/${name}.png`, Buffer.from(shot.result.data, 'base64'));
  const facts = await evaluate(`(() => { const i = document.querySelector('.island'); const f = i?.querySelector('.island-face:not([data-state=leaving])');
    return i ? {island: [i.offsetWidth, i.offsetHeight], face: f ? f.scrollHeight : 0, clipped: f ? f.scrollHeight > i.offsetHeight + 1 : false,
      scale: f ? getComputedStyle(f).scale : ''} : null; })()`);
  console.log(name.padEnd(28), JSON.stringify(facts));
}

const DAY = {tasks: [{title: 'Write RM essay', at: '15:30', minutes: 45}, {title: 'Call Prof. Rao', at: '16:30', alert: 'reminder'},
  {title: 'Gym', at: '19:00', minutes: 60, alert: 'alarm'}], body: {glasses: ['08:30', '10:30'], routine: true}};
const LONG = {tasks: [{title: 'Finish the literature review section and send the draft to the group for comments before the call', at: '15:30', minutes: 45, alert: 'reminder'},
  {title: 'रिसर्च पेपर का दूसरा अध्याय पढ़ना और नोट्स बनाना', at: '16:30', alert: 'alarm'}, {title: 'Gym', at: '19:00'}],
  body: {glasses: ['08:30'], routine: true}};
const click = selector => `document.querySelector(${JSON.stringify(selector)}).click()`;

await scene('01-pill', {spec: DAY, time: '15:50'});
await scene('02-open', {spec: DAY, time: '15:50', expand: true});
await scene('03-reminder', {spec: DAY, time: '16:29', then: click('[data-alert="reminder"]')});
await scene('04-alarm', {spec: DAY, time: '18:59', then: click('[data-alert="alarm"]')});
await scene('05-receipt-undo', {spec: DAY, time: '15:50', expand: true, then: click('.notch-primary')});
await scene('06-manage', {spec: DAY, time: '15:50', expand: true, then: `[...document.querySelectorAll('.notch-row-tap')].find(r => r.querySelector('.notch-alert-chip')).click()`});
await scene('07-empty-day', {spec: {tasks: []}, time: '15:50'});
await scene('08-water-hero', {spec: {tasks: [], body: {glasses: ['08:30']}}, time: '15:50', expand: true});
await scene('09-long-title', {spec: LONG, time: '15:10', expand: true});
await scene('10-long-title-max-text', {spec: LONG, time: '15:10', expand: true, text: 2});
await scene('11-dark', {spec: DAY, time: '15:50', expand: true, dark: true});
await scene('12-many-due', {spec: {...DAY, tasks: [...DAY.tasks, {title: 'Draft slides', at: '17:00'}]}, time: '16:05', expand: true});
await scene('13-max-text-manage', {spec: LONG, time: '15:10', expand: true, text: 2,
  then: `[...document.querySelectorAll('.notch-row-tap')].find(r => r.querySelector('.notch-alert-chip') || /Reminder|alarm/.test(r.textContent)).click()`});
await scene('14-max-text-alarm', {spec: LONG, time: '16:29', text: 2, then: click('[data-alert="alarm"]')});
await scene('15-large-text-open', {spec: DAY, time: '15:50', expand: true, text: 1.3});
await scene('16-morph-midway', {spec: DAY, time: '15:50', motion: true, then: `document.getElementById('notch-animate').click()`, midway: 1500});
await scene('17-morph-settled', {spec: DAY, time: '15:50', motion: true, then: `document.getElementById('notch-animate').click()`, settle: 900});

if (errors.length) console.log('page errors:\n' + errors.join('\n'));
ws.close();
chrome.kill();
fs.rmSync(profile, {recursive: true, force: true});
