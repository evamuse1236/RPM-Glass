# Do the five unverified Google behaviours hold up live?

Type: wayfinder:task (HITL, then AFK) · Stream: google · Status: open · Assignee: none · Blocked by: none

## Question

Before the sync model is locked: create a Google Cloud project with OAuth in "production, unverified" mode (the user signs in once), then test against a throwaway calendar and task list: (1) empty reminder overrides make events silent, (2) Tasks honours If-Match, (3) tasks.insert accepts a custom id, (4) whether the scopes count as sensitive, (5) a watch channel delivers to a Convex URL. Record results and where the refresh token is stored.
