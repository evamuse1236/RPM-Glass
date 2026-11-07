/**
 * The When tab's time ruler: a strip of the day that slides sideways under a fixed centre line and snaps to the Time
 * row's stops (every half hour from 6:00 AM to 11:00 PM, plus the task's own off-grid time). The task's length is a
 * bar from the centre line, in its own lane under the ticks. Letting go saves the stop under the line. The bar's end
 * grip drags the length in 15-minute steps and saves it when let go; a tap on the length words types an exact one.
 */
import {el} from './dom.mjs';
import {timeChips, nextHalfHour} from './task-values.mjs';
import {briefClock} from './task-tabs-model.mjs';
import {duration} from './format.mjs';

export const HALF_HOUR_PX = 32;
const PX_PER_MIN = HALF_HOUR_PX / 30;
export const LENGTH_STEP = 15;

/** The length a grip drag lands on: `from` minutes moved by `dx` px, snapped to 15 minutes, kept within 0…`max`. */
export const lengthAt = (from, dx, max) => Math.max(0, Math.min(max, Math.round((from + dx / PX_PER_MIN) / LENGTH_STEP) * LENGTH_STEP));

export const minutesOf = time => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
const hhmm = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * The ruler for a saved `time` ('' when unset): its stops in clock order, the first and last minute it spans, and
 * the stop it centres on (the saved time, or the next half hour).
 */
export function rulerScale(time = '', now = new Date()) {
  const stops = timeChips(time);
  const first = Math.min(minutesOf(stops[0]), 6 * 60), last = Math.max(minutesOf(stops.at(-1)), 23 * 60);
  return {stops, first, last, width: (last - first) * PX_PER_MIN, centre: time || nextHalfHour(now)};
}

/** Scroll offset that puts `time` under the centre line. */
export const offsetOf = (scale, time) => (minutesOf(time) - scale.first) * PX_PER_MIN;

/** The stop nearest a scroll offset. */
export function stopAt(scale, offset) {
  const minute = scale.first + offset / PX_PER_MIN;
  return scale.stops.reduce((best, stop) => (Math.abs(minutesOf(stop) - minute) < Math.abs(minutesOf(best) - minute) ? stop : best));
}

/** "4 – 4:45 PM", or "11:30 AM – 12:30 PM" across noon: one range, the shared AM/PM written once, as Calendar does. */
export function rangeOf(day, time, to) {
  const a = briefClock(day, time), b = briefClock(day, to);
  const [at, am] = a.split('\u00a0'), [, bm] = b.split('\u00a0');
  return `${am && am === bm ? at : a}\u00a0– ${b}`;
}

/**
 * `save(time)` writes a stop; `saveMinutes(n)` writes a length (null for none); `tick()` runs as the line crosses
 * each stop while sliding and as the grip crosses each step. Returns {node, grip, words, paint({day, time, minutes,
 * off})}; `words` is the length button that opens the exact-length field.
 */
