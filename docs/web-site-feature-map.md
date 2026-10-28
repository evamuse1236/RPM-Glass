# Website feature map

As of 2026-10-28. The website runs RPM's shared phone planner, with four main destinations: **Today, Blocks, Projects and Life**. Search, typed Capture and More options sit in the top bar. From 1080px wide the website switches to a desktop layout with a sidebar and an inline task pane (see Wide desktop layout below).

This map describes available controls separately from recorded drive coverage. The detailed check names and screenshot numbers are in [Website parity](web-site-parity.md); architecture and sync rules are in [Website design](web-site-design.md) and [Web sync](web-sync.md).

## How changes reach your phone

- The server is the hub. The website saves each change on the server (`convex/plannerWrite.ts`). The phone keeps its own full copy that works offline and syncs both ways. How the physical phone behaves under this model is **UNVERIFIED**.
- A changed row shows **Saving** until the server answers and a newer snapshot holds the change. A note above the planner counts changes "not saved yet".
- A refused change shows its reason on the row.
- Unsent changes survive a reload and a network failure. The website resends them with the same command ID and body.
- Typed Capture on the website saves your exact words first. Then the server runs Capture and the note shows its progress. Capture typed on the phone still runs on the phone.
- The phone can be offline or closed and the website still saves. The phone catches up when it syncs. With RPM open it syncs on open, every 20 seconds, and one second after a saved change. In the background Android runs it about every 15 minutes, or later under battery limits. Open-app timing and the background run are **UNVERIFIED** on the physical phone.
- When the phone and the website change the same part of a record, the newer change wins. The other version goes into the task's notes, and the website shows a note you can dismiss. A phone title and a website note on the same task both survive. `rpmctl scenario web-sync-offline` is the named drive for this on the real app; no passing run is recorded here, so treat it as **UNVERIFIED**.
- Undo reverses one website change. If a later edit touched the same records, Undo answers "This changed since; Undo it on the phone after reviewing." Archive and Trash offer recovery separately.
- Theme, tab bar transparency and Today layout are browser preferences. Navigation, search and filters do not edit your plan.

## Main navigation

| Screen | Available actions | What the recorded drive proved |
|---|---|---|
| **Today** | Browse days with the date picker and week strip; return to Today; switch day/list layout. See scheduled tasks, routines, meals, deadlines, free time and the now line. Complete or reopen tasks with Undo. Hold a timed card to move it; drag its knurl to change length. Use free time to plan a task. Open water, meals, routines or the weekly review. | Day/date navigation, list layout, completion/reopening/Undo, moving time, changing length, free-time planning, water logging, meal logging/swipe and routine ticks. The gap card's **Schedule at** passed in an earlier run and was skipped in the latest run because of the time of day. All-day/undated chips and Empty day remain **UNVERIFIED**. Device calendar events are excluded below. |
| **Blocks** | Filter by Project or Status; create a Block; open its Result, Purpose, Notes and Plan. Add tasks, reorder the Plan or Sort by time; change Project; mark the Result achieved with evidence; archive or delete a Block. | Filters, creation, Result/Purpose/Notes edits, Plan add/reorder/sort, changing Project, recording achievement, archive/delete and restoring from Archive. Completing tasks alone does not mark a Result achieved. |
| **Projects** | Filter by Area; expand a card to its Blocks or open Project detail. Create or rename a Project, edit Purpose, link a Goal, add a Block or delete the Project. Rings show each Block's task completion. | Area filter, expansion, creation, title/Purpose edits, Goal linking, adding a Block and Project deletion. |
| **Life** | Switch Vision, Quarter, Month and Values; browse periods; open Areas and Goals; set Goal horizon/year; drag the Wheel of Life or use Rate your Areas; edit core values. Area and Goal menus also offer deletion. | Tabs/period navigation, Area and Goal details, Wheel drag, Area ratings and core values. Area/Goal deletion remains **UNVERIFIED**. |

The round Add follows the current destination: Add task, New Block, New Project or Add Area. Holding Add opens Capture. Availability of a shared control does not imply that every entry route was separately driven.

## Task sheet and quick add

Open a task from Today, a Block, Inbox or Search. Its sheet opens on **When**, with **Alert, Repeat and Block** alongside it. Changes save on the server at once, with Undo.

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

## Changes since 2026-10-23

All items here are **UNVERIFIED** on the physical phone and the live Site. Each commit named its own test file; those tests pass in `npm test`, but they do not prove the screen.

### Wide desktop layout (1080px and up)

| Change | What you see | Check named by the commit |
|---|---|---|
| Sidebar and inline task pane (de6f201, 84ed0c9) | A slim sidebar replaces the tab bar. A task opens in a pane beside the page, with its icons on one row above a full-width title. The sync note is a small chip at the sidebar foot. | `web/app/desktop.test.mjs`, `web/app/task-pane.test.mjs` |
| Today agenda (3432a7c, cabedec, 4a1995a) | Today is an agenda timeline that fills the window. Each row has one marker on the rail and shows its time once, in the gutter. Meals no longer say "Not logged". Done tasks grey and strike through. | `web/app/agenda.test.mjs`, `android-companion/spine-view.test.mjs` |
| Tomorrow column (d815b3d, 78a984f) | From 1680px, Today's rail has a Tomorrow column; Week skips tomorrow. A section already shown on Today hides. | `web/app/agenda.test.mjs`, `web/app/wide-planner.test.mjs` |
| Wide Blocks, Projects and Life (fe2f40e, 8fba8a7, 4a1995a) | Blocks are one grid of 3 to 4 columns; each card names its Project. Each Project is one full-width card with its Blocks and next task. Life shows the wheel left and each Area with its rating and Goals right. | `web/app/wide-pages.test.mjs` |

