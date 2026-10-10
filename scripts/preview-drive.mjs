// Smoke drive of the planner in a desktop browser (the `npm run dev` preview) at phone 390x844 and desktop 1440x900.
// Feature today-complete (.claude/skills/verify-rpm-glass/features/today.md): open the planner on Today, tick
// "Group call: merge sections", see "Task completed", and read the saved store back. Fails on any page or console error.
// This is a cheap gate for `npm run verify`. It is not proof for the phone: the WebView, keyboard, text zoom and the
// native widget only exist on Android (rpmctl). Usage: node scripts/preview-drive.mjs [--out DIR]
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {ROOT, run} from './lib/toolchain.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const outArg = process.argv.indexOf('--out');
const out = path.resolve(outArg > 0 ? process.argv[outArg + 1] : path.join(ROOT, '.verify', 'preview', new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(out, {recursive: true});
const TASK = 'Group call: merge sections';
const WIDTHS = [['phone', {width: 390, height: 844}], ['desktop', {width: 1440, height: 900}]];

const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, () => { const {port} = s.address(); s.close(() => resolve(port)); }); });

if (run(process.execPath, ['scripts/build-companion-assets.mjs']) !== 0) process.exit(1);
const port = await freePort();
const server = spawn(process.execPath, ['scripts/gauntlet/serve.mjs', String(port)], {cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit']});
await new Promise((resolve, reject) => { server.stdout.on('data', d => /harness on/.test(d) && resolve()); server.on('exit', c => reject(new Error(`serve.mjs exited ${c}`))); });
const base = `http://localhost:${port}`;
const browser = await chromium.launch();
const results = [];
try {
  for (const [name, viewport] of WIDTHS) {
    const errors = [];
    await fetch(base + '/__reset', {method: 'POST', body: '{}'});
    const page = await browser.newPage({viewport, colorScheme: 'light'});
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.goto(base + '/planner.html');
    await page.getByRole('heading', {name: 'Today', exact: true}).waitFor({timeout: 15000});
    const box = page.getByRole('checkbox', {name: `Mark ${TASK} complete`}).first();
    await box.scrollIntoViewIfNeeded();
    await page.screenshot({path: path.join(out, `${name}-01-today.png`)});
    await box.click();
    await page.getByText('Task completed').first().waitFor({timeout: 5000});
    await page.screenshot({path: path.join(out, `${name}-02-task-completed.png`)});
    const store = await (await fetch(base + '/__store')).json();
    const entry = store.entries.find(e => e.title === TASK);
    const saved = {state: entry?.state, done: entry?.done, completedAt: entry?.completedAt ?? null};
    const ok = saved.done === true && !!saved.completedAt && !errors.length;
    results.push({width: name, viewport, ok, saved, errors});
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(results, null, 2));
for (const r of results) console.log(`${r.ok ? '✔' : '✖'} ${r.width} ${r.viewport.width}x${r.viewport.height}: "${TASK}" saved as ${JSON.stringify(r.saved)}${r.errors.length ? `; errors: ${r.errors.join(' | ')}` : ''}`);
console.log(`Evidence: ${out}`);
process.exit(results.every(r => r.ok) ? 0 : 1);
