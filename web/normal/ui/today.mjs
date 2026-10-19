/** Today: the phone's spine on the left, the reasons beside it (next task, its Result and Purpose, what is coming). */
import {h, icon, iconButton, emptyState} from './dom.mjs';
import {checkButton, trail, resolution, markFor, sectionHeader, taskRow} from './rows.mjs';
import {todayModel} from '../core/model.mjs';
import {waterRowParts, joinParts, rangeText} from '../../../android-companion/body-state.mjs';
import {routineMeta} from '../../../android-companion/day-parts.mjs';
import {countdown, plural} from '../../../android-companion/planner/format.mjs';
import {localDay} from '../../../android-companion/planner-state.mjs';

const px = n => `${n}px`;

function gutter(row) {
  return h('div.spine-gutter', h('span.tnum', row.gutter?.time ?? row.time), row.gutter && row.kind !== 'routine' ? h('span.len', row.gutter.length) : null);
}

function lineFor(ctx, row) {
  const line = row.line;
  if (!line) return null;
  if (line.kind === 'result') {
    return h('span.spine-line', {'data-tone': line.tone}, line.tone !== 'neutral' ? h('span.area-dot') : null, h('span', line.text));
  }
  return h(`span.spine-line.line-${line.kind}`, h('span', line.text));
}

function taskCard(ctx, row) {
  const task = ctx.snap.tasks.find(t => t.id === row.task.id) ?? row.task.ref;
  return h('div.spine-card', {dataset: {task: task.id, dragTask: task.id}},
    checkButton(ctx, task, {done: row.done, occurrence: row.task.occurrence}),
    h('button.task-main', {type: 'button', 'data-focus': `task-${task.id}`, 'data-row': '', 'data-task-id': task.id, onclick: () => ctx.open(task.id)},
      h('span.spine-title', row.title), lineFor(ctx, row)),
    trail(ctx, {...task, must: row.must}),
    row.elapsed ? h('div.spine-elapsed', {style: {'--value': row.elapsed.fraction}}, h('div.spine-bar'), h('span', row.elapsed.in), h('span', row.elapsed.left)) : null,
    resolution(ctx, task.id));
}

function routineCard(row) {
  const {progress} = row;
  return h('div.spine-card', icon('checklist'),
    h('div.card-copy', h('span.spine-title', row.title), h(`span.spine-line${row.missed ? '.line-late' : ''}`, row.count)),
    progress.total ? h('div.progress', {role: 'img', 'aria-label': row.count}, h('span', {style: {'--value': progress.done / progress.total}})) : null);
}

function small(symbol, label, action = null, fill = false) {
  return h('div.spine-small', icon(symbol, {fill}), h('span.label', label), action);
}

function rowBody(ctx, row) {
  switch (row.kind) {
    case 'task': return taskCard(ctx, row);
    case 'routine': return routineCard(row);
    case 'water': return small('water_drop', row.label, iconButton('add', 'Log a glass of water', () => ctx.drink()), true);
    case 'meal': return small('restaurant', row.label, row.meal ? null : h('button.text-btn', {type: 'button', onclick: () => ctx.logMeal(row.slot, row.start)}, 'Log it'));
    case 'deadline': return small('hourglass_bottom', row.label);
    case 'gap': return h('div.spine-free', {style: {'--h': px(row.height)}}, row.label);
    case 'now': return h('div.spine-now-line');
    default: return null;
  }
}

function spineRow(ctx, row) {
  const cls = [`spine-row.spine-${row.kind}`, row.current && 'current', row.next && 'next', row.done && 'done', row.past && 'past',
    row.overdue && 'overdue'].filter(Boolean).join('.');
  const node = h(`div.${cls}`, {style: row.height && row.kind !== 'gap' ? {'--h': px(row.height)} : null},
    row.kind === 'now' ? h('div.spine-gutter', h('span.tnum', row.label)) : gutter(row),
    h('span.spine-dot'), rowBody(ctx, row));
  for (const at of row.ticks ?? []) node.append(h('span.spine-tick', {style: {'--at': at}}));
  return node;
}

