/** Today: date header with a 7-day strip, the week card, what is due soon, and the day grouped by Result. */
import {localDay, shiftDay, planner, blockTasks, blockDue, timelineItems} from '../planner-state.mjs';
import {dayTasks} from '../planner-ux.mjs';
import {setClarityPreference} from '../planner-clarity.mjs';
import {weekStart, reviewWeek, weekFocus, resultStatus, inboxTasks} from '../review-state.mjs';
import {el, icon, button, emptyState, areaDot, labelButton} from './dom.mjs';
import {clock, longDate, plural, dateText, dueInfo} from './format.mjs';
import {taskRow, completedSection, taskWhen} from './task-row.mjs';
import {renderTimeline} from './timeline.mjs';

export function setDayLayout(app, value) {
  if (value === 'timeline' && app.largeText()) {
    app.notice('Agenda stays on with large text so every item remains readable.');
    return;
  }
  app.state.dayLayout = value === 'timeline' ? 'timeline' : 'agenda';
  setClarityPreference('day-layout', app.state.dayLayout);
  app.render({reset: true});
}

export function selectDay(app, day, direction = '') {
  app.state.day = day;
  app.render({reset: true, direction});
}

const DUE_DAYS = 3;

/** Open Results whose deadline falls before the end of the third day from today (or has passed), soonest first. */
export function dueSoon(data, now = new Date()) {
  const until = new Date(shiftDay(localDay(now), DUE_DAYS + 1) + 'T00:00');
  return planner(data).blocks.filter(block => !block.archived && block.achieved !== true)
    .map(block => ({block, due: dueInfo(blockDue(data, block.id)?.value, now)}))
    .filter(({due}) => due && due.at < until)
    .sort((a, b) => a.due.at - b.due.at);
}

/** Time left until `at`, coarse enough to read at a glance: "40 min", "37 h", "3 days"; null once it has passed. */
export function timeLeft(at, now = new Date()) {
  const minutes = Math.round((at - now) / 60000);
  if (minutes < 0) return null;
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}
export const countdown = (at, now = new Date()) => (timeLeft(at, now) ? 'in ' + timeLeft(at, now) : 'Overdue');

/** Relative labels stay true while Today is open: each node names its own instant and kind. */
const LIVE = {
  timed: at => `${clock(at)} · ${countdown(at)}`,
  day: at => `End of day · ${countdown(at)}`,
  next: at => `Now ${clock(Date.now())} · ` + (timeLeft(at) ? `next starts in ${timeLeft(at)}` : 'next has started'),
  current: at => `Now ${clock(Date.now())} · ` + (timeLeft(at) ? `${timeLeft(at)} left` : 'time is up'),
};
function live(node, kind, at) {
  node.dataset.live = kind;
  node.dataset.at = String(+at);
  node.textContent = LIVE[kind](+at);
  tick();
  return node;
}
let ticking = false;
function tick() {
  if (ticking) return;
  ticking = true;
  setInterval(() => {
    for (const node of document.querySelectorAll('[data-live]')) node.textContent = LIVE[node.dataset.live](+node.dataset.at);
  }, 30000);
}

function weekStrip(app) {
  const {day} = app.state;
  const strip = el('div', 'week-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Week');
  const monday = weekStart(day);
  const today = localDay();
  const data = app.data();
  // Days that hold a Result's deadline get a flag; other days with tasks keep the quiet dot.
  const dues = new Map();
  for (const block of planner(data).blocks.filter(b => !b.archived && b.achieved !== true)) {
    const value = blockDue(data, block.id)?.value;
    if (value) dues.set(value.slice(0, 10), (dues.get(value.slice(0, 10)) ?? 0) + 1);
  }
  for (let i = 0; i < 7; i++) {
    const key = shiftDay(monday, i);
    const date = new Date(key + 'T12:00');
    const cell = button('', () => selectDay(app, key), 'week-day');
    cell.classList.toggle('is-today', key === today);
    const due = dues.get(key) ?? 0;
    cell.setAttribute('aria-label', dateText(date) + (key === today ? ', today' : '') + (due ? `, ${plural(due, 'Result')} due` : ''));
    cell.setAttribute('aria-pressed', String(key === day));
    const model = dayTasks(data, key);
    const dot = due ? icon('hourglass_bottom', {fill: true, cls: 'day-due'}) : el('span', 'day-dot');
    dot.hidden = !due && !model.active.length && !model.completed.length;
    cell.append(
      el('span', 'week-letter', date.toLocaleDateString([], {weekday: 'narrow'})),
      el('span', 'week-number tnum', String(date.getDate())),
      dot,
    );
    strip.append(cell);
  }
  let startX = null;
  strip.addEventListener('pointerdown', event => { startX = event.clientX; });
  strip.addEventListener('pointerup', event => {
    if (startX == null) return;
    const dx = event.clientX - startX;
    startX = null;
    if (strip.scrollWidth <= strip.clientWidth + 1 && Math.abs(dx) > 70) {
      selectDay(app, shiftDay(day, dx < 0 ? 7 : -7), dx < 0 ? 'right' : 'left');
    }
  });
  requestAnimationFrame(() => {
    const selected = strip.querySelector('[aria-pressed=true]');
    if (selected && strip.scrollWidth > strip.clientWidth) {
      strip.scrollLeft = selected.offsetLeft - (strip.clientWidth - selected.offsetWidth) / 2;
    }
  });
  return strip;
}

