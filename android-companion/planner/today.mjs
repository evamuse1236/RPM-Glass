/**
 * Today, top to bottom: the date and the next seven days; one lead card for now (the next task with its Result and
 * Purpose, or free time filled with the most urgent unplanned Result); what is at risk, soonest first; one planning row;
 * the rest of the day as one time-ordered agenda (tasks, calendar events and the free time between); Due soon; the Inbox.
 */
import {localDay, shiftDay, planner, editPlan, blockTasks, blockDue, timelineItems, conflicts} from '../planner-state.mjs';
import {repeats} from '../planner-recurrence.mjs';
import {dayTasks} from '../planner-ux.mjs';
import {setClarityPreference} from '../planner-clarity.mjs';
import {weekStart, reviewWeek, weekFocus, resultStatus, inboxTasks} from '../review-state.mjs';
import {el, icon, button, emptyState, labelButton} from './dom.mjs';
import {clock, longDate, plural, dateText, dueInfo, relativeDay, timeLeft, countdown, duration, timeRange} from './format.mjs';
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

const DUE_DAYS = 3, RISK_DAYS = 2, GAP_MINUTES = 30;
/** Midnight after the `days`-th day from today: 0 is tonight, 1 the end of tomorrow. */
const dayEnd = (now, days) => new Date(shiftDay(localDay(now), days + 1) + 'T00:00');
const openResults = data => planner(data).blocks.filter(block => !block.archived && block.achieved !== true);

/** Open Results whose deadline falls before the end of the third day from today (or has passed), soonest first. */
export function dueSoon(data, now = new Date()) {
  const until = dayEnd(now, DUE_DAYS);
  return openResults(data)
    .map(block => ({block, due: dueInfo(blockDue(data, block.id)?.value, now)}))
    .filter(({due}) => due && due.at < until)
    .sort((a, b) => a.due.at - b.due.at);
}

/** A task that starts with an event and shares a distinctive word ("Sit RM Quiz I", "RM Quiz I in class") is that event. */
const words = text => new Set(text.toLowerCase().match(/[a-z]{4,}/g) ?? []);
const mirrors = (task, event) => task.source === 'rpm' && task.start === event.start
  && [...words(task.title)].some(word => words(event.title).has(word));

/** Busy commitments overlapping between `from` and `until`, joined so a crowded morning is one clash: [{items}] by start. */
export function clashes(data, calendar, from, until) {
  const found = [], id = item => `${item.source ?? 'calendar'}:${item.id}:${item.occurrence ?? ''}`;
  for (const event of calendar) {
    if (event.allDay || event.busy === false || event.end <= +from || event.start >= +until) continue;
    for (const other of conflicts(data, event.start, (event.end - event.start) / 60000, calendar)) {
      if (other.allDay || id(other) === id(event) || mirrors(other, event)) continue;
      const joined = found.filter(c => c.ids.has(id(event)) || c.ids.has(id(other)));
      const clash = joined[0] ?? {ids: new Set(), items: []};
      if (!joined.length) found.push(clash);
      for (const extra of joined.slice(1)) {
        extra.items.forEach(item => clash.items.push(item));
        extra.ids.forEach(key => clash.ids.add(key));
        found.splice(found.indexOf(extra), 1);
      }
      for (const item of [event, other]) if (!clash.ids.has(id(item))) { clash.ids.add(id(item)); clash.items.push(item); }
    }
  }
  return found.map(({items}) => ({items: items.sort((a, b) => a.start - b.start || a.end - b.end)}));
}

/** The day a dated task is planned for; a repeating task always counts as planned. */
const plannedDay = task => (repeats(task) ? '9999-12-31' : task.planned ? localDay(task.planned) : task.plannedDate);

/**
 * What could go wrong soon, from the data only (never guessed), soonest first:
 * - clash: busy calendar events, or timed tasks and events, overlapping in the next three days (`items`, by start);
 * - unplanned: a Result due by the end of the day after tomorrow with open tasks and nothing planned from today until
 *   its deadline other than the task that sets it (`undated` lists its undated open tasks in Plan order; `task` is
 *   the first, the one "Plan today" dates);
 * - overdue: a Result whose deadline passed with tasks still open.
 */
