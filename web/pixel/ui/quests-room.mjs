import {h, fill} from './dom.mjs';
import {icon} from './icons.mjs';
import {taskPlate, emptyPlate} from './plate.mjs';
import {quests} from '../model/plan.mjs';
import {scheduleText} from '../../../android-companion/capture-content.mjs';

const whenOf = task => scheduleText(task.planned ? {planned: task.planned} : task.plannedDate ? {plannedDate: task.plannedDate} : null) ?? 'No date';

function questPlate(ctx, quest) {
  const {block, due, done, total, rows} = quest;
  const musts = rows.filter(t => t.must);
  const open = ctx.cache.openQuests ?? (ctx.cache.openQuests = new Set());
  return h('details.quest', {open: open.has(block.id), ontoggle: event => {
    if (event.target.open) open.add(block.id); else open.delete(block.id);
  }},
  h('summary', {dataset: {focusKey: `quest:${block.id}`}},
    h('span.quest-title', {}, block.title),
    block.purpose ? h('span.quest-purpose', {}, block.purpose) : null,
    h('span.quest-facts', {}, [due ? due.label : 'No deadline yet', quest.mustText].filter(Boolean).join(' · ')),
    h('span.progress', {}, h('span.track', {}, h('span.fill', {style: `inline-size: ${total ? (done / total) * 100 : 0}%`})),
      h('span.tnum', {}, total ? `${done} of ${total} done` : 'No tasks yet')),
    musts.length ? h('ul.musts', {'aria-label': 'Musts'}, musts.map(t => h('li', {dataset: {done: t.done ? '' : null}},
      icon('star', {title: 'Must'}), h('span', {}, t.title)))) : null,
    h('span.quest-more', {}, 'Plan')),
  h('div.quest-plan', {}, rows.length
    ? rows.map(t => taskPlate(ctx, t, {meta: [t.done ? 'Done' : whenOf(t)]}))
    : emptyPlate('No tasks under this Result yet. Capture one below.')));
}

export function renderQuests(ctx, floor) {
  if (ctx.state.phase !== 'ready') return fill(floor), {count: null};
  const list = quests(ctx.view.snapshot, ctx.now());
  fill(floor, 
    list.length ? h('div.quest-list', {}, list.map(q => questPlate(ctx, q))) : emptyPlate('No open Results. Results you plan on the phone show here.'),
    h('div.light', {'aria-hidden': 'true'}),
  );
  return {count: list.length};
}
