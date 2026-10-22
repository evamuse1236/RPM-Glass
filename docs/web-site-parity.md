# Website parity with the phone planner

Source: `.claude/skills/verify-rpm-glass/features/*.md` (inventoried 2026-10-22). Design: `docs/web-site-design.md`.

"Before" is the Site at `e9e6bfb`. "Needs" is what the Site needs under the chosen design (the phone planner running on the Site). Every row that says **planner UI** comes with the shared modules; it still needs its op in the `plan` allowlist, its data in snapshot v2, and a drive check. "Status" names the drive checks that pass, with their screenshot numbers: `NN-<check>-412.png` / `NN-<check>-1280.png` in `.verify/evidence/web-2026-10-22T16-21-31-795Z/` (230 of 230 passed, 1 not run because of the time of day).

All left-out rows, including native surfaces, are owner-approved exclusions as of 2026-10-23. See `docs/web-site-feature-map.md` for the user-facing navigation map and the separate exclusion list. Approval does not change any UNVERIFIED status below.

## Today

| Feature | Before | Needs | Status |
|---|---|---|---|
| Day spine (tasks, events, routines, meals, deadlines, free time, now line) | no (list only) | planner UI; snapshot v2 entries and body || Works: complete-task 03/04 (first view 01) |
| Big date, date picker, week strip with Area dots, jump back to Today | no | planner UI || Works: week-strip-day 17/18, date-picker 21/22, jump-to-today 19/20, today-day 27/28 |
| Week line and lead card open the weekly review | no | planner UI; `weeks`, `reviews` in snapshot || Works: week-line-review 25/26 |
| All-day and undated chips | no | planner UI || Renders; no check of its own (UNVERIFIED) |
| Tick to complete, with Undo; Completed group reopens | yes | `saveTask`, `reopenTask` ops; `undo` command || Works: complete-task 03/04, undo-complete 09/10, reopen-task 06/07 |
| Long-press drag a card to a new time; knurl changes length | no | `saveTask` op || Works: drag-to-time 39/40, knurl-length 36/37 |
| Free time row, "Plan something", gap card "Schedule at" | no | named batch op (was a function commit) || Works: free-time-plan 30/31; gap-schedule-at skips late in the day (passed in `web-2026-10-22T14-46-29-450Z`) |
| Meal rows, swipe right to Log now, Log a meal sheet | no (water only) | body ops (`saveMeal`) || Works: meal-swipe-log-now 236/237, meal-log 239/240 |
| Routine row ticks every step | no | body op (`saveRoutineRun`) || Works: routine-tick 15/16 |
| Water habit circle and Water sheet | glass only | body ops (`drinkWater`, `setWater`, `snoozeWater`) || Works: water-glass 207/208, water-goal 212/213 |
| List layout (lead card, Coming up, Add to today, Agenda) | partly | planner UI; layout kept in the browser || Works: today-list 23/24 |
| Inbox row, Empty day, top bar (Search, Capture, More) | partly | planner UI || Works: inbox-add 62/63, search 134/135; Empty day UNVERIFIED |
| Clash row and Resolve | no | **left out**: needs the phone's calendar || Owner-approved exclusion (2026-10-23) |

## Tasks

