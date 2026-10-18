/** Links from the phone's notch into the planner. The notch only reads the store; every change goes through here. */
import {tasks} from '../planner-state.mjs';
import {occurrences, repeats} from '../planner-recurrence.mjs';
import {toggleDone} from './task-row.mjs';
import {openMealSheet} from './meals.mjs';
import {bodyApi} from './body-api.mjs';

/**
 * The notch's Done: ticks the task (or, for a repeating task, the occurrence starting at `start`) with the planner's
 * own completion, so its "Task completed · Undo" bar is the way back. A task already done or changed is left alone.
 */
export function completeFromNotch(app, {complete, start}) {
  const task = tasks(app.data()).find(t => t.id === complete);
  const open = task && !task.done && task.state !== 'cancelled';
  if (open && !repeats(task)) return toggleDone(app, task);
  const hit = open && Number.isFinite(start) ? occurrences(task, start, start + 1).find(o => o.start === start) : null;
  if (hit) return toggleDone(app, hit, hit.occurrence);
  app.notice('Already done or changed');
  return undefined;
}

/** The notch's Log meal: opens the meal sheet on `slot` (breakfast, lunch, snack or dinner), or on the next free slot. */
export function openMealFromNotch(app, {slot} = {}) {
  return openMealSheet(app, bodyApi(app), {slot: slot ?? null});
}
