# Routines, water and meals in the store

They live in the planner store (`files/companion.json`) under `planner.body`. `android-companion/body-store.mjs` owns the shape; `bodyOf(data)` reads it with defaults. A store without `planner.body` reads as empty, and the first change creates it. Every change is an `editPlan` op, so it is validated, saved through the phone and undoable (`{type: 'undo'}`).

```js
planner.body = {
  schema: 1,
  routines: [{id, created, updated, name, start: 'HH:MM', end: 'HH:MM', days: [0..6] /* Date#getDay */,
    steps: [{id, title}], archived?: true}],
  runs: [{routineId, day: 'YYYY-MM-DD', marks: {[stepId]: {state: 'done' | 'skipped', at: ISO}}, skippedDay?: true}],
  water: {
    settings: {goal: 8, intervalMinutes: 90, from: '08:00', until: '22:00', glassMl: 250, snoozeMinutes: 15, reminders: true},
    glasses: [ISO, ...],        // one entry per glass drunk
    snoozedUntil: ISO | null,
  },
  meals: [{id, created, name /* the user's words */, slot: 'breakfast' | 'lunch' | 'snack' | 'dinner', at: ISO, state?: 'logged' | 'skipped'}],
  mealGuesses: {[mealId]: {status: 'pending' | 'ready' | 'failed', by, at, kcal?, protein?}},  // the agent's guesses, never the user's words
  mealPlan?: {slots: [{slot: 'breakfast' | 'lunch' | 'snack' | 'dinner', at: 'HH:MM', on: boolean, name?}]},  // absent until the first change
};
```

## Reading today's state

A meal without `state` is logged. A skipped meal records today's choice without changing the recurring meal plan; it is excluded from usual foods and nutrition guesses. Capture creates current water and meal records through the same validated `editPlan` operations as the planner. A mixed body/task capture shares one receipt and Undo.

- Water today: `waterStatus({...bodyOf(data).water, now})` in `body-state.mjs` gives `{count, goal, reached, lastAt, nextAt, pending, paused}`. `count` counts `glasses` on today's local date.
- A meal slot today: `mealSlots(meals, day, now)` in `day-parts.mjs` gives breakfast, lunch, (snack,) dinner with the logged meal or `null` ("Not logged"). Unlogged slots sit at their `mealPlan` time; with no `mealPlan` they are breakfast 8:30 AM, lunch 1 PM and dinner 8 PM (`MEAL_TIMES`). A slot with `on: false` has no placeholder and no `Log a meal` chip, but a meal logged for it still shows. `mealPlanSlots(mealPlan)` reads the plan with these defaults, in clock order; only the snack has its own `name`.
- A Routine today: `routineState(routine, run, now)` gives `{state, progress: {done, total, skipped, open}}`; `state` is `upcoming`, `running`, `done`, `partly`, `missed`, `skipped` or `empty`.

## Ops

`saveRoutine`, `removeRoutine` (archives), `saveRoutineRun`, `skipRoutineDay`, `drinkWater {at}`, `snoozeWater {until}`, `setWater {fields}`, `saveMeal {meal}`, `removeMeal {id}`, `setMealGuess {id, guess}`, `setMealSlot {slot, fields: {at?, on?, name? /* snack only */}}` (writes the default plan first; a missing snack is added at 4:00 PM), `removeMealSlot {slot: 'snack'}` (breakfast, lunch and dinner are turned off instead).
