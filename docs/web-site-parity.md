# Website parity with the phone planner

Source: `.claude/skills/verify-rpm-glass/features/*.md` (inventoried 2026-10-22). Design: `docs/web-site-design.md`.

"Before" is the Site at `e9e6bfb`. "Needs" is what the Site needs under the chosen design (the phone planner running on the Site). Every row that says **planner UI** comes with the shared modules; it still needs its op in the `plan` allowlist, its data in snapshot v2, and a drive check. "Status" is filled in by `npm run web:drive` evidence.

Left-out rows are proposals until the owner agrees.

## Today

| Feature | Before | Needs | Status |
|---|---|---|---|
| Day spine (tasks, events, routines, meals, deadlines, free time, now line) | no (list only) | planner UI; snapshot v2 entries and body | |
| Big date, date picker, week strip with Area dots, jump back to Today | no | planner UI | |
| Week line and lead card open the weekly review | no | planner UI; `weeks`, `reviews` in snapshot | |
| All-day and undated chips | no | planner UI | |
| Tick to complete, with Undo; Completed group reopens | yes | `saveTask`, `reopenTask` ops; `undo` command | |
| Long-press drag a card to a new time; knurl changes length | no | `saveTask` op | |
| Free time row, "Plan something", gap card "Schedule at" | no | named batch op (was a function commit) | |
| Meal rows, swipe right to Log now, Log a meal sheet | no (water only) | body ops (`saveMeal`) | |
| Routine row ticks every step | no | body op (`saveRoutineRun`) | |
| Water habit circle and Water sheet | glass only | body ops (`drinkWater`, `setWater`, `snoozeWater`) | |
| List layout (lead card, Coming up, Add to today, Agenda) | partly | planner UI; layout kept in the browser | |
| Inbox row, Empty day, top bar (Search, Capture, More) | partly | planner UI | |
| Clash row and Resolve | no | **left out**: needs the phone's calendar | |

## Tasks

| Feature | Before | Needs | Status |
|---|---|---|---|
| Task sheet: title, Must, ring, Notes, Who could help | no | `saveTask` op | |
| When tab: day circles, No date, time ruler, Pick a time, length | partly (Today/Tomorrow/No date) | `saveTask` op | |
| Start now chip | no | `saveTask` op | |
| Alert tab (No alert, Reminder, Ringing alarm, lead time) | no | `saveTask` op; the phone schedules the alert | |
| Repeat tab (weekdays, Every day, After completion) | no | `saveTask` op | |
| Block tab and Move to Block with search | yes | `moveTask` op | |
| Duplicate, Archive, Delete to Trash, Undo last completion | Trash only | `saveTask`, `archiveTask` ops | |
| Swipe right completes, swipe left schedules, long-press menu | no | planner UI (pointer events work with a mouse) | |
| Quick add (title, day, time, estimate, repeat, Block, Must, #Block tag) | no | `saveTask` op (new task) | |
| Ask Capture from a task | no | Site Capture | |

## Blocks, Inbox, Trash, Archive, Search

| Feature | Before | Needs | Status |
|---|---|---|---|
| Blocks list with next task; Project and Status filters | partly (list only) | planner UI | |
| New Block; edit Result and Purpose in place; Change Project | no (read only) | `saveEntity` op | |
| Plan: add a task, reorder, Sort by time | no | `saveTask`, `reorder`, `sortExisting` ops | |
| Mark Result achieved with evidence | no | `saveEntity` op | |
| Notes, Archive Block, Delete Block, Archive sheet Restore | no | `saveEntity`, `archiveBlock`, `removeEntity` ops | |
| Inbox sheet, Add task in Inbox, Move to a Block | partly | planner UI | |
| Trash sheet with Restore | Trash only (no restore list) | `restoreTask` op | |
| Search tasks, Blocks, Projects, Goals | no | planner UI (read only) | |
| Sort with Jev, Suggest a Purpose | no | **left out**: model runs on the phone; the Site says so | |

## Projects and Life

| Feature | Before | Needs | Status |
|---|---|---|---|
| Projects list with rings, Area filter, expand to Blocks | no | planner UI | |
| New Project, Project detail, rename, Purpose, link Goal, Add Block | no | `saveEntity` op | |
| Delete Project, Area or Goal | no | `removeEntity` op | |
| Life tabs (Vision, Quarter, Month, Values) and period navigation | no | planner UI | |
| Wheel of Life drag and Rate your Areas | no | `rateAreas` op | |
| Area detail, Goal detail, horizon and year | no | `saveEntity` op | |
| Core values (Edit values) | no | `context` op | |

## Weekly review

| Feature | Before | Needs | Status |
|---|---|---|---|
| Open from week line, lead card, More options; step bar; Back and Next | no | planner UI; review progress op (was a function commit) | |
| Step 1 verdicts, swipe deck, wins, evidence | no | named review ops | |
| Unfinished tasks: Carry, Defer, Drop | no | named review ops | |
| Step 2 Empty your head (add to Inbox) | no | `saveTask` op | |
| Step 3 Sort the Inbox into Results | no | `moveTask`, `saveEntity` ops | |
| Step 4 pick Results, Must, Finish | no | named finish op | |
| Ask Jev in review | no | **left out**: model runs on the phone | |
| Calendar sections in the review | no | **left out**: needs the phone's calendar | |

## Habits

| Feature | Before | Needs | Status |
|---|---|---|---|
| Habits list | no | planner UI | |
| Water: glasses a day, glass size, reminders, interval, hours | no | `setWater` op | |
| Meals: retime, Show on Today, add or remove a snack, name | no | meal plan op | |
| Routine editor, Skip today | no | `saveRoutine`, `skipRoutineDay` ops | |

## Capture

| Feature | Before | Needs | Status |
|---|---|---|---|
| Capture the exact words, filed by the phone | yes | `capture` command | |
| Capture history with outcomes | no | snapshot `captures` (exists) | |
| Forming cards, questions, receipts with Keep or Undo | no | **left out**: model-backed and live on the phone; the Site shows the phone's receipt after it files | |
| Voice input | no | **left out**: Android speech | |

## Settings

| Feature | Before | Needs | Status |
|---|---|---|---|
| Theme, tab bar transparency | no | planner UI; kept in the browser | |
| About | no | planner UI | |
| Alarm and reminder sounds, notification permissions, exact alarms | no | **left out**: Android settings | |
| Widget text size, floating butterfly, notch | no | **left out**: Android only | |
| AI key, diagnostics pairing, backups, context import and export, Earlier screens | no | **left out**: phone only, by design (no AI credential leaves the phone) | |

## Native surfaces (not planner pages)

The notch, the home-screen widgets, the floating butterfly, alert notifications and the ringing alarm page live on the phone. **Left out**: a browser has no equivalent. Changes made on the Site still reach them through the phone.
