/** Week: seven days side by side, each with its Results due, its tasks and its free time. Drag a task to a day. */
import {h, icon} from './dom.mjs';
import {checkButton, trailMark, resolution} from './rows.mjs';
import {weekModel} from '../core/model.mjs';
import {clock, duration} from '../../../android-companion/planner/format.mjs';

const weekday = day => new Date(day + 'T12:00').toLocaleDateString([], {weekday: 'short'});
const dayNumber = day => new Date(day + 'T12:00').getDate();

function weekTask(ctx, item) {
  const task = ctx.snap.tasks.find(t => t.id === item.id) ?? item.ref;
  return h(`div.week-task${item.done ? '.done' : ''}`, {dataset: {task: task.id, dragTask: item.done ? undefined : task.id}},
    checkButton(ctx, task, {done: item.done, occurrence: item.occurrence}),
    h('button.task-main', {type: 'button', 'data-row': '', 'data-focus': `task-${task.id}-${item.occurrence ?? ''}`, 'data-task-id': task.id,
      onclick: () => ctx.open(task.id)},
    h('span.task-title', item.title),
    h('span.week-meta', item.start != null ? h('span.time.tnum', clock(item.start)) : null, trailMark(ctx, {...task, must: item.must}))),
    resolution(ctx, task.id));
}

function dayColumn(ctx, day, chosen) {
  return h(`section.week-day${day.today ? '.today' : ''}${day.past ? '.past' : ''}${chosen ? '.chosen' : ''}`,
    {'aria-label': new Date(day.day + 'T12:00').toLocaleDateString([], {weekday: 'long', day: 'numeric', month: 'long'}), dataset: {drop: `day:${day.day}`}},
    h('div.week-head', h('small', weekday(day.day)), h('b.tnum', dayNumber(day.day))),
    day.deadlines.map(d => h('div.week-deadline', icon('hourglass_bottom'), h('span', h('b', d.title), `Due ${clock(d.at)}`))),
    day.items.map(item => weekTask(ctx, item)),
    h('div.drop-hint', 'Drop a task'),
    h('div.week-free', `${duration(day.free)} free`));
}

export function renderWeek(ctx) {
  const days = weekModel(ctx.snap, ctx.now);
  const chosen = ctx.ui.weekDay && days.some(d => d.day === ctx.ui.weekDay) ? ctx.ui.weekDay : days.find(d => d.today)?.day ?? days[0].day;
  return h('div.week-wrap',
    h('div.week-strip', {role: 'group', 'aria-label': 'Choose a day'}, days.map(d => h(`button.strip-day${d.today ? '.today' : ''}`, {type: 'button',
      'aria-pressed': String(d.day === chosen), onclick: () => ctx.setUi({weekDay: d.day})}, h('span', weekday(d.day)), h('b.tnum', dayNumber(d.day))))),
    h('div.week', days.map(d => dayColumn(ctx, d, d.day === chosen))));
}
