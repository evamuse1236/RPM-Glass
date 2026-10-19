import {h, fill} from './dom.mjs';
import {icon} from './icons.mjs';
import {taskPlate, emptyPlate} from './plate.mjs';
import {week} from '../model/plan.mjs';
import {clock, timeRange, longDate, plural} from '../../../android-companion/planner/format.mjs';

const dayParts = day => {
  const date = new Date(day + 'T12:00');
  return {letter: date.toLocaleDateString([], {weekday: 'short'}), number: date.getDate()};
};

function tile(task, done, pending) {
  return h('span.tile', {dataset: {state: pending ? 'pending' : done ? 'done' : 'idle'}, title: task.title});
}

function dayColumn(ctx, day, selected) {
  const {letter, number} = dayParts(day.day);
  const items = [...day.timed, ...day.dated];
  const words = [plural(items.length, 'task'), ...day.deadlines.map(d => `${d.block.title} due`)].join(', ');
  return h('button.day', {type: 'button', 'aria-pressed': String(selected), 'aria-label': `${longDate(day.day)}: ${words}`,
    dataset: {today: day.today ? '' : null, past: day.past ? '' : null, dropDay: day.day, focusKey: `day:${day.day}`},
    onclick: () => { ctx.cache.weekDay = day.day; ctx.render(); }},
  h('span.day-head', {}, h('span.day-letter', {}, letter), h('span.day-num.tnum', {}, number)),
  h('span.tiles', {}, items.map(t => tile(t, false, ctx.view.pending.has(`task:${t.id}`))),
    day.completed.map(t => tile(t, true, false))),
  day.deadlines.length ? h('span.day-flags', {}, day.deadlines.map(() => icon('flag'))) : null);
}

function dayDetail(ctx, day, blocks) {
  const plates = [
    ...day.timed.map(t => taskPlate(ctx, t, {meta: [timeRange(t.start, t.end), blocks.get(t.blockId)?.title]})),
    ...day.dated.map(t => taskPlate(ctx, t, {meta: ['No time set', blocks.get(t.blockId)?.title]})),
    ...day.completed.map(t => taskPlate(ctx, t, {done: true, meta: ['Done', blocks.get(t.blockId)?.title]})),
  ];
  return h('section.day-detail', {'aria-label': longDate(day.day), dataset: {dropDay: day.day}},
    h('h3.section-sign', {}, day.today ? `Today · ${longDate(day.day)}` : longDate(day.day)),
    day.deadlines.map(d => h('p.deadline', {}, icon('flag', {title: 'Result due'}),
      h('span', {}, h('b', {}, `Due ${clock(d.due.at)}`), ` · ${d.block.title}`))),
    plates.length ? plates : emptyPlate('Drop a task here, or open a task and choose Move to.'));
}

export function renderWeek(ctx, floor) {
  if (ctx.state.phase !== 'ready') return fill(floor), {count: null};
  const days = week(ctx.view.snapshot, ctx.now());
  if (!days.some(d => d.day === ctx.cache.weekDay)) ctx.cache.weekDay = days.find(d => d.today)?.day ?? days[0].day;
  const blocks = new Map(ctx.view.snapshot.blocks.map(b => [b.id, b]));
  const selected = days.find(d => d.day === ctx.cache.weekDay);
  fill(floor, 
    h('div.week-strip', {role: 'group', 'aria-label': 'This week'}, days.map(d => dayColumn(ctx, d, d === selected))),
    dayDetail(ctx, selected, blocks),
    h('div.light', {'aria-hidden': 'true'}),
  );
  return {count: days.reduce((n, d) => n + d.timed.length + d.dated.length, 0)};
}
