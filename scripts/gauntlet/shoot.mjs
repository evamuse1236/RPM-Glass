// Screenshots every gauntlet scene at Galaxy S24 FE size (412×915 dp, 2x) from a running serve.mjs.
// Usage: node scripts/gauntlet/shoot.mjs <outDir> [port] [scene…]   (scenes: today block review capture)
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const [out = 'gauntlet-shots', port = '4173', ...wanted] = process.argv.slice(2);
const base = `http://localhost:${port}`;
fs.mkdirSync(out, {recursive: true});
const browser = await chromium.launch();
const problems = [];

async function open(path, {dark = false, reset = {}} = {}) {
  await fetch(base + '/__reset', {method: 'POST', body: JSON.stringify(reset)});
  const page = await browser.newPage({viewport: {width: 412, height: 915}, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light'});
  page.on('pageerror', e => problems.push(`${path}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`${path}: ${m.text()}`); });
  await page.goto(base + path);
  await page.waitForTimeout(900);
  return page;
}
const shot = async (page, name, full = false) => { await page.waitForTimeout(350); await page.screenshot({path: `${out}/${name}.png`, fullPage: full}); };
const click = async (page, locator) => { await locator.first().click(); await page.waitForTimeout(400); };

const scenes = {
  async today() {
    for (const dark of [false, true]) {
      const page = await open('/planner.html', {dark});
      await shot(page, `today-${dark ? 'dark' : 'light'}`);
      if (!dark) { await page.mouse.wheel(0, 700); await shot(page, 'today-scrolled'); }
      await page.close();
    }
    const big = await open('/planner.html', {reset: {fontScale: 2}});
    await big.evaluate(() => { document.documentElement.style.fontSize = '200%'; document.body.style.zoom = '1'; });
    await shot(big, 'today-large-text'); await big.close();
  },
  async block() {
    const page = await open('/planner.html');
    await click(page, page.getByRole('button', {name: 'Blocks'}));
    await shot(page, 'blocks-list');
    await click(page, page.getByText('RM critical review drafted with my group'));
    await shot(page, 'block-detail');
    await page.mouse.wheel(0, 800); await shot(page, 'block-detail-scrolled');
    await page.close();
  },
  async review() {
    const page = await open('/planner.html');
    await click(page, page.getByRole('button', {name: /Open weekly review/}));
    for (let step = 1; step <= 4; step++) {
      await shot(page, `review-${step}`);
      await page.mouse.wheel(0, 900); await shot(page, `review-${step}-scrolled`);
      await page.mouse.wheel(0, -2000);
      if (step < 4) await click(page, page.getByRole('button', {name: /^Next/}));
    }
    await page.close();
  },
  async capture() {
    const page = await open('/index.html');
    await shot(page, 'capture-empty');
    const box = page.locator('textarea').first();
    await box.fill('Finish the DAD charts tomorrow morning, it is a must. Ask the group which district we picked');
    await shot(page, 'capture-typed');
    await page.evaluate(() => { window.__modelDelay = 4000; });
    await box.press('Enter');
    await page.waitForTimeout(1200); await shot(page, 'capture-sorting');
    await page.waitForTimeout(4500); await shot(page, 'capture-proposals');
    const add = page.getByRole('button', {name: /^Add/});
    if (await add.count()) { await click(page, add); await page.waitForTimeout(600); await shot(page, 'capture-receipt'); }
    else problems.push('capture: no Add button after proposals');
    await page.close();
  },
};

for (const name of wanted.length ? wanted : Object.keys(scenes)) {
  try { await scenes[name](); } catch (error) { problems.push(`${name}: ${error.message.split('\n')[0]}`); }
}
await browser.close();
fs.writeFileSync(`${out}/problems.txt`, problems.join('\n'));
console.log(fs.readdirSync(out).join(' ')); if (problems.length) console.log('Problems:\n' + problems.join('\n'));
