# Task rows and task sheet

A task row shows a check circle, a title, a time line and a star if it is a Must. Tapping the row opens the task sheet, where each field edits and saves at once with Undo. Rows can be swiped to schedule or delete, and the `Add task` button on Today opens a quick-add sheet that creates a task in one step.

## Sub-features

- `task-row` shows the check circle, the title with its time line and Block, and the `Must` star.
- `task-complete` ticks and unticks a task from the row.
- `task-open` opens the task sheet from a row.
- `task-sheet-title` edits the title in the header.
- `task-sheet-date` sets the day (Today, Tomorrow, five weekdays, Pick a date, No date) in the Day row.
- `task-sheet-time` sets the time (every half hour 6:00 AM to 11:00 PM, Pick a time, No time) in the Time row.
- `task-sheet-estimate` sets the length in the Length row.
- `task-sheet-alert` sets no alert, a reminder, or a ringing alarm in the Alert row (see the alerts file).
- `task-sheet-repeat` sets a repeat rule in the Repeat row.
- `task-sheet-must` toggles Must with the header star.
- `task-sheet-start` taps `Start now` under the title: the task begins at this minute today, with Undo. The chip hides while the task runs, once it is done, and on a repeating task.
- `task-sheet-complete` completes the task with the header ring or a right swipe on the header.
- `task-sheet-block` moves the task to another Block from the Block row.
- `task-sheet-notes` edits Notes and Who could help.
- `task-sheet-actions` offers Ask Capture, Duplicate, Archive and Delete in the `Task actions` toolbar.
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

- After `rpmctl launch`, run `export RPMCTL_OWNER=<owner from launch>` in this agent's shell (PowerShell: `$env:RPMCTL_OWNER = '<owner from launch>'`). Keep it set through cleanup.

- Baseline state.
- `rpmctl open planner` has been run and the `Today` nav button tapped. `open planner` reopens the last tab used, so check the heading and wait a couple of seconds before the first tap. Scroll down once (`rpmctl scroll down`) so the agenda rows are in view.

