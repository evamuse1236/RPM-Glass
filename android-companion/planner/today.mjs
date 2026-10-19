/**
 * Today opens in the Day layout (today-day.mjs: the whole day by time, at now). The list layout, one tap away, runs top
 * to bottom: the date, the next seven days and one line on the week's plan; one lead card for now (free time filled with
 * the nearest deadline's unscheduled tasks, or the next task, under its Result and Purpose); what is coming up in the
 * next three days, soonest first (every other deadline and calendar clash); the rest of the day as one time-ordered
 * agenda (tasks, calendar events and the free time between); the Inbox.
 */
import {localDay, shiftDay, planner, editPlan, tasks, blockDue, timelineItems} from '../planner-state.mjs';
import {dayTasks} from '../planner-ux.mjs';
import {setClarityPreference} from '../planner-clarity.mjs';
import {resultStatus, inboxTasks} from '../review-state.mjs';
import {el, icon, button, emptyState} from './dom.mjs';
import {clock, plural, dueInfo, relativeDay, timeLeft, countdown, duration, timeRange} from './format.mjs';
import {taskRow, completedSection} from './task-row.mjs';
import {listRow, phrase, sep} from './today-row.mjs';
import {openResults, upcoming, freeGap, gapResult, clashes} from './today-model.mjs';
import {dateHeader, weekLine, dueDay} from './today-header.mjs';
import {renderDay, dayScroll} from './today-day.mjs';

export {selectDay} from './today-header.mjs';

export function setDayLayout(app, value) {
  app.state.dayLayout = value === 'list' ? 'list' : 'day';
  setClarityPreference('today-layout', app.state.dayLayout);
  app.render({reset: true});
}