function dateHeader(app) {
  const {day} = app.state;
  const header = el('div', 'day-header');
  const line = el('div', 'date-line');
  const picker = button('', () => app.actions.datePicker(), 'date-button');
  picker.append(el('span', '', longDate(day)), icon('arrow_drop_down'));
  picker.setAttribute('aria-label', 'Choose date, ' + longDate(day));
  line.append(picker);
  if (day !== localDay()) line.append(labelButton('today', 'Today', () => selectDay(app, localDay()), 'tonal-btn small'));
  header.append(line, weekStrip(app));
  return header;
}

const weekName = (week, month = 'long') => 'week of ' + new Date(week + 'T12:00').toLocaleDateString([], {month, day: 'numeric'});
const capital = text => text[0].toUpperCase() + text.slice(1);

/**
 * The week card. Monday to Thursday it shows this week's Results (or invites planning them); Friday to Sunday,
 * when the review plans the coming week, it asks for that plan until it exists. Progress never reads as "all is well":
 * only Results the user marked achieved count.
 */
function weekCard(app) {
  const today = localDay();
  const week = weekStart(today);
  if (weekStart(app.state.day) !== week) return null;
  const data = app.data();
  const focus = weekFocus(data, week);
  const next = reviewWeek(today);
  if (next !== week) {
    const planned = weekFocus(data, next);
    if (!planned.length) {
      const card = el('section', 'week-card plan-card');
      const copy = el('span', 'week-card-copy');
      const title = `${capital(weekName(next, 'short'))} isn't planned`;
      copy.append(el('strong', '', title), el('span', '', 'Review this week, then pick 3 to 5 Results'));
      const plan = button('Plan now', () => app.openReview(), 'filled-btn');
      plan.setAttribute('aria-label', 'Plan now: start the weekly review for the ' + weekName(next));
      card.setAttribute('aria-label', title);
      card.append(icon('event_upcoming'), copy, plan);
      return card;
    }
    return weekButton(app, 'event_available', `${plural(planned.length, 'Result')} planned for next week`,
      capital(weekName(next)), 'Review');
  }
  if (!focus.length) return weekButton(app, 'event_upcoming', 'Plan your week', 'Choose 3 to 5 Results that matter most', 'Start');
  const achieved = focus.filter(id => resultStatus(data, id).achieved).length;
  const headline = achieved ? `${achieved} of ${plural(focus.length, 'Result')} achieved this week` : `${plural(focus.length, 'Result')} this week`;
  return weekButton(app, 'flag', headline, achieved ? weekName(week) : 'None marked achieved yet', 'Review');
}

function weekButton(app, symbol, headline, supporting, action) {
  const card = button('', () => app.openReview(), 'week-card');
  const copy = el('span', 'week-card-copy');
  copy.append(el('strong', '', headline), el('span', '', supporting));
  card.append(icon(symbol), copy, el('span', 'week-card-action', action));
  card.setAttribute('aria-label', `${headline}. ${supporting}. Open weekly review`);
  return card;
}

