# Website rules and what enforces them

Rules for the browser planner in `web/` (the ChatGPT Site and its wide desktop layout). AGENTS.md points here. Add a row when a correction becomes a check.

| Rule | Enforced by |
|---|---|
| On the wide website (1080px and up) a Project card shows one ring for the whole Project, its Blocks always open as chips, and a tap opens the Project. The phone keeps one ring per Block. | `web/app/wide-pages.test.mjs`, `android-companion/rings.test.mjs` |
| On the wide website, Today's side panel never shows a task twice on screen; a day's count is that day's task total, and a section with no task left to list is hidden; crossing 1080px redraws the page in its new layout. | `web/app/agenda.test.mjs`, `web/app/desktop.test.mjs` |
| The website reports a change as saved only after the phone applies it and the newer snapshot arrives; until then the row says it is waiting for the phone. | `web/app/client.test.mjs`, `npm run web:drive` |
| The website resends an unsent change with the same command ID and body after a network failure or reload. | `web/app/client.test.mjs` |
| Every website action builds a command the contract accepts, on the snapshot revision the user saw. | `web/app/plan-queue.test.mjs` |
| A Project, Block or other record made in the browser keeps its id when the phone saves it: the command carries the ids the browser used, fixed at the first edit; the phone uses each one only if it is a UUID not yet in the store. | `web/app/plan-queue.test.mjs`, `android-companion/web-sync-plan.test.mjs` (`keeps its id`) |
| On the ChatGPT Site the planner opens without a link code: the Site holds the key, adds it only for `Bearer site`, never sends it to the page, and the page can't revoke it. The key reads the phone that synced last. | `web/site-worker.test.mjs`, `web/app/client.test.mjs`, `cloud-tests/webAdminSession.test.ts`, `npm run web:drive -- --no-code` |
