import {blockTasks, inboxRows, localDay, shiftDay} from '../../android-companion/planner-state.mjs';
import {dayTasks} from '../../android-companion/planner-ux.mjs';
import {dueSoon, openResults} from '../../android-companion/planner/today-model.mjs';
import {taskWhen} from '../../android-companion/planner/task-row.mjs';
import {clock, dayName} from '../../android-companion/planner/format.mjs';
import {button, el, icon, listItem} from '../../android-companion/planner/dom.mjs';
import {isWide, onWidthChange} from './desktop.mjs';

const SHOWN = 4;
const AHEAD = 6;
const TITLES = 3;

const byTime = (a, b) => (taskWhen(a) ?? Infinity) - (taskWhen(b) ?? Infinity);

export function agendaModel(data, now = new Date()) {
  const today = localDay(now);
  const inbox = inboxRows(data);
  const listed = dayTasks(data, today, +now);
  const onToday = new Set([...listed.active, ...listed.completed].map(task => task.id));
  const soon = dueSoon(data, now)[0];
  const block = soon?.block ?? openResults(data)[0] ?? null;
  const week = Array.from({length: AHEAD}, (_, i) => {
    const day = shiftDay(today, i + 1);
    const active = dayTasks(data, day, +now).active.sort(byTime);
    return {day, label: dayName(day), count: active.length, titles: active.slice(0, TITLES).map(task => task.title)};
  }).filter(day => day.count);
  return {
    inbox: {count: inbox.length, tasks: inbox.slice(0, SHOWN)},
    next: block && {block, due: soon?.due?.label ?? '',
      tasks: blockTasks(data, block.id).filter(task => !task.done && !onToday.has(task.id)).slice(0, SHOWN)},
    week,
  };
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

function taskItem(task, ui, now) {
  return listItem({leading: task.must ? icon('star', {fill: true, cls: 'leading must'}) : 'radio_button_unchecked',
    headline: task.title, supporting: when(task, now), onClick: () => ui.taskEditor(task.id), cls: 'agenda-task'});
}

function weekDay(day, ui) {
  const node = button('', () => ui.openView({view: 'day', date: day.day}), 'list-item agenda-day');
  const copy = el('span', 'list-copy');
  const top = el('span', 'list-headline');
  top.append(el('span', '', day.label), el('span', 'agenda-count tnum', String(day.count)));
  copy.append(top, ...day.titles.map(title => el('span', 'list-supporting', title)));
  node.append(copy);
  return node;
}

function section(...children) {
  const node = el('section', 'agenda-section');
  node.append(...children);
  return node;
}

export function renderAgenda(host, data, ui, now = new Date()) {
  const model = agendaModel(data, now);
  const sections = [];
  sections.push(section(head('Inbox', {count: model.inbox.count, onClick: () => ui.inbox()}),
    ...model.inbox.tasks.map(task => taskItem(task, ui, now))));
  if (model.next) {
    const {block} = model.next;
    const open = head(block.title, {onClick: () => ui.openView({view: 'rpm', collection: 'blocks', id: block.id})});
    if (model.next.due) open.querySelector('h2').after(el('span', 'agenda-due', model.next.due));
    sections.push(section(open, ...model.next.tasks.map(task => taskItem(task, ui, now))));
  }
  if (model.week.length) sections.push(section(head('Week'), ...model.week.map(day => weekDay(day, ui))));
  host.replaceChildren(...sections);
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
  refresh();
  return refresh;
}
