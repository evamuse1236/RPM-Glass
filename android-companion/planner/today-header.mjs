/** Today's head: the date, the next seven days and one line on where the week's plan stands. */
import {localDay, shiftDay, blockDue} from '../planner-state.mjs';
import {dayTasks} from '../planner-ux.mjs';
import {weekStart, reviewWeek, weekFocus, resultStatus} from '../review-state.mjs';
import {reducedMotion, DURATION, EASE} from '../surface-motion.mjs';
import {lockAxis, LONG_PRESS} from '../task-swipe.mjs';
import {el, icon, button, iconButton, labelButton, emptyState} from './dom.mjs';
import {clock, longDate, plural, dateText} from './format.mjs';
import {openSheet} from './sheet.mjs';
import {taskWhen, taskRow} from './task-row.mjs';
import {phrase, sep} from './today-row.mjs';
import {openResults, clashes} from './today-model.mjs';

const SELECTED = '.day-page .week-strip .week-day[aria-pressed=true] .week-number';
const dayGap = (from, to) => Math.round((Date.parse(to + 'T12:00') - Date.parse(from + 'T12:00')) / 864e5);
/** The first day of the strip that shows `day`: seven days running forward from today, a week at a time. */
export const stripStart = (day, today = localDay()) => shiftDay(today, 7 * Math.floor(dayGap(today, day) / 7));

/**
 * Inside the shown week the head stays still: the selected ring slides to the new day (250ms emphasized) while its
 * number takes the ring's colour, and the content below fades through (or moves on the X axis after a swipe).
 */
export function selectDay(app, day, direction = '') {
  const before = app.dom.work.querySelector(SELECTED);
  const target = app.dom.work.querySelector(`.day-page .week-strip .week-day[data-day="${day}"] .week-number`);
  const from = before?.getBoundingClientRect();
  const color = target && getComputedStyle(target).color;
  const keepHead = !!before && stripStart(day) === stripStart(app.state.day);
  app.state.day = day;
  app.render({reset: true, direction, keepHead});
  const number = app.dom.work.querySelector(SELECTED);
  if (!keepHead || !number || reducedMotion()) return;
  const to = number.getBoundingClientRect();
  if (Math.abs(to.left - from.left) < 1) return;
  const timing = {duration: DURATION.medium1, easing: EASE.emphasized};
  number.animate([{translate: `${from.left - to.left}px 0`}, {translate: '0 0'}], {...timing, pseudoElement: '::before'});
  number.animate([{color}, {color: getComputedStyle(number).color}], timing);
}
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
  const first = stripStart(day, today);
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
    cell.dataset.day = key;
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
  stripGestures(app, strip);
  return strip;
}

/** Swipe right shows the previous week and left the next; holding a day opens that day's tasks in a sheet. */
function stripGestures(app, strip) {
  let start = null, axis = null, swallow = false, timer = 0;
  const hold = (cell, pressed) => {
    start = null;
    swallow = pressed;
    app.api.native('haptic').catch(() => {});
    daySheet(app, cell.dataset.day);
  };
  strip.addEventListener('pointerdown', event => {
    swallow = false;
    if (event.button > 0) return;
    const cell = event.target.closest('.week-day');
    start = {x: event.clientX, y: event.clientY};
    axis = null;
    clearTimeout(timer);
    if (cell) timer = setTimeout(() => { if (start && !axis) hold(cell, true); }, LONG_PRESS);
  });
  strip.addEventListener('pointermove', event => {
    if (!start || axis) return;
    axis = lockAxis(event.clientX - start.x, event.clientY - start.y);
    if (axis) clearTimeout(timer);
  });
  strip.addEventListener('pointerup', event => {
    clearTimeout(timer);
    setTimeout(() => { swallow = false; });
    if (!start) return;
    const dx = event.clientX - start.x;
    const swiped = axis === 'x' && Math.abs(dx) >= WEEK_SWIPE;
    start = null;
    if (!swiped) return;
    swallow = true;
    selectDay(app, shiftDay(app.state.day, dx < 0 ? 7 : -7), dx < 0 ? 'right' : 'left');
  });
  strip.addEventListener('pointercancel', () => { clearTimeout(timer); start = null; });
  strip.addEventListener('contextmenu', event => {
    const cell = event.target.closest('.week-day');
    if (!cell) return;
    event.preventDefault();
    if (!swallow) hold(cell, false);
  });
  strip.addEventListener('click', event => {
    if (!swallow) return;
    swallow = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

const WEEK_SWIPE = 70;

/** One day's tasks without leaving the day on screen; Open day goes there. */
function daySheet(app, day) {
  const {body, actions} = openSheet(app, longDate(day), {variant: 'choice'});
  const paint = () => {
    const {active, completed} = dayTasks(app.data(), day);
    body.replaceChildren(...[...active, ...completed].map(task => taskRow(app, task)));
    if (!body.children.length) body.append(emptyState({symbol: 'event_available', title: 'Nothing planned',
      body: 'Tasks you plan for this day show here.'}));
  };
  paint();
  app.sheetRefresh = paint;
  actions.append(button('Open day', () => { app.closeSheet(); selectDay(app, day); }, 'filled-btn'));
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
