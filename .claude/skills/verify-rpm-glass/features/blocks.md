# Blocks

Blocks is the list of Results the user is working toward, and each Result opens a detail page with its Result title, its Purpose, where it stands, the user's own verdict, and an ordered Plan of tasks. The user edits words in place, adds tasks to the Plan, reorders them, and decides when a Result is achieved.

## Sub-features

- `blocks-list` shows Result cards ordered by urgency with filters and an Inbox row.
- `blocks-filters` filters by Project and by Status.
- `blocks-new` creates a Block from the `New Block` button.
- `blocks-open` opens a Block's detail page.
- `blocks-edit-result` edits the Result title in place.
- `blocks-edit-purpose` edits the Purpose in place, with Undo.
- `blocks-change-project` moves the Block to another Project from the breadcrumb.
- `blocks-plan-add` adds a task to the Plan from the inline field.
- `blocks-plan-reorder` reorders Plan tasks by drag, or by the `Change Plan order` sheet.
- `blocks-sort-by-time` sorts the Plan by time when it is out of order.
- `blocks-achieved` marks a Result achieved, and marks it not achieved again.
- `blocks-menu` offers `Add notes`, `Suggest a Purpose`, `Archive Block`, `Delete` in More options.
- `blocks-root-menu` offers `Sort Inbox with Jev` and `Result, Purpose, Plan` from the list's More options.

## How to get to it (user POV)

- Tap `Blocks` in the bottom navigation bar.
- Tap a Result card on the Blocks list.
- Tap a Block card inside a Project's detail page.
- Tap a task's `Part of <Block>` panel in the task sheet.
- Tap `Open Plan` in the weekly review, or a search result of type Block.
- Tap `Back` on the detail page to return to the list.

## Driving it with rpmctl

Preconditions:

- Baseline state.
- `rpmctl open planner` has been run. Then `rpmctl tap --role button --name "Blocks"` shows the list; `Blocks` is `aria-current=page`. Wait a second after switching tabs before the next command.

