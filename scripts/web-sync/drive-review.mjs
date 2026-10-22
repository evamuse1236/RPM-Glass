import {sleep} from './cdp.mjs';
import {q} from './drive-kit.mjs';

const verdicts = data => Object.values(data?.planner?.weeks ?? {}).reduce((n, w) => n + Object.keys(w.verdicts ?? {}).length, 0);
const reviews = data => data?.planner?.reviews ?? {};
const finished = data => Object.values(reviews(data)).filter(r => r.finishedAt).length;
const drafts = data => q(Object.values(reviews(data)).map(r => r.focusDraft ?? null));
const visible = selector => `[...document.querySelectorAll(${q(selector)})].filter(n => n.getClientRects().length)`;
const labelOf = (b, selector) => b.js(`${visible(selector)}[0]?.getAttribute('aria-label') ?? ''`);

export async function review(k) {
  const {b, step, look, stamp, task, tab, menu, tapShown, tapText, shown, closeAll, check, changed} = k;
  const open = async () => {
    await tab('Today');
    await menu('Weekly review');
    if (!await shown('.wr-icon-btn[aria-label="Close review"]')) throw new Error('the weekly review did not open');
  };
  const goStep = async n => { await tapShown(`.wr-step[aria-label^="Step ${n} of"]`); await sleep(500); };

  await step('review-verdict', async () => {
    await open();
    await goStep(1);
    await tapText('.wr-deck-verdict', 'Achieved');
  }, (data, before) => verdicts(data) > verdicts(before));
  for (let i = 0; i < 8 && await shown('.wr-deck-verdict', 2500); i++) {
    await tapText('.wr-deck-verdict', 'Not yet').catch(() => {});
    await sleep(900);
  }

  const choiceOf = (data, title) => task(data, title)?.reviewChoice?.choice;
  for (const choice of ['Carry', 'Defer', 'Drop']) {
    const group = '[role=radiogroup][aria-label^="What to do with"]';
    const label = await labelOf(b, group);
    const title = label.replace(/^What to do with "/, '').replace(/"$/, '');
    if (!title) { check(false, `review-${choice.toLowerCase()}: no unfinished task row in step 1`); continue; }
    await step(`review-${choice.toLowerCase()}`, () => tapText(`${group}[aria-label=${q(label)}] [role=radio]`, choice),
      data => choiceOf(data, title) === choice.toLowerCase());
  }

  const added = `Drive review inbox ${stamp}`;
  await step('review-inbox-add', async () => {
    await goStep(2);
    await shown('.wr-add-input');
    await b.type('.wr-add-input', added);
    await b.key('Enter');
  }, data => !!task(data, added) && !task(data, added).blockId);

  let sorted = '';
  await step('review-sort', async () => {
    await goStep(3);
    const add = '[aria-label="Inbox tasks to sort"] button[aria-label^="Add \\""]';
    if (await shown(add, 2500)) {
      const label = await labelOf(b, add);
      sorted = label.match(/^Add "(.*)" to /)[1];
      await tapText('button', label);
      return;
    }
    const choose = '[aria-label="Inbox tasks to sort"] button[aria-label^="Choose a Result for"]';
    const label = await labelOf(b, choose);
    sorted = label.match(/"(.*)"$/)[1];
    await tapText('button', label);
    await shown('.wr-picker button');
    await b.tap('.wr-picker button:not(.wr-btn-text)');
  }, data => !!task(data, sorted)?.blockId);

  await step('review-pick', async () => {
    await goStep(4);
    await tapShown('[aria-label^="Pick \\""][aria-checked=false], [aria-label^="Pick \\""]:not([aria-checked=true])');
  }, changed(drafts));
  let must = '';
  await step('review-must', async () => {
    const row = '.wr-must-row[role=switch]';
    const results = await b.js(`${visible('.wr-result-main')}.length`);
    for (let i = 0; i < results && !await shown(row, 800); i++) {
      await b.js(`(() => { const n = ${visible('.wr-result-main')}[${i}]; n.dataset.drive = 'open'; return true; })()`);
      await b.tap('[data-drive=open]');
      await b.js(`document.querySelector('[data-drive=open]')?.removeAttribute('data-drive'); true`);
    }
    if (!await shown(row, 2500)) throw new Error('no Result in step 4 has an open task to mark Must');
    must = (await labelOf(b, row)).replace(/^[^:]*: /, '');
    await b.tap(row);
  }, (data, before) => task(data, must)?.must !== task(before, must)?.must);
  await step('review-finish', () => tapShown('.wr-next'), (data, before) => finished(data) > finished(before));
  await look('review-done', async () => {}, `!document.querySelector('.wr-icon-btn[aria-label="Close review"]') || /finished|for this week/i.test(document.body.textContent)`,
    'Finish closes the review with this week’s Results');
  await closeAll();
}
