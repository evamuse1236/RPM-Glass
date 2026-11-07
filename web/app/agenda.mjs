import {blockDue, blockTasks, localDay, localStamp, shiftDay, tasks} from '../../android-companion/planner-state.mjs';
import {openResults} from '../../android-companion/planner/today-model.mjs';
import {clock, DATE_LOCALE, dueInfo} from '../../android-companion/planner/format.mjs';
import {button, el, icon} from '../../android-companion/planner/dom.mjs';
import {isWide, onWidthChange} from './desktop.mjs';

const GROUPS = 6;
const AHEAD = 13;

const dueValue = task => task.planned ? localStamp(task.planned) : task.plannedDate;
const timed = value => value.length > 10;
const order = value => (timed(value) ? value : value + 'T24');
const openMusts = data => tasks(data).filter(task => task.must && !task.done && !task.recurrence && !task.repeatAfterDays && dueValue(task));
const timeOf = value => (timed(value) ? clock(new Date(value)) : '');

/**
 * Coming up: the days after today's centre, each named once, holding its Results' deadlines (each Result once, its
 * dated open Musts under it) and its other one-time Musts. Empty days and the day the centre shows are left out;
 * a deadline already past heads the list as Overdue.
 */
export function comingUp(data, now = new Date(), shown = localDay(now)) {
  const today = localDay(now), last = shiftDay(today, AHEAD);
  const groups = new Map();
  const group = key => {
    if (!groups.has(key)) groups.set(key, {day: key, items: []});
    return groups.get(key).items;
  };
  const inWindow = key => key !== shown && key <= last;
  const held = new Set();
  for (const block of openResults(data)) {
    const value = blockDue(data, block.id)?.value;
    const due = dueInfo(value, now);
    if (!due) continue;
    const day = due.overdue ? 'overdue' : value.slice(0, 10);
    const open = blockTasks(data, block.id).filter(task => !task.done);
    const musts = open.filter(task => task.must && dueValue(task) && dueValue(task).slice(0, 10) !== shown)
      .sort((a, b) => order(dueValue(a)).localeCompare(order(dueValue(b))))
      .map(task => ({id: task.id, title: task.title, when: mustWhen(dueValue(task), day, value)}));
    if (day !== 'overdue' && !inWindow(day)) continue;
    for (const task of musts) held.add(task.id);
    group(day).push({kind: 'result', id: block.id, title: block.title, at: +due.at,
      when: day === 'overdue' ? dayName(value.slice(0, 10)) + (timed(value) ? ' ' + timeOf(value) : '') : timeOf(value),
      left: open.length, musts});
  }
  for (const task of openMusts(data)) {
    const value = dueValue(task), day = value.slice(0, 10);
    if (held.has(task.id) || day < today || !inWindow(day)) continue;
    group(day).push({kind: 'must', id: task.id, title: task.title, at: +new Date(order(value).replace('T24', 'T23:59')), when: timeOf(value)});
  }
  for (const entry of groups.values()) entry.items.sort((a, b) => (a.kind === b.kind ? a.at - b.at : a.kind === 'result' ? -1 : 1));
  return [...groups.values()].sort((a, b) => (a.day === 'overdue' ? -1 : b.day === 'overdue' ? 1 : a.day.localeCompare(b.day))).slice(0, GROUPS);
}

/** A Must under its Result says its time only when that differs from the deadline above it, and its day when that differs. */
function mustWhen(value, day, deadline) {
  if (value.slice(0, 10) === day) return timeOf(value) === timeOf(deadline) ? '' : timeOf(value);
  return [dayName(value.slice(0, 10)), timeOf(value)].filter(Boolean).join(' ');
}

const dayName = day => new Date(day + 'T12:00').toLocaleDateString(DATE_LOCALE, {weekday: 'short', day: 'numeric', month: 'short'});
const groupName = (day, now) => (day === 'overdue' ? 'Overdue' : day === localDay(now) ? 'Today' : day === shiftDay(localDay(now), 1) ? 'Tomorrow' : dayName(day));
const star = cls => icon('star', {cls, fill: true});

function resultRow(item, ui, overdue) {
  const node = button('', () => ui.openView({view: 'rpm', collection: 'blocks', id: item.id}), 'soon-result');
  node.append(icon('hourglass_empty', {cls: 'soon-mark'}));
  const words = el('span', 'soon-words');
  words.append(el('span', 'soon-what', item.title), el('span', 'soon-left', `${item.left} ${item.left === 1 ? 'task' : 'tasks'} left`));
  node.append(words);
  if (item.when) node.append(el('span', `soon-time tnum${overdue ? ' overdue' : ''}`, item.when));
  node.setAttribute('aria-label', `${item.title}, due ${overdue ? 'since ' : ''}${item.when || 'end of day'}, ${item.left} left`);
  return node;
}

function mustRow(item, ui, nested) {
  const node = button('', () => ui.taskEditor(item.id), `soon-must${nested ? ' nested' : ''}`);
  node.append(star('soon-star'), el('span', 'soon-what', item.title));
  if (item.when) node.append(el('span', 'soon-time tnum', item.when));
  return node;
}

export function renderAgenda(host, data, ui, now = new Date()) {
  const groups = comingUp(data, now, ui.day?.() ?? localDay(now));
  const panel = el('section', 'agenda-soon');
  panel.setAttribute('aria-label', 'Coming up');
  panel.append(el('h2', 'soon-head', 'Coming up'));
  if (!groups.length) panel.append(el('p', 'soon-empty', 'Nothing due in the next two weeks'));
  for (const {day, items} of groups) {
    const section = el('section', 'soon-day');
    const name = groupName(day, now);
    section.setAttribute('aria-label', name);
    section.append(el('h3', `soon-name tnum${day === 'overdue' ? ' overdue' : ''}`, name));
    for (const item of items) {
      if (item.kind === 'must') section.append(mustRow(item, ui, false));
      else section.append(resultRow(item, ui, day === 'overdue'), ...item.musts.map(must => mustRow(must, ui, true)));
    }
    panel.append(section);
  }
  host.replaceChildren(panel);
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
