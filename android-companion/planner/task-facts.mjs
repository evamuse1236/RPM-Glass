/** The task sheet's chip rows: Day, Time, Length, Alert and Repeat. Each chip saves at once; the rows never fold. */
import {localDay} from '../planner-state.mjs';
import {el} from './dom.mjs';
import {duration} from './format.mjs';
import {DURATIONS, REPEAT_CHIPS, dayChips, timeChips, nextHalfHour, clockOf} from './task-values.mjs';
import {factRow, chipRow, chip, pickerChip, markChips, settleChip, revealChip, setDisabled} from './fact-rows.mjs';

export const ALERT_CHIPS = [['off', 'No alert', 'notifications_off', ''], ['reminder', 'Reminder', 'notifications', ''],
  ['alarm', 'Alarm', 'alarm', 'Ringing alarm']];

function errorSlot() {
  const slot = el('p', 'field-error');
  slot.setAttribute('role', 'alert');
  slot.hidden = true;
  return slot;
}

/** Re-fill `row` only when the values it should offer change, so a tap never rebuilds the chip under the finger. */
function refill(row, values, build) {
  const key = values.join('|');
  if (row.dataset.values === key) return;
  row.dataset.values = key;
  row.replaceChildren(...build());
}

/**
 * `get()` returns {day, time, minutes, alert, repeat, every, repeating}. `pick` holds day(day), time(time),
 * minutes(n | null), alert(type) and repeat(value, every), each saving at once.
 * Returns {rows, clash, paint(now), reveal(), error(name, message)}; `clash` is the line under the time.
 */
export function taskFacts({get, pick}) {
  const choose = (row, save) => (value, node) => {
    settleChip(row, markChips(row, value));
    save(value, node);
  };
  const picked = (row, save) => value => {
    save(value);
    settleChip(row, row.querySelector('button.chip[aria-pressed=true]'));
  };
  const days = chipRow('Day');
  const dayPicker = pickerChip('date', 'edit_calendar', 'Pick', 'Pick a date', picked(days, pick.day));
  const noDate = chip('No date', '', choose(days, pick.day));

  const times = chipRow('Time');
  const timePicker = pickerChip('time', 'keyboard', 'Pick', 'Pick a time', picked(times, pick.time));
  const noTime = chip('No time', '', choose(times, pick.time));
  const clash = el('p', 'field-alert');
  clash.hidden = true;

  const lengths = chipRow('Length');
  const other = pickerChip('number', 'keyboard', 'Other', 'Other length', value => {
    const n = Math.round(Number(value));
    if (n >= 1 && n <= 1440) pick.minutes(n);
  });
  Object.assign(other.input, {min: 1, max: 1440});
  const noLength = chip('No length', '', choose(lengths, () => pick.minutes(null)));

  const alerts = chipRow('Alert');
  for (const [value, word, symbol, aria] of ALERT_CHIPS) alerts.append(chip(word, value, choose(alerts, pick.alert), {symbol, aria}));

  const repeats = chipRow('Repeat');
  const every = el('input');
  for (const [value, text] of REPEAT_CHIPS) repeats.append(chip(text, value, choose(repeats, v => pick.repeat(v, Number(every.value) || 1))));
  const after = el('label', 'after-days');
  Object.assign(every, {type: 'number', min: 1, max: 365, inputMode: 'numeric'});
  every.setAttribute('aria-label', 'Days after completion');
  every.addEventListener('change', () => {
    const n = Math.round(Number(every.value));
    if (n >= 1 && n <= 365) pick.repeat('after', n);
  });
  after.append(el('span', '', 'Repeat'), every, el('span', '', 'days after completion'));

  const errors = {day: errorSlot(), repeat: errorSlot()};
  const rows = [
    factRow('calendar_today', [days, errors.day]),
    factRow('schedule', [times, clash]),
    factRow('timer', lengths),
    factRow('notifications', alerts),
    factRow('repeat', [repeats, after, errors.repeat]),
  ];

  const paint = now => {
    const today = localDay();
    const offered = dayChips(today, now.day);
    refill(days, offered.map(c => c.day), () => [...offered.map(c => chip(c.label, c.day, choose(days, pick.day), {aria: c.aria})),
      dayPicker.node, noDate]);
    const clock = timeChips(now.time);
    refill(times, [...clock, now.repeating], () => [timePicker.node,
      ...clock.map(value => chip(clockOf(now.day, value), value, choose(times, pick.time), {cls: 'tnum'})),
      ...(now.repeating ? [] : [noTime])]);
    const custom = now.minutes != null && !DURATIONS.includes(now.minutes) ? [now.minutes] : [];
    const spans = [...DURATIONS, ...custom].sort((a, b) => a - b);
    refill(lengths, spans, () => [...spans.map(n => chip(duration(n), String(n), choose(lengths, v => pick.minutes(Number(v))))),
      other.node, noLength]);
    markChips(days, now.day);
    markChips(times, now.time);
    markChips(lengths, now.minutes == null ? '' : String(now.minutes));
    markChips(alerts, now.alert);
    markChips(repeats, now.repeat);
    setDisabled(times, !now.day);
    setDisabled(alerts, !now.day || !now.time);
    after.hidden = now.repeat !== 'after';
    if (document.activeElement !== every) every.value = now.every ?? 1;
    dayPicker.input.value = now.day;
    timePicker.input.value = now.time;
  };

  /** On open each row already shows its chosen chip; the time row puts it (or the next half hour) second. */
  const reveal = () => {
    const now = get();
    const pressed = row => row.querySelector('button.chip[aria-pressed=true]');
    for (const row of [days, lengths, alerts, repeats]) revealChip(row, pressed(row));
    const time = pressed(times) ?? times.querySelector(`button.chip[data-value="${nextHalfHour()}"]`);
    if (now.time || time) revealChip(times, time, {second: true});
  };

  const error = (name, message) => {
    errors[name].textContent = message ?? '';
    errors[name].hidden = !message;
  };
  return {rows, clash, paint, reveal, error};
}
