/** Today's head: the date, the next seven days and one line on where the week's plan stands. */
import {localDay, shiftDay, blockDue} from '../planner-state.mjs';
import {dayTasks} from '../planner-ux.mjs';
import {weekStart, reviewWeek, weekFocus, resultStatus} from '../review-state.mjs';
import {el, icon, button, iconButton, labelButton} from './dom.mjs';
import {clock, longDate, plural, dateText} from './format.mjs';
import {taskWhen} from './task-row.mjs';
import {phrase, sep} from './today-row.mjs';
import {openResults, clashes} from './today-model.mjs';

export function selectDay(app, day, direction = '') {
  app.state.day = day;
  app.render({reset: true, direction});
}

const dayGap = (from, to) => Math.round((Date.parse(to + 'T12:00') - Date.parse(from + 'T12:00')) / 864e5);
export const dueDay = (data, block) => blockDue(data, block.id)?.value?.slice(0, 10);

/**
 * Seven days running forward from today, as far ahead as Dara plans; swiping steps a week. A day holding Results'
 * deadlines shows the hourglass with their count when more than one, a day with a calendar clash the clash mark, other
 * days with tasks a dot. Tapping a day opens it, and its deadlines and clash are listed at the top.
 */
function weekStrip(app) {
  const {day, calendar} = app.state;
  const strip = el('div', 'week-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Next seven days');
  const today = localDay();
  const first = shiftDay(today, 7 * Math.floor(dayGap(today, day) / 7));
  const data = app.data();
  const dues = new Map();
  for (const block of openResults(data)) {
    const value = dueDay(data, block);
    if (value) dues.set(value, (dues.get(value) ?? 0) + 1);
  }
  const from = new Date(Math.max(Date.now(), +new Date(first + 'T00:00')));
  const clashDays = new Set(clashes(data, calendar ?? [], from, new Date(shiftDay(first, 7) + 'T00:00'))
    .map(({items}) => localDay(items[1].start)));
  for (let i = 0; i < 7; i++) {
    const key = shiftDay(first, i);
    const date = new Date(key + 'T12:00');
    const cell = button('', () => selectDay(app, key), 'week-day');
    cell.classList.toggle('is-today', key === today);
    cell.classList.toggle('is-past', key < today);
    const due = dues.get(key) ?? 0, clash = clashDays.has(key);
    cell.setAttribute('aria-label', dateText(date) + (key === today ? ', today' : '')
      + (due ? `, ${plural(due, 'Result')} due` : '') + (clash ? ', calendar clash' : ''));
    cell.setAttribute('aria-pressed', String(key === day));
    const marks = el('span', 'day-marks');
    if (due) marks.append(icon('hourglass_bottom', {fill: true, cls: 'day-due'}));
    if (due > 1) marks.append(el('span', 'day-count tnum', String(due)));
    if (clash) marks.append(icon('event_busy', {cls: 'day-clash'}));
    if (!due && !clash) {
      const model = dayTasks(data, key);
      if (model.active.length || model.completed.length) marks.append(el('span', 'day-dot'));
    }
    cell.append(
      el('span', 'week-letter', date.toLocaleDateString([], {weekday: 'narrow'})),
      el('span', 'week-number tnum', String(date.getDate())),
      marks,
    );
    strip.append(cell);
  }
  let startX = null;
  strip.addEventListener('pointerdown', event => { startX = event.clientX; });
  strip.addEventListener('pointerup', event => {
    if (startX == null) return;
    const dx = event.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 70) selectDay(app, shiftDay(day, dx < 0 ? 7 : -7), dx < 0 ? 'right' : 'left');
  });
  return strip;
}

export function dateHeader(app, week) {
  const {day} = app.state;
  const header = el('div', 'day-header');
  const line = el('div', 'date-line');
  const picker = button('', () => app.actions.datePicker(), 'date-button');
  picker.append(el('span', '', longDate(day)), icon('arrow_drop_down'));
  picker.setAttribute('aria-label', 'Choose date, ' + longDate(day));
  line.append(picker);
  if (day !== localDay()) line.append(labelButton('today', 'Today', () => selectDay(app, localDay()), 'tonal-btn small'));
  const list = app.state.dayLayout === 'list';
  line.append(iconButton(list ? 'view_day' : 'view_agenda', list ? 'Show day' : 'Show list',
    () => app.actions.setDayLayout(list ? 'day' : 'list'), {cls: 'layout-toggle'}));
  header.append(line, weekStrip(app));
  if (week) header.append(week);
  return header;
}

const weekName = (week, month = 'long') => 'week of ' + new Date(week + 'T12:00').toLocaleDateString([], {month, day: 'numeric'});
const capital = text => text[0].toUpperCase() + text.slice(1);
/** The user's own "Weekly review" task today, named on the week line while the coming week needs a plan. */
const reviewTask = active => active.find(task => !task.blockId && task.title.trim().toLowerCase() === 'weekly review');

/**
 * One line under the strip on where the week's plan stands; the whole line opens the weekly review. Monday to Thursday
 * it counts this week's Results (only those the user marked achieved count); Friday to Sunday, until the coming week has
 * Results, it says that week isn't planned and when the user's own review is.
 */
export function weekLine(app, active) {
  const today = localDay(), week = weekStart(today), next = reviewWeek(today);
  const data = app.data();
  let lead, rest;
  if (next !== week) {
    const planned = weekFocus(data, next);
    const ritual = reviewTask(active), when = ritual && taskWhen(ritual);
    lead = planned.length ? `${plural(planned.length, 'Result')} planned for next week` : `${capital(weekName(next, 'short'))} isn't planned`;
    rest = planned.length ? '' : ritual ? `review ${when ? clock(when) : 'today'}` : 'pick 3 to 5 Results';
  } else {
    const focus = weekFocus(data, week);
    const achieved = focus.filter(id => resultStatus(data, id).achieved).length;
    lead = focus.length ? `${plural(focus.length, 'Result')} this week` : "This week isn't planned";
    rest = !focus.length ? 'pick 3 to 5 Results' : achieved ? `${achieved} achieved` : 'none marked achieved yet';
  }
  const row = button('', () => app.openReview(), 'week-line');
  const copy = el('span', 'week-line-text');
  copy.append(el('span', 'week-line-lead', lead));
  if (rest) copy.append(sep(), phrase(rest));
  row.append(icon('event_upcoming', {cls: 'leading'}), copy, icon('chevron_right', {cls: 'trailing'}));
  row.setAttribute('aria-label', `${lead}${rest ? ', ' + rest : ''}. Open weekly review`);
  return row;
}
