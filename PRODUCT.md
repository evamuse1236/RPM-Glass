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

Moved to [docs/product/planner.md](docs/product/planner.md) to keep each file small.

### Capture

Moved to [docs/product/capture.md](docs/product/capture.md) to keep each file small.

### Native companion surfaces

- The generated butterfly remains a 64dp, user-started, draggable launcher over other apps. It hides over RPM's own screens and can be hidden by long press or the visible service notification.
- The native home-screen widget is a capture bar like Google Keep's: the app icon opens the planner, a wide "Capture a thought" pill opens Capture ready to type, and the mic inside it opens Capture already listening (Android's speech recognizer, then the words wait in the field to check). Check-ins and reminders are simply said in Capture. Its colours mirror theme.css in `res/values*/colors.xml`.
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
