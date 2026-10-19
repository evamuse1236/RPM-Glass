# What deadline data can evams hand to RPM?

Type: wayfinder:research (AFK) · Stream: lms · Status: closed · Assignee: claude · Blocked by: none

## Question

In `C:\Repos\isdm\evams`, what assessment and class data exists (fields, IDs, due times, time zone), where it lives (API routes, D1, published JSON, the .ics builder), how fresh it is, and the smallest way for RPM to receive it?

## Resolution (2026-10-18)

evams publishes a public JSON feed at `https://evams.evamuse.chatgpt.site/api/site-data` (no login; fetched, revision 180). Assessments carry stable IDs (`lms-<id>`), and the real deadline is `submissionWindow.closesOn` + `time` (IST, 12-hour text). The feed is up to ~6 h stale and has no "submitted" flag; the class timetable in it stops at 2026-10-07. Smallest path: RPM pulls the JSON, with no evams change, and it keeps working while the PC sleeps. Detail: [evams-deadline-shape](../research/evams-deadline-shape.md).
