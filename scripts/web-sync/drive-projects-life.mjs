import {sleep} from './cdp.mjs';
import {q} from './drive-kit.mjs';

const WHEEL = {size: 240, inner: 24, outer: 112};
const selected = name => `[...document.querySelectorAll('.tabs [role=tab]')].some(n => n.textContent.includes(${q(name)}) && n.getAttribute('aria-selected') === 'true')`;
const periodLabel = `document.querySelector('.period-switch h2')?.textContent ?? ''`;

async function projects(k) {
  const {step, look, stamp, planner, tab, tapShown, tapText, shown, edit, fill, menu, closeAll} = k;
  await look('area-filter', async () => {
    await tab('Projects');
    await tapShown('button.filter-chip.dropdown');
    await tapText('.menu-item', 'Studies');
  }, `document.querySelector('button.filter-chip.dropdown')?.getAttribute('aria-label') === 'Area: Studies'
    && !!document.querySelector('.project-card[data-project-id=project-1]') && !document.querySelector('.project-card[data-project-id=project-3]')`,
  'the Area filter shows only that Area’s Projects');
  await tapShown('button.filter-chip.dropdown').then(() => tapText('.menu-item', 'All areas')).catch(() => {});
  await sleep(300);
  await look('project-expand', () => tapShown('.project-card[data-project-id=project-1] .project-toggle'),
    `document.querySelector('.project-card[data-project-id=project-1] .project-toggle')?.getAttribute('aria-expanded') === 'true'
    && !!document.querySelector('.project-card[data-project-id=project-1] .project-blocks')?.getClientRects().length`,
  'a tap on a Project card shows its Blocks');

  const name = `Drive project ${stamp}`;
  const mine = data => planner(data).projects.find(p => p.title === name);
  await step('new-project', async () => {
    await tab('Projects');
    await tapShown('.fab[aria-label="New Project"]');
  }, (data, before) => planner(data).projects.length > planner(before).projects.length);
  await step('project-title', () => edit('span.inline-edit.title-edit', name), data => !!mine(data));
  const purpose = `So the drive has a home ${stamp}`;
  await step('project-purpose', async () => {
    await tapShown('span.inline-edit.purpose-text');
    await fill('span.inline-edit.purpose-text', purpose);
  }, data => q(mine(data)).includes(purpose));
  await step('link-goal', async () => {
    await tapText('button.crumb', 'Link a Goal');
    await tapText('.menu-item', 'Run three mornings a week');
  }, data => mine(data)?.goalId === 'goal-2');
  const blocksOf = data => planner(data).blocks.filter(x => x.projectId && x.projectId === mine(data)?.id).length;
  await step('add-block', () => tapText('button.outlined-btn.wide', 'Add Block'), (data, before) => blocksOf(data) > blocksOf(before));
  await closeAll();
  await step('delete-project', async () => {
    await tab('Projects');
    await tapShown(`.project-open[aria-label=${q(`Open ${name}`)}]`);
    await shown('span.inline-edit.title-edit');
    await menu('Delete');
    await tapText('button.filled-btn.danger', 'Delete');
  }, data => !mine(data));
  await closeAll();
}

async function life(k) {
  const {b, step, look, stamp, planner, readPhone, tab, tapShown, tapText, shown, fill, closeAll} = k;
  await look('life-tabs', async () => {
    await tab('Life');
    await tapText('.tabs [role=tab]', 'Quarter');
  }, `${selected('Quarter')} && /Quarter \\d/.test(${periodLabel})`, 'the Quarter tab shows this quarter’s Goals');
  await look('life-period', async () => {
    await b.js(`window.__drivePeriod = ${periodLabel}; true`);
    await tapShown('.period-switch [aria-label="Next period"]');
  }, `!!(${periodLabel}) && (${periodLabel}) !== window.__drivePeriod`, 'Next period moves to the next quarter');
  await tapShown('.period-switch [aria-label="Previous period"]').catch(() => {});
  await look('life-month', () => tapText('.tabs [role=tab]', 'Month'), `${selected('Month')} && !!(${periodLabel})`, 'the Month tab shows this month');

  const values = `Honesty, rest, family ${stamp}`;
  await step('edit-values', async () => {
    await tapText('.tabs [role=tab]', 'Values');
    await tapText('.values-card button', 'Edit values');
    await shown('.sheet label.text-field textarea');
    await k.mark('.sheet label.text-field', 'Core values', 'textarea');
    await fill('[data-drive]', values);
    await tapText('button.filled-btn', 'Save');
  }, data => planner(data).context?.coreValues === values);
  await closeAll();

  await look('area-detail', async () => {
    await tab('Life');
    await tapText('.tabs [role=tab]', 'Vision');
    await tapShown('button.wheel-area[aria-label^="Studies"]');
  }, `!!document.querySelector('input.rating-slider[aria-label^="Studies"]')`, 'a tap on an Area chip opens that Area');
  await closeAll();

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
  await look('goal-detail', () => tapText('.list-item', 'Run three mornings a week'), `!!document.querySelector('.goal-when-chip')?.getClientRects().length`,
    'a tap on a Goal opens the Goal');
  await closeAll();

  await step('wheel-drag', async () => {
    await tab('Life');
    await tapText('.tabs [role=tab]', 'Vision');
    const now = health(readPhone()).rating ?? 0;
    const target = now >= 6 ? 3 : 9;
    const r = await b.box('svg.wheel-svg');
    const unit = r.width / WHEEL.size;
    const at = rating => {
      const d = (WHEEL.inner + (WHEEL.outer - WHEEL.inner) * rating / 10) * unit;
      return {x: r.x + r.width / 2 + d * Math.SQRT1_2, y: r.y + r.height / 2 + d * Math.SQRT1_2};
    };
    const from = at(now || 5), to = at(target);
    await b.drag(from, [[to.x - from.x, to.y - from.y]], {steps: 12});
  }, (data, before) => health(data).rating !== health(before).rating);
}

export async function projectsLife(k) {
  await projects(k);
  await life(k);
}
