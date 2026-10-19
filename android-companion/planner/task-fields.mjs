/**
 * Quick add's inline choices. Each field unfolds its choices under its chip (one open at a time); a choice is handed
 * straight back to the sheet, which saves it, so nothing here owns a Save button. The Block search also serves Move to
 * Block.
 */
import {localDay, shiftDay} from '../planner-state.mjs';
import {reducedMotion} from '../surface-motion.mjs';
import {el, icon, button} from './dom.mjs';
import {duration} from './format.mjs';
import {DURATIONS, REPEATS, ALERTS, clockOf, dayPresets, timePresets} from './task-values.mjs';
export {DURATIONS, TIMES, TIME_GRID, timeChips, nextHalfHour, dayChips, REPEATS, ALERTS, whenOf, whenFields, whenLabel, clockOf, dayPresets, schedulePresets, blockMatches, hashToken, hashTag, withoutTag, timePresets, repeatValue, repeatLabel, parseWhen} from './task-values.mjs';

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
