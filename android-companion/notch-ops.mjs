/**
 * What the phone's notch changes, as planner ops. The planner's notch links and the notch's own saves
 * (notch-actions.mjs) both build their ops here and apply them with editPlan, so a change, its Undo and the alert
 * schedule that follows it are the planner's own.
 */
import {tasks, editPlan} from './planner-state.mjs';
import {occurrences, repeats, nextOccurrence} from './planner-recurrence.mjs';
import {bodyOf} from './body-store.mjs';
import {waterStatus} from './body-state.mjs';

const DAY = 86_400_000;
export const ALERT_TYPES = ['off', 'reminder', 'alarm'];

/** Ticks `task` (a repeating task's occurrence `when`, else its next one), or reopens it when it is done. */
export function completionOp(task, when) {
  if (task.done) return {type: 'reopenTask', id: task.id, occurrence: when ?? task.occurrence};
  const occurrence = when ?? task.occurrence ?? (repeats(task) ? nextOccurrence(task) : task.planned);
  return {type: 'saveTask', id: task.id, fields: {done: true}, occurrence};
}

/**
 * The task the notch's Done means: the task itself, or for a repeating task the occurrence starting at `start`.
 * With `near` (an alert that fired, maybe late after a snooze) it also takes the latest open occurrence that started
 * in the day before `start`. Null when the task is already done or changed.
 */
export function notchCompletion(data, {id, start, near = false}) {
  const task = tasks(data).find(t => t.id === id);
  if (!task || task.done || task.state === 'cancelled') return null;
  if (!repeats(task)) return {task, occurrence: undefined};
  if (!Number.isFinite(start)) return null;
  const hit = occurrences(task, start, start + 1).find(o => o.start === start);
  if (hit) return {task: hit, occurrence: hit.occurrence};
  if (!near) return null;
  const earlier = occurrences(task, start - DAY, start + 1).filter(o => o.start <= start).at(-1);
  return earlier ? {task: earlier, occurrence: earlier.occurrence} : null;
}

export const drinkOp = (now = new Date()) => ({type: 'drinkWater', at: now.toISOString()});

export function alertOp(id, type) {
  if (!ALERT_TYPES.includes(type)) throw new Error('Choose Reminder, Ringing alarm or no alert.');
  return {type: 'saveTask', id, fields: {alert: type}};
}

/** The planner's last change, which the notch's Undo may take back only while it is still the last one. */
const lastChange = data => data.planner?.events?.at(-1)?.id ?? null;

const titleOf = (data, id) => tasks(data).find(t => t.id === id)?.title ?? 'Task';

function water(data, now) {
  const {settings, glasses} = bodyOf(data).water;
  const {count, goal} = waterStatus({glasses, settings, now});
  return {count, goal};
}

/**
 * Applies one notch request to `data` (changed in place, as editPlan does) and says what happened.
 * Requests: {action: 'drink'}, {action: 'done', id, start, near}, {action: 'alert', id, type}, {action: 'undo', token}.
 * Every change returns `token`, which its Undo hands back.
 */
export function runNotchRequest(data, request, now = new Date()) {
  const {action} = request ?? {};
  if (action === 'undo') {
    if (!request.token || lastChange(data) !== request.token) throw new Error('This was changed again in the plan. Open the plan to undo it there.');
    editPlan(data, {type: 'undo'}, now);
    return {kind: 'undo'};
  }
  if (action === 'drink') {
    editPlan(data, drinkOp(now), now);
    return {kind: 'water', ...water(data, now), token: lastChange(data)};
  }
  if (action === 'done') {
    const target = notchCompletion(data, request);
    if (!target) throw new Error('Already done or changed.');
    editPlan(data, completionOp(target.task, target.occurrence), now);
    return {kind: 'done', id: request.id, title: titleOf(data, request.id), repeats: repeats(target.task), token: lastChange(data)};
  }
  if (action === 'alert') {
    if (!tasks(data).some(t => t.id === request.id && !t.done)) throw new Error('Already done or changed.');
    editPlan(data, alertOp(request.id, request.type), now);
    return {kind: 'alert', id: request.id, title: titleOf(data, request.id), type: request.type, token: lastChange(data)};
  }
  throw new Error('The notch asked for something this version cannot do.');
}
