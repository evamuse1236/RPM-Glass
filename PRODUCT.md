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
- Today opens with a "This week" card showing the Results chosen in the weekly review and their progress, or "Plan your week" when none are chosen. The day's tasks are grouped by Result with the Purpose under each title; tasks with no Block sit under No block. The proportional Timeline is a second view of the same day.
- The weekly review is a four-step route reached from the This week card and the overflow menu: how last week's Results went (Achieved, Partly or Not yet; wins are noticed with an optional line on what made them work; a live Result can be carried into this week; Carry, Defer or Drop for unfinished tasks), empty your head (type straight into the Inbox, or open Capture), group Inbox tasks into Blocks (select several and add them to a Result, or start a new Result with its Purpose), and pick 3 to 5 Results for this week, nearest deadline first, with Must time against planned time and against each deadline. A Result's deadline in the review is its latest open, dated, one-time task; calendar free time is not counted. Every step can be skipped (Next and Finish only guide, never block), progress is kept, and every change can be undone.
- Only the user marks a Result achieved, from the review or Block detail, with an optional line of evidence. Completing every task does not mark it.
- Blocks present **Result · Purpose · Plan**. Summary cards stay simple; Block detail holds Purpose, ordered Plan tasks, Must, and editing.
- A Block may carry an optional **Due** date (and time) for its Result, set by the user. It is when the Result has to be true, separate from any task's scheduled time, and the planner and weekly review use it to show what is close.
- Projects summarize linked Blocks without nested card stacks. Life contains Vision, Quarter, Month, and Values, with Areas, Goals, Projects, ratings, and a labelled Wheel of Life.
- Task detail and Quick add keep frequent actions near the keyboard and thumb. Original capture appears when it differs from the task title.
- The vocabulary is binding in UI text: **Area, Goal, Project, Block, Result, Purpose, Plan, Task, Must, No block, Inbox**.

### Capture

- Capture is a Material floating panel (surface container, 28dp corners, elevation, drag handle) over whatever app is open, in the style of Google's assistant overlay. It uses the same theme tokens as the planner in light and dark; there is no glass or aurora light. Original words stay in Details; previous responses stay in History.
- The Capture panel spans the screen width with 4dp margins and grows upward inside a stable native WebView to fit the current response, then shrinks for shorter responses. Expand uses the available height. Overflow is downward from the response beginning, with actions above the composer. Native system-bar and IME insets keep the composer above the actual keyboard. Android Back closes the topmost menu before the view, and the view before the surface. Dragging the handle down closes the panel.
- The composer is a filled pill field: one line when empty, growing with text. An accessibly labelled More icon button sits at its start; the microphone becomes a filled Send button as soon as there is text.
- More and a 380ms Send hold open the same menu. Movement beyond 12px cancels the hold, releasing after activation never sends, and a short tap sends only nonempty text while no request is in flight. More stays usable while a reply is pending.
- The menu keeps About, Assistant settings, Context, and History in a scrollable group and pins Open planner nearest the invoking controls. Capture preserves the exact draft before menu navigation and restores it after the Planner round trip; opening either route never sends it.
- The empty view explains the job and offers three starter chips. The greeting and starters disappear while typing, waiting and during failure recovery, then return only when Capture is truly empty.
- Sending shows "Saving your words" until the phone confirms the raw words are stored, then "Your words are saved" with the exact words and an indeterminate progress area while the assistant works. The UI never shows invented progress. There is no "Leave in Inbox" skip during sorting: the request cannot be cancelled cleanly yet, and closing Capture keeps the saved words for a later Retry.
- Voice input uses Android's speech-recognizer handoff when available. It returns only final text, so Capture shows a plain listening state (no live transcript or level meter) and puts the words in the field to check before sending. There is no continuous recording or hidden microphone access.
- Assistant output uses reviewed proposals. Each shows its title, destination (Block, or Inbox · No block), date and time chips and a Must star; multi-proposal cards have Edit and Remove in an overflow that starts a revision message. Footer actions are Dismiss and an atomic Add all, or Dismiss, Edit and Add for one proposal. A question shows tappable answers (Block answers with their Area and Project), "Keep it in the Inbox" when the question is the Block, and the composer accepts an answer in the user's own words. Nothing is written to the Plan without confirmation.
- After Add, a compact receipt says what went where, with Undo and Open in Planner, and the panel closes itself after six seconds unless the user touches it or has started typing. Reopening Capture shows that receipt, with Undo while it is still the latest change.
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
