/** The task sheet's When card: one line (day, time, length, alert) that unfolds one icon-led chip row for each. */
import {el, icon, button} from './dom.mjs';
import {duration} from './format.mjs';
import {DURATIONS, ALERTS, whenLabel, clockOf, dayPresets, timePresets, foldFor, choiceChip, markChips} from './task-fields.mjs';

const showPicker = event => { try { event.currentTarget.showPicker?.(); } catch {} };

/** "Today, 10:00 AM · 1 h 30 min", or a prompt when nothing is set. */
export function whenSummary({day, time, minutes}) {
  if (!day && minutes == null) return 'Add a day and time';
  const parts = [day ? whenLabel({day, time}) : 'No date'];
  if (minutes != null) parts.push(duration(minutes));
  return parts.join(' · ');
}

function line(symbol, label, cls = '') {
  const node = el('div', 'when-line ' + cls);
  const chips = el('div', 'chip-row choice-chips when-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', label);
  const glyph = icon(symbol, {cls: 'when-glyph'});
  glyph.setAttribute('aria-hidden', 'true');
  node.append(glyph, chips);
  return {node, chips};
}

function nativeChip(type, symbol, label, onValue) {
  const chip = el('label', 'filter-chip exact-chip');
  const input = el('input');
  input.type = type;
  input.setAttribute('aria-label', label);
  input.addEventListener('change', () => { if (input.value) onValue(input.value); });
  input.addEventListener('click', showPicker);
  chip.append(icon(symbol), el('span', 'chip-label', 'Pick'), input);
  return {chip, input};
}

/**
 * `get()` returns {day, time, minutes, alert, repeating}. Each pick saves at once and the card stays open, so a day,
 * then a time, then a length are three taps in one place.
 */
export function whenCard(group, {get, pickDay, pickTime, pickMinutes, pickAlert}) {
  const wrap = el('div', 'field-row when-card');
  const head = button('', null, 'detail-row field-head when-head');
  const summary = el('span', 'detail-text when-summary tnum');
  const bell = icon('notifications_active', {cls: 'when-bell'});
  bell.setAttribute('aria-hidden', 'true');
  head.append(icon('event'), summary, bell, icon('expand_more', {cls: 'when-caret'}));

  const build = inner => {
    const days = line('calendar_today', 'Day');
    for (const [label, day, aria] of dayPresets()) days.chips.append(choiceChip(label, day, pickDay, {aria}));
    const otherDay = nativeChip('date', 'calendar_month', 'Pick a date', pickDay);
    days.chips.append(otherDay.chip, choiceChip('No date', '', pickDay));

    const times = line('schedule', 'Time');
    const exact = nativeChip('time', 'schedule', 'Pick a time', pickTime);
    const drawTimes = ({day, time, repeating}) => {
      times.chips.replaceChildren(...timePresets(time).map(value => choiceChip(clockOf(day, value), value, pickTime)),
        exact.chip, ...(repeating ? [] : [choiceChip('No time', '', pickTime)]));
    };

    const lengths = line('timer', 'Length');
    for (const n of DURATIONS) lengths.chips.append(choiceChip(duration(n), String(n), v => pickMinutes(Number(v)), {aria: 'Length ' + duration(n)}));
    lengths.chips.append(choiceChip('None', '', () => pickMinutes(null), {aria: 'No length'}));

    const alerts = line('notifications', 'Alert', 'when-alert');
    for (const [value, label] of ALERTS) alerts.chips.append(choiceChip(label, value, pickAlert));

    inner.append(days.node, times.node, lengths.node, alerts.node);
    const refresh = () => {
      const now = get();
      markChips(days.chips, now.day);
      if (![...times.chips.querySelectorAll('.choice-chip')].some(chip => chip.dataset.value === now.time) || times.repeating !== now.repeating) {
        times.repeating = now.repeating;
        drawTimes(now);
      }
      markChips(times.chips, now.time);
      markChips(lengths.chips, now.minutes == null ? '' : String(now.minutes));
      markChips(alerts.chips, now.alert);
      alerts.node.hidden = !now.time;
      otherDay.input.value = now.day;
      exact.input.value = now.time;
    };
    refresh();
    return refresh;
  };
  const row = foldFor(group, head, build);
  row.node.classList.add('when-fold');
  wrap.append(head, row.node);

  const paint = now => {
    summary.textContent = whenSummary(now);
    summary.classList.toggle('muted', !now.day && now.minutes == null);
    bell.hidden = now.alert === 'off' || !now.time;
    head.setAttribute('aria-label', `When: ${whenSummary(now)}${bell.hidden ? '' : ', ' + now.alert}. Change`);
  };
  return Object.assign(row, {wrap, paint});
}
