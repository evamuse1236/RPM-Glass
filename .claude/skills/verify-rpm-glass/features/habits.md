# Habits

A habit is a routine, water, or a meal time. The `Habits` list holds them all, and each opens an editor built from the task sheet's rows: an icon, then chips, a slider, a switch, a picker or a time. Every change saves at once with a snackbar and `Undo`. Data shape: `docs/body-data.md`.

## Sub-features

- `habits-list` lists routines, `Water` and the meal times with today's state, and one `Add habit` row (a menu of `Routine` and `Snack time`).
- `habits-water` edits glasses a day, glass size, reminders, the reminder interval and the reminder hours.
- `habits-meal` retimes a meal, shows or hides it on Today, and names or removes the snack time.
- `habits-routine` edits a routine (name, window, days, steps).
- `habits-hold` opens an editor by a long press on Today's meal or routine row; a long press on the water circle opens the Water sheet.
- `habits-edit-buttons` opens an editor from the water, routine and Log a meal sheets.
- `habits-notch-edit` is the notch's `Edit` chip. It is not built yet (it needs native code); report it UNVERIFIED.

## How to get to it (user POV)

- Today, `More options`, `Habits`, then tap a row.
- Long press a meal or a routine row on Today, or the water circle above Add (it opens the Water sheet).
- Long press the water circle, tap a routine card or a meal's ring, then the header button `Edit water` (opens the editor `Water`), `Edit <routine name>`, or `Meal times` in the meal sheet's `More options` menu.

## Driving it with rpmctl

Preconditions:

- After `rpmctl launch`, run `export RPMCTL_OWNER=<owner from launch>` in this agent's shell (PowerShell: `$env:RPMCTL_OWNER = '<owner from launch>'`). Keep it set through cleanup.
- Baseline state, `rpmctl open planner`, and the `Today` nav button tapped.

- **Open the list.** Run `rpmctl tap --role button --name "More options"`, then `rpmctl tap --role menuitem --name "Habits"`. A dialog `Habits` lists buttons `Morning routine`, `Water`, `Breakfast`, `Lunch`, `Dinner`; the routine reads `3 of 5, 1 skipped`, Water reads `3 of 8 glasses · every 90 min` over an 8-segment track, and each meal has the `restaurant` icon and one quiet line: its time and what was logged today (`8:30 AM · ✓ Poha and tea`). Every row ends in a chevron; there are no switches or chips in the list. Below the rows sits one button `Add habit`; it opens a menu with `Routine` and `Snack time` (once a snack time exists the button reads `Add routine` and opens the editor directly). Run `rpmctl shot habits`.
- **Water.** Tap `Water`. A dialog `Water` has a button `Back to Habits` (on the wide website `Close` stays too) and the count `3 of 8 glasses` beside its title. Under it, the glass track and a button `Log a glass` (`+ 1 glass`; it saves like Today's water log, snackbar `Glass logged · 4 of 8` with Undo) share one line. Below sit a slider `Daily goal` with `8 glasses` on the same line, a `Glass size` picker reading `250 ml` (a select of 200 to 500 ml) and a button `Reminders, Every 90 min`. Drag the `Daily goal` slider (or focus it and press the right arrow three times). The value reads `11 glasses`; when the slider is let go a snackbar reads `Daily goal: 11 glasses` and `planner.body.water.settings.goal` is 11. Today's water circle is then named `Water, <n> of 11 glasses. Log a glass` and has 11 segments.
- **Reminders off.** Tap `Reminders, Every 90 min`. A dialog `Water reminders` with `Back to Water` holds a switch `Reminders`, a slider `Every` reading `90 min`, and time buttons `From, 8:00 AM` and `Until, 10:00 PM`. Tap the switch: `Every`, `From` and `Until` dim to 38% and cannot be tapped; `water.settings.reminders` is false and the snackbar reads `Water reminders off`. `Back to Water` shows `Reminders, Off`. Tap the switch again to turn them back on.
- **Glass size and interval.** Tap `300 ml`: the snackbar reads `Glass size: 300 ml` and `glassMl` is 300. Tap `Longer interval`: `90 min` becomes `105 min` and saves after half a second. Ranges: glasses 1 to 20, interval 15 to 240 minutes; the buttons disable at the ends.
- **A meal.** Tap `Back to Habits`, then `Lunch`. A dialog `Edit lunch` has a time button `Time, 1:00 PM` and a switch `Show on Today`. Tap `Time` and set 12:15 in the phone's picker (`rpmctl tap --native "OK"`). The snackbar reads `Lunch at 12:15 PM`; `planner.body.mealPlan.slots` has lunch at `12:15`, and the Lunch row on Today sits at 12:15 PM.
- **Hide a meal.** Tap `Show on Today`. The snackbar reads `Lunch hidden from Today`; the lunch slot has `on: false`; the Lunch row leaves Today (a lunch already logged still shows) and `Log a meal` no longer offers a `Lunch` chip. Lunch stays in `Habits`, dimmed, reading `1:00 PM · Not on Today`.
- **Snack time.** In `Habits`, tap `Add habit`, then the menu item `Snack time`. A dialog `Edit snack` opens with `Time, 4:00 PM`, `Show on Today`, a textbox `Name` and a button `Remove snack`; the snackbar reads `Snack time added`. `mealPlan.slots` has `{slot: "snack", at: "16:00", on: true}` and Today shows `Snack · Not logged` at 4 PM. Typing a name and leaving the field saves it as the snack's name. `Remove snack` takes it away again, with Undo.
- **Routine.** In `Habits`, tap `Morning routine`. The dialog `Edit routine` has `Back to Habits`, a textbox `Name`, time buttons `Starts, 7:00 AM` and `Ends, 7:30 AM`, a group `Days` of chips `Mon` to `Sun`, the steps and `Save routine`. `Add`, then `Routine`, opens the same editor empty. Saving returns to `Habits`.
- **Long press.** Close the sheet. Run `rpmctl tap --long --role button --name "Water,"` on the habit circle. The `Water` sheet opens; its `Edit water` opens the editor. A long press on a meal row opens `Edit <meal>`, on a routine card `Edit routine`.
- **Edit buttons.** Long press the water circle: the `Water` sheet header has `Edit water` (icon `tune`) and no `More options`. Tap the routine card: its header has `Edit Morning routine` beside `More options` (which keeps `Skip today`). Tap a meal's ring: the `Log a meal` actions hold only `Save`, up to three recent foods sit as chips under `What you ate` (`Poha and tea`), and its `More options` menu has `Meal times` and `See history`; `Meal times` opens the editor for the chosen meal with a `Back to Log a meal` arrow. Each opens its editor in one tap.
- **Fresh install.** With no `mealPlan` saved, Today shows Breakfast 8:30 AM, Lunch 1:00 PM and Dinner 8:00 PM (the defaults).
- **Errors.** Run `rpmctl logs --errors`.

## Gotchas

- Steppers save once the taps stop (half a second), so read the file after a short wait.
- The time buttons open the phone's own picker. Reach its buttons with `rpmctl tap --native`.
- `Show <meal>` in the list and `Show on Today` in the editor change the same value.
- The notch `Edit` chip is not built: the native islands do not carry it. Report it UNVERIFIED.
- Each recipe changes data. Reseed afterwards.
