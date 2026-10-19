# Map: RPM fits my whole day

Label: wayfinder:map · Tracker: local markdown (tickets in `tickets/`, one file each; `Status`, `Assignee` and `Blocked by` lines at the top)

## Destination

A spec, ready to hand to builders piece by piece, for an RPM that covers the whole day: one master plan that coding agents, Google Calendar/Tasks, the LMS, health routines, a notch on the phone, and an always-on agent all read and change.

## Notes

- Domain: personal planning. Vocabulary lives in `CONTEXT.md`; product rules in `PRODUCT.md`. New terms so far: RPM calendar, Agent change.
- Skills: `grilling` + `domain-modeling` for grilling tickets, `prototype` for prototypes, `research` for research, `good-css` + `frontend-design` for any notch design, `vm` for VM work.
- Settled while charting (2026-10-18):
  - Convex is the master copy; the phone keeps an offline copy. (ADR candidate.)
  - RPM owns tasks. An "RPM" Google calendar and an "RPM" task list sync both ways; the latest edit wins and the other version stays in History with Undo. Other calendars stay read-only calendar commitments.
  - RPM rings reminders; the Google copy is silent.
  - LMS deadlines come through the evams project. Research questions are RPM tasks that link to a note path in `C:\Repos\personal\second-brain`.
  - Health in scope: Routines (a named, repeating list of steps, not a Block), water reminders from the phone, meal log (name + time; pick a recent meal or type one). Meal choice is based on a diet goal and budget.
  - Notch: black by default, current task with a symbol on one side, colour signals a change (blue = water). Expanded: next 3 tasks, log a meal, quick capture, ask the agent.
  - Always-on agent on the VM, reached by Telegram. It may change the plan without asking; every Agent change is logged with its reason and can be undone. The agent is Pi (verified on the VM); PicoClaw stays the fallback.
- Standing preference: skipped questions take the recommended answer.
- Execution override (2026-10-18): the user asked to start building what is already decided. Build work happens on separate branches/worktrees as prototypes; nothing ships, merges or installs without the user. Progress: `afk-log.md`.

## Decisions so far

<!-- one line per closed ticket -->

- [What deadline data can evams hand to RPM?](tickets/03-evams-deadline-shape.md): a public JSON feed with stable IDs and IST deadlines, ~6 h fresh; RPM can pull it with no evams change.
- [How do Google Calendar and Google Tasks sync both ways with Convex?](tickets/02-google-sync-mechanics.md): Calendar pushes changes, Tasks must be polled; Tasks keeps dates but not times; OAuth must be production-unverified.
- [Can an agent loop run on the small VM, fast enough?](tickets/01-vm-agent-loop-test.md): yes; Pi + Claude Haiku finished 3 of 3 runs at ~120 MB peak, 11–16 s per 5-step task, nearly all model time. grokbot was checked and rejected.
- [Get Oracle's free Ampere A1 VM](tickets/09-bigger-free-vm.md): not needed; the small VM is enough for now.
- [What exactly are Routines, water reminders and the meal log?](tickets/08-routines-and-meal-log.md): Routines run in fixed windows with tick-off steps; water every 90 min with one-tap glasses; meals logged in one tap from recent favourites; agent estimates kept apart as guesses.
- [How does Pi on the VM talk over Telegram and call RPM tools?](tickets/17-pi-telegram-and-tools.md): a small Node bridge long-polls Telegram and drives Pi in RPC mode; RPM tools come in as a Pi extension; ~180 MB.
- [Read and compare the evams deadline feed](tickets/13-evams-adapter.md): built on a branch; 30 tests pass; live feed has 41 assessments, 11 without a clock time.
- [Build the Telegram bridge for Pi](tickets/18-telegram-bridge.md): built on a branch, 24 tests pass; waits for your bot token and chat ID to go live.
- [Who does RPM's thinking: parsing, sorting and planning?](tickets/20-pi-is-rpms-brain.md): Pi on the phone, not OpenRouter models; it can call Opus or Codex for harder jobs (your decision).
- [Does Capture change the plan by itself, or ask first?](tickets/23-capture-acts-then-confirms.md): by itself; edits, moves and deletes apply, then show Keep or Undo (your decision).
- [Which model answers, and what may it see?](tickets/24-ai-models-and-data.md): Haiku 5.5 for everyday work, Sonnet 5.5 high for hard questions; it may see health and food data (your decision).

## Not yet specified

- Health Connect data (sleep, steps, workouts): what it should feed once meal and water logs exist.
- What the agent does on a schedule (morning briefing? weekly review prep? nutrition estimates from the meal log?).
- Where deep planning (weekly review, Blocks, Purposes) happens on the laptop: through the coding agents only, or a view of its own.

## Out of scope

- Ordering meals and paying from the agent: tracking comes first; ordering needs meal history to make sense. (Ruled out while charting, 2026-10-18.)
