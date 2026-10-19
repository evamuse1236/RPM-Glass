# Which layout for Routines, water and meals on the phone?

Type: wayfinder:prototype (HITL) · Stream: health · Status: open · Assignee: you (pick a layout) · Blocked by: 08-routines-and-meal-log (closed)

## Question

Two layout options for where Routines, water and meals appear on Today, plus the run sheet, editor, water counter, meal sheet and History rows. Built as a preview page with sample data on a branch; you pick one option.

## Prototype (2026-10-18)

Branch `worktree-agent-a225e47513ed70630` (commit 1568f84), worktree `.claude/worktrees/agent-a225e47513ed70630`. A standalone preview, `android-companion/body-preview.html`, with sample data. It does not change the real Today screen.

- Two Today layouts behind a toggle: 1A "In the day" puts the routine, water and lunch among the day's items; 1B "Body strip" groups them in one Body section under Do next.
- Sheets for running a routine, editing it, logging water and meals, and History.
- 23 new tests pass (re-run by Claude). The full suite went from 447 to 470 passing.
- Screenshots: `.verify/evidence/body-preview-2026-10-18/` in that worktree (1A, 1B, run sheet, meal saved, History, 1B at 200% text).
- On a real phone: UNVERIFIED.

To close: pick 1A or 1B.
