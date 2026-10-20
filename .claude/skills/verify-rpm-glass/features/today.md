# Today

Today is the planner's home screen. It opens on the **spine**: the whole day in time order on one line, at now. Above it are the date line (sticky), the next seven days, one line about the week's plan, and one chip line for all-day events. Tasks, events, Routines, water, meals, free time and now each have a row. Tasks dated for the day without a time are one **Anytime** group of cards right after now (first on another day); check it shows a task saved with a day and no time. Ticking a task completes it with Undo. The older list layout (lead card, Coming up, agenda) is under More options, `Show list`.

## Sub-features

- `today-header` shows the heading `Today` and the date button.
- `today-date-picker` opens a date chooser to jump to another day.
- `today-week-strip` shows the next seven days and switches the day.
- `today-week-line` shows whether the week is planned and opens the weekly review.
- `today-lead-card` shows the task to do now with its Result, Purpose and a complete checkbox.
- `today-coming-up` lists deadlines and clashes in the next three days, with `Add to today` rows.
- `today-agenda` lists the rest of the day in time order.
- `today-complete` ticks a task, with a snackbar and Undo, and moves it under `Completed`.
- `today-inbox-row` shows the Inbox count and opens the Inbox.
- `today-topbar` offers `Search`, `Capture`, `Add task` and `More options`.
- `today-spine` shows the day by time: cards, free time with +, water and meal rows, and the now hero or now line.
- `today-now-button` floats while now is out of view and scrolls back to it.
- `today-layout` switches between the spine (`Show day`) and the list (`Show list`).
- `today-empty` shows the empty-day state.

## How to get to it (user POV)

- Open the planner. Today is the first screen.
- Tap the `Today` button in the bottom navigation bar.
- Close any detail screen with `Back` until the root screen shows.
- Finish or close the weekly review (it returns to Today).

## Driving it with rpmctl

Preconditions:

- After `rpmctl launch`, run `export RPMCTL_OWNER=<owner from launch>` in this agent's shell (PowerShell: `$env:RPMCTL_OWNER = '<owner from launch>'`). Keep it set through cleanup.

- Baseline state, seeded today.
- `rpmctl open planner` has been run. The heading `Today` is on screen and the `Today` nav button is `aria-current=page`.

