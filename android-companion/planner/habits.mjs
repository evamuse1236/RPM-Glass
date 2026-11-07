/**
 * Habits: routines, water and the meal times in one list that shows how today is going, each opening its editor.
 * Every editor is one move from where the user is: this list, a long press on the Today row, or the Edit button on the
 * row's own sheet.
 */
import {WATER_DEFAULTS, everyText, rangeText, daysText, clockText, atMinutes, minutesOf, localDay, routineOn,
  routineRowParts, joinParts, waterStatus} from '../body-state.mjs';
import {el, icon, button} from './dom.mjs';
import {openSheet} from './sheet.mjs';
import {openMenu} from './menu.mjs';
import {notice} from './snackbar.mjs';
import {userMessage} from '../user-message.mjs';
import {attachSwipe} from '../task-swipe.mjs';
import {switchButton} from './fact-rows.mjs';
import {openRoutineEditor} from './routine-editor.mjs';
import {openWaterEditor, openMealEditor} from './habit-editors.mjs';
import {bodyApi} from './body-api.mjs';

const MEAL_PREFIX = 'meal:';
/** One Material Symbols family for the meals, so each meal row carries its own glyph. */
const MEAL_ICONS = {breakfast: 'breakfast_dining', lunch: 'lunch_dining', snack: 'bakery_dining', dinner: 'dinner_dining'};
const timeWords = hhmm => clockText(atMinutes('2000-01-01', minutesOf(hhmm)));

/**
 * One habit: its icon, name and today's state open the editor. `extra` sits under the state (water's meter, a meal's
 * time); `trailing` (a meal's Show switch) replaces the chevron on the shared right edge.
 */
function habitRow(symbol, name, summary, open, {extra = null, trailing = null} = {}) {
  const row = el('div', 'habit-row');
  const copy = el('span', 'habit-copy');
  copy.append(button(name, open, 'habit-open'));
  if (summary) copy.append(summary instanceof Node ? summary : el('span', 'habit-summary tnum', summary));
  if (extra) copy.append(extra);
  row.append(icon(symbol, {cls: 'habit-icon'}), copy, trailing ?? icon('chevron_right', {cls: 'habit-chevron'}));
  return row;
}

/** Today's glasses against the goal: one segment per glass, drunk ones filled. */
function waterMeter(count, goal) {
  const meter = el('span', 'water-track');
  meter.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < goal; i++) meter.append(el('i', i < count ? 'on' : ''));
  return meter;
}

/** What today's meal says: the food with a check once logged, otherwise nothing. */
function mealLogged(meal) {
  const line = el('span', 'habit-summary habit-logged');
  line.append(icon('check', {cls: 'habit-logged-mark'}), el('span', '', meal.name));
  return line;
}

/** The meal's time as a chip that opens the phone's time picker in place; it saves with Undo. */
function mealTime(app, body, meal) {
  const chip = el('label', 'habit-time');
  const input = el('input');
  input.type = 'time';
  input.value = meal.at;
  input.setAttribute('aria-label', `${meal.name} time, ${timeWords(meal.at)}`);
  input.addEventListener('click', event => { try { event.currentTarget.showPicker?.(); } catch {} });
  input.addEventListener('change', async () => {
    if (!input.value || input.value === meal.at) return;
    try {
      await body.setMealSlot(meal.slot, {at: input.value});
    } catch (error) {
      notice(app, userMessage(error, "Couldn't save that. Try again."));
      return;
    }
    app.render();
    notice(app, `${meal.name} at ${timeWords(input.value)}`, {undo: true});
  });
  chip.append(icon('schedule'), el('span', 'tnum', timeWords(meal.at)), input);
  return chip;
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
  const addButton = button('Add', () => {
    if (body.mealTimes().some(m => m.slot === 'snack')) return addRoutine();
    openMenu(addButton, [{label: 'Routine', icon: 'checklist', onClick: addRoutine},
      {label: 'Snack time', icon: MEAL_ICONS.snack, onClick: addSnack}], 'Add a habit');
  }, 'habit-open');
  add.append(icon('add', {cls: 'habit-icon'}), addButton);

  const paint = () => {
    if (!content.isConnected) return;
    const now = body.now(), day = localDay(now);
    const rows = [];
    for (const routine of [...body.routines()].sort((a, b) => (a.start < b.start ? -1 : 1))) {
      const today = routineOn(routine, day) ? routineRowParts(routine, body.runFor(routine.id, day), now) : undefined;
      const summary = today === undefined ? `${rangeText(routine.start, routine.end)} · ${daysText(routine.days)}`
        : today ? joinParts(today.parts) : 'Skipped today';
      rows.push(habitRow('checklist', routine.name, summary, () => openRoutineEditor(app, body, routine.id, {back})));
    }
    const water = body.water();
    const settings = {...WATER_DEFAULTS, ...water.settings};
    const status = waterStatus({...water, settings, now});
    const every = settings.reminders === false ? 'reminders off' : `every ${everyText(settings.intervalMinutes)}`;
    rows.push(habitRow('water_drop', 'Water', `${status.count} of ${status.goal} glasses · ${every}`,
      () => openWaterEditor(app, body, {back}), {extra: waterMeter(status.count, status.goal)}));
    list.replaceChildren(...rows);

    const logged = body.meals().filter(m => localDay(m.at) === day && m.state !== 'skipped' && String(m.name ?? '').trim())
      .sort((a, b) => new Date(a.at) - new Date(b.at));
    const plan = body.mealTimes();
    meals.replaceChildren(...plan.map(meal => {
      const show = switchButton(`Show ${meal.name}`, async on => {
        show.set(on);
        try {
          await body.setMealSlot(meal.slot, {on});
        } catch (error) {
          show.set(!on);
          notice(app, userMessage(error, "Couldn't save that. Try again."));
          return;
        }
        app.render();
        notice(app, on ? `${meal.name} shows on Today` : `${meal.name} hidden from Today`, {undo: true});
      }, {cls: 'habit-switch'});
      show.set(meal.on);
      const eaten = logged.filter(m => m.slot === meal.slot).at(-1);
      const line = el('span', 'habit-meal-line');
      line.append(mealTime(app, body, meal), ...(eaten ? [mealLogged(eaten)] : []));
      return habitRow(MEAL_ICONS[meal.slot] ?? 'restaurant', meal.name, null,
        () => openMealEditor(app, body, meal.slot, {back}), {extra: line, trailing: show});
    }));
    addButton.textContent = plan.some(m => m.slot === 'snack') ? 'Add routine' : 'Add';
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

