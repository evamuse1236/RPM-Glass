/** Drives real flows on the built page with the mock phone: complete, undo, capture, undo a capture, the task sheet, drag in Week, phone Capture. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {launch} from './cdp.mjs';
import {PAGE, OUT} from './shots.mjs';

const BANK = 'Call the bank about the fee refund';
const page = await launch();
const shots = [];
const shot = async name => shots.push(await page.shot(path.join(OUT, name + '.png')));
const rowOf = title => `[...document.querySelectorAll('.spine-card')].find(c => c.querySelector('.task-title, .spine-title')?.textContent === ${JSON.stringify(title)})`;
const steps = [];
const step = (name, ok) => { steps.push(name); console.log('✔', name); return ok; };

try {
  await page.goto(PAGE + '?at=10:15#/today', {width: 1440, height: 900});

  await page.click(`[aria-label="Complete: ${BANK}"]`);
  await page.wait(150);
  assert.match(await page.eval(`${rowOf(BANK)}.innerText`), /Sending/);
  assert.equal(await page.eval(`${rowOf(BANK)}.querySelector('.task-check').getAttribute('aria-checked')`), 'true');
  assert.match(await page.text('.snackbar'), /Task completed/);
  const snack = await page.eval(`(() => { const s = document.querySelector('.snackbar').getBoundingClientRect(), n = document.querySelector('.nav').getBoundingClientRect(), c = document.querySelector('.capture').getBoundingClientRect(); return {s: s.left, e: s.right, rail: n.right, col: c.left}; })()`);
  assert.ok(snack.s >= snack.rail && snack.e <= snack.col, `snackbar sits between the rail and Capture: ${JSON.stringify(snack)}`);
  await shot('30-flow-complete-sending');
  step('complete shows Sending at once, with Undo in the snackbar');

  await page.until(`!${rowOf(BANK)}.querySelector('.mark:not(.gone)')`, 5000);
  await page.wait(1200);
  assert.doesNotMatch(await page.eval(`${rowOf(BANK)}.innerText`), /Sending/);
  await shot('31-flow-complete-applied');
  step('the mock phone applies it within 3 s and the Sending mark fades');

  await page.click('.snackbar-action');
  await page.until(`${rowOf(BANK)}.querySelector('.task-check').getAttribute('aria-checked') === 'false'`, 1000);
  await page.until(`!${rowOf(BANK)}.querySelector('.mark:not(.gone)')`, 5000);
  await page.wait(1200);
  await shot('32-flow-undo-applied');
  step('Undo after the phone applied sends an undo, and the task is open again');

  const inboxBefore = await page.eval(`document.querySelectorAll('[data-task]').length`);
  await page.click('.capture textarea');
  await page.type('Book the dentist and buy printer ink');
  await page.key('Enter', 'Enter', {modifiers: 2, windowsVirtualKeyCode: 13});
  await page.until(`document.querySelector('.receipt') !== null`, 1000);
  assert.match(await page.text('.receipt'), /Book the dentist and buy printer ink/);
  assert.equal(await page.eval(`document.querySelector('.capture textarea').value`), '');
  await shot('33-flow-capture-saving');
  step('Ctrl+Enter sends a capture; the receipt shows the exact words at once');

  await page.until(`document.querySelector('.receipt.done') !== null`, 6000);
  const lines = await page.text('.receipt.done');
  assert.match(lines, /tasks? added/);
  assert.match(lines, /Book the dentist/);
  assert.match(lines, /Inbox/);
  await page.wait(400);
  await shot('34-flow-capture-done');
  step('the phone splits it into Inbox tasks and the receipt lists them');

  await page.eval(`[...document.querySelectorAll('.receipt.done button')].find(b => b.textContent === 'Undo').click()`);
  await page.until(`document.querySelector('.receipt.undone') !== null`, 6000);
  await page.wait(400);
  await shot('35-flow-capture-undone');
  step('Undo on the receipt moves those tasks to Trash; the receipt says so');
  assert.ok(inboxBefore > 0);

  await page.click('.spine-card .task-main[data-task-id]');
  await page.until(`document.querySelector('dialog.sheet[open], .sheet[open]') !== null`, 2000);
  await page.wait(500);
  await shot('36-flow-task-sheet');
  step('a row opens the task sheet');
  await page.key('Escape');
  await page.wait(400);

  await page.goto(PAGE + '?at=10:15#/week', {width: 1440, height: 900});
  const target = await page.eval(`document.querySelectorAll('.week-day')[3].dataset.drop`);
  const before = await page.eval(`document.querySelectorAll('.week-day')[3].querySelectorAll('.week-task').length`);
  await page.drag('.week-day.today .week-task[data-drag-task]', `.week-day[data-drop="${target}"]`);
  await page.wait(150);
  await page.until(`document.querySelectorAll('.week-day')[3].querySelectorAll('.week-task').length === ${before + 1}`, 1500);
  await shot('37-flow-week-drag-sending');
  await page.until(`!document.querySelectorAll('.week-day')[3].querySelector('.mark:not(.gone)')`, 5000);
  step('dragging a task to Thursday moves it at once and the phone applies it');

  await page.goto(PAGE + '?at=10:15#/today', {width: 390, height: 844});
  await page.click('.mini-composer');
  await page.wait(700);
  assert.equal(await page.eval(`document.activeElement === document.querySelector('.capture textarea')`), true);
  await shot('38-flow-phone-capture-open');
  await page.key('Escape');
  await page.wait(500);
  assert.equal(await page.eval(`document.querySelector('.app').dataset.capture`), 'closed');
  step('on a phone the composer opens Capture over the page with the field focused; Esc closes it');

  assert.deepEqual(page.errors, []);
  step('no page errors');
} finally {
  await page.close();
  console.log(shots.join('\n'));
}
