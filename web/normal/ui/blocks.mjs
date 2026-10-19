/** Blocks: filter by Area or Project, the Result cards, and the chosen Block's plan. */
import {h, icon, iconButton, emptyState, swap} from './dom.mjs';
import {taskRow, sectionHeader} from './rows.mjs';
import {blockList, blockPlan, inboxTasks, findTasks, areaOf, toneOf, blockFacts} from '../core/model.mjs';
import {plural} from '../../../android-companion/planner/format.mjs';

const dot = (tone, cls = '.area-dot') => h(`span${cls}`, {'data-tone': tone ?? undefined});

function facts(f) {
  const bits = [f.due && h(`span.phrase${f.due.overdue ? '.is-overdue' : ''}`, f.due.label), f.countdown && h('span.phrase', f.countdown),
    h('span.phrase', f.total ? `${f.done} of ${f.total} done` : 'No tasks yet')].filter(Boolean);
  return h('div.facts-line', bits.flatMap((b, i) => (i ? [h('span', {'aria-hidden': 'true'}, '·'), b] : [b])));
}

function filters(ctx) {
  const all = ctx.snap.blocks.filter(b => !b.archived);
  const areas = ctx.snap.areas.filter(a => !a.archived && all.some(b => areaOf(ctx.snap, b)?.id === a.id));
  const projects = ctx.snap.projects.filter(p => !p.archived && all.some(b => b.projectId === p.id));
  const options = [{id: null, title: 'All Blocks', count: all.length},
    ...areas.map(a => ({id: a.id, title: a.title, count: all.filter(b => areaOf(ctx.snap, b)?.id === a.id).length, tone: `area-${(a.colorIndex ?? 0) % 8}`, group: 'Areas'})),
    ...projects.map(p => ({id: p.id, title: p.title, count: all.filter(b => b.projectId === p.id).length, tone: toneOf(ctx.snap, all.find(b => b.projectId === p.id)), group: 'Projects'}))];
  const pick = id => ctx.setUi({blockFilter: id});
  let group = null;
  const list = h('nav.block-filter', {'aria-label': 'Filter Blocks'}, options.flatMap(o => {
    const heading = o.group && o.group !== group ? h('div.filter-heading', (group = o.group)) : null;
    return [heading, h('button.filter-item', {type: 'button', 'aria-pressed': String((ctx.ui.blockFilter ?? null) === o.id), onclick: () => pick(o.id)},
      o.id ? dot(o.tone) : icon('stacks'), h('span', o.title), h('span.count.tnum', o.count))];
  }));
  const select = h('select.chip.filter-select', {'aria-label': 'Filter Blocks', onchange: e => pick(e.target.value || null)},
    options.map(o => h('option', {value: o.id ?? '', selected: (ctx.ui.blockFilter ?? null) === o.id}, `${o.title} (${o.count})`)));
  return [list, select];
}

function card(ctx, {block, tone, facts: f}) {
  return h('article.result-group', {dataset: {drop: `block:${block.id}`}, 'data-tone': tone ?? undefined},
    h('button.result-head', {type: 'button', 'data-row': '', 'data-focus': `block-${block.id}`, 'aria-current': String(ctx.ui.block === block.id),
      onclick: () => ctx.go('blocks', block.id)},
    tone ? h('span.area-dot') : icon('stacks', {cls: 'result-icon'}),
    h('span.result-copy', h('span.result-title', block.title), block.purpose ? h('span.result-purpose', block.purpose) : null, facts(f))));
}

function finder(ctx, block) {
  const input = h('input', {type: 'text', 'data-focus': `find-${block.id}`, placeholder: 'Add or find a task', 'aria-label': `Add or find a task for ${block.title}`, value: ctx.ui.find ?? ''});
  const results = h('div.find-results', {role: 'listbox'});
  const show = () => {
    const query = input.value.trim();
    const found = findTasks(inboxTasks(ctx.snap), query).slice(0, 5);
    swap(results, ...found.map((t, i) => h('button.find-result', {type: 'button', role: 'option', 'aria-selected': String(i === 0),
      onclick: () => { ctx.setUi({find: ''}); ctx.control.act('move-to-block', {taskId: t.id, blockId: block.id}, 'Moved to this Block'); }},
    icon('inbox'), h('span', t.title))),
    query && !found.length ? h('button.find-result', {type: 'button', onclick: () => { ctx.setUi({find: ''}); ctx.control.capture(query); ctx.notify({text: 'Sent to Capture'}); }},
      icon('edit_note'), h('span', `No Inbox task matches. Capture “${query}”`)) : null);
  };
  input.addEventListener('input', () => { ctx.ui.find = input.value; show(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') results.querySelector('.find-result')?.click(); });
  show();
  return h('div.find-field', input, results, h('p.detail-note', 'Finds Inbox tasks by the start of their words and moves one here.'));
}

function detail(ctx, block) {
  if (!block) return h('section.block-detail', emptyState('stacks', 'Choose a Block', 'Its Purpose, notes and plan show here.'));
  const plan = blockPlan(ctx.snap, block.id), f = blockFacts(ctx.snap, block, ctx.now);
  const project = ctx.snap.projects.find(p => p.id === block.projectId);
  return h('section.block-detail', {'aria-label': block.title, 'data-tone': toneOf(ctx.snap, block) ?? undefined, dataset: {drop: `block:${block.id}`}},
    iconButton('arrow_back', 'Back to Blocks', () => ctx.go('blocks'), 'icon-btn.detail-back'),
    h('h2.detail-title', block.title),
    h('div.detail-facts', facts(f), project ? h('span.quiet', `Project: ${project.title}`) : null),
    h('div.detail-field', h('small', 'Purpose'), h('p', block.purpose || 'No Purpose yet.')),
    block.notes ? h('div.detail-field', h('small', 'Notes'), h('p', block.notes)) : null,
    h('p.detail-note', 'Edit a Block’s title, Purpose and notes on your phone. The browser changes its tasks.'),
    sectionHeader('Plan', plural(plan.open.length, 'open task')),
    plan.open.length ? plan.open.map(t => taskRow(ctx, t, {show: {block: false}})) : h('p.quiet', 'No open tasks.'),
    finder(ctx, block),
    plan.done.length ? h('button.completed-toggle', {type: 'button', 'aria-expanded': String(!!ctx.ui.showDone), onclick: () => ctx.setUi({showDone: !ctx.ui.showDone})},
      `Completed (${plan.done.length})`, icon(ctx.ui.showDone ? 'expand_less' : 'expand_more')) : null,
    ctx.ui.showDone ? plan.done.map(t => taskRow(ctx, t, {show: {block: false}})) : null);
}

export function renderBlocks(ctx) {
  const list = blockList(ctx.snap, ctx.now, ctx.ui.blockFilter ?? null);
  const block = ctx.snap.blocks.find(b => b.id === ctx.ui.block) ?? null;
  const [filterList, filterSelect] = filters(ctx);
  return h(`div.blocks${block ? '.has-detail' : ''}`, filterList, filterSelect,
    h('div.block-cards', list.length ? list.map(row => card(ctx, row)) : emptyState('stacks', 'No Blocks here', 'Blocks are made on your phone.')),
    detail(ctx, block));
}
