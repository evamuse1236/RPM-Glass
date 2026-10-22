import {sleep} from './cdp.mjs';
import {BANK, CARD, dayKey} from './drive-kit.mjs';

const SWIPE_DONE = 'Finish my section of the critical review';
const SWIPE_LATER = 'Group call: merge sections';
const HELD = 'Buy a new notebook for RM';
const MOVED = 'Ask the group which district we picked';

export async function startNow(k) {
  const {step, openTask, tapShown, task, closeSheet} = k;
  await step('start-now', async () => {
    await openTask(BANK);
    await tapShown('.task-start');
  }, data => Math.abs(Date.parse(task(data, BANK).planned) - Date.now()) < 5 * 60000);
  await closeSheet();
}

export async function tasks(k) {
  const {b, step, look, stamp, task, openTask, tapShown, tapText, shown, fill, menu, hold, swipe, closeSheet, closeAll, changed} = k;
  await step('task-sheet-alert', async () => {
    await openTask(BANK);
    await b.tap('#task-tab-alert');
    await tapShown('.alert-kind[data-value=reminder]');
  }, data => task(data, BANK).alertIntent?.type === 'reminder');
  let block = 'block-2';
  await step('task-sheet-block', async () => {
    block = task(k.readPhone(), BANK).blockId === 'block-2' ? 'block-1' : 'block-2';
    await b.tap('#task-tab-block');
    await tapShown(`.block-choice[data-value=${block}]`);
  }, data => task(data, BANK).blockId === block);
  await step('task-sheet-repeat', async () => {
    await b.tap('#task-tab-repeat');
    await tapShown(`.repeat-day[data-value="${new Date().getDay()}"]`);
  }, changed(data => task(data, BANK).recurrence));
  await look('ask-capture', () => tapText('.tool-btn', 'Ask Capture'), `!!document.querySelector('#capture-text')?.getClientRects().length`,
    'Ask Capture in the task sheet opens Capture');
  await closeAll();

  await openTask(BANK);
  await sleep(800);
  await step('delete-task', () => tapText('.sheet .tool-btn.danger', 'Delete'), data => task(data, BANK).archived === true);
  await closeSheet();
  await step('trash-restore', async () => {
    await menu('Trash');
    await tapText('.list-item', BANK, 'button.text-btn');
  }, data => task(data, BANK).archived === false);
  await closeAll();

  const tomorrow = dayKey(new Date(Date.now() + 86400000));
  await step('task-sheet-when', async () => {
    await openTask(CARD);
    await tapShown(`.when-day[data-value="${tomorrow}"]`);
  }, changed(data => [task(data, CARD).plannedDate, task(data, CARD).planned]));
  await closeAll();

  const added = `Drive inbox add ${stamp}`;
  await step('inbox-add', async () => {
    await menu('Inbox');
    await tapText('.sheet button', 'Add task');
    await shown('textarea.quick-input');
    await b.type('textarea.quick-input', added);
    await b.key('Enter');
  }, data => !!task(data, added) && !task(data, added).blockId);
  await closeAll();
  const renamed = `Drive renamed task ${stamp}`;
  const openInbox = async title => {
    await menu('Inbox');
    await tapText('.sheet .task-row', title, '.task-title');
    if (!await shown('#task-tab-when')) throw new Error(`the task sheet for “${title}” did not open from the Inbox`);
  };
  await step('task-must', async () => {
    await openInbox(added);
    await tapShown('.sheet .must-star');
  }, data => task(data, added)?.must === true);
  const notes = `Drive notes ${stamp}`;
  await step('task-notes', () => fill('.sheet textarea[aria-label="Notes"]', notes), data => task(data, added)?.notes === notes);
  await step('task-title', () => fill('.sheet textarea.task-title-field', renamed), data => !!task(data, renamed));
  const copies = (data, title) => data.entries.filter(e => e.title === title && !e.archived).length;
  await step('task-duplicate', () => tapText('.tool-btn', 'Duplicate'), (data, before) => copies(data, renamed) > copies(before, renamed));
  await closeAll();
  await step('task-archive', async () => {
    await openInbox(renamed);
    await sleep(600);
    await tapText('.sheet .tool-btn', 'Archive');
  },
    data => data.entries.some(e => e.title === renamed && e.archived && e.archiveDisposition === 'archive'));
  await closeAll();

  await step('swipe-complete', async () => {
    await k.tab('Today');
    await swipe('article.spine-card', SWIPE_DONE, 160);
  }, data => task(data, SWIPE_DONE).done === true);
  await step('swipe-schedule', async () => {
    await k.tab('Today');
    await swipe('article.spine-card', SWIPE_LATER, -160);
    await shown('.schedule-menu .schedule-item');
    await tapShown('.schedule-menu .schedule-item[aria-checked=false]');
  }, changed(data => [task(data, SWIPE_LATER).planned, task(data, SWIPE_LATER).plannedDate]));
  await closeAll();

  await step('hold-menu-must', async () => {
    await menu('Inbox');
    await hold('.sheet .task-row', HELD, 600);
    await tapText('.menu-item', 'Must');
  }, changed(data => task(data, HELD).must === true));
  await closeAll();
  await step('inbox-move-to-block', async () => {
    await menu('Inbox');
    await hold('.sheet .task-row', MOVED, 600);
    await tapText('.menu-item', 'Move to Block');
    await tapText('.sheet .choice-row', k.planner(k.readPhone()).blocks.find(x => x.id === 'block-2').title);
  }, data => task(data, MOVED).blockId === 'block-2');
  await closeAll();
  await sleep(300);
}
