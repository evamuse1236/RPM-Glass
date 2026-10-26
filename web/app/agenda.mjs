import {blockTasks, inboxRows, localDay, shiftDay} from '../../android-companion/planner-state.mjs';
import {dayTasks} from '../../android-companion/planner-ux.mjs';
import {dueSoon, openResults} from '../../android-companion/planner/today-model.mjs';
import {taskWhen} from '../../android-companion/planner/task-row.mjs';
import {clock, dayName} from '../../android-companion/planner/format.mjs';
import {button, el, icon, listItem} from '../../android-companion/planner/dom.mjs';
import {isSplit, isWide, onSplitChange, onWidthChange} from './desktop.mjs';

const SHOWN = 4;
const LINES = 2;
const TOMORROW = 8;

const byTime = (a, b) => (taskWhen(a) ?? Infinity) - (taskWhen(b) ?? Infinity);

export function agendaModel(data, now = new Date(), {split = false} = {}) {
  const today = localDay(now);
  const listed = dayTasks(data, today, +now);
  const shown = new Set([...listed.active, ...listed.completed].map(task => task.id));
  const claim = (tasks, most = Infinity) => {
    const fresh = [...new Map(tasks.filter(task => !shown.has(task.id)).map(task => [task.id, task])).values()].slice(0, most);
    for (const task of fresh) shown.add(task.id);
    return fresh;
  };
  const inboxAll = inboxRows(data);
  const inbox = {count: inboxAll.length, tasks: claim(inboxAll, SHOWN)};
  const tomorrowDay = shiftDay(today, 1);
  const ahead = dayTasks(data, tomorrowDay, +now).active.sort(byTime);
  const tomorrow = split ? {day: tomorrowDay, count: ahead.length, tasks: claim(ahead, TOMORROW)} : null;
  const first = split ? 2 : 1;
  const week = Array.from({length: split ? 13 : 6}, (_, i) => {
    const day = shiftDay(today, i + first);
    const active = dayTasks(data, day, +now).active.sort(byTime);
    const unseen = active.filter(task => !shown.has(task.id));
    const tasks = claim(unseen, LINES);
    return {day, label: dayName(day), count: active.length, tasks, more: unseen.length - tasks.length};
  }).filter(day => day.tasks.length);
  const soon = dueSoon(data, now);
  const results = [...new Map([...soon.map(item => item.block), ...openResults(data)].map(block => [block.id, block])).values()];
  const blocks = [];
  for (const block of results) {
    if (blocks.length === (split ? 3 : 2)) break;
    const tasks = claim(blockTasks(data, block.id).filter(task => !task.done), SHOWN);
    if (!tasks.length && blocks.length) continue;
    blocks.push({block, due: soon.find(item => item.block.id === block.id)?.due?.label ?? '', tasks});
  }
  return {inbox, blocks, tomorrow, week};
}

function when(task, now) {
  const at = taskWhen(task);
  if (at) return [dayName(localDay(at)), clock(at)].filter(Boolean).join(' ');
  if (task.plannedDate && task.plannedDate < localDay(now)) return 'Overdue';
  return task.plannedDate ? dayName(task.plannedDate) : '';
}

function head(title, {count = null, onClick = null} = {}) {
  const node = onClick ? button('', onClick, 'agenda-head') : el('div', 'agenda-head');
  node.append(el('h2', '', title));
  if (count != null) node.append(el('span', 'agenda-count tnum', String(count)));
  if (onClick) node.append(icon('chevron_right', {cls: 'trailing'}));
  return node;
}

const leading = task => task.must ? icon('star', {fill: true, cls: 'leading must'}) : 'radio_button_unchecked';

function taskItem(task, ui, now) {
  return listItem({leading: leading(task), headline: task.title, supporting: when(task, now),
    onClick: () => ui.taskEditor(task.id), cls: 'agenda-task'});
}

function timedItem(task, ui) {
  const at = taskWhen(task);
  return listItem({leading: leading(task), headline: task.title, trailing: at ? el('span', 'agenda-time tnum', clock(at)) : null,
    onClick: () => ui.taskEditor(task.id), cls: 'agenda-task agenda-line'});
}

function weekDay(day, ui) {
  const open = () => ui.openView({view: 'day', date: day.day});
  const top = button('', open, 'agenda-day');
  top.append(el('span', '', day.label), el('span', 'agenda-count tnum', String(day.count)));
  const rows = [top, ...day.tasks.map(task => timedItem(task, ui))];
  if (day.more) rows.push(button(`+${day.more}`, open, 'agenda-more'));
  return rows;
}

function section(cls, ...children) {
  const node = el('section', `agenda-section ${cls}`);
  node.append(...children);
  return node;
}

function column(...sections) {
  const node = el('div', 'agenda-col');
  node.append(...sections.filter(Boolean));
  return node;
}

export function renderAgenda(host, data, ui, now = new Date(), split = isSplit()) {
  const model = agendaModel(data, now, {split});
  const inbox = section('agenda-inbox', head('Inbox', {count: model.inbox.count, onClick: () => ui.inbox()}),
    ...model.inbox.tasks.map(task => taskItem(task, ui, now)));
  const blocks = model.blocks.map(({block, due, tasks}) => {
    const open = head(block.title, {onClick: () => ui.openView({view: 'rpm', collection: 'blocks', id: block.id})});
    if (due) open.querySelector('h2').after(el('span', 'agenda-due', due));
    return section('agenda-next', open, ...tasks.map(task => taskItem(task, ui, now)));
  });
  const {tomorrow} = model;
  const ahead = tomorrow?.count ? section('agenda-tomorrow',
    head('Tomorrow', {count: tomorrow.count, onClick: () => ui.openView({view: 'day', date: tomorrow.day})}),
    ...tomorrow.tasks.map(task => timedItem(task, ui))) : null;
  const week = model.week.length ? section('agenda-week', head('Week'), ...model.week.flatMap(day => weekDay(day, ui))) : null;
  host.replaceChildren(column(inbox, ...blocks, ahead, week));
}

/** The Today side panel on a wide window: shown only on Today, redrawn on every snapshot. */
export function mountAgenda(host, planner, ui, getData) {
  const refresh = () => {
    const shown = isWide() && planner.dataset.view === 'today' && !!getData();
    host.hidden = !shown;
    if (shown) renderAgenda(host, getData(), ui);
  };
  new MutationObserver(refresh).observe(planner, {attributes: true, attributeFilter: ['data-view']});
  onWidthChange(refresh);
  onSplitChange(refresh);
  refresh();
  return refresh;
}
