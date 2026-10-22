# Website feature map

As of 2026-10-23. The website runs RPM's shared phone planner, with four main destinations: **Today, Blocks, Projects and Life**. Search, typed Capture and More options sit in the top bar. Desktop uses the same planner in a centred column.

This map describes available controls separately from recorded drive coverage. The detailed check names and screenshot numbers are in [Website parity](web-site-parity.md); architecture and sync rules are in [Website design](web-site-design.md) and [Web sync](web-sync.md).

## How changes reach your phone

- Planner edits appear immediately in the browser, with **Waiting for your phone** on affected rows and a count above the planner. The phone remains the only writer of saved planner data.
- A change counts as saved only after the phone applies it and a newer snapshot reaches the browser. Rejected or conflicting changes show a reason. Editing the same record on the phone can cause a conflict.
- Unsent changes survive a reload and retry with the same command ID and body. An offline or force-stopped phone leaves changes waiting. With RPM open, sync is normally about every 20 seconds; background work can take 15 minutes or longer. Capture also waits for the phone's model.
- Undo sends a guarded request to the phone. It cannot replace newer phone edits with an old whole plan. Archive and Trash offer recovery separately.
- Theme, tab bar transparency and Today layout are browser preferences. Navigation, search and filters do not edit the phone's plan.

## Main navigation

| Screen | Available actions | What the recorded drive proved |
|---|---|---|
| **Today** | Browse days with the date picker and week strip; return to Today; switch day/list layout. See scheduled tasks, routines, meals, deadlines, free time and the now line. Complete or reopen tasks with Undo. Hold a timed card to move it; drag its knurl to change length. Use free time to plan a task. Open water, meals, routines or the weekly review. | Day/date navigation, list layout, completion/reopening/Undo, moving time, changing length, free-time planning, water logging, meal logging/swipe and routine ticks. The gap card's **Schedule at** passed in an earlier run and was skipped in the latest run because of the time of day. All-day/undated chips and Empty day remain **UNVERIFIED**. Device calendar events are excluded below. |
| **Blocks** | Filter by Project or Status; create a Block; open its Result, Purpose, Notes and Plan. Add tasks, reorder the Plan or Sort by time; change Project; mark the Result achieved with evidence; archive or delete a Block. | Filters, creation, Result/Purpose/Notes edits, Plan add/reorder/sort, changing Project, recording achievement, archive/delete and restoring from Archive. Completing tasks alone does not mark a Result achieved. |
| **Projects** | Filter by Area; expand a card to its Blocks or open Project detail. Create or rename a Project, edit Purpose, link a Goal, add a Block or delete the Project. Rings show each Block's task completion. | Area filter, expansion, creation, title/Purpose edits, Goal linking, adding a Block and Project deletion. |
| **Life** | Switch Vision, Quarter, Month and Values; browse periods; open Areas and Goals; set Goal horizon/year; drag the Wheel of Life or use Rate your Areas; edit core values. Area and Goal menus also offer deletion. | Tabs/period navigation, Area and Goal details, Wheel drag, Area ratings and core values. Area/Goal deletion remains **UNVERIFIED**. |

The round Add follows the current destination: Add task, New Block, New Project or Add Area. Holding Add opens Capture. Availability of a shared control does not imply that every entry route was separately driven.

## Task sheet and quick add

Open a task from Today, a Block, Inbox or Search. Its sheet opens on **When**, with **Alert, Repeat and Block** alongside it. Changes queue immediately for the phone with Undo.

| Control | Available actions | Drive coverage |
|---|---|---|
| Task details | Edit title, Must and Notes; use the completion ring; record Who could help. | Title, Must and Notes passed. The sheet's ring and Who could help remain **UNVERIFIED**. |
| When | Choose a day or No date, use the time ruler or Pick a time, change length, Start now. | When tab and Start now passed. |
| Alert | Choose No alert, Reminder or Ringing alarm and lead time. | Alert setting passed; actual notification/alarm delivery on the phone is **UNVERIFIED** by this drive. The browser does not ring. |
| Repeat | Choose weekdays, Every day or After completion. | Repeat setting passed. |
| Block | Search and choose a Block, or move to Inbox. | Block tab and Inbox's Move to Block passed. |
| Task actions | Duplicate, Archive, Delete to Trash, Undo last completion, Ask Capture. Swipe right to complete, left to schedule, or hold for the menu. | Duplicate/archive/delete, swipes, hold-menu Must and opening Ask Capture passed. Undo last completion has no separate named check: **UNVERIFIED**. Ask Capture opens typed Capture; it does not prove a model response. |
| Quick add | Enter title, day/time, estimate, repeat, Block and Must; use a #Block tag. | Quick add passed; the check is not separate proof of every field combination. |

