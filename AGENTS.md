# RPM

For planning behavior, read `CONTEXT.md` and the relevant part of `PRODUCT.md`. Capture, task, result, purpose, must, priority, and calendar commitment have distinct meanings. Preserve the user's original words and recovery/Undo. Completing actions does not by itself establish that a result was achieved.

For UI work, use `DESIGN.md` and the relevant surface contract under `docs/`; validate the named widget or screen at phone size and enlarged text. A build or web preview alone does not verify a native widget.

`/home/darax/Codex Projects/RPM Agent` is the separate Arden coaching project. Its course study and `docs/rpm-widget-recommendations.md` can inform requested product decisions; recommendations are not already-implemented app features. Keep Arden's persona and memory local to that project.

For a Google Tasks batch, read the installed `tasks` skill and preserve its batch/item ledger. A mock-only integration remains unfinished unless accepted as the requested scope. `docs/rpm-deferred-features.md` is a backlog, not authorization to activate features.

For an authorized phone release, compare the working tree, branch, and installed build so the release preserves newer features and unrelated work. Follow `docs/testing.md` and relevant phone setup guidance. Verify package/version, compatible signing, preserved app data, and actual launch. Report commit/push, APK build, device installation, and external integration activation separately.

## Before you say done

1. Run the checks: `npm test` (JS, rules, Convex, typecheck, Java). The same command runs in CI.
2. If app code changed (`app/src/main`, `android-companion`, `chat-prototype`, `intent-v2`, `cli`), drive the changed feature on the real app with the `verify-rpm-glass` skill: `node .claude/skills/verify-rpm-glass/rpmctl.mjs launch` (`rpmctl` below), then the recipe in its `features/` file. After a web-only edit, `rpmctl sync` reloads it in seconds. Check it at `display phone` and `display large-text` (and `max-text` if text can wrap), read back what was saved with `state`, and run `logs --errors`.
3. Run `rpmctl scenario --all` when the change touches the planner, Capture or layout. Every scenario must pass or be a recorded known bug.
4. Put the evidence paths (`.verify/evidence/<run-id>/NN-*.png`) in the reply. Mark anything you could not drive (model-backed paths, Samsung-only behavior, the real home-screen widget) **UNVERIFIED**.
5. `npm run check:evidence` must pass. In Claude Code the Stop hook runs it for you.
6. Run `rpmctl cleanup` when you finish. Evidence stays.

## Rules and what enforces them

