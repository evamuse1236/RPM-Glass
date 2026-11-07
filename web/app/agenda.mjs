import {blockDue, blockTasks, localDay, localStamp, shiftDay, tasks} from '../../android-companion/planner-state.mjs';
import {dayTasks} from '../../android-companion/planner-ux.mjs';
import {openResults} from '../../android-companion/planner/today-model.mjs';
import {clock, DATE_LOCALE, dueInfo} from '../../android-companion/planner/format.mjs';
import {button, el, icon} from '../../android-companion/planner/dom.mjs';
import {isWide, onWidthChange} from './desktop.mjs';

const MOST = 6;

const dueValue = task => task.planned ? localStamp(task.planned) : task.plannedDate;
const WEEK = 6;
const openMusts = data => tasks(data).filter(task => task.must && !task.done && !task.recurrence && !task.repeatAfterDays && dueValue(task));

/**
 * The deadlines ahead, soonest first: each open Result with a due date, then each Must past the Week list that no
 * listed Result holds. Today's timeline shows today and the Week list shows the next six days, so neither repeats here.
 */
export function agendaModel(data, now = new Date()) {
  const today = localDay(now), weekEnd = shiftDay(today, WEEK);
  const onToday = new Set(dayTasks(data, today, +now).active.map(task => task.id));
  const held = new Set();
  const results = openResults(data).flatMap(block => {
    const due = dueInfo(blockDue(data, block.id)?.value, now);
    if (!due) return [];
    const open = blockTasks(data, block.id).filter(task => !task.done);
    for (const task of open) held.add(task.id);
    const next = open.find(task => !onToday.has(task.id));
    return [{kind: 'result', id: block.id, title: block.title, due, left: open.length, next: next?.title ?? '', nextMust: !!next?.must}];
  });
  const musts = openMusts(data).filter(task => !held.has(task.id) && dueValue(task).slice(0, 10) > weekEnd)
    .map(task => ({kind: 'must', id: task.id, title: task.title, due: dueInfo(dueValue(task), now)}));
  return [...results, ...musts].sort((a, b) => a.due.at - b.due.at).slice(0, MOST);
}

/** The next six days, tomorrow first, each with its open one-time Musts in time order (untimed last). */
export function weekModel(data, now = new Date()) {
  const today = localDay(now);
  const musts = openMusts(data).sort((a, b) => (dueValue(a).length > 10 ? dueValue(a) : dueValue(a) + 'T24').localeCompare(dueValue(b).length > 10 ? dueValue(b) : dueValue(b) + 'T24'));
  return Array.from({length: WEEK}, (_, i) => {
    const day = shiftDay(today, i + 1);
    const items = musts.filter(task => dueValue(task).slice(0, 10) === day)
      .map(task => ({id: task.id, title: task.title, time: task.planned ? clock(new Date(task.planned)) : ''}));
    return {day, items};
  });
}

const when = due => due.label.replace(/^Due /, '').replace(/^./, c => c.toUpperCase());
const left = item => `${item.left} ${item.left === 1 ? 'task' : 'tasks'} left${item.next ? ' · ' : ''}`;
const star = cls => icon('star', {cls, fill: true});

function deadline(item, ui) {
  const open = item.kind === 'result' ? () => ui.openView({view: 'rpm', collection: 'blocks', id: item.id}) : () => ui.taskEditor(item.id);
  const node = button('', open, 'next-item');
  node.append(icon(item.kind === 'result' ? 'hourglass_empty' : 'star', {cls: `next-mark${item.kind === 'must' ? ' must' : ''}`, fill: item.kind === 'must'}));
  const words = el('span', 'next-words');
  words.append(el('span', `next-when tnum${item.due.overdue ? ' overdue' : ''}`, when(item.due)), el('span', 'next-what', item.title));
  if (item.kind === 'result') {
    const rest = el('span', 'next-left', left(item));
    if (item.next) {
      const next = el('span', 'next-task', item.next);
      if (item.nextMust) next.prepend(star('next-star'));
      rest.append(next);
    }
    words.append(rest);
  }
  node.append(words);
  return node;
}

const dayName = day => new Date(day + 'T12:00').toLocaleDateString(DATE_LOCALE, {weekday: 'short', day: 'numeric', month: 'short'});

function weekDay({day, items}, ui) {
  const group = el('section', 'week-day');
  group.setAttribute('aria-label', dayName(day));
  group.append(el('h3', 'week-name tnum', dayName(day)));
  if (!items.length) group.append(el('p', 'week-none', 'No Musts'));
  for (const item of items) {
    const row = button('', () => ui.taskEditor(item.id), 'week-must');
    row.append(star('week-star'), el('span', 'week-what', item.title));
    if (item.time) row.append(el('span', 'week-time tnum', item.time));
    group.append(row);
  }
  return group;
}

export function renderAgenda(host, data, ui, now = new Date()) {
  const items = agendaModel(data, now);
  const panel = el('section', 'agenda-next');
  panel.setAttribute('aria-label', 'Next');
  panel.append(el('h2', 'next-head', 'Next'));
  if (items.length) panel.append(...items.map(item => deadline(item, ui)));
  else panel.append(el('p', 'next-empty', 'No deadlines ahead'));
  panel.append(el('h2', 'next-head', 'This week'), ...weekModel(data, now).map(day => weekDay(day, ui)));
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
