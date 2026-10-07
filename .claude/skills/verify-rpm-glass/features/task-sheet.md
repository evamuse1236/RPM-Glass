# Task rows and task sheet

A task row shows a check circle, a title, a time line and a star if it is a Must. Tapping the row opens the task sheet, where each field edits and saves at once with Undo. Rows can be swiped to schedule or delete, and the `Add task` button on Today opens a quick-add sheet that creates a task in one step.

## Sub-features

- `task-row` shows the check circle, the title with its time line and Block, and the `Must` star.
- `task-complete` ticks and unticks a task from the row.
- `task-open` opens the task sheet from a row.
- `task-sheet-title` edits the title.
- `task-sheet-date` sets the day and time with quick chips.
- `task-sheet-estimate` sets the estimate in minutes.
- `task-sheet-repeat` sets a repeat rule.
- `task-sheet-alert` sets no alert, a reminder, or a ringing alarm (see the alerts file).
- `task-sheet-must` toggles Must.
- `task-sheet-block` moves the task to a Block or to no Block.
- `task-sheet-notes` edits the notes text.
- `task-sheet-menu` offers Schedule, Ask Capture, Move to Block, Change Plan order, Duplicate, Archive and Delete.
- `task-swipe-schedule` swipes a row right to open one-tap date choices.
- `task-swipe-delete` swipes a row left to delete it, with Undo.
- `task-quick-add` adds a task from the `Add task` button.

## How to get to it (user POV)

- Tap a task's title in any list: Today, Plan, Inbox, Search, Completed.
- Tap the `Next` title on a Block card to open its next task.
- Swipe a task row right or left.
- Tap `Add task` in the Today top bar, or `Add task` at the bottom of the Inbox sheet.
- Tap `Add a task` in the empty-day state on Today.

## Driving it with rpmctl

Preconditions:

- Baseline state.
- `rpmctl open planner` has been run and the `Today` nav button tapped. `open planner` reopens the last tab used, so check the heading and wait a couple of seconds before the first tap. Scroll down once (`rpmctl scroll down`) so the agenda rows are in view.

