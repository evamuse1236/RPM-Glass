import {taskDate, weekCapacity, placedMusts, mustPlacements, clashOp, clashKey, clashDecision} from './review-state.mjs';
import {localDay} from './planner-state.mjs';
import {clock, duration, plural, timeRange} from './planner/format.mjs';
import {READABLE, el, icon, button, hours, dayName, weekday, whenText, dueWords} from './review-ui.mjs';

/**
 * The week at a glance: a day strip (Must time already on each day, deadline days and clash days, in words; a tap
 * shows that day), then one line on whether the picked Results' Must time fits, which opens to one row per Result
 * checked against its own deadline, and a proposal for Musts that have no day yet.
 */
export function weekCard(api, chosen, candidates, now) {
  const {ui} = api;
  const events = api.events();
  const ids = chosen.map(c => c.blockId);
  const placed = placedMusts(api.data(), ids);
  const cap = weekCapacity(chosen, events, api.week, now, placed);
  const due = candidates.filter(c => c.due && c.done < c.total);
  const box = el('section', 'wr-summary');
  box.setAttribute('aria-label', 'This week at a glance');
  box.append(dayStrip(api, cap.days, due));
  const day = cap.days.find(d => d.day === ui.day);
  if (day) box.append(dayDetail(api, day, due, placed, cap.clashes, now));
  else {
    const legend = el('p', 'wr-strip-note legend');
    legend.append(Object.assign(icon('star', true), {className: 'ms fill must'}), ' Must time with a day · tap a day to see it');
    box.append(legend);
  }
  if (!events) box.append(el('p', 'wr-strip-note', calendarNote(ui.calendar)));
  if (!chosen.length) {
    box.append(el('p', 'wr-summary-line', 'Pick a Result to see whether its Must time fits before its deadline.'));
    return box;
  }
  const placements = mustPlacements(api.data(), ids, events, api.week, now);
  const unplaced = placements.reduce((sum, p) => sum + (p.minutes ?? 0), 0);
  const worst = cap.rows.find(r => r.over) ?? cap.rows.find(r => r.tight) ?? null;
  // Free time alone isn't a plan: while Musts have no day, say that first instead of "fits".
  const undated = !worst && placements.length > 0;
  const state = worst?.over ? 'over' : worst ? 'tight' : undated ? '' : events ? 'fits' : '';
  const toggle = button('', () => { ui.weekOpen = !ui.weekOpen; api.render(); }, 'wr-week-toggle ' + state);
  toggle.setAttribute('aria-expanded', String(ui.weekOpen));
  toggle.dataset.key = 'week';
  const text = el('span', 'wr-week-text');
  const by = r => (r.value ? weekday(r.value.slice(0, 10)) : 'Sunday');
  const verdict = !worst ? (events ? 'fits before every deadline' : '')
    : worst.overdue ? `${worst.title} is overdue`
      : worst.over ? `short ${duration(worst.need - worst.free)} by ${by(worst)}` : `tight by ${by(worst)}`;
  const undatedText = `${unplaced ? duration(unplaced) + ' of Must' : plural(placements.length, 'Must')} with no day yet`;
  text.append(el('span', 'wr-week-head tnum', undated ? undatedText
    : `${duration(cap.must)} of Must` + (verdict ? ` · ${verdict}` : '')));
  const detail = undated ? `${duration(cap.must)} of Must in all${events ? ', with free time before every deadline' : ''}`
    : placements.length ? undatedText
      : worst && !worst.overdue ? worst.title : `${plural(chosen.length, 'Result')}, each against its own deadline`;
  text.append(el('span', 'wr-week-sub', detail));
  toggle.append(text, icon(ui.weekOpen ? 'expand_less' : 'expand_more'));
  box.append(toggle);
  if (ui.weekOpen) {
    box.append(capacityRows(cap.rows, now));
    if (events) box.append(el('p', 'wr-summary-note', 'Free time counts 8 AM–10 PM minus your calendar. Each Result counts the Musts due before it too, since that work comes first.'));
  }
  // Undated Musts and their suggested days stay in view: they are what the plan still lacks.
  if (placements.length && (ui.weekOpen || undated)) box.append(placementBox(api, placements));
  if (ui.focusHint) box.append(el('p', 'wr-summary-note wr-summary-warn', ui.focusHint));
  return box;
}

/** One row per picked Result, in deadline order, with the words and numbers its card uses. */
function capacityRows(rows, now) {
  const list = el('ul', 'wr-ladder');
  for (const r of rows) {
    const state = r.over ? 'over' : r.tight ? 'tight' : r.free != null ? 'fits' : '';
    const item = el('li', state);
    const text = el('span', 'wr-ladder-text');
    const facts = [r.value ? dueWords(r.value, now) : 'No deadline this week', `${duration(r.must)} of Must`];
    if (r.free != null && !r.overdue) facts.push(`${duration(r.free)} free`);
    if (state !== 'fits' && r.need > r.must) facts.push(`${duration(r.need)} with earlier deadlines`);
    // Each fact stays whole; a line only breaks between them.
    const line = el('span', 'wr-ladder-must tnum');
    facts.forEach((fact, i) => line.append(...(i ? [' · '] : []), el('span', 'wr-nowrap', fact)));
    text.append(el('span', 'wr-ladder-when', r.title), line);
    item.append(text);
    const word = r.overdue ? 'Overdue' : r.over ? `Short ${duration(r.need - r.free)}` : r.tight ? 'Tight' : state ? 'Fits' : '';
    if (word) item.append(el('span', 'wr-ladder-state', word));
    list.append(item);
  }
  return list;
}

