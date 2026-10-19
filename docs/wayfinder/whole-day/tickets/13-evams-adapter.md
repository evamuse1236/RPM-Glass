# Read and compare the evams deadline feed

Type: wayfinder:task (AFK) · Stream: lms · Status: closed · Assignee: gpt · Blocked by: 03-evams-deadline-shape (closed)

## Question

Build the reading layer only: parse the public feed into deadline items with stable IDs and IST→UTC times, and diff two reads (added, changed, missing). How items become RPM items stays with "How do LMS deadlines become RPM items?". Branch `feat/evams-deadline-adapter`.

## Resolution (2026-10-18)

Built on branch `feat/evams-deadline-adapter` (commit ab203a3, worktree `C:\Repos\rpm\RPM-Glass-wt-evams`, not merged): `cli/evams-deadlines.mjs` parses the feed (stable `evams:<id>` source IDs, IST→UTC, unknown clocks kept as unknown, submission-window date preferred) and diffs two reads without treating absence as deletion. 30 adapter tests pass (re-run, measured); full JS suite 461 passed per GPT's report. Live feed read: 41 assessments, 30 with a clock, 11 without; some clocks are ranges. Fixture holds assessment fields only (checked: no personal data).