export function atRisk(data, {calendar = [], now = new Date()} = {}) {
  const risks = clashes(data, calendar, now, dayEnd(now, DUE_DAYS))
    .map(({items}) => ({kind: 'clash', items, at: new Date(items[1].start)}));
  const day = localDay(now), until = dayEnd(now, RISK_DAYS);
  const today = new Set(dayTasks(data, day, +now).active.map(task => task.blockId));
  for (const block of openResults(data)) {
    const deadline = blockDue(data, block.id), due = dueInfo(deadline?.value, now);
    if (!due || due.at >= until) continue;
    const open = blockTasks(data, block.id).filter(task => !task.done);
    if (!open.length) continue;
    if (due.overdue) { risks.push({kind: 'overdue', at: due.at, block, due, left: open.length}); continue; }
    const ahead = open.some(task => task.id !== deadline.task.id && plannedDay(task) >= day);
    const undated = open.filter(task => !task.planned && !task.plannedDate && !repeats(task));
    if (today.has(block.id) || ahead || !undated.length) continue;
    risks.push({kind: 'unplanned', at: due.at, block, due, left: open.length, undated, task: undated[0]});
  }
  return risks.sort((a, b) => a.at - b.at);
}

/**
 * Today's free time from now until the next fixed thing (a timed task or a busy event), starting on the next quarter
 * hour and ending at 10 PM when nothing else is fixed (the weekly review's free-time assumption). Null while something
 * is on now or when less than half an hour is left.
 */
export function freeGap(data, {calendar = [], now = new Date()} = {}) {
  const day = localDay(now), dayStart = +new Date(day + 'T00:00'), close = +new Date(day + 'T22:00');
  const fixed = [...dayTasks(data, day, +now).active.filter(task => task.start),
    ...calendar.filter(event => !event.allDay && event.busy !== false && event.end > dayStart && event.start < close)];
  if (fixed.some(item => item.start <= +now && item.end > +now)) return null;
  const start = Math.ceil(+now / 9e5) * 9e5;
  const end = Math.min(close, ...fixed.filter(item => item.start > +now).map(item => item.start));
  return end - start >= GAP_MINUTES * 60000 ? {start: new Date(start), end: new Date(end)} : null;
}

/** The undated tasks of an unplanned risk that fit the gap back to back, in Plan order: [{task, start, end}]. */
export function fillGap(risk, gap) {
  const slots = [];
  let at = +gap.start;
  for (const task of risk.undated) {
    const end = at + (task.minutes ?? 30) * 60000;
    if (end > +gap.end) break;
    slots.push({task, start: new Date(at), end: new Date(end)});
    at = end;
  }
  return slots;
}

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

const dayGap = (from, to) => Math.round((Date.parse(to + 'T12:00') - Date.parse(from + 'T12:00')) / 864e5);

/**
 * Seven days running forward from today, as far ahead as Dara plans; swiping steps a week. A day holding a Result's
 * deadline shows the Due soon hourglass, a day with a calendar clash the clash mark, other days with tasks a dot.
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
    const value = blockDue(data, block.id)?.value?.slice(0, 10);
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

/**
 * A Material list row with one action: leading icon, the headline on its own full-width line, then the supporting
 * text beside the action button, so a title never wraps to make room for it. The whole row opens; the button acts.
 * Every risk and the planning row use the same tonal button; `strong` makes it the screen's one filled button.
 */
function actionRow({symbol, headline, supporting, action, onAction, open, label, cls = '', strong = false}) {
  const row = el('div', 'today-row ' + cls);
  const main = button('', open ?? onAction, 'today-row-main');
  const words = value => [value ?? ''].flat().map(part => part.textContent ?? part).join(' ').replace(/\s+/g, ' ');
  main.setAttribute('aria-label', label ?? `${words(headline)}. ${words(supporting)}`);
  const text = (cls, value) => { const node = el('span', cls); node.append(...[value].flat()); return node; };
  const lead = icon(symbol, {cls: 'leading'});
  const title = text('today-row-headline', headline);
  const copy = text('today-row-supporting', supporting ?? '');
  for (const node of [lead, title, copy]) node.setAttribute('aria-hidden', 'true');
  row.append(main, lead, title, copy);
  if (action) row.append(button(action, onAction, (strong ? 'filled-btn' : 'tonal-btn') + ' today-row-action'));
  return row;
}

const weekName = (week, month = 'long') => 'week of ' + new Date(week + 'T12:00').toLocaleDateString([], {month, day: 'numeric'});
const capital = text => text[0].toUpperCase() + text.slice(1);
/** The user's own recurring "Weekly review" task today, folded into the planning row while the week needs a plan. */
const reviewTask = (active) => active.find(task => !task.blockId && task.title.trim().toLowerCase() === 'weekly review');

/**
 * The one planning row. Monday to Thursday it shows this week's Results (only those the user marked achieved count);
 * Friday to Sunday, until the coming week has Results, it says so and offers Plan now. Risks outrank it, so its button
 * is filled only when nothing is at risk and the lead card has no action of its own.
 */
