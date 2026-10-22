import {sleep} from './cdp.mjs';
import {q} from './drive-kit.mjs';

const visibleText = (selector, text) => `[...document.querySelectorAll(${q(selector)})].some(n => n.getClientRects().length && n.textContent.includes(${q(text)}))`;

async function habits(k) {
  const {b, site, step, look, stamp, planner, readPhone, tab, menu, tapShown, tapText, shown, edit, typeInto, closeSheet, closeAll, swipe, changed} = k;
  const body = data => planner(data).body ?? {};
  const glasses = data => body(data).water?.glasses?.length ?? 0;
  const slot = (data, name) => (body(data).mealPlan?.slots ?? []).find(s => s.slot === name);
  const openHabits = async () => {
    await tab('Today');
    await menu('Habits');
    if (!await shown('.habit-row')) throw new Error('the Habits sheet did not open');
  };

  await step('water-glass', async () => {
    await b.cdp('Page.navigate', {url: 'about:blank'}); await sleep(300);
    await b.cdp('Page.navigate', {url: `${site}#open=${encodeURIComponent(q({view: 'water'}))}`});
    if (!await shown('.sheet-water .filled-btn')) throw new Error('the Water sheet did not open');
    await sleep(800); await b.tap('.sheet-water .filled-btn');
  }, (data, before) => glasses(data) > glasses(before));
  await closeSheet();

  await look('habits-list', openHabits, `${visibleText('.habit-row', 'Water')} && ${visibleText('.habit-row', 'Lunch')}`,
    'More → Habits lists water, the meals and the routines');
  await step('water-goal', async () => {
    await tapText('.habit-row', 'Water', 'button.habit-open');
    await tapShown('[aria-label="More glasses"]');
  }, changed(data => body(data).water?.settings?.goal));
  await closeAll();

  let lunchAt = '13:30';
  await step('meal-retime', async () => {
    lunchAt = slot(readPhone(), 'lunch')?.at === '13:30' ? '13:00' : '13:30';
    await openHabits();
    await tapText('.habit-row', 'Lunch', 'button.habit-open');
    await shown('label.time-button input[type=time]');
    await b.js(`(() => { const input = document.querySelector('label.time-button input[type=time]'); input.value = ${q(lunchAt)};
      input.dispatchEvent(new Event('input', {bubbles: true})); input.dispatchEvent(new Event('change', {bubbles: true})); return true; })()`);
  }, data => slot(data, 'lunch')?.at === lunchAt);
  await closeAll();

  const shownOn = data => slot(data, 'breakfast')?.on;
  await step('meal-show', async () => {
    await openHabits();
    await tapText('.habit-row', 'Breakfast', '.habit-switch');
  }, changed(shownOn));
  await step('meal-show-again', () => tapText('.habit-row', 'Breakfast', '.habit-switch'), changed(shownOn));

  const addSnack = () => step('add-snack', async () => {
    await openHabits();
    await tapText('.sheet button', 'Add a snack time');
  }, data => !!slot(data, 'snack'));
  const removeSnack = () => step('remove-snack', async () => {
    await openHabits();
    await tapText('.habit-row', 'Snack', 'button.habit-open');
    await tapText('.sheet button', 'Remove snack');
  }, data => !slot(data, 'snack'));
  await closeAll();
  if (slot(readPhone(), 'snack')) { await removeSnack(); await closeAll(); await addSnack(); }
  else { await addSnack(); await closeAll(); await removeSnack(); }
  await closeAll();

  const routine = `Drive routine ${stamp}`;
  const routineOf = data => (body(data).routines ?? []).find(r => r.name === routine);
  await step('routine-new', async () => {
    await openHabits();
    await tapText('.sheet button', 'New routine');
    await k.mark('label.text-field', 'Name', 'input');
    await typeInto('[data-drive]', routine, false);
    await typeInto('input[aria-label="Add a step"]', 'Stretch for five minutes');
    await tapText('.sheet button', 'Save routine');
  }, data => routineOf(data)?.steps?.length > 0);
  await closeAll();

  const skipped = data => (body(data).runs ?? []).filter(r => r.skippedDay).length;
  await step('skip-today', async () => {
    await tab('Today');
    await tapShown('[aria-label$=". Open routine"]');
    await tapShown('.sheet [aria-label="More options"]');
    await tapText('.menu-item', 'Skip today');
  }, (data, before) => skipped(data) > skipped(before));
  await closeAll();

  const meals = data => (body(data).meals ?? []).length;
  await step('meal-swipe-log-now', async () => {
    await tab('Today');
    await swipe('.spine-row[data-key="meal:dinner"] article.spine-card', '', 180);
    if (await shown('.sheet .slot-chips', 1500)) await edit('.sheet input', 'Roti and sabzi');
  }, (data, before) => meals(data) > meals(before));
  await closeAll();

  await step('meal-log', async () => {
    await tab('Today');
    await tapShown('.spine-row[data-key="meal:lunch"] .spine-open');
    await tapText('.sheet .slot-chips .choice-chip', 'Lunch');
    await edit('.sheet input', 'Dal and rice');
  }, data => (body(data).meals ?? []).some(m => m.slot === 'lunch'));
  await closeAll();
}