- **Row handles.** Run `rpmctl ui`. A row has a checkbox `Mark <title> complete`, a button `<title>, <time line>, part of <Block>[, Must]` and, for Musts, an image `Must`. For example `Group call: merge sections, Overdue · 4:00 PM · 45 min, part of RM critical review drafted with my group`. Seeded in the evening the time lines carry `Overdue`.
- **Tick from the row.** Run `rpmctl tap --role checkbox --name "Mark Group call: merge sections complete"`. A snackbar reads `Task completed` with `Undo`. See the Today file for the readback. Expand `Completed (1)` and tap the row's checkbox (`Mark Group call: merge sections incomplete`) to reopen it.
- **Open the sheet.** Run `rpmctl tap --role button --name "Group call: merge sections"`. A dialog named `Task` opens, nearly full height (the top bar stays visible). Its header holds a checkbox `Mark Group call: merge sections complete` (the ring), a textbox `Task title`, a switch `Must` (a star) and a button `Close`, with a `Start now` chip under the title. Below it are five groups of chips, one row each, that scroll sideways: `Day`, `Time`, `Length`, `Alert`, `Repeat`. Then a button `Part of RM critical review drafted with my group. Change Block`, textboxes `Notes` and `Who could help`, and a toolbar `Task actions` with `Ask Capture`, `Duplicate`, `Archive`, `Delete`. There is no `Mark complete`, no `More task options` and no `More details`. Run `rpmctl shot task-sheet`. At `display phone` nothing in the sheet scrolls: `rpmctl eval 'const b=document.querySelector(".sheet-body");[b.scrollHeight,b.clientHeight]'` gives two equal numbers.
- **Edit the title.** Run `rpmctl tap --role textbox --name "Task title"`, `rpmctl key KEYCODE_MOVE_END`, `rpmctl type " today"`, then `rpmctl tap --role button --name "Close"` (leaving the field saves). A snackbar reads `Title saved` with `Undo`. `rpmctl state files/companion.json` shows the new `title` on that entry in `entries`; `raw` keeps the original words. `Undo` restores the old title.
- **Set the day.** The group `Day` holds `Today`, `Tomorrow`, five weekday chips (`Wed` and so on, named like `Wednesday, Oct 21`), `Pick a date` and `No date`; the chosen one is pressed and scrolled into view. Run `rpmctl tap --role button --name "Tomorrow"`. A snackbar reads `Moved to Tomorrow, 4:00 PM` with `Undo` and the entry's `planned` moves to tomorrow at the same time. `Pick a date` opens the phone's date picker; the picked day gets its own chip after `Tomorrow`, pressed.
- **Set the time.** The group `Time` holds `Pick a time`, then a chip every half hour from `6:00 AM` to `11:00 PM`, then `No time` (not for a repeating task). The row opens with the chosen time, or the next half hour, second from the left. Run `rpmctl tap --role button --name "2:30 PM"` (`--nth` if `12:30 PM` also matches). The snackbar reads `Moved to Today, 2:30 PM` and `planned` holds 14:30. A time picked with `Pick a time` off the grid (10:17) shows as its own chip `10:17 AM`, pressed, in time order.
- **No date.** Run `rpmctl tap --role button --name "No date"`. The snackbar reads `Date removed`; `planned` and `plannedDate` are null. Every chip in `Time` and `Alert` now has `aria-disabled="true"` and shows at 38%.
- **Length.** In the group `Length` run `rpmctl tap --role button --name "1 h"` (exact match first). The snackbar reads `Length 1 h` and `minutes` in the file becomes 60. `Other length` is a number field inside the row (minutes); `No length` clears it.
- **Alert.** With a day and time set, the group `Alert` holds `No alert`, `Reminder` and `Ringing alarm` (the chip shows `Alarm`). Tap `Reminder`. The snackbar reads `Reminder at 4:00 PM set` and `alertIntent.type` in the file is `reminder`. See the alerts file for the rest.
- **Repeat.** The group `Repeat` holds `Doesn't repeat`, `Daily`, `Weekdays`, `Weekly`, `After completion`. Tap `Daily`. The snackbar reads `Repeats: daily` and `recurrence` in the file is `daily`. `After completion` adds a field `Days after completion`.
- **Must.** Run `rpmctl tap --role switch --name "Must"`. Its `aria-checked` flips, the star fills (`.fill` on its icon), a snackbar reads `Marked Must` with `Undo`, and the entry's `must` becomes true. The row then shows an image `Must`.
- **Change Block.** Run `rpmctl tap --role button --name "Change Block"`. A sheet `Move to Block` slides over with a button `Back to task`, a textbox `Search Blocks`, the recent and suggested Blocks, then the rest. Run `rpmctl tap --role textbox --name "Search Blocks"` and `rpmctl type "Three"`, then tap `Three morning runs`. A snackbar reads `Moved to Three morning runs`, the sheet returns to `Task`, the Block row now reads `Part of Three morning runs. Change Block`, and `blockId` becomes `block-4`. An Inbox task's row reads `No block. Choose a Block`.
- **Complete.** Run `rpmctl tap --role checkbox --name "Mark Group call: merge sections complete"`. The ring fills, the title strikes through, a snackbar reads `Task completed` with `Undo`, and the sheet closes about 0.3 s later. Swiping the header row right past 96px does the same: `rpmctl scroll right --css ".task-head"` (unconfirmed).
- **Duplicate.** In `Task actions` tap `Duplicate`. A snackbar reads `Task duplicated` with `Undo`, and a second entry with the same title and Block exists in the file.
- **Archive.** Tap `Archive`. The sheet closes and a snackbar reads `Archived. Restore it from Archive.`
- **Delete.** Tap `Delete`. The sheet closes, the task leaves the list and a snackbar reads `Moved to Trash` with `Undo`. In the file the entry has `archived` true and `archiveDisposition` `trash`. `Undo` brings it back. See the Inbox and Trash file for restoring.
- **Undo last completion.** A repeating task that has been completed shows a fifth action `Undo last completion` in `Task actions`.
- **Schedule menu.** A left swipe on a row opens a menu `Schedule <title>` that lists radio items `Today, 4:00 PM, current`, `Tomorrow, 4:00 PM`, `Tomorrow morning, 9:00 AM`, `This weekend, Sat 4:00 PM`, `No date` (for an overdue or dated task in some cases) and a plain item `Pick a date…`. Tap `Tomorrow morning`. A snackbar reads `Moved to Tomorrow, 9:00 AM` with `Undo` and `planned` changes.
- **Swipe left (schedule).** Run `rpmctl scroll left --role button --name "Finish my section of the critical review"`. The row springs back and the menu `Schedule Finish my section of the critical review` opens with the radio items above. `rpmctl key back` closes it without a change. Run `rpmctl shot task-swipe-left`.
- **Swipe right (done).** Run `rpmctl scroll right --role button --name "Finish my section of the critical review"`. A snackbar reads `Task completed` with `Undo` and the entry's `done` becomes true. Run `rpmctl tap --role button --name "Undo"` in the same shell line, because the snackbar closes after 6 s. Run `rpmctl shot task-swipe-right`. Delete is in the long-press menu (`rpmctl tap --long`), never a swipe.
- **Quick add.** On Today run `rpmctl tap --role button --name "Add task"`. A sheet `New task` opens with focus in a textbox `Task`, day chips (`Today` pressed by default on Today), a `Time` chip, Block chips (`Three morning runs`, `No block` pressed, `Choose a Block`), `Estimate`, `Must`, `Repeat` and `Details` chips, and buttons `Capture` and `Add`. `Add` is disabled while the title is empty. Run `rpmctl type "Renew library card"` and `rpmctl shot quick-add`.
- **Quick add save.** Press `rpmctl key enter` to add and keep the sheet open for the next task, or tap `Add` to add and close. A snackbar reads `Added to Today` (day chip) and, with a Block, `Added to Today · <Block>`. The file has an entry titled `Renew library card` with `raw` equal to the typed words, `blockId` null and `plannedDate` today.
- **Quick add with a Block tag.** Type `Renew card #Three` in the Task field. A chip `Suggested Block Three morning runs, read from “#Three”. Tap to remove` appears. Tap it to select the Block (`pressed` true and `No block` unpressed), then tap `Add`. The snackbar reads `Added to Today · Three morning runs` and `blockId` is `block-4`. The title keeps the text `#Three`.
- **Quick add draft.** Type a title and press `rpmctl key back` twice (the first closes the keyboard). A prompt `Discard changes?` with `Keep editing` and `Discard` shows at the bottom of the sheet. `Keep editing` returns to the typed title. `Discard` closes the sheet and the next `Add task` opens empty.
- **Errors.** Run `rpmctl logs --errors`.

## Gotchas

- The row's main button name is long and changes with time (`Now`, `Overdue`, `Next` prefixes). Match on the title with a substring and pass `--role button` so the checkbox is not picked.
- The same task can appear twice on one screen (lead card and agenda). Add `--nth` or a `--role`.
- `open planner` returns to the last tab used. After `seed` it can land on Projects or Blocks, and a tap sent too early lands on the wrong tab. Check the heading first.
- In the sheet, `Must` is a switch (a star icon button). Its name stays `Must`. The ring is the only complete control in the sheet.
- The `Close` button inside the sheet and the scrim named `Close sheet` are different. `New task` has no `Close` button; use `rpmctl key back`.
- Fields in the sheet save when you choose a chip or leave a text field. There is no Save button. A snackbar and the file are the proof.
- Snackbars last 6 s and every rpmctl call takes a few seconds. Chain the action and `Undo` in one shell line, and read the text with `rpmctl eval 'document.querySelector("[role=status]").textContent'`.
- Quick add's Enter key adds and keeps the sheet open. Do not expect it to close.
- Each recipe changes data. Reseed afterwards.
- The on-screen keyboard can cover the sheet's lower fields. Look at the screenshot before judging a tap.