/** Results due in the next three days, Calendar-schedule style: the day once, then each Result with its countdown. */
function dueSection(app, now = new Date()) {
  const data = app.data();
  const rows = dueSoon(data, now);
  if (!rows.length) return null;
  const section = el('section', 'due-section');
  const head = el('div', 'due-head');
  head.append(icon('hourglass_bottom', {fill: true}), el('h2', '', 'Due soon'), el('small', '', 'Next 3 days'));
  const list = el('div', 'due-list');
  let lastDay = null;
  for (const {block, due} of rows) {
    const day = localDay(due.at);
    const status = resultStatus(data, block.id);
    const left = status.total - status.done;
    const row = button('', () => app.openBlock(block.id), 'due-row');
    row.classList.toggle('overdue', due.overdue);
    const badge = el('span', 'due-day');
    if (day !== lastDay) {
      const date = new Date(day + 'T12:00');
      badge.append(el('span', 'due-weekday', date.toLocaleDateString([], {weekday: 'short'})),
        el('span', 'due-date tnum', String(date.getDate())));
      badge.classList.toggle('is-today', day === localDay(now));
    }
    lastDay = day;
    const copy = el('span', 'due-copy');
    const timed = blockDue(data, block.id)?.value?.includes('T');
    const meta = el('span', 'due-meta tnum');
    meta.append(due.overdue ? el('b', 'due-overdue', 'Overdue') : live(el('span'), timed ? 'timed' : 'day', due.at),
      ` · ${plural(left, 'task')} left`);
    copy.append(el('span', 'due-title', block.title), meta);
    row.append(badge, copy);
    row.setAttribute('aria-label', `${block.title}. ${due.label}, ${countdown(due.at, now)}. ${plural(left, 'task')} left. Open Block`);
    list.append(row);
  }
  section.append(head, list);
  return section;
}