function leadCard(ctx, next, model) {
  if (!next) {
    return h('section.lead-card', h('div.lead-label', h('span.now-pin'), 'Nothing else timed today'),
      h('p.lead-purpose', model.inbox ? `${plural(model.inbox, 'task')} in the Inbox could fill the time.` : 'The rest of the day is free.'));
  }
  const {task, block, facts} = next;
  const factBits = facts ? [facts.due && h(`span.phrase${facts.due.overdue ? '.is-overdue' : ''}`, facts.due.label), facts.countdown && h('span.phrase', facts.countdown),
    h('span.phrase', `${facts.left} left`)].filter(Boolean) : [];
  return h('section.lead-card', {'aria-label': 'Do next', 'data-tone': next.tone},
    h('div.lead-label', h('span.now-pin'), next.label, h('span', {style: {marginInlineStart: 'auto'}}, markFor(ctx, task.id))),
    h('div.lead-task', task.title),
    block ? h('div.lead-result', h('span.area-dot'), h('span', block.title)) : h('div.lead-result', h('span', 'No Block')),
    block?.purpose ? h('p.lead-purpose', block.purpose) : null,
    factBits.length ? h('div.facts-line', factBits.flatMap((b, i) => (i ? [h('span', {'aria-hidden': 'true'}, '·'), b] : [b]))) : null,
    h('div.lead-actions',
      h('button.tonal-btn', {type: 'button', onclick: () => ctx.control.act('complete', {taskId: task.id}, 'Task completed')}, icon('check'), 'Done'),
      h('button.text-btn', {type: 'button', onclick: () => ctx.open(task.id)}, 'Open')),
    resolution(ctx, task.id));
}

function upcomingRow(ctx, item, today) {
  const alert = item.kind === 'overdue' || item.kind === 'unplanned';
  const symbol = {due: 'hourglass_bottom', overdue: 'error_outline', unplanned: 'event_busy', clash: 'warning'}[item.kind] ?? 'event';
  const lines = [];
  if (item.kind === 'unplanned') lines.push(h('span.lead', 'Nothing planned · '), `${item.due.label} · ${plural(item.undated.length, 'task')} with no day`);
  else if (item.kind === 'overdue') lines.push(h('span.lead', item.due.label), ` · ${item.left} left`);
  else if (item.due) lines.push(`${item.due.label} · ${countdown(item.due.at, new Date(ctx.now))}`);
  const action = item.kind === 'unplanned'
    ? h('button.text-btn', {type: 'button', onclick: () => ctx.control.act('reschedule', {taskId: item.task.id, time: null, day: today}, 'Added to today')}, 'Add to today')
    : null;
  return h(`div.today-row${alert ? '.is-alert' : ''}`, icon(symbol),
    h('button.today-row-headline', {type: 'button', 'data-row': '', 'data-focus': `due-${item.block?.id}`, style: {textAlign: 'start'},
      onclick: () => ctx.go('blocks', item.block?.id)}, item.block?.title ?? 'Clash'),
    action && h('div.today-row-action', action),
    h('div.today-row-supporting', lines));
}

function habits(ctx, model) {
  const water = waterRowParts(model.water.status);
  return h('section.beside-section', sectionHeader('Habits'),
    h('div.habits',
      h('div.habit-row.water', icon('water_drop', {fill: true}),
        h('div.habit-copy', h('span', `Water · ${model.water.status.count} of ${model.water.status.goal}`), h('small', joinParts(water.parts))),
        h('button.text-btn', {type: 'button', onclick: () => ctx.drink()}, '+1 glass')),
      model.routines.flatMap(r => [
        h('div.habit-row', icon('checklist'),
          h('div.habit-copy', h('span', r.name), h('small', `${routineMeta(r.state, r.progress)} · ${rangeText(r.start, r.end)}`))),
        r.progress.total ? h('div.progress', {role: 'img', 'aria-label': `${r.progress.done} of ${r.progress.total} steps`}, h('span', {style: {'--value': r.progress.done / r.progress.total}})) : null,
      ])));
}

export function renderToday(ctx) {
  const model = todayModel(ctx.snap, ctx.now);
  const rows = model.spine.rows;
  const hasTasks = rows.some(r => r.kind === 'task') || model.spine.anytime.tasks.length;
  const today = localDay(ctx.now);
  const spine = h('section.spine-pane', {'aria-label': 'Today in time order'},
    hasTasks ? null : emptyState('event_available', 'Nothing timed today', 'Capture a thought, or drag a task here from the Inbox.'),
    h('div.spine', {dataset: {drop: `day:${today}`}}, rows.map(row => spineRow(ctx, row))),
    model.spine.anytime.tasks.length ? h('div.anytime', sectionHeader('Anytime today', model.spine.anytime.label),
      model.spine.anytime.tasks.map(t => taskRow(ctx, ctx.snap.tasks.find(x => x.id === t.id) ?? t.ref, {show: {when: false}}))) : null,
    model.inbox ? h('a.inbox-link', {href: '#/inbox'}, `Inbox (${model.inbox})`, icon('chevron_right')) : null);
  const beside = h('aside.beside', {'aria-label': 'Next and coming up'},
    leadCard(ctx, model.next, model),
    model.upcoming.length ? h('section.beside-section', sectionHeader('Coming up', 'Next 3 days'),
      model.upcoming.map(item => upcomingRow(ctx, item, today))) : null,
    habits(ctx, model));
  return h('div.with-sidebar', spine, beside);
}