## More options and supporting screens

| Route | Available actions and sync behavior | Drive coverage |
|---|---|---|
| **Inbox** | Open from More or Today; add an unassigned task and move it to a Block. Edits wait for the phone. | Add and Move to Block passed. |
| **Search** | Search tasks, Blocks, Projects and Goals; open the matching record. Searching itself is read only. | Search passed. |
| **Archive / Trash** | Restore archived records or deleted tasks through the phone, with recovery available from the planner. | Archive restore and Trash task restore passed. |
| **Weekly review** | Open from the week line, lead card or More. Step 1: Achieved/Not yet, wins/evidence, Carry/Defer/Drop unfinished tasks. Step 2: empty your head into Inbox. Step 3: sort Inbox into Results. Step 4: choose Results and Must tasks, then Finish. Back/Next preserve progress through the phone. | Opening from the week line, verdicts, Carry/Defer/Drop, Inbox add/sort, Result picks, Must and Finish/Done passed. This is scoped coverage, not separate proof of every gesture or opening route. |
| **Habits** (Today's More menu) | Edit water goal, glass size, reminders, interval and hours. Retime meals, Show on Today, add/remove a snack or change its name. Create/edit routines and Skip today. Settings and logs wait for the phone; reminder delivery stays on Android. | Habit list, water goal, meal time/visibility, snack add/remove, new routine and Skip today passed. Water glass size/reminders/interval/hours and meal name remain **UNVERIFIED**. |
| **History** (Today's More menu) | Browse logged meals, water and routine runs by day; open a meal for editing/deletion. These are habit records from the snapshot, not private conversation or mutation history. | Present in shared code; no named website drive check: **UNVERIFIED**. |
| **Capture** | Type exact words; Enter sends and Shift+Enter adds a line. The phone files the capture; pending status remains visible. The sheet shows the ten newest captures from the snapshot with receipt lines. An unsent text draft stays in this browser. | Sending Capture and viewing its history passed using a synthetic stand-in model. Live model filing remains **UNVERIFIED**. |
| **Settings** | Choose theme and tab bar transparency locally; view About. Phone-only settings explain where to use them. | Theme persistence, transparency persistence and About passed. |
| **Check for changes / linking** | More → Check for changes polls for updates. A configured private ChatGPT Site opens without a code and keeps its key on the server. Other sessions use the phone's one-use, ten-minute link code and offer Unlink this browser. The phone can revoke sessions. | No-code and code-link flows have drive/test coverage; they do not prove a production connection to a real phone. |

## Owner-approved exclusions

**The owner approved leaving all previously left-out rows out on 2026-10-23.** They are outside the website scope; this approval does not turn an UNVERIFIED feature into a verified one.

| Left out of the website | Where it belongs / boundary |
|---|---|
| Calendar-dependent Clash row and Resolve | Phone calendar access; the browser bridge returns no connected calendar or events. |
| Sort with Jev and Suggest a Purpose | Model tools on the phone. |
| Ask Jev in weekly review | Model tools on the phone. |
| Calendar sections in weekly review | Phone calendar access. |
| Capture forming cards, questions and interactive receipts with Keep/Undo | Live model interaction on the phone. The website's typed Capture and returned receipt lines remain available. |
| Voice input | Android speech on the phone. |
| Alarm/reminder sounds, notification permissions and exact alarms | Android settings. Website task alert choices still sync to the phone. |
| Widget text size, floating butterfly and notch settings | Phone settings and native surfaces. |
| AI key, diagnostics pairing, backups, context import/export and Earlier screens | Phone only; AI credentials stay there. |
| Native notch, home-screen widgets, floating butterfly, alert notifications and ringing alarm page | Phone surfaces. Browser edits can reach them through phone sync; the website drive does not prove their behavior. |

## Evidence boundary

The parity record reports **230 of 230 checks passed, one not run**, with 412px and 1280px screenshots under `.verify/evidence/web-2026-10-22T16-21-31-795Z/`. The time-dependent gap check passed in `.verify/evidence/web-2026-10-22T14-46-29-450Z/`. These are browser drives against a synthetic local stand-in using the phone's command code, not a physical phone installation or a live AI service.

Release check, 2026-10-23: the private Site is deployed at https://rpm-planner.evamuse.chatgpt.site. The physical S24 FE runs `0.33-site-parity` (33), with matching signing and APK checks and its planner file preserved byte for byte. The phone published snapshot v2 and the Site read it successfully without a link code. See [release evidence](web-site-release-2026-10-23.md).

Browser commands applied by the physical phone, the Cloud dialog, model-backed paths, Samsung-specific behavior and actual home-screen widget placement remain **UNVERIFIED**. No test command was sent to the owner's real planner; command effects retain the synthetic stand-in evidence above.
