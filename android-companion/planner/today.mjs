/**
 * Today, top to bottom: the date and week strip; what to do next, with its Result and Purpose; what is at risk;
 * one planning row; the rest of the day grouped by Result; Due soon for Results with nothing today; the Inbox.
 * Each Result appears once.
 */
import {localDay, shiftDay, planner, blockTasks, blockDue, timelineItems, conflicts} from '../planner-state.mjs';
import {dayTasks} from '../planner-ux.mjs';
import {setClarityPreference} from '../planner-clarity.mjs';
import {weekStart, reviewWeek, weekFocus, resultStatus, inboxTasks} from '../review-state.mjs';
import {el, icon, button, emptyState, areaDot, labelButton} from './dom.mjs';
import {clock, longDate, plural, dateText, dueInfo, relativeDay, timeLeft, countdown} from './format.mjs';
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
const windowEnd = now => new Date(shiftDay(localDay(now), DUE_DAYS + 1) + 'T00:00');
const openResults = data => planner(data).blocks.filter(block => !block.archived && block.achieved !== true);

/** Open Results whose deadline falls before the end of the third day from today (or has passed), soonest first. */
export function dueSoon(data, now = new Date()) {
  const until = windowEnd(now);
  return openResults(data)
    .map(block => ({block, due: dueInfo(blockDue(data, block.id)?.value, now)}))
    .filter(({due}) => due && due.at < until)
    .sort((a, b) => a.due.at - b.due.at);
}

/** A task that starts with an event and shares a distinctive word ("Sit RM Quiz I", "RM Quiz I in class") is that event. */
const words = text => new Set(text.toLowerCase().match(/[a-z]{4,}/g) ?? []);
const mirrors = (task, event) => task.source === 'rpm' && task.start === event.start
  && [...words(task.title)].some(word => words(event.title).has(word));

/**
 * What could go wrong soon, from the data only (never guessed), soonest first:
 * - clash: busy calendar events, or timed tasks and events, overlapping in the next three days (`items`, by start);
 * - unplanned: a Result due by the end of tomorrow with nothing planned today and open tasks that have no date
 *   (`task` is the first of them in Plan order, the one "Plan today" dates);
 * - overdue: a Result whose deadline passed with tasks still open.
 */
export function atRisk(data, {calendar = [], now = new Date()} = {}) {
  const risks = [];
  const until = windowEnd(now), tomorrow = new Date(shiftDay(localDay(now), 2) + 'T00:00');
  // Overlapping commitments join into one clash, so a crowded morning is one line, not one per pair.
  const clashes = [], id = item => `${item.source ?? 'calendar'}:${item.id}:${item.occurrence ?? ''}`;
  for (const event of calendar) {
    if (event.allDay || event.busy === false || event.end <= +now || event.start >= +until) continue;
    for (const other of conflicts(data, event.start, (event.end - event.start) / 60000, calendar)) {
      if (other.allDay || id(other) === id(event) || mirrors(other, event)) continue;
      const joined = clashes.filter(c => c.ids.has(id(event)) || c.ids.has(id(other)));
      const clash = joined[0] ?? {kind: 'clash', ids: new Set(), items: []};
      if (!joined.length) clashes.push(clash);
      for (const extra of joined.slice(1)) {
        extra.items.forEach(item => clash.items.push(item));
        extra.ids.forEach(key => clash.ids.add(key));
        clashes.splice(clashes.indexOf(extra), 1);
      }
      for (const item of [event, other]) if (!clash.ids.has(id(item))) { clash.ids.add(id(item)); clash.items.push(item); }
    }
  }
  for (const {ids, ...clash} of clashes) {
    clash.items.sort((a, b) => a.start - b.start || a.end - b.end);
    risks.push({...clash, at: new Date(clash.items[1].start)});
  }
  const today = new Set(dayTasks(data, localDay(now), +now).active.map(task => task.blockId));
  for (const block of openResults(data)) {
    const due = dueInfo(blockDue(data, block.id)?.value, now);
    if (!due || due.at >= tomorrow) continue;
    const open = blockTasks(data, block.id).filter(task => !task.done);
    if (!open.length || (!due.overdue && today.has(block.id))) continue;
    if (due.overdue) { risks.push({kind: 'overdue', at: due.at, block, due, left: open.length}); continue; }
    const task = open.find(t => !t.planned && !t.plannedDate);
    if (task) risks.push({kind: 'unplanned', at: due.at, block, due, left: open.length, task});
  }
  return risks.sort((a, b) => a.at - b.at);
}

