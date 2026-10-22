import {readFileSync} from 'node:fs';
import {sleep} from './cdp.mjs';

const q = JSON.stringify;
const PAGE_WORDS = `(document.getElementById('notes')?.textContent ?? '')`;
const WAITING = `/waiting for your phone/i.test(${PAGE_WORDS}) || !!document.querySelector('[data-sync=waiting]')`;
const SETTLED = `!/waiting for your phone/i.test(${PAGE_WORDS}) && !document.querySelector('[data-sync]')
  && !(JSON.parse(localStorage.getItem('rpm.web.plan.v1') || '{}').records ?? []).length`;
const BANK = 'Call the bank about the fee refund';
const CARD = 'Buy a birthday card for Amma';
const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Drives each planner change in the browser and confirms the stand-in phone saved it. */
export async function runChecks({b, check, state, site}) {
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  const readPhone = () => {
    for (let i = 0; i < 5; i++) { try { return JSON.parse(readFileSync(state, 'utf8')).data; } catch {} }
    return null;
  };
  const task = (data, title) => data?.entries.find(e => e.title === title);
  const planner = data => data?.planner ?? {};

  const mark = async (selector, text, inner) => {
    const found = await b.js(`(() => {
      document.querySelectorAll('[data-drive]').forEach(n => n.removeAttribute('data-drive'));
      const words = n => n.textContent + ' ' + (n.getAttribute('aria-label') ?? '');
      let node = [...document.querySelectorAll(${q(selector)})].find(n => n.getClientRects().length && words(n).includes(${q(text)}));
      if (node && ${q(inner ?? null)}) node = node.querySelector(${q(inner ?? '*')});
      if (!node) return false;
      node.setAttribute('data-drive', '');
      return true; })()`);
    if (!found) throw new Error(`nothing matches ${selector} with “${text}”${inner ? ` ${inner}` : ''}`);
  };
  const tapText = async (selector, text, inner) => { await mark(selector, text, inner); await b.tap('[data-drive]'); };
  const shown = (selector, timeout = 6000) => b.until(`[...document.querySelectorAll(${q(selector)})].some(n => n.getClientRects().length)`, timeout);
  const tapShown = async selector => {
    if (!await shown(selector)) throw new Error(`${selector} did not appear`);
    await b.tap(selector);
  };
  const edit = async (selector, text) => {
    await tapShown(selector);
    await b.js(`(() => { const node = document.querySelector(${q(selector)}); node.focus();
      if (node.select) node.select(); else getSelection().selectAllChildren(node); return true; })()`);
    await b.cdp('Input.insertText', {text});
    await b.key('Enter');
  };
  const tab = async name => { await tapText('#nav-bar .nav-item', name); await sleep(500); };
  const menu = async item => { await tapShown('.top-bar [aria-label="More options"]'); await tapText('.menu-item', item); await sleep(600); };
  const closeSheet = async () => { await b.key('Escape'); await sleep(500); };
  const openTask = async title => {
    await tab('Today');
    const timed = `.spine-open[aria-label^=${q(title)}]`;
    if (await shown(timed, 1500)) await b.tap(timed);
    else await tapText('.spine-chip', title);
    if (!await shown('#task-tab-when')) throw new Error(`the task sheet for “${title}” did not open`);
  };

  async function step(name, act, applied) {
    try {
      const before = readPhone();
      await act();
      const waited = await b.until(WAITING, 4000);
      if (waited) await b.capture(`${name}-waiting`);
      check(waited, `${name}: the page says it is waiting for the phone`);
      let ok = false;
      for (const end = Date.now() + 45000; !ok && Date.now() < end; await sleep(400)) {
        try { ok = !!applied(readPhone(), before); } catch {}
      }
      check(ok, `${name}: the phone saved it`);
      check(await b.until(SETTLED, 30000), `${name}: the page shows it saved, nothing left waiting`);
      await b.capture(`${name}-saved`);
    } catch (error) {
      check(false, `${name}: ${error.message}`);
      await b.capture(`${name}-failed`).catch(() => {});
      await closeSheet().catch(() => {});
    }
  }

  await b.viewport(412, 915);
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

  await step('task-sheet-alert', async () => {
    await openTask(BANK);
    await b.tap('#task-tab-alert');
    await tapShown('.alert-kind[data-value=reminder]');
  }, data => task(data, BANK).alertIntent?.type === 'reminder');
  await step('task-sheet-block', async () => {
    await b.tap('#task-tab-block');
    await tapShown('.block-choice[data-value=block-1]');
  }, data => task(data, BANK).blockId === 'block-1');
  await step('task-sheet-repeat', async () => {
    await b.tap('#task-tab-repeat');
    await tapShown(`.repeat-day[data-value="${new Date().getDay()}"]`);
  }, (data, before) => q(task(data, BANK).recurrence ?? null) !== q(task(before, BANK).recurrence ?? null));
  await b.capture('task-sheet-412');
  await step('delete-task', () => b.tap('.tool-btn.danger'), data => task(data, BANK).archived === true);
  await closeSheet();

  await step('trash-restore', async () => {
    await menu('Trash');
    await tapText('.list-item', BANK, 'button.text-btn');
  }, data => task(data, BANK).archived === false);
  await closeSheet();

  const tomorrow = dayKey(new Date(Date.now() + 86400000));
  await step('task-sheet-when', async () => {
    await openTask(CARD);
    await tapShown(`.when-day[data-value="${tomorrow}"]`);
  }, (data, before) => {
    const now = task(data, CARD), was = task(before, CARD);
    return now.plannedDate !== was.plannedDate || q(now.planned) !== q(was.planned);
  });
  await closeSheet();

  const glasses = data => planner(data).body?.water?.glasses?.length ?? 0;
  await step('water-glass', async () => {
    await b.cdp('Page.navigate', {url: 'about:blank'});
    await sleep(300);
    await b.cdp('Page.navigate', {url: `${site}#open=${encodeURIComponent(q({view: 'water'}))}`});
    if (!await shown('.sheet-water .filled-btn')) throw new Error('the Water sheet did not open');
    await sleep(800);
    await b.tap('.sheet-water .filled-btn');
  }, (data, before) => glasses(data) > glasses(before));
  await closeSheet();

  await step('meal-log', async () => {
    await tab('Today');
    await tapShown('.spine-row[data-key="meal:lunch"] .spine-open');
    await tapText('.sheet .slot-chips .choice-chip', 'Lunch');
    await edit('.sheet input', 'Dal and rice');
  }, data => (planner(data).body?.meals ?? []).some(m => m.slot === 'lunch'));
  await closeSheet();

  await b.viewport(1280, 800);
  await tab('Today');
  await b.capture('today-1280');
  await openTask(BANK);
  await b.capture('task-sheet-1280');
  await closeSheet();

  const block = data => planner(data).blocks.find(x => x.id === 'block-1');
  const result = `RM critical review drafted and sent ${stamp}`;
  await step('block-result', async () => {
    await tab('Blocks');
    await tapShown('.block-card[data-block-id=block-1] .card-main');
    await edit('span.inline-edit.title-edit', result);
  }, data => q(block(data)).includes(result));
  const purpose = `So Sunday stays calm ${stamp}`;
  await step('block-purpose', () => edit('span.inline-edit.purpose-text', purpose), data => q(block(data)).includes(purpose));
  await closeSheet();

  const project = `Drive project ${stamp}`;
  await step('new-project', async () => {
    await tab('Projects');
    await tapShown('.fab[aria-label="New Project"]');
  }, (data, before) => planner(data).projects.length > planner(before).projects.length);
  await step('project-title', () => edit('span.inline-edit.title-edit', project), data => planner(data).projects.some(p => q(p).includes(project)));
  await closeSheet();

  const health = data => planner(data).areas.find(a => a.id === 'area-2');
  let rating = 7;
  await step('life-rating', async () => {
    rating = health(readPhone()).rating === 7 ? 6 : 7;
    await tab('Life');
    await tapShown('button.wheel-area[aria-label^="Health"]');
    await shown('input.rating-slider');
    await b.js(`(() => { const s = document.querySelector('input.rating-slider'); s.value = ${rating};
      s.dispatchEvent(new Event('input', {bubbles: true})); s.dispatchEvent(new Event('change', {bubbles: true})); return true; })()`);
  }, data => health(data).rating === rating);

  const verdicts = data => Object.values(planner(data).weeks ?? {}).reduce((n, w) => n + Object.keys(w.verdicts ?? {}).length, 0);
  await step('review-verdict', async () => {
    await tab('Today');
    await menu('Weekly review');
    await shown('.wr-deck-verdict', 8000);
    await tapText('.wr-deck-verdict', 'Achieved');
  }, (data, before) => verdicts(data) > verdicts(before));
  await tapShown('.wr-icon-btn[aria-label="Close review"]').catch(() => closeSheet());

  try {
    await tab('Today');
    await tapShown('.top-bar [aria-label="Search"]');
    await b.type('input.search-input', 'bank');
    check(await b.until(`document.querySelector('.search-results')?.textContent.includes(${q('Call the bank')})`, 6000), 'search: typing “bank” finds the bank task');
    await b.capture('search');
    await tapShown('[aria-label="Back"]');
  } catch (error) { check(false, `search: ${error.message}`); }

  const words = `Drive capture ${stamp} book the dentist`;
  await step('capture', async () => {
    await tapShown('.top-bar [aria-label="Capture"]');
    await shown('#capture-text');
    await b.type('#capture-text', words);
    await b.js(`document.getElementById('capture-form').requestSubmit(); true`);
  }, data => data.entries.some(e => (e.title ?? '').includes(words)));

  await b.viewport(412, 915);
  for (const name of ['Blocks', 'Projects', 'Life']) {
    await tab(name).catch(error => check(false, `${name} tab: ${error.message}`));
    await b.capture(`${name.toLowerCase()}-412`);
  }
}
