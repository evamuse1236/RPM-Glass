# How do Google Calendar and Google Tasks sync both ways with Convex?

Type: wayfinder:research (AFK) · Stream: google · Status: closed · Assignee: claude · Blocked by: none

## Question

What do the Google Calendar API and Google Tasks API offer for two-way sync from a server: push notifications vs polling, sync tokens, rate limits, OAuth for a single personal account, how to tell our own writes from user edits (no echo loops), and what fields survive a round trip (time, all-day, reminders, notes, completion)?

## Resolution (2026-10-18)

Calendar supports push (`events.watch` to an HTTPS URL; Convex HTTP actions should qualify) plus `syncToken` incremental sync; channels expire after ~7 days and need a renewal cron. Tasks has no push: poll with `updatedMin`. Tasks `due` is date-only, with no time, reminders or recurrence. Echo loops are avoided with private extended properties on events and stored etag + hash for tasks. Silent copies: empty reminder overrides and empty calendar default reminders. OAuth must be "production, unverified": testing mode kills refresh tokens after 7 days. Polling each minute is far under quota. Five behaviours are unverified until tried live. Detail: [google-sync-mechanics](../research/google-sync-mechanics.md).
