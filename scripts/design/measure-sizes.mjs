// Measures the sizes each screen really renders, in the playground, at the S24 FE's 384 × 832 dp.
// Usage: node scripts/design/measure-sizes.mjs [--base http://127.0.0.1:4180] [--out dir] [--theme light|dark] [--bar 0-60]
// Needs `npm run playground` running and Chromium on PATH. Writes <out>/<screen>.png and sizes.json.
import {spawn} from 'node:child_process';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg('--base', 'http://127.0.0.1:4180'), out = arg('--out', '.verify/sizes'), theme = arg('--theme', 'light'), bar = arg('--bar', null);
const chromeBin = process.env.CHROME ?? 'chromium';
mkdirSync(out, {recursive: true});

const port = 9300 + Math.floor(Math.random() * 500), profile = join(tmpdir(), 'rpm-measure-' + port);
const chrome = spawn(chromeBin, ['--headless=new', '--no-sandbox', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {} }
if (!target) { console.error('Chromium did not start; set CHROME to its path.'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); });
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({id, method, params})); });
const evaluate = async expression => (await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true})).result?.result?.value;
await send('Emulation.setDeviceMetricsOverride', {width: 384, height: 832, deviceScaleFactor: 2.8125, mobile: true});
await send('Emulation.setTouchEmulationEnabled', {enabled: true});
await send('Page.enable');
const go = async url => { await send('Page.navigate', {url}); await sleep(2500); };
const tap = async name => evaluate(`(()=>{const all=[...document.querySelectorAll('button,a,[role=button],[role=tab],label')];
  const hit=all.find(e=>(e.getAttribute('aria-label')||e.textContent).trim()===${JSON.stringify(name)})||all.find(e=>(e.getAttribute('aria-label')||e.textContent).includes(${JSON.stringify(name)}));
  if(!hit)return 'missing';hit.click();return 'ok'})()`);

// Runs inside the page: every visible text run, control and icon with its rendered size.
const MEASURE = `(()=>{
  const sel=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+[...e.classList].slice(0,2).map(c=>'.'+c).join('');
  const seen=e=>{const r=e.getBoundingClientRect();if(r.width<1||r.height<1||r.bottom<=0||r.top>=innerHeight)return null;
    for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);if(s.visibility==='hidden'||s.display==='none'||+s.opacity===0)return null;}return r;};
  const texts=[],controls=[],icons=[];
  for(const e of document.querySelectorAll('body *')){
    const r=seen(e);if(!r)continue;const s=getComputedStyle(e);
    if(e.classList.contains('ms')){icons.push({size:parseFloat(s.fontSize),x:Math.round(r.left),y:Math.round(r.top),sel:sel(e)});continue;}
    const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    if(own)texts.push({size:parseFloat(s.fontSize),line:s.lineHeight,weight:s.fontWeight,x:Math.round(r.left),y:Math.round(r.top),text:e.textContent.trim().slice(0,32),sel:sel(e)});
    if(e.matches('button,a[href],input:not([type=hidden]),textarea,select,[role=button],[role=tab],[role=checkbox],[role=switch],[role=slider]'))
      controls.push({h:Math.round(r.height),w:Math.round(r.width),radius:s.borderRadius,pad:s.padding,name:(e.getAttribute('aria-label')||e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,32),sel:sel(e)});
  }
  return {texts,controls,icons};
})()`;

const SCREENS = [
  {name: 'today', url: '/planner.html'},
  {name: 'blocks', url: '/planner.html', tap: 'Blocks'},
  {name: 'projects', url: '/planner.html', tap: 'Projects'},
  {name: 'life', url: '/planner.html', tap: 'Life'},
  {name: 'task-sheet', url: '/planner.html', open: `document.querySelector('.spine-card .spine-title')?.click()`},
  {name: 'settings', url: '/planner.html', taps: ['More options', 'Settings']},
  {name: 'capture', url: '/index.html'},
];

await go(base + '/'); // the shell seeds sample data on first visit
await sleep(1500);
await evaluate(`localStorage.setItem('rpm-clarity:appearance', ${JSON.stringify(theme)})`);
if (bar !== null) await evaluate(`localStorage.setItem('rpm-clarity:bar-transparency', ${JSON.stringify(bar)})`);
const report = {};
for (const screen of SCREENS) {
  await go(base + screen.url);
  for (const name of screen.taps ?? (screen.tap ? [screen.tap] : [])) { await tap(name); await sleep(700); }
  if (screen.open) { await evaluate(screen.open); await sleep(900); }
  const m = await evaluate(MEASURE);
  const shot = await send('Page.captureScreenshot', {format: 'png'});
  writeFileSync(join(out, screen.name + '.png'), Buffer.from(shot.result.data, 'base64'));
  report[screen.name] = m;
}
writeFileSync(join(out, 'sizes.json'), JSON.stringify(report, null, 1));

const tally = (list, key) => Object.entries(list.reduce((t, x) => (t[key(x)] = (t[key(x)] ?? 0) + 1, t), {})).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join('  ');
for (const [name, m] of Object.entries(report)) {
  if (!m) { console.log(name, ': not measured'); continue; }
  console.log(`\n## ${name}`);
  console.log('type   ', tally(m.texts, t => `${t.size}/${t.line} ${t.weight}`));
  console.log('text x ', tally(m.texts, t => t.x));
  console.log('ctrl h ', tally(m.controls, c => c.h));
  console.log('icons  ', tally(m.icons, i => i.size));
}
ws.close(); chrome.kill(); rmSync(profile, {recursive: true, force: true});
process.exit(0);
