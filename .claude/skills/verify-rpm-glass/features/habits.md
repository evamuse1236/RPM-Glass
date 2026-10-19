# Habits

A habit is a routine, water, or a meal time. The `Habits` list holds them all, and each opens an editor built from the task sheet's rows: an icon, then chips, a stepper, a switch or a time. Every change saves at once with a snackbar and `Undo`. Data shape: `docs/body-data.md`.

## Sub-features

- `habits-list` lists routines, `Water` and the meal times, with `New routine` and `Add a snack time`.
- `habits-water` edits glasses a day, glass size, reminders, the reminder interval and the reminder hours.
- `habits-meal` retimes a meal, shows or hides it on Today, and names or removes the snack time.
- `habits-routine` edits a routine (name, window, days, steps).
- `habits-hold` opens an editor by a long press on Today's water, meal or routine row.
- `habits-edit-buttons` opens an editor from the water, routine and Log a meal sheets.
- `habits-notch-edit` is the notch's `Edit` chip. It is not built yet (it needs native code); report it UNVERIFIED.

## How to get to it (user POV)

- Today, `More options`, `Habits`, then tap a row.
- Long press the water, a meal or a routine row on Today.
- Tap the water row, a routine card or a meal's `Log it`, then the header button `Edit water`, `Edit <routine name>` or `Edit meals`.

## Driving it with rpmctl

Preconditions:

- After `rpmctl launch`, run `export RPMCTL_OWNER=<owner from launch>` in this agent's shell (PowerShell: `$env:RPMCTL_OWNER = '<owner from launch>'`). Keep it set through cleanup.
- Baseline state, `rpmctl open planner`, and the `Today` nav button tapped.

- **Open the list.** Run `rpmctl tap --role button --name "More options"`, then `rpmctl tap --role menuitem --name "Habits"`. A dialog `Habits` lists buttons `Morning routine`, `Water`, `Breakfast`, `Lunch`, `Dinner`; each meal also has a switch `Show <meal>` (on). The footer has `New routine` and `Add a snack time`. Run `rpmctl shot habits`.
- **Water.** Tap `Water`. A dialog `Edit water` has a button `Back to Habits`, a group `Glasses a day` with buttons `Fewer glasses` and `More glasses` around the number, a group `Glass size` with chips `200 ml` to `500 ml`, a switch `Reminders`, a group `Every` with `Shorter interval` and `Longer interval`, and time buttons `From, 8:00 AM` and `Until, 10:00 PM`. Run `rpmctl tap --role button --name "More glasses"` three times. The number reads `11`; half a second after the last tap a snackbar reads `Glasses a day: 11` and `planner.body.water.settings.goal` is 11. Today's row then reads `Water · <n> of 11`.
- **Reminders off.** Tap the switch `Reminders`. `Every`, `From` and `Until` dim to 38% and cannot be tapped; `water.settings.reminders` is false and the snackbar reads `Water reminders off`. Tap it again to turn them back on.
- **Glass size and interval.** Tap `300 ml`: the snackbar reads `Glass size: 300 ml` and `glassMl` is 300. Tap `Longer interval`: `90 min` becomes `105 min` and saves after half a second. Ranges: glasses 1 to 20, interval 15 to 240 minutes; the buttons disable at the ends.
- **A meal.** Tap `Back to Habits`, then `Lunch`. A dialog `Edit lunch` has a time button `Time, 1:00 PM` and a switch `Show on Today`. Tap `Time` and set 12:15 in the phone's picker (`rpmctl tap --native "OK"`). The snackbar reads `Lunch at 12:15 PM`; `planner.body.mealPlan.slots` has lunch at `12:15`, and the Lunch row on Today sits at 12:15 PM.
- **Hide a meal.** Tap `Show on Today`. The snackbar reads `Lunch hidden from Today`; the lunch slot has `on: false`; the Lunch row leaves Today (a lunch already logged still shows) and `Log a meal` no longer offers a `Lunch` chip. Lunch stays in `Habits` with its switch off.
- **Snack time.** In `Habits`, tap `Add a snack time`. A dialog `Edit snack` opens with `Time, 4:00 PM`, `Show on Today`, a textbox `Name` and a button `Remove snack`; the snackbar reads `Snack time added`. `mealPlan.slots` has `{slot: "snack", at: "16:00", on: true}` and Today shows `Snack · Not logged` at 4 PM. Typing a name and leaving the field saves it as the snack's name. `Remove snack` takes it away again, with Undo.
- **Routine.** In `Habits`, tap `Morning routine`. The dialog `Edit routine` has `Back to Habits`, a textbox `Name`, time buttons `Starts, 7:00 AM` and `Ends, 7:30 AM`, a group `Days` of chips `Mon` to `Sun`, the steps and `Save routine`. `New routine` opens the same editor empty. Saving returns to `Habits`.
- **Long press.** Close the sheet. Run `rpmctl tap --long --role button --name "Open water"`. The dialog `Edit water` opens without the water sheet first. A long press on a meal row opens `Edit <meal>`, on a routine card `Edit routine`.
- **Edit buttons.** Tap the water row: the `Water` sheet header has `Edit water` (icon `tune`) and no `More options`. Tap the routine card: its header has `Edit Morning routine` beside `More options` (which keeps `Skip today`). Tap a meal's `Log it`: the `Log a meal` header has `Edit meals`, which opens the editor for the chosen meal with a `Back to Log a meal` arrow. Each opens its editor in one tap.
- **Fresh install.** With no `mealPlan` saved, Today shows Breakfast 8:30 AM, Lunch 1:00 PM and Dinner 8:00 PM (the defaults).
- **Large text.** Run `rpmctl display large-text` and `max-text`, open `Habits` and `Edit water`, and shoot each. Stepper labels sit on their own line with the stepper under them on the right; `From` and `Until` stack; list summaries wrap under the name. Run `rpmctl display phone`.
- **Errors.** Run `rpmctl logs --errors`.

## Gotchas

- Steppers save once the taps stop (half a second), so read the file after a short wait.
- The time buttons open the phone's own picker. Reach its buttons with `rpmctl tap --native`.
- `Show <meal>` in the list and `Show on Today` in the editor change the same value.
- The notch `Edit` chip is not built: the native islands do not carry it. Report it UNVERIFIED.
- Each recipe changes data. Reseed afterwards.
