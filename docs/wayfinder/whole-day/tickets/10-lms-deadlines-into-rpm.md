# How do LMS deadlines become RPM items?

Type: wayfinder:grilling (HITL) · Stream: lms · Status: open · Assignee: none · Blocked by: none

## Question

Given the evams feed ([evams-deadline-shape](../research/evams-deadline-shape.md)): pull the public JSON, add an .ics feed, or have Hermes push? Is an assessment a Result with a deadline, a task, or a calendar commitment? A deadline with no clock time: all-day or 11:59 PM? Should "submitted" clear it (needs a step on the PC)? Is the class timetable in scope, or only assessments?

Note (spec draft, 2026-10-18): `PRODUCT.md` says a Result has no deadline field of its own; its deadline comes from its latest dated task. So "assessment = Result" means creating a Result plus a deadline task.
