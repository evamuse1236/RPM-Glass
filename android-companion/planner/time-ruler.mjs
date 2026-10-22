/**
 * The When tab's time ruler: a strip of the day that slides sideways under a fixed centre line and snaps to the Time
 * row's stops (every half hour from 6:00 AM to 11:00 PM, plus the task's own off-grid time). Busy times are grey
 * marks; the task's own length is a bar from the centre line. Letting go saves the stop under the line.
 */
import {el} from './dom.mjs';
import {timeChips, nextHalfHour} from './task-values.mjs';
import {briefClock} from './task-tabs-model.mjs';

export const HALF_HOUR_PX = 32;
const PX_PER_MIN = HALF_HOUR_PX / 30;

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

/** Busy spans of a day as [start, end] minutes from midnight, cut to the day, merged where they touch. */
export function busySpans(items, day) {
  const start = new Date(`${day}T00:00`).getTime();
  const spans = items.map(i => [Math.max(0, (+i.start - start) / 60000), Math.min(24 * 60, (+i.end - start) / 60000)])
    .filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return merged;
}

/**
 * `save(time)` writes a stop; `tick()` runs as the line crosses each stop while sliding.
 * Returns {node, paint({day, time, minutes, busy, off})}.
 */
export function timeRuler({save, tick = () => {}}) {
  const node = el('div', 'time-ruler');
  const readout = el('p', 'ruler-readout tnum');
  readout.setAttribute('aria-hidden', 'true');
  const start = el('span', 'ruler-start');
  const end = el('span', 'ruler-end');
  readout.append(start, end);
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
  rail.append(track, length, el('span', 'ruler-centre'));
  node.append(readout, rail);

  let state = {day: '', time: '', minutes: null, busy: [], off: false};
  let scale = rulerScale('');
  let drawn = '';
  let touched = false, holding = false, shown = null;

  const show = time => {
    const to = time && state.minutes ? hhmm((minutesOf(time) + state.minutes) % (24 * 60)) : '';
    start.textContent = !state.day ? 'No date' : !time ? 'No time' : briefClock(state.day, time);
    end.textContent = to ? 'to ' + briefClock(state.day, to) : '';
    end.hidden = !to;
    node.classList.toggle('is-unset', !time);
    track.setAttribute('aria-valuetext', [start.textContent, end.textContent].filter(Boolean).join(' '));
    track.setAttribute('aria-valuemax', String(scale.stops.length - 1));
    track.setAttribute('aria-valuenow', String(Math.max(0, scale.stops.indexOf(time || scale.centre))));
  };

  const draw = () => {
    const key = [scale.stops.join(), state.busy.flat().join()].join('|');
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
    const busy = state.busy.filter(([a, b]) => b > scale.first && a < scale.last).map(([a, b]) => {
      const span = el('i', 'ruler-busy');
      span.style.insetInlineStart = (Math.max(a, scale.first) - scale.first) * PX_PER_MIN + 'px';
      span.style.inlineSize = (Math.min(b, scale.last) - Math.max(a, scale.first)) * PX_PER_MIN + 'px';
      return span;
    });
    line.replaceChildren(...busy, ...marks);
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
  new ResizeObserver(place).observe(track);

  const paint = next => {
    state = {...state, ...next};
    scale = rulerScale(state.time);
    draw();
    shown = state.time || null;
    show(state.time);
    length.hidden = !state.time || !state.minutes;
    length.style.inlineSize = (state.minutes ?? 0) * PX_PER_MIN + 'px';
    node.classList.toggle('is-off', !!state.off);
    track.inert = !!state.off;
    track.setAttribute('aria-disabled', String(!!state.off));
    place();
  };
  return {node, paint};
}
