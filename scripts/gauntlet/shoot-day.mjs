// Screenshots Today's spine at 390 px from a running serve.mjs, light and dark, normal and 200% text, with the clock
// fixed so now falls inside an item (hero) or between items (now line). Then drives water, a meal, a Routine and Undo,
// and reads the saved store back. Usage: node scripts/gauntlet/shoot-day.mjs <outDir> [port]
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const [out = '.verify/evidence/day-spine', port = '4173'] = process.argv.slice(2);
const base = `http://localhost:${port}`;
fs.mkdirSync(out, {recursive: true});
const browser = await chromium.launch();
const problems = [], log = [];
const today = new Date().toLocaleDateString('en-CA');
const at = hm => new Date(`${today}T${hm}:00`);

async function open({dark = false, large = false, time = '16:20'} = {}) {
  await fetch(base + '/__reset', {method: 'POST', body: JSON.stringify(large ? {fontScale: 2} : {})});
  const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light'});
  page.on('pageerror', e => problems.push(`${time}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`${time}: ${m.text()}`); });
  await page.clock.install({time: at(time)});
  await page.goto(base + '/planner.html');
  await page.waitForSelector('.spine');
  if (large) {
    await textZoom(page, 2);
    await page.evaluate(() => {
      const scroll = document.getElementById('planner-scroll'), now = document.querySelector('.spine-row.current, .spine-now');
      scroll.scrollTop += now.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 160;
    });
  }
  await page.waitForTimeout(900);
  return page;
}
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
const shot = async (page, name) => { await page.mouse.move(-10, -10); await page.waitForTimeout(400); await page.screenshot({path: `${out}/${name}.png`}); log.push(name); };
const scrollTo = (page, top) => page.evaluate(top => document.getElementById('planner-scroll').scrollTo({top, behavior: 'instant'}), top);
const store = async () => (await fetch(base + '/__store')).json();
const body = async () => (await store()).planner.body;

for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light';
  const page = await open({dark});
  await shot(page, `01-${theme}-opens-at-now-hero`);
  await scrollTo(page, 0);
  await shot(page, `02-${theme}-top-of-day`);
  await scrollTo(page, 100000);
  await shot(page, `03-${theme}-end-of-day-now-button`);
  await page.close();
}
for (const dark of [false, true]) {
  const page = await open({dark, time: '14:50'});
  await shot(page, `04-${dark ? 'dark' : 'light'}-now-line-between-items`);
  await page.close();
}
{
  const page = await open({large: true});
  await shot(page, '05-large-text-opens-at-now');
  await scrollTo(page, 0);
  await shot(page, '06-large-text-top');
  await page.evaluate(() => document.getElementById('planner-scroll').scrollBy({top: 700, behavior: 'instant'}));
  await shot(page, '07-large-text-scrolled');
  await page.close();
}
{
  const page = await open();
  const glasses = (await body()).water.glasses.length;
  await page.getByRole('button', {name: 'Log a glass of water'}).click();
  await page.waitForTimeout(700);
  await shot(page, '08-water-logged-with-undo');
  const after = (await body()).water.glasses.length;
  log.push(`water glasses ${glasses} -> ${after}`);
  await page.getByRole('button', {name: 'Undo'}).click();
  await page.waitForTimeout(700);
  log.push(`after Undo ${(await body()).water.glasses.length}`);

  await scrollTo(page, 100000);
  await page.getByRole('button', {name: 'Log dinner'}).click();
  await page.waitForTimeout(700);
  await shot(page, '09-log-dinner-sheet');
  await page.getByLabel('Or type what you ate').fill('Rajma chawal');
  await page.getByRole('button', {name: 'Save', exact: true}).click();
  await page.waitForTimeout(900);
  const dinner = (await body()).meals.find(m => m.slot === 'dinner');
  log.push(`dinner saved: ${dinner?.name} at ${dinner?.at}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await shot(page, '10-dinner-on-the-spine');

  await scrollTo(page, 0);
  await page.getByRole('checkbox', {name: /Morning routine/}).click();
  await page.waitForTimeout(700);
  await shot(page, '11-routine-done-with-undo');
  const run = (await body()).runs[0];
  log.push(`routine marks: ${Object.values(run.marks).map(m => m.state).join(',')}`);
  await page.getByRole('button', {name: 'Undo'}).click();
  await page.waitForTimeout(700);
  log.push(`after Undo: ${Object.values((await body()).runs[0].marks).map(m => m.state).join(',')}`);

  await page.locator('.spine-chip').filter({hasText: 'anytime'}).click();
  await page.waitForTimeout(600);
  await shot(page, '12-anytime-sheet');
  await page.close();
}
await browser.close();
fs.writeFileSync(`${out}/readback.txt`, [...log, '', 'Problems:', ...problems].join('\n') + '\n');
console.log(log.join('\n'));
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
