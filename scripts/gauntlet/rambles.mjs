// Sends each ramble in rambles.json through the real Capture panel and records what Dara would see.
// Run serve.mjs with RAMBLE_DIR=<dir> first: model answers replay from <dir>/<key>.out.json, and a request
// with no recorded answer is parked as <dir>/<key>.in.json for a model to answer (then run this again).
// Usage: node scripts/gauntlet/rambles.mjs <outDir> [port] [id…]
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const [out = 'ramble-shots', port = '4173', ...wanted] = process.argv.slice(2);
const base = `http://localhost:${port}`;
const rambles = JSON.parse(fs.readFileSync(path.join(here, 'rambles.json'), 'utf8')).filter(r => !wanted.length || wanted.includes(r.id));
fs.mkdirSync(out, {recursive: true});
const browser = await chromium.launch();
const report = [];

const settle = async page => {
  // Done when no request is in flight (the pending card is gone) for a moment.
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(250);
    if (!(await page.locator('.pending-card').count())) break;
  }
  await page.waitForTimeout(500);
};
const panelText = page => page.locator('#panel').innerText();
const shot = async (page, name) => { await page.mouse.move(-10, -10); await page.waitForTimeout(300); await page.screenshot({path: `${out}/${name}.png`}); };

for (const ramble of rambles) {
  await fetch(base + '/__reset', {method: 'POST', body: '{}'});
  const page = await browser.newPage({viewport: {width: 412, height: 915}, deviceScaleFactor: 2, timezoneId: 'Asia/Kolkata'});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/index.html');
  await page.waitForTimeout(800);
  const box = page.locator('textarea').first();
  await box.fill(ramble.words);
  await box.press('Enter');
  await settle(page);
  await shot(page, ramble.id);
  const entry = {id: ramble.id, words: ramble.words, shown: await panelText(page), errors};
  for (const [i, step] of (ramble.then ?? []).entries()) {
    if (step.say) { await box.fill(step.say); await box.press('Enter'); }
    if (step.tap) await page.getByRole('button', {name: new RegExp(step.tap, 'i')}).first().click();
    await settle(page);
    await shot(page, `${ramble.id}-${i + 1}`);
    entry[`then${i + 1}`] = {step, shown: await panelText(page)};
  }
  report.push(entry);
  await page.close();
}
await browser.close();
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
const parked = process.env.RAMBLE_DIR ? fs.readdirSync(process.env.RAMBLE_DIR).filter(f => f.endsWith('.in.json') && !fs.existsSync(path.join(process.env.RAMBLE_DIR, f.replace('.in.', '.out.')))) : [];
console.log(`${report.length} rambles recorded in ${out}` + (parked.length ? `; ${parked.length} model requests waiting: ${parked.join(' ')}` : ''));
