# Backlog

## 2026-10-18 · RPM that fits the whole day, not just the phone

RPM feels like an island. Most of the day is spent in Claude Code and Codex on the laptop. Research questions and their notes live in a different project. Reminders come from Google Calendar, and the LMS and school calendar never reach RPM.

The goal is to merge and remove, not add. The phone becomes a quick remote: capture, schedule, glance at today. Deeper planning (weekly review, Blocks, Purposes) happens on the laptop, next to the coding agents.

Open questions:
- Should the laptop side be its own app, or a tool the coding agents can call (CLI or MCP server on the existing Convex data)?
- Should Google Calendar become the one place for reminders, with RPM writing dated tasks into it? Calendar writes are out of scope in PRODUCT.md today.
- Can LMS deadlines arrive through Google Calendar (iCal feed) instead of a separate integration?
- Should a research question live in RPM only as a task that links to its note in the second brain?

## 2026-10-18 · Google Calendar, Google Tasks and health data

Dara wants Google Calendar and Google Tasks connected both ways, and the RPM AI running on the Oracle VM. They also asked about syncing Google health data (sleep, steps, workouts).

Open questions:
- Health data on Android lives in Health Connect, which only an app on the phone can read. Does RPM read it on the phone and send a summary up?
- What should health data change in the plan: lighter days after bad sleep, or just a line in the weekly review?

## 2026-10-18 · A notch like Apple's Dynamic Island

A small pill at the top of the phone that expands. Collapsed, it shows the next task or reminder; it turns blue for a water reminder. Expanded, it shows tasks, reminders, and quick actions such as logging a meal (pick from options or type your own). It acts as a time agent and secretary. The VM agent later reads the meal log.

Open questions:
- What Android allows: an overlay at the camera cutout, or Android 16 Live Updates (status-bar chips)? Samsung behaviour?
- What the collapsed pill shows when nothing is due.

## 2026-10-18 · Today shows the whole day on a time line

Dara wants Today to show the whole day and scroll down to see what is at what time. Today now shows a Do next card, then "Later today" as a list. The ask is a time-ordered day: hours down the side, tasks, calendar events, routines and meals at their times, and a "now" line.

Open questions:
- Does it start at now and scroll down, or start at wake-up and scroll to now?
- Where do untimed tasks go: a strip at the top, or "anytime" at the end?
- Does Do next stay as a card above the time line, or become the highlighted slot at the now line?

## 2026-10-18 · Pi on the phone is RPM's brain

Parsing, sorting and planning move from OpenRouter models to Pi running on the phone. Pi can call Opus or Codex for harder jobs, which makes RPM smarter over time.

Open questions:
- How the RPM app reaches Pi in Termux (a local bridge, a Termux intent, or Pi bundled into the app).
- What happens to a capture when Pi is not running.
- Which plan or key each model runs on, and whether the plan's terms allow it.

## 2026-10-18 · The whole app in one picture: Capture, full app, island

Dara described how RPM should feel. Three modes:
- **Capture (talk to it):** ramble a thought into the Capture widget. It works out what you meant: a new task, a reminder, a project, a time change, an edit to an earlier task, or a question like "what's my timetable". It answers with ready-made cards where one fits, and otherwise talks back like an LLM with access to your data. Model: Claude Haiku 5.5.
- **Full app (create and edit):** see the day, add or move things, the RPM view, make Blocks, prioritise, Projects with new Goals and milestones, Routines for habits, Health for health insights, and quarterly, yearly and monthly Goals plus your values.
- **Dynamic island (live):** what is happening now and for how long, habit reminders and tracking, and food logging.

Logging must show what went right or wrong for every capture.

Open questions:
- Answered 2026-10-18: Capture applies everything itself; edits, moves and deletes then show Keep or Undo. Hard questions go to Sonnet 5.5 high. The model may see health and food data.
- Milestones don't exist yet. Health has no data source yet (Health Connect is still open).
- Does the Haiku 5.5 call run through Pi on the phone (ticket 20) or straight from the app? What decides that a question is hard enough for Sonnet?
- Where review fits: the weekly review, and checking whether a Result was achieved, not just ticked.