/** Group the day's open tasks by Block; groups ordered by their first time, No block last. */
function groupByResult(app, active, focusId) {
  const groups = new Map();
  for (const task of active) {
    const key = task.blockId ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  const order = task => taskWhen(task) ?? Infinity;
  const planIndex = new Map();
  for (const [key] of groups) blockTasks(app.data(), key).forEach((t, i) => planIndex.set(t.id, i));
  const list = [...groups.entries()].map(([blockId, rows]) => {
    rows.sort((a, b) => order(a) - order(b) || (planIndex.get(a.id) ?? 0) - (planIndex.get(b.id) ?? 0));
    const block = app.p().blocks.find(b => b.id === blockId) ?? null;
    const first = Math.min(...rows.map(order));
    const hasFocus = rows.some(task => task.id === focusId);
    return {blockId, block, rows, first, hasFocus, must: rows.some(task => task.must)};
  });
  return list.sort((a, b) => {
    if (!a.block !== !b.block) return a.block ? -1 : 1;
    if (a.hasFocus !== b.hasFocus) return a.hasFocus ? -1 : 1;
    return a.first - b.first || Number(b.must) - Number(a.must);
  });
}

/** Result title, then Purpose, then one line of facts: Area, tasks done, and the deadline when there is one. */
function resultHeader(app, group) {
  const {block} = group;
  const data = app.data();
  const head = button('', () => app.openBlock(block.id), 'result-head');
  const status = resultStatus(data, block.id);
  const area = app.blockArea(block);
  const due = dueInfo(blockDue(data, block.id)?.value);
  const copy = el('span', 'result-copy');
  copy.append(el('span', 'result-title', block.title));
  if (block.purpose) copy.append(el('span', 'result-purpose', block.purpose));
  const meta = el('span', 'result-meta tnum');
  const facts = [el('span', '', `${status.done} of ${plural(status.total, 'task')} done`)];
  if (area) facts.unshift(el('span', '', area.title));
  if (due) facts.push(el('span', due.overdue ? 'is-overdue' : '', due.label));
  if (area) meta.append(areaDot(app.tone(area)));
  facts.forEach((fact, i) => meta.append(...(i ? [el('span', 'sep', '·'), fact] : [fact])));
  copy.append(meta);
  head.append(copy);
  head.setAttribute('aria-label', `Result: ${block.title}. Purpose: ${block.purpose || 'none yet'}. `
    + `${status.done} of ${plural(status.total, 'task')} done${due ? '. ' + due.label : ''}. Open Block`);
  return head;
}

/** Calendar's now line, placed above the Next (or current) task with how long until it starts or ends. */
function nowMarker(task, now) {
  const marker = el('div', 'now-marker');
  const current = task.start <= now;
  marker.append(el('span', 'now-pin'), live(el('span', 'now-text tnum'), current ? 'current' : 'next', current ? task.end : task.start));
  return marker;
}

function calendarGroup(app, events) {
  const group = el('section', 'result-group calendar-group');
  const head = el('div', 'result-head static');
  head.append(icon('event', {cls: 'result-icon'}));
  const copy = el('span', 'result-copy');
  copy.append(el('span', 'result-title', 'Calendar'), el('span', 'result-purpose', 'Read-only events from this phone'));
  head.append(copy);
  group.append(head);
  for (const event of events) {
    const row = button('', () => app.actions.calendarDetails(event), 'event-row');
    const when = event.allDay ? 'All day' : `${clock(event.start)} – ${clock(event.end)}`;
    row.append(el('span', 'event-bar'), el('span', 'event-title', event.title), el('span', 'event-time tnum', when));
    group.append(row);
  }
  return group;
}

function renderAgenda(app, page, model, events) {
  const now = Date.now();
  const focus = model.focus;
  // A task completed a moment ago stays in its group briefly, so the list doesn't jump under the thumb.
  const recent = model.completed.filter(task => app.recentlyCompleted.has(task.id));
  const active = [...model.active, ...recent];
  const rowFor = (parent, task) => {
    const isFocus = task.id === focus?.id;
    if (isFocus) parent.append(nowMarker(task, now));
    parent.append(taskRow(app, task, {current: isFocus && task.start <= now, next: isFocus && task.start > now, anytime: true}));
  };
  const groups = groupByResult(app, active, focus?.id);
  for (const group of groups.filter(g => g.block)) {
    const section = el('section', 'result-group');
    section.dataset.tone = app.tone(app.blockArea(group.block));
    section.append(resultHeader(app, group));
    for (const task of group.rows) rowFor(section, task);
    page.append(section);
  }
  if (events.length) page.append(calendarGroup(app, events));
  // Today's tasks with no Block: a quiet list, not a second Inbox. The Inbox row below holds the whole backlog.
  const loose = groups.find(g => !g.block);
  if (loose) {
    const section = el('section', 'also-today');
    const head = el('h2', 'also-head', 'Also today');
    section.append(head);
    for (const task of loose.rows) rowFor(section, task);
    page.append(section);
  }
  completedSection(app, page, model.completed.filter(task => !app.recentlyCompleted.has(task.id)));
}

function inboxRow(app) {
  const count = inboxTasks(app.data()).length;
  const row = button('', () => app.actions.inbox(), 'list-item inbox-row');
  row.append(icon('inbox', {cls: 'leading'}));
  const copy = el('span', 'list-copy');
  copy.append(el('span', 'list-headline', 'Inbox'), el('span', 'list-supporting', count ? 'Not in a Block yet' : 'Empty'));
  row.append(copy);
  if (count) row.append(el('span', 'trailing-value tnum', String(count)));
  row.append(icon('chevron_right', {cls: 'trailing'}));
  row.setAttribute('aria-label', `Inbox, ${count ? plural(count, 'task') + ' not in a Block yet' : 'empty'}`);
  return row;
}

export function renderToday(app, page) {
  const {day, calendar} = app.state;
  const data = app.data();
  const model = dayTasks(data, day);
  page.append(dateHeader(app));
  const card = weekCard(app);
  if (card) page.append(card);
  const due = day === localDay() ? dueSection(app) : null;
  if (due) page.append(due);
  const events = timelineItems(data, day, calendar).filter(item => item.source === 'calendar');
  const empty = !model.active.length && !model.completed.length && !events.length;
  if (app.state.dayLayout === 'timeline' && !app.largeText()) {
    renderTimeline(app, page, model.active);
    completedSection(app, page, model.completed);
  } else if (empty) {
    page.append(emptyState({
      symbol: 'wb_sunny',
      title: day === localDay() ? 'Nothing planned for today' : 'Nothing planned for this day',
      body: 'Start with a Result that matters, then choose its first task.',
      action: () => app.actions.newEntity('blocks'),
      label: 'Plan a Block',
      secondary: button('Add a task', () => app.actions.addTask({plannedDate: day}), 'text-btn'),
    }));
  } else {
    renderAgenda(app, page, model, events);
  }
  page.append(inboxRow(app));
}

/** Timeline opens near now; Agenda opens at the top. */
export function todayScroll(app) {
  if (app.state.dayLayout !== 'timeline' || app.largeText()) return 0;
  const marker = app.dom.work.querySelector('.now-line') ?? app.dom.work.querySelector('.timed');
  if (!marker) return 0;
  const host = app.dom.scroll.getBoundingClientRect().top;
  return Math.max(0, marker.getBoundingClientRect().top - host + app.dom.scroll.scrollTop - 160);
}
