import {h, key, fill} from './dom.mjs';
import {icon} from './icons.mjs';
import {taskPlate, pendingLine, problemStrip, emptyPlate} from './plate.mjs';
import {today} from '../model/today.mjs';
import {clock, timeRange, duration, plural} from '../../../android-companion/planner/format.mjs';
import {gutterTime} from '../../../android-companion/day-parts.mjs';

function rowPlate(ctx, {pendingKey, sprite, title, meta, tail, done = false}) {
  const pending = ctx.view.pending.get(pendingKey);
  const problem = ctx.view.problems.get(pendingKey);
  return h('div.plate-wrap', {}, problem ? problemStrip(ctx, problem) : null,
    h('article.plate', {dataset: {state: pending ? 'pending' : done ? 'done' : 'idle'}},
      h('span.row-icon', {}, sprite),
      h('div.plate-open', {}, h('span.plate-title', {}, title),
        h('span.plate-meta', {}, pending ? pendingLine(pending, ctx.state.online) : meta)),
      h('span.plate-tail', {}, tail)));
}

export function logGlass(ctx) {
  ctx.act('log-water', {at: ctx.now().toISOString()}, 'Glass of water');
}

export function logMeal(ctx, meal) {
  const name = meal.label.split(' · ')[0];
  ctx.act('log-meal', {name, slot: meal.slot, at: ctx.now().toISOString()}, `Logged ${name.toLowerCase()}`);
}

function waterRow(ctx, water) {
  const drops = h('span.drops', {'aria-hidden': 'true'},
    Array.from({length: water.goal}, (_, i) => icon('drop', {variant: i < water.count ? 'full' : 'empty'})));
  return rowPlate(ctx, {pendingKey: 'water', sprite: icon('drop'), title: 'Water', done: water.reached,
    meta: [water.line, drops],
    tail: key('Glass', () => logGlass(ctx), {cls: 'small', aria: `Log a glass of water, ${water.count} of ${water.goal} so far`})});
}

function mealRow(ctx, meal) {
  const [name, what] = meal.label.split(' · ');
  return rowPlate(ctx, {pendingKey: `meal:${meal.slot}`, sprite: icon('heart', {variant: meal.meal ? 'full' : 'empty'}),
    title: name, done: !!meal.meal, meta: meal.meal ? `${what} · ${clock(meal.meal.at)}` : 'Not logged',
    tail: meal.meal ? null : key('Log it', () => logMeal(ctx, meal), {cls: 'small', aria: `Log ${name}`})});
}

function itemBody(ctx, item, blocks) {
  if (item.kind === 'task') {
    const block = blocks.get(item.task.blockId);
    return taskPlate(ctx, item.task, {done: !!item.done,
      meta: [item.done ? 'Done' : timeRange(item.task.start, item.task.end), block?.title]});
  }
  if (item.kind === 'routine') {
    return h('div.flat-block', {},
      h('span.plate-title', {}, item.routine.name),
      h('span.plate-meta', {}, `${item.line} · steps tick on the phone`));
  }
  if (item.kind === 'water') return waterRow(ctx, item.water);
  if (item.kind === 'meal') return mealRow(ctx, item.meal);
  return h('div.free-row', {},
    h('span', {}, `${duration(item.minutes)} free`),
    key(icon('plus'), () => ctx.fillGap(item), {cls: 'small', aria: `Put an Inbox task at ${clock(item.at)}`}));
}

function leadCard(ctx, lead) {
  const facts = lead.facts;
  return h('section.lead', {'aria-label': `${lead.label}: ${lead.task.title}`},
    h('p.lead-label', {}, h('span', {}, lead.label), h('span', {}, '·'), h('span.tnum', {}, lead.when)),
    lead.block ? h('div.lead-result', {},
      h('p.lead-title', {}, lead.block.title),
      lead.block.purpose ? h('p.lead-purpose', {}, lead.block.purpose) : null,
      h('p.lead-facts', {}, [facts.due?.label, facts.leftText].filter(Boolean).join(' · '))) : null,
    taskPlate(ctx, lead.task, {heroSpot: true, meta: [timeRange(lead.task.start, lead.task.end)]}));
}

export function renderToday(ctx, floor) {
  if (ctx.state.phase !== 'ready') {
    fill(floor, h('p.lead-label', {role: 'status'}, 'Loading your plan…'));
    return {count: null};
  }
  const model = today(ctx.view.snapshot, ctx.now());
  const blocks = new Map(ctx.view.snapshot.blocks.map(b => [b.id, b]));
  ctx.cache.today = model;
  fill(floor, 
    h('p.date-line', {}, model.date),
    model.lead ? leadCard(ctx, model.lead) : emptyPlate('Nothing timed is left today.', 'Pick something from the Inbox, or capture what is on your mind.'),
    h('ol.agenda', {'aria-label': 'Rest of today'}, model.agenda.map(item => h('li', {dataset: {kind: item.kind}},
      h('time.gutter', {datetime: new Date(item.at).toISOString()}, gutterTime(item.at)),
      itemBody(ctx, item, blocks)))),
    model.anytime.length ? h('section.anytime', {'aria-label': 'Any time today'},
      h('h3.section-sign', {}, 'Any time today'),
      model.anytime.map(task => taskPlate(ctx, task, {meta: ['Today, no time set', blocks.get(task.blockId)?.title]}))) : null,
    h('div.inbox-row', {},
      h('span', {}, `Inbox · ${plural(model.inbox, 'task')}`),
      key('Go', () => ctx.goRoom('inbox', {focus: true}), {cls: 'small', aria: 'Go to the Inbox'})),
    h('div.light', {'aria-hidden': 'true'}),
  );
  return {count: model.agenda.filter(i => i.kind === 'task' && !i.done).length + (model.lead ? 1 : 0)};
}
