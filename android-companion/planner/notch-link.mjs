/** Links from the phone's notch into the planner. The notch only reads the store; every change goes through here. */
import {tasks} from '../planner-state.mjs';
import {occurrences, repeats} from '../planner-recurrence.mjs';
import {toggleDone} from './task-row.mjs';

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

/**
 * The notch's Log meal. Opens the meal sheet for `slot` when this build has the Body screens (they set
 * `app.openMealLog`); otherwise Today stays open with a note.
 */
export function openMealFromNotch(app, {slot} = {}) {
  if (typeof app.openMealLog === 'function') return app.openMealLog(slot ?? null);
  app.notice('The meal log is not in this build yet');
  return undefined;
}
