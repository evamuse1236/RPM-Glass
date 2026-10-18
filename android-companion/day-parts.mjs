/** The pieces of Today's "Day" layout that are plain rules: words, the free gap, Do next, water nudges, meal slots. */
import {clockText, atMinutes, minutesOf} from './body-state.mjs';
import {timeLeft, duration} from './planner/format.mjs';

export const MIN = 60000;
export const GAP_MINUTES = 30;
/** Where a meal with nothing logged sits on the day (Dara's times, 2026-10-18). */
export const MEAL_TIMES = Object.freeze({breakfast: '08:30', lunch: '13:00', dinner: '20:00'});
const SLOT_NAMES = {breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner'};

const plural = (count, one) => `${count} ${count === 1 ? one : one + 's'}`;
const period = date => (new Date(date).getHours() < 12 ? 'AM' : 'PM');
const bare = date => clockText(date).replace(/ [AP]M$/, '');

/** "7 AM", "12 PM"; 24 is midnight. */
export const hourLabel = hour => `${hour % 12 || 12} ${hour % 24 < 12 ? 'AM' : 'PM'}`;

/** "3:00 – 4:30 PM", "11:30 AM – 1:30 PM". */
export function spanText(start, end) {
  return `${period(start) === period(end) ? bare(start) : clockText(start)} – ${clockText(end)}`;
}

/** A routine card's count line. */
export function routineMeta(state, {done, total, skipped}) {
  if (state === 'missed') return 'Missed';
  if (state === 'empty') return 'No steps yet';
  if (state === 'upcoming') return plural(total, 'step');
  return `${done} of ${total}${skipped ? ` · ${skipped} skipped` : ''}`;
}

/** Free time from now until the next fixed thing, if nothing fixed is running and it lasts half an hour or more. */
export function freeGap(now, blocking, dayEnd) {
  if (blocking.some(item => item.start <= now && now < item.end)) return null;
  const end = Math.min(dayEnd, ...blocking.filter(item => item.start > now).map(item => item.start));
  return end - now >= GAP_MINUTES * MIN ? {start: now, end} : null;
}

/** Tasks with no time, back to back from the next quarter hour, as many as fit before the gap ends. */
export function fitUntimed(tasks, gap) {
  let cursor = Math.ceil(gap.start / (15 * MIN)) * 15 * MIN;
  const slots = [], rest = [];
  for (const task of tasks) {
    const length = (task.minutes ?? 30) * MIN;
    if (cursor + length <= gap.end) {
      slots.push({task, start: cursor});
      cursor += length;
    } else rest.push(task);
  }
  return {slots, rest};
}

/** The first undone timed task that has not ended: "Now · 20 min left" while it runs, else "Do next · in 50 min". */
export function doNext(tasks, now) {
  const task = tasks.filter(t => t.start != null && !t.done && t.end > now).sort((a, b) => a.start - b.start)[0];
  if (!task) return null;
  const label = task.start <= now ? `Now · ${timeLeft(task.end, now)} left` : `Do next · in ${timeLeft(task.start, now)}`;
  return {id: task.id, label};
}

/**
 * Nudges that passed with no glass. A nudge is answered by a glass before the next one is due; a glass at any
 * time restarts the interval; an unanswered nudge repeats after the interval. Busy events push a nudge to their end.
 */
export function missedNudges({glasses, day, settings, now, busy = []}) {
  const interval = settings.intervalMinutes * MIN;
  const until = Math.min(+now, +atMinutes(day, minutesOf(settings.until)));
  const times = glasses.map(Number).sort((a, b) => a - b);
  const missed = [];
  let t = +atMinutes(day, minutesOf(settings.from)), i = 0;
  while (t < until) {
    for (const e of busy) if (+e.start <= t && t < +e.end) t = +e.end;
    if (t >= until) break;
    if (i < times.length && times[i] < t + interval) {
      t = times[i++] + interval;
      continue;
    }
    if (t + interval > +now) break;
    missed.push(t);
    t += interval;
  }
  return missed;
}

/** Breakfast, lunch and dinner always have a place: the logged meal's time, or the usual time with "not logged". */
export function mealSlots(meals, day, now) {
  const slots = [];
  for (const slot of ['breakfast', 'lunch', 'snack', 'dinner']) {
    const meal = meals.filter(m => m.slot === slot).sort((a, b) => new Date(a.at) - new Date(b.at)).at(-1);
    if (!meal && !MEAL_TIMES[slot]) continue;
    const at = meal ? +new Date(meal.at) : +atMinutes(day, minutesOf(MEAL_TIMES[slot]));
    slots.push({slot, at, meal: meal ?? null, past: !meal && +now - at >= 2 * 60 * MIN,
      label: `${SLOT_NAMES[slot]} · ${meal ? meal.name : 'not logged'}`, time: meal ? clockText(at) : ''});
  }
  return slots;
}

/** A task card's words: the facts line and the name read aloud. */
export function taskWords(task, {overdue, flag, clash}) {
  const facts = `${clockText(task.start)} · ${duration(task.minutes)} · ${task.result ?? 'No block'}`;
  const state = task.done ? 'done' : overdue ? 'not done' : '';
  const label = [task.title, clockText(task.start), duration(task.minutes), `part of ${task.result ?? 'No block'}`, state,
    flag, clash ? `clash with ${clash}` : ''].filter(Boolean).join(', ');
  return {meta: (overdue ? 'Not done · ' : '') + facts, label};
}
