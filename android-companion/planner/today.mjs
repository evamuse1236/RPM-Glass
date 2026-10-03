/**
 * Today, top to bottom: the date, the next seven days and one line on the week's plan; one lead card for now (free time
 * filled with the nearest deadline's unscheduled tasks, or the next task, under its Result and Purpose); what is coming
 * up in the next three days, soonest first (every other deadline and calendar clash); the rest of the day as one
 * time-ordered agenda (tasks, calendar events and the free time between); the Inbox.
 */
import {localDay, shiftDay, planner, editPlan, tasks, blockTasks, blockDue, timelineItems, conflicts} from '../planner-state.mjs';
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
/** A Result's open tasks with no day yet, in Plan order. */
const undatedTasks = (data, blockId) => blockTasks(data, blockId)
  .filter(task => !task.done && !task.planned && !task.plannedDate && !repeats(task));

/**
 * What could go wrong soon, from the data only (never guessed), soonest first:
 * - clash: busy calendar events, or timed tasks and events, overlapping in the next three days (`items`, by start);
 * - unplanned: a Result due by the end of the day after tomorrow with open tasks and nothing planned from today until
 *   its deadline other than the task that sets it (`undated` lists its undated open tasks in Plan order; `task` is
 *   the first, the one "Add to today" dates);
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
    const undated = undatedTasks(data, block.id);
    if (today.has(block.id) || ahead || !undated.length) continue;
    risks.push({kind: 'unplanned', at: due.at, block, due, left: open.length, undated, task: undated[0]});
  }
  return risks.sort((a, b) => a.at - b.at);
}

/**
 * The next three days in one list, soonest first: every risk, then every other Result due in that window
 * (`kind: 'due'`), so each deadline appears once and the list is complete.
 */
export function upcoming(data, {calendar = [], now = new Date()} = {}) {
  const risks = atRisk(data, {calendar, now});
  const flagged = new Set(risks.map(risk => risk.block?.id));
  const due = dueSoon(data, now).filter(row => !flagged.has(row.block.id))
    .map(({block, due}) => ({kind: 'due', at: due.at, block, due}));
  return [...risks, ...due].sort((a, b) => a.at - b.at);
}

/**
 * Today's free time from now until the next fixed thing (a timed task or a busy event), starting on the next quarter
 * hour and ending at 10 PM when nothing else is fixed (the weekly review's free-time assumption). Null while something
 * is on now or when less than half an hour is left.
 */
export function freeGap(data, {calendar = [], now = new Date()} = {}) {
  // Same waking window as the weekly review's free time (8 AM-10 PM).
  const day = localDay(now), open = +new Date(day + 'T08:00'), close = +new Date(day + 'T22:00');
  const fixed = [...dayTasks(data, day, +now).active.filter(task => task.start),
    ...calendar.filter(event => !event.allDay && event.busy !== false && event.end > open && event.start < close)];
  if (fixed.some(item => item.start <= +now && item.end > +now)) return null;
  const start = Math.max(open, Math.ceil(+now / 9e5) * 9e5);
  const end = Math.min(close, ...fixed.filter(item => item.start > +now).map(item => item.start));
  return end - start >= GAP_MINUTES * 60000 ? {start: new Date(start), end: new Date(end)} : null;
}

/** The undated tasks (`{undated}`) that fit the gap back to back, in Plan order: [{task, start, end}]. */
export function fillGap({undated}, gap) {
  const slots = [];
  let at = +gap.start;
  for (const task of undated) {
    const end = at + (task.minutes ?? 30) * 60000;
    if (end > +gap.end) break;
    slots.push({task, start: new Date(at), end: new Date(end)});
    at = end;
  }
  return slots;
}

/**
 * Who gets the free time: the nearest deadline (overdue first, then due by the end of the day after tomorrow) whose
 * unscheduled tasks fit the gap, whether or not other work for it is planned. {block, due, slots} or null.
 */
