# What exactly are Routines, water reminders and the meal log?

Type: wayfinder:grilling (HITL) · Stream: health · Status: closed · Assignee: claude · Blocked by: none

## Question

Routine: steps, schedule, skipping, partial completion, how it shows on Today and in the notch. Water: interval, quiet hours, what "Drank it" records. Meal log: the recent-meals list, editing a past entry, and what the agent may infer from it. Updates `CONTEXT.md` with Routine, Water reminder, Meal log.

## Resolution (2026-10-18)

Accepted as recommended:
- **Routine:** runs in a fixed window on set days ("7:00–7:30, Mon–Fri"). It is done when the last step is ticked or "Done all" is tapped. The notch and Today show progress ("3/5"). Skipped steps are recorded as skipped, not failed. A missed Routine doesn't carry over; it is marked missed so the agent can spot patterns. Event-tied routines ("after I wake up") wait for health data.
- **Water reminder:** every 90 minutes, 8 AM–10 PM, paused during busy calendar events and sleep; interval adjustable. "Drank it" logs one glass (250 ml, set once) toward a goal of 8; "Snooze" waits 15 minutes; the expanded notch shows "5/8".
- **Meal log:** the slot (breakfast, lunch, snack, dinner) is guessed from the time; RPM offers the 6 most frequent meals for that slot plus a box to type one; one tap saves; edit or delete later from History.
- **Agent on meals:** may add estimates (protein, calories), patterns and next-meal suggestions, stored apart from the user's words and marked as guesses.