- **List.** Run `rpmctl shot blocks-list`. The heading is `Blocks`. Result cards are buttons whose names start `Result: <title>.` and end `Open Block`, for example `Result: RM critical review drafted with my group. Due tomorrow 11:00 PM · 26 h left. 3 h 50 min of Musts left. 2 of 7 tasks done. Open Block`. Each card also has a checkbox `Mark <next task> complete` and a button `Next<task title>`. Two filter buttons read `Project: All projects` and `Status: Active`. A button `New Block` and an Inbox row (`Inbox7 tasks not in a Block`) sit at the bottom. Seven Blocks show under Active; `All five RM readings in the second brain` is hidden because all its tasks are done. Blocks due soonest come first.
- **Filter by Project.** Run `rpmctl tap --role button --name "Project: All projects"`. A menu lists `All projects` and the three Projects. Run `rpmctl tap --role menuitem --name "Second brain"`. The button reads `Project: Second brain` and, with `Status: Active`, the list says `No Blocks match these filters`. Run `rpmctl tap --role button --name "Status: Active"` then `rpmctl tap --role menuitem --name "All tasks done"`: `All five RM readings in the second brain` appears. Restore with `All projects` and `Active`.
- **Filter by Status.** The status menu has `Active`, `All tasks done`, `Achieved` and `All statuses`. Choose `Achieved`. The list says `No Blocks match these filters` until a Result is marked achieved.
- **New Block.** Run `rpmctl tap --role button --name "New Block"`. A Block opens with the heading `New Result`, the textbox `Result` focused and empty, and a snackbar `Block created`. Run `rpmctl type "Taxes filed"` and `rpmctl key enter`. The heading becomes `Taxes filed`, a snackbar reads `Result renamed`, and focus moves to the `Purpose` box. The new Block is the last item in `planner.blocks`. Run `rpmctl shot block-new`.
- **Open.** Run `rpmctl tap --name "RM critical review drafted"`. The detail page shows buttons `Back` and `More options`, a button `Project: Term 1 coursework. Change Project`, the Result title as a heading and a textbox named `Result`, a textbox named `Purpose`, a progress indicator named `2 of 7 tasks done`, the button `Mark Result achieved`, a heading `Plan`, a button `Add task to the Plan` and a textbox named `Add a task to the Plan` at the end of the Plan. Run `rpmctl shot block-detail`.
- **Plan rows.** Each task shows a checkbox `Mark <task> complete` and a button `<title>, <time line>, part of RM critical review drafted with my group[, Must]`. Musts also show an image named `Must`. Done tasks sit under a `Completed (2)` group.
- **Edit the Result.** Run `rpmctl tap --role textbox --name "Result"`, then `rpmctl key KEYCODE_MOVE_END` (the tap puts the caret where it landed, so words typed straight away land mid-title), then `rpmctl type " (v2)"` and `rpmctl key enter`. A snackbar reads `Result renamed` with `Undo`. Run `rpmctl state files/companion.json`; the Block `block-1` in `planner.blocks` has the new `title`. Press `rpmctl key escape` instead of Enter to revert an edit: the words typed are not saved. An empty title is never saved (the old words are kept).
- **Edit the Purpose.** Run `rpmctl tap --role textbox --name "Purpose"`, `rpmctl key KEYCODE_MOVE_END`, `rpmctl type " Calm submission."`, `rpmctl key enter`. A snackbar reads `Purpose saved` with `Undo`. The Block's `purpose` in the file ends with `Calm submission.`.
- **Undo.** Chain the edit and `rpmctl tap --role button --name "Undo"` in one shell line, because the snackbar lasts 6 s. The snackbar then reads `Change undone` and the file shows the earlier words.
- **Change Project.** Run `rpmctl tap --role button --name "Project: Term 1 coursework. Change Project"`. A menu lists `Open Term 1 coursework`, the three Projects and `No project`. Choose `Second brain`; a snackbar reads `Moved to Second brain` and the Block's `projectId` becomes `project-2`. `Undo` restores `project-1`.
- **Add a task to the Plan.** Run `rpmctl tap --role textbox --name "Add a task to the Plan"`, `rpmctl type "Email Prof. Rao about the citation format"`, `rpmctl key enter`. A snackbar reads `Task added` with `Undo`, the field empties and a Plan row appears. In `entries` one item has that `title`, `raw` equal to the typed words, `blockId` `block-1` and `state` `active`. The progress then reads `2 of 8 tasks done`. Run `rpmctl shot block-plan-added`.
- **Reorder by sheet.** Run `rpmctl tap --role button --name "Group call: merge sections"` to open the task sheet (pass `--role button`), `rpmctl tap --role button --name "More task options"`, `rpmctl tap --role menuitem --name "Change Plan order"`. A sheet `Plan order` shows the task name, `Plan order is the task’s priority. It does not change the scheduled time.`, and `Move up` and `Move down`. Tap `Move up`. A snackbar reads `Plan order changed`. In `entries` the task's `priority` drops by one and it sits one place higher in the Plan after `Close`.
- **Reorder by drag.** Hold a Plan row for about a third of a second, then drag. rpmctl has no drag, so drag reorder is **UNVERIFIED**; the sheet path above is the verified alternative.
- **Sort by time.** After the move above, a text button `Sort by time` shows beside the `Plan` heading. Tap it. A snackbar reads `Plan sorted by time` with `Undo`.
- **Mark Result achieved.** Run `rpmctl tap --role button --name "Mark Result achieved"`. A dialog `Mark Result achieved` shows the Result title, `Achieving the Result is your call. Ticking tasks alone does not decide it.`, a field `How do you know? (optional)` and buttons `Cancel` and `Mark achieved`. Type a line into the field, tap `Mark achieved`. A snackbar reads `Result achieved`. A panel `Result achieved` with a button `Mark not achieved` replaces the question. The Block in the file has `achieved` true, `achievedAt` and the typed `evidence`. `Mark not achieved` shows `Result marked not achieved` and `achieved` becomes false. Run `rpmctl shot block-achieved`.
- **List after achieving.** Go `Back`. The `Status: Achieved` filter now lists the Block; under `Active` it is gone.
- **More options.** On the detail page tap `More options`. Menu items: `Add notes`, `Suggest a Purpose`, `Archive Block`, `Delete`. `Add notes` reveals a `Notes` textbox that takes focus.
- **Suggest a Purpose (keyless).** Choose `Suggest a Purpose`. A sheet `Purpose suggestion` reads `Connect your AI key in Settings to get suggestions. Your plans stay saved.` with a button `Open Settings`. The model path (`Use this Purpose`) is **UNVERIFIED**.
- **Archive and Delete.** `Archive Block` returns to the list with a snackbar `Block archived` and `Undo`. The list More options then has `Archive`, which opens a sheet with a `Restore` button; `Restore` shows `Block restored`. `Delete` opens a dialog `Delete Block?` with `Linked content is kept. You can undo this change.` and buttons `Keep` and `Delete`. Use `Keep`.
- **List More options.** On the list, `More options` has `Weekly review`, `Inbox`, `Sort Inbox with Jev`, `Result, Purpose, Plan`, `Archive`, `Trash`, `Settings` and `Component gallery`. `Result, Purpose, Plan` opens a sheet of illustrations that says `Illustrations only. These are not saved goals or assumptions about you.` `Sort Inbox with Jev` keyless opens a sheet `Sort with Jev` reading `Connect your AI key in Settings to get suggestions. Your plans stay saved.`; the sorting preview path is **UNVERIFIED**.
- **Large text.** Run `rpmctl display large-text`, open the list and the detail page, `rpmctl shot block-detail-large-text`. Then `rpmctl display max-text` and repeat, then `rpmctl display phone`. Titles wrap and the project line truncates with an ellipsis. Nothing was found clipped.
- **Errors.** Run `rpmctl logs --errors`. Only emulator graphics and Chromium lines appeared.

## Gotchas

- Known bug as of 2026-10-07: reopening a Block whose `Add a task to the Plan` field had focus puts the field under the keyboard. Typing into the field the first time looks right (the field and the Plan sit above the keyboard); check by screenshot, because `rpmctl ui` reports the field as on screen even when hidden. The reopen case was not reproduced in the latest run, so it may depend on how the Block was left.
- Tapping a text box places the caret at the tap point. Press `rpmctl key KEYCODE_MOVE_END` before typing to append.
- The Result and Purpose are editable text areas, not form inputs. Use `--role textbox` with the exact name `Result` or `Purpose`.
- Both names `Result` and `Purpose` also appear in other texts such as `Result: …` card names. Pass `--role textbox`.
- Snackbars last 6 s and every rpmctl call takes a few seconds. Chain the action and `Undo` in one shell line, and read the snackbar text with `rpmctl eval 'document.querySelector("[role=status]").textContent'`.
- The drag to reorder cannot be driven with rpmctl. Use the `Plan order` sheet and report the drag as **UNVERIFIED**.
- Stable ids in the sample plan are `block-1` to `block-8`, `project-1` to `project-3`, `area-1` to `area-4`. They are the same after every `seed`. Plan order is the `priority` number on each task.
- The Inbox count here includes the weekly task, so it reads 7 while Today's Inbox row reads 6.
- Marking tasks done does not achieve a Result. Only the `Mark achieved` flow does.
- Every recipe here changes saved data. Reseed before the next feature.
