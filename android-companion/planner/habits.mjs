/**
 * Habits: routines, water and the meal times in one list that shows how today is going, each opening its editor.
 * Every editor is one move from where the user is: this list, a long press on the Today row, or the Edit button on the
 * row's own sheet.
 */
import {WATER_DEFAULTS, everyText, rangeText, daysText, clockText, atMinutes, minutesOf, localDay, routineOn,
  routineRowParts, routineState, joinParts, waterStatus} from '../body-state.mjs';
import {duration} from './format.mjs';
import {el, icon, button} from './dom.mjs';
import {openSheet} from './sheet.mjs';
import {openMenu} from './menu.mjs';
import {notice} from './snackbar.mjs';
import {userMessage} from '../user-message.mjs';
import {attachSwipe} from '../task-swipe.mjs';
import {openRoutineEditor} from './routine-editor.mjs';
import {openWaterEditor, openMealEditor} from './habit-editors.mjs';
import {bodyApi} from './body-api.mjs';

const MEAL_PREFIX = 'meal:';
/** The Snack time menu item's glyph; in the list every habit leads with today's done mark instead. */
const MEAL_ICON = 'restaurant';
const timeWords = hhmm => clockText(atMinutes('2000-01-01', minutesOf(hhmm)));

/** Today's mark, as on the Today timeline: a ring in the habit's tone, filled with a check once it is done. */
function doneMark(tone, done) {
  const mark = el('span', `habit-mark check-ring tone-${tone}${done ? ' done' : ''}`);
  mark.append(icon('check'));
  if (done) {
    mark.setAttribute('role', 'img');
    mark.setAttribute('aria-label', 'Done today');
  } else mark.setAttribute('aria-hidden', 'true');
  return mark;
}

/**
 * One habit: today's mark, its name and one quiet line of today's state open the editor, with a chevron on the
 * shared right edge. `extra` runs under the line to that edge (water's meter); `off` dims a meal hidden from Today.
 */
function habitRow(mark, name, summary, open, {extra = null, off = false} = {}) {
  const row = el('div', off ? 'habit-row habit-hidden' : 'habit-row');
  const copy = el('span', 'habit-copy');
  copy.append(button(name, open, 'habit-open'));
  if (summary) copy.append(summary instanceof Node ? summary : el('span', 'habit-summary tnum', summary));
  row.append(mark, copy, icon('chevron_right', {cls: 'habit-chevron'}));
  if (extra) row.append(extra);
  return row;
}

/** Today's glasses against the goal: one segment per glass, drunk ones filled. */
function waterMeter(count, goal) {
  const meter = el('span', 'water-track');
  meter.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < goal; i++) meter.append(el('i', i < count ? 'on' : ''));
  return meter;
}

/** A meal's line: when it was eaten and what, else its planned time, or that it is hidden from Today. */
function mealLine(meal, eaten) {
  if (eaten) {
    const line = el('span', 'habit-summary habit-meal-line tnum', `${clockText(new Date(eaten.at))} · `);
    line.append(el('span', 'habit-logged', eaten.name));
    return line;
  }
  return el('span', 'habit-summary habit-meal-line tnum', timeWords(meal.at) + (meal.on ? '' : ' · Not on Today'));
}

/** The next habit still to come today gets one quiet countdown, as the timeline gives its next item. */
function addSoon(summary, at, now) {
  const minutes = Math.max(1, Math.ceil((at - now) / 60000));
  summary.append(' · ', el('span', 'habit-soon', `in ${duration(minutes)}`));
}

