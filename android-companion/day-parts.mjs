/** The plain rules under Today's spine: Calendar-style words, routine counts and where each meal sits. */
import {clockText, atMinutes, minutesOf} from './body-state.mjs';

export const MIN = 60000;
/** Where a meal with nothing logged sits on the day (Dara's times, 2026-10-18). */
export const MEAL_TIMES = Object.freeze({breakfast: '08:30', lunch: '13:00', dinner: '20:00'});
export const SLOT_NAMES = Object.freeze({breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner'});

const plural = (count, one) => `${count} ${count === 1 ? one : one + 's'}`;
const period = date => (new Date(date).getHours() < 12 ? 'AM' : 'PM');
const bare = date => clockText(date).replace(/ [AP]M$/, '');

/** "3:00 – 4:30 PM", "11:30 AM – 1:30 PM". */
export function spanText(start, end) {
  return `${period(start) === period(end) ? bare(start) : clockText(start)} – ${clockText(end)}`;
}

/** "2 PM", "12:45 PM": the gutter's start time, minutes only when they say something. */
export const gutterTime = at => clockText(at).replace(':00 ', ' ');

/** A routine card's count line. */
export function routineMeta(state, {done, total, skipped}) {
  if (state === 'missed') return 'Missed';
  if (state === 'empty') return 'No steps yet';
  if (state === 'upcoming') return plural(total, 'step');
  return `${done} of ${total}${skipped ? ` · ${skipped} skipped` : ''}`;
}

/** Breakfast, lunch and dinner have a place: the logged meal's time, or on today the usual time with "Not logged". */
export function mealSlots(meals, day, now, {placeholders = true} = {}) {
  const slots = [];
  for (const slot of ['breakfast', 'lunch', 'snack', 'dinner']) {
    const meal = meals.filter(m => m.slot === slot).sort((a, b) => new Date(a.at) - new Date(b.at)).at(-1);
    if (!meal && (!placeholders || !MEAL_TIMES[slot])) continue;
    const at = meal ? +new Date(meal.at) : +atMinutes(day, minutesOf(MEAL_TIMES[slot]));
    slots.push({slot, at, meal: meal ?? null, past: !meal && +now - at >= 2 * 60 * MIN,
      label: `${SLOT_NAMES[slot]} · ${meal ? meal.name : 'Not logged'}`});
  }
  return slots;
}