function weekRow(app, active, strong) {
  const today = localDay();
  const week = weekStart(today);
  if (weekStart(app.state.day) !== week) return null;
  const data = app.data();
  const open = () => app.openReview();
  const next = reviewWeek(today);
  if (next !== week) {
    const planned = weekFocus(data, next);
    if (planned.length) {
      return actionRow({symbol: 'event_available', headline: `${plural(planned.length, 'Result')} planned for next week`,
        supporting: capital(weekName(next)), action: 'Review', onAction: open});
    }
    const ritual = reviewTask(active);
    const when = ritual && taskWhen(ritual);
    const title = `${capital(weekName(next, 'short'))} isn't planned`;
    return actionRow({symbol: 'event_upcoming', headline: title, cls: 'plan-row', strong,
      supporting: ritual ? `Weekly review ${when ? clock(when) : 'today'}` : 'Pick 3 to 5 Results',
      action: 'Plan now', onAction: open, label: `${title}. Plan now: start the weekly review for the ${weekName(next)}`});
  }
  const focus = weekFocus(data, week);
  if (!focus.length) return actionRow({symbol: 'event_upcoming', headline: 'Plan your week', strong,
    supporting: 'Pick 3 to 5 Results', action: 'Start', onAction: open});
  const achieved = focus.filter(id => resultStatus(data, id).achieved).length;
  return actionRow({symbol: 'flag', onAction: open, action: 'Review',
    headline: achieved ? `${achieved} of ${plural(focus.length, 'Result')} achieved` : `${plural(focus.length, 'Result')} this week`,
    supporting: achieved ? capital(weekName(week)) : 'None marked achieved yet'});
}

/** "Mon 9:00 AM", "Today 4:00 PM". */
const when = at => `${relativeDay(localDay(at)).replace(/,.*$/, '')} ${clock(at)}`;

/** One row per risk, soonest first: an error-coloured icon and lead words, and one tonal action (the first may be filled). */
function riskRows(app, risks, strong) {
  const today = localDay();
  return risks.slice(0, 3).map((risk, i) => {
    const first = strong && i === 0;
    if (risk.kind === 'clash') {
      const titles = risk.items.map(item => item.title);
      const supporting = titles.length === 2 ? `${titles[0]} and ${titles[1]}`
        : `${titles.slice(0, -1).join(', ')} and ${titles.at(-1)}`;
      const resolve = () => app.actions.resolveClash(risk.items);
      return actionRow({symbol: 'event_busy', cls: 'risk-row', strong: first, open: resolve,
        headline: [el('b', 'risk-lead', 'Clash'), ` · ${when(risk.at)}`], supporting, action: 'Resolve', onAction: resolve,
        label: `Clash ${when(risk.at)}: ${supporting} overlap. Resolve`});
    }
    const {block, due} = risk;
    const open = () => app.openBlock(block.id);
    if (risk.kind === 'overdue') return actionRow({symbol: 'hourglass_bottom', cls: 'risk-row', headline: block.title,
      strong: first, supporting: [el('b', 'risk-lead phrase', due.label), el('span', 'phrase', `${plural(risk.left, 'task')} left`)],
      action: 'Open', onAction: open});
    return actionRow({symbol: 'hourglass_bottom', cls: 'risk-row', headline: block.title, open, strong: first,
      supporting: [el('b', 'risk-lead phrase', 'Nothing planned'), el('span', 'phrase', due.label)],
      action: 'Plan today', label: `${block.title}: nothing planned. ${due.label}. ${plural(risk.left, 'task')} left. Open Block`,
      onAction: () => app.commit({type: 'saveTask', id: risk.task.id, fields: {plannedDate: today}},
        {label: `${risk.task.title} added to Today`}).catch(() => {})});
  });
}

