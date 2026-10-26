# Standalone website: design brief

Repo: `/home/dararch/.t3/worktrees/RPM-Glass/feat-web-standalone`, branch `feat/web-standalone`.

## Goal (user, 2026-10-27)

"It should be able to stand by itself. Only its db in the backend is synced with phone."

Today the phone is the only writer. The website reads phone snapshots and sends commands that wait for the phone. After this work:

- The backend (Convex prod `neat-emu-821`) holds the planner data.
- The website reads and writes the backend directly. It works fully while the phone is off for days.
- The phone syncs both ways with the backend.
- Website Capture runs its own AI on the server (a Convex action, Anthropic key in a Convex env var). Not "send to phone".

Must keep:

1. The user's original words (Capture text) and Undo.
2. No data loss when the phone is offline for days, on either side.
3. A clear conflict rule, one sentence a user understands, when the phone and the website edit the same task. The losing value is never silently lost.

Done (pass/fail): the website adds, edits, completes and captures (with AI) a task while the phone is offline. The phone shows it after reconnecting. A same-task conflict resolves by the written rule with no loss. `npm test` and `npm run ci:emulator` pass.

## How it works today (read these files)

- `docs/web-sync.md`: the current protocol (snapshot v2, commands, phone is the only writer).
- `convex/schema.ts`, `convex/planner.ts`, `convex/plannerHttp.ts`, `convex/plannerAuth.ts`: accounts, webSessions, plannerSnapshots (5 retained), webCommands queue, HTTP routes, auth and quotas.
- `web/app/client.mjs` (outbox, snapshot polling every 3 s), `web/app/plan-queue.mjs` (replays the browser's unsent ops over the snapshot with `editPlan`, holds ops that touch the same records, browser Undo), `web/app/main.mjs` (mounts the phone's own planner UI `android-companion/planner.mjs` with `getData`/`commit`), `web/app/sync-marks.mjs` (row marks "Waiting for your phone"), `web/site-worker.mjs` (ChatGPT Site Worker; adds the browser key for `Bearer site`).
- `android-companion/web-sync-commands.mjs` (phone applies commands, conflict check against base snapshot targets), `web-sync-targets.mjs`, `web-sync-snapshot.mjs` (`buildSnapshot`: the deep allowlist projection of the store into public `entries` + `planner`), `web/contract/*.schema.json` + `validate.mjs`.
- Phone transport: `app/src/main/java/com/rpm/prototype/SyncManager.java`, `PlannerSyncProtocol.java`, `PlannerCommandHost.java` (headless WebView `android-companion/sync.html` + `sync-runtime.mjs` with a `load`/`save` bridge), `CompanionStore.java`.
- `android-companion/planner-state.mjs`: `editPlan(data, op, now)`, the one planner reducer. The website already runs it in the browser.

## Facts found by scouts (2026-10-27)

The phone store is one JSON document saved by `CompanionStore.write(context, data, expectedVersion)`: compare-and-swap on `version`, atomic file, sets `syncSavedAt` on every write. Top-level keys: `entries`, `planner` (user planner data); `memories`, `history`, `conversations`, `pending`, `inFlight`, `imported`, `intentV2`, `webSync`, `undo`, `syncSavedAt` (local state).

Every phone writer ends in `CompanionStore.write`, but not every writer goes through `editPlan`:

| Writer | Runtime | Through `editPlan`? |
|---|---|---|
| Planner page taps (`runtime.mjs` `save()`) | Planner WebView | yes |
| Load migrations (`planner-ux.mjs`, `migrateReviewData`, `legacy-import.mjs`) | WebView at start | no, direct edits |
| Older Capture engine (`chat-prototype/companion-tools.mjs` propose/undo, archive/restore of entries, memories, history, conversations) | Capture WebView | no |
| Capture AI commit (`intent-v2` repository, `planner-tools.mjs` `changePlanner`) | Capture WebView | yes, per op |
| Sort preview, keep note (`intent-service.mjs`) | Capture WebView | yes |
| Notch and widget taps (`notch-actions.mjs`, `NotchRunner.java`) | Headless WebView | yes |
| Web commands (`web-sync-commands.mjs`) | Headless `sync.html` | yes |
| Import and restore backup (`CompanionStore.importCopy`) | Java | no, whole store |

So a phone sync layer that only sees `editPlan` ops misses writes. A state-level hook sees all of them.

Hazards:

