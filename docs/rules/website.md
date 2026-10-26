# Website rules and what enforces them

Rules for the browser planner in `web/` (the ChatGPT Site and its wide desktop layout). AGENTS.md points here. Data and sync rules live in `docs/rules/web-sync.md`. Add a row when a correction becomes a check.

| Rule | Enforced by |
|---|---|
| On the wide website (1080px and up) a Project card shows one ring for the whole Project, its Blocks always open as chips, and a tap opens the Project. The phone keeps one ring per Block. | `web/app/wide-pages.test.mjs`, `android-companion/rings.test.mjs` |
| On the wide website, Today's side panel never shows a task twice on screen; a day's count is that day's task total, and a section with no task left to list is hidden; crossing 1080px redraws the page in its new layout. | `web/app/agenda.test.mjs`, `web/app/desktop.test.mjs` |
