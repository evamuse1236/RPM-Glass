/**
 * The notch's and the widget's links into the planner. Glass, Done and alert changes save in place on the phone
 * (notch-actions.mjs); only the meal row, Open, a task's sheet and water's sheet open the planner.
 */
import {openMealSheet} from './meals.mjs';
import {openWaterSheet} from './water.mjs';
import {bodyApi} from './body-api.mjs';

/** Opens the meal sheet on `slot` (breakfast, lunch, snack or dinner), or on the next free slot. */
export function openMealFromNotch(app, {slot} = {}) {
  return openMealSheet(app, bodyApi(app), {slot: slot ?? null});
}

export function openWaterFromLink(app) {
  return openWaterSheet(app, bodyApi(app));
}
