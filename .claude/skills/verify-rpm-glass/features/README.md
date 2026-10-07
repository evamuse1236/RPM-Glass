# RPM verification map

This directory is the maintained source for verifying the user-facing behavior of RPM on the Android emulator. Read the index before driving the app, then use the matching feature file as the recipe. In every recipe, `rpmctl` stands for `node .claude/skills/verify-rpm-glass/rpmctl.mjs`, run from the repo root.

## Baseline preconditions

- Run `rpmctl launch`. It prints `"ok": true` when the owned emulator is booted and the debug APK from this checkout is installed.
- Run `rpmctl doctor` and require `ok`. Read `firstFix` if it is not.
- Run `rpmctl seed`. It loads the sample plan and reopens the app. Dates in the sample plan are relative to the moment you seed, so reseed on a new day.
- Run `rpmctl display phone` so the screen is S24 FE size at normal text.
- The sample plan holds:
  - Areas `Studies`, `Health`, `Building`, `Family`.
  - Projects `Term 1 coursework`, `Second brain`, `Morning runs`.
  - Goals `Finish Term 1 with work I am proud of` and `Run three mornings a week`.
  - Eight Blocks, among them `RM critical review drafted with my group` (7 tasks, 2 done), `PMDL post work ready to submit`, `All five RM readings in the second brain`, `Three morning runs`, `DAD Excel workbook submitted`, `Confident for RM Quiz I`, `District demographic profile ready` and `RPM app weekly review I actually use` (no Project).
  - Six Inbox tasks (no Block), among them `Ask the group which district we picked` and `Buy a new notebook for RM`.
  - Today: `Finish my section of the critical review` at 10:00 AM, `Group call: merge sections` at 4:00 PM and the weekly task `Weekly review` at 7:30 PM.
  - Next three days: `Submit the critical review PDF with the plagiarism report`, `Upload the PMDL post work`, `Upload the workbook to the LMS`, `Sit RM Quiz I`.
  - No week is planned yet, so the Today week line says the week is not planned.
- The emulator has no OpenRouter key, no Google account and no Samsung software. Features that need them are marked in their files.
- Never drive an instance that `rpmctl launch` did not start. Mutating commands refuse other devices.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise. Reseed with `rpmctl seed` after a recipe that changed data.
- The planner cannot be started with `am start`. Reach it with `rpmctl open planner`. Reach Capture with `rpmctl open capture`.
- Prefer accessible role and name over CSS or coordinates: `rpmctl tap --role button --name "Blocks"`. Names are exact first, then substring. If a name is ambiguous, `tap` lists the candidates; add `--role` or `--nth`.
- Check what is on screen with `rpmctl ui`. A WebView element hidden behind the bottom nav bar or the keyboard still has a rect, so look at the screenshot too.
- Type into a field only after tapping it: `rpmctl tap --role textbox --name "..."`, then `rpmctl type "..."`, then `rpmctl key enter` where the feature says Enter saves.
- Reach native dialogs and system screens with `rpmctl tap --native "Text"` and list them with `rpmctl ui --native`.
- Wait for an element, never a fixed time: `rpmctl wait --name "Task added"`. Snackbars last 6 s with Undo and 4 s without.
- Read saved data with `rpmctl state files/companion.json`. Compare it before and after a mutation.
- Switch screen size or text with `rpmctl display large-text|max-text|landscape|wide|phone`. Always return to `phone`.
- Swipe sideways across a row with `rpmctl scroll right|left --role button --name "<row name>"` (right opens `Schedule <title>`, left moves the task to Trash). There is no drag command, so drag reorder is marked UNVERIFIED and its menu alternative is given.
- Tapping a text box puts the caret where you tapped. To add to the end of existing text, run `rpmctl key KEYCODE_MOVE_END` before `rpmctl type`.
- A step that was not confirmed from the app's source or a live run carries "(unconfirmed)". Treat it as a hypothesis, correct it, and report the correction.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen. Use `rpmctl shot <label>` before and after, and name the display in the label (for example `blocks-list-large-text`).
- UI proof is a screenshot plus the matching `rpmctl ui` output. Shots land in `.verify/evidence/<run-id>/`.
- Mutation proof includes a read-only second view: `rpmctl state files/companion.json` showing the exact stored value.
- Run `rpmctl logs --errors` after each drive. A page error or crash fails the proof even if the screen looks right.
- Check every layout-sensitive feature at `phone`, `large-text` and, if text can wrap, `max-text`.
- Record the feature ID and the entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.
- Mark as **UNVERIFIED**: model-backed paths, audible alarm sound, real home-screen widget placement, Samsung keyboard and One UI behavior, and any step that needs a drag.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with rpmctl` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact `rpmctl` command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

Live status as of 2026-10-07: Capture, Today, Blocks, Task rows and sheet, and Inbox and Trash were driven step by step on the emulator and corrected. Weekly review was partly driven. The other files were written from the app's source and not yet driven; treat their steps as hypotheses, and correct the file when a run disagrees.


- [Capture](./capture.md) covers the Capture sheet: typing, keyless saving, the More menu, History, Context, About, expand, close and voice.
- [Today](./today.md) covers the Today screen: date, next seven days, week line, lead card, Coming up, agenda, completing tasks and the top bar.
- [Blocks](./blocks.md) covers the Blocks list and Block detail: Result and Purpose editing, the Plan, adding and reordering tasks, and marking a Result achieved.
- [Task rows and sheet](./task-sheet.md) covers task rows, the task sheet fields, scheduling, deleting, and quick add through `Add task`.
- [Inbox and Trash](./inbox-trash.md) covers the Inbox, moving tasks into Blocks, Archive, Trash and restoring.
- [Weekly review](./weekly-review.md) covers the four-step review from last week's Results to picking this week's Results.
- [Search](./search.md) covers full-screen search across tasks, Blocks, Projects, Goals and Areas.
- [Projects and Life](./projects-life.md) covers the Projects list and detail, and the Life tab with Vision, Quarter, Month, Values, Areas, Goals and the Wheel of Life.
- [Settings](./settings.md) covers the Settings screen: sounds, widget text size, AI key, backup, diagnostics, theme and About.
- [Home widget](./home-widget.md) covers the widget's Capture pill, mic and planner icon.
- [Floating butterfly](./floating-butterfly.md) covers the overlay butterfly that opens Capture over other apps.
- [Alerts](./alerts.md) covers reminders, ringing alarms, notification permissions and delivery status.
- [Earlier screens](./earlier-screens.md) covers the original native screens reached from Settings.
