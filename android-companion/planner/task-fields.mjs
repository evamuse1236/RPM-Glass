/**
 * The task sheet's inline choices. Each field is a row that unfolds its choices under itself (one open at a time);
 * a choice is handed straight back to the sheet, which saves it, so nothing here owns a Save button.
 * The same choosers serve the task sheet and Quick add.
 */
import {localDay, shiftDay} from '../planner-state.mjs';
import {reducedMotion} from '../surface-motion.mjs';
import {el, icon, button} from './dom.mjs';
import {clock, duration, relativeDay, timeValue} from './format.mjs';

export const DURATIONS = [15, 30, 45, 60, 90, 120];
export const TIMES = ['09:00', '14:00', '19:00'];
export const REPEATS = [['', "Doesn't repeat"], ['daily', 'Daily'], ['weekdays', 'Every weekday'], ['weekly', 'Weekly'],
  ['after', 'After completion']];
export const ALERTS = [['off', 'No alert'], ['reminder', 'Reminder'], ['alarm', 'Ringing alarm']];

/* ---------- values ---------- */

/** {day, time} of a task (or of one occurrence `when`); '' when unset. */
export function whenOf(task, when = task?.planned) {
  if (when) return {day: localDay(new Date(when)), time: timeValue(when)};
  return {day: task?.plannedDate ?? '', time: ''};
}

/** The saved fields for a {day, time}: a time needs a day, a day alone is a plannedDate. */
export function whenFields({day, time}) {
  if (day && time) return {planned: new Date(`${day}T${time}`).toISOString(), plannedDate: null};
  return {planned: null, plannedDate: day || null};
}

/** "Today, 4:00 PM", "Tomorrow", "Mon, Oct 5, 9:00 AM", or "No date". */
export function whenLabel({day, time}) {
  if (!day) return 'No date';
  return relativeDay(day) + (time ? ', ' + clockOf(day, time) : '');
}

export const clockOf = (day, time) => clock(new Date(`${day || localDay()}T${time}`));

/**
 * One-tap days: Today, Tomorrow, then the weekend (Mon–Thu), next Monday (Fri, Sat) or next Saturday (Sun), never
 * repeating Tomorrow.
 * Returns [[label, day, accessible name]].
 */
export function dayPresets(today = localDay()) {
  const weekday = new Date(today + 'T12:00').getDay();
  const presets = [['Today', today], ['Tomorrow', shiftDay(today, 1)]];
  if (weekday >= 1 && weekday <= 4) presets.push(['This weekend', shiftDay(today, 6 - weekday)]);
  else if (weekday === 0) presets.push(['Next weekend', shiftDay(today, 6)]);
  else presets.push(['Next week', shiftDay(today, 8 - weekday)]);
  return presets.map(([label, day]) => [label, day, `${label}, ${longDay(day)}`]);
}

/**
 * One-tap reschedules for a swiped row (Things' When, Todoist's Schedule): each is a whole date and time, so one tap
 * saves. Today and Tomorrow keep the task's time; Tonight (until 7 PM), Tomorrow morning at 9; the weekend or next
 * week; No date for a dated task. A repeating task keeps a date and a time, so it gets no date-only choice.
 * Returns [{key, label, hint, icon, value: {day, time}, current}].
 */
