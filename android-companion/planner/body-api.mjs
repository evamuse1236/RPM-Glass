/**
 * The store the Routine, water and meal screens use, on the planner's real data: reads come from `planner.body`
 * (body-store.mjs), and every change is one editPlan op saved through the phone, in order, with one Undo step.
 */
import {editPlan} from '../planner-state.mjs';
import {bodyOf} from '../body-store.mjs';
import {localDay} from '../body-state.mjs';
import {mealPlanSlots} from '../day-parts.mjs';
import {guessMeal} from './meal-guess.mjs';

const apis = new WeakMap();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Busy calendar events, which pause water nudges. */
export const busyEvents = calendar => (calendar ?? []).filter(event => !event.allDay && event.busy !== false)
  .map(event => ({title: event.title, start: event.start, end: event.end}));

/**
 * One save at a time, in tap order. A save the phone refuses because the store changed underneath (a glass logged
 * from the notification) reloads the store and tries once more. `keepUndo` leaves Undo on the change before it.
 */
function saver(app) {
  let queue = Promise.resolve();
  const once = async (op, keepUndo) => {
    while (app.saving) await pause(30);
    const change = keepUndo ? data => {
      const undo = data.planner?.undo ?? null;
      const id = editPlan(data, op);
      data.planner.undo = undo;
      return id;
    } : op;
    return app.commit(change, {label: null, keepSheet: true, undo: false});
  };
  return (op, {keepUndo = false} = {}) => {
    const run = async () => {
      try {
        return await once(op, keepUndo);
      } catch (error) {
        if (!/context changed/i.test(String(error)) || !window.rpmPhoneRefresh) throw error;
        await window.rpmPhoneRefresh();
        return once(op, keepUndo);
      } finally {
        app.sheetRefresh?.();
      }
    };
    queue = queue.then(run, run);
    return queue;
  };
}

export function bodyApi(app) {
  if (apis.has(app)) return apis.get(app);
  const read = () => bodyOf(app.data());
  const save = saver(app);
  const today = () => localDay(new Date());
  const withGuess = meal => meal && {...meal, estimate: read().mealGuesses[meal.id] ?? null};
  const api = {
    now: () => new Date(),
    routines: () => read().routines.filter(r => !r.archived),
    allRoutines: () => read().routines,
    routine: id => api.routines().find(r => r.id === id) ?? null,
    runs: () => read().runs,
    runFor: (id, day = today()) => read().runs.find(r => r.routineId === id && r.day === day) ?? null,
    saveRun: run => save({type: 'saveRoutineRun', run}),
    skipDay: (id, day = today()) => save({type: 'skipRoutineDay', routineId: id, day}),
    saveRoutine: routine => save({type: 'saveRoutine', routine}),
    deleteRoutine: id => save({type: 'removeRoutine', id}),
    water: () => ({...read().water, busy: busyEvents(app.state.calendar)}),
    drink: () => save({type: 'drinkWater', at: new Date().toISOString()}),
    snooze: () => save({type: 'snoozeWater', until: new Date(Date.now() + read().water.settings.snoozeMinutes * 60000).toISOString()}),
    setWater: (key, value) => save({type: 'setWater', fields: {[key]: value}}),
    setWaterFields: fields => save({type: 'setWater', fields}),
    meals: () => read().meals.map(withGuess),
    meal: id => withGuess(read().meals.find(m => m.id === id)),
    async saveMeal(meal) {
      const id = await save({type: 'saveMeal', meal});
      return api.meal(id);
    },
    deleteMeal: id => save({type: 'removeMeal', id}),
    mealPlan: () => read().mealPlan,
    mealTimes: () => mealPlanSlots(read().mealPlan),
    setMealSlot: (slot, fields) => save({type: 'setMealSlot', slot, fields}),
    removeMealSlot: slot => save({type: 'removeMealSlot', slot}),
    estimate: id => guessMeal(app, api, id, guess => save({type: 'setMealGuess', id, guess}, {keepUndo: true})),
  };
  apis.set(app, api);
  return api;
}