/** Results due in the next three days that are not already the lead or a risk, Calendar-schedule style: the day once per day. */
function dueSection(app, rows, now = new Date()) {
  if (!rows.length) return null;
  const data = app.data();
  const section = el('section', 'soon-section');
  const head = el('div', 'section-header');
  head.append(el('h2', '', 'Due soon'), el('small', '', 'Next 3 days'));
  section.append(head);
  let lastDay = null;
  for (const {block, due} of rows) {
    const day = localDay(due.at);
    const status = resultStatus(data, block.id);
    const left = status.total - status.done;
    const row = button('', () => app.openBlock(block.id), 'soon-row');
    const gutter = el('span', 'soon-day');
    if (day !== lastDay) {
      const date = new Date(day + 'T12:00');
      gutter.append(el('span', 'soon-weekday', date.toLocaleDateString([], {weekday: 'short'})),
        el('span', 'soon-date tnum', String(date.getDate())));
      gutter.classList.toggle('is-today', day === localDay(now));
    }
    lastDay = day;
    const copy = el('span', 'list-copy');
    const meta = el('span', 'list-supporting tnum');
    const timed = blockDue(data, block.id)?.value?.includes('T');
    meta.append(due.overdue ? el('b', 'risk-lead', 'Overdue') : timed ? clock(due.at) + ' · ' : 'End of day · ');
    if (!due.overdue) meta.append(live(el('span'), 'left', due.at));
    meta.append(` · ${plural(left, 'task')} left`);
    copy.append(el('span', 'list-headline', block.title), meta);
    row.append(gutter, copy);
    row.setAttribute('aria-label', `${block.title}. ${due.label}, ${countdown(due.at, now)}. ${plural(left, 'task')} left. Open Block`);
    section.append(row);
  }
  return section;
}

/**
 * The Result first, as a short header (title, then its Purpose on its own quieter line, then one facts line), so the
 * Result frames the task under it. With large text only the title stays, on one line; the rest is a tap away.
 */
function resultHead(app, block, lead = null) {
  const data = app.data();
  const head = button('', () => app.openBlock(block.id), 'result-head');
  const copy = el('span', 'result-copy');
  copy.append(el('span', 'result-title', block.title));
  if (block.purpose) copy.append(el('span', 'result-purpose', block.purpose));
  const status = resultStatus(data, block.id);
  const due = dueInfo(blockDue(data, block.id)?.value);
  const meta = el('span', 'result-meta tnum');
  const facts = [];
  if (lead) facts.push(el('b', 'risk-lead', lead));
  if (due) facts.push(el('span', 'phrase' + (due.overdue ? ' is-overdue' : ''), due.label));
  if (due?.soon) facts.push(live(el('span', 'phrase'), 'left', due.at));
  if (!lead) facts.push(el('span', '', `${status.done} of ${plural(status.total, 'task')} done`));
  facts.forEach((fact, i) => meta.append(...(i ? [el('span', 'sep', '·'), fact] : [fact])));
  copy.append(meta);
  head.append(copy);
  head.setAttribute('aria-label', `Result: ${block.title}. Purpose: ${block.purpose || 'none yet'}. `
    + `${lead ? lead + '. ' : ''}${due ? due.label + '. ' : ''}${status.done} of ${plural(status.total, 'task')} done. Open Block`);
  return head;
}

function cardLabel(text, liveKind = null, at = null) {
  const label = el('div', 'next-label');
  const words = el('span', '', text);
  if (liveKind) words.append(' · ', live(el('span'), liveKind, at));
  label.append(el('span', 'now-pin'), words);
  return label;
}