1. Task IDs are integers allocated `Math.max(0, ...ids) + 1` (`planner-state.mjs` saveTask, `companion-tools.mjs:67`, `legacy-import.mjs`). Two replicas creating while apart get the same ID. Blocks, projects, areas, goals, drafts and events use UUIDs (`new-id.mjs`, overridable with `withIds`). `CompanionStore.validate` requires a unique positive long `id` per entry. Check how alarms key on task IDs (`CompanionAlerts.java`) before changing ID shape.
2. Undo is a whole-document snapshot. `planner.undo = {entries, planner}` before the edit (`planner-state.mjs`). Capture's older undo `data.undo = {id, at, before, previous}` covers entries, memories, history, conversations; Capture AI Undo (`intent-v2/adapters/rpm-glass.mjs` `undoPlan`) walks `data.undo.previous`. Restoring a whole snapshot after a remote change merged in would silently revert the remote change.
3. Entries carry local-only fields that the public projection drops (for example `revisions`, up to 100 per task). Merging a remote record into the phone store must keep local-only fields.
4. Entries have `kind` `plan` (default) and `checkin`. Only `plan` is public.
5. The public record shape is already defined: `web/contract/snapshot.schema.json` `entries[]` and `planner` (allowlist), projected by `buildSnapshot`. Planner sub-records: `blocks/projects/areas/goals` (UUID id), `context` (one object), `weeks` and `reviews` (maps by week day), `body.water`, `body.meals` (id), `body.mealPlan.slots` (by slot), `body.routines` (id), `body.runs` (routineId + day), `body.mealGuesses` (map by meal id), `drafts` (summaries), `events` (always empty).
6. `validatePlanner` checks cross-record links (task.blockId to a block, block.projectId, project.goalId, goal.areaId) and review data. A merge of independent edits can break a link (one side removes a Block, the other moves a task into it).
7. Convex limits: 1 MB per document, about 8 MB read and 16 MB write per mutation, actions up to 10 minutes and can `fetch`. Default runtime is V8 with `crypto.randomUUID`; `"use node"` actions run Node.

Capture (from scouts): `createCaptureAgent({service, traces, clock}).capture({messageId, conversationId, text})` in `android-companion/capture-agent.mjs`. It saves the words first (`intentV2.captures[messageId]`), interprets (0 to 2 model calls, Haiku by default, Sonnet for hard ones), stages a draft, then applies through `changePlanner` and `editPlan`. It already runs in Node for `npm run stress:capture` (`scripts/capture-stress/runtime.mjs`, `api.mjs`: plain `fetch` to `https://api.anthropic.com/v1/messages`, key from `ANTHROPIC_API_KEY`, the `model` option on `createIntentService` replaces the native transport). Store backend contract: `{load, save(expected, next)}` with CAS on `version`. Blockers for Convex V8: `node:crypto` imports in `planner-tools.mjs`, `chat-prototype/companion-tools.mjs`, `new-id.mjs`; `capture-trace.mjs` defaults to `localStorage`. A draft can stop for review (question, unclear time, calendar clash, edit confirmation); a model failure keeps the words with `status: 'captured'`.

Test harness: `npm test` = JS tests, rules, Convex tests (`vitest` + `convex-test`, `cloud-tests/`), typecheck, Java JUnit. `npm run web:local` runs a local Convex, a Node stand-in phone (`scripts/web-sync/phone-standin.mjs`, runs the phone's own JS), and the Site; `npm run web:drive` drives the website in headless Chrome. No emulator scenario covers web sync yet.

Prior art (Grok, 2026-10-26, written when the phone was the only writer): Replicache skip (archived June 2026; borrow its pending list). PowerSync: borrow the upload-queue shape, skip the library (its Convex connector is experimental). Automerge, Jazz, Evolu, Triplit: skip ("a merge engine solves a conflict you do not have"; Evolu "is the closer phone plus web design if you later let the website write"). Those verdicts assumed one writer. Now there are two.

## Constraints

- Another thread restyles the website (`feat/web-gauntlet`). This work owns the data layer (`web/app/client.mjs`, `plan-queue.mjs`, `web-native.mjs`, `web/contract/`, `convex/`, sync code). Markup and CSS changes stay minimal. `main.mjs` keeps mounting `mountPlanner({getData, commit, ...})`.
- The rule table in `AGENTS.md` (web sync rows) changes with this work; each changed rule keeps an enforcing test.
- No committed file over 5,000 tokens (bytes/4).
- Keep one protocol. The old command queue and snapshot table go away once callers move (the installed phone app upgrades in the same release).
