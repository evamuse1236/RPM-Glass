/**
 * The notch's Log meal link into the planner. Glass, Done and alert changes save in place on the phone
 * (notch-actions.mjs); only Log meal, Open plan and a task's sheet open the planner.
 */
import {openMealSheet} from './meals.mjs';
import {bodyApi} from './body-api.mjs';

/** Opens the meal sheet on `slot` (breakfast, lunch, snack or dinner), or on the next free slot. */
export function openMealFromNotch(app, {slot} = {}) {
  return openMealSheet(app, bodyApi(app), {slot: slot ?? null});
}
