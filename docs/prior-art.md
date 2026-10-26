# Prior art

## Quick add's date reading (`parseWhen`, 2026-10-26)

**Considered:** chrono-node 2.10.1. It is already in `package.json`, `cli/interpret.mjs` uses it, and it is already inside `runtime.js`, so the planner could import it with no new asset. Super Productivity (MIT) bases its quick add on it.

**Verdict: skip for now; keep the small parser in `planner/task-values.mjs`.** Measured on the quick add tests (`android-companion/parse-when.test.mjs`, `task-fields.test.mjs`), plain `chrono.parse(text, now, {forwardDate: true})` gets 5 of 22 cases wrong:

| Title | chrono-node | Quick add wants |
|---|---|---|
| "I sat the exam", "sun cream" | Saturday, Sunday | nothing |
| "march on the capital" | 1 March | nothing |
| "call at 8" | 8:00 AM | nothing (no am/pm) |
| "Weekly review saturday" on a Saturday | today | next Saturday (as Todoist reads it) |
| "Dinner tonight" | 10:00 PM | 7:00 PM |

A chrono wrapper would need a filter for each row, which is about as much code as the parser it replaces. The highlight already uses the parser's own `start` and `end` offsets, so chrono gives no gain there. Revisit if quick add must read dates such as "next week", "in 3 days" or "Nov 4": chrono reads those, and the small parser does not.
