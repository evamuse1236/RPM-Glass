import {sleep} from './cdp.mjs';
import {q, BANK, dayKey} from './drive-kit.mjs';

const dayFrom = days => dayKey(new Date(Date.now() + days * 86400000));
const pressed = day => `document.querySelector('.week-strip .week-day[data-day="${day}"]')?.getAttribute('aria-pressed') === 'true'`;

export async function today(k) {
  const {b, step, look, tab, tapShown, tapText, shown, task, planner, closeSheet, closeAll, stamp, changed} = k;
  await tab('Today');
  const bankCheck = `.spine-check[aria-label^=${q(`${BANK},`)}]`;
  await step('complete-task', () => b.tap(bankCheck), data => task(data, BANK).done === true);
  await step('reopen-task', () => b.tap(bankCheck), data => task(data, BANK).done === false);
  let sawDone = false;
  await step('undo-complete', async () => {
    await b.tap(bankCheck);
    await tapShown('#snackbar .snackbar-action');
  }, data => (sawDone ||= task(data, BANK).done === true) && task(data, BANK).done === false);

  const added = `Drive quick add ${stamp}`;
  await step('quick-add', async () => {
    await tapShown('.fab[aria-label="Add task"]');
    await b.type('textarea.quick-input', added);
    await b.key('Enter');
  }, data => !!task(data, added));
  await closeSheet();

  const runs = data => planner(data).body?.runs;
  await step('routine-tick', async () => {
    await tab('Today');
    await tapShown('[aria-label$=", mark every step done"]');
  }, changed(runs));

  const later = dayFrom(2);
  await look('week-strip-day', () => tapShown(`.week-strip .week-day[data-day="${later}"]`), pressed(later), 'a tap on a week strip day shows that day');
  await look('jump-to-today', () => tapText('.date-line button', 'Today'), `${pressed(dayFrom(0))} && !!document.querySelector('.spine-card')`,
    'Today in the date line jumps back to today');
  await look('date-picker', async () => {
    await tapShown('.date-button');
    await shown('.sheet input[type=date]');
    await b.js(`(() => { const input = document.querySelector('.sheet input[type=date]'); input.value = ${q(dayFrom(3))}; return true; })()`);
    await tapText('.sheet button.filled-btn', 'Go');
  }, pressed(dayFrom(3)), 'the date picker goes to the chosen day');
  await tapText('.date-line button', 'Today').catch(() => {});
  await sleep(400);

  await look('today-list', async () => {
    await tapShown('.date-button');
    await tapText('.sheet .list-btn', 'Show list');
  }, `localStorage.getItem('rpm-clarity:today-layout') === 'list' && !document.querySelector('.spine-card') && !!document.querySelector('.agenda')`,
  'Show list swaps the day spine for the list layout');
  const slots = data => data?.entries.filter(e => e.planned).map(e => e.id + e.planned).join();
  if (await shown('.gap-card .next-action', 2000)) await step('gap-schedule-at', () => b.tap('.gap-card .next-action'), changed(slots));
  else k.check(null, 'gap-schedule-at: not run, because no free gap fits a due task at this hour, so Today shows no Schedule at card');
  await look('week-line-review', async () => {
    await tab('Today');
    await tapShown('button.week-line');
  }, `!!document.querySelector('.wr-icon-btn[aria-label="Close review"]')`, 'the week line opens the weekly review');
  await tapShown('.wr-icon-btn[aria-label="Close review"]').catch(() => closeAll());
  await look('today-day', async () => {
    await tapShown('.date-button');
    await tapText('.sheet .list-btn', 'Show day');
  }, `localStorage.getItem('rpm-clarity:today-layout') !== 'list' && !!document.querySelector('.spine-card')`, 'Show day brings the day spine back');

  const planned = `Drive gap plan ${stamp}`;
  await step('free-time-plan', async () => {
    await tab('Today');
    await tapShown('.date-button');
    await shown('.sheet input[type=date]');
    await b.js(`(() => { const input = document.querySelector('.sheet input[type=date]'); input.value = ${q(dayFrom(1))}; return true; })()`);
    await tapText('.sheet button.filled-btn', 'Go');
    await tapShown('.spine-action[aria-label^="Plan something"]');
    await shown('textarea.quick-input');
    await b.type('textarea.quick-input', planned);
    await b.key('Enter');
  }, data => !!task(data, planned)?.planned);
  await closeSheet();
  await tapText('.date-line button', 'Today').catch(() => {});
}

export async function todayGestures(k) {
  const {b, step, tab, mark, task} = k;
  await tab('Today');
  const card = `article.spine-card`;
  await step('knurl-length', async () => {
    await mark(card, BANK, '.spine-knurl');
    const r = await b.box('[data-drive]');
    await b.drag({x: r.x + r.width / 2, y: r.y + r.height / 2}, [[0, 10], [0, 40]], {steps: 10});
  }, (data, before) => task(data, BANK).minutes !== task(before, BANK).minutes);

  await step('drag-to-time', async () => {
    await mark(card, BANK);
    const r = await b.box('[data-drive]');
    await b.drag({x: r.x + r.width / 2, y: r.y + 12}, [[0, 4], [0, 60]], {hold: 320, steps: 14});
  }, (data, before) => q(task(data, BANK).planned) !== q(task(before, BANK).planned));
}
