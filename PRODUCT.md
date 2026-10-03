# RPM

<!-- impeccable:product-schema 1 -->

## Platform

android

A desktop HTML companion and CLI remain separately scoped tools.

## Stack

The Android app packages the planner and Capture as trusted offline WebViews. Java owns private storage, Keystore credentials, HTTPS model requests, system insets, the floating butterfly, home-screen widget, notifications, ringing alarms, speech-recognizer handoff, export, and Android settings. The planner reads the shared companion store and uses the existing Java bridge; the WebView assets are generated from `android-companion/` at build time and are not tracked in Git.

The desktop browser companion runs through Node.js with its own visual system and preview-only delivery behavior. Legacy Android screens and their separate SQLite/cloud data remain available under Settings → Earlier RPM screens. Once, on first load, the entries they hold (including everything the old widget saved) are copied into the companion store with their original words, times, Purpose, check-in details and edit reasons; the SQLite file itself is never changed, and its reminders and alarms keep ringing from there rather than being armed twice. Earlier screens entries made after that copy stay in SQLite.

## Users and purpose

RPM is a personal planning and check-in tool that keeps the reason for work visible while the user acts. A task belongs to a Result, the Result has a Purpose, and its ordered tasks form the Plan. The product should help the user move between today's actions, Blocks, Projects, Goals, and Areas without turning planning into a questionnaire or treating completed actions as proof that an outcome was achieved.

Capture turns messy thoughts into tasks and Blocks. The assistant may interpret, ask, and propose, but the user's wording is saved first and canonical planning changes require review.

## Current Android scope (confirmed 2026-09-27)

### Planner

- The planner follows Material 3 as Google's own apps use it (see [DESIGN.md](DESIGN.md)). Four persistent destinations move outward through **Today · Blocks · Projects · Life**. Settings, Search and the weekly review are pushed screens, not extra tabs.
- Today answers, in order: what to do now, what is at risk, and the shape of the day. The date strip runs forward from today for seven days and marks deadline days and calendar-clash days. The lead card is **Do next**: the next task under its Result (title, then Purpose on its own line, then the deadline and its countdown). When there is at least half an hour free before the next timed task or busy event and a Result at risk has nothing planned, the lead card offers that free time instead ("Free until 10:00 AM"): the Result, its undated tasks that fit, and one tap that schedules them back to back into the gap, with Undo (the gap never takes the task that sets the Result's deadline). **At risk** lists, from the data only and soonest first, calendar clashes in the next three days, Results due by the end of the day after tomorrow with nothing planned between today and their deadline, and overdue Results, each in words with one action of the same style, the most urgent strongest (Resolve a clash: choose which overlapping task to move, with Undo, or for events only add a task today to sort it out, since calendars are read-only; Plan today for the Result's first undated task; or Open). Without calendar permission clashes and busy time are simply not checked. Then one planning row: this week's Results (only Results the user marked achieved count as achieved), or "Plan your week"; from Friday to Sunday, while the coming week has no Results, it says that week isn't planned and offers Plan now, which opens the weekly review; a timed "Weekly review" task today becomes that row at its time in the agenda. The rest of the day is one time-ordered agenda: tasks, each naming its Result, and calendar events interleaved, with the free time between them stated. Due soon lists Results due within three days that are not already the lead or a risk; the Inbox row shows the Inbox count. A Result's deadline comes from the planner's data and is never invented. The Must star shows only on Musts, everywhere; Must is set in the task sheet (or, in the weekly review, by tapping the task's row), never by a bare star on a non-Must row (Dara, 2026-10-03). Add task is in Today's top bar (no FAB over the day); the proportional Timeline is a second view of the same day, in More options.
- The weekly review is a four-step route reached from the This week card and the overflow menu: how last week's Results went (Achieved, Partly or Not yet for Results whose deadline has passed or that have none; wins are noticed with an optional line on what made them work; Results still running toward a later deadline are not judged but offered to carry into this week; Carry, Defer or Drop for unfinished tasks), empty your head (type straight into the Inbox, prompted Area by Area if wanted, or open Capture), sort the Inbox (each task gets its Result one at a time: a suggested Result in one tap when the task's words clearly match that Result's title, or Choose from every Result or a new Result with its Purpose), and pick 3 to 5 Results for this week, nearest deadline first whether picked or not. A Result's deadline in the review is its latest open, dated, one-time task. Step 4 checks each picked Result against its own deadline: its Must time, plus the Must time of Results due before it, against the free time from now until that deadline, counted as 8 AM–10 PM minus busy events from the read-only calendar (the review states that assumption), using the same deadline and Must time its card shows. It shows the Must time already on each day and suggests a day for each undated Must of a Result with a deadline (the freest day before it); nothing is dated until the user taps to accept, with Undo. Results due by Sunday that aren't picked are flagged with Pick, and a calendar clash before Sunday appears once, with Add to Today (or Plan today for an Inbox task that already names it); calendars are never written. Without calendar access it says the calendar isn't connected and shows Must time only. Every step can be skipped (Next and Finish only guide, never block), progress is kept, and every change can be undone.
- Only the user marks a Result achieved, from the review or Block detail, with an optional line of evidence. Completing every task does not mark it.
- Blocks present **Result · Purpose · Plan**. Summary cards stay simple; Block detail holds Purpose, ordered Plan tasks, Must, and editing.
- A Result has no separate deadline field (decided 2026-10-03). Its due time is derived: the latest open, dated, one-time task in its Block (`blockDue`), such as "Submit the PDF · Sun 9:00 PM". The planner and weekly review use it to show what is close.
- The Blocks list is one list in order of urgency: Results due within the week ahead (or overdue) first, soonest first, then this week's Results (marked "Picked for this week"), then the rest. Each card has one facts line: its due line, the open Must time (so tonight's load compares across Results) and tasks done; the countdown lives on Block detail. Cards in a row from the same Project sit under one Area and Project line instead of each repeating it; with a Project filter on there is no such line.
- Block detail puts the Purpose under the title, then one row for where the Result stands (the deadline with its countdown, tasks done, and the open Must time), then "Is this Result achieved?" with Mark achieved as its own row, apart from the tick count, so the verdict is never below the Plan. The deadline turns to the error colour, with the countdown in words, when it is overdue or when the open Musts need a quarter or more of the clock time left. Plan order is the user's priority and is never re-sorted on its own. While dated open tasks are out of time order, Sort by time offers one tap that puts them in time order in the places dated tasks held, leaving undated tasks where the user put them, with Undo. Plan drag handles appear only after the Reorder button; Change Plan order in a task's menu stays the accessible path. Tasks are added from the inline "Add a task" row under the Plan; there is no FAB, so nothing covers a row's Must star. Marking or unmarking Must, like every Plan change, offers Undo. Once scrolled, the top bar keeps the title and the deadline line in view.
- Projects summarize linked Blocks without nested card stacks. Life contains Vision, Quarter, Month, and Values, with Areas, Goals, Projects, ratings, and a labelled Wheel of Life.
- Task detail and Quick add keep frequent actions near the keyboard and thumb. Original capture appears when it differs from the task title.
- The vocabulary is binding in UI text: **Area, Goal, Project, Block, Result, Purpose, Plan, Task, Must, No block, Inbox**.