### Keyboard, hover and right-click

| Change | What you see | Check |
|---|---|---|
| Keyboard shortcuts (126e9ca, 4e494ad) | n new task, / search, c Capture, 1 to 4 tabs, j/k move, x complete, e open, z Undo, ? list, Esc back. Keys in a field, with a modifier, or under a dialog are ignored. | `web/app/shortcuts.test.mjs` |
| Row tools and menu (cbc2933) | Hovering a row shows its tools. Right-click opens the same action list. | `web/app/pointer.test.mjs` |

### Voice (2026-10-28)

| Change | What you see | Check |
|---|---|---|
| Talk to RPM in the Capture sheet (615b053, 5cd2603, 10b9660) | A mic sits beside Send. Listening shows your words and one Stop control. Working shows the change rows. Done shows the receipt, the spoken sentence and one Undo. A failed mic says so and keeps your words as typed Capture. A voice capture says "Words saved", never "Sorting". | `web/app/voice-capture.test.mjs`, `web/app/voice-rows.test.mjs` |
| Token only, no key in the browser (7243628, 4cc230d) | The browser gets a one-use token from the server. No Google key ships in `web/dist` or `web/dist-site`. The mic hides when the server has no key. | `web/build.test.mjs` |
| Phone voice mode (23de70d, 353d076, f4cbc85) | Capture on the phone has a voice mode. Settings holds the Gemini key. A repeated new task is added once per ramble. | `android-companion/voice-client.test.mjs` |

### Server-side Capture and sync

| Change | What you see | Check |
|---|---|---|
| Durable server Capture (607b968, 990d909) | A website Capture runs on the server with atomic receipts and Undo. Words are saved first; outcomes and conflict notes appear in the task notes. | `web/app/capture-notes.test.mjs`, `web/app/conflict-notes.test.mjs` |
| Stale Undo and sync status (a5eee33, bb1d85a) | A stale Undo no longer replays. Undo stays visible after a snackbar hides. The sync status reads honestly. | `web/app/plan-queue.test.mjs` |
| Task IDs (b270b6f, 2582135) | The server and browser number new tasks from 1,000,000,000 up, so they never clash with phone IDs. | `scripts/rules/task-id-range.test.mjs` |

## Owner-approved exclusions

**The owner approved leaving all previously left-out rows out on 2026-10-23.** They are outside the website scope; this approval does not turn an UNVERIFIED feature into a verified one.

| Left out of the website | Where it belongs / boundary |
|---|---|
| Calendar-dependent Clash row and Resolve | Phone calendar access; the browser bridge returns no connected calendar or events. |
| Sort with Jev and Suggest a Purpose | Model tools on the phone. |
| Ask Jev in weekly review | Model tools on the phone. |
| Calendar sections in weekly review | Phone calendar access. |
| Capture forming cards, questions and interactive receipts with Keep/Undo | Live model interaction on the phone. The website's typed Capture and returned receipt lines remain available. |
| Android speech recognition | The phone has its own voice mode in Capture. The website has its own mic (see Voice below). |
| Alarm/reminder sounds, notification permissions and exact alarms | Android settings. Website task alert choices still sync to the phone. |
| Widget text size, floating butterfly and notch settings | Phone settings and native surfaces. |
| AI key, diagnostics pairing, backups, context import/export and Earlier screens | Phone only; AI credentials stay there. |
| Native notch, home-screen widgets, floating butterfly, alert notifications and ringing alarm page | Phone surfaces. Browser edits can reach them through phone sync; the website drive does not prove their behavior. |

## Evidence boundary

The parity record reports **230 of 230 checks passed, one not run**, with 412px and 1280px screenshots under `.verify/evidence/web-2026-10-22T16-21-31-795Z/`. The time-dependent gap check passed in `.verify/evidence/web-2026-10-22T14-46-29-450Z/`. These are browser drives against a synthetic local stand-in using the phone's command code, not a physical phone installation or a live AI service.

Release check, 2026-10-23: the private Site is deployed at https://rpm-planner.evamuse.chatgpt.site. The physical S24 FE runs `0.33-site-parity` (33), with matching signing and APK checks and its planner file preserved byte for byte. The phone published snapshot v2 and the Site read it successfully without a link code. See [release evidence](web-site-release-2026-10-23.md).

Browser commands applied by the physical phone, the Cloud dialog, model-backed paths, Samsung-specific behavior and actual home-screen widget placement remain **UNVERIFIED**. No test command was sent to the owner's real planner; command effects retain the synthetic stand-in evidence above.