- **Row handles.** Run `rpmctl ui`. A row has a checkbox `Mark <title> complete`, a button `<title>, <time line>, part of <Block>[, Must]` and, for Musts, an image `Must`. For example `Group call: merge sections, Overdue · 4:00 PM · 45 min, part of RM critical review drafted with my group`. Seeded in the evening the time lines carry `Overdue`.
- **Tick from the row.** Run `rpmctl tap --role checkbox --name "Mark Group call: merge sections complete"`. A snackbar reads `Task completed` with `Undo`. See the Today file for the readback. Expand `Completed (1)` and tap the row's checkbox (`Mark Group call: merge sections incomplete`) to reopen it.
- **Open the sheet.** Run `rpmctl tap --role button --name "Group call: merge sections"`. A dialog named `Task` opens with a textbox `Task title`, a checkbox `Mark <title> complete`, field buttons `Date: Today, 4:00 PM. Change`, `Estimate: 45 min. Change`, `Repeat: Doesn't repeat. Change` and `Alert: No alert. Change`, a toggle `Must`, a panel button `Part of RM critical review drafted with my group. Purpose: … Open Block`, a button `Change Block`, a textbox `Add details`, buttons `More task options` and `Close`, and a filled button `Mark complete`. Run `rpmctl shot task-sheet`.
- **Edit the title.** Run `rpmctl tap --role textbox --name "Task title"`, `rpmctl key KEYCODE_MOVE_END`, `rpmctl type " today"`, then `rpmctl tap --role button --name "Close"` (leaving the field saves). A snackbar reads `Title saved` with `Undo`. `rpmctl state files/companion.json` shows the new `title` on that entry in `entries`; `raw` keeps the original words. `Undo` restores the old title.
- **Set the day.** In the sheet a group `Day` holds chips `Today, Wednesday, October 7`, `Tomorrow, Thursday, October 8` and a third chip (`This weekend, …` on a weekday). Run `rpmctl tap --role button --name "Tomorrow, Thursday"`. A snackbar reads `Moved to Tomorrow, 4:00 PM`, the Date button reads `Date: Tomorrow, 4:00 PM. Change`, and a group `Time` unfolds with a `No time` chip. The entry's `planned` becomes `2026-10-08` at the old time. Run `rpmctl tap --role button --name "No time"`. The snackbar reads `Time removed`, `planned` becomes null and `plannedDate` becomes `2026-10-08`.
- **Estimate.** Run `rpmctl tap --role button --name "Estimate 1 h"` (chips `Estimate 15 min`, `30 min`, `1 h` are visible; the `Estimate:` button opens more). The snackbar reads `Estimate 1 h` and `minutes` in the file becomes 60.
- **Repeat.** Run `rpmctl tap --role button --name "Repeat: Doesn't repeat"`. Chips read `Doesn't repeat`, `Daily`, `Every weekday`, `Weekly`, `After completion`. Tap `Daily`. The snackbar reads `Repeats: daily` and `recurrence` in the file is `daily`.
- **Alert.** Run `rpmctl tap --role button --name "Alert: No alert"`. Chips read `No alert`, `Reminder`, `Ringing alarm`. Tap `Reminder`. The snackbar reads `Reminder at 4:00 PM set` and `alertIntent.type` in the file is `reminder`. See the alerts file for the rest.
- **Must.** Run `rpmctl tap --role button --name "Must"`. The button turns pressed, a snackbar reads `Marked Must` with `Undo`, and the entry's `must` becomes true. The row then shows an image `Must`.
- **Move to Block.** Open `More task options`, choose `Move to Block`. The sheet shows a textbox `Search Blocks` and a `Show all 8 Blocks` button. Run `rpmctl tap --role textbox --name "Search Blocks"` and `rpmctl type "Three"`; a button `Three morning runs` appears. Tap it. A snackbar reads `Moved to Three morning runs` and `blockId` becomes `block-4`. The `Part of …` panel opens the Block instead, so do not use it for this.
- **More task options.** Run `rpmctl tap --role button --name "More task options"`. The menu lists `Schedule`, `Ask Capture`, `Move to Block`, `Add who could help`, `Change Plan order`, `Duplicate`, `Archive`, `Delete` (and `Undo last completion` for a completed task). Run `rpmctl shot task-menu`.
- **Schedule menu.** Choose `Schedule`. A menu `Schedule <title>` lists radio items `Today, 4:00 PM, current`, `Tomorrow, 4:00 PM`, `Tomorrow morning, 9:00 AM`, `This weekend, Sat 4:00 PM`, `No date` (for an overdue or dated task in some cases) and a plain item `Pick a date…`. Tap `Tomorrow morning`. A snackbar reads `Moved to Tomorrow, 9:00 AM` with `Undo` and `planned` changes. This is the same menu that a right swipe opens.
- **Duplicate.** Choose `Duplicate`. The sheet closes, a snackbar reads `Task duplicated` with `Undo`, and a second entry with the same title and Block exists in the file.
- **Delete.** Choose `Delete`. The task leaves the list and a snackbar reads `Moved to Trash` with `Undo`. In the file the entry has `archived` true and `archiveDisposition` `trash`. See the Inbox and Trash file for restoring.
- **Swipe right (schedule).** Run `rpmctl scroll right --role button --name "Finish my section of the critical review"`. The menu `Schedule Finish my section of the critical review` opens with the radio items above. `rpmctl key back` closes it without a change. Run `rpmctl shot task-swipe-right`.
- **Swipe left (delete).** Run `rpmctl scroll left --role button --name "Finish my section of the critical review"`. The row leaves and the snackbar reads `Moved to Trash` with `Undo`. Run `rpmctl tap --role button --name "Undo"` in the same shell line, because the snackbar closes after 6 s. Run `rpmctl shot task-swipe-left`.
- **Quick add.** On Today run `rpmctl tap --role button --name "Add task"`. A sheet `New task` opens with focus in a textbox `Task`, day chips (`Today` pressed by default on Today), a `Time` chip, Block chips (`Three morning runs`, `No block` pressed, `Choose a Block`), `Estimate`, `Must`, `Repeat` and `Details` chips, and buttons `Capture` and `Add`. `Add` is disabled while the title is empty. Run `rpmctl type "Renew library card"` and `rpmctl shot quick-add`.
- **Quick add save.** Press `rpmctl key enter` to add and keep the sheet open for the next task, or tap `Add` to add and close. A snackbar reads `Added to Today` (day chip) and, with a Block, `Added to Today · <Block>`. The file has an entry titled `Renew library card` with `raw` equal to the typed words, `blockId` null and `plannedDate` today.
- **Quick add with a Block tag.** Type `Renew card #Three` in the Task field. A chip `Suggested Block Three morning runs, read from “#Three”. Tap to remove` appears. Tap it to select the Block (`pressed` true and `No block` unpressed), then tap `Add`. The snackbar reads `Added to Today · Three morning runs` and `blockId` is `block-4`. The title keeps the text `#Three`.
- **Quick add draft.** Type a title and press `rpmctl key back` twice (the first closes the keyboard). A prompt `Discard changes?` with `Keep editing` and `Discard` shows at the bottom of the sheet. `Keep editing` returns to the typed title. `Discard` closes the sheet and the next `Add task` opens empty.
- **Large text.** Run `rpmctl display large-text`, open the sheet, `rpmctl shot task-sheet-large-text`, then `rpmctl display max-text` and repeat, then `rpmctl display phone`. At max text the sheet still lists `Task title` and `Mark complete`.
- **Errors.** Run `rpmctl logs --errors`.

## Gotchas

- The row's main button name is long and changes with time (`Now`, `Overdue`, `Next` prefixes). Match on the title with a substring and pass `--role button` so the checkbox is not picked.
- The same task can appear twice on one screen (lead card and agenda). Add `--nth` or a `--role`.
- `open planner` returns to the last tab used. After `seed` it can land on Projects or Blocks, and a tap sent too early lands on the wrong tab. Check the heading first.
- In the sheet, `Must` is a toggle button, not a checkbox. Its name stays `Must`.
- The `Close` button inside the sheet and the scrim named `Close sheet` are different. `New task` has no `Close` button; use `rpmctl key back`.
- Fields in the sheet save when you choose a chip or leave a text field. There is no Save button. A snackbar and the file are the proof.
- Snackbars last 6 s and every rpmctl call takes a few seconds. Chain the action and `Undo` in one shell line, and read the text with `rpmctl eval 'document.querySelector("[role=status]").textContent'`.
- Quick add's Enter key adds and keeps the sheet open. Do not expect it to close.
- Each recipe changes data. Reseed afterwards.
- The on-screen keyboard can cover the sheet's lower fields. Look at the screenshot before judging a tap.
