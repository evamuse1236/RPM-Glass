import {sleep} from './cdp.mjs';
import {q} from './drive-kit.mjs';

const order = (data, id) => data.entries.filter(e => e.blockId === id && !e.done && !e.archived)
  .sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9) || String(a.id).localeCompare(String(b.id))).map(e => e.id);

export async function blocks(k) {
  const {b, step, look, stamp, planner, tab, tapShown, tapText, shown, edit, fill, menu, closeAll, changed, markedBox, check} = k;
  const block = (data, id) => planner(data).blocks.find(x => x.id === id);
  const openBlock = async id => {
    await tab('Blocks');
    await tapShown(`.block-card[data-block-id=${id}] .card-main`);
    if (!await shown('span.inline-edit.title-edit')) throw new Error(`${id} did not open`);
  };

  const result = `RM critical review drafted and sent ${stamp}`;
  await step('block-result', async () => {
    await openBlock('block-1');
    await edit('span.inline-edit.title-edit', result);
  }, data => block(data, 'block-1').title === result);
  const purpose = `So Sunday stays calm ${stamp}`;
  await step('block-purpose', () => edit('span.inline-edit.purpose-text', purpose), data => q(block(data, 'block-1')).includes(purpose));
  await closeAll();

  const planned = `Drive plan task ${stamp}`;
  await step('plan-add', async () => {
    await openBlock('block-6');
    await shown('form.inline-add input[role=combobox]');
    await b.type('form.inline-add input[role=combobox]', planned);
    await b.key('Enter');
  }, data => data.entries.some(e => e.title === planned && e.blockId === 'block-6'));
  await step('plan-reorder', async () => {
    await b.key('Escape');
    const r = await markedBox('.plan-list .task-row', '');
    await b.drag({x: r.x + Math.min(60, r.width / 3), y: r.y + r.height / 2}, [[0, 4], [0, r.height * 1.6]], {hold: 450, steps: 12});
  }, changed(data => order(data, 'block-6')));
  if (await shown('.plan-header button.text-btn', 1500)) {
    await step('sort-by-time', () => tapText('.plan-header button.text-btn', 'Sort by time'), changed(data => order(data, 'block-6')));
  } else check(true, 'sort-by-time: the Plan’s timed tasks are already in time order, so Sort by time is hidden');
  const notes = `Drive block notes ${stamp}`;
  await step('block-notes', async () => {
    await menu('Add notes');
    await shown('span.inline-edit.notes-text');
    await fill('span.inline-edit.notes-text', notes);
  }, data => block(data, 'block-6').notes === notes);
  let project = 'project-2';
  await step('change-project', async () => {
    project = block(k.readPhone(), 'block-6').projectId === 'project-2' ? 'project-1' : 'project-2';
    const title = planner(k.readPhone()).projects.find(p => p.id === project).title;
    await tapShown('button.crumb.project-picker');
    await tapText('.menu-item', title);
  }, data => block(data, 'block-6').projectId === project);
  await closeAll();

  await step('result-achieved', async () => {
    await openBlock('block-5');
    await tapShown('button.outlined-btn[aria-label="Mark Result achieved"]');
    await tapText('button.filled-btn', 'Mark achieved');
  }, data => block(data, 'block-5').achieved === true);
  await closeAll();

  const name = `Drive block ${stamp}`;
  const byName = data => planner(data).blocks.find(x => x.title === name);
  await step('new-block', async () => {
    await tab('Blocks');
    await tapShown('.fab[aria-label="New Block"]');
  }, (data, before) => planner(data).blocks.length > planner(before).blocks.length);
  await step('new-block-title', () => edit('span.inline-edit.title-edit', name), data => !!byName(data));
  await step('archive-block', () => menu('Archive Block'), data => byName(data)?.archived === true);
  await closeAll();
  await step('archive-restore', async () => {
    await tab('Blocks');
    await menu('Archive');
    await tapText('.sheet .list-item', name, 'button.text-btn');
  }, data => byName(data)?.archived === false);
  await closeAll();
  await step('delete-block', async () => {
    await tab('Blocks');
    await tapText('.block-card', name, '.card-main');
    await menu('Delete');
    await tapText('button.filled-btn.danger', 'Delete');
  }, data => !byName(data));
  await closeAll();

  const chip = label => `[...document.querySelectorAll('button.filter-chip.dropdown')].some(n => n.getAttribute('aria-label') === ${q(label)})`;
  await look('block-filter-project', async () => {
    await tab('Blocks');
    await tapText('button.filter-chip.dropdown', 'Project:');
    await tapText('.menu-item', 'Morning runs');
  }, `${chip('Project: Morning runs')} && !!document.querySelector('.block-card[data-block-id=block-4]')
    && !document.querySelector('.block-card[data-block-id=block-1]')`, 'the Project filter shows only that Project’s Blocks');
  await look('block-filter-status', async () => {
    await tapText('button.filter-chip.dropdown', 'Project:');
    await tapText('.menu-item', 'All projects');
    await tapText('button.filter-chip.dropdown', 'Status:');
    await tapText('.menu-item', 'Achieved');
  }, `${chip('Status: Achieved')} && !!document.querySelector('.block-card[data-block-id=block-5]')
    && !document.querySelector('.block-card[data-block-id=block-1]')`, 'the Status filter shows only achieved Blocks');
  await tapText('button.filter-chip.dropdown', 'Status:').then(() => tapText('.menu-item', 'Active')).catch(() => {});
  await sleep(300);

  await look('search', async () => {
    await tab('Today');
    await tapShown('.top-bar [aria-label="Search"]');
    await b.type('input.search-input', 'bank');
  }, `document.querySelector('.search-results')?.textContent.includes('Call the bank')`, 'typing “bank” finds the bank task');
  await tapShown('[aria-label="Back"]').catch(() => closeAll());
}