| Rule | Enforced by |
|---|---|
| One agent drives one emulator | Machine-wide rpmctl lease for the worktree and ports, plus the run owner token (missing tokens warn for one compatibility release) |
| rpmctl selectors match the app | `.claude/skills/verify-rpm-glass/selectors.test.mjs` in `npm test` |
| An error reaches the screen only through `userMessage(error)`, never as raw script text. | `npm run check:rules` (`raw-error-text`), `android-companion/user-message.test.mjs`, and the scenario runner's raw-error guard |
| A change updates the screen in place: existing rows are kept, the field keeps focus, the new item appears once and is saved where it belongs. | `rpmctl scenario plan-add-in-place`, `android-companion/surface-refresh.test.mjs` |
| The field you are typing in is never covered by the keyboard, nav bar, snackbar or FAB. | `rpmctl scenario focused-field-visible` (known bug recorded, expires 2026-11-07) |
| At 200% text no title or action label is cut, no word is split across two lines (Today, Blocks, the task sheet, Capture), and nav labels stay visible. | `rpmctl scenario max-text-reflow` (one exception pending approval) |
| Capture saves the user's exact words before anything else, with or without an AI key, and keeps them for Retry when the model fails. | `rpmctl scenario capture-keeps-words`, `android-companion/capture-agent.test.mjs`, `android-companion/capture-session.test.mjs`, `chat-prototype/composer.test.mjs` |
| A chip's request ID is a short hash of the tap (`actionIdFor`), never the answer's own words, so every answer the model offers can be tapped. | `android-companion/capture-answer.test.mjs` |
| A tap that fails on a Capture card says why on that card (`withProblem`), not only in the status line. | Judgment: `verify-rpm-glass` drive of a rejected answer (no automated check yet) |
| Capture applies what it reads: new items with a receipt and Undo, changes to saved items with Keep or Undo, deletes to Trash; every capture writes one trace without the key. | `android-companion/capture-agent.test.mjs` |
| Every capture uses Claude Haiku 5.5; re-planning, sorting, advice and changes to more than three items use Claude Sonnet 5.5 at high effort. Both are on the native allowlist. | `intent-v2/test/model-policy.test.mjs`, `app/src/test/java/com/rpm/prototype/ModelLimitsTest.java` |
| Capture asks Claude (Anthropic API key) first and tries OpenRouter once when Claude has no key, is unreachable, or answers 401, 403, 429 or 5xx; the trace records which service answered. | `intent-v2/test/model-services.test.mjs`, `ModelLimitsTest.java` |
| Every stylesheet Capture and the planner link is served by the native asset allowlist. | `android-companion/companion-assets.test.mjs` |
| Dates are honest and compact ("2:30 pm to 3 pm", "Time not set"). | `android-companion/capture-content.test.mjs` |
| No page shows a scrollbar. | `android-companion/companion-assets.test.mjs` |
| Task rows swipe right to complete and left to schedule (Move in the Inbox); a drag locks to one axis after 8px; Delete is never a swipe. | `android-companion/task-swipe.test.mjs` |
| Motion tokens in `theme.css` match `motion-core.mjs`. | `android-companion/motion-tokens.test.mjs` |
| A Block's add field finds Inbox tasks by word starts and pulls one in; Enter alone creates. | `android-companion/block-add.test.mjs`, `rpmctl scenario plan-add-in-place` |
| The task sheet's Time row is every half hour from 6:00 AM to 11:00 PM plus the task's own off-grid time; its Day row is Today, Tomorrow and five weekdays. | `android-companion/habits.test.mjs` |
| With no saved meal plan, meals sit at 8:30 AM, 1 PM and 8 PM; a meal turned off leaves Today but its logged meal stays. Water steppers keep 1–20 glasses and 15–240 minutes. | `android-companion/habits.test.mjs` |
| Capture cards show facts as icon chips, and a receipt shows the task's alert. | `android-companion/capture-lines.test.mjs` |
| The notch pill ends at the status bar's bottom edge, 4dp above the camera hole. | `NotchAnchorTest.java`, `playground/notch-scene.test.mjs` |
| `rpmctl seed` keeps synced web assets, so a seeded run shows the synced code. | `.claude/skills/verify-rpm-glass/seed-sync.test.mjs` |
| A web-only change can be proven with `rpmctl sync` instead of a new APK; the screenshot must carry the hash of the exact assets now built, and Java changes still need the APK. | `scripts/rules/require-evidence.test.mjs` |
| The notch redraws only when what it shows changes: the same frame twice means no redraw, no animation and no window relayout. | `IslandWindowTest.java`, `NotchFrameTest.java` |
| The notch's drawing window never moves: it sits at the screen's top-left at full width and only its height changes, so a morph is never drawn at a stale position. A small touch window over the pill takes its taps. | `IslandWindowTest.java` (`theDrawingWindowNeverMovesOnlyItsHeightChanges`) |
| A tap anywhere on the notch pill opens the island; a finger that drifts less than 8dp is still a tap. | `IslandGestureTest.java` |
| The open and alert islands float 12dp in from each side with their top at the pill's top. | `IslandShapeTest.java` |
| The island can always log water: with no task to tick its first control is Glass; otherwise due water is one of its two small rows and tapping the row logs a glass (through the planner, with Undo). | `NotchSceneTest.java` (`noTaskLeftAndWaterDueMakesWaterTheHero`, `rowsAreNextItemThenDueWaterThenNudgesAtMostThree`), `verify-rpm-glass` `notch-glass` drive |
| A notch reminder never says "alarm" or "ringing"; only a ringing alarm does. | `NotchFrameTest.java` |
| "Done" needs proof from the real app: a build and a screenshot newer than the change. | `scripts/agent/require-evidence.mjs` (Stop hook in `.claude/settings.json`, `npm run check:evidence`) |
| A phone release updates the installed app in place: same signing key, and the build matches this checkout. | `rpmctl doctor --serial <phone>` (`installed-signer-matches-local`, `installed-apk-matches-local-build`, `installed-version`) |
| Never drive or change a device the tooling did not start. | `rpmctl` refuses mutating commands on any device but its own read-only emulator |
| Checks run green on a Windows checkout. | `.gitattributes` (LF checkout) and the win32 guards in the file-mode tests |
| The phone is the only writer of planner data; browsers read snapshots and send commands. | `cloud-tests/planner.test.ts`, `cloud-tests/webHttp.test.ts`, `android-companion/web-sync.test.mjs` |
| Planner snapshots use the versioned allowlist and never contain credential, token, trace, model payload, or Undo fields. | `web/contract/validate.mjs`, `android-companion/web-sync.test.mjs`, `SyncManagerTest.snapshotBoundaryRejectsKeysTokensAndTracesAtAnyDepth` |
| A command ID keeps one payload and one durable result across save failures, process restarts, and lost acknowledgements. | `android-companion/web-sync.test.mjs`, `cloud-tests/planner.test.ts`, `SyncManagerTest.lostAckRedeliversTheSameIdAndDurableResult` |
| Stale completion and reopening cannot silently act on a task renamed or moved to another day on the phone. | `android-companion/web-sync-conflicts.test.mjs` |
| Browser revocation blocks fresh command effects while preserving the true receipt of work already saved or processing. | `android-companion/web-sync-revocation.test.mjs`, `cloud-tests/planner.test.ts`, `SyncManagerTest.eachAckRefreshesRevocationBeforeStartingTheNextCommand` |
| Browser linking uses hashed, one-use, ten-minute codes and revocable hashed tokens scoped to the phone's account. | `cloud-tests/webHttp.test.ts`, `cloud-tests/plannerRate.test.ts` |
| Conditional snapshot reads authenticate before returning 304; CORS and token quotas also apply to polling. | `cloud-tests/webHttp.test.ts`, `cloud-tests/plannerRate.test.ts` |
| Existing device pairing, events, and records survive additive account migration and token rotation. | `cloud-tests/webHttp.test.ts` |
| The headless sync bundle runs with eval blocked and applies through the normal versioned native save bridge. | `android-companion/web-sync-runtime.test.mjs` with a simulated bridge; Android execution remains UNVERIFIED until driven |
| Each command is acknowledged before the next starts, and pairing credentials come from one connection snapshot. | `SyncManagerTest.anAppliedCommandIsAcknowledgedBeforeTheNextCommandCanFail`, `SyncManagerTest.credentialsAreCapturedAsOneConnection` |
| The website reports a change as saved only after the phone applies it and the newer snapshot arrives; until then the row says it is waiting for the phone. | `web/app/client.test.mjs`, `npm run web:drive` |
| The website resends an unsent change with the same command ID and body after a network failure or reload. | `web/app/client.test.mjs` |
| Every website action builds a command the contract accepts, on the snapshot revision the user saw. | `web/app/view.test.mjs` |
| On the ChatGPT Site the planner opens without a link code: the Site holds the key, adds it only for `Bearer site`, never sends it to the page, and the page can't revoke it. The key reads the phone that synced last. | `web/site-worker.test.mjs`, `web/app/client.test.mjs`, `cloud-tests/webAdminSession.test.ts`, `npm run web:drive -- --no-code` |
| Model-backed paths without a key, Samsung behavior and real widget placement are reported as UNVERIFIED, not as passing. | Judgment: `verify-rpm-glass` SKILL.md proof standards |
