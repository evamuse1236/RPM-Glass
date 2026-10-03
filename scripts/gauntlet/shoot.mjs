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
// Android applies the system font scale through WebSettings.setTextZoom, which multiplies every font size and
// line height (px included) and nothing else. Chromium has no switch for that, so scale those declarations in place.
const textZoom = (page, factor) => page.evaluate(factor => {
  const type = /^(font-size|line-height|--(display|headline|title|body|label)-[a-z]+)$/;
  const visit = rules => { for (const rule of rules) {
    if (rule.cssRules) visit(rule.cssRules);
    for (const name of rule.style ? [...rule.style] : []) {
      const value = rule.style.getPropertyValue(name);
      if (type.test(name) && value.includes('px')) rule.style.setProperty(name,
        value.replace(/(\d*\.?\d+)px/g, (_, n) => `${+n * factor}px`), rule.style.getPropertyPriority(name));
    }
  } };
  for (const sheet of document.styleSheets) visit(sheet.cssRules);
}, factor);
const scroll = async (page, dy) => { await page.mouse.move(206, 500); await page.mouse.wheel(0, dy); await page.waitForTimeout(300); };
const click = async (page, locator) => { await locator.first().click(); await page.waitForTimeout(400); };

const scenes = {
  async today() {
    for (const dark of [false, true]) {
      const page = await open('/planner.html', {dark});
      await shot(page, `today-${dark ? 'dark' : 'light'}`);
      if (!dark) { await scroll(page, 700); await shot(page, 'today-scrolled'); }
      await page.close();
    }
    const big = await open('/planner.html', {reset: {fontScale: 2}});
    await textZoom(big, 2);
    await shot(big, 'today-large-text'); await big.close();
  },
  async block() {
    const page = await open('/planner.html');
    await click(page, page.getByRole('button', {name: 'Blocks'}));
    await shot(page, 'blocks-list');
    await click(page, page.getByText('RM critical review drafted with my group'));
    await shot(page, 'block-detail');
    await scroll(page, 800); await shot(page, 'block-detail-scrolled');
    await page.close();
  },
  async review() {
    const page = await open('/planner.html');
    await click(page, page.getByRole('button', {name: /start the weekly review|Open weekly review/}));
    // A real pass: one win and both still-running Results carried in step 1, one suggested Result accepted in step 3,
    // a third Result picked in step 4. The pointer parks on the title so no hover tint lands in a shot.
    const rest = () => page.mouse.move(260, 32);
    const steps = {
      async 1() {
        await shot(page, 'review-1');
        await click(page, page.getByRole('radiogroup', {name: /All five RM readings/}).getByRole('radio', {name: 'Achieved'}));
        for (const name of [/Carry "RM critical review/, /Carry "PMDL post work/]) await click(page, page.getByRole('button', {name}));
        await page.waitForTimeout(6000); // let the Undo snackbar time out
        await scroll(page, 900); await rest(); await shot(page, 'review-1-scrolled');
      },
      async 3() {
        // One suggestion accepted, then the chooser opened for a task with no clear match.
        await click(page, page.getByRole('button', {name: /^Add "Check the LMS/}));
        await page.waitForTimeout(6000); // let the Undo snackbar time out
        await rest(); await shot(page, 'review-3');
        await click(page, page.getByRole('button', {name: /^Choose a Result for "Buy a new notebook/}));
        await rest(); await shot(page, 'review-3-scrolled');
        await page.mouse.click(206, 120);
      },
      async 4() {
        await click(page, page.getByRole('checkbox', {name: /DAD Excel workbook/}));
        await scroll(page, -2000); await rest(); await shot(page, 'review-4');
        await scroll(page, 900); await rest(); await shot(page, 'review-4-scrolled');
      },
    };
    for (let step = 1; step <= 4; step++) {
      if (steps[step]) await steps[step]();
      else { await shot(page, `review-${step}`); await scroll(page, 900); await rest(); await shot(page, `review-${step}-scrolled`); }
      await scroll(page, -2000);
      if (step < 4) await click(page, page.getByRole('button', {name: /^Next/}));
    }
    await page.close();
  },
  async capture() {
    const page = await open('/index.html');
    await shot(page, 'capture-empty');
    const box = page.locator('textarea').first();
    await box.fill("Finish the DAD charts tomorrow at 9am, it's a must. Ask the group which district we picked for the RM profile");
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
