# How does Today show the whole day by time?

Type: wayfinder:prototype (HITL) · Stream: today · Status: open · Assignee: you (react to it) · Blocked by: none

## Question

The user wants to "see the whole day and scroll down to see what is at what time". Today now shows a Do next card and a "Later today" list. What does a time-ordered, scrollable day look like: an hour scale, tasks, calendar events, routines, water and meals at their times, and a now line? Where do untimed tasks and Do next go?

Built as a third layout, "Day", in the Body preview (ticket 12's worktree), so the three layouts can be compared side by side.

## Prototype (2026-10-18)

Commit 35d216c on the Body preview branch: a third layout, "Day", in `android-companion/body-preview.html`. Opens at now; hour rail with 96 px per hour; Do next is the one outlined card; untimed tasks sit in a "Free until …" block with "Schedule from 1:15 PM"; clashes show "Clash · Resolve"; a "Now" button appears when you scroll away. 485 tests pass (re-run by Claude). Screenshots: `.verify/evidence/day-timeline-2026-10-18/` in that worktree.

Seen by Claude in the screenshots: the water pill wraps to two lines in a half-width lane at 3 PM. Fix before it ships.

To close: say whether Day replaces the app's hidden Timeline view, or becomes the Today layout.
