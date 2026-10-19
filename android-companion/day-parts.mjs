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

/** Where "Add a snack time" puts a new snack. */
export const SNACK_TIME = '16:00';

/**
 * The meal plan (`planner.body.mealPlan`) with defaults: the stored slots, or breakfast, lunch and dinner at
 * MEAL_TIMES. Returns [{slot, at, on, name}] in clock order; `on` is false only for a slot turned off.
 */
export function mealPlanSlots(mealPlan) {
  const stored = Array.isArray(mealPlan?.slots) ? mealPlan.slots : Object.entries(MEAL_TIMES).map(([slot, at]) => ({slot, at}));
  return stored.map(s => ({slot: s.slot, at: s.at, on: s.on !== false, name: String(s.name ?? '').trim() || SLOT_NAMES[s.slot]}))
    .sort((a, b) => minutesOf(a.at) - minutesOf(b.at));
}

/**
 * Each meal in the plan has a place: the logged meal's time, or on today its planned time with "Not logged". A slot
 * turned off leaves no placeholder; a meal already logged for it still shows.
 */
export function mealSlots(meals, day, now, {placeholders = true, plan = null} = {}) {
  const planned = mealPlanSlots(plan);
  const slots = [];
  for (const slot of ['breakfast', 'lunch', 'snack', 'dinner']) {
    const meal = meals.filter(m => m.slot === slot).sort((a, b) => new Date(a.at) - new Date(b.at)).at(-1);
    const place = planned.find(p => p.slot === slot);
    if (!meal && (!placeholders || !place?.on)) continue;
    const at = meal ? +new Date(meal.at) : +atMinutes(day, minutesOf(place.at));
    slots.push({slot, at, meal: meal ?? null, past: !meal && +now - at >= 2 * 60 * MIN,
      label: `${place?.name ?? SLOT_NAMES[slot]} · ${meal ? meal.name : 'Not logged'}`});
  }
  return slots;
}
