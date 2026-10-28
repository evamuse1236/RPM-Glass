# Architecture map

Agent-first map of RPM Glass. Read it to find the right files fast. Rules and their checks live in `AGENTS.md` and `docs/rules/*.md`. As of 2026-10-28.

The shape: an Android Java host runs WebViews. The WebViews run the JavaScript in `android-companion/`. Both sides share one JSON file, `companion.json`. Native surfaces (notch, widgets, alerts) read that file. A Convex server and a website in `web/` sync with the phone.

## 1. Areas

| Area | Entry files | Owns | Talks to (seam) | Rules doc / tests |
|---|---|---|---|---|
| Capture | `android-companion/index.html`, `capture-app.mjs`, `capture-agent.mjs`, `capture-session.mjs`; Java `CaptureActivity.java`, `ModelGateway.java` | The Capture sheet, forming cards, receipts, model calls, typed and voice input | JS bridge (`model`, `decision`, `dictate`); planner ops through `intent-service.mjs`; cli mirror in `cli/capture.mjs` | `docs/rules/capture.md`, `capture-streaming.md`, `capture-time.md`; `capture-eval.test.mjs` |
| Planner companion pages | `planner.html`, `planner.mjs`, `planner/app.mjs`, `planner/shell.mjs`, `planner/screens.mjs`; Java `PlannerActivity.java`, `PlannerCommandHost.java` | Page shell, routing, sheets, menus, snackbar, Undo UI | Store (load/save through the bridge); planner ops (`planner-state.mjs`) | `docs/planner-surface-contract.md`; `floating-layout.test.mjs`, `surface-refresh.test.mjs` |
| Today / spine | `planner/today.mjs`, `today-model.mjs`, `spine-model.mjs`, `planner/spine-view.mjs`, `spine-drag.mjs`, `day.css` | Timeline rows, markers, drag to move, gaps, now line | Planner ops; reads habits (`habit-priority.mjs`); mirrored by Java `NotchDay.java` | `docs/design/today.md`; `spine-view.test.mjs`, `spine-drag.test.mjs` |
| Blocks | `planner/blocks.mjs`, `block-add.mjs`, `task-lists.mjs`, `task-row.mjs`, `task-swipe.mjs` | Block cards, Plan order, Inbox, task rows and swipes | Planner ops (`blockTasks`, `inboxRows` in `planner-state.mjs`) | `block-add.test.mjs`, `task-swipe.test.mjs` |
| Task sheet / quick add | `planner/task-sheet.mjs`, `sheet.mjs`, `task-tabs.mjs`, `time-ruler.mjs`, `quick-add.mjs` | When, Alert, Repeat, Block tabs; quick add | Planner ops; recurrence in `planner-recurrence.mjs` (mirror: Java `Repeats.java`) | `task-tabs.test.mjs`, `start-now.test.mjs`, `RepeatsTest.java` |
| Projects / Life / review | `planner/projects.mjs`, `rings.mjs`, `life.mjs`, `life-wheel.mjs`, `review-*.mjs`, `weekly-review.mjs` | Projects, Areas, Goals, Wheel of Life, weekly review | Planner ops | `rings.test.mjs`, `life-wheel.test.mjs`, `review-deck.test.mjs` |
| Habits (water, meals, routines) | `planner-body.mjs`, `body-state.mjs`, `body-store.mjs`, `planner/habits.mjs`, `water.mjs`, `meals.mjs`, `routines.mjs`; Java `NotchBody.java`, `NotchHabits.java`, `NotchWater.java` | Water, meal and routine data (`planner.body` in the store) and rules | Store; shared cases in `fixtures/habit-cases.json` (JS and Java both pass them) | `habit-rules.test.mjs`, `habit-meter.test.mjs`, `NotchHabitsTest.java` |
| Alerts / alarms | Java `CompanionAlerts.java`, `CompanionAlertReceiver.java`, `CompanionAlarmService.java`, `Alarms.java`, `Reminders.java` | Scheduling task alerts and ringing alarms | Reads the store; Android AlarmManager; broadcast receivers | `task-tabs.test.mjs`, `RepeatsTest.java` |
| Notch | `NotchController.java`, `NotchRunner.java`, `NotchActions.java`, `notch-actions.mjs`, `notch-ops.mjs`, `playground/` | The island over the status bar, its gestures and actions | Store file watch (`NotchController.java:416`); a screenless WebView that runs planner ops; broadcast | `docs/rules/notch.md`; `playground/notch-scene.test.mjs` |
| Home widgets | Java `RpmWidget.java`, `NextUpWidget.java`, `NextUp.java` | Next up widget and the RPM widget | Reads the store; redraw on broadcast and alarms; opens sheets by intent | `NextUpTest.java` |
| Web sync + Convex | `convex/plannerWrite.ts`, `plannerHttp.ts`, `phoneSync.ts`, `records.ts`; JS `replica-sync.mjs`, `sync-runtime.mjs`, `replica-groups.mjs`; Java `SyncManager.java`, `SyncJob.java`, `PlannerSyncProtocol.java` | Server records, merge by record group, phone replica, outbox | Convex HTTP; bridge `push` and `pull` (`PlannerCommandHost.java`); contract in `web/contract/` | `docs/rules/web-sync.md`, `docs/web-sync.md`; `web/contract/records.test.mjs`, `SyncStampsTest.java` |
| Website `web/` | `web/app/main.mjs`, `client.mjs`, `desktop.mjs`, `agenda.mjs`, `voice-capture.mjs`, `web.css`, `wide-pages.css`; build `web/build.mjs` | The browser planner, wide layout, shortcuts, web voice | Runs the same planner pages as the phone; Convex writes; `web/contract/` | `docs/rules/website.md`; `web/app/*.test.mjs`; `docs/web-site-feature-map.md` |
| cli | `cli/rpm.mjs`, `cli/capture.mjs`, `cli/workflow.mjs`, `cli/openrouter.mjs` | Command-line Capture and edits for testing the parser | Calls the same intent code as Capture | `docs/capture-cli.md`; `cli/*.test.mjs` |
| chat-prototype | `chat-prototype/companion-server.mjs`, `companion-agent.mjs`, `companion-store.mjs` | A desktop chat prototype over the same store shape | Store file; own tool set (`companion-tools.mjs`) | `chat-prototype/companion.test.mjs`, `interrupted.test.mjs` |
| intent-v2 | `intent-v2/README.md`, `intent-v2/adapters/rpm-glass.mjs` | Model-agnostic intent adapters | Adapter to `intent-service.mjs` | Read its README first |
| Verification tooling | `.claude/skills/verify-rpm-glass/rpmctl.mjs`, `lib/`, `scenarios/`, `features/*.md`; `.claude/skills/glasscheck/` | Drive the emulator and phone, capture proof | adb; the page through CDP; reads the store with `rpmctl state` | `selectors.test.mjs`, `display-target.test.mjs`; `scripts/agent/require-evidence.mjs` |
| scripts/rules | `scripts/rules/check-rules.mjs`, `*.test.mjs`; `scripts/build-companion-assets.mjs`, `scripts/test-unit.mjs` | Repo-wide checks and the asset build | Runs inside `npm test` | `save-retry.test.mjs`, `size-scale.test.mjs`, `undefined-names.test.mjs` |

