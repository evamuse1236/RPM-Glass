# Inbox and Trash

The Inbox holds tasks that are not in a Block yet, such as loose captures. The user opens it from several places, gives each task a Block, or keeps it there. Deleted tasks go to Trash and archived Blocks and tasks go to Archive, and both can be restored.

## Sub-features

- `inbox-open` opens the Inbox sheet from each entry point.
- `inbox-list` lists tasks with no Block, with a note and actions.
- `inbox-add` adds a task from the Inbox with `Add task`.
- `inbox-move` moves an Inbox task into a Block.
- `inbox-back` returns from a task opened in the Inbox to the Inbox.
- `inbox-jev-keyless` shows the keyless message for `Sort with Jev`.
- `inbox-empty` shows `Inbox is empty`.
- `trash-open` opens Trash and Archive sheets.
- `trash-restore` restores a deleted task or an archived Block.
- `trash-empty` shows an empty Trash and an empty Archive.

## How to get to it (user POV)

- Tap the `Inbox, 6 tasks not in a Block yet` row at the bottom of Today.
- Tap the `Inbox` row at the bottom of the Blocks list.
- Tap `More options` then `Inbox` on any root screen.
- Tap `Inbox` on the empty search screen.
- Tap `More options` then `Trash` or `Archive`.
- Delete or archive a task from its More task options, then open Trash or Archive.

## Driving it with rpmctl

Preconditions:

- Baseline state. The sample plan has six loose tasks plus the weekly task `Weekly review`, so the sheet lists seven rows.
- `rpmctl open planner` has been run. It reopens the last tab used, so check the heading and wait a couple of seconds before the first tap.

- **From Blocks.** Run `rpmctl tap --role button --name "Blocks"`, wait, then `rpmctl scroll down`, then `rpmctl tap --role button --name "Inbox"`. A dialog `Inbox` opens with the note `Tasks not in a Block yet. Give each one a Result, or keep it here.`, a button `Sort with Jev`, seven task rows, and bottom buttons `Capture` and `Add task`. Run `rpmctl shot inbox`.
- **From More options.** Run `rpmctl tap --role button --name "More options"`, then `rpmctl tap --role menuitem --name "Inbox"`. The same sheet opens.
- **From Today.** Run `rpmctl scroll down` then `rpmctl tap --name "Inbox, 6 tasks"`. Same sheet.
- **Rows.** Rows read like `Buy a new notebook for RM, 30 min, part of No block`, each with a checkbox `Mark <title> complete`. The sample titles are `Ask the group which district we picked`, `Check the LMS for the critical review article again`, `Send the RI budget to Mariyam`, `Buy a new notebook for RM`, `Call home on Sunday`, `Clear 5 Oct morning clash: DAD exam vs GWBC` and `Weekly review`.
- **Add.** Run `rpmctl tap --role button --name "Add task"`. The quick-add sheet opens (see the task rows and sheet file). Run `rpmctl type "Pay the phone bill"` and `rpmctl key enter`. A snackbar reads `Added to Inbox`; `rpmctl state files/companion.json` has the entry with `blockId` null and `plannedDate` null. Close the sheet with `rpmctl key back`; the Inbox shows one more row.
- **Move to a Block.** Run `rpmctl tap --role button --name "Buy a new notebook for RM"`. A button `Back to Inbox` is in the sheet header. Run `rpmctl tap --role button --name "More task options"`, `rpmctl tap --role menuitem --name "Move to Block"`. A button `Block: No block. Change` and a textbox `Search Blocks` appear. Run `rpmctl tap --role textbox --name "Search Blocks"`, `rpmctl type "second brain"`, then `rpmctl tap --role button --name "All five RM readings"`. A snackbar reads `Moved to All five RM readings in the second brain`. The entry in the file has `blockId` `block-3`. Run `rpmctl tap --role button --name "Back to Inbox"`; the Inbox lost one row. Run `rpmctl shot inbox-after-move`.
- **Suggested Block.** In the task sheet, an unassigned task may show a suggestion chip named `Suggested Block <title>`. This was not seen for the sample Inbox titles, so it is **UNVERIFIED** here. Quick add with `#Three` in the title does show such a chip (see the task rows and sheet file).
- **Sort with Jev (keyless).** Run `rpmctl tap --role button --name "Sort with Jev"`. A dialog `Sort with Jev` reads `Connect your AI key in Settings to get suggestions. Your plans stay saved.` with a button `Open Settings`. `rpmctl key back` closes both sheets and returns to the root screen. The sorting preview with `Apply arrangement` and `Dismiss` is model-backed and **UNVERIFIED**.
- **Empty.** The `Inbox is empty` state with `New captures land here until you give them a Block.` was not driven: it needs every Inbox task moved or deleted. **UNVERIFIED**.
- **Delete into Trash.** Open an Inbox task, `More task options`, `Delete`. A snackbar reads `Moved to Trash` with `Undo`. Close the sheet, then `More options` then `Trash`. A dialog `Trash` shows a `Restore` button per row. In the file the entry has `archived` true and `archiveDisposition` `trash`.
- **Restore.** Run `rpmctl tap --role button --name "Restore"`. A snackbar reads `Task restored` with `Undo`, the sheet closes when the last row is restored, and the file shows `archived` false and `archiveDisposition` null. The task is back in the Inbox or its Block.
- **Archive.** Archive a Block from its detail `More options` > `Archive Block`, then root `More options` then `Archive`. A dialog `Archive` lists it with `Restore` and the snackbar `Block restored`. An archived task from `More task options` > `Archive` was not driven.
- **Empty Trash and Archive.** With nothing deleted, `Trash` shows the heading `Trash is empty` and `Archive` shows `Nothing archived`. Run `rpmctl shot empty-Trash`.
- **Large text.** Run `rpmctl display large-text`, open the Inbox, `rpmctl shot inbox-large-text`, then `rpmctl display phone`.
- **Errors.** Run `rpmctl logs --errors`. Only emulator graphics and Chromium lines appeared.

## Gotchas

- The Inbox is a sheet over the planner, not a tab. Close it with `rpmctl tap --role button --name "Close"` or `rpmctl key back`. `key back` pressed with `Sort with Jev` open closes both sheets.
- `Inbox` appears as a menu item, a row, a nav label inside search, and a sheet title. Pass `--role`.
- The count in the Today row name (`6 tasks`) changes as you edit. Use the prefix `Inbox,`.
- Known bug as of 2026-10-07: the counts disagree. Today's row says `Inbox, 6 tasks not in a Block yet`, the Blocks row says `7 tasks not in a Block`, and the sheet lists seven rows including the weekly task `Weekly review`. Evidence: `.verify/evidence/2026-10-07T13-37-30/123-inbox-from-today.png`.
- Rows in the Trash sheet do not expose their task titles to `rpmctl ui`; match the `Restore` button and read the file.
- A task deleted by mistake is only in Trash. `Undo` lasts 6 seconds; Trash lasts until emptied.
- Restoring a task puts it back where it was. A restored Block returns to the Blocks list.
- Reseed after any recipe here.
