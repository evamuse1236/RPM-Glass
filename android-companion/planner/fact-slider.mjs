import {TIME_GRID, nextHalfHour} from './task-values.mjs';

export const TIME_STOPS = TIME_GRID;
export const LENGTH_STOPS = Object.freeze([5, 10, 15, 20, 25, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240]);

const minutesOf = time => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
const measures = {time: minutesOf, length: Number};

/** The stop nearest `value` ('HH:MM' for time, minutes for length); with no value, the stop a drag starts from. */
export function nearestStop(kind, value) {
  const stops = kind === 'time' ? TIME_STOPS : LENGTH_STOPS;
  const measure = measures[kind];
  const target = value == null || value === '' ? measure(kind === 'time' ? nextHalfHour() : 30) : measure(value);
  let best = 0;
  stops.forEach((stop, i) => { if (Math.abs(measure(stop) - target) < Math.abs(measure(stops[best]) - target)) best = i; });
  return best;
}

/**
 * A range input over `stops`: while it moves, `onLive(text)` and `aria-valuetext` follow the thumb; let go, it saves
 * the snapped stop with `save(value)`. `set(value)` shows a saved value ("Not set" for none) without saving.
 */
export function bindSlider(input, {kind, text, save, onLive = () => {}}) {
  const stops = kind === 'time' ? TIME_STOPS : LENGTH_STOPS;
  Object.assign(input, {min: '0', max: String(stops.length - 1), step: '1'});
  const show = words => {
    input.setAttribute('aria-valuetext', words);
    onLive(words);
  };
  const at = () => stops[Number(input.value)];
  input.addEventListener('input', () => {
    delete input.dataset.unset;
    show(text(at()));
  });
  input.addEventListener('change', () => {
    delete input.dataset.unset;
    show(text(at()));
    save(at());
  });
  return {
    set(value) {
      const unset = value == null || value === '';
      input.value = String(nearestStop(kind, value));
      if (unset) input.dataset.unset = '';
      else delete input.dataset.unset;
      show(unset ? 'Not set' : text(value));
    },
  };
}