export function gapResult(data, gap, now = new Date()) {
  const until = dayEnd(now, RISK_DAYS);
  for (const {block, due} of dueSoon(data, now)) {
    if (due.at >= until) break;
    const slots = fillGap({undated: undatedTasks(data, block.id)}, gap);
    if (slots.length) return {block, due, slots};
  }
  return null;
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
const dueDay = (data, block) => blockDue(data, block.id)?.value?.slice(0, 10);

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

function dateHeader(app, week) {
  const {day} = app.state;
  const header = el('div', 'day-header');
  const line = el('div', 'date-line');
  const picker = button('', () => app.actions.datePicker(), 'date-button');
  picker.append(el('span', '', longDate(day)), icon('arrow_drop_down'));
  picker.setAttribute('aria-label', 'Choose date, ' + longDate(day));
  line.append(picker);
  if (day !== localDay()) line.append(labelButton('today', 'Today', () => selectDay(app, localDay()), 'tonal-btn small'));
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
function weekLine(app, active) {
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

/**
 * A Material list row: leading icon, the headline on its own full-width line, then supporting lines beside at most
 * one trailing text button, so a title never wraps to make room for it (`top` puts the button beside a short headline
 * instead, so the lines get the full width). The whole row opens; the button acts.
 */
function listRow({symbol, alert = false, headline, lines = [], action, onAction, open, label, top = false}) {
  const row = el('div', 'today-row' + (alert ? ' is-alert' : '') + (top ? ' action-top' : ''));
  const main = button('', open ?? onAction, 'today-row-main');
  const lead = icon(symbol, {cls: 'leading'});
  const title = el('span', 'today-row-headline');
  title.append(...[headline].flat());
  const copy = el('span', 'today-row-supporting');
  for (const line of lines) {
    const node = el('span', 'today-row-line');
    node.append(...[line].flat());
    node.classList.toggle('is-clash-item', !!node.querySelector('.clash-time'));
    copy.append(node);
  }
  main.setAttribute('aria-label', label ?? [title, ...copy.children].map(node => node.textContent).join('. '));
  for (const node of [lead, title, copy]) node.setAttribute('aria-hidden', 'true');
  row.append(main, lead, title, copy);
  if (action) row.append(button(action, onAction, 'text-btn today-row-action'));
  return row;
}

/** "Mon", "Tomorrow", "Today": the day word of a clash. */
const dayWord = at => relativeDay(localDay(at)).replace(/,.*$/, '');
const phrase = (text, cls = '') => el('span', 'phrase' + (cls ? ' ' + cls : ''), text);
/** " · " between phrases; with large text each phrase takes its own line instead. */
const sep = () => el('span', 'sep', ' · ');

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
  const {day, calendar = []} = app.state;
  const data = app.data();
  const now = new Date();
  const isToday = day === localDay(now);
  const model = dayTasks(data, day);
  // A task completed a moment ago stays in place briefly, so the list doesn't jump under the thumb.
  // It keeps its time so it stays in its own slot, not at the end of the list.
  const recent = model.completed.filter(task => app.recentlyCompleted.has(task.id))
    .map(task => (task.start || !task.planned ? task
      : {...task, start: Date.parse(task.planned), end: Date.parse(task.planned) + (task.minutes ?? 30) * 60000}));
  const active = [...model.active, ...recent];
  const dayEvents = timelineItems(data, day, calendar).filter(item => item.source === 'calendar');
  const timeline = app.state.dayLayout === 'timeline' && !app.largeText();

  // The lead: free time given to the nearest deadline's unscheduled tasks, otherwise the next task.
  const gap = isToday && !timeline ? freeGap(data, {calendar, now}) : null;
  const fill = gap ? gapResult(data, gap, now) : null;
  const focus = !fill && !timeline ? model.focus : null;
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
      tasks: active.filter(task => task.id !== focus?.id && (!task.start || localDay(task.start) === day)),
      events: isToday ? dayEvents.filter(event => event.end > +now) : dayEvents,
      from: lead,
      title: isToday ? (fill || focus ? 'Later today' : 'Today') : relativeDay(day),
    });
    completedSection(app, page, model.completed.filter(task => !app.recentlyCompleted.has(task.id)));
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