const GAP_MINUTES = 30;
/** Relative labels stay true while Today is open: each node names its own instant and kind. */
const LIVE = {
  left: at => countdown(at),
  next: at => (timeLeft(at) ? `in ${timeLeft(at)}` : 'starting now'),
  current: at => (timeLeft(at) ? `${timeLeft(at)} left` : 'time is up'),
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

/** "Mon", "Tomorrow", "Today": the day word of a clash. */
const dayWord = at => relativeDay(localDay(at)).replace(/,.*$/, '');

/** One deadline format everywhere on Today: "Due tomorrow 11:59 PM · in 41 h" (the countdown stays live). */
function dueFacts(due) {
  if (due.overdue) return [phrase(due.label, 'risk-lead')];
  return [phrase(due.label), sep(), live(phrase(''), 'left', due.at)];
}
/** Glue a number to its unit in the user's own words, so "10 PM" never breaks across lines. */
const glue = text => text.replace(/(\d)\s+(AM|PM|am|pm|min|h)\b/g, '$1\u00a0$2');
const tasksLeft = (data, block) => {
  const status = resultStatus(data, block.id);
  return plural(status.total - status.done, 'task') + ' left';
};

/**
 * A clash, one line per item with its time span, so it is clear what overlaps. Calendar events are fixed; a task says
 * it can move, except the one that sets a Result's deadline, which shows that deadline (Resolve never moves it in one tap).
 */
function clashRow(app, items) {
  const data = app.data();
  // "9 – 10 AM", as Calendar writes a span in a list; minutes stay when they say something.
  const span = ({start, end}) => timeRange(start, end).replace(/:00(?=[\s\u00a0]|$)/g, '');
  const start = Math.min(...items.map(item => item.start)), end = Math.max(...items.map(item => item.end));
  const when = `${dayWord(start)} ${span({start, end})}`;
  const lines = items.map(item => {
    const task = item.source === 'rpm' ? tasks(data).find(t => t.id === item.id) : null;
    // The task that sets a Result's deadline starts at that deadline: say so in its place, since that is what's at stake.
    const due = task?.blockId != null && blockDue(data, task.blockId)?.task.id === task.id;
    return [el('span', 'clash-time tnum', due ? `Due ${clock(item.start)}` : span(item)),
      el('span', 'clash-title', item.title + (task && !due ? ' · can move' : ''))];
  });
  const resolve = () => app.actions.resolveClash(items);
  const row = listRow({symbol: 'event_busy', alert: true, headline: [el('b', 'risk-lead', 'Clash'), ' · ', phrase(when)], lines,
    action: 'Resolve', onAction: resolve, open: resolve, top: true,
    label: `Clash ${when}: ${items.map(item => `${item.title} ${timeRange(item.start, item.end)}`).join(', ')}. Resolve`});
  // Keyed by what clashes, so the row stays the same row (and animates) when its words change.
  row.dataset.key = 'clash:' + items.map(item => `${item.source}:${item.id ?? item.title}`).sort().join('+');
  return row;
}

/** A Result with a deadline: its title, the deadline, and what is left; "Add to today" when nothing is scheduled. */
function resultRow(app, item) {
  const data = app.data(), {block, due} = item;
  const open = () => app.openBlock(block.id);
  const left = tasksLeft(data, block);
  const status = item.kind === 'unplanned' ? [phrase(left), sep(), phrase('not scheduled yet')] : [phrase(left)];
  const row = {symbol: 'hourglass_bottom', alert: due.overdue, headline: block.title, lines: [dueFacts(due), status], open};
  if (item.kind !== 'unplanned') return keyed(listRow(row), 'due:' + block.id);
  return keyed(listRow({...row, action: 'Add to today',
    label: `${block.title}. ${due.label}, ${countdown(due.at)}. ${left}, not scheduled yet. Open Block`,
    onAction: () => app.commit({type: 'saveTask', id: item.task.id, fields: {plannedDate: localDay()}},
      {label: `${item.task.title} added to Today`}).catch(() => {})}), 'due:' + block.id);
}

/** A stable data-key: the row is the same row from render to render (surface-motion animates it by this key). */
const keyed = (node, key) => { node.dataset.key = key; return node; };

const upcomingRow = (app, item) => (item.kind === 'clash' ? clashRow(app, item.items) : resultRow(app, item));

/** The next three days after the lead card: every other deadline and clash, soonest first. */
function upcomingSection(app, items) {
  if (!items.length) return null;
  const section = keyed(el('section', 'upcoming'), 'upcoming');
  const head = keyed(el('div', 'section-header'), 'upcoming-head');
  head.append(el('h2', '', 'Coming up'), el('small', '', 'Next 3 days'));
  section.append(head, ...items.map(item => upcomingRow(app, item)));
  return section;
}

/** Another day opened from the strip: what its marks mean, the Results due and any clash, before its agenda. */
function dayMarksSection(app, day) {
  const data = app.data(), now = new Date();
  const from = new Date(Math.max(+now, +new Date(day + 'T00:00'))), until = new Date(shiftDay(day, 1) + 'T00:00');
  const items = [
    ...openResults(data).filter(block => dueDay(data, block) === day)
      .map(block => { const due = dueInfo(blockDue(data, block.id).value, now); return {kind: 'due', at: due.at, block, due}; }),
    ...(from < until ? clashes(data, app.state.calendar ?? [], from, until) : [])
      .map(({items}) => ({kind: 'clash', items, at: new Date(items[1].start)})),
  ].sort((a, b) => a.at - b.at);
  if (!items.length) return null;
  const section = keyed(el('section', 'upcoming'), 'upcoming');
  section.setAttribute('aria-label', 'Deadlines and clashes');
  section.append(...items.map(item => upcomingRow(app, item)));
  return section;
}

/**
 * The Result first, as a short header (title, then its Purpose on its own quieter line, then one facts line: the
 * deadline with its countdown and the tasks left), so the Result frames the task under it.
 */
function resultHead(app, block) {
  const data = app.data();
  const head = button('', () => app.openBlock(block.id), 'result-head');
  const copy = el('span', 'result-copy');
  copy.append(el('span', 'result-title', glue(block.title)));
  if (block.purpose) copy.append(el('span', 'result-purpose', glue(block.purpose)));
  const due = dueInfo(blockDue(data, block.id)?.value);
  const left = tasksLeft(data, block);
  // With large text the deadline stays and the countdown and count give way.
  const meta = el('span', 'result-meta tnum'), extra = el('span', 'meta-extra');
  if (due) meta.append(...(due.overdue ? dueFacts(due) : [phrase(due.label)]));
  if (due?.soon) extra.append(' · ', live(phrase(''), 'left', due.at));
  extra.append(due ? ' · ' : '', phrase(left));
  meta.append(extra);
  copy.append(meta);
  head.append(copy);
  head.setAttribute('aria-label', `Result: ${block.title}. Purpose: ${block.purpose || 'none yet'}. `
    + `${due ? due.label + '. ' : ''}${left}. Open Block`);
  return head;
}

function cardLabel(text, liveKind = null, at = null) {
  const label = el('div', 'next-label');
  const words = el('span', '', text);
  if (liveKind) words.append(el('span', 'label-extra', ' · '), live(el('span', 'label-extra'), liveKind, at));
  label.append(el('span', 'now-pin'), words);
  return label;
}

/** Do next: the label, the task's Result as the header, then the task itself. */
function nextCard(app, focus, now) {
  const card = keyed(el('section', 'result-group next-card'), 'lead');
  const current = focus.start <= now;
  card.append(current ? cardLabel('Now', 'current', focus.end) : cardLabel('Do next', 'next', focus.start));
  const block = app.p().blocks.find(b => b.id === focus.blockId);
  if (block) {
    card.dataset.tone = app.tone(app.blockArea(block));
    card.append(resultHead(app, block));
  }
  card.append(taskRow(app, focus, {anytime: true}));
  if (!block && focus.purpose) card.append(el('p', 'next-why', focus.purpose));
  return card;
}

/**
 * Free time: the gap until the next fixed thing, given to the nearest deadline's unscheduled tasks. The label says
 * when the gap starts relative to now; the tasks can be ticked straight away, and the screen's one filled button
 * schedules them back to back into the gap (with Undo).
 */
function gapCard(app, gap, {block, slots}, now) {
  const card = keyed(el('section', 'result-group next-card gap-card'), 'lead');
  card.dataset.tone = app.tone(app.blockArea(block));
  const later = +gap.start - now > 15 * 60000;
  card.append(later ? cardLabel(`Free ${timeRange(gap.start, gap.end)}`, 'next', gap.start) : cardLabel(`Free until ${clock(gap.end)}`),
    resultHead(app, block));
  for (const {task} of slots) card.append(taskRow(app, task));
  const range = timeRange(slots[0].start, slots.at(-1).end);
  const words = `Schedule ${slots.length > 1 ? 'from' : 'at'} ${clock(slots[0].start)}`;
  const plan = button(words, () => app.commit(data => {
    let undo = null;
    for (const {task, start} of slots) {
      editPlan(data, {type: 'saveTask', id: task.id, fields: {planned: start.toISOString()}});
      undo ??= planner(data).undo;
    }
    data.planner.undo = undo;
  }, {label: `Scheduled ${range}`}).catch(() => {}), 'filled-btn next-action');
  plan.setAttribute('aria-label', `Schedule ${slots.map(s => s.task.title).join(' and ')} for ${range}`);
  card.append(plan);
  return card;
}

/** Calendar events as fixed blocks, the way Calendar's schedule draws them. */
function eventRow(app, event) {
  const row = keyed(button('', () => app.actions.calendarDetails(event), 'agenda-event'), eventKey(event));
  const block = el('span', 'event-block');
  block.append(el('span', 'event-title', event.title),
    el('span', 'event-time tnum', event.allDay ? 'All day' : timeRange(event.start, event.end)));
  row.append(icon('event', {cls: 'leading'}), block);
  row.setAttribute('aria-label', `${event.title}, ${event.allDay ? 'all day' : timeRange(event.start, event.end)}, calendar event`);
  return row;
}

const eventKey = event => 'event:' + (event.id ?? `${event.title}@${+event.start}`);
/** Free time is keyed by what it follows (or the start of the agenda): when the item after a gap leaves, the gap
 * before it stays where it is and its words change in place (fade through), while the leaving item and the gap after
 * it close below; nothing new slides in. */
const itemKey = item => (item ? (item.task ? 'task:' + item.task.id : eventKey(item.event)) : 'start');
const freeRow = (minutes, prev) => keyed(el('div', 'agenda-free tnum', `${duration(minutes)} free`), 'free:after:' + itemKey(prev));

/**
 * The rest of the day in time order, as Calendar's schedule shows it: tasks (each naming its Result) and calendar
 * events interleaved, the free time between them stated, then the tasks with no time.
 */
function agenda(app, page, {tasks, events, from, title}) {
  const section = el('section', 'plain-section agenda');
  if (title) {
    const head = keyed(el('div', 'section-header'), 'agenda-head');
    head.append(el('h2', '', title));
    section.append(head);
  }
  // Each task names its Result on a line of its own, so the time line never wraps into the Result's title.
  const row = task => {
    const node = taskRow(app, task, {anytime: true});
    const block = app.p().blocks.find(b => b.id === task.blockId);
    if (block) node.querySelector('.task-main').append(el('span', 'task-result', block.title));
    return node;
  };
  const timed = [...tasks.filter(task => task.start).map(task => ({task, start: task.start, end: task.end})),
    ...events.filter(event => !event.allDay).map(event => ({event, start: event.start, end: event.end}))]
    .sort((a, b) => a.start - b.start || a.end - b.end);
  for (const event of events.filter(e => e.allDay)) section.append(eventRow(app, event));
  let cursor = from;
  let last = null; // the item whose end the free time starts from
  for (const item of timed) {
    if (cursor != null && item.start - cursor >= GAP_MINUTES * 60000) section.append(freeRow(Math.round((item.start - cursor) / 60000), last));
    section.append(item.task ? row(item.task) : eventRow(app, item.event));
    if (cursor == null || item.end >= cursor) last = item;
    cursor = Math.max(cursor ?? 0, item.end);
  }
  for (const task of tasks.filter(task => !task.start)) section.append(row(task));
  if (section.querySelector('.task-row, .agenda-event')) page.append(section);
}

function inboxRow(app) {
  const count = inboxTasks(app.data()).length;
  const row = button('', () => app.actions.inbox(), 'list-item inbox-row');
  row.append(icon('inbox', {cls: 'leading'}));
  const copy = el('span', 'list-copy');
  copy.append(el('span', 'list-headline', 'Inbox'));
  row.append(copy);
  if (count) row.append(el('span', 'trailing-value tnum', String(count)));
  row.append(icon('chevron_right', {cls: 'trailing'}));
  row.setAttribute('aria-label', `Inbox, ${count ? plural(count, 'task') + ' not in a Block yet' : 'empty'}`);
  return row;
}

export function renderToday(app, page) {
  if (app.state.dayLayout !== 'list') {
    const week = app.state.day === localDay() && !app.largeText() ? weekLine(app, dayTasks(app.data(), app.state.day).active) : null;
    page.append(dateHeader(app, week));
    renderDay(app, page);
    page.append(inboxRow(app));
    return;
  }
  const {day, calendar = []} = app.state;
  const data = app.data();
  const now = new Date();
  const isToday = day === localDay(now);
  const model = dayTasks(data, day);
  // A task completed a moment ago stays in place briefly, so the list doesn't jump under the thumb.
  // It keeps its time so it stays in its own slot, not at the end of the list.
  const recent = model.completed.filter(task => app.recentlyCompleted.has(task.id))
    .map(task => (task.start || !task.planned ? task
      : {...task, start: Date.parse(task.planned), end: Date.parse(task.planned) + (task.minutes ?? 0) * 60000}));
  const active = [...model.active, ...recent];
  const dayEvents = timelineItems(data, day, calendar).filter(item => item.source === 'calendar');

  // The lead: free time given to the nearest deadline's unscheduled tasks, otherwise the next task.
  const gap = isToday ? freeGap(data, {calendar, now}) : null;
  const fill = gap ? gapResult(data, gap, now) : null;
  const focus = fill ? null : model.focus;
  const leadId = fill?.block.id ?? focus?.blockId;

  // With large text the strip gives way and the week line follows what is coming up, so the first risk stays in view.
  const big = app.largeText(), week = isToday ? weekLine(app, model.active) : null;
  page.append(dateHeader(app, big ? null : week));
  if (fill) page.append(gapCard(app, gap, fill, +now));
  else if (focus) page.append(nextCard(app, focus, +now));
  // Each Result once: the lead's Result is not repeated below.
  const marks = isToday ? upcomingSection(app, upcoming(data, {calendar, now}).filter(item => !item.block || item.block.id !== leadId))
    : dayMarksSection(app, day);
  if (marks) page.append(marks);
  if (big && week) page.append(week);

  const empty = !model.active.length && !model.completed.length && !dayEvents.length;
  if (empty) {
    page.append(emptyState({
      symbol: 'wb_sunny',
      title: isToday ? 'Nothing planned for today' : 'Nothing planned for this day',
      body: 'Start with a Result that matters, then choose its first task.',
      action: () => app.actions.newEntity('blocks'),
      label: 'Plan a Block',
      secondary: button('Add a task', () => app.actions.addTask({plannedDate: day}), 'text-btn'),
    }));
  } else {
    const lead = fill ? +gap.end : focus ? Math.max(+now, focus.end) : isToday ? +now : null;
    agenda(app, page, {
      // A task belongs to the day it starts on, even when it runs past midnight.
      tasks: active.filter(task => task.id !== focus?.id && (!task.start || localDay(task.start) === day)),
      events: isToday ? dayEvents.filter(event => event.end > +now) : dayEvents,
      from: lead,
      title: isToday ? (fill || focus ? 'Later today' : 'Today') : relativeDay(day),
    });
    completedSection(app, page, model.completed.filter(task => !app.recentlyCompleted.has(task.id)));
  }
  page.append(inboxRow(app));
}

/** Day opens at now; the list opens at the top. */
export function todayScroll(app) {
  return app.state.dayLayout === 'list' ? 0 : dayScroll(app);
}
