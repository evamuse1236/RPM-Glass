/** Today: compact date header with a 7-day strip, the "This week" card, and the day grouped by Result. */
import {localDay, shiftDay, tasks, blockTasks, timelineItems} from '../planner-state.mjs';
import {dayTasks} from '../planner-ux.mjs';
import {setClarityPreference} from '../planner-clarity.mjs';
import {weekStart, weekFocus, resultStatus} from '../review-state.mjs';
import {el, icon, button, emptyState, areaDot, labelButton} from './dom.mjs';
import {clock, longDate, plural, dateText} from './format.mjs';
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

function weekStrip(app) {
  const {day} = app.state;
  const strip = el('div', 'week-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Week');
  const monday = weekStart(day);
  const today = localDay();
  for (let i = 0; i < 7; i++) {
    const key = shiftDay(monday, i);
    const date = new Date(key + 'T12:00');
    const cell = button('', () => selectDay(app, key), 'week-day');
    cell.classList.toggle('is-today', key === today);
    cell.setAttribute('aria-label', dateText(date) + (key === today ? ', today' : ''));
    cell.setAttribute('aria-pressed', String(key === day));
    const model = dayTasks(app.data(), key);
    const dot = el('span', 'day-dot');
    dot.hidden = !model.active.length && !model.completed.length;
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

/** "This week" card: the week's chosen Results, or an invitation to plan the week. */
function weekCard(app) {
  const week = weekStart(app.state.day);
  if (week !== weekStart(localDay())) return null;
  const data = app.data();
  const focus = weekFocus(data, week);
  const card = button('', () => app.openReview(), 'week-card');
  const copy = el('span', 'week-card-copy');
  const weekLabel = 'Week of ' + new Date(week + 'T12:00').toLocaleDateString([], {day: 'numeric', month: 'long'});
  if (!focus.length) {
    card.append(icon('flag'));
    copy.append(el('strong', '', 'Plan your week'), el('span', '', 'Choose 3 to 5 Results that matter most'));
    card.append(copy, el('span', 'week-card-action', 'Start'));
    card.setAttribute('aria-label', 'Plan your week. Start the weekly review');
    return card;
  }
  const statuses = focus.map(id => resultStatus(data, id));
  const achieved = statuses.filter(status => status.achieved).length;
  const moving = statuses.filter(status => status.achieved || status.done > 0).length;
  const headline = achieved
    ? `${achieved} of ${plural(focus.length, 'weekly Result')} achieved`
    : `${moving} of ${plural(focus.length, 'weekly Result')} moving`;
  card.append(icon('flag', {fill: true}));
  copy.append(el('strong', '', headline), el('span', '', weekLabel));
  card.append(copy, el('span', 'week-card-action', 'Review'));
  card.setAttribute('aria-label', `${headline}, ${weekLabel}. Open weekly review`);
  return card;
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

function resultHeader(app, group) {
  const head = button('', () => (group.block ? app.openBlock(group.block.id) : app.actions.inbox()), 'result-head');
  if (group.block) {
    const rows = blockTasks(app.data(), group.block.id);
    head.append(areaDot(app.tone(app.blockArea(group.block))));
    const copy = el('span', 'result-copy');
    copy.append(el('span', 'result-title', group.block.title));
    if (group.block.purpose) copy.append(el('span', 'result-purpose', group.block.purpose));
    head.append(copy, el('span', 'result-count tnum', `${rows.filter(t => t.done).length}/${rows.length}`));
    head.setAttribute('aria-label', `Result: ${group.block.title}. Purpose: ${group.block.purpose || 'none yet'}. Open Block`);
  } else {
    head.append(icon('inbox', {cls: 'result-icon'}));
    const copy = el('span', 'result-copy');
    copy.append(el('span', 'result-title', 'No block'), el('span', 'result-purpose', 'Tasks not in a Block yet'));
    head.append(copy);
  }
  return head;
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
  let calendarShown = false;
  for (const group of groupByResult(app, active, focus?.id)) {
    if (!group.block && events.length) {
      page.append(calendarGroup(app, events));
      calendarShown = true;
    }
    const section = el('section', 'result-group');
    if (group.block) section.dataset.tone = app.tone(app.blockArea(group.block));
    section.append(resultHeader(app, group));
    for (const task of group.rows) {
      const isFocus = task.id === focus?.id;
      section.append(taskRow(app, task, {
        current: isFocus && task.start <= now,
        next: isFocus && task.start > now,
        anytime: true,
      }));
    }
    page.append(section);
  }
  if (events.length && !calendarShown) page.append(calendarGroup(app, events));
  completedSection(app, page, model.completed.filter(task => !app.recentlyCompleted.has(task.id)));
}

function inboxRow(app) {
  const count = tasks(app.data()).filter(task => !task.done && !task.blockId).length;
  const row = button('', () => app.actions.inbox(), 'list-item inbox-row');
  row.append(icon('inbox', {cls: 'leading'}));
  const copy = el('span', 'list-copy');
  copy.append(el('span', 'list-headline', 'Inbox'),
    el('span', 'list-supporting', count ? plural(count, 'task') + ' not in a Block' : 'Empty'));
  row.append(copy, icon('chevron_right', {cls: 'trailing'}));
  return row;
}

export function renderToday(app, page) {
  const {day, calendar} = app.state;
  const data = app.data();
  const model = dayTasks(data, day);
  page.append(dateHeader(app));
  const card = weekCard(app);
  if (card) page.append(card);
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