- **Header.** Run `rpmctl ui`. The heading is `Today`. A button named `Choose date, <weekday>, <month> <day>` shows today's date, for example `Choose date, Wednesday, October 7`. Run `rpmctl shot today-top`.
- **Top bar.** The buttons `Search`, `Capture` (drawn as a microphone), `Add task` and `More options` are in the top bar. The bottom nav has buttons `Today`, `Blocks`, `Projects`, `Life`.
- **Week strip.** The group `Next seven days` holds seven day buttons with names like `Thu, Oct 8, 2 Results due`. The current day is `Wed, Oct 7, today` with `aria-pressed=true`. Run `rpmctl tap --role button --name "Thu, Oct 8"`. The date button now reads `Choose date, Thursday, October 8`, a `Today` jump-back button appears, and the list changes to that day's tasks under a heading `Tomorrow`. The big heading stays `Today`. Run `rpmctl tap --role button --name "Today"` to return.
- **Date picker.** Run `rpmctl tap --role button --name "Choose date"`. A dialog `Go to date` opens with a field `Date`, a button `Calendars · Not connected`, `Show list`, `Today` and `Go`. Tapping the field opens Android's calendar. Run `rpmctl tap --native "28 October 2026"`, then `rpmctl tap --native "SET"`. The field reads `2026-10-28`. Run `rpmctl tap --role button --name "Go"`. Today shows that day. Close the dialog without choosing with `rpmctl tap --role button --name "Close"`.
- **Week line.** With no week planned the line is a button named `This week isn't planned, pick 3 to 5 Results. Open weekly review`. Run `rpmctl tap --name "Open weekly review"`. The weekly review opens with `Step 1 of 4: Last week's Results` current (see the weekly review file). `rpmctl key back` returns to Today.
- The **Lead card**, **Coming up**, **Agenda** and **Complete a task** steps run in the list layout: choose `Show list` in More options first.
- **Lead card.** A card shows what to do now. Its first line depends on the time of day. Seeded in the evening it reads `Free until 10:00 PM`, then the Block, its Purpose, a checkbox `Mark Check the upload format on the LMS complete` and a button `Schedule Check the upload format on the LMS for 8:15 – 8:25 PM`. Earlier in the day it shows the nearest scheduled task instead. Run `rpmctl shot today-lead`.
- **Coming up.** Below, the heading `Coming up` with `Next 3 days` and a region `Deadlines and clashes`. Rows are Blocks with due dates, for example `DAD Excel workbook submitted. Due Fri 10:30 AM · in 38 h. 3 tasks left, not scheduled yet. Open Block`. Only rows with unscheduled work carry a button `Add to today`. Scroll down first (`rpmctl scroll down`) so the button is not under the nav bar, then run `rpmctl tap --role button --name "Add to today"`. A snackbar reads `Build the three charts for the DAD workbook added to Today` with `Undo`. The task appears under `Later today` and `plannedDate` in `entries` becomes today's date.
- **Agenda.** Task rows show a checkbox `Mark <title> complete` and a button `<title>, <time line>, part of <Block>[, Must]`. Seeded in the evening, `Finish my section of the critical review` (10:00 AM), `Group call: merge sections` (4:00 PM) and `Weekly review` (7:30 PM) show as `Overdue` under a heading `Later today`.
- **Complete a task.** Run `rpmctl tap --role checkbox --name "Mark Group call: merge sections complete"`. A snackbar reads `Task completed` with an `Undo` button, and the row moves into a collapsed `Completed (1)` group. Run `rpmctl shot today-task-completed` right away.
- **Complete readback.** Run `rpmctl state files/companion.json` and find the entry in `entries` titled `Group call: merge sections`. It now has `state` `done`, `done` true and a `completedAt` time. Run `rpmctl tap --role button --name "Undo"` straight after the tick (the snackbar lasts 6 s) and read again: `state` is `active`, `done` false, `completedAt` null, and the snackbar reads `Change undone`. Expanding `Completed (1)` and ticking the row (`Mark ... incomplete`) also reopens it.
- **Inbox row.** Run `rpmctl scroll down`. A button named `Inbox, 6 tasks not in a Block yet` is at the bottom. Run `rpmctl tap --name "Inbox, 6 tasks"`. A sheet `Inbox` opens (see the Inbox and Trash file). `rpmctl key back` closes it.
- **More options.** Run `rpmctl tap --role button --name "More options"`. A menu lists `Weekly review`, `Inbox`, `Show list`, `Habits`, `History`, `Calendars`, `Archive`, `Trash`, `Settings` and `Component gallery`. Close with `rpmctl key back`.
- **Spine.** Today opens with now about 160 px below the top: either the task or event in progress (tinted, `Now · until <time>`, a bar with `<n> min in` and `<n> min left`) or a row `Now, <time>`. Seeded, the day holds `Morning routine` (`3 of 5 · 1 skipped`), `Breakfast · Poha and tea`, free-time rows such as `1 h 20 min free`, `Water · 3 of 8` with a button `Log a glass of water`, `Lunch · Not logged` with `Log it`, and `Call the bank about the fee refund` reading `Clash with RM Session 4 (Section A)` with `Resolve` when calendar access exists. Run `rpmctl shot today-spine`.
- **Body rows.** Tap `Log a glass of water`: a snackbar reads `Glass logged · 4 of 8` with `Undo`. Tap the checkbox `Morning routine, mark every step done`: the card ticks and a snackbar reads `Morning routine done` with `Undo`. Tap `Log dinner`: the meal sheet opens on Dinner. Read back `planner.body` with `rpmctl state files/companion.json` (shape: `docs/body-data.md`). A long press on the water, a meal or a routine row opens its editor (see the Habits file).
- **Now button.** Scroll up to the morning. A floating button `Go to now` appears; tapping it scrolls back to now.
- **Layout.** In More options choose `Show list`. Today switches to the list layout; the menu then offers `Show day`.
- **Empty day.** Open a day with nothing planned, for example Thursday October 29 through the date picker and the week strip (October 28 is not empty because of the weekly task). The screen shows `Nothing planned for this day`, `Start with a Result that matters, then choose its first task.`, and buttons `Plan a Block` and `Add a task`.
- **Swipe days.** Swiping the page sideways to change the day is **UNVERIFIED**. The page has no sideways swipe target in the accessibility tree to aim at. Use the week strip as the verified alternative.
- **Errors.** Run `rpmctl logs --errors`. The Chromium and graphics lines (`page_load_metrics`, `MESA`, `ashmem`) are emulator noise, not page errors.

## Gotchas

- Sample dates are relative to the moment you seed. The lead card and `Coming up` depend on the time of day. After 10:00 AM the seeded morning tasks already show `Overdue`.
- The names of the week-strip buttons carry counts such as `2 Results due`. Match by the date prefix.
- The snackbar for a tick lasts 6 s, and each rpmctl call takes a few seconds. Chain the tick and `Undo` in one shell line, and read the snackbar with `rpmctl eval 'document.querySelector("[role=status]").textContent'` straight after the tap.
- Right after a tick the row sits in the `Completed (1)` group, collapsed.
- `Today` matches the nav button, the heading and the jump-back button. Pass `--role button`. `rpmctl open planner` keeps the last chosen day, so reseed or jump back first.
- `Add to today` can sit under the bottom nav bar. If a tap lands on `Life` instead, scroll down first.
- Calendar rows need calendar access, which the emulator lacks. `Calendars` reads `Not connected`. Do not treat this as a failure.
- Ticking a task changes saved data. Reseed afterwards.
- Known bug as of 2026-10-07: seeded in the evening, tasks marked `Overdue` sit under the heading `Later today`, which promises something that is not true. Evidence: `.verify/evidence/2026-10-07T13-37-30/70-today-scrolled.png`.