export function schedulePresets({day = '', time = ''} = {}, now = new Date(), {repeating = false} = {}) {
  const today = localDay(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const tomorrow = shiftDay(today, 1);
  const weekday = d => new Date(d + 'T12:00').toLocaleDateString([], {weekday: 'short'});
  const at = (d, t) => (t ? clockOf(d, t) : '');
  const out = [];
  const add = (key, label, symbol, value, hint) => {
    if (repeating && !(value.day && value.time)) return;
    out.push({key, label, icon: symbol, value, hint, current: value.day === day && value.time === time});
  };
  add('today', 'Today', 'today', {day: today, time}, at(today, time));
  if (minutes < 19 * 60 && time !== '19:00') add('tonight', 'Tonight', 'bedtime', {day: today, time: '19:00'}, at(today, '19:00'));
  add('tomorrow', 'Tomorrow', 'event', {day: tomorrow, time}, at(tomorrow, time) || weekday(tomorrow));
  if (time !== '09:00') add('morning', 'Tomorrow morning', 'wb_sunny', {day: tomorrow, time: '09:00'}, at(tomorrow, '09:00'));
  const [label, later] = dayPresets(today)[2];
  add('later', label, 'date_range', {day: later, time}, [weekday(later), at(later, time)].filter(Boolean).join(' '));
  if (day) add('none', 'No date', 'event_busy', {day: '', time: ''}, '');
  return out;
}

/**
 * Blocks for a `#word` typed in Quick add: titles with a word starting with it first, then titles containing it.
 * Returns up to `limit` Blocks; a bare "#" offers the first ones (the caller puts the recent Block first).
 */
export function blockMatches(blocks, query, limit = 4) {
  const q = String(query ?? '').toLowerCase();
  if (!q) return blocks.slice(0, limit);
  const words = b => b.title.toLowerCase().split(/[^a-z0-9]+/i);
  const starts = blocks.filter(b => words(b).some(w => w.startsWith(q)));
  const contains = blocks.filter(b => !starts.includes(b) && b.title.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** The `#word` being typed just before the caret: {query, start, end} or null. */
export function hashToken(text, caret = String(text ?? '').length) {
  const before = String(text ?? '').slice(0, caret);
  const found = before.match(/(?:^|\s)#([^\s#]*)$/);
  if (!found) return null;
  const start = caret - found[1].length - 1;
  return {query: found[1], start, end: caret};
}

/**
 * A `#word` in the title that names exactly one Block strongly enough to choose it without a tap: at least two
 * letters, starting a word of that Block's title, and matching no other Block at all. The last such word wins.
 * Returns {block, query, start, end, match} or null; with several matches the sheet offers chips instead.
 */
export function hashTag(text, blocks) {
  const value = String(text ?? '');
  const found = [...value.matchAll(/(^|\s)#([^\s#]+)/g)];
  for (const m of found.reverse()) {
    const query = m[2].toLowerCase();
    if (query.length < 2) continue;
    const matches = blockMatches(blocks, query, 2);
    if (matches.length !== 1) continue;
    if (!matches[0].title.toLowerCase().split(/[^a-z0-9]+/i).some(w => w.startsWith(query))) continue;
    const start = m.index + m[1].length;
    return {block: matches[0], query, start, end: start + m[2].length + 1, match: '#' + m[2]};
  }
  return null;
}

/** The title without a `#word` (at start..end), spaces tidied. */
export function withoutTag(text, {start, end}) {
  return (text.slice(0, start) + text.slice(end)).replace(/\s{2,}/g, ' ').trim();
}

const longDay = day => new Date(day + 'T12:00').toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'});

/** Time presets with the task's own time folded in, in clock order. */
export function timePresets(current = '') {
  return [...new Set([...TIMES, ...(current ? [current] : [])])].sort();
}

export const repeatValue = task => (task?.repeatAfterDays ? 'after' : task?.recurrence ?? '');
export function repeatLabel(task) {
  if (task?.repeatAfterDays) return `${task.repeatAfterDays} ${task.repeatAfterDays === 1 ? 'day' : 'days'} after completion`;
  return REPEATS.find(([value]) => value === (task?.recurrence ?? ''))?.[1] ?? "Doesn't repeat";
}

const WORDS = {today: 0, tonight: 0, tomorrow: 1, tmr: 1, tmrw: 1};
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TIME = String.raw`(?:\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm))`;
// Whole words only: "tomorrow", "friday", "next monday", or a short day with a time ("mon 9am"), so "I sat the exam"
// or "sun cream" never read as dates.
const WHEN = new RegExp(String.raw`\b(today|tonight|tomorrow|tmrw?|(?:next\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)`
  + String.raw`|(?:next\s+)?(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?=\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*[ap]m))\b${TIME}?`, 'i');

/**
 * A date (and time) written in the title, as Quick add offers it: "tomorrow", "friday", "mon 9am", "tonight".
 * Returns {day, time, match} or null. The words stay in the title; the sheet shows the date it read, removable.
 */
export function parseWhen(text, today = localDay()) {
  const found = String(text ?? '').match(WHEN);
  if (!found) return null;
  const word = found[1].toLowerCase().replace(/\s+/g, ' ');
  let day;
  if (word in WORDS) day = shiftDay(today, WORDS[word]);
  else {
    const target = WEEKDAYS.indexOf(word.replace('next ', '').slice(0, 3));
    const ahead = (target - new Date(today + 'T12:00').getDay() + 7) % 7 || 7;
    day = shiftDay(today, ahead); // "next monday" reads as the coming Monday, as Todoist reads it
  }
  let time = word === 'tonight' ? '19:00' : '';
  if (found[4]) {
    const hours = Number(found[2]) % 12 + (found[4].toLowerCase() === 'pm' ? 12 : 0), minutes = Number(found[3] ?? 0);
    if (Number(found[2]) >= 1 && Number(found[2]) <= 12 && minutes < 60) {
      time = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
    }
  }
  return {day, time, match: found[0].trim()};
}

/* ---------- inline rows ---------- */

/**
 * Keeps one fold open at a time. `onBack` closes the open one (Android Back closes the topmost layer first).
 * `scroller` is the sheet body, scrolled just enough to show an unfolding chooser.
 */
export function foldGroup(scroller) {
  const group = {current: null};
  group.open = row => {
    if (group.current === row) return;
    group.current?.close();
    group.current = row;
    row.open();
    reveal(scroller, row);
  };
  group.close = () => {
    const row = group.current;
    group.current = null;
    row?.close();
    return !!row;
  };
  group.toggle = row => (group.current === row ? group.close() : group.open(row));
  group.onBack = () => group.close();
  return group;
}

/** Scroll the sheet body so a chooser that is unfolding ends up in view, never past its own row. */
function reveal(scroller, row) {
  if (!scroller) return;
  const body = scroller.getBoundingClientRect();
  const top = row.node.getBoundingClientRect().top;
  const delta = Math.min(top + row.inner.scrollHeight + 16 - body.bottom, top - body.top - 64);
  if (delta > 0) scroller.scrollBy({top: delta, behavior: reducedMotion() ? 'auto' : 'smooth'});
}

/** The animated container: grid rows 0fr → 1fr, so the rows below slide instead of jumping. */
export function fold(cls = '') {
  const node = el('div', 'field-fold ' + cls);
  const inner = el('div', 'fold-inner');
  node.append(inner);
  node.inert = true;
  node.setOpen = open => {
    node.classList.toggle('open', open);
    node.inert = !open;
  };
  return {node, inner};
}

let foldCount = 0;

/**
 * Choices that unfold under `head` (a row or a chip). `build(inner)` runs on first open and returns `refresh`,
 * which re-marks the chosen value after a save or an Undo. The caller places `node` where the choices belong.
 */
export function foldFor(group, head, build) {
  const {node, inner} = fold();
  node.id = 'field-fold-' + (++foldCount);
  head.setAttribute('aria-expanded', 'false');
  head.setAttribute('aria-controls', node.id);
  head.addEventListener('click', () => group.toggle(row));
  let refresh = null;
  const row = {
    head, node, inner,
    get isOpen() { return node.classList.contains('open'); },
    open() {
      if (!refresh) refresh = build(inner, row) ?? (() => {});
      else refresh();
      node.setOpen(true);
      head.setAttribute('aria-expanded', 'true');
      head.classList.add('is-open');
    },
    close() {
      // Focus inside the choices goes back to what opened them (or the sheet), never to the page behind.
      const hadFocus = node.contains(document.activeElement);
      node.setOpen(false);
      head.setAttribute('aria-expanded', 'false');
      head.classList.remove('is-open');
      if (!hadFocus) return;
      const target = head.getClientRects().length ? head : head.closest('.sheet')?.querySelector('.sheet-close');
      target?.focus({preventScroll: true});
    },
    refresh() { if (refresh) refresh(); },
  };
  return row;
}

/** A field row: icon and current value, with its choices unfolding below it. */
export function fieldRow(group, {symbol, cls = '', build, label = ''}) {
  const wrap = el('div', 'field-row ' + cls);
  const head = button('', null, 'detail-row field-head');
  const text = el('span', 'detail-text');
  head.append(icon(symbol), text);
  const row = foldFor(group, head, build);
  wrap.append(head, row.node);
  return Object.assign(row, {
    wrap,
    icon: head.querySelector('.ms'),
    set(value, {muted = false, aria = ''} = {}) {
      text.textContent = value;
      text.classList.toggle('muted', muted);
      head.setAttribute('aria-label', `${label ? label + ': ' : ''}${aria || value}. Change`);
    },
  });
}

/* ---------- chips ---------- */

/** A filter chip carrying a value; chosen chips show a check as well as the fill, so colour is never the only signal. */
export function choiceChip(text, value, onPick, {aria = '', cls = ''} = {}) {
  const chip = button('', () => {
    markChips(chip.parentElement, value); // the choice shows at once; the save follows
    onPick(value, chip);
  }, 'filter-chip choice-chip ' + cls);
  chip.dataset.value = value;
  chip.append(icon('check', {cls: 'chip-check'}), el('span', 'chip-label', text));
  if (aria) chip.setAttribute('aria-label', aria);
  chip.setAttribute('aria-pressed', 'false');
  return chip;
}

/** Mark the chip whose value equals `value` (all others off). */
export function markChips(host, value) {
  for (const chip of host.querySelectorAll('.choice-chip')) chip.setAttribute('aria-pressed', String(chip.dataset.value === value));
}

export function chipRow(cls = '') {
  return el('div', 'chip-row wrap choice-chips ' + cls);
}

export const overline = text => el('h3', 'overline fold-label', text);

/* ---------- choosers ---------- */

/**
 * Day and time. `get()` returns {day, time}; `pickDay(day)` and `pickTime(time)` save.
 * Days: presets (Quick add shows its own above), the next seven days as a strip, any other date. Times: presets,
 * No time, an exact time.
 */
export function dateChooser(host, {get, pickDay, pickTime, today = localDay(), presets = true, noDate = presets}) {
  const days = chipRow('day-chips');
  if (presets) for (const [label, day, aria] of dayPresets(today)) days.append(choiceChip(label, day, pickDay, {aria}));
  if (noDate) days.append(choiceChip('No date', '', pickDay));

  const strip = el('div', 'week-strip fold-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Next seven days');
  for (let i = 0; i < 7; i++) {
    const day = shiftDay(today, i), date = new Date(day + 'T12:00');
    const cell = button('', () => {
      for (const other of strip.children) other.setAttribute('aria-pressed', String(other === cell));
      markChips(days, day);
      pickDay(day);
    }, 'week-day');
    cell.dataset.value = day;
    cell.classList.toggle('is-today', i === 0);
    cell.setAttribute('aria-label', date.toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'}));
    cell.append(el('span', 'week-letter', date.toLocaleDateString([], {weekday: 'narrow'})),
      el('span', 'week-number tnum', String(date.getDate())));
    strip.append(cell);
  }

  const other = el('label', 'filter-chip exact-chip');
  const otherInput = el('input');
  otherInput.type = 'date';
  otherInput.setAttribute('aria-label', 'Other date');
  otherInput.addEventListener('change', () => { if (otherInput.value) pickDay(otherInput.value); });
  otherInput.addEventListener('click', openPicker);
  other.append(icon('calendar_month'), el('span', 'chip-label', 'Other date'), otherInput);
  days.append(other);

  const times = chipRow('time-chips');
  const exact = el('label', 'filter-chip exact-chip');
  const exactInput = el('input');
  exactInput.type = 'time';
  exactInput.setAttribute('aria-label', 'Exact time');
  exactInput.addEventListener('change', () => { if (exactInput.value) pickTime(exactInput.value); });
  exactInput.addEventListener('click', openPicker);
  exact.append(icon('schedule'), el('span', 'chip-label', 'Exact time'), exactInput);

  const drawTimes = () => {
    const {day, time} = get();
    times.replaceChildren(...timePresets(time).map(value => choiceChip(clockOf(day, value), value, pickTime)),
      choiceChip('No time', '', pickTime), exact);
    markChips(times, time);
  };
  host.append(...(presets ? [overline('Day')] : []), days, strip, overline('Time'), times);
  const refresh = () => {
    const {day, time} = get();
    markChips(days, day);
    for (const cell of strip.children) cell.setAttribute('aria-pressed', String(cell.dataset.value === day));
    if (![...times.querySelectorAll('.choice-chip')].some(chip => chip.dataset.value === time)) drawTimes();
    else markChips(times, time);
    otherInput.value = day;
    exactInput.value = time;
  };
  drawTimes();
  refresh();
  return refresh;
}

/** The system date or time picker, the fallback for a value no chip offers. */
function openPicker(event) {
  try { event.currentTarget.showPicker?.(); } catch {}
}

/** Estimate chips plus an exact number of minutes. */
export function durationChooser(host, {get, pick}) {
  const chips = chipRow();
  for (const n of DURATIONS) chips.append(choiceChip(duration(n), String(n), value => pick(Number(value))));
  chips.append(choiceChip('No estimate', '', () => pick(null)));
  const exact = el('label', 'filter-chip exact-chip minutes-chip');
  const input = el('input');
  input.type = 'number';
  input.min = 1;
  input.max = 1440;
  input.inputMode = 'numeric';
  input.setAttribute('aria-label', 'Other estimate in minutes');
  input.addEventListener('change', () => {
    const n = Math.round(Number(input.value));
    if (n >= 1 && n <= 1440) pick(n);
  });
  exact.append(el('span', 'chip-label', 'Other'), input, el('span', 'chip-label', 'min'));
  chips.append(exact);
  host.append(chips);
  const refresh = () => {
    const minutes = get();
    markChips(chips, minutes == null ? '' : String(minutes));
    input.value = minutes != null && !DURATIONS.includes(minutes) ? minutes : '';
  };
  refresh();
  return refresh;
}

/** Repeat patterns; After completion asks for its number of days in place. */
export function repeatChooser(host, {get, pick}) {
  const chips = chipRow();
  for (const [value, text] of REPEATS) chips.append(choiceChip(text, value, choice => pick(choice, Number(days.value) || 1)));
  const after = el('label', 'after-days');
  const days = el('input');
  days.type = 'number';
  days.min = 1;
  days.max = 365;
  days.inputMode = 'numeric';
  days.setAttribute('aria-label', 'Days after completion');
  days.addEventListener('change', () => {
    const n = Math.round(Number(days.value));
    if (n >= 1 && n <= 365) pick('after', n);
  });
  after.append(el('span', '', 'Repeat'), days, el('span', '', 'days after completion'));
  host.append(chips, after);
  const refresh = () => {
    const {value, every} = get();
    markChips(chips, value);
    after.hidden = value !== 'after';
    days.value = every ?? 1;
  };
  refresh();
  return refresh;
}

export function alertChooser(host, {get, pick}) {
  const chips = chipRow();
  for (const [value, text] of ALERTS) chips.append(choiceChip(text, value, pick));
  host.append(chips);
  const refresh = () => markChips(chips, get());
  refresh();
  return refresh;
}

/**
 * Searchable Block list: the recent Block first, then a suggested one, then the rest; five at first with Show all.
 * `get()` returns the chosen id (null for No block); `pick(id, title)` saves.
 */
export function blockChooser(host, {blocks, get, pick, recent = null, suggested = null}) {
  const search = el('label', 'block-search');
  const input = el('input');
  input.type = 'search';
  input.placeholder = 'Search Blocks';
  input.setAttribute('aria-label', 'Search Blocks');
  search.append(icon('search'), input);
  const list = el('div', 'choice-list');
  let all = false;
  const ordered = () => {
    const rank = b => (b.id === recent ? 0 : b.id === suggested ? 1 : 2);
    return blocks().slice().sort((a, b) => rank(a) - rank(b));
  };
  const draw = () => {
    const query = input.value.trim().toLowerCase();
    const chosen = get() ?? null;
    const rows = ordered().filter(b => !query || b.title.toLowerCase().includes(query));
    const shown = query || all ? rows : rows.slice(0, 5);
    const choices = [...shown.map(b => [b.id, b.title]), ...(!query || 'no block'.includes(query) ? [[null, 'No block']] : [])];
    list.replaceChildren(...choices.map(([id, title]) => {
      const row = button('', () => pick(id, title), 'choice-row');
      row.setAttribute('aria-pressed', String(chosen === id));
      row.append(icon(id ? 'stacks' : 'inbox'), el('span', '', title));
      if (id && id === recent) row.append(el('span', 'choice-hint', 'Recent'));
      else if (id && id === suggested) row.append(el('span', 'choice-hint', 'Suggested'));
      if (chosen === id) row.append(icon('check', {cls: 'trailing'}));
      return row;
    }));
    if (!query && !all && rows.length > shown.length) {
      list.append(button(`Show all ${rows.length} Blocks`, () => { all = true; draw(); }, 'text-btn show-all'));
    }
  };
  input.addEventListener('input', draw);
  host.append(search, list);
  draw();
  return draw;
}

export function recentBlock() {
  try { return localStorage.getItem('rpm-recent-block'); } catch { return null; }
}

export function rememberBlock(id) {
  if (!id) return;
  try { localStorage.setItem('rpm-recent-block', id); } catch {}
}
