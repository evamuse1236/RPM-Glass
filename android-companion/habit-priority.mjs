/** The one habit Today's circle shows: the first habit in HABITS that is due now, by the rules the notch shares. */
import {waterStatus, localDay} from './body-state.mjs';
import {dueMeal} from './day-parts.mjs';

/** In priority order. `due` returns what the circle shows, or null when the habit is not due. */
export const HABITS = Object.freeze([
  {kind: 'water', due: (body, now) => {
    const status = waterStatus({...body.water, now});
    return status.pending ? {count: status.count, goal: status.goal} : null;
  }},
  {kind: 'meal', due: (body, now) => {
    const slot = dueMeal(body.meals ?? [], localDay(now), +now, body.mealPlan ?? null);
    return slot ? {slot: slot.slot, name: slot.name, at: slot.at} : null;
  }},
]);

/** `body`: {water: {glasses, settings, busy, snoozedUntil}, meals, mealPlan}. Returns {kind, ...} or null. */
export function topHabit(body, now = new Date()) {
  for (const habit of HABITS) {
    const due = habit.due(body, new Date(now));
    if (due) return {kind: habit.kind, ...due};
  }
  return null;
}
