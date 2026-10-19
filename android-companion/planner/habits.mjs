/**
 * Habits: routines, water and the meal times in one list, each opening its editor. Every editor is one move from
 * where the user is: this list, a long press on the Today row, or the Edit button on the row's own sheet.
 */
import {WATER_DEFAULTS, everyText, rangeText, daysText, clockText, atMinutes, minutesOf} from '../body-state.mjs';
import {el, icon, button} from './dom.mjs';
import {openSheet} from './sheet.mjs';
import {notice} from './snackbar.mjs';
import {userMessage} from '../user-message.mjs';
import {attachSwipe} from '../task-swipe.mjs';
import {switchButton} from './fact-rows.mjs';
import {openRoutineEditor} from './routine-editor.mjs';
import {openWaterEditor, openMealEditor} from './habit-editors.mjs';
import {bodyApi} from './body-api.mjs';

const MEAL_PREFIX = 'meal:';

/** One habit: its icon, name and summary open the editor; a meal also has its Show switch. */
function habitRow(symbol, name, summary, open, trailing = null) {
  const row = el('div', 'habit-row');
  const copy = el('span', 'habit-copy');
  const main = button(name, open, 'habit-open');
  copy.append(main, el('span', 'habit-summary tnum', summary));
  row.append(icon(symbol, {cls: 'habit-icon'}), copy);
  if (trailing) row.append(trailing);
  row.append(icon('chevron_right', {cls: 'habit-chevron'}));
  return row;
}

export function openHabits(app, body = bodyApi(app), {motion = 'forward'} = {}) {
  const {body: content, actions, sheet} = openSheet(app, 'Habits', {variant: 'choice habits', motion});
  sheet.classList.add('expanded');
  const list = el('div', 'habit-list');
  content.append(list);
  const back = () => openHabits(app, body, {motion: 'back'});
  const addSnack = button('Add a snack time', async () => {
    try {
      await body.setMealSlot('snack', {on: true});
    } catch (error) {
      notice(app, userMessage(error, "Couldn't save that. Try again."));
      return;
    }
    app.render();
    openMealEditor(app, body, 'snack', {back});
    notice(app, 'Snack time added', {undo: true});
  }, 'text-btn');
  actions.append(button('New routine', () => openRoutineEditor(app, body, null, {back}), 'text-btn'), addSnack);

  const paint = () => {
    if (!content.isConnected) return;
    const rows = [];
    for (const routine of [...body.routines()].sort((a, b) => (a.start < b.start ? -1 : 1))) {
      rows.push(habitRow('checklist', routine.name, `${rangeText(routine.start, routine.end)} · ${daysText(routine.days)}`,
        () => openRoutineEditor(app, body, routine.id, {back})));
    }
    const water = {...WATER_DEFAULTS, ...body.water().settings};
    rows.push(habitRow('water_drop', 'Water', water.reminders === false ? `${water.goal} glasses · reminders off`
      : `${water.goal} glasses · every ${everyText(water.intervalMinutes)}`, () => openWaterEditor(app, body, {back})));
    const meals = body.mealTimes();
    for (const meal of meals) {
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
      rows.push(habitRow('restaurant', meal.name, clockText(atMinutes('2000-01-01', minutesOf(meal.at))),
        () => openMealEditor(app, body, meal.slot, {back}), show));
    }
    list.replaceChildren(...rows);
    addSnack.hidden = meals.some(m => m.slot === 'snack');
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
export function holdToEdit(app, node, id) {
  attachSwipe(node, {hold: () => openHabit(app, id), haptic: () => app.api.native('haptic').catch(() => {})});
}