/** Do next: the label, the task's Result as the header, then the task itself. */
function nextCard(app, focus, now) {
  const card = el('section', 'result-group next-card');
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
 * Free now: the gap until the next fixed thing, filled with the most urgent Result that has nothing planned. Its
 * tasks can be ticked straight away, and one tap schedules them back to back into the gap (with Undo).
 */
function gapCard(app, gap, {risk, slots}) {
  const card = el('section', 'result-group next-card');
  card.dataset.tone = app.tone(app.blockArea(risk.block));
  card.append(cardLabel(`Free until ${clock(gap.end)}`), resultHead(app, risk.block, 'Nothing planned'));
  for (const {task} of slots) card.append(taskRow(app, task, {anytime: true}));
  const range = timeRange(slots[0].start, slots.at(-1).end);
  const plan = button(`Plan ${range}`, () => app.commit(data => {
    let undo = null;
    for (const {task, start} of slots) {
      editPlan(data, {type: 'saveTask', id: task.id, fields: {planned: start.toISOString()}});
      undo ??= planner(data).undo;
    }
    data.planner.undo = undo;
  }, {label: `Planned ${range}`}).catch(() => {}), 'filled-btn next-action');
  plan.setAttribute('aria-label', `Plan ${slots.map(s => s.task.title).join(' and ')} for ${range}`);
  card.append(plan);
  return card;
}

/** Calendar events as fixed blocks, the way Calendar's schedule draws them. */
function eventRow(app, event) {
  const row = button('', () => app.actions.calendarDetails(event), 'agenda-event');
  const block = el('span', 'event-block');
  block.append(el('span', 'event-title', event.title),
    el('span', 'event-time tnum', event.allDay ? 'All day' : timeRange(event.start, event.end)));
  row.append(icon('event', {cls: 'leading'}), block);
  row.setAttribute('aria-label', `${event.title}, ${event.allDay ? 'all day' : timeRange(event.start, event.end)}, calendar event`);
  return row;
}

const freeRow = minutes => el('div', 'agenda-free tnum', `${duration(minutes)} free`);

/**
 * The rest of the day in time order, as Calendar's schedule shows it: tasks (each naming its Result) and calendar
 * events interleaved, the free time between them stated, then the tasks with no time.
 */
function agenda(app, page, {tasks, events, from, title, ritual = null}) {
  const section = el('section', 'plain-section agenda');
  if (title) {
    const head = el('div', 'section-header');
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
    ...events.filter(event => !event.allDay).map(event => ({event, start: event.start, end: event.end})),
    ...(ritual ? [{node: ritual.row, start: ritual.task.start, end: ritual.task.end}] : [])]
    .sort((a, b) => a.start - b.start || a.end - b.end);
  for (const event of events.filter(e => e.allDay)) section.append(eventRow(app, event));
  let cursor = from;
  for (const item of timed) {
    if (cursor != null && item.start - cursor >= GAP_MINUTES * 60000) section.append(freeRow(Math.round((item.start - cursor) / 60000)));
    section.append(item.node ?? (item.task ? row(item.task) : eventRow(app, item.event)));
    cursor = Math.max(cursor ?? 0, item.end);
  }
  for (const task of tasks.filter(task => !task.start)) section.append(row(task));
  if (section.querySelector('.task-row, .agenda-event, .today-row')) page.append(section);
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
  const {day, calendar = []} = app.state;
  const data = app.data();
  const now = new Date();
  const isToday = day === localDay(now);
  const model = dayTasks(data, day);
  // A task completed a moment ago stays in place briefly, so the list doesn't jump under the thumb.
  const recent = model.completed.filter(task => app.recentlyCompleted.has(task.id));
  const active = [...model.active, ...recent];
  const dayEvents = timelineItems(data, day, calendar).filter(item => item.source === 'calendar');
  const risks = isToday ? atRisk(data, {calendar, now}) : [];
  const timeline = app.state.dayLayout === 'timeline' && !app.largeText();

  // The lead: free time worth filling first, otherwise the next task.
  const gap = isToday && !timeline ? freeGap(data, {calendar, now}) : null;
  const fill = gap ? risks.filter(r => r.kind === 'unplanned').map(risk => ({risk, slots: fillGap(risk, gap)}))
    .find(f => f.slots.length) : null;
  const focus = !fill && !timeline ? model.focus : null;
  const shownRisks = risks.filter(r => r !== fill?.risk);
  const ritual = weekRow(app, active, !fill && !shownRisks.length);
  // A timed "Weekly review" task today becomes the planning row, placed at its time in the agenda.
  const folded = ritual?.classList.contains('plan-row') ? reviewTask(model.active) : null;
  const inAgenda = folded?.start && !timeline;

  page.append(dateHeader(app));
  if (fill) page.append(gapCard(app, gap, fill));
  else if (focus) page.append(nextCard(app, focus, +now));
  if (shownRisks.length) {
    const section = el('section', 'risk-section');
    section.setAttribute('aria-label', 'At risk');
    section.append(...riskRows(app, shownRisks, !fill));
    page.append(section);
  }
  if (ritual && !inAgenda) page.append(ritual);

  const empty = !model.active.length && !model.completed.length && !dayEvents.length;
  if (timeline) {
    renderTimeline(app, page, model.active);
    completedSection(app, page, model.completed);
  } else if (empty) {
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
      tasks: active.filter(task => task !== folded && task.id !== focus?.id && (!task.start || localDay(task.start) === day)),
      events: isToday ? dayEvents.filter(event => event.end > +now) : dayEvents,
      from: lead,
      title: isToday ? (fill || focus ? 'Later today' : 'Today') : relativeDay(day),
      ritual: inAgenda ? {row: ritual, task: folded} : null,
    });
    completedSection(app, page, model.completed.filter(task => !app.recentlyCompleted.has(task.id)));
  }
  if (isToday) {
    // Each Result once: Due soon skips the lead's Result and the risks.
    const shown = new Set([fill?.risk.block.id, focus?.blockId, ...risks.map(r => r.block?.id)]);
    const due = dueSection(app, dueSoon(data, now).filter(row => !shown.has(row.block.id)), now);
    if (due) page.append(due);
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