### Notch

The notch is moving to modules (branch `feat/notch-modules`, design in [docs/notch/modules-design.md](notch/modules-design.md)). Each use (tasks, calendar, water, meals, routines, focus timer) becomes one pure file in `com.rpm.prototype.notch` that returns an `Offer`. `NotchArbiter` ranks all offers. To add a use: write one module file and add one line to `NotchModules.ALL`. Until the migration lands, `NotchScene.java` still holds the ranking. Every notch rule and its test is in [docs/rules/notch.md](rules/notch.md).

## 2. The shared store and who writes it

One file holds the plan: `companion.json` in the app's files directory. `CompanionStore.java:11` names it. Java reads and writes it under `CompanionStore.LOCK`. JS reaches it only through the bridge (`window.RpmNative.invoke(id, "load" | "save", ...)`, handled in `CompanionActivity.java` and `PlannerCommandHost.java`).

Write rules:

1. **Planner changes are JSON ops.** A page calls `editPlan(data, op, now)` in `android-companion/planner-state.mjs`. It validates on a copy, commits once, keeps one Undo, and takes up to 60 ops in a batch. `assertPlanOp` (`planner-validation.mjs`) rejects functions and bad shapes before anything saves.
2. **A save retries when another writer saved first.** Use `retryOnChange(run, reload, attempts=3)` from `save-retry.mjs`. `scripts/rules/save-retry.test.mjs` fails a save that has no retry or no stated reason.
3. **Task IDs** come only from `task-ids.mjs`. The server and browser use 1,000,000,000 and up.
4. **Errors reach the screen through `userMessage(error)`** (`user-message.mjs`).
5. **Telemetry never writes the plan.** `DiagnosticStore.java` has its own outbox.

Where native code reads the store:

- Notch: `NotchData.java` (the store read; keeps `last` when a read throws), `NotchBody.java` (routines, water, meals), `NotchDay.java`.
- Widgets: `NextUp.java`. Alerts: `CompanionAlerts.java`.
- Sync: `SyncManager.java` and `SyncStamps.java`.
- The notch changes the plan only through `NotchRunner.java`, which runs the planner's own ops in a screenless WebView (`notch-actions.html`, `notch-actions.mjs`).

