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
  meals: [{id, created, name /* the user's words */, slot: 'breakfast' | 'lunch' | 'snack' | 'dinner', at: ISO}],
  mealGuesses: {[mealId]: {status: 'pending' | 'ready' | 'failed', by, at, kcal?, protein?}},  // the agent's guesses, never the user's words
};
```

## Reading today's state

- Water today: `waterStatus({...bodyOf(data).water, now})` in `body-state.mjs` gives `{count, goal, reached, lastAt, nextAt, pending, paused}`. `count` counts `glasses` on today's local date.
- A meal slot today: `mealSlots(meals, day, now)` in `day-parts.mjs` gives breakfast, lunch, (snack,) dinner with the logged meal or `null` ("Not logged"). Unlogged slots sit at 8:30 AM, 1 PM and 8 PM.
- A Routine today: `routineState(routine, run, now)` gives `{state, progress: {done, total, skipped, open}}`; `state` is `upcoming`, `running`, `done`, `partly`, `missed`, `skipped` or `empty`.

## Ops

`saveRoutine`, `removeRoutine` (archives), `saveRoutineRun`, `skipRoutineDay`, `drinkWater {at}`, `snoozeWater {until}`, `setWater {fields}`, `saveMeal {meal}`, `removeMeal {id}`, `setMealGuess {id, guess}`.