### Capture

- Capture is a Material floating panel (surface container, 28dp corners, elevation, drag handle) over whatever app is open, in the style of Google's assistant overlay. It uses the same theme tokens as the planner in light and dark; there is no glass or aurora light. Original words stay one tap away under Your words; previous responses stay in History.
- The Capture panel spans the screen width with 4dp margins and grows upward inside a stable native WebView to fit the current response. Within one capture (typing, saving, sorting, proposals) it only grows, smoothly, so the composer and the main action never move under the thumb; a shorter state settles just above the actions. The receipt settles to its own height: the panel is anchored at the bottom, so Undo takes Add's place and no empty band is left under the header. It returns to its natural size when Capture is empty again, another view opens or Capture is reopened. Expand uses the available height. Overflow is downward from the response beginning, with actions above the composer. Native system-bar and IME insets keep the composer above the actual keyboard. Android Back closes the topmost menu before the view, and the view before the surface. Dragging the handle down closes the panel.
- The composer is a filled pill field in every state, holding only the words and, at its end, the microphone, which becomes a filled Send button as soon as there is text and stays on the last line as the words grow. More is an accessibly labelled icon button in the header (Android's overflow place), not in the field. Capture opens with the field focused; the field draws no outline or focus ring, as in Gemini. The unsent draft is written to the phone as it is typed. While Capture is empty, one line under the field says "Saved as you type. Added only when you confirm."; it becomes "Draft saved" once the phone confirms the typed words.
- More (dropping from the header) and a 380ms Send hold (rising above the composer) open the same menu. Movement beyond 12px cancels the hold, releasing after activation never sends, and a short tap sends only nonempty text while no request is in flight. More stays usable while a reply is pending.
- The menu keeps About, Assistant settings, Context, History and the two planning starters (What's planned today?, Plan a Result) in a scrollable group and pins Open planner nearest the invoking control (first under More, last above Send). Capture preserves the exact draft before menu navigation and restores it after the Planner round trip; opening either route never sends it.
- The empty view is the field alone, with the reassurance line under it. The planning starters wait in More so nothing competes with typing.
- Sending shows "Saving your words…" until the phone confirms the raw words are stored, then one line, "Your words are saved", that opens to the exact words, a visible indeterminate progress line and one sentence ("Sorting into your plan… You can close this."), while the assistant works. The UI never shows invented progress. There is no "Leave in Inbox" skip during sorting: the request cannot be cancelled cleanly yet, and closing Capture keeps the saved words for a later Retry.
- Voice input uses Android's speech-recognizer handoff when available. It returns only final text, so Capture shows a plain listening state (no live transcript or level meter) and puts the words in the field to check before sending. There is no continuous recording or hidden microphone access.
- Assistant output uses reviewed proposals in one outlined list, one row each, with the same structure in every state: the title with a filled Must star at its end only when it is a Must (the star alone, never the word; other proposals show none) and, when there is more than one proposal, a quiet Leave out button; then the destination ("Block · " and the Block's name with its Result's deadline under it, "Due Mon 5 Oct, 10:30 AM", or "Inbox"), the date ("Sun 4 Oct, 9:00 AM", or "No date" when there is none; none is invented), and what else bears on that time: a busy event in the read-only calendar that overlaps it, in the error colour ("Clashes with DAD exam, 9:00–10:00 AM"), and one counted line for other Results due that day and busy events on the destination Result's due day before it is due ("Sun: 2 other deadlines" over "Mon: 2 events before it's due") that opens to each item with its time and full name. Days are absolute (Today, otherwise weekday, day and month), never "Tomorrow" beside a weekday. Without calendar permission only deadlines are named. There are no include checkboxes: proposals are included by default, so nothing looks like a completed task before it exists. Tapping the destination opens Move to (a plain list with the Inbox first, then open Blocks with their deadlines); tapping the date starts a revision message to change or add the time; tapping the title starts one in Dara's own words. Must is changed in Dara's own words (or later in the task sheet), never by tapping a star. Leave out sets a proposal aside without asking the assistant: the row stays in place, faded, says "Left out · kept in History" and offers Put back; the filled button counts the included ones ("Add 2", "Add 1") and is unavailable with none. Your words sits beside the header. Footer actions are Keep as draft (parks the draft; nothing is added and the words stay in History) and Add, or Keep as draft, Edit and Add for one proposal. Add is atomic for the included proposals; the left-out ones stay in the draft's record and the words stay in History. A question shows tappable answers (Block answers with their Area and Project), "Keep it in the Inbox" when the question is the Block, and the composer accepts an answer in the user's own words. Nothing is written to the Plan without confirmation.
- After Add, the receipt is a short summary rather than a copy of the proposals, so a glance shows the decision is made: how many tasks were added ("2 tasks added", or "1 of 2 tasks added" when some were left out), then one line per added task (its title with the Must star, and "Sun 4 Oct, 9:00 AM · DAD Excel workbook submitted"), with no ticks (or a one-line summary for other changes). Undo is the tonal action and Open in Planner a text button; the panel closes itself after six seconds unless the user touches it or has started typing, and while that countdown runs a quiet line beside Undo shows it ("Closing in 5s"); the countdown is not on Undo because Undo does not expire with the panel. Undo itself works until the next change: reopening Capture shows that receipt, with Undo while it is still the latest change.
- Complete responses reveal once within 220ms. Unchanged phone updates retain existing content and input. Navigation and menus use short, interruptible transitions. Reduced motion removes the progress animation, listening pulse, reveals and menu motion.
- Clear clock ranges show their start, end and locally derived duration before saving. Unresolved ranges, conflicting durations and ambiguous clock changes keep the draft unsaved; editing refreshes the preview. Clock-only corrections retain a saved future day.
- There is no separate importance control or navigation-opacity control. Capture resynchronizes enlarged-text behavior from the effective font scale whenever phone status changes.

### Native companion surfaces

- The generated butterfly remains a 64dp, user-started, draggable launcher over other apps. It hides over RPM's own screens and can be hidden by long press or the visible service notification.
- The native home-screen widget is a four-action Material bar for Check in, Capture, Remind and Open app. Check in, Capture and Remind open the Capture panel; Open app opens the planner. Its colours mirror theme.css in `res/values*/colors.xml`.
- RPM reminders use Android notifications. Ringing alarms use Android scheduling with snooze and dismiss. Permission, battery, DND, and OEM behavior remain Android-controlled.

## Product principles

- Keep original words, interpretations, receipts, and revisions. Distinguish planned minutes from reported actual minutes.
- Show Purpose and Result where the user acts; do not bury them in a detail-only metadata block.
- Keep list screens scannable and place full controls one level down. Never nest cards inside cards.
- Use one term for each concept and one visual meaning for each color.
- Use one **Must** flag. Plan position is the task's priority; do not expose a second priority or importance control.
- Let clear edits apply atomically with Undo. Retain all operations while asking for one missing detail.
- Ask which entry when a name matches more than one. Never invent time, recurrence, evidence, or success.
- Preserve raw capture before model work. A proposal, preview, or completion event does not establish that a Result was achieved.
- Remember only explicit preferences and make them inspectable, correctable, archivable, and restorable.
- Make offline and permission limits visible. A saved task and an externally delivered alert are separate facts.

## Data and compatibility

The shared companion store retains original captures, revisions, conversations, reviewed context, Plans, Blocks, Projects, Goals, Areas, and recovery history. `priority` remains the persisted and API field for a task's order in the Plan so existing Capture, sync, and tool contracts remain compatible; it is not a separate importance level.

The purpose-first migration is lossless and idempotent:

- legacy star or must state becomes the single `must` flag;
- existing priority determines Plan order before time breaks ties;
- a task-level Purpose assigned to a Block moves to Notes so the Block remains the Purpose authority;
- an unassigned task's Purpose remains its optional Why;
- raw wording, schedules, revisions, alerts, and Undo history remain intact;
- `Area.colorIndex` persists identity across sessions and themes;
- existing Area ratings remain; new ratings accept 0–10 in half steps.

## External services and safety boundary

The APK contains no API key or personal history. The user enters an OpenRouter key on the phone, stored with Android Keystore protection. Model requests are bounded, HTTPS-only, and use the selected planning paths; no live model call is required for local planning. Calendar access is read-only and permission-based. Calendar writes, Samsung Clock writes, automatic background imports, and silent plan mutation are outside the current scope.

Desktop companion data can be imported only through the existing explicit backup/review flow; imported alerts stay disarmed until reviewed. The phone companion store does not enter the old Convex outbox. Diagnostic logging is separately connected to the private RPM Convex database. It uploads full app console output (which may include capture content), errors, and operation records, with credential redaction and 14-day retention. Settings provides pause/disconnect controls; diagnostic pairing does not enqueue planner data. See `docs/diagnostic-logging.md` for activation and inspection.

## Separate and historical surfaces

The desktop browser prototype keeps its warm ivory-and-green floating conversation and private test-copy boundary. The butterfly launcher keeps its own contract.

The earlier pixel-garden panel, Frosted Night composition and Capture Glass are historical. The Material redesign (October 2026) replaced them; [DESIGN.md](DESIGN.md) is the visual authority, and the older plans and verification notes under `docs/` describe earlier versions.

## Test boundary

Planner evidence is recorded in [docs/ux-2026-09-26/verification.md](docs/ux-2026-09-26/verification.md). Capture Glass evidence is recorded separately in [docs/capture-glass-verification-2026-09-27.md](docs/capture-glass-verification-2026-09-27.md) and a finish review kept outside Git in `output/capture-glass-2026-09-27/`. The later [Capture response verification](docs/capture-response-verification-2026-09-28.md) records version 0.20 installation on the physical Galaxy S24 FE, native UI checks, data preservation and four live follow-up replays. The [motion verification](docs/motion-verification-2026-09-28.md) records the subsequent 0.21 phone installation and refresh/animation checks. These scoped checks do not imply final human design approval, audible delivery, TalkBack interaction, or live speech quality. Those checks predate the Material redesign, which so far has been checked only in a browser at phone size (light, dark and 200% text) and needs a fresh phone installation check.

No source commit, remote push, publication, personal-phone install, or external integration activation is implied by a built APK.

## Evidence

- [Purpose-first brief](docs/ux-2026-09-26/brief.md)
- [Implementation record](docs/ux-2026-09-26/implementation.md)
- [Verification record](docs/ux-2026-09-26/verification.md)
- [Current planner surface contract](docs/planner-surface-contract.md)
- [Current Capture response contract](docs/capture-response-plan-2026-09-28.md)
- [Earlier Capture Glass plan](docs/capture-glass-plan-2026-09-27.md) (superseded by the Material redesign)
- `cli/` retains the tested capture/edit workflow and synthetic API examples.
- `docs/product-context.md` preserves earlier rationale; conflicting Android implementation statements there are historical.