Web sync: the server (`convex/plannerWrite.ts`) is the hub. Each record group carries a time stamp and the newer change wins. The phone replica pushes its outbox and pulls the rest. See `docs/web-sync.md`.

## 3. How to add a feature

### (a) A new planner screen

1. Copy a small screen: `planner/history.mjs` (read only) or `planner/projects.mjs` (with edits).
2. Register the route in `planner/screens.mjs` and the shell in `planner/shell.mjs`.
3. Put pure logic in a `*-model.mjs` file next to it (copy `today-model.mjs`). Test it with plain `node --test`.
4. Add a stylesheet. Use only tokens from `theme.css` (`size-scale.test.mjs`). Add its name to `STYLE_PARTS` in `scripts/build-companion-assets.mjs` and to `ASSETS` in `CompanionSurface.java` (see seam 1).
5. Write a feature recipe in `.claude/skills/verify-rpm-glass/features/` and drive it with `rpmctl`.

### (b) A new planner op

1. Add a branch for `op.type` in `editPlan` (`planner-state.mjs`). Return the changed data; do not mutate in place.
2. Add its shape check in `assertPlanOp` (`planner-validation.mjs`).
3. If the website or phone sync must carry it, add its record group in `replica-groups.mjs` and `web/contract/`.
4. Copy a test from `planner-data-ops.test.mjs`. Check one Undo and a rejected bad shape.
5. If the notch uses it, add the action to `notch-ops.mjs`.

### (c) A new native surface

1. Copy `NextUpWidget.java` and `NextUp.java` (a pure reader plus a thin receiver). Keep the logic in the plain class so JUnit can test it.
2. Read the plan only through the store (copy the read in `NextUp.java`). Never write `companion.json` outside `CompanionStore.java`.
3. Declare the component in `app/src/main/AndroidManifest.xml`. Widget layouts use only views a home screen can draw (`NextUpTest.java`).
4. Redraw on the store change broadcast, as `NextUpWidget.java` does.
5. Add a JUnit test in `app/src/test/java/com/rpm/prototype/` and a recipe in `.claude/skills/verify-rpm-glass/features/home-widget.md`.

## 4. Seams that are hard to edit today

Ranked by how often an edit goes wrong. No file is over 800 lines (measured). The pain is hand-kept lists and Java/JS copies.

1. **`ASSETS` allow-list is hand-kept and stale.** `CompanionSurface.java:15` names `planner-stitch.css`, `planner-tokens.css`, `night.css` and `capture-tokens.css`; none exists in `android-companion/` (measured). `scripts/build-companion-assets.mjs` has its own `STYLE_PARTS`. Fix: generate the Java list from the build, or fail a test when they differ. Measured.
2. **Habit rules live twice (JS and Java).** `habit-priority.mjs`, `planner-body.mjs` against `NotchHabits.java`, `NotchBody.java`, `NotchWater.java`. Only `fixtures/habit-cases.json` keeps them equal. Fix: add a case for each new rule before editing either side. Measured (the fixture is read by `habit-rules.test.mjs` and `NotchHabitsTest.java`).
3. **Repeat rules live twice.** `planner-recurrence.mjs` against `Repeats.java`. Fix: share a fixture file like the habit one. Inferred (only `RepeatsTest.java` covers the Java side).
4. **Today day logic lives twice.** `spine-model.mjs`, `today-model.mjs` against `NotchDay.java`. Fix: extract shared day cases into a fixture. Inferred.
5. **Task symbols live twice.** `task-symbol.mjs` against `TaskSymbol.java`. Fix: one fixture read by both tests. Inferred.
6. **Bridge actions are one long switch.** `CompanionActivity.java:132-156` (about 20 KB in 162 lines, dense lines) mixes load, save, model, voice, settings and alarms. Fix: split into small handlers named in a registry, one file per action group. Measured for size, inferred for risk.
7. **One-line giants in JS.** `intent-service.mjs` (19 KB in 156 lines) and `planner-tools.mjs` (12 KB in 92 lines) pack long lines, so a diff touches many things. Fix: split by tool or intent and wrap lines. Measured for size.
8. **Notch files are large and being split.** `IslandView.java` (472 lines), `NotchParts.java` (429), `NotchController.java` (427), `NotchPill.java` (412). Fix: finish the work on `feat/notch-modules`. Measured for size.

## Quick commands

- All checks: `npm test`. Web rules only: `npm run check:rules`.
- Rebuild assets: `node scripts/build-companion-assets.mjs`. The output in `app/src/main/assets/companion/` is generated and untracked.
- Prove a change on the app: see "Before you say done" in `AGENTS.md`.