| Feature | Before | Needs | Status |
|---|---|---|---|
| Task sheet: title, Must, ring, Notes, Who could help | no | `saveTask` op || Works: task-title 71/72, task-must 65/66, task-notes 68/69; ring and Who could help UNVERIFIED |
| When tab: day circles, No date, time ruler, Pick a time, length | partly (Today/Tomorrow/No date) | `saveTask` op || Works: task-sheet-when 59/60 |
| Start now chip | no | `saveTask` op || Works: start-now 33/34 |
| Alert tab (No alert, Reminder, Ringing alarm, lead time) | no | `saveTask` op; the phone schedules the alert || Works: task-sheet-alert 42/43 |
| Repeat tab (weekdays, Every day, After completion) | no | `saveTask` op || Works: task-sheet-repeat 48/49 |
| Block tab and Move to Block with search | yes | `moveTask` op || Works: task-sheet-block 45/46, inbox-move-to-block 89/90 |
| Duplicate, Archive, Delete to Trash, Undo last completion | Trash only | `saveTask`, `archiveTask` ops || Works: task-duplicate 74/75, task-archive 77/78, delete-task 53/54 |
| Swipe right completes, swipe left schedules, long-press menu | no | planner UI (pointer events work with a mouse) || Works: swipe-complete 80/81, swipe-schedule 83/84, hold-menu-must 86/87 |
| Quick add (title, day, time, estimate, repeat, Block, Must, #Block tag) | no | `saveTask` op (new task) || Works: quick-add 12/13 |
| Ask Capture from a task | no | Site Capture || Works: ask-capture 50/51 |

## Blocks, Inbox, Trash, Archive, Search

| Feature | Before | Needs | Status |
|---|---|---|---|
| Blocks list with next task; Project and Status filters | partly (list only) | planner UI || Works: block-filter-project 130/131, block-filter-status 132/133 |
| New Block; edit Result and Purpose in place; Change Project | no (read only) | `saveEntity` op || Works: new-block 116/117, new-block-title 119/120, block-result 92/93, block-purpose 95/96, change-project 110/111 |
| Plan: add a task, reorder, Sort by time | no | `saveTask`, `reorder`, `sortExisting` ops || Works: plan-add 98/99, plan-reorder 101/102, sort-by-time 104/105 |
| Mark Result achieved with evidence | no | `saveEntity` op || Works: result-achieved 113/114 |
| Notes, Archive Block, Delete Block, Archive sheet Restore | no | `saveEntity`, `archiveBlock`, `removeEntity` ops || Works: block-notes 107/108, archive-block 122/123, delete-block 128/129, archive-restore 125/126 |
| Inbox sheet, Add task in Inbox, Move to a Block | partly | planner UI || Works: inbox-add 62/63, inbox-move-to-block 89/90 |
| Trash sheet with Restore | Trash only (no restore list) | `restoreTask` op || Works: trash-restore 56/57 |
| Search tasks, Blocks, Projects, Goals | no | planner UI (read only) || Works: search 134/135 |
| Sort with Jev, Suggest a Purpose | no | **left out**: model runs on the phone; the Site says so || Owner-approved exclusion (2026-10-23) |

## Projects and Life

| Feature | Before | Needs | Status |
|---|---|---|---|
| Projects list with rings, Area filter, expand to Blocks | no | planner UI || Works: area-filter 136/137, project-expand 138/139 |
| New Project, Project detail, rename, Purpose, link Goal, Add Block | no | `saveEntity` op || Works: new-project 141/142, project-title 144/145, project-purpose 147/148, link-goal 150/151, add-block 153/154 |
| Delete Project, Area or Goal | no | `removeEntity` op || Works: delete-project 156/157; Area and Goal delete UNVERIFIED |
| Life tabs (Vision, Quarter, Month, Values) and period navigation | no | planner UI || Works: life-tabs 158/159, life-period 160/161, life-month 162/163 |
| Wheel of Life drag and Rate your Areas | no | `rateAreas` op || Works: wheel-drag 175/176, life-rating 170/171 |
| Area detail, Goal detail, horizon and year | no | `saveEntity` op || Works: area-detail 167/168, goal-detail 172/173 |
| Core values (Edit values) | no | `context` op || Works: edit-values 165/166 |

## Weekly review

| Feature | Before | Needs | Status |
|---|---|---|---|
| Open from week line, lead card, More options; step bar; Back and Next | no | planner UI; review progress op (was a function commit) || Works: week-line-review 25/26, review-done 204/205 |
| Step 1 verdicts, swipe deck, wins, evidence | no | named review ops || Works: review-verdict 178/179 |
| Unfinished tasks: Carry, Defer, Drop | no | named review ops || Works: review-carry 181/182, review-defer 184/185, review-drop 187/188 |
| Step 2 Empty your head (add to Inbox) | no | `saveTask` op || Works: review-inbox-add 190/191 |
| Step 3 Sort the Inbox into Results | no | `moveTask`, `saveEntity` ops || Works: review-sort 193/194 |
| Step 4 pick Results, Must, Finish | no | named finish op || Works: review-pick 196/197, review-must 199/200, review-finish 202/203 |
| Ask Jev in review | no | **left out**: model runs on the phone || Owner-approved exclusion (2026-10-23) |
| Calendar sections in the review | no | **left out**: needs the phone's calendar || Owner-approved exclusion (2026-10-23) |

## Habits

| Feature | Before | Needs | Status |
|---|---|---|---|
| Habits list | no | planner UI || Works: habits-list 209/210 |
| Water: glasses a day, glass size, reminders, interval, hours | no | `setWater` op || Works: water-goal 212/213; glass size, reminders, interval, hours UNVERIFIED |
| Meals: retime, Show on Today, add or remove a snack, name | no | meal plan op || Works: meal-retime 215/216, meal-show 218/219, add-snack 224/225, remove-snack 227/228; name UNVERIFIED |
| Routine editor, Skip today | no | `saveRoutine`, `skipRoutineDay` ops || Works: routine-new 230/231, skip-today 233/234 |

## Capture

| Feature | Before | Needs | Status |
|---|---|---|---|
| Capture the exact words, filed by the phone | yes | `capture` command || Works: capture 242/243 |
| Capture history with outcomes | no | snapshot `captures` (exists) || Works: capture-history 244/245 |
| Forming cards, questions, receipts with Keep or Undo | no | **left out**: model-backed and live on the phone; the Site shows the phone's receipt after it files || Owner-approved exclusion (2026-10-23) |
| Voice input | no | **left out**: Android speech || Owner-approved exclusion (2026-10-23) |

## Settings

| Feature | Before | Needs | Status |
|---|---|---|---|
| Theme, tab bar transparency | no | planner UI; kept in the browser || Works: theme 246/247, transparency 248/249 |
| About | no | planner UI || Works: about 250/251 |
| Alarm and reminder sounds, notification permissions, exact alarms | no | **left out**: Android settings || Owner-approved exclusion (2026-10-23) |
| Widget text size, floating butterfly, notch | no | **left out**: Android only || Owner-approved exclusion (2026-10-23) |
| AI key, diagnostics pairing, backups, context import and export, Earlier screens | no | **left out**: phone only, by design (no AI credential leaves the phone) || Owner-approved exclusion (2026-10-23) |

## Native surfaces (not planner pages)

The notch, the home-screen widgets, the floating butterfly, alert notifications and the ringing alarm page live on the phone. **Owner-approved exclusion (2026-10-23)**: a browser has no equivalent. Changes made on the Site still reach them through the phone; live native behavior remains UNVERIFIED by the website drive.