/** Relative labels stay true while Today is open: each node names its own instant and kind. */
const LIVE = {
  left: at => countdown(at),
  next: at => (timeLeft(at) ? `starts in ${timeLeft(at)}` : 'starting now'),
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

/** Mon–Sun, as in Calendar. Past days step back; a day holding a Result's deadline shows the Due soon hourglass. */
function weekStrip(app) {
  const {day} = app.state;
  const strip = el('div', 'week-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Week');
  const monday = weekStart(day);
  const today = localDay();
  const data = app.data();
  const dues = new Map();
  for (const block of openResults(data)) {
    const value = blockDue(data, block.id)?.value;
    if (value) dues.set(value.slice(0, 10), (dues.get(value.slice(0, 10)) ?? 0) + 1);
  }
  for (let i = 0; i < 7; i++) {
    const key = shiftDay(monday, i);
    const date = new Date(key + 'T12:00');
    const cell = button('', () => selectDay(app, key), 'week-day');
    cell.classList.toggle('is-today', key === today);
    cell.classList.toggle('is-past', key < today);
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

/** A plain Material list row: leading icon, two lines, one trailing action. The whole row does the main thing. */
function actionRow({symbol, headline, supporting, action, onAction, open, label, cls = '', filled = false}) {
  const row = el('div', 'today-row ' + cls);
  const main = button('', open ?? onAction, 'today-row-main');
  const copy = el('span', 'list-copy');
  const line = (cls, value) => { const node = el('span', cls); node.append(...[value].flat()); return node; };
  copy.append(line('today-row-headline', headline));
  if (supporting) copy.append(line('list-supporting', supporting));
  main.append(icon(symbol, {cls: 'leading'}), copy);
  if (label) main.setAttribute('aria-label', label);
  row.append(main);
  if (action) row.append(button(action, onAction, filled ? 'filled-btn compact' : 'text-btn'));
  return row;
}

const weekName = (week, month = 'long') => 'week of ' + new Date(week + 'T12:00').toLocaleDateString([], {month, day: 'numeric'});
const capital = text => text[0].toUpperCase() + text.slice(1);
/** The user's own recurring "Weekly review" task today, folded into the planning row while the week needs a plan. */
const reviewTask = (active) => active.find(task => !task.blockId && task.title.trim().toLowerCase() === 'weekly review');

/**
 * The one planning row. Monday to Thursday it shows this week's Results (only those the user marked achieved count);
 * Friday to Sunday, until the coming week has Results, it says so and offers Plan now, the screen's one filled button.
 */
function weekRow(app, active) {
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
    return actionRow({symbol: 'event_upcoming', headline: title, cls: 'plan-row', filled: true,
      supporting: ritual ? `Weekly review${when ? ' · ' + clock(when) : ' today'} · pick 3 to 5 Results` : 'Review this week, then pick 3 to 5 Results',
      action: 'Plan now', onAction: open, label: `${title}. Plan now: start the weekly review for the ${weekName(next)}`});
  }
  const focus = weekFocus(data, week);
  if (!focus.length) return actionRow({symbol: 'event_upcoming', headline: 'Plan your week',
    supporting: 'Choose 3 to 5 Results that matter most', action: 'Start', onAction: open});
  const achieved = focus.filter(id => resultStatus(data, id).achieved).length;
  return actionRow({symbol: 'flag', onAction: open, action: 'Review',
    headline: achieved ? `${achieved} of ${plural(focus.length, 'Result')} achieved this week` : `${plural(focus.length, 'Result')} this week`,
    supporting: achieved ? capital(weekName(week)) : 'None marked achieved yet'});
}

/** "Mon, Oct 5 9:00 AM", "Today 4:00 PM". */
const when = at => `${relativeDay(localDay(at))} ${clock(at)}`;

/** One line per risk, in the error colour with words, each with one tap that fixes or opens what fixes it. */
function riskRows(app, risks) {
  const data = app.data();
  const today = localDay();
  return risks.slice(0, 3).map(risk => {
    if (risk.kind === 'clash') {
      const titles = risk.items.map(item => item.title);
      const headline = [el('b', 'risk-lead', 'Clash'), ` · ${when(risk.at)}`];
      const supporting = titles.length === 2 ? `${titles[0]} overlaps ${titles[1]}`
        : `${titles.slice(0, -1).join(', ')} and ${titles.at(-1)} overlap`;
      const task = risk.items.find(item => item.source === 'rpm');
      if (task) return actionRow({symbol: 'event_busy', cls: 'risk-row', headline, supporting, action: 'Move',
        onAction: () => app.actions.openTask(task.id, task.occurrence)});
      // Calendar is read-only here: the fix RPM can offer is one task for today to sort it out.
      const title = `Sort out the ${when(risk.at)} clash: ${titles.join(' and ')}`;
      const added = data.entries.find(t => !t.archived && !t.done && t.title === title);
      return actionRow({symbol: 'event_busy', cls: 'risk-row', headline, supporting,
        action: added ? 'Open' : 'Add to today', open: () => app.actions.calendarDetails(risk.items[0]),
        onAction: added ? () => app.actions.openTask(added.id) : () => app.commit({type: 'saveTask',
          fields: {title, plannedDate: today, minutes: 15}}, {label: 'Added to Today'}).catch(() => {})});
    }
    const {block, due} = risk;
    const open = () => app.openBlock(block.id);
    if (risk.kind === 'overdue') return actionRow({symbol: 'hourglass_bottom', cls: 'risk-row', headline: block.title,
      supporting: [el('b', 'risk-lead', due.label), ` · ${plural(risk.left, 'task')} left`], action: 'Open', onAction: open});
    return actionRow({symbol: 'hourglass_bottom', cls: 'risk-row', headline: block.title, open,
      supporting: [el('b', 'risk-lead', 'Nothing planned today'), ` · ${due.label} · ${plural(risk.left, 'task')} left`],
      action: 'Plan today', label: `${block.title}: nothing planned today. ${due.label}. ${plural(risk.left, 'task')} left. Open Block`,
      onAction: () => app.commit({type: 'saveTask', id: risk.task.id, fields: {plannedDate: today}},
        {label: `${risk.task.title} added to Today`}).catch(() => {})});
  });
}

/** Results due in the next three days that have no card today, Calendar-schedule style: the day once per day. */
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

/** One facts line: Area with its hue, tasks done, and the deadline with its countdown when there is one. */
function resultFacts(app, block, {withArea = true} = {}) {
  const data = app.data();
  const status = resultStatus(data, block.id);
  const area = withArea ? app.blockArea(block) : null;
  const due = dueInfo(blockDue(data, block.id)?.value);
  const meta = el('span', 'result-meta tnum');
  const facts = [el('span', '', `${status.done} of ${plural(status.total, 'task')} done`)];
  if (area) facts.unshift(el('span', '', area.title));
  if (due) {
    const node = el('span', due.overdue ? 'is-overdue' : '', due.label);
    if (due.soon) node.append(' · ', live(el('span'), 'left', due.at));
    facts.push(node);
  }
  if (area) meta.append(areaDot(app.tone(area)));
  facts.forEach((fact, i) => meta.append(...(i ? [el('span', 'sep', '·'), fact] : [fact])));
  return {meta, text: `${status.done} of ${plural(status.total, 'task')} done${due ? '. ' + due.label : ''}`};
}

/** Result title, then Purpose, then the facts line. */
function resultHeader(app, block) {
  const head = button('', () => app.openBlock(block.id), 'result-head');
  const copy = el('span', 'result-copy');
  copy.append(el('span', 'result-title', block.title));
  if (block.purpose) copy.append(el('span', 'result-purpose', block.purpose));
  const facts = resultFacts(app, block);
  copy.append(facts.meta);
  head.append(copy);
  head.setAttribute('aria-label', `Result: ${block.title}. Purpose: ${block.purpose || 'none yet'}. ${facts.text}. Open Block`);
  return head;
}

/**
 * Do next: the task first, so it can be ticked at a glance, then what it is for (Result · Purpose) and the Result's
 * facts. The rest of that Result's day follows in the same card, so the Result is shown once.
 */
function nextCard(app, group, focus, now, rowFor) {
  const card = el('section', 'result-group next-card');
  const current = focus.start <= now;
  const label = el('div', 'next-label');
  const text = el('span', '', (current ? 'Now' : 'Do next') + ' · ');
  text.append(live(el('span', 'tnum'), current ? 'current' : 'next', current ? focus.end : focus.start));
  label.append(el('span', 'now-pin'), text);
  card.append(label, taskRow(app, focus, {anytime: true}));
  const block = group.block;
  if (block) {
    card.dataset.tone = app.tone(app.blockArea(block));
    const why = button('', () => app.openBlock(block.id), 'next-why');
    const line = el('span', 'next-for');
    line.append(el('span', 'next-result', block.title));
    if (block.purpose) line.append(' · ', el('span', 'next-purpose', block.purpose));
    const facts = resultFacts(app, block, {withArea: false});
    why.append(line, facts.meta);
    why.setAttribute('aria-label', `For the Result: ${block.title}. Purpose: ${block.purpose || 'none yet'}. ${facts.text}. Open Block`);
    card.append(why);
  } else if (focus.purpose) {
    card.append(el('p', 'next-why static', focus.purpose));
  }
  const rest = group.rows.filter(task => task.id !== focus.id);
  if (rest.length) card.append(el('hr', 'next-divider'));
  for (const task of rest) rowFor(card, task);
  return card;
}

/** Calendar events as a plain list: read-only commitments, not a second kind of card. */
function calendarSection(app, events) {
  const section = el('section', 'plain-section');
  const head = el('div', 'section-header');
  head.append(el('h2', '', 'Calendar'), el('small', '', 'Read-only'));
  section.append(head);
  for (const event of events) {
    const row = button('', () => app.actions.calendarDetails(event), 'event-row');
    const time = event.allDay ? 'All day' : `${clock(event.start)} – ${clock(event.end)}`;
    row.append(el('span', 'event-bar'), el('span', 'event-title', event.title), el('span', 'event-time tnum', time));
    section.append(row);
  }
  return section;
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
  const now = new Date();
  const isToday = day === localDay(now);
  const model = dayTasks(data, day);
  // A task completed a moment ago stays in its group briefly, so the list doesn't jump under the thumb.
  const recent = model.completed.filter(task => app.recentlyCompleted.has(task.id));
  const active = [...model.active, ...recent];
  const events = timelineItems(data, day, calendar).filter(item => item.source === 'calendar');
  const risks = isToday ? atRisk(data, {calendar, now}) : [];
  const ritual = weekRow(app, active);
  const folded = ritual?.classList.contains('plan-row') ? reviewTask(model.active) : null;
  const focus = model.focus;
  const groups = groupByResult(app, active.filter(task => task !== folded), focus?.id);
  const rowFor = (parent, task) => parent.append(taskRow(app, task, {anytime: true}));

  page.append(dateHeader(app));
  const lead = app.state.dayLayout !== 'timeline' || app.largeText() ? groups.find(g => g.hasFocus) : null;
  if (lead) page.append(nextCard(app, lead, focus, +now, rowFor));
  if (risks.length) {
    const section = el('section', 'risk-section');
    section.setAttribute('aria-label', 'At risk');
    section.append(...riskRows(app, risks));
    page.append(section);
  }
  if (ritual) page.append(ritual);

  const empty = !model.active.length && !model.completed.length && !events.length;
  if (app.state.dayLayout === 'timeline' && !app.largeText()) {
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
    for (const group of groups.filter(g => g.block && g !== lead)) {
      const section = el('section', 'result-group');
      section.dataset.tone = app.tone(app.blockArea(group.block));
      section.append(resultHeader(app, group.block));
      for (const task of group.rows) rowFor(section, task);
      page.append(section);
    }
    if (events.length) page.append(calendarSection(app, events));
    // Today's tasks with no Block: a quiet list, not a second Inbox. The Inbox row below holds the whole backlog.
    const loose = groups.find(g => !g.block && g !== lead);
    if (loose) {
      const section = el('section', 'plain-section');
      const head = el('div', 'section-header');
      head.append(el('h2', '', 'Also today'));
      section.append(head);
      for (const task of loose.rows) rowFor(section, task);
      page.append(section);
    }
    completedSection(app, page, model.completed.filter(task => !app.recentlyCompleted.has(task.id)));
  }
  if (isToday) {
    // Each Result once: Due soon skips Results already shown today as a card or a risk.
    const shown = new Set([...groups.filter(g => g.block).map(g => g.blockId), ...risks.map(r => r.block?.id)]);
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