export function openHabits(app, body = bodyApi(app), {motion = 'forward'} = {}) {
  const {body: content} = openSheet(app, 'Habits', {variant: 'choice habits', motion});
  const list = el('div', 'habit-list');
  const meals = el('div', 'habit-list habit-meals');
  const add = el('div', 'habit-row habit-add');
  content.append(list, meals, add);
  const back = () => openHabits(app, body, {motion: 'back'});
  const addSnack = async () => {
    try {
      await body.setMealSlot('snack', {on: true});
    } catch (error) {
      notice(app, userMessage(error, "Couldn't save that. Try again."));
      return;
    }
    app.render();
    openMealEditor(app, body, 'snack', {back});
    notice(app, 'Snack time added', {undo: true});
  };
  const addRoutine = () => openRoutineEditor(app, body, null, {back});
  const addButton = button('Add habit', () => {
    if (body.mealTimes().some(m => m.slot === 'snack')) return addRoutine();
    openMenu(addButton, [{label: 'Routine', icon: 'checklist', onClick: addRoutine},
      {label: 'Snack time', icon: MEAL_ICON, onClick: addSnack}], 'Add a habit');
  }, 'habit-open');
  add.append(icon('add', {cls: 'habit-icon'}), addButton);

  const paint = () => {
    if (!content.isConnected) return;
    const now = body.now(), day = localDay(now);
    const rows = [];
    const upcoming = [];
    for (const routine of [...body.routines()].sort((a, b) => (a.start < b.start ? -1 : 1))) {
      const on = routineOn(routine, day);
      const today = on ? routineRowParts(routine, body.runFor(routine.id, day), now) : undefined;
      const words = today === undefined ? `${rangeText(routine.start, routine.end)} · ${daysText(routine.days)}`
        : today ? joinParts(today.state === 'partly' ? today.parts.slice(1) : today.parts) : 'Skipped today';
      const summary = el('span', 'habit-summary tnum', words);
      if (today?.state === 'upcoming') upcoming.push({summary, at: routineState(routine, null, now).start});
      rows.push(habitRow(doneMark('routine', today?.state === 'done'), routine.name, summary,
        () => openRoutineEditor(app, body, routine.id, {back})));
    }
    const water = body.water();
    const settings = {...WATER_DEFAULTS, ...water.settings};
    const status = waterStatus({...water, settings, now});
    const every = settings.reminders === false ? 'reminders off' : `every ${everyText(settings.intervalMinutes)}`;
    rows.push(habitRow(doneMark('water', status.reached), 'Water', `${status.count} of ${status.goal} glasses · ${every}`,
      () => openWaterEditor(app, body, {back}), {extra: waterMeter(status.count, status.goal)}));
    list.replaceChildren(...rows);

    const logged = body.meals().filter(m => localDay(m.at) === day && m.state !== 'skipped' && String(m.name ?? '').trim())
      .sort((a, b) => new Date(a.at) - new Date(b.at));
    const plan = body.mealTimes();
    meals.replaceChildren(...plan.map(meal => {
      const eaten = logged.filter(m => m.slot === meal.slot).at(-1);
      const summary = mealLine(meal, eaten);
      const at = atMinutes(day, minutesOf(meal.at));
      if (!eaten && meal.on && at > now) upcoming.push({summary, at});
      return habitRow(doneMark(meal.on ? 'meal' : 'off', !!eaten), meal.name, summary,
        () => openMealEditor(app, body, meal.slot, {back}), {off: !meal.on});
    }));
    const next = upcoming.sort((a, b) => a.at - b.at)[0];
    if (next) addSoon(next.summary, next.at, now);
    addButton.textContent = plan.some(m => m.slot === 'snack') ? 'Add routine' : 'Add habit';
  };
  paint();
  app.sheetRefresh = paint;
}

/** Open one habit's editor: 'water', 'meal:<slot>', or a routine's id. Unknown ids open the list. */
export function openHabit(app, id, {body = bodyApi(app), back = null} = {}) {
  if (id === 'water') return openWaterEditor(app, body, {back});
  if (String(id).startsWith(MEAL_PREFIX)) {
    const slot = String(id).slice(MEAL_PREFIX.length);
    if (body.mealTimes().some(s => s.slot === slot)) return openMealEditor(app, body, slot, {back});
  } else if (body.routine(id)) return openRoutineEditor(app, body, id, {back});
  return openHabits(app, body);
}

/** Holding a Today row (water, a meal, a routine) opens its editor. */
export function holdToEdit(app, node, id, sides = {}) {
  attachSwipe(node, {...sides, hold: () => openHabit(app, id), haptic: () => app.api.native('haptic').catch(() => {})});
}