/** Undated Musts with the freest day before their deadline: shown first, written only on the tap, with Undo. */
function placementBox(api, placements) {
  const box = el('div', 'wr-place');
  box.append(el('p', 'wr-place-head', 'Suggested days, from free time before each deadline'));
  const list = el('ul', 'wr-place-list');
  for (const p of placements) {
    const row = el('li');
    row.append(Object.assign(icon('star', true), {className: 'ms fill must'}), el('span', 'wr-place-title', p.title),
      el('span', 'wr-place-day', p.day === localDay(api.now()) ? 'Today' : weekday(p.day)));
    list.append(row);
  }
  const go = button(placements.length === 1 ? 'Give it this day' : 'Give them these days',
    () => api.run({type: 'batch', ops: placements.map(p => ({type: 'saveTask', id: p.taskId, fields: {plannedDate: p.day}}))}, placements.length === 1 ? 'Must given a day' : `${placements.length} Musts given a day`), 'wr-btn-tonal');
  go.dataset.key = 'place';
  box.append(list, go);
  return box;
}

function calendarNote(calendar) {
  if (calendar === undefined) return 'Reading your calendar…';
  const status = calendar?.status;
  if (status === 'ready') return 'Free time counts 8 AM–10 PM, minus your calendar.';
  if (READABLE.has(status)) return 'Free time counts 8 AM–10 PM, minus your calendar. The calendar copy may be incomplete.';
  if (status === 'not_selected' || status === 'permission_needed') return "Calendar not connected, so free time isn't counted. Connect it from Today's menu.";
  return "Calendar unavailable, so free time isn't counted.";
}

/**
 * Today to Sunday as Calendar-style day buttons. Each says its marks in words: the Must time already on it (★),
 * "Due" when a Result's deadline falls on it, "Clash" when calendar events overlap. A tap shows that day below.
 */
function dayStrip(api, days, due) {
  const {ui} = api;
  const strip = el('div', 'wr-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Days until the end of the week');
  const today = days[0]?.day;
  for (const d of days) {
    const date = new Date(d.day + 'T12:00');
    const on = ui.day === d.day;
    const cell = button('', () => { ui.day = on ? null : d.day; api.render(); },
      'wr-strip-day' + (d.day === today ? ' today' : '') + (on ? ' sel' : '') + (d.over ? ' over' : ''));
    cell.setAttribute('aria-pressed', String(on));
    cell.dataset.key = 'day:' + d.day;
    const said = [dayName(d.day)];
    cell.append(el('span', 'wr-strip-letter', date.toLocaleDateString(undefined, {weekday: 'narrow'})), el('span', 'wr-strip-num tnum', String(date.getDate())));
    const must = el('span', 'wr-strip-must tnum');
    if (d.must) {
      must.append(Object.assign(icon('star', true), {className: 'ms fill must'}), hours(d.must));
      said.push(`${duration(d.must)} of Must`);
    }
    const dueHere = due.some(c => c.due.slice(0, 10) === d.day);
    const deadline = el('span', 'wr-strip-mark', dueHere ? 'Due' : '');
    if (dueHere) said.push(d.over ? 'a deadline, Must time does not fit' : 'a deadline');
    const clash = el('span', 'wr-strip-mark clash');
    if (d.clash) { clash.append(el('i', 'wr-dot'), 'Clash'); said.push('calendar clash'); }
    cell.append(must, deadline, clash);
    cell.setAttribute('aria-label', said.join(', '));
    strip.append(cell);
  }
  return strip;
}