async function captureSettings(k) {
  const {b, step, look, stamp, tapShown, tapText, shown, menu, tab, closeAll} = k;
  const words = `Drive capture ${stamp} book the dentist`;
  await step('capture', async () => {
    await tapShown('.top-bar [aria-label="Capture"]'); await shown('#capture-text');
    await b.type('#capture-text', words);
    await b.js(`document.getElementById('capture-form').requestSubmit(); true`);
  }, data => data.entries.some(e => (e.title ?? '').includes(words)));
  await look('capture-history', async () => {
    await closeAll();
    await tapShown('.top-bar [aria-label="Capture"]');
  }, visibleText('#capture-list li', words), 'Capture lists what was sent, newest first');
  await closeAll();

  const settings = async () => {
    await tab('Today');
    await menu('Settings');
    if (!await shown('[data-section="planner-appearance"]')) throw new Error('Settings shows no Appearance section');
  };
  await look('theme', async () => {
    await settings();
    await b.js(`window.__driveTheme = localStorage.getItem('rpm-clarity:appearance'); true`);
    await tapText('[data-section="planner-appearance"] button.settings-row', 'Theme');
    await shown('dialog.theme-dialog');
    await tapText('dialog.theme-dialog label.dialog-choice', localStorageTheme(await b.js(`localStorage.getItem('rpm-clarity:appearance')`)), 'input');
  }, `localStorage.getItem('rpm-clarity:appearance') !== window.__driveTheme && document.documentElement.dataset.appearance === localStorage.getItem('rpm-clarity:appearance')`,
  'Theme changes the look and keeps the choice');
  await look('transparency', async () => {
    await b.js(`(() => { const s = document.getElementById('bar-transparency'); s.value = s.value === '40' ? '60' : '40';
      window.__driveBar = s.value; s.dispatchEvent(new Event('input', {bubbles: true})); return true; })()`);
  }, `localStorage.getItem('rpm-clarity:bar-transparency') === window.__driveBar`, 'the tab bar slider sets and keeps its transparency');
  await look('about', () => b.js(`document.querySelector('[data-section="about"]')?.scrollIntoView(); true`),
    `!!document.querySelector('[data-section="about"]')?.getClientRects().length && /RPM/.test(document.querySelector('[data-section="about"]').textContent)`,
    'Settings ends with About');
  await b.js(`(() => { const theme = window.__driveTheme; if (theme) localStorage.setItem('rpm-clarity:appearance', theme); else localStorage.removeItem('rpm-clarity:appearance'); return true; })()`);
  await closeAll();
}

const localStorageTheme = current => current === 'dark' ? 'Light' : 'Dark';

export async function habitsSettings(k) {
  await habits(k);
  await captureSettings(k);
}
