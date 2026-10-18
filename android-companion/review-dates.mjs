import {shiftDay, localDay} from './planner-state.mjs';

export const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function checkDay(day) {
  if (typeof day !== 'string' || !DAY.test(day) || !Number.isFinite(Date.parse(day + 'T12:00:00'))) {
    throw new Error('Choose a valid day.');
  }
  return day;
}

/** Monday on or before `day` (local 'YYYY-MM-DD'). */
export function weekStart(day) {
  const date = new Date(checkDay(day) + 'T12:00:00');
  const sinceMonday = (date.getDay() + 6) % 7;
  return shiftDay(day, -sinceMonday);
}

/** The week a review held on `day` plans: Friday to Sunday reviews plan the coming week (RPM's Friday or Sunday session). */
export function reviewWeek(day) {
  return weekStart(shiftDay(checkDay(day), 3));
}

const pad = n => String(n).padStart(2, '0');
/** When a task is dated, as local 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM'; null when it has no date. */
export function taskDate(task) {
  if (task.planned && Number.isFinite(Date.parse(task.planned))) {
    const d = new Date(task.planned);
    return `${localDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return DAY.test(task.plannedDate ?? '') ? task.plannedDate : null;
}
export const dateKey = value => (value.length > 10 ? value : value + 'T23:59');
/** A deadline value as a Date: an untimed day ends at 11:59 PM, as in dueInfo. */
export const dueAt = value => new Date(dateKey(value));
