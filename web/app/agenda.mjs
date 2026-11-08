import {blockDue, blockTasks, localDay, localStamp, shiftDay, tasks} from '../../android-companion/planner-state.mjs';
import {openResults} from '../../android-companion/planner/today-model.mjs';
import {clock, DATE_LOCALE, dueInfo} from '../../android-companion/planner/format.mjs';
import {button, el, icon} from '../../android-companion/planner/dom.mjs';
import {isWide, onWidthChange} from './desktop.mjs';

const GROUPS = 6;
const AHEAD = 13;
const MISSED_DAYS = 7;

const dueValue = task => task.planned ? localStamp(task.planned) : task.plannedDate;
const timed = value => value.length > 10;
const order = value => (timed(value) ? value : value + 'T24');
const openMusts = data => tasks(data).filter(task => task.must && !task.done && !task.recurrence && !task.repeatAfterDays && dueValue(task));
const timeOf = value => (timed(value) ? clock(new Date(value)) : '');

/**
 * Coming up: the days after today's centre, each named once, with one row per deadline. A Result's deadline leads with
 * its open Must for that day (the action), the Result on a quiet second line; with no such Must it leads with the Result.
 * Other one-time Musts follow, with their Result as the second line when they have one. Every item sits under its own
 * day. Empty days and the day the centre shows are left out; what is already past (a deadline, or a Must of the last week
 * not done) heads the list as Overdue, never under a day still to come.
 */
export function comingUp(data, now = new Date(), shown = localDay(now)) {
  const today = localDay(now), last = shiftDay(today, AHEAD), since = shiftDay(today, -MISSED_DAYS);
  const groups = new Map();
  const group = key => {
    if (!groups.has(key)) groups.set(key, {day: key, items: []});
    return groups.get(key).items;
  };
  const keyOf = value => (endOf(value) < +now ? 'overdue' : value.slice(0, 10));
  const listed = value => value.slice(0, 10) !== shown && (keyOf(value) === 'overdue' ? value.slice(0, 10) >= since : value.slice(0, 10) <= last);
  const whenOf = (value, day) => (day === 'overdue' ? pastWhen(value, today) : timeOf(value));
  const results = new Map(openResults(data).map(block => [block.id, block]));
  const left = id => blockTasks(data, id).filter(task => !task.done).length;
  const held = new Set();
  for (const block of results.values()) {
    const value = blockDue(data, block.id)?.value;
    const due = dueInfo(value, now);
    if (!due) continue;
    const day = due.overdue ? 'overdue' : value.slice(0, 10);
    if (day !== 'overdue' && (day === shown || day > last)) continue;
    const musts = blockTasks(data, block.id).filter(task => !task.done && task.must && dueValue(task) && keyOf(dueValue(task)) === day
      && listed(dueValue(task)));
    for (const task of musts) held.add(task.id);
    const under = {block: block.title, left: left(block.id)};
    if (!musts.length) group(day).push({kind: 'result', id: block.id, title: block.title, at: +due.at, when: whenOf(value, day), left: under.left});
    for (const task of musts) {
      const own = dueValue(task), at = timed(own) ? own : value;
      group(day).push({kind: 'must', id: task.id, title: task.title, at: endOf(at), when: whenOf(at, day), ...under});
    }
  }
  for (const task of openMusts(data)) {
    const value = dueValue(task);
    if (held.has(task.id) || !listed(value)) continue;
    const day = keyOf(value), result = results.get(task.blockId);
    group(day).push({kind: 'must', id: task.id, title: task.title, at: endOf(value), when: whenOf(value, day),
      ...(result && {block: result.title, left: left(result.id)})});
  }
  for (const entry of groups.values()) entry.items.sort((a, b) => a.at - b.at);
  return [...groups.values()].sort((a, b) => (a.day === 'overdue' ? -1 : b.day === 'overdue' ? 1 : a.day.localeCompare(b.day))).slice(0, GROUPS);
}

/** When a dated item is over: its time, or the end of its day when it has none. */
const endOf = value => +new Date(order(value).replace('T24', 'T23:59'));
/**
 * A past item under Overdue says when it was due as other rows do: today, only its time; this past week, its weekday;
 * older, its full date.
 */
const pastWhen = (value, today) => {
  const day = value.slice(0, 10), time = timed(value) ? timeOf(value) : '';
  if (day === today) return time || 'Today';
  const name = day >= shiftDay(today, -6) ? new Date(day + 'T12:00').toLocaleDateString(DATE_LOCALE, {weekday: 'long'}) : fullDay(day);
  return [name, time].filter(Boolean).join(', ');
};

const fullDay = day => new Date(day + 'T12:00').toLocaleDateString(DATE_LOCALE, {weekday: 'short', day: 'numeric', month: 'long'});
/** A day heading is its full date; the real today and tomorrow (whatever day the centre shows) also say so. */
export function groupName(day, now) {
  if (day === 'overdue') return 'Overdue';
  const word = day === localDay(now) ? 'Today' : day === shiftDay(localDay(now), 1) ? 'Tomorrow' : '';
  return [word, fullDay(day)].filter(Boolean).join(' · ');
}
const star = cls => icon('star', {cls, fill: true});

const tasksLeft = n => `${n} ${n === 1 ? 'task' : 'tasks'} left`;

/** One deadline row: a star for a Must or an hourglass for a Result, the title wrapping in full, one quiet line under it. */
function soonRow(item, ui, overdue) {
  const must = item.kind === 'must';
  const node = button('', () => (must ? ui.taskEditor(item.id) : ui.openView({view: 'rpm', collection: 'blocks', id: item.id})), 'soon-row');
  node.append(must ? star('soon-star') : icon('hourglass_empty', {cls: 'soon-mark'}));
  const words = el('span', 'soon-words');
  words.append(el('span', 'soon-what', item.title));
  const count = item.left != null && (!must || item.block) ? tasksLeft(item.left) : '';
  if (item.block || count) {
    const under = el('span', 'soon-left');
    if (must && item.block) under.append(el('span', 'soon-block', item.block));
    if (count) under.append(el('span', 'soon-count', (under.textContent ? '\u00a0· ' : '') + count));
    words.append(under);
  }
  node.append(words);
  if (item.when) node.append(el('span', `soon-time tnum${overdue ? ' overdue' : ''}`, item.when));
  node.setAttribute('aria-label', [item.title, item.block, `${overdue ? 'due since' : 'due'} ${item.when || 'end of day'}`,
    item.left != null && tasksLeft(item.left)].filter(Boolean).join(', '));
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
    for (const item of items) section.append(soonRow(item, ui, day === 'overdue'));
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
