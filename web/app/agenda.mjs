import {blockDue, blockTasks, localDay, localStamp, tasks} from '../../android-companion/planner-state.mjs';
import {dayTasks} from '../../android-companion/planner-ux.mjs';
import {openResults} from '../../android-companion/planner/today-model.mjs';
import {dueInfo} from '../../android-companion/planner/format.mjs';
import {button, el, icon} from '../../android-companion/planner/dom.mjs';
import {isWide, onWidthChange} from './desktop.mjs';

const MOST = 6;

const dueValue = task => task.planned ? localStamp(task.planned) : task.plannedDate;

/**
 * The deadlines ahead, soonest first: each open Result with a due date, then each Must after today that no listed
 * Result holds. Today's timeline already shows today, so a Must due today is left out.
 */
export function agendaModel(data, now = new Date()) {
  const today = localDay(now);
  const onToday = new Set(dayTasks(data, today, +now).active.map(task => task.id));
  const held = new Set();
  const results = openResults(data).flatMap(block => {
    const due = dueInfo(blockDue(data, block.id)?.value, now);
    if (!due) return [];
    const open = blockTasks(data, block.id).filter(task => !task.done);
    for (const task of open) held.add(task.id);
    const next = open.find(task => !onToday.has(task.id));
    return [{kind: 'result', id: block.id, title: block.title, due, left: open.length, next: next?.title ?? ''}];
  });
  const musts = tasks(data).filter(task => task.must && !task.done && !task.recurrence && !task.repeatAfterDays && !held.has(task.id) && !onToday.has(task.id))
    .flatMap(task => {
      const value = dueValue(task);
      if (!value || value.slice(0, 10) <= today) return [];
      return [{kind: 'must', id: task.id, title: task.title, due: dueInfo(value, now)}];
    });
  return [...results, ...musts].sort((a, b) => a.due.at - b.due.at).slice(0, MOST);
}

const when = due => due.label.replace(/^Due /, '').replace(/^./, c => c.toUpperCase());
const left = item => item.kind === 'result'
  ? [`${item.left} ${item.left === 1 ? 'task' : 'tasks'} left`, item.next].filter(Boolean).join(' · ') : '';

function deadline(item, ui) {
  const open = item.kind === 'result' ? () => ui.openView({view: 'rpm', collection: 'blocks', id: item.id}) : () => ui.taskEditor(item.id);
  const node = button('', open, 'next-item');
  node.append(icon(item.kind === 'result' ? 'hourglass_empty' : 'star', {cls: `next-mark${item.kind === 'must' ? ' must' : ''}`, fill: item.kind === 'must'}));
  const words = el('span', 'next-words');
  words.append(el('span', `next-when tnum${/^(Today|Tomorrow|Overdue)/.test(when(item.due)) ? ' soon' : ''}`, when(item.due)), el('span', 'next-what', item.title));
  const rest = left(item);
  if (rest) words.append(el('span', 'next-left', rest));
  node.append(words);
  return node;
}

export function renderAgenda(host, data, ui, now = new Date()) {
  const items = agendaModel(data, now);
  const panel = el('section', 'agenda-next');
  panel.setAttribute('aria-label', 'Next');
  panel.append(el('h2', 'next-head', 'Next'));
  if (items.length) panel.append(...items.map(item => deadline(item, ui)));
  else panel.append(el('p', 'next-empty', 'No deadlines ahead'));
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