export function timeRuler({save, saveMinutes = () => {}, tick = () => {}}) {
  const node = el('div', 'time-ruler');
  const head = el('div', 'ruler-head');
  const readout = el('p', 'ruler-readout tnum');
  readout.setAttribute('aria-hidden', 'true');
  const words = el('button', 'ruler-words tnum');
  words.type = 'button';
  const field = el('label', 'ruler-field');
  const input = el('input', 'tnum');
  Object.assign(input, {type: 'number', min: 1, max: 1440, step: 1, inputMode: 'numeric'});
  input.setAttribute('aria-label', 'Length in minutes');
  field.append(input, el('span', 'ruler-unit', 'min'));
  field.hidden = true;
  const rail = el('div', 'ruler-rail');
  const track = el('div', 'ruler-track');
  track.tabIndex = 0;
  track.setAttribute('role', 'slider');
  track.setAttribute('aria-label', 'Time');
  track.setAttribute('aria-valuemin', '0');
  const scaleNode = el('div', 'ruler-scale');
  const line = el('div', 'ruler-line');
  scaleNode.append(line);
  track.append(scaleNode);
  const length = el('span', 'ruler-length');
  const grip = el('span', 'ruler-grip');
  grip.tabIndex = 0;
  grip.setAttribute('role', 'slider');
  grip.setAttribute('aria-label', 'Length');
  grip.setAttribute('aria-valuemin', '0');
  grip.setAttribute('aria-valuemax', '1440');
  rail.append(track, length, el('span', 'ruler-centre'), grip);
  head.append(readout, words, field);
  node.append(head, rail);

  let state = {day: '', time: '', minutes: null, off: false};
  let scale = rulerScale('');
  let drawn = '';
  let touched = false, holding = false, shown = null;
  let drag = null, editing = false;

  const show = (time, minutes = state.minutes) => {
    const to = time && minutes ? hhmm((minutesOf(time) + minutes) % (24 * 60)) : '';
    readout.textContent = !state.day ? 'No date' : !time ? 'No time' : to ? rangeOf(state.day, time, to) : briefClock(state.day, time);
    words.textContent = minutes ? duration(minutes) : 'Add length';
    words.setAttribute('aria-label', minutes ? `Exact length, ${duration(minutes)}` : 'Add an exact length');
    words.hidden = editing;
    node.classList.toggle('is-unset', !time);
    track.setAttribute('aria-valuetext', !time ? readout.textContent : to ? `${briefClock(state.day, time)} to ${briefClock(state.day, to)}` : readout.textContent);
    track.setAttribute('aria-valuemax', String(scale.stops.length - 1));
    track.setAttribute('aria-valuenow', String(Math.max(0, scale.stops.indexOf(time || scale.centre))));
  };

  /** The longest length the grip can reach: the half of the rail right of the centre line, in whole steps. */
  const reach = () => Math.max(LENGTH_STEP, Math.floor((rail.clientWidth / 2 - 8) / PX_PER_MIN / LENGTH_STEP) * LENGTH_STEP);
  const stretch = minutes => {
    const px = Math.min(minutes ?? 0, reach()) * PX_PER_MIN;
    length.style.inlineSize = px + 'px';
    grip.style.insetInlineStart = `calc(50% + ${px}px)`;
    grip.classList.toggle('is-empty', !minutes);
    length.hidden = !state.time || !minutes;
    grip.setAttribute('aria-valuenow', String(minutes ?? 0));
    grip.setAttribute('aria-valuetext', minutes ? duration(minutes) : 'No length');
  };
  const sized = minutes => {
    show(state.time, minutes);
    stretch(minutes);
  };
  grip.addEventListener('pointerdown', event => {
    if (state.off || !state.time || event.button > 0) return;
    event.preventDefault();
    grip.setPointerCapture(event.pointerId);
    const from = Math.min(state.minutes ?? 0, reach());
    drag = {id: event.pointerId, x: event.clientX, from, at: from, max: reach()};
    node.classList.add('is-sizing');
  });
  grip.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const at = lengthAt(drag.from, event.clientX - drag.x, drag.max);
    if (at === drag.at) return;
    drag.at = at;
    tick();
    sized(at);
  });
  const release = keep => event => {
    if (!drag || event.pointerId !== drag.id) return;
    const {at} = drag;
    drag = null;
    node.classList.remove('is-sizing');
    const next = at || null;
    if (keep && next !== (state.minutes ?? null)) saveMinutes(next);
    else sized(state.minutes);
  };
  grip.addEventListener('pointerup', release(true));
  grip.addEventListener('pointercancel', release(false));
  grip.addEventListener('keydown', event => {
    const step = {ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1}[event.key];
    if (!step || state.off || !state.time) return;
    event.preventDefault();
    const now = state.minutes ?? 0;
    const next = Math.max(0, Math.min(24 * 60, (Math.round(now / LENGTH_STEP) + step) * LENGTH_STEP));
    if (next !== now) saveMinutes(next || null);
  });

  /** The exact-length field replaces the words while it is open. Enter or leaving it saves (Back leaves it too, as in
   * every sheet field), and the snackbar's Undo puts the old length back. */
  const openField = () => {
    editing = true;
    input.value = state.minutes ?? '';
    words.hidden = true;
    field.hidden = false;
    input.focus({preventScroll: true});
    input.select();
  };
  const closeField = keep => {
    if (!editing) return;
    editing = false;
    field.hidden = true;
    show(state.time);
    const raw = input.value.trim(), n = Math.round(Number(raw));
    const next = raw === '' ? null : n >= 1 && n <= 1440 ? n : undefined;
    if (keep && next !== undefined && next !== (state.minutes ?? null)) saveMinutes(next);
  };
  words.addEventListener('click', openField);
  input.addEventListener('blur', () => closeField(true));
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    closeField(true);
    words.focus({preventScroll: true});
  });

  const draw = () => {
    const key = scale.stops.join();
    if (key === drawn) return;
    drawn = key;
    line.style.inlineSize = scale.width + 'px';
    const marks = scale.stops.map(stop => {
      const at = minutesOf(stop);
      const mark = el('i', at % 60 ? 'ruler-tick' : 'ruler-tick is-hour');
      mark.style.insetInlineStart = (at - scale.first) * PX_PER_MIN + 'px';
      if (at % 60 === 0) mark.append(el('span', 'ruler-hour', briefClock('2026-01-01', stop)));
      if (at % 30) mark.classList.add('is-own');
      if (at % 120 === 60) mark.classList.add('is-odd');
      return mark;
    });
    line.replaceChildren(...marks);
  };

  const place = () => {
    if (holding || !track.clientWidth) return;
    const target = offsetOf(scale, state.time || scale.centre);
    if (Math.abs(track.scrollLeft - target) > 0.5) track.scrollTo({left: target, behavior: 'instant'});
  };

  const settle = () => {
    holding = false;
    if (!touched) return;
    touched = false;
    const stop = stopAt(scale, track.scrollLeft);
    if (stop !== state.time) save(stop);
    else show(state.time);
  };
  for (const type of ['pointerdown', 'touchstart', 'wheel']) {
    track.addEventListener(type, () => { touched = true; holding = type !== 'wheel'; }, {passive: true});
  }
  for (const type of ['pointerup', 'pointercancel', 'touchend']) {
    track.addEventListener(type, () => { holding = false; }, {passive: true});
  }
  let quiet = 0;
  track.addEventListener('scroll', () => {
    const stop = stopAt(scale, track.scrollLeft);
    if (touched && stop !== shown) {
      if (shown != null) tick();
      shown = stop;
      show(stop);
    }
    clearTimeout(quiet);
    if (!('onscrollend' in window)) quiet = setTimeout(() => { if (!holding) settle(); }, 160);
  }, {passive: true});
  track.addEventListener('scrollend', () => { if (!holding) settle(); });
  track.addEventListener('keydown', event => {
    const step = {ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1}[event.key];
    if (!step || state.off) return;
    event.preventDefault();
    const at = scale.stops.indexOf(state.time || scale.centre);
    const next = state.time ? scale.stops[Math.max(0, Math.min(scale.stops.length - 1, at + step))] : scale.centre;
    if (next && next !== state.time) save(next);
  });
  new ResizeObserver(() => { place(); if (!drag) stretch(state.minutes); }).observe(track);

  const paint = next => {
    state = {...state, ...next};
    scale = rulerScale(state.time);
    draw();
    shown = state.time || null;
    if (!drag) sized(state.minutes);
    grip.hidden = !state.time || !!state.off;
    node.classList.toggle('is-off', !!state.off);
    track.inert = !!state.off;
    track.setAttribute('aria-disabled', String(!!state.off));
    place();
  };
  return {node, grip, words, paint};
}