/** One day from the strip: its free time, the deadlines on it (picked or not), the Musts already on it and any clash. */
function dayDetail(api, d, due, placed, clashes, now) {
  const box = el('div', 'wr-day');
  box.setAttribute('aria-live', 'polite');
  const head = el('p', 'wr-day-head');
  const today = d.day === localDay(now);
  head.append(el('b', '', today ? 'Today' : new Date(d.day + 'T12:00').toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'long'})));
  if (d.free != null) head.append(` · ${duration(d.free)} free ${today ? 'until 10\u00a0PM' : 'from 8\u00a0AM to 10\u00a0PM'}`);
  box.append(head);
  const list = el('ul', 'wr-day-list');
  const row = (lead, text, cls = '') => {
    const item = el('li', cls);
    item.append(lead, el('span', 'wr-day-text', text));
    list.append(item);
  };
  for (const c of due.filter(c => c.due.slice(0, 10) === d.day)) {
    const when = c.due.length > 10 ? clock(c.due) : 'end of day';
    row(el('b', 'wr-day-lead', 'Due ' + when), c.title + (api.ui.focus.includes(c.blockId) ? '' : ' · not picked'));
  }
  for (const p of placed.filter(p => p.day === d.day)) {
    const task = api.data().entries.find(t => t.id === p.taskId);
    const lead = el('span', 'wr-day-lead');
    lead.append(Object.assign(icon('star', true), {className: 'ms fill must'}), p.minutes ? duration(p.minutes) : '');
    row(lead, task?.title ?? 'Must');
  }
  for (const c of clashes.filter(c => c.day === d.day)) {
    const decided = api.clashes().find(x => x.key === clashKey(c));
    const done = decided && ['decided', 'planned'].includes(clashState(api, decided).state);
    row(el('b', 'wr-day-lead' + (done ? '' : ' overdue'), 'Clash ' + clock(c.b.start)), `${c.a.title} and ${c.b.title}${done ? ' · decided' : ''}`);
  }
  if (!list.childElementCount) list.append(el('li', 'wr-day-empty', 'Nothing due, no Musts and no clashes.'));
  box.append(list);
  return box;
}

/**
 * A clash is a decision, not a loose to-do: which event stays. Calendars are read-only, so the answer becomes a task
 * on Today (the user's own task naming the clash keeps its words and gains the decision in its notes). "Decide later"
 * says so explicitly; Finish never waits on it.
 */
export function clashState(api, clash) {
  const choice = api.ui.clashes[clash.key];
  if (api.ui.clashOpen === clash.key) return {state: 'open', choice};
  if ((choice === 'a' || choice === 'b') && clash.task && String(clash.task.notes ?? '').includes(clashDecision(clash, choice))) return {state: 'decided', choice};
  if (clash.task && taskDate(clash.task)) return {state: 'planned'};
  return {state: choice === 'later' ? 'later' : 'open'};
}

export function clashRow(api, clash) {
  const {ui} = api;
  const {state, choice} = clashState(api, clash);
  const item = el('li', 'wr-risk wr-clash' + (state === 'decided' || state === 'planned' ? ' done' : ''));
  const text = el('span', 'wr-risk-text');
  const lead = el('span', '');
  const when = `${dayName(clash.day)}, ${clock(clash.b.start)}`;
  const reopen = label => {
    const go = button(label, () => { ui.clashOpen = clash.key; api.render(); }, 'wr-btn-text');
    go.dataset.key = 'clash-open:' + clash.key;
    return go;
  };
  if (state === 'decided' || state === 'planned') {
    lead.append(el('b', 'wr-risk-lead', 'Clash decided'), ' · ' + when);
    const sub = el('span', 'wr-risk-sub');
    const [stays, other] = choice === 'b' ? [clash.b, clash.a] : [clash.a, clash.b];
    if (state === 'decided') sub.append('Keep ', el('span', 'wr-nowrap', stays.title), ', move or skip ', el('span', 'wr-nowrap', other.title));
    else sub.append(clash.task.title);
    sub.append(' · ', el('span', 'wr-nowrap', `a task for ${whenText(clash.task, api.now())?.text ?? 'Today'}`));
    text.append(lead, sub);
    item.append(icon('event_available'), text, reopen('Change'));
    return item;
  }
  lead.append(el('b', 'wr-risk-lead', 'Clash'), ' · ' + when);
  // Each event with its time stays whole, so a range never breaks across lines.
  const both = el('span', 'wr-risk-sub');
  both.append(el('span', 'wr-nowrap', `${clash.a.title} ${timeRange(clash.a.start, clash.a.end)}`), ' overlaps ',
    el('span', 'wr-nowrap', `${clash.b.title} ${timeRange(clash.b.start, clash.b.end)}`));
  if (state === 'later') {
    both.append('. Left for later.');
    text.append(lead, both);
    item.append(icon('event_busy'), text, reopen('Decide'));
    return item;
  }
  text.append(lead, both, el('span', 'wr-ask-small', 'Which one stays? Your answer goes on Today as a task.'));
  const choices = el('span', 'wr-choices');
  choices.setAttribute('role', 'group');
  choices.setAttribute('aria-label', 'Which event stays');
  const decide = keep => {
    ui.clashes = {...ui.clashes, [clash.key]: keep};
    ui.clashOpen = null;
    if (keep === 'later') { api.render(); api.saveProgress(); return; }
    api.saveProgress();
    api.run(clashOp(api.data(), clash, keep, api.now()), 'Decision added to Today');
  };
  for (const [keep, label, said] of [['a', clash.a.title, 'Keep ' + clash.a.title], ['b', clash.b.title, 'Keep ' + clash.b.title], ['later', 'Later', 'Decide later']]) {
    const chip = button(label, () => decide(keep), 'wr-chip wr-choice' + (choice === keep ? ' sel' : ''));
    chip.setAttribute('aria-label', said);
    chip.dataset.key = `clash:${keep}:${clash.key}`;
    choices.append(chip);
  }
  text.append(choices);
  item.append(icon('event_busy'), text);
  return item;
}
